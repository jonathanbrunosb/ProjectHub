import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isEnvironmentConfigured } from '@/lib/supabase/client';
import { useEnvironment } from './EnvironmentProvider';
import { logAppEvent } from '@/lib/supabase/audit';
import type { Profile, RoleKey } from '@/types/domain';

interface AuthApi {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Retorna true se a sessao ja veio autenticada (confirmacao de e-mail desligada). */
  signUp: (email: string, password: string, fullName: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  /** Dispara o e-mail com o codigo de recuperacao. Nao revela se o e-mail existe. */
  requestPasswordReset: (email: string) => Promise<void>;
  /** Valida o codigo de 6 digitos e ja troca a senha em uma unica chamada. */
  confirmPasswordReset: (email: string, token: string, newPassword: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** RBAC de interface. A autorizacao real e' aplicada por RLS no PostgreSQL. */
  can: (capability: Capability) => boolean;
  hasRole: (...roles: RoleKey[]) => boolean;
}

/**
 * Capacidades de UI. Servem para nao oferecer acoes que o banco vai recusar -
 * jamais como mecanismo de seguranca (o backend e' a fonte de verdade).
 */
export type Capability =
  | 'portfolio.manage'
  | 'project.create'
  | 'project.write'
  | 'settings.manage'
  | 'users.manage'
  | 'audit.read'
  | 'templates.manage'
  | 'customfields.manage'
  | 'calendar.manage'
  | 'decision.decide'
  | 'reports.export'
  | 'financial_module.manage'
  | 'goal_indicator.manage';

const matrix: Record<Capability, RoleKey[]> = {
  'portfolio.manage': ['admin', 'pmo'],
  'project.create': ['admin', 'pmo', 'project_owner'],
  'project.write': ['admin', 'pmo', 'project_owner', 'collaborator'],
  'settings.manage': ['admin'],
  'users.manage': ['admin'],
  'audit.read': ['admin', 'pmo', 'auditor'],
  'templates.manage': ['admin', 'pmo'],
  'customfields.manage': ['admin', 'pmo'],
  'calendar.manage': ['admin', 'pmo'],
  'decision.decide': ['admin', 'pmo', 'sponsor'],
  'reports.export': ['admin', 'pmo', 'auditor', 'sponsor', 'project_owner'],
  // RoleKey nao tem um valor "gerencia" dedicado - Sponsor e' o papel de
  // diretoria/gerencia executiva neste app (mesmo grupo de decision.decide).
  'financial_module.manage': ['admin', 'pmo', 'sponsor'],
  'goal_indicator.manage': ['admin', 'pmo', 'sponsor'],
};

const AuthContext = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Cada ambiente e' um projeto Supabase com Auth proprio: sessao e perfil sao
  // recarregados do zero na troca, nunca herdados do ambiente anterior.
  const { environment } = useEnvironment();
  const configured = isEnvironmentConfigured(environment);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(configured);

  useEffect(() => {
    setSession(null);
    setProfile(null);
    setLoading(configured);

    if (!configured) return;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      if (!next) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [environment, configured]);

  useEffect(() => {
    if (!session?.user) return;
    let active = true;
    setLoading(true);
    supabase
      .from('profiles')
      .select('id,email,full_name,job_title,role,company_id,business_unit_id,primary_team_id,avatar_url,weekly_capacity_hours,active,can_switch_environment')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setProfile((data as Profile) ?? null);
        setLoading(false);
      });
    return () => { active = false; };
  }, [session?.user?.id, environment]); // eslint-disable-line react-hooks/exhaustive-deps

  const api = useMemo<AuthApi>(() => ({
    session,
    profile,
    loading,
    configured,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await logAppEvent('login', 'auth');
    },
    signUp: async (email, password, fullName) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw error;
      // Sem sessao ativa apos o signUp = projeto exige confirmacao de e-mail.
      return { needsEmailConfirmation: !data.session };
    },
    signOut: async () => {
      await logAppEvent('logout', 'auth');
      await supabase.auth.signOut();
      setProfile(null);
    },
    /**
     * Codigo por e-mail, nao link magico: o HashRouter usa `#/rota` para
     * navegacao, e o link de recuperacao padrao do Supabase tambem viria com
     * `#access_token=...` - as duas coisas disputam o mesmo fragmento da URL.
     * Um codigo digitado no formulario nao depende de URL nenhuma, entao
     * funciona igual em qualquer navegador, inclusive um diferente do que fez
     * o pedido (comum quando o e-mail e' aberto no celular ou no Outlook web).
     */
    requestPasswordReset: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
    },
    confirmPasswordReset: async (email, token, newPassword) => {
      const { error: verifyError } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
      if (verifyError) throw verifyError;
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      await logAppEvent('login', 'auth', { data: { via: 'password_reset' } });
    },
    refreshProfile: async () => {
      if (!session?.user) return;
      const { data } = await supabase
        .from('profiles')
        .select('id,email,full_name,job_title,role,company_id,business_unit_id,primary_team_id,avatar_url,weekly_capacity_hours,active,can_switch_environment')
        .eq('id', session.user.id)
        .maybeSingle();
      setProfile((data as Profile) ?? null);
    },
    can: (capability) => (profile ? matrix[capability].includes(profile.role) : false),
    hasRole: (...roles) => (profile ? roles.includes(profile.role) : false),
  }), [session, profile, loading, configured]);

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
