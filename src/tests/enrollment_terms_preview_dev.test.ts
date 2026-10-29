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
assert.doesNotMatch(view, /fetch\\(|supabase\\.|sessionStorage|axios|\\.rpc\\(/);
const draftUtil = readFileSync(new URL('../utils/enrollmentTermsDraft.ts', import.meta.url), 'utf8');
assert.match(draftUtil, /iacra_dev_only_enrollment_terms_draft_v1_/);
assert.match(view, /Salvar rascunho no navegador/);
assert.match(view, /Carregar rascunho/);
assert.match(view, /Restaurar texto original/);
assert.match(view, /validateTermDraft/);
console.log('PASS | 4 modelos, estados válidos, gate DEV e simulação sem rede/persistência');

const boldSource = readFileSync(new URL('../utils/termBoldMarkup.ts', import.meta.url), 'utf8');
assert.match(boldSource, /splitBoldSegments/);
assert.match(boldSource, /toggleBoldSelection/);
assert.doesNotMatch(view, /dangerouslySetInnerHTML/);
assert.match(view, /Aplicar negrito ao texto selecionado/);
console.log('PASS | editor de negrito na prévia, sem renderização HTML insegura');
