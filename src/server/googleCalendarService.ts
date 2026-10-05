/**
 * Google Calendar Integration Service (Backend / Server-Side Only)
 * 
 * Regras Obrigatórias:
 * 1. Sentido Único: PLATAFORMA -> GOOGLE AGENDA (Nunca Google -> Plataforma).
 * 2. Plataforma é a Única Fonte da Verdade.
 * 3. Uso estritamente OPCIONAL para cada professor.
 * 4. Tokens e Client Secret NUNCA expostos ao cliente/frontend.
 * 5. Falhas no Google NUNCA bloqueiam nem revertem operações da plataforma.
 */

import { createClient } from '@supabase/supabase-js';

export interface TeacherGoogleAccount {
  teacher_id: string;
  google_email: string;
  google_calendar_id: string;
  refresh_token: string;
  access_token?: string | null;
  token_expires_at?: string | null;
  connection_status: 'connected' | 'disconnected' | 'error';
  connected_at: string;
  updated_at: string;
}

export interface ClassGoogleEvent {
  platform_class_id: string;
  teacher_id?: string | null;
  google_calendar_id: string;
  google_event_id?: string | null;
  last_synced_at: string;
  sync_status: 'synced' | 'pending' | 'failed';
  last_error?: string | null;
}

export interface GoogleSyncContext {
  platformClassId?: string;
  googleEventId: string;
  googleCalendarId?: string;
  teacherId?: string | null;
}

export interface SyncClassPayload {
  action: 'create' | 'update' | 'delete';
  classSession: {
    id: string;
    teacher_id?: string | null;
    title: string;
    date: string;
    start_time: string;
    end_time: string;
    status?: 'scheduled' | 'completed' | 'cancelled' | null;
    group_id?: string | null;
    student_ids?: string[];
  };
  previousTeacherId?: string | null;
  studentName?: string;
  groupName?: string;
  googleSyncContext?: GoogleSyncContext;
  checkGoogleApiForDuplicates?: boolean;
}

// Configuração Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ldumzwrwbhjtrnlioigg.supabase.co';
const rawSupabaseKey = (process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').replace(/^.*?eyJ/, 'eyJ').trim();
const supabaseKey = rawSupabaseKey.startsWith('eyJ')
  ? rawSupabaseKey
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdW16d3J3YmhqdHJubGlvaWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTU0MDcsImV4cCI6MjA4ODYzMTQwN30.PgzhWMBsYifm6ADnYm-EQu83DK9BShDQAVZlQw5sayU';

// Cliente administrativo exclusivo de servidor para teacher_google_accounts e class_google_events
// Suporta a nova Supabase Secret Key (prefixo sb_...) e JWT legado (prefixo eyJ...)
const rawSecretInput = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

let adminKey: string | null = null;
let secretFormat: 'sb_secret' | 'legacy' | 'unknown' = 'unknown';

if (rawSecretInput.startsWith('sb_')) {
  // Nova Secret Key do Supabase (ex: sb_secret_... ou sb_...): usar valor exato sem sanitização de JWT
  adminKey = rawSecretInput;
  secretFormat = 'sb_secret';
} else if (rawSecretInput.includes('eyJ')) {
  // Chave JWT legada: aplicar limpeza de prefixo existente
  const cleaned = rawSecretInput.replace(/^.*?eyJ/, 'eyJ').trim();
  if (cleaned.startsWith('eyJ')) {
    adminKey = cleaned;
    secretFormat = 'legacy';
  }
}

// Diagnóstico seguro em termos de flags (sem expor valores, tamanhos ou hashes)
console.log(`[GoogleService Backend] SUPABASE_SECRET_KEY configured: ${Boolean(rawSecretInput)}`);
console.log(`[GoogleService Backend] SUPABASE_SECRET_KEY format: ${secretFormat}`);
console.log(`[GoogleService Backend] supabaseAdmin initialized: ${Boolean(adminKey)}`);

export const supabaseAdmin = adminKey
  ? createClient(supabaseUrl, adminKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  : createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

// Cliente padrão para consultas com anon key
const supabase = supabaseAdmin;

// Helper seguro de log para diagnóstico de banco sem expor secrets ou tokens
function logSupabaseDiagnostic(operation: string, table: string, err: any) {
  if (!err) return;
  const code = err.code || 'UNKNOWN';
  const msg = err.message || '';
  if (code === 'PGRST205' || msg.includes('schema cache')) {
    console.warn(`[Supabase Remote] ${operation} em ${table}: tabela inexistente no schema cache (${code}).`);
  } else if (code === '42501' || msg.includes('row-level security')) {
    console.warn(`[Supabase Remote] ${operation} em ${table}: bloqueio de política RLS (${code}). Verifique se SUPABASE_SECRET_KEY é uma chave service_role válida.`);
  } else if (msg.includes('API key') || code === 'PGRST301') {
    console.warn(`[Supabase Remote] ${operation} em ${table}: chave de API inválida ou expirada (${code}).`);
  } else {
    console.warn(`[Supabase Remote] ${operation} em ${table}: erro ${code} - ${msg.substring(0, 100)}`);
  }
}

// ============================================================================
// Métodos de Acesso a Dados (Supabase Remoto Exclusivo)
// ============================================================================

export async function getTeacherGoogleAccount(teacherId: string): Promise<TeacherGoogleAccount | null> {
  if (!teacherId) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('teacher_google_accounts')
      .select('*')
      .eq('teacher_id', teacherId)
      .maybeSingle();

    if (error) {
      logSupabaseDiagnostic('SELECT', 'teacher_google_accounts', error);
      return null;
    }

    if (data) {
      if (data.connection_status === 'disconnected') {
        return null;
      }
      return data as TeacherGoogleAccount;
    }
    return null;
  } catch (err) {
    logSupabaseDiagnostic('SELECT', 'teacher_google_accounts', err);
    return null;
  }
}

export async function saveTeacherGoogleAccount(account: TeacherGoogleAccount): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('teacher_google_accounts').upsert({
      teacher_id: account.teacher_id,
      google_email: account.google_email,
      google_calendar_id: account.google_calendar_id || 'primary',
      refresh_token: account.refresh_token,
      access_token: account.access_token || null,
      token_expires_at: account.token_expires_at || null,
      connection_status: account.connection_status,
      connected_at: account.connected_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (error) {
      logSupabaseDiagnostic('UPSERT', 'teacher_google_accounts', error);
      throw new Error(error.message || 'Erro ao persistir conta Google no Supabase.');
    }
  } catch (err) {
    logSupabaseDiagnostic('UPSERT', 'teacher_google_accounts', err);
    throw err;
  }
}

export async function deleteTeacherGoogleAccount(teacherId: string): Promise<void> {
  try {
    const { error: delError } = await supabaseAdmin
      .from('teacher_google_accounts')
      .delete()
      .eq('teacher_id', teacherId);

    if (delError) {
      logSupabaseDiagnostic('DELETE', 'teacher_google_accounts', delError);

      const { error: updError } = await supabaseAdmin
        .from('teacher_google_accounts')
        .update({
          connection_status: 'disconnected',
          refresh_token: '',
          access_token: null,
          token_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('teacher_id', teacherId);

      if (updError) {
        logSupabaseDiagnostic('UPDATE (fallback disconnect)', 'teacher_google_accounts', updError);
        throw new Error(updError.message || 'Erro ao desconectar conta Google no banco de dados.');
      }
    }
  } catch (err: any) {
    logSupabaseDiagnostic('DELETE', 'teacher_google_accounts', err);
    throw err;
  }
}

export async function getClassGoogleEvent(classId: string): Promise<ClassGoogleEvent | null> {
  if (!classId) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('class_google_events')
      .select('*')
      .eq('platform_class_id', classId)
      .maybeSingle();

    if (error) {
      logSupabaseDiagnostic('SELECT', 'class_google_events', error);
      return null;
    }

    if (data) {
      return data as ClassGoogleEvent;
    }
    return null;
  } catch (err) {
    logSupabaseDiagnostic('SELECT', 'class_google_events', err);
    return null;
  }
}

export async function saveClassGoogleEvent(event: ClassGoogleEvent): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('class_google_events').upsert({
      platform_class_id: event.platform_class_id,
      teacher_id: event.teacher_id || null,
      google_calendar_id: event.google_calendar_id || 'primary',
      google_event_id: event.google_event_id || null,
      last_synced_at: event.last_synced_at || new Date().toISOString(),
      sync_status: event.sync_status,
      last_error: event.last_error || null,
    });

    if (error) {
      logSupabaseDiagnostic('UPSERT', 'class_google_events', error);
    }
  } catch (err) {
    logSupabaseDiagnostic('UPSERT', 'class_google_events', err);
  }
}

