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

export interface SyncFutureClassesResult {
  success: boolean;
  total: number;
  synced: number;
  skipped: number;
  failed: number;
  remaining?: number;
  rateLimited?: boolean;
  httpStatus?: number;
  error?: string;
  authRequired?: boolean;
  forbidden?: boolean;
  reauthorizationRequired?: boolean;
}

export const SYNC_FUTURE_CLASSES_DEFAULT_BATCH_SIZE = 25;

export interface SyncTeacherFutureClassesOptions {
  batchSize?: number;
  delayBetweenBatchesMs?: number;
}

/**
 * Sincroniza aulas futuras sob demanda dividindo a lista em lotes sequenciais pequenos e seguros,
 * respeitando os limites de tamanho de requisição do servidor (evitando HTTP 413) e rate-limits.
 */
export async function syncTeacherFutureClasses(
  teacherId: string,
  classes: ClassSession[],
  studentsMap: Record<string, string>,
  groupsMap: Record<string, string>,
  options?: SyncTeacherFutureClassesOptions
): Promise<SyncFutureClassesResult> {
  let aggregatedTotal = 0;
  let aggregatedSynced = 0;
  let aggregatedSkipped = 0;
  let aggregatedFailed = 0;
  let aggregatedRemaining = 0;
  let lastHttpStatus: number | undefined = undefined;

  try {
    let authHeaders = await getAuthHeaders();
    if (!authHeaders.Authorization) {
      authHeaders = await getAuthHeaders(true);
    }

    // 1. Filtrar previamente apenas aulas do professor e não canceladas para economizar payload
    const eligibleClasses = classes.filter((c) => {
      if (c.teacher_id && c.teacher_id !== teacherId) return false;
      if (c.status === 'cancelled') return false;
      return true;
    });

    // 2. Extrair estritamente os campos necessários para cada aula (sem metadados extras para não inflar o payload)
    const formattedClasses = eligibleClasses.map((c) => {
      let studentName = '';
      if (c.student_ids && c.student_ids.length > 0) {
        studentName = c.student_ids.map((id) => studentsMap[id] || id).join(', ');
      }
      const groupName = c.group_id ? groupsMap[c.group_id] : '';

      return {
        id: c.id,
        teacher_id: c.teacher_id || teacherId,
        title: c.title,
        date: c.date,
        start_time: c.start_time,
        end_time: c.end_time,
        status: c.status,
        studentName,
        groupName,
      };
    });

    const batchSize = Math.max(1, options?.batchSize ?? SYNC_FUTURE_CLASSES_DEFAULT_BATCH_SIZE);
    const delayBetweenBatchesMs = options?.delayBetweenBatchesMs ?? 0;

    // 3. Dividir a lista em lotes sequenciais seguros
    const batches: (typeof formattedClasses)[] = [];
    if (formattedClasses.length === 0) {
      batches.push([]);
    } else {
      for (let i = 0; i < formattedClasses.length; i += batchSize) {
        batches.push(formattedClasses.slice(i, i + batchSize));
      }
    }

    // 4. Processar lotes sequencialmente (sem concorrência descontrolada)
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const currentBatch = batches[batchIndex];

      if (batchIndex > 0 && delayBetweenBatchesMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatchesMs));
      }

      let res = await fetch('/api/google/sync-future', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ teacherId, classes: currentBatch }),
      });

      // Se a sessão expirou na plataforma (401/403), tenta renovar preventivamente uma vez
      if (res.status === 401 || res.status === 403) {
        const refreshedHeaders = await getAuthHeaders(true);
        if (refreshedHeaders.Authorization) {
          authHeaders = refreshedHeaders;
          res = await fetch('/api/google/sync-future', {
            method: 'POST',
            headers: {
              ...refreshedHeaders,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ teacherId, classes: currentBatch }),
          });
        }
      }

      lastHttpStatus = res.status;

      if (!res.ok) {
        const status = res.status;
        let errorMessage = `Erro HTTP ${status} ao sincronizar aulas futuras.`;
        if (status === 413) {
          errorMessage = 'O tamanho da requisição excedeu o limite do servidor (HTTP 413).';
        }
        try {
          const errData = await res.json();
          if (errData?.error && typeof errData.error === 'string') {
            errorMessage = errData.error;
          }
        } catch {
          // Ignora erro de JSON
        }

        console.warn(`[GoogleCalendarClient] Falha HTTP ${status} no lote ${batchIndex + 1}/${batches.length} do professor ${teacherId}: ${errorMessage}`);

        // Se falha de autorização (401/403) ocorreu no primeiro lote antes de qualquer processamento
        if ((status === 401 || status === 403) && aggregatedSynced === 0 && aggregatedSkipped === 0) {
          return {
            success: false,
            total: 0,
            synced: 0,
            skipped: 0,
            failed: 0,
            remaining: 0,
            httpStatus: status,
            error: errorMessage,
            authRequired: status === 401,
            forbidden: status === 403,
          };
        }

        // Lote atual falhou e lotes subsequentes foram abortados
        let remainingAfterFailure = currentBatch.length;
        for (let next = batchIndex + 1; next < batches.length; next++) {
          remainingAfterFailure += batches[next].length;
        }

        aggregatedTotal += remainingAfterFailure;
        aggregatedRemaining += remainingAfterFailure;

        return {
          success: false,
          total: aggregatedTotal,
          synced: aggregatedSynced,
          skipped: aggregatedSkipped,
          failed: aggregatedFailed,
          remaining: aggregatedRemaining,
          httpStatus: status,
          error: errorMessage,
          authRequired: status === 401,
          forbidden: status === 403,
        };
      }

      const data = await res.json();
      const batchTotal = typeof data.total === 'number' ? data.total : currentBatch.length;
      const batchSynced = typeof data.synced === 'number' ? data.synced : 0;
      const batchSkipped = typeof data.skipped === 'number' ? data.skipped : 0;
      const batchFailed = typeof data.failed === 'number' ? data.failed : 0;
      const batchRemaining = typeof data.remaining === 'number' ? data.remaining : 0;

      aggregatedTotal += batchTotal;
      aggregatedSynced += batchSynced;
      aggregatedSkipped += batchSkipped;
      aggregatedFailed += batchFailed;
      aggregatedRemaining += batchRemaining;

      // Se a resposta acusou rate limited, interrompe lotes subsequentes com segurança
      if (data.rateLimited) {
        let unexecutedRemaining = 0;
        for (let next = batchIndex + 1; next < batches.length; next++) {
          unexecutedRemaining += batches[next].length;
        }
        aggregatedTotal += unexecutedRemaining;
        aggregatedRemaining += unexecutedRemaining;

        return {
          success: true,
          total: aggregatedTotal,
          synced: aggregatedSynced,
          skipped: aggregatedSkipped,
          failed: aggregatedFailed,
          remaining: aggregatedRemaining,
          rateLimited: true,
          httpStatus: 200,
        };
      }
    }

    return {
      success: true,
      total: aggregatedTotal,
      synced: aggregatedSynced,
      skipped: aggregatedSkipped,
      failed: aggregatedFailed,
      remaining: aggregatedRemaining,
      rateLimited: false,
      httpStatus: lastHttpStatus || 200,
    };
  } catch (e: any) {
    const errorMsg = e?.message || 'Falha de comunicação ao sincronizar aulas futuras.';
    console.warn('[GoogleCalendarClient] Erro ao sincronizar aulas futuras:', errorMsg);
    return {
      success: false,
      total: aggregatedTotal,
      synced: aggregatedSynced,
      skipped: aggregatedSkipped,
      failed: aggregatedFailed,
      remaining: aggregatedRemaining,
      httpStatus: lastHttpStatus !== 200 ? lastHttpStatus : 0,
      error: errorMsg,
      authRequired: false,
      forbidden: false,
    };
  }
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

