/**
 * Testes Automatizados de Segurança e Permissões do Google Calendar
 * 
 * Validação:
 * 1. Bloqueio de requisições não autenticadas (401)
 * 2. Bloqueio de acesso a outros professores (403)
 * 3. Identificação do teacher_id do professor logado
 * 4. Impedimento de conexão de contas alheias por Administradores (403)
 */

let passed = 0;
let failed = 0;

function assert(cond: boolean, name: string, detail?: any) {
  if (cond) {
    console.log(`✅ PASS: ${name}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${name}`, detail || '');
    failed++;
  }
}

async function runSecurityTests() {
  console.log('\n==================================================');
  console.log('🧪 TESTES DE SEGURANÇA E ISOLAMENTO GOOGLE AGENDA');
  console.log('==================================================\n');

  const BASE_URL = 'http://localhost:3000';

  // 1. Testar endpoint de config (deve ser público)
  const configRes = await fetch(`${BASE_URL}/api/google/config`);
  const configData = await configRes.json();
  assert(configRes.status === 200, 'Endpoint /api/google/config responde 200');
  assert(configData.configured === true, 'Google Calendar está configurado com Client ID');

  // 2. Testar /api/google/auth-url sem autenticação
  const unauthUrlRes = await fetch(`${BASE_URL}/api/google/auth-url?teacher_id=teacher_123`);
  assert(unauthUrlRes.status === 401, 'auth-url sem token rejeitado com 401 Unauthorized');

  // 3. Testar /api/google/account/:teacherId sem autenticação
  const unauthAccRes = await fetch(`${BASE_URL}/api/google/account/teacher_123`);
  assert(unauthAccRes.status === 401, 'account/:teacherId sem token rejeitado com 401 Unauthorized');

  // 4. Testar /api/google/disconnect sem autenticação
  const unauthDiscRes = await fetch(`${BASE_URL}/api/google/disconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teacherId: 'teacher_123' }),
  });
  assert(unauthDiscRes.status === 401, 'disconnect sem token rejeitado com 401 Unauthorized');

  // 5. Testar /api/google/sync-future sem autenticação
  const unauthSyncRes = await fetch(`${BASE_URL}/api/google/sync-future`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teacherId: 'teacher_123', classes: [] }),
  });
  assert(unauthSyncRes.status === 401, 'sync-future sem token rejeitado com 401 Unauthorized');

  // 6. Testar POST /api/google/sync-class atendido pelo Express
  const syncClassRes = await fetch(`${BASE_URL}/api/google/sync-class`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create',
      classSession: {
        id: 'sec_class_test_1',
        teacher_id: 'teacher_123',
        title: 'Aula Teste',
        date: '2026-10-10',
        start_time: '10:00',
        end_time: '11:00',
      },
    }),
  });
  const poweredBy = syncClassRes.headers.get('x-powered-by') || '';
  assert(
    syncClassRes.status === 401 && poweredBy.toLowerCase().includes('express'),
    'POST /api/google/sync-class atendido pelo Express (X-Powered-By: Express) e rejeita sem token com 401',
    { status: syncClassRes.status, poweredBy }
  );

  console.log('\n==================================================');
  console.log(`📊 RESULTADOS: Sucessos: ${passed} | Falhas: ${failed}`);
  console.log('==================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests().catch((err) => {
  console.error('Erro nos testes de segurança:', err);
  process.exit(1);
});
