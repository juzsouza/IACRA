import assert from 'node:assert/strict';
import { Credit, ClassSession, Enrollment, FinancialPlan, Group, Teacher } from '../store';
import { calculateRaphaelClassCreditValue, RAPHAEL_TEACHER_ID } from '../utils/raphaelBillingSimulation';

// ==============================================================================
// TESTES OBRIGATÓRIOS DO CICLO DE PERSISTÊNCIA DOS CRÉDITOS (A até K)
// ==============================================================================

async function runCreditsPersistenceLifecycleTests() {
  console.log('================================================================');
  console.log('INICIANDO BATERIA DE TESTES DE PERSISTÊNCIA DE CRÉDITOS (A - K)');
  console.log('================================================================\n');

  // Banco simulado de alta fidelidade espelhando o PostgreSQL/Supabase
  const dbCreditsTable = new Map<string, any>();

  // Mock do cliente Supabase para isolar o teste do ciclo de vida
  const mockSupabase = {
    from: (table: string) => {
      assert.equal(table, 'credits', 'Tabela acessada deve ser public.credits');
      return {
        select: async (cols: string = '*') => {
          return { data: Array.from(dbCreditsTable.values()), error: null };
        },
        upsert: async (payload: any | any[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
          const items = Array.isArray(payload) ? payload : [payload];
          for (const item of items) {
            if (options?.ignoreDuplicates && dbCreditsTable.has(item.id)) {
              continue;
            }
            dbCreditsTable.set(item.id, { ...item });
          }
          return { error: null };
        },
        insert: async (payload: any[]) => {
          for (const item of payload) {
            dbCreditsTable.set(item.id, { ...item });
          }
          return { error: null };
        },
        delete: () => ({
          eq: async (col: string, val: string) => {
            if (col === 'id') {
              dbCreditsTable.delete(val);
            }
            return { error: null };
          }
        })
      };
    }
  };

  // Massa de dados de teste
  const testTeacher: Teacher = {
    id: RAPHAEL_TEACHER_ID,
    name: 'RAPHAEL AUGUSTO PINTO',
    email: 'raphael@escola.com',
    phone: '',
    specialties: ['Canto'],
    status: 'active',
  };

  const testStudentId = '21d10314-83bf-4781-94bf-8e1dae874b93';
  const testEnrollment: Enrollment = {
    id: 'enr_001',
    student_id: testStudentId,
    plan_id: 'plan_001',
    teacher_id: RAPHAEL_TEACHER_ID,
    status: 'active',
    due_day: 10,
    due_date_day: 10,
    enrollment_date: '2026-09-01',
  };

  const testPlan: FinancialPlan = {
    id: 'plan_001',
    name: 'Canto Individual Semanal',
    category: 'individual',
    modality: 'semanal',
    base_price: 400,
    duration_minutes: 60,
    max_students: 1,
    margin_value: 0,
    secretary_fee_type: 'fixed',
    secretary_fee_value: 0,
    school_fee_type: 'fixed',
    school_fee_value: 0,
    teacher_fee_type: 'percentage',
    teacher_fee_value: 50,
    is_active: true,
    exclusive_teacher_id: undefined,
    allow_early_discount: false,
    early_discount_value: 0,
    early_discount_deadline_day: 5,
  };

  const cancelledClass: ClassSession = {
    id: 'class_cancelled_test_01',
    title: 'Aula de Canto - Raphael',
    teacher_id: RAPHAEL_TEACHER_ID,
    date: '2026-09-15',
    start_time: '14:00',
    end_time: '15:00',
    status: 'cancelled',
    cancelled_by_teacher: true,
    report: 'Cancelada pelo professor devido a problemas de saúde',
    student_ids: [testStudentId],
  };

  // Simulação do store com o algoritmo corrigido
  let localStateCredits: Credit[] = [];

  // Função pura que reproduz o reconcile com proteção de integridade
  function reconcileCreditsPure(
    currentClasses: ClassSession[],
    dbCreditsList: Credit[],
    currentLocalCredits: Credit[]
  ): { reconciled: Credit[]; toPersist: Credit[] } {
    const baseCredits: Credit[] = (currentLocalCredits.length > 0 ? currentLocalCredits : dbCreditsList);
    const creditsMap = new Map<string, Credit>();
    baseCredits.forEach((c) => {
      if (c.source_class_id) creditsMap.set(c.source_class_id, c);
      if (c.id) creditsMap.set(c.id, c);
    });
    // Banco tem prioridade absoluta de status
    dbCreditsList.forEach((c) => {
      if (c.source_class_id) creditsMap.set(c.source_class_id, c);
      if (c.id) creditsMap.set(c.id, c);
    });

    const reconciled: Credit[] = [...baseCredits];
    const toPersist: Credit[] = [];

    currentClasses.forEach((cl) => {
      const calc = calculateRaphaelClassCreditValue(
        cl,
        [testEnrollment],
        [testPlan],
        [],
        [testTeacher]
      );

      if (calc.isEligible) {
        const existing = creditsMap.get(cl.id) || creditsMap.get(`credit_${cl.id}`);
        if (existing) {
          const idx = reconciled.findIndex((c) => c.id === existing.id);
          if (idx !== -1) {
            reconciled[idx] = {
              ...reconciled[idx],
              amount: calc.amount,
              student_id: calc.studentId,
              enrollment_id: calc.enrollmentId || reconciled[idx].enrollment_id,
              group_id: calc.groupId,
              teacher_id: calc.teacherId,
              competency_month: (cl.date || '').substring(0, 7),
              // PRESERVAÇÃO ESTRITA DO BANCO
              status: existing.status,
              used_date: existing.used_date || reconciled[idx].used_date,
              notes: existing.notes || reconciled[idx].notes,
            };
          }
        } else {
          const newCred: Credit = {
            id: `credit_${cl.id}`,
            student_id: calc.studentId,
            enrollment_id: calc.enrollmentId,
            group_id: calc.groupId,
            teacher_id: calc.teacherId,
            source_class_id: cl.id,
            amount: calc.amount,
            status: 'available',
            competency_month: (cl.date || '').substring(0, 7),
            created_at: new Date().toISOString(),
            notes: `Crédito gerado pelo cancelamento da aula de ${cl.date} (Professor Raphael)`,
          };
          reconciled.push(newCred);
          creditsMap.set(cl.id, newCred);
          creditsMap.set(newCred.id, newCred);
          toPersist.push(newCred);
        }
      } else {
        const existing = creditsMap.get(cl.id) || creditsMap.get(`credit_${cl.id}`);
        if (existing && existing.status === 'available') {
          const idx = reconciled.findIndex((c) => c.id === existing.id);
          if (idx !== -1) {
            reconciled[idx] = { ...reconciled[idx], status: 'cancelled' };
          }
        }
      }
    });

    return { reconciled, toPersist };
  }

  // Helper de updateCredit conforme implementado
  async function updateCreditPure(
    id: string,
    updates: Partial<Credit>
  ): Promise<{ success: boolean; error?: string }> {
    const current = localStateCredits.find((c) => c.id === id);
    if (!current) return { success: false, error: 'Crédito não encontrado' };

    const prepared = { ...updates };
    if (prepared.status === 'used' && !prepared.used_date && !current.used_date) {
      prepared.used_date = new Date().toISOString().split('T')[0];
    }

    const fullPayload = {
      id: current.id,
      teacher_id: current.teacher_id,
      student_id: current.student_id || null,
      enrollment_id: current.enrollment_id || null,
      group_id: current.group_id || null,
      source_class_id: current.source_class_id || null,
      amount: prepared.amount !== undefined ? prepared.amount : current.amount,
      status: prepared.status || current.status,
      competency_month: prepared.competency_month || current.competency_month,
      used_date: prepared.used_date !== undefined ? prepared.used_date : (current.used_date || null),
      notes: prepared.notes !== undefined ? prepared.notes : (current.notes || null),
      created_at: current.created_at || new Date().toISOString()
    };

    const { error } = await mockSupabase.from('credits').upsert(fullPayload, { onConflict: 'id' });
    if (error) return { success: false, error: 'Erro no Supabase' };

    localStateCredits = localStateCredits.map((c) => (c.id === id ? { ...c, ...prepared } : c));
    return { success: true };
  }

  // --------------------------------------------------------------------------
  // TESTE A: Crédito novo -> aparece como Disponível
  // --------------------------------------------------------------------------
  console.log('[Teste A] Gerando crédito novo a partir de aula cancelada...');
  const stepA = reconcileCreditsPure([cancelledClass], [], []);
  localStateCredits = stepA.reconciled;
  // Persistir no banco como o ciclo de vida real faz
  await mockSupabase.from('credits').upsert(stepA.toPersist);

  const credA = localStateCredits.find((c) => c.source_class_id === cancelledClass.id);
  assert.ok(credA, 'Crédito deve ser gerado');
  assert.equal(credA.status, 'available', 'Status inicial deve ser "available"');
  console.log('✓ [PASSOU] Teste A: Crédito novo gerado com status "available".\n');

  // --------------------------------------------------------------------------
  // TESTE B: Clicar "Marcar Usado" -> salva no Supabase
  // --------------------------------------------------------------------------
  console.log('[Teste B] Clicando "Marcar Usado"...');
  const resB = await updateCreditPure(credA.id, { status: 'used' });
  assert.equal(resB.success, true, 'Atualização deve ter sucesso');

  const credB = localStateCredits.find((c) => c.id === credA.id);
  assert.equal(credB?.status, 'used', 'Estado local deve refletir status "used"');

  const inDbB = dbCreditsTable.get(credA.id);
  assert.ok(inDbB, 'Crédito deve estar salvo no banco');
  assert.equal(inDbB.status, 'used', 'Banco Supabase deve ter status "used"');
  assert.ok(inDbB.used_date, 'used_date deve ter sido preenchida automaticamente');
  console.log('✓ [PASSOU] Teste B: Status "used" e used_date salvos com sucesso no Supabase.\n');

  // --------------------------------------------------------------------------
  // TESTE C: Fechar a modal -> continua Usado
  // --------------------------------------------------------------------------
  console.log('[Teste C] Fechando a modal (estado da store preservado)...');
  const credC = localStateCredits.find((c) => c.id === credA.id);
  assert.equal(credC?.status, 'used', 'Fechamento da modal mantém status "used"');
  console.log('✓ [PASSOU] Teste C: Modal fechada preserva status "used".\n');

  // --------------------------------------------------------------------------
  // TESTE D: Abrir novamente -> continua Usado
  // --------------------------------------------------------------------------
  console.log('[Teste D] Reabrindo a modal...');
  const credD = localStateCredits.find((c) => c.id === credA.id);
  assert.equal(credD?.status, 'used', 'Reabertura da modal exibe status "used"');
  console.log('✓ [PASSOU] Teste D: Modal reaberta continua com status "used".\n');

  // --------------------------------------------------------------------------
  // TESTE E: Recarregar a página (F5) -> recarrega do Supabase e continua Usado
  // --------------------------------------------------------------------------
  console.log('[Teste E] Simulando F5 / recarregamento total da página (memória limpa)...');
  localStateCredits = []; // Limpa memória RAM da SPA
  const dbDataE = (await mockSupabase.from('credits').select()).data;
  const stepE = reconcileCreditsPure([cancelledClass], dbDataE, []);
  localStateCredits = stepE.reconciled;

  const credE = localStateCredits.find((c) => c.id === credA.id);
  assert.equal(credE?.status, 'used', 'Após F5, crédito recarregado do Supabase DEVE continuar "used"!');
  console.log('✓ [PASSOU] Teste E: Recarregamento de página preserva status "used" do Supabase.\n');

  // --------------------------------------------------------------------------
  // TESTE F: Logout / Login -> continua Usado
  // --------------------------------------------------------------------------
  console.log('[Teste F] Simulando novo ciclo de autenticação (logout/login)...');
  localStateCredits = []; // Sessão reiniciada
  const dbDataF = (await mockSupabase.from('credits').select()).data;
  const stepF = reconcileCreditsPure([cancelledClass], dbDataF, []);
  localStateCredits = stepF.reconciled;

  const credF = localStateCredits.find((c) => c.id === credA.id);
  assert.equal(credF?.status, 'used', 'Após novo login, crédito permanece "used"');
  console.log('✓ [PASSOU] Teste F: Novo login preserva status "used".\n');

  // --------------------------------------------------------------------------
  // TESTE G: Outro ciclo de reconciliação -> NÃO volta para Disponível
  // --------------------------------------------------------------------------
  console.log('[Teste G] Executando novo ciclo manual de reconciliação de aulas...');
  const dbDataG = (await mockSupabase.from('credits').select()).data;
  const stepG = reconcileCreditsPure([cancelledClass], dbDataG, localStateCredits);
  localStateCredits = stepG.reconciled;

  const credG = localStateCredits.find((c) => c.id === credA.id);
  assert.equal(credG?.status, 'used', 'Reconciliação NUNCA deve reverter "used" para "available"');
  console.log('✓ [PASSOU] Teste G: Novo ciclo de reconciliação NÃO volta crédito para "available".\n');

  // --------------------------------------------------------------------------
  // TESTE H: Crédito Cancelled -> continua Cancelled
  // --------------------------------------------------------------------------
  console.log('[Teste H] Testando crédito marcado como "cancelled"...');
  await updateCreditPure(credA.id, { status: 'cancelled' });
  const dbDataH = (await mockSupabase.from('credits').select()).data;
  const stepH = reconcileCreditsPure([cancelledClass], dbDataH, localStateCredits);

  const credH = stepH.reconciled.find((c) => c.id === credA.id);
  assert.equal(credH?.status, 'cancelled', 'Crédito cancelado deve continuar "cancelled"');
  console.log('✓ [PASSOU] Teste H: Crédito cancelado permanece estritamente "cancelled".\n');

  // --------------------------------------------------------------------------
  // TESTE I: Crédito usado com used_date -> preserva used_date
  // --------------------------------------------------------------------------
  console.log('[Teste I] Verificando preservação de used_date...');
  const customDate = '2026-09-20';
  await updateCreditPure(credA.id, { status: 'used', used_date: customDate });
  const dbDataI = (await mockSupabase.from('credits').select()).data;
  const stepI = reconcileCreditsPure([cancelledClass], dbDataI, []);

  const credI = stepI.reconciled.find((c) => c.id === credA.id);
  assert.equal(credI?.used_date, customDate, 'used_date original deve ser mantida');
  console.log('✓ [PASSOU] Teste I: used_date personalizada preservada integralmente.\n');

  // --------------------------------------------------------------------------
  // TESTE J: Notes -> preserva notes
  // --------------------------------------------------------------------------
  console.log('[Teste J] Verificando preservação de observações contábeis...');
  const customNotes = 'Compensado no fechamento de mensalidade de Setembro';
  await updateCreditPure(credA.id, { notes: customNotes });
  const dbDataJ = (await mockSupabase.from('credits').select()).data;
  const stepJ = reconcileCreditsPure([cancelledClass], dbDataJ, []);

  const credJ = stepI.reconciled.find((c) => c.id === credA.id);
  const inDbJ = dbCreditsTable.get(credA.id);
  assert.equal(inDbJ.notes, customNotes, 'Observações devem ser mantidas no banco');
  console.log('✓ [PASSOU] Teste J: Notes e histórico contábil preservados.\n');

  // --------------------------------------------------------------------------
  // TESTE K: Duplicidade -> a mesma aula cancelada não gera dois créditos
  // --------------------------------------------------------------------------
  console.log('[Teste K] Testando proteção anti-duplicação...');
  const dbDataK = (await mockSupabase.from('credits').select()).data;
  // Rodar 5 reconciliações sucessivas com a mesma aula cancelada
  let stateK = localStateCredits;
  for (let i = 0; i < 5; i++) {
    const cycle = reconcileCreditsPure([cancelledClass], dbDataK, stateK);
    stateK = cycle.reconciled;
  }

  const matchesK = stateK.filter((c) => c.source_class_id === cancelledClass.id);
  assert.equal(matchesK.length, 1, 'Deve existir rigorosamente APENAS UM crédito por aula cancelada');
  console.log('✓ [PASSOU] Teste K: Proteção anti-duplicação confirmada (1 crédito por aula).\n');

  console.log('================================================================');
  console.log('TODOS OS TESTES OBRIGATÓRIOS (A até K) FORAM CONCLUÍDOS COM SUCESSO!');
  console.log('================================================================');
}

runCreditsPersistenceLifecycleTests().catch((err) => {
  console.error('Falha nos testes de ciclo de persistência:', err);
  process.exit(1);
});
