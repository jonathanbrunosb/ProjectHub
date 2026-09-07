import { useCallback, useState } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { useEnvironment } from '@/app/EnvironmentProvider';
import { useToast } from '@/components/ui/Toast';
import { logAppEvent } from '@/lib/supabase/audit';
import { bridgeEnvironmentLogin } from '@/services/envBridge';
import { environmentShortLabel, type Environment } from '@/lib/supabase/client';

/**
 * Une permissao (perfil) e estado (ambiente) para a troca controlada.
 *
 * A permissao aqui governa a experiencia: quem pode ver e usar o seletor.
 * A seguranca real vem de os ambientes serem projetos Supabase distintos -
 * sem conta e sessao validas no projeto de destino, nao ha acesso a dado
 * nenhum, independentemente do que a interface permita clicar. A ponte
 * (`bridgeEnvironmentLogin`) e' o que estabelece essa sessao automaticamente
 * para quem tem `can_switch_environment`; se ela falhar, a troca segue mesmo
 * assim e a pessoa cai no login manual do ambiente de destino - caminho de
 * excecao, nunca o padrao.
 *
 * `switchingTo` existe para a interface poder dizer PARA ONDE esta indo
 * enquanto espera: a troca recarrega os dados da tela inteira, entao sem esse
 * retorno visivel a espera parece travamento.
 */
export function useEnvironmentSwitch() {
  const { profile, session } = useAuth();
  const { environment, available, switchEnvironment } = useEnvironment();
  const toast = useToast();
  const [switchingTo, setSwitchingTo] = useState<Environment | null>(null);

  const canSwitch = Boolean(profile?.can_switch_environment) && available.length > 1;

  const requestSwitch = useCallback(async (target: Environment) => {
    if (target === environment || switchingTo) return;

    if (!profile?.can_switch_environment) {
      // Auditado no ambiente de origem, o unico onde ha sessao valida.
      void logAppEvent('environment_switch_denied', 'environment', {
        data: { from_environment: environment, to_environment: target },
      });
      return;
    }

    void logAppEvent('environment_switch', 'environment', {
      data: { from_environment: environment, to_environment: target },
    });

    let ressalva: string | undefined;
    let precisouDeLoginManual = false;

    if (session?.access_token) {
      setSwitchingTo(target);
      try {
        ({ warning: ressalva } = await bridgeEnvironmentLogin(environment, target, session.access_token));
      } catch (err) {
        precisouDeLoginManual = true;
        // A mensagem ja vem pronta para leitura humana (a funcao mantem o
        // detalhe tecnico nos proprios logs). O console guarda o original para
        // quem estiver depurando, sem poluir a tela de quem so quer trabalhar.
        console.error('[troca de ambiente] ponte indisponivel:', err);
        toast.warning(
          'Entre novamente para continuar',
          err instanceof Error ? err.message : 'Nao foi possivel entrar automaticamente no outro ambiente.',
        );
      } finally {
        setSwitchingTo(null);
      }
    }

    switchEnvironment(target);

    if (!precisouDeLoginManual) {
      const destino = environmentShortLabel[target];
      if (ressalva) toast.warning(`Voce esta em ${destino}`, ressalva);
      else toast.success(`Voce esta em ${destino}`);
    }
  }, [environment, profile?.can_switch_environment, session?.access_token, switchEnvironment, switchingTo, toast]);

  return {
    environment,
    available,
    canSwitch,
    requestSwitch,
    switchingTo,
    switching: switchingTo !== null,
  };
}
