import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}
const sql = read('../../docs/revisao-producao/CANDIDATO_permissoes_matricula_salas_20261111.sql');
const ui = read('../views/PermissionsManager.tsx');
const menu = read('../components/Layout.tsx');
const app = read('../App.tsx');
const digital = read('../views/DigitalEnrollmentAdmin.tsx');
const rooms = read('../views/RoomsAdmin.tsx');

for(const key of [
 'digital_enrollment.view','digital_enrollment.create','digital_enrollment.approve',
 'rooms.view','rooms.assign','rooms.unassign',
]) {
  assert.ok(sql.includes(key), 'catalog and RPC missing '+key);
}
assert.match(sql,/REVOKE ALL ON FUNCTION app_private\.eavra_actor_has_feature_permission/);
assert.match(sql,/app_private\.eavra_admin_allowlist/);
assert.match(sql,/eavra_user_permission_overrides/);
assert.match(sql,/v_scope='all'/);
assert.match(ui,/digital_enrollment: 'Matrícula Digital'/);
assert.match(ui,/rooms: 'Salas'/);
assert.match(menu,/featurePermissions\.digital_enrollment\.view/);
assert.match(menu,/featurePermissions\.rooms\.view/);
assert.match(app,/featurePermissions\.digital_enrollment\.view/);
assert.match(app,/featurePermissions\.rooms\.view/);
assert.match(digital,/access\.digital_enrollment\.approve/);
assert.match(digital,/access\.digital_enrollment\.create/);
assert.match(rooms,/permissions\.rooms\.assign/);
assert.match(rooms,/permissions\.rooms\.unassign/);
console.log('PASS: module permissions are checked in UI and database, with default denial');
