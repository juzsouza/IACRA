import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateEnrollmentStudent, type EnrollmentStudentFields } from '../utils/enrollmentStudentValidation.ts';
const valid:EnrollmentStudentFields={
 name:'Aluno Fictício',email:'teste@example.org',phone:'11999998888',cpf:'12345678901',
 birth_date:'2000-05-20',instrument:'Violão',guardian_name:'',guardian_email:'',
 guardian_phone:'',guardian_relationship:'',guardian_cpf:'',
};
assert.equal(validateEnrollmentStudent(valid,false),null);
assert.equal(validateEnrollmentStudent({...valid,name:'A'},false)?.field,'name');
assert.equal(validateEnrollmentStudent({...valid,email:'x'},false)?.field,'email');
assert.equal(validateEnrollmentStudent({...valid,phone:'123'},false)?.field,'phone');
assert.equal(validateEnrollmentStudent({...valid,cpf:'123'},false)?.field,'cpf');
assert.equal(validateEnrollmentStudent({...valid,birth_date:'2025-02-31'},false)?.field,'birth_date');
assert.equal(validateEnrollmentStudent({...valid,instrument:'X'},false)?.field,'instrument');
assert.equal(validateEnrollmentStudent({...valid,birth_date:'2012-02-04'},true)?.field,'guardian_name');
assert.equal(validateEnrollmentStudent({...valid,guardian_name:'Responsável Fictício',guardian_relationship:'Mãe',guardian_email:'responsavel@example.org',guardian_phone:'11988887777'},true),null);
assert.equal(validateEnrollmentStudent({...valid,guardian_cpf:'123'},false)?.field,'guardian_cpf');
const form=readFileSync(new URL('../views/PublicEnrollment.tsx',import.meta.url),'utf8');
assert.ok(form.includes('noValidate onSubmit={submit}'));
assert.ok(form.includes('validateEnrollmentStudent(student,isMinor)'));
assert.ok(form.includes('role="alert" aria-live="assertive"'));
assert.ok(form.includes('type="submit" disabled={busy}'));
assert.ok(form.includes('window.scrollTo({top:0'));
assert.ok(form.includes("new Intl.DateTimeFormat('sv-SE'"));
for(const field of Object.keys(valid)) assert.ok(form.includes('data-field="'+field+'"'), 'Campo sem localização: '+field);
console.log('PASS: envio da matrícula, validação local, foco e mensagens na tela.');
