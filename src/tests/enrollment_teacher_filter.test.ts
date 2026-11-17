import assert from 'node:assert/strict';
import { matchesEnrollmentTeacher, normalizeTeacherName, resolveEnrollmentTeacherId } from '../utils/enrollmentTeacherFilter';

const teachers = [
  {id:'t1',name:'Raphael Augusto'},
  {id:'t2',name:'João de Deus'},
  {id:'t3',name:'Raphael Augusto'},
];
const groups = [
  {id:'g1',teacher_id:'t1'},
  {id:'g2',teacher_id:'t2'},
];
const direct = {teacher_id:'t2',group_id:'g1'};
const fromGroup = {teacher_id:'',group_id:'g1'};
const alone = {teacher_id:'t1',group_id:null};
const missing = {teacher_id:'',group_id:null};

assert.equal(resolveEnrollmentTeacherId(direct,groups),'t2', 'professor da matrícula tem prioridade');
assert.equal(resolveEnrollmentTeacherId(fromGroup,groups),'t1', 'grupo serve de fallback');
assert.equal(resolveEnrollmentTeacherId(missing,groups),null);
assert.equal(matchesEnrollmentTeacher(direct,groups,teachers,'',''),true, 'sem filtro mostra todos');
assert.equal(matchesEnrollmentTeacher(direct,groups,teachers,'t2',''),true);
assert.equal(matchesEnrollmentTeacher(direct,groups,teachers,'t1',''),false);
assert.equal(matchesEnrollmentTeacher(fromGroup,groups,teachers,'t1',''),true);
assert.equal(matchesEnrollmentTeacher(fromGroup,groups,teachers,'t2',''),false);
assert.equal(matchesEnrollmentTeacher(alone,groups,teachers,'','Rapha'),true);
assert.equal(matchesEnrollmentTeacher(direct,groups,teachers,'','joao'),true,'ignora acentos');
assert.equal(matchesEnrollmentTeacher(missing,groups,teachers,'','Raphael'),false);
assert.equal(matchesEnrollmentTeacher(alone,groups,teachers,'t3',''),false,'IDs prevalecem sobre nomes iguais');
assert.equal(normalizeTeacherName('  JOÃO '),'joao');
assert.equal(matchesEnrollmentTeacher(fromGroup,groups,teachers,'','  '),true);
console.log('Filtro de professor nas matrículas: 14 verificações aprovadas.');
