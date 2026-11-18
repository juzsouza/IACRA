import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkIacraFeatureEnvironment} from '../lib/iacraFeatureGate';
const read=(name:string)=>readFileSync(new URL(name,import.meta.url),'utf8');
const docker=read('../../Dockerfile');
const app=read('../App.tsx');
const layout=read('../components/Layout.tsx');
const permissions=read('../views/PermissionsManager.tsx');
assert.match(docker,/ARG VITE_IACRA_FEATURES_ENABLED=true/);
assert.match(docker,/ENV VITE_IACRA_PRODUCTION_PROJECT_REF=ldumzwrwbhjtrnlioigg/);
assert.match(docker,/ENV VITE_IACRA_BUILD_TARGET=production/);
assert.equal(checkIacraFeatureEnvironment({enabled:'true',approvedProjectRef:'ldumzwrwbhjtrnlioigg',supabaseUrl:'https://ldumzwrwbhjtrnlioigg.supabase.co'}),true);
assert.equal(checkIacraFeatureEnvironment({enabled:'false',approvedProjectRef:'ldumzwrwbhjtrnlioigg',supabaseUrl:'https://ldumzwrwbhjtrnlioigg.supabase.co'}),false);
assert.equal(checkIacraFeatureEnvironment({enabled:'true',approvedProjectRef:'outro',supabaseUrl:'https://ldumzwrwbhjtrnlioigg.supabase.co'}),false);
for(const key of ['digital_enrollment','enrollment_tracking','rooms_admin','permissions_manager']){
  assert.ok(app.includes('case "'+key+'"'), 'Módulo sem rota: '+key);
  assert.ok(layout.includes('id: "'+key+'"'), 'Módulo ausente do menu: '+key);
}
assert.match(permissions,/enrollment_tracking: 'Acompanhamento de Termos'/);
assert.match(read('../views/Dashboard.tsx'),/Aulas futuras agendadas/);
assert.match(read('../views/Payments.tsx'),/competence|competencia|Competência|competência/i);
assert.match(read('../views/Enrollments.tsx'),/filterActiveTeacherOptions/);
console.log('Release preserva modulos e filtra aulas, professores e mensalidades.');
