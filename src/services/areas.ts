import { supabase } from '@/lib/supabase/client';
import type { Area, BusinessUnit, UserAreaAssignment } from '@/types/domain';

const BUSINESS_UNIT_COLUMNS = 'id,company_id,code,name,active';

export async function listBusinessUnits(): Promise<BusinessUnit[]> {
  const { data, error } = await supabase
    .from('business_units').select(BUSINESS_UNIT_COLUMNS).order('name');
  if (error) throw error;
  return (data ?? []) as unknown as BusinessUnit[];
}

export async function createBusinessUnit(input: { company_id: string; code: string; name: string }): Promise<string> {
  const { data, error } = await supabase.from('business_units').insert(input).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function updateBusinessUnit(
  id: string,
  patch: Partial<{ company_id: string; code: string; name: string }>,
): Promise<void> {
  const { error } = await supabase.from('business_units').update(patch).eq('id', id);
  if (error) throw error;
}

export async function setBusinessUnitActive(id: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('business_units').update({ active }).eq('id', id);
  if (error) throw error;
}

const AREA_COLUMNS =
  'id,business_unit_id,code,name,description,manager_user_id,is_active,max_allocation_pct,created_at,created_by,updated_at,updated_by';

export interface AreaWithRelations extends Area {
  business_unit: { id: string; name: string; code: string } | null;
  manager: { id: string; full_name: string } | null;
}

export async function listAreas(): Promise<AreaWithRelations[]> {
  const { data, error } = await supabase
    .from('areas')
    .select(`${AREA_COLUMNS},business_unit:business_units(id,name,code),manager:profiles(id,full_name)`)
    .order('name');
  if (error) throw error;
  return (data ?? []) as unknown as AreaWithRelations[];
}

export interface AreaInput {
  business_unit_id: string;
  code: string;
  name: string;
  description: string | null;
  manager_user_id: string | null;
  max_allocation_pct?: number;
}

export async function createArea(input: AreaInput): Promise<string> {
  const { data, error } = await supabase.from('areas').insert(input).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function updateArea(id: string, patch: Partial<AreaInput>): Promise<void> {
  const { error } = await supabase.from('areas').update(patch).eq('id', id);
  if (error) throw error;
}

export async function setAreaActive(id: string, is_active: boolean): Promise<void> {
  const { error } = await supabase.from('areas').update({ is_active }).eq('id', id);
  if (error) throw error;
}

/**
 * Abre um novo vinculo primario de area para a pessoa. O gatilho no banco
 * fecha automaticamente o vinculo anterior (valid_to) e sincroniza
 * profiles.area_id - nunca escrever profiles.area_id diretamente por fora
 * desta funcao, ou o historico fica inconsistente com o ponteiro atual.
 */
export async function assignPrimaryArea(userId: string, areaId: string, validFrom?: string): Promise<void> {
  const { error } = await supabase.from('user_area_assignments').insert({
    user_id: userId,
    area_id: areaId,
    is_primary: true,
    ...(validFrom ? { valid_from: validFrom } : {}),
  });
  if (error) throw error;
}

const ASSIGNMENT_COLUMNS = 'id,user_id,area_id,valid_from,valid_to,is_primary,created_at,created_by';

export async function listUserAreaHistory(userId: string): Promise<UserAreaAssignment[]> {
  const { data, error } = await supabase
    .from('user_area_assignments')
    .select(ASSIGNMENT_COLUMNS)
    .eq('user_id', userId)
    .order('valid_from', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as UserAreaAssignment[];
}
