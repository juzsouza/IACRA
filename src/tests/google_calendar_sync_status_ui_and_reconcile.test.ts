import { getGoogleSyncBadgeInfo } from '../views/Classes.js';
import { reconcileGoogleSyncMap } from '../store.js';

let passed = 0;
let failed = 0;

function testAssert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`❌ FAIL: ${testName}`, detail || '');
    failed++;
  }
}

async function runSyncStatusTests() {
  console.log('\n================================================================');
  console.log('🧪 TESTES: STATUS VISUAL DO GOOGLE CALENDAR E RECONCILIAÇÃO');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // 1. unsynced NÃO ser exibido como failed
  // --------------------------------------------------------------------------
  console.log('--- 1. Validação: unsynced NUNCA exibido como failed ---');

  const unsyncedBadgeDefault = getGoogleSyncBadgeInfo('unsynced');
  testAssert(
    unsyncedBadgeDefault.label === 'Pendente Google',
    '1.1 unsynced retorna rótulo "Pendente Google"'
  );
  testAssert(
    unsyncedBadgeDefault.label !== 'Google Falhou',
    '1.2 unsynced NUNCA retorna rótulo "Google Falhou"'
  );
  testAssert(
    unsyncedBadgeDefault.colorClass.includes('amber'),
    '1.3 unsynced utiliza cor amber (alerta/pendência)'
  );
  testAssert(
    !unsyncedBadgeDefault.colorClass.includes('rose'),
    '1.4 unsynced NUNCA utiliza cor rose (erro/falha)'
  );

  const unsyncedBadgeCustomMsg = getGoogleSyncBadgeInfo('unsynced', 'Ainda não sincronizado com o Google Calendar');
  testAssert(
    unsyncedBadgeCustomMsg.label === 'Pendente Google',
    '1.5 unsynced com mensagem personalizada preserva rótulo "Pendente Google"'
  );
  testAssert(
    unsyncedBadgeCustomMsg.title === 'Ainda não sincronizado com o Google Calendar',
    '1.6 unsynced com mensagem preserva o título explicativo'
  );

  // --------------------------------------------------------------------------
  // 2. failed continuar sendo exibido como Google Falhou
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Validação: failed continua sendo exibido como Google Falhou ---');

  const failedBadge = getGoogleSyncBadgeInfo('failed', 'HTTP 401: Token expirado');
  testAssert(
    failedBadge.label === 'Google Falhou',
    '2.1 failed retorna exatamente o rótulo "Google Falhou"'
  );
  testAssert(
    failedBadge.colorClass.includes('rose'),
    '2.2 failed utiliza classe de cor rose'
  );
  testAssert(
    failedBadge.title === 'HTTP 401: Token expirado',
    '2.3 failed preserva mensagem de erro detalhada no title'
  );

  const failedBadgeNoMsg = getGoogleSyncBadgeInfo('failed');
  testAssert(
    failedBadgeNoMsg.label === 'Google Falhou',
    '2.4 failed sem mensagem customizada retorna "Google Falhou"'
  );
  testAssert(
    failedBadgeNoMsg.title === 'Falha na sincronização com o Google Calendar',
    '2.5 failed sem mensagem utiliza fallback descritivo'
  );

  // --------------------------------------------------------------------------
  // 3. synced remover estado stale anterior
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Validação: synced remove estado stale anterior ---');

  // Estado anterior contendo erros e status de não sincronizado/falha
  const staleMap = {
    'class-stale-unsynced': {
      status: 'unsynced' as const,
      error: 'Ainda não sincronizado com o Google Calendar',
      lastAttemptAt: '2026-10-06T12:00:00Z',
    },
    'class-stale-failed': {
      status: 'failed' as const,
      error: 'Erro de rede temporário',
      lastAttemptAt: '2026-10-06T13:00:00Z',
    },
    'class-still-failed': {
      status: 'failed' as const,
      error: 'Google API quota exceeded',
      lastAttemptAt: '2026-10-06T14:00:00Z',
    },
  };

  // O backend agora reporta apenas a aula que ainda está com erro
  const currentUnsyncedFromServer = [
    {
      id: 'class-still-failed',
      sync_status: 'failed' as const,
      last_error: 'Google API quota exceeded',
      last_attempt_at: '2026-10-07T11:00:00Z',
    },
  ];

  const reconciledMap = reconcileGoogleSyncMap(staleMap, currentUnsyncedFromServer);

  // class-stale-unsynced: estava unsynced, agora ausente da lista de pendências -> deve ser promovida para synced
  testAssert(
    reconciledMap['class-stale-unsynced']?.status === 'synced',
    '3.1 class-stale-unsynced promovida para status "synced"'
  );
  testAssert(
    reconciledMap['class-stale-unsynced']?.error === undefined,
    '3.2 class-stale-unsynced teve mensagem de erro stale removida'
  );

  // class-stale-failed: estava failed, agora ausente da lista de pendências -> deve ser promovida para synced
  testAssert(
    reconciledMap['class-stale-failed']?.status === 'synced',
    '3.3 class-stale-failed promovida para status "synced"'
  );
  testAssert(
    reconciledMap['class-stale-failed']?.error === undefined,
    '3.4 class-stale-failed teve mensagem de falha stale removida'
  );

  // class-still-failed: continua no servidor como failed -> deve manter failed
  testAssert(
    reconciledMap['class-still-failed']?.status === 'failed',
    '3.5 class-still-failed continua como "failed"'
  );
  testAssert(
    reconciledMap['class-still-failed']?.error === 'Google API quota exceeded',
    '3.6 class-still-failed preserva erro atual do servidor'
  );

  // --------------------------------------------------------------------------
  // 4. aula que passa de unsynced para synced resultar em Google OK
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Validação: aula que passa de unsynced para synced resulta em Google OK ---');

  const asheleyOrFabioClassId = '2343fdd5-1711-4d47-b8ef-bc79fc78bde5';

  // Simulação do caso exato investigado:
  // Inicialmente no estado local do React a aula estava como 'unsynced' (ou 'failed')
  const initialLocalState = {
    [asheleyOrFabioClassId]: {
      status: 'unsynced' as const,
      error: 'Ainda não sincronizado com o Google Calendar',
    },
  };

  // Na UI antes da sincronização:
  const badgeBeforeSync = getGoogleSyncBadgeInfo(
    initialLocalState[asheleyOrFabioClassId].status,
    initialLocalState[asheleyOrFabioClassId].error
  );
  testAssert(
    badgeBeforeSync.label === 'Pendente Google',
    '4.1 Antes da sincronização: exibe "Pendente Google" (não "Google Falhou")'
  );

  // Sincronização ocorre no backend e o servidor não retorna mais a aula na lista de pendências
  const serverAfterSync: Array<{ id: string }> = []; // lista vazia de pendências para essa aula
  const updatedLocalState = reconcileGoogleSyncMap(initialLocalState, serverAfterSync as any);

  testAssert(
    updatedLocalState[asheleyOrFabioClassId]?.status === 'synced',
    '4.2 Após reconciliação: status no mapa é atualizado para "synced"'
  );

  // Na UI após a sincronização:
  const badgeAfterSync = getGoogleSyncBadgeInfo(
    updatedLocalState[asheleyOrFabioClassId].status,
    updatedLocalState[asheleyOrFabioClassId].error
  );
  testAssert(
    badgeAfterSync.label === 'Google OK',
    '4.3 Após sincronização: aula exibe exatamente "Google OK"'
  );
  testAssert(
    badgeAfterSync.colorClass.includes('teal'),
    '4.4 Após sincronização: badge utiliza estilo teal (sucesso)'
  );
  testAssert(
    !badgeAfterSync.colorClass.includes('rose') && !badgeAfterSync.colorClass.includes('amber'),
    '4.5 Após sincronização: badge não utiliza cores de falha ou alerta'
  );

  // --------------------------------------------------------------------------
  // 5. Teste de ciclo de vida completo com adições, atualizações e purgas
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Ciclo de Vida Completo do Mapa de Sincronização ---');

  const step1State = reconcileGoogleSyncMap({}, [
    { id: 'c1', sync_status: 'unsynced', last_error: 'Aguardando lote' },
    { id: 'c2', sync_status: 'failed', last_error: 'Erro 500' },
  ]);

  testAssert(step1State['c1']?.status === 'unsynced', '5.1 c1 adicionada como unsynced');
  testAssert(step1State['c2']?.status === 'failed', '5.2 c2 adicionada como failed');
  testAssert(
    getGoogleSyncBadgeInfo(step1State['c1'].status).label === 'Pendente Google',
    '5.3 c1 renderiza "Pendente Google"'
  );
  testAssert(
    getGoogleSyncBadgeInfo(step1State['c2'].status).label === 'Google Falhou',
    '5.4 c2 renderiza "Google Falhou"'
  );

  // No step 2: c1 foi sincronizada com sucesso, c2 falhou novamente, c3 é nova pendência
  const step2State = reconcileGoogleSyncMap(step1State, [
    { id: 'c2', sync_status: 'failed', last_error: 'Erro 500 retry 2' },
    { id: 'c3', sync_status: 'pending' },
  ]);

  testAssert(step2State['c1']?.status === 'synced', '5.5 c1 promovida para synced');
  testAssert(getGoogleSyncBadgeInfo(step2State['c1'].status).label === 'Google OK', '5.6 c1 agora renderiza "Google OK"');
  testAssert(step2State['c2']?.status === 'failed', '5.7 c2 permanece failed');
  testAssert(getGoogleSyncBadgeInfo(step2State['c2'].status).label === 'Google Falhou', '5.8 c2 continua renderizando "Google Falhou"');
  testAssert(step2State['c3']?.status === 'pending', '5.9 c3 adicionada como pending');
  testAssert(getGoogleSyncBadgeInfo(step2State['c3'].status).label === 'Sincronizando Google...', '5.10 c3 renderiza "Sincronizando Google..."');

  console.log('\n================================================================');
  console.log(`📊 RESULTADO DOS TESTES:`);
  console.log(`   Sucessos: ${passed}`);
  console.log(`   Falhas:   ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSyncStatusTests().catch((err) => {
  console.error('Erro fatal nos testes de status visual:', err);
  process.exit(1);
});
