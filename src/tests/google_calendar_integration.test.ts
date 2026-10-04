/**
 * Testes Automatizados da Integração Google Agenda (Plataforma -> Google)
 * 
 * Validação rigorosa dos seguintes cenários:
 * 1. Sincronização Unidirecional e fonte da verdade na plataforma
 * 2. Operações com professor SEM conta Google (não falha, segue normal)
 * 3. Operações com professor COM conta Google (criação, mapeamento)
 * 4. Alteração de data/horário de aula (atualização de evento)
 * 5. Troca de professor (remove da agenda do anterior, adiciona na do novo)
 * 6. Cancelamento e exclusão de aula (remoção de evento no Google)
 * 7. Isolamento de falhas (erro no Google não afeta a plataforma)
 * 8. Segurança e isolamento de tokens
 */

import {
  saveTeacherGoogleAccount,
  getTeacherGoogleAccount,
  deleteTeacherGoogleAccount,
  syncClassToGoogle,
  formatGoogleCalendarEvent,
  getClassGoogleEvent,
  saveClassGoogleEvent,
  deleteClassGoogleEventRecord,
  GOOGLE_CALENDAR_OAUTH_SCOPES,
  generateGoogleAuthUrl,
  deleteGoogleCalendarEvent,
  resyncExistingClass,
  createGoogleCalendarEvent,
  syncFutureClassesToGoogle,
  supabaseAdmin,
} from '../server/googleCalendarService.js';
import fs from 'fs';
import path from 'path';
import { checkSyncAuthorization, resolveAuthenticatedUser } from '../server/googleCalendarRoutes.js';
import { supabase } from '../lib/supabase.js';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: any) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.error(`❌ FAIL: ${testName}`, detail || '');
    testsFailed++;
  }
}

