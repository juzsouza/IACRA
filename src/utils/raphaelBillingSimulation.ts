import { Enrollment, FinancialPlan, Teacher, ClassSession, Group } from "../store";
import { findGroupMatch, getGroupForSession } from "./groupMatch";

export interface RaphaelBillingSimulationParams {
  enrollment: {
    student_id: string;
    teacher_id?: string;
    custom_price?: number;
    plan_id?: string;
  } & Partial<Enrollment>;
  plan?: {
    modality?: "semanal" | "quinzenal" | string;
    base_price?: number;
    exclusive_teacher_id?: string | null;
    name?: string;
  } | null;
  teacher?: {
    id?: string;
    name?: string;
  } | null;
  studentClasses: ClassSession[];
  monthStr: string; // "YYYY-MM", e.g. "2026-08"
  previousCredits?: number; // Credits carried over from previous months
  allGroups?: Group[];
}

export interface RaphaelGroupBillingSimulationParams {
  group: Group;
  teacher?: {
    id?: string;
    name?: string;
  } | null;
  groupClasses: ClassSession[];
  monthStr: string; // "YYYY-MM", e.g. "2026-08"
  previousCredits?: number;
  allGroups?: Group[];
}

export interface RaphaelClassClassification {
  classSession: ClassSession;
  type: "regular" | "makeup" | "cancelled_teacher_credit" | "cancelled_other";
  isAbsent: boolean;
  notes?: string;
}

export interface RaphaelBillingSimulationResult {
  isRaphaelRule: boolean;
  teacherName: string;
  studentId: string;
  monthStr: string;
  monthlyBasePrice: number;
  baseLessons: number;
  pricePerLesson: number;
  regularLessons: number;
  makeupLessons: number;
  cancelledLessonsEligibleForCredit: number;
  studentAbsences: number;
  chargeableLessons: number;
  grossMonthlyAmount: number;
  creditsAvailable: number;
  creditsGenerated: number;
  creditsConsumed: number;
  creditsRemaining: number;
  finalMonthlyAmount: number;
  creditMonetaryValue: number;
  differenceFromContract: number;
  hasUncreditedMakeup: boolean;
  uncreditedMakeupCount: number;
  uncreditedMakeupWarning?: string;
  classifiedClasses: RaphaelClassClassification[];
  explanation: string;
}

export interface RaphaelGroupBillingSimulationResult {
  isRaphaelRule: boolean;
  groupId: string;
  groupName: string;
  teacherName: string;
  monthStr: string;
  frequency: "semanal" | "quinzenal" | null;
  hasUndefinedFrequency: boolean;
  frequencyWarning?: string;
  monthlyBasePrice: number;
  baseLessons: number;
  pricePerLesson: number;
  regularLessons: number;
  makeupLessons: number;
  cancelledLessonsEligibleForCredit: number;
  chargeableLessons: number;
  grossMonthlyAmount: number;
  creditsAvailable: number;
  creditsGenerated: number;
  creditsConsumed: number;
  creditsRemaining: number;
  finalMonthlyAmount: number;
  creditMonetaryValue: number;
  differenceFromContract: number;
  hasUncreditedMakeup: boolean;
  uncreditedMakeupCount: number;
  uncreditedMakeupWarning?: string;
  classifiedClasses: RaphaelClassClassification[];
  explanation: string;
}

export const RAPHAEL_TEACHER_ID = "dada085e-c187-43d2-9ab0-a9e0539df450";

/**
 * Calculates historical credits accumulated prior to the given month
 */
export function calculateCumulativePreviousCredits(
  studentId: string,
  studentClasses: ClassSession[],
  targetMonthStr: string
): number {
  const priorClasses = (studentClasses || [])
    .filter((c) => {
      if (!c.date || c.date >= targetMonthStr) return false;
      const sids = Array.isArray(c.student_ids) ? c.student_ids : [];
      return sids.includes(studentId);
    })
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  let credits = 0;
  for (const c of priorClasses) {
    if (c.status === "cancelled" && isCancelledByTeacherEligible(c)) {
      credits += 1;
    } else if (isMakeupClass(c)) {
      if (credits > 0) {
        credits -= 1;
      }
    }
  }
  return credits;
}

/**
 * Identifies if the teacher is Raphael Augusto Pinto
 */
export function isRaphaelTeacher(
  teacherId?: string | null,
  teacherName?: string | null,
  exclusiveTeacherId?: string | null
): boolean {
  if (teacherId === RAPHAEL_TEACHER_ID || exclusiveTeacherId === RAPHAEL_TEACHER_ID) {
    return true;
  }
  if (teacherName && teacherName.toLowerCase().includes("raphael")) {
    return true;
  }
  return false;
}

/**
 * Checks if a class is an explicit makeup class
 */
export function isMakeupClass(c: ClassSession): boolean {
  const title = (c.title || "").toLowerCase();
  const report = (c.report || "").toLowerCase();
  return (
    title.includes("reposição") ||
    title.includes("reposicao") ||
    report.includes("reposição") ||
    report.includes("reposicao")
  );
}

/**
 * Checks if a class was cancelled by teacher and is eligible for replacement credit (Etapa 5)
 * Somente uma aula com status === "cancelled" E cancelled_by_teacher === true gera crédito.
 */
export function isCancelledByTeacherEligible(c: ClassSession): boolean {
  if (c.status !== "cancelled") return false;
  return c.cancelled_by_teacher === true;
}

/**
 * Calculates the exact credit value and metadata for a cancelled class of Raphael
 */
