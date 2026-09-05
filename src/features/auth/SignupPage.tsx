import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/app/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input, PasswordInput } from '@/components/ui/Input';
import { BrandHeader, BrandLockupCompact } from '@/components/layout/BrandMark';
import { describeError } from '@/lib/supabase/client';

/**
 * Cadastro publico via Supabase Auth signUp (nao via API administrativa) -
 * mantem a service_role fora do frontend. Todo usuario nasce com o papel
 * 'viewer' (menor privilegio); o Admin promove depois em Configuracoes >
 * Usuarios. Isso evita autopromocao e mantem o RBAC controlado pelo banco.
 */
export function SignupPage() {
  const { session, signUp, configured, loading } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<'confirm' | 'ready' | null>(null);

  if (session && !loading) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
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
      const { needsEmailConfirmation } = await signUp(email.trim(), password, fullName.trim());
      if (needsEmailConfirmation) {
        setDone('confirm');
      } else {
        setDone('ready');
        setTimeout(() => navigate('/'), 1500);
      }
    } catch (err) {
      const message = (err as { message?: string })?.message ?? '';
      setError(
        message.includes('already registered') || message.includes('already exists')
          ? 'Ja existe uma conta com esse e-mail.'
          : describeError(err),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (done === 'confirm') {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-ok/10 text-ok">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Confirme seu e-mail</h2>
          <p className="mt-2 text-sm text-muted">
            Enviamos um link de confirmacao para <b>{email}</b>. Clique nele para ativar sua conta
            e depois volte para fazer login.
          </p>
          <Link to="/login" className="mt-4 inline-block text-sm text-brand hover:underline">
            Voltar para o login
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
            Crie sua conta para acessar o portfolio.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-nav-muted">
            Sua conta nasce com acesso de <b>Consulta</b> (somente leitura). Um Administrador
            atribui o papel definitivo (PMO, Owner, Colaborador, Sponsor ou Auditor) depois que
            sua conta for confirmada.
          </p>
        </div>
        <p className="text-xs text-nav-muted flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          Acesso controlado por RBAC e Row Level Security. Todas as operacoes criticas sao auditadas.
        </p>
      </div>

      <div className="flex items-center justify-center px-6 py-10 sm:py-12">
        <div className="w-full" style={{ maxWidth: 'min(100%, 480px)' }}>
          <div className="mb-8 lg:hidden">
            <BrandLockupCompact />
          </div>

          <h2 className="text-xl font-semibold tracking-tight">Criar conta</h2>
          <p className="mt-1 text-sm text-muted">Use seu e-mail corporativo.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Nome completo" required>
              <Input
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome"
                autoComplete="name"
              />
            </Field>
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
            <Field label="Senha" required hint="Minimo de 8 caracteres.">
              <PasswordInput
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
              />
            </Field>
            <Field label="Confirmar senha" required>
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
              Criar conta
            </Button>

            <p className="text-center text-sm text-muted">
              Ja tem conta?{' '}
              <Link to="/login" className="text-brand hover:underline">Entrar</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
