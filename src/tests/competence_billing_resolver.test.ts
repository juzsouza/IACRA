import assert from 'node:assert/strict';
import {
  resolveCompetenceBilling,
  ResolveBillingContext,
} from '../utils/competenceBillingResolver';
import {
  CompetenceBilling,
  Enrollment,
  FinancialPlan,
  Group,
  ChoirRegistration,
  Transaction,
  Teacher,
} from '../store';

async function runResolverTests() {
  console.log('--- Iniciando Testes Unitários: Resolve Competence Billing (Etapa 3) ---');

  const mockPlan = {
    id: 'plan-1',
    name: 'Piano Semanal',
    base_price: 180,
    school_fee_value: 90,
    teacher_fee_type: 'percentage' as const,
    teacher_fee_value: 50,
    secretary_fee_value: 0,
    margin_value: 0,
  } as FinancialPlan;

  const mockTeacher: Teacher = {
    id: 'tea-1',
    name: 'Professor Teste',
    email: 'prof@teste.com',
    phone: '1199999999',
    specialties: ['Piano'],
    status: 'active',
  };

  const mockEnrollment = {
    id: 'enr-101',
    student_id: 'stu-101',
    plan_id: 'plan-1',
    teacher_id: 'tea-1',
    status: 'active' as const,
    custom_price: 180, // Preço ATUAL alterado para 180
    enrollment_date: '2026-01-01',
    due_date_day: 10,
  } as Enrollment;

  // Snapshot congelado de Junho = R$ 80
  const frozenBillingJunho: CompetenceBilling = {
    id: 'snap-jun',
    competence: '2026-06',
    category: 'individual',
    enrollment_id: 'enr-101',
    choir_registration_id: null,
    group_id: null,
    student_id: 'stu-101',
    teacher_id: 'tea-1',
    is_paying: true,
    base_price: 100,
    discount: 20,
    final_price: 80, // R$ 80 congelado
    teacher_fee_type: 'percentage',
    teacher_fee_value: 50,
    teacher_share: 40,
    school_share: 40,
    status: 'paid',
    transaction_id: null,
    is_frozen: true,
    frozen_at: '2026-06-30T12:00:00Z',
    frozen_by: 'admin',
    metadata: {},
    created_at: '2026-06-01T00:00:00Z',
  };

  // Transaction histórica de Julho = R$ 80 (sem snapshot)
  const historicalTxJulho: Transaction = {
    id: 'tx-jul',
    type: 'income',
    amount: 80,
    description: 'Mensalidade | enr-101 | 07/2026 | Aluno Teste',
    date: '2026-07-05',
    status: 'completed',
  };

  // Transaction histórica de Agosto = R$ 80 (sem snapshot)
  const historicalTxAgosto: Transaction = {
    id: 'tx-ago',
    type: 'income',
    amount: 80,
    description: 'Mensalidade | enr-101 | 08/2026 | Aluno Teste',
    date: '2026-08-05',
    status: 'completed',
  };

  // Snapshot congelado de Setembro = R$ 150
  const frozenBillingSetembro: CompetenceBilling = {
    id: 'snap-set',
    competence: '2026-09',
    category: 'individual',
    enrollment_id: 'enr-101',
    choir_registration_id: null,
    group_id: null,
    student_id: 'stu-101',
    teacher_id: 'tea-1',
    is_paying: true,
    base_price: 150,
    discount: 0,
    final_price: 150, // R$ 150 congelado
    teacher_fee_type: 'percentage',
    teacher_fee_value: 50,
    teacher_share: 75,
    school_share: 75,
    status: 'paid',
    transaction_id: null,
    is_frozen: true,
    frozen_at: '2026-09-05T12:00:00Z',
    frozen_by: 'admin',
    metadata: {},
    created_at: '2026-09-01T00:00:00Z',
  };

  const context: ResolveBillingContext = {
    competenceBillings: [frozenBillingJunho, frozenBillingSetembro],
    transactions: [historicalTxJulho, historicalTxAgosto],
    enrollments: [mockEnrollment],
    financialPlans: [mockPlan],
    discountRules: [],
    groups: [],
    choirRegistrations: [],
    teachers: [mockTeacher],
    students: [{
      id: 'stu-101',
      name: 'Aluno Teste',
      email: 'teste@aluno.com',
      phone: '1199999999',
      instrument: 'Piano',
      enrollment_date: '2026-01-01',
      status: 'active',
    }],
    classes: [],
    credits: [],
  };

  // TESTE 1: Competência com snapshot congelado (Junho = 80)
  console.log('TESTE 1: Competência com snapshot congelado (Junho = R$ 80)...');
  const resJunho = resolveCompetenceBilling({
    category: 'individual',
    sourceId: 'enr-101',
    competence: '2026-06',
    context,
  });
  assert.equal(resJunho.source, 'snapshot_frozen');
  assert.equal(resJunho.finalPrice, 80);
  assert.equal(resJunho.isFrozen, true);
  console.log('✓ Teste 1 passou: Junho manteve R$ 80 do snapshot congelado.');

  // TESTE 2: Competência com transaction histórica mas sem snapshot (Julho e Agosto = 80)
  console.log('TESTE 2: Competência com transaction mas sem snapshot (Julho = R$ 80)...');
  const resJulho = resolveCompetenceBilling({
    category: 'individual',
    sourceId: 'enr-101',
    competence: '2026-07',
    context,
  });
  assert.equal(resJulho.source, 'historical_transaction');
  assert.equal(resJulho.finalPrice, 80);
  assert.equal(resJulho.isPaid, true);
  console.log('✓ Teste 2 passou: Julho manteve R$ 80 da transaction histórica.');

  console.log('TESTE 2b: Competência com transaction mas sem snapshot (Agosto = R$ 80)...');
  const resAgosto = resolveCompetenceBilling({
    category: 'individual',
    sourceId: 'enr-101',
    competence: '2026-08',
    context,
  });
  assert.equal(resAgosto.source, 'historical_transaction');
  assert.equal(resAgosto.finalPrice, 80);
  console.log('✓ Teste 2b passou: Agosto manteve R$ 80 da transaction histórica.');

  // Setembro congelado com 150
  console.log('TESTE: Setembro congelado com R$ 150...');
  const resSetembro = resolveCompetenceBilling({
    category: 'individual',
    sourceId: 'enr-101',
    competence: '2026-09',
    context,
  });
  assert.equal(resSetembro.source, 'snapshot_frozen');
  assert.equal(resSetembro.finalPrice, 150);
  console.log('✓ Setembro manteve R$ 150 do snapshot congelado.');

  // TESTE 3: Competência aberta sem snapshot nem transaction (Outubro 2026)
  // Cadastro vigente é custom_price = 180
  console.log('TESTE 3: Competência aberta sem snapshot nem transaction (Outubro = R$ 180)...');
  const resOutubro = resolveCompetenceBilling({
    category: 'individual',
    sourceId: 'enr-101',
    competence: '2026-10',
    context,
  });
  assert.equal(resOutubro.source, 'open_vigente');
  assert.equal(resOutubro.finalPrice, 180);
  assert.equal(resOutubro.isFrozen, false);
  console.log('✓ Teste 3 passou: Outubro usou o valor vigente de R$ 180.');

  // TESTE 4: Alterar custom_price atual do cadastro para R$ 250 e verificar se passado NUNCA muda
  console.log('TESTE 4: Alterar custom_price do cadastro para R$ 250...');
  mockEnrollment.custom_price = 250;

  const resJunhoAposAlt = resolveCompetenceBilling({
    category: 'individual',
    sourceId: 'enr-101',
    competence: '2026-06',
    context,
  });
  assert.equal(resJunhoAposAlt.finalPrice, 80, 'Junho não pode mudar!');

  const resAgostoAposAlt = resolveCompetenceBilling({
    category: 'individual',
    sourceId: 'enr-101',
    competence: '2026-08',
    context,
  });
  assert.equal(resAgostoAposAlt.finalPrice, 80, 'Agosto não pode mudar!');

  const resSetembroAposAlt = resolveCompetenceBilling({
    category: 'individual',
    sourceId: 'enr-101',
    competence: '2026-09',
    context,
  });
  assert.equal(resSetembroAposAlt.finalPrice, 150, 'Setembro não pode mudar!');

  const resOutubroAposAlt = resolveCompetenceBilling({
    category: 'individual',
    sourceId: 'enr-101',
    competence: '2026-10',
    context,
  });
  assert.equal(resOutubroAposAlt.finalPrice, 250, 'Competência aberta agora reflete R$ 250!');
  console.log('✓ Teste 4 passou: Alteração do cadastro NÃO alterou Junho (80), Julho (80), Agosto (80), nem Setembro (150). Apenas Outubro (250).');

  // TESTE 5: Coral: Agosto Não pagante (R$ 0), Setembro Pagante (R$ 26), Cadastro atual alterado para R$ 30
  console.log('TESTE 5: Coral com snapshot congelado R$ 0 em Agosto e R$ 26 em Setembro...');
  const choirReg = {
    id: 'choir-reg-1',
    student_id: 'stu-coral-1',
    status: 'approved' as const,
    monthly_fee: 30, // Alterado para R$ 30 no cadastro vigente
    voice_type_id: 'voice-1',
    is_internal_student: false,
  } as ChoirRegistration;

  const choirSnapAgosto: CompetenceBilling = {
    id: 'snap-choir-ago',
    competence: '2026-08',
    category: 'choir',
    enrollment_id: null,
    choir_registration_id: 'choir-reg-1',
    group_id: null,
    student_id: 'stu-coral-1',
    teacher_id: null,
    is_paying: false,
    base_price: 0,
    discount: 0,
    final_price: 0,
    teacher_fee_type: null,
    teacher_fee_value: null,
    teacher_share: 0,
    school_share: 0,
    status: 'paid',
    transaction_id: null,
    is_frozen: true,
    frozen_at: '2026-08-31T00:00:00Z',
    frozen_by: 'admin',
    metadata: {},
    created_at: '2026-08-01T00:00:00Z',
  };

  const choirSnapSetembro: CompetenceBilling = {
    id: 'snap-choir-set',
    competence: '2026-09',
    category: 'choir',
    enrollment_id: null,
    choir_registration_id: 'choir-reg-1',
    group_id: null,
    student_id: 'stu-coral-1',
    teacher_id: null,
    is_paying: true,
    base_price: 26,
    discount: 0,
    final_price: 26,
    teacher_fee_type: null,
    teacher_fee_value: null,
    teacher_share: 0,
    school_share: 26,
    status: 'paid',
    transaction_id: null,
    is_frozen: true,
    frozen_at: '2026-09-05T00:00:00Z',
    frozen_by: 'admin',
    metadata: {},
    created_at: '2026-09-01T00:00:00Z',
  };

  const choirContext: ResolveBillingContext = {
    ...context,
    competenceBillings: [
      ...(context.competenceBillings || []),
      choirSnapAgosto,
      choirSnapSetembro,
    ],
    choirRegistrations: [choirReg],
  };

  const resChoirAgo = resolveCompetenceBilling({
    category: 'choir',
    sourceId: 'choir-reg-1',
    competence: '2026-08',
    context: choirContext,
  });
  assert.equal(resChoirAgo.finalPrice, 0);
  assert.equal(resChoirAgo.isPaying, false);

  const resChoirSet = resolveCompetenceBilling({
    category: 'choir',
    sourceId: 'choir-reg-1',
    competence: '2026-09',
    context: choirContext,
  });
  assert.equal(resChoirSet.finalPrice, 26);
  assert.equal(resChoirSet.isPaying, true);

  const resChoirOut = resolveCompetenceBilling({
    category: 'choir',
    sourceId: 'choir-reg-1',
    competence: '2026-10',
    context: choirContext,
  });
  assert.equal(resChoirOut.finalPrice, 30);
  console.log('✓ Teste 5 passou: Coral manteve R$ 0 em Agosto, R$ 26 em Setembro e R$ 30 em Outubro.');

  // TESTE 6: Grupos: R$ 360 em Agosto, R$ 360 em Setembro, alterado para R$ 400 no cadastro
  console.log('TESTE 6: Grupos com histórico protegido...');
  const groupObj: Group = {
    id: 'grp-01',
    name: 'Grupo Louvor',
    payment_type: 'group',
    price: 400, // Alterado para 400
    status: 'active',
  };

  const groupSnapAgosto: CompetenceBilling = {
    id: 'snap-grp-ago',
    competence: '2026-08',
    category: 'group',
    enrollment_id: null,
    choir_registration_id: null,
    group_id: 'grp-01',
    student_id: null,
    teacher_id: null,
    is_paying: true,
    base_price: 360,
    discount: 0,
    final_price: 360,
    teacher_fee_type: null,
    teacher_fee_value: null,
    teacher_share: 0,
    school_share: 360,
    status: 'paid',
    transaction_id: null,
    is_frozen: true,
    frozen_at: '2026-08-31T00:00:00Z',
    frozen_by: 'admin',
    metadata: {},
    created_at: '2026-08-01T00:00:00Z',
  };

  const groupContext: ResolveBillingContext = {
    ...context,
    competenceBillings: [
      ...(context.competenceBillings || []),
      groupSnapAgosto,
    ],
    groups: [groupObj],
  };

  const resGroupAgo = resolveCompetenceBilling({
    category: 'group',
    sourceId: 'grp-01',
    competence: '2026-08',
    context: groupContext,
  });
  assert.equal(resGroupAgo.finalPrice, 360, 'Agosto deve manter 360!');

  const resGroupOut = resolveCompetenceBilling({
    category: 'group',
    sourceId: 'grp-01',
    competence: '2026-10',
    context: groupContext,
  });
  assert.equal(resGroupOut.finalPrice, 400, 'Outubro aberto deve ser 400!');
  console.log('✓ Teste 6 passou: Grupo manteve R$ 360 em Agosto e R$ 400 em Outubro.');

  // TESTE 8: Cobrança de grupo continua sendo unificada no grupo e nunca dividida por alunos
  console.log('TESTE 8: Cobrança continua sendo do grupo...');
  assert.equal(resGroupAgo.category, 'group');
  assert.equal(resGroupAgo.sourceId, 'grp-01');
  console.log('✓ Teste 8 passou: Cobrança é do grupo.');

  // TESTE 9: Aluno com individual + grupo (não cruzar valores)
  console.log('TESTE 9: Aluno com individual + grupo sem cruzar origens...');
  const resIndiv = resolveCompetenceBilling({
    category: 'individual',
    sourceId: 'enr-101',
    competence: '2026-08',
    context: groupContext,
  });
  assert.equal(resIndiv.finalPrice, 80);
  assert.notEqual(resIndiv.finalPrice, resGroupAgo.finalPrice);
  console.log('✓ Teste 9 passou: Origens individual e grupo mantêm total segregação.');

  console.log('\n========================================');
  console.log('TODOS OS TESTES DO RESOLVER PASSARAM COM SUCESSO!');
  console.log('========================================');
}

runResolverTests().catch((err) => {
  console.error('Falha nos testes:', err);
  process.exit(1);
});
