import { supabase } from '../lib/supabase';

async function getAdminAuthHeaders(): Promise<Record<string, string>> {
  try {
    let { data: { session } } = await supabase.auth.getSession();
    const nowSec = Math.floor(Date.now() / 1000);

    if (!session?.access_token || (session.expires_at && session.expires_at - nowSec < 120)) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed?.session?.access_token) {
        session = refreshed.session;
      }
    }

    if (session?.access_token) {
      return {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      };
    }
  } catch (err) {
    console.warn('[TeacherPixClient] Erro ao obter credenciais de autenticação:', err);
  }
  return { 'Content-Type': 'application/json' };
}

/**
 * Consulta todas as chaves Pix dos professores cadastradas (somente para perfis com permissão administrativa).
 */
export async function fetchTeacherPixKeys(): Promise<Record<string, string>> {
  try {
    const headers = await getAdminAuthHeaders();
    if (!headers.Authorization) return {};

    const res = await fetch('/api/admin/teachers/pix-keys', {
      method: 'GET',
      headers,
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.pixKeys && typeof data.pixKeys === 'object') {
        return data.pixKeys;
      }
    }
  } catch (err) {
    console.warn('[TeacherPixClient] Falha ao carregar chaves Pix:', err);
  }
  return {};
}

/**
 * Consulta a chave Pix de um professor específico.
 */
export async function fetchTeacherPixKey(teacherId: string): Promise<string | null> {
  if (!teacherId) return null;
  try {
    const headers = await getAdminAuthHeaders();
    if (!headers.Authorization) return null;

    const res = await fetch(`/api/admin/teachers/${encodeURIComponent(teacherId)}/pix-key`, {
      method: 'GET',
      headers,
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.success) {
        return data.pix_key || null;
      }
    }
  } catch (err) {
    console.warn(`[TeacherPixClient] Falha ao carregar chave Pix do professor ${teacherId}:`, err);
  }
  return null;
}

/**
 * Cadastra, atualiza ou remove a chave Pix de um professor.
 * Preserva estritamente zeros à esquerda, símbolos e formatação digitada.
 */
export async function saveTeacherPixKey(
  teacherId: string,
  pixKey: string | null | undefined
): Promise<{ success: boolean; error?: string }> {
  if (!teacherId) {
    return { success: false, error: 'ID do professor não informado.' };
  }

  try {
    const headers = await getAdminAuthHeaders();
    if (!headers.Authorization) {
      return { success: false, error: 'Sessão administrativa não autenticada.' };
    }

    const cleanPixKey = typeof pixKey === 'string' ? pixKey.trim() : null;

    const res = await fetch(`/api/admin/teachers/${encodeURIComponent(teacherId)}/pix-key`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ pix_key: cleanPixKey }),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: !!data.success };
    }

    const errData = await res.json().catch(() => ({}));
    return {
      success: false,
      error: errData?.error || `Falha HTTP ${res.status} ao salvar chave Pix.`,
    };
  } catch (err: any) {
    console.warn(`[TeacherPixClient] Erro ao salvar chave Pix do professor ${teacherId}:`, err);
    return { success: false, error: err?.message || 'Falha de comunicação com o servidor.' };
  }
}
