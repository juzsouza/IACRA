/**
 * Homologação: Gestão de Permissões autorizada SOMENTE para o banco IACRA-DEV.
 * A autorização efetiva é verificada nas RPCs do PostgreSQL.
 */
export const DEV_IACRA_PROJECT_REF = 'xuyimfugcdkqovqelrfz';
export const DEV_IACRA_URL = 'https://' + DEV_IACRA_PROJECT_REF + '.supabase.co';

export type PermissionEnvironment = {
  enabled?: string;
  supabaseUrl?: string;
  approvedDevProjectRef?: string;
  buildTarget?: string;
};

export function checkPermissionDevEnvironment(env: PermissionEnvironment): { ok: boolean; reason: string } {
  if (env.enabled !== 'true') return { ok:false, reason:'Gerenciamento de permissões não habilitado nesta instalação.' };
  if (env.buildTarget !== 'staging') return { ok:false, reason:'Gerenciamento de permissões permitido apenas na homologação.' };
  if (env.approvedDevProjectRef !== DEV_IACRA_PROJECT_REF) return { ok:false, reason:'Referência do projeto DEV inválida.' };
  if (env.supabaseUrl?.replace(/\/$/, '') !== DEV_IACRA_URL) return { ok:false, reason:'Conexão não corresponde ao banco IACRA-DEV.' };
  return { ok:true, reason:'Ambiente DEV verificado.' };
}
export function getPermissionDevEnvironment(): PermissionEnvironment {
  return {
    enabled: import.meta.env.VITE_EAVRA_PERMISSION_ADMIN_ENABLED,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    approvedDevProjectRef: import.meta.env.VITE_EAVRA_DEV_PROJECT_REF,
    buildTarget: import.meta.env.VITE_IACRA_BUILD_TARGET,
  };
}
