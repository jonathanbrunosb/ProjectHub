import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ENVIRONMENTS, configuredEnvironments, getSupabaseClient, isEnvironmentConfigured,
  setActiveEnvironment, type Environment,
} from '@/lib/supabase/client';

const STORAGE_KEY = 'pmo_selected_environment';

interface EnvironmentApi {
  environment: Environment;
  isQA: boolean;
  isPRD: boolean;
  /** Ambientes com URL e chave anon configuradas no build. */
  available: Environment[];
  configured: boolean;
  /** Troca o ambiente. A permissao e' validada por quem chama (useEnvironmentSwitch). */
  switchEnvironment: (next: Environment) => void;
}

const EnvironmentContext = createContext<EnvironmentApi | null>(null);

function isEnvironment(value: unknown): value is Environment {
  return value === 'QA' || value === 'PRD';
}

/**
 * Resolve o ambiente inicial: querystring > preferencia salva > primeiro
 * configurado. Nao ha risco de bypass de autorizacao por URL: escolher o
 * ambiente apenas decide com qual projeto Supabase falar, e cada projeto tem
 * Auth e RLS proprios - sem conta naquele projeto, nao ha acesso a dado algum.
 */
function resolveInitialEnvironment(): Environment {
  const fallback = configuredEnvironments()[0] ?? 'QA';

  if (typeof window !== 'undefined') {
    // HashRouter mantem a query depois do '#', entao os dois lugares valem.
    const search = window.location.search + window.location.hash.replace(/^#[^?]*/, '');
    const requested = new URLSearchParams(search.replace(/^[?#]/, '')).get('env')?.toUpperCase();
    if (isEnvironment(requested) && isEnvironmentConfigured(requested)) return requested;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isEnvironment(saved) && isEnvironmentConfigured(saved)) return saved;
    } catch {
      // storage indisponivel - segue para o fallback
    }
  }

  return fallback;
}

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [environment, setEnvironment] = useState<Environment>(() => {
    const initial = resolveInitialEnvironment();
    setActiveEnvironment(initial);
    return initial;
  });

  useEffect(() => {
    setActiveEnvironment(environment);
    try {
      localStorage.setItem(STORAGE_KEY, environment);
    } catch {
      // storage indisponivel - a preferencia apenas nao persiste
    }
  }, [environment]);

  const switchEnvironment = useCallback((next: Environment) => {
    if (next === environment || !isEnvironmentConfigured(next)) return;

    // Ordem importa: derruba o que pertence ao ambiente antigo ANTES de
    // apontar para o novo, para nenhum dado atravessar a fronteira.
    try {
      void getSupabaseClient(environment).removeAllChannels();
    } catch {
      // sem canais Realtime ativos - nada a cancelar
    }

    queryClient.cancelQueries();
    queryClient.clear();

    setActiveEnvironment(next);
    setEnvironment(next);
  }, [environment, queryClient]);

  const api = useMemo<EnvironmentApi>(() => ({
    environment,
    isQA: environment === 'QA',
    isPRD: environment === 'PRD',
    available: ENVIRONMENTS.filter(isEnvironmentConfigured),
    configured: isEnvironmentConfigured(environment),
    switchEnvironment,
  }), [environment, switchEnvironment]);

  return <EnvironmentContext.Provider value={api}>{children}</EnvironmentContext.Provider>;
}

export function useEnvironment(): EnvironmentApi {
  const ctx = useContext(EnvironmentContext);
  if (!ctx) throw new Error('useEnvironment precisa estar dentro de <EnvironmentProvider>');
  return ctx;
}