export async function deleteClassGoogleEventRecord(classId: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from('class_google_events').delete().eq('platform_class_id', classId);
    if (error) {
      logSupabaseDiagnostic('DELETE', 'class_google_events', error);
    }
  } catch (err) {
    logSupabaseDiagnostic('DELETE', 'class_google_events', err);
  }
}


// ============================================================================
// Configuração e OAuth Google
// ============================================================================

export const PROD_GOOGLE_REDIRECT_URI =
  'https://institutoiacra.com.br/api/google/oauth/callback';

export const DEFAULT_GOOGLE_REDIRECT_URI =
  'https://ais-pre-dtbuosbavtkbqwldnldzbe-39716750309.us-east1.run.app/api/google/oauth/callback';

export function getEffectiveRedirectUri(candidateUri?: string): string {
  if (candidateUri && candidateUri.trim()) {
    return candidateUri.trim();
  }
  if (process.env.GOOGLE_REDIRECT_URI && process.env.GOOGLE_REDIRECT_URI.trim()) {
    return process.env.GOOGLE_REDIRECT_URI.trim();
  }
  return DEFAULT_GOOGLE_REDIRECT_URI;
}

export function validateGoogleOAuthConfig(): { valid: boolean; error?: string } {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const redirectUri = getEffectiveRedirectUri();

  if (!clientId) {
    return { valid: false, error: 'Google OAuth misconfigured: GOOGLE_CLIENT_ID is missing.' };
  }
  if (!clientSecret) {
    return { valid: false, error: 'Google OAuth misconfigured: GOOGLE_CLIENT_SECRET is missing.' };
  }
  if (!redirectUri) {
    return { valid: false, error: 'Google OAuth misconfigured: GOOGLE_REDIRECT_URI is missing.' };
  }
  if (clientSecret === clientId) {
    console.error('Google OAuth misconfigured: GOOGLE_CLIENT_SECRET matches GOOGLE_CLIENT_ID.');
    return { valid: false, error: 'Google OAuth misconfigured: GOOGLE_CLIENT_SECRET matches GOOGLE_CLIENT_ID.' };
  }

  return { valid: true };
}

export function getGoogleConfig() {
  const validation = validateGoogleOAuthConfig();
  if (!validation.valid) {
    return {
      configured: false,
      clientId: null,
      error: validation.error,
    };
  }

  return {
    configured: true,
    clientId: process.env.GOOGLE_CLIENT_ID!.trim(),
  };
}

export const GOOGLE_CALENDAR_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.owned',
  'https://www.googleapis.com/auth/userinfo.email',
];

export function generateGoogleAuthUrl(teacherId: string, redirectUri: string): { url?: string; error?: string } {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!clientId) {
    return {
      error: 'Google OAuth não configurado corretamente. GOOGLE_CLIENT_ID ausente no servidor.',
    };
  }

  const effectiveRedirect = redirectUri || getEffectiveRedirectUri();
  const scope = encodeURIComponent(GOOGLE_CALENDAR_OAUTH_SCOPES.join(' '));
  const state = encodeURIComponent(JSON.stringify({ teacherId, redirectUri: effectiveRedirect, ts: Date.now() }));
  const encodedRedirect = encodeURIComponent(effectiveRedirect);

  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
    clientId
  )}&redirect_uri=${encodedRedirect}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;

  return { url };
}

export async function handleGoogleOAuthCallback(
  code: string,
  redirectUri: string,
  existingRefreshToken?: string | null
): Promise<{
  success: boolean;
  teacherId?: string;
  email?: string;
  refresh_token?: string;
  access_token?: string;
  token_expires_at?: string;
  error?: string;
}> {
  const validation = validateGoogleOAuthConfig();
  if (!validation.valid) {
    return { success: false, error: validation.error || 'Google OAuth não configurado corretamente no servidor.' };
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!.trim();

  try {
    // Troca de código de autorização por tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return { success: false, error: `Falha na obtenção do token Google: ${errText}` };
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = (tokenData.refresh_token || existingRefreshToken || '').trim();
    const expiresIn = tokenData.expires_in || 3600;

    if (!refreshToken) {
      return {
        success: false,
        error: 'Google não retornou refresh_token. Desconecte e tente autorizar novamente com consentimento.',
      };
    }

    // Obter email da conta conectada
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    let googleEmail = 'conectado@google.com';
    if (userRes.ok) {
      const userData = await userRes.json();
      googleEmail = userData.email || googleEmail;
    }

    return {
      success: true,
      email: googleEmail,
      ...tokenData,
      refresh_token: refreshToken,
      access_token: accessToken,
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro inesperado na autenticação OAuth.' };
  }
}

export async function getValidAccessToken(
  account: TeacherGoogleAccount,
  options?: { forceRefresh?: boolean }
): Promise<string | null> {
  // Verificar se o token de acesso atual ainda é válido (com margem de 5 minutos)
  if (!options?.forceRefresh && account.access_token && account.token_expires_at) {
    const expiresTime = new Date(account.token_expires_at).getTime();
    if (!Number.isNaN(expiresTime) && Date.now() + 5 * 60 * 1000 < expiresTime) {
      return account.access_token;
    }
  }

  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const refreshToken = (account.refresh_token || '').trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  // Atualizar token com refresh_token
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });

    if (!res.ok) {
      console.warn(`[GoogleCalendar] Erro ao renovar token do professor ${account.teacher_id} (HTTP ${res.status})`);
      return null;
    }

    const data = await res.json();
    const newAccessToken = data.access_token;
    if (!newAccessToken) {
      return null;
    }
    const expiresIn = data.expires_in || 3600;

    // Atualizar no registro da conta (preservando eventual novo refresh_token rotacionado pelo Google)
    account.access_token = newAccessToken;
    if (data.refresh_token && typeof data.refresh_token === 'string' && data.refresh_token.trim()) {
      account.refresh_token = data.refresh_token.trim();
    }
    account.token_expires_at = new Date(Date.now() + expiresIn * 1000).toISOString();
    account.updated_at = new Date().toISOString();
    await saveTeacherGoogleAccount(account);

    return newAccessToken;
  } catch (err) {
    console.warn(`[GoogleCalendar] Falha ao renovar token de acesso:`, err);
    return null;
  }
}

// ============================================================================
// Formatação de Eventos e Horários
// ============================================================================

