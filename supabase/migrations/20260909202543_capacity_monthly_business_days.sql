-- Fase 2 (parte 4) - dias uteis reais na visao mensal de capacidade.
--
-- Ate' aqui, v_resource_capacity e v_legacy_allocation_comparison rateavam
-- horas por SOBREPOSICAO DE DIAS CORRIDOS entre o periodo do registro e o
-- mes/periodo de referencia - superestimando a fracao de esforco em meses
-- com mais fins de semana/feriados. A partir desta migracao, o rateio usa
-- app.count_business_days_inclusive() (a mesma funcao de dias uteis, com
-- feriados de public.holidays, ja usada em v_task_planned_allocation desde a
-- Fase 1) tanto no numerador (dias uteis da sobreposicao) quanto no
-- denominador (dias uteis do periodo inteiro do registro).
--
-- Simplificacao deliberada mantida (documentada desde a Fase 2, parte 2):
-- capacity_hours continua sendo weekly_capacity_hours * 4.33 (aproximacao de
-- semanas por mes) - mudar a base de calculo da CAPACIDADE em si e' uma
-- decisao maior, fora do escopo deste pedido (que pediu dias uteis na
-- distribuicao mensal do que ja' esta alocado/planejado, nao na capacidade).
--
-- Contagem dia a dia via PL/pgSQL nao e' a forma mais rapida de fazer isso -
-- para o volume atual (dezenas de alocacoes/tarefas) e' imperceptivel; fica
-- registrado como possivel ponto de atencao de performance se o volume
-- crescer muito (secao 23 do pedido original).
create or replace view public.v_resource_capacity as
select
  pr.id as profile_id,
  pr.full_name,
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
  bu.name as business_unit_name,
  round(coalesce(p.planned_hours, 0), 2) as planned_hours,
  coalesce(p.project_count, 0) as planned_project_count,
  round(coalesce(az.realized_hours, 0) + coalesce(p.planned_hours, 0), 2) as total_hours,
  case when pr.weekly_capacity_hours = 0 then 0
       else round((coalesce(az.realized_hours, 0) + coalesce(p.planned_hours, 0)) * 100 / (pr.weekly_capacity_hours * 4.33), 2)
  end as total_allocation_pct
from public.profiles pr
cross join lateral (
  select generate_series(
    date_trunc('month', current_date - interval '2 month'),
    date_trunc('month', current_date + interval '4 month'),
    interval '1 month'
  )::date as month
) m
left join lateral (
  select uaa.area_id
    from public.user_area_assignments uaa
   where uaa.user_id = pr.id and uaa.is_primary
     and uaa.valid_from <= (m.month + interval '1 month - 1 day')::date
     and (uaa.valid_to is null or uaa.valid_to >= m.month)
   order by uaa.valid_from desc limit 1
) ua on true
left join public.areas ar on ar.id = ua.area_id
left join public.business_units bu on bu.id = ar.business_unit_id
left join lateral (
  select
    sum(ra.allocated_hours * (
      app.count_business_days_inclusive(
        greatest(ra.period_start, m.month), least(ra.period_end, (m.month + interval '1 month - 1 day')::date)
      )::numeric
      / nullif(app.count_business_days_inclusive(ra.period_start, ra.period_end), 0)
    )) as allocated_hours,
    count(distinct ra.project_id) as project_count
  from public.resource_allocations ra
  where ra.profile_id = pr.id
    and ra.status = 'ativa'
    and ra.period_start <= (m.month + interval '1 month - 1 day')::date
    and ra.period_end >= m.month
) a on true
left join lateral (
  select
    sum(ra.allocated_hours * (
      app.count_business_days_inclusive(
        greatest(ra.period_start, m.month), least(ra.period_end, (m.month + interval '1 month - 1 day')::date)
      )::numeric
      / nullif(app.count_business_days_inclusive(ra.period_start, ra.period_end), 0)
    )) as realized_hours
  from public.resource_allocations ra
  where ra.profile_id = pr.id
    and ra.status = 'ativa'
    and ra.source = 'realizado'
    and ra.period_start <= (m.month + interval '1 month - 1 day')::date
    and ra.period_end >= m.month
) az on true
left join lateral (
  select
    sum(tp.planned_hours * (
      app.count_business_days_inclusive(
        greatest(tp.period_start, m.month), least(tp.period_end, (m.month + interval '1 month - 1 day')::date)
      )::numeric
      / nullif(tp.business_days, 0)
    )) as planned_hours,
    count(distinct tp.project_id) as project_count
  from public.v_task_planned_allocation tp
  where tp.profile_id = pr.id
    and tp.period_start <= (m.month + interval '1 month - 1 day')::date
    and tp.period_end >= m.month
) p on true
where pr.active;

alter view public.v_resource_capacity set (security_invoker = on);

-- Mesma logica de dias uteis aplicada a comparacao legado x calculado: a
-- fracao do planejado da tarefa que "cai" dentro do periodo do registro
-- legado agora e' ponderada por dias uteis, nao dias corridos.
create or replace view public.v_legacy_allocation_comparison as
select
  ra.id as allocation_id,
  ra.project_id,
  ra.profile_id,
  ra.period_start,
  ra.period_end,
  ra.allocated_hours as legacy_hours,
  ra.description,
  ra.role_label,
  round(coalesce(tp.calculated_hours, 0), 2) as calculated_hours,
  round(ra.allocated_hours - coalesce(tp.calculated_hours, 0), 2) as divergence_hours,
  case when ra.allocated_hours = 0 then null
       else round((ra.allocated_hours - coalesce(tp.calculated_hours, 0)) / ra.allocated_hours * 100, 2)
  end as divergence_pct
from public.resource_allocations ra
left join lateral (
  select sum(
    t.planned_hours * (
      app.count_business_days_inclusive(
        greatest(t.period_start, ra.period_start), least(t.period_end, ra.period_end)
      )::numeric
      / nullif(t.business_days, 0)
    )
  ) as calculated_hours
  from public.v_task_planned_allocation t
  where t.project_id = ra.project_id
    and t.profile_id = ra.profile_id
    and t.period_start <= ra.period_end
    and t.period_end >= ra.period_start
) tp on true
where ra.source = 'legado' and ra.status = 'ativa';

alter view public.v_legacy_allocation_comparison set (security_invoker = on);
