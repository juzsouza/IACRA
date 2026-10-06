import assert from 'node:assert';
import { normalizeTeacher, Teacher } from '../store.js';

let testsPassed = 0;
let testsFailed = 0;

function testAssert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`❌ FAIL: ${testName}`, detail || '');
    testsFailed++;
  }
}

async function runTeacherResilienceTests() {
  console.log('\n================================================================');
  console.log('🧪 TESTES: RESILIÊNCIA E PREVENÇÃO DE NULL EM TEACHERS / SPECIALTIES');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // 1. Normalização de Teacher com specialties = null
  // --------------------------------------------------------------------------
  console.log('--- 1. Teacher com specialties = null ---');
  const rawTeacherNull = {
    id: 't_null',
    name: 'Professor Null',
    email: 'prof.null@escola.com',
    phone: '11999999999',
    specialties: null as any,
    status: 'active' as const,
  };

  const normalizedNull = normalizeTeacher(rawTeacherNull);
  testAssert(Array.isArray(normalizedNull.specialties), '1.1 normalizeTeacher converte specialties=null em Array');
  testAssert(normalizedNull.specialties.length === 0, '1.2 specialties é um array vazio []');
  testAssert(normalizedNull.specialties !== null, '1.3 specialties não é null');
  testAssert(normalizedNull.specialties !== undefined, '1.4 specialties não é undefined');

  // --------------------------------------------------------------------------
  // 2. Normalização de Teacher com specialties = undefined
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Teacher com specialties = undefined ---');
  const rawTeacherUndefined = {
    id: 't_undef',
    name: 'Professor Undefined',
    email: 'prof.undef@escola.com',
    phone: '11999999998',
    status: 'active' as const,
  };

  const normalizedUndefined = normalizeTeacher(rawTeacherUndefined);
  testAssert(Array.isArray(normalizedUndefined.specialties), '2.1 normalizeTeacher converte specialties ausente em Array');
  testAssert(normalizedUndefined.specialties.length === 0, '2.2 specialties é array vazio []');

  // --------------------------------------------------------------------------
  // 3. Normalização de Teacher com specialties = []
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Teacher com specialties = [] ---');
  const rawTeacherEmpty = {
    id: 't_empty',
    name: 'Professor Vazio',
    email: 'prof.empty@escola.com',
    phone: '11999999997',
    specialties: [],
    status: 'active' as const,
  };

  const normalizedEmpty = normalizeTeacher(rawTeacherEmpty);
  testAssert(Array.isArray(normalizedEmpty.specialties) && normalizedEmpty.specialties.length === 0, '3.1 Preserva array vazio');

  // --------------------------------------------------------------------------
  // 4. Normalização de Teacher com specialties preenchidas
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Teacher com specialties preenchidas ---');
  const rawTeacherFilled = {
    id: 't_filled',
    name: 'Professor Canto',
    email: 'prof.canto@escola.com',
    phone: '11999999996',
    specialties: ['Canto', 'Técnica Vocal'],
    status: 'active' as const,
  };

  const normalizedFilled = normalizeTeacher(rawTeacherFilled);
  testAssert(normalizedFilled.specialties.length === 2, '4.1 Preserva specialties existentes');
  testAssert(normalizedFilled.specialties[0] === 'Canto' && normalizedFilled.specialties[1] === 'Técnica Vocal', '4.2 Itens corretos');

  // --------------------------------------------------------------------------
  // 5. Simulação de Renderização da Tabela de Professores
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Simulação da Renderização da Tabela (Teachers.tsx Linha 385) ---');
  const sampleTeachers: Teacher[] = [
    rawTeacherNull as any,
    rawTeacherUndefined as any,
    rawTeacherEmpty as any,
    rawTeacherFilled,
  ];

  let tableRenderPassed = true;
  const renderedBadges: string[][] = [];

  try {
    for (const teacher of sampleTeachers) {
      // Linha 385 de Teachers.tsx: (teacher.specialties || []).map(...)
      const badges = (teacher.specialties || []).map((spec, i) => `Badge:${spec}:${i}`);
      renderedBadges.push(badges);
    }
  } catch (err) {
    tableRenderPassed = false;
  }

  testAssert(tableRenderPassed, '5.1 Renderização da tabela com (teacher.specialties || []).map não lança exceção');
  testAssert(renderedBadges[0].length === 0, '5.2 Professor com specialties=null renderiza 0 badges sem quebrar');
  testAssert(renderedBadges[1].length === 0, '5.3 Professor com specialties=undefined renderiza 0 badges sem quebrar');
  testAssert(renderedBadges[3].length === 2, '5.4 Professor com specialties preenchidas renderiza 2 badges');

  // --------------------------------------------------------------------------
  // 6. Simulação de Abertura do Modal de Edição (Teachers.tsx Linha 187)
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Simulação de Abertura do Modal de Edição (Teachers.tsx Linha 187) ---');
  let openEditModalPassed = true;
  let editFormDataSpecialties = 'uninitialized';

  try {
    const teacherToEdit: any = {
      id: 't_edit_null',
      name: 'Professor Edit Null',
      email: 'edit@test.com',
      phone: '11999999995',
      specialties: null,
    };

    // Linha 187 de Teachers.tsx: specialties: (teacher.specialties || []).join(", ")
    const formData = {
      name: teacherToEdit.name,
      email: teacherToEdit.email,
      phone: teacherToEdit.phone,
      cpf: teacherToEdit.cpf || '',
      specialties: (teacherToEdit.specialties || []).join(', '),
      birth_date: teacherToEdit.birth_date || '',
    };
    editFormDataSpecialties = formData.specialties;
  } catch (err) {
    openEditModalPassed = false;
  }

  testAssert(openEditModalPassed, '6.1 openModal com teacher.specialties=null não lança exceção');
  testAssert(editFormDataSpecialties === '', '6.2 formData.specialties resulta em string vazia ""');

  // --------------------------------------------------------------------------
  // 7. Simulação de Abertura do Modal de Horários (Teachers.tsx Linha 724)
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Simulação de Abertura do Modal de Horários (Teachers.tsx Linha 724) ---');
  let openScheduleModalPassed = true;
  let scheduleSubtitle = '';

  try {
    const activeTeacher: any = {
      id: 't_sched_null',
      name: 'Professor Horário Null',
      specialties: null,
    };

    // Linha 724 de Teachers.tsx: {activeTeacher.name} • Especialidades: {(activeTeacher.specialties || []).join(", ")}
    scheduleSubtitle = `${activeTeacher.name} • Especialidades: ${(activeTeacher.specialties || []).join(', ')}`;
  } catch (err) {
    openScheduleModalPassed = false;
  }

  testAssert(openScheduleModalPassed, '7.1 Modal de horários com activeTeacher.specialties=null não lança exceção');
  testAssert(scheduleSubtitle === 'Professor Horário Null • Especialidades: ', '7.2 Subtítulo formatado com segurança');

  // --------------------------------------------------------------------------
  // 8. Hidratação do localStorage Contendo specialties = null
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Hidratação do localStorage com specialties: null ---');
  const rawLocalStorageJson = JSON.stringify({
    students: [],
    teachers: [
      { id: 't_ls_1', name: 'Prof Legado 1', email: 'p1@test.com', phone: '111', specialties: null },
      { id: 't_ls_2', name: 'Prof Legado 2', email: 'p2@test.com', phone: '222', specialties: undefined },
      { id: 't_ls_3', name: 'Prof Legado 3', email: 'p3@test.com', phone: '333', specialties: ['Violão'] },
    ],
  });

  const parsedFromStorage = JSON.parse(rawLocalStorageJson);
  // Espelha exatamente a hidratação do store.tsx
  const hydratedTeachers = (parsedFromStorage.teachers || []).map(normalizeTeacher);

  testAssert(hydratedTeachers.length === 3, '8.1 Todos os 3 professores hidratados');
  testAssert(Array.isArray(hydratedTeachers[0].specialties) && hydratedTeachers[0].specialties.length === 0, '8.2 Prof Legado 1 normalizado para []');
  testAssert(Array.isArray(hydratedTeachers[1].specialties) && hydratedTeachers[1].specialties.length === 0, '8.3 Prof Legado 2 normalizado para []');
  testAssert(Array.isArray(hydratedTeachers[2].specialties) && hydratedTeachers[2].specialties[0] === 'Violão', '8.4 Prof Legado 3 preservou ["Violão"]');

  // --------------------------------------------------------------------------
  // 9. Carregamento do Supabase Contendo specialties = null
  // --------------------------------------------------------------------------
  console.log('\n--- 9. Carregamento do Supabase com specialties: null ---');
  const mockSupabaseResponse = [
    { id: 't_sb_1', name: 'Prof Supabase 1', email: 'sb1@test.com', specialties: null, status: 'active' },
    { id: 't_sb_2', name: 'Prof Supabase 2', email: 'sb2@test.com', specialties: null, status: 'inactive' },
  ];

  // Espelha a carga em loadData do store.tsx
  const loadedFromSupabase = mockSupabaseResponse.map(normalizeTeacher);

  testAssert(loadedFromSupabase.length === 2, '9.1 2 professores carregados do Supabase');
  testAssert(Array.isArray(loadedFromSupabase[0].specialties), '9.2 Prof Supabase 1 normalizado para Array');
  testAssert(Array.isArray(loadedFromSupabase[1].specialties), '9.3 Prof Supabase 2 normalizado para Array');

  // --------------------------------------------------------------------------
  // 10. Garantia Absoluta: Nenhum Objeto Permanece com specialties Nulo
  // --------------------------------------------------------------------------
  console.log('\n--- 10. Garantia: Zero objetos com specialties nulo após normalização ---');
  const heterogeneousList: any[] = [
    { id: '1', name: 'A', specialties: null },
    { id: '2', name: 'B', specialties: undefined },
    { id: '3', name: 'C', specialties: [] },
    { id: '4', name: 'D', specialties: ['Bateria'] },
    { id: '5', name: 'E', specialties: null },
    { id: '6', name: 'F', specialties: 'string_invalida' }, // Caso anômalo extremo
    { id: '7', name: 'G', specialties: 12345 },              // Caso numérico extremo
    { id: '8', name: 'H', specialties: { obj: true } },       // Caso objeto extremo
    null,                                                     // Item nulo na lista
    undefined,                                                // Item indefinido
  ];

  const strictlyNormalized = heterogeneousList.map(normalizeTeacher);

  const hasAnyNullSpecialties = strictlyNormalized.some(
    (t) => t.specialties === null || t.specialties === undefined || !Array.isArray(t.specialties)
  );

  testAssert(!hasAnyNullSpecialties, '10.1 NENHUM objeto possui specialties null, undefined ou não-array');
  testAssert(strictlyNormalized.every((t) => Array.isArray(t.specialties)), '10.2 100% dos objetos possuem specialties como Array');

  console.log('\n================================================================');
  console.log(`📊 RESULTADO DOS TESTES DE RESILIÊNCIA DE TEACHERS:`);
  console.log(`   Sucessos: ${testsPassed}`);
  console.log(`   Falhas:   ${testsFailed}`);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTeacherResilienceTests().catch((err) => {
  console.error('Erro fatal nos testes de resiliência:', err);
  process.exit(1);
});
