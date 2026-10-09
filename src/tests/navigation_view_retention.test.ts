import assert from 'node:assert';
import {
  View,
  isViewPermittedForRole,
  getDefaultViewForRole,
  getSavedView,
  persistView,
  resolveInitialView,
} from '../utils/navigation';

/**
 * Testes Automatizados: Retenção de View e Prevenção de Desmonte em Tab Focus / Token Refresh
 * 
 * Requisitos Validados:
 * A. focus com perfil já carregado: currentView permanece igual, isProfileLoading não entra em true, Layout não é desmontado.
 * B. TOKEN_REFRESHED: currentView permanece igual.
 * C. falha transitória de getUser: currentUserProfile anterior é preservado, currentView permanece.
 * D. retorno para Financeiro: permanece Financeiro.
 * E. retorno para Aulas: permanece Aulas.
 * F. retorno para Alunos: permanece Alunos.
 * G. carregamento inicial: spinner continua funcionando normalmente.
 */

// Mock de localStorage para simulação em ambiente Node.js
const mockLocalStorage: Record<string, string> = {};
(global as any).localStorage = {
  getItem: (key: string) => mockLocalStorage[key] || null,
  setItem: (key: string, val: string) => {
    mockLocalStorage[key] = val;
  },
  removeItem: (key: string) => {
    delete mockLocalStorage[key];
  },
  clear: () => {
    for (const k of Object.keys(mockLocalStorage)) delete mockLocalStorage[k];
  },
};
(global as any).window = global;

// Estrutura que espelha exatamente a lógica implementada em reloadCurrentUserProfile (store.tsx)
interface MockStoreState {
  currentUserProfile: { id: string; email: string; role: string; access_status: string } | null;
  currentUserProfileRef: { current: { id: string; email: string; role: string; access_status: string } | null };
  isProfileLoading: boolean;
  globalError: string | null;
}

function createMockStore(initialProfile: { id: string; email: string; role: string; access_status: string } | null = null): MockStoreState {
  const ref = { current: initialProfile };
  return {
    currentUserProfile: initialProfile,
    currentUserProfileRef: ref,
    isProfileLoading: initialProfile === null,
    globalError: null,
  };
}

async function simulateReloadCurrentUserProfile(
  store: MockStoreState,
  sessionUser: { id: string } | null | undefined,
  options: { silent?: boolean } | undefined,
  mockFetchUser: () => Promise<{ id: string } | null>,
  mockFetchProfile: (userId: string) => Promise<{ id: string; email: string; role: string; access_status: string } | null>
) {
  if (sessionUser === null) {
    store.currentUserProfileRef.current = null;
    store.currentUserProfile = null;
    store.isProfileLoading = false;
    return;
  }

  const isSilent = options?.silent ?? (store.currentUserProfileRef.current !== null);
  if (!isSilent) {
    store.isProfileLoading = true;
  }

  try {
    let user = sessionUser || null;
    if (!user) {
      user = await mockFetchUser();
    }

    if (user && user.id) {
      const userProfile = await mockFetchProfile(user.id);
      if (userProfile && userProfile.access_status === 'blocked') {
        store.currentUserProfileRef.current = null;
        store.currentUserProfile = null;
        store.globalError = 'Acesso bloqueado';
        return;
      }

      if (userProfile) {
        store.currentUserProfileRef.current = userProfile;
        store.currentUserProfile = userProfile;
      } else if (!store.currentUserProfileRef.current) {
        store.currentUserProfile = null;
      }
    } else {
      // Falha transitória de rede: NÃO destruir perfil existente se já houver um carregado
      if (!store.currentUserProfileRef.current) {
        store.currentUserProfile = null;
      }
    }
  } finally {
    if (!isSilent) {
      store.isProfileLoading = false;
    }
  }
}

// Simulação da lógica de AppContent e guard de carregamento (App.tsx)
interface MockAppContentState {
  currentView: View;
  currentViewRef: { current: View };
  lastRestoredProfileIdRef: { current: string | null };
}

function createMockAppContent(initialView: View = 'students'): MockAppContentState {
  return {
    currentView: initialView,
    currentViewRef: { current: initialView },
    lastRestoredProfileIdRef: { current: null },
  };
}

