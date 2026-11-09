/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

/**
 * Sem valores padrão de produção: um build incompleto nunca pode se
 * conectar silenciosamente ao banco real do IACRA.
 * VITE_* contém apenas informações públicas (URL e publishable/anon key).
 */
const publicEnv = (typeof import.meta !== 'undefined' && import.meta.env) || ({} as ImportMetaEnv);
const supabaseUrl = String(publicEnv.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
const supabaseKey = String(publicEnv.VITE_SUPABASE_ANON_KEY || publicEnv.VITE_SUPABASE_KEY || '').trim();
const buildTarget = String(publicEnv.VITE_IACRA_BUILD_TARGET || '').trim();
const refs = {
  staging: 'xuyimfugcdkqovqelrfz',
  production: 'ldumzwrwbhjtrnlioigg',
} as const;

const isolatedNodeTest = typeof window === 'undefined' && !supabaseUrl && !supabaseKey;
if ((!supabaseUrl || !supabaseKey) && !isolatedNodeTest) {
  throw new Error('[IACRA] Configuração pública do Supabase ausente. Conexão bloqueada.');
}
if (buildTarget === 'staging' || buildTarget === 'production') {
  const expected = 'https://' + refs[buildTarget] + '.supabase.co';
  if (supabaseUrl !== expected) {
    throw new Error('[IACRA] Banco incompatível com o ambiente escolhido. Conexão bloqueada.');
  }
}
if (!isolatedNodeTest && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(supabaseUrl)) {
  throw new Error('[IACRA] URL Supabase inválida. Conexão bloqueada.');
}
// Valor inválido e sem rede real, exclusivo para testes de Node sem navegador.
export const supabase = createClient(
  isolatedNodeTest ? 'https://iacra-unconfigured.invalid' : supabaseUrl,
  isolatedNodeTest ? 'no-network-test-key' : supabaseKey,
  {
  auth: { persistSession: true, autoRefreshToken: true },
});
