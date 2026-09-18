import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, type Capability } from '@/app/AuthProvider';
import { Spinner } from '@/components/ui/Feedback';
import { EmptyState } from '@/components/ui/Feedback';
import { ShieldOff } from 'lucide-react';

export function ProtectedRoute({ capability }: { capability?: Capability }) {
  const { session, loading, can, profile, mfaPending } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner label="Verificando sessao" />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  // Senha aceita (AAL1), mas ha' um fator TOTP verificado esperando o segundo
  // fator - bloqueia qualquer tela protegida ate o desafio ser concluido.
  if (mfaPending) return <Navigate to="/mfa" replace state={{ from: location.pathname }} />;

  if (capability && profile && !can(capability)) {
    return (
      <EmptyState
        icon={<ShieldOff className="h-6 w-6" />}
        title="Acesso nao autorizado"
        description="Seu perfil nao possui permissao para acessar este modulo. Fale com o Administrador ou com o PMO."
      />
    );
  }

  return <Outlet />;
}
