/**
 * Restrição de ambiente de desenvolvimento do EAVRA.
 * Jamais deve ser importado pelo aplicativo de produção.
 * A aprovação do projeto é configurada por um ID explícito (não é uma credencial).
 */
const KNOWN_PRODUCTION_REFS = new Set(['ldumzwrwbhjtrnlioigg']);

export function validateDevSupabaseUrl(urlInput: unknown, allowedRefInput: unknown): string {
  const allowedRef = String(allowedRefInput || '').trim().toLowerCase();
  const rawUrl = String(urlInput || '').trim();
  if (!/^[a-z0-9]{20}$/.test(allowedRef)) {
    throw new Error('[EAVRA DEV] Referência do projeto DEV ausente ou inválida.');
  }
  if (KNOWN_PRODUCTION_REFS.has(allowedRef)) {
    throw new Error('[EAVRA DEV] Projeto original/produção não é permitido nesta branch.');
  }
  if (!rawUrl) {
    throw new Error('[EAVRA DEV] URL do Supabase ausente.');
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('[EAVRA DEV] URL do Supabase inválida.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
      parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('[EAVRA DEV] A URL precisa ser a raiz HTTPS de um projeto Supabase.');
  }
  const match = /^([a-z0-9]{20})\.supabase\.co$/i.exec(parsed.hostname);
  if (!match) {
    throw new Error('[EAVRA DEV] Domínio Supabase não reconhecido.');
  }
  const actualRef = match[1].toLowerCase();
  if (KNOWN_PRODUCTION_REFS.has(actualRef)) {
    throw new Error('[EAVRA DEV] Conexão com o Supabase original bloqueada.');
  }
  if (actualRef !== allowedRef) {
    throw new Error('[EAVRA DEV] Supabase configurado difere do projeto DEV autorizado.');
  }
  return parsed.origin;
}