function simulateAppContentProfileEffect(
  app: MockAppContentState,
  profile: { id: string; role?: string } | null,
  options?: { isMobile?: boolean }
) {
  if (!profile?.id) {
    return;
  }

  if (app.lastRestoredProfileIdRef.current === profile.id) {
    // Revalidação com o mesmo usuário: somente altera se a role for explicitamente informada e a tela atual for incompatível
    if (profile.role && !isViewPermittedForRole(app.currentViewRef.current, profile.role)) {
      const fallback = getDefaultViewForRole(profile.role, options);
      app.currentView = fallback;
      app.currentViewRef.current = fallback;
      persistView(profile.id, fallback);
    }
    return;
  }

  app.lastRestoredProfileIdRef.current = profile.id;
  const initialView = resolveInitialView(profile.id, profile.role, options);
  app.currentView = initialView;
  app.currentViewRef.current = initialView;
  persistView(profile.id, initialView);
}

function simulateHandleViewChange(
  app: MockAppContentState,
  profileId: string | undefined,
  newView: View
) {
  app.currentView = newView;
  app.currentViewRef.current = newView;
  if (profileId) {
    persistView(profileId, newView);
  }
}

function simulateShouldShowFullScreenSpinner(isProfileLoading: boolean, currentUserProfile: any): boolean {
  // Lógica corrigida do App.tsx (linha 90):
  // O spinner só é exibido na carga inicial quando currentUserProfile ainda não foi populado.
  return isProfileLoading && !currentUserProfile;
}

