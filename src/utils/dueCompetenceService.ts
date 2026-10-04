import {
  CompetenceBilling,
  CompetenceBillingCategory,
  findCompetenceBilling,
} from '../store';
import { supabase } from '../lib/supabase';
import {
  isRaphaelTeacher,
  RAPHAEL_TEACHER_ID,
} from './raphaelBillingSimulation';
import {
  calculateRaphaelRealStudentBilling,
  getClassesForEnrollment,
} from './raphaelRealBilling';
import { formatLocalDate } from './dateUtils';

export interface IsCompetenceDueOptions {
  category: CompetenceBillingCategory;
  competence: string; // "YYYY-MM"
  entity: any; // enrollment, choirRegistration or group
  referenceDate?: Date;
}

/**
 * Determina de forma centralizada se uma competência é DEVIDA para uma entidade.
 *
 * REGRA:
 * 1. Competência Futura (> ciclo atual): NUNCA é devida (não gera snapshot).
 * 2. Entidade não iniciada (start_date > competência): NÃO é devida.
 * 3. Entidade cancelada/encerrada antes da competência (end_date < competência): NÃO é devida.
 * 4. Competência do ciclo atual ou passada dentro da vigência da entidade: É DEVIDA.
 */
export function isCompetenceDue({
  category,
  competence,
  entity,
  referenceDate = new Date(),
}: IsCompetenceDueOptions): boolean {
  if (!competence || !/^\d{4}-\d{2}$/.test(competence.trim())) {
    return false;
  }
  if (!entity) return false;

  const comp = competence.trim();
  const [compYearStr, compMonthStr] = comp.split('-');
  const compYear = parseInt(compYearStr, 10);
  const compMonth = parseInt(compMonthStr, 10);

  // Ciclo atual de referência
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1;
  const currentCycle = `${refYear}-${refMonth.toString().padStart(2, '0')}`;

  // 1. COMPETÊNCIA FUTURA: Nunca é devida
  if (comp > currentCycle) {
    return false;
  }

  // 2. Extrair datas de início e fim da entidade
  let startDateStr: string | null = null;
  let endDateStr: string | null = null;

  if (category === 'individual') {
    startDateStr = entity.start_date || entity.enrollment_date || entity.created_at || null;
    endDateStr = entity.end_date || null;
  } else if (category === 'choir') {
    startDateStr = entity.created_at || entity.date || null;
    endDateStr = entity.end_date || null;
  } else if (category === 'group') {
    startDateStr = entity.start_date || entity.created_at || null;
    endDateStr = entity.end_date || null;
  }

  // Validar início: competência não pode ser anterior ao mês de início
  if (startDateStr) {
    const parts = startDateStr.split('T')[0].split('-');
    if (parts.length >= 2) {
      const sYear = parseInt(parts[0], 10);
      const sMonth = parseInt(parts[1], 10);
      if (!isNaN(sYear) && !isNaN(sMonth)) {
        if (compYear < sYear || (compYear === sYear && compMonth < sMonth)) {
          return false;
        }
      }
    }
  }

  // Validar término (desmatrícula / encerramento): competência não pode ser posterior ao mês de fim
  if (endDateStr) {
    const parts = endDateStr.split('T')[0].split('-');
    if (parts.length >= 2) {
      const eYear = parseInt(parts[0], 10);
      const eMonth = parseInt(parts[1], 10);
      if (!isNaN(eYear) && !isNaN(eMonth)) {
        if (compYear > eYear || (compYear === eYear && compMonth > eMonth)) {
          return false;
        }
      }
    }
  }

  // Se a entidade for inativa mas não tiver end_date informado, não considerar devida para competências futuras
  if (entity.status === 'inactive' && !endDateStr) {
    return false;
  }

  return true;
}

export interface CalculateDueBillingValuesParams {
  category: CompetenceBillingCategory;
  sourceId: string;
  competence: string;
  context: {
    students: any[];
    enrollments: any[];
    choirRegistrations: any[];
    financialPlans: any[];
    groups: any[];
    classes?: any[];
    teachers?: any[];
    credits?: any[];
    discountRules?: any[];
  };
}