export function getTodaySaoPaulo(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

export function formatDateTimeSaoPaulo(dateStr: string, timeStr: string): string {
  // Limpar formato de hora (ex: "14:00" ou "14:00:00")
  const cleanTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr.slice(0, 8);
  // Fuso horário de Brasília (UTC-3)
  return `${dateStr}T${cleanTime}-03:00`;
}

export interface GoogleCalendarReminders {
  useDefault: boolean;
  overrides?: Array<{
    method: 'popup' | 'email' | string;
    minutes: number;
  }>;
}

export const EAVRA_DEFAULT_REMINDERS: GoogleCalendarReminders = {
  useDefault: false,
  overrides: [
    {
      method: 'popup',
      minutes: 1440, // 24 horas antes da aula (1 dia)
    },
  ],
};

export function formatClassEventSummary(title: string, studentName?: string, groupName?: string): string {
  if (groupName && groupName.trim()) {
    return `Aula de ${title} - ${groupName.trim()}`;
  }
  if (studentName && studentName.trim()) {
    return `Aula de ${title} - ${studentName.trim()}`;
  }
  return `Aula de ${title}`;
}

export function formatGoogleCalendarEvent(
  classSession: { id: string; title: string; date: string; start_time: string; end_time: string },
  studentName?: string,
  groupName?: string
) {
  const summary = formatClassEventSummary(classSession.title, studentName, groupName);
  const startDateTime = formatDateTimeSaoPaulo(classSession.date, classSession.start_time);
  const endDateTime = formatDateTimeSaoPaulo(classSession.date, classSession.end_time);
  const description = [
    `Aula gerenciada pela plataforma.`,
    `ID da Aula: ${classSession.id}`,
    `Título: ${classSession.title}`,
    studentName ? `Aluno(s): ${studentName}` : null,
    groupName ? `Grupo: ${groupName}` : null,
    `\n⚠️ ATENÇÃO: Gerenciado exclusivamente pela plataforma. Alterações feitas diretamente no Google Agenda não serão refletidas no sistema.`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    summary,
    description,
    start: {
      dateTime: startDateTime,
      timeZone: 'America/Sao_Paulo',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'America/Sao_Paulo',
    },
    reminders: {
      useDefault: false,
      overrides: [
        {
          method: 'popup',
          minutes: 1440,
        },
      ],
    },
  };
}

/**
 * Busca por evento já existente no Google Calendar para a mesma aula (idempotência defensiva).
 */
export async function findExistingGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  classId: string,
  startDateTime: string,
  endDateTime: string
): Promise<{ found: boolean; eventId?: string }> {
  try {
    const startDate = new Date(startDateTime);
    const endDate = new Date(endDateTime);
    const timeMin = new Date(startDate.getTime() - 120000).toISOString();
    const timeMax = new Date(endDate.getTime() + 120000).toISOString();
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      return { found: false };
    }
    const data = await res.json();
    const items = data.items || [];
    for (const item of items) {
      if (item.status === 'cancelled') continue;
      if (item.description && item.description.includes(classId)) {
        return { found: true, eventId: item.id };
      }
    }
  } catch (e) {
    console.warn('[GoogleCalendar findExistingEvent]', e);
  }
  return { found: false };
}

// ============================================================================
// Operações do Google Calendar (Unidirecional: Plataforma -> Google)
// ============================================================================

export async function createGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventData: {
    summary: string;
    description: string;
    startDateTime: string;
    endDateTime: string;
    reminders?: {
      useDefault: boolean;
      overrides?: Array<{ method: string; minutes: number }>;
    };
  }
): Promise<{
  success: boolean;
  eventId?: string;
  httpStatus?: number;
  googleErrorCode?: string | null;
  error?: string;
}> {
  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: eventData.summary,
        description: eventData.description,
        start: {
          dateTime: eventData.startDateTime,
          timeZone: 'America/Sao_Paulo',
        },
        end: {
          dateTime: eventData.endDateTime,
          timeZone: 'America/Sao_Paulo',
        },
        reminders: eventData.reminders ?? EAVRA_DEFAULT_REMINDERS,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      let googleErrorCode: string | null = String(res.status);
      try {
        const parsedErr = JSON.parse(errText);
        googleErrorCode =
          parsedErr?.error?.errors?.[0]?.reason ||
          (parsedErr?.error?.code ? String(parsedErr.error.code) : String(res.status));
      } catch {
        // Texto puro
      }
      console.warn('[GoogleCalendar events.insert]', {
        calendarId,
        endpoint: 'Google Calendar API v3 events.insert',
        httpStatus: res.status,
        googleErrorCode,
        eventId: null,
      });
      return {
        success: false,
        httpStatus: res.status,
        googleErrorCode,
        error: `Google API erro (${res.status}): ${errText}`,
      };
    }

    const created = await res.json();
    const createdEventId = created?.id ? String(created.id) : undefined;
    console.log('[GoogleCalendar events.insert]', {
      calendarId,
      endpoint: 'Google Calendar API v3 events.insert',
      httpStatus: res.status,
      googleErrorCode: null,
      eventId: createdEventId || null,
    });

    if (!createdEventId) {
      return {
        success: false,
        httpStatus: res.status,
        googleErrorCode: 'MISSING_EVENT_ID',
        error: 'Google Calendar API respondeu sem eventId.',
      };
    }

    return { success: true, eventId: createdEventId, httpStatus: res.status, googleErrorCode: null };
  } catch (err: any) {
    console.warn('[GoogleCalendar events.insert]', {
      calendarId,
      endpoint: 'Google Calendar API v3 events.insert',
      httpStatus: 0,
      googleErrorCode: 'NETWORK_ERROR',
      eventId: null,
    });
    return {
      success: false,
      httpStatus: 0,
      googleErrorCode: 'NETWORK_ERROR',
      error: err?.message || 'Erro de rede ao conectar com a API do Google Calendar.',
    };
  }
}

export async function updateGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  eventData: {
    summary?: string;
    description?: string;
    startDateTime?: string;
    endDateTime?: string;
    reminders?: {
      useDefault: boolean;
      overrides?: Array<{ method: string; minutes: number }>;
    };
  }
): Promise<{ success: boolean; httpStatus?: number; error?: string }> {
  try {
    const patchBody: Record<string, any> = {
      reminders: eventData.reminders ?? EAVRA_DEFAULT_REMINDERS,
    };
    if (eventData.summary !== undefined) patchBody.summary = eventData.summary;
    if (eventData.description !== undefined) patchBody.description = eventData.description;
    if (eventData.startDateTime !== undefined) {
      patchBody.start = {
        dateTime: eventData.startDateTime,
        timeZone: 'America/Sao_Paulo',
      };
    }
    if (eventData.endDateTime !== undefined) {
      patchBody.end = {
        dateTime: eventData.endDateTime,
        timeZone: 'America/Sao_Paulo',
      };
    }

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patchBody),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return {
        success: false,
        httpStatus: res.status,
        error: `Google API PATCH erro (${res.status}): ${errText}`,
      };
    }

    return { success: true, httpStatus: res.status };
  } catch (err: any) {
    return {
      success: false,
      httpStatus: 0,
      error: err?.message || 'Erro de rede ao atualizar evento no Google Calendar.',
    };
  }
}

