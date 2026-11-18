import assert from 'node:assert/strict';
import { getSchoolClock, isFutureScheduledClass } from '../utils/dashboardUpcomingClasses';

const reference = new Date('2026-11-16T17:30:00.000Z'); // 14h30, Brasilia
const clock = getSchoolClock(reference);
assert.deepEqual(clock, { date: '2026-11-16', time: '14:30' });

const make = (date: string, time: string, status = 'scheduled') =>
  ({ date, start_time: time, status });

assert.equal(isFutureScheduledClass(make('2026-11-15', '19:00'), clock), false, 'Ontem deve ficar fora');
assert.equal(isFutureScheduledClass(make('2026-11-16', '14:29'), clock), false, 'Aula que ja iniciou fica fora');
assert.equal(isFutureScheduledClass(make('2026-11-16', '14:30'), clock), true, 'Aula no horario exato entra');
assert.equal(isFutureScheduledClass(make('2026-11-16', '15:00:00'), clock), true, 'Aula mais tarde entra');
assert.equal(isFutureScheduledClass(make('2026-11-17', '08:00'), clock), true, 'Aula de amanha entra');
assert.equal(isFutureScheduledClass(make('2026-11-17', '08:00', 'completed'), clock), false, 'Concluida fica fora');
assert.equal(isFutureScheduledClass(make('2026-11-17', '08:00', 'cancelled'), clock), false, 'Cancelada fica fora');
assert.equal(isFutureScheduledClass(make('2026-11-17', ''), clock), false, 'Sem horario nao entra');
assert.equal(getSchoolClock(new Date('2026-11-17T01:05:00.000Z')).date, '2026-11-16', 'Fuso Sao Paulo');
console.log('Dashboard: aulas futuras e horario local verificados.');
