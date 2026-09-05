import { Link, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, Moon, Sun, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Popover, PopoverItem } from '@/components/ui/Popover';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { EnvironmentBadge } from '@/components/ui/EnvironmentBadge';
import { useTheme } from '@/app/ThemeProvider';
import { useAuth } from '@/app/AuthProvider';
import { roleLabel } from '@/utils/domain-labels';
import { supabase } from '@/lib/supabase/client';

export function Topbar({ onOpenMenu, breadcrumbs }: { onOpenMenu: () => void; breadcrumbs: React.ReactNode }) {
  const { theme, toggle } = useTheme();
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  const { data: unread = 0 } = useQuery({
    queryKey: ['notifications', 'unread', profile?.id],
    enabled: Boolean(profile?.id),
    refetchInterval: 120_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMenu} aria-label="Abrir menu">
        <Menu className="h-4 w-4" />
      </Button>

      <div className="min-w-0 flex-1">{breadcrumbs}</div>

      <EnvironmentBadge className="hidden sm:inline-flex" />
      <EnvironmentBadge compact className="sm:hidden" />

      <Link to="/notificacoes" className="relative rounded-lg p-2 text-muted hover:bg-surface-2 hover:text-fg focus-ring" aria-label="Notificacoes">
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-semibold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Link>

      <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}>
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      <Popover
        trigger={({ toggle: t }) => (
          <button onClick={t} className="flex items-center gap-2 rounded-lg p-1 hover:bg-surface-2 focus-ring" aria-label="Menu do usuario">
            <Avatar name={profile?.full_name} size="md" />
          </button>
        )}
        contentClassName="w-60"
      >
        <div className="border-b border-border px-2.5 pb-2 pt-1">
          <p className="truncate text-sm font-medium">{profile?.full_name ?? '—'}</p>
          <p className="truncate text-xs text-muted">{profile?.email}</p>
          <div className="mt-1.5">
            {profile && <Badge tone="brand">{roleLabel[profile.role]}</Badge>}
          </div>
        </div>
        <div className="pt-1">
          <PopoverItem onClick={() => navigate('/configuracoes/perfil')}>
            <User className="h-3.5 w-3.5" /> Meu perfil
          </PopoverItem>
          <PopoverItem danger onClick={() => void signOut()}>
            <LogOut className="h-3.5 w-3.5" /> Sair
          </PopoverItem>
        </div>
      </Popover>
    </header>
  );
}