export async function deleteGoogleCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<{
  success: boolean;
  statusCode?: number;
  rateLimited?: boolean;
  retryable?: boolean;
  error?: string;
}> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    // 204 (ou 2xx) = Sucesso; 404/410 = Idempotência (evento já não existe no Google)
    if (res.ok || res.status === 204 || res.status === 404 || res.status === 410) {
      console.log('[GoogleCalendar events.delete]', {
        calendarId,
        eventId,
        endpoint: 'Google Calendar API v3 events.delete',
        httpStatus: res.status,
        success: true,
      });
      return { success: true, statusCode: res.status };
    }

    const errText = await res.text();
    console.warn('[GoogleCalendar events.delete]', {
      calendarId,
      eventId,
      endpoint: 'Google Calendar API v3 events.delete',
      httpStatus: res.status,
      success: false,
    });
    const isQuotaOrRateLimit =
      res.status === 429 ||
      errText.includes('rateLimitExceeded') ||
      errText.includes('quotaExceeded') ||
      errText.includes('userRateLimitExceeded');

    if (res.status === 401) {
      return {
        success: false,
        statusCode: 401,
        retryable: false,
        error: `Google API DELETE erro de autenticação (401): ${errText}`,
      };
    }

    if (res.status === 403) {
      return {
        success: false,
        statusCode: 403,
        rateLimited: isQuotaOrRateLimit,
        retryable: isQuotaOrRateLimit,
        error: isQuotaOrRateLimit
          ? `Google API DELETE limite de taxa excedido (403): ${errText}`
          : `Google API DELETE erro de permissão (403): ${errText}`,
      };
    }

    if (res.status === 429) {
      return {
        success: false,
        statusCode: 429,
        rateLimited: true,
        retryable: true,
        error: `Google API DELETE rate limit (429): ${errText}`,
      };
    }

    if (res.status >= 500) {
      return {
        success: false,
        statusCode: res.status,
        retryable: true,
        error: `Google API DELETE erro de servidor (${res.status}): ${errText}`,
      };
    }

    return {
      success: false,
      statusCode: res.status,
      retryable: false,
      error: `Google API DELETE erro (${res.status}): ${errText}`,
    };
  } catch (err: any) {
    return {
      success: false,
      retryable: true,
      error: err?.message || 'Erro de rede ao excluir evento no Google Calendar.',
    };
  }
}

async function safeRecordDeleteFailure(
  classId: string,
  teacherId: string | null | undefined,
  calendarId: string,
  eventId: string,
  errorMessage: string
): Promise<void> {
  if (!classId) return;
  try {
    // Só tenta atualizar/inserir em class_google_events se a aula ainda existir em classes
    // (ex: cancelamento de aula ou falha antes do ON DELETE CASCADE)
    const { data: existingClass } = await supabaseAdmin
      .from('classes')
      .select('id')
      .eq('id', classId)
      .maybeSingle();

    if (existingClass) {
      await saveClassGoogleEvent({
        platform_class_id: classId,
        teacher_id: teacherId || null,
        google_calendar_id: calendarId || 'primary',
        google_event_id: eventId,
        sync_status: 'failed',
        last_synced_at: new Date().toISOString(),
        last_error: errorMessage,
      });
    }
  } catch {
    // Se a aula já foi removida pelo ON DELETE CASCADE, não tratar como erro bloqueante
  }
}

// ============================================================================
// Orquestrador Central de Sincronização (Disparo seguro e não-bloqueante)
// ============================================================================

