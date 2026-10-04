/**
 * Testes Unitários de Regras de Negócio do Módulo de Afiliados
 * Execução: npx tsx tests/affiliates.test.ts
 */

import {
  calculateAffiliateCommission,
  evaluateReferralStatus,
  extractCompetenceFromDateStr,
  getCompetenceValidReferrals,
  formatCompetence
} from '../src/utils/affiliateCommission';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('--- TESTES DE FAIXAS DE COMISSÃO (1 a 10 e >10) ---');

// 1. Faixas 1 a 10
assert(calculateAffiliateCommission(1).totalAmount === 40, '1 indicação = R$ 40');
assert(calculateAffiliateCommission(2).totalAmount === 80, '2 indicações = R$ 80');
assert(calculateAffiliateCommission(3).totalAmount === 150, '3 indicações = R$ 150');
assert(calculateAffiliateCommission(4).totalAmount === 200, '4 indicações = R$ 200');
assert(calculateAffiliateCommission(5).totalAmount === 300, '5 indicações = R$ 300');
assert(calculateAffiliateCommission(6).totalAmount === 360, '6 indicações = R$ 360');
assert(calculateAffiliateCommission(7).totalAmount === 490, '7 indicações = R$ 490');
assert(calculateAffiliateCommission(8).totalAmount === 560, '8 indicações = R$ 560');
assert(calculateAffiliateCommission(9).totalAmount === 630, '9 indicações = R$ 630');
assert(calculateAffiliateCommission(10).totalAmount === 700, '10 indicações = R$ 700');

// 2. Acima de 10: REGRA NÃO DEFINIDA (não gerar valor numérico)
const res11 = calculateAffiliateCommission(11);
assert(res11.isDefined === false && res11.totalAmount === null, '11 indicações = REGRA NÃO DEFINIDA (valor nulo)');
assert(res11.statusMessage.includes('não definida'), '11 indicações possui mensagem de regra pendente');

const res12 = calculateAffiliateCommission(12);
assert(res12.isDefined === false && res12.totalAmount === null, '12 indicações = REGRA NÃO DEFINIDA (valor nulo)');

const res20 = calculateAffiliateCommission(20);
assert(res20.isDefined === false && res20.totalAmount === null, '20 indicações = REGRA NÃO DEFINIDA (valor nulo)');

console.log('\n--- TESTES DE VALIDAÇÃO DE CONVERSÃO ---');

// Mock data
const mockStudent = { id: 's1', name: 'João Silva', status: 'active' };
const mockEnrollment = { id: 'e1', student_id: 's1', status: 'active', start_date: '2026-10-05' };
const mockTransaction = {
  id: 'tx1',
  type: 'income',
  status: 'completed',
  amount: 250,
  description: 'Mensalidade | e1 | Outubro',
  date: '2026-10-05'
};

// 3. Indicação sem matrícula -> não válida (registered)
const evalSemMatricula = evaluateReferralStatus(
  { id: 'r1', referred_name: 'Carlos Teste', status: 'registered' },
  [],
  [],
  []
);
assert(evalSemMatricula.status === 'registered', 'Indicação sem aluno/matrícula permanece registrada (não válida)');

// 4. Matrícula sem pagamento -> não válida (enrolled_pending_payment)
const evalSemPagamento = evaluateReferralStatus(
  { id: 'r2', student_id: 's1', referred_name: 'João Silva', status: 'registered' },
  [mockStudent],
  [mockEnrollment],
  [] // Nenhuma transação paga
);
assert(evalSemPagamento.status === 'enrolled_pending_payment', 'Matrícula sem pagamento confirmado -> enrolled_pending_payment');

// 5. Matrícula com pagamento confirmado -> válida (converted)
const evalConvertida = evaluateReferralStatus(
  { id: 'r3', student_id: 's1', referred_name: 'João Silva', status: 'registered' },
  [mockStudent],
  [mockEnrollment],
  [mockTransaction]
);
assert(evalConvertida.status === 'converted', 'Matrícula + pagamento confirmado -> convertida');
assert(evalConvertida.conversionCompetence === '2026-10', 'Competência atribuída pelo início da matrícula (2026-10)');

// 6. Indicação feita em setembro com matrícula para outubro -> competência outubro
assert(evalConvertida.conversionCompetence === '2026-10', 'Indicação com matrícula para outubro tem competência 2026-10');

