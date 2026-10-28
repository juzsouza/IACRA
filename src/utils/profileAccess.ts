/**
 * Profile authorization gate — fail closed.
 *
 * A successful Supabase Auth session is NOT sufficient to access the application.
 * Only an active profile whose ID matches auth.users.id can authorize a session.
 * This helper does not rely on email, local storage, or cached profiles.
 */
export type ProfileIdentity = {
  id: string;
  role: string;
  access_status?: string | null;
};

export type ProfileAuthorization<T extends ProfileIdentity> =
  | { kind: "allowed"; profile: T }
  | { kind: "blocked" | "denied" | "unavailable" };

const ROLES = new Set(["super_admin", "admin", "teacher"]);

export async function loadAuthorizedProfile<T extends ProfileIdentity>(
  authUserId: string | null | undefined,
  fetchById: (authUserId: string) => Promise<{ data: T | null; error: unknown }>
): Promise<ProfileAuthorization<T>> {
  if (typeof authUserId !== "string" || !authUserId.trim()) {
    return { kind: "denied" };
  }

  try {
    const result = await fetchById(authUserId);

    // Supabase can return { data: null, error: ... } without throwing.
    if (!result || result.error) return { kind: "unavailable" };

    const profile = result.data;
    if (!profile || profile.id !== authUserId || !ROLES.has(profile.role)) {
      return { kind: "denied" };
    }
    if (profile.access_status === "blocked") return { kind: "blocked" };

    // Reject null, missing, typo, or any unknown status.
    if (profile.access_status !== "active") return { kind: "denied" };

    return { kind: "allowed", profile };
  } catch {
    return { kind: "unavailable" };
  }
}
