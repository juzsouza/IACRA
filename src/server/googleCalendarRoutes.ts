/**
 * Rotas HTTP Seguras do Google Calendar
 * 
 * NUNCA expõe tokens, refresh tokens ou client_secret ao frontend.
 * Todos os acessos são autenticados e tratados server-side.
 */

import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  getGoogleConfig,
  generateGoogleAuthUrl,
  handleGoogleOAuthCallback,
  getTeacherGoogleAccount,
  deleteTeacherGoogleAccount,
  saveTeacherGoogleAccount,
  syncClassToGoogle,
  syncFutureClassesToGoogle,
  resyncExistingClass,
  reconcileUnsyncedClasses,
  getUnsyncedClassesList,
  updateExistingFutureClassesReminders,
  pullGoogleEvents,
  DEFAULT_GOOGLE_REDIRECT_URI,
  PROD_GOOGLE_REDIRECT_URI,
  supabaseAdmin,
} from './googleCalendarService.js';

export const googleCalendarRouter = Router();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ldumzwrwbhjtrnlioigg.supabase.co';
const rawSupabaseKey = (process.env.SUPABASE_KEY || '').replace(/^.*?eyJ/, 'eyJ').trim();
const SUPABASE_ANON_KEY = rawSupabaseKey.startsWith('eyJ')
  ? rawSupabaseKey
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdW16d3J3YmhqdHJubGlvaWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTU0MDcsImV4cCI6MjA4ODYzMTQwN30.PgzhWMBsYifm6ADnYm-EQu83DK9BShDQAVZlQw5sayU';

// Resolução compatível do secret administrativo (SUPABASE_SECRET_KEY || SUPABASE_SERVICE_ROLE_KEY)
const rawSecretInput = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
let adminKey = '';
if (rawSecretInput) {
  if (rawSecretInput.startsWith('eyJ') || rawSecretInput.startsWith('sb_secret')) {
    adminKey = rawSecretInput;
  } else {
    const eyjIndex = rawSecretInput.indexOf('eyJ');
    adminKey = eyjIndex !== -1 ? rawSecretInput.substring(eyjIndex) : rawSecretInput;
  }
}

