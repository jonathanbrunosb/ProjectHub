import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';
import { EnvironmentMismatchBanner } from './EnvironmentMismatchBanner';

const CrumbContext = createContext<{ setCrumbs: (c: Crumb[]) => void } | null>(null);

/** Cada pagina declara sua trilha; o shell renderiza no topo. */
export function useBreadcrumbs(items: Crumb[]) {
  const ctx = useContext(CrumbContext);
  const key = JSON.stringify(items);
  useEffect(() => {
    ctx?.setCrumbs(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

const SIDEBAR_KEY = 'pmo.sidebar.collapsed';

export function AppShell({ children }: { children?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ label: 'Visao Executiva' }]);

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0'); } catch { /* ignora */ }
  }, [collapsed]);

  const ctx = useMemo(() => ({ setCrumbs }), []);

  return (
    <CrumbContext.Provider value={ctx}>
      <div className="min-h-screen bg-bg">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        <div className={collapsed ? 'lg:pl-16 transition-[padding]' : 'lg:pl-64 transition-[padding]'}>
          <Topbar onOpenMenu={() => setMobileOpen(true)} breadcrumbs={<Breadcrumbs items={crumbs} />} />
          <EnvironmentMismatchBanner />
          <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
            {children ?? <Outlet />}
          </main>
        </div>
      </div>
    </CrumbContext.Provider>
  );
}
