import { Suspense, lazy } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { Spinner } from '@/components/ui/Feedback';
import { useEnvironment } from '@/app/EnvironmentProvider';
import { LoginPage } from '@/features/auth/LoginPage';
import { SignupPage } from '@/features/auth/SignupPage';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';

// Route splitting: cada modulo pesado entra em seu proprio chunk.
const PortfolioPage = lazy(() => import('@/features/portfolio/PortfolioPage').then((m) => ({ default: m.PortfolioPage })));
const ProjectPage = lazy(() => import('@/features/projects/ProjectPage').then((m) => ({ default: m.ProjectPage })));
const TasksPage = lazy(() => import('@/features/tasks/TasksPage').then((m) => ({ default: m.TasksPage })));
const SchedulePage = lazy(() => import('@/features/tasks/SchedulePage').then((m) => ({ default: m.SchedulePage })));
const RisksPage = lazy(() => import('@/features/risks/RisksPage').then((m) => ({ default: m.RisksPage })));
const ResourcesPage = lazy(() => import('@/features/resources/ResourcesPage').then((m) => ({ default: m.ResourcesPage })));
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const GoalIndicatorsPage = lazy(() => import('@/features/goalIndicators/GoalIndicatorsPage').then((m) => ({ default: m.GoalIndicatorsPage })));
const ReportsPage = lazy(() => import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const ReportDetailPage = lazy(() => import('@/features/reports/ReportDetailPage').then((m) => ({ default: m.ReportDetailPage })));
const AuditPage = lazy(() => import('@/features/audit/AuditPage').then((m) => ({ default: m.AuditPage })));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));

/**
 * HashRouter: o GitHub Pages e' estatico e nao reescreve rotas para index.html,
 * portanto deep links com BrowserRouter retornariam 404 no refresh.
 */
export function App() {
  const { environment } = useEnvironment();

  return (
    <HashRouter>
      {/* A `key` remonta toda a arvore autenticada na troca de ambiente. Isso
          descarta estado local de componentes - inclusive modais abertos e
          formularios preenchidos - impedindo que um payload montado em QA seja
          enviado ao PRD (ou o contrario). */}
      <Suspense key={environment} fallback={<Spinner />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<SignupPage />} />
          <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="portfolio" element={<PortfolioPage />} />
              <Route path="projetos/:projectId/*" element={<ProjectPage />} />
              <Route path="tarefas" element={<TasksPage />} />
              <Route path="cronograma" element={<SchedulePage />} />
              <Route path="riscos" element={<RisksPage />} />
              <Route path="recursos" element={<ResourcesPage />} />
              <Route path="calendario" element={<CalendarPage />} />
              <Route path="indicadores-metas" element={<GoalIndicatorsPage />} />
              <Route path="relatorios" element={<ReportsPage />} />
              <Route path="relatorios/:reportKey" element={<ReportDetailPage />} />
              <Route path="notificacoes" element={<NotificationsPage />} />
              <Route path="configuracoes/*" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route element={<ProtectedRoute capability="audit.read" />}>
            <Route element={<AppShell />}>
              <Route path="auditoria" element={<AuditPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