export function calculateRaphaelClassCreditValue(
  classSession: ClassSession,
  enrollments: Enrollment[],
  financialPlans: FinancialPlan[],
  groups: Group[],
  teachers: Teacher[]
): {
  isEligible: boolean;
  studentId?: string;
  enrollmentId?: string;
  groupId?: string;
  teacherId: string;
  amount: number;
  reason?: string;
} {
  const teacher = teachers.find((t) => t.id === classSession.teacher_id);
  const isRaphael = isRaphaelTeacher(classSession.teacher_id, teacher?.name, null);

  if (!isRaphael) {
    return {
      isEligible: false,
      teacherId: classSession.teacher_id || "",
      amount: 0,
      reason: "Professor não é Raphael Augusto Pinto",
    };
  }

  const isCancelledByTeacher = classSession.status === "cancelled" && isCancelledByTeacherEligible(classSession);
  if (!isCancelledByTeacher) {
    return {
      isEligible: false,
      teacherId: classSession.teacher_id || "",
      amount: 0,
      reason: "Aula não foi cancelada pelo professor",
    };
  }

  // 1. Group class identification (via classSession.group_id or session title/matcher)
  let classGroupId = classSession.group_id;
  let matchedGroup = classGroupId ? groups.find((g) => g.id === classGroupId) : undefined;
  if (!matchedGroup && groups && groups.length > 0) {
    matchedGroup = getGroupForSession(classSession, { groups });
    if (matchedGroup) {
      classGroupId = matchedGroup.id;
    }
  }

  if (matchedGroup && matchedGroup.payment_type === "group") {
    const frequency = matchedGroup.frequency || "quinzenal";
    const baseLessons = frequency === "quinzenal" ? 2 : 4;
    const groupPrice = Number(matchedGroup.price) || 0;
    const amount = baseLessons > 0 ? groupPrice / baseLessons : 0;
    return {
      isEligible: true,
      groupId: matchedGroup.id,
      teacherId: classSession.teacher_id || RAPHAEL_TEACHER_ID,
      amount,
    };
  }

  // 2. Individual student credit
  const studentIds = Array.isArray(classSession.student_ids) ? classSession.student_ids : [];
  if (studentIds.length > 0) {
    const studentId = studentIds[0];

    // Buscar matrículas ativas individuais do aluno (sem group_id)
    const activeIndivEnrollments = (enrollments || []).filter(
      (e) => e.student_id === studentId && e.status === "active" && !e.group_id
    );

    let matchingEnrollment: Enrollment | undefined = undefined;

    if (activeIndivEnrollments.length === 1) {
      matchingEnrollment = activeIndivEnrollments[0];
    } else if (activeIndivEnrollments.length > 1) {
      // Se possui mais de uma matrícula individual, identificar pelo título/plano da aula
      const titleLower = (classSession.title || "").toLowerCase();
      matchingEnrollment = activeIndivEnrollments.find((e) => {
        const p = financialPlans.find((plan) => plan.id === e.plan_id);
        if (p && p.name && titleLower.includes(p.name.toLowerCase())) return true;
        return false;
      });

      if (!matchingEnrollment) {
        // Fallback: com professor Raphael
        matchingEnrollment =
          activeIndivEnrollments.find((e) => isRaphaelTeacher(e.teacher_id, null, null)) ||
          activeIndivEnrollments[0];
      }
    } else {
      // Fallback se não encontrar matrícula estritamente sem group_id
      matchingEnrollment = (enrollments || []).find(
        (e) => e.student_id === studentId && e.status === "active" && isRaphaelTeacher(e.teacher_id, null, null)
      );
    }

    const plan = matchingEnrollment ? financialPlans.find((p) => p.id === matchingEnrollment.plan_id) : null;
    let basePrice = 0;
    let modality = "quinzenal";

    if (matchingEnrollment) {
      basePrice =
        matchingEnrollment.custom_price !== undefined && matchingEnrollment.custom_price !== null
          ? Number(matchingEnrollment.custom_price)
          : (plan?.base_price || 0);
      modality = (plan?.modality || "quinzenal").toLowerCase();
    } else {
      basePrice = 240; // Default fallback for Raphael
    }

    const baseLessons = modality === "quinzenal" ? 2 : 4;
    const amount = baseLessons > 0 ? basePrice / baseLessons : 0;

    return {
      isEligible: true,
      studentId,
      enrollmentId: matchingEnrollment?.id,
      teacherId: classSession.teacher_id || RAPHAEL_TEACHER_ID,
      amount,
    };
  }

  return {
    isEligible: false,
    teacherId: classSession.teacher_id || "",
    amount: 0,
    reason: "Sem aluno ou grupo associado à aula",
  };
}

/**
 * Pure simulation function to calculate monthly billing for Raphael's students
 */
