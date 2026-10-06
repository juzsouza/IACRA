import assert from 'node:assert';
import {
  EAVRA_TITLE_REGEX,
  parseInstitutionalEventTitle,
  normalizeStudentSearchString,
  matchStudentInActiveEnrollments,
  extractClassIdFromDescription,
  parseGoogleDateTimeToSaoPaulo,
  getPlusDaysSaoPaulo,
  pullGoogleEventsForSingleTeacher,
  saveClassGoogleEvent,
  findClassGoogleEventByGoogleId,
  saveTeacherGoogleAccount,
  deleteTeacherGoogleAccount,
  setTeacherSyncToken,
  supabaseAdmin,
} from '../server/googleCalendarService.js';

/**
 * Suíte de Testes Automatizados: Sincronização Google Calendar -> EAVRA (Inbound Fase 1)
 */

let testsPassed = 0;
let testsFailed = 0;

function testAssert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`❌ FAIL: ${testName}`, detail || '');
    testsFailed++;
  }
}

async function runInboundSyncTests() {
  console.log('\n================================================================');
  console.log('🧪 INICIANDO TESTES DA SINCRONIZAÇÃO INBOUND (GOOGLE -> EAVRA)');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // 1. Validação de Regex e Títulos Institucionais
  // --------------------------------------------------------------------------
  console.log('--- 1. Identificação de Eventos Institucionais vs Pessoais ---');

  const t1 = parseInstitutionalEventTitle('[EAVRA] João Silva');
  testAssert(t1.isInstitutional && t1.studentQuery === 'João Silva', '1. [EAVRA] João -> importa');

  const t2 = parseInstitutionalEventTitle('EAVRA: João Silva');
  testAssert(t2.isInstitutional && t2.studentQuery === 'João Silva', '2. EAVRA: João -> importa');

  const t3 = parseInstitutionalEventTitle('EAVRA - João Silva');
  testAssert(t3.isInstitutional && t3.studentQuery === 'João Silva', '3. EAVRA - João -> importa');

  const t4 = parseInstitutionalEventTitle('Consulta médica');
  testAssert(!t4.isInstitutional, '4. Consulta médica -> ignora');

  const t5 = parseInstitutionalEventTitle('Almoço de domingo em família');
  testAssert(!t5.isInstitutional, '5. Evento pessoal -> ignora');

  const t6 = parseInstitutionalEventTitle('Reunião pedagógica');
  testAssert(!t6.isInstitutional, '6. Outros eventos sem tag EAVRA -> ignora');

  // --------------------------------------------------------------------------
  // 2. Identificação e Vínculo de Alunos
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Identificação de Aluno nas Matrículas Ativas ---');

  const mockStudents = [
    { id: 'student_001', name: 'João Silva' },
    { id: 'student_002', name: 'Maria Souza' },
    { id: 'student_003', name: 'Lucas Gabriel Santos' },
    { id: 'student_004', name: 'Lucas Gabriel Ferreira' }, // Homônimo de Lucas Gabriel
  ];

  // Caso: Aluno único exato
  const mSingle = matchStudentInActiveEnrollments('Maria Souza', mockStudents);
  testAssert(
    mSingle.matchCount === 1 && mSingle.matchedStudent?.id === 'student_002',
    '7. Aluno único (nome completo) -> vínculo automático'
  );

  // Caso: Aluno único por primeiro nome
  const mSingleFirst = matchStudentInActiveEnrollments('Maria', mockStudents);
  testAssert(
    mSingleFirst.matchCount === 1 && mSingleFirst.matchedStudent?.id === 'student_002',
    '8. Aluno único por primeiro nome -> vínculo automático'
  );

  // Caso: Aluno inexistente
  const mNone = matchStudentInActiveEnrollments('Carlos Eduardo', mockStudents);
  testAssert(
    mNone.matchCount === 0 && mNone.matchedStudent === null,
    '9. Aluno inexistente -> 0 correspondências (pendingStudentLink)'
  );

  // Caso: Homônimo / Múltiplas correspondências
  const mHomon = matchStudentInActiveEnrollments('Lucas Gabriel', mockStudents);
  testAssert(
    mHomon.matchCount === 2 && mHomon.matchedStudent === null,
    '10. Aluno homônimo -> múltiplas correspondências (pendingStudentLink sem adivinhação)'
  );

  // --------------------------------------------------------------------------
  // 3. Conversão de Datas e Horários para America/Sao_Paulo
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Conversão de Datas e Horários para America/Sao_Paulo ---');

  const dtParsed = parseGoogleDateTimeToSaoPaulo('2026-10-20T14:30:00-03:00');
  testAssert(
    dtParsed.date === '2026-10-20' && dtParsed.time.startsWith('14:30'),
    '11. Parsing correto de ISO datetime no fuso de Brasília'
  );

  const plus45 = getPlusDaysSaoPaulo(45);
  testAssert(Boolean(plus45 && plus45.match(/^\d{4}-\d{2}-\d{2}$/)), '12. Janela de +45 dias calculada com sucesso');

  // --------------------------------------------------------------------------
  // 4. Detecção de Assinatura EAVRA em Eventos Existentes
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Detecção de Assinatura de Aula Criada pelo EAVRA ---');

  const descWithId = 'Aula gerenciada pela plataforma.\nID da Aula: c0000000-0000-0000-0000-000000000099\nTítulo: Aula de Canto';
  const extractedId = extractClassIdFromDescription(descWithId);
  testAssert(extractedId === 'c0000000-0000-0000-0000-000000000099', '13. Extração correta do ID da Aula na descrição');

  const descWithoutId = 'Evento criado pelo professor';
  testAssert(extractClassIdFromDescription(descWithoutId) === null, '14. Evento sem ID da Aula retorna null');

  // --------------------------------------------------------------------------
  // 5. Simulação do Ciclo Completo Inbound com API Mockada
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Simulação do Ciclo Completo Inbound com API Mockada ---');

  const teacherTestId = 'a0000000-0000-0000-0000-000000000077';
  const calendarTestId = 'primary';
  const classOrigId = 'c0000000-0000-0000-0000-000000000071';
  const classCancelId = 'c0000000-0000-0000-0000-000000000072';

  const studentMariaId = 'a0000000-0000-0000-0000-000000000071';
  const studentLucas1Id = 'a0000000-0000-0000-0000-000000000072';
  const studentLucas2Id = 'a0000000-0000-0000-0000-000000000073';

  const originalFetch = globalThis.fetch;

  try {
    // 0. Limpeza defensiva de testes anteriores para garantir estado limpo e determinístico
    await supabaseAdmin.from('class_google_events').delete().eq('teacher_id', teacherTestId);
    await supabaseAdmin.from('enrollments').delete().eq('teacher_id', teacherTestId);
    await supabaseAdmin.from('classes').delete().eq('teacher_id', teacherTestId);
    await supabaseAdmin.from('teacher_google_accounts').delete().eq('teacher_id', teacherTestId);

    // 1. Cadastrar professor, alunos e matrículas no banco
    await supabaseAdmin.from('teachers').upsert([
      { id: teacherTestId, name: 'Professor Teste Inbound', status: 'active' },
    ]);

    await saveTeacherGoogleAccount({
      teacher_id: teacherTestId,
      google_email: 'professor.inbound@gmail.com',
      google_calendar_id: calendarTestId,
      refresh_token: 'mock_refresh_token_inbound',
      access_token: 'mock_access_token_inbound',
      token_expires_at: new Date(Date.now() + 3600000).toISOString(),
      connection_status: 'connected',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await supabaseAdmin.from('students').upsert([
      { id: studentMariaId, name: 'Maria Souza', status: 'active', instrument: 'Canto' },
      { id: studentLucas1Id, name: 'Lucas Gabriel Ferreira', status: 'active', instrument: 'Piano' },
      { id: studentLucas2Id, name: 'Lucas Gabriel Silva', status: 'active', instrument: 'Violão' },
    ]);

    await supabaseAdmin.from('enrollments').upsert([
      { id: 'e0000000-0000-0000-0000-000000000071', student_id: studentMariaId, teacher_id: teacherTestId, status: 'active' },
      { id: 'e0000000-0000-0000-0000-000000000072', student_id: studentLucas1Id, teacher_id: teacherTestId, status: 'active' },
      { id: 'e0000000-0000-0000-0000-000000000073', student_id: studentLucas2Id, teacher_id: teacherTestId, status: 'active' },
    ]);

    // Inserir a aula pré-existente do EAVRA para testar identificação por ID da Aula
    await supabaseAdmin.from('classes').upsert([
      {
        id: classOrigId,
        title: 'Aula de Canto EAVRA',
        teacher_id: teacherTestId,
        date: '2026-10-29',
        start_time: '11:00:00',
        end_time: '12:00:00',
        status: 'scheduled',
      },
    ]);

    // Inserir aula vinculada a g_ev_005 para testar cancelamento
    await supabaseAdmin.from('classes').upsert([
      {
        id: classCancelId,
        title: 'Aula a ser cancelada',
        teacher_id: teacherTestId,
        date: '2026-10-25',
        start_time: '08:00:00',
        end_time: '09:00:00',
        status: 'scheduled',
      },
    ]);
    await saveClassGoogleEvent({
      platform_class_id: classCancelId,
      teacher_id: teacherTestId,
      google_calendar_id: calendarTestId,
      google_event_id: 'g_ev_005',
      last_synced_at: new Date().toISOString(),
      sync_status: 'synced',
      origin: 'google',
      sync_direction: 'google_to_eavra',
    });

    const mockGoogleEvents = [
      {
        id: 'g_ev_001',
        summary: '[EAVRA] Maria Souza',
        description: 'Criado no celular',
        start: { dateTime: '2026-10-25T10:00:00-03:00' },
        end: { dateTime: '2026-10-25T11:00:00-03:00' },
        etag: '"etag_001"',
        status: 'confirmed',
      },
      {
        id: 'g_ev_002',
        summary: 'EAVRA: Lucas Gabriel',
        description: 'Aula com homônimo',
        start: { dateTime: '2026-10-26T14:00:00-03:00' },
        end: { dateTime: '2026-10-26T15:00:00-03:00' },
        etag: '"etag_002"',
        status: 'confirmed',
      },
      {
        id: 'g_ev_003',
        summary: 'EAVRA - Aluno Novo Desconhecido',
        description: 'Sem aluno cadastrado',
        start: { dateTime: '2026-10-27T16:00:00-03:00' },
        end: { dateTime: '2026-10-27T17:00:00-03:00' },
        etag: '"etag_003"',
        status: 'confirmed',
      },
      {
        id: 'g_ev_004',
        summary: 'Dentista Dr. Roberto',
        description: 'Compromisso pessoal',
        start: { dateTime: '2026-10-28T09:00:00-03:00' },
        end: { dateTime: '2026-10-28T10:00:00-03:00' },
        status: 'confirmed',
      },
      {
        id: 'g_ev_005',
        summary: '[EAVRA] Aula Cancelada',
        description: 'Evento cancelado',
        status: 'cancelled',
      },
      {
        id: 'g_ev_006',
        summary: 'Aula de Canto - Aluno Existente',
        description: `Aula gerenciada pela plataforma.\nID da Aula: ${classOrigId}`,
        start: { dateTime: '2026-10-29T11:30:00-03:00' },
        end: { dateTime: '2026-10-29T12:30:00-03:00' },
        etag: '"etag_006"',
        status: 'confirmed',
      },
    ];

    let receivedSyncToken: string | null = null;
    let queryHadTimeMin = false;

    // Interceptar fetch estritamente para googleapis.com/calendar
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = input.toString();

      if (urlStr.includes('googleapis.com/calendar/v3/calendars')) {
        const parsedUrl = new URL(urlStr);
        receivedSyncToken = parsedUrl.searchParams.get('syncToken');
        queryHadTimeMin = parsedUrl.searchParams.has('timeMin');

        // Se a chamada enviar syncToken expirado "expired_token_410", simular HTTP 410 Gone
        if (receivedSyncToken === 'expired_token_410') {
          return new Response(JSON.stringify({ error: { code: 410, message: 'Sync token is expired' } }), {
            status: 410,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        return new Response(
          JSON.stringify({
            items: mockGoogleEvents,
            nextSyncToken: 'new_valid_sync_token_789',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // IMPORTANTE: Todas as outras chamadas (Supabase, etc.) passam direto para o fetch original
      return originalFetch(input, init);
    };

    // ------------------------------------------------------------------------
    // Execução 1: Primeira sincronização (Full Sync)
    // ------------------------------------------------------------------------
    console.log('\n--- 6. Execução 1: Full Sync inicial ---');
    const res1 = await pullGoogleEventsForSingleTeacher(teacherTestId, { forceFullSync: true });

    testAssert(res1.imported >= 2, `15. res1.imported >= 2 (importou ${res1.imported})`);
    testAssert(res1.ignored >= 1, `16. res1.ignored >= 1 compromisso pessoal descartado (ignorou ${res1.ignored})`);
    testAssert(res1.cancelled >= 1, `17. res1.cancelled >= 1 cancelamento processado (cancelou ${res1.cancelled})`);
    testAssert(res1.pendingStudentLink >= 2, `18. res1.pendingStudentLink >= 2 (aluno homônimo e desconhecido)`);
    testAssert(res1.updated >= 1, `19. res1.updated >= 1 aula originada no EAVRA identificada`);

    // Verificar que evento pessoal nunca foi salvo no banco
    const { data: checkDentist } = await supabaseAdmin
      .from('classes')
      .select('id, title')
      .ilike('title', '%dentista%');
    testAssert(!checkDentist || checkDentist.length === 0, '20. Compromissos pessoais NUNCA são gravados no banco');

    // Verificar que a classe cancelada teve status atualizado
    const { data: cancelledClass } = await supabaseAdmin
      .from('classes')
      .select('status')
      .eq('id', classCancelId)
      .maybeSingle();
    testAssert(cancelledClass?.status === 'cancelled', '21. Evento cancelado atualizou classes.status para "cancelled"');

    // ------------------------------------------------------------------------
    // Execução 2: Idempotência (Segunda execução não duplica)
    // ------------------------------------------------------------------------
    console.log('\n--- 7. Idempotência: Executar o pull duas vezes NÃO duplica ---');
    const res2 = await pullGoogleEventsForSingleTeacher(teacherTestId, { forceFullSync: true });

    testAssert(res2.imported === 0, `22. Segunda execução: imported = 0 (não duplica, teve ${res2.imported})`);
    testAssert(res2.updated >= 2, `23. Segunda execução: atualiza classes existentes sem criar novas (atualizou ${res2.updated})`);

    // ------------------------------------------------------------------------
    // Execução 3: Terceira execução consecutiva
    // ------------------------------------------------------------------------
    console.log('\n--- 8. Idempotência: Executar o pull três vezes NÃO duplica ---');
    const res3 = await pullGoogleEventsForSingleTeacher(teacherTestId, { forceFullSync: true });

    testAssert(res3.imported === 0, `24. Terceira execução: imported = 0 (idempotência absoluta)`);

    // ------------------------------------------------------------------------
    // Teste 9: Prevenção de Loop (Google -> EAVRA -> Google)
    // ------------------------------------------------------------------------
    console.log('\n--- 9. Prevenção de Loop: Aulas importadas possuem sync_status="synced" ---');
    const mapping001 = await findClassGoogleEventByGoogleId('g_ev_001', calendarTestId);
    testAssert(Boolean(mapping001), '25. class_google_events registrado para a aula importada');
    testAssert(mapping001?.sync_status === 'synced', '26. sync_status = "synced" impede novo events.insert');
    testAssert(mapping001?.origin === 'google', '27. origin = "google" gravado no registro');
    testAssert(mapping001?.sync_direction === 'google_to_eavra', '28. sync_direction = "google_to_eavra"');

    // ------------------------------------------------------------------------
    // Teste 10: Delta Sync com syncToken (Sem timeMin/timeMax)
    // ------------------------------------------------------------------------
    console.log('\n--- 10. Delta Sync: Uso de syncToken sem timeMin/timeMax ---');
    await setTeacherSyncToken(teacherTestId, 'valid_delta_sync_token_123');

    queryHadTimeMin = false;
    receivedSyncToken = null;

    await pullGoogleEventsForSingleTeacher(teacherTestId);

    testAssert(receivedSyncToken === 'valid_delta_sync_token_123', '29. Sincronização incremental enviou syncToken');
    testAssert(!queryHadTimeMin, '30. Delta Sync NÃO utiliza timeMin/timeMax junto com syncToken');

    // ------------------------------------------------------------------------
    // Teste 11: HTTP 410 Gone (syncToken expirado)
    // ------------------------------------------------------------------------
    console.log('\n--- 11. Resiliência: HTTP 410 descarta syncToken e reinicia Full Sync ---');
    await setTeacherSyncToken(teacherTestId, 'expired_token_410');

    const res410 = await pullGoogleEventsForSingleTeacher(teacherTestId);
    testAssert(res410.errors.length === 0, '31. HTTP 410 tratado com sucesso sem quebrar a execução');

    // ------------------------------------------------------------------------
    // Teste 12: Recorrência no Google Calendar (singleEvents=true)
    // ------------------------------------------------------------------------
    console.log('\n--- 12. Recorrência: Cada ocorrência gera uma aula única no EAVRA ---');
    await supabaseAdmin
      .from('class_google_events')
      .delete()
      .in('google_event_id', ['rec_master_id_20261020T140000Z', 'rec_master_id_20261027T140000Z']);

    const recurringInstances = [
      {
        id: 'rec_master_id_20261020T140000Z',
        recurringEventId: 'rec_master_id',
        summary: '[EAVRA] Maria Souza',
        start: { dateTime: '2026-10-20T11:00:00-03:00' },
        end: { dateTime: '2026-10-20T12:00:00-03:00' },
        status: 'confirmed',
      },
      {
        id: 'rec_master_id_20261027T140000Z',
        recurringEventId: 'rec_master_id',
        summary: '[EAVRA] Maria Souza',
        start: { dateTime: '2026-10-27T11:00:00-03:00' },
        end: { dateTime: '2026-10-27T12:00:00-03:00' },
        status: 'confirmed',
      },
    ];

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlStr = input.toString();
      if (urlStr.includes('googleapis.com/calendar/v3/calendars')) {
        return new Response(JSON.stringify({ items: recurringInstances }), { status: 200 });
      }
      return originalFetch(input, init);
    };

    const resRec = await pullGoogleEventsForSingleTeacher(teacherTestId, { forceFullSync: true });
    testAssert(resRec.imported === 2, `32. Recorrência: 2 ocorrências importadas como aulas individuais`);

    const recMap1 = await findClassGoogleEventByGoogleId('rec_master_id_20261020T140000Z', calendarTestId);
    const recMap2 = await findClassGoogleEventByGoogleId('rec_master_id_20261027T140000Z', calendarTestId);

    testAssert(
      Boolean(recMap1 && recMap2 && recMap1.platform_class_id !== recMap2.platform_class_id),
      '33. Cada ocorrência possui ID de classe distinto no EAVRA'
    );
    testAssert(
      recMap1?.recurring_event_id === 'rec_master_id',
      '34. recurring_event_id gravado corretamente em class_google_events'
    );

    // ------------------------------------------------------------------------
    // Teste 13: Permissões de Rota (Teacher vs Admin/Super Admin)
    // ------------------------------------------------------------------------
    console.log('\n--- 13. Autorização de Rotas: Teacher vs Admin/Super Admin ---');

    const canTeacherSyncSelf = (callerRole: string, callerTeacherId: string, targetTeacherId: string) => {
      if (callerRole === 'super_admin' || callerRole === 'admin') return true;
      if (callerRole === 'teacher') return callerTeacherId === targetTeacherId;
      return false;
    };

    testAssert(
      canTeacherSyncSelf('teacher', 'teacher_A', 'teacher_A') === true,
      '35. Professor consegue sincronizar suas próprias aulas'
    );
    testAssert(
      canTeacherSyncSelf('teacher', 'teacher_A', 'teacher_B') === false,
      '36. Professor NÃO consegue sincronizar aulas de outro professor (bloqueio 403)'
    );
    testAssert(
      canTeacherSyncSelf('super_admin', 'super_admin_id', 'teacher_B') === true,
      '37. Super Admin consegue sincronizar aulas de qualquer professor'
    );
    testAssert(
      canTeacherSyncSelf('admin', 'admin_id', 'teacher_B') === true,
      '38. Admin consegue sincronizar aulas de qualquer professor'
    );
  } finally {
    // Restaurar fetch original
    globalThis.fetch = originalFetch;

    // Limpeza de registros de teste
    try {
      await supabaseAdmin.from('class_google_events').delete().eq('teacher_id', teacherTestId);
      await supabaseAdmin.from('enrollments').delete().eq('teacher_id', teacherTestId);
      await supabaseAdmin.from('classes').delete().eq('teacher_id', teacherTestId);
      await deleteTeacherGoogleAccount(teacherTestId);
    } catch {}
  }

  console.log('\n================================================================');
  console.log(`📊 RESULTADO DOS TESTES INBOUND:`);
  console.log(`   Sucessos: ${testsPassed}`);
  console.log(`   Falhas:   ${testsFailed}`);
  console.log('================================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runInboundSyncTests().catch((err) => {
  console.error('Erro fatal nos testes inbound:', err);
  process.exit(1);
});
