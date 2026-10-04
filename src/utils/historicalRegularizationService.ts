import {
  CompetenceBilling,
  Student,
  Enrollment,
  ChoirRegistration,
  Group,
  FinancialPlan,
  findCompetenceBilling,
} from '../store';

export interface HistoricalRegularizationInput {
  category: 'individual' | 'choir' | 'group';
  sourceId: string; // enrollment_id | choir_registration_id | group_id
  competence: string; // YYYY-MM
  basePrice: number;
  discount?: number;
  finalPrice: number;
  status: 'pending' | 'waived' | 'paid' | 'closed';
  isPaying: boolean;
  reason: string;
  operatorId: string;
  operatorEmail?: string;
  operatorRole?: string;
  confirmed: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface SuggestedCase {
  id: string;
  label: string;
  category: 'individual' | 'choir' | 'group';
  studentNamePattern: string;
  competence: string;
  basePrice: number;
  discount: number;
  finalPrice: number;
  status: 'pending' | 'waived' | 'paid' | 'closed';
  isPaying: boolean;
  defaultReason: string;
  note: string;
}

/**
 * Casos históricos confirmados pela direção da instituição para regularização assistida
 */
export const SUGGESTED_REGULARIZATION_CASES: SuggestedCase[] = [
  {
    id: 'case-ozeias-2026-07',
    label: 'Ozéias Vitoriano Barbosa — 07/2026 (R$ 100,00)',
    category: 'individual',
    studentNamePattern: 'Ozéias',
    competence: '2026-07',
    basePrice: 100,
    discount: 0,
    finalPrice: 100,
    status: 'pending',
    isPaying: true,
    defaultReason: 'Confirmação histórica da direção: competência 07/2026 de Ozéias no valor de R$ 100,00 (regularização assistida pré-snapshots)',
    note: '07/2026 → R$ 100,00 (pending)',
  },
  {
    id: 'case-ozeias-2026-08',
    label: 'Ozéias Vitoriano Barbosa — 08/2026 (R$ 100,00)',
    category: 'individual',
    studentNamePattern: 'Ozéias',
    competence: '2026-08',
    basePrice: 100,
    discount: 0,
    finalPrice: 100,
    status: 'pending',
    isPaying: true,
    defaultReason: 'Confirmação histórica da direção: competência 08/2026 de Ozéias no valor de R$ 100,00 (regularização assistida pré-snapshots)',
    note: '08/2026 → R$ 100,00 (pending)',
  },
  {
    id: 'case-ozeias-2026-09',
    label: 'Ozéias Vitoriano Barbosa — 09/2026 (R$ 40,00)',
    category: 'individual',
    studentNamePattern: 'Ozéias',
    competence: '2026-09',
    basePrice: 40,
    discount: 0,
    finalPrice: 40,
    status: 'pending',
    isPaying: true,
    defaultReason: 'Confirmação histórica da direção: competência 09/2026 de Ozéias no valor de R$ 40,00 (regularização assistida pré-snapshots)',
    note: '09/2026 → R$ 40,00 (pending)',
  },
  {
    id: 'case-carolina-2026-08',
    label: 'Carolina Seno Gomes (Coral) — 08/2026 (Não pagante / R$ 0 / waived)',
    category: 'choir',
    studentNamePattern: 'Carolina',
    competence: '2026-08',
    basePrice: 0,
    discount: 0,
    finalPrice: 0,
    status: 'waived',
    isPaying: false,
    defaultReason: 'Confirmação histórica da direção: Carolina no Coral em 08/2026 como Não Pagante / Isenta (regularização assistida pré-snapshots)',
    note: '08/2026 → Não pagante / R$ 0 / waived',
  },
  {
    id: 'case-carolina-2026-09',
    label: 'Carolina Seno Gomes (Coral) — 09/2026 (Pagante / R$ 20 / pending)',
    category: 'choir',
    studentNamePattern: 'Carolina',
    competence: '2026-09',
    basePrice: 20,
    discount: 0,
    finalPrice: 20,
    status: 'pending',
    isPaying: true,
    defaultReason: 'Confirmação histórica da direção: Carolina no Coral em 09/2026 como Pagante no valor de R$ 20,00 (regularização assistida pré-snapshots)',
    note: '09/2026 → Pagante / R$ 20 / pending',
  },
];

/**
 * Validação rigorosa dos parâmetros de regularização antes de persistir
 */
export function validateHistoricalRegularizationInput(
  input: HistoricalRegularizationInput,
  existingBillings: CompetenceBilling[]
): ValidationResult {
  // 1. Verificação de permissão
  if (input.operatorRole && !['super_admin', 'admin'].includes(input.operatorRole)) {
    return {
      isValid: false,
      error: 'Acesso negado: Apenas administradores ou super administradores podem realizar regularizações históricas.',
    };
  }

  // 2. Confirmação do operador obrigatória
  if (!input.confirmed) {
    return {
      isValid: false,
      error: 'Confirmação obrigatória: O operador deve confirmar expressamente a verificação das informações históricas.',
    };
  }

  // 3. Motivo obrigatório
  const trimmedReason = (input.reason || '').trim();
  if (!trimmedReason || trimmedReason.length < 5) {
    return {
      isValid: false,
      error: 'Motivo obrigatório: É indispensável justificar detalhadamente a regularização histórica para fins de auditoria.',
    };
  }

  // 4. Competência no formato YYYY-MM
  const trimmedComp = (input.competence || '').trim();
  if (!/^[0-9]{4}-[0-9]{2}$/.test(trimmedComp)) {
    return {
      isValid: false,
      error: 'Formato inválido: A competência deve seguir rigorosamente o padrão YYYY-MM (ex: 2026-07).',
    };
  }

  // 5. Categoria e origem
  if (!['individual', 'choir', 'group'].includes(input.category)) {
    return {
      isValid: false,
      error: 'Categoria inválida. Deve ser "individual", "choir" ou "group".',
    };
  }

  if (!input.sourceId || typeof input.sourceId !== 'string' || !input.sourceId.trim()) {
    return {
      isValid: false,
      error: 'Entidade de origem obrigatória: Selecione a matrícula, coralista ou grupo correspondente.',
    };
  }

  // 6. Regra Anti-Duplicidade: Competência NÃO pode já possuir snapshot
  const existing = findCompetenceBilling(
    existingBillings,
    input.category,
    input.sourceId,
    trimmedComp
  );
  if (existing) {
    return {
      isValid: false,
      error: `Snapshot já existente: Já existe um registro de competência (${existing.status}) para esta entidade em ${trimmedComp}. A regularização manual só é permitida para competências sem snapshot.`,
    };
  }

  // 7. Regras específicas para Coral
  if (input.category === 'choir') {
    if (!input.isPaying && (input.finalPrice !== 0 || input.status !== 'waived')) {
      return {
        isValid: false,
        error: 'Inconsistência de Coral Não Pagante: Coralistas não pagantes devem ter valor final R$ 0,00 e status "waived" (isento).',
      };
    }
    if (input.isPaying && input.finalPrice <= 0) {
      return {
        isValid: false,
        error: 'Inconsistência de Coral Pagante: Para coralistas pagantes, informe um valor final superior a zero.',
      };
    }
  }

  // 8. Regra para Dívida Ainda Não Paga: status deve ser 'pending'
  if (input.status === 'pending') {
    // Ok, dívida aberta
  }

  return { isValid: true };
}

export interface RegularizationContext {
  students: Student[];
  enrollments: Enrollment[];
  choirRegistrations: ChoirRegistration[];
  groups: Group[];
  financialPlans: FinancialPlan[];
  competenceBillings: CompetenceBilling[];
}

/**
 * Monta o registro de competence_billing com auditoria completa sem alterar cadastros vigentes
 */
export function buildHistoricalRegularizationRecord(
  input: HistoricalRegularizationInput,
  context: RegularizationContext
): Omit<CompetenceBilling, 'id' | 'created_at'> {
  const comp = input.competence.trim();
  const sourceId = input.sourceId.trim();

  let studentId: string | null = null;
  let teacherId: string | null = null;
  let teacherFeeType: string | null = null;
  let teacherFeeValue: number | null = null;
  let teacherShare = 0;
  let schoolShare = input.finalPrice;

  if (input.category === 'individual') {
    const enrollment = context.enrollments.find((e) => e.id === sourceId);
    if (enrollment) {
      studentId = enrollment.student_id;
      teacherId = enrollment.teacher_id || null;
      const plan = context.financialPlans.find((p) => p.id === enrollment.plan_id);
      if (plan) {
        teacherFeeType = plan.teacher_fee_type || null;
        teacherFeeValue = plan.teacher_fee_value != null ? Number(plan.teacher_fee_value) : null;
        if (teacherFeeType === 'percentage' && teacherFeeValue != null) {
          teacherShare = (input.finalPrice * teacherFeeValue) / 100;
        } else if (teacherFeeType === 'fixed' && teacherFeeValue != null) {
          teacherShare = teacherFeeValue;
        }
        const secretaryFee = Number(plan.secretary_fee_value || 0);
        schoolShare = Math.max(0, input.finalPrice - teacherShare - secretaryFee);
      }
    }
  } else if (input.category === 'choir') {
    const choirReg = context.choirRegistrations.find((c) => c.id === sourceId);
    if (choirReg) {
      studentId = choirReg.student_id;
    }
  } else if (input.category === 'group') {
    const grp = context.groups.find((g) => g.id === sourceId);
    if (grp) {
      teacherId = grp.teacher_id || null;
    }
  }

  const isFrozen = input.status === 'paid' || input.status === 'closed';

  return {
    competence: comp,
    category: input.category,
    enrollment_id: input.category === 'individual' ? sourceId : null,
    choir_registration_id: input.category === 'choir' ? sourceId : null,
    group_id: input.category === 'group' ? sourceId : null,
    student_id: studentId,
    teacher_id: teacherId,
    is_paying: input.isPaying,
    base_price: Number(input.basePrice || 0),
    discount: Number(input.discount || 0),
    final_price: Number(input.finalPrice || 0),
    teacher_fee_type: teacherFeeType,
    teacher_fee_value: teacherFeeValue,
    teacher_share: teacherShare,
    school_share: schoolShare,
    status: input.status,
    transaction_id: null, // NÃO criar transaction na regularização
    is_frozen: isFrozen,
    frozen_at: isFrozen ? new Date().toISOString() : null,
    frozen_by: isFrozen ? (input.operatorId || 'admin') : null,
    metadata: {
      source: 'historical_regularization',
      reason: input.reason.trim(),
      confirmed_by: input.operatorId || input.operatorEmail || 'admin',
      confirmed_at: new Date().toISOString(),
      created_by_role: input.operatorRole || 'admin',
      audited: true,
    },
  };
}

export interface SnapshotCorrectionInput {
  billingId: string;
  basePrice?: number;
  finalPrice: number;
  reason: string;
  operatorId: string;
  operatorEmail?: string;
  operatorRole?: string;
  confirmed: boolean;
}

/**
 * Validação rigorosa para correção administrativa de snapshot PENDING existente
 */
export function validateSnapshotCorrectionInput(
  input: SnapshotCorrectionInput,
  existingBilling: CompetenceBilling | undefined
): ValidationResult {
  // 1. Role: admin ou super_admin
  if (!input.operatorRole || !['super_admin', 'admin'].includes(input.operatorRole)) {
    return {
      isValid: false,
      error: 'Acesso negado: Apenas administradores ou super administradores podem corrigir snapshots.',
    };
  }

  // 2. Confirmação explícita
  if (!input.confirmed) {
    return {
      isValid: false,
      error: 'Confirmação obrigatória: É necessário confirmar expressamente a correção do snapshot.',
    };
  }

  // 3. Motivo obrigatório
  const trimmedReason = (input.reason || '').trim();
  if (!trimmedReason || trimmedReason.length < 5) {
    return {
      isValid: false,
      error: 'Motivo obrigatório: Justifique detalhadamente a correção para fins de auditoria.',
    };
  }

  // 4. Existência do snapshot
  if (!existingBilling) {
    return {
      isValid: false,
      error: 'Snapshot não encontrado: O snapshot a ser corrigido não foi localizado.',
    };
  }

  // 5. Regras de bloqueio estrito
  if (existingBilling.is_frozen) {
    return {
      isValid: false,
      error: 'Operação bloqueada: Não é permitido corrigir um snapshot congelado (is_frozen = true).',
    };
  }

  if (existingBilling.status === 'paid') {
    return {
      isValid: false,
      error: 'Operação bloqueada: Não é permitido alterar snapshot de competência já paga (status = paid).',
    };
  }

  if (existingBilling.transaction_id) {
    return {
      isValid: false,
      error: 'Operação bloqueada: Não é permitido alterar snapshot vinculado a uma transação financeira existente.',
    };
  }

  if (existingBilling.status !== 'pending') {
    return {
      isValid: false,
      error: `Operação bloqueada: Apenas snapshots com status 'pending' podem ser corrigidos (status atual: ${existingBilling.status}).`,
    };
  }

  if (input.finalPrice < 0 || isNaN(input.finalPrice)) {
    return {
      isValid: false,
      error: 'Valor final inválido.',
    };
  }

  return { isValid: true };
}

/**
 * Constrói payload de correção para snapshot PENDING existente com auditoria completa
 */
export function buildSnapshotCorrectionPayload(
  input: SnapshotCorrectionInput,
  existingBilling: CompetenceBilling
): Partial<CompetenceBilling> {
  const finalPrice = Number(input.finalPrice);
  const basePrice = input.basePrice !== undefined ? Number(input.basePrice) : finalPrice;
  const discount = Math.max(0, basePrice - finalPrice);

  let teacherShare = existingBilling.teacher_share;
  let schoolShare = existingBilling.school_share;

  if (existingBilling.teacher_fee_type === 'percentage') {
    const pct = existingBilling.teacher_fee_value != null ? existingBilling.teacher_fee_value : 100;
    teacherShare = (finalPrice * pct) / 100;
    schoolShare = finalPrice - teacherShare;
  } else if (existingBilling.teacher_fee_type === 'fixed') {
    teacherShare = Math.min(finalPrice, existingBilling.teacher_fee_value || 0);
    schoolShare = finalPrice - teacherShare;
  } else if (existingBilling.teacher_share === existingBilling.final_price) {
    teacherShare = finalPrice;
    schoolShare = 0;
  }

  const existingMeta = typeof existingBilling.metadata === 'object' && existingBilling.metadata !== null
    ? existingBilling.metadata
    : {};

  return {
    base_price: basePrice,
    discount: discount,
    final_price: finalPrice,
    teacher_share: teacherShare,
    school_share: schoolShare,
    metadata: {
      ...existingMeta,
      source: 'historical_regularization_correction',
      reason: input.reason.trim(),
      corrected_by: input.operatorEmail || input.operatorId || 'admin',
      corrected_at: new Date().toISOString(),
      previous_final_price: existingBilling.final_price,
      previous_base_price: existingBilling.base_price,
    },
  };
}
