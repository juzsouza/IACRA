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
  if (!role) {
    return false;
  }
  const allowedRoles = VIEW_ROLE_PERMISSIONS[view];
  return Boolean(allowedRoles && allowedRoles.includes(role));
};

export const getDefaultViewForRole = (
  role?: string | null,
  options?: { isMobile?: boolean }
): View => {
  const isMobile = options?.isMobile ?? (typeof window !== "undefined" && window.innerWidth < 768);
  if (role === "teacher") {
    return isMobile ? "classes" : "students";
  }
  if (role === "admin" || role === "super_admin") {
    return "dashboard";
  }
  return isMobile ? "classes" : "students";
};

/**
 * Determina a view inicial para uma nova sessão ou carregamento do perfil.
 * 
 * Regras:
 * 1. Professor em tela menor que 768px (celular): inicia diretamente em 'classes' (Aulas/Agenda),
 *    mesmo que exista uma preferência antiga salva em 'students' (Alunos).
 * 2. Professor em desktop (>= 768px): preserva o comportamento existente (usa a preferência salva,
 *    ou fallback para 'students').
 * 3. Super Admin, Admin e demais perfis: preservam integralmente o comportamento atual (preferência salva,
 *    ou fallback para 'dashboard').
 */
export const resolveInitialView = (
  profileId: string,
  role?: string | null,
  options?: { isMobile?: boolean }
): View => {
  const isMobile = options?.isMobile ?? (typeof window !== "undefined" && window.innerWidth < 768);

  // Regra prioritária da Agenda Mobile para perfil Professor em telas < 768px
  if (role === "teacher" && isMobile) {
    return "classes";
  }

  // Comportamento padrão preservado para desktop e outros perfis
  const saved = getSavedView(profileId, role);
  if (saved) {
    return saved;
  }

  return getDefaultViewForRole(role, { isMobile });
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
