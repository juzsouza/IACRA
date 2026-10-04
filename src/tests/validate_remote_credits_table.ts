import { supabaseAdmin } from '../server/googleCalendarService';
import { RAPHAEL_TEACHER_ID } from '../utils/raphaelBillingSimulation';

async function validateRemoteCredits() {
  console.log('================================================================');
  console.log('VALIDAÇÃO DO BANCO REMOTO SUPABASE: public.credits');
  console.log('================================================================\n');

  // 1. Checagem de existência da tabela
  console.log('[1/5] Verificando existência de public.credits no schema cache...');
  const { data: initialCheck, error: initialError } = await supabaseAdmin
    .from('credits')
    .select('id')
    .limit(1);

  if (initialError) {
    console.error('❌ Tabela public.credits NÃO EXISTE no banco remoto.');
    console.error(`Código: ${initialError.code} - Mensagem: ${initialError.message}`);
    console.log('\n--> A migration "supabase/migrations/20260924_create_credits_table.sql" precisa ser executada no SQL Editor do Supabase.');
    process.exit(1);
  }

  console.log('✓ [OK] Tabela public.credits existe no banco remoto.\n');

  // 2. Teste de INSERT
  const testCreditId = 'test_audit_credit_remote_001';
  console.log(`[2/5] Executando INSERT do crédito de teste "${testCreditId}"...`);
  
  const insertPayload = {
    id: testCreditId,
    teacher_id: RAPHAEL_TEACHER_ID,
    student_id: null,
    enrollment_id: null,
    group_id: null,
    source_class_id: null,
    amount: 150.00,
    status: 'available',
    competency_month: '2099-12',
    used_date: null,
    notes: 'Registro transitório de validação do banco remoto',
    created_at: new Date().toISOString(),
  };

  const { data: insertResult, error: insertError } = await supabaseAdmin
    .from('credits')
    .insert([insertPayload])
    .select();

  if (insertError) {
    console.error('❌ Falha no INSERT:', insertError.message);
    process.exit(1);
  }
  console.log('✓ [OK] INSERT realizado com sucesso no banco remoto.\n');

  // 3. Teste de UPDATE para status = 'used'
  console.log('[3/5] Executando UPDATE para status = "used"...');
  const today = new Date().toISOString().split('T')[0];
  const { error: updateError } = await supabaseAdmin
    .from('credits')
    .update({
      status: 'used',
      used_date: today,
      notes: 'Crédito marcado como utilizado durante auditoria'
    })
    .eq('id', testCreditId);

  if (updateError) {
    console.error('❌ Falha no UPDATE:', updateError.message);
    process.exit(1);
  }
  console.log('✓ [OK] UPDATE executado com sucesso no banco remoto.\n');

  // 4. Teste de Leitura (READ) e Persistência
  console.log('[4/5] Lendo novamente do banco para validar persistência física...');
  const { data: readResult, error: readError } = await supabaseAdmin
    .from('credits')
    .select('*')
    .eq('id', testCreditId)
    .single();

  if (readError || !readResult) {
    console.error('❌ Falha na leitura do registro persistido:', readError?.message);
    process.exit(1);
  }

  if (readResult.status !== 'used' || readResult.used_date !== today) {
    console.error('❌ Inconsistência nos campos persistidos:', readResult);
    process.exit(1);
  }

  console.log('✓ [OK] Leitura confirmada com status = "used" e used_date =', readResult.used_date);
  console.log('✓ [OK] Registro persistido com integridade comprovada.\n');

  // 5. Remoção do registro de teste
  console.log('[5/5] Removendo registro de teste...');
  const { error: deleteError } = await supabaseAdmin
    .from('credits')
    .delete()
    .eq('id', testCreditId);

  if (deleteError) {
    console.warn('⚠️ Aviso ao limpar registro de teste:', deleteError.message);
  } else {
    console.log('✓ [OK] Registro de teste removido com sucesso. Nenhum dado residual mantido.\n');
  }

  console.log('================================================================');
  console.log('VALIDAÇÃO DE PERSISTÊNCIA REMOTA CONCLUÍDA COM 100% DE SUCESSO!');
  console.log('================================================================');
}

validateRemoteCredits().catch((e) => {
  console.error('Erro fatal na validação:', e);
  process.exit(1);
});
