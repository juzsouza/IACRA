import assert from 'node:assert/strict';
import {
  getInitialPaymentSelection,
  hasRecordedGroupPayment,
  pickSinglePaymentCompetence,
} from '../utils/paymentCompetenceSelection';

// Fixture sintética: não se conecta ao Supabase nem cria dinheiro ou aluno.
const groupId = 'group-inj-test';
const paid = ['2026-07','2026-08','2026-09','2026-10'].map(month => {
  const [year, mm] = month.split('-');
  return {type: 'income',status: 'completed',
    description: `Mensalidade Grupo | ${groupId} | ${mm}/${year} | INJ`};
});
const transactions = [...paid,
  {type:'income',status:'pending',description:`Mensalidade Grupo | ${groupId} | 11/2026 | INJ`},
  {type:'expense',status:'completed',description:`Mensalidade Grupo | ${groupId} | 11/2026 | INJ`}
];
assert.equal(hasRecordedGroupPayment(transactions, groupId, '10', '2026'), true);
assert.equal(hasRecordedGroupPayment(transactions, groupId, '11', '2026'), false);
assert.equal(hasRecordedGroupPayment(transactions, 'different', '10', '2026'), false);

const items = [
  {itemKey:'outubro',monthStr:'10',yearStr:'2026',isPaid:false,groupId},
  {itemKey:'novembro',monthStr:'11',yearStr:'2026',isPaid:false,groupId},
  {itemKey:'julho',monthStr:'07',yearStr:'2026',isPaid:true,groupId},
];
assert.deepEqual(getInitialPaymentSelection(items,11,2026,transactions),{novembro:true});
assert.deepEqual(getInitialPaymentSelection(items,10,2026,transactions),{});
assert.deepEqual(getInitialPaymentSelection(items,7,2026,transactions),{});
assert.deepEqual(getInitialPaymentSelection(items,12,2026,transactions),{});
assert.deepEqual(pickSinglePaymentCompetence('novembro',true),{novembro:true});
assert.deepEqual(pickSinglePaymentCompetence('novembro',false),{});

// Um pagamento coletivo não pode habilitar automaticamente a competência individual de outubro.
const withOctoberPaid = [...transactions,{type:'income',status:'completed',
description:`Mensalidade Grupo | ${groupId} | 11/2026 | INJ`}];
assert.deepEqual(getInitialPaymentSelection(items,11,2026,withOctoberPaid),{});
console.log('Seleção mensal / bloqueio de pagamento coletivo: 11 testes aprovados.');
