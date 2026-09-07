// Edge Function: admin-create-user
//
// Cadastra um usuario com senha temporaria (fluxo administrativo).
// Executa fora do navegador: e' o UNICO lugar da plataforma que usa a
// service_role, e ela nunca sai daqui - fica isolada nas variaveis de
// ambiente da propria funcao no Supabase.
//
// Por que senha temporaria em vez de convite por e-mail: o servico de
// e-mail nativo do Supabase tem limite severo de envio e restricao de
// destinatario, o que torna o cadastro nao-deterministico. Criar a conta
// ja confirmada e entregar a credencial ao Admin remove essa dependencia.
// Com SMTP proprio configurado, da' para voltar ao inviteUserByEmail.
//
// Import por URL (esm.sh) em vez de "npm:": o especificador npm depende da
// versao do Edge Runtime e, quando nao resolve, a funcao quebra na carga.
// Nesse caso a plataforma responde 500 SEM cabecalho CORS algum, e o
// navegador reporta como erro de CORS - mascarando a causa real.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.115.0';

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

// Alfabeto sem caracteres ambiguos (0/O, 1/l/I) - a senha sera digitada por gente.
function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const symbols = '!@#$%&*';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  const extra = new Uint8Array(2);
  crypto.getRandomValues(extra);
  return `${out}${symbols[extra[0] % symbols.length]}${extra[1] % 10}`;
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

    const temporaryPassword = generateTemporaryPassword();

    // email_confirm: true -> a pessoa entra direto com a senha temporaria,
    // sem depender de nenhum e-mail ser entregue.
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError) {
      const lowered = createError.message.toLowerCase();
      const isDuplicate = lowered.includes('already been registered')
        || lowered.includes('already registered')
        || lowered.includes('already exists');
      return json(
        req,
        { error: isDuplicate ? 'Ja existe uma conta com esse e-mail.' : `Falha ao criar o usuario: ${createError.message}` },
        isDuplicate ? 409 : 400,
      );
    }

    const newUserId = created?.user?.id;
    if (!newUserId) {
      return json(req, { error: 'Usuario criado, mas o Supabase nao retornou o identificador.' }, 500);
    }

    // O gatilho on_auth_user_created ja criou o profile com papel 'viewer'.
    // Ajusta para o papel e vinculo definidos pelo Admin no cadastro.
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
        { error: `Usuario criado, mas houve falha ao definir o perfil: ${updateError.message}` },
        500,
      );
    }

    return json(req, { id: newUserId, email, temporary_password: temporaryPassword }, 200);
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : 'Erro interno na funcao.' }, 500);
  }
});
