/** Segurança extra EXCLUSIVA da prévia visual IACRA-DEV.
 * Referências públicas não são credenciais. Nunca usar chaves secret/service_role no frontend.
 */
export const IACRA_DEV_ONLY_REF = 'xuyimfugcdkqovqelrfz';

export function requireIacraDevProjectRef(input: unknown): string {
  const ref = String(input ?? '').trim().toLowerCase();
  if (ref !== IACRA_DEV_ONLY_REF) {
    throw new Error('[EAVRA PREVIEW] Somente o projeto IACRA-DEV autorizado é permitido.');
  }
  return ref;
}

export function requirePublishableBrowserKey(input: unknown): string {
  const key = String(input ?? '').trim();
  if (!/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key)) {
    throw new Error('[EAVRA PREVIEW] Use somente a chave publishable pública do IACRA-DEV; nunca service_role/secret.');
  }
  return key;
}
