import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { LineChart, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/app/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { describeError } from '@/lib/supabase/client';

export function LoginPage() {
  const { session, signIn, configured, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (session && !loading) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(
        (err as { message?: string })?.message === 'Invalid login credentials'
          ? 'E-mail ou senha invalidos.'
          : describeError(err),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-nav p-10 text-nav-fg lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-brand-fg">
            <LineChart className="h-5 w-5" />
          </div>
          <div>
            <p className="font-semibold">PMO Contábil</p>
            <p className="text-xs text-nav-muted">Gestao de Portfolio da Contabilidade</p>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="text-2xl font-semibold leading-snug text-white">
            Fonte unica de verdade para o portfolio da Contabilidade.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-nav-muted">
            Planejamento, execucao, custos, recursos, riscos, entregas e governanca de todos os
            projetos em uma unica plataforma - com trilha de auditoria e controle de acesso por
            projeto, equipe e empresa.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-nav-muted">
            {[
              'Visao executiva consolidada do portfolio',
              'Riscos, planos de acao e decisoes rastreaveis',
              'Budget, realizado, comprometido e forecast',
              'Calendario critico contabil integrado ao cronograma',
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-nav-muted">
          Acesso controlado por RBAC e Row Level Security. Todas as operacoes criticas sao auditadas.
        </p>
      </div>

      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-brand text-brand-fg">
              <LineChart className="h-5 w-5" />
            </div>
            <p className="text-lg font-semibold">PMO Contábil</p>
          </div>

          <h2 className="text-xl font-semibold tracking-tight">Acessar a plataforma</h2>
          <p className="mt-1 text-sm text-muted">Use suas credenciais corporativas.</p>

          {!configured && (
            <div className="mt-5 flex gap-2.5 rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs text-warn">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Ambiente nao configurado</p>
                <p className="mt-0.5 text-muted">
                  Defina <code className="font-mono">VITE_SUPABASE_URL</code> e{' '}
                  <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> antes do build.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
            <Field label="Senha" required>
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
              />
            </Field>

            {error && (
              <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" className="w-full justify-center" loading={submitting} disabled={!configured}>
              Entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
