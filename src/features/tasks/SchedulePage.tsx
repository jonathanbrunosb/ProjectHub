import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useBreadcrumbs } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Select } from '@/components/ui/Input';
import { ErrorState, Spinner } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { GanttChart, type GanttItem, type GanttScale } from '@/components/gantt/GanttChart';
import { listProjectOverview } from '@/services/projects';
import { listMilestones } from '@/services/tasks';
import { listCalendarEvents } from '@/services/governance';
import { healthLabel, projectStatusLabel } from '@/utils/domain-labels';

/**
 * Cronograma corporativo: projetos como barras e marcos como losangos,
 * com as janelas criticas da Contabilidade destacadas no fundo.
 */
export function SchedulePage() {
  useBreadcrumbs([{ label: 'Cronograma Corporativo' }]);
  const navigate = useNavigate();
  const [scale, setScale] = useState<GanttScale>('mes');
  const [filters, setFilters] = useState({ category: '', owner: '', area: '', health: '', status: '', company: '' });

  const projectsQuery = useQuery({ queryKey: ['projects', 'overview'], queryFn: listProjectOverview });
  const milestonesQuery = useQuery({ queryKey: ['milestones', 'all'], queryFn: () => listMilestones() });
  const calendarQuery = useQuery({ queryKey: ['calendar', 'events'], queryFn: listCalendarEvents });

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);

  const options = useMemo(() => ({
    categories: [...new Set(projects.map((p) => p.category))].sort(),
    owners: [...new Set(projects.map((p) => p.owner_name).filter(Boolean))].sort() as string[],
    areas: [...new Set(projects.map((p) => p.area_name).filter(Boolean))].sort() as string[],
    companies: [...new Set(projects.map((p) => p.company_name).filter(Boolean))].sort() as string[],
  }), [projects]);

  const filteredProjects = useMemo(
    () => projects.filter((p) =>
      (!filters.category || p.category === filters.category)
      && (!filters.owner || p.owner_name === filters.owner)
      && (!filters.area || p.area_name === filters.area)
      && (!filters.health || p.health === filters.health)
      && (!filters.status || p.status === filters.status)
      && (!filters.company || p.company_name === filters.company)),
    [projects, filters],
  );

  const items = useMemo<GanttItem[]>(() => {
    const ids = new Set(filteredProjects.map((p) => p.id));
    const rows: GanttItem[] = [];
    for (const p of filteredProjects) {
      rows.push({
        id: p.id,
        label: p.code,
        sublabel: p.name.length > 30 ? `${p.name.slice(0, 30)}…` : p.name,
        start: p.start_date,
        end: p.target_date ?? p.start_date,
        baselineStart: p.start_date,
        progress: Number(p.progress_actual),
        tone: p.health === 'verde' ? 'ok' : p.health === 'amarelo' ? 'warn' : p.health === 'vermelho' ? 'danger' : 'neutral',
        isCritical: p.priority === 'critica',
      });
      for (const m of (milestonesQuery.data ?? []).filter((x) => x.project_id === p.id && ids.has(x.project_id))) {
        rows.push({
          id: m.id,
          label: m.name,
          start: m.due_date,
          end: m.due_date,
          baselineStart: m.baseline_date,
          baselineEnd: m.baseline_date,
          isMilestone: true,
          isCritical: m.is_critical,
          level: 1,
        });
      }
    }
    return rows;
  }, [filteredProjects, milestonesQuery.data]);

  const bands = useMemo(
    () => (calendarQuery.data ?? []).map((e) => ({
      start: e.start_date, end: e.end_date, label: e.name,
      tone: (e.is_freeze || e.severity === 'critica' ? 'danger' : 'warn') as 'danger' | 'warn',
    })),
    [calendarQuery.data],
  );

  if (projectsQuery.isError) {
    return <ErrorState message={(projectsQuery.error as Error).message} onRetry={() => projectsQuery.refetch()} />;
  }

  return (
    <>
      <PageHeader
        title="Cronograma Corporativo"
        description="Projetos, fases e marcos em uma unica linha do tempo, com as janelas criticas da Contabilidade."
        actions={<Badge tone="neutral">{filteredProjects.length} projeto(s)</Badge>}
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <Select className="w-auto" value={scale} onChange={(e) => setScale(e.target.value as GanttScale)} aria-label="Escala">
          {(['dia', 'semana', 'mes', 'trimestre', 'ano'] as GanttScale[]).map((s) => (
            <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
          ))}
        </Select>
        <Select className="w-auto" value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {options.categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select className="w-auto" value={filters.owner} onChange={(e) => setFilters((f) => ({ ...f, owner: e.target.value }))} aria-label="Owner">
          <option value="">Todos os owners</option>
          {options.owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
        <Select className="w-auto" value={filters.area} onChange={(e) => setFilters((f) => ({ ...f, area: e.target.value }))} aria-label="Area">
          <option value="">Todas as areas</option>
          {options.areas.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Select className="w-auto" value={filters.company} onChange={(e) => setFilters((f) => ({ ...f, company: e.target.value }))} aria-label="Empresa">
          <option value="">Todas as empresas</option>
          {options.companies.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select className="w-auto" value={filters.health} onChange={(e) => setFilters((f) => ({ ...f, health: e.target.value }))} aria-label="Saude">
          <option value="">Toda a saude</option>
          {Object.entries(healthLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select className="w-auto" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} aria-label="Status">
          <option value="">Todos os status</option>
          {Object.entries(projectStatusLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>

      {projectsQuery.isLoading ? (
        <Spinner label="Montando cronograma" />
      ) : (
        <div className="card p-2">
          <GanttChart
            items={items}
            bands={bands}
            scale={scale}
            onSelect={(id) => {
              const project = filteredProjects.find((p) => p.id === id);
              if (project) navigate(`/projetos/${project.id}`);
            }}
          />
        </div>
      )}
    </>
  );
}