export async function syncClassToGoogle(payload: SyncClassPayload): Promise<{
  synced: boolean;
  actionTaken: string;
  eventId?: string | null;
  googleEventId?: string | null;
  error?: string;
  statusCode?: number;
  googleErrorCode?: string | null;
  retryable?: boolean;
}> {
  const { action, classSession, previousTeacherId, studentName, groupName, googleSyncContext } = payload;
  const classId = classSession.id;

  try {
    // 1. Caso DELETE ou CANCEL:
    if (action === 'delete' || classSession.status === 'cancelled') {
      let eventId: string | undefined | null = googleSyncContext?.googleEventId;
      let calendarId: string = googleSyncContext?.googleCalendarId || 'primary';
      let teacherId: string | undefined | null = googleSyncContext?.teacherId || classSession.teacher_id;

      // Se não veio no context, busca no banco para retrocompatibilidade
      if (!eventId) {
        const existingMapping = await getClassGoogleEvent(classId);
        if (existingMapping && existingMapping.google_event_id) {
          eventId = existingMapping.google_event_id;
          calendarId = existingMapping.google_calendar_id || calendarId;
          teacherId = existingMapping.teacher_id || teacherId;
        }
      }

      if (!eventId) {
        // Nada a remover no Google Calendar
        await deleteClassGoogleEventRecord(classId);
        return { synced: true, actionTaken: 'no_event_to_remove', eventId: null, googleEventId: null };
      }

      if (!teacherId) {
        const msg = 'Professor não identificado para exclusão do evento no Google Calendar.';
        await safeRecordDeleteFailure(classId, null, calendarId, eventId, msg);
        return { synced: false, actionTaken: 'delete_failed', error: msg };
      }

      const account = await getTeacherGoogleAccount(teacherId);
      if (!account || account.connection_status !== 'connected' || (!account.access_token && !account.refresh_token)) {
        const msg = 'Conta Google desconectada ou token de acesso/refresh indisponível para excluir o evento.';
        await safeRecordDeleteFailure(classId, teacherId, calendarId, eventId, msg);
        return {
          synced: false,
          actionTaken: 'delete_failed',
          error: msg,
        };
      }

      const accessToken = await getValidAccessToken(account);
      if (!accessToken) {
        const msg = 'Token de acesso do Google indisponível ou expirado ao tentar excluir o evento.';
        await safeRecordDeleteFailure(classId, teacherId, calendarId, eventId, msg);
        return {
          synced: false,
          actionTaken: 'delete_failed',
          error: msg,
        };
      }

      let delRes = await deleteGoogleCalendarEvent(
        accessToken,
        calendarId,
        eventId
      );
      if (!delRes.success && delRes.statusCode === 401 && account.refresh_token) {
        const refreshedToken = await getValidAccessToken(account, { forceRefresh: true });
        if (refreshedToken) {
          delRes = await deleteGoogleCalendarEvent(refreshedToken, calendarId, eventId);
        }
      }
      if (!delRes.success) {
        const errMsg = delRes.error || 'Falha ao excluir evento no Google Calendar.';
        console.warn(`[GoogleSync] Falha ao excluir evento no Google Calendar: ${errMsg}`);
        await safeRecordDeleteFailure(classId, teacherId, calendarId, eventId, errMsg);
        return {
          synced: false,
          actionTaken: 'delete_failed',
          error: errMsg,
          statusCode: delRes.statusCode,
          retryable: delRes.retryable,
        };
      }

      // Limpar o registro em class_google_events caso ainda exista (se o ON DELETE CASCADE já apagou, a função trata com segurança)
      await deleteClassGoogleEventRecord(classId);
      return { synced: true, actionTaken: 'event_deleted', eventId, googleEventId: eventId, statusCode: delRes.statusCode };
    }

    // 2. Caso de TROCA DE PROFESSOR em uma aula existente:
    if (action === 'update' && previousTeacherId && classSession.teacher_id && previousTeacherId !== classSession.teacher_id) {
      // Remover evento do professor anterior
      const existingMapping = await getClassGoogleEvent(classId);
      if (existingMapping && existingMapping.google_event_id) {
        const oldAccount = await getTeacherGoogleAccount(previousTeacherId);
        if (oldAccount && oldAccount.connection_status === 'connected') {
          const oldToken = await getValidAccessToken(oldAccount);
          if (oldToken) {
            await deleteGoogleCalendarEvent(
              oldToken,
              existingMapping.google_calendar_id || 'primary',
              existingMapping.google_event_id
            );
          }
        }
        await deleteClassGoogleEventRecord(classId);
      }

      // Agora, criar novo evento para o novo professor se ele tiver conta conectada
      return syncClassToGoogle({
        action: 'create',
        classSession,
        studentName,
        groupName,
      });
    }

    // 3. Verificar se o professor da aula tem conta Google conectada
    const currentTeacherId = classSession.teacher_id;
    if (!currentTeacherId) {
      console.log('[GoogleSync Account Lookup]', {
        classId,
        action,
        teacher_id: null,
        googleAccountFound: false,
        calendarId: null,
      });
      return { synced: true, actionTaken: 'no_teacher_assigned', eventId: null, googleEventId: null };
    }

    const teacherAccount = await getTeacherGoogleAccount(currentTeacherId);
    const accountFound = Boolean(teacherAccount && teacherAccount.connection_status === 'connected');
    console.log('[GoogleSync Account Lookup]', {
      classId,
      action,
      teacher_id: currentTeacherId,
      googleAccountFound: accountFound,
      calendarId: teacherAccount?.google_calendar_id || 'primary',
    });

    if (!teacherAccount || teacherAccount.connection_status !== 'connected') {
      return { synced: true, actionTaken: 'teacher_google_not_connected', eventId: null, googleEventId: null };
    }

    let accessToken = await getValidAccessToken(teacherAccount);
    if (!accessToken) {
      await saveClassGoogleEvent({
        platform_class_id: classId,
        teacher_id: currentTeacherId,
        google_calendar_id: teacherAccount.google_calendar_id || 'primary',
        sync_status: 'failed',
        last_synced_at: new Date().toISOString(),
        last_error: 'Token do Google expirado ou indisponível.',
      });
      return {
        synced: false,
        actionTaken: 'auth_token_failed',
        eventId: null,
        googleEventId: null,
        error: 'Token do Google indisponível',
      };
    }

    const calendarId = teacherAccount.google_calendar_id || 'primary';
    const summary = formatClassEventSummary(classSession.title, studentName, groupName);
    const formattedEvent = formatGoogleCalendarEvent(classSession, studentName, groupName);
    const description = formattedEvent.description;
    const startDateTime = formatDateTimeSaoPaulo(classSession.date, classSession.start_time);
    const endDateTime = formatDateTimeSaoPaulo(classSession.date, classSession.end_time);

    // 4. Caso CREATE:
    if (action === 'create') {
      // Verificar se já existe vínculo ativo para não duplicar
      const existingMapping = await getClassGoogleEvent(classId);
      if (existingMapping && existingMapping.google_event_id) {
        if (existingMapping.sync_status === 'synced') {
          return {
            synced: true,
            actionTaken: 'already_synced',
            eventId: existingMapping.google_event_id,
            googleEventId: existingMapping.google_event_id,
          };
        }
        // Se existe vínculo com google_event_id, atualizar evento existente para evitar duplicações
        let updateRes = await updateGoogleCalendarEvent(accessToken, existingMapping.google_calendar_id || calendarId, existingMapping.google_event_id, {
          summary,
          description,
          startDateTime,
          endDateTime,
        });
        if (!updateRes.success && updateRes.httpStatus === 401 && teacherAccount.refresh_token) {
          const refreshedToken = await getValidAccessToken(teacherAccount, { forceRefresh: true });
          if (refreshedToken) {
            accessToken = refreshedToken;
            updateRes = await updateGoogleCalendarEvent(accessToken, existingMapping.google_calendar_id || calendarId, existingMapping.google_event_id, {
              summary,
              description,
              startDateTime,
              endDateTime,
            });
          }
        }
        if (updateRes.success) {
          await saveClassGoogleEvent({
            platform_class_id: classId,
            teacher_id: currentTeacherId,
            google_calendar_id: existingMapping.google_calendar_id || calendarId,
            google_event_id: existingMapping.google_event_id,
            sync_status: 'synced',
            last_synced_at: new Date().toISOString(),
            last_error: null,
          });
          return {
            synced: true,
            actionTaken: 'event_updated',
            eventId: existingMapping.google_event_id,
            googleEventId: existingMapping.google_event_id,
          };
        }
      }

      // Verificar também no próprio Google Calendar se o evento já existe para este ID de aula (evitar duplicações em resync/reconciliação)
      if (payload.checkGoogleApiForDuplicates) {
        const existingGoogle = await findExistingGoogleCalendarEvent(accessToken, calendarId, classId, startDateTime, endDateTime);
        if (existingGoogle.found && existingGoogle.eventId) {
          await saveClassGoogleEvent({
            platform_class_id: classId,
            teacher_id: currentTeacherId,
            google_calendar_id: calendarId,
            google_event_id: existingGoogle.eventId,
            sync_status: 'synced',
            last_synced_at: new Date().toISOString(),
            last_error: null,
          });
          return {
            synced: true,
            actionTaken: 'already_synced',
            eventId: existingGoogle.eventId,
            googleEventId: existingGoogle.eventId,
          };
        }
      }

      let res = await createGoogleCalendarEvent(accessToken, calendarId, {
        summary,
        description,
        startDateTime,
        endDateTime,
      });
      if (!res.success && res.httpStatus === 401 && teacherAccount.refresh_token) {
        const refreshedToken = await getValidAccessToken(teacherAccount, { forceRefresh: true });
        if (refreshedToken) {
          accessToken = refreshedToken;
          res = await createGoogleCalendarEvent(accessToken, calendarId, {
            summary,
            description,
            startDateTime,
            endDateTime,
          });
        }
      }

      if (res.success && res.eventId) {
        await saveClassGoogleEvent({
          platform_class_id: classId,
          teacher_id: currentTeacherId,
          google_calendar_id: calendarId,
          google_event_id: res.eventId,
          sync_status: 'synced',
          last_synced_at: new Date().toISOString(),
        });
        return {
          synced: true,
          actionTaken: 'event_created',
          eventId: res.eventId,
          googleEventId: res.eventId,
          statusCode: res.httpStatus,
          googleErrorCode: null,
        };
      } else {
        await saveClassGoogleEvent({
          platform_class_id: classId,
          teacher_id: currentTeacherId,
          google_calendar_id: calendarId,
          sync_status: 'failed',
          last_synced_at: new Date().toISOString(),
          last_error: res.error || 'Falha ao criar evento no Google',
        });
        return {
          synced: false,
          actionTaken: 'creation_failed',
          eventId: null,
          googleEventId: null,
          statusCode: res.httpStatus,
          googleErrorCode: res.googleErrorCode || null,
          error: res.error,
        };
      }
    }

    // 5. Caso UPDATE (mesmo professor):
    if (action === 'update') {
      const existingMapping = await getClassGoogleEvent(classId);

      if (existingMapping && existingMapping.google_event_id) {
        // Atualizar evento existente
        let patchRes = await updateGoogleCalendarEvent(
          accessToken,
          existingMapping.google_calendar_id || calendarId,
          existingMapping.google_event_id,
          {
            summary,
            description,
            startDateTime,
            endDateTime,
          }
        );
        if (!patchRes.success && patchRes.httpStatus === 401 && teacherAccount.refresh_token) {
          const refreshedToken = await getValidAccessToken(teacherAccount, { forceRefresh: true });
          if (refreshedToken) {
            accessToken = refreshedToken;
            patchRes = await updateGoogleCalendarEvent(
              accessToken,
              existingMapping.google_calendar_id || calendarId,
              existingMapping.google_event_id,
              {
                summary,
                description,
                startDateTime,
                endDateTime,
              }
            );
          }
        }

        if (patchRes.success) {
          await saveClassGoogleEvent({
            ...existingMapping,
            sync_status: 'synced',
            last_synced_at: new Date().toISOString(),
            last_error: null,
          });
          return {
            synced: true,
            actionTaken: 'event_updated',
            eventId: existingMapping.google_event_id,
            googleEventId: existingMapping.google_event_id,
          };
        } else {
          await saveClassGoogleEvent({
            ...existingMapping,
            sync_status: 'failed',
            last_synced_at: new Date().toISOString(),
            last_error: patchRes.error || 'Falha ao atualizar evento no Google',
          });
          return {
            synced: false,
            actionTaken: 'update_failed',
            eventId: null,
            googleEventId: null,
            statusCode: patchRes.httpStatus,
            error: patchRes.error,
          };
        }
      } else {
        // Não havia evento prévio (por exemplo, professor conectou o Google depois)
        let createRes = await createGoogleCalendarEvent(accessToken, calendarId, {
          summary,
          description,
          startDateTime,
          endDateTime,
        });
        if (!createRes.success && createRes.httpStatus === 401 && teacherAccount.refresh_token) {
          const refreshedToken = await getValidAccessToken(teacherAccount, { forceRefresh: true });
          if (refreshedToken) {
            accessToken = refreshedToken;
            createRes = await createGoogleCalendarEvent(accessToken, calendarId, {
              summary,
              description,
              startDateTime,
              endDateTime,
            });
          }
        }

        if (createRes.success && createRes.eventId) {
          await saveClassGoogleEvent({
            platform_class_id: classId,
            teacher_id: currentTeacherId,
            google_calendar_id: calendarId,
            google_event_id: createRes.eventId,
            sync_status: 'synced',
            last_synced_at: new Date().toISOString(),
          });
          return {
            synced: true,
            actionTaken: 'event_created_on_update',
            eventId: createRes.eventId,
            googleEventId: createRes.eventId,
            statusCode: createRes.httpStatus,
          };
        } else {
          await saveClassGoogleEvent({
            platform_class_id: classId,
            teacher_id: currentTeacherId,
            google_calendar_id: calendarId,
            sync_status: 'failed',
            last_synced_at: new Date().toISOString(),
            last_error: createRes.error,
          });
          return {
            synced: false,
            actionTaken: 'creation_on_update_failed',
            eventId: null,
            googleEventId: null,
            statusCode: createRes.httpStatus,
            googleErrorCode: createRes.googleErrorCode || null,
            error: createRes.error,
          };
        }
      }
    }

    return { synced: true, actionTaken: 'no_action', eventId: null, googleEventId: null };
  } catch (err: any) {
    console.warn(`[GoogleCalendar] Erro ao sincronizar aula ${classId}:`, err?.message);
    try {
      await saveClassGoogleEvent({
        platform_class_id: classId,
        teacher_id: classSession.teacher_id || null,
        google_calendar_id: 'primary',
        sync_status: 'failed',
        last_synced_at: new Date().toISOString(),
        last_error: err?.message || 'Erro desconhecido',
      });
    } catch {
      // no-op
    }
    return {
      synced: false,
      actionTaken: 'unexpected_error',
      eventId: null,
      googleEventId: null,
      error: err?.message,
    };
  }
}

