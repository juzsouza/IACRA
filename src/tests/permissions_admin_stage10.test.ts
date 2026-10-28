import assert from 'node:assert/strict';
import { checkPermissionDevEnvironment, ORIGINAL_IACRA_PROJECT_REF } from '../utils/permissionAdminConfig.ts';
import { parseSnapshot, validateMutation, type PermissionSnapshot } from '../utils/permissionAdminRules.ts';
import { createPermissionsAdminController } from '../utils/permissionAdminController.ts';

const dev = 'abcdefghijklmnopqrst';
const okay = { enabled: 'true', approvedDevProjectRef: dev, supabaseUrl: `https://${dev}.supabase.co` };
assert.equal(checkPermissionDevEnvironment(okay).ok, true);
for (const env of [
  { ...okay, enabled: 'false' },
  { ...okay, approvedDevProjectRef: ORIGINAL_IACRA_PROJECT_REF },
  { ...okay, approvedDevProjectRef: '' },
  { ...okay, supabaseUrl: `https://${ORIGINAL_IACRA_PROJECT_REF}.supabase.co` },
  { ...okay, supabaseUrl: 'https://evil.example.net' },
  { ...okay, supabaseUrl: `http://${dev}.supabase.co` },
  { ...okay, supabaseUrl: `https://${dev}.supabase.co.evil.org` },
  { ...okay, supabaseUrl: `https://${dev}.supabase.co/rest/v1` },
]) assert.equal(checkPermissionDevEnvironment(env).ok, false);

const snapshot: PermissionSnapshot = {
  catalog: [
    { key: 'coral.manage_collaborators', module: 'coral', action: 'manage_collaborators', reserved: false, admin_only: true },
    { key: 'classes.view', module: 'classes', action: 'view', reserved: false, admin_only: false },
    { key: 'permissions.manage', module: 'permissions', action: 'manage', reserved: true, admin_only: true },
  ], role_rules: [], user_rules: [],
};
assert.deepEqual(parseSnapshot(snapshot), snapshot);
for (const broken of [null, undefined, [], {}, { catalog: [], role_rules: {}, user_rules: [] }]) {
  assert.throws(() => parseSnapshot(broken));
}
const base = { subjectType: 'role' as const, target: 'admin', permissionKey: 'coral.manage_collaborators', decision: 'allow' as const, scope: 'all' as const };
assert.doesNotThrow(() => validateMutation(base, snapshot));
assert.doesNotThrow(() => validateMutation({ ...base, decision: 'deny', scope: 'none' }, snapshot));
assert.doesNotThrow(() => validateMutation({ ...base, decision: 'inherit', scope: 'none' }, snapshot));
assert.doesNotThrow(() => validateMutation({ ...base, target: 'teacher', permissionKey: 'classes.view', scope: 'own' }, snapshot));
for (const input of [
  { ...base, target: 'super_admin' },
  { ...base, permissionKey: 'permissions.manage' },
  { ...base, permissionKey: 'unknown.foo' },
  { ...base, target: 'teacher' },
  { ...base, target: 'teacher', permissionKey: 'classes.view' },
  { ...base, decision: 'deny' as const },
  { ...base, decision: 'inherit' as const },
  { ...base, scope: 'none' as const },
]) assert.throws(() => validateMutation(input, snapshot));
assert.throws(() => validateMutation({ ...base, subjectType: 'user', target: '' }, snapshot, 'admin'));
assert.throws(() => validateMutation({ ...base, subjectType: 'user', target: 'uuid', scope: 'all' }, snapshot));
assert.doesNotThrow(() => validateMutation({ ...base, subjectType: 'user', target: 'uuid', scope: 'all' }, snapshot, 'admin'));
console.log('PASS | Etapa 10: gate DEV, catálogo e validações de regras');

let calls: string[] = [];
let identity: {id:string}|null = {id: 'fake-auth'};
let profile: {id:string;role:string;access_status:string}|null = {id:'fake-auth',role:'super_admin',access_status:'active'};
let failure: unknown = null;
const controller = createPermissionsAdminController({
  async currentAuthUser() { calls.push('auth'); return identity; },
  async profileByAuthId(id) { calls.push('profile:' + id); return profile; },
  async rpc(name) { calls.push('rpc:' + name); return { data: name.includes('snapshot') ? snapshot : {changed:true}, error: failure }; },
}, () => okay);
assert.deepEqual(await controller.load(), snapshot);
assert.deepEqual(calls, ['auth','profile:fake-auth','rpc:eavra_admin_permissions_snapshot']);
calls = [];
await controller.save(base, snapshot);
assert.deepEqual(calls, ['auth','profile:fake-auth','rpc:eavra_admin_save_permission']);
for(const bad of [null, {id:'different',role:'super_admin',access_status:'active'}, {id:'fake-auth',role:'admin',access_status:'active'}, {id:'fake-auth',role:'super_admin',access_status:'blocked'}]){
  profile = bad; calls=[];
  await assert.rejects(controller.load());
  assert.equal(calls.some(c=>c.startsWith('rpc:')),false);
}
profile = {id:'fake-auth',role:'super_admin',access_status:'active'};
identity=null;calls=[];await assert.rejects(controller.load());
assert.equal(calls.some(c=>c.startsWith('rpc:')),false);
identity={id:'fake-auth'};failure={message:'simulated'};calls=[];
await assert.rejects(controller.save(base, snapshot));
console.log('PASS | Etapa 10: autorização no cliente falha fechada e RPC mockada');
