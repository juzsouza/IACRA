import assert from 'node:assert/strict';
import { isActiveAdminCaller } from '../server/adminAuthorization.ts';

const uid = 'uuid-teste-001';
const activeSuper = { id: uid, role: 'super_admin', access_status: 'active' };
const activeAdmin = { id: uid, role: 'admin', access_status: 'active' };
const cases: Array<[string, boolean]> = [
  ['Super Admin ativo', isActiveAdminCaller(activeSuper, uid, ['super_admin'])],
  ['Admin ativo para módulo administrativo', isActiveAdminCaller(activeAdmin, uid, ['super_admin', 'admin'])],
  ['Admin não tem privilégio Super Admin', !isActiveAdminCaller(activeAdmin, uid, ['super_admin'])],
  ['Super Admin bloqueado', !isActiveAdminCaller({ ...activeSuper, access_status: 'blocked' }, uid, ['super_admin'])],
  ['Super Admin sem status', !isActiveAdminCaller({ id: uid, role: 'super_admin' }, uid, ['super_admin'])],
  ['Super Admin com ID divergente', !isActiveAdminCaller({ ...activeSuper, id: 'outro' }, uid, ['super_admin'])],
  ['Perfil ausente', !isActiveAdminCaller(null, uid, ['super_admin'])],
  ['Conta sem ID', !isActiveAdminCaller(activeSuper, '', ['super_admin'])],
  ['Professor não é Admin', !isActiveAdminCaller({ id: uid, role: 'teacher', access_status: 'active' }, uid, ['super_admin','admin'])],
  ['Status indefinido não autoriza', !isActiveAdminCaller({ id: uid, role: 'admin', access_status: 'pending' }, uid, ['super_admin','admin'])],
];
for (const [label, passed] of cases) {
  assert.equal(passed, true, `Falha: ${label}`);
  console.log(`PASS: ${label}`);
}
console.log(`PASS: ${cases.length} cenários de autorização administrativa.`);
