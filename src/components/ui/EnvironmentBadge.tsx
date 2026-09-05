import { FlaskConical, ShieldCheck } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Tooltip } from './Tooltip';
import { useEnvironment } from '@/app/EnvironmentProvider';
import { environmentLabel, environmentShortLabel, type Environment } from '@/lib/supabase/client';

/**
 * Ambar para QA, azul corporativo para PRD. Vermelho fica reservado a erro e
 * criticidade - usar vermelho em Producao competiria com essa semantica.
 */
const tone: Record<Environment, string> = {
  QA: 'bg-warn/12 text-warn ring-warn/30',
  PRD: 'bg-brand/12 text-brand ring-brand/30',
};

const icon: Record<Environment, typeof FlaskConical> = {
  QA: FlaskConical,
  PRD: ShieldCheck,
};

/**
 * Identificacao permanente do ambiente ativo. `compact` mostra apenas a sigla,
 * para o menu recolhido e telas pequenas - a informacao nunca some por completo.
 */
export function EnvironmentBadge({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { environment } = useEnvironment();
  const Icon = icon[environment];

  return (
    <Tooltip content={environmentShortLabel[environment]}>
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md font-semibold ring-1 ring-inset whitespace-nowrap',
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
          tone[environment],
          className,
        )}
      >
        <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} aria-hidden />
        {compact ? environment : environmentLabel[environment]}
      </span>
    </Tooltip>
  );
}
