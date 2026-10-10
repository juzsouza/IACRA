import { supabaseAdmin } from './googleCalendarService.js';

/**
 * Erro específico indicando que a tabela de armazenamento de chaves Pix
 * ainda não foi provisionada no banco de dados.
 */
export class TeacherPixStorageNotReadyError extends Error {
  code: string;
  statusCode: number;

  constructor(
    message = 'O armazenamento de chaves Pix ainda não está preparado no banco de dados. A tabela public.teacher_pix_keys precisa ser provisionada.'
  ) {
    super(message);
    this.name = 'TeacherPixStorageNotReadyError';
    this.code = 'STORAGE_NOT_READY';
    this.statusCode = 503;
  }
}

/**
 * Verifica se o erro retornado pelo Supabase indica que a tabela não existe no schema.
 */
export function isTableNotAvailableError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '');
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('Could not find the table') ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
}

/**
 * Retorna o cliente administrativo para operações no banco de dados.
 */
function getAdminClient(overrideClient?: any) {
  if (overrideClient) return overrideClient;
  if (!supabaseAdmin) {
    throw new TeacherPixStorageNotReadyError(
      'Cliente administrativo do Supabase não configurado no servidor.'
    );
  }
  return supabaseAdmin;
}

/**
 * Consulta a chave Pix de um professor específico.
 * Utiliza exclusivamente a tabela protegida public.teacher_pix_keys.
 * Quando a tabela não estiver disponível, lança TeacherPixStorageNotReadyError.
 */
export async function getTeacherPixKey(
  teacherId: string,
  overrideClient?: any
): Promise<string | null> {
  if (!teacherId) return null;

  const db = getAdminClient(overrideClient);
  const { data, error } = await db
    .from('teacher_pix_keys')
    .select('pix_key')
    .eq('teacher_id', teacherId)
    .maybeSingle();

  if (error) {
    if (isTableNotAvailableError(error)) {
      throw new TeacherPixStorageNotReadyError();
    }
    throw new Error(`Falha ao consultar chave Pix: ${error.message}`);
  }

  if (!data) return null;
  return typeof data.pix_key === 'string' ? data.pix_key : null;
}

/**
 * Consulta todas as chaves Pix cadastradas (acesso restrito a administradores).
 * Utiliza exclusivamente a tabela protegida public.teacher_pix_keys.
 * Quando a tabela não estiver disponível, lança TeacherPixStorageNotReadyError.
 */
export async function getAllTeacherPixKeys(
  overrideClient?: any
): Promise<Record<string, string>> {
  const db = getAdminClient(overrideClient);
  const { data, error } = await db
    .from('teacher_pix_keys')
    .select('teacher_id, pix_key');

  if (error) {
    if (isTableNotAvailableError(error)) {
      throw new TeacherPixStorageNotReadyError();
    }
    throw new Error(`Falha ao consultar chaves Pix: ${error.message}`);
  }

  const result: Record<string, string> = {};
  if (Array.isArray(data)) {
    for (const row of data) {
      if (row.teacher_id && typeof row.pix_key === 'string') {
        result[row.teacher_id] = row.pix_key;
      }
    }
  }

  return result;
}

/**
 * Cadastra ou atualiza a chave Pix de um professor.
 * Preserva estritamente caracteres, símbolos, espaços e zeros à esquerda.
 * Utiliza exclusivamente a tabela protegida public.teacher_pix_keys.
 * Quando a tabela não estiver disponível, lança TeacherPixStorageNotReadyError.
 */
export async function setTeacherPixKey(
  teacherId: string,
  rawPixKey: string | null | undefined,
  overrideClient?: any
): Promise<void> {
  if (!teacherId) return;

  const pixKey = typeof rawPixKey === 'string' ? rawPixKey.trim() : null;
  const db = getAdminClient(overrideClient);

  if (!pixKey) {
    // Remoção da chave Pix
    const { error } = await db
      .from('teacher_pix_keys')
      .delete()
      .eq('teacher_id', teacherId);

    if (error) {
      if (isTableNotAvailableError(error)) {
        throw new TeacherPixStorageNotReadyError();
      }
      throw new Error(`Falha ao remover chave Pix: ${error.message}`);
    }
    return;
  }

  // Persistência com preservação exata da formatação e zeros à esquerda
  const now = new Date().toISOString();
  const { error } = await db
    .from('teacher_pix_keys')
    .upsert(
      [
        {
          teacher_id: teacherId,
          pix_key: pixKey,
          updated_at: now,
        },
      ],
      { onConflict: 'teacher_id' }
    );

  if (error) {
    if (isTableNotAvailableError(error)) {
      throw new TeacherPixStorageNotReadyError();
    }
    throw new Error(`Falha ao salvar chave Pix: ${error.message}`);
  }
}

/**
 * Remove a chave Pix de um professor ao excluir seu cadastro.
 */
export async function deleteTeacherPixKey(
  teacherId: string,
  overrideClient?: any
): Promise<void> {
  await setTeacherPixKey(teacherId, null, overrideClient);
}
