/** Gate de autorização para operações administrativas sensíveis. Sem consultas nem segredos. */
export interface AdminCallerProfile {
  id?: string | null;
  role?: string | null;
  access_status?: string | null;
}

export function isActiveAdminCaller(
  profile: AdminCallerProfile | null | undefined,
  authUserId: string,
  allowedRoles: readonly string[],
): boolean {
  return Boolean(
    authUserId && profile && profile.id === authUserId &&
    profile.access_status === 'active' &&
    profile.role && allowedRoles.includes(profile.role)
  );
}
