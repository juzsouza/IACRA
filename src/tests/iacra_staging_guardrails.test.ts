import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkIacraFeatureEnvironment} from '../lib/iacraFeatureGate.ts';

const file=(p:string)=>readFileSync(new URL(p,import.meta.url),'utf8');
const prod='ldumzwrwbhjtrnlioigg';
const dev='xuyimfugcdkqovqelrfz';
const url=(ref:string)=>'https://'+ref+'.supabase.co';
const config={enabled:'true',buildTarget:'staging',supabaseUrl:url(dev),approvedProjectRef:dev};
assert.equal(checkIacraFeatureEnvironment(config),true);
assert.equal(checkIacraFeatureEnvironment({...config,supabaseUrl:url(prod)}),false);
assert.equal(checkIacraFeatureEnvironment({...config,approvedProjectRef:prod}),false);
assert.equal(checkIacraFeatureEnvironment({...config,buildTarget:'production'}),false);
assert.equal(checkIacraFeatureEnvironment({...config,buildTarget:'production',supabaseUrl:url(prod),approvedProjectRef:prod}),true);
assert.equal(checkIacraFeatureEnvironment({...config,buildTarget:undefined}),false);
assert.equal(checkIacraFeatureEnvironment({...config,enabled:'false'}),false);

const client=file('../lib/supabase.ts');
assert.equal(client.includes("|| 'https://ldumzwrwbhjtrnlioigg"),false);
assert.equal(client.includes('eyJhbGciOiJIUzI1Ni'),false);
assert.equal(client.includes('Conexão bloqueada'),true);
const cfg=file('../../vite.config.ts');
assert.equal(cfg.includes('process.env.SUPABASE_KEY'),false);
assert.equal(cfg.includes('process.env.GEMINI_API_KEY'),false);
const docker=file('../../Dockerfile');
assert.equal(docker.includes('IACRA_BUILD_TARGET=staging'),true);
assert.equal(docker.includes('VITE_IACRA_FEATURES_ENABLED=true'),true);
assert.equal(docker.includes('https://xuyimfugcdkqovqelrfz.supabase.co'),true);

for (const p of ['../server/googleCalendarService.ts','../server/googleCalendarRoutes.ts','../server/adminRoutes.ts']) {
  const server=file(p);
  assert.equal(server.includes("IACRA_BUILD_TARGET === 'staging'"),true);
  assert.equal(server.includes("|| 'https://ldumzwrwbhjtrnlioigg"),false);
  assert.equal(server.includes('eyJhbGciOiJIUzI1Ni'),false);
}
console.log('PASS: staging isolado ao DEV, sem URLs ou chaves de fallback da produção.');
