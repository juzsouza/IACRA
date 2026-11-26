import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveCompetenceBilling} from '../utils/competenceBillingResolver';
import {isManualPendingFixedBilling,shouldRecalculatePendingRaphaelSnapshot} from '../utils/raphaelPendingSnapshotPolicy';
const enrollmentId='4e8ab1a8-943a-4cf4-88f2-ca675b11ab97';
const teacherId='dada085e-c187-43d2-9ab0-a9e0539df450';
const snapshots=['2026-10','2026-11'].map((competence,i)=>({
 id:'snap-'+competence,category:'individual',enrollment_id:enrollmentId,
 competence,status:'pending',is_frozen:false,transaction_id:null,
 base_price:280,discount:0,final_price:280,is_paying:true,
 teacher_share:280,school_share:0,
 metadata:{
  source:'due_competence_materializer',
  manual_billing_override:{
   mode:'fixed_amount_no_credits',final_amount:280,
   reason:'Conferência da secretaria: duas aulas contratadas; não aplicar créditos automaticamente.',
  },
  raphaelBilling:{
   finalAmount:i===0?140:0,creditDiscountAmount:i===0?140:280,
   creditsConsumedList:[{id:'credito-antigo'}]
  }
 }
}));
const context={
 competenceBillings:snapshots,
 enrollments:[{id:enrollmentId,student_id:'student-anaisa',plan_id:'p',status:'active',teacher_id:teacherId,custom_price:280}],
 financialPlans:[{id:'p',base_price:0,modality:'quinzenal',name:'PREPARAÇÃO VOCAL'}],
 transactions:[],teachers:[{id:teacherId,name:'Raphael Augusto'}],
 classes:[],credits:[{id:'credit-setup',status:'available',student_id:'student-anaisa',teacher_id:teacherId}],
 groups:[],discountRules:[],students:[{id:'student-anaisa',name:'Anaisa Souza Barbosa'}]
} as any;
for(const snap of snapshots) {
 assert.equal(isManualPendingFixedBilling(snap as any),true);
 assert.equal(shouldRecalculatePendingRaphaelSnapshot(snap as any,false),false);
 const result=resolveCompetenceBilling({
  category:'individual',sourceId:enrollmentId,competence:snap.competence,context
 });
 assert.equal(result.finalPrice,280,'valor de Outubro e Novembro tem de ser R$280');
 assert.equal(result.basePrice,280,'base contratual permanece R$280');
 assert.equal(result.discount,0,'sem abatimento automatico');
 assert.equal(result.isPaid,false,'nao registrar pagamento');
 assert.equal(result.isFrozen,false,'ainda pendente');
 assert.equal(result.raphaelBilling,null,'ignorar memoria historica antiga com creditos indevidos');
 assert.match(result.statusLabel,/Valor conferido pela secretaria/);
}
const regularSnapshot={...snapshots[0],metadata:{source:'due_competence_materializer'}} as any;
assert.equal(isManualPendingFixedBilling(regularSnapshot),false);
assert.equal(shouldRecalculatePendingRaphaelSnapshot(regularSnapshot,false),true);
const paidSnapshot={...snapshots[0],status:'paid',is_frozen:true,transaction_id:'tx-old'} as any;
assert.equal(isManualPendingFixedBilling(paidSnapshot),false);
assert.equal(shouldRecalculatePendingRaphaelSnapshot(paidSnapshot,true),false);
const corrupted={...snapshots[0],metadata:{...snapshots[0].metadata,manual_billing_override:{
 ...snapshots[0].metadata.manual_billing_override,final_amount:150}}} as any;
assert.equal(isManualPendingFixedBilling(corrupted),false);
const view=readFileSync(new URL('../views/Payments.tsx',import.meta.url),'utf8');
assert.match(view,/!manuallyReconciled && \(!resolved\.raphaelBilling \|\| recalculatePending\)/);
assert.match(view,/raphaelRealBilling: manualPending \? null/);
assert.match(view,/Valor conferido · sem crédito automático/);
assert.match(view,/disabled=\{eb\.manuallyReconciled\}/);
assert.match(view,/eb\.manuallyReconciled && \(Math\.abs\(amountToPay-eb\.priceWithDiscount\)/);
assert.match(view,/const creditsToConsume = isRaphael && eb\.raphaelRealBilling/);
console.log('PASS Anaisa Outubro R$280 + Novembro R$280 com override auditável e sem consumir créditos; pagos preservados');
