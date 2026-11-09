/**
 * Configuração local e explícita para GitHub Codespaces.
 * NÃO usa produção, nem grava em qualquer banco.
 * A chave publicável é informada pelo operador via Codespaces Secret
 * IACRA_DEV_PUBLISHABLE_KEY ou pelo terminal de forma interativa.
 */
import { constants } from 'node:fs';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';

const DEV_REF = 'xuyimfugcdkqovqelrfz';
const PROD_REF = 'ldumzwrwbhjtrnlioigg';
const envPath = path.resolve(process.cwd(), '.env');

try {
  await access(envPath, constants.F_OK);
  console.error('BLOQUEADO: já existe .env. Não vou sobrescrever uma configuração possivelmente importante.');
  console.error('Inspecione esse arquivo localmente, sem enviar credenciais ao chat ou ao GitHub.');
  process.exit(1);
} catch (error) {
  if (error && error.code !== 'ENOENT') throw error;
}

let key = (process.env.IACRA_DEV_PUBLISHABLE_KEY || '').trim();
if (!key) {
  if (!process.stdin.isTTY) {
    console.error('Informe IACRA_DEV_PUBLISHABLE_KEY como Codespaces Secret ou execute no terminal interativo.');
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('Copie somente a chave pública sb_publishable_... do Supabase IACRA-DEV.');
    key = (await rl.question('Cole a chave PUBLICÁVEL do banco DEV: ')).trim();
  } finally {
    rl.close();
  }
}
if (!/^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(key)) {
  console.error('BLOQUEADO: esperada uma chave pública sb_publishable_... do IACRA-DEV.');
  process.exit(1);
}
if (key.includes(PROD_REF) || DEV_REF === PROD_REF) {
  console.error('BLOQUEADO: projeto incorreto.');
  process.exit(1);
}

const url = 'https://' + DEV_REF + '.supabase.co';
const configText = [
  '# Arquivo local do Codespaces: IACRA-DEV, sem acesso à produção.',
  'VITE_SUPABASE_URL=' + url,
  'SUPABASE_URL=' + url,
  'VITE_EAVRA_DEV_PROJECT_REF=' + DEV_REF,
  'VITE_SUPABASE_ANON_KEY=' + key,
  'SUPABASE_KEY=' + key,
  'VITE_EAVRA_PERMISSION_ADMIN_ENABLED=true',
  'EAVRA_ENABLE_DEV_GOOGLE_CALENDAR=false',
  'PORT=3000',
  '',
].join('\n');
await writeFile(envPath, configText, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
console.log('Configuração de testes criada em .env (ignorada pelo Git). Nenhuma credencial foi publicada.');
console.log('Próximo comando: npm run homologacao:abrir');
