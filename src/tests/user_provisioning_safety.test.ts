import assert from 'node:assert/strict';
import { reviewProvisioningIdentity } from '../server/userProvisioningSafety.ts';

const tests: Array<[string, ReturnType<typeof reviewProvisioningIdentity>, string | null, string, Array<{id:string;email:string|null}>]> = [
  ['novo usuário sem perfil', 'create_new', null, 'nova@exemplo.test', []],
  ['conta e perfil já vinculados', 'already_linked', 'id-1', 'user@exemplo.test', [{id:'id-1',email:'USER@EXEMPLO.TEST'}]],
  ['conta Auth sem perfil', 'manual_review', 'id-2', 'user@exemplo.test', []],
  ['perfil sem Auth', 'manual_review', null, 'user@exemplo.test', [{id:'id-1',email:'user@exemplo.test'}]],
  ['IDs divergentes mesmo e-mail', 'manual_review', 'id-2', 'user@exemplo.test', [{id:'id-1',email:'user@exemplo.test'}]],
  ['perfis duplicados', 'manual_review', 'id-1', 'user@exemplo.test', [{id:'id-1',email:'user@exemplo.test'},{id:'id-2',email:'user@exemplo.test'}]],
  ['perfil com outro e-mail', 'manual_review', 'id-1', 'user@exemplo.test', [{id:'id-1',email:'outro@exemplo.test'}]],
  ['e-mail vazio', 'manual_review', null, '', []],
];
for (const [name, expected, authId, email, profiles] of tests) {
  assert.equal(reviewProvisioningIdentity(authId, email, profiles), expected, name);
}
console.log(`PASS: ${tests.length} casos de provisionamento seguro`);
