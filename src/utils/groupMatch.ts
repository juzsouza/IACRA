import { ClassSession, Group } from "../store";

export const findGroupMatch = (title: string, groups: any[]): Group | undefined => {
  if (!title || !groups || groups.length === 0) return undefined;

  const cleanTitle = title.toLowerCase().trim().replace(/_/g, ' ');

  // Sort groups by name length descending so longer/more specific names match before shorter ones
  const sortedGroups = [...groups].sort((a, b) => ((b.name || "").length - (a.name || "").length));

  for (const g of sortedGroups) {
    if (!g.name) continue;
    const cleanName = g.name.toLowerCase().trim().replace(/_/g, ' ');
    if (!cleanName) continue;

    // Exact match or explicit group prefix match
    if (
      cleanTitle === cleanName ||
      cleanTitle === `aula de ${cleanName}` ||
      cleanTitle === `turma ${cleanName}` ||
      cleanTitle === `grupo ${cleanName}`
    ) {
      return g;
    }
  }

  return undefined;
};

export const getGroupForSession = (session: ClassSession, state: any): Group | undefined => {
  if (!session || !state || !state.groups) return undefined;

  // 1. Direct group_id reference on session
  if (session.group_id) {
    const group = state.groups.find((g: any) => g.id === session.group_id);
    if (group) return group;
  }

  // 2. Title matching via normalized findGroupMatch
  const titleMatch = findGroupMatch(session.title, state.groups);
  if (titleMatch) return titleMatch;

  return undefined;
};

/**
 * Retorna o ID do grupo ao qual a aula pertence, ou null se for aula individual.
 * Prioriza session.group_id; se ausente, busca por título via findGroupMatch (suporte a grupos legados).
 */
export const getSessionGroupId = (session: ClassSession, state: any): string | null => {
  if (!session) return null;
  if (session.group_id) return session.group_id;
  const group = getGroupForSession(session, state);
  return group ? group.id : null;
};

/**
 * Retorna se a aula é de grupo.
 */
export const isGroupClass = (session: ClassSession, state: any): boolean => {
  return getSessionGroupId(session, state) !== null;
};

/**
 * Retorna se a aula é individual.
 */
export const isIndividualClass = (session: ClassSession, state: any): boolean => {
  return getSessionGroupId(session, state) === null;
};

/**
 * Verifica se a aula pertence a um grupo específico.
 */
export const doesClassBelongToGroup = (session: ClassSession, groupId: string, state: any): boolean => {
  if (!session || !groupId) return false;
  const classGroupId = getSessionGroupId(session, state);
  return classGroupId === groupId;
};

