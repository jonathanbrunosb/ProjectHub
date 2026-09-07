import { useCallback, useState } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { useEnvironment } from '@/app/EnvironmentProvider';
import { useToast } from '@/components/ui/Toast';
import { logAppEvent } from '@/lib/supabase/audit';
import { bridgeEnvironmentLogin } from '@/services/envBridge';
import type { Environment } from '@/lib/supabase/client';

/**
 * Une permissao (perfil) e estado (ambiente) para a troca controlada.
 *
 * A permissao aqui governa a experiencia: quem pode ver e usar o seletor.
 * A seguranca real vem de os ambientes serem projetos Supabase distintos -
 * sem conta e sessao validas no projeto de destino, nao ha acesso a dado
 * nenhum, independentemente do que a interface permita clicar. A ponte
 * (`bridgeEnvironmentLogin`) e' o que estabelece essa sessao automaticamente
 * para quem tem `can_switch_environment`; se ela falhar por qualquer motivo,
 * a troca segue mesmo assim e a pessoa cai no login/cadastro manual do
 * ambiente de destino - o "cenario reservo", nunca o caminho padrao.
 */
export function useEnvironmentSwitch() {
  const { profile, session } = useAuth();
  const { environment, available, switchEnvironment } = useEnvironment();
  const toast = useToast();
  const [switching, setSwitching] = useState(false);

  const canSwitch = Boolean(profile?.can_switch_environment) && available.length > 1;

  const requestSwitch = useCallback(async (target: Environment) => {
    if (target === environment) return;

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

    if (session?.access_token) {
      setSwitching(true);
      try {
        await bridgeEnvironmentLogin(environment, target, session.access_token);
      } catch (err) {
        // Ponte indisponivel (funcao nao implantada/configurada, conta
        // inativa no destino, etc.) - segue para o cenario reservo abaixo,
        // mas avisa o motivo em vez de falhar em silencio (sem isso, o
        // unico sintoma visivel era cair na tela de login sem explicacao).
        const message = err instanceof Error ? err.message : 'Motivo desconhecido.';
        toast.warning('Login automatico no outro ambiente falhou', message);
      } finally {
        setSwitching(false);
      }
    }

    switchEnvironment(target);
  }, [environment, profile?.can_switch_environment, session?.access_token, switchEnvironment, toast]);

  return { environment, available, canSwitch, requestSwitch, switching };
}
