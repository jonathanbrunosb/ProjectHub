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

/**
 * Descreve a chave de servico do proprio projeto SEM expo-la: so' o papel e o
 * `ref` declarados no payload (chave legada e' um JWT; a nova e' opaca). Serve
 * para diagnosticar de um lado do outro um "permission denied" - se o papel nao
 * for `service_role`, o problema e' a chave, nao os GRANTs do banco.
 */
function describeServiceKey(key: string): string {
  const partes = key.split('.');
  if (partes.length !== 3) return `formato nao-JWT (comeca com "${key.slice(0, 12)}...")`;
  try {
    const payload = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/'))) as
      { role?: string; ref?: string };
    return `role=${payload.role ?? '?'}, ref=${payload.ref ?? '?'}`;
  } catch {
    return 'JWT ilegivel';
  }
}

/**
 * Extrai o `sub` (id do usuario) do token de sessao, sem verificar assinatura -
 * a verificacao real acontece no ambiente de origem, que recusa token invalido.
 * Serve so' para montar a consulta sem uma viagem de rede extra.
 */
function subDoToken(authHeader: string): string {
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const partes = token.split('.');
  if (partes.length !== 3) return '';
  try {
    const payload = JSON.parse(atob(partes[1].replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string };
    return payload.sub ?? '';
  } catch {
    return '';
  }
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

/**
 * Mensagens voltadas a quem usa o sistema: dizem o que fazer, nunca por que
 * falhou por dentro. Todo detalhe tecnico vai para o log da funcao, onde serve
 * ao diagnostico sem virar ruido - e sem revelar nome de variavel, formato de
 * chave ou estrutura de tabela para o navegador.
 */
const MSG_SESSAO = 'Sua sessao expirou. Entre novamente para trocar de ambiente.';
const MSG_INDISPONIVEL = 'A troca automatica de ambiente esta indisponivel no momento. '
  + 'Voce pode entrar normalmente pela tela de login do outro ambiente.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return json(req, { error: 'Metodo nao suportado.' }, 405);

  try {
    const sourceAuthHeader = req.headers.get('Authorization');
    if (!sourceAuthHeader) return json(req, { error: MSG_SESSAO }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const rawPeerUrl = Deno.env.get('PEER_SUPABASE_URL');

    if (!supabaseUrl || !serviceRoleKey || !rawPeerUrl) {
      console.error('[env-switch-login] configuracao ausente: SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/PEER_SUPABASE_URL');
      return json(req, { error: MSG_INDISPONIVEL }, 500);
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
      console.error('[env-switch-login] chave do ambiente de origem ausente (corpo da chamada e PEER_SUPABASE_ANON_KEY vazios)');
      return json(req, { error: MSG_INDISPONIVEL }, 500);
    }

    let peerUrl: string;
    let safeAnonKey: string;
    let safeAuthHeader: string;
    try {
      peerUrl = normalizePeerUrl(rawPeerUrl);
      safeAnonKey = sanitizeApiKey('A chave do ambiente de origem', peerAnonKey);
      safeAuthHeader = sanitizeAuthHeader(sourceAuthHeader);
    } catch (e) {
      console.error('[env-switch-login] configuracao invalida:', e instanceof Error ? e.message : e);
      return json(req, { error: MSG_INDISPONIVEL }, 500);
    }

    // Passo 1: identifica quem esta' pedindo a troca.
    //
    // O `sub` sai do proprio token, sem ida a rede. Isso NAO e' confiar no
    // cliente: quem valida a assinatura e' o PostgREST do ambiente de origem no
    // passo 2 - um token forjado (ou com o `sub` trocado) e' recusado la', e a
    // funcao para. Ler o `sub` aqui so' evita uma viagem de rede inteira ate'
    // /auth/v1/user, que era o passo mais lento da troca.
    let userId = subDoToken(safeAuthHeader);
    if (!userId) {
      // Formato de token inesperado: cai no caminho antigo, que pergunta a' Auth.
      const resp = await fetchPeer(`${peerUrl}/auth/v1/user`, { apikey: safeAnonKey, Authorization: safeAuthHeader });
      if (!resp.ok) {
        return json(req, { error: MSG_SESSAO }, 401);
      }
      userId = ((await resp.json()) as { id?: string })?.id ?? '';
      if (!userId) return json(req, { error: MSG_SESSAO }, 401);
    }

    // Passo 2: valida token E permissao de uma vez.
    // A leitura usa o proprio token de quem chamou (RLS de origem), nunca uma
    // service_role de fora - o profile de origem so' pode falar por si mesmo.
    const peerProfileResp = await fetchPeer(
      `${peerUrl}/rest/v1/profiles?id=eq.${userId}&select=email,full_name,role,active,can_switch_environment`,
      { apikey: safeAnonKey, Authorization: safeAuthHeader },
    );
    if (!peerProfileResp.ok) {
      const detail = await peerProfileResp.text().catch(() => '');
      console.error('[env-switch-login] origem recusou a consulta de permissao:',
        peerProfileResp.status, detail.slice(0, 300));
      // 401 da origem = token invalido/expirado. Outros codigos sao falha de
      // configuracao, que a pessoa que esta' trocando de ambiente nao resolve.
      return json(req, {
        error: peerProfileResp.status === 401 ? MSG_SESSAO : MSG_INDISPONIVEL,
      }, peerProfileResp.status === 401 ? 401 : 500);
    }
    const [peerProfile] = await peerProfileResp.json() as PeerProfile[];
    if (!peerProfile) {
      return json(req, { error: 'Sua conta nao foi localizada no ambiente de origem.' }, 404);
    }
    if (!peerProfile.active || !peerProfile.can_switch_environment) {
      return json(req, { error: 'Esta conta nao tem permissao para alternar de ambiente.' }, 403);
    }

    // Unico ponto desta funcao com service_role - nunca sai do proprio projeto.
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Passos 3 e 4: conta espelhada neste ambiente + geracao do acesso.
    //
    // Sao independentes entre si, entao vao juntos - a consulta do perfil nao
    // precisa terminar para o acesso comecar a ser gerado, o que corta uma
    // viagem de rede inteira do tempo total da troca.
    //
    // A consulta passa pelo PostgREST e depende do GRANT de `service_role` na
    // tabela (foi exatamente a falta desse GRANT em QA, e nao em PRD, que
    // causou o "permission denied for table profiles" - ver migration 0019).
    // Se ela falhar, a ponte NAO cai: a autorizacao que importa (identidade e
    // can_switch_environment) ja' foi validada na origem, e a geracao do acesso
    // usa a Auth API, que nao passa por GRANT nenhum. Perde-se apenas o
    // acessorio: a checagem de conta inativa aqui e o espelhamento do papel na
    // criacao, que o Admin ajusta depois.
    const [perfilDestino, acesso] = await Promise.all([
      adminClient.from('profiles').select('id, active').eq('email', peerProfile.email).maybeSingle(),
      adminClient.auth.admin.generateLink({ type: 'magiclink', email: peerProfile.email }),
    ]);

    const { data: existingProfile, error: existingError } = perfilDestino;
    const { data: link, error: linkError } = acesso;

    if (existingProfile && !existingProfile.active) {
      return json(req, { error: 'Esta conta esta inativa neste ambiente.' }, 403);
    }

    if (linkError || !link?.properties?.hashed_token) {
      // Diagnostico tecnico vai para o log da funcao, nao para a tela de quem usa.
      console.error('[env-switch-login] falha ao gerar acesso:', linkError?.message,
        '| leitura do perfil:', existingError?.message ?? 'ok',
        '| chave de servico:', describeServiceKey(serviceRoleKey));
      return json(req, { error: 'Nao foi possivel concluir a troca de ambiente. Tente novamente.' }, 500);
    }

    // So' na primeira vez (conta acabou de ser criada pelo generateLink acima):
    // espelha papel e permissao de troca. Depois disso, o ambiente de destino
    // e' dono da propria configuracao - a ponte nunca mais sobrescreve.
    //
    // `existingError` significa que nao da' para saber se a conta ja' existia,
    // entao espelhar seria um palpite que pode sobrescrever configuracao feita
    // a mao no destino - melhor deixar como esta' e devolver o aviso.
    if (!existingProfile && !existingError) {
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

    if (existingError) {
      // O acesso foi liberado, mas o perfil deste ambiente nao pode ser lido nem
      // ajustado. Quem usa o sistema nao tem o que fazer com o motivo tecnico -
      // ele vai para o log da funcao; a tela recebe so' o que e' acionavel.
      console.warn('[env-switch-login] perfil do destino inacessivel:', existingError.message,
        '| chave de servico:', describeServiceKey(serviceRoleKey));
    }

    return json(req, {
      email: peerProfile.email,
      token: link.properties.hashed_token,
      // Ressalva de negocio, nao de infraestrutura: so' aparece quando ha' algo
      // que um Administrador precisa efetivamente conferir.
      warning: existingError
        ? 'O perfil de acesso neste ambiente pode precisar de ajuste em Configuracoes > Usuarios.'
        : undefined,
    }, 200);
  } catch (e) {
    console.error('[env-switch-login] erro nao tratado:', e instanceof Error ? e.stack ?? e.message : e);
    return json(req, { error: MSG_INDISPONIVEL }, 500);
  }
});
