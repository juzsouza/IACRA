import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 calculateRaphaelRealStudentBilling as studentBill,
 calculateRaphaelRealGroupBilling as groupBill,
 getClassesForEnrollment,
} from '../utils/raphaelRealBilling';
import {calculateDueBillingValues} from '../utils/dueCompetenceService';
import {resolveCompetenceBilling} from '../utils/competenceBillingResolver';
import {RAPHAEL_TEACHER_ID as teacherId} from '../utils/raphaelBillingSimulation';
import {
 isRaphaelVacationDate,isRaphaelVacationCompetence,calculateRaphaelVacationGross
} from '../utils/raphaelVacation2026';
const teacher={id:teacherId,name:'Raphael Augusto'} as any;
const plan={id:'p',name:'Preparação vocal quinzenal',modality:'quinzenal',base_price:300,teacher_fee_type:'percentage',teacher_fee_value:50,secretary_fee_value:0,school_fee_value:150} as any;
const en={id:'e',student_id:'s',plan_id:'p',teacher_id:teacherId,status:'active',custom_price:300,group_id:null,start_date:'2026-08-01'} as any;
const lesson=(id:string,date:string,student_ids:string[]=['s'],group_id?:string,status:'scheduled'|'completed'|'cancelled'='scheduled')=>({
 id,date,status,teacher_id:teacherId,title:'PREPARAÇÃO VOCAL',student_ids,...group_id?{group_id}:{}
});
const lessons=[
 lesson('dec-valid','2026-12-08'),
 lesson('dec-ghost','2026-12-14'),
 lesson('dec-other','2026-12-04',['other']),
 lesson('jan-ghost','2027-01-05'),
 lesson('jan11','2027-01-11'),
 lesson('jan25','2027-01-25'),
 lesson('other-teacher','2026-12-07',['s'])
];
lessons[6].teacher_id='other-teacher';
assert.equal(isRaphaelVacationCompetence('2026-11'),false);
assert.equal(isRaphaelVacationCompetence('2026-12'),true);
assert.equal(isRaphaelVacationCompetence('2027-01'),true);
assert.equal(isRaphaelVacationCompetence('2027-02'),false);
assert.equal(isRaphaelVacationDate('2026-12-09'),false);
assert.equal(isRaphaelVacationDate('2026-12-10'),true);
assert.equal(isRaphaelVacationDate('2027-01-10'),true);
assert.equal(isRaphaelVacationDate('2027-01-11'),false);
assert.equal(calculateRaphaelVacationGross(300,2,0),0);
assert.equal(calculateRaphaelVacationGross(300,2,1),150);
assert.equal(calculateRaphaelVacationGross(300,2,2),300);
assert.equal(calculateRaphaelVacationGross(300,2,99),300);
assert.equal(calculateRaphaelVacationGross(400,4,1),100);
assert.equal(calculateRaphaelVacationGross(400,4,3),300);
const bill=(monthStr:string,enrollment=en,classes=lessons,credits:any[]=[])=>
  studentBill({enrollment,teacher,plan,classes:classes as any,credits:credits as any,monthStr,allGroups:[],requireExplicitStudentId:true});
const dec=bill('2026-12');
assert.equal(dec.vacationAdjusted,true);
assert.equal(dec.vacationExcludedLessons,1);
assert.equal(dec.regularLessons,1);
assert.equal(dec.grossAmount,150);
assert.equal(dec.vacationDiscountAmount,150);
assert.equal(dec.finalAmount,150);
const jan=bill('2027-01');
assert.equal(jan.regularLessons,2);
assert.equal(jan.vacationExcludedLessons,1);
assert.equal(jan.grossAmount,300);
assert.equal(jan.finalAmount,300);
assert.equal(bill('2026-11').finalAmount,300,'outros meses permanecem mensais');
assert.equal(bill('2026-12',{...en,student_id:'unlinked'}).finalAmount,0,'nao atribuir aula de outra pessoa');
assert.equal(bill('2026-12',{...en,custom_price:0}).finalAmount,0,'aluno já isento continua zero');
const credits=[{id:'old-credit',status:'available',teacher_id:teacherId,
  enrollment_id:'e',student_id:'s',amount:150,competency_month:'2026-11',source_class_id:''}];
