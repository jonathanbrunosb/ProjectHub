// Edge Function: admin-invite-user
//
// Cadastra um usuario e envia convite por e-mail (fluxo administrativo).
// Executa fora do navegador: e' o UNICO lugar da plataforma que usa a
// service_role, e ela nunca sai daqui - fica isolada nas variaveis de
// ambiente da propria funcao no Supabase.
//
// Validacao de quem pode chamar: le o JWT de quem fez a requisicao,
// confirma o papel na tabela profiles (via RLS normal, sem privilegio),
// e so prossegue com a service_role se for 'admin'.
//
// Import por URL (esm.sh) em vez de "npm:": o especificador npm depende da
// versao do Edge Runtime e, quando nao resolve, a funcao quebra na carga.
// Nesse caso a plataforma responde 500 SEM cabecalho CORS algum, e o
// navegador reporta como erro de CORS - mascarando a causa real.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// Reflete os cabecalhos que o navegador pediu no preflight. Assim a funcao
// nunca mais quebra porque o cliente passou a mandar um header novo.
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

const allowedRoles = new Set([
  'admin', 'pmo', 'sponsor', 'project_owner', 'collaborator', 'viewer', 'auditor',
]);

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

    // Cliente com o JWT de quem chamou - respeita a RLS normal, sem privilegio algum.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return json(req, { error: 'Sessao invalida ou expirada.' }, 401);
    }

    const { data: callerProfile, error: profileError } = await callerClient
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (profileError) {
      return json(req, { error: `Falha ao validar permissao: ${profileError.message}` }, 403);
    }
    if (callerProfile?.role !== 'admin') {
      return json(req, { error: 'Somente administradores podem cadastrar usuarios.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const {
      email, full_name: fullName, role,
      job_title: jobTitle, company_id: companyId,
      business_unit_id: businessUnitId, primary_team_id: primaryTeamId,
    } = (body ?? {}) as Record<string, string | null | undefined>;

    if (!email || !fullName || !role) {
      return json(req, { error: 'Informe nome, e-mail e papel de acesso.' }, 400);
    }
    if (!allowedRoles.has(role)) {
      return json(req, { error: 'Papel de acesso invalido.' }, 400);
    }

    // Unico ponto da plataforma com service_role - existe somente no servidor.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const siteUrl = Deno.env.get('SITE_URL') ?? 'https://projecthub.contabilidade-eqtl.com/';
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: siteUrl,
    });

    if (inviteError) {
      const lowered = inviteError.message.toLowerCase();
      const isDuplicate = lowered.includes('already been registered')
        || lowered.includes('already registered')
        || lowered.includes('already exists');
      return json(
        req,
        { error: isDuplicate ? 'Ja existe uma conta com esse e-mail.' : `Falha ao enviar o convite: ${inviteError.message}` },
        isDuplicate ? 409 : 400,
      );
    }

    const newUserId = invited?.user?.id;
    if (!newUserId) {
      return json(req, { error: 'Convite enviado, mas o Supabase nao retornou o usuario criado.' }, 500);
    }

    // O gatilho on_auth_user_created ja criou o profile com papel 'viewer'.
    // Ajusta para o papel e vinculo definidos pelo Admin no convite.
    const { error: updateError } = await adminClient
      .from('profiles')
      .update({
        role,
        job_title: jobTitle || null,
        company_id: companyId || null,
        business_unit_id: businessUnitId || null,
        primary_team_id: primaryTeamId || null,
      })
      .eq('id', newUserId);

    if (updateError) {
      return json(
        req,
        { error: `Convite enviado, mas houve falha ao definir o perfil: ${updateError.message}` },
        500,
      );
    }

    return json(req, { id: newUserId }, 200);
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : 'Erro interno na funcao.' }, 500);
  }
});
