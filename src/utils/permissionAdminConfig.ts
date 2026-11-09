/** Gerenciamento de permissões somente para IACRA PROD após migrações e validações.
 * Mesmo com painel ativado, a autorização real é verificada nas RPCs e políticas SQL.
 */
import {checkIacraFeatureEnvironment, IACRA_PRODUCTION_REF, IACRA_PRODUCTION_URL} from '../lib/iacraFeatureGate';

export type PermissionEnvironment = {
  enabled?: string;
  supabaseUrl?: string;
  approvedDevProjectRef?: string;
  buildTarget?: string;
};
export function checkPermissionDevEnvironment(env: PermissionEnvironment): {ok:boolean;reason:string} {
 const allowed = checkIacraFeatureEnvironment({
    enabled:env.enabled,
    supabaseUrl:env.supabaseUrl,
    approvedProjectRef:env.approvedDevProjectRef,
 });
 if(!allowed || env.buildTarget !== 'production')
   return {ok:false,reason:'Gerenciamento de permissões indisponível até a migração e a ativação autorizada em produção.'};
 return {ok:true,reason:'Ambiente de produção verificado.'};
}
export function getPermissionDevEnvironment():PermissionEnvironment {
 return {
   enabled:import.meta.env.VITE_IACRA_FEATURES_ENABLED,
   supabaseUrl:import.meta.env.VITE_SUPABASE_URL,
   approvedDevProjectRef:import.meta.env.VITE_IACRA_PRODUCTION_PROJECT_REF,
   buildTarget:import.meta.env.VITE_IACRA_BUILD_TARGET,
 };
}
export const productionPermissionTarget = {ref:IACRA_PRODUCTION_REF,url:IACRA_PRODUCTION_URL};
