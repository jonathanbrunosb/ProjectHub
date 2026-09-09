-- Fase 2 (parte 2) do calculo automatico de alocacao: integra o planejado
-- (derivado das tarefas, v_task_planned_allocation) ao painel executivo
-- "Recursos & Capacidade" (v_resource_capacity), sem quebrar as colunas ja
-- consumidas hoje pela ResourcesPage.
--
-- allocated_hours/allocation_pct/project_count continuam significando
-- exatamente o que significavam ate' aqui (apontamento manual em
-- resource_allocations, hoje 'realizado' + 'legado') - nenhum consumidor
-- existente quebra. As colunas novas (planned_hours/planned_project_count/
-- total_hours/total_allocation_pct) sao apenas ACRESCENTADAS ao final, o
-- unico jeito que create or replace view permite mudar a lista de colunas.
--
-- O rateio mensal do planejado usa a MESMA formula de sobreposicao por dias
-- corridos ja usada para resource_allocations (nao dias uteis) - e' uma
-- simplificacao deliberada para manter uma unica metodologia dentro desta
-- view (o total por tarefa, esse sim, ja usa dias uteis - ver Fase 1).
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
  round(coalesce(a.allocated_hours, 0) + coalesce(p.planned_hours, 0), 2) as total_hours,
  case when pr.weekly_capacity_hours = 0 then 0
       else round((coalesce(a.allocated_hours, 0) + coalesce(p.planned_hours, 0)) * 100 / (pr.weekly_capacity_hours * 4.33), 2)
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
      (least(ra.period_end, (m.month + interval '1 month - 1 day')::date)
       - greatest(ra.period_start, m.month) + 1)::numeric
      / nullif((ra.period_end - ra.period_start + 1), 0)
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
    sum(tp.planned_hours * (
      (least(tp.period_end, (m.month + interval '1 month - 1 day')::date)
       - greatest(tp.period_start, m.month) + 1)::numeric
      / nullif((tp.period_end - tp.period_start + 1), 0)
    )) as planned_hours,
    count(distinct tp.project_id) as project_count
  from public.v_task_planned_allocation tp
  where tp.profile_id = pr.id
    and tp.period_start <= (m.month + interval '1 month - 1 day')::date
    and tp.period_end >= m.month
) p on true
where pr.active;

alter view public.v_resource_capacity set (security_invoker = on);
