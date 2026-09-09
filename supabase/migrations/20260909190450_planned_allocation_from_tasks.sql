-- Fase 1 do calculo automatico de alocacao a partir das tarefas.
--
-- Principio: a alocacao PLANEJADA nao e' mais cadastrada manualmente - e' derivada
-- de tasks.estimated_hours + responsavel(is) (assignee_id + task_corresponsibles) +
-- periodo (start_date/due_date), via view (sem duplicar dado em tabela nova).
-- resource_allocations passa a representar HORAS REALIZADAS (apontamento manual),
-- nunca mais planejamento - por isso ganha a coluna `source`, que classifica os
-- registros ja existentes como 'legado' (nada e' apagado ou migrado a forca).

-- --- Calendario de feriados ----------------------------------------------
-- public.holidays / app.is_business_day / app.business_days_between ja existiam
-- em QA e PRD (aplicados fora do controle de versao) - esta migration apenas
-- traz essa estrutura para o git, sem recriar nada: create table/policy sao
-- guardados por existencia para serem no-op onde o objeto ja existe.
create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.holidays enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'holidays' and policyname = 'holidays_read') then
    create policy holidays_read on public.holidays for select to authenticated using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'holidays' and policyname = 'holidays_write') then
    create policy holidays_write on public.holidays for insert to authenticated with check (app.is_portfolio_manager());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'holidays' and policyname = 'holidays_update') then
    create policy holidays_update on public.holidays for update to authenticated using (app.is_portfolio_manager()) with check (app.is_portfolio_manager());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'holidays' and policyname = 'holidays_delete') then
    create policy holidays_delete on public.holidays for delete to authenticated using (app.is_portfolio_manager());
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.holidays'::regclass and tgname = 'trg_audit') then
    perform app.attach_audit('public.holidays');
  end if;
end $$;

create or replace function app.is_business_day(p_date date)
returns boolean
language sql
stable
as $$
  select extract(isodow from p_date) < 6
     and not exists (select 1 from public.holidays h where h.date = p_date and h.active);
$$;

create or replace function app.business_days_between(p_from date, p_to date)
returns integer
language plpgsql
stable
as $$
declare v_sign int := 1; v_a date; v_b date; v_count int := 0; v_d date;
begin
  if p_from is null or p_to is null then return null; end if;
  if p_to = p_from then return 0; end if;
  if p_to < p_from then v_sign := -1; v_a := p_to; v_b := p_from;
  else v_a := p_from; v_b := p_to;
  end if;
  v_d := v_a;
  while v_d < v_b loop
    v_d := v_d + 1;
    if app.is_business_day(v_d) then v_count := v_count + 1; end if;
  end loop;
  return v_count * v_sign;
end $$;

-- Contagem INCLUSIVA de dias uteis entre duas datas (as duas pontas contam se
-- forem dia util). app.business_days_between() e' exclusiva na ponta inicial
-- (conta dias uteis em (from, to]) - por isso nao e' reaproveitada diretamente
-- para "quantos dias uteis tem esta tarefa", usamos p_start - 1 como truque
-- para incluir o primeiro dia sem duplicar a logica de feriado/fim de semana.
create or replace function app.count_business_days_inclusive(p_start date, p_end date)
returns integer
language sql
stable
as $$
  select case
    when p_start is null or p_end is null or p_end < p_start then 0
    else coalesce(app.business_days_between(p_start - 1, p_end), 0)
  end;
$$;

-- --- Alocacao planejada derivada das tarefas -----------------------------
-- Um responsavel por tarefa (assignee_id) mais, opcionalmente, co-responsaveis
-- (task_corresponsibles). Sem informacao de percentual individual ainda (fica
-- para a Fase 2 - secao 6 do pedido), o rateio e' igualitario entre todos os
-- responsaveis da tarefa. Tarefas canceladas ficam de fora (a alocacao futura
-- e' automaticamente removida, ja que a view e' sempre recalculada na leitura).
-- Tarefas concluidas continuam aparecendo normalmente - o historico planejado
-- nunca e' apagado, porque a view so' depende dos dados da propria tarefa.
create or replace view public.v_task_planned_allocation as
with responsible as (
  select t.id as task_id, t.project_id, t.assignee_id as profile_id
  from public.tasks t
  where t.assignee_id is not null
  union all
  select t.id as task_id, t.project_id, tc.profile_id
  from public.tasks t
  join public.task_corresponsibles tc on tc.task_id = t.id
),
responsible_count as (
  select task_id, count(*) as n from responsible group by task_id
),
base as (
  select
    t.id as task_id,
    t.project_id,
    t.code,
    t.title,
    t.status,
    t.estimated_hours,
    coalesce(t.start_date, t.due_date) as period_start,
    t.due_date as period_end
  from public.tasks t
  where t.status <> 'cancelada'
    and t.estimated_hours is not null
    and t.estimated_hours > 0
    and t.due_date is not null
)
select
  b.task_id,
  b.project_id,
  b.code,
  b.title,
  b.status,
  r.profile_id,
  rc.n as responsible_count,
  round(b.estimated_hours / rc.n, 2) as planned_hours,
  b.period_start,
  b.period_end,
  greatest(app.count_business_days_inclusive(b.period_start, b.period_end), 1) as business_days
from base b
join responsible r on r.task_id = b.task_id
join responsible_count rc on rc.task_id = b.task_id;

-- security_invoker: a view roda com a RLS de quem consulta (mesma policy de
-- leitura ja existente em tasks/task_corresponsibles), nao precisa de policy propria.
alter view public.v_task_planned_allocation set (security_invoker = on);

-- --- Classificacao das horas em resource_allocations ---------------------
-- 'legado'   = registro manual anterior a esta migracao (planejamento antigo,
--              preservado para consulta/comparacao, nao apagado).
-- 'realizado' = apontamento de horas efetivamente executadas, cadastrado a
--              partir de agora pelo formulario "Registrar horas realizadas".
alter table public.resource_allocations
  add column if not exists source text not null default 'legado';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.resource_allocations'::regclass
      and conname = 'resource_allocations_source_ck'
  ) then
    alter table public.resource_allocations
      add constraint resource_allocations_source_ck check (source in ('legado', 'realizado'));
  end if;
end $$;
