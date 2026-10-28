import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const store = readFileSync(new URL('../store.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../server/adminRoutes.ts', import.meta.url), 'utf8');
const profiles = readFileSync(new URL('../views/Profiles.tsx', import.meta.url), 'utf8');
const add = store.slice(store.indexOf('  const addProfile = async ('), store.indexOf('  const updateProfile = async ('));
const create = admin.slice(admin.indexOf("adminRouter.post('/create-or-resolve-user'"), admin.indexOf('// POST /api/admin/toggle-user-access'));
assert.ok(add.includes("fetch('/api/admin/create-or-resolve-user'"), 'criação somente por API administrativa');
assert.ok(!add.includes('.auth.signUp('), 'proibir signup pelo navegador');
assert.ok(!add.includes('signInWithPassword('), 'proibir teste de senha de terceiros');
assert.ok(!add.includes(".from('profiles').upsert"), 'proibir upsert alternativo');
assert.ok(!create.includes('temp_password:'), 'proibir armazenamento de senha');
assert.ok(!create.includes(".upsert(["), 'proibir sobrescrever perfis existentes');
assert.ok(create.includes(".insert(["), 'inserção apenas de conta nova');
assert.ok(create.includes('reviewProvisioningIdentity'), 'conflitos exigem revisão');
assert.ok(!profiles.includes('admin_reset_user_password'), 'não oferecer SQL de redefinição em tela');
assert.ok(!profiles.includes('p.temp_password'), 'não mostrar senha em lista de usuários');
console.log('PASS: 10 verificações de regressão de segurança');