export function calculateRaphaelStudentMonthlySimulation(
  params: RaphaelBillingSimulationParams
): RaphaelBillingSimulationResult {
  const {
    enrollment,
    plan,
    teacher,
    studentClasses,
    monthStr,
    previousCredits = 0,
  } = params;

  const isRaphael = isRaphaelTeacher(
    enrollment.teacher_id || teacher?.id,
    teacher?.name,
    plan?.exclusive_teacher_id
  );

  const teacherName = teacher?.name || (isRaphael ? "RAPHAEL AUGUSTO PINTO" : "Outro Professor");

  const monthlyBasePrice =
    enrollment.custom_price !== undefined && enrollment.custom_price !== null
      ? Number(enrollment.custom_price)
      : plan?.base_price !== undefined && plan?.base_price !== null
      ? Number(plan.base_price)
      : 0;

  const modality = (plan?.modality || "semanal").toLowerCase();
  const baseLessons = modality === "quinzenal" ? 2 : 4;
  const pricePerLesson = baseLessons > 0 ? monthlyBasePrice / baseLessons : 0;

  // If not Raphael, keep standard fixed monthly price
  if (!isRaphael) {
    return {
      isRaphaelRule: false,
      teacherName,
      studentId: enrollment.student_id,
      monthStr,
      monthlyBasePrice,
      baseLessons,
      pricePerLesson,
      regularLessons: 0,
      makeupLessons: 0,
      cancelledLessonsEligibleForCredit: 0,
      studentAbsences: 0,
      chargeableLessons: baseLessons,
      grossMonthlyAmount: monthlyBasePrice,
      creditsAvailable: previousCredits,
      creditsGenerated: 0,
      creditsConsumed: 0,
      creditsRemaining: previousCredits,
      finalMonthlyAmount: monthlyBasePrice,
      creditMonetaryValue: 0,
      differenceFromContract: 0,
      hasUncreditedMakeup: false,
      uncreditedMakeupCount: 0,
      classifiedClasses: [],
      explanation: "Regra padrão de mensalidade fixa aplicada (professor não é Raphael Augusto Pinto).",
    };
  }

  // Filter student classes in the target month
  const monthClasses = (studentClasses || []).filter((c) => {
    if (!c.date || !c.date.startsWith(monthStr)) return false;
    // Se a matrícula for individual, desconsiderar aulas de grupo
    if (!enrollment.group_id) {
      if (c.group_id) return false;
      if (params.allGroups && params.allGroups.length > 0) {
        const mg = findGroupMatch(c.title || "", params.allGroups);
        if (mg) return false;
      }
    }
    return true;
  });

  const classifiedClasses: RaphaelClassClassification[] = [];
  let regularLessons = 0;
  let makeupLessons = 0;
  let cancelledLessonsEligibleForCredit = 0;
  let studentAbsences = 0;

  const studentId = enrollment.student_id;

  for (const c of monthClasses) {
    const isMakeup = isMakeupClass(c);
    const isAbsent = Boolean(studentId && c.attendance && c.attendance[studentId] === "absent");

    if (c.status === "cancelled") {
      const isEligible = isCancelledByTeacherEligible(c);
      if (isEligible) {
        cancelledLessonsEligibleForCredit++;
        classifiedClasses.push({
          classSession: c,
          type: "cancelled_teacher_credit",
          isAbsent: false,
          notes: "Cancelamento pelo professor: gera 1 crédito de reposição",
        });
      } else {
        classifiedClasses.push({
          classSession: c,
          type: "cancelled_other",
          isAbsent: false,
          notes: "Cancelamento sem direito a reposição",
        });
      }
    } else if (isMakeup) {
      makeupLessons++;
      classifiedClasses.push({
        classSession: c,
        type: "makeup",
        isAbsent,
        notes: "Aula de reposição (consome crédito anterior)",
      });
    } else {
      regularLessons++;
      if (isAbsent) {
        studentAbsences++;
      }
      classifiedClasses.push({
        classSession: c,
        type: "regular",
        isAbsent,
        notes: isAbsent ? "Aula normal (aluno faltou - cobrada normalmente)" : "Aula normal prevista",
      });
    }
  }

  // Credits calculation
  const creditsAvailable = Math.max(0, previousCredits);
  const creditsConsumed = Math.min(creditsAvailable, makeupLessons);
  const extraMakeupsExceedingCredits = Math.max(0, makeupLessons - creditsConsumed);

  // Chargeable lessons
  const chargeableLessons = regularLessons + extraMakeupsExceedingCredits;
  const grossMonthlyAmount = regularLessons * pricePerLesson;
  const finalMonthlyAmount = chargeableLessons * pricePerLesson;

  // New credits generated this month (by teacher cancellations)
  const creditsGenerated = cancelledLessonsEligibleForCredit;
  const creditsRemaining = creditsAvailable - creditsConsumed + creditsGenerated;
  const creditMonetaryValue = creditsRemaining * pricePerLesson;

  let explanation = `Cálculo proporcional por aula: ${regularLessons} aula(s) normal(is) @ R$ ${pricePerLesson.toFixed(2)}`;
  if (makeupLessons > 0) {
    explanation += `, ${creditsConsumed} reposição(ões) coberta(s) por crédito e ${extraMakeupsExceedingCredits} reposição(ões) cobrada(s)`;
  }
  if (creditsGenerated > 0) {
    explanation += `. Gerado(s) ${creditsGenerated} crédito(s) por cancelamento do professor.`;
  }

  const differenceFromContract = finalMonthlyAmount - monthlyBasePrice;
  const hasUncreditedMakeup = extraMakeupsExceedingCredits > 0;
  const uncreditedMakeupWarning = hasUncreditedMakeup
    ? "Reposição sem crédito identificado — requer conferência."
    : undefined;

  return {
    isRaphaelRule: true,
    teacherName,
    studentId,
    monthStr,
    monthlyBasePrice,
    baseLessons,
    pricePerLesson,
    regularLessons,
    makeupLessons,
    cancelledLessonsEligibleForCredit,
    studentAbsences,
    chargeableLessons,
    grossMonthlyAmount,
    creditsAvailable,
    creditsGenerated,
    creditsConsumed,
    creditsRemaining,
    finalMonthlyAmount,
    creditMonetaryValue,
    differenceFromContract,
    hasUncreditedMakeup,
    uncreditedMakeupCount: extraMakeupsExceedingCredits,
    uncreditedMakeupWarning,
    classifiedClasses,
    explanation,
  };
}

export interface SimulationScenarioTest {
  id: string;
  name: string;
  description: string;
  params: RaphaelBillingSimulationParams;
  expected: {
    finalMonthlyAmount: number;
    creditsGenerated?: number;
    creditsConsumed?: number;
    creditsRemaining?: number;
  };
}

