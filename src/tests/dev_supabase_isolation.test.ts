import assert from 'node:assert/strict';
import test from 'node:test';
import { validateDevSupabaseUrl } from '../shared/approvedDevSupabase.ts';
import { getServerDevSupabaseConfig } from '../server/devSupabaseConfig.ts';

const devRef = 'eqohmavwrwzxnjnncwmm'; // Reference observed in the DEV login Network tab; verify ownership before use.
const devUrl = `https://${devRef}.supabase.co`;
const originalRef = 'ldumzwrwbhjtrnlioigg';
const validEnv = {
  VITE_SUPABASE_URL: devUrl,
  SUPABASE_URL: devUrl,
  VITE_EAVRA_DEV_PROJECT_REF: devRef,
  VITE_SUPABASE_ANON_KEY: 'test-public-key-not-real',
};

test('DEV URL explicitamente autorizada', () => {
  assert.equal(validateDevSupabaseUrl(devUrl, devRef), devUrl);
});
test('bloqueia a URL original do IACRA', () => {
  assert.throws(() => validateDevSupabaseUrl(`https://${originalRef}.supabase.co`, originalRef));
  assert.throws(() => validateDevSupabaseUrl(`https://${originalRef}.supabase.co`, devRef));
});
test('recusa projeto diferente do autorizado', () => {
  assert.throws(() => validateDevSupabaseUrl('https/invalid', devRef));
  assert.throws(() => validateDevSupabaseUrl('https://aaaaaaaaaaaaaaaaaaaa.supabase.co', devRef));
});
test('recusa URL com hostname forjado', () => {
  assert.throws(() => validateDevSupabaseUrl(`${devUrl}.evil.com`, devRef));
  assert.throws(() => validateDevSupabaseUrl('http://'+devRef+'.supabase.co', devRef));
  assert.throws(() => validateDevSupabaseUrl(devUrl+'/auth/v1', devRef));
  assert.throws(() => validateDevSupabaseUrl(devUrl+'?key=x', devRef));
  assert.throws(() => validateDevSupabaseUrl(devUrl+'#fragment', devRef));
  assert.throws(() => validateDevSupabaseUrl('https://user:pass@'+devRef+'.supabase.co', devRef));
});
test('recusa configuração ausente', () => {
  assert.throws(() => validateDevSupabaseUrl('', devRef));
  assert.throws(() => validateDevSupabaseUrl(devUrl, ''));
});
test('servidor exige alinhamento DEV frontend/backend', () => {
  assert.equal(getServerDevSupabaseConfig(validEnv).url, devUrl);
  assert.throws(() => getServerDevSupabaseConfig({ ...validEnv, SUPABASE_URL: undefined }));
  assert.throws(() => getServerDevSupabaseConfig({ ...validEnv, SUPABASE_URL: `https://${originalRef}.supabase.co` }));
  assert.throws(() => getServerDevSupabaseConfig({ ...validEnv, VITE_SUPABASE_ANON_KEY: undefined }));
});
