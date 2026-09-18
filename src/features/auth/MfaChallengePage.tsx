import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/app/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { BrandHeader, BrandLockupCompact } from '@/components/layout/BrandMark';
import { describeError } from '@/lib/supabase/client';

/**
 * Segundo fator (TOTP) apos a senha ser aceita. So' e' alcancada quando
 * `mfaPending` e' true (`ProtectedRoute` redireciona para ca) - se a conta
 * nao tem fator verificado, este passo nunca aparece.
 */
export function MfaChallengePage() {
  const { session, loading, mfaPending, signOut, verifyMfa } = useAuth();
  const location = useLocation();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && !session) return <Navigate to="/login" replace />;
  if (!loading && !mfaPending) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from || '/'} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await verifyMfa(code.trim());
    } catch (err) {
      const message = (err as { message?: string })?.message ?? '';
      setError(/invalid|expired/i.test(message) ? 'Codigo invalido ou expirado.' : describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-nav p-8 text-nav-fg lg:flex xl:p-12">
        <BrandHeader />
        <div className="max-w-md">
          <h1 className="text-2xl font-semibold leading-snug text-white">
            Confirme sua identidade.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-nav-muted">
            Sua senha foi aceita. Esta conta tem autenticacao de dois fatores ativa - digite o
            codigo do seu aplicativo autenticador para concluir o acesso.
          </p>
        </div>
        <p className="flex items-start gap-2 border-t border-white/10 pt-4 text-xs text-nav-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          Acesso controlado por RBAC e Row Level Security. Todas as operacoes criticas sao auditadas.
        </p>
      </div>

      <div className="flex min-w-0 items-center justify-center px-6 py-10 sm:py-12">
        <div className="w-full" style={{ maxWidth: 'min(100%, 480px)' }}>
          <div className="mb-8 lg:hidden">
            <BrandLockupCompact />
          </div>

          <h2 className="text-xl font-semibold tracking-tight">Verificacao em duas etapas</h2>
          <p className="mt-1 text-sm text-muted">
            Abra seu aplicativo autenticador e digite o codigo de 6 digitos atual.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Codigo de verificacao" required>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
                maxLength={6}
              />
            </Field>

            {error && (
              <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full justify-center" loading={submitting}>
              Verificar
            </Button>

            <p className="text-center text-sm text-muted">
              Nao esta com acesso ao seu autenticador?{' '}
              <button type="button" onClick={() => void signOut()} className="text-brand hover:underline">
                Sair
              </button>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
