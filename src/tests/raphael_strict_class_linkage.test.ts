import assert from 'node:assert/strict';
import {
  getClassesForEnrollment,
  calculateRaphaelRealStudentBilling,
} from '../utils/raphaelRealBilling';
import { RAPHAEL_TEACHER_ID } from '../utils/raphaelBillingSimulation';

const enrollment = {
  id: 'matricula-ana',
  student_id: 'aluna-ana',
  teacher_id: RAPHAEL_TEACHER_ID,
  status: 'active',
  enrollment_date: '2026-11-10',
  start_date: '2026-11-10',
  group_id: null,
  custom_price: 300,
};
const plan = {
  id: 'plano-quinzenal',
  modality: 'quinzenal',
  base_price: 300,
  exclusive_teacher_id: RAPHAEL_TEACHER_ID,
};
const classes = [
  { id: 'aula-antes-matricula', date: '2026-11-09', title: 'Preparação vocal', teacher_id: RAPHAEL_TEACHER_ID, student_ids: ['aluna-ana'], status: 'completed' },
  { id: 'aula-ana-concluida', date: '2026-11-10', title: 'Preparação vocal', teacher_id: RAPHAEL_TEACHER_ID, student_ids: ['aluna-ana'], status: 'completed' },
  { id: 'aula-ana-agendada', date: '2026-11-24', title: 'Preparação vocal', teacher_id: RAPHAEL_TEACHER_ID, student_ids: ['aluna-ana'], status: 'scheduled' },
  { id: 'aula-de-outro-aluno', date: '2026-11-20', title: 'Preparação vocal', teacher_id: RAPHAEL_TEACHER_ID, student_ids: ['outro-aluno'], status: 'scheduled' },
  { id: 'aula-sem-aluno-1', date: '2026-11-20', title: 'Preparação vocal', teacher_id: RAPHAEL_TEACHER_ID, student_ids: [], status: 'scheduled' },
  { id: 'aula-sem-aluno-2', date: '2026-11-23', title: 'Preparação vocal', teacher_id: RAPHAEL_TEACHER_ID, status: 'scheduled' },
  { id: 'aula-grupo', date: '2026-11-25', title: 'Coral', teacher_id: RAPHAEL_TEACHER_ID, student_ids: ['aluna-ana'], group_id: 'outro-grupo', status: 'scheduled' },
];
const verified = getClassesForEnrollment(
  enrollment as any, classes as any, [], plan as any, { requireExplicitStudentId: true },
);
assert.deepEqual(verified.map(c => c.id).sort(), ['aula-ana-agendada', 'aula-ana-concluida']);
const bill = calculateRaphaelRealStudentBilling({
  enrollment: enrollment as any,
  plan: plan as any,
  classes: classes as any,
  credits: [],
  monthStr: '2026-11',
  allGroups: [],
  requireExplicitStudentId: true,
});
assert.equal(bill.regularLessons, 2);
assert.equal(bill.extraLessons, 0);
assert.equal(bill.finalAmount, 300);
console.log('OK: Nov/26 duas aulas vinculadas, sem aulas alheias, mensalidade R$ 300,00');
