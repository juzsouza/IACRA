import assert from 'node:assert';
import {
  syncTeacherFutureClasses,
  SyncFutureClassesResult,
  SYNC_FUTURE_CLASSES_DEFAULT_BATCH_SIZE,
} from '../services/googleCalendarClient.js';
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
    } else if (res.httpStatus === 413) {
      const partialInfo =
        res.synced > 0 || res.skipped > 0
          ? ` (${res.synced} sincronizada(s), ${res.skipped} já no Google antes da falha)`
          : '';
      errorMessage = `Falha no servidor ao sincronizar aulas futuras (HTTP 413): tamanho da requisição excedeu o limite do servidor.${partialInfo} Tente sincronizar novamente com lotes menores.`;
    } else if (res.httpStatus) {
      const partialInfo =
        res.synced > 0 || res.skipped > 0
          ? ` (${res.synced} sincronizada(s), ${res.skipped} já no Google antes da interrupção)`
          : '';
      errorMessage = `Falha no servidor ao sincronizar aulas futuras (HTTP ${res.httpStatus}): ${res.error || 'Erro interno'}.${partialInfo}`;
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

// Cria uma lista de N aulas sintéticas
function generateMockClasses(count: number, teacherId = 'teacher-natalia'): ClassSession[] {
  const list: ClassSession[] = [];
  for (let i = 1; i <= count; i++) {
    list.push({
      id: `class-${i}`,
      teacher_id: teacherId,
      title: `Aula Violino #${i}`,
      date: '2026-10-15',
      start_time: '14:00:00',
      end_time: '14:50:00',
      status: 'scheduled',
      student_ids: [`student-${i}`],
    });
  }
  return list;
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('🧪 TESTES: DIVISÃO EM LOTES, HTTP 413 E PROCESSAMENTO SEQUENCIAL');
  console.log('========================================================================\n');

  const originalFetch = globalThis.fetch;

  try {
    // --------------------------------------------------------------------------
    // TESTE 1: Divisão correta dos lotes para conjunto maior que um lote (60 aulas)
    // --------------------------------------------------------------------------
    console.log('--- 1. Divisão correta dos lotes (60 aulas com batchSize 25 -> 25, 25, 10) ---');
    const callsLog: Array<{ batchSize: number; classIds: string[] }> = [];

    globalThis.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        const body = JSON.parse(init?.body || '{}');
        const classes = body.classes || [];
        callsLog.push({
          batchSize: classes.length,
          classIds: classes.map((c: any) => c.id),
        });

        // Simula resposta 200 com todas sincronizadas para o lote
        return new Response(
          JSON.stringify({
            total: classes.length,
            synced: classes.length,
            skipped: 0,
            failed: 0,
            remaining: 0,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(url, init);
    };

    const classes60 = generateMockClasses(60);
    const res60 = await syncTeacherFutureClasses('teacher-natalia', classes60, {}, {}, { batchSize: 25 });

    testAssert(callsLog.length === 3, '1.1 60 aulas divididas exatamente em 3 requisições');
    testAssert(callsLog[0]?.batchSize === 25, '1.2 Lote 1 contém exatamente 25 aulas');
    testAssert(callsLog[1]?.batchSize === 25, '1.3 Lote 2 contém exatamente 25 aulas');
    testAssert(callsLog[2]?.batchSize === 10, '1.4 Lote 3 contém exatamente 10 aulas');
    testAssert(res60.success === true, '1.5 res.success é true');
    testAssert(res60.total === 60, '1.6 total agregado é 60');
    testAssert(res60.synced === 60, '1.7 synced agregado é 60');

    // --------------------------------------------------------------------------
    // TESTE 2: Payload seguro contendo estritamente os campos necessários
    // --------------------------------------------------------------------------
    console.log('\n--- 2. Validação do Payload: apenas campos necessários (sem inflar payload) ---');
    let capturedFirstClass: any = null;
    globalThis.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        const body = JSON.parse(init?.body || '{}');
        capturedFirstClass = body.classes?.[0];
        return new Response(
          JSON.stringify({ total: 1, synced: 1, skipped: 0, failed: 0, remaining: 0 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(url, init);
    };

    const singleClassList: ClassSession[] = [
      {
        id: 'cls-1',
        teacher_id: 'teacher-natalia',
        title: 'Violino',
        date: '2026-10-13',
        start_time: '18:30:00',
        end_time: '19:20:00',
        status: 'scheduled',
        student_ids: ['std-1'],
        group_id: undefined,
        allow_makeup: true,
        report: 'Relatório pedagógico muito longo...',
      } as any,
    ];

    await syncTeacherFutureClasses('teacher-natalia', singleClassList, { 'std-1': 'Carolina' }, {});
    testAssert(capturedFirstClass !== null, '2.1 Classe enviada foi capturada');
    testAssert(capturedFirstClass.id === 'cls-1', '2.2 id preservado');
    testAssert(capturedFirstClass.studentName === 'Carolina', '2.3 studentName formatado');
    testAssert(capturedFirstClass.report === undefined, '2.4 Campos extras desnecessários (ex: report) NÃO são enviados');
    testAssert(capturedFirstClass.allow_makeup === undefined, '2.5 Campos de auditoria/regras (ex: allow_makeup) NÃO são enviados');

    // --------------------------------------------------------------------------
    // TESTE 3: Processamento estritamente sequencial (sem concorrência de requisições)
    // --------------------------------------------------------------------------
    console.log('\n--- 3. Processamento Estritamente Sequencial ---');
    let inFlightRequests = 0;
    let maxConcurrency = 0;

    globalThis.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        inFlightRequests++;
        if (inFlightRequests > maxConcurrency) {
          maxConcurrency = inFlightRequests;
        }
        // Simula latência de 20ms
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlightRequests--;
        return new Response(
          JSON.stringify({ total: 10, synced: 10, skipped: 0, failed: 0, remaining: 0 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(url, init);
    };

    const classes30 = generateMockClasses(30);
    await syncTeacherFutureClasses('teacher-natalia', classes30, {}, {}, { batchSize: 10 });
    testAssert(maxConcurrency === 1, '3.1 Concorrência máxima observada é exatamente 1 (sequencial puro)');

    // --------------------------------------------------------------------------
    // TESTE 4: Agregação correta dos contadores (synced, skipped, failed, remaining)
    // --------------------------------------------------------------------------
    console.log('\n--- 4. Agregação dos Contadores em Múltiplos Lotes ---');
    let batchCallCount = 0;
    globalThis.fetch = async (url: any, init?: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        batchCallCount++;
        if (batchCallCount === 1) {
          // Lote 1: 15 synced, 5 skipped, 0 failed
          return new Response(
            JSON.stringify({ total: 20, synced: 15, skipped: 5, failed: 0, remaining: 0 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } else {
          // Lote 2: 8 synced, 2 skipped, 2 failed
          return new Response(
            JSON.stringify({ total: 12, synced: 8, skipped: 2, failed: 2, remaining: 0 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
      return originalFetch(url, init);
    };

    const classes32 = generateMockClasses(32);
    const resAgg = await syncTeacherFutureClasses('teacher-natalia', classes32, {}, {}, { batchSize: 20 });
    testAssert(resAgg.success === true, '4.1 res.success é true');
    testAssert(resAgg.total === 32, '4.2 Total agregado: 20 + 12 = 32');
    testAssert(resAgg.synced === 23, '4.3 Synced agregado: 15 + 8 = 23');
    testAssert(resAgg.skipped === 7, '4.4 Skipped agregado: 5 + 2 = 7');
    testAssert(resAgg.failed === 2, '4.5 Failed agregado: 0 + 2 = 2');
    testAssert(resAgg.remaining === 0, '4.6 Remaining agregado é 0');

    // --------------------------------------------------------------------------
    // TESTE 5: Falha HTTP 413 no Primeiro Lote
    // --------------------------------------------------------------------------
    console.log('\n--- 5. Falha HTTP 413 no Primeiro Lote (Sem Falso Sucesso, Sem Erro OAuth) ---');
    globalThis.fetch = async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        return new Response(
          JSON.stringify({ error: 'O tamanho da requisição excedeu o limite permitido pelo servidor (HTTP 413).' }),
          { status: 413, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(url);
    };

    const res413Initial = await syncTeacherFutureClasses('teacher-natalia', classes60, {}, {}, { batchSize: 25 });
    testAssert(res413Initial.success === false, '5.1 res.success é false em HTTP 413');
    testAssert(res413Initial.httpStatus === 413, '5.2 res.httpStatus é 413');
    testAssert(res413Initial.synced === 0, '5.3 synced é 0');
    testAssert(res413Initial.remaining === 60, '5.4 remaining preserva todas as 60 aulas não processadas');

    const card413Initial = computeCardFeedback(res413Initial);
    testAssert(
      card413Initial.errorMessage?.includes('HTTP 413'),
      '5.5 Mensagem identifica explicitamente HTTP 413'
    );
    testAssert(
      !card413Initial.errorMessage?.includes('Reautorizar Google Agenda'),
      '5.6 NÃO confunde HTTP 413 com expiração de token OAuth'
    );
    testAssert(card413Initial.syncFeedback === null, '5.7 Sem feedback de conclusão ou falso sucesso');

    // --------------------------------------------------------------------------
    // TESTE 6: Falha Parcial HTTP 413 após Lote 1 Sucedido
    // --------------------------------------------------------------------------
    console.log('\n--- 6. Falha Parcial (Lote 1 sucedeu, Lote 2 retornou HTTP 413, Lote 3 abortado) ---');
    let callIndex6 = 0;
    globalThis.fetch = async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        callIndex6++;
        if (callIndex6 === 1) {
          // Lote 1 (25 aulas): 20 sincronizadas, 5 já no Google
          return new Response(
            JSON.stringify({ total: 25, synced: 20, skipped: 5, failed: 0, remaining: 0 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } else {
          // Lote 2 (25 aulas): Falha HTTP 413
          return new Response(
            JSON.stringify({ error: 'Payload excessivo (HTTP 413).' }),
            { status: 413, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
      return originalFetch(url);
    };

    const res413Partial = await syncTeacherFutureClasses('teacher-natalia', classes60, {}, {}, { batchSize: 25 });
    testAssert(callIndex6 === 2, '6.1 Chamadas interrompidas após lote 2 (lote 3 de 10 aulas NÃO foi enviado)');
    testAssert(res413Partial.success === false, '6.2 res.success é false');
    testAssert(res413Partial.httpStatus === 413, '6.3 res.httpStatus é 413');
    testAssert(res413Partial.synced === 20, '6.4 Preserva 20 aulas sincronizadas do lote 1');
    testAssert(res413Partial.skipped === 5, '6.5 Preserva 5 aulas skipped do lote 1');
    testAssert(res413Partial.remaining === 35, '6.6 remaining é 35 (25 do lote falho + 10 do lote abortado)');
    testAssert(res413Partial.total === 60, '6.7 total de 60 aulas preservado');

    const card413Partial = computeCardFeedback(res413Partial);
    testAssert(
      card413Partial.errorMessage?.includes('20 sincronizada(s)'),
      '6.8 Mensagem de erro informa progresso parcial de aulas já sincronizadas'
    );
    testAssert(
      card413Partial.errorMessage?.includes('5 já no Google'),
      '6.9 Mensagem de erro informa aulas que já estavam no Google antes da falha'
    );
    testAssert(card413Partial.syncFeedback === null, '6.10 Ausência de falso sucesso quando houve falha em lote');

    // --------------------------------------------------------------------------
    // TESTE 7: Idempotência: Evento que Já Existe no Google (skipped)
    // --------------------------------------------------------------------------
    console.log('\n--- 7. Idempotência: Eventos Já Sincronizados Contabilizados como Skipped ---');
    globalThis.fetch = async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        return new Response(
          JSON.stringify({ total: 10, synced: 0, skipped: 10, failed: 0, remaining: 0 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(url);
    };

    const classes10 = generateMockClasses(10);
    const resIdemp = await syncTeacherFutureClasses('teacher-natalia', classes10, {}, {});
    testAssert(resIdemp.success === true, '7.1 res.success é true');
    testAssert(resIdemp.synced === 0, '7.2 synced é 0 (nenhuma criação duplicada)');
    testAssert(resIdemp.skipped === 10, '7.3 skipped é 10 (todas reconhecidas como existentes)');
    const cardIdemp = computeCardFeedback(resIdemp);
    testAssert(
      cardIdemp.syncFeedback?.includes('10 já estavam no Google'),
      '7.4 Feedback informa corretamente que as aulas já estavam no Google'
    );

    // --------------------------------------------------------------------------
    // TESTE 8: Zero Aulas Elegíveis
    // --------------------------------------------------------------------------
    console.log('\n--- 8. Zero Aulas Elegíveis ---');
    globalThis.fetch = async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        return new Response(
          JSON.stringify({ total: 0, synced: 0, skipped: 0, failed: 0, remaining: 0 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return originalFetch(url);
    };

    const resZero = await syncTeacherFutureClasses('teacher-natalia', [], {}, {});
    testAssert(resZero.success === true, '8.1 res.success é true para lista vazia');
    testAssert(resZero.total === 0, '8.2 total é 0');
    const cardZero = computeCardFeedback(resZero);
    testAssert(
      cardZero.syncFeedback === 'Nenhuma aula futura pendente de sincronização encontrada para este professor.',
      '8.3 Mensagem amigável de zero aulas elegíveis'
    );
    testAssert(cardZero.errorMessage === null, '8.4 Nenhum erro falso gerado');

    // --------------------------------------------------------------------------
    // TESTE 9: Falhas de Autenticação 401 e 403 Preservadas
    // --------------------------------------------------------------------------
    console.log('\n--- 9. Preservação de 401 e 403 ---');
    globalThis.fetch = async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        return new Response(JSON.stringify({ error: 'Não autorizado.' }), { status: 401 });
      }
      return originalFetch(url);
    };
    const res401 = await syncTeacherFutureClasses('teacher-natalia', classes10, {}, {});
    testAssert(res401.authRequired === true && res401.httpStatus === 401, '9.1 401 tratado com authRequired');

    globalThis.fetch = async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        return new Response(JSON.stringify({ error: 'Permissão negada.' }), { status: 403 });
      }
      return originalFetch(url);
    };
    const res403 = await syncTeacherFutureClasses('teacher-natalia', classes10, {}, {});
    testAssert(res403.forbidden === true && res403.httpStatus === 403, '9.2 403 tratado com forbidden');

    // --------------------------------------------------------------------------
    // TESTE 10: Interrupção por Rate Limit (Google 429 / rateLimited)
    // --------------------------------------------------------------------------
    console.log('\n--- 10. Interrupção Segura por Rate Limit (rateLimited: true) ---');
    let callIndex10 = 0;
    globalThis.fetch = async (url: any) => {
      if (typeof url === 'string' && url.includes('/api/google/sync-future')) {
        callIndex10++;
        if (callIndex10 === 1) {
          // Lote 1 atingiu rate limit após sincronizar 10
          return new Response(
            JSON.stringify({ total: 25, synced: 10, skipped: 0, failed: 1, remaining: 14, rateLimited: true }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } else {
          // Lote 2 não deve ser chamado
          return new Response(JSON.stringify({ error: 'Unexpected call' }), { status: 500 });
        }
      }
      return originalFetch(url);
    };

    const classes50 = generateMockClasses(50);
    const resRateLimit = await syncTeacherFutureClasses('teacher-natalia', classes50, {}, {}, { batchSize: 25 });
    testAssert(callIndex10 === 1, '10.1 Chamadas subsequentes abortadas após detecção de rate limit');
    testAssert(resRateLimit.rateLimited === true, '10.2 rateLimited sinalizado como true');
    testAssert(resRateLimit.synced === 10, '10.3 Preserva as 10 sincronizadas');
    testAssert(resRateLimit.remaining === 39, '10.4 Remaining inclui lote 1 restante (14) + lote 2 não executado (25) = 39');

  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO DOS TESTES DE LOTES E HTTP 413:`);
  console.log(`   Sucessos: ${passedTests}`);
  console.log(`   Falhas:   ${failedTests}`);
  console.log('========================================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
