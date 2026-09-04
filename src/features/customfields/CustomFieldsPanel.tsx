import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/Feedback';
import { useToast } from '@/components/ui/Toast';
import { describeError } from '@/lib/supabase/client';
import {
  fromTypedValue, listApplicableDefinitions, listValues, saveValues,
} from '@/services/customFields';
import { listProfiles, listTeams } from '@/services/projects';
import { formatCurrency } from '@/utils/format';

/**
 * Renderiza os campos personalizados aplicaveis ao registro (globais + do
 * template + do proprio projeto) e persiste em colunas tipadas.
 */
export function CustomFieldsPanel({
  entity, recordId, projectId, templateId, canEdit,
}: {
  entity: 'project' | 'task' | 'risk' | 'action_plan';
  recordId: string;
  projectId: string | null;
  templateId: string | null;
  canEdit: boolean;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState(false);

  const definitions = useQuery({
    queryKey: ['custom-fields', 'defs', entity, projectId, templateId],
    queryFn: () => listApplicableDefinitions(entity, projectId ?? undefined, templateId),
  });

  const values = useQuery({
    queryKey: ['custom-fields', 'values', recordId],
    queryFn: () => listValues(recordId),
  });

  const profiles = useQuery({ queryKey: ['profiles'], queryFn: listProfiles });
  const teams = useQuery({ queryKey: ['teams'], queryFn: listTeams });

  const byDefinition = useMemo(() => {
    const map = new Map<string, ReturnType<typeof fromTypedValue>>();
    for (const def of definitions.data ?? []) {
      const value = (values.data ?? []).find((v) => v.definition_id === def.id);
      map.set(def.id, fromTypedValue(def.field_type, value));
    }
    return map;
  }, [definitions.data, values.data]);

  useEffect(() => {
    setDraft(Object.fromEntries(byDefinition));
    setDirty(false);
  }, [byDefinition]);

  const save = useMutation({
    mutationFn: () => saveValues(
      entity, recordId, projectId,
      (definitions.data ?? [])
        .filter((d) => d.field_type !== 'multipla_escolha' || Array.isArray(draft[d.id]))
        .map((d) => ({ definitionId: d.id, type: d.field_type, raw: draft[d.id] })),
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields', 'values', recordId] });
      setDirty(false);
      toast.success('Campos personalizados salvos');
    },
    onError: (e) => toast.error('Nao foi possivel salvar', describeError(e)),
  });

  const set = (id: string, value: unknown) => {
    setDraft((d) => ({ ...d, [id]: value }));
    setDirty(true);
  };

  const defs = definitions.data ?? [];
  if (definitions.isLoading) return null;
  if (defs.length === 0) {
    return (
      <EmptyState
        title="Nenhum campo personalizado aplicavel"
        description="Campos globais, do template ou do projeto aparecem aqui. Configure em Configuracoes > Campos personalizados."
      />
    );
  }

  return (
    <div>
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
        {defs.map((def) => {
          const value = draft[def.id];
          const common = { required: def.required, label: def.label, hint: def.description ?? undefined };
          switch (def.field_type) {
            case 'texto_longo':
              return (
                <Field key={def.id} {...common} className="sm:col-span-2">
                  <Textarea value={String(value ?? '')} onChange={(e) => set(def.id, e.target.value)} />
                </Field>
              );
            case 'numero': case 'percentual':
              return (
                <Field key={def.id} {...common}>
                  <Input type="number" value={String(value ?? '')} onChange={(e) => set(def.id, e.target.value)} />
                </Field>
              );
            case 'moeda':
              return (
                <Field key={def.id} {...common} hint={value ? formatCurrency(Number(value)) : common.hint}>
                  <Input type="number" step="0.01" value={String(value ?? '')} onChange={(e) => set(def.id, e.target.value)} />
                </Field>
              );
            case 'data':
              return (
                <Field key={def.id} {...common}>
                  <Input type="date" value={String(value ?? '')} onChange={(e) => set(def.id, e.target.value)} />
                </Field>
              );
            case 'data_hora':
              return (
                <Field key={def.id} {...common}>
                  <Input type="datetime-local" value={String(value ?? '').slice(0, 16)} onChange={(e) => set(def.id, e.target.value)} />
                </Field>
              );
            case 'boolean':
              return (
                <Field key={def.id} {...common}>
                  <label className="flex h-9 items-center gap-2 text-sm">
                    <input type="checkbox" className="accent-[rgb(var(--c-brand))]"
                      checked={Boolean(value)} onChange={(e) => set(def.id, e.target.checked)} />
                    Sim
                  </label>
                </Field>
              );
            case 'lista_unica': case 'status':
              return (
                <Field key={def.id} {...common}>
                  <Select value={String(value ?? '')} onChange={(e) => set(def.id, e.target.value)}>
                    <option value="">Selecione...</option>
                    {(def.options ?? []).filter((o) => o.active).map((o) => (
                      <option key={o.id} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </Field>
              );
            case 'multipla_escolha':
              return (
                <Field key={def.id} {...common} className="sm:col-span-2">
                  <div className="flex flex-wrap gap-3 rounded-lg border border-border p-2.5">
                    {(def.options ?? []).filter((o) => o.active).map((o) => {
                      const list = Array.isArray(value) ? (value as string[]) : [];
                      return (
                        <label key={o.id} className="flex items-center gap-1.5 text-sm">
                          <input
                            type="checkbox"
                            className="accent-[rgb(var(--c-brand))]"
                            checked={list.includes(o.value)}
                            onChange={(e) => set(def.id, e.target.checked
                              ? [...list, o.value]
                              : list.filter((v) => v !== o.value))}
                          />
                          {o.label}
                        </label>
                      );
                    })}
                  </div>
                </Field>
              );
            case 'usuario':
              return (
                <Field key={def.id} {...common}>
                  <Select value={String(value ?? '')} onChange={(e) => set(def.id, e.target.value)}>
                    <option value="">Selecione...</option>
                    {(profiles.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </Select>
                </Field>
              );
            case 'equipe':
              return (
                <Field key={def.id} {...common}>
                  <Select value={String(value ?? '')} onChange={(e) => set(def.id, e.target.value)}>
                    <option value="">Selecione...</option>
                    {(teams.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                </Field>
              );
            case 'url':
              return (
                <Field key={def.id} {...common}>
                  <Input type="url" value={String(value ?? '')} onChange={(e) => set(def.id, e.target.value)} placeholder="https://..." />
                </Field>
              );
            default:
              return (
                <Field key={def.id} {...common}>
                  <Input value={String(value ?? '')} onChange={(e) => set(def.id, e.target.value)} />
                </Field>
              );
          }
        })}
      </fieldset>

      {canEdit && (
        <div className="mt-4 flex justify-end">
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
            Salvar campos personalizados
          </Button>
        </div>
      )}
    </div>
  );
}
