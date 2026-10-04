/**
 * Motor Financeiro Real de Faturamento do Professor Raphael Augusto Pinto (Etapa 5)
 *
 * ESCOPO ABSOLUTO:
 * - Professor Raphael Augusto Pinto (ID: dada085e-c187-43d2-9ab0-a9e0539df450)
 * - Matrículas individuais com Raphael
 * - Grupos com group.teacher_id === RAPHAEL_ID e group.payment_type === 'group'
 *
 * Regras:
 * - Frequência: Quinzenal = 2 aulas-base; Semanal = 4 aulas-base
 * - Valor por aula = Mensalidade / Aulas-base
 * - Aulas normais cobradas individualmente pelo valor por aula
 * - Cancelamento pelo professor (status = 'cancelled' e cancelled_by_teacher = true) gera crédito
 * - Pagamento da competência de origem do cancelamento permanece INALTERADO
 * - Crédito é aplicado em competência posterior para abater a cobrança ou cobrir reposição
 * - Proteção contra dupla utilização de crédito e dupla cobrança de competência
 */

import { ClassSession, Credit, Enrollment, FinancialPlan, Group, Teacher } from "../store";
import {
  RAPHAEL_TEACHER_ID,
  isRaphaelTeacher,
  isCancelledByTeacherEligible,
  isMakeupClass,
} from "./raphaelBillingSimulation";
import { getGroupForSession } from "./groupMatch";

export interface EligibleCreditDetail {
  id: string;
  amount: number;
  originName: string;
  sourceDate?: string;
  notes?: string;
}

export interface RaphaelBillingMemory {
  teacherName: string;
  targetName: string;
  targetType: "individual" | "group";
  monthStr: string;
  monthLabel: string;
  frequency: "quinzenal" | "semanal";
  baseLessons: number;
  monthlyBasePrice: number;
  pricePerLesson: number;
  regularLessons: number;
  extraLessons: number;
  cancelledLessons: number;
  creditsGeneratedCount: number;
  creditsGeneratedAmount: number;
  creditsAvailableCount: number;
  creditsAvailableAmount: number;
  creditsConsumedList: Credit[];
  creditsConsumedCount: number;
  creditsConsumedAmount: number;
  eligibleCreditsDetails?: EligibleCreditDetail[];
  makeupLessons: number;
  studentAbsences: number;
  grossAmount: number;
  creditDiscountAmount: number;
  finalAmount: number;
  isOriginCancellationMonth: boolean;
  classifiedClasses: {
    id: string;
    date: string;
    title: string;
    status: string;
    type: "regular" | "makeup" | "cancelled_teacher" | "cancelled_other";
    isAbsent: boolean;
    notes: string;
  }[];
}

/**
 * Formata mês YYYY-MM para rótulo legível (Ex: "Setembro/2026")
 */
