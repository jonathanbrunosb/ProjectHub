import type { ReactElement, ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EnvironmentProvider } from '@/app/EnvironmentProvider';
import { ToastProvider } from '@/components/ui/Toast';

/**
 * Renderiza com os providers que a aplicacao real fornece. Componentes que
 * dependem de ambiente (QA/PRD), de cache de query ou de toast precisam deles
 * montados, senao o teste falha por contexto ausente em vez de por
 * comportamento. A ordem espelha a de `main.tsx`.
 */
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <EnvironmentProvider>
          <ToastProvider>{children}</ToastProvider>
        </EnvironmentProvider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...options });
}
