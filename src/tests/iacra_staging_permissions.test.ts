import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkPermissionDevEnvironment, DEV_IACRA_PROJECT_REF, DEV_IACRA_URL} from '../utils/permissionAdminConfig.ts';
const test = (overrides:Record<string,string|undefined>={}) => ({
 enabled:'true',buildTarget:'staging',approvedDevProjectRef:DEV_IACRA_PROJECT_REF,
 supabaseUrl:DEV_IACRA_URL,...overrides
});
assert.deepEqual(checkPermissionDevEnvironment(test()),{ok:true,reason:'Ambiente DEV verificado.'});
for(const cfg of [
  test({enabled:'false'}),
  test({buildTarget:'production'}),
  test({approvedDevProjectRef:'ldumzwrwbhjtrnlioigg'}),
  test({supabaseUrl:'https://ldumzwrwbhjtrnlioigg.supabase.co'}),
  test({approvedDevProjectRef:undefined}),
  test({supabaseUrl:undefined})
]) assert.equal(checkPermissionDevEnvironment(cfg).ok,false);
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
const nav=read('../utils/navigation.ts');
const layout=read('../components/Layout.tsx');
const app=read('../App.tsx');
const docker=read('../../Dockerfile');
assert.equal(nav.includes('permissions_manager: ["super_admin"]'),true);
assert.equal(layout.includes('Gerenciamento de Permissões'),true);
assert.equal(app.includes('<PermissionsManager />'),true);
assert.equal(docker.includes('VITE_EAVRA_PERMISSION_ADMIN_ENABLED=true'),true);
assert.equal(docker.includes('VITE_EAVRA_DEV_PROJECT_REF=xuyimfugcdkqovqelrfz'),true);
console.log('PASS: gerenciamento de permissões só na homologação DEV com role Super Admin.');
