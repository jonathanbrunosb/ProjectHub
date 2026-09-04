import { useState } from 'react';
import { Bookmark, ChevronDown, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from './Button';
import { Popover, PopoverItem } from './Popover';
import { Modal } from './Modal';
import { Field, Input, Select } from './Input';
import { useAuth } from '@/app/AuthProvider';
import type { SavedView, SavedViewScope } from '@/types/domain';

interface Props {
  views: SavedView[];
  activeView: SavedView | null;
  onApply: (view: SavedView | null) => void;
  onSave: (name: string, scope: SavedViewScope) => void;
  onUpdate: (id: string) => void;
  onDelete: (id: string) => void;
}

const scopeLabel: Record<SavedViewScope, string> = {
  privada: 'Minha visualizacao',
  compartilhada: 'Compartilhada',
  padrao_projeto: 'Padrao do projeto',
  padrao_template: 'Padrao do template',
};

export function SavedViewsBar({ views, activeView, onApply, onSave, onUpdate, onDelete }: Props) {
  const { can, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<SavedViewScope>('privada');

  const grouped = views.reduce<Record<string, SavedView[]>>((acc, v) => {
    (acc[v.scope] ??= []).push(v);
    return acc;
  }, {});

  return (
    <>
      <Popover
        trigger={({ toggle }) => (
          <Button variant="secondary" onClick={toggle} icon={<Bookmark className="h-4 w-4" />}>
            {activeView ? activeView.name : 'Visualizacoes'}
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        )}
        align="start"
        contentClassName="w-64 max-h-80 overflow-y-auto"
      >
        {(close) => (
          <>
            <PopoverItem onClick={() => { onApply(null); close(); }}>Padrao (sem filtro)</PopoverItem>
            {Object.entries(grouped).map(([key, items]) => (
              <div key={key} className="mt-1 border-t border-border pt-1">
                <p className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {scopeLabel[key as SavedViewScope]}
                </p>
                {items.map((v) => (
                  <div key={v.id} className="group flex items-center">
                    <button
                      onClick={() => { onApply(v); close(); }}
                      className="flex-1 truncate rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-surface-2"
                    >
                      {v.name}
                    </button>
                    {(v.owner_id === profile?.id || can('portfolio.manage')) && (
                      <button
                        onClick={() => onDelete(v.id)}
                        className="rounded p-1 text-muted opacity-0 hover:text-danger group-hover:opacity-100"
                        aria-label={`Excluir ${v.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <div className="mt-1 border-t border-border pt-1">
              {activeView && (
                <PopoverItem onClick={() => { onUpdate(activeView.id); close(); }}>
                  <Save className="h-3.5 w-3.5" /> Atualizar &quot;{activeView.name}&quot;
                </PopoverItem>
              )}
              <PopoverItem onClick={() => { setOpen(true); close(); }}>
                <Plus className="h-3.5 w-3.5" /> Salvar visualizacao atual
              </PopoverItem>
            </div>
          </>
        )}
      </Popover>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Salvar visualizacao"
        description="Guarda filtros, ordenacao, agrupamento e configuracao de colunas."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              disabled={!name.trim()}
              onClick={() => { onSave(name.trim(), scope); setName(''); setOpen(false); }}
            >
              Salvar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nome" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Projetos criticos" autoFocus />
          </Field>
          <Field label="Escopo" hint="Visualizacoes compartilhadas ficam disponiveis para toda a equipe.">
            <Select value={scope} onChange={(e) => setScope(e.target.value as SavedViewScope)}>
              <option value="privada">Minha visualizacao</option>
              {can('portfolio.manage') && <option value="compartilhada">Compartilhada</option>}
            </Select>
          </Field>
        </div>
      </Modal>
    </>
  );
}