export const routesAdminClient = adminKey
  ? createClient(SUPABASE_URL, adminKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : supabaseAdmin;

export interface AuthenticatedUser {
  userId: string;
  profileId?: string;
  role: 'super_admin' | 'admin' | 'teacher';
  teacherId: string | null;
}

export interface AuthResolutionResult {
  authenticated: boolean;
  authUserId: string | null;
  profileId: string | null;
  user: AuthenticatedUser | null;
  statusCode: 200 | 401 | 403;
  error?: string;
}

export interface AuthDependencies {
  verifyAuthToken?: (token: string) => Promise<{ id: string; email?: string | null } | null>;
  fetchProfileById?: (userId: string) => Promise<{
    id: string;
    role?: string | null;
    teacher_id?: string | null;
    access_status?: string | null;
    email?: string | null;
  } | null>;
}

/**
 * Resolve de forma determinística o usuário autenticado e seu perfil oficial em public.profiles.
 * REGRAS DE SEGURANÇA:
 * 1. Obtém o usuário autenticado através do token/session do Supabase (auth.getUser(token)).
 * 2. Usa EXCLUSIVAMENTE o auth user id (auth.uid) para buscar public.profiles (profiles.id = auth.uid).
 * 3. NÃO depende de comparação de e-mail para localizar o profile.
 * 4. NÃO cria profile automaticamente nem concede role automaticamente.
 * 5. Se o profile não existir em public.profiles, retorna erro explícito e seguro.
 */
export async function resolveAuthenticatedUser(
  req: any,
  deps?: AuthDependencies
): Promise<AuthResolutionResult> {
  const authHeader = req?.headers?.authorization;
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return {
      authenticated: false,
      authUserId: null,
      profileId: null,
      user: null,
      statusCode: 401,
      error: 'Autenticação necessária para sincronizar aulas.',
    };
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return {
      authenticated: false,
      authUserId: null,
      profileId: null,
      user: null,
      statusCode: 401,
      error: 'Autenticação necessária para sincronizar aulas.',
    };
  }

  try {
    let authUser: { id: string; email?: string | null } | null = null;

    if (deps?.verifyAuthToken) {
      authUser = await deps.verifyAuthToken(token);
    } else {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const {
        data: { user },
        error: userErr,
      } = await userClient.auth.getUser(token);
      if (!userErr && user && user.id) {
        authUser = { id: user.id, email: user.email };
      }
    }

    if (!authUser || !authUser.id) {
      console.warn('[GoogleSync Auth]', {
        authUserId: null,
        profileId: null,
        role: null,
        teacher_id: null,
        error: 'invalid_or_expired_auth_token',
      });
      return {
        authenticated: false,
        authUserId: null,
        profileId: null,
        user: null,
        statusCode: 401,
        error: 'Autenticação necessária para sincronizar aulas.',
      };
    }

    let profile: {
      id: string;
      role?: string | null;
      teacher_id?: string | null;
      access_status?: string | null;
      email?: string | null;
    } | null = null;

    if (deps?.fetchProfileById) {
      profile = await deps.fetchProfileById(authUser.id);
    } else {
      const adminDb = routesAdminClient || supabaseAdmin;
      const { data: profileRow } = await adminDb
        .from('profiles')
        .select('id, role, teacher_id, access_status')
        .eq('id', authUser.id)
        .maybeSingle();
      profile = profileRow || null;
    }

    // Se o perfil não existe em public.profiles para auth.uid -> erro explícito e seguro (sem fallback por e-mail)
    if (!profile || !profile.id) {
      console.warn('[GoogleSync Auth]', {
        authUserId: authUser.id,
        profileId: null,
        role: null,
        teacher_id: null,
        error: 'profile_not_found_by_id',
      });
      return {
        authenticated: true,
        authUserId: authUser.id,
        profileId: null,
        user: null,
        statusCode: 403,
        error: 'Perfil de usuário não encontrado em public.profiles para o usuário autenticado.',
      };
    }

    if (profile.access_status === 'blocked') {
      console.warn('[GoogleSync Auth]', {
        authUserId: authUser.id,
        profileId: profile.id,
        role: profile.role || null,
        teacher_id: profile.teacher_id || null,
        error: 'profile_access_blocked',
      });
      return {
        authenticated: true,
        authUserId: authUser.id,
        profileId: profile.id,
        user: null,
        statusCode: 403,
        error: 'Acesso bloqueado pela administração.',
      };
    }

    if (!profile.role) {
      console.warn('[GoogleSync Auth]', {
        authUserId: authUser.id,
        profileId: profile.id,
        role: null,
        teacher_id: profile.teacher_id || null,
        error: 'profile_missing_role',
      });
      return {
        authenticated: true,
        authUserId: authUser.id,
        profileId: profile.id,
        user: null,
        statusCode: 403,
        error: 'Permissão negada: perfil sem role válido em public.profiles.',
      };
    }

    const normalizedRole = String(profile.role).trim().toLowerCase();
    if (!['super_admin', 'admin', 'teacher'].includes(normalizedRole)) {
      console.warn('[GoogleSync Auth]', {
        authUserId: authUser.id,
        profileId: profile.id,
        role: normalizedRole,
        teacher_id: profile.teacher_id || null,
        error: 'profile_unauthorized_role',
      });
      return {
        authenticated: true,
        authUserId: authUser.id,
        profileId: profile.id,
        user: null,
        statusCode: 403,
        error: 'Permissão negada: perfil não autorizado para sincronizar aulas.',
      };
    }

    const teacherId = profile.teacher_id ? String(profile.teacher_id).trim() : null;
    console.log('[GoogleSync Auth]', {
      authUserId: authUser.id,
      profileId: profile.id,
      role: normalizedRole,
      teacher_id: teacherId,
    });

    return {
      authenticated: true,
      authUserId: authUser.id,
      profileId: profile.id,
      user: {
        userId: authUser.id,
        profileId: profile.id,
        role: normalizedRole as 'super_admin' | 'admin' | 'teacher',
        teacherId,
      },
      statusCode: 200,
    };
  } catch (err) {
    console.warn('[GoogleCalendarRoutes] Erro na autenticação do token:', err);
    return {
      authenticated: false,
      authUserId: null,
      profileId: null,
      user: null,
      statusCode: 401,
      error: 'Autenticação necessária para sincronizar aulas.',
    };
  }
}

