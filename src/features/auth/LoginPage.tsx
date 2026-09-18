import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/app/AuthProvider';
import { useEnvironment } from '@/app/EnvironmentProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input, PasswordInput } from '@/components/ui/Input';
import { BrandHeader, BrandLockupCompact } from '@/components/layout/BrandMark';
import { AuthEnvironmentPicker } from './AuthEnvironmentPicker';
import { describeError } from '@/lib/supabase/client';

export function LoginPage() {
  const { session, signIn, configured, loading } = useAuth();
  const { environment } = useEnvironment();
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
    // `theme-light-scope` no nivel mais externo: a tela de login inteira - fundo
    // neutro, card, os dois paineis - e' sempre clara por design, independente da
    // preferencia de tema (claro/escuro) do usuario/sistema (mesma decisao de
    // antes do redesenho, so' que agora aplicada uma vez no topo em vez de so'
    // no painel do formulario, ja que o novo fundo externo tambem precisa disso).
    <div className="theme-light-scope flex min-h-screen items-center justify-center bg-surface-2 p-3 py-6 sm:p-4 lg:p-6">
      {/* Cantos retos por diretriz de design (nao arredondar o container
          principal) - so' o `overflow-hidden` permanece, para recortar a foto
          e a onda do divisor nos limites do card. max-w mais largo que a
          versao anterior (6xl -> 1440px) para reduzir a folga lateral em
          notebook/desktop sem colar nas bordas da viewport. */}
      <div className="relative grid w-full max-w-[1440px] overflow-hidden bg-surface shadow-pop lg:grid-cols-2 lg:min-h-[640px]">
        {/* Painel institucional - oculto no mobile, onde a identidade aparece
            de forma compacta acima do formulario (ver BrandLockupCompact abaixo). */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-nav p-8 text-nav-fg lg:flex xl:p-12">
          <img
            src="/login-institutional.webp"
            alt=""
            aria-hidden="true"
            loading="eager"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Overlay escuro/azulado sobre a foto - garante contraste do texto
              em qualquer ponto da imagem, sem depender do que esta por baixo. */}
          <div className="absolute inset-0 bg-gradient-to-br from-nav/95 via-nav/80 to-brand/60" aria-hidden="true" />

          <div className="relative z-10">
            <BrandHeader />
          </div>

          <div className="relative z-10 max-w-md">
            <h1 className="text-2xl font-semibold leading-snug text-white">
              Fonte de verdade para o portfolio da Contabilidade.
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

          <p className="relative z-10 border-t border-white/10 pt-4 text-xs text-nav-muted">
            Acesso controlado por RBAC e Row Level Security. Todas as operacoes criticas sao auditadas.
          </p>
        </div>

        {/* Divisor ondulado entre os paineis - decorativo, so' visivel lado a
            lado (>= lg, mesmo breakpoint em que os dois paineis aparecem juntos).
            Um unico path suave (3 ondas) em vez de serrilhado, preenchido com a
            cor do painel claro (`fill-surface`) para parecer parte do proprio
            painel formando um recorte organico sobre a foto, nao um elemento solto. */}
        <svg
          aria-hidden="true"
          preserveAspectRatio="none"
          viewBox="0 0 200 800"
          className="pointer-events-none absolute inset-y-0 left-1/2 z-20 hidden h-full w-20 -translate-x-1/2 fill-surface lg:block xl:w-28"
        >
          <path d="M100,0 C50,100 150,200 100,300 C50,400 150,500 100,600 C50,700 150,750 100,800 L200,800 L200,0 Z" />
        </svg>

        {/* Painel do formulario. */}
        <div className="flex min-w-0 items-center justify-center px-6 py-10 text-fg sm:py-12 lg:px-10">
          <div className="w-full" style={{ maxWidth: 'min(100%, 440px)' }}>
            <div className="mb-8 lg:hidden">
              <BrandLockupCompact />
            </div>

            <AuthEnvironmentPicker />

            <h2 className="text-xl font-semibold tracking-tight">Acessar a plataforma</h2>
            <p className="mt-1 text-sm text-muted">Use suas credenciais corporativas.</p>

            {!configured && (
              <div className="mt-5 flex gap-2.5 rounded-lg border border-warn/30 bg-warn/10 p-3 text-xs text-warn">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Ambiente {environment} nao configurado</p>
                  <p className="mt-0.5 text-muted">
                    Defina <code className="font-mono">VITE_SUPABASE_{environment}_URL</code> e{' '}
                    <code className="font-mono">VITE_SUPABASE_{environment}_ANON_KEY</code>{' '}
                    {environment === 'QA' && (
                      <>(ou <code className="font-mono">VITE_SUPABASE_URL</code> /{' '}
                      <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>) </>
                    )}
                    antes do build.
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
                  className="h-11 rounded-xl"
                />
              </Field>
              <Field label="Senha" required>
                <PasswordInput
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  className="h-11 rounded-xl"
                />
              </Field>

              <p className="text-right text-sm">
                <Link to="/esqueci-senha" className="text-brand hover:underline">Esqueceu sua senha?</Link>
              </p>

              {error && (
                <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" className="w-full justify-center rounded-xl" loading={submitting} disabled={!configured}>
                Entrar
              </Button>

              <p className="text-center text-sm text-muted">
                Ainda nao tem conta?{' '}
                <Link to="/cadastro" className="text-brand hover:underline">Criar conta</Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
