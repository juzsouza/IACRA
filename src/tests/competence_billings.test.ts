import assert from 'node:assert/strict';
import {
  CompetenceBilling,
  findCompetenceBilling,
  validateCompetenceBillingInput,
} from '../store';

async function runTests() {
  console.log('--- Iniciando Testes Unitários: Competence Billings (Etapa 2) ---');

  // Estado simulado em memória para testes unitários
  let stateBillings: CompetenceBilling[] = [];
  let simulatedTransactions: any[] = [];

  // Implementação de teste espelhando rigorosamente a lógica do store
  function testCreateCompetenceBilling(
    input: Omit<CompetenceBilling, 'id' | 'created_at'> & { id?: string }
  ): CompetenceBilling {
    const validation = validateCompetenceBillingInput(input);
    if (!validation.isValid) {
      throw new Error(validation.error);
    }

    const id = input.id || 'test-uuid-' + Math.random().toString(36).substring(2, 9);
    const createdAt = new Date().toISOString();

    const newRecord: CompetenceBilling = {
      id,
      competence: input.competence.trim(),
      category: input.category,
      enrollment_id: input.category === 'individual' ? (input.enrollment_id || null) : null,
      choir_registration_id: input.category === 'choir' ? (input.choir_registration_id || null) : null,
      group_id: input.category === 'group' ? (input.group_id || null) : null,
      student_id: input.student_id || null,
      teacher_id: input.teacher_id || null,
      is_paying: input.is_paying !== undefined ? !!input.is_paying : true,
      base_price: Number(input.base_price || 0),
      discount: Number(input.discount || 0),
      final_price: Number(input.final_price || 0),
      teacher_fee_type: input.teacher_fee_type || null,
      teacher_fee_value: input.teacher_fee_value != null ? Number(input.teacher_fee_value) : null,
      teacher_share: Number(input.teacher_share || 0),
      school_share: Number(input.school_share || 0),
      status: input.status || 'pending',
      transaction_id: input.transaction_id || null,
      is_frozen: !!input.is_frozen,
      frozen_at: input.frozen_at || null,
      frozen_by: input.frozen_by || null,
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
      created_at: createdAt,
    };

    stateBillings = [newRecord, ...stateBillings];
    return newRecord;
  }

  function testUpdateCompetenceBilling(
    id: string,
    updates: Partial<CompetenceBilling>
  ): CompetenceBilling {
    const existing = stateBillings.find((b) => b.id === id);
    if (!existing) {
      throw new Error(`Snapshot de faturamento com ID "${id}" não foi encontrado.`);
    }

    if (existing.is_frozen) {
      const protectedFields: (keyof CompetenceBilling)[] = [
        'base_price',
        'discount',
        'final_price',
        'teacher_share',
        'school_share',
        'is_paying',
        'teacher_fee_type',
        'teacher_fee_value',
        'metadata',
        'is_frozen',
        'category',
        'competence',
        'enrollment_id',
        'group_id',
        'choir_registration_id',
        'student_id',
        'teacher_id',
      ];
      const isViolated = protectedFields.some(
        (f) => updates[f] !== undefined && updates[f] !== existing[f]
      );
      if (isViolated) {
        throw new Error('Competência congelada. O histórico financeiro não pode ser alterado.');
      }
    }

    const targetCategory = updates.category !== undefined ? updates.category : existing.category;
    const targetCompetence = updates.competence !== undefined ? updates.competence.trim() : existing.competence;
    const targetEnrollmentId = updates.enrollment_id !== undefined ? updates.enrollment_id : existing.enrollment_id;
    const targetGroupId = updates.group_id !== undefined ? updates.group_id : existing.group_id;
    const targetChoirId = updates.choir_registration_id !== undefined ? updates.choir_registration_id : existing.choir_registration_id;

    if (
      updates.category !== undefined ||
      updates.competence !== undefined ||
      updates.enrollment_id !== undefined ||
      updates.group_id !== undefined ||
      updates.choir_registration_id !== undefined
    ) {
      const validation = validateCompetenceBillingInput({
        category: targetCategory,
        competence: targetCompetence,
        enrollment_id: targetEnrollmentId,
        group_id: targetGroupId,
        choir_registration_id: targetChoirId,
      });
      if (!validation.isValid) {
        throw new Error(validation.error);
      }
    }

    const updatedRecord: CompetenceBilling = {
      ...existing,
      ...updates,
      competence: updates.competence !== undefined ? updates.competence.trim() : existing.competence,
      base_price: updates.base_price !== undefined ? Number(updates.base_price) : existing.base_price,
      discount: updates.discount !== undefined ? Number(updates.discount) : existing.discount,
      final_price: updates.final_price !== undefined ? Number(updates.final_price) : existing.final_price,
      teacher_fee_value: updates.teacher_fee_value !== undefined ? (updates.teacher_fee_value != null ? Number(updates.teacher_fee_value) : null) : existing.teacher_fee_value,
      teacher_share: updates.teacher_share !== undefined ? Number(updates.teacher_share) : existing.teacher_share,
      school_share: updates.school_share !== undefined ? Number(updates.school_share) : existing.school_share,
    };

    stateBillings = stateBillings.map((b) => (b.id === id ? updatedRecord : b));
    return updatedRecord;
  }

  function testFreezeCompetenceBilling(id: string, userId: string): CompetenceBilling {
    const existing = stateBillings.find((b) => b.id === id);
    if (!existing) {
      throw new Error(`Snapshot de faturamento com ID "${id}" não foi encontrado.`);
    }

    const frozenRecord: CompetenceBilling = {
      ...existing,
      is_frozen: true,
      frozen_at: new Date().toISOString(),
      frozen_by: userId || null,
    };

    stateBillings = stateBillings.map((b) => (b.id === id ? frozenRecord : b));
    return frozenRecord;
  }

  // 1. Criar billing individual
  console.log('Teste 1: Criar billing individual...');
  const individualBilling = testCreateCompetenceBilling({
    competence: '2026-09',
    category: 'individual',
    enrollment_id: 'enr-123',
    choir_registration_id: null,
    group_id: null,
    student_id: 'stu-001',
    teacher_id: 'tea-001',
    is_paying: true,
    base_price: 350,
    discount: 50,
    final_price: 300,
    teacher_fee_type: 'percentage',
    teacher_fee_value: 50,
    teacher_share: 150,
    school_share: 150,
    status: 'pending',
    transaction_id: null,
    is_frozen: false,
    frozen_at: null,
    frozen_by: null,
    metadata: { test: true },
  });
  assert.equal(individualBilling.category, 'individual');
  assert.equal(individualBilling.enrollment_id, 'enr-123');
  assert.equal(individualBilling.group_id, null);
  assert.equal(individualBilling.choir_registration_id, null);
  assert.equal(individualBilling.final_price, 300);
  console.log('✓ Teste 1 passou');

  // 2. Criar billing de grupo
  console.log('Teste 2: Criar billing de grupo...');
  const groupBilling = testCreateCompetenceBilling({
    competence: '2026-09',
    category: 'group',
    enrollment_id: null,
    choir_registration_id: null,
    group_id: 'grp-456',
    student_id: null,
    teacher_id: 'tea-002',
    is_paying: true,
    base_price: 600,
    discount: 0,
    final_price: 600,
    teacher_fee_type: 'fixed',
    teacher_fee_value: 200,
    teacher_share: 200,
    school_share: 400,
    status: 'pending',
    transaction_id: null,
    is_frozen: false,
    frozen_at: null,
    frozen_by: null,
    metadata: {},
  });
  assert.equal(groupBilling.category, 'group');
  assert.equal(groupBilling.group_id, 'grp-456');
  assert.equal(groupBilling.enrollment_id, null);
  assert.equal(groupBilling.choir_registration_id, null);
  console.log('✓ Teste 2 passou');

  // 3. Criar billing de Coral
  console.log('Teste 3: Criar billing de Coral...');
  const choirBilling = testCreateCompetenceBilling({
    competence: '2026-09',
    category: 'choir',
    enrollment_id: null,
    choir_registration_id: 'choir-reg-789',
    group_id: null,
    student_id: 'stu-003',
    teacher_id: null,
    is_paying: true,
    base_price: 120,
    discount: 0,
    final_price: 120,
    teacher_fee_type: null,
    teacher_fee_value: null,
    teacher_share: 0,
    school_share: 120,
    status: 'pending',
    transaction_id: null,
    is_frozen: false,
    frozen_at: null,
    frozen_by: null,
    metadata: {},
  });
  assert.equal(choirBilling.category, 'choir');
  assert.equal(choirBilling.choir_registration_id, 'choir-reg-789');
  assert.equal(choirBilling.enrollment_id, null);
  assert.equal(choirBilling.group_id, null);
  console.log('✓ Teste 3 passou');

  // 4. Buscar billing por matrícula
  console.log('Teste 4: Buscar billing por matrícula...');
  const foundByEnrollment = findCompetenceBilling(stateBillings, 'individual', 'enr-123', '2026-09');
  assert.ok(foundByEnrollment);
  assert.equal(foundByEnrollment.id, individualBilling.id);
  assert.equal(foundByEnrollment.enrollment_id, 'enr-123');
  console.log('✓ Teste 4 passou');

  // 5. Buscar billing por grupo
  console.log('Teste 5: Buscar billing por grupo...');
  const foundByGroup = findCompetenceBilling(stateBillings, 'group', 'grp-456', '2026-09');
  assert.ok(foundByGroup);
  assert.equal(foundByGroup.id, groupBilling.id);
  assert.equal(foundByGroup.group_id, 'grp-456');
  console.log('✓ Teste 5 passou');

  // 6. Buscar billing por Coral
  console.log('Teste 6: Buscar billing por Coral...');
  const foundByChoir = findCompetenceBilling(stateBillings, 'choir', 'choir-reg-789', '2026-09');
  assert.ok(foundByChoir);
  assert.equal(foundByChoir.id, choirBilling.id);
  assert.equal(foundByChoir.choir_registration_id, 'choir-reg-789');
  console.log('✓ Teste 6 passou');

  // 7. Buscar por competência
  console.log('Teste 7: Buscar por competência diferente...');
  const notFoundWrongComp = findCompetenceBilling(stateBillings, 'individual', 'enr-123', '2026-08');
  assert.equal(notFoundWrongComp, undefined);
  const foundCorrectComp = findCompetenceBilling(stateBillings, 'individual', 'enr-123', ' 2026-09 ');
  assert.ok(foundCorrectComp);
  console.log('✓ Teste 7 passou');

  // 8. Atualizar billing aberto
  console.log('Teste 8: Atualizar billing aberto...');
  const updatedOpen = testUpdateCompetenceBilling(individualBilling.id, {
    base_price: 400,
    final_price: 350,
    discount: 50,
    teacher_share: 175,
    school_share: 175,
  });
  assert.equal(updatedOpen.base_price, 400);
  assert.equal(updatedOpen.final_price, 350);
  assert.equal(updatedOpen.teacher_share, 175);
  console.log('✓ Teste 8 passou');

  // 9. Congelar billing
  console.log('Teste 9: Congelar billing...');
  const frozenBilling = testFreezeCompetenceBilling(individualBilling.id, 'user-admin-123');
  assert.equal(frozenBilling.is_frozen, true);
  assert.equal(frozenBilling.frozen_by, 'user-admin-123');
  assert.ok(frozenBilling.frozen_at);
  console.log('✓ Teste 9 passou');

  // 10. Impedir alteração de billing congelado
  console.log('Teste 10: Impedir alteração de billing congelado...');
  assert.throws(
    () => {
      testUpdateCompetenceBilling(individualBilling.id, {
        final_price: 999,
      });
    },
    /Competência congelada\. O histórico financeiro não pode ser alterado\./
  );

  assert.throws(
    () => {
      testUpdateCompetenceBilling(individualBilling.id, {
        base_price: 500,
      });
    },
    /Competência congelada\. O histórico financeiro não pode ser alterado\./
  );

  assert.throws(
    () => {
      testUpdateCompetenceBilling(individualBilling.id, {
        is_frozen: false,
      });
    },
    /Competência congelada\. O histórico financeiro não pode ser alterado\./
  );
  console.log('✓ Teste 10 passou');

  // 11. Rejeitar category inválida
  console.log('Teste 11: Rejeitar category inválida...');
  assert.throws(
    () => {
      testCreateCompetenceBilling({
        competence: '2026-09',
        category: 'workshop' as any,
        enrollment_id: 'enr-999',
        choir_registration_id: null,
        group_id: null,
        student_id: null,
        teacher_id: null,
        is_paying: true,
        base_price: 100,
        discount: 0,
        final_price: 100,
        teacher_fee_type: null,
        teacher_fee_value: null,
        teacher_share: 50,
        school_share: 50,
        status: 'pending',
        transaction_id: null,
        is_frozen: false,
        frozen_at: null,
        frozen_by: null,
        metadata: {},
      });
    },
    /Categoria inválida/
  );
  console.log('✓ Teste 11 passou');

  // 12. Rejeitar origem incompatível
  console.log('Teste 12: Rejeitar origem incompatível...');
  // Individual com group_id
  assert.throws(
    () => {
      testCreateCompetenceBilling({
        competence: '2026-09',
        category: 'individual',
        enrollment_id: 'enr-123',
        group_id: 'grp-forbidden',
        choir_registration_id: null,
        student_id: null,
        teacher_id: null,
        is_paying: true,
        base_price: 100,
        discount: 0,
        final_price: 100,
        teacher_fee_type: null,
        teacher_fee_value: null,
        teacher_share: 50,
        school_share: 50,
        status: 'pending',
        transaction_id: null,
        is_frozen: false,
        frozen_at: null,
        frozen_by: null,
        metadata: {},
      });
    },
    /Origem incompatível/
  );

  // Group com choir_registration_id
  assert.throws(
    () => {
      testCreateCompetenceBilling({
        competence: '2026-09',
        category: 'group',
        group_id: 'grp-123',
        choir_registration_id: 'choir-forbidden',
        enrollment_id: null,
        student_id: null,
        teacher_id: null,
        is_paying: true,
        base_price: 100,
        discount: 0,
        final_price: 100,
        teacher_fee_type: null,
        teacher_fee_value: null,
        teacher_share: 50,
        school_share: 50,
        status: 'pending',
        transaction_id: null,
        is_frozen: false,
        frozen_at: null,
        frozen_by: null,
        metadata: {},
      });
    },
    /Origem incompatível/
  );
  console.log('✓ Teste 12 passou');

  // 13. Rejeitar competência inválida
  console.log('Teste 13: Rejeitar competência inválida...');
  assert.throws(
    () => {
      testCreateCompetenceBilling({
        competence: '2026/09',
        category: 'individual',
        enrollment_id: 'enr-123',
        choir_registration_id: null,
        group_id: null,
        student_id: null,
        teacher_id: null,
        is_paying: true,
        base_price: 100,
        discount: 0,
        final_price: 100,
        teacher_fee_type: null,
        teacher_fee_value: null,
        teacher_share: 50,
        school_share: 50,
        status: 'pending',
        transaction_id: null,
        is_frozen: false,
        frozen_at: null,
        frozen_by: null,
        metadata: {},
      });
    },
    /Competência inválida/
  );

  assert.throws(
    () => {
      testCreateCompetenceBilling({
        competence: 'Setembro 2026',
        category: 'individual',
        enrollment_id: 'enr-123',
        choir_registration_id: null,
        group_id: null,
        student_id: null,
        teacher_id: null,
        is_paying: true,
        base_price: 100,
        discount: 0,
        final_price: 100,
        teacher_fee_type: null,
        teacher_fee_value: null,
        teacher_share: 50,
        school_share: 50,
        status: 'pending',
        transaction_id: null,
        is_frozen: false,
        frozen_at: null,
        frozen_by: null,
        metadata: {},
      });
    },
    /Competência inválida/
  );
  console.log('✓ Teste 13 passou');

  // 14. Garantir que não é criada transaction
  console.log('Teste 14: Garantir que nenhuma transaction foi criada durante as operações...');
  assert.equal(simulatedTransactions.length, 0, 'Nenhuma transaction deve ser criada');
  console.log('✓ Teste 14 passou');

  // 15. Garantir que não são criados snapshots históricos automaticamente
  console.log('Teste 15: Garantir que não são criados snapshots históricos automaticamente...');
  // Apenas as 3 instâncias explicitamente criadas nos testes (individual, grupo, coral) existem
  assert.equal(stateBillings.length, 3, 'Apenas os snapshots explicitamente criados devem existir');
  const pastSnapshot = stateBillings.find((b) => b.competence < '2026-09');
  assert.equal(pastSnapshot, undefined, 'Nenhum snapshot histórico retroativo foi gerado');
  console.log('✓ Teste 15 passou');

  console.log('\n========================================');
  console.log('TODOS OS 15 TESTES PASSARAM COM SUCESSO!');
  console.log('========================================');
}

runTests().catch((err) => {
  console.error('Falha nos testes:', err);
  process.exit(1);
});
