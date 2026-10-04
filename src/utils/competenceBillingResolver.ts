import {
  CompetenceBilling,
  findCompetenceBilling,
  Student,
  Enrollment,
  FinancialPlan,
  DiscountRule,
  Group,
  ChoirRegistration,
  Teacher,
  ClassSession,
  Credit,
  Transaction,
} from '../store';
import {
  isRaphaelTeacher,
  RAPHAEL_TEACHER_ID,
} from './raphaelBillingSimulation';
import {
  calculateRaphaelRealStudentBilling,
  calculateRaphaelRealGroupBilling,
  getClassesForEnrollment,
  RaphaelBillingMemory,
} from './raphaelRealBilling';

export interface ResolveBillingContext {
  competenceBillings?: CompetenceBilling[];
  transactions?: Transaction[];
  enrollments?: Enrollment[];
  financialPlans?: FinancialPlan[];
  discountRules?: DiscountRule[];
  groups?: Group[];
  choirRegistrations?: ChoirRegistration[];
  teachers?: Teacher[];
  students?: Student[];
  classes?: ClassSession[];
  credits?: Credit[];
}

export interface ResolveBillingParams {
  category: 'individual' | 'group' | 'choir';
  sourceId: string; // enrollment_id, group_id, ou choir_registration_id
  competence: string; // formato YYYY-MM
  context: ResolveBillingContext;
  // Opcional: data de referência de pagamento para simulação de desconto pontualidade
  paymentDay?: number;
}

export interface ResolvedCompetenceBilling {
  category: 'individual' | 'group' | 'choir';
  sourceId: string;
  competence: string; // YYYY-MM
  source: 'snapshot_frozen' | 'snapshot_pending' | 'historical_transaction' | 'open_vigente';
  isFrozen: boolean;
  isPaid: boolean;
  basePrice: number;
  discount: number;
  finalPrice: number;
  teacherShare: number;
  schoolShare: number;
  secShare: number;
  isPaying: boolean;
  transaction: Transaction | null;
  snapshot: CompetenceBilling | null;
  statusLabel: string;
  isHistorical: boolean;
  metadata?: Record<string, any>;
  raphaelBilling?: RaphaelBillingMemory | null;
}

/**
 * Normaliza o formato de competência para YYYY-MM
 */
export function normalizeCompetence(comp: string): string {
  if (!comp) return '';
  const trimmed = comp.trim();
  if (/^[0-9]{4}-[0-9]{2}$/.test(trimmed)) {
    return trimmed;
  }
  // Suporte a formato MM/YYYY
  const parts = trimmed.split('/');
  if (parts.length === 2 && parts[0].length === 2 && parts[1].length === 4) {
    return `${parts[1]}-${parts[0]}`;
  }
  return trimmed;
}

/**
 * Helper para localizar transaction histórica compatível com uma competência e entidade
 */
export function findHistoricalTransaction(
  transactions: Transaction[] | undefined,
  category: 'individual' | 'group' | 'choir',
  sourceId: string,
  competence: string,
  context?: ResolveBillingContext
): Transaction | undefined {
  if (!transactions || !Array.isArray(transactions)) return undefined;

  const normalizedComp = normalizeCompetence(competence);
  const [yearStr, monthStr] = normalizedComp.split('-');
  if (!yearStr || !monthStr) return undefined;

  const slashRef = `${monthStr}/${yearStr}`;

  if (category === 'individual') {
    const enrollmentDescPattern = `Mensalidade | ${sourceId} | ${slashRef}`;
    return transactions.find(
      (t) =>
        t.type === 'income' &&
        t.status === 'completed' &&
        t.description.includes(enrollmentDescPattern)
    );
  }

  if (category === 'group') {
    const groupDescPattern = `Mensalidade Grupo | ${sourceId} | ${slashRef}`;
    return transactions.find(
      (t) =>
        t.type === 'income' &&
        t.status === 'completed' &&
        t.description.includes(groupDescPattern)
    );
  }

  if (category === 'choir') {
    // Busca direta pelo ID de registro no Coral
    const directChoir = transactions.find(
      (t) =>
        t.type === 'income' &&
        t.status === 'completed' &&
        t.description.includes(slashRef) &&
        t.description.includes(sourceId)
    );
    if (directChoir) return directChoir;

    // Se temos contexto de estudantes, verificar pelo nome do estudante
    if (context?.choirRegistrations && context?.students) {
      const choirReg = context.choirRegistrations.find((r) => r.id === sourceId);
      if (choirReg) {
        const student = context.students.find((s) => s.id === choirReg.student_id);
        if (student) {
          return transactions.find(
            (t) =>
              t.type === 'income' &&
              t.status === 'completed' &&
              t.description.includes(slashRef) &&
              t.description.toLowerCase().includes(student.name.toLowerCase()) &&
              (t.description.includes('+ Coral') ||
                t.description.includes('Coral') ||
                t.description.includes('Inscrição Coral') ||
                t.description.includes('Mensalidade Coral'))
          );
        }
      }
    }
  }

  return undefined;
}

