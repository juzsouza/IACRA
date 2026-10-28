/** Injectable controller for Etapa 10: all authorization-critical operations
 * are repeated inside PostgreSQL RPCs from Etapa 09; this is defense in depth.
 */
import { checkPermissionDevEnvironment, type PermissionEnvironment } from './permissionAdminConfig.ts';
import { parseSnapshot, validateMutation, type PermissionMutation,
  type PermissionSaveResult, type PermissionSnapshot, type RoleTarget } from './permissionAdminRules.ts';

export type ValidatedProfile = { id: string; role: string; access_status: string };
export type PermissionGateway = {
  currentAuthUser: () => Promise<{ id: string } | null>;
  profileByAuthId: (id: string) => Promise<ValidatedProfile | null>;
  rpc: (name: string, args?: Record<string,string>) => Promise<{data: unknown; error: unknown}>;
};

export function createPermissionsAdminController(gateway: PermissionGateway,
  environment: () => PermissionEnvironment) {
  async function verifySuperAdmin(): Promise<void> {
    const gate = checkPermissionDevEnvironment(environment());
    if (!gate.ok) throw new Error(gate.reason);
    const user = await gateway.currentAuthUser();
    if (!user || !user.id) throw new Error('Sessão não verificada.');
    const profile = await gateway.profileByAuthId(user.id);
    if (!profile || profile.id !== user.id || profile.role !== 'super_admin' ||
        profile.access_status !== 'active') {
      throw new Error('Acesso restrito ao Super Admin ativo com perfil correspondente.');
    }
  }

  return {
    async load(): Promise<PermissionSnapshot> {
      await verifySuperAdmin();
      const result = await gateway.rpc('eavra_admin_permissions_snapshot');
      if (result.error) throw new Error('Falha na consulta de permissões do banco DEV.');
      return parseSnapshot(result.data);
    },
    async save(input: PermissionMutation, snapshot: PermissionSnapshot,
      targetRole?: RoleTarget): Promise<PermissionSaveResult> {
      validateMutation(input, snapshot, targetRole);
      await verifySuperAdmin();
      const result = await gateway.rpc('eavra_admin_save_permission', {
        p_subject_type: input.subjectType, p_target: input.target,
        p_permission_key: input.permissionKey, p_decision: input.decision,
        p_scope: input.scope,
      });
      if (result.error || !result.data || typeof result.data !== 'object' ||
          typeof (result.data as {changed?:unknown}).changed !== 'boolean') {
        throw new Error('Alteração não confirmada pelo banco DEV.');
      }
      return { changed: (result.data as {changed:boolean}).changed };
    },
  };
}