// 6b. Matrícula iniciando em 2026-10-01 (dia 01) com enrollment_date em 2026-09-29 (cenário Davi) -> competência 2026-10 e status enrolled_pending_payment
assert(extractCompetenceFromDateStr('2026-10-01') === '2026-10', 'extractCompetenceFromDateStr("2026-10-01") deve retornar "2026-10" sem shift de timezone');
const evalDavi = evaluateReferralStatus(
  {
    id: 'ref_davi',
    student_id: '639794af-8fce-4df3-939c-92808fb382a5',
    enrollment_id: '2dc83659-f121-4f93-a523-ba34f9a89fa1',
    referred_name: 'Davi de Oliveira Alexandre',
    status: 'enrolled_pending_payment',
    conversion_competence: '2026-10',
  },
  [{ id: '639794af-8fce-4df3-939c-92808fb382a5', name: 'Davi de Oliveira Alexandre ', status: 'active' }],
  [{ id: '2dc83659-f121-4f93-a523-ba34f9a89fa1', student_id: '639794af-8fce-4df3-939c-92808fb382a5', status: 'active', start_date: '2026-10-01', enrollment_date: '2026-09-29' }],
  []
);
assert(evalDavi.status === 'enrolled_pending_payment' && evalDavi.conversionCompetence === '2026-10', 'Cenário Davi (start_date 2026-10-01, sem pagamento) -> enrolled_pending_payment em 2026-10');

console.log('\n--- TESTES DE INTEGRIDADE, DUPLICIDADE E RECORRÊNCIA ---');

// 7. Aluno permanece matriculado no mês seguinte -> não gera nova comissão em 2026-11
const resNov = getCompetenceValidReferrals('2026-11', [
  { id: 'r3', affiliate_id: 'aff1', student_id: 's1', referred_name: 'João Silva', status: 'converted', conversion_competence: '2026-10' }
]);
assert(resNov.validList.length === 0, 'Permanecer matriculado no mês seguinte não entra na competência nova (não gera comissão recorrente)');

// 8. Renovação de matrícula não gera nova indicação
const resRenovacao = getCompetenceValidReferrals('2026-10', [
  { id: 'r3', affiliate_id: 'aff1', student_id: 's1', referred_name: 'João Silva', status: 'converted', conversion_competence: '2026-10' },
  { id: 'r3_renovacao', affiliate_id: 'aff1', student_id: 's1', referred_name: 'João Silva', status: 'converted', conversion_competence: '2026-10' }
]);
assert(resRenovacao.validList.length === 1 && resRenovacao.duplicateList.length === 1, 'Renovação/duplicata do mesmo aluno filtrada para 1 indicação');

// 9. Duas matrículas do mesmo aluno (ex: individual + grupo) -> apenas uma indicação válida
const resDuasMatriculas = getCompetenceValidReferrals('2026-10', [
  { id: 'r_indiv', affiliate_id: 'aff1', student_id: 's1', referred_name: 'João Silva', status: 'converted', conversion_competence: '2026-10' },
  { id: 'r_grupo', affiliate_id: 'aff1', student_id: 's1', referred_name: 'João Silva', status: 'converted', conversion_competence: '2026-10' }
]);
assert(resDuasMatriculas.validList.length === 1, 'Duas matrículas do mesmo aluno contabilizam exatamente 1 indicação');

// 10. Mesma pessoa indicada por dois afiliados diferentes -> apenas o primeiro convertido é aceito
const resDoisAfiliados = getCompetenceValidReferrals('2026-10', [
  { id: 'r_afiliadoA', affiliate_id: 'aff1', student_id: 's1', referred_name: 'João Silva', status: 'converted', conversion_competence: '2026-10', created_at: '2026-09-01' },
  { id: 'r_afiliadoB', affiliate_id: 'aff2', student_id: 's1', referred_name: 'João Silva', status: 'converted', conversion_competence: '2026-10', created_at: '2026-09-02' }
]);
assert(resDoisAfiliados.validList.length === 1, 'Mesma pessoa indicada por dois afiliados permite apenas uma conversão válida');
assert(resDoisAfiliados.validList[0].affiliate_id === 'aff1', 'Prioridade dada à primeira indicação/conversão registrada');

console.log(`\n================================`);
console.log(`RESULTADO FINAL: ${passed} passaram, ${failed} falharam.`);
console.log(`================================`);

if (failed > 0) {
  process.exit(1);
}
