-- =============================================================================
-- Dependencias entre tarefas: guarda de integridade antes de expor edicao
--
-- `task_dependencies` (0004) e sua RLS (0011) ja existiam, mas so' eram
-- alimentadas pela importacao de Excel de tarefas - nunca por edicao manual.
-- Ao construir o editor (predecessora/sucessora no TaskModal), duas lacunas
-- do desenho original ficaram evidentes, sem nenhuma guarda no banco:
--
-- 1. Nada impedia uma dependencia cruzando projetos: a RLS de INSERT so'
--    confere escrita no projeto da sucessora (0011, `task_dependencies_insert`)
--    - nunca comparou o projeto da predecessora. Uma tarefa de outro projeto
--    (ou ate' inacessivel ao usuario) podia virar predecessora sem erro.
-- 2. Nada impedia ciclo (A depende de B, B depende de C, C depende de A) -
--    so' havia `predecessor_id <> successor_id`, que barra so' o ciclo trivial
--    de 1 aresta. Um ciclo maior quebraria silenciosamente qualquer leitura
--    futura de caminho critico, e ja quebra hoje a logica de "risco" do Gantt
--    (`atRisk` em TaskList.tsx), que assume o grafo aciclico.
-- =============================================================================

create or replace function app.guard_task_dependency_integrity()
returns trigger language plpgsql as $$
declare
  v_pred_project uuid;
  v_succ_project uuid;
  v_cycle boolean;
begin
  select project_id into v_pred_project from public.tasks where id = new.predecessor_id;
  select project_id into v_succ_project from public.tasks where id = new.successor_id;

  if v_pred_project is null or v_succ_project is null then
    raise exception 'Tarefa predecessora ou sucessora nao encontrada (ou sem acesso de leitura).'
      using errcode = 'foreign_key_violation';
  end if;
  if v_pred_project <> v_succ_project then
    raise exception 'Predecessora e sucessora precisam pertencer ao mesmo projeto.'
      using errcode = 'check_violation';
  end if;

  -- Ciclo: a nova aresta (predecessor_id -> successor_id) fecha um ciclo se
  -- a sucessora ja alcanca a predecessora pelas arestas existentes (exclui a
  -- propria linha, para o caso de UPDATE so' trocar tipo/lag).
  with recursive reach(node) as (
    select successor_id from public.task_dependencies
     where predecessor_id = new.successor_id and id is distinct from new.id
    union
    select td.successor_id from public.task_dependencies td
      join reach r on td.predecessor_id = r.node
     where td.id is distinct from new.id
  )
  select exists (select 1 from reach where node = new.predecessor_id) into v_cycle;

  if v_cycle then
    raise exception 'Essa dependencia fecharia um ciclo (a sucessora ja depende, direta ou indiretamente, da predecessora).'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists trg_task_dependencies_guard on public.task_dependencies;
create trigger trg_task_dependencies_guard before insert or update on public.task_dependencies
  for each row execute function app.guard_task_dependency_integrity();
