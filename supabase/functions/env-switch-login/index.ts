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
// implantacao roda como o ambiente de DESTINO da troca e precisa de UM segredo
// extra (alem dos que o Supabase ja injeta em toda funcao):
//   PEER_SUPABASE_URL - URL do OUTRO projeto (a origem da troca). Ex.: na
//   implantacao em QA aponta para PRD; na implantacao em PRD aponta para QA.
//
// A chave anon do outro projeto NAO precisa mais ser configurada como segredo:
// ela chega no corpo da chamada, vinda do bundle do frontend (onde ja' e'
// correta, injetada pelo build). PEER_SUPABASE_ANON_KEY continua sendo aceita
// como reserva, para instalacoes que ja' a tenham configurada.
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

/**
 * PEER_SUPABASE_URL e' colado a mao (painel do Supabase) e o erro mais comum
 * e' colar a URL de exemplo do REST (".../rest/v1/") em vez da URL base do
 * projeto - o que quebra silenciosamente todo fetch feito a partir dela (vira
 * ".../rest/v1//auth/v1/user"). `new URL(...).origin` normaliza para so' o
 * esquema+host+porta, aceitando qualquer sufixo/barra final colado por engano.
 */
function normalizePeerUrl(raw: string): string {
  // Mesma sujeira de copia que atinge as chaves (ver sanitizeApiKey) tambem
  // chega aqui - remove o que nao e' ASCII imprimivel antes de interpretar.
  return new URL(raw.replace(/[^\x20-\x7E]/g, '').trim()).origin;
}

/**
 * Chave de API (JWT `eyJ...` ou `sb_publishable_...`) colada a mao no painel ou
 * no terminal costuma vir suja: quebra de linha na ponta, espaco no meio de uma
 * linha que o terminal quebrou, ou caractere invisivel de formatacao (zero-width
 * space, marca de direcao de texto) inserido pelo navegador ao copiar uma string
 * longa sem espacos. Qualquer um deles quebra o `fetch` com um erro generico de
 * JavaScript ("nao e' um ByteString valido"), longe da causa real.
 *
 * O alfabeto desses dois formatos e' fechado ([A-Za-z0-9._-]), entao tudo que
 * cai fora dele e' lixo de copia e pode ser removido com seguranca - a funcao se
 * conserta sozinha em vez de exigir que alguem recole o valor perfeito. So' o que
 * sobra depois da limpeza e' validado, ai' sim com mensagem especifica.
 */
function sanitizeApiKey(name: string, raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9._-]/g, '');
  if (!cleaned) {
    throw new Error(`${name} esta vazia (ou so' com caracteres invalidos) apos a limpeza.`);
  }
  return cleaned;
}

/**
 * O header Authorization e' "Bearer <jwt>" - tem um espaco legitimo no meio,
 * entao nao da' para usar a limpeza da chave de API aqui. Remove so' o que o
 * `fetch` recusa (fora de ASCII) e as pontas.
 */
function sanitizeAuthHeader(raw: string): string {
  return raw.replace(/[^\x20-\x7E]/g, '').trim();
}

/** Erro de rede/URL malformada (fetch nunca completa) - nao confundir com uma
 * resposta HTTP de erro (401/403 reais), que tem seu proprio tratamento. */
async function fetchPeer(url: string, headers: Record<string, string>): Promise<Response> {
  try {
    return await fetch(url, { headers });
  } catch (e) {
    throw new Error(`Nao foi possivel contatar o ambiente de origem (${url}): ${e instanceof Error ? e.message : e}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Metodo nao suportado.' }, 405);

  try {
    const sourceAuthHeader = req.headers.get('Authorization');
    if (!sourceAuthHeader) return json(req, { error: 'Nao autenticado no ambiente de origem.' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const rawPeerUrl = Deno.env.get('PEER_SUPABASE_URL');

    if (!supabaseUrl || !serviceRoleKey || !rawPeerUrl) {
      return json(req, { error: 'Funcao mal configurada: variaveis de ambiente ausentes (confira PEER_SUPABASE_URL).' }, 500);
    }

    // A chave anon do ambiente de origem vem preferencialmente de quem chamou:
    // o frontend ja' a tem correta pelo build, enquanto cola-la a mao como
    // segredo se mostrou fragil (JWT longo copiado entre janelas chega com
    // caractere invisivel). Isso NAO afrouxa a seguranca: PEER_SUPABASE_URL
    // continua so' no servidor e e' contra ela, e somente contra ela, que o
    // token e a permissao sao validados - uma chave anon errada aqui apenas
    // faz a requisicao falhar, nunca forja identidade. O segredo continua
    // valendo como reserva, para quem ja' o tinha configurado corretamente.
    const body = await req.json().catch(() => ({})) as { peer_anon_key?: string };
    const peerAnonKey = body?.peer_anon_key || Deno.env.get('PEER_SUPABASE_ANON_KEY');

    if (!peerAnonKey) {
      return json(req, { error: 'Chave do ambiente de origem ausente (nem no corpo da chamada, nem em PEER_SUPABASE_ANON_KEY).' }, 500);
    }

    let peerUrl: string;
    let safeAnonKey: string;
    let safeAuthHeader: string;
    try {
      peerUrl = normalizePeerUrl(rawPeerUrl);
      safeAnonKey = sanitizeApiKey('A chave do ambiente de origem', peerAnonKey);
      safeAuthHeader = sanitizeAuthHeader(sourceAuthHeader);
    } catch (e) {
      return json(req, { error: e instanceof Error ? e.message : 'Configuracao invalida.' }, 500);
    }

    // Passo 1: quem e' a pessoa no ambiente de ORIGEM (valida o token la', nao aqui).
    const peerUserResp = await fetchPeer(`${peerUrl}/auth/v1/user`, { apikey: safeAnonKey, Authorization: safeAuthHeader });
    if (!peerUserResp.ok) {
      const detail = await peerUserResp.text().catch(() => '');
      return json(req, {
        error: `Sessao invalida ou expirada no ambiente de origem (HTTP ${peerUserResp.status} em ${peerUrl}/auth/v1/user`
          + `${detail ? ` - ${detail.slice(0, 200)}` : ''}). Confira PEER_SUPABASE_URL/PEER_SUPABASE_ANON_KEY.`,
      }, 401);
    }
    const peerUser = await peerUserResp.json() as { id?: string; email?: string };
    if (!peerUser?.id || !peerUser?.email) {
      return json(req, { error: 'Nao foi possivel identificar o usuario no ambiente de origem.' }, 401);
    }

    // Passo 2: confirma, no profile de ORIGEM, que a troca esta autorizada.
    // A leitura usa o proprio token de quem chamou (RLS de origem), nunca uma
    // service_role de fora - o profile de origem so' pode falar por si mesmo.
    const peerProfileResp = await fetchPeer(
      `${peerUrl}/rest/v1/profiles?id=eq.${peerUser.id}&select=email,full_name,role,active,can_switch_environment`,
      { apikey: safeAnonKey, Authorization: safeAuthHeader },
    );
    if (!peerProfileResp.ok) {
      const detail = await peerProfileResp.text().catch(() => '');
      return json(req, {
        error: `Falha ao validar permissao no ambiente de origem (HTTP ${peerProfileResp.status}`
          + `${detail ? ` - ${detail.slice(0, 200)}` : ''}).`,
      }, 401);
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
