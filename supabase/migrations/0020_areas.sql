-- =============================================================================
-- 0020 - Dimensao organizacional Area (Gerencia > Area > Equipe > Colaborador)
-- =============================================================================
--
-- Contexto: o schema ja tem Gerencia (public.business_units, criada na 0002)
-- e Equipe (public.teams), mas business_units nunca ganhou UI - so existe no
-- banco e no seed. teams.area e' texto livre, sem FK. Esta migration:
--
--   1. Cria public.areas, filha de business_units (reaproveitada como
--      "Gerencia" nas novas telas - sem renomear a tabela, para nao quebrar
--      profiles.business_unit_id, RLS e seed ja existentes).
--   2. Cria public.user_area_assignments para o historico de vinculo
--      organizacional (uma pessoa pode trocar de area ao longo do tempo sem
--      reescrever o passado).
--   3. Adiciona teams.area_id e profiles.area_id como FKs OPCIONAIS - nada
--      de NOT NULL aqui. A obrigatoriedade para colaboradores ativos so
--      entra em uma migration futura, depois do saneamento administrativo
--      (nao ha como este codigo adivinhar a area real de cada pessoa).
--   4. RLS e auditoria seguindo o padrao ja estabelecido nas migrations
--      0010/0011.
--
-- Seguranca contra exclusao indevida: nao ha policy de DELETE liberal para
-- `areas` (soment admin, como as demais tabelas de cadastro) e as FKs em
-- profiles/teams/user_area_assignments apontam para areas com o padrao
-- "on delete restrict" do Postgres - apagar uma area com vinculo falha no
-- banco antes mesmo de qualquer regra de aplicacao.

-- -----------------------------------------------------------------------------
-- areas
-- -----------------------------------------------------------------------------
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  business_unit_id uuid not null references public.business_units(id),
  code text not null,
  name text not null,
  description text,
  manager_user_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint areas_uk unique (business_unit_id, code),
  constraint areas_code_ck check (char_length(code) between 2 and 20)
);
create index areas_business_unit_idx on public.areas(business_unit_id);
create index areas_active_idx on public.areas(is_active);
create index areas_manager_idx on public.areas(manager_user_id);

select app.attach_stamps('public.areas');

-- -----------------------------------------------------------------------------
-- Vinculo estrutural de teams e profiles a area (opcional por enquanto)
-- -----------------------------------------------------------------------------
alter table public.teams add column area_id uuid references public.areas(id) on delete set null;
create index teams_area_idx on public.teams(area_id);

alter table public.profiles add column area_id uuid references public.areas(id) on delete set null;
create index profiles_area_idx on public.profiles(area_id);

-- -----------------------------------------------------------------------------
-- user_area_assignments - historico de vinculo organizacional
-- -----------------------------------------------------------------------------
create table public.user_area_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  area_id uuid not null references public.areas(id),
  valid_from date not null default current_date,
  valid_to date,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint user_area_assignments_period_ck check (valid_to is null or valid_to >= valid_from)
);
create index user_area_assignments_user_idx on public.user_area_assignments(user_id, valid_from desc);
create index user_area_assignments_area_idx on public.user_area_assignments(area_id);

-- So pode haver um vinculo primario "aberto" (sem data de fim) por pessoa -
-- e' o que a view de capacidade e o campo profiles.area_id tratam como atual.
create unique index user_area_assignments_open_primary_uk
  on public.user_area_assignments(user_id)
  where is_primary and valid_to is null;

select app.attach_stamps('public.user_area_assignments');

-- Ao abrir um novo vinculo primario, fecha o anterior (BEFORE, para nao
-- colidir com o indice unico acima) e sincroniza profiles.area_id (AFTER)
-- como ponteiro rapido do vinculo corrente - consultas historicas por mes
-- devem ler user_area_assignments, nao este ponteiro.
create or replace function app.close_previous_primary_area()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if new.is_primary and new.valid_to is null then
    update public.user_area_assignments
       set valid_to = new.valid_from - 1
     where user_id = new.user_id
       and is_primary
       and valid_to is null;
  end if;
  return new;
end $$;

create trigger trg_close_previous_primary_area
  before insert on public.user_area_assignments
  for each row execute function app.close_previous_primary_area();

create or replace function app.sync_profile_current_area()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if new.is_primary and new.valid_to is null then
    update public.profiles set area_id = new.area_id where id = new.user_id;
  end if;
  return new;
end $$;

create trigger trg_sync_profile_current_area
  after insert on public.user_area_assignments
  for each row execute function app.sync_profile_current_area();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.areas enable row level security;
alter table public.user_area_assignments enable row level security;

-- areas: mesmo padrao das demais tabelas de cadastro corporativo (ver 0011) -
-- leitura para qualquer autenticado, escrita/edicao para PMO/admin, exclusao
-- so' para admin (e mesmo assim barrada pela FK enquanto houver vinculo).
create policy areas_read on public.areas for select to authenticated
  using (auth.uid() is not null);
create policy areas_write on public.areas for insert to authenticated
  with check (app.is_portfolio_manager());
create policy areas_update on public.areas for update to authenticated
  using (app.is_portfolio_manager()) with check (app.is_portfolio_manager());
create policy areas_delete on public.areas for delete to authenticated
  using (app.is_admin());

-- user_area_assignments: leitura corporativa (admin/PMO/auditor) ou a propria
-- pessoa ve o proprio historico. Escrita e' acao administrativa (transferir
-- alguem de area nao e' self-service) - sem policy de delete: correcao e'
-- feita por update nas datas, o historico nao e' apagavel pela API.
create policy user_area_assignments_read on public.user_area_assignments for select to authenticated
  using (app.is_portfolio_reader() or user_id = auth.uid());
create policy user_area_assignments_write on public.user_area_assignments for insert to authenticated
  with check (app.is_portfolio_manager());
create policy user_area_assignments_update on public.user_area_assignments for update to authenticated
  using (app.is_portfolio_manager()) with check (app.is_portfolio_manager());

-- -----------------------------------------------------------------------------
-- Auditoria
-- -----------------------------------------------------------------------------
select app.attach_audit('public.areas');
select app.attach_audit('public.user_area_assignments');
-- business_units ja tinha RLS desde a 0011, mas nunca foi auditada - passa a
-- ganhar tela de cadastro (Gerencia) nesta mesma frente, entao precisa entrar
-- na trilha como as demais tabelas de cadastro corporativo.
select app.attach_audit('public.business_units');
