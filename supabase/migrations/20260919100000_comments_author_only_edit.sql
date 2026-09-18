-- =============================================================================
-- Comentarios por entidade: FK de autoria e RLS restrita ao autor
--
-- `public.comments` (0009) e sua RLS (0011) ja existiam, mas a interface nunca
-- foi construida. Ao implementa-la agora, duas lacunas do desenho original
-- ficaram claras e sao fechadas aqui, antes de qualquer tela usar a tabela:
--
-- 1. UPDATE/DELETE usavam a politica generica de "filha de projeto"
--    (`app.can_write_project`), a mesma de `attachments`/`tasks`/`risks` - ou
--    seja, qualquer colaborador com escrita no projeto podia editar ou apagar
--    o comentario de outra pessoa. Aceitavel para anexo (documento do
--    projeto, nao burocracia pessoal); fragil para comentario, que e' registro
--    de quem disse o que. Alinhado ao padrao ja usado em `approvals_update`
--    (0011, linha 257-259): autor OU Admin/PMO.
-- 2. `created_by` nao tinha FK para `profiles` (nenhuma tabela carimbada por
--    `app.attach_stamps` tem - e' coluna generica). Sem FK, o PostgREST nao
--    consegue fazer embed (`created_by:profiles!fkey(full_name)`) para exibir
--    o nome do autor na tela, unico caso em que isso importa de fato.
-- =============================================================================

-- Nenhuma linha usa `comments` hoje (feature sem interface ate agora), entao
-- a validacao da FK contra dados existentes e' imediata.
alter table public.comments
  add constraint comments_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

drop policy if exists comments_update on public.comments;
drop policy if exists comments_delete on public.comments;

create policy comments_update on public.comments for update to authenticated
  using (created_by = auth.uid() or app.is_portfolio_manager())
  with check (created_by = auth.uid() or app.is_portfolio_manager());
create policy comments_delete on public.comments for delete to authenticated
  using (created_by = auth.uid() or app.is_portfolio_manager());
