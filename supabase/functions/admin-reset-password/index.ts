// Edge Function: admin-reset-password
//
// Gera uma nova senha temporaria para um usuario existente (fluxo
// administrativo). Mesma razao de existir do admin-create-user: enquanto o
// projeto nao tem SMTP proprio, o e-mail nativo do Supabase e' limitado e
// nao-deterministico, entao a recuperacao por e-mail (resetPasswordForEmail)
// nao e' confiavel como unico caminho. O Admin gera a senha e repassa
// diretamente a pessoa.
//
// E' o segundo (e ultimo) lugar da plataforma que usa a service_role, e ela
// nunca sai daqui - fica isolada nas variaveis de ambiente da propria funcao.
//
// Import por URL (esm.sh) em vez de "npm:": o especificador npm depende da
// versao do Edge Runtime e, quando nao resolve, a funcao quebra na carga.
// Nesse caso a plataforma responde 500 SEM cabecalho CORS algum, e o
// navegador reporta como erro de CORS - mascarando a causa real.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

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
      return json(req, { error: 'Somente administradores podem redefinir senha de outro usuario.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { user_id: targetUserId } = (body ?? {}) as Record<string, string | undefined>;
    if (!targetUserId) {
      return json(req, { error: 'Informe o usuario cuja senha sera redefinida.' }, 400);
    }

    // A leitura passa pela RLS normal do chamador (ja confirmado Admin acima),
    // nao pela service_role - o alvo precisa ser um perfil que o Admin enxerga.
    const { data: targetProfile, error: targetError } = await callerClient
      .from('profiles')
      .select('email')
      .eq('id', targetUserId)
      .single();

    if (targetError || !targetProfile?.email) {
      return json(req, { error: 'Usuario nao encontrado.' }, 404);
    }

    // Unico ponto desta funcao com service_role - existe somente no servidor.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const temporaryPassword = generateTemporaryPassword();
    const { error: updateError } = await adminClient.auth.admin.updateUserById(targetUserId, {
      password: temporaryPassword,
    });

    if (updateError) {
      return json(req, { error: `Falha ao redefinir a senha: ${updateError.message}` }, 400);
    }

    return json(req, { email: targetProfile.email, temporary_password: temporaryPassword }, 200);
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : 'Erro interno na funcao.' }, 500);
  }
});
