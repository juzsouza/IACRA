import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TERM_MODELS, demoTermBody, nextDemoStage } from '../utils/enrollmentTermsDemo.ts';

assert.equal(TERM_MODELS.length, 4);
assert.equal(new Set(TERM_MODELS.map(m => m.id)).size, 4);
for (const model of TERM_MODELS) {
  assert.match(demoTermBody(model.id), /SEM VALIDADE CONTRATUAL/);
}
assert.equal(nextDemoStage('draft', 'issue'), 'issued');
assert.equal(nextDemoStage('issued', 'accept'), 'accepted');
assert.equal(nextDemoStage('accepted', 'review'), 'reviewed');
assert.throws(() => nextDemoStage('draft', 'accept'));
assert.throws(() => nextDemoStage('issued', 'review'));
assert.throws(() => nextDemoStage('reviewed', 'issue'));
const view = readFileSync(new URL('../views/EnrollmentTermsPreview.tsx', import.meta.url), 'utf8');
assert.match(view, /checkPermissionDevEnvironment/);
assert.match(view, /super_admin/);
assert.doesNotMatch(view, /fetch\(|supabase\.|localStorage|sessionStorage|axios|\.rpc\(/);
console.log('PASS | 4 modelos, estados válidos, gate DEV e simulação sem rede/persistência');