/**
 * Valida o JWT do usuário logado e carrega seu perfil oficial (id, role, teacher_id)
 * buscando estritamente por profiles.id = auth.uid.
 */
export async function getAuthenticatedUser(
  req: any,
  deps?: AuthDependencies
): Promise<AuthenticatedUser | null> {
  const res = await resolveAuthenticatedUser(req, deps);
  return res.user;
}

/**
 * Valida a autorização para sincronização de aulas (Google Calendar).
 * - super_admin e admin: autorizados a sincronizar qualquer aula de qualquer professor.
 * - teacher: autorizado APENAS se possuir teacherId válido e coincidir com a aula.
 * - Usuário não autenticado ou sem perfil válido: rejeitado com 401 ou 403.
 */
export function checkSyncAuthorization(
  auth: AuthenticatedUser | null,
  classTeacherId: string | null | undefined,
  authResolution?: Pick<AuthResolutionResult, 'statusCode' | 'error'>
): { authorized: boolean; statusCode: 401 | 403; error?: string } {
  if (!auth) {
    const code = authResolution?.statusCode === 403 ? 403 : 401;
    return {
      authorized: false,
      statusCode: code,
      error: authResolution?.error || 'Autenticação necessária para sincronizar aulas.',
    };
  }

  // Super Administradores e Administradores possuem autorização irrestrita
  if (auth.role === 'super_admin' || auth.role === 'admin') {
    return { authorized: true, statusCode: 200 as any };
  }

  // Professores só podem sincronizar suas próprias aulas
  if (auth.role === 'teacher') {
    if (!auth.teacherId) {
      return {
        authorized: false,
        statusCode: 403,
        error: 'Permissão negada: professor sem cadastro de teacher_id vinculado.',
      };
    }
    if (!classTeacherId || classTeacherId !== auth.teacherId) {
      return {
        authorized: false,
        statusCode: 403,
        error: 'Permissão negada: você só pode sincronizar aulas atribuídas a você.',
      };
    }
    return { authorized: true, statusCode: 200 as any };
  }

  return {
    authorized: false,
    statusCode: 403,
    error: 'Permissão negada: perfil não autorizado para sincronizar aulas.',
  };
}

// 1. Status de Configuração das Credenciais do Google Cloud
googleCalendarRouter.get('/config', (req, res) => {
  try {
    const config = getGoogleConfig();
    res.json(config);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao consultar configuração.' });
  }
});

export const PROD_REDIRECT_URI =
  PROD_GOOGLE_REDIRECT_URI || 'https://institutoiacra.com.br/api/google/oauth/callback';
export const DEV_REDIRECT_URI =
  'https://ais-dev-dtbuosbavtkbqwldnldzbe-39716750309.us-east1.run.app/api/google/oauth/callback';
export const PRE_REDIRECT_URI =
  'https://ais-pre-dtbuosbavtkbqwldnldzbe-39716750309.us-east1.run.app/api/google/oauth/callback';

export const ALLOWED_OAUTH_HOSTS: Record<string, string> = {
  'institutoiacra.com.br': PROD_REDIRECT_URI,
  'www.institutoiacra.com.br': PROD_REDIRECT_URI,
  'ais-dev-dtbuosbavtkbqwldnldzbe-39716750309.us-east1.run.app': DEV_REDIRECT_URI,
  'ais-pre-dtbuosbavtkbqwldnldzbe-39716750309.us-east1.run.app': PRE_REDIRECT_URI,
};

export const ALLOWED_REDIRECT_URIS = new Set([
  PROD_REDIRECT_URI,
  DEV_REDIRECT_URI,
  PRE_REDIRECT_URI,
]);

/**
 * Extrai e normaliza o host requisitante a partir de headers de proxy ou host direto
 */
