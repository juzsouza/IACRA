/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

/** Configuração exclusivamente publicável: Vite expõe VITE_* no navegador. */
const publicEnv = (typeof import.meta !== 'undefined' && import.meta.env) || ({} as ImportMetaEnv);
const supabaseUrl = String(publicEnv.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
const supabaseKey = String(publicEnv.VITE_SUPABASE_ANON_KEY || publicEnv.VITE_SUPABASE_KEY || '').trim();
const isNodeTest = typeof window === 'undefined' && !supabaseUrl && !supabaseKey;

if (!isNodeTest && (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl) || !supabaseKey)) {
  throw new Error('[IACRA] Configuração pública de conexão ausente ou inválida. O login foi bloqueado por segurança.');
}

export const supabase = createClient(
  isNodeTest ? 'https://iacra-test-unconfigured.invalid' : supabaseUrl,
  isNodeTest ? 'test-only-public-key' : supabaseKey,
  { auth: { persistSession: true, autoRefreshToken: true } },
);
