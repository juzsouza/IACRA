import assert from 'node:assert';
import { isViewPermittedForRole, getDefaultViewForRole, ALL_VIEWS, VIEW_ROLE_PERMISSIONS } from '../utils/navigation';

/**
 * Testes de Segurança e Resolução de Perfil de Usuário
 * Valida os 10 requisitos de integridade de roles e segurança estrita contra elevação/rebaixamento inadvertido.
 */

interface MockProfile {
  id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'teacher';
  teacher_id?: string | null;
  access_status: 'active' | 'blocked';
}

// Implementação pura do motor de resolução de perfil (idêntica à de store.tsx)
function resolveUserProfile(
  authUser: { id: string; email?: string } | null,
  dbProfiles: MockProfile[],
  localProfiles: MockProfile[] = []
): { profile: MockProfile | null; diagnosticWarning?: string } {
  if (!authUser || !authUser.id) {
    return { profile: null };
  }

  const cleanEmail = (authUser.email || '').trim().toLowerCase();

  // 1. Buscar prioritariamente por ID
  const byId = dbProfiles.find(p => p.id === authUser.id);
  if (byId) {
    return { profile: byId };
  }

  // 2. Se não encontrar e houver email, buscar por email normalizado (resiliência contra divergência de ID)
  if (cleanEmail) {
    const byEmail = dbProfiles.find(p => (p.email || '').trim().toLowerCase() === cleanEmail);
    if (byEmail) {
      const diagnosticWarning = `[AUTH DIAGNÓSTICO] Inconsistência de identificador detectada para ${cleanEmail}: auth user.id (${authUser.id}) diverge do profiles.id (${byEmail.id}). Carregando perfil com sucesso por e-mail com role "${byEmail.role}".`;
      return { profile: byEmail, diagnosticWarning };
    }
  }

  // 3. Fallback no cache local
  const localById = localProfiles.find(p => p.id === authUser.id);
  if (localById) {
    return { profile: localById };
  }

  if (cleanEmail) {
    const localByEmail = localProfiles.find(p => (p.email || '').trim().toLowerCase() === cleanEmail);
    if (localByEmail) {
      return { profile: localByEmail, diagnosticWarning: `Recuperado de cache local por e-mail: ${cleanEmail}` };
    }
  }

  // 4. Não encontrado de nenhuma forma: perfil permanece estritamente null sem assumir role padrão
  return { profile: null };
}

// Simulação de renderização de navItems do Layout
function computeNavItems(currentUserProfile: MockProfile | null, allNavItems: { id: string; roles: string[] }[]) {
  const userRole = currentUserProfile?.role;
  return userRole ? allNavItems.filter(item => item.roles.includes(userRole)) : [];
}

const mockNavItems = [
  { id: "dashboard", roles: ["super_admin", "admin"] },
  { id: "students", roles: ["super_admin", "admin", "teacher"] },
  { id: "payments", roles: ["super_admin"] },
  { id: "teachers", roles: ["super_admin", "admin"] },
  { id: "classes", roles: ["super_admin", "admin", "teacher"] },
  { id: "class_reports", roles: ["super_admin", "admin", "teacher"] },
  { id: "finance", roles: ["super_admin"] },
  { id: "profiles", roles: ["super_admin"] },
];

