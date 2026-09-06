import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * QA e PRD sao projetos Supabase fisicamente separados: banco, Auth, Storage e
 * RLS independentes. A segregacao nao depende de nenhum filtro no frontend -
 * um registro de QA nao existe no banco de PRD, e vice-versa.
 *
 * A aplicacao usa exclusivamente a chave anon (publica). A service_role NUNCA
 * entra no bundle: operacoes privilegiadas ficam em Edge Functions.
 */
export type Environment = 'QA' | 'PRD';

export const ENVIRONMENTS: Environment[] = ['QA', 'PRD'];

export const environmentLabel: Record<Environment, string> = {
  QA: 'QA • Ambiente de Testes',
  PRD: 'PRD • Produção',
};

export const environmentShortLabel: Record<Environment, string> = {
  QA: 'Ambiente de Testes',
  PRD: 'Ambiente de Produção',
};

interface EnvironmentConfig {
  url?: string;
  anonKey?: string;
}

// O projeto atual continua atendido pelas variaveis originais: sem as chaves
// especificas de QA, ele e' o ambiente de QA. Isso mantem a aplicacao no ar
// durante a transicao, sem exigir reconfiguracao imediata.
//
// Usa "||", nao "??": quando o segredo VITE_SUPABASE_QA_URL nao existe no
// GitHub Actions, "${{ secrets.X }}" resolve para string vazia (nao omite a
// variavel), entao import.meta.env.VITE_SUPABASE_QA_URL chega como "" - um
// valor definido, so' que vazio. "??" so cai no fallback com null/undefined,
// entao nunca alcancaria VITE_SUPABASE_URL enquanto o secret QA existir vazio.
const config: Record<Environment, EnvironmentConfig> = {
  QA: {
    url: import.meta.env.VITE_SUPABASE_QA_URL || import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_QA_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
  },
  PRD: {
    url: import.meta.env.VITE_SUPABASE_PRD_URL,
    anonKey: import.meta.env.VITE_SUPABASE_PRD_ANON_KEY,
  },
};

export function isEnvironmentConfigured(environment: Environment): boolean {
  const { url, anonKey } = config[environment];
  return Boolean(url && anonKey);
}

export function configuredEnvironments(): Environment[] {
  return ENVIRONMENTS.filter(isEnvironmentConfigured);
}

/**
 * Ambiente assumido quando nao ha preferencia salva (primeiro acesso, ou
 * localStorage limpo por troca de navegador/dispositivo/"limpar dados do
 * site"). PRD vem primeiro porque este e' o dominio corporativo de producao -
 * um localStorage vazio nao deve jogar o usuario silenciosamente para QA,
 * onde a conta de producao normalmente nao existe (login "invalido" sem
 * nenhum problema real de credencial).
 */
export function defaultEnvironment(): Environment {
  const configured = configuredEnvironments();
  return configured.includes('PRD') ? 'PRD' : (configured[0] ?? 'QA');
}

function createStub(environment: Environment): SupabaseClient {
  const message =
    `Ambiente ${environment} nao configurado. Defina VITE_SUPABASE_${environment}_URL `
    + `e VITE_SUPABASE_${environment}_ANON_KEY no build.`;
  return new Proxy({}, {
    get() {
      throw new Error(message);
    },
  }) as SupabaseClient;
}

// Sessoes precisam de chaves de armazenamento distintas: uma sessao de QA nunca
// pode ser lida como se fosse de PRD (o JWT de um projeto nao vale no outro).
const clients: Record<Environment, SupabaseClient> = {
  QA: isEnvironmentConfigured('QA')
    ? createClient(config.QA.url!, config.QA.anonKey!, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'pmo.auth.QA',
        },
      })
    : createStub('QA'),
  PRD: isEnvironmentConfigured('PRD')
    ? createClient(config.PRD.url!, config.PRD.anonKey!, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: 'pmo.auth.PRD',
        },
      })
    : createStub('PRD'),
};

let activeEnvironment: Environment = defaultEnvironment();

export function getSupabaseClient(environment: Environment): SupabaseClient {
  return clients[environment];
}

export function getActiveEnvironment(): Environment {
  return activeEnvironment;
}

/**
 * Troca o client ativo. Chamado apenas pelo EnvironmentProvider - o resto da
 * aplicacao consome o proxy `supabase` e nunca guarda referencia direta a um
 * client, o que impede reaproveitar o client anterior apos a troca.
 */
export function setActiveEnvironment(environment: Environment): void {
  activeEnvironment = environment;
}

/**
 * Proxy que resolve o client do ambiente ativo a cada acesso. Mantem toda a
 * aplicacao existente funcionando sem alteracao e garante que nenhum modulo
 * segure uma referencia obsoleta depois de uma troca de ambiente.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = clients[activeEnvironment];
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
  has(_target, prop) {
    return Reflect.has(clients[activeEnvironment] as object, prop);
  },
});

/** Erro do PostgREST normalizado para mensagem legivel ao usuario. */
export function describeError(error: unknown): string {
  if (!error) return 'Erro desconhecido.';
  const e = error as { message?: string; code?: string; details?: string; hint?: string };
  if (e.code === '42501' || e.message?.includes('row-level security')) {
    return 'Voce nao tem permissao para esta operacao.';
  }
  if (e.code === '23505') return 'Ja existe um registro com esse identificador.';
  if (e.code === '23503') return 'Registro referenciado nao existe ou esta em uso.';
  if (e.code === '23514') return e.message ?? 'Valor invalido para a regra de negocio.';
  return e.message ?? String(error);
}