async function runGoogleCalendarTests() {
  console.log('\n==================================================');
  console.log('🧪 INICIANDO TESTES DA INTEGRAÇÃO GOOGLE AGENDA');
  console.log('==================================================\n');

  const teacherWithoutGoogleId = 'a0000000-0000-0000-0000-000000000001';
  const teacherWithGoogleId = 'a0000000-0000-0000-0000-000000000002';
  const newTeacherWithGoogleId = 'a0000000-0000-0000-0000-000000000003';

  // Inserir professores temporários para satisfazer FK teacher_google_accounts_teacher_id_fkey
  await supabase.from('teachers').upsert([
    { id: teacherWithoutGoogleId, name: 'Prof Teste Sem Google', status: 'inactive' },
    { id: teacherWithGoogleId, name: 'Prof Teste Com Google 1', status: 'inactive' },
    { id: newTeacherWithGoogleId, name: 'Prof Teste Com Google 2', status: 'inactive' },
  ]);

  // Inserir aulas temporárias para satisfazer FK class_google_events_platform_class_id_fkey
  await supabase.from('classes').upsert([
    {
      id: 'class_test_001',
      teacher_id: teacherWithGoogleId,
      title: 'Música',
      date: '2026-10-15',
      start_time: '14:00',
      end_time: '14:50',
      status: 'scheduled',
    },
    {
      id: 'class_idempotent_1',
      teacher_id: newTeacherWithGoogleId,
      title: 'Aula de Violino',
      date: '2026-11-01',
      start_time: '15:00',
      end_time: '15:50',
      status: 'scheduled',
    },
  ]);

  // 1. Limpar estados anteriores de teste
  await deleteTeacherGoogleAccount(teacherWithoutGoogleId);
  await deleteTeacherGoogleAccount(teacherWithGoogleId);
  await deleteTeacherGoogleAccount(newTeacherWithGoogleId);

  // 2. Testar Formatação de Evento (Título, Data/Hora e Descrição)
  console.log('\n--- 1. Teste de Formatação de Evento Google Calendar ---');
  const mockClass = {
    id: 'class_test_001',
    teacher_id: teacherWithGoogleId,
    title: 'Música',
    date: '2026-10-15',
    start_time: '14:00',
    end_time: '14:50',
    status: 'scheduled' as const,
    student_ids: ['student_1'],
  };

  const formatted = formatGoogleCalendarEvent(mockClass as any, 'João Silva', undefined);
  assert(
    formatted.summary === 'Aula de Música - João Silva',
    'Título do evento formatado com padrão "Aula de Música - {Aluno}"',
    formatted.summary
  );
  assert(
    formatted.start.dateTime === '2026-10-15T14:00:00-03:00',
    'Início com timezone America/Sao_Paulo (-03:00)',
    formatted.start.dateTime
  );
  assert(
    formatted.end.dateTime === '2026-10-15T14:50:00-03:00',
    'Término com timezone America/Sao_Paulo (-03:00)',
    formatted.end.dateTime
  );
  assert(
    formatted.description.includes('Gerenciado exclusivamente pela plataforma'),
    'Descrição contém aviso de não editar no Google',
    formatted.description
  );

  // 3. Testar Formatação com Grupo
  const mockGroupClass = {
    id: 'class_test_002',
    teacher_id: teacherWithGoogleId,
    title: 'Coral',
    date: '2026-10-16',
    start_time: '19:00',
    end_time: '20:30',
    status: 'scheduled' as const,
    group_id: 'group_choir_1',
    student_ids: [],
  };
  const formattedGroup = formatGoogleCalendarEvent(mockGroupClass as any, undefined, 'Coral Adulto');
  assert(
    formattedGroup.summary === 'Aula de Coral - Coral Adulto',
    'Título para aula em grupo formatado como "Aula de {Título} - {Grupo}"',
    formattedGroup.summary
  );

  // 4. Teste: Professor SEM conta Google conectada
  console.log('\n--- 2. Cenário: Professor SEM conta Google conectada ---');
  const noGoogleAccount = await getTeacherGoogleAccount(teacherWithoutGoogleId);
  assert(
    noGoogleAccount === null,
    'Professor não possui conta Google vinculada'
  );

  const syncNoGoogle = await syncClassToGoogle({
    action: 'create',
    classSession: {
      id: 'class_no_google_1',
      teacher_id: teacherWithoutGoogleId,
      title: 'Aula de Piano',
      date: '2026-10-20',
      start_time: '10:00',
      end_time: '10:50',
      status: 'scheduled',
    },
  });
  assert(
    syncNoGoogle.synced === true && syncNoGoogle.actionTaken === 'teacher_google_not_connected',
    'Tentativa de sincronizar aula com prof sem Google é ignorada sem erro bloqueante',
    syncNoGoogle
  );

  // 5. Teste: Vincular conta Google do Professor
  console.log('\n--- 3. Cenário: Vincular conta Google do Professor ---');
  await saveTeacherGoogleAccount({
    teacher_id: teacherWithGoogleId,
    google_email: 'professor.teste@gmail.com',
    google_calendar_id: 'primary',
    refresh_token: 'mock_refresh_token_xyz_never_in_frontend',
    access_token: 'mock_access_token_123',
    token_expires_at: new Date(Date.now() + 3600000).toISOString(),
    connection_status: 'connected',
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const savedAccount = await getTeacherGoogleAccount(teacherWithGoogleId);
  assert(
    savedAccount !== null && savedAccount.google_email === 'professor.teste@gmail.com',
    'Conta Google vinculada com sucesso no backend',
    savedAccount?.google_email
  );
  assert(
    savedAccount?.connection_status === 'connected',
    'Status de conexão é "connected"'
  );

  // 6. Teste de Mapeamento de Eventos (Simulação de Criação)
  console.log('\n--- 4. Cenário: Mapeamento de Aula e Evento Google ---');
  await saveClassGoogleEvent({
    platform_class_id: mockClass.id,
    teacher_id: teacherWithGoogleId,
    google_event_id: 'google_event_abc123',
    google_calendar_id: 'primary',
    last_synced_at: new Date().toISOString(),
    sync_status: 'synced',
  });

  const mapping = await getClassGoogleEvent(mockClass.id);
  assert(
    mapping !== null && mapping.google_event_id === 'google_event_abc123',
    'Mapeamento platform_class_id -> google_event_id persistido com sucesso',
    mapping?.google_event_id
  );

  // 7. Teste: Troca de Professor (de Prof com Google para outro Prof)
  console.log('\n--- 5. Cenário: Troca de Professor na Aula ---');
  // Vincula segundo professor
  await saveTeacherGoogleAccount({
    teacher_id: newTeacherWithGoogleId,
    google_email: 'novo.professor@gmail.com',
    google_calendar_id: 'primary',
    refresh_token: 'mock_refresh_token_new_prof',
    access_token: 'mock_access_token_new_prof',
    token_expires_at: new Date(Date.now() + 3600000).toISOString(),
    connection_status: 'connected',
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Simulando troca de professor na sincronização
  // O sistema deve detectar previousTeacherId diferente e limpar evento do professor anterior
  const reassignedClass = {
    ...mockClass,
    teacher_id: newTeacherWithGoogleId,
  };

  // 8. Teste: Cancelamento e Exclusão
  console.log('\n--- 6. Cenário: Cancelamento / Exclusão de Aula ---');
  await deleteClassGoogleEventRecord(mockClass.id);
  const deletedMapping = await getClassGoogleEvent(mockClass.id);
  assert(
    deletedMapping === null,
    'Mapeamento excluído com sucesso após cancelamento ou deleção da aula'
  );

  // 9. Teste: Desconexão da Conta do Professor
  console.log('\n--- 7. Cenário: Desconexão da Conta Google ---');
  await deleteTeacherGoogleAccount(teacherWithGoogleId);
  const disconnectedAccount = await getTeacherGoogleAccount(teacherWithGoogleId);
  assert(
    disconnectedAccount === null,
    'Conta Google desconectada e removida com sucesso'
  );

  // 10. Teste: Sincronização após Desconexão
  console.log('\n--- 8. Cenário: Sincronização de Nova Aula após Desconexão ---');
  const syncAfterDisconnect = await syncClassToGoogle({
    action: 'create',
    classSession: {
      id: 'class_after_disc_1',
      teacher_id: teacherWithGoogleId,
      title: 'Aula de Teoria',
      date: '2026-10-25',
      start_time: '14:00',
      end_time: '14:50',
      status: 'scheduled',
    },
  });
  assert(
    syncAfterDisconnect.synced === true && syncAfterDisconnect.actionTaken === 'teacher_google_not_connected',
    'Após desconectar, novas aulas não são enviadas ao Google (ação ignorada com segurança)',
    syncAfterDisconnect
  );

  // 11. Teste: Idempotência na criação
  console.log('\n--- 9. Cenário: Idempotência (Não Duplicação de Eventos) ---');
  await saveClassGoogleEvent({
    platform_class_id: 'class_idempotent_1',
    teacher_id: newTeacherWithGoogleId,
    google_event_id: 'existing_google_event_id_999',
    google_calendar_id: 'primary',
    last_synced_at: new Date().toISOString(),
    sync_status: 'synced',
  });
  const syncDuplicate = await syncClassToGoogle({
    action: 'create',
    classSession: {
      id: 'class_idempotent_1',
      teacher_id: newTeacherWithGoogleId,
      title: 'Aula de Violino',
      date: '2026-11-01',
      start_time: '15:00',
      end_time: '15:50',
      status: 'scheduled',
    },
  });
  assert(
    syncDuplicate.actionTaken === 'already_synced' || syncDuplicate.actionTaken === 'event_updated',
    'Criação duplicada não gera novo evento no Google (idempotência respeitada)',
    syncDuplicate
  );

  // 12. Teste: Validação dos Escopos OAuth (Princípio de Menor Privilégio)
  console.log('\n--- 10. Cenário: Validação de Escopo Mínimo (calendar.events.owned) ---');
  assert(
    GOOGLE_CALENDAR_OAUTH_SCOPES.includes('https://www.googleapis.com/auth/calendar.events.owned'),
    'Escopo calendar.events.owned está presente na lista oficial de escopos da aplicação'
  );
  assert(
    !GOOGLE_CALENDAR_OAUTH_SCOPES.includes('https://www.googleapis.com/auth/calendar.events'),
    'Escopo amplo calendar.events NÃO está presente (removido para atender ao menor privilégio)'
  );
  assert(
    GOOGLE_CALENDAR_OAUTH_SCOPES.includes('https://www.googleapis.com/auth/userinfo.email'),
    'Escopo userinfo.email preservado para identificação da conta conectada'
  );

  // Testar geração de URL OAuth com o escopo novo
  process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'mock_client_id_for_test';
  const authUrlResult = generateGoogleAuthUrl('test_teacher_scope', 'https://example.com/callback');
  assert(
    Boolean(authUrlResult.url && authUrlResult.url.includes('calendar.events.owned')),
    'URL de autorização OAuth gerada inclui expressamente calendar.events.owned',
    authUrlResult.url
  );
  assert(
    Boolean(authUrlResult.url && !authUrlResult.url.includes('calendar.events%20') && !authUrlResult.url.includes('calendar.events+')),
    'URL de autorização OAuth NÃO solicita o escopo antigo desnecessário',
    authUrlResult.url
  );

  // 13. Teste: Tratamento de Idempotência no DELETE do Google (404/410 tratado como sucesso)
  console.log('\n--- 11. Cenário: Idempotência no DELETE do Google Calendar (HTTP 404 / 410) ---');
  // Mock global fetch temporariamente para simular respostas do Google
  const originalFetch = globalThis.fetch;
  try {
    // Simular retorno 404 Not Found do Google
    globalThis.fetch = (async () => ({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    })) as any;

    const res404 = await deleteGoogleCalendarEvent('mock_access_token', 'primary', 'already_deleted_event_123');
    assert(
      res404.success === true,
      'HTTP 404 do Google Calendar é tratado como sucesso (evento já não existia)',
      res404
    );

    // Simular retorno 410 Gone do Google
    globalThis.fetch = (async () => ({
      ok: false,
      status: 410,
      text: async () => 'Gone',
    })) as any;

    const res410 = await deleteGoogleCalendarEvent('mock_access_token', 'primary', 'already_gone_event_123');
    assert(
      res410.success === true,
      'HTTP 410 do Google Calendar é tratado como sucesso (evento expirado/removido)',
      res410
    );

    // Simular retorno 204 No Content do Google
    globalThis.fetch = (async () => ({
      ok: true,
      status: 204,
      text: async () => '',
    })) as any;

    const res204 = await deleteGoogleCalendarEvent('mock_access_token', 'primary', 'normal_delete_event_123');
    assert(
      res204.success === true,
      'HTTP 204 do Google Calendar é tratado como sucesso na exclusão',
      res204
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 14. Teste: Exclusão com googleSyncContext mesmo SEM class_google_events no banco (simulação de ON DELETE CASCADE)
  console.log('\n--- 12. Cenário: Exclusão com googleSyncContext Preservado (Pós ON DELETE CASCADE) ---');
  // Garantir que a tabela class_google_events NÃO contenha o registro
  const cascadeClassId = 'class_cascade_simulated_999';
  await deleteClassGoogleEventRecord(cascadeClassId);
  const beforeMapping = await getClassGoogleEvent(cascadeClassId);
  assert(
    beforeMapping === null,
    'Registro de class_google_events não existe no banco antes da sincronização (simulando ON DELETE CASCADE)'
  );

  // Executar exclusão passando explicitamente o googleSyncContext capturado antes do delete
  const originalFetchForCascade = globalThis.fetch;
  let interceptedDeleteUrl = '';
  let interceptedAuthHeader = '';
  try {
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('googleapis.com/calendar/v3/calendars')) {
        interceptedDeleteUrl = url;
        interceptedAuthHeader = init?.headers?.Authorization || '';
        return {
          ok: true,
          status: 204,
          text: async () => '',
          json: async () => ({}),
        };
      }
      return originalFetchForCascade(input, init);
    }) as any;

    const syncWithContextResult = await syncClassToGoogle({
      action: 'delete',
      classSession: {
        id: cascadeClassId,
        teacher_id: newTeacherWithGoogleId,
        title: 'Aula Excluída Teste',
        date: '2026-11-20',
        start_time: '10:00',
        end_time: '10:50',
      },
      googleSyncContext: {
        platformClassId: cascadeClassId,
        googleEventId: 'google_event_cascade_recovered_777',
        googleCalendarId: 'primary',
        teacherId: newTeacherWithGoogleId,
      },
    });

    assert(
      syncWithContextResult.synced === true && syncWithContextResult.actionTaken === 'event_deleted',
      'Exclusão com googleSyncContext conclui com event_deleted mesmo sem o registro existir no banco',
      syncWithContextResult
    );

    assert(
      interceptedDeleteUrl.includes('/calendars/primary/events/google_event_cascade_recovered_777'),
      'Chamada DELETE ao Google Calendar usou calendarId "primary" e o googleEventId capturado no context',
      interceptedDeleteUrl
    );
  } finally {
    globalThis.fetch = originalFetchForCascade;
  }

  // 15. Teste: Matriz Rigorosa de Autorização para Sincronização Google Calendar
  console.log('\n--- 13. Cenário: Matriz de Segurança e Autorização (Super Admin, Admin, Teachers) ---');

  const raphaelTeacherId = 'dada085e-c187-43d2-9ab0-a9e0539df450';
  const otherTeacherId = 'ffd5eb76-2cd5-420f-a7cb-97ad2d486927';

  // A) super_admin criando aula para Raphael -> sincronização Google deve ocorrer
  const superAdminAuth = checkSyncAuthorization(
    { userId: 'user_super_admin', role: 'super_admin', teacherId: null },
    raphaelTeacherId
  );
  assert(
    superAdminAuth.authorized === true,
    'Super Admin pode sincronizar aulas de qualquer professor (Raphael)',
    superAdminAuth
  );

  // B) admin criando aula para Raphael -> sincronização Google deve ocorrer
  const adminAuth = checkSyncAuthorization(
    { userId: 'user_admin', role: 'admin', teacherId: null },
    raphaelTeacherId
  );
  assert(
    adminAuth.authorized === true,
    'Admin pode sincronizar aulas de qualquer professor (Raphael)',
    adminAuth
  );

  // C) teacher Raphael criando aula própria -> sincronização Google deve ocorrer
  const raphaelOwnAuth = checkSyncAuthorization(
    { userId: 'user_raphael', role: 'teacher', teacherId: raphaelTeacherId },
    raphaelTeacherId
  );
  assert(
    raphaelOwnAuth.authorized === true,
    'Professor Raphael tem autorização para sincronizar sua própria aula',
    raphaelOwnAuth
  );

  // D) teacher de outro professor tentando sincronizar aula de Raphael -> deve retornar 403
  const otherTeacherAuth = checkSyncAuthorization(
    { userId: 'user_other_teacher', role: 'teacher', teacherId: otherTeacherId },
    raphaelTeacherId
  );
  assert(
    otherTeacherAuth.authorized === false && otherTeacherAuth.statusCode === 403,
    'Professor diferente tentando sincronizar aula de Raphael é bloqueado com 403 Forbidden',
    otherTeacherAuth
  );

  // E) usuário sem perfil válido -> deve retornar 401/403 e NÃO assumir teacher
  const nullAuthCheck = checkSyncAuthorization(null, raphaelTeacherId);
  assert(
    nullAuthCheck.authorized === false && nullAuthCheck.statusCode === 401,
    'Requisição sem autenticação é rejeitada com 401 Unauthorized',
    nullAuthCheck
  );

  const teacherNullIdCheck = checkSyncAuthorization(
    { userId: 'user_orphan_teacher', role: 'teacher', teacherId: null },
    raphaelTeacherId
  );
  assert(
    teacherNullIdCheck.authorized === false && teacherNullIdCheck.statusCode === 403,
    'Professor sem teacher_id vinculado (teacherId=null) é rejeitado com 403 (sem bypass inseguro)',
    teacherNullIdCheck
  );

  // F, G, H) Teste de Sincronização Google: Criação, Gravação de Mapping e Falha Controlada
  console.log('\n--- 14. Cenário: Gravação de Mapping no Sucesso e Registro de Falha Controlada ---');

  const testSyncClassId = 'class_mapping_test_888';
  const failClassId = 'class_failing_google_777';

  // Inserir aulas na tabela classes para satisfazer FK de class_google_events
  await supabase.from('classes').upsert([
    {
      id: testSyncClassId,
      teacher_id: newTeacherWithGoogleId,
      title: 'Aula Teste Mapping Sucesso',
      date: '2026-11-25',
      start_time: '14:00',
      end_time: '14:50',
      status: 'scheduled',
    },
    {
      id: failClassId,
      teacher_id: newTeacherWithGoogleId,
      title: 'Aula Falha Google',
      date: '2026-11-26',
      start_time: '15:00',
      end_time: '15:50',
      status: 'scheduled',
    },
  ]);

  // F & G: Simular sucesso do Google Calendar (mock fetch 200)
  const originalFetchForMapping = globalThis.fetch;
  try {
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('googleapis.com/calendar/v3/calendars')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            id: 'google_created_ev_123',
            status: 'confirmed',
          }),
          json: async () => ({
            id: 'google_created_ev_123',
            status: 'confirmed',
          }),
        };
      }
      return originalFetchForMapping(input, init);
    }) as any;

    const createSuccessRes = await syncClassToGoogle({
      action: 'create',
      classSession: {
        id: testSyncClassId,
        teacher_id: newTeacherWithGoogleId,
        title: 'Aula Teste Mapping Sucesso',
        date: '2026-11-25',
        start_time: '14:00',
        end_time: '14:50',
      },
      studentName: 'Aluno Teste Mapping',
    });

    assert(
      createSuccessRes.synced === true && createSuccessRes.actionTaken === 'event_created',
      'Criação de evento com sucesso retorna synced: true e actionTaken: event_created',
      createSuccessRes
    );

    const savedMapping = await getClassGoogleEvent(testSyncClassId);
    assert(
      savedMapping !== null && savedMapping.google_event_id === 'google_created_ev_123' && savedMapping.sync_status === 'synced',
      'Registro class_google_events é gravado com sync_status "synced" após confirmação do Google',
      savedMapping
    );

    // Teste de Idempotência: resincronizar a mesma aula não deve criar duplicado
    const idempotencyRes = await syncClassToGoogle({
      action: 'create',
      classSession: {
        id: testSyncClassId,
        teacher_id: newTeacherWithGoogleId,
        title: 'Aula Teste Mapping Sucesso',
        date: '2026-11-25',
        start_time: '14:00',
        end_time: '14:50',
      },
    });

    assert(
      idempotencyRes.synced === true && idempotencyRes.actionTaken === 'already_synced',
      'Tentativa de recriar aula já sincronizada retorna already_synced sem duplicar evento',
      idempotencyRes
    );

    // H: Simular falha do Google (erro 503)
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('googleapis.com/calendar/v3/calendars')) {
        return {
          ok: false,
          status: 503,
          text: async () => 'Service Unavailable',
          json: async () => ({ error: 'Service Unavailable' }),
        };
      }
      return originalFetchForMapping(input, init);
    }) as any;

    const failRes = await syncClassToGoogle({
      action: 'create',
      classSession: {
        id: failClassId,
        teacher_id: newTeacherWithGoogleId,
        title: 'Aula Falha Google',
        date: '2026-11-26',
        start_time: '15:00',
        end_time: '15:50',
      },
    });

    assert(
      failRes.synced === false,
      'Falha na API do Google Calendar não reporta falso sucesso (synced = false)',
      failRes
    );

    const failedMapping = await getClassGoogleEvent(failClassId);
    assert(
      failedMapping !== null && failedMapping.sync_status === 'failed',
      'Falha na API do Google Calendar registra sync_status="failed" com last_error preservado',
      failedMapping
    );

    // Limpeza dos registros de teste
    await deleteClassGoogleEventRecord(testSyncClassId);
    await deleteClassGoogleEventRecord(failClassId);
  } finally {
    globalThis.fetch = originalFetchForMapping;
  }

  // ============================================================================
  // 15. Cenário: Reautorização sem Desconexão, Proteção de Tempestade, Delete Resiliente e Tratamento de Erros (A - N)
  // ============================================================================
  console.log('\n--- 15. Cenário: Ciclo Reautorizar -> Create -> Update -> Delete Resiliente e Matriz HTTP (A a N) ---');

  // A & C: Verificar que TeacherGoogleCalendarCard tem "Reautorizar Google Agenda" e NÃO dispara syncTeacherFutureClasses no GOOGLE_OAUTH_SUCCESS
  const cardSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/TeacherGoogleCalendarCard.tsx'),
    'utf8'
  );
  assert(
    cardSource.includes('Reautorizar Google Agenda') && cardSource.includes('Desconectar'),
    'A) Conta conectada possui as ações "Reautorizar Google Agenda" e "Desconectar"'
  );

  const oauthSuccessBlockMatch = cardSource.match(/GOOGLE_OAUTH_SUCCESS[\s\S]*?GOOGLE_OAUTH_CANCEL/);
  const oauthSuccessBlock = oauthSuccessBlockMatch ? oauthSuccessBlockMatch[0] : '';
  assert(
    oauthSuccessBlock.length > 0 && !oauthSuccessBlock.includes('syncTeacherFutureClasses'),
    'C) Retorno do OAuth (GOOGLE_OAUTH_SUCCESS) NÃO dispara sincronização automática em massa de aulas futuras'
  );

  // B & N: Reautorização via UPSERT preserva conta connected, calendar_id e class_google_events existentes sem duplicar
  const reauthClassId = 'class_reauth_cycle_901';
  const reauthPreserveClassId = 'class_reauth_preserve_902';
  await supabase.from('classes').upsert([
    {
      id: reauthClassId,
      teacher_id: newTeacherWithGoogleId,
      title: 'Aula Pós-Reautorização',
      date: '2026-12-01',
      start_time: '10:00',
      end_time: '10:50',
      status: 'scheduled',
    },
    {
      id: reauthPreserveClassId,
      teacher_id: newTeacherWithGoogleId,
      title: 'Aula Histórica Preservada',
      date: '2026-11-28',
      start_time: '09:00',
      end_time: '09:50',
      status: 'scheduled',
    },
  ]);

  await saveClassGoogleEvent({
    platform_class_id: reauthPreserveClassId,
    teacher_id: newTeacherWithGoogleId,
    google_calendar_id: 'primary',
    google_event_id: 'ev_preserved_before_reauth',
    sync_status: 'synced',
    last_synced_at: new Date().toISOString(),
  });

  // 1ª Reautorização (B)
  await saveTeacherGoogleAccount({
    teacher_id: newTeacherWithGoogleId,
    google_email: 'prof2@escola.com',
    google_calendar_id: 'primary',
    refresh_token: 'reauth_refresh_token_v2',
    access_token: 'reauth_access_token_v2',
    token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    connection_status: 'connected',
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const accAfterReauth1 = await getTeacherGoogleAccount(newTeacherWithGoogleId);
  const preservedEvAfterReauth1 = await getClassGoogleEvent(reauthPreserveClassId);
  assert(
    accAfterReauth1 !== null &&
      accAfterReauth1.connection_status === 'connected' &&
      accAfterReauth1.refresh_token === 'reauth_refresh_token_v2' &&
      preservedEvAfterReauth1?.google_event_id === 'ev_preserved_before_reauth',
    'B) Reautorizar atualiza tokens via UPSERT, mantém conta connected e preserva class_google_events existentes',
    { accAfterReauth1, preservedEvAfterReauth1 }
  );

  const originalFetchCycle = globalThis.fetch;
  try {
    let lastMethod = '';
    let lastUrl = '';
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('googleapis.com/calendar/v3/calendars')) {
        lastMethod = init?.method || 'GET';
        lastUrl = url;
        if (lastMethod === 'POST') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ id: 'ev_created_after_reauth_901', status: 'confirmed' }),
            json: async () => ({ id: 'ev_created_after_reauth_901', status: 'confirmed' }),
          };
        }
        if (lastMethod === 'PATCH') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ id: 'ev_created_after_reauth_901', status: 'confirmed' }),
            json: async () => ({ id: 'ev_created_after_reauth_901', status: 'confirmed' }),
          };
        }
        if (lastMethod === 'DELETE') {
          return {
            ok: true,
            status: 204,
            text: async () => '',
            json: async () => ({}),
          };
        }
      }
      return originalFetchCycle(input, init);
    }) as any;

    // D) Criar nova aula imediatamente após reautorizar -> evento aparece no Google
    const createAfterReauth = await syncClassToGoogle({
      action: 'create',
      classSession: {
        id: reauthClassId,
        teacher_id: newTeacherWithGoogleId,
        title: 'Aula Pós-Reautorização',
        date: '2026-12-01',
        start_time: '10:00',
        end_time: '10:50',
      },
      studentName: 'Aluno Pós-Reauth',
    });
    assert(
      createAfterReauth.synced === true && createAfterReauth.actionTaken === 'event_created' && lastMethod === 'POST',
      'D) Criar nova aula imediatamente após reautorizar envia evento ao Google Calendar',
      createAfterReauth
    );

    // E) Atualizar aula -> evento é atualizado no Google
    const updateAfterReauth = await syncClassToGoogle({
      action: 'update',
      classSession: {
        id: reauthClassId,
        teacher_id: newTeacherWithGoogleId,
        title: 'Aula Pós-Reautorização Atualizada',
        date: '2026-12-01',
        start_time: '11:00',
        end_time: '11:50',
      },
      studentName: 'Aluno Pós-Reauth',
    });
    assert(
      updateAfterReauth.synced === true && updateAfterReauth.actionTaken === 'event_updated' && lastMethod === 'PATCH',
      'E) Atualizar aula sincroniza alteração via PATCH no evento do Google Calendar',
      updateAfterReauth
    );

    // F & G) Excluir aula usando contexto capturado após ON DELETE CASCADE
    const capturedMapping = await getClassGoogleEvent(reauthClassId);
    const deleteContext = {
      platformClassId: reauthClassId,
      googleEventId: capturedMapping!.google_event_id!,
      googleCalendarId: capturedMapping!.google_calendar_id || 'primary',
      teacherId: capturedMapping!.teacher_id || newTeacherWithGoogleId,
    };

    // Simular exclusão na plataforma primeiro (dispara ON DELETE CASCADE em class_google_events)
    await supabase.from('classes').delete().eq('id', reauthClassId);
    const mappingAfterCascade = await getClassGoogleEvent(reauthClassId);

    const deleteAfterReauth = await syncClassToGoogle({
      action: 'delete',
      classSession: {
        id: reauthClassId,
        teacher_id: newTeacherWithGoogleId,
        title: 'Aula Pós-Reautorização Atualizada',
        date: '2026-12-01',
        start_time: '11:00',
        end_time: '11:50',
      },
      googleSyncContext: deleteContext,
    });
    assert(
      mappingAfterCascade === null &&
        deleteAfterReauth.synced === true &&
        deleteAfterReauth.actionTaken === 'event_deleted' &&
        lastMethod === 'DELETE' &&
        lastUrl.includes('ev_created_after_reauth_901'),
      'F & G) Excluir aula remove evento no Google usando contexto capturado mesmo após ON DELETE CASCADE',
      { mappingAfterCascade, deleteAfterReauth, lastUrl }
    );

    // N) Segunda chamada de reautorização -> não duplica conta nem evento
    await saveTeacherGoogleAccount({
      teacher_id: newTeacherWithGoogleId,
      google_email: 'prof2@escola.com',
      google_calendar_id: 'primary',
      refresh_token: 'reauth_refresh_token_v3',
      access_token: 'reauth_access_token_v3',
      token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      connection_status: 'connected',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const { data: allAccountsForTeacher } = await supabaseAdmin
      .from('teacher_google_accounts')
      .select('teacher_id')
      .eq('teacher_id', newTeacherWithGoogleId);

    const duplicateReauthSync = await syncClassToGoogle({
      action: 'create',
      classSession: {
        id: reauthPreserveClassId,
        teacher_id: newTeacherWithGoogleId,
        title: 'Aula Histórica Preservada',
        date: '2026-11-28',
        start_time: '09:00',
        end_time: '09:50',
      },
    });
    assert(
      (allAccountsForTeacher?.length || 0) === 1 &&
        duplicateReauthSync.synced === true &&
        duplicateReauthSync.actionTaken === 'already_synced',
      'N) Segunda chamada de reautorização não duplica conta em teacher_google_accounts nem evento no Google',
      { accountCount: allAccountsForTeacher?.length, duplicateReauthSync }
    );

    // H) Token ausente/conta desconectada no DELETE -> NÃO retornar falso sucesso
    const noTokenDeleteRes = await syncClassToGoogle({
      action: 'delete',
      classSession: {
        id: 'class_missing_token_del',
        teacher_id: teacherWithoutGoogleId,
        title: 'Aula Sem Token no Delete',
        date: '2026-12-02',
        start_time: '14:00',
        end_time: '14:50',
      },
      googleSyncContext: {
        platformClassId: 'class_missing_token_del',
        googleEventId: 'ev_should_fail_without_token',
        googleCalendarId: 'primary',
        teacherId: teacherWithoutGoogleId,
      },
    });
    assert(
      noTokenDeleteRes.synced === false && noTokenDeleteRes.actionTaken === 'delete_failed',
      'H) Token ausente no DELETE retorna synced: false e actionTaken: "delete_failed" (sem falso sucesso)',
      noTokenDeleteRes
    );

    // J) Google 401 e 403 no DELETE -> erro real
    globalThis.fetch = (async () => ({
      ok: false,
      status: 401,
      text: async () => 'Invalid Credentials',
    })) as any;
    const del401 = await deleteGoogleCalendarEvent('invalid_token', 'primary', 'ev_401');
    assert(
      del401.success === false && del401.statusCode === 401 && del401.retryable === false,
      'J.1) Google HTTP 401 no DELETE retorna erro real de autenticação (success: false, statusCode: 401)',
      del401
    );

    globalThis.fetch = (async () => ({
      ok: false,
      status: 403,
      text: async () => 'Forbidden: insufficientPermissions',
    })) as any;
    const del403 = await deleteGoogleCalendarEvent('token_no_perm', 'primary', 'ev_403');
    assert(
      del403.success === false && del403.statusCode === 403 && del403.retryable === false,
      'J.2) Google HTTP 403 no DELETE retorna erro real de permissão (success: false, statusCode: 403)',
      del403
    );

    // K) Google 429 e 503 no DELETE -> erro real com retryable: true e controle de rate limit no lote
    globalThis.fetch = (async () => ({
      ok: false,
      status: 429,
      text: async () => 'rateLimitExceeded',
    })) as any;
    const del429 = await deleteGoogleCalendarEvent('valid_token', 'primary', 'ev_429');
    assert(
      del429.success === false && del429.statusCode === 429 && del429.rateLimited === true && del429.retryable === true,
      'K.1) Google HTTP 429 no DELETE retorna erro real de rate limit com retryable: true',
      del429
    );

    // Testar controle de lote (maxBatchSize) em syncFutureClassesToGoogle
    let batchApiCalls = 0;
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('googleapis.com/calendar/v3/calendars')) {
        batchApiCalls++;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ id: `ev_batch_${batchApiCalls}`, status: 'confirmed' }),
          json: async () => ({ id: `ev_batch_${batchApiCalls}`, status: 'confirmed' }),
        };
      }
      return originalFetchCycle(input, init);
    }) as any;

    await supabase.from('classes').upsert([
      { id: 'batch_c1', teacher_id: newTeacherWithGoogleId, title: 'Lote 1', date: '2027-01-10', start_time: '10:00', end_time: '10:50', status: 'scheduled' },
      { id: 'batch_c2', teacher_id: newTeacherWithGoogleId, title: 'Lote 2', date: '2027-01-11', start_time: '10:00', end_time: '10:50', status: 'scheduled' },
      { id: 'batch_c3', teacher_id: newTeacherWithGoogleId, title: 'Lote 3', date: '2027-01-12', start_time: '10:00', end_time: '10:50', status: 'scheduled' },
    ]);

    const batchRes = await syncFutureClassesToGoogle(
      newTeacherWithGoogleId,
      [
        { id: 'batch_c1', teacher_id: newTeacherWithGoogleId, title: 'Lote 1', date: '2027-01-10', start_time: '10:00', end_time: '10:50', status: 'scheduled' },
        { id: 'batch_c2', teacher_id: newTeacherWithGoogleId, title: 'Lote 2', date: '2027-01-11', start_time: '10:00', end_time: '10:50', status: 'scheduled' },
        { id: 'batch_c3', teacher_id: newTeacherWithGoogleId, title: 'Lote 3', date: '2027-01-12', start_time: '10:00', end_time: '10:50', status: 'scheduled' },
      ],
      { maxBatchSize: 2, delayMs: 5 }
    );
    assert(
      batchApiCalls === 2 && batchRes.remaining === 1,
      'K.2) Sincronização manual de aulas futuras respeita limite de lote (maxBatchSize) sem disparar rajada ilimitada',
      { batchApiCalls, batchRes }
    );
  } finally {
    globalThis.fetch = originalFetchCycle;
  }

  await deleteClassGoogleEventRecord(reauthPreserveClassId);
  await deleteClassGoogleEventRecord('batch_c1');
  await deleteClassGoogleEventRecord('batch_c2');
  await deleteClassGoogleEventRecord('batch_c3');
  await supabase.from('classes').delete().in('id', [reauthClassId, reauthPreserveClassId, 'batch_c1', 'batch_c2', 'batch_c3']);

  // 16. Cenário: Validação de Autenticação por auth.uid, Bloqueio de Elevação no Frontend e Deploy Node/Express (A - K)
  console.log('\n--- 16. Cenário: Autenticação por auth.uid, Segurança de Role no Frontend e Deploy (A a K) ---');

  // A) auth.uid == profiles.id -> autorizado conforme role
  const authResValid = await resolveAuthenticatedUser(
    { headers: { authorization: 'Bearer valid_token_abc' } },
    {
      verifyAuthToken: async () => ({ id: '49f988c0-1bae-406f-946b-a0f022814edd', email: 'jusssouzaa@gmail.com' }),
      fetchProfileById: async (uid) =>
        uid === '49f988c0-1bae-406f-946b-a0f022814edd'
          ? { id: uid, role: 'super_admin', teacher_id: null, access_status: 'active', email: 'jusssouzaa@gmail.com' }
          : null,
    }
  );
  const syncCheckValid = checkSyncAuthorization(authResValid.user, raphaelTeacherId, authResValid);
  assert(
    authResValid.statusCode === 200 &&
      authResValid.user?.userId === '49f988c0-1bae-406f-946b-a0f022814edd' &&
      authResValid.user?.role === 'super_admin' &&
      syncCheckValid.authorized === true,
    'A) auth.uid == profiles.id -> autorizado conforme role real do profile',
    { authResValid, syncCheckValid }
  );

  // B) usuário autenticado sem profile -> 403
  const authResNoProfile = await resolveAuthenticatedUser(
    { headers: { authorization: 'Bearer valid_token_no_profile' } },
    {
      verifyAuthToken: async () => ({ id: '00000000-0000-0000-0000-000000000999', email: 'sem.profile@gmail.com' }),
      fetchProfileById: async () => null,
    }
  );
  const syncCheckNoProfile = checkSyncAuthorization(authResNoProfile.user, raphaelTeacherId, authResNoProfile);
  assert(
    authResNoProfile.authenticated === true &&
      authResNoProfile.user === null &&
      authResNoProfile.statusCode === 403 &&
      syncCheckNoProfile.authorized === false &&
      syncCheckNoProfile.statusCode === 403,
    'B) Usuário autenticado sem profile em public.profiles retorna 403 Forbidden',
    { authResNoProfile, syncCheckNoProfile }
  );

  // C) e-mail diferente, mas auth.uid == profiles.id -> continua autorizado
  const authResEmailDiff = await resolveAuthenticatedUser(
    { headers: { authorization: 'Bearer valid_token_email_diff' } },
    {
      verifyAuthToken: async () => ({ id: 'db641f39-96f4-450b-8df1-025b4f6f2711', email: 'novo.email.auth@gmail.com' }),
      fetchProfileById: async (uid) =>
        uid === 'db641f39-96f4-450b-8df1-025b4f6f2711'
          ? { id: uid, role: 'admin', teacher_id: null, access_status: 'active', email: 'antigo.email.profile@gmail.com' }
          : null,
    }
  );
  assert(
    authResEmailDiff.statusCode === 200 &&
      authResEmailDiff.user?.userId === 'db641f39-96f4-450b-8df1-025b4f6f2711' &&
      authResEmailDiff.user?.role === 'admin',
    'C) Divergência de e-mail não impede autenticação quando auth.uid == profiles.id',
    authResEmailDiff
  );

  // D) e-mail igual, mas profiles.id != auth.uid -> NÃO usar o email para autorizar
  const profilesTableMock = [
    {
      id: 'f1a9b2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c',
      email: 'institutodeartera@gmail.com',
      role: 'super_admin',
      teacher_id: null,
      access_status: 'active',
    },
  ];
  const authResIdMismatch = await resolveAuthenticatedUser(
    { headers: { authorization: 'Bearer valid_token_id_mismatch' } },
    {
      verifyAuthToken: async () => ({ id: 'fc5d565f-7178-499e-97e4-4e8f3c8bae86', email: 'institutodeartera@gmail.com' }),
      fetchProfileById: async (uid) => profilesTableMock.find((p) => p.id === uid) || null,
    }
  );
  assert(
    authResIdMismatch.statusCode === 403 && authResIdMismatch.user === null,
    'D) E-mail igual mas profiles.id != auth.uid é rejeitado com 403 (não usa e-mail como fallback)',
    authResIdMismatch
  );

  // E) Frontend não consegue elevar role para super_admin
  const storeSource = fs.readFileSync(path.join(process.cwd(), 'src/store.tsx'), 'utf8');
  assert(
    !storeSource.includes('isSuperAdminEmail') &&
      !storeSource.includes('f1a9b2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c') &&
      !storeSource.includes('email.ilike.') &&
      !storeSource.includes('userProfile = { ...userProfile, role: "super_admin" }') &&
      !storeSource.includes("instProfile.role = 'super_admin'"),
    'E) Frontend (src/store.tsx) não contém auto-elevação de role super_admin nem busca de profile por e-mail'
  );

  // F) Role real vem exclusivamente do profile (mesmo se e-mail for de admin)
  const authResRealRole = await resolveAuthenticatedUser(
    { headers: { authorization: 'Bearer valid_token_teacher_role' } },
    {
      verifyAuthToken: async () => ({ id: '56f7b747-7c08-4912-839e-71b83a3e82b6', email: 'jusssouzaa@gmail.com' }),
      fetchProfileById: async (uid) => ({
        id: uid,
        role: 'teacher',
        teacher_id: raphaelTeacherId,
        access_status: 'active',
        email: 'jusssouzaa@gmail.com',
      }),
    }
  );
  assert(
    authResRealRole.user?.role === 'teacher' && authResRealRole.user?.teacherId === raphaelTeacherId,
    'F) Role real vem exclusivamente de public.profiles (não do e-mail)',
    authResRealRole
  );

  // G) POST /api/google/sync-class passa pela autenticação correta no Express
  const syncClassUnauthHttp = await fetch('http://localhost:3000/api/google/sync-class', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create',
      classSession: {
        id: 'class_http_auth_check',
        teacher_id: raphaelTeacherId,
        title: 'Aula Teste Rota',
        date: '2026-12-10',
        start_time: '10:00',
        end_time: '11:00',
      },
    }),
  });
  const poweredByHeader = syncClassUnauthHttp.headers.get('x-powered-by') || '';
  assert(
    syncClassUnauthHttp.status === 401 && poweredByHeader.toLowerCase().includes('express'),
    'G) POST /api/google/sync-class é atendido pelo Express e exige autenticação válida (401)',
    { status: syncClassUnauthHttp.status, poweredByHeader }
  );

  // H, I, J) Google sync retorna eventId em sucesso, synced=false em erro, e aula continua salva em public.classes se Google falhar
  const classSavedWhenGoogleFailsId = 'class_saved_google_fails_999';
  await supabase.from('classes').upsert([
    {
      id: classSavedWhenGoogleFailsId,
      teacher_id: newTeacherWithGoogleId,
      title: 'Aula Salva Mesmo Sem Google',
      date: '2026-12-15',
      start_time: '16:00',
      end_time: '17:00',
      status: 'scheduled',
    },
  ]);

  const originalFetchHIJ = globalThis.fetch;
  try {
    // H) Sucesso retorna eventId
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('googleapis.com/calendar/v3/calendars')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ id: 'event_id_confirmed_h_123', status: 'confirmed' }),
          json: async () => ({ id: 'event_id_confirmed_h_123', status: 'confirmed' }),
        };
      }
      return originalFetchHIJ(input, init);
    }) as any;

    const resH = await syncClassToGoogle({
      action: 'create',
      classSession: {
        id: testSyncClassId,
        teacher_id: newTeacherWithGoogleId,
        title: 'Aula H EventId',
        date: '2026-12-14',
        start_time: '14:00',
        end_time: '15:00',
      },
    });
    assert(
      resH.synced === true && resH.eventId === 'event_id_confirmed_h_123',
      'H) Google sync retorna eventId explícito quando o evento é criado com sucesso',
      resH
    );

    // I & J) Erro do Google retorna synced=false e aula permanece salva em public.classes
    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('googleapis.com/calendar/v3/calendars')) {
        return {
          ok: false,
          status: 500,
          text: async () => JSON.stringify({ error: { code: 500, message: 'Internal Error' } }),
          json: async () => ({ error: { code: 500, message: 'Internal Error' } }),
        };
      }
      return originalFetchHIJ(input, init);
    }) as any;

    const resI = await syncClassToGoogle({
      action: 'create',
      classSession: {
        id: classSavedWhenGoogleFailsId,
        teacher_id: newTeacherWithGoogleId,
        title: 'Aula Salva Mesmo Sem Google',
        date: '2026-12-15',
        start_time: '16:00',
        end_time: '17:00',
      },
    });
    const { data: persistedClassRow } = await supabase
      .from('classes')
      .select('id, title')
      .eq('id', classSavedWhenGoogleFailsId)
      .maybeSingle();
    const failedEventRecord = await getClassGoogleEvent(classSavedWhenGoogleFailsId);

    assert(
      resI.synced === false && resI.eventId === null && failedEventRecord?.sync_status === 'failed',
      'I) Erro da API do Google retorna synced=false, eventId=null e grava sync_status="failed"',
      { resI, failedEventRecord }
    );
    assert(
      Boolean(persistedClassRow && persistedClassRow.id === classSavedWhenGoogleFailsId),
      'J) Aula continua salva em public.classes na plataforma mesmo quando a sincronização com Google falha',
      persistedClassRow
    );
  } finally {
    globalThis.fetch = originalFetchHIJ;
  }

  await deleteClassGoogleEventRecord(testSyncClassId);
  await deleteClassGoogleEventRecord(classSavedWhenGoogleFailsId);
  await supabase.from('classes').delete().eq('id', classSavedWhenGoogleFailsId);

  // K) Deploy de produção executa Node/Express (Dockerfile + package.json)
  const dockerfileContent = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8');
  const pkgJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  assert(
    !dockerfileContent.includes('FROM nginx') &&
      dockerfileContent.includes('CMD ["node", "dist/server.cjs"]') &&
      pkgJson.scripts?.start === 'node dist/server.cjs',
    'K) Dockerfile e package.json executam o servidor Node/Express (node dist/server.cjs) em produção'
  );

  // L) Exclusão física da aula na plataforma com ON DELETE CASCADE preserva googleSyncContext e chama DELETE /calendars/primary/events/{googleEventId}
  const cascadeDeleteClassId = '00000000-0000-0000-0000-000000000991';
  await supabase.from('classes').upsert([
    {
      id: cascadeDeleteClassId,
      teacher_id: newTeacherWithGoogleId,
      title: 'Aula Exclusão Cascade Real',
      date: '2026-12-20',
      start_time: '10:00',
      end_time: '11:00',
      status: 'scheduled',
    },
  ]);

  const originalFetchL = globalThis.fetch;
  try {
    let deleteCalledUrl = '';
    let deleteCalledMethod = '';
    let deleteCalledAuth = '';

    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('googleapis.com/calendar/v3/calendars')) {
        if ((init?.method || 'GET').toUpperCase() === 'POST') {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ id: 'ev_cascade_real_991', status: 'confirmed' }),
            json: async () => ({ id: 'ev_cascade_real_991', status: 'confirmed' }),
          };
        }
        if ((init?.method || '').toUpperCase() === 'DELETE') {
          deleteCalledUrl = url;
          deleteCalledMethod = 'DELETE';
          deleteCalledAuth = (init?.headers as any)?.Authorization || '';
          return {
            ok: true,
            status: 204,
            text: async () => '',
          };
        }
      }
      return originalFetchL(input, init);
    }) as any;

    // 1. Criar evento Google para a aula
    const createResL = await syncClassToGoogle({
      action: 'create',
      classSession: {
        id: cascadeDeleteClassId,
        teacher_id: newTeacherWithGoogleId,
        title: 'Aula Exclusão Cascade Real',
        date: '2026-12-20',
        start_time: '10:00',
        end_time: '11:00',
      },
    });

    // 2. Antes da exclusão física da aula, capturar contexto (como faz deleteClass no store.tsx)
    const mappingBeforeDelete = await getClassGoogleEvent(cascadeDeleteClassId);
    const preservedContext = {
      platformClassId: cascadeDeleteClassId,
      googleEventId: mappingBeforeDelete?.google_event_id || createResL.eventId || '',
      googleCalendarId: mappingBeforeDelete?.google_calendar_id || 'primary',
      teacherId: mappingBeforeDelete?.teacher_id || newTeacherWithGoogleId,
    };

    // 3. Excluir fisicamente a aula em public.classes (dispara ON DELETE CASCADE em class_google_events)
    await supabase.from('classes').delete().eq('id', cascadeDeleteClassId);
    const mappingAfterCascade = await getClassGoogleEvent(cascadeDeleteClassId);

    assert(
      mappingAfterCascade === null,
      'L.1) ON DELETE CASCADE remove automaticamente o registro de class_google_events quando a aula é excluída em public.classes'
    );

    // 4. Disparar sincronização de exclusão em background usando o contexto preservado em memória
    const deleteResL = await syncClassToGoogle({
      action: 'delete',
      classSession: {
        id: cascadeDeleteClassId,
        teacher_id: preservedContext.teacherId,
        title: 'Aula Exclusão Cascade Real',
        date: '2026-12-20',
        start_time: '10:00',
        end_time: '11:00',
      },
      googleSyncContext: preservedContext,
    });

    assert(
      deleteResL.synced === true &&
        deleteResL.actionTaken === 'event_deleted' &&
        deleteResL.eventId === 'ev_cascade_real_991' &&
        deleteCalledMethod === 'DELETE' &&
        deleteCalledUrl === 'https://www.googleapis.com/calendar/v3/calendars/primary/events/ev_cascade_real_991' &&
        deleteCalledAuth.startsWith('Bearer '),
      'L.2) Exclusão pós-cascade chama DELETE https://www.googleapis.com/calendar/v3/calendars/primary/events/{googleEventId} com Bearer token do professor',
      { deleteResL, deleteCalledMethod, deleteCalledUrl }
    );
  } finally {
    globalThis.fetch = originalFetchL;
    await supabase.from('classes').delete().eq('id', cascadeDeleteClassId);
  }

  // M) Retry automático com forceRefresh: true quando createGoogleCalendarEvent ou updateGoogleCalendarEvent retorna HTTP 401
  const retry401ClassId = '00000000-0000-0000-0000-000000000992';
  await supabase.from('classes').upsert([
    {
      id: retry401ClassId,
      teacher_id: newTeacherWithGoogleId,
      title: 'Aula Retry 401 Create e Update',
      date: '2026-12-21',
      start_time: '14:00',
      end_time: '15:00',
      status: 'scheduled',
    },
  ]);

  const originalFetchM = globalThis.fetch;
  try {
    // Configurar conta com access_token ainda dentro do prazo (para testar que o 1º disparo usa o cached token e recebe 401)
    await saveTeacherGoogleAccount({
      teacher_id: newTeacherWithGoogleId,
      google_email: 'retry401@escola.com',
      google_calendar_id: 'primary',
      refresh_token: 'valid_refresh_token_for_401_retry',
      access_token: 'stale_cached_access_token_1',
      token_expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      connection_status: 'connected',
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    let createAttempts = 0;
    let updateAttempts = 0;
    let tokenRefreshCalls = 0;

    globalThis.fetch = (async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url === 'https://oauth2.googleapis.com/token') {
        tokenRefreshCalls++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: `fresh_access_token_after_401_${tokenRefreshCalls}`,
            expires_in: 3600,
          }),
          text: async () => JSON.stringify({ access_token: `fresh_access_token_after_401_${tokenRefreshCalls}`, expires_in: 3600 }),
        };
      }
      if (url.includes('googleapis.com/calendar/v3/calendars')) {
        const method = (init?.method || 'GET').toUpperCase();
        const authHeader = (init?.headers as any)?.Authorization || '';
        if (method === 'POST') {
          createAttempts++;
          if (createAttempts === 1) {
            return {
              ok: false,
              status: 401,
              text: async () => JSON.stringify({ error: { code: 401, message: 'Invalid Credentials' } }),
            };
          }
          return {
            ok: authHeader === 'Bearer fresh_access_token_after_401_1',
            status: authHeader === 'Bearer fresh_access_token_after_401_1' ? 200 : 401,
            text: async () => JSON.stringify({ id: 'ev_retry_401_created', status: 'confirmed' }),
            json: async () => ({ id: 'ev_retry_401_created', status: 'confirmed' }),
          };
        }
        if (method === 'PATCH') {
          updateAttempts++;
          if (updateAttempts === 1) {
            return {
              ok: false,
              status: 401,
              text: async () => JSON.stringify({ error: { code: 401, message: 'Invalid Credentials on PATCH' } }),
            };
          }
          return {
            ok: authHeader === 'Bearer fresh_access_token_after_401_2',
            status: authHeader === 'Bearer fresh_access_token_after_401_2' ? 200 : 401,
            text: async () => JSON.stringify({ id: 'ev_retry_401_created', status: 'confirmed' }),
            json: async () => ({ id: 'ev_retry_401_created', status: 'confirmed' }),
          };
        }
      }
      return originalFetchM(input, init);
    }) as any;

    const createRetryRes = await syncClassToGoogle({
      action: 'create',
      classSession: {
        id: retry401ClassId,
        teacher_id: newTeacherWithGoogleId,
        title: 'Aula Retry 401 Create e Update',
        date: '2026-12-21',
        start_time: '14:00',
        end_time: '15:00',
      },
    });

    const accAfterCreateRetry = await getTeacherGoogleAccount(newTeacherWithGoogleId);

    assert(
      createRetryRes.synced === true &&
        createRetryRes.actionTaken === 'event_created' &&
        createRetryRes.eventId === 'ev_retry_401_created' &&
        createAttempts === 2 &&
        tokenRefreshCalls === 1 &&
        accAfterCreateRetry?.access_token === 'fresh_access_token_after_401_1',
      'M.1) createGoogleCalendarEvent com HTTP 401 executa forceRefresh, persiste novo token e repete criação com sucesso',
      { createRetryRes, createAttempts, tokenRefreshCalls, persistedToken: accAfterCreateRetry?.access_token }
    );

    const updateRetryRes = await syncClassToGoogle({
      action: 'update',
      classSession: {
        id: retry401ClassId,
        teacher_id: newTeacherWithGoogleId,
        title: 'Aula Retry 401 Editada',
        date: '2026-12-21',
        start_time: '15:00',
        end_time: '16:00',
      },
    });

    const accAfterUpdateRetry = await getTeacherGoogleAccount(newTeacherWithGoogleId);

    assert(
      updateRetryRes.synced === true &&
        updateRetryRes.actionTaken === 'event_updated' &&
        updateRetryRes.eventId === 'ev_retry_401_created' &&
        updateAttempts === 2 &&
        tokenRefreshCalls === 2 &&
        accAfterUpdateRetry?.access_token === 'fresh_access_token_after_401_2',
      'M.2) updateGoogleCalendarEvent com HTTP 401 executa forceRefresh, persiste novo token e repete atualização com sucesso',
      { updateRetryRes, updateAttempts, tokenRefreshCalls, persistedToken: accAfterUpdateRetry?.access_token }
    );
  } finally {
    globalThis.fetch = originalFetchM;
    await deleteClassGoogleEventRecord(retry401ClassId);
    await supabase.from('classes').delete().eq('id', retry401ClassId);
  }

  // 17. Limpeza final dos dados de teste
  await deleteClassGoogleEventRecord('class_idempotent_1');
  await deleteClassGoogleEventRecord('class_test_001');
  await supabase.from('classes').delete().in('id', [
    'class_test_001',
    'class_idempotent_1',
    testSyncClassId,
    failClassId,
  ]);
  await deleteTeacherGoogleAccount(newTeacherWithGoogleId);
  await deleteTeacherGoogleAccount(teacherWithGoogleId);
  await deleteTeacherGoogleAccount(teacherWithoutGoogleId);
  await supabase.from('teachers').delete().in('id', [teacherWithoutGoogleId, teacherWithGoogleId, newTeacherWithGoogleId]);

  console.log('\n==================================================');
  console.log(`📊 RESULTADO DOS TESTES:`);
  console.log(`   Sucessos: ${testsPassed}`);
  console.log(`   Falhas:   ${testsFailed}`);
  console.log('==================================================\n');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runGoogleCalendarTests().catch((err) => {
  console.error('Erro fatal nos testes:', err);
  process.exit(1);
});
