import assert from 'node:assert/strict';
import {
  calculateRaphaelRealStudentBilling,
  validateCreditConsumptionEntity,
  isAllocatedGroupMemberCredit,
} from '../utils/raphaelRealBilling';
import { RAPHAEL_TEACHER_ID } from '../utils/raphaelBillingSimulation';

// Dados sintéticos: este teste não lê nem modifica o banco oficial.
const groupId='grupo-teste-inj';
const enrollment = {
  id:'matricula-teste-A', student_id:'aluno-A', group_id:groupId,
  teacher_id:RAPHAEL_TEACHER_ID, custom_price:100,
  start_date:'2026-07-01', status:'active'
} as any;
const plan={id:'plano-teste',modality:'quinzenal',base_price:100,name:'Canto em grupo'} as any;
const credit={
  id:'credito-outubro-aluno-A',teacher_id:RAPHAEL_TEACHER_ID,
  group_id:groupId, enrollment_id:enrollment.id,student_id:enrollment.student_id,
  source_class_id:'',amount:50,status:'available',competency_month:'2026-10',
  notes:'Aula cancelada do INJ em outubro'
} as const;

assert.equal(isAllocatedGroupMemberCredit(credit as any,enrollment),true);
assert.equal(validateCreditConsumptionEntity(credit as any,{
  type:'individual',enrollmentId:enrollment.id,studentId:enrollment.student_id,groupId
}).allowed,true);
assert.equal(validateCreditConsumptionEntity(credit as any,{
  type:'individual',enrollmentId:enrollment.id,studentId:'aluno-B',groupId
}).allowed,false);
assert.equal(validateCreditConsumptionEntity(credit as any,{
  type:'individual',enrollmentId:'outra-matricula',studentId:enrollment.student_id,groupId
}).allowed,false);
assert.equal(validateCreditConsumptionEntity(credit as any,{
  type:'individual',enrollmentId:enrollment.id,studentId:enrollment.student_id,groupId:'outra-turma'
}).allowed,false);
assert.equal(validateCreditConsumptionEntity(credit as any,{
  type:'group',groupId
}).allowed,false);

function calculate(status:'available'|'used') {
  return calculateRaphaelRealStudentBilling({
    enrollment,plan,
    teacher:{id:RAPHAEL_TEACHER_ID,name:'Raphael'} as any,
    classes:[],monthStr:'2026-11',
    credits:[{...credit,status}] as any,applyCredits:true,
    allGroups:[],requireExplicitStudentId:true,
  });
}
const nov=calculate('available');
assert.equal(nov.grossAmount,100);
assert.equal(nov.creditDiscountAmount,50);
assert.equal(nov.finalAmount,50);
assert.deepEqual(nov.creditsConsumedList.map(x=>x.id),[credit.id]);

const consumed=calculate('used');
assert.equal(consumed.creditDiscountAmount,0);
assert.equal(consumed.finalAmount,100);

const otherEnrollment={...enrollment,id:'matricula-teste-B',student_id:'aluno-B'};
const other=calculateRaphaelRealStudentBilling({
 enrollment:otherEnrollment,plan,
 teacher:{id:RAPHAEL_TEACHER_ID,name:'Raphael'} as any,
 classes:[],monthStr:'2026-11',
 credits:[{...credit}] as any,applyCredits:true,allGroups:[]
});
assert.equal(other.finalAmount,100);
console.log('Crédito de grupo individualizado: 11 verificações aprovadas.');
