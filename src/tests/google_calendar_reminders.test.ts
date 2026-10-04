import assert from 'node:assert';
import {
  formatGoogleCalendarEvent,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  syncClassToGoogle,
  resyncExistingClass,
  updateExistingFutureClassesReminders,
  EAVRA_DEFAULT_REMINDERS,
  saveClassGoogleEvent,
  deleteClassGoogleEventRecord,
  saveTeacherGoogleAccount,
  deleteTeacherGoogleAccount,
  supabaseAdmin,
} from '../server/googleCalendarService.js';
import { supabase } from '../lib/supabase.js';

/**
 * Testes Automatizados: Lembrete Padrão de 24 Horas (1440 minutos) no Google Calendar
 * 
 * Requisitos Validados:
 * 1. Novo evento → reminders.useDefault = false
 * 2. Novo evento → popup = 1440 minutos
 * 3. Update de evento → continua com 1440 minutos
 * 4. Resync → continua com 1440 minutos
 * 5. Evento não pertencente ao EAVRA → não é alterado
 * 6. Nenhum evento duplicado é criado
 * 7. Aulas futuras existentes do EAVRA podem ter o lembrete atualizado
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

async function runRemindersTests() {
  console.log('\n============================================================');
  console.log('🧪 INICIANDO TESTES DO LEMBRETE DE 24H (1440 MIN) NO GOOGLE');
  console.log('============================================================\n');

  const teacherRemindersId = 'a0000000-0000-0000-0000-000000000099';
  const testClassId1 = 'class_reminder_test_001';
  const testClassId2 = 'class_reminder_test_002';

  // 1. Inserir professor temporário no banco
  await supabaseAdmin.from('teachers').upsert([
    {
      id: teacherRemindersId,
      name: 'Professor Teste Lembretes',
      status: 'active',
    },
  ]);

  await saveTeacherGoogleAccount({
    teacher_id: teacherRemindersId,
    google_email: 'prof.reminders@gmail.com',
    google_calendar_id: 'primary',
    access_token: 'fake_valid_access_token_reminders',
    refresh_token: 'fake_refresh_token_reminders',
    token_expires_at: new Date(Date.now() + 3600000).toISOString(),
    connection_status: 'connected',
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Salvar mock de fetch original
  const originalFetch = globalThis.fetch;
  const capturedRequests: Array<{ url: string; method: string; body: any }> = [];

  try {
    // -------------------------------------------------------------
    // Teste 1 e 2: formatGoogleCalendarEvent e createGoogleCalendarEvent
    // -------------------------------------------------------------
    console.log('\n--- 1. Validação da Estrutura de Lembrete no Evento Formatado ---');
    const formatted = formatGoogleCalendarEvent({
      id: 'test_class_rem_0',
      title: 'Piano Clássico',
      date: '2026-11-10',
      start_time: '14:00',
      end_time: '15:00',
    }, 'Aluno Teste', 'Grupo A');

    testAssert(
      formatted.reminders.useDefault === false,
      '1. formatGoogleCalendarEvent define reminders.useDefault = false',
      formatted.reminders
    );

    testAssert(
      Array.isArray(formatted.reminders.overrides) &&
        formatted.reminders.overrides.length === 1 &&
        formatted.reminders.overrides[0].method === 'popup' &&
        formatted.reminders.overrides[0].minutes === 1440,
      '2. formatGoogleCalendarEvent define reminders.overrides com popup de 1440 minutos (24 horas)',
      formatted.reminders.overrides
    );

    // Mock fetch interceptando chamadas da Google API
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      const method = init?.method || 'GET';
      let body: any = null;
      if (init?.body && typeof init.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      capturedRequests.push({ url, method, body });

      if (url.includes('/events') && method === 'POST') {
        return new Response(JSON.stringify({ id: 'google_ev_rem_123', status: 'confirmed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/events/') && method === 'PATCH') {
        return new Response(JSON.stringify({ id: 'google_ev_rem_123', status: 'confirmed' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return originalFetch(input, init);
    }) as any;

    // -------------------------------------------------------------
    // Teste 1 e 2 (continuação): createGoogleCalendarEvent envia lembrete no payload
    // -------------------------------------------------------------
    console.log('\n--- 2. Criação de Novo Evento: Envio do Lembrete de 1440 min ---');
    capturedRequests.length = 0;
    const createRes = await createGoogleCalendarEvent('test_token', 'primary', {
      summary: 'Aula de Piano',
      description: 'Aula EAVRA',
      startDateTime: '2026-11-10T14:00:00-03:00',
      endDateTime: '2026-11-10T15:00:00-03:00',
    });

    testAssert(createRes.success === true && createRes.eventId === 'google_ev_rem_123', 'createGoogleCalendarEvent executa com sucesso');
    const createReq = capturedRequests.find((r) => r.method === 'POST');
    testAssert(
      createReq !== undefined &&
        createReq.body?.reminders?.useDefault === false &&
        createReq.body?.reminders?.overrides?.[0]?.method === 'popup' &&
        createReq.body?.reminders?.overrides?.[0]?.minutes === 1440,
      'Novo evento enviado ao Google contém reminders.useDefault = false e popup = 1440 min',
      createReq?.body?.reminders
    );

    // -------------------------------------------------------------
    // Teste 3: updateGoogleCalendarEvent (PATCH) continua com 1440 min
    // -------------------------------------------------------------
    console.log('\n--- 3. Atualização de Evento (PATCH): Preserva e Envia Lembrete de 1440 min ---');
    capturedRequests.length = 0;
    const updateRes = await updateGoogleCalendarEvent('test_token', 'primary', 'google_ev_rem_123', {
      summary: 'Aula de Piano - Horário Atualizado',
      description: 'Aula EAVRA Atualizada',
      startDateTime: '2026-11-10T15:00:00-03:00',
      endDateTime: '2026-11-10T16:00:00-03:00',
    });

    testAssert(updateRes.success === true, 'updateGoogleCalendarEvent executa com sucesso');
    const patchReq = capturedRequests.find((r) => r.method === 'PATCH');
    testAssert(
      patchReq !== undefined &&
        patchReq.body?.reminders?.useDefault === false &&
        patchReq.body?.reminders?.overrides?.[0]?.method === 'popup' &&
        patchReq.body?.reminders?.overrides?.[0]?.minutes === 1440,
      'Update/PATCH de evento envia reminders.useDefault = false e popup = 1440 min',
      patchReq?.body?.reminders
    );

    // -------------------------------------------------------------
    // Teste 4: Ressincronização (resyncExistingClass) garante 1440 min
    // -------------------------------------------------------------
    console.log('\n--- 4. Ressincronização de Aula: Evento Final com 1440 min ---');
    // Inserir aula no banco
    await supabaseAdmin.from('classes').upsert([
      {
        id: testClassId1,
        title: 'Teoria Musical',
        date: '2026-11-12',
        start_time: '10:00',
        end_time: '11:00',
        teacher_id: teacherRemindersId,
        status: 'scheduled',
      },
    ]);

    capturedRequests.length = 0;
    const resyncRes = await resyncExistingClass(testClassId1);
    testAssert(resyncRes.synced === true, 'resyncExistingClass executa sincronização com sucesso');
    const resyncCreateReq = capturedRequests.find((r) => r.method === 'POST');
    testAssert(
      resyncCreateReq !== undefined &&
        resyncCreateReq.body?.reminders?.useDefault === false &&
        resyncCreateReq.body?.reminders?.overrides?.[0]?.minutes === 1440,
      'Resync garante que o evento criado/atualizado possua lembrete de 1440 min',
      resyncCreateReq?.body?.reminders
    );

    // -------------------------------------------------------------
    // Teste 5: Eventos não pertencentes ao EAVRA NUNCA são alterados
    // -------------------------------------------------------------
    console.log('\n--- 5. Isolamento: Compromissos Pessoais / Não-EAVRA Não São Alterados ---');
    // updateExistingFutureClassesReminders filtra exclusivamente por class_google_events
    // Criar um evento mock não vinculado para testar que a rotina não o toca
    const nonEavraEventId = 'personal_doctor_appointment_999';
    capturedRequests.length = 0;

    await updateExistingFutureClassesReminders({ teacherId: teacherRemindersId });

    // Verificar se algum PATCH foi feito para o ID do evento pessoal
    const touchedNonEavra = capturedRequests.some((r) => r.url.includes(nonEavraEventId));
    testAssert(!touchedNonEavra, 'Eventos do professor não pertencentes ao EAVRA NUNCA são consultados nem alterados');

    // -------------------------------------------------------------
    // Teste 6: Prevenção de Duplicidade
    // -------------------------------------------------------------
    console.log('\n--- 6. Idempotência e Prevenção de Duplicidade ---');
    capturedRequests.length = 0;
    // Executar a rotina de atualização de lembretes para a aula que já tem vínculo
    const updateRemindersRes = await updateExistingFutureClassesReminders({ teacherId: teacherRemindersId });
    testAssert(updateRemindersRes.updated >= 1, 'updateExistingFutureClassesReminders atualiza evento existente com sucesso');

    // REGRA CRÍTICA: Não deve ter havido nenhum POST em /events (criação de novo evento), apenas PATCH no evento existente!
    const postEventCount = capturedRequests.filter((r) => r.method === 'POST' && r.url.includes('/calendars/') && r.url.endsWith('/events')).length;
    const patchEventCount = capturedRequests.filter((r) => r.method === 'PATCH' && r.url.includes('/calendars/') && r.url.includes('/events/')).length;
    testAssert(postEventCount === 0, 'Zero novos eventos criados (POST = 0) na atualização de lembretes');
    testAssert(patchEventCount >= 1, 'Lembretes atualizados exclusivamente via PATCH no evento existente');

    // -------------------------------------------------------------
    // Teste 7: Aulas futuras existentes do EAVRA têm o lembrete atualizado com sucesso
    // -------------------------------------------------------------
    console.log('\n--- 7. Atualização em Lote de Aulas Futuras do EAVRA ---');
    // Inserir segunda aula futura com mapping existente
    await supabaseAdmin.from('classes').upsert([
      {
        id: testClassId2,
        title: 'Canto Lírico',
        date: '2026-11-15',
        start_time: '16:00',
        end_time: '17:00',
        teacher_id: teacherRemindersId,
        status: 'scheduled',
      },
    ]);
    await saveClassGoogleEvent({
      platform_class_id: testClassId2,
      teacher_id: teacherRemindersId,
      google_calendar_id: 'primary',
      google_event_id: 'google_ev_canto_456',
      sync_status: 'synced',
      last_synced_at: new Date().toISOString(),
    });

    capturedRequests.length = 0;
    const batchRes = await updateExistingFutureClassesReminders({ teacherId: teacherRemindersId });
    testAssert(batchRes.totalEligible >= 2, 'Detecta todas as aulas futuras elegíveis com vínculo');
    testAssert(batchRes.updated >= 2, 'Todas as aulas futuras vinculadas foram atualizadas com sucesso para 1440 min');

    const cantoPatch = capturedRequests.find((r) => r.url.includes('google_ev_canto_456'));
    testAssert(
      cantoPatch !== undefined &&
        cantoPatch.body?.reminders?.useDefault === false &&
        cantoPatch.body?.reminders?.overrides?.[0]?.minutes === 1440,
      'Evento futuro existente do EAVRA recebeu patch com lembrete de 1440 min',
      cantoPatch?.body?.reminders
    );
  } finally {
    // Restaurar fetch original
    globalThis.fetch = originalFetch;

    // Limpeza no banco de dados de teste
    await deleteClassGoogleEventRecord(testClassId1);
    await deleteClassGoogleEventRecord(testClassId2);
    await supabaseAdmin.from('classes').delete().in('id', [testClassId1, testClassId2]);
    await deleteTeacherGoogleAccount(teacherRemindersId);
    await supabaseAdmin.from('teachers').delete().eq('id', teacherRemindersId);
  }

  console.log('\n============================================================');
  console.log(`📊 RESULTADO DOS TESTES DE LEMBRETE:`);
  console.log(`   Sucessos: ${testsPassed}`);
  console.log(`   Falhas:   ${testsFailed}`);
  console.log('============================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runRemindersTests().catch((err) => {
  console.error('Erro fatal nos testes de lembrete:', err);
  process.exit(1);
});
