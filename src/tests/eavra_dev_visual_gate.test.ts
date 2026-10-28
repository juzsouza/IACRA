import assert from 'node:assert/strict';
import { IACRA_DEV_ONLY_REF, requireIacraDevProjectRef,
  requirePublishableBrowserKey } from '../lib/devPreviewSafety.ts';

assert.equal(requireIacraDevProjectRef(IACRA_DEV_ONLY_REF), IACRA_DEV_ONLY_REF);
assert.equal(requireIacraDevProjectRef(IACRA_DEV_ONLY_REF.toUpperCase()), IACRA_DEV_ONLY_REF);

for (const invalid of [
  undefined, '', 'ldumzwrwbhjtrnlioigg', 'eqohmavwrwzxnjnncwmm',
  'aaaaaaaaaaaaaaaaaaaa', 'xuyimfugcdkqovqelrfz.supabase.co',
]) assert.throws(() => requireIacraDevProjectRef(invalid));

const publicKey = 'sb_publishable_TESTONLY_PLACEHOLDER_NOT_VALID_CREDENTIAL';
assert.equal(requirePublishableBrowserKey(publicKey), publicKey);
for (const invalid of [
  undefined, '', 'eyJhbGciOiJIUzI1NiJ9.fake.fake',
  'sb_secret_TESTONLY_NOT_A_REAL_KEY', 'service_role', 'YOUR_SUPABASE_KEY',
  'sb_publishable_short', 'sb_publishable_&&&&&&&&&&&&',
]) assert.throws(() => requirePublishableBrowserKey(invalid));

console.log('PASS | IACRA-DEV visual: ref fixa e apenas chave publishable no navegador');
