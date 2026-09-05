import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useEnvironment } from '@/app/EnvironmentProvider';
import { useAuth } from '@/app/AuthProvider';

/**
 * Compara o ambiente selecionado na interface com o que o proprio banco declara
 * em public.app_environment.
 *
 * Protege contra a falha mais cara possivel nessa arquitetura: apontar as
 * variaveis de PRD para o projeto de QA (ou o inverso) e operar horas achando
 * que se esta em outro ambiente. Aqui o erro fica ruidoso em vez de silencioso.
 */
export function EnvironmentMismatchBanner() {
  const { environment } = useEnvironment();
  const { session } = useAuth();

  const { data } = useQuery({
    queryKey: ['app-environment', environment],
    enabled: Boolean(session),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from('app_environment')
        .select('environment')
        .maybeSingle();
      if (error) throw error;
      return (row?.environment as string | undefined) ?? null;
    },
  });

  // Sem a linha declarada (migration 0014 nao aplicada) nao ha o que comparar.
  if (!data || data === environment) return null;

  return (
    <div
      role="alert"
      className="border-b border-danger/40 bg-danger/10 px-4 py-2.5 text-sm text-danger"
    >
      <div className="mx-auto flex max-w-[1600px] items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          <b>Divergência de ambiente.</b> A interface está em <b>{environment}</b>, mas o banco
          conectado se declara como <b>{data}</b>. Não realize operações até corrigir as variáveis
          de conexão — há risco de gravar dados no ambiente errado.
        </p>
      </div>
    </div>
  );
}
