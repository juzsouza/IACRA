import assert from 'node:assert/strict';
import {getEligibleTeacherCancelledClasses} from '../utils/raphaelCreditCapacity';
import {calculateRaphaelClassCreditValue,RAPHAEL_TEACHER_ID} from '../utils/raphaelBillingSimulation';
import {calculateRaphaelRealStudentBilling} from '../utils/raphaelRealBilling';
import {readFileSync} from 'node:fs';
const enrollment={id:'enrollment-a',student_id:'student-a',teacher_id:RAPHAEL_TEACHER_ID,status:'active',custom_price:280,group_id:null,start_date:'2026-06-01',plan_id:'plan-q'};
const plan={id:'plan-q',name:'Preparação vocal - quinzenal',modality:'quinzenal',base_price:0};
const teacher={id:RAPHAEL_TEACHER_ID,name:'RAPHAEL AUGUSTO PINTO'};
const cl=(id:string,date:string,status:'completed'|'cancelled'|'scheduled',who='student-a')=>({
 id,date,status,teacher_id:RAPHAEL_TEACHER_ID,student_ids:[who],title:'PREPARAÇÃO VOCAL',
 cancelled_by_teacher:status==='cancelled',group_id:null,
});
const oct=[cl('oct-01','2026-10-01','completed'),cl('oct-15','2026-10-15','cancelled'),cl('oct-29','2026-10-29','completed')];
const sept=[cl('sep-03','2026-09-03','cancelled'),cl('sep-17','2026-09-17','completed')];
const nov=[cl('nov-12','2026-11-12','completed'),cl('nov-26','2026-11-26','scheduled')];
assert.deepEqual([...getEligibleTeacherCancelledClasses(oct,2)],[],'terceira aula cancelada nao e credito');
assert.deepEqual([...getEligibleTeacherCancelledClasses(sept,2)],['sep-03'],'cancelamento dentro da carga mensal permanece elegivel');
assert.deepEqual([...getEligibleTeacherCancelledClasses([cl('a','2026-10-02','completed'),cl('b','2026-10-16','cancelled'),cl('c','2026-10-30','cancelled')],2)],['b'],'no maximo uma aula perdida do plano');
const cancellation=(c:any,monthClasses:any[])=>calculateRaphaelClassCreditValue(
 c,[enrollment] as any,[plan] as any,[],[teacher] as any,monthClasses as any
);
assert.equal(cancellation(oct[1],oct).isEligible,false);
assert.equal(cancellation(sept[0],sept).isEligible,true);
const bill=(month:string,classes:any[],credits:any[]=[])=>calculateRaphaelRealStudentBilling({
 enrollment:enrollment as any,plan:plan as any,teacher:teacher as any,
 classes:classes as any,monthStr:month,credits:credits as any,allGroups:[],
 requireExplicitStudentId:true
});
const octBill=bill('2026-10',oct);
assert.equal(octBill.regularLessons,2);
assert.equal(octBill.cancelledLessons,0);
assert.equal(octBill.creditsGeneratedCount,0);
assert.equal(octBill.grossAmount,280);
assert.equal(octBill.finalAmount,280);
const novBill=bill('2026-11',[...oct,...nov]);
assert.equal(novBill.regularLessons,2);
assert.equal(novBill.grossAmount,280);
assert.equal(novBill.creditsGeneratedCount,0);
const badCredit={
 id:'credit-oct-15',student_id:'student-a',enrollment_id:'enrollment-a',
 source_class_id:'oct-15',teacher_id:RAPHAEL_TEACHER_ID,amount:140,
 status:'available',competency_month:'2026-10',
};
const novWithGhost=bill('2026-11',[...oct,...nov],[badCredit]);
assert.equal(novWithGhost.finalAmount,280,'credito antigo indevido nao pode zerar novembro');
assert.equal(novWithGhost.creditsConsumedCount,0);
const validCredit={
 ...badCredit,id:'credit-sep-03',source_class_id:'sep-03',competency_month:'2026-09',
};
const creditPreserved=bill('2026-11',[...sept,...oct,...nov],[validCredit]);
assert.equal(creditPreserved.creditsAvailableCount,1);
assert.equal(creditPreserved.finalAmount,140,'credito setembro valido continua disponivel: atribuicao precisa conciliacao');
const otherStudent=cl('alheia','2026-10-07','completed','outro');
assert.equal(bill('2026-10',[...oct,otherStudent]).regularLessons,2);
const store=readFileSync(new URL('../store.tsx',import.meta.url),'utf8');
assert.match(store,/calculateRaphaelClassCreditValue\([\s\S]*?classesToKeep/);
assert.match(store,/calculateRaphaelClassCreditValue\([\s\S]*?updatedList/);
console.log('OK outubro R$280, terceira aula sem credito; credito fantasma nao reduz novembro; setembro mantido');