export async function syncFutureClassesToGoogle(
  teacherId: string,
  classes: Array<{
    id: string;
    teacher_id?: string | null;
    title: string;
    date: string;
    start_time: string;
    end_time: string;
    status?: 'scheduled' | 'completed' | 'cancelled' | null;
    studentName?: string;
    groupName?: string;
  }>,
  options?: {
    maxBatchSize?: number;
    delayMs?: number;
  }
): Promise<{
  total: number;
  synced: number;
  skipped: number;
  failed: number;
  remaining?: number;
  rateLimited?: boolean;
}> {
  const account = await getTeacherGoogleAccount(teacherId);
  if (!account || account.connection_status !== 'connected') {
    return { total: classes.length, synced: 0, skipped: classes.length, failed: 0, remaining: 0 };
  }

  // Filtrar apenas aulas futuras a partir de hoje e não canceladas, ordenadas cronologicamente (fuso America/Sao_Paulo)
  const todayStr = getTodaySaoPaulo();
  const eligibleClasses = classes
    .filter((c) => c.teacher_id === teacherId && c.date >= todayStr && c.status !== 'cancelled')
    .sort((a, b) => {
      const dateCmp = (a.date || '').localeCompare(b.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.start_time || '').localeCompare(b.start_time || '');
    });

  const maxBatchSize = options?.maxBatchSize ?? 20;
  const delayMs = options?.delayMs ?? 150;

  let synced = 0;
  let skipped = 0;
  let failed = 0;
  let processedApiCalls = 0;
  let rateLimited = false;

  for (const cls of eligibleClasses) {
    const existing = await getClassGoogleEvent(cls.id);
    if (existing && existing.google_event_id && existing.sync_status === 'synced') {
      skipped++;
      continue;
    }

    // Controle de lote: impedir disparo de centenas de chamadas em sequência
    if (processedApiCalls >= maxBatchSize) {
      break;
    }

    // Throttling entre chamadas à API do Google Calendar
    if (processedApiCalls > 0 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    processedApiCalls++;

    const res = await syncClassToGoogle({
      action: 'create',
      classSession: cls,
      studentName: cls.studentName,
      groupName: cls.groupName,
    });

    if (res.synced) {
      synced++;
    } else {
      failed++;
      const errText = res.error || '';
      if (
        errText.includes('429') ||
        errText.includes('rateLimitExceeded') ||
        errText.includes('quotaExceeded') ||
        errText.includes('userRateLimitExceeded')
      ) {
        rateLimited = true;
        console.warn(`[GoogleSync] Rate limit detectado na sincronização em lote do professor ${teacherId}. Interrompendo lote atual com segurança.`);
        break;
      }
    }
  }

  const remaining = Math.max(0, eligibleClasses.length - (synced + skipped + failed));
  return { total: eligibleClasses.length, synced, skipped, failed, remaining, rateLimited };
}

/**
 * Resincroniza de forma canônica uma aula já existente.
 * Garante idempotência:
 * - Se já possui mapping ativo com sync_status = 'synced', não duplica evento.
 * - Se não possui mapping (ou estava em falha), busca os dados oficiais da aula no banco e cria o evento.
 */
export async function resyncExistingClass(classId: string): Promise<{
  synced: boolean;
  actionTaken: string;
  error?: string;
  eventId?: string | null;
  googleEventId?: string | null;
}> {
  // 1. Verificar idempotência: se já existe evento sincronizado, não duplicar
  const existingMapping = await getClassGoogleEvent(classId);
  if (existingMapping && existingMapping.google_event_id && existingMapping.sync_status === 'synced') {
    return {
      synced: true,
      actionTaken: 'already_synced',
      eventId: existingMapping.google_event_id,
      googleEventId: existingMapping.google_event_id,
    };
  }

  // 2. Buscar dados oficiais da aula na plataforma (fonte da verdade)
  const { data: classRow, error: classErr } = await supabaseAdmin
    .from('classes')
    .select('*')
    .eq('id', classId)
    .maybeSingle();

  if (classErr || !classRow) {
    return {
      synced: false,
      actionTaken: 'class_not_found',
      error: classErr?.message || 'Aula não encontrada no banco de dados.',
    };
  }

  // 3. Buscar nomes formatados de aluno ou grupo
  let studentName = '';
  let groupName = '';

  try {
    const { data: classStudents } = await supabaseAdmin
      .from('class_students')
      .select('student_id')
      .eq('class_id', classId);

    if (classStudents && classStudents.length > 0) {
      const studentIds = classStudents.map((cs: any) => cs.student_id);
      const { data: students } = await supabaseAdmin
        .from('students')
        .select('name')
        .in('id', studentIds);
      if (students && students.length > 0) {
        studentName = students.map((s: any) => s.name).join(', ');
      }
    }

    if (classRow.group_id) {
      const { data: group } = await supabaseAdmin
        .from('groups')
        .select('name')
        .eq('id', classRow.group_id)
        .maybeSingle();
      if (group) {
        groupName = group.name;
      }
    }
  } catch (enrichErr) {
    console.warn(`[GoogleCalendar] Aviso ao enriquecer dados da aula ${classId}:`, enrichErr);
  }

  // 4. Executar sincronização canônica de criação
  return syncClassToGoogle({
    action: 'create',
    classSession: {
      id: classRow.id,
      title: classRow.title,
      date: classRow.date,
      start_time: classRow.start_time,
      end_time: classRow.end_time,
      teacher_id: classRow.teacher_id,
      status: classRow.status,
      group_id: classRow.group_id,
    },
    studentName,
    groupName,
    checkGoogleApiForDuplicates: true,
  });
}

/**
 * Reconciliação Automática e Segura de Aulas do EAVRA com o Google Calendar.
 *
 * Localiza aulas que:
 * 1. Existem em public.classes;
 * 2. Possuem professor atribuído (teacher_id não nulo);
 * 3. O professor possui Google Calendar ativamente conectado (teacher_google_accounts);
 * 4. São futuras ou do dia atual (fuso America/Sao_Paulo);
 * 5. Não estão canceladas (status !== 'cancelled');
 * 6. NÃO possuem registro com sync_status = 'synced' e google_event_id válido em class_google_events.
 *
 * Garante idempotência:
 * - Se a aula já foi sincronizada, é ignorada (skipped).
 * - Se o evento já existe, é preservado e mapeado.
 * - Suporta throttling controlado e limite de lote para proteção de rate limit da Google API.
 */
export async function reconcileUnsyncedClasses(options?: {
  teacherId?: string | null;
  maxBatchSize?: number;
  delayMs?: number;
}): Promise<{
  totalChecked: number;
  totalEligible: number;
  synced: number;
  skipped: number;
  failed: number;
  remaining: number;
  details: Array<{
    classId: string;
    title: string;
    date: string;
    teacherId: string;
    action: 'synced' | 'skipped' | 'failed';
    error?: string;
  }>;
}> {
  const maxBatchSize = options?.maxBatchSize ?? 30;
  const delayMs = options?.delayMs ?? 150;
  const todayStr = getTodaySaoPaulo();

  // 1. Localizar contas de professores com Google conectado
  let accountsQuery = supabaseAdmin
    .from('teacher_google_accounts')
    .select('teacher_id, connection_status')
    .eq('connection_status', 'connected');

  if (options?.teacherId) {
    accountsQuery = accountsQuery.eq('teacher_id', options.teacherId);
  }

  const { data: accounts, error: accErr } = await accountsQuery;
  if (accErr) {
    logSupabaseDiagnostic('SELECT', 'teacher_google_accounts', accErr);
    return { totalChecked: 0, totalEligible: 0, synced: 0, skipped: 0, failed: 0, remaining: 0, details: [] };
  }

  if (!accounts || accounts.length === 0) {
    return { totalChecked: 0, totalEligible: 0, synced: 0, skipped: 0, failed: 0, remaining: 0, details: [] };
  }

  const connectedTeacherIds = accounts.map((a: any) => a.teacher_id).filter(Boolean);
  if (connectedTeacherIds.length === 0) {
    return { totalChecked: 0, totalEligible: 0, synced: 0, skipped: 0, failed: 0, remaining: 0, details: [] };
  }

  // 2. Buscar aulas futuras ou de hoje desses professores (não canceladas)
  const { data: candidateClasses, error: clsErr } = await supabaseAdmin
    .from('classes')
    .select('id, title, date, start_time, end_time, teacher_id, status, group_id')
    .in('teacher_id', connectedTeacherIds)
    .gte('date', todayStr)
    .neq('status', 'cancelled')
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });

  if (clsErr) {
    logSupabaseDiagnostic('SELECT', 'classes', clsErr);
    return { totalChecked: 0, totalEligible: 0, synced: 0, skipped: 0, failed: 0, remaining: 0, details: [] };
  }

  if (!candidateClasses || candidateClasses.length === 0) {
    return { totalChecked: 0, totalEligible: 0, synced: 0, skipped: 0, failed: 0, remaining: 0, details: [] };
  }

  // 3. Buscar mappings existentes dessas aulas
  const classIds = candidateClasses.map((c: any) => c.id);
  const { data: mappings, error: mapErr } = await supabaseAdmin
    .from('class_google_events')
    .select('platform_class_id, google_event_id, sync_status')
    .in('platform_class_id', classIds);

  if (mapErr) {
    logSupabaseDiagnostic('SELECT', 'class_google_events', mapErr);
  }

  const mappingByClassId = new Map<string, { google_event_id: string | null; sync_status: string }>();
  if (mappings) {
    for (const m of mappings) {
      mappingByClassId.set(m.platform_class_id, m);
    }
  }

  // 4. Filtrar aulas que NÃO possuem evento sincronizado no Google
  const unsyncedClasses: any[] = [];
  let skipped = 0;

  for (const c of candidateClasses) {
    const m = mappingByClassId.get(c.id);
    if (m && m.google_event_id && m.sync_status === 'synced') {
      skipped++;
    } else {
      unsyncedClasses.push(c);
    }
  }

  const totalEligible = unsyncedClasses.length;
  let synced = 0;
  let failed = 0;
  let processedCalls = 0;
  const details: Array<{
    classId: string;
    title: string;
    date: string;
    teacherId: string;
    action: 'synced' | 'skipped' | 'failed';
    error?: string;
  }> = [];

  for (const cls of unsyncedClasses) {
    if (processedCalls >= maxBatchSize) {
      break;
    }

    if (processedCalls > 0 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    processedCalls++;

    try {
      const res = await resyncExistingClass(cls.id);
      if (res.synced) {
        synced++;
        details.push({
          classId: cls.id,
          title: cls.title,
          date: cls.date,
          teacherId: cls.teacher_id,
          action: 'synced',
        });
      } else {
        failed++;
        details.push({
          classId: cls.id,
          title: cls.title,
          date: cls.date,
          teacherId: cls.teacher_id,
          action: 'failed',
          error: res.error || 'Falha ao sincronizar aula',
        });
      }
    } catch (err: any) {
      failed++;
      details.push({
        classId: cls.id,
        title: cls.title,
        date: cls.date,
        teacherId: cls.teacher_id,
        action: 'failed',
        error: err?.message || 'Erro inesperado na reconciliação',
      });
    }
  }

  const remaining = Math.max(0, totalEligible - (synced + failed));

  return {
    totalChecked: candidateClasses.length,
    totalEligible,
    synced,
    skipped,
    failed,
    remaining,
    details,
  };
}

