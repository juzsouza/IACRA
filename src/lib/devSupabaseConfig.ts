import { validateDevSupabaseUrl } from '../shared/approvedDevSupabase';

// Ambiente isolado: configuração explícita. Nunca usar valor padrão de produção.
export function getBrowserDevSupabaseConfig() {
  const url = validateDevSupabaseUrl(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_EAVRA_DEV_PROJECT_REF,
  );
  const anonKey = String(
    import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY || '',
  ).trim();
  if (!anonKey) {
    throw new Error('[EAVRA DEV] Chave pública do Supabase não configurada.');
  }
  return { url, anonKey };
}