export interface DueBillingValuesResult {
  category: CompetenceBillingCategory;
  competence: string;
  enrollment_id: string | null;
  choir_registration_id: string | null;
  group_id: string | null;
  student_id: string | null;
  teacher_id: string | null;
  is_paying: boolean;
  base_price: number;
  discount: number;
  final_price: number;
  teacher_fee_type: string | null;
  teacher_fee_value: number | null;
  teacher_share: number;
  school_share: number;
  status: 'pending' | 'waived';
  is_frozen: boolean;
  metadata: Record<string, any>;
}

/**
 * Calcula os valores estritos devidos no momento da materialização
 * com base no cadastro vigente NAQUELE INSTANTE.
 */
export function calculateDueBillingValues({
  category,
  sourceId,
  competence,
  context,
}: CalculateDueBillingValuesParams): DueBillingValuesResult | null {
  const comp = competence.trim();

  // -------------------------------------------------------------
  // INDIVIDUAL
  // -------------------------------------------------------------
  if (category === 'individual') {
    const enrollment = context.enrollments.find((e) => e.id === sourceId);
    if (!enrollment) return null;

    const plan = context.financialPlans.find((p) => p.id === enrollment.plan_id);
    if (!plan) return null;

    const student = context.students.find((s) => s.id === enrollment.student_id);
    const teacher = context.teachers?.find((t) => t.id === enrollment.teacher_id);
    const isRaphael = isRaphaelTeacher(enrollment.teacher_id, teacher?.name, plan.exclusive_teacher_id);

    // Motor Especial do Professor Raphael
    if (isRaphael) {
      const enrollmentClasses = getClassesForEnrollment(
        enrollment,
        context.classes || [],
        context.groups || [],
        plan
      );

      const raphaelRealBilling = calculateRaphaelRealStudentBilling({
        enrollment,
        plan,
        teacher: teacher || { id: RAPHAEL_TEACHER_ID, name: 'RAPHAEL AUGUSTO PINTO' },
        classes: enrollmentClasses,
        monthStr: comp,
        credits: context.credits || [],
        applyCredits: true,
        studentName: student?.name || 'Aluno',
        allGroups: context.groups || [],
      });

      const finalAmount = raphaelRealBilling.finalAmount;
      const teacherShare =
        plan.teacher_fee_type === 'percentage'
          ? (finalAmount * Number(plan.teacher_fee_value || 0)) / 100
          : Number(plan.teacher_fee_value || 0);
      const schoolShare = Math.max(0, finalAmount - teacherShare - Number(plan.secretary_fee_value || 0));

      return {
        category: 'individual',
        competence: comp,
        enrollment_id: enrollment.id,
        choir_registration_id: null,
        group_id: null,
        student_id: enrollment.student_id,
        teacher_id: enrollment.teacher_id || plan.exclusive_teacher_id || null,
        is_paying: true,
        base_price: plan.base_price,
        discount: raphaelRealBilling.creditDiscountAmount,
        final_price: finalAmount,
        teacher_fee_type: plan.teacher_fee_type || null,
        teacher_fee_value: plan.teacher_fee_value != null ? Number(plan.teacher_fee_value) : null,
        teacher_share: teacherShare,
        school_share: schoolShare,
        status: 'pending',
        is_frozen: false,
        metadata: {
          materialized_at: new Date().toISOString(),
          raphaelBilling: raphaelRealBilling,
          source: 'due_competence_materializer',
        },
      };
    }

    // Regra Padrão Individual
    const basePrice =
      enrollment.custom_price !== undefined && enrollment.custom_price !== null
        ? Number(enrollment.custom_price)
        : Number(plan.base_price || 0);

    const discount = 0; // Desconto padrão de tabela se houver
    const finalPrice = Math.max(0, basePrice - discount);

    const teacherShare =
      plan.teacher_fee_type === 'percentage'
        ? (finalPrice * Number(plan.teacher_fee_value || 0)) / 100
        : Number(plan.teacher_fee_value || 0);

    const schoolShare = Math.max(0, finalPrice - teacherShare - Number(plan.secretary_fee_value || 0));

    return {
      category: 'individual',
      competence: comp,
      enrollment_id: enrollment.id,
      choir_registration_id: null,
      group_id: null,
      student_id: enrollment.student_id,
      teacher_id: enrollment.teacher_id || plan.exclusive_teacher_id || null,
      is_paying: true,
      base_price: basePrice,
      discount,
      final_price: finalPrice,
      teacher_fee_type: plan.teacher_fee_type || null,
      teacher_fee_value: plan.teacher_fee_value != null ? Number(plan.teacher_fee_value) : null,
      teacher_share: teacherShare,
      school_share: schoolShare,
      status: 'pending',
      is_frozen: false,
      metadata: {
        materialized_at: new Date().toISOString(),
        source: 'due_competence_materializer',
      },
    };
  }

  // -------------------------------------------------------------
  // CORAL
  // -------------------------------------------------------------
  if (category === 'choir') {
    const choirReg = context.choirRegistrations.find((c) => c.id === sourceId);
    if (!choirReg) return null;

    const monthlyFee = Number(choirReg.monthly_fee || 0);
    const isPaying = monthlyFee > 0;

    return {
      category: 'choir',
      competence: comp,
      enrollment_id: null,
      choir_registration_id: choirReg.id,
      group_id: null,
      student_id: choirReg.student_id,
      teacher_id: null,
      is_paying: isPaying,
      base_price: monthlyFee,
      discount: 0,
      final_price: monthlyFee,
      teacher_fee_type: null,
      teacher_fee_value: null,
      teacher_share: 0,
      school_share: monthlyFee,
      status: isPaying ? 'pending' : 'waived',
      is_frozen: false,
      metadata: {
        materialized_at: new Date().toISOString(),
        source: 'due_competence_materializer',
      },
    };
  }

  // -------------------------------------------------------------
  // GRUPO
  // -------------------------------------------------------------
  if (category === 'group') {
    const group = context.groups.find((g) => g.id === sourceId);
    if (!group) return null;

    const basePrice = Number(group.price || 0);

    return {
      category: 'group',
      competence: comp,
      enrollment_id: null,
      choir_registration_id: null,
      group_id: group.id,
      student_id: null,
      teacher_id: group.teacher_id || null,
      is_paying: true,
      base_price: basePrice,
      discount: 0,
      final_price: basePrice,
      teacher_fee_type: null,
      teacher_fee_value: null,
      teacher_share: 0,
      school_share: basePrice,
      status: 'pending',
      is_frozen: false,
      metadata: {
        materialized_at: new Date().toISOString(),
        source: 'due_competence_materializer',
      },
    };
  }

  return null;
}

