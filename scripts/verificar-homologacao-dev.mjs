import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEV_REF = 'xuyimfugcdkqovqelrfz';
const PROD_REF = 'ldumzwrwbhjtrnlioigg';
let content;
try {
  content = await readFile(path.resolve('.env'), 'utf8');
} catch {
  console.error('BLOQUEADO: .env não encontrado. Execute npm run homologacao:configurar.');
  process.exit(1);
}
const env = Object.fromEntries(
  content.split(/\r?\n/).map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .map(line => {
      const ix = line.indexOf('=');
      if (ix <= 0) throw new Error('Linha de configuração inválida.');
      return [line.slice(0, ix), line.slice(ix + 1)];
    }),
);
const expected = 'https://' + DEV_REF + '.supabase.co';
const checks = [
  env.VITE_SUPABASE_URL === expected,
  env.SUPABASE_URL === expected,
  env.VITE_EAVRA_DEV_PROJECT_REF === DEV_REF,
  /^sb_publishable_[A-Za-z0-9_-]{10,}$/.test(env.VITE_SUPABASE_ANON_KEY || ''),
  env.SUPABASE_KEY === env.VITE_SUPABASE_ANON_KEY,
  env.VITE_EAVRA_PERMISSION_ADMIN_ENABLED === 'true',
  env.EAVRA_ENABLE_DEV_GOOGLE_CALENDAR === 'false',
  !Object.keys(env).some(k => /SERVICE_ROLE|SUPABASE_SECRET|GOOGLE_CLIENT_SECRET/.test(k)),
  !content.includes(PROD_REF),
];
if (checks.some(ok => !ok)) {
  console.error('BLOQUEADO: configuração DEV incompleta, incompatível ou potencialmente perigosa.');
  process.exit(1);
}
console.log('OK: URLs, referência e chave pública de teste coerentes; produção bloqueada.');
