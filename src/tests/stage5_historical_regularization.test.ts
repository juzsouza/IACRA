import assert from 'node:assert/strict';
import {
  validateHistoricalRegularizationInput,
  buildHistoricalRegularizationRecord,
  HistoricalRegularizationInput,
  SUGGESTED_REGULARIZATION_CASES,
} from '../utils/historicalRegularizationService';
import {
  resolveCompetenceBilling,
} from '../utils/competenceBillingResolver';
import {
  CompetenceBilling,
  findCompetenceBilling,
} from '../store';

async function runStage5Tests() {
  console.log('========================================================================');
  console.log('--- TESTES DA ETAPA 5: REGULARIZAÇÃO HISTÓRICA ASSISTIDA (CORREÇÃO) ---');
  console.log('========================================================================\n');

  // Contexto Base do Teste
  const baseStudentOzeias = {
    id: 'std-ozeias',
    name: 'Ozéias Vitoriano Barbosa',
    email: 'ozeias@email.com',
    phone: '11999999999',
    status: 'active',
    enrollment_date: '2026-06-01',
  };

  const basePlan = {
    id: 'plan-violao',
    name: 'Violão Regular',
    base_price: 100,
    teacher_fee_type: 'fixed',
    teacher_fee_value: 40,
    secretary_fee_value: 0,
  };

  // Matrícula atual de Ozéias com custom_price = 40
  const baseEnrollmentOzeias = {
    id: 'enr-ozeias-1',
    student_id: 'std-ozeias',
    plan_id: 'plan-violao',
    custom_price: 40,
    teacher_id: 'tch-carlos',
    status: 'active',
    start_date: '2026-07-01',
    end_date: null,
    due_date_day: 10,
    enrollment_date: '2026-06-01',
  };

  // Coralista Carolina Seno Gomes (atualmente monthly_fee = 20)
  const baseStudentCarolina = {
    id: 'std-carolina',
    name: 'Carolina Seno Gomes',
    email: 'carolina@email.com',
    phone: '11888888888',
    status: 'active',
    enrollment_date: '2026-08-01',
  };

  const baseChoirRegCarolina = {
    id: 'choir-carolina-1',
    student_id: 'std-carolina',
    monthly_fee: 20,
    status: 'approved',
    active: true,
    created_at: '2026-08-01',
  };

  const baseGroup = {
    id: 'grp-teoria-1',
    name: 'Teoria Musical Avançada',
    price: 150,
    teacher_id: 'tch-ana',
    active: true,
  };

  // Banco simulado de snapshots e transações
  let simulatedBillings: CompetenceBilling[] = [];
  let simulatedTransactions: any[] = [];

  const contextData = {
    students: [baseStudentOzeias, baseStudentCarolina] as any[],
    enrollments: [baseEnrollmentOzeias] as any[],
    choirRegistrations: [baseChoirRegCarolina] as any[],
    groups: [baseGroup] as any[],
    financialPlans: [basePlan] as any[],
    competenceBillings: simulatedBillings,
  };

  // ----------------------------------------------------------------------
  // CASO 1: CONFERÊNCIA DOS ATALHOS HISTÓRICOS (PRESETS DA DIREÇÃO)
  // ----------------------------------------------------------------------
  console.log('[Caso 1] Conferência rigorosa dos atalhos históricos confirmados pela direção...');
  const presetOzeias07 = SUGGESTED_REGULARIZATION_CASES.find((c) => c.id === 'case-ozeias-2026-07');
  const presetOzeias08 = SUGGESTED_REGULARIZATION_CASES.find((c) => c.id === 'case-ozeias-2026-08');
  const presetOzeias09 = SUGGESTED_REGULARIZATION_CASES.find((c) => c.id === 'case-ozeias-2026-09');

  const presetCarolina08 = SUGGESTED_REGULARIZATION_CASES.find((c) => c.id === 'case-carolina-2026-08');
  const presetCarolina09 = SUGGESTED_REGULARIZATION_CASES.find((c) => c.id === 'case-carolina-2026-09');

  assert.ok(presetOzeias07, 'Atalho Ozéias 07/2026 deve existir');
  assert.equal(presetOzeias07.finalPrice, 100, 'Ozéias 07/2026 deve ser exatamente R$ 100,00');
  assert.equal(presetOzeias07.status, 'pending', 'Ozéias 07/2026 deve ter status pending');
  assert.equal(presetOzeias07.isPaying, true);

  assert.ok(presetOzeias08, 'Atalho Ozéias 08/2026 deve existir');
  assert.equal(presetOzeias08.finalPrice, 100, 'Ozéias 08/2026 deve ser exatamente R$ 100,00 (NÃO R$ 40)');
  assert.equal(presetOzeias08.status, 'pending', 'Ozéias 08/2026 deve ter status pending');
  assert.equal(presetOzeias08.isPaying, true);

  assert.ok(presetOzeias09, 'Atalho Ozéias 09/2026 deve existir');
  assert.equal(presetOzeias09.finalPrice, 40, 'Ozéias 09/2026 deve ser exatamente R$ 40,00');
  assert.equal(presetOzeias09.status, 'pending', 'Ozéias 09/2026 deve ter status pending');
  assert.equal(presetOzeias09.isPaying, true);

  assert.ok(presetCarolina08, 'Atalho Carolina 08/2026 deve existir');
  assert.equal(presetCarolina08.finalPrice, 0, 'Carolina 08/2026 deve ser R$ 0,00');
  assert.equal(presetCarolina08.status, 'waived', 'Carolina 08/2026 deve ser waived');
  assert.equal(presetCarolina08.isPaying, false, 'Carolina 08/2026 deve ser não pagante');

  assert.ok(presetCarolina09, 'Atalho Carolina 09/2026 deve existir');
  assert.equal(presetCarolina09.finalPrice, 20, 'Carolina 09/2026 deve ser R$ 20,00');
  assert.equal(presetCarolina09.status, 'pending', 'Carolina 09/2026 deve ser pending');
  assert.equal(presetCarolina09.isPaying, true, 'Carolina 09/2026 deve ser pagante');
  console.log('✅ Caso 1 aprovado com sucesso: Todos os atalhos conferem perfeitamente.\n');

  // ----------------------------------------------------------------------
  // CASO 2: REGULARIZAÇÃO INDIVIDUAL OZÉIAS — 07/2026 = R$ 100,00
  // ----------------------------------------------------------------------
  console.log('[Caso 2] Regularização individual: Ozéias 07/2026 = R$ 100,00...');
  const inputOzeias07: HistoricalRegularizationInput = {
    category: 'individual',
    sourceId: baseEnrollmentOzeias.id,
    competence: '2026-07',
    basePrice: 100,
    discount: 0,
    finalPrice: 100,
    status: 'pending',
    isPaying: true,
    reason: 'Confirmação histórica da direção: competência 07/2026 de Ozéias no valor de R$ 100,00',
    operatorId: 'admin-1',
    operatorEmail: 'admin@instituto.com',
    operatorRole: 'admin',
    confirmed: true,
  };

  const valOzeias07 = validateHistoricalRegularizationInput(inputOzeias07, simulatedBillings);
  assert.equal(valOzeias07.isValid, true);

  const snapOzeias07: CompetenceBilling = {
    ...buildHistoricalRegularizationRecord(inputOzeias07, {
      ...contextData,
      competenceBillings: simulatedBillings,
    }),
    id: 'snap-ozeias-2026-07',
    created_at: '2026-09-15T09:00:00Z',
  };
  simulatedBillings.push(snapOzeias07);

  assert.equal(snapOzeias07.competence, '2026-07');
  assert.equal(snapOzeias07.final_price, 100);
  assert.equal(snapOzeias07.status, 'pending');
  assert.equal(snapOzeias07.is_frozen, false);
  console.log('✅ Caso 2 aprovado: Ozéias 07/2026 registrado com R$ 100,00.\n');

  // ----------------------------------------------------------------------
  // CASO 3: REGULARIZAÇÃO INDIVIDUAL OZÉIAS — 08/2026 = R$ 100,00
  // ----------------------------------------------------------------------
  console.log('[Caso 3] Regularização individual: Ozéias 08/2026 = R$ 100,00 (NÃO R$ 40)...');
  const inputOzeias08: HistoricalRegularizationInput = {
    category: 'individual',
    sourceId: baseEnrollmentOzeias.id,
    competence: '2026-08',
    basePrice: 100,
    discount: 0,
    finalPrice: 100,
    status: 'pending',
    isPaying: true,
    reason: 'Confirmação histórica da direção: competência 08/2026 de Ozéias no valor de R$ 100,00',
    operatorId: 'admin-1',
    operatorEmail: 'admin@instituto.com',
    operatorRole: 'admin',
    confirmed: true,
  };

  const valOzeias08 = validateHistoricalRegularizationInput(inputOzeias08, simulatedBillings);
  assert.equal(valOzeias08.isValid, true);

  const snapOzeias08: CompetenceBilling = {
    ...buildHistoricalRegularizationRecord(inputOzeias08, {
      ...contextData,
      competenceBillings: simulatedBillings,
    }),
    id: 'snap-ozeias-2026-08',
    created_at: '2026-09-15T09:05:00Z',
  };
  simulatedBillings.push(snapOzeias08);

  assert.equal(snapOzeias08.competence, '2026-08');
  assert.equal(snapOzeias08.final_price, 100);
  assert.equal(snapOzeias08.status, 'pending');
  assert.equal(snapOzeias08.is_frozen, false);
  console.log('✅ Caso 3 aprovado: Ozéias 08/2026 registrado com R$ 100,00.\n');

  // ----------------------------------------------------------------------
  // CASO 4: REGULARIZAÇÃO INDIVIDUAL OZÉIAS — 09/2026 = R$ 40,00
  // ----------------------------------------------------------------------
  console.log('[Caso 4] Regularização individual: Ozéias 09/2026 = R$ 40,00...');
  const inputOzeias09: HistoricalRegularizationInput = {
    category: 'individual',
    sourceId: baseEnrollmentOzeias.id,
    competence: '2026-09',
    basePrice: 40,
    discount: 0,
    finalPrice: 40,
    status: 'pending',
    isPaying: true,
    reason: 'Confirmação histórica da direção: competência 09/2026 de Ozéias com valor de R$ 40,00',
    operatorId: 'admin-1',
    operatorEmail: 'admin@instituto.com',
    operatorRole: 'admin',
    confirmed: true,
  };

  const valOzeias09 = validateHistoricalRegularizationInput(inputOzeias09, simulatedBillings);
  assert.equal(valOzeias09.isValid, true);

  const snapOzeias09: CompetenceBilling = {
    ...buildHistoricalRegularizationRecord(inputOzeias09, {
      ...contextData,
      competenceBillings: simulatedBillings,
    }),
    id: 'snap-ozeias-2026-09',
    created_at: '2026-09-15T09:10:00Z',
  };
  simulatedBillings.push(snapOzeias09);

  assert.equal(snapOzeias09.competence, '2026-09');
  assert.equal(snapOzeias09.final_price, 40);
  assert.equal(snapOzeias09.status, 'pending');
  assert.equal(snapOzeias09.is_frozen, false);

  // Verificação consolidada dos 3 meses de Ozéias
  const ozeias07Check = findCompetenceBilling(simulatedBillings, 'individual', baseEnrollmentOzeias.id, '2026-07');
  const ozeias08Check = findCompetenceBilling(simulatedBillings, 'individual', baseEnrollmentOzeias.id, '2026-08');
  const ozeias09Check = findCompetenceBilling(simulatedBillings, 'individual', baseEnrollmentOzeias.id, '2026-09');

  assert.equal(ozeias07Check?.final_price, 100, 'Consolidado Ozéias 07/2026 DEVE ser 100');
  assert.equal(ozeias08Check?.final_price, 100, 'Consolidado Ozéias 08/2026 DEVE ser 100');
  assert.equal(ozeias09Check?.final_price, 40, 'Consolidado Ozéias 09/2026 DEVE ser 40');
  console.log('✅ Caso 4 aprovado: Consolidação dos 3 meses de Ozéias: 07=100, 08=100, 09=40.\n');

  // ----------------------------------------------------------------------
  // CASO 5: REGULARIZAÇÃO CORAL CAROLINA — 08/2026 = NÃO PAGANTE / R$ 0,00 / WAIVED
  // ----------------------------------------------------------------------
  console.log('[Caso 5] Regularização Coral: Carolina 08/2026 = Não pagante / R$ 0,00 / waived...');
  const inputCarolina08: HistoricalRegularizationInput = {
    category: 'choir',
    sourceId: baseChoirRegCarolina.id,
    competence: '2026-08',
    basePrice: 0,
    discount: 0,
    finalPrice: 0,
    status: 'waived',
    isPaying: false,
    reason: 'Confirmação histórica da direção: Carolina no Coral em 08/2026 como Não Pagante / Isenta',
    operatorId: 'super-admin-1',
    operatorRole: 'super_admin',
    confirmed: true,
  };

  const valCarolina08 = validateHistoricalRegularizationInput(inputCarolina08, simulatedBillings);
  assert.equal(valCarolina08.isValid, true);

  const snapCarolina08: CompetenceBilling = {
    ...buildHistoricalRegularizationRecord(inputCarolina08, {
      ...contextData,
      competenceBillings: simulatedBillings,
    }),
    id: 'snap-carolina-2026-08',
    created_at: '2026-09-15T09:15:00Z',
  };
  simulatedBillings.push(snapCarolina08);

  assert.equal(snapCarolina08.competence, '2026-08');
  assert.equal(snapCarolina08.final_price, 0);
  assert.equal(snapCarolina08.is_paying, false);
  assert.equal(snapCarolina08.status, 'waived');

  // Teste de Proteção contra Cobrança Retroativa Indevida de R$ 20 em Agosto
  const invalidRetroactiveInput: HistoricalRegularizationInput = {
    category: 'choir',
    sourceId: 'choir-outro-coralista',
    competence: '2026-08',
    basePrice: 20,
    finalPrice: 20,
    status: 'waived', // Inconsistência: waived com R$ 20
    isPaying: false,
    reason: 'Tentativa inconsistente',
    operatorId: 'admin-1',
    operatorRole: 'admin',
    confirmed: true,
  };
  const valRetro = validateHistoricalRegularizationInput(invalidRetroactiveInput, simulatedBillings);
  assert.equal(valRetro.isValid, false, 'Sistema deve rejeitar coralista não pagante com valor diferente de 0');
  console.log('✅ Caso 5 aprovado: Carolina 08/2026 fixada como Não Pagante / R$ 0 / waived.\n');

  // ----------------------------------------------------------------------
  // CASO 6: REGULARIZAÇÃO CORAL CAROLINA — 09/2026 = PAGANTE / R$ 20,00 / PENDING
  // ----------------------------------------------------------------------
  console.log('[Caso 6] Regularização Coral: Carolina 09/2026 = Pagante / R$ 20,00 / pending...');
  const inputCarolina09: HistoricalRegularizationInput = {
    category: 'choir',
    sourceId: baseChoirRegCarolina.id,
    competence: '2026-09',
    basePrice: 20,
    discount: 0,
    finalPrice: 20,
    status: 'pending',
    isPaying: true,
    reason: 'Confirmação histórica da direção: Carolina no Coral em 09/2026 como Pagante no valor de R$ 20,00',
    operatorId: 'super-admin-1',
    operatorRole: 'super_admin',
    confirmed: true,
  };

  const valCarolina09 = validateHistoricalRegularizationInput(inputCarolina09, simulatedBillings);
  assert.equal(valCarolina09.isValid, true);

  const snapCarolina09: CompetenceBilling = {
    ...buildHistoricalRegularizationRecord(inputCarolina09, {
      ...contextData,
      competenceBillings: simulatedBillings,
    }),
    id: 'snap-carolina-2026-09',
    created_at: '2026-09-15T09:20:00Z',
  };
  simulatedBillings.push(snapCarolina09);

  assert.equal(snapCarolina09.competence, '2026-09');
  assert.equal(snapCarolina09.final_price, 20);
  assert.equal(snapCarolina09.is_paying, true);
  assert.equal(snapCarolina09.status, 'pending');

  const carolina08Check = findCompetenceBilling(simulatedBillings, 'choir', baseChoirRegCarolina.id, '2026-08');
  const carolina09Check = findCompetenceBilling(simulatedBillings, 'choir', baseChoirRegCarolina.id, '2026-09');

  assert.equal(carolina08Check?.final_price, 0, 'Consolidado Carolina 08/2026 DEVE ser 0');
  assert.equal(carolina08Check?.status, 'waived', 'Consolidado Carolina 08/2026 DEVE ser waived');
  assert.equal(carolina09Check?.final_price, 20, 'Consolidado Carolina 09/2026 DEVE ser 20');
  assert.equal(carolina09Check?.status, 'pending', 'Consolidado Carolina 09/2026 DEVE ser pending');
  console.log('✅ Caso 6 aprovado: Carolina 09/2026 fixada como Pagante / R$ 20 / pending.\n');

  // ----------------------------------------------------------------------
  // CASO 7: RESOLVER RETORNA EXATAMENTE OS VALORES REGULARIZADOS
  // ----------------------------------------------------------------------
  console.log('[Caso 7] Resolver de competências retorna fielmente os valores regularizados...');
  const resolverCtx = {
    students: contextData.students,
    enrollments: contextData.enrollments,
    choirRegistrations: contextData.choirRegistrations,
    groups: contextData.groups,
    financialPlans: contextData.financialPlans,
    competenceBillings: simulatedBillings,
    transactions: [],
  };

  // Ozéias 07/2026
  const resOzeias07 = resolveCompetenceBilling({
    category: 'individual',
    sourceId: baseEnrollmentOzeias.id,
    competence: '2026-07',
    context: resolverCtx as any,
  });
  assert.equal(resOzeias07.finalPrice, 100, 'Resolver Ozéias 07/2026 = 100');
  assert.equal(resOzeias07.source, 'snapshot_pending');

  // Ozéias 08/2026
  const resOzeias08 = resolveCompetenceBilling({
    category: 'individual',
    sourceId: baseEnrollmentOzeias.id,
    competence: '2026-08',
    context: resolverCtx as any,
  });
  assert.equal(resOzeias08.finalPrice, 100, 'Resolver Ozéias 08/2026 = 100');
  assert.equal(resOzeias08.source, 'snapshot_pending');

  // Ozéias 09/2026
  const resOzeias09 = resolveCompetenceBilling({
    category: 'individual',
    sourceId: baseEnrollmentOzeias.id,
    competence: '2026-09',
    context: resolverCtx as any,
  });
  assert.equal(resOzeias09.finalPrice, 40, 'Resolver Ozéias 09/2026 = 40');
  assert.equal(resOzeias09.source, 'snapshot_pending');

  // Carolina 08/2026
  const resCarolina08 = resolveCompetenceBilling({
    category: 'choir',
    sourceId: baseChoirRegCarolina.id,
    competence: '2026-08',
    context: resolverCtx as any,
  });
  assert.equal(resCarolina08.finalPrice, 0, 'Resolver Carolina 08/2026 = 0');
  assert.equal(resCarolina08.isPaying, false);
  assert.equal(resCarolina08.snapshot?.status, 'waived');

  // Carolina 09/2026
  const resCarolina09 = resolveCompetenceBilling({
    category: 'choir',
    sourceId: baseChoirRegCarolina.id,
    competence: '2026-09',
    context: resolverCtx as any,
  });
  assert.equal(resCarolina09.finalPrice, 20, 'Resolver Carolina 09/2026 = 20');
  assert.equal(resCarolina09.isPaying, true);
  assert.equal(resCarolina09.snapshot?.status, 'pending');
  console.log('✅ Caso 7 aprovado: Resolver respeita rigorosamente todos os snapshots.\n');

  // ----------------------------------------------------------------------
  // CASO 8: PROTEÇÃO DOS CADASTROS (custom_price, monthly_fee, group.price)
  // ----------------------------------------------------------------------
  console.log('[Caso 8] Proteção cadastral: dados vigentes mantêm-se 100% inalterados...');
  assert.equal(baseEnrollmentOzeias.custom_price, 40, 'custom_price da matrícula continua 40');
  assert.equal(baseChoirRegCarolina.monthly_fee, 20, 'monthly_fee do coral continua 20');
  assert.equal(baseGroup.price, 150, 'group.price continua 150');
  console.log('✅ Caso 8 aprovado: Cadastros intactos.\n');

  // ----------------------------------------------------------------------
  // CASO 9: PROTEÇÃO FINANCEIRA: ZERO TRANSACTIONS GERADAS
  // ----------------------------------------------------------------------
  console.log('[Caso 9] Proteção financeira: nenhuma transaction é gerada...');
  assert.equal(simulatedTransactions.length, 0, 'Nenhuma transação financeira pode ter sido gerada');
  assert.equal(snapOzeias07.transaction_id, null);
  assert.equal(snapOzeias08.transaction_id, null);
  assert.equal(snapOzeias09.transaction_id, null);
  assert.equal(snapCarolina08.transaction_id, null);
  assert.equal(snapCarolina09.transaction_id, null);
  console.log('✅ Caso 9 aprovado: Nenhuma transaction foi criada (todos transaction_id = null).\n');

  // ----------------------------------------------------------------------
  // CASO 10: AUDITORIA COMPLETA (Motivo Obrigatório, Operador e Timestamp)
  // ----------------------------------------------------------------------
  console.log('[Caso 10] Auditoria completa e exigência de motivo...');
  // Motivo em branco deve falhar
  const invalidNoReason: HistoricalRegularizationInput = {
    category: 'individual',
    sourceId: baseEnrollmentOzeias.id,
    competence: '2026-06',
    basePrice: 100,
    finalPrice: 100,
    status: 'pending',
    isPaying: true,
    reason: '   ', // Inválido
    operatorId: 'admin-1',
    operatorRole: 'admin',
    confirmed: true,
  };
  const valNoReason = validateHistoricalRegularizationInput(invalidNoReason, simulatedBillings);
  assert.equal(valNoReason.isValid, false, 'Motivo em branco deve ser rejeitado');
  assert.ok(valNoReason.error?.includes('Motivo obrigatório'));

  // Metadados registrados no snapshot
  assert.equal(snapOzeias07.metadata?.source, 'historical_regularization');
  assert.equal(snapOzeias07.metadata?.confirmed_by, 'admin-1');
  assert.equal(snapOzeias07.metadata?.created_by_role, 'admin');
  assert.ok(snapOzeias07.metadata?.confirmed_at, 'Timestamp de auditoria presente');
  assert.ok(snapOzeias07.metadata?.reason, 'Motivo gravado no metadata');
  console.log('✅ Caso 10 aprovado: Auditoria com motivo, operador e timestamp registrados.\n');

  // ----------------------------------------------------------------------
  // CASO 11: BLOQUEIO DE DUPLICIDADE
  // ----------------------------------------------------------------------
  console.log('[Caso 11] Bloqueio estrito de duplicidade...');
  const duplicateInput: HistoricalRegularizationInput = {
    category: 'individual',
    sourceId: baseEnrollmentOzeias.id,
    competence: '2026-07', // Já regularizado no Caso 2!
    basePrice: 100,
    finalPrice: 100,
    status: 'pending',
    isPaying: true,
    reason: 'Tentativa duplicada',
    operatorId: 'admin-1',
    operatorRole: 'admin',
    confirmed: true,
  };
  const valDup = validateHistoricalRegularizationInput(duplicateInput, simulatedBillings);
  assert.equal(valDup.isValid, false, 'Duplicidade deve ser rejeitada');
  assert.ok(valDup.error?.includes('Snapshot já existente'));
  console.log('✅ Caso 11 aprovado: Duplicidade devidamente bloqueada.\n');

  // ----------------------------------------------------------------------
  // CASO 12: PERMISSÕES DE ACESSO (super_admin e admin permitidos; teacher negado)
  // ----------------------------------------------------------------------
  console.log('[Caso 12] Restrição de permissão por perfil de usuário...');
  const teacherInput: HistoricalRegularizationInput = {
    category: 'individual',
    sourceId: baseEnrollmentOzeias.id,
    competence: '2026-06',
    basePrice: 100,
    finalPrice: 100,
    status: 'pending',
    isPaying: true,
    reason: 'Tentativa de regularização por professor',
    operatorId: 'tch-carlos',
    operatorRole: 'teacher',
    confirmed: true,
  };
  const valTeacher = validateHistoricalRegularizationInput(teacherInput, simulatedBillings);
  assert.equal(valTeacher.isValid, false, 'Perfil teacher deve ter acesso negado');
  assert.ok(valTeacher.error?.includes('Acesso negado'));
  console.log('✅ Caso 12 aprovado: Apenas admin e super_admin têm permissão.\n');

  console.log('========================================================================');
  console.log('🎉 TODOS OS 12 CASOS DA ETAPA 5 FORAM VALIDADOS COM 100% DE SUCESSO! 🎉');
  console.log('========================================================================');
}

runStage5Tests().catch((err) => {
  console.error('❌ Falha nos testes da Etapa 5:', err);
  process.exit(1);
});
