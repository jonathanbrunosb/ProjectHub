import { environmentAnonKey, getSupabaseClient, type Environment } from '@/lib/supabase/client';

/**
 * FunctionsHttpError carrega a resposta JSON da propria funcao no `context` -
 * sem extrair isso, so' sobra a mensagem generica do SDK ("Edge Function
 * returned a non-2xx status code"), que esconde o motivo real (sem permissao,
 * sessao invalida, segredo PEER_* ausente etc.) e' impossivel diagnosticar.
 */
async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  const fallback = (error as { message?: string })?.message ?? 'Motivo desconhecido.';
  const context = (error as { context?: Response })?.context;
  if (!context) return fallback;
  try {
    const body = await context.clone().json();
    return typeof body?.error === 'string' ? body.error : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Ponte de login entre QA e PRD (Edge Function `env-switch-login`, implantada
 * nos dois projetos). Usa o token de sessao do ambiente de ORIGEM para provar
 * identidade perante o ambiente de DESTINO, que devolve um magic-link ja'
 * validado (nunca enviado por e-mail) para trocar por uma sessao real ali.
 *
 * A chave anon do ambiente de ORIGEM vai no corpo da chamada porque ela ja'
 * chega correta aqui pelo build, enquanto cola-la a mao como segredo da funcao
 * se mostrou fragil (JWT longo copiado entre janelas chega com caractere
 * invisivel e derruba a ponte). Nao afrouxa nada: e' chave publica, e quem
 * ancora a confianca do lado do servidor e' PEER_SUPABASE_URL, que continua
 * sendo segredo da funcao - a validacao do token so' acontece contra ela.
 *
 * Se falhar por qualquer motivo (funcao nao implantada/configurada ainda,
 * conta sem permissao, ambiente de destino fora do ar), quem chama deve cair
 * no fluxo manual de login/cadastro - esse e' o "cenario reservo", nunca o
 * caminho padrao.
 */
export async function bridgeEnvironmentLogin(
  source: Environment, target: Environment, sourceAccessToken: string,
): Promise<void> {
  const targetClient = getSupabaseClient(target);

  const { data, error } = await targetClient.functions.invoke<{ email: string; token: string }>(
    'env-switch-login',
    {
      headers: { Authorization: `Bearer ${sourceAccessToken}` },
      body: { peer_anon_key: environmentAnonKey(source) },
    },
  );
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  if (!data?.email || !data?.token) {
    throw new Error('A ponte de ambiente nao retornou credenciais validas.');
  }

  const { error: verifyError } = await targetClient.auth.verifyOtp({
    email: data.email,
    token_hash: data.token,
    type: 'email',
  });
  if (verifyError) throw verifyError;
}
