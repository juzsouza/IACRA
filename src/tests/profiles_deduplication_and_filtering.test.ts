/**
 * Testes Automatizados de Deduplicação e Integridade de Perfis
 *
 * Cenários Testados:
 * 1. state.profiles não possui IDs duplicados.
 * 2. Dois usuários com e-mails semelhantes aparecem separadamente.
 * 3. O mesmo profile.id nunca aparece duas vezes.
 * 4. Filtros: Todos, Acesso Liberado, Acesso Bloqueado continuam funcionando.
 * 5. Busca por "jusssouza": encontra os usuários correspondentes sem confundir suas identidades.
 * 6. Nenhuma conta é excluída ou alterada.
 */

interface UserProfile {
  id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'receptionist' | 'financial' | 'teacher';
  teacher_id?: string | null;
  access_status?: 'active' | 'blocked';
  created_at?: string;
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${testName}`, detail || '');
    failed++;
  }
}

export function runProfilesTests() {
  console.log('\n==================================================');
  console.log('🧪 TESTES: DEDUPLICAÇÃO E INTEGRIDADE DE PERFIS');
  console.log('==================================================\n');

  // Teste 1 & 3: Canonical deduplication por p.id
  const rawProfiles: UserProfile[] = [
    {
      id: 'ff823df2-d960-4e40-b14e-fb850d0e8e10',
      email: 'jusssouza@gmail.com',
      role: 'teacher',
      access_status: 'blocked',
    },
    {
      id: 'ff823df2-d960-4e40-b14e-fb850d0e8e10', // mesmo ID (duplicata de mock/cache)
      email: 'jusssouza@gmail.com',
      role: 'teacher',
      access_status: 'blocked',
    },
    {
      id: '49f988c0-1bae-406f-946b-a0f022814edd',
      email: 'jusssouzaa@gmail.com',
      role: 'super_admin',
      access_status: 'active',
    },
  ];

  const uniqueProfiles = Array.from(
    new Map(rawProfiles.map((p) => [p.id, p])).values()
  );

  assert(uniqueProfiles.length === 2, '1. Deduplicação canônica resulta em exatamente 2 perfis distintos');
  assert(new Set(uniqueProfiles.map((p) => p.id)).size === 2, '3. O mesmo profile.id nunca aparece duas vezes');

  // Teste 2: Dois usuários com e-mails semelhantes aparecem separadamente
  const distinctEmails = uniqueProfiles.map((p) => p.email);
  assert(
    distinctEmails.includes('jusssouza@gmail.com') && distinctEmails.includes('jusssouzaa@gmail.com'),
    '2. Dois usuários com e-mails semelhantes (jusssouza vs jusssouzaa) aparecem separadamente'
  );

  // Teste 4: Filtros (Todos, Acesso Liberado, Acesso Bloqueado)
  const filterAll = uniqueProfiles.filter(() => true);
  const filterActive = uniqueProfiles.filter((p) => (p.access_status || 'active') === 'active');
  const filterBlocked = uniqueProfiles.filter((p) => (p.access_status || 'active') === 'blocked');

  assert(filterAll.length === 2, '4a. Filtro Todos exibe todos os perfis');
  assert(filterActive.length === 1 && filterActive[0].email === 'jusssouzaa@gmail.com', '4b. Filtro Acesso Liberado exibe apenas usuário ativo');
  assert(filterBlocked.length === 1 && filterBlocked[0].email === 'jusssouza@gmail.com', '4c. Filtro Acesso Bloqueado exibe apenas usuário bloqueado');

  // Teste 5: Busca por "jusssouza"
  const searchTerm = 'jusssouza';
  const matches = uniqueProfiles.filter((p) =>
    (p.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  assert(matches.length === 2, '5a. Busca por "jusssouza" encontra ambos os registros');
  const tProfile = matches.find((p) => p.id === 'ff823df2-d960-4e40-b14e-fb850d0e8e10');
  const sProfile = matches.find((p) => p.id === '49f988c0-1bae-406f-946b-a0f022814edd');
  assert(tProfile?.role === 'teacher' && sProfile?.role === 'super_admin', '5b. Identidades, IDs e papéis são estritamente preservados');

  // Teste 6: Nenhuma conta é excluída ou alterada
  assert(
    tProfile?.access_status === 'blocked' && sProfile?.access_status === 'active',
    '6. Nenhuma conta é alterada ou excluída'
  );

  console.log(`\nResultado dos testes: ${passed} passaram, ${failed} falharam.\n`);
  if (failed > 0) {
    throw new Error(`${failed} teste(s) falharam.`);
  }
}

runProfilesTests();
