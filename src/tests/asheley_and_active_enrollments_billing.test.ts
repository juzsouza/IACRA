import assert from 'node:assert/strict';
import { getEligibleEnrollmentsForStudent } from '../views/Payments';
import { resolveCompetenceBilling } from '../utils/competenceBillingResolver';
import { getMonthsToBill } from '../utils/dateUtils';

async function runTests() {
  console.log('--- Iniciando Testes: Resolução de Matrículas Elegíveis e Caso Asheley ---');

  const PLAN_CANTO_EM_GRUPO_ID = '80d488b8-01d8-484e-bb2d-8f8588d7d2d4';
  const TEACHER_RAPHAEL_ID = 'dada085e-c187-43d2-9ab0-a9e0539df450';
  const STUDENT_ASHELEY_ID = 'b9d156d7-c209-4866-87da-7dbc508d9796';

  const studentAsheley = {
    id: STUDENT_ASHELEY_ID,
    name: 'Asheley Cristiny Gomes Tombolo',
    status: 'active',
  };

  const planCantoEmGrupo = {
    id: PLAN_CANTO_EM_GRUPO_ID,
    name: 'Canto Em grupo',
    base_price: 0,
    exclusive_teacher_id: TEACHER_RAPHAEL_ID,
  };

  const groupMev12 = {
    id: '85e7bfa2-6b35-4f38-8222-7f0d9ec423ca',
    name: 'MEV 12',
    teacher_id: TEACHER_RAPHAEL_ID,
    payment_type: 'individual' as const,
  };

  const groupMev10 = {
    id: '5a4b0cd4-5d87-4054-aefe-319f6f560f32',
    name: 'MEV 10',
    teacher_id: TEACHER_RAPHAEL_ID,
    payment_type: 'individual' as const,
  };

  const groupMev16 = {
    id: 'f48893cf-52d3-4cfe-809d-adf79e5c3ce2',
    name: 'MEV 16',
    teacher_id: TEACHER_RAPHAEL_ID,
    payment_type: 'individual' as const,
  };

  const groupUnified = {
    id: 'group-unified-01',
    name: 'Grupo Coletivo Teste',
    teacher_id: TEACHER_RAPHAEL_ID,
    payment_type: 'group' as const,
    price: 300,
  };

  // 1. Matrícula antiga inativa de Asheley (início em 01/07/2026, MEV 12)
  const inactiveEnrollmentAsheley = {
    id: 'b984766d-ee9c-41fd-82dd-0e58523f2841',
    student_id: STUDENT_ASHELEY_ID,
    plan_id: PLAN_CANTO_EM_GRUPO_ID,
    group_id: groupMev12.id,
    teacher_id: TEACHER_RAPHAEL_ID,
    status: 'inactive' as const,
    start_date: '2026-07-01',
    custom_price: 100,
  };

  // 2. Matrícula nova ativa de Asheley (início em 02/10/2026, MEV 10, custom_price R$ 125,00)
  const activeEnrollmentAsheley = {
    id: '25de4de1-cecd-4cb3-bc0d-cbcd619543cd',
    student_id: STUDENT_ASHELEY_ID,
    plan_id: PLAN_CANTO_EM_GRUPO_ID,
    group_id: groupMev10.id,
    teacher_id: TEACHER_RAPHAEL_ID,
    status: 'active' as const,
    start_date: '2026-10-02',
    due_day: 5,
    custom_price: 125,
  };

  // Transação histórica em julho/2026 da matrícula inativa
  const transactionsHistoryJuly = [
    {
      id: 'tx-asheley-07',
      type: 'income' as const,
      status: 'completed' as const,
      amount: 100,
      description: `Mensalidade | ${inactiveEnrollmentAsheley.id} | 07/2026 | Asheley Cristiny Gomes Tombolo - Canto Em grupo`,
      date: '2026-07-10',
    },
  ];

  // Competência 2026-10 materializada no banco para a matrícula ativa
  const competenceBillingsOct = [
    {
      id: 'fd296179-2e5d-478e-970b-1cf87e9fdac9',
      competence: '2026-10',
      category: 'individual' as const,
      enrollment_id: activeEnrollmentAsheley.id,
      student_id: STUDENT_ASHELEY_ID,
      teacher_id: TEACHER_RAPHAEL_ID,
      is_paying: true,
      base_price: 0,
      discount: 0,
      final_price: 187.5,
      status: 'pending' as const,
      is_frozen: false,
      metadata: {
        source: 'due_competence_materializer',
        materialized_at: '2026-10-01T18:42:05.783Z',
      },
      created_at: '2026-10-01T18:42:05.783Z',
    },
  ];

  // =========================================================================
  // TESTE 1: Reprodução exata do caso da aluna Asheley (Outubro/2026)
  // =========================================================================
  console.log('Teste 1: Caso Asheley - Matrícula ativa em Outubro/2026 NÃO pode ser descartada por inativa de Julho/2026');
  {
    const allEnrollments = [inactiveEnrollmentAsheley, activeEnrollmentAsheley];
    const groups = [groupMev12, groupMev10];

    const eligible = getEligibleEnrollmentsForStudent(
      STUDENT_ASHELEY_ID,
      allEnrollments,
      groups,
      10,
      2026,
      {
        competenceBillings: competenceBillingsOct,
        transactions: transactionsHistoryJuly,
      }
    );

    assert.equal(eligible.length, 1, 'Deve retornar exatamente 1 matrícula elegível para Outubro/2026');
    assert.equal(eligible[0].id, activeEnrollmentAsheley.id, 'A matrícula elegível DEVE ser a matrícula ativa vigente');
    assert.equal(eligible[0].status, 'active', 'O status da matrícula elegível deve ser active');
    console.log('  ✓ Matrícula ativa de Asheley permaneceu elegível para Outubro/2026.');
  }

  // =========================================================================
  // TESTE 2: Resolução de Cobrança de Outubro/2026 para Asheley NÃO pode ser []
  // =========================================================================
  console.log('Teste 2: Resolução de Cobrança para Outubro/2026 retorna valor correto (R$ 187,50 pendente)');
  {
    const allEnrollments = [inactiveEnrollmentAsheley, activeEnrollmentAsheley];
    const groups = [groupMev12, groupMev10];

    const eligible = getEligibleEnrollmentsForStudent(
      STUDENT_ASHELEY_ID,
      allEnrollments,
      groups,
      10,
      2026,
      {
        competenceBillings: competenceBillingsOct,
        transactions: transactionsHistoryJuly,
      }
    );

    const resolveContext = {
      competenceBillings: competenceBillingsOct as any,
      transactions: transactionsHistoryJuly as any,
      enrollments: allEnrollments as any,
      financialPlans: [planCantoEmGrupo] as any,
      groups: groups as any,
      teachers: [{ id: TEACHER_RAPHAEL_ID, name: 'RAPHAEL AUGUSTO PINTO' }] as any,
      students: [studentAsheley] as any,
      classes: [],
      credits: [],
    };

    const billingItems: any[] = [];
    eligible.forEach((e) => {
      const plan = [planCantoEmGrupo].find((p) => p.id === e.plan_id);
      if (!plan) return;

      const monthsToBill = getMonthsToBill(e.start_date, 10, 2026, (e as any).end_date);
      monthsToBill.forEach((mRef) => {
        const comp = `${mRef.yearStr}-${mRef.monthStr}`;
        const resolved = resolveCompetenceBilling({
          category: 'individual',
          sourceId: e.id,
          competence: comp,
          context: resolveContext,
        });

        if (!mRef.isCurrent && resolved.isPaid) return;
        if (!resolved.isPaid && !resolved.isFrozen && resolved.finalPrice <= 0) return;

        billingItems.push({
          enrollment: e,
          plan,
          finalPrice: resolved.finalPrice,
          isPaid: resolved.isPaid,
          statusLabel: resolved.statusLabel,
          resolvedSource: resolved.source,
        });
      });
    });

    assert(billingItems.length > 0, 'Resultado de faturamento para Outubro NÃO pode ser vazio ([])');
    assert.equal(billingItems.length, 1, 'Deve conter exatamente 1 item de cobrança em Outubro');
    assert.equal(billingItems[0].finalPrice, 187.5, 'Valor final deve ser R$ 187,50 da competência materializada');
    assert.equal(billingItems[0].isPaid, false, 'Deve constar como pendente (não pago)');
    assert.equal(billingItems[0].resolvedSource, 'snapshot_pending', 'Origem deve ser snapshot_pending');
    console.log('  ✓ Cobrança de Outubro/2026 resolvida com sucesso: R$ 187,50 pendente.');
  }

  // =========================================================================
  // TESTE 3: Caso de duas matrículas ATIVAS do mesmo plan_id no mesmo mês
  // =========================================================================
  console.log('Teste 3: Duas matrículas ATIVAS do mesmo plan_id devem AMBAS permanecer elegíveis');
  {
    const activeEnrollmentTurmaA = {
      id: 'enr-active-turma-a',
      student_id: 'student-multi-01',
      plan_id: PLAN_CANTO_EM_GRUPO_ID,
      group_id: groupMev10.id,
      status: 'active' as const,
      start_date: '2026-10-01',
    };

    const activeEnrollmentTurmaB = {
      id: 'enr-active-turma-b',
      student_id: 'student-multi-01',
      plan_id: PLAN_CANTO_EM_GRUPO_ID,
      group_id: groupMev16.id,
      status: 'active' as const,
      start_date: '2026-10-01',
    };

    const allEnrollments = [activeEnrollmentTurmaA, activeEnrollmentTurmaB];
    const groups = [groupMev10, groupMev16];

    const eligible = getEligibleEnrollmentsForStudent(
      'student-multi-01',
      allEnrollments,
      groups,
      10,
      2026,
      {}
    );

    assert.equal(eligible.length, 2, 'Ambas as matrículas ativas devem ser elegíveis');
    const ids = eligible.map((e) => e.id);
    assert(ids.includes('enr-active-turma-a'), 'Turma A deve estar presente');
    assert(ids.includes('enr-active-turma-b'), 'Turma B deve estar presente');
    console.log('  ✓ Ambas as matrículas ativas do mesmo plano foram preservadas.');
  }

  // =========================================================================
  // TESTE 4: Matrícula inativa relevante em Julho/2026 é exibida em Julho/2026
  // =========================================================================
  console.log('Teste 4: Em Julho/2026, a matrícula inativa que teve pagamento em Julho deve ser elegível');
  {
    const allEnrollments = [inactiveEnrollmentAsheley, activeEnrollmentAsheley];
    const groups = [groupMev12, groupMev10];

    const eligible = getEligibleEnrollmentsForStudent(
      STUDENT_ASHELEY_ID,
      allEnrollments,
      groups,
      7,
      2026,
      {
        competenceBillings: competenceBillingsOct,
        transactions: transactionsHistoryJuly,
      }
    );

    assert.equal(eligible.length, 1, 'Em Julho/2026 apenas a matrícula de Julho deve ser elegível');
    assert.equal(eligible[0].id, inactiveEnrollmentAsheley.id, 'Deve ser a matrícula inativa de Julho');
    console.log('  ✓ Matrícula inativa aparece corretamente ao visualizar Julho/2026.');
  }

  // =========================================================================
  // TESTE 5: Matrícula ativa sem qualquer histórico anterior permanece elegível
  // =========================================================================
  console.log('Teste 5: Aluno novo com matrícula ativa recente sem histórico financeiro prévio');
  {
    const newStudentEnrollment = {
      id: 'enr-newbie-01',
      student_id: 'student-newbie',
      plan_id: PLAN_CANTO_EM_GRUPO_ID,
      group_id: groupMev10.id,
      status: 'active' as const,
      start_date: '2026-10-01',
    };

    const eligible = getEligibleEnrollmentsForStudent(
      'student-newbie',
      [newStudentEnrollment],
      [groupMev10],
      10,
      2026,
      {}
    );

    assert.equal(eligible.length, 1, 'Aluno novo sem histórico deve ser elegível');
    assert.equal(eligible[0].id, 'enr-newbie-01');
    console.log('  ✓ Aluno novo ativo é elegível.');
  }

  // =========================================================================
  // TESTE 6: Grupo com payment_type === 'group' é ignorado na cobrança individual
  // =========================================================================
  console.log('Teste 6: Grupo com payment_type === "group" é ignorado individualmente');
  {
    const groupLevelEnrollment = {
      id: 'enr-group-level',
      student_id: 'student-group-01',
      plan_id: PLAN_CANTO_EM_GRUPO_ID,
      group_id: groupUnified.id,
      status: 'active' as const,
      start_date: '2026-10-01',
    };

    const eligible = getEligibleEnrollmentsForStudent(
      'student-group-01',
      [groupLevelEnrollment],
      [groupUnified],
      10,
      2026,
      {}
    );

    assert.equal(eligible.length, 0, 'Matrícula de grupo coletivo não deve ser elegível individualmente');
    console.log('  ✓ Cobrança a nível de grupo respeitada.');
  }

  // =========================================================================
  // TESTE 7: Competência paga vs pendente mantidas associadas ao enrollment_id correto
  // =========================================================================
  console.log('Teste 7: Competência paga e pendente vinculadas aos seus respectivos enrollment_ids');
  {
    const paidBillingJuly = {
      id: 'bill-paid-07',
      competence: '2026-07',
      category: 'individual' as const,
      enrollment_id: inactiveEnrollmentAsheley.id,
      final_price: 100,
      status: 'paid' as const,
      is_frozen: true,
    };

    const resolveContext = {
      competenceBillings: [paidBillingJuly, ...competenceBillingsOct] as any,
      transactions: transactionsHistoryJuly as any,
      enrollments: [inactiveEnrollmentAsheley, activeEnrollmentAsheley] as any,
      financialPlans: [planCantoEmGrupo] as any,
      groups: [groupMev12, groupMev10] as any,
      teachers: [{ id: TEACHER_RAPHAEL_ID, name: 'RAPHAEL AUGUSTO PINTO' }] as any,
      students: [studentAsheley] as any,
      classes: [],
      credits: [],
    };

    const resolvedJuly = resolveCompetenceBilling({
      category: 'individual',
      sourceId: inactiveEnrollmentAsheley.id,
      competence: '2026-07',
      context: resolveContext,
    });
    assert.equal(resolvedJuly.isPaid, true, 'Competência de Julho deve ser paga');
    assert.equal(resolvedJuly.finalPrice, 100, 'Valor de Julho deve ser R$ 100');

    const resolvedOct = resolveCompetenceBilling({
      category: 'individual',
      sourceId: activeEnrollmentAsheley.id,
      competence: '2026-10',
      context: resolveContext,
    });
    assert.equal(resolvedOct.isPaid, false, 'Competência de Outubro deve ser pendente');
    assert.equal(resolvedOct.finalPrice, 187.5, 'Valor de Outubro deve ser R$ 187,50');
    console.log('  ✓ Vínculos por enrollment_id e status de pagamento preservados.');
  }

  console.log('\n--- TODOS OS TESTES PASSARAM COM SUCESSO! ---');
}

runTests().catch((err) => {
  console.error('Falha nos testes:', err);
  process.exit(1);
});
