import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DASHBOARD_WIDGETS } from '@/services/dashboardLayout';

interface Props {
  open: boolean;
  onClose: () => void;
  order: string[];
  hidden: string[];
  onSave: (order: string[], hidden: string[]) => void;
  onReset: () => void;
  saving?: boolean;
}

const labelById = new Map(DASHBOARD_WIDGETS.map((w) => [w.id, w.label]));

export function DashboardCustomizeModal({ open, onClose, order, hidden, onSave, onReset, saving }: Props) {
  const [localOrder, setLocalOrder] = useState(order);
  const [localHidden, setLocalHidden] = useState(new Set(hidden));

  useEffect(() => {
    if (open) {
      setLocalOrder(order);
      setLocalHidden(new Set(hidden));
    }
  }, [open, order, hidden]);

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= localOrder.length) return;
    const next = [...localOrder];
    [next[index], next[target]] = [next[target], next[index]];
    setLocalOrder(next);
  }

  function toggle(id: string) {
    setLocalHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Personalizar dashboard"
      description="Mostre, oculte e reordene os blocos. A alteracao vale so para o seu usuario."
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onReset} icon={<RotateCcw className="h-3.5 w-3.5" />}>
            Restaurar padrao
          </Button>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => onSave(localOrder, [...localHidden])} loading={saving}>Salvar</Button>
        </>
      }
    >
      <ul className="divide-y divide-border">
        {localOrder.map((id, index) => {
          const isHidden = localHidden.has(id);
          return (
            <li key={id} className="flex items-center justify-between gap-2 py-2.5">
              <span className={isHidden ? 'text-sm text-muted line-through' : 'text-sm text-fg'}>
                {labelById.get(id) ?? id}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Mover para cima">
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" disabled={index === localOrder.length - 1} onClick={() => move(index, 1)} aria-label="Mover para baixo">
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => toggle(id)} aria-label={isHidden ? 'Mostrar' : 'Ocultar'}>
                  {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