export function runAllPredefinedScenarioTests(): {
  testId: string;
  name: string;
  passed: boolean;
  result: RaphaelBillingSimulationResult;
  expected: any;
}[] {
  const tests: SimulationScenarioTest[] = [
    {
      id: "TEST-1",
      name: "TESTE 1: Cristina - 2 aulas normais (Quinzenal R$ 240)",
      description: "2 aulas normais com preço personalizado R$ 240 quinzenal",
      params: {
        enrollment: {
          student_id: "s_cristina",
          teacher_id: RAPHAEL_TEACHER_ID,
          custom_price: 240,
        },
        plan: { modality: "quinzenal", base_price: 0, exclusive_teacher_id: RAPHAEL_TEACHER_ID },
        teacher: { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
        studentClasses: [
          { id: "c1", date: "2026-08-15", status: "completed", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
          { id: "c2", date: "2026-08-29", status: "scheduled", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
        ],
        monthStr: "2026-08",
        previousCredits: 0,
      },
      expected: { finalMonthlyAmount: 240, creditsRemaining: 0 },
    },
    {
      id: "TEST-2",
      name: "TESTE 2: Cristina - 3 aulas normais em mês de 5 semanas",
      description: "3 aulas normais de calendário em quinzenal (deve cobrar R$ 360)",
      params: {
        enrollment: {
          student_id: "s_cristina",
          teacher_id: RAPHAEL_TEACHER_ID,
          custom_price: 240,
        },
        plan: { modality: "quinzenal", base_price: 0, exclusive_teacher_id: RAPHAEL_TEACHER_ID },
        teacher: { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
        studentClasses: [
          { id: "c1", date: "2026-08-01", status: "completed", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
          { id: "c2", date: "2026-08-15", status: "completed", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
          { id: "c3", date: "2026-08-29", status: "scheduled", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
        ],
        monthStr: "2026-08",
        previousCredits: 0,
      },
      expected: { finalMonthlyAmount: 360, creditsRemaining: 0 },
    },
    {
      id: "TEST-3",
      name: "TESTE 3: Cristina - 1 realizada + 1 cancelada pelo Raphael",
      description: "1 aula realizada e 1 cancelada pelo professor -> Gera 1 crédito de R$ 120",
      params: {
        enrollment: {
          student_id: "s_cristina",
          teacher_id: RAPHAEL_TEACHER_ID,
          custom_price: 240,
        },
        plan: { modality: "quinzenal", base_price: 0, exclusive_teacher_id: RAPHAEL_TEACHER_ID },
        teacher: { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
        studentClasses: [
          { id: "c1", date: "2026-08-15", status: "completed", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
          { id: "c2", date: "2026-08-29", status: "cancelled", cancelled_by_teacher: true, allow_makeup: true, title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
        ],
        monthStr: "2026-08",
        previousCredits: 0,
      },
      expected: { finalMonthlyAmount: 120, creditsGenerated: 1, creditsRemaining: 1 },
    },
    {
      id: "TEST-4",
      name: "TESTE 4: Setembro - 2 normais + 1 reposição com crédito anterior",
      description: "2 aulas normais + 1 reposição consumindo crédito de agosto -> Paga R$ 240",
      params: {
        enrollment: {
          student_id: "s_cristina",
          teacher_id: RAPHAEL_TEACHER_ID,
          custom_price: 240,
        },
        plan: { modality: "quinzenal", base_price: 0, exclusive_teacher_id: RAPHAEL_TEACHER_ID },
        teacher: { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
        studentClasses: [
          { id: "c1", date: "2026-09-12", status: "scheduled", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
          { id: "c2", date: "2026-09-26", status: "scheduled", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
          { id: "c3", date: "2026-09-19", status: "scheduled", title: "PREPARAÇÃO VOCAL (Reposição de 29/08)" } as unknown as ClassSession,
        ],
        monthStr: "2026-09",
        previousCredits: 1,
      },
      expected: { finalMonthlyAmount: 240, creditsConsumed: 1, creditsRemaining: 0 },
    },
    {
      id: "TEST-5",
      name: "TESTE 5: Aluno faltou em 1 das 2 aulas normais",
      description: "Aluno ausente em 1 aula -> Cobrança permanece normal R$ 240 e NÃO gera crédito",
      params: {
        enrollment: {
          student_id: "s_cristina",
          teacher_id: RAPHAEL_TEACHER_ID,
          custom_price: 240,
        },
        plan: { modality: "quinzenal", base_price: 0, exclusive_teacher_id: RAPHAEL_TEACHER_ID },
        teacher: { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
        studentClasses: [
          { id: "c1", date: "2026-08-15", status: "completed", title: "PREPARAÇÃO VOCAL", attendance: { s_cristina: "present" } } as unknown as ClassSession,
          { id: "c2", date: "2026-08-29", status: "completed", title: "PREPARAÇÃO VOCAL", attendance: { s_cristina: "absent" } } as unknown as ClassSession,
        ],
        monthStr: "2026-08",
        previousCredits: 0,
      },
      expected: { finalMonthlyAmount: 240, creditsGenerated: 0, creditsRemaining: 0 },
    },
    {
      id: "TEST-6",
      name: "TESTE 6: Crédito de agosto atravessa setembro e é consumido em outubro",
      description: "Crédito mantido em setembro (2 aulas normais) e utilizado em outubro (2 normais + 1 reposição)",
      params: {
        enrollment: {
          student_id: "s_cristina",
          teacher_id: RAPHAEL_TEACHER_ID,
          custom_price: 240,
        },
        plan: { modality: "quinzenal", base_price: 0, exclusive_teacher_id: RAPHAEL_TEACHER_ID },
        teacher: { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
        studentClasses: [
          { id: "c1", date: "2026-10-10", status: "scheduled", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
          { id: "c2", date: "2026-10-24", status: "scheduled", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
          { id: "c3", date: "2026-10-17", status: "scheduled", title: "PREPARAÇÃO VOCAL (Reposição de 29/08)" } as unknown as ClassSession,
        ],
        monthStr: "2026-10",
        previousCredits: 1,
      },
      expected: { finalMonthlyAmount: 240, creditsConsumed: 1, creditsRemaining: 0 },
    },
    {
      id: "TEST-7",
      name: "TESTE 7: Aluno semanal R$ 200 (4 base) com 5 aulas normais no mês",
      description: "Aluno semanal com 5 semanas completas -> 5 × R$ 50 = R$ 250",
      params: {
        enrollment: {
          student_id: "s_semanal",
          teacher_id: RAPHAEL_TEACHER_ID,
          custom_price: 200,
        },
        plan: { modality: "semanal", base_price: 0, exclusive_teacher_id: RAPHAEL_TEACHER_ID },
        teacher: { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
        studentClasses: [
          { id: "c1", date: "2026-08-01", status: "completed", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
          { id: "c2", date: "2026-08-08", status: "completed", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
          { id: "c3", date: "2026-08-15", status: "completed", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
          { id: "c4", date: "2026-08-22", status: "completed", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
          { id: "c5", date: "2026-08-29", status: "scheduled", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
        ],
        monthStr: "2026-08",
        previousCredits: 0,
      },
      expected: { finalMonthlyAmount: 250, creditsRemaining: 0 },
    },
    {
      id: "TEST-8",
      name: "TESTE 8: Aluno semanal R$ 200 com 4 normais + 1 reposição com crédito",
      description: "4 normais + 1 reposição usando 1 crédito disponível -> Paga R$ 200",
      params: {
        enrollment: {
          student_id: "s_semanal",
          teacher_id: RAPHAEL_TEACHER_ID,
          custom_price: 200,
        },
        plan: { modality: "semanal", base_price: 0, exclusive_teacher_id: RAPHAEL_TEACHER_ID },
        teacher: { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
        studentClasses: [
          { id: "c1", date: "2026-08-01", status: "completed", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
          { id: "c2", date: "2026-08-08", status: "completed", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
          { id: "c3", date: "2026-08-15", status: "completed", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
          { id: "c4", date: "2026-08-22", status: "completed", title: "PREPARAÇÃO VOCAL" } as unknown as ClassSession,
          { id: "c5", date: "2026-08-29", status: "scheduled", title: "PREPARAÇÃO VOCAL (Reposição de 15/07)" } as unknown as ClassSession,
        ],
        monthStr: "2026-08",
        previousCredits: 1,
      },
      expected: { finalMonthlyAmount: 200, creditsConsumed: 1, creditsRemaining: 0 },
    },
  ];

  return tests.map((t) => {
    const result = calculateRaphaelStudentMonthlySimulation(t.params);
    let passed = result.finalMonthlyAmount === t.expected.finalMonthlyAmount;
    if (t.expected.creditsGenerated !== undefined) {
      passed = passed && result.creditsGenerated === t.expected.creditsGenerated;
    }
    if (t.expected.creditsConsumed !== undefined) {
      passed = passed && result.creditsConsumed === t.expected.creditsConsumed;
    }
    if (t.expected.creditsRemaining !== undefined) {
      passed = passed && result.creditsRemaining === t.expected.creditsRemaining;
    }

    return {
      testId: t.id,
      name: t.name,
      passed,
      result,
      expected: t.expected,
    };
  });
}

/**
 * Calculates historical credits accumulated for a unified group prior to the given month
 */
export function calculateCumulativePreviousCreditsForGroup(
  groupId: string,
  allClasses: ClassSession[],
  targetMonthStr: string,
  group?: Group,
  allGroups?: Group[]
): number {
  const priorClasses = (allClasses || [])
    .filter((c) => {
      if (!c.date || c.date >= targetMonthStr) return false;
      if (c.group_id) return c.group_id === groupId;
      if (group) {
        const groupsToMatch = allGroups || [group];
        const matched = findGroupMatch(c.title, groupsToMatch);
        return matched?.id === groupId;
      }
      return false;
    })
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  let credits = 0;
  for (const c of priorClasses) {
    if (c.status === "cancelled" && isCancelledByTeacherEligible(c)) {
      credits += 1;
    } else if (isMakeupClass(c)) {
      if (credits > 0) {
        credits -= 1;
      }
    }
  }
  return credits;
}

/**
 * Pure simulation function to calculate monthly billing for Raphael's unified groups
 * Note: Only in preview mode. Does not write or mutate any database records.
 */
export function calculateRaphaelGroupMonthlySimulation(
  params: RaphaelGroupBillingSimulationParams
): RaphaelGroupBillingSimulationResult {
  const {
    group,
    teacher,
    groupClasses,
    monthStr,
    previousCredits = 0,
    allGroups,
  } = params;

  const isRaphael = isRaphaelTeacher(
    group.teacher_id || teacher?.id,
    teacher?.name,
    null
  );

  const isUnifiedGroup = group.payment_type === "group";
  const teacherName = teacher?.name || (isRaphael ? "RAPHAEL AUGUSTO PINTO" : "Outro Professor");
  const monthlyBasePrice = Number(group.price || 0);

  // If not Raphael or not Unified Group, keep standard fixed monthly price
  if (!isRaphael || !isUnifiedGroup) {
    return {
      isRaphaelRule: false,
      groupId: group.id,
      groupName: group.name,
      teacherName,
      monthStr,
      frequency: group.frequency || null,
      hasUndefinedFrequency: false,
      monthlyBasePrice,
      baseLessons: group.frequency === "quinzenal" ? 2 : group.frequency === "semanal" ? 4 : 0,
      pricePerLesson: 0,
      regularLessons: 0,
      makeupLessons: 0,
      cancelledLessonsEligibleForCredit: 0,
      chargeableLessons: 0,
      grossMonthlyAmount: monthlyBasePrice,
      creditsAvailable: previousCredits,
      creditsGenerated: 0,
      creditsConsumed: 0,
      creditsRemaining: previousCredits,
      finalMonthlyAmount: monthlyBasePrice,
      creditMonetaryValue: 0,
      differenceFromContract: 0,
      hasUncreditedMakeup: false,
      uncreditedMakeupCount: 0,
      classifiedClasses: [],
      explanation: "Regra padrão de mensalidade fixa aplicada (não é grupo com mensalidade unificada do Raphael).",
    };
  }

  // Check frequency
  const frequency = group.frequency || null;
  const hasUndefinedFrequency = !frequency;
  const baseLessons = frequency === "quinzenal" ? 2 : frequency === "semanal" ? 4 : 0;
  const pricePerLesson = baseLessons > 0 ? monthlyBasePrice / baseLessons : 0;

  if (hasUndefinedFrequency) {
    return {
      isRaphaelRule: true,
      groupId: group.id,
      groupName: group.name,
      teacherName,
      monthStr,
      frequency: null,
      hasUndefinedFrequency: true,
      frequencyWarning: "Frequência do grupo não definida — requer conferência.",
      monthlyBasePrice,
      baseLessons: 0,
      pricePerLesson: 0,
      regularLessons: 0,
      makeupLessons: 0,
      cancelledLessonsEligibleForCredit: 0,
      chargeableLessons: 0,
      grossMonthlyAmount: monthlyBasePrice,
      creditsAvailable: previousCredits,
      creditsGenerated: 0,
      creditsConsumed: 0,
      creditsRemaining: previousCredits,
      finalMonthlyAmount: monthlyBasePrice,
      creditMonetaryValue: 0,
      differenceFromContract: 0,
      hasUncreditedMakeup: false,
      uncreditedMakeupCount: 0,
      classifiedClasses: [],
      explanation: "Frequência do grupo não definida — requer conferência. O cálculo proporcional não foi aplicado.",
    };
  }

  // Filter classes belonging to the group in target month
  const monthClasses = (groupClasses || []).filter((c) => {
    if (!c.date || !c.date.startsWith(monthStr)) return false;
    if (c.group_id) return c.group_id === group.id;
    const groupsToMatch = allGroups || [group];
    const matched = findGroupMatch(c.title, groupsToMatch);
    return matched?.id === group.id;
  });

  const classifiedClasses: RaphaelClassClassification[] = [];
  let regularLessons = 0;
  let makeupLessons = 0;
  let cancelledLessonsEligibleForCredit = 0;

  for (const c of monthClasses) {
    const isMakeup = isMakeupClass(c);

    if (c.status === "cancelled") {
      const isEligible = isCancelledByTeacherEligible(c);
      if (isEligible) {
        cancelledLessonsEligibleForCredit++;
        classifiedClasses.push({
          classSession: c,
          type: "cancelled_teacher_credit",
          isAbsent: false,
          notes: "Cancelamento pelo professor: gera 1 crédito de reposição do grupo",
        });
      } else {
        classifiedClasses.push({
          classSession: c,
          type: "cancelled_other",
          isAbsent: false,
          notes: "Cancelamento requer conferência",
        });
      }
    } else if (isMakeup) {
      makeupLessons++;
      classifiedClasses.push({
        classSession: c,
        type: "makeup",
        isAbsent: false,
        notes: "Aula de reposição do grupo (consome crédito anterior)",
      });
    } else {
      regularLessons++;
      classifiedClasses.push({
        classSession: c,
        type: "regular",
        isAbsent: false,
        notes: "Aula normal do grupo",
      });
    }
  }

  // Credits calculation
  const creditsAvailable = Math.max(0, previousCredits);
  const creditsConsumed = Math.min(creditsAvailable, makeupLessons);
  const extraMakeupsExceedingCredits = Math.max(0, makeupLessons - creditsConsumed);

  // Chargeable lessons
  const chargeableLessons = regularLessons + extraMakeupsExceedingCredits;
  const grossMonthlyAmount = regularLessons * pricePerLesson;
  const finalMonthlyAmount = chargeableLessons * pricePerLesson;

  // New credits generated this month
  const creditsGenerated = cancelledLessonsEligibleForCredit;
  const creditsRemaining = creditsAvailable - creditsConsumed + creditsGenerated;
  const creditMonetaryValue = creditsRemaining * pricePerLesson;

  let explanation = `Cálculo proporcional por aula do grupo: ${regularLessons} aula(s) normal(is) @ R$ ${pricePerLesson.toFixed(2)}`;
  if (makeupLessons > 0) {
    explanation += `, ${creditsConsumed} reposição(ões) coberta(s) por crédito e ${extraMakeupsExceedingCredits} reposição(ões) sem crédito`;
  }
  if (creditsGenerated > 0) {
    explanation += `. Gerado(s) ${creditsGenerated} crédito(s) por cancelamento do professor.`;
  }

  const differenceFromContract = finalMonthlyAmount - monthlyBasePrice;
  const hasUncreditedMakeup = extraMakeupsExceedingCredits > 0;
  const uncreditedMakeupWarning = hasUncreditedMakeup
    ? "Reposição sem crédito identificado — requer conferência."
    : undefined;

  return {
    isRaphaelRule: true,
    groupId: group.id,
    groupName: group.name,
    teacherName,
    monthStr,
    frequency,
    hasUndefinedFrequency: false,
    monthlyBasePrice,
    baseLessons,
    pricePerLesson,
    regularLessons,
    makeupLessons,
    cancelledLessonsEligibleForCredit,
    chargeableLessons,
    grossMonthlyAmount,
    creditsAvailable,
    creditsGenerated,
    creditsConsumed,
    creditsRemaining,
    finalMonthlyAmount,
    creditMonetaryValue,
    differenceFromContract,
    hasUncreditedMakeup,
    uncreditedMakeupCount: extraMakeupsExceedingCredits,
    uncreditedMakeupWarning,
    classifiedClasses,
    explanation,
  };
}

export interface GroupSimulationScenarioTest {
  id: string;
  name: string;
  description: string;
  params: RaphaelGroupBillingSimulationParams;
  expected: {
    finalMonthlyAmount: number;
    differenceFromContract?: number;
    creditsGenerated?: number;
    creditsConsumed?: number;
    creditsRemaining?: number;
    isRaphaelRule?: boolean;
  };
}

export function runAllGroupScenarioTests(): {
  testId: string;
  name: string;
  passed: boolean;
  result: RaphaelGroupBillingSimulationResult;
  expected: any;
}[] {
  const tests: GroupSimulationScenarioTest[] = [
    {
      id: "GROUP-TEST-1",
      name: "TESTE 1 — QUINZENAL: 2 aulas normais (R$ 360)",
      description: "Grupo R$ 360 Quinzenal com 2 aulas normais -> R$ 360 (diferença R$ 0)",
      params: {
        group: {
          id: "grp_dupla_1",
          name: "DUPLA SERGIO E RAFAELA",
          teacher_id: RAPHAEL_TEACHER_ID,
          payment_type: "group",
          price: 360,
          frequency: "quinzenal",
        },
        teacher: { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
        groupClasses: [
          { id: "gc1", date: "2026-08-08", status: "completed", title: "DUPLA SERGIO E RAFAELA", group_id: "grp_dupla_1" } as unknown as ClassSession,
          { id: "gc2", date: "2026-08-22", status: "completed", title: "DUPLA SERGIO E RAFAELA", group_id: "grp_dupla_1" } as unknown as ClassSession,
        ],
        monthStr: "2026-08",
        previousCredits: 0,
      },
      expected: { finalMonthlyAmount: 360, differenceFromContract: 0, creditsRemaining: 0 },
    },
    {
      id: "GROUP-TEST-2",
      name: "TESTE 2 — QUINZENAL COM 3 AULAS: 3 aulas normais (R$ 540)",
      description: "Grupo R$ 360 Quinzenal em mês com 3 aulas normais -> 3 × R$ 180 = R$ 540 (+R$ 180)",
      params: {
        group: {
          id: "grp_dupla_1",
          name: "DUPLA SERGIO E RAFAELA",
          teacher_id: RAPHAEL_TEACHER_ID,
          payment_type: "group",
          price: 360,
          frequency: "quinzenal",
        },
        teacher: { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
        groupClasses: [
          { id: "gc1", date: "2026-08-01", status: "completed", title: "DUPLA SERGIO E RAFAELA", group_id: "grp_dupla_1" } as unknown as ClassSession,
          { id: "gc2", date: "2026-08-15", status: "completed", title: "DUPLA SERGIO E RAFAELA", group_id: "grp_dupla_1" } as unknown as ClassSession,
          { id: "gc3", date: "2026-08-29", status: "completed", title: "DUPLA SERGIO E RAFAELA", group_id: "grp_dupla_1" } as unknown as ClassSession,
        ],
        monthStr: "2026-08",
        previousCredits: 0,
      },
      expected: { finalMonthlyAmount: 540, differenceFromContract: 180, creditsRemaining: 0 },
    },
    {
      id: "GROUP-TEST-3",
      name: "TESTE 3 — SEMANAL: 4 aulas normais (R$ 360)",
      description: "Grupo R$ 360 Semanal com 4 aulas normais -> 4 × R$ 90 = R$ 360 (diferença R$ 0)",
      params: {
        group: {
          id: "grp_semanal_1",
          name: "TURMA CANTO POPULAR",
          teacher_id: RAPHAEL_TEACHER_ID,
          payment_type: "group",
          price: 360,
          frequency: "semanal",
        },
        teacher: { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
        groupClasses: [
          { id: "gc1", date: "2026-08-01", status: "completed", title: "TURMA CANTO POPULAR", group_id: "grp_semanal_1" } as unknown as ClassSession,
          { id: "gc2", date: "2026-08-08", status: "completed", title: "TURMA CANTO POPULAR", group_id: "grp_semanal_1" } as unknown as ClassSession,
          { id: "gc3", date: "2026-08-15", status: "completed", title: "TURMA CANTO POPULAR", group_id: "grp_semanal_1" } as unknown as ClassSession,
          { id: "gc4", date: "2026-08-22", status: "completed", title: "TURMA CANTO POPULAR", group_id: "grp_semanal_1" } as unknown as ClassSession,
        ],
        monthStr: "2026-08",
        previousCredits: 0,
      },
      expected: { finalMonthlyAmount: 360, differenceFromContract: 0, creditsRemaining: 0 },
    },
    {
      id: "GROUP-TEST-4",
      name: "TESTE 4 — SEMANAL COM 5 AULAS: 5 aulas normais (R$ 450)",
      description: "Grupo R$ 360 Semanal com 5 aulas normais no mês -> 5 × R$ 90 = R$ 450 (+R$ 90)",
      params: {
        group: {
          id: "grp_semanal_1",
          name: "TURMA CANTO POPULAR",
          teacher_id: RAPHAEL_TEACHER_ID,
          payment_type: "group",
          price: 360,
          frequency: "semanal",
        },
        teacher: { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
        groupClasses: [
          { id: "gc1", date: "2026-08-01", status: "completed", title: "TURMA CANTO POPULAR", group_id: "grp_semanal_1" } as unknown as ClassSession,
          { id: "gc2", date: "2026-08-08", status: "completed", title: "TURMA CANTO POPULAR", group_id: "grp_semanal_1" } as unknown as ClassSession,
          { id: "gc3", date: "2026-08-15", status: "completed", title: "TURMA CANTO POPULAR", group_id: "grp_semanal_1" } as unknown as ClassSession,
          { id: "gc4", date: "2026-08-22", status: "completed", title: "TURMA CANTO POPULAR", group_id: "grp_semanal_1" } as unknown as ClassSession,
          { id: "gc5", date: "2026-08-29", status: "completed", title: "TURMA CANTO POPULAR", group_id: "grp_semanal_1" } as unknown as ClassSession,
        ],
        monthStr: "2026-08",
        previousCredits: 0,
      },
      expected: { finalMonthlyAmount: 450, differenceFromContract: 90, creditsRemaining: 0 },
    },
    {
      id: "GROUP-TEST-5",
      name: "TESTE 5 — CANCELAMENTO DO RAPHAEL: 1 normal + 1 cancelada (R$ 180 cobrado + 1 crédito)",
      description: "Grupo R$ 360 Quinzenal com 1 aula realizada e 1 cancelada pelo Raphael -> R$ 180 cobrado, 1 crédito gerado (R$ 180)",
      params: {
        group: {
          id: "grp_dupla_1",
          name: "DUPLA SERGIO E RAFAELA",
          teacher_id: RAPHAEL_TEACHER_ID,
          payment_type: "group",
          price: 360,
          frequency: "quinzenal",
        },
        teacher: { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
        groupClasses: [
          { id: "gc1", date: "2026-08-08", status: "completed", title: "DUPLA SERGIO E RAFAELA", group_id: "grp_dupla_1" } as unknown as ClassSession,
          { id: "gc2", date: "2026-08-22", status: "cancelled", cancelled_by_teacher: true, allow_makeup: true, title: "DUPLA SERGIO E RAFAELA", group_id: "grp_dupla_1" } as unknown as ClassSession,
        ],
        monthStr: "2026-08",
        previousCredits: 0,
      },
      expected: { finalMonthlyAmount: 180, differenceFromContract: -180, creditsGenerated: 1, creditsRemaining: 1 },
    },
    {
      id: "GROUP-TEST-6",
      name: "TESTE 6 — REPOSIÇÃO: 2 normais + 1 reposição com crédito (R$ 360)",
      description: "Grupo R$ 360 Quinzenal com 2 normais + 1 reposição usando crédito anterior -> R$ 360, crédito consumido 1",
      params: {
        group: {
          id: "grp_dupla_1",
          name: "DUPLA SERGIO E RAFAELA",
          teacher_id: RAPHAEL_TEACHER_ID,
          payment_type: "group",
          price: 360,
          frequency: "quinzenal",
        },
        teacher: { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
        groupClasses: [
          { id: "gc1", date: "2026-08-08", status: "completed", title: "DUPLA SERGIO E RAFAELA", group_id: "grp_dupla_1" } as unknown as ClassSession,
          { id: "gc2", date: "2026-08-22", status: "completed", title: "DUPLA SERGIO E RAFAELA", group_id: "grp_dupla_1" } as unknown as ClassSession,
          { id: "gc3", date: "2026-08-29", status: "completed", title: "DUPLA SERGIO E RAFAELA (Reposição)", group_id: "grp_dupla_1" } as unknown as ClassSession,
        ],
        monthStr: "2026-08",
        previousCredits: 1,
      },
      expected: { finalMonthlyAmount: 360, differenceFromContract: 0, creditsConsumed: 1, creditsRemaining: 0 },
    },
    {
      id: "GROUP-TEST-7",
      name: "TESTE 7 — FALTA DO ALUNO: Falta não reduz valor unificado (R$ 360)",
      description: "Falta de aluno individual na aula em grupo não reduz a mensalidade do grupo -> R$ 360",
      params: {
        group: {
          id: "grp_dupla_1",
          name: "DUPLA SERGIO E RAFAELA",
          teacher_id: RAPHAEL_TEACHER_ID,
          payment_type: "group",
          price: 360,
          frequency: "quinzenal",
        },
        teacher: { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
        groupClasses: [
          { id: "gc1", date: "2026-08-08", status: "completed", title: "DUPLA SERGIO E RAFAELA", group_id: "grp_dupla_1", attendance: { s_aluno1: "absent" } } as unknown as ClassSession,
          { id: "gc2", date: "2026-08-22", status: "completed", title: "DUPLA SERGIO E RAFAELA", group_id: "grp_dupla_1", attendance: { s_aluno1: "present" } } as unknown as ClassSession,
        ],
        monthStr: "2026-08",
        previousCredits: 0,
      },
      expected: { finalMonthlyAmount: 360, differenceFromContract: 0, creditsRemaining: 0 },
    },
    {
      id: "GROUP-TEST-8",
      name: "TESTE 8 — OUTRO PROFESSOR: Regra inalterada para outros professores",
      description: "Grupo de outro professor mantém regra contratual fixa normal sem recálculo por aulas",
      params: {
        group: {
          id: "grp_outro_prof",
          name: "DUPLA OUTRO PROFESSOR",
          teacher_id: "teacher_danilo_id",
          payment_type: "group",
          price: 360,
          frequency: "quinzenal",
        },
        teacher: { id: "teacher_danilo_id", name: "DANILO MOREIRA" },
        groupClasses: [
          { id: "gc1", date: "2026-08-01", status: "completed", title: "DUPLA OUTRO PROFESSOR", group_id: "grp_outro_prof" } as unknown as ClassSession,
          { id: "gc2", date: "2026-08-15", status: "completed", title: "DUPLA OUTRO PROFESSOR", group_id: "grp_outro_prof" } as unknown as ClassSession,
          { id: "gc3", date: "2026-08-29", status: "completed", title: "DUPLA OUTRO PROFESSOR", group_id: "grp_outro_prof" } as unknown as ClassSession,
        ],
        monthStr: "2026-08",
        previousCredits: 0,
      },
      expected: { finalMonthlyAmount: 360, isRaphaelRule: false },
    },
  ];

  return tests.map((t) => {
    const result = calculateRaphaelGroupMonthlySimulation(t.params);
    let passed = result.finalMonthlyAmount === t.expected.finalMonthlyAmount;
    if (t.expected.isRaphaelRule !== undefined) {
      passed = passed && result.isRaphaelRule === t.expected.isRaphaelRule;
    }
    if (t.expected.differenceFromContract !== undefined) {
      passed = passed && result.differenceFromContract === t.expected.differenceFromContract;
    }
    if (t.expected.creditsGenerated !== undefined) {
      passed = passed && result.creditsGenerated === t.expected.creditsGenerated;
    }
    if (t.expected.creditsConsumed !== undefined) {
      passed = passed && result.creditsConsumed === t.expected.creditsConsumed;
    }
    if (t.expected.creditsRemaining !== undefined) {
      passed = passed && result.creditsRemaining === t.expected.creditsRemaining;
    }

    return {
      testId: t.id,
      name: t.name,
      passed,
      result,
      expected: t.expected,
    };
  });
}