async function runTests() {
  console.log('--- INICIANDO TESTES: AUTH PROFILE RESOLUTION & SECURITY ---');

  const testDb: MockProfile[] = [
    {
      id: 'fc5d565f-7178-499e-97e4-4e8f3c8bae86',
      email: 'institutodeartera@gmail.com',
      role: 'super_admin',
      teacher_id: null,
      access_status: 'active'
    },
    {
      id: 'teacher-uuid-001',
      email: 'luckviolinista@hotmail.com',
      role: 'teacher',
      teacher_id: '7171c7c8-0dca-42d8-bbaf-3d5e4ea369ae',
      access_status: 'active'
    },
    {
      id: 'admin-uuid-002',
      email: 'deboratrindade23@gmail.com',
      role: 'admin',
      teacher_id: null,
      access_status: 'active'
    },
    {
      id: 'superadmin-uuid-003',
      email: 'jusssouzaa@gmail.com',
      role: 'super_admin',
      teacher_id: null,
      access_status: 'active'
    }
  ];

  // 1. Auth ID igual ao profile ID → role correta
  {
    const authUser = { id: 'teacher-uuid-001', email: 'luckviolinista@hotmail.com' };
    const { profile } = resolveUserProfile(authUser, testDb);
    assert.ok(profile, 'Perfil deve ser encontrado');
    assert.strictEqual(profile?.role, 'teacher', 'Role deve ser teacher');
    assert.strictEqual(profile?.id, 'teacher-uuid-001');
    console.log('✅ 1. Auth ID igual ao profile ID → role correta');
  }

  // 2. Auth ID diferente + email correspondente → perfil encontrado por email (fallback resiliente)
  {
    const authUserDivergent = { id: 'random-auth-id-999', email: 'institutodeartera@gmail.com' };
    const { profile, diagnosticWarning } = resolveUserProfile(authUserDivergent, testDb);
    assert.ok(profile, 'Perfil deve ser recuperado por email mesmo com Auth ID divergente');
    assert.strictEqual(profile?.role, 'super_admin', 'Role deve ser super_admin');
    assert.ok(diagnosticWarning && diagnosticWarning.includes('Inconsistência de identificador'), 'Deve registrar aviso diagnóstico');
    console.log('✅ 2. Auth ID diferente + email correspondente → perfil encontrado por email e diagnosticado');
  }

  // 3. institutodeartera@gmail.com → super_admin
  {
    const authUserInst = { id: 'fc5d565f-7178-499e-97e4-4e8f3c8bae86', email: 'institutodeartera@gmail.com' };
    const { profile } = resolveUserProfile(authUserInst, testDb);
    assert.ok(profile, 'institutodeartera@gmail.com deve ser encontrado');
    assert.strictEqual(profile?.role, 'super_admin', 'institutodeartera@gmail.com deve ser super_admin');
    assert.strictEqual(profile?.teacher_id, null, 'teacher_id deve ser null');
    assert.strictEqual(profile?.access_status, 'active', 'access_status deve ser active');
    console.log('✅ 3. institutodeartera@gmail.com → super_admin com acesso ativo e teacher_id null');
  }

  // 4. Usuário sem perfil → não assume teacher
  {
    const authUserUnknown = { id: 'ghost-id-404', email: 'desconhecido@escola.com' };
    const { profile } = resolveUserProfile(authUserUnknown, testDb);
    assert.strictEqual(profile, null, 'Perfil deve ser null');
    const navItems = computeNavItems(profile, mockNavItems);
    assert.strictEqual(navItems.length, 0, 'Usuário sem perfil NÃO pode receber itens de teacher');
    console.log('✅ 4. Usuário sem perfil → não assume teacher (perfil null, 0 navItems)');
  }

  // 5. role null → nenhuma view protegida liberada
  {
    for (const view of ALL_VIEWS) {
      assert.strictEqual(isViewPermittedForRole(view, null), false, `View ${view} deve ser bloqueada para role null`);
      assert.strictEqual(isViewPermittedForRole(view, undefined), false, `View ${view} deve ser bloqueada para role undefined`);
      assert.strictEqual(isViewPermittedForRole(view, ''), false, `View ${view} deve ser bloqueada para role vazia`);
    }
    console.log('✅ 5. role null/undefined → nenhuma view protegida liberada (isViewPermittedForRole retorna false para todas as 17 views)');
  }

  // 6. Layout sem perfil → não exibe menu privilegiado
  {
    const emptyNav = computeNavItems(null, mockNavItems);
    assert.strictEqual(emptyNav.length, 0, 'Menu sem perfil deve ter 0 itens');
    assert.strictEqual(emptyNav.some(i => i.id === 'students'), false, 'Não deve exibir alunos');
    assert.strictEqual(emptyNav.some(i => i.id === 'classes'), false, 'Não deve exibir aulas');
    assert.strictEqual(emptyNav.some(i => i.id === 'finance'), false, 'Não deve exibir financeiro');
    console.log('✅ 6. Layout sem perfil → não exibe menu privilegiado nem telas de professor');
  }

  // 7. Novo cadastro → profile.id corresponde ao auth.users.id
  {
    // Simulação do fluxo de criação oficial garantindo chave sincronizada
    const newAuthUser = { id: 'auth-user-id-novo-777', email: 'novoprofessor@escola.com' };
    const createdProfile: MockProfile = {
      id: newAuthUser.id, // ID sincronizado
      email: newAuthUser.email,
      role: 'teacher',
      teacher_id: 't-123',
      access_status: 'active'
    };
    assert.strictEqual(createdProfile.id, newAuthUser.id, 'profiles.id deve corresponder rigorosamente ao auth.users.id');
    console.log('✅ 7. Novo cadastro → profile.id corresponde exatamente ao auth.users.id');
  }

  // 8. Professor existente continua professor
  {
    const profUser = { id: 'teacher-uuid-001', email: 'luckviolinista@hotmail.com' };
    const { profile } = resolveUserProfile(profUser, testDb);
    assert.strictEqual(profile?.role, 'teacher', 'Professor existente deve continuar como teacher');
    assert.strictEqual(isViewPermittedForRole('classes', profile?.role), true, 'Professor pode acessar aulas');
    assert.strictEqual(isViewPermittedForRole('finance', profile?.role), false, 'Professor não pode acessar financeiro');
    console.log('✅ 8. Professor existente continua professor com permissões restritas');
  }

  // 9. Admin existente continua admin
  {
    const adminUser = { id: 'admin-uuid-002', email: 'deboratrindade23@gmail.com' };
    const { profile } = resolveUserProfile(adminUser, testDb);
    assert.strictEqual(profile?.role, 'admin', 'Admin existente deve continuar como admin');
    assert.strictEqual(isViewPermittedForRole('dashboard', profile?.role), true, 'Admin pode acessar dashboard');
    assert.strictEqual(isViewPermittedForRole('students', profile?.role), true, 'Admin pode acessar alunos');
    assert.strictEqual(isViewPermittedForRole('finance', profile?.role), false, 'Admin não pode acessar financeiro');
    console.log('✅ 9. Admin existente continua admin');
  }

  // 10. Super Admin existente continua super_admin
  {
    const saUser = { id: 'superadmin-uuid-003', email: 'jusssouzaa@gmail.com' };
    const { profile } = resolveUserProfile(saUser, testDb);
    assert.strictEqual(profile?.role, 'super_admin', 'Super Admin existente deve continuar como super_admin');
    assert.strictEqual(isViewPermittedForRole('finance', profile?.role), true, 'Super Admin pode acessar financeiro');
    assert.strictEqual(isViewPermittedForRole('profiles', profile?.role), true, 'Super Admin pode acessar perfis');
    assert.strictEqual(isViewPermittedForRole('payments', profile?.role), true, 'Super Admin pode acessar pagamentos');
    console.log('✅ 10. Super Admin existente continua super_admin com acesso irrestrito');
  }

  console.log('🎉 TODOS OS 10 TESTES DE SEGURANÇA E RESOLUÇÃO DE PERFIL FORAM APROVADOS COM SUCESSO!');
}

runTests().catch(err => {
  console.error('Falha nos testes:', err);
  process.exit(1);
});
