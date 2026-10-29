import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const store = readFileSync(new URL('../store.tsx', import.meta.url), 'utf8');

assert.match(store, /localStorage\.getItem\("music_school_state_iacra_dev"\)/);
assert.match(store, /localStorage\.setItem\("music_school_state_iacra_dev"/);
assert.match(store, /localStorage\.getItem\("pending_class_syncs_v1_iacra_dev"\)/);
assert.match(store, /localStorage\.setItem\("pending_class_syncs_v1_iacra_dev"/);

assert.doesNotMatch(store, /localStorage\.getItem\("music_school_state"\)/);
assert.doesNotMatch(store, /syncToSupabase\(\);/);
assert.doesNotMatch(store, /Ensure RAPHAEL AUGUSTO PINTO teacher record exists/);
assert.doesNotMatch(store, /RAPHAEL AUGUSTO PINTO/);
assert.match(store, /const rawStudents = students \?\? \[\];/);
assert.match(store, /const parsedTeachers = \(teachers \?\? \[\]\)\.map\(normalizeTeacher\);/);

console.log('PASS | IACRA-DEV: sem importação local automática nem professor real fixo');