export function extractRequestHost(req: any): string {
  const rawHostHeader = req?.headers?.['x-forwarded-host'] || req?.headers?.host || '';
  const firstHost = typeof rawHostHeader === 'string' ? rawHostHeader.split(',')[0].trim() : '';
  return firstHost.replace(/:\d+$/, '').toLowerCase();
}

/**
 * Extrai e normaliza o host a partir do header Origin ou Referer, se existente
 */
export function extractOriginHost(req: any): string {
  const rawOrigin = req?.headers?.origin || req?.headers?.referer || '';
  if (typeof rawOrigin === 'string' && rawOrigin.trim()) {
    try {
      const url = new URL(rawOrigin.trim());
      return url.hostname.toLowerCase();
    } catch {
      // Ignora URL malformada
    }
  }
  return '';
}

/**
 * Resolve o redirect_uri consistente entre autorização e callback
 * baseado EXCLUSIVAMENTE nos hosts oficiais conhecidos (allowlist restrita).
 * 
 * 1. Produção: institutoiacra.com.br / www.institutoiacra.com.br -> PROD_REDIRECT_URI
 * 2. Preview oficial: ais-pre-... -> PRE_REDIRECT_URI
 * 3. Dev oficial: ais-dev-... -> DEV_REDIRECT_URI
 * 4. Rejeição explícita: Se host ou origin informados pertencerem a domínio arbitrário fora da allowlist -> retorna null
 * 5. Fallback seguro para ambiente local / testes unitários (localhost / 127.0.0.1 ou sem host explícito)
 */
export function resolveOAuthRedirectUri(req: any): string | null {
  const host = extractRequestHost(req);
  const originHost = extractOriginHost(req);

  // Validação de Origin se presente: Se origin fornecido for arbitrário fora da allowlist, rejeita
  if (originHost) {
    if (ALLOWED_OAUTH_HOSTS[originHost]) {
      return ALLOWED_OAUTH_HOSTS[originHost];
    }
    if (originHost !== 'localhost' && originHost !== '127.0.0.1') {
      return null;
    }
  }

  // Validação de Host
  if (host) {
    if (ALLOWED_OAUTH_HOSTS[host]) {
      return ALLOWED_OAUTH_HOSTS[host];
    }
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return null;
    }
  }

  // Fallback controlado para localhost / ambiente de testes
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured && ALLOWED_REDIRECT_URIS.has(configured)) {
    return configured;
  }

  return DEFAULT_GOOGLE_REDIRECT_URI;
}

// 2. Gerar URL de Autorização OAuth 2.0 (Apenas o próprio professor logado pode conectar)
googleCalendarRouter.get('/auth-url', async (req, res) => {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return res.status(401).json({ error: 'Autenticação necessária para conectar o Google Agenda.' });
    }

    const teacherId = req.query.teacher_id as string;
    if (!teacherId) {
      return res.status(400).json({ error: 'Parâmetro teacher_id é obrigatório.' });
    }

    // Regra de segurança: Apenas o próprio professor pode conectar sua conta Google
    if (auth.role === 'teacher') {
      if (teacherId !== auth.teacherId) {
        return res.status(403).json({
          error: 'Permissão negada: você só pode conectar o Google da sua própria conta de professor.',
        });
      }
    } else {
      // Super Admin / Admin não conecta conta pessoal de professor como se fosse o professor
      return res.status(403).json({
        error: 'A autorização da conta Google deve ser realizada diretamente pelo próprio professor logado.',
      });
    }

    // Determina o redirect URI de forma estrita via allowlist (nunca aceita redirect_uri livre do cliente)
    const redirectUri = resolveOAuthRedirectUri(req);
    if (!redirectUri) {
      return res.status(403).json({
        error: 'Host ou Origin não autorizado para autorização OAuth do Google Calendar.',
      });
    }

    const result = generateGoogleAuthUrl(teacherId, redirectUri);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ url: result.url });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao gerar URL de autorização.' });
  }
});

