-- =============================================================================
-- 0021 - Capacidade por Area: estende v_resource_capacity (nao duplica formula)
-- =============================================================================
--
-- A tab "Por area" de Recursos & Capacidade (item 10/11 do prompt de Areas)
-- precisa agregar exatamente os mesmos numeros ja usados em "Por equipe" -
-- so' trocando a chave de agrupamento. Em vez de criar uma segunda view ou
-- uma segunda formula, esta migration apenas ACRESCENTA colunas de area a'
-- v_resource_capacity (capacity_hours, allocated_hours e allocation_pct
-- continuam calculados do mesmo jeito, linha por linha).
--
-- Correcao historica (item 9): a area de cada linha vem de qual vinculo em
-- user_area_assignments estava aberto NAQUELE mes de referencia - nao do
-- ponteiro profiles.area_id (que so' reflete o vinculo atual). Consultar
-- maio mantém a Area A mesmo que a pessoa ja esteja na Area B em agosto.

-- CREATE OR REPLACE VIEW so aceita colunas novas no final da lista - as
-- colunas de area vao depois de project_count para nao deslocar as
-- posicoes das colunas ja existentes (Postgres recusa "renomear" coluna
-- por posicao).
create or replace view public.v_resource_capacity as
select
  pr.id as profile_id,
  pr.full_name,
  pr.primary_team_id as team_id,
  t.name as team_name,
  m.month as reference_month,
  round(pr.weekly_capacity_hours * 4.33, 2) as capacity_hours,
  round(coalesce(a.allocated_hours, 0), 2) as allocated_hours,
  case when pr.weekly_capacity_hours = 0 then 0
       else round(coalesce(a.allocated_hours, 0) * 100 / (pr.weekly_capacity_hours * 4.33), 2)
  end as allocation_pct,
  coalesce(a.project_count, 0) as project_count,
  ar.id as area_id,
  ar.name as area_name,
  bu.id as business_unit_id,
  bu.name as business_unit_name
from public.profiles pr
cross join lateral (
  select generate_series(
    date_trunc('month', current_date - interval '2 month'),
    date_trunc('month', current_date + interval '4 month'),
    interval '1 month'
  )::date as month
) m
left join public.teams t on t.id = pr.primary_team_id
left join lateral (
  select uaa.area_id
    from public.user_area_assignments uaa
   where uaa.user_id = pr.id
     and uaa.is_primary
     and uaa.valid_from <= (m.month + interval '1 month - 1 day')::date
     and (uaa.valid_to is null or uaa.valid_to >= m.month)
   order by uaa.valid_from desc
   limit 1
) ua on true
left join public.areas ar on ar.id = ua.area_id
left join public.business_units bu on bu.id = ar.business_unit_id
left join lateral (
  select
    sum(
      ra.allocated_hours
      * (
          (least(ra.period_end, (m.month + interval '1 month - 1 day')::date)
           - greatest(ra.period_start, m.month) + 1)::numeric
          / nullif((ra.period_end - ra.period_start + 1), 0)
        )
    ) as allocated_hours,
    count(distinct ra.project_id) as project_count
  from public.resource_allocations ra
  where ra.profile_id = pr.id
    and ra.period_start <= (m.month + interval '1 month - 1 day')::date
    and ra.period_end >= m.month
) a on true
where pr.active;

alter view public.v_resource_capacity set (security_invoker = on);
