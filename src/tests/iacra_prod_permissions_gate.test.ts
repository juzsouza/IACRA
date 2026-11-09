import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkPermissionDevEnvironment} from '../utils/permissionAdminConfig.ts';
const url='https://ldumzwrwbhjtrnlioigg.supabase.co';
const config={enabled:'true',supabaseUrl:url,approvedDevProjectRef:'ldumzwrwbhjtrnlioigg',buildTarget:'production'};
assert.equal(checkPermissionDevEnvironment(config).ok,true);
for(const variant of [
 {...config,enabled:'false'},
 {...config,buildTarget:'staging'},
 {...config,supabaseUrl:'https://xuyimfugcdkqovqelrfz.supabase.co'},
 {...config,approvedDevProjectRef:'xuyimfugcdkqovqelrfz'},
 {...config,approvedDevProjectRef:undefined}
])assert.equal(checkPermissionDevEnvironment(variant).ok,false);
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
assert.match(read('../components/Layout.tsx'),/Gerenciamento de Permissões/);
assert.match(read('../utils/navigation.ts'),/permissions_manager: \["super_admin"\]/);
assert.match(read('../App.tsx'),/case "permissions_manager"/);
assert.match(read('../App.tsx'),/currentUserProfile\?\.role === "super_admin"/);
assert.match(read('../../Dockerfile'),/VITE_IACRA_FEATURES_ENABLED=false/);
assert.match(read('../../Dockerfile'),/VITE_IACRA_BUILD_TARGET=production/);
assert.match(read('../utils/permissionAdminController.ts'),/checkPermissionDevEnvironment/);
console.log('PASS: Gerenciamento de Permissões isolado no PROD, desativado e visível apenas ao Super Admin.');
