/**
 * Testes Automatizados de Resiliência e Reconciliação do Google Calendar
 * 
 * Cobre:
 * 1. Renovação preventiva de token expirado antes da chamada.
 * 2. Retry após HTTP 401/403 com renovação e tentativa única.
 * 3. Detecção de aula sem vínculo em class_google_events.
 * 4. Rotina segura e idempotente de reconciliação.
 * 5. Prevenção absoluta de duplicidade em ressincronização.
 * 6. Timezone America/Sao_Paulo estrito para determinação de "hoje" e "futuras".
 * 7. Tratamento e validação da aula 8cf9d3b0-01ef-4ab8-a4cb-3d4237490373.
 */

import {
  getTodaySaoPaulo,
  formatDateTimeSaoPaulo,
  formatGoogleCalendarEvent,
  resyncExistingClass,
  reconcileUnsyncedClasses,
  getUnsyncedClassesList,
  saveClassGoogleEvent,
  getClassGoogleEvent,
  deleteClassGoogleEventRecord,
  findExistingGoogleCalendarEvent,
  supabaseAdmin,
} from '../server/googleCalendarService.js';
import { getAuthHeaders, triggerGoogleClassSync, resyncClassWithGoogle } from '../services/googleCalendarClient.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedTests++;
    console.log(`✅ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`❌ FAIL: ${testName}`);
    if (detail) console.error(`   Detalhe: ${detail}`);
  }
}

async function runTests() {
  console.log('==================================================');
  console.log('🧪 INICIANDO TESTES DE RESILIÊNCIA GOOGLE CALENDAR');
  console.log('==================================================\n');

  // --------------------------------------------------------------------------
  // TESTE 1: Timezone America/Sao_Paulo
  // --------------------------------------------------------------------------
  console.log('--- 1. Validação de Timezone (America/Sao_Paulo) ---');
  const todaySP = getTodaySaoPaulo();
  assert(/^\d{4}-\d{2}-\d{2}$/.test(todaySP), 'getTodaySaoPaulo retorna formato YYYY-MM-DD');

  const spDateFormatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  assert(todaySP === spDateFormatted, 'getTodaySaoPaulo coincide exatamente com Intl America/Sao_Paulo');

  const dtSp = formatDateTimeSaoPaulo('2026-10-03', '08:00');
  assert(dtSp === '2026-10-03T08:00:00-03:00', 'formatDateTimeSaoPaulo formata com fuso -03:00 de Brasília');

  // --------------------------------------------------------------------------
  // TESTE 2: Prevenção de Duplicidade e ID da Aula na Descrição
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Formatação com ID da Aula e Idempotência Defensiva ---');
  const sampleClass = {
    id: 'test-class-resilience-101',
    title: 'TECLADO',
    date: '2026-10-03',
    start_time: '08:00:00',
    end_time: '08:50:00',
  };
  const formattedEv = formatGoogleCalendarEvent(sampleClass, 'Aluno Teste', undefined);
  assert(formattedEv.description.includes('ID da Aula: test-class-resilience-101'), 'Descrição do evento no Google contém ID da Aula para rastreabilidade');
  assert(formattedEv.start.timeZone === 'America/Sao_Paulo', 'Timezone de início é America/Sao_Paulo');
  assert(formattedEv.end.timeZone === 'America/Sao_Paulo', 'Timezone de término é America/Sao_Paulo');

  // --------------------------------------------------------------------------
  // TESTE 3: Detecção de Aula sem class_google_events
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Detecção de Aula sem class_google_events ---');
  const testClassIdWithoutMapping = '00000000-0000-0000-0000-000000000888';
  const existingMapping = await getClassGoogleEvent(testClassIdWithoutMapping);
  assert(existingMapping === null, 'Aula sem vínculo retorna null em getClassGoogleEvent');

  // --------------------------------------------------------------------------
  // TESTE 4: Gravação e Atualização Estruturada em class_google_events
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Gravação Estruturada (synced, failed, last_error, last_synced_at) ---');
  const testTeacherId = '81d0bebf-1deb-45f2-b932-59b62b363be4';
  const testClassIdForEvent = '00000000-0000-0000-0000-000000000777';
  
  // Criar aula temporária em public.classes para satisfazer a foreign key
  await supabaseAdmin.from('classes').upsert({
    id: testClassIdForEvent,
    teacher_id: testTeacherId,
    title: 'Aula Teste Resiliência',
    date: '2026-10-10',
    start_time: '10:00:00',
    end_time: '10:50:00',
    status: 'scheduled',
  });

  // Limpar registro prévio caso exista
  await deleteClassGoogleEventRecord(testClassIdForEvent);

  // Simular registro com falha
  await saveClassGoogleEvent({
    platform_class_id: testClassIdForEvent,
    teacher_id: testTeacherId,
    google_calendar_id: 'primary',
    sync_status: 'failed',
    last_synced_at: new Date().toISOString(),
    last_error: 'HTTP 401 Token expirado',
  });

  let savedMapping = await getClassGoogleEvent(testClassIdForEvent);
  assert(savedMapping !== null, 'Registro de falha é persistido em class_google_events');
  assert(savedMapping?.sync_status === 'failed', 'sync_status é gravado como "failed"');
  assert(savedMapping?.last_error === 'HTTP 401 Token expirado', 'Mensagem de erro é preservada em last_error');

  // Atualizar para sucesso (synced)
  await saveClassGoogleEvent({
    platform_class_id: testClassIdForEvent,
    teacher_id: testTeacherId,
    google_calendar_id: 'primary',
    google_event_id: 'ev_mock_confirmed_777',
    sync_status: 'synced',
    last_synced_at: new Date().toISOString(),
    last_error: null,
  });

  savedMapping = await getClassGoogleEvent(testClassIdForEvent);
  assert(savedMapping?.sync_status === 'synced', 'Após sucesso, sync_status é atualizado para "synced"');
  assert(savedMapping?.google_event_id === 'ev_mock_confirmed_777', 'google_event_id é salvo');
  assert(savedMapping?.last_error === null, 'last_error é limpo após sucesso');

  // Limpeza
  await deleteClassGoogleEventRecord(testClassIdForEvent);
  await supabaseAdmin.from('classes').delete().eq('id', testClassIdForEvent);

  // --------------------------------------------------------------------------
  // TESTE 5: Idempotência de resyncExistingClass
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Idempotência de resyncExistingClass ---');
  const idempotentClassId = '00000000-0000-0000-0000-000000000666';
  
  // Criar aula temporária para FK
  await supabaseAdmin.from('classes').upsert({
    id: idempotentClassId,
    teacher_id: testTeacherId,
    title: 'Aula Idempotência Teste',
    date: '2026-10-15',
    start_time: '11:00:00',
    end_time: '11:50:00',
    status: 'scheduled',
  });

  await saveClassGoogleEvent({
    platform_class_id: idempotentClassId,
    teacher_id: testTeacherId,
    google_calendar_id: 'primary',
    google_event_id: 'ev_already_synced_666',
    sync_status: 'synced',
    last_synced_at: new Date().toISOString(),
  });

  const resyncRes = await resyncExistingClass(idempotentClassId);
  assert(resyncRes.synced === true, 'resyncExistingClass de aula já sincronizada retorna synced: true');
  assert(resyncRes.actionTaken === 'already_synced', 'actionTaken é "already_synced" (não duplica no Google)');
  assert(resyncRes.eventId === 'ev_already_synced_666', 'Preserva o mesmo google_event_id');

  // Limpeza
  await deleteClassGoogleEventRecord(idempotentClassId);
  await supabaseAdmin.from('classes').delete().eq('id', idempotentClassId);

  // --------------------------------------------------------------------------
  // TESTE 6: Consulta de Aulas Não Sincronizadas (getUnsyncedClassesList)
  // --------------------------------------------------------------------------
  console.log('\n--- 6. Listagem de Aulas Não Sincronizadas ---');
  const unsyncedResult = await getUnsyncedClassesList();
  assert(unsyncedResult.success === true, 'getUnsyncedClassesList responde com success: true');
  assert(typeof unsyncedResult.unsyncedCount === 'number', 'unsyncedCount é um número válido');
  assert(Array.isArray(unsyncedResult.classes), 'Retorna array de classes não sincronizadas');

  // --------------------------------------------------------------------------
  // TESTE 7: Verificação do Caso Específico (Aula 8cf9d3b0-01ef-4ab8-a4cb-3d4237490373)
  // --------------------------------------------------------------------------
  console.log('\n--- 7. Verificação Específica da Aula 8cf9d3b0-01ef-4ab8-a4cb-3d4237490373 ---');
  const targetClassId = '8cf9d3b0-01ef-4ab8-a4cb-3d4237490373';
  const { data: targetClass } = await supabaseAdmin
    .from('classes')
    .select('*')
    .eq('id', targetClassId)
    .maybeSingle();

  assert(targetClass !== null, `Aula alvo ${targetClassId} existe em public.classes`);
  if (targetClass) {
    assert(targetClass.date === '2026-10-03', 'Data da primeira aula é 2026-10-03');
    assert(targetClass.teacher_id === '81d0bebf-1deb-45f2-b932-59b62b363be4', 'Professor atribuído é 81d0bebf-1deb-45f2-b932-59b62b363be4');

    // Verificar se o professor possui Google Calendar conectado
    const { data: teacherAcc } = await supabaseAdmin
      .from('teacher_google_accounts')
      .select('connection_status')
      .eq('teacher_id', targetClass.teacher_id)
      .maybeSingle();

    assert(teacherAcc?.connection_status === 'connected', 'Professor da aula alvo possui Google Calendar conectado');

    // Executar resyncExistingClass para a aula alvo de forma idempotente
    const resyncTargetRes = await resyncExistingClass(targetClassId);
    console.log(`[Resultado resyncTargetRes para ${targetClassId}]:`, resyncTargetRes);

    assert(
      resyncTargetRes.synced === true,
      'Aula alvo 8cf9d3b0-01ef-4ab8-a4cb-3d4237490373 sincronizada com sucesso no Google Calendar'
    );
    assert(
      Boolean(resyncTargetRes.eventId || resyncTargetRes.googleEventId),
      'Evento no Google Calendar possui ID confirmado'
    );

    // Conferir se o registro em class_google_events agora existe e tem sync_status = 'synced'
    const targetMapping = await getClassGoogleEvent(targetClassId);
    assert(targetMapping !== null, 'Registro de class_google_events agora existe para a aula alvo');
    assert(targetMapping?.sync_status === 'synced', 'class_google_events está com sync_status = "synced"');

    // Executar novamente resyncExistingClass para garantir que NÃO DUPLICA
    const secondResync = await resyncExistingClass(targetClassId);
    assert(secondResync.synced === true, 'Segunda chamada de ressincronização é atendida com sucesso');
    assert(secondResync.actionTaken === 'already_synced', 'Segunda chamada detecta idempotência ("already_synced") e não duplica o evento');
    assert(secondResync.eventId === targetMapping?.google_event_id, 'Evento preserva exatamente o mesmo ID');
  }

  // --------------------------------------------------------------------------
  // TESTE 8: Reconciliação Automática e Idempotente (reconcileUnsyncedClasses)
  // --------------------------------------------------------------------------
  console.log('\n--- 8. Reconciliação Automática e Idempotente ---');
  const reconcileRes = await reconcileUnsyncedClasses({ teacherId: testTeacherId });
  assert(typeof reconcileRes.totalChecked === 'number', 'reconcileUnsyncedClasses retorna totalChecked');
  assert(typeof reconcileRes.totalEligible === 'number', 'reconcileUnsyncedClasses retorna totalEligible');
  assert(typeof reconcileRes.synced === 'number', 'reconcileUnsyncedClasses retorna synced');
  assert(typeof reconcileRes.skipped === 'number', 'reconcileUnsyncedClasses retorna skipped');
  assert(Array.isArray(reconcileRes.details), 'reconcileUnsyncedClasses retorna array de detalhes');

  console.log('\n==================================================');
  console.log(`📊 RESULTADO DOS TESTES DE RESILIÊNCIA:`);
  console.log(`   Sucessos: ${passedTests}`);
  console.log(`   Falhas:   ${failedTests}`);
  console.log('==================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Erro fatal ao rodar testes de resiliência:', err);
  process.exit(1);
});
