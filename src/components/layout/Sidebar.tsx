import { NavLink } from 'react-router-dom';
import { ChevronLeft, PanelLeft } from 'lucide-react';
import { cn } from '@/utils/cn';
import { navigation } from './navigation';
import { useAuth } from '@/app/AuthProvider';
import { Tooltip } from '@/components/ui/Tooltip';
import { EnvironmentSwitcher } from './EnvironmentSwitcher';
import { GroupLogo, ProductLockup } from './BrandMark';

export function Sidebar({
  collapsed, onToggle, mobileOpen, onCloseMobile,
}: { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onCloseMobile: () => void }) {
  const { can } = useAuth();

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={onCloseMobile} aria-hidden />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col bg-nav text-nav-fg transition-[width,transform] duration-200',
          collapsed ? 'w-16' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className={cn('flex h-14 items-center gap-2.5 border-b border-white/10 px-3', collapsed && 'justify-center px-0')}>
          {collapsed ? (
            <GroupLogo className="h-8 w-12 max-w-12 shrink-0" textSize="text-[7px]" variant="light" />
          ) : (
            <>
              <GroupLogo className="h-6 max-w-[88px] shrink-0" textSize="text-[9px]" variant="light" />
              <ProductLockup size="sm" className="min-w-0 flex-1" />
            </>
          )}
        </div>

        <EnvironmentSwitcher collapsed={collapsed} />

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {navigation.map((group) => {
            const items = group.items.filter((i) => !i.capability || can(i.capability));
            if (items.length === 0) return null;
            return (
              <div key={group.title} className="mb-4">
                {!collapsed && (
                  <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-nav-muted">
                    {group.title}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    const link = (
                      <NavLink
                        to={item.to}
                        end={item.end}
                        onClick={onCloseMobile}
                        className={({ isActive }) =>
                          cn(
                            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                            collapsed && 'justify-center px-0',
                            isActive
                              ? 'bg-nav-active text-white font-medium'
                              : 'text-nav-fg/80 hover:bg-white/5 hover:text-white',
                          )
                        }
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </NavLink>
                    );
                    return (
                      <li key={item.to}>
                        {collapsed ? <Tooltip content={item.label} side="right" className="block">{link}</Tooltip> : link}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <button
          onClick={onToggle}
          className="hidden lg:flex h-11 items-center justify-center gap-2 border-t border-white/10 text-xs text-nav-muted hover:bg-white/5 hover:text-white"
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /> Recolher</>}
        </button>
      </aside>
    </>
  );
}
