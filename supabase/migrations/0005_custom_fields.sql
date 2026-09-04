-- =============================================================================
-- 0005 - Biblioteca de campos personalizados (global / template / projeto)
-- =============================================================================

create table public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  scope app.custom_field_scope not null,
  template_id uuid references public.project_templates(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  entity text not null default 'project',
  key text not null,
  label text not null,
  description text,
  field_type app.custom_field_type not null,
  required boolean not null default false,
  default_text text,
  default_number numeric(18,4),
  default_date date,
  default_boolean boolean,
  position int not null default 0,
  visible_roles app.role_key[] not null default '{}',
  editable_roles app.role_key[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint cfd_entity_ck check (entity in ('project', 'task', 'risk', 'action_plan')),
  constraint cfd_key_ck check (key ~ '^[a-z][a-z0-9_]{1,48}$'),
  constraint cfd_scope_ck check (
    (scope = 'global'   and template_id is null and project_id is null) or
    (scope = 'template' and template_id is not null and project_id is null) or
    (scope = 'projeto'  and project_id is not null and template_id is null)
  )
);
-- Unicidade da chave por escopo (indices parciais cobrem os NULLs)
create unique index cfd_key_global_uk on public.custom_field_definitions(entity, key) where scope = 'global';
create unique index cfd_key_template_uk on public.custom_field_definitions(template_id, entity, key) where scope = 'template';
create unique index cfd_key_project_uk on public.custom_field_definitions(project_id, entity, key) where scope = 'projeto';
create index cfd_template_idx on public.custom_field_definitions(template_id);
create index cfd_project_idx on public.custom_field_definitions(project_id);

create table public.custom_field_options (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.custom_field_definitions(id) on delete cascade,
  value text not null,
  label text not null,
  color text,
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint cfo_uk unique (definition_id, value)
);

-- Valores tipados em colunas dedicadas: permite filtro e ordenacao com indice.
create table public.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  definition_id uuid not null references public.custom_field_definitions(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  entity text not null default 'project',
  record_id uuid not null,
  value_text text,
  value_number numeric(18,4),
  value_date date,
  value_timestamp timestamptz,
  value_boolean boolean,
  value_uuid uuid,
  value_json jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint cfv_uk unique (definition_id, record_id)
);
create index cfv_record_idx on public.custom_field_values(record_id);
create index cfv_project_idx on public.custom_field_values(project_id);
create index cfv_def_text_idx on public.custom_field_values(definition_id, value_text);
create index cfv_def_number_idx on public.custom_field_values(definition_id, value_number);
create index cfv_def_date_idx on public.custom_field_values(definition_id, value_date);

-- Valida o tipo do valor gravado contra a definicao do campo.
create or replace function app.validate_custom_field_value()
returns trigger language plpgsql security definer set search_path = public, app as $$
declare d record;
begin
  select field_type, scope, project_id into d
    from public.custom_field_definitions where id = new.definition_id;
  if d is null then
    raise exception 'Definicao de campo personalizado inexistente';
  end if;

  case d.field_type
    when 'numero', 'moeda', 'percentual' then
      if new.value_number is null and new.value_text is not null then
        raise exception 'Campo % espera valor numerico', new.definition_id;
      end if;
    when 'data' then
      if new.value_text is not null and new.value_date is null then
        raise exception 'Campo % espera data', new.definition_id;
      end if;
    when 'boolean' then
      if new.value_text is not null and new.value_boolean is null then
        raise exception 'Campo % espera boolean', new.definition_id;
      end if;
    when 'usuario', 'equipe' then
      if new.value_text is not null and new.value_uuid is null then
        raise exception 'Campo % espera referencia (uuid)', new.definition_id;
      end if;
    when 'lista_unica', 'status' then
      if new.value_text is not null and not exists (
        select 1 from public.custom_field_options o
         where o.definition_id = new.definition_id and o.value = new.value_text and o.active
      ) then
        raise exception 'Valor "%" nao pertence a lista de opcoes do campo', new.value_text;
      end if;
    else null;
  end case;
  return new;
end $$;

create trigger trg_cfv_validate before insert or update on public.custom_field_values
  for each row execute function app.validate_custom_field_value();

select app.attach_stamps('public.custom_field_definitions');
select app.attach_stamps('public.custom_field_options');
select app.attach_stamps('public.custom_field_values');