// 3. Callback OAuth 2.0 (Troca código por tokens e armazena de forma segura no backend)
googleCalendarRouter.get('/oauth/callback', async (req, res) => {
  try {
    const code = req.query.code as string;
    const stateRaw = req.query.state as string;
    const oauthError = req.query.error as string;

    if (oauthError) {
      return res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fafafa;">
            <div style="background: white; padding: 32px; border-radius: 16px; border: 1px solid #e4e4e7; max-width: 420px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
              <h3 style="color: #e11d48; margin-top: 0;">Autorização Cancelada</h3>
              <p style="color: #52525b; font-size: 14px;">Você cancelou ou recusou a permissão no Google.</p>
              <button onclick="window.close()" style="background: #e4e4e7; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Fechar Janela</button>
            </div>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_OAUTH_CANCEL' }, '*');
                setTimeout(() => window.close(), 1500);
              }
            </script>
          </body>
        </html>
      `);
    }

    if (!code || !stateRaw) {
      return res.status(400).send('Código ou parâmetro de estado inválidos.');
    }

    // Validação segura do parâmetro state (TTL de 15 minutos e integridade)
    let teacherId = '';
    let stateRedirectUri = '';
    const STATE_TTL_MS = 15 * 60 * 1000;

    try {
      const parsed = JSON.parse(stateRaw);
      if (!parsed.teacherId || typeof parsed.teacherId !== 'string') {
        return res.status(400).send('Parâmetro state inválido: teacherId ausente.');
      }
      if (!parsed.ts || typeof parsed.ts !== 'number') {
        return res.status(400).send('Parâmetro state inválido: timestamp ausente.');
      }
      const age = Date.now() - parsed.ts;
      if (age < 0 || age > STATE_TTL_MS) {
        return res.status(400).send('Parâmetro state expirado. Inicie uma nova autorização.');
      }
      teacherId = parsed.teacherId;
      if (parsed.redirectUri && typeof parsed.redirectUri === 'string') {
        stateRedirectUri = parsed.redirectUri;
      }
    } catch {
      return res.status(400).send('Parâmetro state corrompido ou malformado.');
    }

    // Validação estrita da allowlist para redirectUri vindo do state
    if (stateRedirectUri && !ALLOWED_REDIRECT_URIS.has(stateRedirectUri)) {
      return res.status(400).send('Redirect URI no parâmetro state não pertence à allowlist autorizada.');
    }

    const redirectUri = stateRedirectUri || resolveOAuthRedirectUri(req);
    if (!redirectUri) {
      return res.status(403).send('Host ou Origin não autorizado para callback OAuth.');
    }

    // Preservar configuração existente em caso de reautorização sem desconectar
    const existingAccount = await getTeacherGoogleAccount(teacherId);

    const tokenRes = await handleGoogleOAuthCallback(code, redirectUri, existingAccount?.refresh_token);
    if (!tokenRes.success || !tokenRes.refresh_token) {
      return res.status(500).send(`Erro ao conectar com Google: ${tokenRes.error}`);
    }

    // Salvar/atualizar conta do professor (UPSERT)
    await saveTeacherGoogleAccount({
      teacher_id: teacherId,
      google_email: tokenRes.email || existingAccount?.google_email || 'conectado@google.com',
      google_calendar_id: existingAccount?.google_calendar_id || 'primary',
      refresh_token: tokenRes.refresh_token,
      access_token: tokenRes.access_token || null,
      token_expires_at: tokenRes.token_expires_at || null,
      connection_status: 'connected',
      connected_at: existingAccount?.connected_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #fafafa;">
          <div style="background: white; padding: 32px; border-radius: 16px; border: 1px solid #e4e4e7; max-width: 420px; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div style="width: 48px; height: 48px; background: #ecfdf5; color: #059669; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px; font-size: 24px;">✓</div>
            <h3 style="color: #0f172a; margin: 0 0 8px 0;">Google Agenda Conectada!</h3>
            <p style="color: #52525b; font-size: 14px; margin-bottom: 20px;">Conta: <strong>${tokenRes.email}</strong></p>
            <p style="color: #71717a; font-size: 12px;">Esta janela será fechada automaticamente...</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_OAUTH_SUCCESS', teacherId: '${teacherId}', email: '${tokenRes.email}' }, '*');
              setTimeout(() => window.close(), 1200);
            } else {
              window.location.href = '/?google_connected=true';
            }
          </script>
        </body>
      </html>
    `);
  } catch (err: any) {
    res.status(500).send(`Erro interno ao processar OAuth: ${err?.message}`);
  }
});

