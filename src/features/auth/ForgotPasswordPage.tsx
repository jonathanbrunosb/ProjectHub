import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ShieldCheck, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/app/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input, PasswordInput } from '@/components/ui/Input';
import { BrandHeader, BrandLockupCompact } from '@/components/layout/BrandMark';
import { describeError } from '@/lib/supabase/client';

type Step = 'pedir' | 'confirmar' | 'concluido';

/**
 * Recuperacao por codigo de 6 digitos, nao por link magico. O app usa
 * HashRouter (`#/rota`) para funcionar em GitHub Pages; o link padrao do
 * Supabase tambem chegaria com `#access_token=...`, disputando o mesmo
 * fragmento da URL. Um codigo digitado no formulario nao depende de URL
 * nenhuma - funciona igual em qualquer navegador, inclusive um diferente do
 * que fez o pedido (comum quando o e-mail e' aberto no celular).
 *
 * Pre-requisito operacional: o template "Reset Password" no Supabase Auth
 * precisa incluir {{ .Token }} - por padrao ele so' mostra o link.
 */
export function ForgotPasswordPage() {
  const { session, loading, configured, requestPasswordReset, confirmPasswordReset } = useAuth();
  const [step, setStep] = useState<Step>('pedir');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session && !loading) return <Navigate to="/" replace />;

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setStep('confirmar');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onConfirm(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas nao coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(email.trim(), token.trim(), password);
      setStep('concluido');
    } catch (err) {
      const message = (err as { message?: string })?.message ?? '';
      setError(
        /expired|invalid/i.test(message)
          ? 'Codigo invalido ou expirado. Solicite um novo.'
          : describeError(err),
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (step === 'concluido') {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-ok/10 text-ok">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Senha redefinida</h2>
          <p className="mt-2 text-sm text-muted">
            Sua senha foi alterada. Entre com a nova senha para continuar.
          </p>
          <Link to="/login" className="mt-4 inline-block text-sm text-brand hover:underline">
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-nav p-8 text-nav-fg lg:flex xl:p-12">
        <BrandHeader />
        <div className="max-w-md">
          <h1 className="text-2xl font-semibold leading-snug text-white">
            Recupere o acesso a sua conta.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-nav-muted">
            Enviamos um codigo de verificacao para o seu e-mail corporativo. Ele expira em
            pouco tempo - se nao chegar, voce pode solicitar um novo.
          </p>
        </div>
        <p className="border-t border-white/10 pt-4 text-xs text-nav-muted flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          Acesso controlado por RBAC e Row Level Security. Todas as operacoes criticas sao auditadas.
        </p>
      </div>

      <div className="flex items-center justify-center px-6 py-10 sm:py-12">
        <div className="w-full" style={{ maxWidth: 'min(100%, 480px)' }}>
          <div className="mb-8 lg:hidden">
            <BrandLockupCompact />
          </div>

          <Link to="/login" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para o login
          </Link>

          {step === 'pedir' ? (
            <>
              <h2 className="text-xl font-semibold tracking-tight">Esqueceu sua senha?</h2>
              <p className="mt-1 text-sm text-muted">
                Informe seu e-mail e enviaremos um codigo de verificacao.
              </p>

              <form onSubmit={onRequest} className="mt-6 space-y-4">
                <Field label="E-mail" required>
                  <Input
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nome@empresa.com.br"
                  />
                </Field>

                {error && (
                  <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                    {error}
                  </p>
                )}

                <Button type="submit" size="lg" className="w-full justify-center" loading={submitting} disabled={!configured}>
                  Enviar codigo
                </Button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold tracking-tight">Digite o codigo</h2>
              <p className="mt-1 text-sm text-muted">
                Enviamos um codigo de 6 digitos para <b>{email}</b>.
              </p>

              <form onSubmit={onConfirm} className="mt-6 space-y-4">
                <Field label="Codigo de verificacao" required hint="Confira tambem a caixa de spam.">
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="000000"
                    maxLength={8}
                  />
                </Field>
                <Field label="Nova senha" required hint="Minimo de 8 caracteres.">
                  <PasswordInput
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="********"
                  />
                </Field>
                <Field label="Confirmar nova senha" required>
                  <PasswordInput
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="********"
                  />
                </Field>

                {error && (
                  <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                    {error}
                  </p>
                )}

                <Button type="submit" size="lg" className="w-full justify-center" loading={submitting} disabled={!configured}>
                  Redefinir senha
                </Button>

                <p className="text-center text-sm text-muted">
                  Nao recebeu?{' '}
                  <button
                    type="button"
                    onClick={() => void onResend()}
                    disabled={submitting}
                    className="text-brand hover:underline disabled:opacity-50"
                  >
                    Reenviar codigo
                  </button>
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
