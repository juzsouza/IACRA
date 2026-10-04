/**
 * Cliente Frontend para Integração Google Calendar
 * 
 * Comunica-se exclusivamente com a API segura /api/google do backend.
 * NUNCA tem acesso a client_secret ou refresh_token.
 * Falhas de rede ou no Google são sempre tratadas como não-bloqueantes.
 */

import { ClassSession } from '../store';
import { supabase } from '../lib/supabase';

export interface GoogleAccountStatus {
  connected: boolean;
  googleEmail: string | null;
  connectedAt: string | null;
  connectionStatus: string;
  calendarId?: string;
}

export interface GoogleConfigStatus {
  configured: boolean;
  clientId: string | null;
}

export interface SyncResult {
  synced: boolean;
  actionTaken: string;
  eventId?: string | null;
  googleEventId?: string | null;
  statusCode?: number;
  googleErrorCode?: string | null;
  error?: string;
}

/**
 * Obtém os headers de autenticação contendo o JWT atualizado do usuário logado
 * (com suporte a renovação preventiva ou forçada em caso de 401/403).
 * Garante que nunca seja usado um token obsoleto ou expirado antes de criar/sincronizar aulas.
 */
export async function getAuthHeaders(forceRefresh = false): Promise<Record<string, string>> {
  try {
    let session = null;
    if (forceRefresh) {
      const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
      if (!refErr && refreshed?.session?.access_token) {
        session = refreshed.session;
      }
    }

    if (!session) {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      session = currentSession;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    // Se a sessão não possui access_token ou está expirada/expirando nos próximos 120 segundos, renova
    if (!session?.access_token || (session.expires_at && session.expires_at - nowSec < 120)) {
      const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
      if (!refErr && refreshed?.session?.access_token) {
        session = refreshed.session;
      }
    }

    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` };
    }
  } catch (e) {
    console.warn('[GoogleCalendarClient] Falha ao obter sessão do usuário:', e);
  }
  return {};
}

/**
 * Consulta se as credenciais do Google Cloud estão configuradas no servidor
 */
export async function getGoogleConfig(): Promise<GoogleConfigStatus> {
  try {
    const res = await fetch('/api/google/config');
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[GoogleCalendarClient] Falha ao consultar configuração:', e);
  }
  return { configured: false, clientId: null };
}

/**
 * Obtém a URL de autorização OAuth 2.0 para o professor autenticado
 */
export async function getGoogleAuthUrl(teacherId: string): Promise<{ url?: string; error?: string }> {
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`/api/google/auth-url?teacher_id=${encodeURIComponent(teacherId)}`, {
      headers: {
        ...authHeaders,
      },
    });
    const data = await res.json();
    if (res.ok && data.url) {
      return { url: data.url };
    }
    return { error: data.error || 'Erro ao gerar URL de autorização.' };
  } catch (e: any) {
    return { error: e?.message || 'Falha na comunicação com o servidor.' };
  }
}

/**
 * Consulta o status da conta Google de um professor
 */
export async function getTeacherGoogleStatus(teacherId: string): Promise<GoogleAccountStatus> {
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`/api/google/account/${encodeURIComponent(teacherId)}`, {
      headers: {
        ...authHeaders,
      },
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn(`[GoogleCalendarClient] Erro ao consultar conta do professor ${teacherId}:`, e);
  }
  return {
    connected: false,
    googleEmail: null,
    connectedAt: null,
    connectionStatus: 'disconnected',
  };
}

/**
 * Desconecta a conta Google de um professor
 */
export async function disconnectTeacherGoogle(teacherId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch('/api/google/disconnect', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ teacherId }),
    });
    const data = await res.json();
    return { success: res.ok, error: data.error };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Erro ao desconectar.' };
  }
}

/**
 * Dispara sincronização de uma aula de forma segura e não-bloqueante
 * (com tentativa única de retry e renovação de token se retornar 401 ou 403).
 */
export async function triggerGoogleClassSync(payload: {
  action: 'create' | 'update' | 'delete';
  classSession: ClassSession;
  previousTeacherId?: string | null;
  studentName?: string;
  groupName?: string;
  googleSyncContext?: {
    platformClassId?: string;
    googleEventId: string;
    googleCalendarId?: string;
    teacherId?: string | null;
  };
}): Promise<SyncResult> {
  const requestBody = {
    action: payload.action,
    classSession: {
      id: payload.classSession.id,
      teacher_id: payload.classSession.teacher_id,
      title: payload.classSession.title,
      date: payload.classSession.date,
      start_time: payload.classSession.start_time,
      end_time: payload.classSession.end_time,
      status: payload.classSession.status,
      group_id: payload.classSession.group_id,
      student_ids: payload.classSession.student_ids,
    },
    previousTeacherId: payload.previousTeacherId,
    studentName: payload.studentName,
    groupName: payload.groupName,
    googleSyncContext: payload.googleSyncContext,
  };

  try {
    let authHeaders = await getAuthHeaders();
    if (!authHeaders.Authorization) {
      // Tentar renovação preventiva se não há token disponível
      authHeaders = await getAuthHeaders(true);
    }

    let res = await fetch('/api/google/sync-class', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    // Se retornar 401 ou 403 por expiração/invalidade temporária de token, força renovação e repete uma única vez
    if (res.status === 401 || res.status === 403) {
      const refreshedHeaders = await getAuthHeaders(true);
      if (refreshedHeaders.Authorization) {
        res = await fetch('/api/google/sync-class', {
          method: 'POST',
          headers: {
            ...refreshedHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
      }
    }

    if (res.ok) {
      const data = await res.json();
      const confirmedEventId = data.eventId ?? data.googleEventId ?? null;
      return {
        ...data,
        synced: Boolean(data.synced),
        actionTaken: data.actionTaken || (data.synced ? 'synced' : 'failed'),
        eventId: confirmedEventId,
        googleEventId: confirmedEventId,
      };
    } else {
      const err = await res.json().catch(() => ({}));
      const errorMsg = err.error || `HTTP ${res.status}`;
      console.warn(`[GoogleCalendarClient] Falha na sincronização da aula ${payload.classSession.id} (${res.status}):`, errorMsg);
      return { synced: false, actionTaken: 'http_error', eventId: null, googleEventId: null, statusCode: res.status, error: errorMsg };
    }
  } catch (e: any) {
    console.warn(`[GoogleCalendarClient] Falha não-bloqueante na sincronização da aula ${payload.classSession.id}:`, e);
    return { synced: false, actionTaken: 'network_error', eventId: null, googleEventId: null, error: e?.message };
  }
}

/**
 * Resincroniza uma aula já existente no Google Agenda via endpoint seguro
 * (com retry em 401/403).
 */
export async function resyncClassWithGoogle(classId: string): Promise<SyncResult> {
  try {
    let authHeaders = await getAuthHeaders();
    if (!authHeaders.Authorization) {
      authHeaders = await getAuthHeaders(true);
    }

    let res = await fetch(`/api/google/resync-class/${encodeURIComponent(classId)}`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 401 || res.status === 403) {
      const refreshedHeaders = await getAuthHeaders(true);
      if (refreshedHeaders.Authorization) {
        res = await fetch(`/api/google/resync-class/${encodeURIComponent(classId)}`, {
          method: 'POST',
          headers: {
            ...refreshedHeaders,
            'Content-Type': 'application/json',
          },
        });
      }
    }

    if (res.ok) {
      const data = await res.json();
      const confirmedEventId = data.eventId ?? data.googleEventId ?? null;
      return {
        ...data,
        synced: Boolean(data.synced),
        actionTaken: data.actionTaken || (data.synced ? 'synced' : 'failed'),
        eventId: confirmedEventId,
        googleEventId: confirmedEventId,
      };
    } else {
      const err = await res.json().catch(() => ({}));
      const errorMsg = err.error || `HTTP ${res.status}`;
      console.warn(`[GoogleCalendarClient] Falha ao resincronizar aula ${classId} (${res.status}):`, errorMsg);
      return { synced: false, actionTaken: 'http_error', eventId: null, googleEventId: null, statusCode: res.status, error: errorMsg };
    }
  } catch (e: any) {
    console.warn(`[GoogleCalendarClient] Falha não-bloqueante na resincronização da aula ${classId}:`, e);
    return { synced: false, actionTaken: 'network_error', eventId: null, googleEventId: null, error: e?.message };
  }
}

/**
 * Dispara reconciliação segura e idempotente de aulas do EAVRA com o Google Calendar.
 */
export async function reconcileGoogleClasses(teacherId?: string): Promise<{
  totalChecked: number;
  totalEligible: number;
  synced: number;
  skipped: number;
  failed: number;
  remaining: number;
  details?: any[];
  error?: string;
}> {
  try {
    let authHeaders = await getAuthHeaders();
    let res = await fetch('/api/google/reconcile', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ teacherId }),
    });

    if (res.status === 401 || res.status === 403) {
      const refreshedHeaders = await getAuthHeaders(true);
      if (refreshedHeaders.Authorization) {
        res = await fetch('/api/google/reconcile', {
          method: 'POST',
          headers: {
            ...refreshedHeaders,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ teacherId }),
        });
      }
    }

    if (res.ok) {
      return await res.json();
    } else {
      const err = await res.json().catch(() => ({}));
      return {
        totalChecked: 0,
        totalEligible: 0,
        synced: 0,
        skipped: 0,
        failed: 0,
        remaining: 0,
        error: err.error || `HTTP ${res.status}`,
      };
    }
  } catch (e: any) {
    return {
      totalChecked: 0,
      totalEligible: 0,
      synced: 0,
      skipped: 0,
      failed: 0,
      remaining: 0,
      error: e?.message || 'Falha de rede na reconciliação',
    };
  }
}

export interface UnsyncedClassItem {
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
}

/**
 * Consulta lista de aulas pendentes ou com falha de sincronização com o Google Calendar.
 */
export async function fetchUnsyncedClassesStatus(): Promise<{
  success: boolean;
  unsyncedCount: number;
  classes: UnsyncedClassItem[];
  error?: string;
}> {
  try {
    let authHeaders = await getAuthHeaders();
    if (!authHeaders.Authorization) {
      authHeaders = await getAuthHeaders(true);
    }

    let res = await fetch('/api/google/unsynced-classes', {
      headers: {
        ...authHeaders,
      },
    });

    if (res.status === 401 || res.status === 403) {
      const refreshedHeaders = await getAuthHeaders(true);
      if (refreshedHeaders.Authorization) {
        res = await fetch('/api/google/unsynced-classes', {
          headers: {
            ...refreshedHeaders,
          },
        });
      }
    }

    if (res.ok) {
      return await res.json();
    } else {
      const err = await res.json().catch(() => ({}));
      return { success: false, unsyncedCount: 0, classes: [], error: err.error || `HTTP ${res.status}` };
    }
  } catch (e: any) {
    return { success: false, unsyncedCount: 0, classes: [], error: e?.message || 'Erro ao consultar aulas sem sincronização' };
  }
}



/**
 * Obtém o contexto seguro de exclusão de aula via backend (com supabaseAdmin)
 * antes de excluir a aula na plataforma e disparar o ON DELETE CASCADE.
 */
export async function fetchClassDeleteContext(classId: string): Promise<{
  exists: boolean;
  googleEventId?: string;
  googleCalendarId?: string;
  teacherId?: string | null;
}> {
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch('/api/google/class-delete-context', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ classId }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.exists && data.googleEventId) {
        return {
          exists: true,
          googleEventId: data.googleEventId,
          googleCalendarId: data.googleCalendarId || 'primary',
          teacherId: data.teacherId || null,
        };
      }
    }
  } catch (e) {
    console.warn(`[GoogleCalendarClient] Aviso ao consultar contexto de exclusão da aula ${classId}:`, e);
  }
  return { exists: false };
}

/**
 * Sincroniza aulas futuras sob demanda (em lotes controlados com proteção contra rate-limit)
 */
export async function syncTeacherFutureClasses(
  teacherId: string,
  classes: ClassSession[],
  studentsMap: Record<string, string>,
  groupsMap: Record<string, string>
): Promise<{ total: number; synced: number; skipped: number; failed: number; remaining?: number; rateLimited?: boolean }> {
  try {
    const authHeaders = await getAuthHeaders();
    const formattedClasses = classes.map((c) => {
      let studentName = '';
      if (c.student_ids && c.student_ids.length > 0) {
        studentName = c.student_ids.map((id) => studentsMap[id] || id).join(', ');
      }
      const groupName = c.group_id ? groupsMap[c.group_id] : '';

      return {
        id: c.id,
        teacher_id: c.teacher_id,
        title: c.title,
        date: c.date,
        start_time: c.start_time,
        end_time: c.end_time,
        status: c.status,
        studentName,
        groupName,
      };
    });

    const res = await fetch('/api/google/sync-future', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ teacherId, classes: formattedClasses }),
    });

    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('[GoogleCalendarClient] Erro ao sincronizar aulas futuras:', e);
  }
  return { total: 0, synced: 0, skipped: 0, failed: 0, remaining: 0 };
}

/**
 * Atualiza lembretes para 24h (1440 min) em eventos futuros já vinculados ao Google Calendar
 */
export async function updateFutureClassesReminders(teacherId?: string): Promise<{
  totalChecked: number;
  totalEligible: number;
  updated: number;
  skipped: number;
  failed: number;
  error?: string;
}> {
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch('/api/google/update-future-reminders', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ teacherId: teacherId || null }),
    });

    if (res.ok) {
      return await res.json();
    }
    const errData = await res.json().catch(() => null);
    return {
      totalChecked: 0,
      totalEligible: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      error: errData?.error || `Erro HTTP ${res.status}`,
    };
  } catch (e: any) {
    return {
      totalChecked: 0,
      totalEligible: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      error: e?.message || 'Falha de rede ao atualizar lembretes',
    };
  }
}