/**
 * Função centralizada e ÚNICA responsável por determinar o valor histórico/final de uma competência.
 * 
 * Regra de Prioridade:
 * PRIORIDADE 1: Existe snapshot congelado (`is_frozen = true`)
 *   -> Usa EXCLUSIVAMENTE o snapshot. Nunca recalcula com cadastro atual.
 * 
 * PRIORIDADE 2: Não existe snapshot congelado, mas existe transaction histórica comprovada
 *   -> Usa `transaction.amount` como valor histórico comprovado. Nunca recalcula com cadastro atual.
 * 
 * PRIORIDADE 3: Não existe snapshot nem transaction
 *   -> Competência aberta/futura/não comprovada: utiliza a configuração vigente.
 */
export function resolveCompetenceBilling(
  params: ResolveBillingParams
): ResolvedCompetenceBilling {
  const { category, sourceId, context, paymentDay } = params;
  const competence = normalizeCompetence(params.competence);

  // -------------------------------------------------------------
  // PRIORIDADE 1: Snapshot Congelado ou Histórico Existente
  // -------------------------------------------------------------
  const snapshot = findCompetenceBilling(
    context.competenceBillings,
    category,
    sourceId,
    competence
  );

  // Determinar se a entidade de origem está inativa
  let isEntityInactive = false;
  if (category === 'individual') {
    const en = context.enrollments?.find((e) => e.id === sourceId);
    if (en && en.status === 'inactive') isEntityInactive = true;
  } else if (category === 'group') {
    const gr = context.groups?.find((g) => g.id === sourceId);
    if (gr && gr.status === 'inactive') isEntityInactive = true;
  } else if (category === 'choir') {
    const ch = context.choirRegistrations?.find((r) => r.id === sourceId);
    if (ch && (ch.status === 'inactive' || ch.status === 'rejected' || ch.active === false)) isEntityInactive = true;
  }

  // -------------------------------------------------------------
  // PRIORIDADE 1: Snapshot Existente (Pending, Waived, Paid ou Frozen)
  // Qualquer snapshot persistido prevalece sobre cálculo dinâmico!
  // -------------------------------------------------------------
  if (snapshot) {
    const historicalTx = findHistoricalTransaction(
      context.transactions,
      category,
      sourceId,
      competence,
      context
    );

    const isPaid = snapshot.status === 'paid' || !!historicalTx;
    const isWaived = snapshot.status === 'waived';
    const isPending = snapshot.status === 'pending';

    let statusLabel = 'Pendente (Histórico)';
    if (snapshot.is_frozen) {
      statusLabel = isPaid ? 'Pago (Congelado)' : 'Congelado (Histórico)';
    } else if (isPaid) {
      statusLabel = 'Pago';
    } else if (isWaived) {
      statusLabel = 'Isento / Não Pagante';
    } else if (isPending) {
      statusLabel = 'Pendente (Fixado)';
    }

    let snapshotSecShare = 0;
    if (category === 'individual') {
      const enrollment = context.enrollments?.find((e) => e.id === sourceId);
      const plan = enrollment
        ? context.financialPlans?.find((p) => p.id === enrollment.plan_id)
        : undefined;
      if (plan && plan.secretary_fee_value) {
        snapshotSecShare = Number(plan.secretary_fee_value) || 0;
      }
    }

    return {
      category,
      sourceId,
      competence,
      source: snapshot.is_frozen ? 'snapshot_frozen' : 'snapshot_pending',
      isFrozen: !!snapshot.is_frozen,
      isPaid,
      basePrice: Number(snapshot.base_price || 0),
      discount: Number(snapshot.discount || 0),
      finalPrice: Number(snapshot.final_price || 0),
      teacherShare: Number(snapshot.teacher_share || 0),
      schoolShare: Number(snapshot.school_share || 0),
      secShare: snapshotSecShare,
      isPaying: snapshot.is_paying !== undefined ? snapshot.is_paying : Number(snapshot.final_price || 0) > 0,
      transaction: historicalTx || null,
      snapshot,
      statusLabel,
      isHistorical: true,
      metadata: snapshot.metadata || {},
      raphaelBilling: snapshot.metadata?.raphaelBilling || null,
    };
  }

  // -------------------------------------------------------------
  // PRIORIDADE 2: Transaction Histórica Comprovada
  // -------------------------------------------------------------
  const historicalTx = findHistoricalTransaction(
    context.transactions,
    category,
    sourceId,
    competence,
    context
  );

  if (historicalTx) {
    // Transação comprovada no extrato para este mês/ano
    const paidAmount = Number(historicalTx.amount || 0);

    // Buscar proporções vigentes apenas para estimativa de rateio interno se não houver snapshot
    let estTeacherShare = 0;
    let estSchoolShare = paidAmount;
    let estSecShare = 0;
    let estBasePrice = paidAmount;
    let estDiscount = 0;

    if (category === 'individual') {
      const enrollment = context.enrollments?.find((e) => e.id === sourceId);
      const plan = enrollment
        ? context.financialPlans?.find((p) => p.id === enrollment.plan_id)
        : undefined;
      if (plan) {
        estBasePrice =
          enrollment?.custom_price !== undefined
            ? enrollment.custom_price
            : plan.base_price;
        estDiscount = Math.max(0, estBasePrice - paidAmount);
        estTeacherShare =
          plan.teacher_fee_type === 'percentage'
            ? (estBasePrice * plan.teacher_fee_value) / 100
            : plan.teacher_fee_value;
        estSecShare = plan.secretary_fee_value || 0;
        estSchoolShare = Math.max(0, paidAmount - estTeacherShare - estSecShare);
      }
    } else if (category === 'group') {
      const group = context.groups?.find((g) => g.id === sourceId);
      if (group) {
        estBasePrice = group.price || paidAmount;
        estDiscount = Math.max(0, estBasePrice - paidAmount);
        estSchoolShare = paidAmount;
      }
    }

    return {
      category,
      sourceId,
      competence,
      source: 'historical_transaction',
      isFrozen: false,
      isPaid: true,
      basePrice: estBasePrice,
      discount: estDiscount,
      finalPrice: paidAmount, // Transaction.amount como valor histórico comprovado
      teacherShare: estTeacherShare,
      schoolShare: estSchoolShare,
      secShare: estSecShare,
      isPaying: true,
      transaction: historicalTx,
      snapshot: snapshot || null,
      statusLabel: 'Pago (Histórico Comprovado)',
      isHistorical: true,
      metadata: { transaction_id: historicalTx.id },
    };
  }

  // -------------------------------------------------------------
  // PRIORIDADE 3: Competência Aberta / Vigente
  // -------------------------------------------------------------
  if (category === 'individual') {
    const enrollment = context.enrollments?.find((e) => e.id === sourceId);
    if (!enrollment) {
      return createFallbackResolved(category, sourceId, competence);
    }

    // Proteção: Matrícula inativa sem snapshot nem transaction nesta competência
    // Não gerar nem projetar cobrança para competências posteriores ao encerramento
    if (enrollment.status === 'inactive') {
      let isPosterior = false;
      if (enrollment.end_date) {
        const [compYear, compMonth] = competence.split('-').map(Number);
        const [endYear, endMonth] = enrollment.end_date.split('-').map(Number);
        if (!isNaN(compYear) && !isNaN(compMonth) && !isNaN(endYear) && !isNaN(endMonth)) {
          if (compYear > endYear || (compYear === endYear && compMonth > endMonth)) {
            isPosterior = true;
          }
        } else {
          isPosterior = true;
        }
      } else {
        isPosterior = true;
      }

      if (isPosterior) {
        return {
          category: 'individual',
          sourceId,
          competence,
          source: 'open_vigente',
          isFrozen: false,
          isPaid: false,
          basePrice: 0,
          discount: 0,
          finalPrice: 0,
          teacherShare: 0,
          schoolShare: 0,
          secShare: 0,
          isPaying: false,
          transaction: null,
          snapshot: null,
          statusLabel: 'Encerrada (Sem cobrança)',
          isHistorical: false,
          metadata: { inactive_closed: true },
        };
      }
    }

    const plan = context.financialPlans?.find((p) => p.id === enrollment.plan_id);
    if (!plan) {
      return createFallbackResolved(category, sourceId, competence);
    }

    const teacher = context.teachers?.find((t) => t.id === enrollment.teacher_id);
    const isRaphael = isRaphaelTeacher(
      enrollment.teacher_id,
      teacher?.name,
      plan.exclusive_teacher_id
    );

    const basePrice =
      enrollment.custom_price !== undefined
        ? enrollment.custom_price
        : plan.base_price;

    // Cálculo de desconto cruzado com outras matrículas ativas do aluno
    let crossDiscount = 0;
    let schoolDiscount = 0;
    if (context.enrollments && context.discountRules) {
      const otherEnrollments = context.enrollments.filter(
        (oe) =>
          oe.student_id === enrollment.student_id &&
          oe.status === 'active' &&
          oe.id !== enrollment.id
      );
      const otherPlanIds = otherEnrollments.map((oe) => oe.plan_id);
      const applicableRules = context.discountRules.filter(
        (r) =>
          otherPlanIds.includes(r.trigger_plan_id) &&
          r.target_plan_id === plan.id
      );
      applicableRules.forEach((rule) => {
        if (rule.applies_to === 'total_price') {
          crossDiscount += rule.discount_value;
        } else if (rule.applies_to === 'school_share') {
          schoolDiscount += rule.discount_value;
          crossDiscount += rule.discount_value;
        }
      });
    }

    // Desconto de pontualidade antecipada se aplicável
    let earlyDiscount = 0;
    if (
      plan.allow_early_discount &&
      paymentDay !== undefined &&
      paymentDay <= plan.early_discount_deadline_day
    ) {
      earlyDiscount = plan.early_discount_value || 0;
    }

    const totalDiscount = crossDiscount + earlyDiscount;
    const priceWithDiscount = Math.max(0, basePrice - totalDiscount);

    // Se é professor Raphael, invocar o motor de cálculo real do Raphael
    let raphaelRealBilling: RaphaelBillingMemory | null = null;
    let finalAmount = priceWithDiscount;
    let teacherShare =
      plan.teacher_fee_type === 'percentage'
        ? (basePrice * plan.teacher_fee_value) / 100
        : plan.teacher_fee_value;
    let secShare = plan.secretary_fee_value || 0;
    let schoolShare = Math.max(0, plan.school_fee_value - schoolDiscount);

    if (isRaphael && context.classes) {
      const student = context.students?.find((s) => s.id === enrollment.student_id);
      const enrollmentClasses = getClassesForEnrollment(
        enrollment,
        context.classes,
        context.groups || [],
        plan
      );
      raphaelRealBilling = calculateRaphaelRealStudentBilling({
        enrollment,
        plan,
        teacher: teacher || ({
          id: RAPHAEL_TEACHER_ID,
          name: 'RAPHAEL AUGUSTO PINTO',
          email: '',
          phone: '',
          specialties: [],
        } as Teacher),
        classes: enrollmentClasses,
        monthStr: competence,
        credits: context.credits || [],
        applyCredits: true,
        studentName: student?.name || 'Aluno',
        allGroups: context.groups || [],
      });

      finalAmount = raphaelRealBilling.finalAmount;
      // No motor do Raphael a remuneração é derivada da quantidade de aulas efetivas
      teacherShare = (raphaelRealBilling.regularLessons + raphaelRealBilling.extraLessons) * raphaelRealBilling.pricePerLesson;
      schoolShare = Math.max(0, finalAmount - teacherShare);
    }

    return {
      category: 'individual',
      sourceId,
      competence,
      source: 'open_vigente',
      isFrozen: false,
      isPaid: false,
      basePrice,
      discount: totalDiscount,
      finalPrice: finalAmount,
      teacherShare,
      schoolShare,
      secShare,
      isPaying: finalAmount > 0,
      transaction: null,
      snapshot: snapshot || null,
      statusLabel: 'Pendente (Vigente)',
      isHistorical: false,
      raphaelBilling: raphaelRealBilling,
      metadata: isRaphael && raphaelRealBilling ? {
        billing_engine: 'raphael',
        regular_classes: raphaelRealBilling.regularLessons,
        extra_classes: raphaelRealBilling.extraLessons,
        teacher_cancelled_classes: raphaelRealBilling.cancelledLessons,
        credits_generated: raphaelRealBilling.creditsGeneratedCount,
        credits_consumed: raphaelRealBilling.creditsConsumedCount,
      } : {},
    };
  }

  if (category === 'group') {
    const group = context.groups?.find((g) => g.id === sourceId);
    if (!group) {
      return createFallbackResolved(category, sourceId, competence);
    }

    // Proteção: Grupo inativo sem snapshot nem transaction nesta competência
    // Não projetar nova cobrança para competências posteriores
    if (group.status === 'inactive') {
      return {
        category: 'group',
        sourceId,
        competence,
        source: 'open_vigente',
        isFrozen: false,
        isPaid: false,
        basePrice: 0,
        discount: 0,
        finalPrice: 0,
        teacherShare: 0,
        schoolShare: 0,
        secShare: 0,
        isPaying: false,
        transaction: null,
        snapshot: null,
        statusLabel: 'Grupo Encerrado (Sem cobrança)',
        isHistorical: false,
        metadata: { inactive_closed: true },
      };
    }

    const teacher = context.teachers?.find((t) => t.id === group.teacher_id);
    const isRaphael = isRaphaelTeacher(group.teacher_id, teacher?.name, null);

    let raphaelRealBilling: RaphaelBillingMemory | null = null;
    let finalAmount = group.price || 0;

    if (isRaphael && group.payment_type === 'group' && context.classes) {
      raphaelRealBilling = calculateRaphaelRealGroupBilling({
        group,
        teacher: teacher || ({
          id: RAPHAEL_TEACHER_ID,
          name: 'RAPHAEL AUGUSTO PINTO',
          email: '',
          phone: '',
          specialties: [],
        } as Teacher),
        classes: context.classes,
        monthStr: competence,
        credits: context.credits || [],
        applyCredits: true,
        allGroups: context.groups || [],
      });
      finalAmount = raphaelRealBilling.finalAmount;
    }

    const basePrice = group.price || 0;
    const discount = raphaelRealBilling ? raphaelRealBilling.creditDiscountAmount : 0;

    return {
      category: 'group',
      sourceId,
      competence,
      source: 'open_vigente',
      isFrozen: false,
      isPaid: false,
      basePrice,
      discount,
      finalPrice: finalAmount,
      teacherShare: 0,
      schoolShare: finalAmount,
      secShare: 0,
      isPaying: finalAmount > 0,
      transaction: null,
      snapshot: snapshot || null,
      statusLabel: 'Pendente (Vigente)',
      isHistorical: false,
      raphaelBilling: raphaelRealBilling,
      metadata: isRaphael && raphaelRealBilling ? {
        billing_engine: 'raphael_group',
        regular_classes: raphaelRealBilling.regularLessons,
        extra_classes: raphaelRealBilling.extraLessons,
        teacher_cancelled_classes: raphaelRealBilling.cancelledLessons,
        credits_generated: raphaelRealBilling.creditsGeneratedCount,
        credits_consumed: raphaelRealBilling.creditsConsumedCount,
      } : {},
    };
  }

  if (category === 'choir') {
    const choirReg = context.choirRegistrations?.find((r) => r.id === sourceId);
    if (!choirReg) {
      return createFallbackResolved(category, sourceId, competence);
    }

    // Proteção: Coral inativo sem snapshot nem transaction nesta competência
    // Não projetar nova cobrança para competências posteriores
    if (choirReg.status === 'inactive' || choirReg.status === 'rejected' || choirReg.active === false) {
      return {
        category: 'choir',
        sourceId,
        competence,
        source: 'open_vigente',
        isFrozen: false,
        isPaid: false,
        basePrice: 0,
        discount: 0,
        finalPrice: 0,
        teacherShare: 0,
        schoolShare: 0,
        secShare: 0,
        isPaying: false,
        transaction: null,
        snapshot: null,
        statusLabel: 'Coral Encerrado (Sem cobrança)',
        isHistorical: false,
        metadata: { inactive_closed: true },
      };
    }

    const monthlyFee = choirReg.monthly_fee || 0;

    return {
      category: 'choir',
      sourceId,
      competence,
      source: 'open_vigente',
      isFrozen: false,
      isPaid: false,
      basePrice: monthlyFee,
      discount: 0,
      finalPrice: monthlyFee,
      teacherShare: 0,
      schoolShare: monthlyFee,
      secShare: 0,
      isPaying: monthlyFee > 0,
      transaction: null,
      snapshot: snapshot || null,
      statusLabel: 'Pendente (Vigente)',
      isHistorical: false,
    };
  }

  return createFallbackResolved(category, sourceId, competence);
}

function createFallbackResolved(
  category: 'individual' | 'group' | 'choir',
  sourceId: string,
  competence: string
): ResolvedCompetenceBilling {
  return {
    category,
    sourceId,
    competence,
    source: 'open_vigente',
    isFrozen: false,
    isPaid: false,
    basePrice: 0,
    discount: 0,
    finalPrice: 0,
    teacherShare: 0,
    schoolShare: 0,
    secShare: 0,
    isPaying: false,
    transaction: null,
    snapshot: null,
    statusLabel: 'Não encontrado',
    isHistorical: false,
  };
}
