-- =============================================================================
-- 0024 - Governanca de edicao cadastral do projeto: Sponsor, Owner, escopo
-- organizacional e baseline exigem Admin/PMO; projeto arquivado so' eles editam
-- =============================================================================
--
-- Contexto: updateProject() no client aceita Partial<Project> sem restricao
-- de coluna, e a RLS de projects (app.can_write_project, 0011) libera UPDATE
-- de TODAS as colunas para o proprio Owner e para qualquer Collaborator com
-- can_edit=true no projeto - nao so' os campos operacionais (status, datas,
-- progresso). Esconder o campo so' na tela nao impede a troca via UPDATE
-- direto (o mesmo problema que app.guard_financial_module_mode, 0016, ja
-- resolveu para financial_module_mode - este guard segue o mesmo padrao).
--
-- Sponsor, Owner, escopo organizacional (empresa/area responsavel) e baseline
-- sao decisao de governanca do portfolio (Admin/PMO), nao edicao operacional
-- do dia a dia que o proprio Owner/Collaborator ja tem via project.write. O
-- Owner nao ganha automaticamente permissao de trocar a si mesmo ou o Sponsor
-- so' por ser responsavel pelo projeto.
--
-- Projeto arquivado: correcoes cadastrais continuam possiveis, mas so' para
-- Admin/PMO - ninguem mais grava em projeto arquivado por engano.
--
-- Nao cria tabela de historico separada: app.audit_row_change (0010) ja
-- classifica troca de owner_id/sponsor_id como action='ownership_change' com
-- old_data/new_data/changed_fields completos em application_audit_log.

create or replace function app.guard_project_governance()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if auth.uid() is null or app.is_portfolio_manager() then
    return new;
  end if;

  if old.archived_at is not null then
    raise exception 'Projeto arquivado - somente Admin ou PMO pode altera-lo.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.sponsor_id is distinct from old.sponsor_id then
    raise exception 'Somente Admin ou PMO altera o Sponsor do projeto.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'Somente Admin ou PMO altera o Owner do projeto.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.company_id is distinct from old.company_id or new.area_id is distinct from old.area_id then
    raise exception 'Somente Admin ou PMO altera a Empresa ou a Area responsavel do projeto.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.baseline_start_date is distinct from old.baseline_start_date
     or new.baseline_target_date is distinct from old.baseline_target_date then
    raise exception 'Somente Admin ou PMO altera a baseline do projeto.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;

create trigger trg_projects_guard_governance before update on public.projects
  for each row execute function app.guard_project_governance();
