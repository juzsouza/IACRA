import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getChoirCompetenceCharge,isChoirDecemberSingleRehearsal} from '../utils/choirDecember2026Billing';
import {calculateDueBillingValues} from '../utils/dueCompetenceService';
import {resolveCompetenceBilling} from '../utils/competenceBillingResolver';
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
// Metade de dois ensaios quinzenais, independentemente da data do ensaio antecipado.
for(const [fee,expected] of [[42,21],[40,20],[30,15],[20,10],[0,0],[41,20.5]]){
 const res=getChoirCompetenceCharge(fee,'2026-12');
 assert.equal(res.finalPrice,expected,`Dez/2026: mensalidade ${fee}`);
 assert.equal(res.discount,fee-expected);
 assert.equal(res.basePrice,fee);
 assert.equal(res.singleRehearsalDecember,true);
}
assert.equal(getChoirCompetenceCharge(42,'2026-11').finalPrice,42);
assert.equal(getChoirCompetenceCharge(42,'2027-01').finalPrice,42);
assert.equal(getChoirCompetenceCharge(42,'2027-12').finalPrice,42);
assert.equal(isChoirDecemberSingleRehearsal('2026-12'),true);
assert.equal(isChoirDecemberSingleRehearsal('2027-01'),false);
assert.equal(getChoirCompetenceCharge(0,'2026-12').finalPrice,0);
const reg={id:'coral-inscricao-1',student_id:'s',status:'approved',monthly_fee:42,voice_type_id:'n',is_internal_student:false};
const context={
 choirRegistrations:[reg],competenceBillings:[],transactions:[],
 enrollments:[],teachers:[],students:[],financialPlans:[],groups:[],classes:[],credits:[],discountRules:[]
} as any;
function resolve(comp:string,ctx=context){return resolveCompetenceBilling({category:'choir',sourceId:reg.id,competence:comp,context:ctx});}
assert.equal(resolve('2026-12').finalPrice,21);
assert.equal(resolve('2026-12').basePrice,42);
assert.equal(resolve('2026-12').discount,21);
assert.equal(resolve('2026-12').isPaying,true);
assert.equal(resolve('2026-11').finalPrice,42);
assert.equal(resolve('2027-01').finalPrice,42);
const decDue=calculateDueBillingValues({category:'choir',sourceId:reg.id,competence:'2026-12',context});
assert.equal(decDue?.base_price,42);
assert.equal(decDue?.discount,21);
assert.equal(decDue?.final_price,21);
assert.equal(decDue?.status,'pending');
assert.equal(decDue?.metadata.choir_rehearsals_charged,1);
assert.equal(calculateDueBillingValues({category:'choir',sourceId:reg.id,competence:'2026-11',context})?.final_price,42);
reg.monthly_fee=0;
assert.equal(resolve('2026-12').finalPrice,0);
assert.equal(resolve('2026-12').isPaying,false);
const waived=calculateDueBillingValues({category:'choir',sourceId:reg.id,competence:'2026-12',context});
assert.equal(waived?.final_price,0);
assert.equal(waived?.status,'waived');
reg.monthly_fee=42;
const alreadyPaid={id:'snapshot',category:'choir',choir_registration_id:reg.id,competence:'2026-12',
 status:'paid',is_frozen:true,transaction_id:'transaction-registered',base_price:42,discount:0,
 final_price:42,is_paying:true,teacher_share:0,school_share:42,metadata:{}};
const paid=resolve('2026-12',{...context,competenceBillings:[alreadyPaid]});
assert.equal(paid.finalPrice,42,'snapshot pago congelado intocado');
assert.equal(paid.isFrozen,true);
const rejected=resolve('2026-12',{...context,choirRegistrations:[{...reg,status:'rejected'}]});
assert.equal(rejected.finalPrice,0,'inscricao rejeitada nao gera cobranca');
const payments=read('../views/Payments.tsx');
const dueCode=read('../utils/dueCompetenceService.ts');
const resolverCode=read('../utils/competenceBillingResolver.ts');
const choirCode=read('../views/Choir.tsx');
const closing=read('../components/ChoirMonthlyClosingTab.tsx');
assert.match(payments,/singleRehearsalDecember/);
assert.match(payments,/cb\.baseFee - amountToPay/);
assert.match(payments,/base_price: cb\.baseFee/);
assert.match(payments,/1 ensaio antecipado/);
assert.match(payments,/if \(item\.totalAmount <= 0\) return false/);
assert.match(dueCode,/getChoirCompetenceCharge/);
assert.match(resolverCode,/getChoirCompetenceCharge/);
assert.match(choirCode,/getChoirCompetenceCharge\(Number\(r\.monthly_fee\|\|0\),statementMonth\)/);
assert.match(closing,/getChoirCompetenceCharge\(Number\(r\.monthly_fee\|\|0\),selectedMonth\)/);
assert.match(closing,/'2026-12'/);
// Nao alterar nem inventar ensaios: colaboradores continuam por presenca real.
assert.match(closing,/calculateChoirMonthlyFinance\(collaborators,rehearsals,selectedMonth\)/);
assert.match(choirCode,/calculateChoirMonthlyFinance\(/);
console.log('PASS Coral Dez/2026: 1 ensaio antecipado; cobranca 50%, isentos 0; histórico e repasses protegidos');
