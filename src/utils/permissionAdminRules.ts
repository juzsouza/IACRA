/** Pure, testable EAVRA permission contract: UI validation is not the authorization boundary. */
export type PermissionDecision = 'allow' | 'deny' | 'inherit';
export type PermissionScope = 'all' | 'own' | 'none';
export type PermissionSubject = 'role' | 'user';
export type RoleTarget = 'admin' | 'teacher';
export type PermissionCatalogItem = {
  key: string; module: string; action: string; reserved: boolean; admin_only: boolean;
};
export type PermissionRule = {
  key: string; decision: 'allow' | 'deny'; scope: PermissionScope;
};
export type RolePermissionRule = PermissionRule & { role: RoleTarget };
export type UserPermissionRule = PermissionRule & { profile_id: string };
export type PermissionSnapshot = {
  catalog: PermissionCatalogItem[];
  role_rules: RolePermissionRule[];
  user_rules: UserPermissionRule[];
};
export type PermissionMutation = {
  subjectType: PermissionSubject;
  target: string;
  permissionKey: string;
  decision: PermissionDecision;
  scope: PermissionScope;
};
export type PermissionSaveResult = { changed: boolean };


export function validateMutation(input: PermissionMutation, snapshot: PermissionSnapshot, targetRole?: RoleTarget): void {
  const item = snapshot.catalog.find(c => c.key === input.permissionKey);
  if (!item) throw new Error('Permissão desconhecida: atualização recusada.');
  if (item.reserved) throw new Error('Esta permissão é exclusiva do Super Admin.');
  if (input.subjectType !== 'role' && input.subjectType !== 'user') throw new Error('Tipo de regra inválido.');
  if (!input.target) throw new Error('Selecione um perfil ou usuário válido.');
  if (input.subjectType === 'role' && input.target !== 'admin' && input.target !== 'teacher') {
    throw new Error('Perfil inválido.');
  }
  const role = input.subjectType === 'role' ? input.target : targetRole;
  if (role !== 'admin' && role !== 'teacher') throw new Error('Não é possível autorizar esse usuário.');
  if (input.decision === 'allow') {
    if (!['all', 'own'].includes(input.scope)) throw new Error('Escopo inválido.');
    if (role === 'teacher' && (item.admin_only || input.scope !== 'own')) {
      throw new Error('Professor não pode receber essa permissão/escopo.');
    }
  } else if ((input.decision === 'deny' || input.decision === 'inherit') && input.scope === 'none') {
    return;
  } else {
    throw new Error('Combinação de regra e escopo inválida.');
  }
}

export function parseSnapshot(raw: unknown): PermissionSnapshot {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Resposta de permissões inválida.');
  const value = raw as Record<string, unknown>;
  if (!Array.isArray(value.catalog) || !Array.isArray(value.role_rules) || !Array.isArray(value.user_rules)) {
    throw new Error('Estrutura de permissões inesperada.');
  }
  const catalog = value.catalog;
  if (!catalog.every((item: unknown) => item && typeof item === 'object' &&
     typeof (item as PermissionCatalogItem).key === 'string' &&
     typeof (item as PermissionCatalogItem).module === 'string' &&
     typeof (item as PermissionCatalogItem).action === 'string' &&
     typeof (item as PermissionCatalogItem).reserved === 'boolean' &&
     typeof (item as PermissionCatalogItem).admin_only === 'boolean')) {
    throw new Error('Catálogo de permissões inválido.');
  }
  if (!value.role_rules.every((r: RolePermissionRule) => r && ['admin','teacher'].includes(r.role) &&
      ['allow','deny'].includes(r.decision) && ['all','own','none'].includes(r.scope)) ||
      !value.user_rules.every((r: UserPermissionRule) => r && typeof r.profile_id === 'string' &&
      ['allow','deny'].includes(r.decision) && ['all','own','none'].includes(r.scope))) {
    throw new Error('Regras de permissões inválidas.');
  }
  return raw as PermissionSnapshot;
}

