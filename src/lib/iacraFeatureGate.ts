/** Controla apenas a visibilidade das novas telas: NÃO substitui autorização no Supabase.
 * Só habilitar depois de aplicar e validar a migração de produção.
 * Exige referência explícita; nunca aceita IACRA-DEV nem uma URL arbitrária.
 */
export const IACRA_PRODUCTION_REF = 'ldumzwrwbhjtrnlioigg';
export const IACRA_PRODUCTION_URL = 'https://ldumzwrwbhjtrnlioigg.supabase.co';

export type IacraFeatureEnvironment = {
  enabled?: string;
  supabaseUrl?: string;
  approvedProjectRef?: string;
};

export function checkIacraFeatureEnvironment(config: IacraFeatureEnvironment): boolean {
  return config.enabled === 'true'
    && config.approvedProjectRef === IACRA_PRODUCTION_REF
    && config.supabaseUrl?.replace(/\/$/, '') === IACRA_PRODUCTION_URL;
}

export function iacraFeaturesEnabled(): boolean {
  return checkIacraFeatureEnvironment({
    enabled: import.meta.env.VITE_IACRA_FEATURES_ENABLED,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    approvedProjectRef: import.meta.env.VITE_IACRA_PRODUCTION_PROJECT_REF,
  });
}
