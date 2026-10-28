import { validateDevSupabaseUrl } from '../shared/approvedDevSupabase.ts';

/**
 * Os endpoints server-side devem apontar EXATAMENTE para o mesmo DEV que o browser.
 * É proposital falhar ao iniciar se não houver configuração: nunca usar fallback.
 */
export function getServerDevSupabaseConfig(env: NodeJS.ProcessEnv = process.env) {
  const frontendUrl = validateDevSupabaseUrl(
    env.VITE_SUPABASE_URL,
    env.VITE_EAVRA_DEV_PROJECT_REF,
  );
  const serverUrl = validateDevSupabaseUrl(
    env.SUPABASE_URL,
    env.VITE_EAVRA_DEV_PROJECT_REF,
  );
  if (frontendUrl !== serverUrl) {
    throw new Error('[EAVRA DEV] Frontend e backend apontam para bancos diferentes.');
  }
  const anonKey = String(env.SUPABASE_KEY || env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY || '').trim();
  if (!anonKey) {
    throw new Error('[EAVRA DEV] Chave pública do servidor não configurada.');
  }
  return { url: serverUrl, anonKey };
}
