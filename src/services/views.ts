import { supabase } from '@/lib/supabase/client';
import type { SavedView, SavedViewConfig, SavedViewScope } from '@/types/domain';

export async function listSavedViews(module: string): Promise<SavedView[]> {
  const { data, error } = await supabase
    .from('saved_views')
    .select('id,owner_id,module,name,scope,project_id,template_id,is_default,config')
    .eq('module', module)
    .order('scope')
    .order('name');
  if (error) throw error;
  return (data ?? []) as unknown as SavedView[];
}

export async function createSavedView(input: {
  module: string; name: string; scope: SavedViewScope; config: SavedViewConfig;
  ownerId?: string | null; projectId?: string | null; templateId?: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('saved_views')
    .insert({
      module: input.module,
      name: input.name,
      scope: input.scope,
      owner_id: input.scope === 'privada' ? input.ownerId ?? null : input.ownerId ?? null,
      project_id: input.projectId ?? null,
      template_id: input.templateId ?? null,
      config: input.config,
    })
    .select('id').single();
  if (error) throw error;
  return data.id as unknown as string;
}

export async function updateSavedView(id: string, config: SavedViewConfig, name?: string): Promise<void> {
  const { error } = await supabase
    .from('saved_views')
    .update(name ? { config, name } : { config })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteSavedView(id: string): Promise<void> {
  const { error } = await supabase.from('saved_views').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Preferencia de coluna persistida por (usuario, modulo, view). Sobrevive a
 * troca de dispositivo, diferente de localStorage.
 */
export async function getColumnPreference(
  profileId: string, module: string, viewKey = 'default',
): Promise<SavedViewConfig['columns'] | null> {
  const { data, error } = await supabase
    .from('column_preferences')
    .select('config')
    .eq('profile_id', profileId)
    .eq('module', module)
    .eq('view_key', viewKey)
    .maybeSingle();
  if (error) throw error;
  return (data?.config as unknown as SavedViewConfig['columns']) ?? null;
}

export async function saveColumnPreference(
  profileId: string, module: string, config: SavedViewConfig['columns'], viewKey = 'default',
): Promise<void> {
  const { error } = await supabase
    .from('column_preferences')
    .upsert(
      { profile_id: profileId, module, view_key: viewKey, config: config ?? {} },
      { onConflict: 'profile_id,module,view_key' },
    );
  if (error) throw error;
}