export function formatCompetencyLabel(monthStr: string): string {
  const [yearStr, mStr] = monthStr.split("-");
  const mNum = parseInt(mStr, 10);
  const date = new Date(parseInt(yearStr, 10), mNum - 1, 1);
  const monthName = date.toLocaleString("pt-BR", { month: "long" });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}/${yearStr}`;
}

/**
 * Retorna exclusivamente as aulas que pertencem a uma matrícula específica.
 *
 * Regras fundamentais (Etapa 5 — Correção Crítica):
 * 1. O faturamento NUNCA é calculado apenas por student_id.
 * 2. Cada matrícula/inscrição é uma entidade financeira independente.
 * 3. O aluno deve estar presente em c.student_ids.
 * 4. Se a matrícula for de grupo (possui enrollment.group_id):
 *    - A aula DEVE pertencer a esse grupo específico (c.group_id ou getGroupForSession).
 * 5. Se a matrícula for INDIVIDUAL (sem group_id):
 *    - A aula NÃO PODE pertencer a nenhum grupo (nem c.group_id, nem getGroupForSession).
 *    - O professor deve coincidir com o da matrícula (ou Raphael se for plano exclusivo Raphael).
 */
export function getClassesForEnrollment(
  enrollment: Enrollment,
  allClasses: ClassSession[],
  allGroups: Group[] = [],
  plan?: FinancialPlan | null
): ClassSession[] {
  const studentId = enrollment.student_id;
  const isIndividual = !enrollment.group_id;

  return (allClasses || []).filter((c) => {
    // 1. Participação do aluno
    const sids = Array.isArray(c.student_ids) ? c.student_ids : [];
    if (studentId && sids.length > 0 && !sids.includes(studentId)) {
      return false;
    }

    // 2. Identificação de grupo associado à aula
    let classGroupId = c.group_id;
    let matchedGroup: Group | undefined = undefined;

    if (classGroupId) {
      matchedGroup = (allGroups || []).find((g) => g.id === classGroupId);
    }
    if (!matchedGroup && allGroups && allGroups.length > 0) {
      matchedGroup = getGroupForSession(c, { groups: allGroups });
      if (matchedGroup) {
        classGroupId = matchedGroup.id;
      }
    }

    // CASO A: Matrícula vinculada a GRUPO
    if (!isIndividual) {
      return classGroupId === enrollment.group_id || matchedGroup?.id === enrollment.group_id;
    }

    // CASO B: Matrícula INDIVIDUAL
    // A aula NÃO pode pertencer a nenhum grupo!
    if (classGroupId || matchedGroup) {
      return false;
    }

    // Validação do Professor
    const isRaphael = isRaphaelTeacher(
      enrollment.teacher_id,
      undefined,
      plan?.exclusive_teacher_id
    );

    if (isRaphael) {
      if (c.teacher_id && c.teacher_id !== RAPHAEL_TEACHER_ID && c.teacher_id !== enrollment.teacher_id) {
        return false;
      }
    } else if (enrollment.teacher_id && c.teacher_id && c.teacher_id !== enrollment.teacher_id) {
      return false;
    }

    return true;
  });
}

/**
 * Retorna exclusivamente as aulas que pertencem a um grupo específico.
 */
export function getClassesForGroup(
  group: Group,
  allClasses: ClassSession[],
  allGroups: Group[] = []
): ClassSession[] {
  return (allClasses || []).filter((c) => {
    if (c.group_id === group.id) return true;
    const groupsToSearch = allGroups.length > 0 ? allGroups : [group];
    const matched = getGroupForSession(c, { groups: groupsToSearch });
    return matched?.id === group.id;
  });
}

/**
 * Resolve a qual enrollment_id um crédito individual pertence.
 * Garante que créditos individuais fiquem estritamente isolados em sua matrícula de origem.
 */
export function resolveCreditEnrollmentId(
  credit: Credit,
  enrollments: Enrollment[] = [],
  plans: FinancialPlan[] = [],
  groups: Group[] = [],
  classes: ClassSession[] = []
): string | undefined {
  if (credit.enrollment_id) {
    return credit.enrollment_id;
  }
  // Crédito de grupo NUNCA pertence a uma matrícula individual
  if (credit.group_id) {
    return undefined;
  }

  // 1. Se possui source_class_id, buscar a aula que originou o crédito
  if (credit.source_class_id && classes && classes.length > 0) {
    const srcClass = classes.find((c) => c.id === credit.source_class_id);
    if (srcClass) {
      if (srcClass.group_id) return undefined;
      const matchedGroup = getGroupForSession(srcClass, { groups });
      if (matchedGroup) return undefined;

      const studentId = credit.student_id || (srcClass.student_ids && srcClass.student_ids[0]);
      if (studentId) {
        const studentEnrollments = (enrollments || []).filter(
          (e) => e.student_id === studentId && !e.group_id
        );

        if (studentEnrollments.length === 1) {
          return studentEnrollments[0].id;
        }

        for (const enr of studentEnrollments) {
          const pl = plans.find((p) => p.id === enr.plan_id);
          const matched = getClassesForEnrollment(enr, [srcClass], groups, pl);
          if (matched.length > 0) {
            return enr.id;
          }
        }
      }
    }
  }

  // 2. Se temos apenas student_id
  if (credit.student_id) {
    const studentEnrollments = (enrollments || []).filter(
      (e) => e.student_id === credit.student_id && !e.group_id
    );

    if (studentEnrollments.length === 1) {
      return studentEnrollments[0].id;
    }

    // Se possui mais de uma, verificar se nas notas do crédito há menção ao plano
    if (credit.notes) {
      const notesLower = credit.notes.toLowerCase();
      for (const enr of studentEnrollments) {
        const pl = plans.find((p) => p.id === enr.plan_id);
        if (pl?.name && notesLower.includes(pl.name.toLowerCase())) {
          return enr.id;
        }
      }
    }

    // Se o valor unitário da matrícula bate com o valor do crédito
    if (credit.amount > 0) {
      const matchesByPrice = studentEnrollments.filter((enr) => {
        const pl = plans.find((p) => p.id === enr.plan_id);
        const basePrice =
          enr.custom_price !== undefined && enr.custom_price !== null
            ? Number(enr.custom_price)
            : (pl?.base_price || 0);
        const freq = (pl?.modality || "quinzenal").toLowerCase();
        const baseLessons = freq === "quinzenal" ? 2 : 4;
        const unit = baseLessons > 0 ? basePrice / baseLessons : 0;
        return Math.abs(unit - credit.amount) < 0.01;
      });

      if (matchesByPrice.length === 1) {
        return matchesByPrice[0].id;
      }
    }
  }

  return undefined;
}

/**
 * Validação de segurança antes de consumir um crédito.
 * Proteção contra consumo cruzado:
 * - Se for matrícula individual: credit.enrollment_id deve ser estritamente igual à enrollment.id e sem group_id.
 * - Se for grupo: credit.group_id deve ser estritamente igual ao group.id e sem enrollment_id.
 */
export function validateCreditConsumptionEntity(
  credit: Credit,
  target: { type: "individual"; enrollmentId: string } | { type: "group"; groupId: string }
): { allowed: boolean; reason?: string } {
  if (credit.status !== "available") {
    return { allowed: false, reason: "Crédito não está disponível" };
  }

  if (target.type === "individual") {
    if (credit.group_id) {
      return {
        allowed: false,
        reason: `Crédito pertence ao grupo ${credit.group_id} e não pode ser consumido em matrícula individual`,
      };
    }
    if (credit.enrollment_id && credit.enrollment_id !== target.enrollmentId) {
      return {
        allowed: false,
        reason: `Crédito pertence à matrícula ${credit.enrollment_id} e não à matrícula ${target.enrollmentId}`,
      };
    }
    return { allowed: true };
  }

  if (target.type === "group") {
    if (credit.enrollment_id) {
      return {
        allowed: false,
        reason: `Crédito individual da matrícula ${credit.enrollment_id} não pode ser consumido em grupo`,
      };
    }
    if (!credit.group_id || credit.group_id !== target.groupId) {
      return {
        allowed: false,
        reason: `Crédito não pertence ao grupo ${target.groupId}`,
      };
    }
    return { allowed: true };
  }

  return { allowed: false, reason: "Tipo de entidade desconhecido" };
}

/**
 * Calcula o faturamento real para aluno individual do Raphael
 */
export function calculateRaphaelRealStudentBilling(params: {
  enrollment: Enrollment;
  plan?: FinancialPlan | null;
  teacher?: Teacher | null;
  classes: ClassSession[];
  monthStr: string; // "YYYY-MM"
  credits: Credit[];
  applyCredits?: boolean;
  studentName?: string;
  allGroups?: Group[];
}): RaphaelBillingMemory {
  const { enrollment, plan, teacher, classes, monthStr, credits, applyCredits = true, studentName, allGroups = [] } = params;

  const teacherName = teacher?.name || "RAPHAEL AUGUSTO PINTO";
  const monthlyBasePrice =
    enrollment.custom_price !== undefined && enrollment.custom_price !== null
      ? Number(enrollment.custom_price)
      : plan?.base_price !== undefined && plan?.base_price !== null
      ? Number(plan.base_price)
      : 0;

  const modality = (plan?.modality || "quinzenal").toLowerCase();
  const frequency: "quinzenal" | "semanal" = modality === "quinzenal" ? "quinzenal" : "semanal";
  const baseLessons = frequency === "quinzenal" ? 2 : 4;
  const pricePerLesson = baseLessons > 0 ? monthlyBasePrice / baseLessons : 0;

  // Filtrar exclusivamente aulas que pertencem a esta matrícula no mês específico
  const enrollmentClasses = getClassesForEnrollment(enrollment, classes, allGroups, plan);
  const monthClasses = enrollmentClasses.filter((c) => (c.date || "").startsWith(monthStr));

  let regularLessons = 0;
  let makeupLessons = 0;
  let cancelledLessons = 0;
  let studentAbsences = 0;

  const classifiedClasses: RaphaelBillingMemory["classifiedClasses"] = [];

  for (const c of monthClasses) {
    const isCancelled = c.status === "cancelled";
    const isCancelledByRaphael = isCancelled && isCancelledByTeacherEligible(c);
    const isMakeup = !isCancelled && isMakeupClass(c);

    let isAbsent = false;
    if (c.attendance && enrollment.student_id && c.attendance[enrollment.student_id] === "absent") {
      isAbsent = true;
    }

    if (isCancelledByRaphael) {
      cancelledLessons++;
      classifiedClasses.push({
        id: c.id,
        date: c.date,
        title: c.title || "Aula de Canto",
        status: "cancelled",
        type: "cancelled_teacher",
        isAbsent: false,
        notes: "Cancelada pelo Professor Raphael (gera crédito de 1 aula para competência futura)",
      });
    } else if (isCancelled) {
      classifiedClasses.push({
        id: c.id,
        date: c.date,
        title: c.title || "Aula de Canto",
        status: "cancelled",
        type: "cancelled_other",
        isAbsent: false,
        notes: "Cancelada (sem flag de cancelamento pelo professor - não gera crédito)",
      });
    } else if (isMakeup) {
      makeupLessons++;
      classifiedClasses.push({
        id: c.id,
        date: c.date,
        title: c.title || "Aula de Canto",
        status: c.status,
        type: "makeup",
        isAbsent,
        notes: "Aula de reposição (coberta por crédito anterior)",
      });
    } else {
      regularLessons++;
      if (isAbsent) {
        studentAbsences++;
      }
      classifiedClasses.push({
        id: c.id,
        date: c.date,
        title: c.title || "Aula de Canto",
        status: c.status,
        type: "regular",
        isAbsent,
        notes: isAbsent
          ? "Aula normal (aluno ausente — falta não gera crédito, cobrada normalmente)"
          : "Aula normal do calendário",
      });
    }
  }

  const extraLessons = Math.max(0, regularLessons - baseLessons);
  const isOriginCancellationMonth = cancelledLessons > 0;

  // Valor Bruto:
  // Se houver mais aulas normais que as aulas-base: cobra as aulas normais pelo valor unitário (ex: 3 * 120 = 360, ou 5 * 50 = 250)
  // Se houver menos ou igual: cobra a mensalidade contratada (em mês de cancelamento de origem, o pagamento é inalterado = 240)
  let grossAmount = monthlyBasePrice;
  if (regularLessons > baseLessons) {
    grossAmount = regularLessons * pricePerLesson;
  } else if (regularLessons === 0 && cancelledLessons === 0 && monthClasses.length === 0) {
    // Nenhuma aula agendada no mês: mantém contratado padrão
    grossAmount = monthlyBasePrice;
  } else if (regularLessons < baseLessons && !isOriginCancellationMonth && regularLessons > 0) {
    // Se não houve cancelamento pelo professor e o motor cobra por aula normal
    grossAmount = Math.max(regularLessons * pricePerLesson, monthlyBasePrice);
  }

  // Créditos gerados neste mês (cancelamento pelo professor)
  const creditsGeneratedCount = cancelledLessons;
  const creditsGeneratedAmount = creditsGeneratedCount * pricePerLesson;

  // Créditos disponíveis de competências ANTERIORES
  // (Crédito gerado neste mês NÃO é aplicado no próprio mês de origem, permanece inalterado)
  // REGRA ABSOLUTA (Etapa 5 — Isolamento por Entidade Financeira):
  // 1. Créditos são vinculados à ENTIDADE FINANCEIRA que os originou.
  // 2. Um crédito individual não pode ser utilizado em uma matrícula de grupo.
  // 3. Um crédito de grupo não pode ser utilizado em uma matrícula individual.
  // 4. Ao calcular uma matrícula individual: buscar somente crédito com status 'available' e
  //    credit.enrollment_id === enrollment.id. NUNCA buscar simplesmente por student_id!
  const availableCredits = credits.filter((c) => {
    // Validação de status e professor
    if (c.status !== "available") return false;
    if (c.teacher_id && c.teacher_id !== RAPHAEL_TEACHER_ID) return false;
    if (monthStr && (c.competency_month || "") >= monthStr) return false;

    // Regra: Crédito de grupo NUNCA abate matrícula individual
    if (c.group_id) return false;

    // Regra: Matrícula vinculada a grupo não recebe créditos individuais
    if (enrollment.group_id) return false;

    // Vínculo estrito com a matrícula (Entidade Financeira)
    if (c.enrollment_id) {
      return c.enrollment_id === enrollment.id;
    }

    // Caso crédito legado não tenha enrollment_id explicitamente gravado,
    // resolve a matrícula de origem com base na aula / notas / valor unitário.
    const resolvedEid = resolveCreditEnrollmentId(c, [enrollment], plan ? [plan] : [], allGroups, classes);
    return resolvedEid === enrollment.id;
  });

  const creditsAvailableCount = availableCredits.length;
  const creditsAvailableAmount = availableCredits.reduce((sum, c) => sum + (c.amount || pricePerLesson), 0);

  const eligibleCreditsDetails: EligibleCreditDetail[] = availableCredits.map((c) => {
    const srcClass = classes.find((cl) => cl.id === c.source_class_id);
    return {
      id: c.id,
      amount: c.amount || pricePerLesson,
      originName: plan?.name || "Preparação Vocal",
      sourceDate: srcClass?.date,
      notes: c.notes || `Aula cancelada pelo Raphael (${srcClass?.date || c.competency_month})`,
    };
  });

  let creditsConsumedList: Credit[] = [];
  let creditDiscountAmount = 0;

  if (applyCredits && availableCredits.length > 0) {
    // Se houver reposições, elas consomem crédito prioritariamente
    const creditsForMakeups = availableCredits.slice(0, makeupLessons);
    const remainingCreditsForDiscount = availableCredits.slice(creditsForMakeups.length);

    // Créditos restantes podem abater o valor monetário da competência atual
    let discountAccum = 0;
    const discountCreditsUsed: Credit[] = [];

    for (const cred of remainingCreditsForDiscount) {
      const credVal = cred.amount || pricePerLesson;
      if (discountAccum + credVal <= grossAmount || discountAccum === 0) {
        discountAccum += credVal;
        discountCreditsUsed.push(cred);
        if (discountAccum >= grossAmount) break;
      }
    }

    creditsConsumedList = [...creditsForMakeups, ...discountCreditsUsed];
    creditDiscountAmount = discountAccum;
  }

  const finalAmount = Math.max(0, grossAmount - creditDiscountAmount);

  return {
    teacherName,
    targetName: studentName
      ? `${studentName} — ${plan?.name || "Individual"}`
      : plan?.name || "Matrícula Individual",
    targetType: "individual",
    monthStr,
    monthLabel: formatCompetencyLabel(monthStr),
    frequency,
    baseLessons,
    monthlyBasePrice,
    pricePerLesson,
    regularLessons,
    extraLessons,
    cancelledLessons,
    creditsGeneratedCount,
    creditsGeneratedAmount,
    creditsAvailableCount,
    creditsAvailableAmount,
    creditsConsumedList,
    creditsConsumedCount: creditsConsumedList.length,
    creditsConsumedAmount: creditsConsumedList.reduce((s, c) => s + (c.amount || pricePerLesson), 0),
    eligibleCreditsDetails,
    makeupLessons,
    studentAbsences,
    grossAmount,
    creditDiscountAmount,
    finalAmount,
    isOriginCancellationMonth,
    classifiedClasses,
  };
}

/**
 * Calcula o faturamento real para grupo unificado do Raphael
 */
export function calculateRaphaelRealGroupBilling(params: {
  group: Group;
  teacher?: Teacher | null;
  classes: ClassSession[];
  monthStr: string; // "YYYY-MM"
  credits: Credit[];
  applyCredits?: boolean;
  allGroups?: Group[];
}): RaphaelBillingMemory {
  const { group, teacher, classes, monthStr, credits, applyCredits = true, allGroups = [] } = params;

  const teacherName = teacher?.name || "RAPHAEL AUGUSTO PINTO";
  const monthlyBasePrice = Number(group.price) || 0;

  const freq = (group.frequency || "quinzenal").toLowerCase();
  const frequency: "quinzenal" | "semanal" = freq === "quinzenal" ? "quinzenal" : "semanal";
  const baseLessons = frequency === "quinzenal" ? 2 : 4;
  const pricePerLesson = baseLessons > 0 ? monthlyBasePrice / baseLessons : 0;

  // Filtrar exclusivamente aulas do grupo no mês específico
  const groupClasses = getClassesForGroup(group, classes, allGroups);
  const monthClasses = groupClasses.filter((c) => (c.date || "").startsWith(monthStr));

  let regularLessons = 0;
  let makeupLessons = 0;
  let cancelledLessons = 0;

  const classifiedClasses: RaphaelBillingMemory["classifiedClasses"] = [];

  for (const c of monthClasses) {
    const isCancelled = c.status === "cancelled";
    const isCancelledByRaphael = isCancelled && isCancelledByTeacherEligible(c);
    const isMakeup = !isCancelled && isMakeupClass(c);

    if (isCancelledByRaphael) {
      cancelledLessons++;
      classifiedClasses.push({
        id: c.id,
        date: c.date,
        title: c.title || group.name,
        status: "cancelled",
        type: "cancelled_teacher",
        isAbsent: false,
        notes: "Cancelada pelo Professor Raphael (gera crédito de 1 aula para o grupo)",
      });
    } else if (isCancelled) {
      classifiedClasses.push({
        id: c.id,
        date: c.date,
        title: c.title || group.name,
        status: "cancelled",
        type: "cancelled_other",
        isAbsent: false,
        notes: "Cancelada (sem cancelamento pelo professor - não gera crédito)",
      });
    } else if (isMakeup) {
      makeupLessons++;
      classifiedClasses.push({
        id: c.id,
        date: c.date,
        title: c.title || group.name,
        status: c.status,
        type: "makeup",
        isAbsent: false,
        notes: "Aula de reposição do grupo",
      });
    } else {
      regularLessons++;
      classifiedClasses.push({
        id: c.id,
        date: c.date,
        title: c.title || group.name,
        status: c.status,
        type: "regular",
        isAbsent: false,
        notes: "Aula normal do grupo",
      });
    }
  }

  const extraLessons = Math.max(0, regularLessons - baseLessons);
  const isOriginCancellationMonth = cancelledLessons > 0;

  // Valor Bruto do Grupo
  let grossAmount = monthlyBasePrice;
  if (regularLessons > baseLessons) {
    grossAmount = regularLessons * pricePerLesson;
  } else if (regularLessons === 0 && cancelledLessons === 0 && monthClasses.length === 0) {
    grossAmount = monthlyBasePrice;
  }

  // Créditos gerados neste mês
  const creditsGeneratedCount = cancelledLessons;
  const creditsGeneratedAmount = creditsGeneratedCount * pricePerLesson;

  // Créditos disponíveis para o grupo de competências ANTERIORES
  const availableCredits = credits.filter(
    (c) =>
      c.group_id === group.id &&
      c.teacher_id === RAPHAEL_TEACHER_ID &&
      c.status === "available" &&
      (c.competency_month || "") < monthStr
  );

  const creditsAvailableCount = availableCredits.length;
  const creditsAvailableAmount = availableCredits.reduce((sum, c) => sum + (c.amount || pricePerLesson), 0);

  const eligibleCreditsDetails: EligibleCreditDetail[] = availableCredits.map((c) => {
    const srcClass = classes.find((cl) => cl.id === c.source_class_id);
    return {
      id: c.id,
      amount: c.amount || pricePerLesson,
      originName: group.name,
      sourceDate: srcClass?.date,
      notes: c.notes || `Aula do grupo cancelada pelo Raphael (${srcClass?.date || c.competency_month})`,
    };
  });

  let creditsConsumedList: Credit[] = [];
  let creditDiscountAmount = 0;

  if (applyCredits && availableCredits.length > 0) {
    const creditsForMakeups = availableCredits.slice(0, makeupLessons);
    const remainingCreditsForDiscount = availableCredits.slice(creditsForMakeups.length);

    let discountAccum = 0;
    const discountCreditsUsed: Credit[] = [];

    for (const cred of remainingCreditsForDiscount) {
      const credVal = cred.amount || pricePerLesson;
      if (discountAccum + credVal <= grossAmount || discountAccum === 0) {
        discountAccum += credVal;
        discountCreditsUsed.push(cred);
        if (discountAccum >= grossAmount) break;
      }
    }

    creditsConsumedList = [...creditsForMakeups, ...discountCreditsUsed];
    creditDiscountAmount = discountAccum;
  }

  const finalAmount = Math.max(0, grossAmount - creditDiscountAmount);

  return {
    teacherName,
    targetName: group.name,
    targetType: "group",
    monthStr,
    monthLabel: formatCompetencyLabel(monthStr),
    frequency,
    baseLessons,
    monthlyBasePrice,
    pricePerLesson,
    regularLessons,
    extraLessons,
    cancelledLessons,
    creditsGeneratedCount,
    creditsGeneratedAmount,
    creditsAvailableCount,
    creditsAvailableAmount,
    creditsConsumedList,
    creditsConsumedCount: creditsConsumedList.length,
    creditsConsumedAmount: creditsConsumedList.reduce((s, c) => s + (c.amount || pricePerLesson), 0),
    eligibleCreditsDetails,
    makeupLessons,
    studentAbsences: 0,
    grossAmount,
    creditDiscountAmount,
    finalAmount,
    isOriginCancellationMonth,
    classifiedClasses,
  };
}
