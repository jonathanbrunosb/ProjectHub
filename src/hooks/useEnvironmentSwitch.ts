import { useCallback } from 'react';
import { useAuth } from '@/app/AuthProvider';
import { useEnvironment } from '@/app/EnvironmentProvider';
import { logAppEvent } from '@/lib/supabase/audit';
import type { Environment } from '@/lib/supabase/client';

/**
 * Une permissao (perfil) e estado (ambiente) para a troca controlada.
 *
 * A permissao aqui governa a experiencia: quem pode ver e usar o seletor.
 * A seguranca real vem de os ambientes serem projetos Supabase distintos -
 * sem conta e sessao validas no projeto de destino, nao ha acesso a dado
 * nenhum, independentemente do que a interface permita clicar.
 */
export function useEnvironmentSwitch() {
  const { profile } = useAuth();
  const { environment, available, switchEnvironment } = useEnvironment();

  const canSwitch = Boolean(profile?.can_switch_environment) && available.length > 1;

  const requestSwitch = useCallback((target: Environment) => {
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

    switchEnvironment(target);
  }, [environment, profile?.can_switch_environment, switchEnvironment]);

  return { environment, available, canSwitch, requestSwitch };
}
