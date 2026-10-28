import assert from 'node:assert/strict';
import { loadAuthorizedProfile } from '../utils/profileAccess.ts';
import { isViewPermittedForRole } from '../utils/navigation.ts';

type TestProfile = {
  id: string;
  role: string;
  access_status?: string | null;
};

const active = (id = 'auth-id-1', role = 'teacher'): TestProfile => ({
  id, role, access_status: 'active',
});

async function verify(
  authId: string | null,
  payload: { data: TestProfile | null; error: unknown },
  expectedKind: string,
) {
  const result = await loadAuthorizedProfile(authId, async (_id) => payload);
  assert.equal(result.kind, expectedKind);
  return result;
}

async function runTests() {
  const authorized = await verify('auth-id-1', { data: active(), error: null }, 'allowed');
  assert.equal(authorized.kind === 'allowed' && authorized.profile.role, 'teacher');

  await verify('auth-id-1', { data: null, error: null }, 'denied');
  await verify('auth-id-1', { data: active('other-auth-id', 'super_admin'), error: null }, 'denied');
  await verify('auth-id-1', { data: active('auth-id-1', 'super_admin'), error: new Error('RLS rejected') }, 'unavailable');
  await verify('auth-id-1', { data: { ...active(), access_status: 'blocked' }, error: null }, 'blocked');
  await verify('auth-id-1', { data: { ...active(), access_status: undefined }, error: null }, 'denied');
  await verify('auth-id-1', { data: { ...active(), access_status: 'pending' }, error: null }, 'denied');
  await verify('auth-id-1', { data: active('auth-id-1', 'unknown'), error: null }, 'denied');
  await verify(null, { data: active(), error: null }, 'denied');
  const network = await loadAuthorizedProfile('auth-id-1', async () => {
    throw new Error('offline');
  });
  assert.equal(network.kind, 'unavailable');
  await verify('auth-id-1', { data: active('auth-id-1', 'admin'), error: null }, 'allowed');
  await verify('auth-id-1', { data: active('auth-id-1', 'super_admin'), error: null }, 'allowed');

  assert.equal(isViewPermittedForRole('profiles', 'super_admin'), true);
  assert.equal(isViewPermittedForRole('profiles', 'admin'), false);
  assert.equal(isViewPermittedForRole('profiles', 'teacher'), false);
  assert.equal(isViewPermittedForRole('choir', 'admin'), true);
  assert.equal(isViewPermittedForRole('finance', 'teacher'), false);

  console.log('PASS | 12 cenários de autorização + 5 verificações de navegação.');
}
runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
