import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
 automaticRoomActivity, filteredRoomClasses, filteredRoomReservations,
} from '../utils/roomAdjustments';

assert.equal(automaticRoomActivity(true, 'PREPARAÇÃO VOCAL', ''), 'PREPARAÇÃO VOCAL');
assert.equal(automaticRoomActivity(true, '', ''), 'Atendimento Raphael');
assert.equal(automaticRoomActivity(false, 'PREPARAÇÃO VOCAL', ' Teclado '), 'Teclado');

const classes=[{id:'1',teacher_id:'raphael'},{id:'2',teacher_id:'other'}];
assert.deepEqual(filteredRoomClasses(classes,''),classes);
assert.deepEqual(filteredRoomClasses(classes,'raphael').map(x=>x.id),['1']);
assert.deepEqual(filteredRoomClasses(classes,'unknown'),[]);
const assignments=[{class_id:'1',room_slug:'kairos'},{class_id:'2',room_slug:'boaz'}];
const teacherMap=new Map([['1','raphael'],['2','other']]);
assert.deepEqual(filteredRoomReservations(assignments,'','',teacherMap),assignments);
assert.deepEqual(filteredRoomReservations(assignments,'raphael','kairos',teacherMap).map(x=>x.class_id),['1']);
assert.deepEqual(filteredRoomReservations(assignments,'other','kairos',teacherMap),[]);
const ui=readFileSync(new URL('../views/RoomsAdmin.tsx',import.meta.url),'utf8');
assert.match(ui,/p_class_id:targetClassId/);
assert.match(ui,/permissions\.rooms\.unassign/);
assert.match(ui,/Excluir somente a reserva/);
assert.match(ui,/Filtrar por professor/);
assert.match(ui,/Filtrar por sala/);
assert.match(ui,/Atividade automática do Raphael/);
const sql=readFileSync(new URL('../../docs/revisao-producao/CANDIDATO_unificar_boaz_joaquim_20261111.sql',import.meta.url),'utf8');
assert.match(sql,/UPDATE app_private\.eavra_dev_class_rooms/);
assert.match(sql,/room_slug = 'boaz'/);
assert.match(sql,/name = 'Sala Boaz Joaquim'/);
assert.match(sql,/active = false/);
assert.doesNotMatch(sql,/delete\s+from\s+(public\.classes|app_private\.eavra_dev_rooms)/i);
console.log('PASS: filters, Raphael activity, safe individual reservation removal, and room merge');
