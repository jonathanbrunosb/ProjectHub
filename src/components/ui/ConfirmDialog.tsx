import { useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';

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
        <div>{description}</div>
        {confirmText && (
          <div>
            <p className="mb-1.5 text-xs">
              Digite <span className="font-mono font-semibold text-fg">{confirmText}</span> para confirmar:
            </p>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </div>
        )}
      </div>
    </Modal>
  );
}
