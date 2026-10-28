import { validateDevSupabaseUrl } from '../shared/approvedDevSupabase';
import { requireIacraDevProjectRef, requirePublishableBrowserKey } from './devPreviewSafety';

// Ambiente isolado: configuração explícita. Nunca usar valor padrão de produção.
export function getBrowserDevSupabaseConfig() {
  const url = validateDevSupabaseUrl(
    import.meta.env.VITE_SUPABASE_URL,
    requireIacraDevProjectRef(import.meta.env.VITE_EAVRA_DEV_PROJECT_REF),
  );
  const anonKey = requirePublishableBrowserKey(
    import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY,
  );
  return { url, anonKey };
}
