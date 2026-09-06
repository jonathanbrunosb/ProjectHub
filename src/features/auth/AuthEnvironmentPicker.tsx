import { FlaskConical, ShieldCheck } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useEnvironment } from '@/app/EnvironmentProvider';
import { ENVIRONMENTS, environmentShortLabel, type Environment } from '@/lib/supabase/client';

const icon: Record<Environment, typeof FlaskConical> = { QA: FlaskConical, PRD: ShieldCheck };

/**
 * Antes do login nao ha perfil (nem `can_switch_environment` a checar) - por
 * isso, ao contrario do seletor do menu lateral, este nao restringe a troca.
 * Isso e' seguro: QA e PRD sao projetos Supabase fisicamente separados, cada
 * um com Auth e RLS proprios, entao decidir qual usar aqui nunca contorna
 * autorizacao alguma - so evita o caso real que motivou este componente: um
 * localStorage limpo faz a tela cair silenciosamente em QA e o login em PRD
 * "falha" (conta que so existe em PRD, sem nenhum problema de credencial).
 */
export function AuthEnvironmentPicker() {
  const { environment, available, switchEnvironment } = useEnvironment();

  if (available.length < 2) return null;

  return (
    <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2">
      <p className="text-xs text-muted">Ambiente de dados</p>
      <div role="group" aria-label="Selecionar ambiente" className="flex rounded-md bg-bg p-0.5">
        {ENVIRONMENTS.map((env) => {
          const active = env === environment;
          const Icon = icon[env];
          return (
            <button
              key={env}
              type="button"
              aria-pressed={active}
              onClick={() => switchEnvironment(env)}
              className={cn(
                'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-colors focus-ring',
                active
                  ? env === 'QA' ? 'bg-warn text-slate-900' : 'bg-brand text-brand-fg'
                  : 'text-muted hover:text-fg',
              )}
            >
              <Icon className="h-3 w-3" aria-hidden />
              {environmentShortLabel[env]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
