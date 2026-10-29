/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, useState, useEffect, useRef, useCallback, ReactNode, ErrorInfo } from "react";
import { AppProvider, useAppStore } from "./store";
import { Layout } from "./components/Layout";
import { Dashboard } from "./views/Dashboard";
import { Students } from "./views/Students";
import { Teachers } from "./views/Teachers";
import { Classes } from "./views/Classes";
import { ClassReports } from "./views/ClassReports";
import { Finance } from "./views/Finance";
import { FinancialPlans } from "./views/FinancialPlans";
import { Choir } from "./views/Choir";
import { Enrollments } from "./views/Enrollments";
import { DiscountRules } from "./views/DiscountRules";
import { Payments } from "./views/Payments";
import { Groups } from "./views/Groups";
import { Makeups } from "./views/Makeups";
import { Prospects } from "./views/Prospects";
import { Profiles } from "./views/Profiles";
import { PermissionsManager } from "./views/PermissionsManager";
import { EnrollmentTermsPreview } from "./views/EnrollmentTermsPreview";
import { Login } from "./views/Login";
import { NotEligible } from "./views/NotEligible";
import { Affiliates } from "./views/Affiliates";
import { PrivacyPolicy } from "./views/PrivacyPolicy";
import { supabase } from "./lib/supabase";
import { loadAuthorizedProfile } from "./utils/profileAccess";
import {
  View,
  getDefaultViewForRole,
  getSavedView,
  persistView,
  isViewPermittedForRole,
  resolveInitialView,
} from "./utils/navigation";