/**
 * Consulta lista de aulas futuras ou de hoje que estão sem sincronização ativa com o Google Calendar.
 */
export async function getUnsyncedClassesList(options?: { teacherId?: string | null }): Promise<{
  success: boolean;
  unsyncedCount: number;
  classes: Array<{
    id: string;
    title: string;
    date: string;
    start_time: string;
    end_time: string;
    teacher_id: string;
    teacher_name?: string;
    status: string;
    google_connected: boolean;
    sync_status: 'failed' | 'pending' | 'unsynced';
    last_error?: string | null;
    last_attempt_at?: string | null;
  }>;
}> {
  const todayStr = getTodaySaoPaulo();

  let accountsQuery = supabaseAdmin
    .from('teacher_google_accounts')
    .select('teacher_id, connection_status')
    .eq('connection_status', 'connected');

  if (options?.teacherId) {
    accountsQuery = accountsQuery.eq('teacher_id', options.teacherId);
  }

  const { data: accounts } = await accountsQuery;
  const connectedTeacherIds = new Set((accounts || []).map((a: any) => a.teacher_id));

  let classesQuery = supabaseAdmin
    .from('classes')
    .select('id, title, date, start_time, end_time, teacher_id, status')
    .gte('date', todayStr)
    .neq('status', 'cancelled')
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });

  if (options?.teacherId) {
    classesQuery = classesQuery.eq('teacher_id', options.teacherId);
  }

  const { data: classes } = await classesQuery;
  if (!classes || classes.length === 0) {
    return { success: true, unsyncedCount: 0, classes: [] };
  }

  const classIds = classes.map((c: any) => c.id);
  const { data: mappings } = await supabaseAdmin
    .from('class_google_events')
    .select('platform_class_id, google_event_id, sync_status, last_error, last_synced_at')
    .in('platform_class_id', classIds);

  const mappingByClassId = new Map<string, any>();
  if (mappings) {
    for (const m of mappings) {
      mappingByClassId.set(m.platform_class_id, m);
    }
  }

  const teacherIds = Array.from(new Set(classes.map((c: any) => c.teacher_id).filter(Boolean)));
  const { data: teachers } = await supabaseAdmin
    .from('teachers')
    .select('id, name')
    .in('id', teacherIds);

  const teacherNameMap = new Map<string, string>();
  if (teachers) {
    for (const t of teachers) {
      teacherNameMap.set(t.id, t.name);
    }
  }

  const unsyncedList: any[] = [];
  for (const c of classes) {
    const m = mappingByClassId.get(c.id);
    const isSynced = m && m.google_event_id && m.sync_status === 'synced';
    if (!isSynced) {
      const isConnected = connectedTeacherIds.has(c.teacher_id);
      unsyncedList.push({
        id: c.id,
        title: c.title,
        date: c.date,
        start_time: c.start_time,
        end_time: c.end_time,
        teacher_id: c.teacher_id,
        teacher_name: teacherNameMap.get(c.teacher_id) || 'Professor',
        status: c.status,
        google_connected: isConnected,
        sync_status: (m?.sync_status as any) || 'unsynced',
        last_error: m?.last_error || (isConnected ? 'Ainda não sincronizado com o Google Calendar' : 'Professor sem Google conectado'),
        last_attempt_at: m?.last_synced_at || null,
      });
    }
  }

  return {
    success: true,
    unsyncedCount: unsyncedList.length,
    classes: unsyncedList,
  };
}

