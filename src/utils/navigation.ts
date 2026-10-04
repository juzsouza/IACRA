/**
 * Centralized navigation utilities and types for EAVRA.
 * Handles view persistence and role-based validation across browser reloads / mobile app switches.
 */

export type View =
  | "dashboard"
  | "students"
  | "teachers"
  | "classes"
  | "class_reports"
  | "finance"
  | "financial_plans"
  | "choir"
  | "enrollments"
  | "discount_rules"
  | "payments"
  | "groups"
  | "makeups"
  | "prospects"
  | "profiles"
  | "affiliates"
  | "not_eligible";

export const ALL_VIEWS: readonly View[] = [
  "dashboard",
  "students",
  "teachers",
  "classes",
  "class_reports",
  "finance",
  "financial_plans",
  "choir",
  "enrollments",
  "discount_rules",
  "payments",
  "groups",
  "makeups",
  "prospects",
  "profiles",
  "affiliates",
  "not_eligible",
] as const;

export const VIEW_ROLE_PERMISSIONS: Record<View, readonly string[]> = {
  dashboard: ["super_admin", "admin"],
  prospects: ["super_admin", "admin"],
  students: ["super_admin", "admin", "teacher"],
  enrollments: ["super_admin", "admin"],
  affiliates: ["super_admin", "admin"],
  groups: ["super_admin", "admin"],
  not_eligible: ["super_admin", "admin"],
  payments: ["super_admin"],
  teachers: ["super_admin", "admin"],
  classes: ["super_admin", "admin", "teacher"],
  class_reports: ["super_admin", "admin", "teacher"],
  makeups: ["super_admin", "admin"],
  finance: ["super_admin"],
  financial_plans: ["super_admin"],
  discount_rules: ["super_admin"],
  choir: ["super_admin", "admin"],
  profiles: ["super_admin"],
};

export const getStorageKey = (profileId: string): string => {
  return `playgroove_current_view_${profileId}`;
};

export const isValidView = (viewCandidate: unknown): viewCandidate is View => {
  return typeof viewCandidate === "string" && (ALL_VIEWS as readonly string[]).includes(viewCandidate);
};

export const isViewPermittedForRole = (view: View, role?: string | null): boolean => {
  const effectiveRole = role || "teacher";
  const allowedRoles = VIEW_ROLE_PERMISSIONS[view];
  return Boolean(allowedRoles && allowedRoles.includes(effectiveRole));
};

export const getDefaultViewForRole = (role?: string | null): View => {
  if (role === "teacher") {
    return "students";
  }
  return "dashboard";
};

export const getSavedView = (profileId: string, role?: string | null): View | null => {
  if (typeof window === "undefined" || !profileId) return null;
  const key = getStorageKey(profileId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    if (!isValidView(raw)) {
      // Invalid or retired view: clean up to avoid future stale lookups
      localStorage.removeItem(key);
      return null;
    }

    if (!isViewPermittedForRole(raw, role)) {
      // User does not have permission for this view
      return null;
    }

    return raw;
  } catch (err) {
    console.warn("[Navigation] Could not read saved view from localStorage:", err);
    return null;
  }
};

export const persistView = (profileId: string, view: View): void => {
  if (typeof window === "undefined" || !profileId) return;
  try {
    const key = getStorageKey(profileId);
    localStorage.setItem(key, view);
  } catch (err) {
    console.warn("[Navigation] Could not persist view to localStorage:", err);
  }
};