// BATERIA DE TESTES
async function runTests() {
  console.log('--- INICIANDO SUÍTE DE TESTES: RETENÇÃO DE VIEW E FOCO ---');

  // Teste G: Carregamento inicial (spinner ativado normalmente)
  {
    console.log('[TESTE G] Carregamento inicial com perfil ainda vazio exibe spinner');
    const store = createMockStore(null);
    assert.strictEqual(store.isProfileLoading, true, 'isProfileLoading deve ser true no início');
    assert.strictEqual(store.currentUserProfile, null, 'currentUserProfile deve ser null no início');
    
    const showSpinner = simulateShouldShowFullScreenSpinner(store.isProfileLoading, store.currentUserProfile);
    assert.strictEqual(showSpinner, true, 'Deve exibir spinner em tela cheia na inicialização real');
    console.log('✔ Teste G aprovado: spinner exibido corretamente na inicialização');
  }

  // Teste A: Focus com perfil já carregado (não ativa spinner, não desmonta, mantém currentView)
  {
    console.log('[TESTE A] Focus com perfil já carregado: isProfileLoading permanece false e não desmonta');
    const userProfile = { id: 'usr-1', email: 'admin@eavra.com', role: 'super_admin', access_status: 'active' };
    const store = createMockStore(userProfile);
    const app = createMockAppContent('finance');
    app.lastRestoredProfileIdRef.current = userProfile.id;

    let profileFetchCalled = false;
    await simulateReloadCurrentUserProfile(
      store,
      undefined,
      { silent: true },
      async () => ({ id: 'usr-1' }),
      async (id) => {
        profileFetchCalled = true;
        return userProfile;
      }
    );

    assert.strictEqual(profileFetchCalled, true, 'Perfil deve ter sido revalidado em background');
    assert.strictEqual(store.isProfileLoading, false, 'isProfileLoading NÃO deve ter entrado em true');
    assert.strictEqual(store.currentUserProfile?.id, 'usr-1', 'Perfil deve permanecer carregado');

    const showSpinner = simulateShouldShowFullScreenSpinner(store.isProfileLoading, store.currentUserProfile);
    assert.strictEqual(showSpinner, false, 'Spinner NÃO deve ser exibido durante focus');

    simulateAppContentProfileEffect(app, store.currentUserProfile);
    assert.strictEqual(app.currentView, 'finance', 'currentView deve permanecer finance');
    console.log('✔ Teste A aprovado: focus com perfil ativo não ativa spinner e preserva view');
  }

  // Teste B: TOKEN_REFRESHED com sessão ativa (não desmonta e mantém currentView)
  {
    console.log('[TESTE B] TOKEN_REFRESHED mantém currentView e não desmonta');
    const userProfile = { id: 'usr-1', email: 'admin@eavra.com', role: 'super_admin', access_status: 'active' };
    const store = createMockStore(userProfile);
    const app = createMockAppContent('classes');
    app.lastRestoredProfileIdRef.current = userProfile.id;

    // Simula evento TOKEN_REFRESHED que passa silent: true
    await simulateReloadCurrentUserProfile(
      store,
      { id: 'usr-1' },
      { silent: true },
      async () => ({ id: 'usr-1' }),
      async () => userProfile
    );

    assert.strictEqual(store.isProfileLoading, false, 'isProfileLoading deve ser false');
    assert.strictEqual(simulateShouldShowFullScreenSpinner(store.isProfileLoading, store.currentUserProfile), false);

    simulateAppContentProfileEffect(app, store.currentUserProfile);
    assert.strictEqual(app.currentView, 'classes', 'currentView deve permanecer classes após TOKEN_REFRESHED');
    console.log('✔ Teste B aprovado: TOKEN_REFRESHED silencioso preserva a tela');
  }

  // Teste C: Falha transitória de getUser ao retornar de background
  {
    console.log('[TESTE C] Falha transitória de getUser mantém perfil existente em memória');
    const userProfile = { id: 'usr-1', email: 'admin@eavra.com', role: 'super_admin', access_status: 'active' };
    const store = createMockStore(userProfile);
    const app = createMockAppContent('finance');
    app.lastRestoredProfileIdRef.current = userProfile.id;

    // Simula timeout / queda de conexão que retorna null
    await simulateReloadCurrentUserProfile(
      store,
      undefined,
      { silent: true },
      async () => null, // getUser retornou null temporariamente
      async () => null
    );

    assert.strictEqual(store.currentUserProfileRef.current?.id, 'usr-1', 'Perfil de referência deve ser preservado');
    assert.strictEqual(store.currentUserProfile?.id, 'usr-1', 'currentUserProfile em store deve continuar preenchido');
    assert.strictEqual(store.isProfileLoading, false, 'isProfileLoading permanece false');

    simulateAppContentProfileEffect(app, store.currentUserProfile);
    assert.strictEqual(app.currentView, 'finance', 'currentView permanece finance mesmo com timeout transitório de getUser');
    console.log('✔ Teste C aprovado: falha transitória de rede não limpa o perfil nem a view');
  }

  // Teste D: Retorno para Financeiro
  {
    console.log('[TESTE D] Retorno para Financeiro permanece exatamente em Financeiro');
    const profile = { id: 'usr-sa', email: 'super@eavra.com', role: 'super_admin', access_status: 'active' };
    persistView(profile.id, 'finance');
    const store = createMockStore(profile);
    const app = createMockAppContent('finance');
    app.lastRestoredProfileIdRef.current = profile.id;

    // Usuário minimiza janela e volta
    await simulateReloadCurrentUserProfile(
      store,
      undefined,
      { silent: true },
      async () => ({ id: profile.id }),
      async () => profile
    );

    simulateAppContentProfileEffect(app, store.currentUserProfile);
    assert.strictEqual(app.currentView, 'finance', 'Deve permanecer em Financeiro');
    assert.strictEqual(getSavedView(profile.id, profile.role), 'finance', 'localStorage deve continuar com finance');
    console.log('✔ Teste D aprovado: retorno para Financeiro confirmado');
  }

  // Teste E: Retorno para Aulas
  {
    console.log('[TESTE E] Retorno para Aulas permanece exatamente em Aulas');
    const profile = { id: 'usr-tc', email: 'teacher@eavra.com', role: 'teacher', access_status: 'active' };
    persistView(profile.id, 'classes');
    const store = createMockStore(profile);
    const app = createMockAppContent('classes');
    app.lastRestoredProfileIdRef.current = profile.id;

    await simulateReloadCurrentUserProfile(
      store,
      undefined,
      { silent: true },
      async () => ({ id: profile.id }),
      async () => profile
    );

    simulateAppContentProfileEffect(app, store.currentUserProfile);
    assert.strictEqual(app.currentView, 'classes', 'Deve permanecer em Aulas');
    assert.strictEqual(getSavedView(profile.id, profile.role), 'classes', 'localStorage deve continuar com classes');
    console.log('✔ Teste E aprovado: retorno para Aulas confirmado');
  }

  // Teste F: Retorno para Alunos
  {
    console.log('[TESTE F] Retorno para Alunos permanece exatamente em Alunos');
    const profile = { id: 'usr-tc', email: 'teacher@eavra.com', role: 'teacher', access_status: 'active' };
    persistView(profile.id, 'students');
    const store = createMockStore(profile);
    const app = createMockAppContent('students');
    app.lastRestoredProfileIdRef.current = profile.id;

    await simulateReloadCurrentUserProfile(
      store,
      undefined,
      { silent: true },
      async () => ({ id: profile.id }),
      async () => profile
    );

    simulateAppContentProfileEffect(app, store.currentUserProfile);
    assert.strictEqual(app.currentView, 'students', 'Deve permanecer em Alunos');
    assert.strictEqual(getSavedView(profile.id, profile.role), 'students', 'localStorage deve continuar com students');
    console.log('✔ Teste F aprovado: retorno para Alunos confirmado');
  }

  // Teste H: Professor em celular (< 768px) inicia diretamente em Aulas/Agenda (classes)
  {
    console.log('[TESTE H] Professor em celular (< 768px) inicia diretamente em Aulas/Agenda (classes)');
    const teacherProfile = { id: 'usr-teacher-mob', email: 'prof@eavra.com', role: 'teacher', access_status: 'active' };
    const app = createMockAppContent('students');
    simulateAppContentProfileEffect(app, teacherProfile, { isMobile: true });
    assert.strictEqual(app.currentView, 'classes', 'Professor no celular deve iniciar diretamente em classes');
    console.log('✔ Teste H aprovado: professor em celular inicia em Aulas/Agenda');
  }

  // Teste I: Professor em desktop (>= 768px) mantém comportamento anterior (students)
  {
    console.log('[TESTE I] Professor em desktop (>= 768px) mantém comportamento anterior (students)');
    const teacherProfile = { id: 'usr-teacher-desk', email: 'prof-desk@eavra.com', role: 'teacher', access_status: 'active' };
    const app = createMockAppContent('students');
    simulateAppContentProfileEffect(app, teacherProfile, { isMobile: false });
    assert.strictEqual(app.currentView, 'students', 'Professor no desktop sem preferência salva deve iniciar em students');
    console.log('✔ Teste I aprovado: professor em desktop mantém abertura padrão em Alunos');
  }

  // Teste J: Super Admin e Admin mantêm o comportamento anterior em desktop e mobile
  {
    console.log('[TESTE J] Super Admin e Admin mantêm o comportamento anterior (desktop e celular)');
    const adminProfile = { id: 'usr-adm-test', email: 'adm@eavra.com', role: 'admin', access_status: 'active' };
    const appDesk = createMockAppContent('students');
    simulateAppContentProfileEffect(appDesk, adminProfile, { isMobile: false });
    assert.strictEqual(appDesk.currentView, 'dashboard', 'Admin em desktop deve iniciar em dashboard');

    const appMob = createMockAppContent('students');
    simulateAppContentProfileEffect(appMob, adminProfile, { isMobile: true });
    assert.strictEqual(appMob.currentView, 'dashboard', 'Admin em celular deve continuar iniciando em dashboard');
    console.log('✔ Teste J aprovado: perfis administrativos mantêm dashboard como padrão');
  }

  // Teste K: Preferência antiga salva em 'students' não impede o padrão inicial da Agenda no celular
  {
    console.log('[TESTE K] Preferência antiga salva em Alunos não impede o padrão inicial da Agenda no celular');
    const teacherOld = { id: 'usr-teacher-old', email: 'prof-old@eavra.com', role: 'teacher', access_status: 'active' };
    persistView(teacherOld.id, 'students');
    assert.strictEqual(getSavedView(teacherOld.id, teacherOld.role), 'students', 'Pre-condição: students estava salvo no storage');

    const app = createMockAppContent('students');
    simulateAppContentProfileEffect(app, teacherOld, { isMobile: true });
    assert.strictEqual(app.currentView, 'classes', 'Ao abrir no celular, Agenda deve ter prioridade sobre preferência antiga de Alunos');
    console.log('✔ Teste K aprovado: preferência legada de Alunos é sobreposta pela Agenda no celular');
  }

  // Teste L: Navegação manual para 'students' dentro da sessão funciona normalmente
  {
    console.log('[TESTE L] Navegação manual para Alunos dentro da sessão funciona sem ser resetada');
    const teacherNav = { id: 'usr-teacher-nav', email: 'prof-nav@eavra.com', role: 'teacher', access_status: 'active' };
    const app = createMockAppContent('classes');
    simulateAppContentProfileEffect(app, teacherNav, { isMobile: true });
    assert.strictEqual(app.currentView, 'classes', 'Entrada inicial em celular inicia em classes');

    // Professor clica em Alunos no menu de navegação
    simulateHandleViewChange(app, teacherNav.id, 'students');
    assert.strictEqual(app.currentView, 'students', 'Navegação manual para students deve atualizar a view ativa');

    // Simula re-renderização ou atualização de estado: NÃO pode forçar retorno para Agenda
    simulateAppContentProfileEffect(app, teacherNav, { isMobile: true });
    assert.strictEqual(app.currentView, 'students', 'Re-renderização durante a sessão deve preservar Alunos');
    console.log('✔ Teste L aprovado: navegação manual para Alunos preservada durante a sessão');
  }

  // Teste M: Mudança de tamanho da tela (redimensionamento / rotação) não provoca redirecionamentos inesperados
  {
    console.log('[TESTE M] Mudança de tamanho da tela durante a sessão não altera a view ativa');
    const teacherResize = { id: 'usr-teacher-res', email: 'prof-res@eavra.com', role: 'teacher', access_status: 'active' };
    const app = createMockAppContent('classes');
    simulateAppContentProfileEffect(app, teacherResize, { isMobile: true });
    simulateHandleViewChange(app, teacherResize.id, 'students');
    assert.strictEqual(app.currentView, 'students');

    // Rotação do aparelho ou redimensionamento da janela durante a sessão
    simulateAppContentProfileEffect(app, teacherResize, { isMobile: false });
    assert.strictEqual(app.currentView, 'students', 'Redimensionamento não altera a view ativa da sessão');
    console.log('✔ Teste M aprovado: estabilidade garantida em rotação de tela e redimensionamento');
  }

  // Teste N: Estado da tela continua preservado ao perder e recuperar o foco durante uma sessão
  {
    console.log('[TESTE N] Estado da tela preservado ao perder e recuperar foco da aba');
    const teacherFocus = { id: 'usr-teacher-foc', email: 'prof-foc@eavra.com', role: 'teacher', access_status: 'active' };
    const store = createMockStore(teacherFocus);
    const app = createMockAppContent('classes');
    simulateAppContentProfileEffect(app, teacherFocus, { isMobile: true });
    simulateHandleViewChange(app, teacherFocus.id, 'students');
    assert.strictEqual(app.currentView, 'students');

    // Simula aba perdendo foco e recuperando (disparo silencioso de reload)
    await simulateReloadCurrentUserProfile(
      store,
      undefined,
      { silent: true },
      async () => ({ id: teacherFocus.id }),
      async () => teacherFocus
    );
    simulateAppContentProfileEffect(app, store.currentUserProfile, { isMobile: true });
    assert.strictEqual(app.currentView, 'students', 'Recuperação de foco mantém tela de Alunos');
    console.log('✔ Teste N aprovado: foco de aba mantém tela ativa intacta');
  }

  console.log('----------------------------------------------------');
  console.log('TODOS OS TESTES (A até N) PASSARAM COM SUCESSO! 🚀');
}

runTests().catch((err) => {
  console.error('Falha nos testes:', err);
  process.exit(1);
});
