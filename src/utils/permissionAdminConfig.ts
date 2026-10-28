/** Gate for Etapa 10: no real database requests unless DEV is explicitly enabled.
 * Not an authorization boundary: PostgreSQL RPCs enforce authorization.
 */
export const ORIGINAL_IACRA_PROJECT_REF = 'ldumzwrwbhjtrnlioigg';

export type PermissionEnvironment = {
  enabled?: string;
  supabaseUrl?: string;
  approvedDevProjectRef?: string;
};

export function checkPermissionDevEnvironment(env: PermissionEnvironment): { ok: boolean; reason: string } {
  if (env.enabled !== 'true') return { ok: false, reason: 'A gravação de permissões ainda não foi ativada no ambiente DEV.' };
  const approved = (env.approvedDevProjectRef || '').trim().toLowerCase();
  if (!/^[a-z0-9]{20}$/.test(approved)) {
    return { ok: false, reason: 'Falta identificar e aprovar o projeto de banco DEV.' };
  }
  if (approved === ORIGINAL_IACRA_PROJECT_REF) {
    return { ok: false, reason: 'O banco IACRA original não pode ser usado nesta etapa.' };
  }
  let actual: URL;
  try { actual = new URL(env.supabaseUrl || ''); }
  catch { return { ok: false, reason: 'A URL de banco DEV não está configurada.' }; }
  if (actual.protocol !== 'https:' || actual.username || actual.password || actual.pathname !== '/' || actual.search || actual.hash ||
      actual.hostname !== `${approved}.supabase.co`) {
    return { ok: false, reason: 'A conexão do aplicativo não corresponde ao banco DEV aprovado.' };
  }
  return { ok: true, reason: 'Ambiente DEV verificado.' };
}

export function getPermissionDevEnvironment(): PermissionEnvironment {
  return {
    enabled: import.meta.env.VITE_EAVRA_PERMISSION_ADMIN_ENABLED,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    // A mesma referência autoriza login e tela: nunca duas referências independentes.
    approvedDevProjectRef: import.meta.env.VITE_EAVRA_DEV_PROJECT_REF,
  };
}
