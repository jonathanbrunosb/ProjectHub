import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { emptyTableState, type DataTableState } from '@/components/ui/DataTable';
import { useAuth } from '@/app/AuthProvider';
import {
  createSavedView, deleteSavedView, getColumnPreference, listSavedViews,
  saveColumnPreference, updateSavedView,
} from '@/services/views';
import type { SavedView, SavedViewConfig, SavedViewScope } from '@/types/domain';

/**
 * Une tres camadas de personalizacao de tabela:
 *  1. estado local da sessao;
 *  2. preferencia de colunas do usuario (persistida por usuario+modulo+view);
 *  3. visualizacoes salvas (privada, compartilhada ou padrao do projeto).
 */
export function useTableState(module: string, defaults: Partial<DataTableState> = {}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<DataTableState>({ ...emptyTableState, ...defaults });
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const { data: views = [] } = useQuery({
    queryKey: ['saved-views', module],
    queryFn: () => listSavedViews(module),
    enabled: Boolean(profile?.id),
  });

  const { data: columnPref } = useQuery({
    queryKey: ['column-pref', module, profile?.id],
    queryFn: () => getColumnPreference(profile!.id, module),
    enabled: Boolean(profile?.id),
  });

  // Hidrata uma unica vez: preferencia do usuario tem precedencia sobre o default.
  useEffect(() => {
    if (hydrated || !profile?.id) return;
    if (columnPref) {
      setState((prev) => ({
        ...prev,
        visibility: columnPref.visible ?? prev.visibility,
        order: columnPref.order ?? prev.order,
        sizing: columnPref.sizes ?? prev.sizing,
        pinning: { left: columnPref.pinned ?? [], right: [] },
      }));
    }
    setHydrated(true);
  }, [columnPref, hydrated, profile?.id]);

  const persistColumns = useMutation({
    mutationFn: (next: DataTableState) =>
      saveColumnPreference(profile!.id, module, {
        visible: next.visibility,
        order: next.order,
        sizes: next.sizing,
        pinned: next.pinning.left ?? [],
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['column-pref', module] }),
  });

  const onStateChange = useCallback((next: DataTableState) => {
    setState(next);
    if (!profile?.id || !hydrated) return;
    persistColumns.mutate(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, hydrated]);

  const applyView = useCallback((view: SavedView | null) => {
    setActiveViewId(view?.id ?? null);
    if (!view) {
      setState({ ...emptyTableState, ...defaults });
      return;
    }
    const cfg = view.config ?? {};
    setState((prev) => ({
      ...prev,
      sorting: cfg.sort ?? [],
      grouping: cfg.grouping ?? [],
      search: cfg.search ?? '',
      visibility: cfg.columns?.visible ?? prev.visibility,
      order: cfg.columns?.order ?? prev.order,
      sizing: cfg.columns?.sizes ?? prev.sizing,
      pinning: { left: cfg.columns?.pinned ?? [], right: [] },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentConfig = useMemo<SavedViewConfig>(() => ({
    sort: state.sorting,
    grouping: state.grouping,
    search: state.search,
    columns: {
      visible: state.visibility,
      order: state.order,
      sizes: state.sizing,
      pinned: state.pinning.left ?? [],
    },
  }), [state]);

  const saveView = useMutation({
    mutationFn: async ({ name, scope, projectId }: { name: string; scope: SavedViewScope; projectId?: string }) =>
      createSavedView({
        module, name, scope, config: currentConfig,
        ownerId: profile?.id ?? null, projectId: projectId ?? null,
      }),
    onSuccess: (id) => {
      setActiveViewId(id);
      queryClient.invalidateQueries({ queryKey: ['saved-views', module] });
    },
  });

  const updateView = useMutation({
    mutationFn: (id: string) => updateSavedView(id, currentConfig),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-views', module] }),
  });

  const removeView = useMutation({
    mutationFn: (id: string) => deleteSavedView(id),
    onSuccess: () => {
      setActiveViewId(null);
      queryClient.invalidateQueries({ queryKey: ['saved-views', module] });
    },
  });

  const activeView = views.find((v) => v.id === activeViewId) ?? null;

  return {
    state, onStateChange, views, activeView, activeViewId, applyView,
    saveView, updateView, removeView,
    /** Filtros salvos na view ativa, aplicados fora da tabela (ex.: status). */
    viewFilters: (activeView?.config?.filters ?? {}) as Record<string, unknown>,
  };
}