assert.equal(bill('2026-12',en,lessons,credits).finalAmount,0,'credito e ferias nao podem resultar em saldo negativo');
const zero=bill('2026-12',en,[],credits);
assert.equal(zero.finalAmount,0);
assert.equal(zero.creditDiscountAmount,0);
assert.equal(zero.creditsConsumedList.length,0,'nao consumir credito quando mensalidade ja ficou zerada');
assert.equal(zero.vacationDiscountAmount,300);
const legacy={...en,id:'legacy',group_id:'id-grupo-antigo-inexistente'};
const strict=getClassesForEnrollment(legacy,lessons as any,[],plan,{
  requireExplicitStudentId:true,allowMissingGroupDuringVacation:true
});
assert.equal(strict.some(c=>c.id==='dec-valid'),true);
assert.equal(strict.some(c=>c.id==='dec-other'),false);
assert.equal(bill('2026-12',legacy).finalAmount,150);
assert.equal(bill('2026-11',legacy).finalAmount,300,'regras antigas fora das ferias preservadas');
const group={id:'g',name:'Dupla TESTE',price:600,payment_type:'group',teacher_id:teacherId,frequency:'quinzenal',status:'active'} as any;
const groupClasses=[
 lesson('g-dec','2026-12-08',['s'],'g'),
 lesson('g-ghost','2026-12-21',['s'],'g'),
 lesson('g-jan1','2027-01-14',['s'],'g'),
 lesson('g-jan2','2027-01-28',['s'],'g'),
];
const groupFor=(monthStr:string)=>groupBill({group,teacher,classes:groupClasses as any,credits:[],monthStr,allGroups:[group]});
assert.equal(groupFor('2026-12').finalAmount,300);
assert.equal(groupFor('2026-12').vacationExcludedLessons,1);
assert.equal(groupFor('2027-01').finalAmount,600);
assert.equal(groupBill({group,teacher,classes:[],credits:[],monthStr:'2026-12',allGroups:[group]}).finalAmount,0);
const ctx={enrollments:[en],financialPlans:[plan],students:[{id:'s',name:'Aluno'}],teachers:[teacher],
 groups:[group],classes:lessons,credits:[],discountRules:[],competenceBillings:[],transactions:[],choirRegistrations:[]} as any;
const decResolved=resolveCompetenceBilling({category:'individual',sourceId:'e',competence:'2026-12',context:ctx});
assert.equal(decResolved.finalPrice,150);
assert.equal(decResolved.discount,150);
assert.equal(decResolved.isPaying,true);
const janResolved=resolveCompetenceBilling({category:'individual',sourceId:'e',competence:'2027-01',context:ctx});
assert.equal(janResolved.finalPrice,300);
const emptyCtx={...ctx,classes:[]};
assert.equal(resolveCompetenceBilling({category:'individual',sourceId:'e',competence:'2026-12',context:emptyCtx}).finalPrice,0);
assert.equal(resolveCompetenceBilling({category:'individual',sourceId:'e',competence:'2026-12',context:emptyCtx}).isPaying,false);
const decDue=calculateDueBillingValues({category:'individual',sourceId:'e',competence:'2026-12',context:ctx});
assert.equal(decDue?.final_price,150);
assert.equal(decDue?.discount,150);
const noClassDue=calculateDueBillingValues({category:'individual',sourceId:'e',competence:'2026-12',context:emptyCtx});
assert.equal(noClassDue?.status,'waived');
assert.equal(noClassDue?.is_paying,false);
assert.equal(noClassDue?.teacher_share,0);
assert.equal(noClassDue?.final_price,0);
const groupCtx={...ctx,classes:groupClasses};
assert.equal(calculateDueBillingValues({category:'group',sourceId:'g',competence:'2026-12',context:groupCtx})?.final_price,300);
assert.equal(calculateDueBillingValues({category:'group',sourceId:'g',competence:'2026-12',context:{...ctx,classes:[]}})?.status,'waived');
const frozen={id:'frozen',category:'individual',enrollment_id:'e',competence:'2026-12',status:'paid',is_frozen:true,transaction_id:'tx-old',base_price:300,discount:0,final_price:300,is_paying:true,metadata:{},teacher_share:150,school_share:150};
const paidResolved=resolveCompetenceBilling({category:'individual',sourceId:'e',competence:'2026-12',context:{...ctx,competenceBillings:[frozen]}});
assert.equal(paidResolved.finalPrice,300,'pagamento congelado nao deve ser reescrito');
assert.equal(paidResolved.source,'snapshot_frozen');
const payUi=readFileSync(new URL('../views/Payments.tsx',import.meta.url),'utf8');
assert.match(payUi,/if \(item\.totalAmount <= 0\) return false/);
assert.match(payUi,/if \(!isPaid && !resolved\.isFrozen && resolved\.finalPrice <= 0\)/);
assert.match(payUi,/isRaphaelVacationCompetence\(/);
assert.match(payUi,/contractualBasePrice-amountToPay/);
console.log('PASS ferias Raphael: Dez 09/12, Jan 11/01, zero fora da baixa, legados, grupos e historico imutavel');
