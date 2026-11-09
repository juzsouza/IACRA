/** Etapa 10: only Supabase Auth + protected PostgreSQL RPCs are used.
 * The stage09 RPCs verify role, status and auth.uid() again server-side.
 */
import { supabase } from '../lib/supabase';
import { createPermissionsAdminController } from '../utils/permissionAdminController';
import { getPermissionDevEnvironment } from '../utils/permissionAdminConfig';
export type {
  PermissionDecision, PermissionScope, PermissionSubject, RoleTarget, PermissionCatalogItem,
  PermissionRule, RolePermissionRule, UserPermissionRule, PermissionSnapshot,
  PermissionMutation, PermissionSaveResult,
} from '../utils/permissionAdminRules';

const controller = createPermissionsAdminController({
  async currentAuthUser() {
    // getUser calls Supabase Auth to verify the token, never trust a cached session alone.
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.id) return null;
    return { id: user.id };
  },
  async profileByAuthId(id) {
    const { data, error } = await supabase.from('profiles')
      .select('id,role,access_status').eq('id', id).maybeSingle();
    if (error || !data) return null;
    return { id: data.id, role: data.role, access_status: data.access_status };
  },
  async rpc(name, args) {
    const { data, error } = await supabase.rpc(name, args);
    return { data, error };
  },
}, getPermissionDevEnvironment);

export const loadAdminPermissions = controller.load;
export const saveAdminPermission = controller.save;
