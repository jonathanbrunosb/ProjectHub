import { supabase } from '@/lib/supabase/client';
import type { CustomFieldDefinition, CustomFieldOption, CustomFieldValue, CustomFieldType } from '@/types/domain';

const DEF_COLUMNS =
  'id,scope,template_id,project_id,entity,key,label,description,field_type,required,' +
  'default_text,default_number,default_date,default_boolean,position,visible_roles,editable_roles,active';

/**
 * Campos aplicaveis a um projeto: globais + os do template usado + os do
 * proprio projeto. Ordem de exibicao segue `position`.
 */
export async function listApplicableDefinitions(
  entity: string, projectId?: string, templateId?: string | null,
): Promise<CustomFieldDefinition[]> {
  const { data, error } = await supabase
    .from('custom_field_definitions')
    .select(`${DEF_COLUMNS},options:custom_field_options(id,definition_id,value,label,color,position,active)`)
    .eq('entity', entity)
    .eq('active', true)
    .order('position');
  if (error) throw error;

  return ((data ?? []) as unknown as CustomFieldDefinition[]).filter((d) => {
    if (d.scope === 'global') return true;
    if (d.scope === 'template') return Boolean(templateId) && d.template_id === templateId;
    return Boolean(projectId) && d.project_id === projectId;
  });
}

export async function listAllDefinitions(): Promise<CustomFieldDefinition[]> {
  const { data, error } = await supabase
    .from('custom_field_definitions')
    .select(`${DEF_COLUMNS},options:custom_field_options(id,definition_id,value,label,color,position,active)`)
    .order('scope').order('position');
  if (error) throw error;
  return (data ?? []) as unknown as CustomFieldDefinition[];
}

export async function upsertDefinition(input: Partial<CustomFieldDefinition>): Promise<string> {
  const { options: _o, ...payload } = input;
  if (payload.id) {
    const { error } = await supabase.from('custom_field_definitions').update(payload).eq('id', payload.id);
    if (error) throw error;
    return payload.id;
  }
  const { data, error } = await supabase
    .from('custom_field_definitions').insert(payload).select('id').single();
  if (error) throw error;
  return data.id as unknown as string;
}

export async function deleteDefinition(id: string): Promise<void> {
  const { error } = await supabase.from('custom_field_definitions').delete().eq('id', id);
  if (error) throw error;
}

export async function replaceOptions(
  definitionId: string, options: Pick<CustomFieldOption, 'value' | 'label'>[],
): Promise<void> {
  const { error: delError } = await supabase
    .from('custom_field_options').delete().eq('definition_id', definitionId);
  if (delError) throw delError;
  if (options.length === 0) return;
  const { error } = await supabase.from('custom_field_options').insert(
    options.map((o, i) => ({ definition_id: definitionId, value: o.value, label: o.label, position: i + 1 })),
  );
  if (error) throw error;
}

export async function listValues(recordId: string): Promise<CustomFieldValue[]> {
  const { data, error } = await supabase
    .from('custom_field_values')
    .select('id,definition_id,project_id,entity,record_id,value_text,value_number,value_date,value_timestamp,value_boolean,value_uuid,value_json')
    .eq('record_id', recordId);
  if (error) throw error;
  return (data ?? []) as unknown as CustomFieldValue[];
}

/** Mapeia o valor da UI para a coluna tipada correspondente no banco. */
export function toTypedValue(type: CustomFieldType, raw: unknown): Partial<CustomFieldValue> {
  const base: Partial<CustomFieldValue> = {
    value_text: null, value_number: null, value_date: null, value_timestamp: null,
    value_boolean: null, value_uuid: null, value_json: null,
  };
  if (raw === '' || raw == null) return base;

  switch (type) {
    case 'numero': case 'moeda': case 'percentual':
      return { ...base, value_number: Number(raw) };
    case 'data':
      return { ...base, value_date: String(raw) };
    case 'data_hora':
      return { ...base, value_timestamp: new Date(String(raw)).toISOString() };
    case 'boolean':
      return { ...base, value_boolean: Boolean(raw) };
    case 'usuario': case 'equipe':
      return { ...base, value_uuid: String(raw) };
    case 'multipla_escolha':
      return { ...base, value_json: Array.isArray(raw) ? raw : [raw] };
    default:
      return { ...base, value_text: String(raw) };
  }
}

export function fromTypedValue(type: CustomFieldType, value: CustomFieldValue | undefined): unknown {
  // O valor default precisa casar com o controle usado na UI: checkbox espera
  // boolean e multipla escolha espera array, nao string vazia.
  if (!value) {
    if (type === 'boolean') return false;
    if (type === 'multipla_escolha') return [];
    return '';
  }
  switch (type) {
    case 'numero': case 'moeda': case 'percentual': return value.value_number ?? '';
    case 'data': return value.value_date ?? '';
    case 'data_hora': return value.value_timestamp ?? '';
    case 'boolean': return value.value_boolean ?? false;
    case 'usuario': case 'equipe': return value.value_uuid ?? '';
    case 'multipla_escolha': return (value.value_json as string[] | null) ?? [];
    default: return value.value_text ?? '';
  }
}

export async function saveValues(
  entity: string, recordId: string, projectId: string | null,
  values: { definitionId: string; type: CustomFieldType; raw: unknown }[],
): Promise<void> {
  if (values.length === 0) return;
  const payload = values.map((v) => ({
    definition_id: v.definitionId,
    project_id: projectId,
    entity,
    record_id: recordId,
    ...toTypedValue(v.type, v.raw),
  }));
  const { error } = await supabase
    .from('custom_field_values')
    .upsert(payload, { onConflict: 'definition_id,record_id' });
  if (error) throw error;
}
