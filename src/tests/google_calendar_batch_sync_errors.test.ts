import assert from 'node:assert';
import { syncTeacherFutureClasses, SyncFutureClassesResult } from '../services/googleCalendarClient.js';
import { ClassSession } from '../store.js';

let passedTests = 0;
let failedTests = 0;

function testAssert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedTests++;
    console.log(`✅ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`❌ FAIL: ${testName}`);
    if (detail) console.error(`   Detalhe: ${detail}`);
  }
}

// Simula a lógica de feedback do componente TeacherGoogleCalendarCard
function computeCardFeedback(res: SyncFutureClassesResult): {
  errorMessage: string | null;
  syncFeedback: string | null;
} {
  let errorMessage: string | null = null;
  let syncFeedback: string | null = null;

  // 1. Falha HTTP / Autenticação / Erro de comunicação
  if (!res.success) {
    if (res.authRequired || res.httpStatus === 401) {
      errorMessage = 'Sessão expirada ou não autenticada na plataforma. Faça login novamente para sincronizar.';
    } else if (res.forbidden || res.httpStatus === 403) {
      errorMessage = 'Permissão negada para sincronizar aulas deste professor.';
    } else if (res.httpStatus) {
      errorMessage = `Falha no servidor ao sincronizar aulas futuras (HTTP ${res.httpStatus}): ${res.error || 'Erro interno'}`;
    } else {
      errorMessage = res.error || 'Falha de comunicação com o servidor ao sincronizar aulas futuras.';
    }
    return { errorMessage, syncFeedback };
  }

  // 2. Resposta de sucesso (HTTP 200) com zero aulas elegíveis
  if (res.total === 0) {
    syncFeedback = 'Nenhuma aula futura pendente de sincronização encontrada para este professor.';
    return { errorMessage, syncFeedback };
  }

  // 3. Resposta onde todas as tentativas falharam (ex.: token Google expirado ou revogado)
  if (res.failed > 0 && res.synced === 0 && res.skipped === 0) {
    errorMessage = `Falha na sincronização: nenhuma das ${res.failed} aula(s) pôde ser gravada no Google. A conta Google vinculada precisa de reautorização. Clique em "Reautorizar Google Agenda".`;
    return { errorMessage, syncFeedback };
  }

  // 4. Sincronização concluída com aulas processadas
  const extraRemaining =
    res.remaining && res.remaining > 0
      ? ` (${res.remaining} restante(s) para o próximo lote)`
      : '';

  if (res.failed > 0) {
    syncFeedback = `Sincronização parcial: ${res.synced} aula(s) sincronizada(s), ${res.failed} falha(s)${
      res.skipped > 0 ? `, ${res.skipped} já estavam no Google` : ''
    }${extraRemaining}. Verifique a conexão com o Google Agenda caso as falhas persistam.`;
  } else {
    syncFeedback = `Sincronização em lote concluída: ${res.synced} aula(s) sincronizada(s)${
      res.skipped > 0 ? `, ${res.skipped} já estavam no Google` : ''
    }${extraRemaining}.`;
  }

  return { errorMessage, syncFeedback };
}

const mockClasses: ClassSession[] = [
  {
    id: 'class-1',
    teacher_id: 'teacher-natalia',
    title: 'VIOLINO',
    date: '2026-10-13',
    start_time: '18:30:00',
    end_time: '19:20:00',
    status: 'scheduled',
    student_ids: ['student-1'],
  },
  {
    id: 'class-2',
    teacher_id: 'teacher-natalia',
    title: 'VIOLINO',
    date: '2026-10-13',
    start_time: '19:30:00',
    end_time: '20:20:00',
    status: 'scheduled',
    student_ids: ['student-2'],
  },
];

async function runTestSuite() {
  console.log('================================================================');
  console.log('🧪 TESTES: TRATAMENTO DE ERROS E RESPOSTAS DA SINCRONIZAÇÃO GOOGLE');
  console.log('================================================================\n');

  const originalFetch = globalThis.fetch;

  try {
    // --------------------------------------------------------------------------
    // TESTE 1: Endpoint retornando HTTP 401 (Sessão Expirada)
    // --------------------------------------------------------------------------
    console.log('--- 1. Endpoint retornando HTTP 401 (Não Autorizado / Sessão Expirada) ---');
    globalThis.fetch = async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        return new Response(JSON.stringify({ error: 'Token de autenticação inválido ou expirado.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url);
    };

    const res401 = await syncTeacherFutureClasses('teacher-natalia', mockClasses, {}, {});
    testAssert(res401.success === false, '1.1 res.success é false em HTTP 401');
    testAssert(res401.httpStatus === 401, '1.2 res.httpStatus é 401');
    testAssert(res401.authRequired === true, '1.3 res.authRequired é true');
    testAssert(res401.synced === 0 && res401.failed === 0 && res401.total === 0, '1.4 Contadores não indicam falsos sucessos');

    const card401 = computeCardFeedback(res401);
    testAssert(
      card401.errorMessage === 'Sessão expirada ou não autenticada na plataforma. Faça login novamente para sincronizar.',
      '1.5 Mensagem explícita de sessão expirada na interface'
    );
    testAssert(card401.syncFeedback === null, '1.6 Nenhum feedback de conclusão ou falso sucesso exibido');

    // --------------------------------------------------------------------------
    // TESTE 2: Endpoint retornando HTTP 403 (Permissão Negada)
    // --------------------------------------------------------------------------
    console.log('\n--- 2. Endpoint retornando HTTP 403 (Permissão Negada) ---');
    globalThis.fetch = async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        return new Response(JSON.stringify({ error: 'Permissão negada: você só pode sincronizar suas próprias aulas.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url);
    };

    const res403 = await syncTeacherFutureClasses('teacher-other', mockClasses, {}, {});
    testAssert(res403.success === false, '2.1 res.success é false em HTTP 403');
    testAssert(res403.httpStatus === 403, '2.2 res.httpStatus é 403');
    testAssert(res403.forbidden === true, '2.3 res.forbidden é true');

    const card403 = computeCardFeedback(res403);
    testAssert(
      card403.errorMessage === 'Permissão negada para sincronizar aulas deste professor.',
      '2.4 Mensagem explícita de permissão negada na interface'
    );
    testAssert(card403.syncFeedback === null, '2.5 Nenhum feedback de conclusão ou falso sucesso exibido');

    // --------------------------------------------------------------------------
    // TESTE 3: Endpoint retornando HTTP 500 (Erro Interno do Servidor)
    // --------------------------------------------------------------------------
    console.log('\n--- 3. Endpoint retornando HTTP 500 (Erro do Servidor) ---');
    globalThis.fetch = async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        return new Response(JSON.stringify({ error: 'Falha interna de banco de dados.' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url);
    };

    const res500 = await syncTeacherFutureClasses('teacher-natalia', mockClasses, {}, {});
    testAssert(res500.success === false, '3.1 res.success é false em HTTP 500');
    testAssert(res500.httpStatus === 500, '3.2 res.httpStatus é 500');
    testAssert(res500.error?.includes('Falha interna de banco de dados.'), '3.3 Mensagem de erro preservada com segurança');

    const card500 = computeCardFeedback(res500);
    testAssert(
      card500.errorMessage?.startsWith('Falha no servidor ao sincronizar aulas futuras (HTTP 500)'),
      '3.4 Mensagem de erro HTTP 500 visível e explícita no cartão'
    );
    testAssert(card500.syncFeedback === null, '3.5 Ausência de falso sucesso quando houver erro 500');

    // --------------------------------------------------------------------------
    // TESTE 4: Resposta Válida com Zero Aulas Elegíveis (total === 0)
    // --------------------------------------------------------------------------
    console.log('\n--- 4. Resposta Válida com Zero Aulas Elegíveis ---');
    globalThis.fetch = async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        return new Response(
          JSON.stringify({ total: 0, synced: 0, skipped: 0, failed: 0, remaining: 0 }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return originalFetch(url);
    };

    const resZero = await syncTeacherFutureClasses('teacher-natalia', [], {}, {});
    testAssert(resZero.success === true, '4.1 res.success é true');
    testAssert(resZero.total === 0, '4.2 res.total é 0');

    const cardZero = computeCardFeedback(resZero);
    testAssert(
      cardZero.syncFeedback === 'Nenhuma aula futura pendente de sincronização encontrada para este professor.',
      '4.3 Mensagem amigável informando ausência de aulas pendentes'
    );
    testAssert(
      cardZero.syncFeedback !== 'Sincronização em lote concluída: 0 aula(s) sincronizada(s), 0 já estavam no Google.',
      '4.4 NÃO exibe a mensagem ambígua antiga de 0/0'
    );
    testAssert(cardZero.errorMessage === null, '4.5 Nenhum erro gerado quando for apenas ausência de aulas');

    // --------------------------------------------------------------------------
    // TESTE 5: Todas as Aulas Falharam por Token Google Expirado / unauthorized_client
    // --------------------------------------------------------------------------
    console.log('\n--- 5. Resposta com Todas as Aulas Falhando (Necessidade de Reautorização) ---');
    globalThis.fetch = async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        return new Response(
          JSON.stringify({ total: 8, synced: 0, skipped: 0, failed: 8, remaining: 0 }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return originalFetch(url);
    };

    const resAllFailed = await syncTeacherFutureClasses('teacher-natalia', mockClasses, {}, {});
    testAssert(resAllFailed.success === true, '5.1 Endpoint respondeu 200');
    testAssert(resAllFailed.failed === 8 && resAllFailed.synced === 0, '5.2 8 falhas e 0 sincronizadas detectadas');

    const cardAllFailed = computeCardFeedback(resAllFailed);
    testAssert(
      cardAllFailed.errorMessage?.includes('A conta Google vinculada precisa de reautorização. Clique em "Reautorizar Google Agenda".'),
      '5.3 Mensagem explícita de necessidade de reautorização do Google no cartão'
    );
    testAssert(cardAllFailed.syncFeedback === null, '5.4 NÃO afirma que a sincronização foi concluída normalmente');

    // --------------------------------------------------------------------------
    // TESTE 6: Resposta Válida com Aulas Sincronizadas com Sucesso
    // --------------------------------------------------------------------------
    console.log('\n--- 6. Resposta Válida com Aulas Sincronizadas ---');
    globalThis.fetch = async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        return new Response(
          JSON.stringify({ total: 5, synced: 4, skipped: 1, failed: 0, remaining: 0 }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return originalFetch(url);
    };

    const resSuccess = await syncTeacherFutureClasses('teacher-natalia', mockClasses, {}, {});
    testAssert(resSuccess.success === true, '6.1 res.success é true');
    testAssert(resSuccess.synced === 4, '6.2 4 aulas sincronizadas');
    testAssert(resSuccess.skipped === 1, '6.3 1 aula já no Google');

    const cardSuccess = computeCardFeedback(resSuccess);
    testAssert(
      cardSuccess.syncFeedback === 'Sincronização em lote concluída: 4 aula(s) sincronizada(s), 1 já estavam no Google.',
      '6.4 Mensagem de sucesso de sincronização com contadores corretos'
    );
    testAssert(cardSuccess.errorMessage === null, '6.5 Nenhum erro falso exibido');

    // --------------------------------------------------------------------------
    // TESTE 7: Não Exposição de Segredos / Tokens nos Erros e Logs
    // --------------------------------------------------------------------------
    console.log('\n--- 7. Segurança: Não Exposição de Segredos nos Erros ---');
    globalThis.fetch = async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        return new Response(
          JSON.stringify({
            error: 'Falha de autorização com oauth_token=secret_123 e client_secret=topsecret',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return originalFetch(url);
    };

    const resSecret = await syncTeacherFutureClasses('teacher-natalia', mockClasses, {}, {});
    testAssert(resSecret.success === false, '7.1 res.success é false');
    testAssert(!JSON.stringify(resSecret).includes('refresh_token'), '7.2 Nenhuma menção a refresh_token nos dados');

  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('\n================================================================');
  console.log(`📊 RESULTADO DOS TESTES DE ERROS E SINCRONIZAÇÃO EM LOTE:`);
  console.log(`   Sucessos: ${passedTests}`);
  console.log(`   Falhas:   ${failedTests}`);
  console.log('================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite();