/**
 * Atualiza com segurança o lembrete de eventos futuros no Google Calendar para 24h (1440 min).
 *
 * REGRAS DE SEGURANÇA E PREVENÇÃO DE DUPLICIDADE:
 * 1. Apenas atualiza eventos que estejam VINCULADOS em public.class_google_events com google_event_id válido e status 'synced'.
 * 2. NUNCA toca em eventos do Google Calendar que não pertençam ao EAVRA (não altera compromissos pessoais do professor).
 * 3. Usa exclusivamente PATCH no evento existente (updateGoogleCalendarEvent) — NUNCA cria novo evento para alterar lembrete.
 * 4. Aplica-se apenas a aulas futuras ou do dia atual (fuso America/Sao_Paulo) e não canceladas.
 */
export async function updateExistingFutureClassesReminders(options?: {
  teacherId?: string | null;
  maxBatchSize?: number;
  delayMs?: number;
}): Promise<{
  totalChecked: number;
  totalEligible: number;
  updated: number;
  skipped: number;
  failed: number;
  details: Array<{
    classId: string;
    googleEventId: string;
    action: 'updated' | 'skipped' | 'failed';
    error?: string;
  }>;
}> {
  const maxBatchSize = options?.maxBatchSize ?? 50;
  const delayMs = options?.delayMs ?? 100;
  const todayStr = getTodaySaoPaulo();

  // 1. Buscar aulas futuras ou de hoje não canceladas
  let classesQuery = supabaseAdmin
    .from('classes')
    .select('id, title, date, start_time, end_time, teacher_id, status')
    .gte('date', todayStr)
    .neq('status', 'cancelled')
    .not('teacher_id', 'is', null);

  if (options?.teacherId) {
    classesQuery = classesQuery.eq('teacher_id', options.teacherId);
  }

  const { data: futureClasses, error: clsErr } = await classesQuery;
  if (clsErr || !futureClasses || futureClasses.length === 0) {
    return { totalChecked: 0, totalEligible: 0, updated: 0, skipped: 0, failed: 0, details: [] };
  }

  const classIds = futureClasses.map((c: any) => c.id);

  // 2. Buscar vínculos existentes em class_google_events (apenas eventos comprovadamente do EAVRA!)
  const { data: mappings, error: mapErr } = await supabaseAdmin
    .from('class_google_events')
    .select('*')
    .in('platform_class_id', classIds)
    .eq('sync_status', 'synced')
    .not('google_event_id', 'is', null);

  if (mapErr || !mappings || mappings.length === 0) {
    return { totalChecked: futureClasses.length, totalEligible: 0, updated: 0, skipped: 0, failed: 0, details: [] };
  }

  const mappingsByClassId = new Map<string, any>();
  for (const m of mappings) {
    if (m.google_event_id && m.google_event_id.trim()) {
      mappingsByClassId.set(m.platform_class_id, m);
    }
  }

  const eligibleClasses = futureClasses.filter((c: any) => mappingsByClassId.has(c.id)).slice(0, maxBatchSize);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const details: Array<{
    classId: string;
    googleEventId: string;
    action: 'updated' | 'skipped' | 'failed';
    error?: string;
  }> = [];

  // Cache de tokens por professor para evitar lookups repetitivos
  const teacherTokenCache = new Map<string, { accessToken: string; calendarId: string } | null>();

  for (const cls of eligibleClasses) {
    const mapping = mappingsByClassId.get(cls.id);
    const teacherId = cls.teacher_id;

    if (!teacherTokenCache.has(teacherId)) {
      const teacherAccount = await getTeacherGoogleAccount(teacherId);
      if (!teacherAccount || teacherAccount.connection_status !== 'connected') {
        teacherTokenCache.set(teacherId, null);
      } else {
        const accessToken = await getValidAccessToken(teacherAccount);
        if (!accessToken) {
          teacherTokenCache.set(teacherId, null);
        } else {
          teacherTokenCache.set(teacherId, {
            accessToken,
            calendarId: mapping.google_calendar_id || teacherAccount.google_calendar_id || 'primary',
          });
        }
      }
    }

    const teacherInfo = teacherTokenCache.get(teacherId);
    if (!teacherInfo) {
      skipped++;
      details.push({
        classId: cls.id,
        googleEventId: mapping.google_event_id,
        action: 'skipped',
        error: 'Professor sem conta Google ativamente conectada.',
      });
      continue;
    }

    try {
      let patchRes = await updateGoogleCalendarEvent(
        teacherInfo.accessToken,
        teacherInfo.calendarId,
        mapping.google_event_id,
        {
          reminders: EAVRA_DEFAULT_REMINDERS,
        }
      );

      // Tratamento defensivo de 401
      if (!patchRes.success && patchRes.httpStatus === 401) {
        const teacherAccount = await getTeacherGoogleAccount(teacherId);
        if (teacherAccount?.refresh_token) {
          const freshToken = await getValidAccessToken(teacherAccount, { forceRefresh: true });
          if (freshToken) {
            teacherInfo.accessToken = freshToken;
            patchRes = await updateGoogleCalendarEvent(
              freshToken,
              teacherInfo.calendarId,
              mapping.google_event_id,
              {
                reminders: EAVRA_DEFAULT_REMINDERS,
              }
            );
          }
        }
      }

      if (patchRes.success) {
        updated++;
        details.push({
          classId: cls.id,
          googleEventId: mapping.google_event_id,
          action: 'updated',
        });
        await saveClassGoogleEvent({
          ...mapping,
          last_synced_at: new Date().toISOString(),
          last_error: null,
        });
      } else {
        failed++;
        details.push({
          classId: cls.id,
          googleEventId: mapping.google_event_id,
          action: 'failed',
          error: patchRes.error,
        });
      }
    } catch (e: any) {
      failed++;
      details.push({
        classId: cls.id,
        googleEventId: mapping.google_event_id,
        action: 'failed',
        error: e?.message || 'Erro inesperado ao atualizar lembrete',
      });
    }

    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return {
    totalChecked: futureClasses.length,
    totalEligible: eligibleClasses.length,
    updated,
    skipped,
    failed,
    details,
  };
}


