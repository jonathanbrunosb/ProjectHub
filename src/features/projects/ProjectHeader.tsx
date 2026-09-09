import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, RefreshCw, ShieldCheck, Target, Wallet } from 'lucide-react';
import type { ProjectOverview } from '@/types/domain';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { HealthBadge, PriorityBadge, ProjectStatusBadge } from '@/components/ui/StatusBadges';
import { Progress } from '@/components/ui/Progress';
import { Modal } from '@/components/ui/Modal';
import { Field, Select, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/app/AuthProvider';
import { clearHealthOverride, overrideHealth } from '@/services/projects';
import { describeError } from '@/lib/supabase/client';
import { formatCurrency, formatDate, relativeFromNow } from '@/utils/format';
import { healthLabel } from '@/utils/domain-labels';
import type { Health } from '@/types/domain';

export function ProjectHeader({ project, onEdit }: { project: ProjectOverview; onEdit: () => void }) {
  const { can } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [overriding, setOverriding] = useState(false);
  const [health, setHealth] = useState<Health>(project.health);
  const [reason, setReason] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['project', project.id] });
  };

  const override = useMutation({
    mutationFn: () => overrideHealth(project.id, health, reason),
    onSuccess: () => {
      invalidate();
      setOverriding(false);
      setReason('');
      toast.success('Saude atualizada', 'Justificativa, autor e data foram registrados na auditoria.');
    },
    onError: (e) => toast.error('Nao foi possivel alterar a saude', describeError(e)),
  });

  const clearOverride = useMutation({
    mutationFn: () => clearHealthOverride(project.id),
    onSuccess: () => {
      invalidate();
      toast.success('Override removido', 'A saude voltou a ser calculada automaticamente.');
    },
    onError: (e) => toast.error('Nao foi possivel remover o override', describeError(e)),
  });

  const canManage = can('portfolio.manage') || can('project.write');
  const isArchived = Boolean(project.archived_at);
  // Projeto arquivado: correcoes cadastrais continuam possiveis, mas so' para
  // Admin/PMO - o mesmo guard aplicado no banco (0024_project_governance_guard).
  const canOpenEdit = isArchived ? can('portfolio.manage') : canManage;

  return (
    <>
      <div className="card mb-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted">{project.code}</span>
              <Badge tone="neutral">{project.category}</Badge>
              {project.phase && <Badge tone="info">Fase: {project.phase}</Badge>}
            </div>
            <h1 className="mt-1.5 text-xl font-semibold tracking-tight">{project.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <HealthBadge health={project.health} manual={project.health_is_manual} />
              <ProjectStatusBadge status={project.status} />
              <PriorityBadge priority={project.priority} />
              {isArchived && <Badge tone="neutral">Arquivado</Badge>}
              {Number(project.days_overdue) > 0 && (
                <Badge tone="danger">{project.days_overdue} dias de atraso</Badge>
              )}
              {project.financial_effective_enabled && (
                <Badge tone="strategic"><Wallet className="mr-1 inline h-3 w-3" />Financeiro ativo</Badge>
              )}
              {project.goal_indicator_enabled && project.goal_indicator_realized != null && (
                <Badge tone={project.goal_indicator_realized >= 10 ? 'ok' : 'warn'}>
                  <Target className="mr-1 inline h-3 w-3" />
                  {project.goal_indicator_realized >= 10 ? 'Acima da Meta' : 'Abaixo da Meta'}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <Button variant="secondary" size="sm" onClick={() => setOverriding(true)} icon={<ShieldCheck className="h-3.5 w-3.5" />}>
                Definir saude
              </Button>
            )}
            {project.health_is_manual && canManage && (
              <Button
                variant="ghost" size="sm"
                onClick={() => clearOverride.mutate()}
                loading={clearOverride.isPending}
                icon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                Voltar ao automatico
              </Button>
            )}
            {canOpenEdit && (
              <Button size="sm" onClick={onEdit} icon={<Pencil className="h-3.5 w-3.5" />}>Editar</Button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]">
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted">
              <span>Progresso fisico</span>
              <span className="tabular-nums">
                planejado {Number(project.progress_planned).toFixed(0)}% · realizado {Number(project.progress_actual).toFixed(0)}%
              </span>
            </div>
            <Progress value={project.progress_actual} planned={project.progress_planned} showLabel={false} />
            <p className="mt-1.5 text-xs text-muted">
              Desvio de avanco:{' '}
              <span className={Number(project.progress_deviation) < 0 ? 'text-warn font-medium' : 'text-ok font-medium'}>
                {Number(project.progress_deviation) > 0 ? '+' : ''}{Number(project.progress_deviation).toFixed(1)} p.p.
              </span>
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm sm:grid-cols-4">
            <Info label="Sponsor" value={project.sponsor_name ?? '—'} />
            <Info label="Owner" value={project.owner_name ?? '—'} />
            <Info label="Area responsavel" value={project.area_name ?? '—'} />
            <Info label="Empresa" value={project.company_name ?? '—'} />
            <Info label="Inicio" value={formatDate(project.start_date)} />
            <Info label="Data-alvo" value={formatDate(project.target_date)} />
            {project.financial_effective_enabled ? (
              <>
                <Info label="Orcamento" value={formatCurrency(project.budget)} />
                <Info label="Forecast" value={formatCurrency(project.forecast)}
                  tone={Number(project.forecast_variance_pct) > 5 ? 'danger' : undefined} />
              </>
            ) : (
              <>
                <Info label="Riscos criticos" value={String(project.critical_risks)}
                  tone={Number(project.critical_risks) > 0 ? 'danger' : undefined} />
                <Info label="Proximo marco" value={project.next_milestone_name ?? '—'} />
              </>
            )}
            {project.goal_indicator_enabled && (
              <Info
                label="Indicador de Meta"
                value={project.goal_indicator_realized != null
                  ? project.goal_indicator_realized.toFixed(2)
                  : project.goal_indicator_projected != null ? `${project.goal_indicator_projected.toFixed(2)} (proj.)` : 'Pendente'}
                tone={project.goal_indicator_realized != null && project.goal_indicator_realized < 10 ? 'danger' : undefined}
              />
            )}
          </dl>
        </div>

        <p className="mt-3 border-t border-border pt-2.5 text-xs text-muted">
          Ultima atualizacao {relativeFromNow(project.last_update_at)}
          {project.health_is_manual && ' · saude definida manualmente'}
        </p>
      </div>

      <Modal
        open={overriding}
        onClose={() => setOverriding(false)}
        title="Definir saude manualmente"
        description="O override sobrepoe o calculo automatico e exige justificativa registrada na trilha de auditoria."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOverriding(false)}>Cancelar</Button>
            <Button
              onClick={() => override.mutate()}
              loading={override.isPending}
              disabled={reason.trim().length < 10}
            >
              Confirmar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Saude" required>
            <Select value={health} onChange={(e) => setHealth(e.target.value as Health)}>
              {Object.entries(healthLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Justificativa" required hint="Minimo de 10 caracteres. Fica visivel na auditoria.">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: Marco replanejado formalmente com o Sponsor em Steering Committee de 12/03."
            />
          </Field>
        </div>
      </Modal>
    </>
  );
}

function Info({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`truncate font-medium ${tone === 'danger' ? 'text-danger' : 'text-fg'}`}>{value}</dd>
    </div>
  );
}