// 4. Consultar Status da Conexão do Professor (NUNCA expõe tokens!)
googleCalendarRouter.get('/account/:teacherId', async (req, res) => {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return res.status(401).json({ error: 'Autenticação necessária para consultar conta.' });
    }

    const { teacherId } = req.params;

    // Regra de segurança: Professor A não pode consultar status do Professor B
    if (auth.role === 'teacher') {
      if (teacherId !== auth.teacherId) {
        return res.status(403).json({
          error: 'Permissão negada: você só pode consultar o status da sua própria conta de professor.',
        });
      }
    }

    const account = await getTeacherGoogleAccount(teacherId);

    if (!account || account.connection_status !== 'connected') {
      return res.json({
        connected: false,
        googleEmail: null,
        connectedAt: null,
        connectionStatus: 'disconnected',
      });
    }

    res.json({
      connected: true,
      googleEmail: account.google_email,
      connectedAt: account.connected_at,
      connectionStatus: account.connection_status,
      calendarId: account.google_calendar_id || 'primary',
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao consultar conta.' });
  }
});

// 5. Desconectar Conta Google do Professor
googleCalendarRouter.post('/disconnect', async (req, res) => {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return res.status(401).json({ error: 'Autenticação necessária para desconectar a conta.' });
    }

    const { teacherId } = req.body;
    if (!teacherId) {
      return res.status(400).json({ error: 'teacherId é obrigatório.' });
    }

    // Regra de segurança: Professor só pode desconectar a sua própria conta
    if (auth.role === 'teacher') {
      if (teacherId !== auth.teacherId) {
        return res.status(403).json({
          error: 'Permissão negada: você só pode desconectar a sua própria conta.',
        });
      }
    } else if (auth.role !== 'super_admin') {
      return res.status(403).json({
        error: 'Permissão negada: apenas o próprio professor ou o Super Administrador podem desconectar.',
      });
    }

    await deleteTeacherGoogleAccount(teacherId);
    res.json({ success: true, message: 'Google Agenda desconectada com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao desconectar.' });
  }
});

// 6. Sincronizar Aula Específica (Create, Update ou Delete)
googleCalendarRouter.post('/sync-class', async (req, res) => {
  try {
    const authRes = await resolveAuthenticatedUser(req);
    const payload = req.body;
    if (!payload || !payload.classSession || !payload.action) {
      return res.status(400).json({ error: 'Payload de sincronização inválido.' });
    }

    const classTeacherId = payload.googleSyncContext?.teacherId || payload.classSession.teacher_id;
    const authCheck = checkSyncAuthorization(authRes.user, classTeacherId, authRes);
    if (!authCheck.authorized) {
      return res.status(authCheck.statusCode).json({
        synced: false,
        error: authCheck.error,
      });
    }

    const result = await syncClassToGoogle(payload);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ synced: false, error: err?.message || 'Erro ao sincronizar aula.' });
  }
});