export interface InboundPullResponse {
  imported: number;
  updated: number;
  ignored: number;
  cancelled: number;
  pendingStudentLink: number;
  errors: string[];
  error?: string;
}

/**
 * Dispara a sincronização manual inbound (Google Calendar -> EAVRA).
 * Importa aulas criadas pelo professor com tags [EAVRA], atualiza horários e trata cancelamentos.
 */
export async function pullGoogleEvents(options?: {
  teacherId?: string;
  forceFullSync?: boolean;
}): Promise<InboundPullResponse> {
  try {
    const authHeaders = await getAuthHeaders();
    const res = await fetch('/api/google/pull-events', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        teacherId: options?.teacherId || null,
        forceFullSync: options?.forceFullSync || false,
      }),
    });

    if (res.ok) {
      return await res.json();
    }
    const errData = await res.json().catch(() => null);
    return {
      imported: 0,
      updated: 0,
      ignored: 0,
      cancelled: 0,
      pendingStudentLink: 0,
      errors: [errData?.error || `Erro HTTP ${res.status}`],
      error: errData?.error || `Erro HTTP ${res.status}`,
    };
  } catch (e: any) {
    return {
      imported: 0,
      updated: 0,
      ignored: 0,
      cancelled: 0,
      pendingStudentLink: 0,
      errors: [e?.message || 'Falha de rede ao sincronizar do Google Calendar'],
      error: e?.message || 'Falha de rede ao sincronizar do Google Calendar',
    };
  }
}

