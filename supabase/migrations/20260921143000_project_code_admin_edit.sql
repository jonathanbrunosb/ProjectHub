-- =============================================================================
-- Admin passa a poder corrigir o codigo do projeto (ex.: erro de digitacao ou
-- codigo indevido na criacao). Ate agora nada bloqueava isso no banco - a RLS
-- de projects_update (0011) libera UPDATE de qualquer coluna para
-- Owner/Collaborator/PMO/Admin via app.can_write_project, e o guard de
-- governanca (0024) nao cobria "code". So' nao existia caminho na tela.
--
-- Diferente de sponsor/owner/escopo organizacional/baseline (Admin OU PMO,
-- 0024), a troca de codigo fica restrita SO' a Admin: e' o identificador
-- publico do projeto, referenciado em relatorios, decisoes e riscos ja
-- compartilhados - correcao deliberada, nao rotina de PMO.
--
-- A checagem entra ANTES do bypass de app.is_portfolio_manager() (que already
-- libera PMO para as demais trocas de governanca), porque aqui PMO tambem
-- precisa ser bloqueado - so' Admin passa.
-- =============================================================================

create or replace function app.guard_project_governance()
returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if new.code is distinct from old.code and not app.is_admin() then
    raise exception 'Somente Admin altera o codigo do projeto.'
      using errcode = 'insufficient_privilege';
  end if;

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
