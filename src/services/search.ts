import { supabase } from '@/lib/supabase/client';

export type SearchResultKind = 'project' | 'task' | 'risk' | 'action_plan' | 'decision';

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  code: string | null;
  title: string;
  subtitle: string | null;
  /** Rota de destino dentro do app - ja no formato usado por useNavigate(). */
  link: string;
}

const RESULTS_PER_KIND = 6;

/**
 * Busca por múltiplas entidades em paralelo, sem função de banco nova: cada
 * consulta roda com o cliente normal (RLS de cada tabela aplica exatamente
 * como em qualquer outra tela), então os resultados nunca vazam nada que o
 * usuário não pudesse ver navegando manualmente. `ilike` simples (sem
 * full-text) é suficiente no volume atual da plataforma - considerar tsvector
 * se o catálogo crescer para milhares de linhas por tabela.
 */
export async function globalSearch(term: string): Promise<SearchResult[]> {
  const query = term.trim();
  if (query.length < 2) return [];
  const pattern = `%${query}%`;

  const [projects, tasks, risks, actionPlans, decisions] = await Promise.all([
    supabase
      .from('projects')
      .select('id,code,name')
      .or(`code.ilike.${pattern},name.ilike.${pattern}`)
      .limit(RESULTS_PER_KIND),
    supabase
      .from('tasks')
      .select('id,project_id,code,title,project:projects(code,name)')
      .or(`code.ilike.${pattern},title.ilike.${pattern}`)
      .limit(RESULTS_PER_KIND),
    supabase
      .from('risks')
      .select('id,project_id,code,title,project:projects(code,name)')
      .or(`code.ilike.${pattern},title.ilike.${pattern}`)
      .limit(RESULTS_PER_KIND),
    supabase
      .from('action_plans')
      .select('id,project_id,code,title,project:projects(code,name)')
      .or(`code.ilike.${pattern},title.ilike.${pattern}`)
      .limit(RESULTS_PER_KIND),
    supabase
      .from('decisions')
      .select('id,project_id,code,subject,project:projects(code,name)')
      .or(`code.ilike.${pattern},subject.ilike.${pattern}`)
      .limit(RESULTS_PER_KIND),
  ]);

  for (const r of [projects, tasks, risks, actionPlans, decisions]) {
    if (r.error) throw r.error;
  }

  type ProjectRef = { code: string; name: string } | null;

  const results: SearchResult[] = [];

  for (const p of projects.data ?? []) {
    results.push({ kind: 'project', id: p.id, code: p.code, title: p.name, subtitle: p.code, link: `/projetos/${p.id}` });
  }
  for (const t of (tasks.data ?? []) as unknown as { id: string; project_id: string; code: string; title: string; project: ProjectRef }[]) {
    results.push({
      kind: 'task', id: t.id, code: t.code, title: t.title,
      subtitle: t.project ? `${t.project.code} · ${t.project.name}` : null,
      link: `/projetos/${t.project_id}/tarefas`,
    });
  }
  for (const r of (risks.data ?? []) as unknown as { id: string; project_id: string; code: string; title: string; project: ProjectRef }[]) {
    results.push({
      kind: 'risk', id: r.id, code: r.code, title: r.title,
      subtitle: r.project ? `${r.project.code} · ${r.project.name}` : null,
      link: `/projetos/${r.project_id}/riscos`,
    });
  }
  for (const a of (actionPlans.data ?? []) as unknown as { id: string; project_id: string; code: string; title: string; project: ProjectRef }[]) {
    results.push({
      kind: 'action_plan', id: a.id, code: a.code, title: a.title,
      subtitle: a.project ? `${a.project.code} · ${a.project.name}` : null,
      link: `/projetos/${a.project_id}/acoes`,
    });
  }
  for (const d of (decisions.data ?? []) as unknown as { id: string; project_id: string; code: string; subject: string; project: ProjectRef }[]) {
    results.push({
      kind: 'decision', id: d.id, code: d.code, title: d.subject,
      subtitle: d.project ? `${d.project.code} · ${d.project.name}` : null,
      link: `/projetos/${d.project_id}/decisoes`,
    });
  }

  return results;
}
