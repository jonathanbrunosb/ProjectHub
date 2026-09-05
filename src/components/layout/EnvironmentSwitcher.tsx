import { Lock } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Tooltip } from '@/components/ui/Tooltip';
import { EnvironmentBadge } from '@/components/ui/EnvironmentBadge';
import { useEnvironmentSwitch } from '@/hooks/useEnvironmentSwitch';
import { ENVIRONMENTS, isEnvironmentConfigured, environmentShortLabel } from '@/lib/supabase/client';

/**
 * Seletor de ambiente no topo do menu lateral, acima de "Gestao".
 * Quem nao pode alternar continua vendo o ambiente em que esta - a informacao
 * nunca e' escondida, apenas a acao de trocar.
 */
export function EnvironmentSwitcher({ collapsed }: { collapsed: boolean }) {
  const { environment, canSwitch, requestSwitch } = useEnvironmentSwitch();

  if (collapsed) {
    return (
      <div className="flex justify-center border-b border-white/10 px-2 py-3">
        <EnvironmentBadge compact />
      </div>
    );
  }

  return (
    <div className="border-b border-white/10 px-3 py-3">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-nav-muted">
        Ambiente de dados
      </p>

      {canSwitch ? (
        <div role="group" aria-label="Selecionar ambiente" className="flex rounded-lg bg-black/25 p-0.5">
          {ENVIRONMENTS.map((env) => {
            const active = env === environment;
            const configured = isEnvironmentConfigured(env);
            const button = (
              <button
                key={env}
                type="button"
                disabled={!configured}
                aria-pressed={active}
                onClick={() => requestSwitch(env)}
                className={cn(
                  'flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors focus-ring',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                  active
                    ? env === 'QA'
                      ? 'bg-warn text-slate-900'
                      : 'bg-brand text-brand-fg'
                    : 'text-nav-muted hover:text-white',
                )}
              >
                {env}
              </button>
            );

            return configured ? button : (
              <Tooltip key={env} content={`${env} ainda nao configurado neste build.`} className="flex-1">
                {button}
              </Tooltip>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-black/25 px-2.5 py-1.5">
          <EnvironmentBadge compact />
          <Tooltip content="Somente perfis autorizados alternam de ambiente.">
            <Lock className="h-3 w-3 text-nav-muted" aria-hidden />
          </Tooltip>
        </div>
      )}

      <p className="mt-1.5 text-[10px] leading-snug text-nav-muted">
        {environmentShortLabel[environment]}
      </p>
    </div>
  );
}
