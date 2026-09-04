import { Badge } from './Badge';
import { Tooltip } from './Tooltip';
import {
  healthLabel, healthTone, priorityLabel, priorityTone, projectStatusLabel, projectStatusTone,
  taskStatusLabel, taskStatusTone, riskStatusLabel, riskStatusTone, criticalityLabel,
  criticalityTone, riskCriticality, actionStatusLabel, actionStatusTone,
  decisionStatusLabel, decisionStatusTone,
} from '@/utils/domain-labels';
import type {
  ActionStatus, DecisionStatus, Health, Priority, ProjectStatus, RiskStatus, TaskStatus,
} from '@/types/domain';

export function HealthBadge({ health, manual }: { health: Health; manual?: boolean }) {
  const badge = <Badge tone={healthTone[health]} dot>{healthLabel[health]}{manual ? ' *' : ''}</Badge>;
  return manual
    ? <Tooltip content="Saude definida manualmente (override com justificativa registrada).">{badge}</Tooltip>
    : badge;
}

export const ProjectStatusBadge = ({ status }: { status: ProjectStatus }) => (
  <Badge tone={projectStatusTone[status]}>{projectStatusLabel[status]}</Badge>
);

export const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <Badge tone={priorityTone[priority]}>{priorityLabel[priority]}</Badge>
);

export const TaskStatusBadge = ({ status }: { status: TaskStatus }) => (
  <Badge tone={taskStatusTone[status]}>{taskStatusLabel[status]}</Badge>
);

export const RiskStatusBadge = ({ status }: { status: RiskStatus }) => (
  <Badge tone={riskStatusTone[status]}>{riskStatusLabel[status]}</Badge>
);

export function CriticalityBadge({ score }: { score: number }) {
  const level = riskCriticality(score);
  return (
    <Tooltip content={`Score ${score} (probabilidade x impacto)`}>
      <Badge tone={criticalityTone[level]}>{criticalityLabel[level]} · {score}</Badge>
    </Tooltip>
  );
}

export const ActionStatusBadge = ({ status }: { status: ActionStatus }) => (
  <Badge tone={actionStatusTone[status]}>{actionStatusLabel[status]}</Badge>
);

export const DecisionStatusBadge = ({ status }: { status: DecisionStatus }) => (
  <Badge tone={decisionStatusTone[status]}>{decisionStatusLabel[status]}</Badge>
);