// 6.1. Consultar Contexto Seguro para Exclusão de Aula (com supabaseAdmin)
googleCalendarRouter.post('/class-delete-context', async (req, res) => {
  try {
    const authRes = await resolveAuthenticatedUser(req);
    const auth = authRes.user;
    const { classId } = req.body;
    if (!classId) {
      return res.status(400).json({ error: 'classId é obrigatório.' });
    }

    const adminDb = routesAdminClient || supabaseAdmin;
    const { data: mapping, error: mapErr } = await adminDb
      .from('class_google_events')
      .select('platform_class_id, google_event_id, google_calendar_id, teacher_id')
      .eq('platform_class_id', classId)
      .maybeSingle();

    if (mapErr) {
      console.warn('[GoogleCalendarRoutes] Erro ao buscar class-delete-context:', mapErr);
    }

    if (mapping && mapping.google_event_id) {
      let resolvedTeacherId: string | null = mapping.teacher_id || null;
      if (!resolvedTeacherId) {
        const { data: classForMapping } = await adminDb
          .from('classes')
          .select('teacher_id')
          .eq('id', classId)
          .maybeSingle();
        if (classForMapping?.teacher_id) {
          resolvedTeacherId = classForMapping.teacher_id;
        }
      }

      const authCheck = checkSyncAuthorization(auth, resolvedTeacherId, authRes);
      if (!authCheck.authorized) {
        return res.status(authCheck.statusCode).json({ error: authCheck.error });
      }

      return res.json({
        exists: true,
        googleEventId: mapping.google_event_id,
        googleCalendarId: mapping.google_calendar_id || 'primary',
        teacherId: resolvedTeacherId,
      });
    }

    // Se não há mapping, verifica se a aula existe no banco para checar permissão
    const { data: classRow } = await adminDb
      .from('classes')
      .select('teacher_id')
      .eq('id', classId)
      .maybeSingle();

    if (classRow) {
      const authCheck = checkSyncAuthorization(auth, classRow.teacher_id, authRes);
      if (!authCheck.authorized) {
        return res.status(authCheck.statusCode).json({ error: authCheck.error });
      }
    } else {
      if (!auth) {
        return res.status(authRes.statusCode === 403 ? 403 : 401).json({ error: authRes.error || 'Autenticação necessária.' });
      }
    }

    return res.json({ exists: false });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao consultar contexto de exclusão.' });
  }
});

// 7. Sincronizar Aulas Futuras após primeira conexão
googleCalendarRouter.post('/sync-future', async (req, res) => {
  try {
    const authRes = await resolveAuthenticatedUser(req);
    const { teacherId, classes } = req.body;
    if (!teacherId || !Array.isArray(classes)) {
      return res.status(400).json({ error: 'teacherId e array de classes são obrigatórios.' });
    }

    const authCheck = checkSyncAuthorization(authRes.user, teacherId, authRes);
    if (!authCheck.authorized) {
      return res.status(authCheck.statusCode).json({
        error: authCheck.error,
      });
    }

    const result = await syncFutureClassesToGoogle(teacherId, classes);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao sincronizar aulas futuras.' });
  }
});

