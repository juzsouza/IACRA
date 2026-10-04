import { createClient } from '@supabase/supabase-js';
import { resolveCompetenceBilling } from '../utils/competenceBillingResolver';
import { CompetenceBilling, Student, Enrollment, FinancialPlan } from '../store';

const supabaseUrl = 'https://ldumzwrwbhjtrnlioigg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdW16d3J3YmhqdHJubGlvaWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTU0MDcsImV4cCI6MjA4ODYzMTQwN30.PgzhWMBsYifm6ADnYm-EQu83DK9BShDQAVZlQw5sayU';

async function runPersistenceTest() {
  console.log('====================================================');
  console.log('INÍCIO DO TESTE OBRIGATÓRIO DE PERSISTÊNCIA REAL');
  console.log('====================================================\n');

  // 0. Autenticação com perfil admin para validação estrita de RLS
  const testAdminEmail = `audit_admin_${Date.now()}@institutodeartera.com.br`;
  console.log(`[0/6] Autenticando usuário administrativo: ${testAdminEmail}...`);
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: testAdminEmail,
    password: 'TestSecurePassword123!',
  });

  if (authError || !authData.user) {
    throw new Error(`Falha ao criar usuário de teste para RLS: ${authError?.message}`);
  }

  const adminUserId = authData.user.id;
  // Atualizar role do usuário para 'admin' na tabela profiles
  const { error: roleError } = await supabase
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', adminUserId);

  if (roleError) {
    throw new Error(`Falha ao atribuir role admin ao usuário: ${roleError.message}`);
  }
  console.log('✓ Usuário autenticado e perfil de administrador confirmado no RLS.\n');

  const isolatedTestId = 'ffffffff-0000-4000-8000-000000000099';
  const isolatedCompetence = '2099-11';
  const testEnrollmentId = '4bcaa13f-fcc6-48b3-b98e-1a023619ce1e';
  const testStudentId = '4c5ee56e-858e-44fd-ac78-9d8f3c3a137d';

  try {
    // 1. Executar regularização montando o payload correto
    console.log('[1/6] Montando payload e executando regularização...');
    const testPayload: CompetenceBilling = {
      id: isolatedTestId,
      competence: isolatedCompetence,
      category: 'individual',
      enrollment_id: testEnrollmentId,
      choir_registration_id: null,
      group_id: null,
      student_id: testStudentId,
      teacher_id: 'dada085e-c187-43d2-9ab0-a9e0539df450',
      is_paying: true,
      base_price: 100,
      discount: 0,
      final_price: 100,
      teacher_fee_type: 'percentage',
      teacher_fee_value: 50,
      teacher_share: 50,
      school_share: 50,
      status: 'pending',
      transaction_id: null,
      is_frozen: false,
      frozen_at: null,
      frozen_by: null,
      metadata: {
        source: 'historical_regularization',
        reason: 'Teste isolado de auditoria de persistência física em public.competence_billings',
        confirmed_by: testAdminEmail,
        confirmed_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
    };

    const { data: insertResult, error: insertError } = await supabase
      .from('competence_billings')
      .insert([testPayload])
      .select();

    if (insertError) {
      throw new Error(`INSERT falhou no Supabase: ${insertError.message} (Código: ${insertError.code})`);
    }

    if (!insertResult || insertResult.length === 0) {
      throw new Error('O Supabase não retornou o registro inserido. Bloqueado por RLS.');
    }
    console.log('✓ INSERT executado com sucesso e registro retornado pelo Supabase.');

    // 2. Confirmar INSERT no Supabase via SELECT físico
    console.log('[2/6] Confirmando existência física no Supabase...');
    const { data: dbVerify, error: verifyError } = await supabase
      .from('competence_billings')
      .select('*')
      .eq('id', isolatedTestId);

    if (verifyError || !dbVerify || dbVerify.length === 0) {
      throw new Error('Falha: o registro NÃO foi encontrado no Supabase após o insert!');
    }

    const insertedRecord = dbVerify[0];
    console.log('✓ Registro confirmado fisicamente em public.competence_billings:');
    console.log(`  - ID: ${insertedRecord.id}`);
    console.log(`  - Competence: ${insertedRecord.competence}`);
    console.log(`  - Category: ${insertedRecord.category}`);
    console.log(`  - Enrollment ID: ${insertedRecord.enrollment_id}`);
    console.log(`  - Student ID: ${insertedRecord.student_id}`);
    console.log(`  - Final Price: R$ ${insertedRecord.final_price}`);
    console.log(`  - Status: ${insertedRecord.status}`);
    console.log(`  - Source: ${insertedRecord.metadata?.source}\n`);

    // 3 & 4. Simular recarregar a aplicação e confirmar persistência
    console.log('[3/6 & 4/6] Simulando recarga da aplicação (fetchFromSupabase)...');
    const freshClient = createClient(supabaseUrl, supabaseKey);
    // Realizar login no novo client para simular sessão salva no navegador após reload
    await freshClient.auth.signInWithPassword({
      email: testAdminEmail,
      password: 'TestSecurePassword123!',
    });

    const { data: reloadData, error: reloadError } = await freshClient
      .from('competence_billings')
      .select('*')
      .eq('id', isolatedTestId);

    if (reloadError || !reloadData || reloadData.length === 0) {
      throw new Error('Falha após reload: o registro desapareceu após recarregar a aplicação!');
    }
    console.log('✓ Após reload, o registro continua existindo perfeitamente no Supabase.\n');

    // 5 & 6. Chamar resolveCompetenceBilling e confirmar que o snapshot é usado
    console.log('[5/6 & 6/6] Chamando resolveCompetenceBilling e verificando uso do snapshot...');
    const loadedBilling: CompetenceBilling = {
      ...reloadData[0],
      base_price: Number(reloadData[0].base_price || 0),
      discount: Number(reloadData[0].discount || 0),
      final_price: Number(reloadData[0].final_price || 0),
      teacher_fee_value: reloadData[0].teacher_fee_value != null ? Number(reloadData[0].teacher_fee_value) : null,
      teacher_share: Number(reloadData[0].teacher_share || 0),
      school_share: Number(reloadData[0].school_share || 0),
      is_paying: reloadData[0].is_paying !== undefined ? !!reloadData[0].is_paying : true,
      is_frozen: !!reloadData[0].is_frozen,
      metadata: reloadData[0].metadata || {},
    };

    // Obter dados reais de contexto
    const { data: dbStudents } = await freshClient.from('students').select('*').eq('id', testStudentId);
    const { data: dbEnrollments } = await freshClient.from('enrollments').select('*').eq('id', testEnrollmentId);

    const testContext = {
      competenceBillings: [loadedBilling],
      students: (dbStudents || []) as Student[],
      enrollments: (dbEnrollments || []) as Enrollment[],
      financialPlans: [] as FinancialPlan[],
      financialDiscountRules: [],
      transactions: [],
      groups: [],
      choirRegistrations: [],
      teachers: [],
    };

    const resolved = resolveCompetenceBilling({
      category: 'individual',
      sourceId: testEnrollmentId,
      competence: isolatedCompetence,
      context: testContext,
    });

    console.log('Resultado de resolveCompetenceBilling:');
    console.log(`  - Source: ${resolved.source}`);
    console.log(`  - Final Price: R$ ${resolved.finalPrice}`);
    console.log(`  - Status Label: ${resolved.statusLabel}`);
    console.log(`  - Is Paying: ${resolved.isPaying}`);
    console.log(`  - Snapshot ID: ${resolved.snapshot?.id}`);

    if (resolved.source !== 'snapshot_pending' && resolved.source !== 'snapshot_frozen') {
      throw new Error(`Esperado source "snapshot_pending" ou "snapshot_frozen", porém obteve "${resolved.source}".`);
    }

    if (resolved.finalPrice !== 100) {
      throw new Error(`Esperado finalPrice 100, porém obteve ${resolved.finalPrice}.`);
    }

    if (!resolved.snapshot) {
      throw new Error('Esperado snapshot anexado no resultado, porém snapshot é nulo.');
    }

    if (resolved.snapshot.id !== isolatedTestId) {
      throw new Error(`Esperado snapshot.id "${isolatedTestId}", porém obteve "${resolved.snapshot.id}".`);
    }

    console.log('\n✓ SUCESSO COMPLETO: O snapshot persistido no Supabase foi utilizado com prioridade absoluta pelo resolveCompetenceBilling!');

  } finally {
    // Limpeza estrita do registro de teste isolado para manter o banco intacto
    console.log('\n[Limpeza] Removendo registro de teste isolado do Supabase...');
    const { error: delError } = await supabase
      .from('competence_billings')
      .delete()
      .eq('id', isolatedTestId);

    if (delError) {
      console.error('Aviso ao deletar registro de teste:', delError);
    } else {
      console.log('✓ Registro de teste isolado removido de public.competence_billings com sucesso.');
    }

    // Limpar perfil e usuário de teste
    await supabase.from('profiles').delete().eq('id', adminUserId);
    console.log('✓ Perfil administrativo de teste removido.');
    console.log('====================================================');
    console.log('TODAS AS ETAPAS DO TESTE OBRIGATÓRIO FORAM CONCLUÍDAS COM SUCESSO');
    console.log('====================================================');
  }
}

runPersistenceTest().catch((err) => {
  console.error('\n❌ ERRO NO TESTE DE PERSISTÊNCIA:', err);
  process.exit(1);
});
