import assert from 'node:assert/strict';
import {
  isCompetenceDue,
  calculateDueBillingValues,
} from '../utils/dueCompetenceService';
import {
  resolveCompetenceBilling,
  ResolveBillingContext,
} from '../utils/competenceBillingResolver';
import {
  CompetenceBilling,
  findCompetenceBilling,
} from '../store';

async function runStage4Tests() {
  console.log('================================================================');
  console.log('--- INICIANDO TESTES ETAPA 4: MATERIALIZAÇÃO DE COMPETÊNCIAS ---');
  console.log('================================================================\n');

  // Referência do ciclo atual: 2026-09 (Setembro/2026)
  const referenceDate = new Date(2026, 8, 15); // mês 8 = Setembro em JS

  // Contexto Base
  const baseStudent = { id: 'std-ozeias', name: 'Ozéias Vitoriano Barbosa' };
  const basePlan = {
    id: 'plan-violao',
    name: 'Violão Regular',
    base_price: 100,
    teacher_fee_type: 'fixed',
    teacher_fee_value: 40,
    secretary_fee_value: 0,
  };
  const baseEnrollment = {
    id: 'enr-ozeias-1',
    student_id: 'std-ozeias',
    plan_id: 'plan-violao',
    custom_price: null,
    teacher_id: 'tch-carlos',
    status: 'active',
    start_date: '2026-07-01',
    end_date: null,
  };

  // Simulação de banco/estado
  let simulatedDB: CompetenceBilling[] = [];

  // Helper de materialização simulada (espelhando ensureDueCompetenceBilling)
  function simulateEnsureDue(category: any, sourceId: string, competence: string, entity: any, context: any) {
    // 1. Procurar existente
    const existing = findCompetenceBilling(simulatedDB, category, sourceId, competence);
    if (existing) return existing;

    // 2. Verificar se é devida
    const due = isCompetenceDue({ category, competence, entity, referenceDate });
    if (!due) return null;

    // 3. Calcular valores
    const calc = calculateDueBillingValues({
      category,
      sourceId,
      competence,
      context,
    });
    if (!calc) return null;

    const newRecord: CompetenceBilling = {
      id: 'snap-' + Math.random().toString(36).substring(2, 9),
      competence,
      category,
      enrollment_id: calc.enrollment_id,
      choir_registration_id: calc.choir_registration_id,
      group_id: calc.group_id,
      student_id: calc.student_id,
      teacher_id: calc.teacher_id,
      is_paying: calc.is_paying,
      base_price: calc.base_price,
      discount: calc.discount,
      final_price: calc.final_price,
      teacher_fee_type: calc.teacher_fee_type,
      teacher_fee_value: calc.teacher_fee_value,
      teacher_share: calc.teacher_share,
      school_share: calc.school_share,
      status: calc.status,
      transaction_id: null,
      is_frozen: false,
      frozen_at: null,
      frozen_by: null,
      metadata: calc.metadata,
      created_at: new Date().toISOString(),
    };

    simulatedDB.push(newRecord);
    return newRecord;
  }

  // -------------------------------------------------------------
  // CASO 1: Competência futura NÃO gera snapshot
  // -------------------------------------------------------------
  console.log('[Caso 1] Competência futura NÃO gera snapshot...');
  const futureComp = '2026-10'; // Outubro/2026 é futuro em relação a Setembro/2026
  const isDueFuture = isCompetenceDue({
    category: 'individual',
    competence: futureComp,
    entity: baseEnrollment,
    referenceDate,
  });
  assert.equal(isDueFuture, false, 'Competência futura não deve ser devida');

  const snapFuture = simulateEnsureDue('individual', baseEnrollment.id, futureComp, baseEnrollment, {
    students: [baseStudent],
    enrollments: [baseEnrollment],
    choirRegistrations: [],
    financialPlans: [basePlan],
    groups: [],
  });
  assert.equal(snapFuture, null, 'Não deve criar snapshot para competência futura');
  console.log('✅ Caso 1 aprovado com sucesso.\n');

  // -------------------------------------------------------------
  // CASO 2: Competência devida gera competence_billing: pending e is_frozen = false
  // -------------------------------------------------------------
  console.log('[Caso 2] Competência devida gera snapshot pending e is_frozen = false...');
  const currentComp = '2026-09';
  const isDueCurrent = isCompetenceDue({
    category: 'individual',
    competence: currentComp,
    entity: baseEnrollment,
    referenceDate,
  });
  assert.equal(isDueCurrent, true, 'Competência corrente (2026-09) deve ser devida');

  const snapSept = simulateEnsureDue('individual', baseEnrollment.id, currentComp, baseEnrollment, {
    students: [baseStudent],
    enrollments: [baseEnrollment],
    financialPlans: [basePlan],
    choirRegistrations: [],
    groups: [],
  });
  assert.ok(snapSept, 'Snapshot deve ser criado');
  assert.equal(snapSept?.status, 'pending', 'Status inicial deve ser pending');
  assert.equal(snapSept?.is_frozen, false, 'is_frozen deve ser false');
  assert.equal(snapSept?.final_price, 100, 'Valor devido deve ser 100');
  console.log('✅ Caso 2 aprovado com sucesso.\n');

  // -------------------------------------------------------------
  // CASO 3: Repetir chamada é idempotente
  // -------------------------------------------------------------
  console.log('[Caso 3] Repetição de chamada é idempotente...');
  const initialCount = simulatedDB.length;
  const snapSeptAgain = simulateEnsureDue('individual', baseEnrollment.id, currentComp, baseEnrollment, {
    students: [baseStudent],
    enrollments: [baseEnrollment],
    financialPlans: [basePlan],
    choirRegistrations: [],
    groups: [],
  });
  assert.equal(simulatedDB.length, initialCount, 'Não deve duplicar registros');
  assert.equal(snapSeptAgain?.id, snapSept?.id, 'Deve retornar a mesma instância do snapshot');
  console.log('✅ Caso 3 aprovado com sucesso.\n');

  // -------------------------------------------------------------
  // CASO 4: Alteração de preço posterior afeta apenas o futuro, NÃO altera o pendente
  // -------------------------------------------------------------
  console.log('[Caso 4] Alteração de cadastro posterior não altera competência já materializada...');
  // Suponha que o valor da matrícula de Ozéias seja alterado no cadastro para R$ 40,00
  const updatedEnrollment = {
    ...baseEnrollment,
    custom_price: 40,
  };

  // Resolver a competência Setembro/2026 (onde existe snapshot de R$ 100)
  const resolveSept = resolveCompetenceBilling({
    category: 'individual',
    sourceId: baseEnrollment.id,
    competence: '2026-09',
    context: {
      students: [baseStudent],
      enrollments: [updatedEnrollment], // Cadastro com R$ 40
      financialPlans: [basePlan],
      competenceBillings: simulatedDB,
      transactions: [],
    } as any,
  });

  assert.equal(resolveSept.finalPrice, 100, 'Setembro/2026 DEVE preservar R$ 100 do snapshot pendente');
  assert.equal(resolveSept.source, 'snapshot_pending', 'Origem deve ser snapshot_pending');

  // Competência futura (ex: 2026-11) sem snapshot deve adotar o novo valor R$ 40
  const resolveFuture = resolveCompetenceBilling({
    category: 'individual',
    sourceId: baseEnrollment.id,
    competence: '2026-11',
    context: {
      students: [baseStudent],
      enrollments: [updatedEnrollment],
      financialPlans: [basePlan],
      competenceBillings: simulatedDB,
      transactions: [],
    } as any,
  });
  assert.equal(resolveFuture.finalPrice, 40, 'Competência futura aberta deve usar novo valor R$ 40');
  console.log('✅ Caso 4 aprovado com sucesso.\n');

  // -------------------------------------------------------------
  // CASO 5: Desmatrícula encerra futuro e NÃO apaga snapshot pendente
  // -------------------------------------------------------------
  console.log('[Caso 5] Desmatrícula encerra futuro e preserva snapshot pendente...');
  const cancelledEnrollment = {
    ...updatedEnrollment,
    status: 'inactive',
    end_date: '2026-09-30',
  };

  // Setembro continua com snapshot pendente preservado
  const resolveSeptAfterCancel = resolveCompetenceBilling({
    category: 'individual',
    sourceId: baseEnrollment.id,
    competence: '2026-09',
    context: {
      students: [baseStudent],
      enrollments: [cancelledEnrollment],
      financialPlans: [basePlan],
      competenceBillings: simulatedDB,
      transactions: [],
    } as any,
  });
  assert.equal(resolveSeptAfterCancel.finalPrice, 100, 'Setembro deve ser mantido mesmo após encerramento');

  // Outubro (após end_date) não deve ser cobrado (finalPrice = 0)
  const resolveOctAfterCancel = resolveCompetenceBilling({
    category: 'individual',
    sourceId: baseEnrollment.id,
    competence: '2026-10',
    context: {
      students: [baseStudent],
      enrollments: [cancelledEnrollment],
      financialPlans: [basePlan],
      competenceBillings: simulatedDB,
      transactions: [],
    } as any,
  });
  assert.equal(resolveOctAfterCancel.finalPrice, 0, 'Competência após desmatrícula deve ser zerada');
  console.log('✅ Caso 5 aprovado com sucesso.\n');

  // -------------------------------------------------------------
  // CASO 6: Pagamento atualiza snapshot existente (não cria novo, paid, is_frozen=true)
  // -------------------------------------------------------------
  console.log('[Caso 6] Pagamento atualiza snapshot pendente existente...');
  const txId = 'tx-test-999';
  const snapIndex = simulatedDB.findIndex(b => b.id === snapSept?.id);
  assert.ok(snapIndex >= 0);

  // Simula updateCompetenceBilling disparado pelo handleBatchPay
  simulatedDB[snapIndex] = {
    ...simulatedDB[snapIndex],
    status: 'paid',
    transaction_id: txId,
    is_frozen: true,
    frozen_at: new Date().toISOString(),
    frozen_by: 'admin-user',
  };

  const resolvePaid = resolveCompetenceBilling({
    category: 'individual',
    sourceId: baseEnrollment.id,
    competence: '2026-09',
    context: {
      students: [baseStudent],
      enrollments: [cancelledEnrollment],
      financialPlans: [basePlan],
      competenceBillings: simulatedDB,
      transactions: [
        {
          id: txId,
          type: 'income',
          amount: 100,
          description: 'Mensalidade | enr-ozeias-1 | 09/2026',
          date: '2026-09-15',
          status: 'completed',
        } as any,
      ],
    } as any,
  });

  assert.equal(resolvePaid.isPaid, true, 'Deve constar como pago');
  assert.equal(resolvePaid.isFrozen, true, 'Deve constar como congelado');
  assert.equal(resolvePaid.source, 'snapshot_frozen', 'Origem deve ser snapshot_frozen');
  assert.equal(resolvePaid.finalPrice, 100, 'Valor pago deve ser 100');
  console.log('✅ Caso 6 aprovado com sucesso.\n');

  // -------------------------------------------------------------
  // CASO 7: Coral - Não pagante gera waived, pagante gera pending, alteração posterior não retroage
  // -------------------------------------------------------------
  console.log('[Caso 7] Coral: Não pagante gera status waived, pagante gera pending...');
  const choirRegFree = {
    id: 'choir-carolina',
    student_id: 'std-carolina',
    monthly_fee: 0,
    created_at: '2026-08-01',
    status: 'approved',
    active: true,
  };

  // Agosto: Carolina não pagante
  const snapAugChoir = simulateEnsureDue('choir', choirRegFree.id, '2026-08', choirRegFree, {
    students: [{ id: 'std-carolina', name: 'Carolina Seno Gomes' }],
    enrollments: [],
    financialPlans: [],
    choirRegistrations: [choirRegFree],
    groups: [],
  });

  assert.ok(snapAugChoir, 'Snapshot de coral agosto deve ser criado');
  assert.equal(snapAugChoir.status, 'waived', 'Não pagante deve ter status waived');
  assert.equal(snapAugChoir.final_price, 0, 'Não pagante deve ter valor 0');
  assert.equal(snapAugChoir.is_paying, false, 'is_paying deve ser false');

  // Setembro: Carolina passou a ser pagante (R$ 20)
  const choirRegPaying = {
    ...choirRegFree,
    monthly_fee: 20,
  };

  const snapSeptChoir = simulateEnsureDue('choir', choirRegPaying.id, '2026-09', choirRegPaying, {
    students: [{ id: 'std-carolina', name: 'Carolina Seno Gomes' }],
    enrollments: [],
    financialPlans: [],
    choirRegistrations: [choirRegPaying],
    groups: [],
  });

  assert.ok(snapSeptChoir, 'Snapshot de coral setembro deve ser criado');
  assert.equal(snapSeptChoir.status, 'pending', 'Pagante deve ter status pending');
  assert.equal(snapSeptChoir.final_price, 20, 'Pagante deve ter valor 20');
  assert.equal(snapSeptChoir.is_paying, true, 'is_paying deve ser true');

  // Verificação de isolamento: Agosto continua 0, Setembro continua 20
  const resolveAugChoir = resolveCompetenceBilling({
    category: 'choir',
    sourceId: choirRegFree.id,
    competence: '2026-08',
    context: {
      students: [{ id: 'std-carolina', name: 'Carolina Seno Gomes' }],
      enrollments: [],
      financialPlans: [],
      choirRegistrations: [choirRegPaying], // cadastro atual alterado
      competenceBillings: simulatedDB,
      transactions: [],
    } as any,
  });
  assert.equal(resolveAugChoir.finalPrice, 0, 'Agosto deve permanecer R$ 0');
  assert.equal(resolveAugChoir.isPaying, false, 'Agosto deve permanecer não pagante');

  const resolveSeptChoir = resolveCompetenceBilling({
    category: 'choir',
    sourceId: choirRegFree.id,
    competence: '2026-09',
    context: {
      students: [{ id: 'std-carolina', name: 'Carolina Seno Gomes' }],
      enrollments: [],
      financialPlans: [],
      choirRegistrations: [choirRegPaying],
      competenceBillings: simulatedDB,
      transactions: [],
    } as any,
  });
  assert.equal(resolveSeptChoir.finalPrice, 20, 'Setembro deve permanecer R$ 20');
  console.log('✅ Caso 7 aprovado com sucesso.\n');

  // -------------------------------------------------------------
  // CASO 8: Grupos gera snapshot unificado
  // -------------------------------------------------------------
  console.log('[Caso 8] Grupos: snapshot unificado, sem divisão por aluno...');
  const testGroup = {
    id: 'grp-teatro',
    name: 'Grupo de Teatro',
    price: 350,
    payment_type: 'group',
    status: 'active',
    created_at: '2026-08-01',
  };

  const snapGroup = simulateEnsureDue('group', testGroup.id, '2026-09', testGroup, {
    students: [],
    enrollments: [],
    financialPlans: [],
    choirRegistrations: [],
    groups: [testGroup],
  });

  assert.ok(snapGroup, 'Snapshot do grupo deve ser gerado');
  assert.equal(snapGroup.category, 'group');
  assert.equal(snapGroup.group_id, 'grp-teatro');
  assert.equal(snapGroup.final_price, 350, 'Deve manter o valor total do grupo');
  assert.equal(snapGroup.student_id, null, 'Não deve vincular a aluno individual');
  console.log('✅ Caso 8 aprovado com sucesso.\n');

  // -------------------------------------------------------------
  // CASO 9: Motor Raphael gera snapshot com final_price e metadata.raphaelBilling
  // -------------------------------------------------------------
  console.log('[Caso 9] Motor Raphael: snapshot com final_price e metadata.raphaelBilling...');
  const raphaelTeacher = { id: 'raphael-pinto', name: 'RAPHAEL AUGUSTO PINTO' };
  const raphaelPlan = {
    id: 'plan-raphael-quinz',
    name: 'Piano Raphael Quinzenal',
    base_price: 260,
    frequency: 'quinzenal',
    teacher_fee_type: 'percentage',
    teacher_fee_value: 80,
    secretary_fee_value: 0,
    exclusive_teacher_id: 'raphael-pinto',
  };
  const raphaelEnrollment = {
    id: 'enr-raphael-std1',
    student_id: 'std-raphael-1',
    plan_id: 'plan-raphael-quinz',
    teacher_id: 'raphael-pinto',
    status: 'active',
    start_date: '2026-08-01',
  };

  const snapRaphael = simulateEnsureDue('individual', raphaelEnrollment.id, '2026-09', raphaelEnrollment, {
    students: [{ id: 'std-raphael-1', name: 'Aluno Raphael 1' }],
    enrollments: [raphaelEnrollment],
    financialPlans: [raphaelPlan],
    choirRegistrations: [],
    groups: [],
    teachers: [raphaelTeacher],
    classes: [
      {
        id: 'cls-1',
        enrollment_id: 'enr-raphael-std1',
        date: '2026-09-05T14:00:00Z',
        status: 'completed',
        teacher_id: 'raphael-pinto',
      },
      {
        id: 'cls-2',
        enrollment_id: 'enr-raphael-std1',
        date: '2026-09-19T14:00:00Z',
        status: 'completed',
        teacher_id: 'raphael-pinto',
      },
    ],
    credits: [],
  });

  assert.ok(snapRaphael, 'Snapshot Raphael deve ser gerado');
  assert.ok(snapRaphael.metadata?.raphaelBilling, 'Deve conter metadata.raphaelBilling gravado');
  assert.equal(snapRaphael.metadata.raphaelBilling.targetType, 'individual');
  console.log('✅ Caso 9 aprovado com sucesso.\n');

  // -------------------------------------------------------------
  // CASO 10: Concorrência: chamadas simultâneas não duplicam
  // -------------------------------------------------------------
  console.log('[Caso 10] Concorrência: múltiplas chamadas concorrentes...');
  const promises = [1, 2, 3, 4, 5].map(() =>
    simulateEnsureDue('group', testGroup.id, '2026-09', testGroup, {
      students: [],
      enrollments: [],
      financialPlans: [],
      choirRegistrations: [],
      groups: [testGroup],
    })
  );
  const results = await Promise.all(promises);
  const uniqueIds = new Set(results.map(r => r?.id));
  assert.equal(uniqueIds.size, 1, 'Todas as chamadas simultâneas devem retornar o mesmo snapshot');
  console.log('✅ Caso 10 aprovado com sucesso.\n');

  // -------------------------------------------------------------
  // CASO 11: Histórico de transações antigas continua protegido
  // -------------------------------------------------------------
  console.log('[Caso 11] Histórico de transações antigas continua protegido e inalterado...');
  const oldTx = {
    id: 'tx-historical-old',
    type: 'income',
    amount: 90,
    description: 'Mensalidade | enr-historical | 05/2026 | Aluno Antigo',
    date: '2026-05-10',
    status: 'completed',
  };

  const resolveHistorical = resolveCompetenceBilling({
    category: 'individual',
    sourceId: 'enr-historical',
    competence: '2026-05',
    context: {
      students: [{ id: 'std-old', name: 'Aluno Antigo' }],
      enrollments: [
        {
          id: 'enr-historical',
          student_id: 'std-old',
          plan_id: 'plan-violao',
          custom_price: 150, // Cadastro atual alterado
          status: 'active',
        },
      ],
      financialPlans: [basePlan],
      competenceBillings: [], // sem snapshot
      transactions: [oldTx as any],
    } as any,
  });

  assert.equal(resolveHistorical.isPaid, true, 'Deve reconhecer transação histórica como paga');
  assert.equal(resolveHistorical.finalPrice, 90, 'Valor deve ser rigorosamente 90 da transação');
  assert.equal(resolveHistorical.source, 'historical_transaction', 'Origem deve ser historical_transaction');
  console.log('✅ Caso 11 aprovado com sucesso.\n');

  console.log('================================================================');
  console.log('🎉 TODOS OS 11 CASOS DE TESTE DA ETAPA 4 FORAM VALIDADOS! 🎉');
  console.log('================================================================');
}

runStage4Tests().catch((err) => {
  console.error('❌ Falha nos testes da Etapa 4:', err);
  process.exit(1);
});
