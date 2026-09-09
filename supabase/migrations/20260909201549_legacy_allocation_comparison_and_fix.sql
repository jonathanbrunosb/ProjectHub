-- Fase 2 (parte 3) - migracao assistida das alocacoes manuais legadas
-- (secao 22 do pedido): compara cada registro 'legado' de resource_allocations
-- com o planejado calculado a partir das tarefas para o mesmo colaborador/
-- projeto/periodo, para que o PMO decida o que arquivar - nada e' apagado ou
-- convertido automaticamente.
--
-- De quebra, corrige um problema real encontrado ao construir essa
-- comparacao: v_resource_capacity.total_hours somava allocated_hours
-- (legado + realizado) + planned_hours (tarefas) - um registro 'legado' que
-- representa o MESMO planejamento que hoje e' calculado automaticamente
-- estava sendo contado duas vezes no total combinado. 'legado' nunca
-- representou trabalho de fato executado, entao nao deveria compor a soma de
-- "realizado" do total - so' 'realizado' (apontamento novo) deveria.
-- allocated_hours/allocation_pct continuam com o significado de sempre
-- (legado + realizado), preservando retrocompatibilidade com quem consome
-- essas colunas hoje - so' o calculo de total_hours muda de base.

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
  -- total = planejado (tarefas) + REALIZADO (nunca legado, para nao contar
  -- duas vezes um planejamento manual antigo que hoje ja vem das tarefas).
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
    sum(ra.allocated_hours * (
      (least(ra.period_end, (m.month + interval '1 month - 1 day')::date)
       - greatest(ra.period_start, m.month) + 1)::numeric
      / nullif((ra.period_end - ra.period_start + 1), 0)
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

-- --- Comparacao legado x calculado ----------------------------------------
-- Para cada registro 'legado' ainda ativo, soma o planejado calculado pelas
-- tarefas no mesmo colaborador+projeto, ponderado pela sobreposicao com o
-- periodo do registro legado (mesma logica de rateio ja usada nas outras
-- views). divergence_hours > 0 = o legado tem MAIS horas que o calculo hoje
-- sugere (pode ser esforco real que nunca virou tarefa); < 0 = o legado tem
-- MENOS (pode ser que a tarefa cresceu depois do cadastro manual).
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
      (least(t.period_end, ra.period_end) - greatest(t.period_start, ra.period_start) + 1)::numeric
      / nullif((t.period_end - t.period_start + 1), 0)
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