// In-flight locks para garantir concorrência e idempotência total
const inFlightLocks = new Map<string, Promise<CompetenceBilling | null>>();

export interface EnsureDueCompetenceBillingParams {
  category: CompetenceBillingCategory;
  sourceId: string;
  competence: string;
  context: {
    students: any[];
    enrollments: any[];
    choirRegistrations: any[];
    financialPlans: any[];
    groups: any[];
    competenceBillings: CompetenceBilling[];
    classes?: any[];
    teachers?: any[];
    credits?: any[];
    discountRules?: any[];
  };
  onBillingCreated?: (billing: CompetenceBilling) => void;
}

/**
 * Assegura de forma idempotente que uma competência devida possua um snapshot persistido (pending/waived).
 *
 * Se já existir snapshot: retorna o existente imediatamente sem alterar nada.
 * Se não for devida (ex: mês futuro): retorna null.
 * Se for devida e não existir: calcula e insere no banco, retornando o registro gerado.
 */
export async function ensureDueCompetenceBilling({
  category,
  sourceId,
  competence,
  context,
  onBillingCreated,
}: EnsureDueCompetenceBillingParams): Promise<CompetenceBilling | null> {
  const comp = competence.trim();
  const lockKey = `${category}:${sourceId}:${comp}`;

  // Se já há uma execução em andamento para a mesma chave, reaproveita a Promise
  if (inFlightLocks.has(lockKey)) {
    return inFlightLocks.get(lockKey)!;
  }

  const executionPromise = (async () => {
    try {
      // 1. Procurar snapshot existente no estado local
      const existing = findCompetenceBilling(
        context.competenceBillings,
        category,
        sourceId,
        comp
      );
      if (existing) {
        return existing;
      }

      // 2. Identificar entidade correspondente
      let entity: any = null;
      if (category === 'individual') {
        entity = context.enrollments.find((e) => e.id === sourceId);
      } else if (category === 'choir') {
        entity = context.choirRegistrations.find((c) => c.id === sourceId);
      } else if (category === 'group') {
        entity = context.groups.find((g) => g.id === sourceId);
      }

      if (!entity) return null;

      // 3. Validar se a competência é estritamente DEVIDA
      const due = isCompetenceDue({
        category,
        competence: comp,
        entity,
      });

      if (!due) {
        return null;
      }

      // 4. Verificação extra no Supabase para evitar condição de corrida entre abas/processos
      let dbQuery = supabase
        .from('competence_billings')
        .select('*')
        .eq('category', category)
        .eq('competence', comp);

      if (category === 'individual') dbQuery = dbQuery.eq('enrollment_id', sourceId);
      if (category === 'choir') dbQuery = dbQuery.eq('choir_registration_id', sourceId);
      if (category === 'group') dbQuery = dbQuery.eq('group_id', sourceId);

      const { data: dbExisting } = await dbQuery.limit(1);
      if (dbExisting && dbExisting.length > 0) {
        const found = dbExisting[0] as CompetenceBilling;
        if (onBillingCreated) {
          onBillingCreated(found);
        }
        return found;
      }

      // 5. Calcular valores estritos no momento da materialização
      const calculated = calculateDueBillingValues({
        category,
        sourceId,
        competence: comp,
        context,
      });

      if (!calculated) return null;

      const newRecord: CompetenceBilling = {
        id: crypto.randomUUID(),
        competence: comp,
        category,
        enrollment_id: calculated.enrollment_id,
        choir_registration_id: calculated.choir_registration_id,
        group_id: calculated.group_id,
        student_id: calculated.student_id,
        teacher_id: calculated.teacher_id,
        is_paying: calculated.is_paying,
        base_price: calculated.base_price,
        discount: calculated.discount,
        final_price: calculated.final_price,
        teacher_fee_type: calculated.teacher_fee_type,
        teacher_fee_value: calculated.teacher_fee_value,
        teacher_share: calculated.teacher_share,
        school_share: calculated.school_share,
        status: calculated.status,
        transaction_id: null,
        is_frozen: false,
        frozen_at: null,
        frozen_by: null,
        metadata: calculated.metadata,
        created_at: new Date().toISOString(),
      };

      // 6. Inserir no Supabase
      const { error: insertError } = await supabase
        .from('competence_billings')
        .insert([newRecord]);

      if (insertError) {
        // Se violou chave única (outro processo inseriu no mesmo milissegundo), recuperar existente
        if (insertError.code === '23505' || insertError.message.includes('unique')) {
          const { data: retryData } = await dbQuery.limit(1);
          if (retryData && retryData.length > 0) {
            const found = retryData[0] as CompetenceBilling;
            if (onBillingCreated) onBillingCreated(found);
            return found;
          }
        }
        console.error('[DueCompetenceService] Erro ao materializar competência devida:', insertError);
        throw new Error(insertError.message || 'Erro ao persistir competência devida.');
      }

      if (onBillingCreated) {
        onBillingCreated(newRecord);
      }

      return newRecord;
    } finally {
      inFlightLocks.delete(lockKey);
    }
  })();

  inFlightLocks.set(lockKey, executionPromise);
  return executionPromise;
}