// 8. Resincronizar Aula Existente de Forma Segura e Idempotente
googleCalendarRouter.post('/resync-class/:classId', async (req, res) => {
  try {
    const authRes = await resolveAuthenticatedUser(req);
    const { classId } = req.params;
    if (!classId) {
      return res.status(400).json({ error: 'Parâmetro classId é obrigatório.' });
    }

    const adminDb = routesAdminClient || supabaseAdmin;
    const { data: classRow, error: classErr } = await adminDb
      .from('classes')
      .select('teacher_id')
      .eq('id', classId)
      .maybeSingle();

    if (classErr || !classRow) {
      return res.status(404).json({ error: 'Aula não encontrada no banco de dados.' });
    }

    const authCheck = checkSyncAuthorization(authRes.user, classRow.teacher_id, authRes);
    if (!authCheck.authorized) {
      return res.status(authCheck.statusCode).json({ error: authCheck.error });
    }

    const result = await resyncExistingClass(classId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao resincronizar aula.' });
  }
});

// 9. Reconciliar Aulas Pendentes/Sem Vínculo com Google Calendar de Forma Segura e Idempotente
googleCalendarRouter.post('/reconcile', async (req, res) => {
  try {
    const authRes = await resolveAuthenticatedUser(req);
    if (!authRes.authenticated || !authRes.user) {
      return res.status(authRes.statusCode).json({ error: authRes.error || 'Autenticação necessária.' });
    }

    const { teacherId, maxBatchSize, delayMs } = req.body || {};

    // Autorização:
    // - super_admin e admin: podem reconciliar todas as aulas ou passar um teacherId específico
    // - teacher: pode reconciliar APENAS seu próprio teacherId
    if (authRes.user.role === 'teacher') {
      if (!authRes.user.teacherId) {
        return res.status(403).json({ error: 'Professor sem vínculo oficial configurado no perfil.' });
      }
      if (teacherId && teacherId !== authRes.user.teacherId) {
        return res.status(403).json({ error: 'Permissão negada: professor só pode reconciliar suas próprias aulas.' });
      }
    }

    const targetTeacherId = authRes.user.role === 'teacher' ? authRes.user.teacherId : (teacherId || null);

    const result = await reconcileUnsyncedClasses({
      teacherId: targetTeacherId,
      maxBatchSize: typeof maxBatchSize === 'number' ? maxBatchSize : undefined,
      delayMs: typeof delayMs === 'number' ? delayMs : undefined,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao executar reconciliação de aulas.' });
  }
});

// 10. Listar Aulas Futuras ou de Hoje Sem Vínculo / Não Sincronizadas
googleCalendarRouter.get('/unsynced-classes', async (req, res) => {
  try {
    const authRes = await resolveAuthenticatedUser(req);
    if (!authRes.authenticated || !authRes.user) {
      return res.status(authRes.statusCode).json({ error: authRes.error || 'Autenticação necessária.' });
    }

    let targetTeacherId: string | null = null;
    if (authRes.user.role === 'teacher') {
      if (!authRes.user.teacherId) {
        return res.status(403).json({ error: 'Professor sem vínculo oficial configurado no perfil.' });
      }
      targetTeacherId = authRes.user.teacherId;
    } else {
      const qTeacher = req.query.teacherId;
      targetTeacherId = typeof qTeacher === 'string' && qTeacher ? qTeacher : null;
    }

    const result = await getUnsyncedClassesList({ teacherId: targetTeacherId });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao consultar aulas sem sincronização.' });
  }
});

// 11. Atualizar com Segurança o Lembrete de Aulas Futuras Já Vinculadas (24h / 1440 min)
googleCalendarRouter.post('/update-future-reminders', async (req, res) => {
  try {
    const authRes = await resolveAuthenticatedUser(req);
    if (!authRes.authenticated || !authRes.user) {
      return res.status(authRes.statusCode).json({ error: authRes.error || 'Autenticação necessária.' });
    }

    const { teacherId, maxBatchSize, delayMs } = req.body || {};

    if (authRes.user.role === 'teacher') {
      if (!authRes.user.teacherId) {
        return res.status(403).json({ error: 'Professor sem vínculo oficial configurado no perfil.' });
      }
      if (teacherId && teacherId !== authRes.user.teacherId) {
        return res.status(403).json({ error: 'Permissão negada: professor só pode atualizar lembretes de suas próprias aulas.' });
      }
    }

    const targetTeacherId = authRes.user.role === 'teacher' ? authRes.user.teacherId : (teacherId || null);

    const result = await updateExistingFutureClassesReminders({
      teacherId: targetTeacherId,
      maxBatchSize: typeof maxBatchSize === 'number' ? maxBatchSize : undefined,
      delayMs: typeof delayMs === 'number' ? delayMs : undefined,
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao atualizar lembretes das aulas no Google Calendar.' });
  }
});

// 12. Sincronização Inbound Manual: Puxar eventos criados pelo professor no Google Calendar para o EAVRA
googleCalendarRouter.post('/pull-events', async (req, res) => {
  try {
    const authRes = await resolveAuthenticatedUser(req);
    if (!authRes.authenticated || !authRes.user) {
      return res.status(authRes.statusCode).json({ error: authRes.error || 'Autenticação necessária.' });
    }

    const { teacherId, forceFullSync } = req.body || {};

    // Autorização:
    // - super_admin e admin: podem sincronizar qualquer professor ou todos
    // - teacher: pode sincronizar APENAS seu próprio teacherId
    if (authRes.user.role === 'teacher') {
      if (!authRes.user.teacherId) {
        return res.status(403).json({ error: 'Professor sem vínculo oficial configurado no perfil.' });
      }
      if (teacherId && teacherId !== authRes.user.teacherId) {
        return res.status(403).json({
          error: 'Permissão negada: professor só pode sincronizar suas próprias aulas da agenda Google.',
        });
      }
    }

    const targetTeacherId = authRes.user.role === 'teacher' ? authRes.user.teacherId : (teacherId || null);

    const result = await pullGoogleEvents({
      teacherId: targetTeacherId,
      forceFullSync: Boolean(forceFullSync),
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao sincronizar eventos do Google Calendar para o sistema.' });
  }
});




