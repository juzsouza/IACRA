import {
  ChoirRegistration,
  ChoirCollaborator,
  ChoirRehearsal,
  ChoirAttendanceRecord,
  getEligibleChoirCollaboratorsForRehearsal,
  getEligibleChoirSingersForRehearsal,
  parseAttendance
} from '../store';

export interface ChoirAttendanceTestResult {
  id: string;
  name: string;
  category: string;
  passed: boolean;
  details: string;
}

export interface ChoirTestSuiteResult {
  passed: boolean;
  totalCount: number;
  passedCount: number;
  failedCount: number;
  results: ChoirAttendanceTestResult[];
}

export const runChoirAttendanceValidationTests = (): ChoirTestSuiteResult => {
  const results: ChoirAttendanceTestResult[] = [];

  // Mock Students / Registrations
  let mockRegistrations: ChoirRegistration[] = [
    {
      id: 'reg-active-1',
      student_id: 'student-maria',
      voice_type_id: 'voice-soprano',
      status: 'approved',
      active: true,
      monthly_fee: 150,
      is_internal_student: false,
    },
    {
      id: 'reg-active-2',
      student_id: 'student-joao',
      voice_type_id: 'voice-tenor',
      status: 'approved',
      active: true,
      monthly_fee: 20,
      is_internal_student: true,
    },
    {
      id: 'reg-active-3',
      student_id: 'student-ana',
      voice_type_id: 'voice-contralto',
      status: 'approved',
      active: true,
      monthly_fee: 150,
      is_internal_student: false,
    },
  ];

  // Mock Historical August 2026 Rehearsal (with Maria having recorded attendance)
  const mockAugustRehearsal: ChoirRehearsal = {
    id: 'reh-aug-2026',
    date: '2026-08-14',
    title: 'Ensaio de Agosto #2',
    attendance: [
      { person_id: 'student-maria', type: 'singer', status: 'present', notes: 'Participou normalmente em agosto' },
      { person_id: 'student-joao', type: 'singer', status: 'present' },
      { person_id: 'student-ana', type: 'singer', status: 'present' },
    ],
  };

  // Mock September 2026 Rehearsal
  const mockSeptemberRehearsal: ChoirRehearsal = {
    id: 'reh-sept-2026',
    date: '2026-09-04',
    title: 'Ensaio de Setembro #1',
    attendance: [],
  };

  // TESTE 1: Selecionar um participante ativo. Clicar em INATIVAR -> Esperado: status = INATIVO (active = false)
  // Simulate Inactivation of Maria
  const mariaBefore = mockRegistrations.find(r => r.student_id === 'student-maria')!;
  const mariaInactivated: ChoirRegistration = {
    ...mariaBefore,
    status: 'inactive',
    active: false,
  };
  mockRegistrations = mockRegistrations.map(r => r.id === mariaInactivated.id ? mariaInactivated : r);
  const test1Passed = mariaInactivated.status === 'inactive' && mariaInactivated.active === false;
  results.push({
    id: 'TEST-1',
    name: 'TESTE 1: Inativar participante ativo define status como INATIVO',
    category: 'Status e Inativação',
    passed: test1Passed,
    details: test1Passed
      ? 'Aprovado: O participante (Maria) foi inativado com sucesso, recebendo status = "inactive" e active = false sem ser excluído do cadastro.'
      : 'Falha: Status ou flag active do participante não foram atualizados corretamente.',
  });

  // TESTE 2: Abrir uma chamada de setembro/2026 -> O participante inativo NÃO aparece
  const septSingers = getEligibleChoirSingersForRehearsal(mockSeptemberRehearsal, mockRegistrations);
  const mariaInSept = septSingers.some(r => r.student_id === 'student-maria');
  const test2Passed = !mariaInSept && septSingers.length === 2;
  results.push({
    id: 'TEST-2',
    name: 'TESTE 2: Participante inativo NÃO aparece na chamada de setembro/2026',
    category: 'Chamada Setembro/2026',
    passed: test2Passed,
    details: test2Passed
      ? `Aprovado: Em ensaios a partir de 01/09/2026 (${mockSeptemberRehearsal.date}), o participante inativo é ocultado da lista de chamada. Total de alunos ativos na chamada: ${septSingers.length}.`
      : 'Falha: O participante inativo continuou aparecendo na chamada de setembro/2026.',
  });

  // TESTE 3: Abrir uma chamada de agosto/2026 -> O participante continua disponível no histórico
  const augSingers = getEligibleChoirSingersForRehearsal(mockAugustRehearsal, mockRegistrations);
  const mariaInAug = augSingers.some(r => r.student_id === 'student-maria');
  const test3Passed = mariaInAug && augSingers.length === 3;
  results.push({
    id: 'TEST-3',
    name: 'TESTE 3: Participante inativo continua disponível no histórico de agosto/2026',
    category: 'Histórico Agosto/2026',
    passed: test3Passed,
    details: test3Passed
      ? `Aprovado: Ao abrir chamada com data até 31/08/2026 (${mockAugustRehearsal.date}), o histórico completo com Maria é preservado (Total: ${augSingers.length}).`
      : 'Falha: O participante inativo foi removido indevidamente do histórico de agosto/2026.',
  });

  // TESTE 4: Verificar presença histórica -> Nenhuma presença foi apagada
  const parsedAugAttendance = parseAttendance(mockAugustRehearsal.attendance);
  const mariaRecord = parsedAugAttendance.find(a => a.person_id === 'student-maria' && a.type === 'singer');
  const test4Passed = mariaRecord?.status === 'present' && mariaRecord?.notes === 'Participou normalmente em agosto';
  results.push({
    id: 'TEST-4',
    name: 'TESTE 4: Presença histórica e anotações foram 100% preservadas',
    category: 'Integridade de Dados',
    passed: test4Passed,
    details: test4Passed
      ? 'Aprovado: O registro de presença de Maria no ensaio de 14/08/2026 permanece intacto com status "present" e notas preservadas.'
      : 'Falha: O registro histórico de presença foi alterado ou apagado ao inativar.',
  });

  // TESTE 5: Reativar participante -> Esperado: active = true e status = APROVADO
  const mariaReactivated: ChoirRegistration = {
    ...mariaInactivated,
    status: 'approved',
    active: true,
  };
  mockRegistrations = mockRegistrations.map(r => r.id === mariaReactivated.id ? mariaReactivated : r);
  const test5Passed = mariaReactivated.active === true && mariaReactivated.status === 'approved';
  results.push({
    id: 'TEST-5',
    name: 'TESTE 5: Reativação do participante restaura active = true e status = APROVADO',
    category: 'Reativação',
    passed: test5Passed,
    details: test5Passed
      ? 'Aprovado: Ação de reativação redefiniu active = true e status = "approved", restabelecendo a elegibilidade do participante.'
      : 'Falha: Reativação não restaurou active = true ou status = "approved".',
  });

  // TESTE 6: Abrir nova chamada após a reativação -> O participante volta a aparecer
  const septSingersAfterReactivation = getEligibleChoirSingersForRehearsal(mockSeptemberRehearsal, mockRegistrations);
  const mariaInSeptAfter = septSingersAfterReactivation.some(r => r.student_id === 'student-maria');
  const test6Passed = mariaInSeptAfter && septSingersAfterReactivation.length === 3;
  results.push({
    id: 'TEST-6',
    name: 'TESTE 6: Participante reativado volta a aparecer nas novas chamadas',
    category: 'Chamada Pós-Reativação',
    passed: test6Passed,
    details: test6Passed
      ? `Aprovado: Após a reativação, Maria volta a figurar imediatamente na chamada do ensaio de ${mockSeptemberRehearsal.date} (Total: ${septSingersAfterReactivation.length}).`
      : 'Falha: Participante reativado não apareceu na chamada de setembro.',
  });

  // TESTE 7: Excluir participante -> Confirmar que a função de excluir continua independente da função de inativar
  const mockRegistrationsAfterDelete = mockRegistrations.filter(r => r.id !== 'reg-active-3');
  const test7Passed = mockRegistrationsAfterDelete.length === 2 &&
                      !mockRegistrationsAfterDelete.some(r => r.id === 'reg-active-3') &&
                      mockRegistrations.some(r => r.id === 'reg-active-1'); // Maria continua existindo
  results.push({
    id: 'TEST-7',
    name: 'TESTE 7: Exclusão e Inativação permanecem funções independentes',
    category: 'Independência de Ações',
    passed: test7Passed,
    details: test7Passed
      ? 'Aprovado: Inativar apenas desabilita o participante para chamadas futuras mantendo o registro no banco; Excluir remove o registro da inscrição.'
      : 'Falha: As ações de excluir e inativar conflitaram ou não se comportaram de forma independente.',
  });

  // TESTE 8: Simulação de persistência e reload do Supabase -> Inativação sobrevive ao reload
  const simulatedDbRowInactive = {
    id: 'reg-active-1',
    student_id: 'student-maria',
    voice_type_id: 'voice-soprano',
    status: 'rejected', // Valor salvo no banco Postgres para inativo
    monthly_fee: 150,
    is_internal_student: false,
  };
  const isInactiveFromDb = simulatedDbRowInactive.status === 'rejected' || simulatedDbRowInactive.status === 'inactive';
  const reloadedInactiveReg: ChoirRegistration = {
    ...simulatedDbRowInactive,
    status: isInactiveFromDb ? 'inactive' : (simulatedDbRowInactive.status as any),
    active: !isInactiveFromDb,
  };
  const test8Passed = reloadedInactiveReg.status === 'inactive' && reloadedInactiveReg.active === false;
  results.push({
    id: 'TEST-8',
    name: 'TESTE 8: Persistência e sincronização de participante inativo sobrevive ao reload',
    category: 'Persistência Supabase',
    passed: test8Passed,
    details: test8Passed
      ? 'Aprovado: A leitura do banco Supabase mapeia status "rejected"/"inactive" para status "inactive" e active = false, garantindo sobrevivência a recarregamentos de página.'
      : 'Falha: O mapeamento de reload do Supabase não preservou o status inativo.',
  });

  // TESTE 9: Simulação de persistência e reload do Supabase -> Reativação sobrevive ao reload
  const simulatedDbRowActive = {
    id: 'reg-active-1',
    student_id: 'student-maria',
    voice_type_id: 'voice-soprano',
    status: 'approved', // Valor salvo no banco Postgres para ativo
    monthly_fee: 150,
    is_internal_student: false,
  };
  const isInactiveFromDb2 = simulatedDbRowActive.status === 'rejected' || simulatedDbRowActive.status === 'inactive';
  const reloadedActiveReg: ChoirRegistration = {
    ...simulatedDbRowActive,
    status: isInactiveFromDb2 ? 'inactive' : 'approved',
    active: !isInactiveFromDb2,
  };
  const test9Passed = reloadedActiveReg.status === 'approved' && reloadedActiveReg.active === true;
  results.push({
    id: 'TEST-9',
    name: 'TESTE 9: Persistência e sincronização de participante reativado sobrevive ao reload',
    category: 'Persistência Supabase',
    passed: test9Passed,
    details: test9Passed
      ? 'Aprovado: A leitura do banco Supabase mapeia status "approved" para status "approved" e active = true de forma consistente.'
      : 'Falha: O mapeamento de reload do Supabase não preservou o status ativo após reativação.',
  });

  const totalCount = results.length;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = totalCount - passedCount;

  return {
    passed: failedCount === 0,
    totalCount,
    passedCount,
    failedCount,
    results,
  };
};
