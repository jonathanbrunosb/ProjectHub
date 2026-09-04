import { QueryClient } from '@tanstack/react-query';

/**
 * Cache conservador: dados de portfolio mudam com frequencia moderada e a
 * leitura executiva nao pode exibir numero desatualizado por muito tempo.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const code = (error as { code?: string })?.code;
        // Erro de permissao (RLS) nao se resolve com retry.
        if (code === '42501' || code === 'PGRST301') return false;
        return failureCount < 2;
      },
    },
    mutations: { retry: 0 },
  },
});