import { X, Lock, ShieldAlert, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

const ComponentBase = (React.Component || class {}) as unknown as {
  new (props: ErrorBoundaryProps): {
    props: ErrorBoundaryProps;
    state: ErrorBoundaryState;
    setState(state: Partial<ErrorBoundaryState> | ((prev: ErrorBoundaryState) => Partial<ErrorBoundaryState>)): void;
    componentDidCatch?(error: Error, errorInfo: any): void;
    render(): React.ReactNode;
  };
};

export class ErrorBoundary extends ComponentBase {
  props: ErrorBoundaryProps;
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
          <div className="max-w-md w-full bg-white border border-zinc-200 rounded-3xl shadow-xl p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-2xl mx-auto flex items-center justify-center border border-amber-100">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-zinc-900">
                {this.props.fallbackTitle || "Algo não saiu como esperado"}
              </h2>
              <p className="text-sm text-zinc-600 leading-relaxed">
                Ocorreu uma falha temporária ao carregar a interface. Seus dados estão seguros e você pode tentar recarregar ou retornar ao início.
              </p>
              {this.state.error?.message && (
                <div className="mt-3 p-3 bg-zinc-50 rounded-xl border border-zinc-200 text-left overflow-auto max-h-24">
                  <p className="text-xs font-mono text-zinc-500 break-words">
                    {this.state.error.message}
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex-1 py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-sm font-semibold rounded-xl transition-colors shadow-xs"
              >
                Tentar Novamente
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold rounded-xl transition-colors shadow-xs inline-flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Recarregar Página
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { state, deleteFinancialPlan, setGlobalError, currentUserProfile, isProfileLoading } = useAppStore();
  const [currentView, setCurrentView] = useState<View>(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    if (currentUserProfile?.id) {
      return resolveInitialView(currentUserProfile.id, currentUserProfile.role, { isMobile });
    }
    return isMobile ? "classes" : "students";
  });

  // Track which profileId has already undergone the initial view restoration to prevent loops or unwanted resets
  const lastRestoredProfileIdRef = useRef<string | null>(null);
  const currentViewRef = useRef<View>(currentView);
  useEffect(() => {
    currentViewRef.current = currentView;
  }, [currentView]);

  // Restore view whenever profile becomes available or when switching user
  useEffect(() => {
    if (!currentUserProfile?.id) {
      return;
    }

    // Only perform the initial restoration once per active profile session
    if (lastRestoredProfileIdRef.current === currentUserProfile.id) {
      // If user profile is unchanged, check whether current view is still permitted (e.g. role change)
      // Only check if role is explicitly defined; never fallback on temporary undefined during background revalidation
      if (currentUserProfile.role && !isViewPermittedForRole(currentViewRef.current, currentUserProfile.role)) {
        const fallback = getDefaultViewForRole(currentUserProfile.role);
        setCurrentView(fallback);
        currentViewRef.current = fallback;
        persistView(currentUserProfile.id, fallback);
      }
      return;
    }

    lastRestoredProfileIdRef.current = currentUserProfile.id;

    // Resolução da tela inicial respeitando perfil e dispositivo:
    // Professor em celular (< 768px) inicia na Agenda ('classes')
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const initialView = resolveInitialView(currentUserProfile.id, currentUserProfile.role, { isMobile });

    setCurrentView(initialView);
    currentViewRef.current = initialView;
    persistView(currentUserProfile.id, initialView);
  }, [currentUserProfile?.id, currentUserProfile?.role]);

  // Handler for view changes from Layout navigation - updates state & immediately persists per profile
  const handleViewChange = useCallback((newView: View) => {
    if (!currentUserProfile || !isViewPermittedForRole(newView, currentUserProfile.role)) return;
    setCurrentView(newView);
    currentViewRef.current = newView;
    if (currentUserProfile?.id) {
      persistView(currentUserProfile.id, newView);
    }
  }, [currentUserProfile?.id, currentUserProfile?.role]);

  useEffect(() => {
    // Cleanup Acordo Especial plans
    const plansToRemove = state.financialPlans.filter(p => p.name.startsWith('Acordo Especial -'));
    plansToRemove.forEach(plan => {
      deleteFinancialPlan(plan.id);
    });
  }, [state.financialPlans.length]);

  // O spinner de tela inteira só deve ser exibido na CARGA INICIAL da aplicação
  // (quando o perfil ainda nunca foi carregado). Revalidações posteriores em segundo plano
  // NUNCA desmontam o Layout nem a view ativa!
  if (isProfileLoading && !currentUserProfile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-zinc-600 font-medium animate-pulse">Carregando perfil do usuário...</p>
        </div>
      </div>
    );
  }

  // O AppProvider pode estar carregando o perfil mesmo após Auth confirmar a sessão.
  // Não renderizar conteúdo protegido sem um perfil correspondente confirmado.
  if (!currentUserProfile || currentUserProfile.access_status !== 'active') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <p className="text-zinc-700 text-sm">Não foi possível confirmar seu perfil. Atualize a página ou contate a coordenação.</p>
      </div>
    );
  }

  const renderView = () => {
    // Bloqueio adicional de acesso direto por estado/localStorage.
    if (!isViewPermittedForRole(currentView, currentUserProfile.role)) {
      return <div className="p-6 text-sm text-red-700">Acesso não autorizado a esta área.</div>;
    }
    switch (currentView) {
      case "dashboard":
        return <Dashboard />;
      case "students":
        return <Students />;
      case "teachers":
        return <Teachers />;
      case "classes":
        return <Classes />;
      case "class_reports":
        return <ClassReports />;
      case "finance":
        return <Finance />;
      case "financial_plans":
        return <FinancialPlans />;
      case "choir":
        return <Choir />;
      case "enrollments":
        return <Enrollments />;
      case "discount_rules":
        return <DiscountRules />;
      case "payments":
        return <Payments />;
      case "groups":
        return <Groups />;
      case "makeups":
        return <Makeups />;
      case "prospects":
        return <Prospects />;
      case "profiles":
        return <Profiles />;
      case "enrollment_terms_demo":
        return currentUserProfile?.role === "super_admin" && currentUserProfile?.access_status === "active"
          ? <EnrollmentTermsPreview /> : <div role="alert">Acesso restrito.</div>;
      case "permissions_manager":
        return currentUserProfile?.role === "super_admin" && currentUserProfile?.access_status === "active"
          ? <PermissionsManager /> : <div role="alert">Acesso restrito.</div>;
      case "affiliates":
        return <Affiliates />;
      case "not_eligible":
        return <NotEligible />;
      default:
        return <Students />;
    }
  };

  return (
    <Layout currentView={currentView} onViewChange={handleViewChange}>
      <AnimatePresence>
        {state.globalError && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 right-4 z-50 max-w-md bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl shadow-lg flex items-start justify-between"
          >
            <span className="text-sm font-medium mr-4">{state.globalError}</span>
            <button
              onClick={() => setGlobalError(null)}
              className="p-1 hover:bg-rose-100 rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {renderView()}
    </Layout>
  );
}

