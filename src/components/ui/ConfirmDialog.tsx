import { useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { useEnvironment } from '@/app/EnvironmentProvider';

/**
 * Confirmacao para acoes destrutivas. Quando `confirmText` e' informado, exige
 * que o usuario digite o valor - usado em exclusoes com impacto relevante.
 */
export function ConfirmDialog({
  open, onClose, onConfirm, title, description, confirmLabel = 'Confirmar',
  confirmText, danger = true, loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  confirmText?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  const { isPRD } = useEnvironment();
  const [typed, setTyped] = useState('');
  const blocked = Boolean(confirmText) && typed.trim() !== confirmText;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={blocked}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-muted">
        {/* Aviso restrito a acoes destrutivas em Producao: aplicar em toda
            operacao geraria fadiga e o alerta perderia o efeito. */}
        {isPRD && (
          <div className="flex gap-2.5 rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs text-warn">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Você está operando no ambiente de PRODUÇÃO.</p>
              <p className="mt-0.5 text-muted">Esta ação poderá alterar dados oficiais.</p>
            </div>
          </div>
        )}
        <div>{description}</div>
        {confirmText && (
          <div>
            <p className="mb-1.5 text-xs">
              Digite <span className="font-mono font-semibold text-fg">{confirmText}</span> para confirmar:
            </p>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus aria-label="Confirmacao" />
          </div>
        )}
      </div>
    </Modal>
  );
}
