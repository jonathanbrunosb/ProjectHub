import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { environmentShortLabel, type Environment } from '@/lib/supabase/client';

const icone: Record<Environment, string> = { QA: '/env-icon-qa.png', PRD: '/env-icon-prd.png' };

/**
 * Cobre a tela enquanto a troca de ambiente acontece.
 *
 * A troca autentica em outro projeto e recarrega os dados de toda a aplicacao -
 * sao alguns segundos em que a tela antiga continuaria visivel e clicavel,
 * mostrando dados do ambiente que esta sendo abandonado. Alem de parecer
 * travamento, isso e' arriscado: alguem poderia agir sobre dados de Producao
 * acreditando ja estar em QA (ou o contrario). O overlay bloqueia a interacao e
 * diz para onde esta indo, ate a nova sessao estar pronta.
 */
export function EnvironmentSwitchOverlay({ target }: { target: Environment | null }) {
  if (!target) return null;

  return createPortal(
    <div
      role="status"
      aria-live="assertive"
      aria-label={`Entrando em ${environmentShortLabel[target]}`}
      className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/70 backdrop-blur-sm"
    >
      <div className="mx-6 w-full max-w-sm rounded-2xl border border-border bg-surface px-8 py-9 text-center shadow-pop">
        <img src={icone[target]} alt="" aria-hidden className="mx-auto h-24 w-24 object-contain" />

        <p className="mt-5 text-xs uppercase tracking-wider text-muted">Entrando em</p>
        <p className="mt-0.5 text-lg font-semibold leading-tight text-fg">{environmentShortLabel[target]}</p>
        <span
          className={
            target === 'QA'
              ? 'mt-2 inline-block rounded-md bg-warn/12 px-2 py-0.5 text-[11px] font-semibold text-warn ring-1 ring-inset ring-warn/30'
              : 'mt-2 inline-block rounded-md bg-brand/12 px-2 py-0.5 text-[11px] font-semibold text-brand ring-1 ring-inset ring-brand/30'
          }
        >
          {target}
        </span>

        <div className="mt-6 flex items-center justify-center gap-2 border-t border-border pt-4 text-xs text-muted">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
          <span>Autenticando neste ambiente...</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
