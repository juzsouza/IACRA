import assert from 'node:assert/strict';
import {
  normalizeOptionalFk,
  sanitizeEnrollmentInsertPayload,
  sanitizeEnrollmentUpdatePayload,
  getCanonicalEnrollmentKey,
  findDuplicateActiveEnrollment,
  reconcileAndAuditLoadedEnrollments,
  executeAddEnrollmentFlow,
  executeUpdateEnrollmentFlow,
  syncEnrollmentAffiliateReferral,
  buildReadOnlyMissingGroupEnrollmentsReport,
} from '../utils/enrollmentPersistence';
import { evaluateReferralStatus } from '../utils/affiliateCommission';
import type { Enrollment, AffiliateReferral } from '../store';

async function runEnrollmentPersistenceTests() {
  console.log('======================================================================');
  console.log('INICIANDO BATERIA DE TESTES DE PERSISTÊNCIA DE MATRÍCULAS (A - K)');
  console.log('======================================================================\n');

  let passed = 0;
  function pass(label: string) {
    console.log(`✅ PASS: ${label}`);
    passed++;
  }

  // Simulador de banco PostgreSQL/Supabase com validação estrita de FKs e colunas de public.enrollments
  const VALID_COLUMNS = new Set([
    'id',
    'student_id',
    'plan_id',
    'teacher_id',
    'group_id',
    'custom_price',
    'start_date',
    'enrollment_date',
    'status',
    'due_day',
    'due_date_day',
    'affiliate_id',
  ]);

  const validAffiliates = new Set(['aff_valid_001']);
  const validTeachers = new Set(['teacher_valid_001']);
  const validGroups = new Set(['group_mev_3', 'group_mev_8', 'group_mev_9', 'group_mev_12']);

  let dbEnrollments = new Map<string, any>();
  let lastInsertedRow: any = null;
  let lastUpdatedRow: any = null;
  let forceDbError: any = null;

  const mockSupabase = {
    from: (table: string) => {
      assert.equal(table, 'enrollments', 'Tabela deve ser public.enrollments');
      return {
        insert: async (rows: any[]) => {
          if (forceDbError) {
            return { error: forceDbError };
          }
          for (const row of rows) {
            lastInsertedRow = { ...row };
            // 1. Verificar colunas inexistentes (ex: end_date)
            for (const col of Object.keys(row)) {
              if (!VALID_COLUMNS.has(col)) {
                return {
                  error: {
                    code: 'PGRST204',
                    message: `Could not find the '${col}' column of 'enrollments' in the schema cache`,
                  },
                };
              }
            }
            // 2. Verificar FKs no padrão PostgreSQL (null é permitido; '' ou ID inexistente viola FK 23503)
            if (row.affiliate_id !== null && !validAffiliates.has(row.affiliate_id)) {
              return {
                error: {
                  code: '23503',
                  message: `insert or update on table "enrollments" violates foreign key constraint "enrollments_affiliate_id_fkey"`,
                },
              };
            }
            if (row.teacher_id !== null && !validTeachers.has(row.teacher_id)) {
              return {
                error: {
                  code: '23503',
                  message: `insert or update on table "enrollments" violates foreign key constraint "enrollments_teacher_id_fkey"`,
                },
              };
            }
            if (row.group_id !== null && !validGroups.has(row.group_id)) {
              return {
                error: {
                  code: '23503',
                  message: `insert or update on table "enrollments" violates foreign key constraint "enrollments_group_id_fkey"`,
                },
              };
            }
            dbEnrollments.set(row.id, { ...row });
          }
          return { error: null };
        },
        update: (values: Record<string, any>) => ({
          eq: async (column: string, val: string) => {
            if (forceDbError) {
              return { error: forceDbError };
            }
            lastUpdatedRow = { ...values };
            for (const col of Object.keys(values)) {
              if (!VALID_COLUMNS.has(col)) {
                return {
                  error: {
                    code: 'PGRST204',
                    message: `Could not find the '${col}' column of 'enrollments' in the schema cache`,
                  },
                };
              }
            }
            if ('affiliate_id' in values && values.affiliate_id !== null && !validAffiliates.has(values.affiliate_id)) {
              return {
                error: {
                  code: '23503',
                  message: `violates foreign key constraint "enrollments_affiliate_id_fkey"`,
                },
              };
            }
            if (column === 'id' && dbEnrollments.has(val)) {
              dbEnrollments.set(val, { ...dbEnrollments.get(val), ...values });
            }
            return { error: null };
          },
        }),
      };
    },
  };

  let stateEnrollments: Enrollment[] = [];
  let syncGroupCallCount = 0;

  // =========================================================================
  // TESTE A: Matrícula sem afiliado (affiliate_id: '') -> affiliate_id = null -> INSERT PASSA
  // =========================================================================
  {
    const res = await executeAddEnrollmentFlow({
      enrollmentInput: {
        student_id: 'student_talita',
        plan_id: 'plan_canto_grupo',
        teacher_id: 'teacher_valid_001',
        group_id: 'group_mev_12',
        status: 'active',
        enrollment_date: '2026-09-28',
        start_date: '2026-09-28',
        due_date_day: 5,
        affiliate_id: '', // Simula valor inicial do formData quando nenhum afiliado é selecionado
      },
      generatedId: 'enr_test_a',
      currentEnrollments: stateEnrollments,
      supabaseClient: mockSupabase,
      onCommitState: (next) => {
        stateEnrollments = next;
      },
    });

    assert.equal(res.success, true, 'INSERT sem afiliado deve passar');
    assert.equal(lastInsertedRow.affiliate_id, null, 'affiliate_id enviado ao banco deve ser null');
    assert.equal(dbEnrollments.has('enr_test_a'), true, 'Registro deve existir no banco');
    pass('A) Matrícula sem afiliado (affiliate_id = "") -> normalizado para null -> INSERT PASSA');
  }

  // =========================================================================
  // TESTE B: Matrícula sem professor (teacher_id: '' ou '   ') -> teacher_id = null -> INSERT PASSA
  // =========================================================================
  {
    const res = await executeAddEnrollmentFlow({
      enrollmentInput: {
        student_id: 'student_sem_prof',
        plan_id: 'plan_canto_grupo',
        teacher_id: '   ', // Whitespace vazio
        group_id: 'group_mev_3',
        status: 'active',
        enrollment_date: '2026-09-28',
        due_date_day: 10,
        affiliate_id: '',
      },
      generatedId: 'enr_test_b',
      currentEnrollments: stateEnrollments,
      supabaseClient: mockSupabase,
      onCommitState: (next) => {
        stateEnrollments = next;
      },
    });

    assert.equal(res.success, true, 'INSERT sem professor deve passar');
    assert.equal(lastInsertedRow.teacher_id, null, 'teacher_id enviado ao banco deve ser null');
    pass('B) Matrícula sem professor (teacher_id vazio/whitespace) -> normalizado para null -> INSERT PASSA');
  }

  // =========================================================================
  // TESTE C: Matrícula sem grupo (group_id: '') -> group_id = null -> INSERT PASSA
  // =========================================================================
  {
    const res = await executeAddEnrollmentFlow({
      enrollmentInput: {
        student_id: 'student_individual',
        plan_id: 'plan_individual',
        teacher_id: 'teacher_valid_001',
        group_id: '', // Matrícula individual sem grupo
        status: 'active',
        enrollment_date: '2026-09-28',
        due_date_day: 5,
        affiliate_id: '',
      },
      generatedId: 'enr_test_c',
      currentEnrollments: stateEnrollments,
      supabaseClient: mockSupabase,
      onCommitState: (next) => {
        stateEnrollments = next;
      },
    });

    assert.equal(res.success, true, 'INSERT sem grupo (individual) deve passar');
    assert.equal(lastInsertedRow.group_id, null, 'group_id enviado ao banco deve ser null');
    pass('C) Matrícula sem grupo (group_id = "") -> normalizado para null -> INSERT PASSA');
  }

  // =========================================================================
  // TESTE D: Matrícula com afiliado válido -> INSERT PASSA
  // =========================================================================
  {
    let referralSynced = false;
    const res = await executeAddEnrollmentFlow({
      enrollmentInput: {
        student_id: 'student_indicado',
        plan_id: 'plan_individual',
        teacher_id: 'teacher_valid_001',
        group_id: '',
        status: 'active',
        enrollment_date: '2026-09-28',
        due_date_day: 5,
        affiliate_id: 'aff_valid_001',
      },
      generatedId: 'enr_test_d',
      currentEnrollments: stateEnrollments,
      supabaseClient: mockSupabase,
      onCommitState: (next) => {
        stateEnrollments = next;
      },
      onSyncAffiliateReferral: async (created) => {
        referralSynced = created.affiliate_id === 'aff_valid_001';
      },
    });

    assert.equal(res.success, true, 'INSERT com afiliado válido deve passar');
    assert.equal(lastInsertedRow.affiliate_id, 'aff_valid_001', 'affiliate_id válido deve ser preservado');
    assert.equal(referralSynced, true, 'Hook de indicação de afiliado deve ser acionado após sucesso');
    pass('D) Matrícula com afiliado válido -> affiliate_id preservado -> INSERT PASSA');
  }

  // =========================================================================
  // TESTE E: Payload contendo end_date -> end_date NÃO é enviado ao Supabase
  // =========================================================================
  {
    const { dbPayload } = sanitizeEnrollmentInsertPayload(
      {
        student_id: 'student_inativo',
        plan_id: 'plan_individual',
        status: 'inactive',
        enrollment_date: '2026-09-01',
        end_date: '2026-09-28',
        due_date_day: 5,
      },
      'enr_test_e_ins'
    );
    assert.equal('end_date' in dbPayload, false, 'end_date não pode existir em dbPayload de INSERT');

    const resUpdate = await executeUpdateEnrollmentFlow({
      id: 'enr_test_a',
      updates: {
        status: 'inactive',
        end_date: '2026-09-28',
        affiliate_id: '',
      },
      currentEnrollments: stateEnrollments,
      supabaseClient: mockSupabase,
      onCommitState: (next) => {
        stateEnrollments = next;
      },
    });

    assert.equal(resUpdate.success, true, 'UPDATE com end_date no input deve higienizar e passar no banco');
    assert.equal('end_date' in lastUpdatedRow, false, 'end_date não pode ser enviado no UPDATE ao Supabase');
    assert.equal(lastUpdatedRow.affiliate_id, null, 'affiliate_id vazio no UPDATE vira null');

    // Reativar enr_test_a para os testes seguintes
    await executeUpdateEnrollmentFlow({
      id: 'enr_test_a',
      updates: { status: 'active' },
      currentEnrollments: stateEnrollments,
      supabaseClient: mockSupabase,
      onCommitState: (next) => {
        stateEnrollments = next;
      },
    });

    pass('E) Payload contendo end_date -> end_date é removido antes do INSERT/UPDATE no Supabase');
  }

  // =========================================================================
  // TESTE F & G: Erro do Supabase -> matrícula NÃO entra no state, NÃO informa sucesso e syncGroupFutureClasses NÃO executa
  // =========================================================================
  {
    const countBefore = stateEnrollments.length;
    syncGroupCallCount = 0;
    forceDbError = { code: '50000', message: 'Simulated database connection failure' };

    const resFail = await executeAddEnrollmentFlow({
      enrollmentInput: {
        student_id: 'student_fail_case',
        plan_id: 'plan_canto_grupo',
        teacher_id: 'teacher_valid_001',
        group_id: 'group_mev_9',
        status: 'active',
        enrollment_date: '2026-09-28',
        due_date_day: 5,
      },
      generatedId: 'enr_should_not_exist',
      currentEnrollments: stateEnrollments,
      supabaseClient: mockSupabase,
      onCommitState: (next) => {
        stateEnrollments = next;
      },
      onSyncGroupFutureClasses: async () => {
        syncGroupCallCount++;
      },
    });

    forceDbError = null;

    assert.equal(resFail.success, false, 'Retorno deve indicar falha quando o Supabase retorna erro');
    assert.ok(resFail.error && resFail.error.includes('Simulated database connection failure'), 'Mensagem de erro deve ser propagada para a interface');
    assert.equal(stateEnrollments.length, countBefore, 'Matrícula NÃO pode entrar no state quando o banco falha');
    assert.equal(
      stateEnrollments.some((e) => e.id === 'enr_should_not_exist'),
      false,
      'ID da matrícula falha não pode constar no state'
    );
    assert.equal(syncGroupCallCount, 0, 'syncGroupFutureClasses NÃO pode ser executado quando o INSERT falha');

    pass('F) Erro do Supabase -> matrícula NÃO entra no state e retorna erro para o modal permanecer aberto');
    pass('G) Erro do Supabase -> syncGroupFutureClasses NÃO é executado');
  }

  // =========================================================================
  // TESTE H: INSERT com sucesso -> state atualizado após confirmação e syncGroupFutureClasses executado
  // =========================================================================
  {
    let stateUpdatedBeforeSync = false;
    let syncedGroupId: string | null = null;

    const resSuccess = await executeAddEnrollmentFlow({
      enrollmentInput: {
        student_id: 'student_joao_pedro',
        plan_id: 'plan_canto_grupo',
        teacher_id: 'teacher_valid_001',
        group_id: 'group_mev_3',
        status: 'active',
        enrollment_date: '2026-09-28',
        due_date_day: 10,
        affiliate_id: '',
      },
      generatedId: 'enr_test_h',
      currentEnrollments: stateEnrollments,
      supabaseClient: mockSupabase,
      onCommitState: (next) => {
        stateEnrollments = next;
      },
      onSyncGroupFutureClasses: async (gid, nextList) => {
        stateUpdatedBeforeSync = nextList.some((e) => e.id === 'enr_test_h');
        syncedGroupId = gid;
      },
    });

    assert.equal(resSuccess.success, true, 'INSERT deve ter sucesso');
    assert.equal(stateEnrollments.some((e) => e.id === 'enr_test_h'), true, 'State deve conter a nova matrícula após confirmação');
    assert.equal(stateUpdatedBeforeSync, true, 'State já deve estar atualizado no momento do syncGroupFutureClasses');
    assert.equal(syncedGroupId, 'group_mev_3', 'syncGroupFutureClasses deve ser chamado para o grupo correto');
    pass('H) INSERT com sucesso -> state atualizado somente após confirmação do Supabase e syncGroupFutureClasses executado');
  }

  // =========================================================================
  // TESTE I: Duas matrículas do mesmo aluno no mesmo plano, em grupos diferentes -> NÃO são duplicadas
  // =========================================================================
  {
    const resGroup8 = await executeAddEnrollmentFlow({
      enrollmentInput: {
        student_id: 'student_maria_beatriz',
        plan_id: 'plan_canto_grupo',
        teacher_id: 'teacher_valid_001',
        group_id: 'group_mev_8',
        status: 'active',
        enrollment_date: '2026-09-28',
        due_date_day: 5,
      },
      generatedId: 'enr_mb_mev8',
      currentEnrollments: stateEnrollments,
      supabaseClient: mockSupabase,
      onCommitState: (next) => {
        stateEnrollments = next;
      },
    });

    const resGroup9 = await executeAddEnrollmentFlow({
      enrollmentInput: {
        student_id: 'student_maria_beatriz',
        plan_id: 'plan_canto_grupo',
        teacher_id: 'teacher_valid_001',
        group_id: 'group_mev_9',
        status: 'active',
        enrollment_date: '2026-09-28',
        due_date_day: 5,
      },
      generatedId: 'enr_mb_mev9',
      currentEnrollments: stateEnrollments,
      supabaseClient: mockSupabase,
      onCommitState: (next) => {
        stateEnrollments = next;
      },
    });

    assert.equal(resGroup8.success, true, 'Primeira matrícula em MEV 8 deve passar');
    assert.equal(resGroup9.success, true, 'Segunda matrícula da mesma aluna no mesmo plano em MEV 9 deve passar');
    assert.notEqual(
      getCanonicalEnrollmentKey(resGroup8.enrollment!),
      getCanonicalEnrollmentKey(resGroup9.enrollment!),
      'Chaves canônicas devem ser diferentes para grupos diferentes'
    );
    pass('I) Duas matrículas do mesmo aluno no mesmo plano, mas em grupos diferentes -> NÃO são consideradas duplicadas');
  }

  // =========================================================================
  // TESTE J: Mesma matrícula real repetida (mesmo student_id + plan_id + group_id) -> bloqueada
  // =========================================================================
  {
    const countBeforeDup = stateEnrollments.length;
    const resDuplicate = await executeAddEnrollmentFlow({
      enrollmentInput: {
        student_id: 'student_maria_beatriz',
        plan_id: 'plan_canto_grupo',
        teacher_id: 'teacher_valid_001',
        group_id: 'group_mev_9', // Mesmo grupo já ativo!
        status: 'active',
        enrollment_date: '2026-09-28',
        due_date_day: 5,
      },
      generatedId: 'enr_mb_mev9_dup',
      currentEnrollments: stateEnrollments,
      supabaseClient: mockSupabase,
      onCommitState: (next) => {
        stateEnrollments = next;
      },
    });

    assert.equal(resDuplicate.success, false, 'Matrícula ativa idêntica repetida deve ser bloqueada');
    assert.equal(stateEnrollments.length, countBeforeDup, 'Nenhuma duplicata deve ser adicionada ao state');
    assert.equal(dbEnrollments.has('enr_mb_mev9_dup'), false, 'Nenhuma duplicata deve ser inserida no banco');
    pass('J) Mesma matrícula real repetida (student_id + plan_id + group_id) -> duplicação indevida bloqueada');
  }

  // =========================================================================
  // TESTE K: Reload (reconcileAndAuditLoadedEnrollments) -> estado vem do banco corretamente sem apagar registros
  // =========================================================================
  {
    const rawRowsFromDb = Array.from(dbEnrollments.values());
    const studentMap = new Map<string, { id: string; status: string; not_eligible?: boolean }>([
      ['student_talita', { id: 'student_talita', status: 'active' }],
      ['student_sem_prof', { id: 'student_sem_prof', status: 'active' }],
      ['student_individual', { id: 'student_individual', status: 'active' }],
      ['student_indicado', { id: 'student_indicado', status: 'active' }],
      ['student_joao_pedro', { id: 'student_joao_pedro', status: 'active' }],
      ['student_maria_beatriz', { id: 'student_maria_beatriz', status: 'active' }],
    ]);

    const { enrollments: loadedOnReload, detectedDuplicates } = reconcileAndAuditLoadedEnrollments(
      rawRowsFromDb,
      studentMap,
      {}
    );

    assert.equal(loadedOnReload.length, rawRowsFromDb.length, 'Reload deve carregar todas as matrículas salvas no banco');
    assert.equal(detectedDuplicates.length, 0, 'Nenhuma duplicata falsa deve ser detectada entre grupos distintos');

    const mbLoaded = loadedOnReload.filter((e) => e.student_id === 'student_maria_beatriz' && e.status === 'active');
    assert.equal(mbLoaded.length, 2, 'Ambas as matrículas de Maria Beatriz (MEV 8 e MEV 9) devem permanecer ativas após reload');

    pass('K) Reload -> estado vem do banco corretamente preservando matrículas em grupos distintos sem deleção automática');
  }

  // =========================================================================
  // TESTE L, M, N, O, P: Sincronização de Afiliado / Indicação em updateEnrollment
  // =========================================================================
  {
    let referralsState: AffiliateReferral[] = [];
    const studentsList = [
      {
        id: 'student_davi',
        name: 'Davi de Oliveira Alexandre ',
        phone: '+5518997414468',
        email: 'tiago2020davianthony@gmail.com',
      },
      {
        id: 'student_pre_reg',
        name: 'Aluno Pré-Cadastrado',
        phone: '18999999999',
        email: 'pre@example.com',
      },
    ];

    const mockAddReferral = async (ref: Omit<AffiliateReferral, 'id' | 'created_at'>) => {
      referralsState.push({
        ...ref,
        id: `ref_${referralsState.length + 1}`,
        created_at: '2026-09-29T13:00:00.000Z',
      });
    };

    const mockUpdateReferral = async (id: string, updates: Partial<AffiliateReferral>) => {
      referralsState = referralsState.map((r) => (r.id === id ? { ...r, ...updates } : r));
    };

    // 1. Criar matrícula de Davi inicialmente SEM afiliado
    const addRes = await executeAddEnrollmentFlow({
      enrollmentInput: {
        student_id: 'student_davi',
        plan_id: 'plan_individual',
        teacher_id: 'teacher_valid_001',
        group_id: '',
        status: 'active',
        enrollment_date: '2026-09-29',
        start_date: '2026-10-01',
        due_date_day: 5,
        affiliate_id: '',
      },
      generatedId: 'enr_davi_001',
      currentEnrollments: stateEnrollments,
      supabaseClient: mockSupabase,
      onCommitState: (next) => {
        stateEnrollments = next;
      },
      onSyncAffiliateReferral: async (created) => {
        await syncEnrollmentAffiliateReferral({
          enrollment: created,
          students: studentsList,
          existingReferrals: referralsState,
          addAffiliateReferral: mockAddReferral,
          updateAffiliateReferral: mockUpdateReferral,
        });
      },
    });
    assert.equal(addRes.success, true);
    assert.equal(referralsState.length, 0, 'Sem afiliado não deve criar indicação');

    // TESTE L: Atualizar matrícula vinculando afiliado -> deve criar referral com competência 2026-10 e status enrolled_pending_payment
    const updRes = await executeUpdateEnrollmentFlow({
      id: 'enr_davi_001',
      updates: {
        affiliate_id: 'aff_valid_001',
      },
      currentEnrollments: stateEnrollments,
      supabaseClient: mockSupabase,
      onCommitState: (next) => {
        stateEnrollments = next;
      },
      onSyncAffiliateReferral: async (updated) => {
        await syncEnrollmentAffiliateReferral({
          enrollment: updated,
          students: studentsList,
          existingReferrals: referralsState,
          addAffiliateReferral: mockAddReferral,
          updateAffiliateReferral: mockUpdateReferral,
        });
      },
    });

    assert.equal(updRes.success, true, 'UPDATE vinculando afiliado deve ter sucesso');
    assert.equal(referralsState.length, 1, 'Deve criar exatamente 1 indicação ao vincular afiliado no UPDATE');
    assert.equal(referralsState[0].student_id, 'student_davi');
    assert.equal(referralsState[0].enrollment_id, 'enr_davi_001');
    assert.equal(referralsState[0].affiliate_id, 'aff_valid_001');
    assert.equal(referralsState[0].referred_name, 'Davi de Oliveira Alexandre');
    assert.equal(referralsState[0].referral_date, '2026-09-29');
    assert.equal(referralsState[0].status, 'enrolled_pending_payment');
    assert.equal(referralsState[0].conversion_competence, '2026-10', 'Data 2026-10-01 deve gerar competência 2026-10 sem shift de timezone');
    pass('L) UPDATE de matrícula vinculando afiliado cria affiliate_referrals automaticamente (2026-10 / enrolled_pending_payment)');

    // TESTE M: Editar novamente a mesma matrícula -> idempotente (não cria duplicata)
    const updAgainRes = await executeUpdateEnrollmentFlow({
      id: 'enr_davi_001',
      updates: {
        custom_price: 230,
        affiliate_id: 'aff_valid_001',
      },
      currentEnrollments: stateEnrollments,
      supabaseClient: mockSupabase,
      onCommitState: (next) => {
        stateEnrollments = next;
      },
      onSyncAffiliateReferral: async (updated) => {
        await syncEnrollmentAffiliateReferral({
          enrollment: updated,
          students: studentsList,
          existingReferrals: referralsState,
          addAffiliateReferral: mockAddReferral,
          updateAffiliateReferral: mockUpdateReferral,
        });
      },
    });
    assert.equal(updAgainRes.success, true);
    assert.equal(referralsState.length, 1, 'Editar matrícula novamente NÃO pode duplicar referral');
    pass('M) Repetir UPDATE na matrícula com mesmo afiliado é idempotente e não cria duplicata');

    // TESTE N: Indicação já convertida ('converted') não é rebaixada ao editar matrícula
    referralsState[0] = {
      ...referralsState[0],
      status: 'converted',
      conversion_competence: '2026-10',
    };
    await syncEnrollmentAffiliateReferral({
      enrollment: stateEnrollments.find((e) => e.id === 'enr_davi_001')!,
      students: studentsList,
      existingReferrals: referralsState,
      addAffiliateReferral: mockAddReferral,
      updateAffiliateReferral: mockUpdateReferral,
    });
    assert.equal(referralsState[0].status, 'converted', 'Status converted deve ser preservado ao editar matrícula');
    pass('N) Indicação já convertida preserva status "converted" ao editar matrícula');

    // TESTE O: Se o UPDATE no Supabase falhar, onSyncAffiliateReferral NÃO é chamado
    let syncCalledOnFailure = false;
    forceDbError = { code: '50000', message: 'Simulated update failure' };
    const failUpd = await executeUpdateEnrollmentFlow({
      id: 'enr_davi_001',
      updates: { custom_price: 250 },
      currentEnrollments: stateEnrollments,
      supabaseClient: mockSupabase,
      onCommitState: (next) => {
        stateEnrollments = next;
      },
      onSyncAffiliateReferral: async () => {
        syncCalledOnFailure = true;
      },
    });
    forceDbError = null;
    assert.equal(failUpd.success, false);
    assert.equal(syncCalledOnFailure, false, 'onSyncAffiliateReferral não pode executar se o UPDATE falhar');
    pass('O) Falha no UPDATE do Supabase impede execução de onSyncAffiliateReferral');

    // TESTE P: Aluna com duas matrículas (antiga paga R$ 120,00 e nova pendente R$ 350,00)
    // Indicação vinculada à matrícula nova -> deve retornar enrolled_pending_payment (sem falso positivo pelo nome)
    const isabelaStudent = {
      id: '904d7782-1e24-4e2b-af4a-6aea5f748fc9',
      name: 'Isabela Zito Santoro',
      status: 'active',
    };
    const isabelaEnrollments = [
      {
        id: '8c873d42-bbcf-4ae0-9080-0cfe1b88a6f2',
        student_id: isabelaStudent.id,
        status: 'active',
        start_date: '2026-08-12',
        enrollment_date: '2026-08-12',
      },
      {
        id: '991ff0ca-7a90-4bf6-8080-bc5fc538a5ea',
        student_id: isabelaStudent.id,
        status: 'active',
        start_date: '2026-10-02',
        enrollment_date: '2026-10-02',
      },
    ];
    const isabelaReferral = {
      id: '908c116d-78d2-49d5-bd4b-ddb6044631b3',
      student_id: isabelaStudent.id,
      enrollment_id: '991ff0ca-7a90-4bf6-8080-bc5fc538a5ea',
      referred_name: 'Isabela Zito Santoro',
      status: 'enrolled_pending_payment',
      conversion_competence: '2026-10',
    };
    const transactionsOnlyOldEnrollmentPaid = [
      {
        id: '068c35ea-13c7-434d-b977-2e6ec3a03c72',
        type: 'income',
        status: 'completed',
        amount: 120,
        description: 'Mensalidade | 8c873d42-bbcf-4ae0-9080-0cfe1b88a6f2 | 08/2026 | Isabela Zito Santoro - Canto Em grupo',
        date: '2026-08-19',
      },
      {
        id: 'c21dbd76-d8d2-4ba9-a673-b6a05a04cd0e',
        type: 'income',
        status: 'completed',
        amount: 120,
        description: 'Mensalidade | 8c873d42-bbcf-4ae0-9080-0cfe1b88a6f2 | 09/2026 | Isabela Zito Santoro - Canto Em grupo [Raphael Etapa 5]',
        date: '2026-09-15',
      },
    ];

    const evalBeforeNewPayment = evaluateReferralStatus(
      isabelaReferral,
      [isabelaStudent],
      isabelaEnrollments,
      transactionsOnlyOldEnrollmentPaid
    );

    assert.equal(
      evalBeforeNewPayment.status,
      'enrolled_pending_payment',
      'Com matrícula antiga paga e matrícula nova pendente, a indicação da matrícula nova deve ser enrolled_pending_payment'
    );
    assert.equal(evalBeforeNewPayment.studentId, isabelaStudent.id);
    assert.equal(evalBeforeNewPayment.enrollmentId, '991ff0ca-7a90-4bf6-8080-bc5fc538a5ea');
    assert.equal(evalBeforeNewPayment.firstTransactionId, undefined);
    pass('P) Aluna com duas matrículas (antiga paga, nova pendente) retorna enrolled_pending_payment para indicação da matrícula nova');

    // TESTE Q: Depois que a matrícula nova tiver uma transaction completed -> resultado deve passar para converted
    const transactionsWithNewEnrollmentPaid = [
      ...transactionsOnlyOldEnrollmentPaid,
      {
        id: 'tx_new_violao_350',
        type: 'income',
        status: 'completed',
        amount: 350,
        description: 'Mensalidade | 991ff0ca-7a90-4bf6-8080-bc5fc538a5ea | 10/2026 | Isabela Zito Santoro - Violão',
        date: '2026-10-05',
      },
    ];

    const evalAfterNewPayment = evaluateReferralStatus(
      isabelaReferral,
      [isabelaStudent],
      isabelaEnrollments,
      transactionsWithNewEnrollmentPaid
    );

    assert.equal(
      evalAfterNewPayment.status,
      'converted',
      'Após pagamento completed vinculado especificamente à matrícula nova, o status deve passar para converted'
    );
    assert.equal(evalAfterNewPayment.enrollmentId, '991ff0ca-7a90-4bf6-8080-bc5fc538a5ea');
    assert.equal(evalAfterNewPayment.firstTransactionId, 'tx_new_violao_350');
    assert.equal(evalAfterNewPayment.conversionCompetence, '2026-10');
    pass('Q) Após transaction completed da matrícula nova, evaluateReferralStatus retorna converted com firstTransactionId correto');
  }

  console.log(`\n======================================================================`);
  console.log(`TODOS OS ${passed} TESTES DE PERSISTÊNCIA DE MATRÍCULAS PASSARAM!`);
  console.log(`======================================================================\n`);
}

runEnrollmentPersistenceTests().catch((err) => {
  console.error('❌ FALHA NOS TESTES DE PERSISTÊNCIA DE MATRÍCULAS:', err);
  process.exit(1);
});
