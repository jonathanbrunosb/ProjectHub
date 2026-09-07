// Edge Function: admin-delete-user
//
// Exclui permanentemente a conta de um usuario. `profiles.id` referencia
// `auth.users(id) on delete cascade`, entao remover o usuario na auth ja'
// remove o profile junto - nao existe "excluir so' o profile" sem deixar uma
// conta de auth orfa (que continuaria logando sem enxergar nada, um estado
// pior que o atual).
//
// Terceiro (e ultimo) ponto da plataforma com service_role, isolada nas
// variaveis de ambiente da propria funcao.
//
// O que acontece com os vinculos do usuario (auditado em migrations/0002 a
// 0009): a maioria dos FKs e' `on delete set null` (dono de projeto, tarefa,
// risco, decisao ficam sem responsavel, mas o registro permanece intacto).
// Um numero menor e' `on delete cascade` (vinculos de equipe, aprovacoes,
// visualizacoes salvas, preferencias de coluna - dados que so fazem sentido
// atrelados a pessoa). Aprovacoes tem gatilho de auditoria: o `DELETE`
// captura `old_data` em `application_audit_log` antes da linha sumir, entao
// o fato historico ("fulano aprovou X em tal data") sobrevive mesmo que a
// linha viva em `approvals` seja removida.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.115.0';

function cors(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      req.headers.get('Access-Control-Request-Headers')
      ?? 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

function json(req: Request, body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Metodo nao suportado.' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json(req, { error: 'Nao autenticado.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json(req, { error: 'Funcao mal configurada: variaveis de ambiente ausentes.' }, 500);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return json(req, { error: 'Sessao invalida ou expirada.' }, 401);
    }
    const callerId = userData.user.id;

    const { data: callerProfile, error: profileError } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', callerId)
      .single();

    if (profileError) {
      return json(req, { error: `Falha ao validar permissao: ${profileError.message}` }, 403);
    }
    if (callerProfile?.role !== 'admin') {
      return json(req, { error: 'Somente administradores podem excluir usuarios.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { user_id: targetUserId } = (body ?? {}) as Record<string, string | undefined>;
    if (!targetUserId) {
      return json(req, { error: 'Informe o usuario a ser excluido.' }, 400);
    }
    if (targetUserId === callerId) {
      return json(req, { error: 'Voce nao pode excluir a propria conta.' }, 400);
    }

    // A leitura passa pela RLS normal do chamador (ja confirmado Admin acima),
    // nao pela service_role - o alvo precisa ser um perfil que o Admin enxerga.
    const { data: targetProfile, error: targetError } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', targetUserId)
      .single();

    if (targetError || !targetProfile) {
      return json(req, { error: 'Usuario nao encontrado.' }, 404);
    }

    // Nunca deixar a plataforma sem nenhum administrador - sem isso, uma
    // exclusao apressada tranca a gestao de usuarios e permissoes para sempre.
    if (targetProfile.role === 'admin') {
      const { count, error: countError } = await callerClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin')
        .eq('active', true);

      if (countError) {
        return json(req, { error: `Falha ao validar administradores restantes: ${countError.message}` }, 500);
      }
      if ((count ?? 0) <= 1) {
        return json(req, { error: 'Nao e possivel excluir o unico administrador ativo da plataforma.' }, 400);
      }
    }

    // Unico ponto desta funcao com service_role - existe somente no servidor.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      return json(req, { error: `Falha ao excluir o usuario: ${deleteError.message}` }, 400);
    }

    return json(req, { id: targetUserId }, 200);
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : 'Erro interno na funcao.' }, 500);
  }
});
