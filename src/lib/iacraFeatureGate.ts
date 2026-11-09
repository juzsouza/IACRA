/**
 * Funcionalidades novas: sempre exige correspondência explícita de alvo e banco.
 * Controle de UI: autorização real permanece nas RPCs do Supabase.
 */
export const IACRA_PRODUCTION_REF = 'ldumzwrwbhjtrnlioigg';
export const IACRA_PRODUCTION_URL = 'https://' + IACRA_PRODUCTION_REF + '.supabase.co';
export const IACRA_DEV_REF = 'xuyimfugcdkqovqelrfz';
export const IACRA_DEV_URL = 'https://' + IACRA_DEV_REF + '.supabase.co';

export type IacraFeatureEnvironment = {
  enabled?: string;
  supabaseUrl?: string;
  approvedProjectRef?: string;
  buildTarget?: string;
};

export function checkIacraFeatureEnvironment(config: IacraFeatureEnvironment): boolean {
  if (config.enabled !== 'true') return false;
  const target = config.buildTarget;
  if (target === 'production') {
    return config.approvedProjectRef === IACRA_PRODUCTION_REF
      && config.supabaseUrl?.replace(/\/$/, '') === IACRA_PRODUCTION_URL;
  }
  if (target === 'staging') {
    return config.approvedProjectRef === IACRA_DEV_REF
      && config.supabaseUrl?.replace(/\/$/, '') === IACRA_DEV_URL;
  }
  return false;
}

export function iacraFeaturesEnabled(): boolean {
  return checkIacraFeatureEnvironment({
    enabled: import.meta.env.VITE_IACRA_FEATURES_ENABLED,
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
    approvedProjectRef: import.meta.env.VITE_IACRA_PRODUCTION_PROJECT_REF,
    buildTarget: import.meta.env.VITE_IACRA_BUILD_TARGET,
  });
}
