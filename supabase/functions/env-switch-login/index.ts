// Edge Function: env-switch-login
//
// Ponte de login entre QA e PRD para quem tem `can_switch_environment = true`.
// QA e PRD sao projetos Supabase fisicamente separados (Auth proprio em cada
// um), entao uma sessao valida em um nao vale nada no outro - por design, para
// nunca cruzar dado real com dado de teste. Isso e' correto, mas sem esta ponte
// a troca de ambiente pela interface derrubava a pessoa na tela de login e so'
// funcionava se ela tivesse cadastro manual feito nos dois lados.
//
// O MESMO codigo desta funcao e' implantado nos DOIS projetos (QA e PRD). Cada
// implantacao roda como o ambiente de DESTINO da troca e usa dois segredos
// extras (alem dos que o Supabase ja injeta em toda funcao):
//   PEER_SUPABASE_URL       - URL do OUTRO projeto (a origem da troca)
//   PEER_SUPABASE_ANON_KEY  - anon key do OUTRO projeto (publica, sem risco)
// Ex.: na implantacao em QA, PEER_* aponta para PRD; na implantacao em PRD,
// PEER_* aponta para QA.
//
// Fluxo:
//  1. Quem chama manda, no header Authorization, o token de sessao que tem no
//     ambiente de ORIGEM (nao no de destino - ali ainda nao ha sessao).
//  2. Esta funcao valida esse token direto contra a API do projeto de ORIGEM
//     (PEER_*) e confirma, no profile de origem, active=true e
//     can_switch_environment=true. Sem isso, nada acontece - a troca de
//     ambiente pela interface nunca e' o que autoriza, e' so' o gatilho.
//  3. Com service_role do proprio projeto (destino), localiza a conta por
//     e-mail; se nao existir, deixa o proprio generateLink cria-la (espelhando
//     papel e permissao de troca só na criacao, sem sobrescrever
//     configuracao ja feita manualmente no destino).
//  4. Gera um magic link SEM enviar e-mail algum (o token volta so' para quem
//     chamou, que ja provou identidade no passo 2) e devolve o hash do token
//     para o frontend trocar por uma sessao real via verifyOtp.
//
// Import por URL (esm.sh) em vez de "npm:": ver nota nas outras funcoes admin-*
// - com "npm:" a funcao pode quebrar na carga e responder 500 sem CORS algum.
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

interface PeerProfile {
  email: string;
  full_name: string | null;
  role: string;
  active: boolean;
  can_switch_environment: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Metodo nao suportado.' }, 405);

  try {
    const sourceAuthHeader = req.headers.get('Authorization');
    if (!sourceAuthHeader) return json(req, { error: 'Nao autenticado no ambiente de origem.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const peerUrl = Deno.env.get('PEER_SUPABASE_URL');
    const peerAnonKey = Deno.env.get('PEER_SUPABASE_ANON_KEY');

    if (!supabaseUrl || !serviceRoleKey || !peerUrl || !peerAnonKey) {
      return json(req, { error: 'Funcao mal configurada: variaveis de ambiente ausentes (confira PEER_SUPABASE_URL/PEER_SUPABASE_ANON_KEY).' }, 500);
    }

    // Passo 1: quem e' a pessoa no ambiente de ORIGEM (valida o token la', nao aqui).
    const peerUserResp = await fetch(`${peerUrl}/auth/v1/user`, {
      headers: { apikey: peerAnonKey, Authorization: sourceAuthHeader },
    });
    if (!peerUserResp.ok) {
      return json(req, { error: 'Sessao invalida ou expirada no ambiente de origem.' }, 401);
    }
    const peerUser = await peerUserResp.json() as { id?: string; email?: string };
    if (!peerUser?.id || !peerUser?.email) {
      return json(req, { error: 'Nao foi possivel identificar o usuario no ambiente de origem.' }, 401);
    }

    // Passo 2: confirma, no profile de ORIGEM, que a troca esta autorizada.
    // A leitura usa o proprio token de quem chamou (RLS de origem), nunca uma
    // service_role de fora - o profile de origem so' pode falar por si mesmo.
    const peerProfileResp = await fetch(
      `${peerUrl}/rest/v1/profiles?id=eq.${peerUser.id}&select=email,full_name,role,active,can_switch_environment`,
      { headers: { apikey: peerAnonKey, Authorization: sourceAuthHeader } },
    );
    if (!peerProfileResp.ok) {
      return json(req, { error: 'Falha ao validar permissao no ambiente de origem.' }, 401);
    }
    const [peerProfile] = await peerProfileResp.json() as PeerProfile[];
    if (!peerProfile) {
      return json(req, { error: 'Perfil nao encontrado no ambiente de origem.' }, 404);
    }
    if (!peerProfile.active || !peerProfile.can_switch_environment) {
      return json(req, { error: 'Esta conta nao tem permissao para alternar de ambiente.' }, 403);
    }

    // Unico ponto desta funcao com service_role - nunca sai do proprio projeto.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Passo 3: ja existe conta espelhada neste ambiente (destino)?
    const { data: existingProfile, error: existingError } = await adminClient
      .from('profiles')
      .select('id, active')
      .eq('email', peerProfile.email)
      .maybeSingle();

    if (existingError) {
      return json(req, { error: `Falha ao consultar o ambiente de destino: ${existingError.message}` }, 500);
    }
    if (existingProfile && !existingProfile.active) {
      return json(req, { error: 'Esta conta esta inativa neste ambiente.' }, 403);
    }

    // Passo 4: gera o magic link (cria a conta automaticamente se for a
    // primeira vez - "cenario reservo" e' so' quando esta ponte falha).
    const { data: link, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: peerProfile.email,
    });
    if (linkError || !link?.properties?.hashed_token) {
      return json(req, { error: linkError?.message ?? 'Falha ao gerar o acesso neste ambiente.' }, 500);
    }

    // So' na primeira vez (conta acabou de ser criada pelo generateLink acima):
    // espelha papel e permissao de troca. Depois disso, o ambiente de destino
    // e' dono da propria configuracao - a ponte nunca mais sobrescreve.
    if (!existingProfile) {
      await adminClient
        .from('profiles')
        .update({
          role: peerProfile.role,
          full_name: peerProfile.full_name || undefined,
          active: true,
          can_switch_environment: true,
        })
        .eq('email', peerProfile.email);
    }

    return json(req, { email: peerProfile.email, token: link.properties.hashed_token }, 200);
  } catch (e) {
    return json(req, { error: e instanceof Error ? e.message : 'Erro interno na funcao.' }, 500);
  }
});
