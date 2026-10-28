import assert from 'node:assert/strict';
import { validateDevSupabaseUrl } from '../shared/approvedDevSupabase.ts';

const allowed = 'aaaaaaaaaaaaaaaaaaaa';
const prod = 'ldumzwrwbhjtrnlioigg';
const validUrl = `https://${allowed}.supabase.co`;
let count = 0;
assert.equal(validateDevSupabaseUrl(validUrl, allowed), validUrl); count++;
for (const [url, ref] of [
  [validUrl, 'bbbbbbbbbbbbbbbbbbbb'],
  [`https://${prod}.supabase.co`, prod],
  [`https://${prod}.supabase.co`, allowed],
  ['', allowed],
  [validUrl, ''],
  ['http://' + allowed + '.supabase.co', allowed],
  ['https://example.org', allowed],
  [validUrl + '/auth/v1/token', allowed],
  [validUrl + '?secret=a', allowed],
  ['https://user:password@' + allowed + '.supabase.co', allowed],
  [validUrl.replace('https://', 'https://www.'), allowed],
  ['https://' + allowed + '.supabase.co:8443', allowed],
] as Array<[string, string]>) {
  assert.throws(() => validateDevSupabaseUrl(url, ref)); count++;
}
console.log(`PASS: ${count} verificações offline de isolamento DEV`);