export default function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // ROTA PÚBLICA: /politica-de-privacidade (e /privacy) funciona sem login e sem redirecionamento
  if (
    pathname === '/politica-de-privacidade' ||
    pathname === '/politica-de-privacidade/' ||
    pathname === '/privacy' ||
    pathname === '/privacy/'
  ) {
    return <PrivacyPolicy />;
  }

  const [session, setSession] = useState<any>(null);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const [authStatus, setAuthStatus] = useState<
    'loading' | 'unauthenticated' | 'verifying_profile' | 'authenticated' | 'blocked' | 'access_error'
  >('loading');
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const authStatusRef = useRef(authStatus);
  useEffect(() => {
    authStatusRef.current = authStatus;
  }, [authStatus]);

  // O resultado de uma verificação antiga NUNCA pode reautorizar outra sessão.
  const verificationSequenceRef = useRef(0);

  const checkAccessAndSetSession = async (userSession: any, silent: boolean = false) => {
    const sequence = ++verificationSequenceRef.current;

    if (!userSession?.user?.id) {
      setSession(null);
      setAuthStatus('unauthenticated');
      return;
    }

    if (!silent) {
      setSession(null);
      setAuthStatus('verifying_profile');
    }

    const decision = await loadAuthorizedProfile(userSession.user.id, async (id) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, access_status')
        .eq('id', id)
        .maybeSingle();
      return { data, error };
    });

    if (sequence !== verificationSequenceRef.current) return;

    if (decision.kind !== 'allowed') {
      // Falha de rede, perfil ausente, ID divergente ou bloqueio = SEM sessão autorizada.
      setSession(null);
      if (decision.kind === 'blocked') {
        setBlockedMessage('Acesso bloqueado pela administração da escola. Entre em contato com a coordenação.');
        setAuthStatus('blocked');
      } else {
        setBlockedMessage(
          decision.kind === 'unavailable'
            ? 'Não foi possível verificar seu acesso agora. Tente novamente.'
            : 'Perfil de acesso não encontrado ou inconsistente. Entre em contato com a coordenação.'
        );
        setAuthStatus('access_error');
      }
      return;
    }

    setBlockedMessage(null);
    setSession(userSession);
    setAuthStatus('authenticated');
  };

  useEffect(() => {
    let disposed = false;
    const initialSequence = verificationSequenceRef.current;
    void supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (disposed || initialSequence !== verificationSequenceRef.current) return;
        if (error) {
          ++verificationSequenceRef.current;
          setSession(null);
          setBlockedMessage('Não foi possível verificar a sessão. Tente novamente.');
          setAuthStatus('access_error');
          return;
        }
        void checkAccessAndSetSession(session, false);
      })
      .catch(() => {
        if (disposed || initialSequence !== verificationSequenceRef.current) return;
        ++verificationSequenceRef.current;
        setSession(null);
        setBlockedMessage('Não foi possível verificar a sessão. Tente novamente.');
        setAuthStatus('access_error');
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, updatedSession) => {
      if (disposed) return;

      if (event === 'SIGNED_OUT' || !updatedSession) {
        ++verificationSequenceRef.current;
        setSession(null);
        setAuthStatus('unauthenticated');
        return;
      }

      const previouslyVerified =
        authStatusRef.current === 'authenticated' &&
        sessionRef.current?.user?.id === updatedSession.user?.id;

      void checkAccessAndSetSession(updatedSession, previouslyVerified);
    });

    return () => {
      disposed = true;
      ++verificationSequenceRef.current;
      subscription?.unsubscribe();
    };
  }, []);

  // Revogação: a verificação periódica e ao voltar o foco reutilizam o mesmo
  // gate rigoroso. Erros NÃO são ignorados; a UI protegida deixa de ser exibida.
  useEffect(() => {
    if (authStatus !== 'authenticated' || !session?.user?.id) return;

    const userId = session.user.id;
    const verifyCurrentAccess = () => {
      if (sessionRef.current?.user?.id === userId) {
        void checkAccessAndSetSession(sessionRef.current, true);
      }
    };

    const channel = supabase
      .channel(`profile-access-watcher-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        verifyCurrentAccess
      )
      .subscribe();

    const intervalId = setInterval(verifyCurrentAccess, 20000);
    window.addEventListener('focus', verifyCurrentAccess);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(intervalId);
      window.removeEventListener('focus', verifyCurrentAccess);
    };
  }, [authStatus, session?.user?.id]);

  // 5 minutes inactivity and storage/cookie clear checks
  useEffect(() => {
    if (authStatus !== 'authenticated') return;

    let timeoutId: any;

    const handleLogout = () => {
      supabase.auth.signOut().catch((err) => {
        console.error("Erro ao realizar saída automática:", err);
      });
    };

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout();
      }, 5 * 60 * 1000); // 5 minutes in milliseconds
    };

    // Listen to user interactions to reset timer
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    // Start inactivity timer initially
    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [authStatus]);

  if (authStatus === 'loading' || authStatus === 'verifying_profile') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-zinc-600 font-medium text-sm animate-pulse">
            Verificando permissões de acesso...
          </p>
        </div>
      </div>
    );
  }

  if (authStatus === 'access_error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <div className="max-w-md w-full bg-white border border-amber-200 rounded-2xl shadow-lg p-8 text-center space-y-5">
          <ShieldAlert className="w-10 h-10 text-amber-600 mx-auto" />
          <h2 className="text-xl font-bold text-zinc-900">Acesso não confirmado</h2>
          <p className="text-sm text-zinc-600">
            {blockedMessage || 'Não foi possível confirmar seu perfil de acesso.'}
          </p>
          <button type="button" onClick={() => {
            const retrySequence = ++verificationSequenceRef.current;
            setSession(null);
            setAuthStatus('verifying_profile');
            void supabase.auth.getSession().then(({ data, error }) => {
              if (retrySequence !== verificationSequenceRef.current) return;
              if (error) throw error;
              return checkAccessAndSetSession(data.session, false);
            }).catch(() => {
              if (retrySequence !== verificationSequenceRef.current) return;
              setSession(null);
              setBlockedMessage('Não foi possível verificar a sessão. Tente novamente.');
              setAuthStatus('access_error');
            });
          }} className="w-full py-2.5 px-4 bg-indigo-600 text-white rounded-xl font-semibold">
            Tentar novamente
          </button>
          <button type="button" onClick={() => { void supabase.auth.signOut(); }}
            className="w-full py-2.5 px-4 border rounded-xl text-sm">
            Sair e voltar ao login
          </button>
        </div>
      </div>
    );
  }

  if (authStatus === 'blocked') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
        <div className="max-w-md w-full bg-white border border-rose-200 rounded-2xl shadow-xl p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl mx-auto flex items-center justify-center border border-rose-100">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-zinc-900">Acesso Bloqueado</h2>
            <p className="text-sm text-zinc-600 leading-relaxed">
              {blockedMessage || 'Acesso bloqueado pela administração da escola. Entre em contato com a coordenação.'}
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signOut();
              setBlockedMessage(null);
              setAuthStatus('unauthenticated');
            }}
            className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            Voltar para o Login
          </button>
        </div>
      </div>
    );
  }

  if (authStatus === 'unauthenticated') {
    return <Login />;
  }

  return (
    <ErrorBoundary>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}
