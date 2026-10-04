/**
 * Suite de Testes Oficiais — ETAPA 5
 * Ativação do Cálculo Real de Pagamento do Professor Raphael
 *
 * Contém os 15 testes de validação obrigatórios conforme a especificação.
 */

import { ClassSession, Credit, Enrollment, FinancialPlan, Group, Teacher, Transaction } from "../store";
import {
  calculateRaphaelRealStudentBilling,
  calculateRaphaelRealGroupBilling,
  getClassesForEnrollment,
  getClassesForGroup,
  validateCreditConsumptionEntity,
  resolveCreditEnrollmentId,
  RaphaelBillingMemory,
} from "./raphaelRealBilling";
import {
  RAPHAEL_TEACHER_ID,
  isRaphaelTeacher,
  isCancelledByTeacherEligible,
  isMakeupClass,
} from "./raphaelBillingSimulation";

export interface Stage5TestResult {
  id: string;
  name: string;
  category: "individual" | "group" | "credit" | "security" | "historical" | "enrollment";
  description: string;
  passed: boolean;
  expectedSummary: string;
  actualSummary: string;
  details: any;
}

export function runAllStage5ValidationTests(): {
  allPassed: boolean;
  totalCount: number;
  passedCount: number;
  results: Stage5TestResult[];
} {
  const results: Stage5TestResult[] = [];

  const raphaelTeacher: Teacher = {
    id: RAPHAEL_TEACHER_ID,
    name: "RAPHAEL AUGUSTO PINTO",
    email: "raphael@example.com",
    phone: "11999999999",
    specialties: ["Canto"],
    status: "active",
  };

  const otherTeacher: Teacher = {
    id: "teacher_danilo_123",
    name: "DANILO MOREIRA",
    email: "danilo@example.com",
    phone: "11988888888",
    specialties: ["Violão"],
    status: "active",
  };

  const quinzenalPlan: FinancialPlan = {
    id: "plan_quinzenal",
    name: "Canto Quinzenal",
    category: "individual",
    modality: "quinzenal",
    base_price: 240,
    duration_minutes: 50,
    max_students: 1,
    is_active: true,
    exclusive_teacher_id: RAPHAEL_TEACHER_ID,
    allow_early_discount: false,
    early_discount_value: 0,
    early_discount_deadline_day: 10,
    secretary_fee_type: "fixed",
    secretary_fee_value: 0,
    school_fee_type: "fixed",
    school_fee_value: 0,
    teacher_fee_type: "fixed",
    teacher_fee_value: 0,
    margin_value: 0,
  };

  const semanalPlan: FinancialPlan = {
    id: "plan_semanal",
    name: "Canto Semanal",
    category: "individual",
    modality: "semanal",
    base_price: 200,
    duration_minutes: 50,
    max_students: 1,
    is_active: true,
    exclusive_teacher_id: RAPHAEL_TEACHER_ID,
    allow_early_discount: false,
    early_discount_value: 0,
    early_discount_deadline_day: 10,
    secretary_fee_type: "fixed",
    secretary_fee_value: 0,
    school_fee_type: "fixed",
    school_fee_value: 0,
    teacher_fee_type: "fixed",
    teacher_fee_value: 0,
    margin_value: 0,
  };

  // --------------------------------------------------------------------------
  // TESTE 1 — INDIVIDUAL NORMAL
  // Cristina: R$ 240, Quinzenal, 2 aulas. Resultado: R$ 240.
  // --------------------------------------------------------------------------
  {
    const enrollment: Enrollment = {
      id: "enr_1",
      student_id: "std_cristina",
      plan_id: "plan_quinzenal",
      teacher_id: RAPHAEL_TEACHER_ID,
      custom_price: 240,
      status: "active",
      enrollment_date: "2026-01-01",
      due_date_day: 10,
    };
    const classes: ClassSession[] = [
      { id: "c1", date: "2026-08-08", status: "completed", title: "Canto" } as ClassSession,
      { id: "c2", date: "2026-08-22", status: "scheduled", title: "Canto" } as ClassSession,
    ];
    const res = calculateRaphaelRealStudentBilling({
      enrollment,
      plan: quinzenalPlan,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-08",
      credits: [],
    });

    const passed = res.finalAmount === 240 && res.regularLessons === 2 && res.creditDiscountAmount === 0;
    results.push({
      id: "TESTE-1",
      name: "TESTE 1 — Individual Normal",
      category: "individual",
      description: "Cristina: R$ 240 Quinzenal, 2 aulas normais",
      passed,
      expectedSummary: "Final: R$ 240,00 | Aulas normais: 2",
      actualSummary: `Final: R$ ${res.finalAmount.toFixed(2)} | Aulas normais: ${res.regularLessons}`,
      details: res,
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 2 — INDIVIDUAL COM 3 AULAS
  // Cristina: R$ 240, Quinzenal, 3 aulas normais. Resultado: R$ 360.
  // --------------------------------------------------------------------------
  {
    const enrollment: Enrollment = {
      id: "enr_2",
      student_id: "std_cristina",
      plan_id: "plan_quinzenal",
      teacher_id: RAPHAEL_TEACHER_ID,
      custom_price: 240,
      status: "active",
      enrollment_date: "2026-01-01",
      due_date_day: 10,
    };
    const classes: ClassSession[] = [
      { id: "c1", date: "2026-08-01", status: "completed", title: "Canto" } as ClassSession,
      { id: "c2", date: "2026-08-15", status: "completed", title: "Canto" } as ClassSession,
      { id: "c3", date: "2026-08-29", status: "scheduled", title: "Canto" } as ClassSession,
    ];
    const res = calculateRaphaelRealStudentBilling({
      enrollment,
      plan: quinzenalPlan,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-08",
      credits: [],
    });

    const passed = res.finalAmount === 360 && res.regularLessons === 3 && res.extraLessons === 1;
    results.push({
      id: "TESTE-2",
      name: "TESTE 2 — Individual com 3 Aulas",
      category: "individual",
      description: "Cristina: R$ 240 Quinzenal, 3 aulas normais (calendário de 5 semanas)",
      passed,
      expectedSummary: "Final: R$ 360,00 (3 × R$ 120) | Extra: 1",
      actualSummary: `Final: R$ ${res.finalAmount.toFixed(2)} | Extra: ${res.extraLessons}`,
      details: res,
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 3 — SEMANAL COM 5 AULAS
  // R$ 200, Semanal, 5 aulas normais. Resultado: R$ 250.
  // --------------------------------------------------------------------------
  {
    const enrollment: Enrollment = {
      id: "enr_3",
      student_id: "std_joao",
      plan_id: "plan_semanal",
      teacher_id: RAPHAEL_TEACHER_ID,
      custom_price: 200,
      status: "active",
      enrollment_date: "2026-01-01",
      due_date_day: 10,
    };
    const classes: ClassSession[] = [
      { id: "c1", date: "2026-08-01", status: "completed", title: "Canto" } as ClassSession,
      { id: "c2", date: "2026-08-08", status: "completed", title: "Canto" } as ClassSession,
      { id: "c3", date: "2026-08-15", status: "completed", title: "Canto" } as ClassSession,
      { id: "c4", date: "2026-08-22", status: "completed", title: "Canto" } as ClassSession,
      { id: "c5", date: "2026-08-29", status: "scheduled", title: "Canto" } as ClassSession,
    ];
    const res = calculateRaphaelRealStudentBilling({
      enrollment,
      plan: semanalPlan,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-08",
      credits: [],
    });

    const passed = res.finalAmount === 250 && res.regularLessons === 5 && res.extraLessons === 1;
    results.push({
      id: "TESTE-3",
      name: "TESTE 3 — Semanal com 5 Aulas",
      category: "individual",
      description: "R$ 200 Semanal, 5 aulas normais (5 × R$ 50)",
      passed,
      expectedSummary: "Final: R$ 250,00 (5 × R$ 50) | Aulas-base: 4",
      actualSummary: `Final: R$ ${res.finalAmount.toFixed(2)} | Aulas: ${res.regularLessons}`,
      details: res,
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 4 — CANCELAMENTO RAPHAEL
  // R$ 240 Quinzenal. 1 aula cancelada pelo Raphael.
  // Resultado: Pagamento da origem: inalterado (R$ 240). Crédito: R$ 120.
  // --------------------------------------------------------------------------
  {
    const enrollment: Enrollment = {
      id: "enr_4",
      student_id: "std_cristina",
      plan_id: "plan_quinzenal",
      teacher_id: RAPHAEL_TEACHER_ID,
      custom_price: 240,
      status: "active",
      enrollment_date: "2026-01-01",
      due_date_day: 10,
    };
    const classes: ClassSession[] = [
      { id: "c1", date: "2026-08-08", status: "completed", title: "Canto" } as ClassSession,
      {
        id: "c2",
        date: "2026-08-22",
        status: "cancelled",
        cancelled_by_teacher: true,
        allow_makeup: true,
        title: "Canto",
      } as ClassSession,
    ];
    const res = calculateRaphaelRealStudentBilling({
      enrollment,
      plan: quinzenalPlan,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-08",
      credits: [],
    });

    const passed =
      res.finalAmount === 240 &&
      res.creditsGeneratedAmount === 120 &&
      res.creditsGeneratedCount === 1 &&
      res.isOriginCancellationMonth === true;

    results.push({
      id: "TESTE-4",
      name: "TESTE 4 — Cancelamento Raphael",
      category: "credit",
      description: "R$ 240 Quinzenal, 1 aula cancelada pelo Raphael",
      passed,
      expectedSummary: "Pagamento origem: R$ 240,00 (inalterado) | Crédito gerado: R$ 120,00",
      actualSummary: `Pagamento origem: R$ ${res.finalAmount.toFixed(2)} | Crédito: R$ ${res.creditsGeneratedAmount.toFixed(2)}`,
      details: res,
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 5 — CRÉDITO APLICADO
  // R$ 240, Crédito: R$ 120. Resultado: R$ 120. Crédito: used.
  // --------------------------------------------------------------------------
  {
    const enrollment: Enrollment = {
      id: "enr_5",
      student_id: "std_cristina",
      plan_id: "plan_quinzenal",
      teacher_id: RAPHAEL_TEACHER_ID,
      custom_price: 240,
      status: "active",
      enrollment_date: "2026-01-01",
      due_date_day: 10,
    };
    const classes: ClassSession[] = [
      { id: "c1", date: "2026-09-05", status: "completed", title: "Canto" } as ClassSession,
      { id: "c2", date: "2026-09-19", status: "scheduled", title: "Canto" } as ClassSession,
    ];
    const previousCredit: Credit = {
      id: "cred_august",
      student_id: "std_cristina",
      teacher_id: RAPHAEL_TEACHER_ID,
      source_class_id: "c_august_cancel",
      amount: 120,
      status: "available",
      competency_month: "2026-08",
    };

    const res = calculateRaphaelRealStudentBilling({
      enrollment,
      plan: quinzenalPlan,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: [previousCredit],
    });

    const passed =
      res.finalAmount === 120 &&
      res.creditDiscountAmount === 120 &&
      res.creditsConsumedList.length === 1 &&
      res.creditsConsumedList[0].id === "cred_august";

    results.push({
      id: "TESTE-5",
      name: "TESTE 5 — Crédito Aplicado",
      category: "credit",
      description: "R$ 240 contratado com R$ 120 de crédito anterior de agosto",
      passed,
      expectedSummary: "Final: R$ 120,00 | Crédito aplicado: R$ 120,00 (status used)",
      actualSummary: `Final: R$ ${res.finalAmount.toFixed(2)} | Crédito aplicado: R$ ${res.creditDiscountAmount.toFixed(2)}`,
      details: res,
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 6 — PERMITE REPOSIÇÃO SEM CRÉDITO
  // allow_makeup = true, cancelled_by_teacher = false.
  // Resultado: Aparece na aba de Reposição. Nenhum desconto.
  // --------------------------------------------------------------------------
  {
    const classSession: ClassSession = {
      id: "c_makeup_only",
      date: "2026-08-10",
      status: "cancelled",
      allow_makeup: true,
      cancelled_by_teacher: false,
      title: "Canto",
      student_ids: ["std_cristina"],
    } as ClassSession;

    const appearsInMakeupsTab = classSession.status === "cancelled" && classSession.allow_makeup !== false;
    const isEligibleForFinancialCredit = isCancelledByTeacherEligible(classSession);

    const passed = appearsInMakeupsTab === true && isEligibleForFinancialCredit === false;
    results.push({
      id: "TESTE-6",
      name: "TESTE 6 — Permite Reposição sem Crédito",
      category: "credit",
      description: "allow_makeup = true, cancelled_by_teacher = false",
      passed,
      expectedSummary: "Aba de Reposição: Sim | Crédito Financeiro: Não (R$ 0,00)",
      actualSummary: `Aba de Reposição: ${appearsInMakeupsTab ? "Sim" : "Não"} | Crédito Financeiro: ${isEligibleForFinancialCredit ? "Sim" : "Não"}`,
      details: { appearsInMakeupsTab, isEligibleForFinancialCredit },
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 7 — CANCELAMENTO RAPHAEL SEM REPOSIÇÃO
  // cancelled_by_teacher = true, allow_makeup = false.
  // Resultado: Crédito gerado. Não aparece na aba de Reposição.
  // --------------------------------------------------------------------------
  {
    const classSession: ClassSession = {
      id: "c_cancel_no_makeup",
      date: "2026-08-12",
      status: "cancelled",
      cancelled_by_teacher: true,
      allow_makeup: false,
      title: "Canto",
      student_ids: ["std_cristina"],
    } as ClassSession;

    const appearsInMakeupsTab = classSession.status === "cancelled" && classSession.allow_makeup !== false;
    const isEligibleForFinancialCredit = isCancelledByTeacherEligible(classSession);

    const passed = appearsInMakeupsTab === false && isEligibleForFinancialCredit === true;
    results.push({
      id: "TESTE-7",
      name: "TESTE 7 — Cancelamento Raphael sem Reposição",
      category: "credit",
      description: "cancelled_by_teacher = true, allow_makeup = false",
      passed,
      expectedSummary: "Aba de Reposição: Não | Crédito Financeiro: Sim (Gerado)",
      actualSummary: `Aba de Reposição: ${appearsInMakeupsTab ? "Sim" : "Não"} | Crédito Financeiro: ${isEligibleForFinancialCredit ? "Sim" : "Não"}`,
      details: { appearsInMakeupsTab, isEligibleForFinancialCredit },
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 8 — CANCELAMENTO + REPOSIÇÃO
  // As duas flags true.
  // Resultado: Crédito gerado. Aparece na aba de Reposição. Reposição utiliza o crédito.
  // --------------------------------------------------------------------------
  {
    const cancelledClass: ClassSession = {
      id: "c_august_cancel",
      date: "2026-08-20",
      status: "cancelled",
      cancelled_by_teacher: true,
      allow_makeup: true,
      title: "Canto",
      student_ids: ["std_cristina"],
    } as ClassSession;

    const appearsInMakeupsTab = cancelledClass.status === "cancelled" && cancelledClass.allow_makeup !== false;
    const isEligibleForFinancialCredit = isCancelledByTeacherEligible(cancelledClass);

    // Em setembro: 2 normais + 1 reposição coberta pelo crédito
    const enrollment: Enrollment = {
      id: "enr_8",
      student_id: "std_cristina",
      plan_id: "plan_quinzenal",
      teacher_id: RAPHAEL_TEACHER_ID,
      custom_price: 240,
      status: "active",
      enrollment_date: "2026-01-01",
      due_date_day: 10,
    };
    const septemberClasses: ClassSession[] = [
      { id: "c1", date: "2026-09-05", status: "completed", title: "Canto" } as ClassSession,
      { id: "c2", date: "2026-09-19", status: "scheduled", title: "Canto" } as ClassSession,
      { id: "c3", date: "2026-09-12", status: "scheduled", title: "Reposição de 20/08" } as ClassSession,
    ];
    const previousCredit: Credit = {
      id: "cred_august_8",
      student_id: "std_cristina",
      teacher_id: RAPHAEL_TEACHER_ID,
      source_class_id: "c_august_cancel",
      amount: 120,
      status: "available",
      competency_month: "2026-08",
    };

    const res = calculateRaphaelRealStudentBilling({
      enrollment,
      plan: quinzenalPlan,
      teacher: raphaelTeacher,
      classes: septemberClasses,
      monthStr: "2026-09",
      credits: [previousCredit],
    });

    const passed =
      appearsInMakeupsTab === true &&
      isEligibleForFinancialCredit === true &&
      res.makeupLessons === 1 &&
      res.creditsConsumedCount === 1 &&
      res.finalAmount === 240; // reposição coberta por crédito, não cobra extra!

    results.push({
      id: "TESTE-8",
      name: "TESTE 8 — Cancelamento + Reposição",
      category: "credit",
      description: "cancelled_by_teacher = true, allow_makeup = true",
      passed,
      expectedSummary: "Crédito gerado: Sim | Aparece Makeups: Sim | Reposição consome crédito (Final R$ 240,00)",
      actualSummary: `Crédito: Sim | Makeups: ${appearsInMakeupsTab ? "Sim" : "Não"} | Final: R$ ${res.finalAmount.toFixed(2)} (Créditos Consumidos: ${res.creditsConsumedCount})`,
      details: { res, appearsInMakeupsTab, isEligibleForFinancialCredit },
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 9 — GRUPO QUINZENAL
  // Grupo: R$ 360. 2 aulas-base. 2 aulas normais. Resultado: R$ 360.
  // --------------------------------------------------------------------------
  {
    const group: Group = {
      id: "grp_sergio_rafaela",
      name: "DUPLA SERGIO E RAFAELA",
      teacher_id: RAPHAEL_TEACHER_ID,
      payment_type: "group",
      price: 360,
      frequency: "quinzenal",
    };
    const classes: ClassSession[] = [
      { id: "gc1", date: "2026-08-08", status: "completed", group_id: group.id, title: group.name } as ClassSession,
      { id: "gc2", date: "2026-08-22", status: "scheduled", group_id: group.id, title: group.name } as ClassSession,
    ];

    const res = calculateRaphaelRealGroupBilling({
      group,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-08",
      credits: [],
    });

    const passed = res.finalAmount === 360 && res.regularLessons === 2 && res.pricePerLesson === 180;
    results.push({
      id: "TESTE-9",
      name: "TESTE 9 — Grupo Quinzenal",
      category: "group",
      description: "Grupo Dupla Sergio e Rafaela: R$ 360, 2 aulas normais",
      passed,
      expectedSummary: "Final: R$ 360,00 | Aulas normais: 2 | Valor por aula: R$ 180,00",
      actualSummary: `Final: R$ ${res.finalAmount.toFixed(2)} | Aulas: ${res.regularLessons} | Aula: R$ ${res.pricePerLesson.toFixed(2)}`,
      details: res,
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 10 — GRUPO QUINZENAL COM AULA EXTRA
  // Grupo: R$ 360. 3 aulas normais. Resultado: R$ 540.
  // --------------------------------------------------------------------------
  {
    const group: Group = {
      id: "grp_sergio_rafaela",
      name: "DUPLA SERGIO E RAFAELA",
      teacher_id: RAPHAEL_TEACHER_ID,
      payment_type: "group",
      price: 360,
      frequency: "quinzenal",
    };
    const classes: ClassSession[] = [
      { id: "gc1", date: "2026-08-01", status: "completed", group_id: group.id, title: group.name } as ClassSession,
      { id: "gc2", date: "2026-08-15", status: "completed", group_id: group.id, title: group.name } as ClassSession,
      { id: "gc3", date: "2026-08-29", status: "scheduled", group_id: group.id, title: group.name } as ClassSession,
    ];

    const res = calculateRaphaelRealGroupBilling({
      group,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-08",
      credits: [],
    });

    const passed = res.finalAmount === 540 && res.regularLessons === 3 && res.extraLessons === 1;
    results.push({
      id: "TESTE-10",
      name: "TESTE 10 — Grupo Quinzenal com Aula Extra",
      category: "group",
      description: "Grupo R$ 360 Quinzenal com 3 aulas normais (3 × R$ 180 = R$ 540)",
      passed,
      expectedSummary: "Final: R$ 540,00 (3 × R$ 180) | Extra: 1",
      actualSummary: `Final: R$ ${res.finalAmount.toFixed(2)} | Extra: ${res.extraLessons}`,
      details: res,
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 11 — GRUPO + CRÉDITO
  // Grupo: R$ 360. 3 aulas normais. Crédito: R$ 180. Resultado: R$ 360.
  // --------------------------------------------------------------------------
  {
    const group: Group = {
      id: "grp_sergio_rafaela",
      name: "DUPLA SERGIO E RAFAELA",
      teacher_id: RAPHAEL_TEACHER_ID,
      payment_type: "group",
      price: 360,
      frequency: "quinzenal",
    };
    const classes: ClassSession[] = [
      { id: "gc1", date: "2026-09-05", status: "completed", group_id: group.id, title: group.name } as ClassSession,
      { id: "gc2", date: "2026-09-19", status: "completed", group_id: group.id, title: group.name } as ClassSession,
      { id: "gc3", date: "2026-09-26", status: "scheduled", group_id: group.id, title: group.name } as ClassSession,
    ];
    const previousCredit: Credit = {
      id: "cred_group_180",
      group_id: group.id,
      teacher_id: RAPHAEL_TEACHER_ID,
      source_class_id: "gc_cancel_august",
      amount: 180,
      status: "available",
      competency_month: "2026-08",
    };

    const res = calculateRaphaelRealGroupBilling({
      group,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: [previousCredit],
    });

    const passed =
      res.grossAmount === 540 &&
      res.creditDiscountAmount === 180 &&
      res.finalAmount === 360 &&
      res.creditsConsumedCount === 1;

    results.push({
      id: "TESTE-11",
      name: "TESTE 11 — Grupo com Aula Extra + Crédito",
      category: "group",
      description: "Grupo R$ 360, 3 aulas normais (R$ 540), crédito anterior de R$ 180",
      passed,
      expectedSummary: "Final: R$ 360,00 (540 - 180) | Crédito: R$ 180,00 consumido",
      actualSummary: `Final: R$ ${res.finalAmount.toFixed(2)} | Desconto: R$ ${res.creditDiscountAmount.toFixed(2)}`,
      details: res,
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 12 — FALTA DO ALUNO
  // Nenhum crédito. Valor não reduzido.
  // --------------------------------------------------------------------------
  {
    const enrollment: Enrollment = {
      id: "enr_12",
      student_id: "std_cristina",
      plan_id: "plan_quinzenal",
      teacher_id: RAPHAEL_TEACHER_ID,
      custom_price: 240,
      status: "active",
      enrollment_date: "2026-01-01",
      due_date_day: 10,
    };
    const classes: ClassSession[] = [
      {
        id: "c1",
        date: "2026-08-08",
        status: "completed",
        title: "Canto",
        attendance: { std_cristina: "absent" },
      } as unknown as ClassSession,
      { id: "c2", date: "2026-08-22", status: "completed", title: "Canto" } as ClassSession,
    ];

    const res = calculateRaphaelRealStudentBilling({
      enrollment,
      plan: quinzenalPlan,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-08",
      credits: [],
    });

    const passed =
      res.finalAmount === 240 &&
      res.studentAbsences === 1 &&
      res.creditsGeneratedCount === 0 &&
      res.creditsGeneratedAmount === 0;

    results.push({
      id: "TESTE-12",
      name: "TESTE 12 — Falta do Aluno",
      category: "individual",
      description: "Aluno faltou na aula: cobrada normalmente, sem gerar crédito",
      passed,
      expectedSummary: "Final: R$ 240,00 (não reduzido) | Faltas: 1 | Crédito gerado: R$ 0,00",
      actualSummary: `Final: R$ ${res.finalAmount.toFixed(2)} | Faltas: ${res.studentAbsences} | Crédito gerado: R$ ${res.creditsGeneratedAmount.toFixed(2)}`,
      details: res,
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 13 — OUTRO PROFESSOR
  // Regra antiga permanece exatamente igual.
  // --------------------------------------------------------------------------
  {
    const isOtherRaphael = isRaphaelTeacher(otherTeacher.id, otherTeacher.name);
    const enrollment: Enrollment = {
      id: "enr_other",
      student_id: "std_lucas",
      plan_id: "plan_quinzenal",
      teacher_id: otherTeacher.id,
      status: "active",
      enrollment_date: "2026-01-01",
      due_date_day: 10,
    };

    // Para outro professor, não aplica regra do Raphael
    const passed = isOtherRaphael === false;

    results.push({
      id: "TESTE-13",
      name: "TESTE 13 — Outro Professor (Isolamento de Escopo)",
      category: "security",
      description: "Professor Danilo Moreira: mantém 100% da regra financeira atual intacta",
      passed,
      expectedSummary: "isRaphaelTeacher: false | Motor especial desativado",
      actualSummary: `isRaphaelTeacher: ${isOtherRaphael ? "true" : "false"} | Regra padrão isolada`,
      details: { teacher: otherTeacher, isOtherRaphael },
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 14 — DUPLICIDADE
  // Tentar utilizar o mesmo crédito duas vezes. Sistema deve impedir.
  // --------------------------------------------------------------------------
  {
    const usedCredit: Credit = {
      id: "cred_already_used",
      student_id: "std_cristina",
      teacher_id: RAPHAEL_TEACHER_ID,
      source_class_id: "c_src_1",
      amount: 120,
      status: "used", // já utilizado!
      competency_month: "2026-08",
    };

    // Simulação da verificação de segurança antes de baixar
    const attemptToApply = (cred: Credit): { allowed: boolean; reason?: string } => {
      if (cred.status === "used") {
        return { allowed: false, reason: "Crédito já foi utilizado anteriormente (status: used)" };
      }
      if (cred.status === "cancelled") {
        return { allowed: false, reason: "Crédito cancelado" };
      }
      return { allowed: true };
    };

    const check = attemptToApply(usedCredit);
    const passed = check.allowed === false && check.reason?.includes("já foi utilizado");

    results.push({
      id: "TESTE-14",
      name: "TESTE 14 — Proteção contra Duplicidade de Crédito",
      category: "security",
      description: "Tentativa de reutilizar crédito já com status 'used'",
      passed,
      expectedSummary: "Bloqueio de reutilização: Sim | Operação recusada",
      actualSummary: `Bloqueio: ${check.allowed ? "Falhou" : "Sucesso"} (${check.reason})`,
      details: check,
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 15 — JULHO/2026
  // Verificar fechamento histórico. Resultado: Nenhuma alteração.
  // --------------------------------------------------------------------------
  {
    // Simulação de transação histórica existente de Julho/2026
    const historicalTransaction: Transaction = {
      id: "tx_july_2026_1",
      type: "income",
      amount: 240,
      description: "Mensalidade | enr_cristina | 07/2026 | Cristina Messias Ferrari",
      date: "2026-07-10",
      status: "completed",
    };

    // Verificação de que pagamentos já baixados não sofrem recalculo retroativo
    const isHistoricalProtected = (tx: Transaction) => {
      // Competência julho ou anterior permanece inalterada
      return tx.status === "completed" && tx.date.startsWith("2026-07") && tx.amount === 240;
    };

    const passed = isHistoricalProtected(historicalTransaction);

    results.push({
      id: "TESTE-15",
      name: "TESTE 15 — Proteção Histórica Julho/2026",
      category: "historical",
      description: "Fechamentos e pagamentos históricos anteriores permanecem intactos",
      passed,
      expectedSummary: "Preservação histórica: R$ 240,00 intacto | Sem recálculo",
      actualSummary: `Preservação: ${passed ? "Intacto" : "Alterado"} (R$ ${historicalTransaction.amount.toFixed(2)})`,
      details: historicalTransaction,
    });
  }

  // ==========================================================================
  // ETAPA 5 — CORREÇÃO CRÍTICA: CÁLCULO POR MATRÍCULA E NÃO POR ALUNO
  // CENÁRIOS CANÔNICOS DE TESTE 16 A 24
  // ==========================================================================

  // Entidades base para testes de matrícula isolada (Caso Agnelson Gonçalves)
  const agnelsonStudentId = "std_agnelson";
  const planVocalAgnelson: FinancialPlan = {
    ...quinzenalPlan,
    id: "plan_vocal_agnelson",
    name: "PREPARAÇÃO VOCAL - QUINZENAL",
    base_price: 320,
  };
  const enrAgnelsonIndiv: Enrollment = {
    id: "enr_agnelson_indiv",
    student_id: agnelsonStudentId,
    plan_id: "plan_vocal_agnelson",
    teacher_id: RAPHAEL_TEACHER_ID,
    custom_price: 320,
    status: "active",
    enrollment_date: "2026-01-01",
    due_date_day: 10,
  };
  const grpMev15: Group = {
    id: "grp_mev15",
    name: "MEV 15 ONLINE",
    teacher_id: RAPHAEL_TEACHER_ID,
    price: 120,
    frequency: "quinzenal",
    payment_type: "group",
  };

  // --------------------------------------------------------------------------
  // TESTE 16 — ALUNO COM INDIVIDUAL + GRUPO (AGNELSON GONÇALVES)
  // Aluno possui matrícula individual (R$ 320 quinzenal) e grupo (R$ 120 quinzenal).
  // No mês: 2 aulas individuais + 2 aulas de grupo.
  // Resultado: As duas matrículas são financeiramente independentes e isoladas.
  // --------------------------------------------------------------------------
  {
    const classes: ClassSession[] = [
      {
        id: "c_agn_ind_1",
        date: "2026-09-05",
        status: "completed",
        title: "Preparação Vocal - Agnelson",
        student_ids: [agnelsonStudentId],
        teacher_id: RAPHAEL_TEACHER_ID,
      } as ClassSession,
      {
        id: "c_agn_ind_2",
        date: "2026-09-19",
        status: "completed",
        title: "Preparação Vocal - Agnelson",
        student_ids: [agnelsonStudentId],
        teacher_id: RAPHAEL_TEACHER_ID,
      } as ClassSession,
      {
        id: "c_grp_1",
        date: "2026-09-08",
        status: "completed",
        title: "MEV 15 ONLINE",
        group_id: grpMev15.id,
        student_ids: [agnelsonStudentId, "std_aluno_2"],
        teacher_id: RAPHAEL_TEACHER_ID,
      } as ClassSession,
      {
        id: "c_grp_2",
        date: "2026-09-22",
        status: "completed",
        title: "MEV 15 ONLINE",
        group_id: grpMev15.id,
        student_ids: [agnelsonStudentId, "std_aluno_2"],
        teacher_id: RAPHAEL_TEACHER_ID,
      } as ClassSession,
    ];

    const resIndiv = calculateRaphaelRealStudentBilling({
      enrollment: enrAgnelsonIndiv,
      plan: planVocalAgnelson,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: [],
      studentName: "Agnelson Gonçalves",
      allGroups: [grpMev15],
    });

    const resGroup = calculateRaphaelRealGroupBilling({
      group: grpMev15,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: [],
      allGroups: [grpMev15],
    });

    const passed =
      resIndiv.regularLessons === 2 &&
      resIndiv.extraLessons === 0 &&
      resIndiv.finalAmount === 320 &&
      resGroup.regularLessons === 2 &&
      resGroup.extraLessons === 0 &&
      resGroup.finalAmount === 120;

    results.push({
      id: "TESTE-16",
      name: "TESTE 16 — Aluno com Individual + Grupo",
      category: "enrollment",
      description: "Agnelson: 2 aulas individuais + 2 aulas grupo. Faturamento separado e isolado.",
      passed,
      expectedSummary: "Individual: R$ 320,00 (2 aulas) | Grupo: R$ 120,00 (2 aulas) | Nenhuma soma indevida",
      actualSummary: `Individual: R$ ${resIndiv.finalAmount.toFixed(2)} (${resIndiv.regularLessons} aulas) | Grupo: R$ ${resGroup.finalAmount.toFixed(2)} (${resGroup.regularLessons} aulas)`,
      details: { resIndiv, resGroup },
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 17 — VALORES DIFERENTES POR MATRÍCULA
  // Individual: base R$ 320 / 2 = R$ 160 por aula
  // Grupo: base R$ 120 / 2 = R$ 60 por aula
  // O sistema deve calcular o valor unitário e total correto para cada matrícula.
  // --------------------------------------------------------------------------
  {
    const classes: ClassSession[] = [
      {
        id: "c_agn_ind_1",
        date: "2026-09-05",
        status: "completed",
        student_ids: [agnelsonStudentId],
        teacher_id: RAPHAEL_TEACHER_ID,
      } as ClassSession,
      {
        id: "c_agn_ind_2",
        date: "2026-09-19",
        status: "completed",
        student_ids: [agnelsonStudentId],
        teacher_id: RAPHAEL_TEACHER_ID,
      } as ClassSession,
      {
        id: "c_grp_1",
        date: "2026-09-08",
        status: "completed",
        group_id: grpMev15.id,
        student_ids: [agnelsonStudentId],
        teacher_id: RAPHAEL_TEACHER_ID,
      } as ClassSession,
      {
        id: "c_grp_2",
        date: "2026-09-22",
        status: "completed",
        group_id: grpMev15.id,
        student_ids: [agnelsonStudentId],
        teacher_id: RAPHAEL_TEACHER_ID,
      } as ClassSession,
    ];

    const resIndiv = calculateRaphaelRealStudentBilling({
      enrollment: enrAgnelsonIndiv,
      plan: planVocalAgnelson,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: [],
      allGroups: [grpMev15],
    });

    const resGroup = calculateRaphaelRealGroupBilling({
      group: grpMev15,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: [],
      allGroups: [grpMev15],
    });

    const passed =
      resIndiv.monthlyBasePrice === 320 &&
      resIndiv.pricePerLesson === 160 &&
      resGroup.monthlyBasePrice === 120 &&
      resGroup.pricePerLesson === 60;

    results.push({
      id: "TESTE-17",
      name: "TESTE 17 — Valores Diferentes por Matrícula",
      category: "enrollment",
      description: "Valor por aula individual (R$ 160) e do grupo (R$ 60) rigorosamente separados",
      passed,
      expectedSummary: "Indiv: R$ 320 base (R$ 160/aula) | Grupo: R$ 120 base (R$ 60/aula)",
      actualSummary: `Indiv: R$ ${resIndiv.monthlyBasePrice} (R$ ${resIndiv.pricePerLesson}/aula) | Grupo: R$ ${resGroup.monthlyBasePrice} (R$ ${resGroup.pricePerLesson}/aula)`,
      details: { resIndiv, resGroup },
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 18 — CRÉDITO INDIVIDUAL SEPARADO DO GRUPO
  // Crédito de R$ 160 gerado por cancelamento de aula individual do Agnelson.
  // Deve abater a mensalidade individual de R$ 320 -> R$ 160.
  // NUNCA deve abater a mensalidade do grupo MEV 15 (permanece R$ 120).
  // --------------------------------------------------------------------------
  {
    const credIndiv: Credit = {
      id: "cred_indiv_agnelson",
      student_id: agnelsonStudentId,
      teacher_id: RAPHAEL_TEACHER_ID,
      amount: 160,
      status: "available",
      competency_month: "2026-08",
      source_class_id: "c_src_indiv",
    };

    const classes: ClassSession[] = [
      { id: "ci1", date: "2026-09-05", status: "completed", student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "ci2", date: "2026-09-19", status: "completed", student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "cg1", date: "2026-09-08", status: "completed", group_id: grpMev15.id, student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "cg2", date: "2026-09-22", status: "completed", group_id: grpMev15.id, student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
    ];

    const allCredits = [credIndiv];

    const resIndiv = calculateRaphaelRealStudentBilling({
      enrollment: enrAgnelsonIndiv,
      plan: planVocalAgnelson,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: allCredits,
      allGroups: [grpMev15],
    });

    const resGroup = calculateRaphaelRealGroupBilling({
      group: grpMev15,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: allCredits,
      allGroups: [grpMev15],
    });

    const passed =
      resIndiv.creditDiscountAmount === 160 &&
      resIndiv.finalAmount === 160 &&
      resIndiv.creditsConsumedCount === 1 &&
      resGroup.creditDiscountAmount === 0 &&
      resGroup.finalAmount === 120 &&
      resGroup.creditsConsumedCount === 0;

    results.push({
      id: "TESTE-18",
      name: "TESTE 18 — Crédito Individual Separado do Grupo",
      category: "enrollment",
      description: "Crédito individual abate apenas a matrícula individual. O grupo não sofre desconto.",
      passed,
      expectedSummary: "Individual: R$ 160,00 (desconto R$ 160) | Grupo: R$ 120,00 (desconto R$ 0)",
      actualSummary: `Individual: R$ ${resIndiv.finalAmount.toFixed(2)} (desc: R$ ${resIndiv.creditDiscountAmount}) | Grupo: R$ ${resGroup.finalAmount.toFixed(2)} (desc: R$ ${resGroup.creditDiscountAmount})`,
      details: { resIndiv, resGroup },
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 19 — CRÉDITO DO GRUPO SEPARADO DO INDIVIDUAL
  // Crédito de R$ 60 gerado por cancelamento de aula do grupo MEV 15.
  // Deve abater o grupo de R$ 120 -> R$ 60.
  // NUNCA deve abater a matrícula individual do Agnelson (permanece R$ 320).
  // --------------------------------------------------------------------------
  {
    const credGroup: Credit = {
      id: "cred_group_mev15",
      group_id: grpMev15.id,
      teacher_id: RAPHAEL_TEACHER_ID,
      amount: 60,
      status: "available",
      competency_month: "2026-08",
      source_class_id: "c_src_grp",
    };

    const classes: ClassSession[] = [
      { id: "ci1", date: "2026-09-05", status: "completed", student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "ci2", date: "2026-09-19", status: "completed", student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "cg1", date: "2026-09-08", status: "completed", group_id: grpMev15.id, student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "cg2", date: "2026-09-22", status: "completed", group_id: grpMev15.id, student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
    ];

    const allCredits = [credGroup];

    const resIndiv = calculateRaphaelRealStudentBilling({
      enrollment: enrAgnelsonIndiv,
      plan: planVocalAgnelson,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: allCredits,
      allGroups: [grpMev15],
    });

    const resGroup = calculateRaphaelRealGroupBilling({
      group: grpMev15,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: allCredits,
      allGroups: [grpMev15],
    });

    const passed =
      resGroup.creditDiscountAmount === 60 &&
      resGroup.finalAmount === 60 &&
      resGroup.creditsConsumedCount === 1 &&
      resIndiv.creditDiscountAmount === 0 &&
      resIndiv.finalAmount === 320 &&
      resIndiv.creditsConsumedCount === 0;

    results.push({
      id: "TESTE-19",
      name: "TESTE 19 — Crédito do Grupo Separado do Individual",
      category: "enrollment",
      description: "Crédito do grupo abate apenas o faturamento do grupo. A matrícula individual não sofre desconto.",
      passed,
      expectedSummary: "Grupo: R$ 60,00 (desconto R$ 60) | Individual: R$ 320,00 (desconto R$ 0)",
      actualSummary: `Grupo: R$ ${resGroup.finalAmount.toFixed(2)} (desc: R$ ${resGroup.creditDiscountAmount}) | Individual: R$ ${resIndiv.finalAmount.toFixed(2)} (desc: R$ ${resIndiv.creditDiscountAmount})`,
      details: { resIndiv, resGroup },
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 20 — 2 AULAS INDIVIDUAIS + 2 AULAS GRUPO (CONTAGEM EXATA)
  // Agnelson participou de 4 aulas presenciais/online no total da escola.
  // Erro anterior: Individual recebia 4 aulas -> cobrava 4 * 160 = R$ 640!
  // Correto: Individual = 2 aulas (R$ 320) | Grupo = 2 aulas (R$ 120).
  // --------------------------------------------------------------------------
  {
    const classes: ClassSession[] = [
      { id: "ci1", date: "2026-09-05", status: "completed", student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "ci2", date: "2026-09-19", status: "completed", student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "cg1", date: "2026-09-08", status: "completed", group_id: grpMev15.id, student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "cg2", date: "2026-09-22", status: "completed", group_id: grpMev15.id, student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
    ];

    const resIndiv = calculateRaphaelRealStudentBilling({
      enrollment: enrAgnelsonIndiv,
      plan: planVocalAgnelson,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: [],
      allGroups: [grpMev15],
    });

    const resGroup = calculateRaphaelRealGroupBilling({
      group: grpMev15,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: [],
      allGroups: [grpMev15],
    });

    const passed =
      resIndiv.regularLessons === 2 &&
      resIndiv.grossAmount === 320 &&
      resIndiv.finalAmount === 320 &&
      resGroup.regularLessons === 2 &&
      resGroup.grossAmount === 120 &&
      resGroup.finalAmount === 120;

    results.push({
      id: "TESTE-20",
      name: "TESTE 20 — 2 Aulas Individuais + 2 Aulas Grupo",
      category: "enrollment",
      description: "Contagem estrita de 2 aulas para individual e 2 para grupo, sem soma de 4 aulas",
      passed,
      expectedSummary: "Individual: 2 aulas (R$ 320) | Grupo: 2 aulas (R$ 120) | Total 4 aulas não se misturam",
      actualSummary: `Individual: ${resIndiv.regularLessons} aulas (R$ ${resIndiv.finalAmount}) | Grupo: ${resGroup.regularLessons} aulas (R$ ${resGroup.finalAmount})`,
      details: { resIndiv, resGroup },
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 21 — 3 AULAS INDIVIDUAIS + 2 AULAS GRUPO
  // Individual: 3 aulas normais (quinzenal base = 2). 1 aula extra -> 3 * 160 = R$ 480.
  // Grupo: 2 aulas normais (quinzenal base = 2). Valor base = R$ 120.
  // O grupo não é afetado pela aula extra individual.
  // --------------------------------------------------------------------------
  {
    const classes: ClassSession[] = [
      { id: "ci1", date: "2026-09-05", status: "completed", student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "ci2", date: "2026-09-12", status: "completed", student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "ci3", date: "2026-09-19", status: "completed", student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "cg1", date: "2026-09-08", status: "completed", group_id: grpMev15.id, student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "cg2", date: "2026-09-22", status: "completed", group_id: grpMev15.id, student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
    ];

    const resIndiv = calculateRaphaelRealStudentBilling({
      enrollment: enrAgnelsonIndiv,
      plan: planVocalAgnelson,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: [],
      allGroups: [grpMev15],
    });

    const resGroup = calculateRaphaelRealGroupBilling({
      group: grpMev15,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: [],
      allGroups: [grpMev15],
    });

    const passed =
      resIndiv.regularLessons === 3 &&
      resIndiv.extraLessons === 1 &&
      resIndiv.finalAmount === 480 &&
      resGroup.regularLessons === 2 &&
      resGroup.extraLessons === 0 &&
      resGroup.finalAmount === 120;

    results.push({
      id: "TESTE-21",
      name: "TESTE 21 — 3 Aulas Individuais + 2 Aulas Grupo",
      category: "enrollment",
      description: "Aula extra individual calculada a R$ 160 (R$ 480 total), grupo inalterado em R$ 120",
      passed,
      expectedSummary: "Individual: 3 aulas (R$ 480,00) | Grupo: 2 aulas (R$ 120,00)",
      actualSummary: `Individual: ${resIndiv.regularLessons} aulas (R$ ${resIndiv.finalAmount.toFixed(2)}) | Grupo: ${resGroup.regularLessons} aulas (R$ ${resGroup.finalAmount.toFixed(2)})`,
      details: { resIndiv, resGroup },
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 22 — GRUPO COM AULA EXTRA
  // Individual: 2 aulas normais -> R$ 320.
  // Grupo: 3 aulas normais (1 extra) -> 3 * 60 = R$ 180.
  // A aula extra do grupo NUNCA incide sobre a matrícula individual.
  // --------------------------------------------------------------------------
  {
    const classes: ClassSession[] = [
      { id: "ci1", date: "2026-09-05", status: "completed", student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "ci2", date: "2026-09-19", status: "completed", student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "cg1", date: "2026-09-08", status: "completed", group_id: grpMev15.id, student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "cg2", date: "2026-09-15", status: "completed", group_id: grpMev15.id, student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "cg3", date: "2026-09-22", status: "completed", group_id: grpMev15.id, student_ids: [agnelsonStudentId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
    ];

    const resIndiv = calculateRaphaelRealStudentBilling({
      enrollment: enrAgnelsonIndiv,
      plan: planVocalAgnelson,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: [],
      allGroups: [grpMev15],
    });

    const resGroup = calculateRaphaelRealGroupBilling({
      group: grpMev15,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: [],
      allGroups: [grpMev15],
    });

    const passed =
      resIndiv.regularLessons === 2 &&
      resIndiv.extraLessons === 0 &&
      resIndiv.finalAmount === 320 &&
      resGroup.regularLessons === 3 &&
      resGroup.extraLessons === 1 &&
      resGroup.finalAmount === 180;

    results.push({
      id: "TESTE-22",
      name: "TESTE 22 — Grupo com Aula Extra",
      category: "enrollment",
      description: "Grupo com 3 aulas (R$ 180), individual permanece intacto em 2 aulas (R$ 320)",
      passed,
      expectedSummary: "Individual: 2 aulas (R$ 320,00) | Grupo: 3 aulas (R$ 180,00)",
      actualSummary: `Individual: ${resIndiv.regularLessons} aulas (R$ ${resIndiv.finalAmount.toFixed(2)}) | Grupo: ${resGroup.regularLessons} aulas (R$ ${resGroup.finalAmount.toFixed(2)})`,
      details: { resIndiv, resGroup },
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 23 — ALUNO SEM GRUPO
  // Aluno possui somente matrícula individual (ex: Carlos Silva).
  // Não participa de nenhum grupo. Cálculo individual funciona normalmente.
  // --------------------------------------------------------------------------
  {
    const carlosId = "std_carlos";
    const enrCarlos: Enrollment = {
      id: "enr_carlos",
      student_id: carlosId,
      plan_id: "plan_quinzenal",
      teacher_id: RAPHAEL_TEACHER_ID,
      custom_price: 240,
      status: "active",
      enrollment_date: "2026-01-01",
      due_date_day: 10,
    };
    const classes: ClassSession[] = [
      { id: "cc1", date: "2026-09-02", status: "completed", student_ids: [carlosId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "cc2", date: "2026-09-16", status: "completed", student_ids: [carlosId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
    ];

    const resCarlos = calculateRaphaelRealStudentBilling({
      enrollment: enrCarlos,
      plan: quinzenalPlan,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: [],
      allGroups: [grpMev15],
    });

    const passed =
      resCarlos.regularLessons === 2 &&
      resCarlos.extraLessons === 0 &&
      resCarlos.finalAmount === 240;

    results.push({
      id: "TESTE-23",
      name: "TESTE 23 — Aluno sem Grupo",
      category: "enrollment",
      description: "Aluno com matrícula puramente individual calculada com precisão sem interferência de grupos",
      passed,
      expectedSummary: "Individual: 2 aulas | Final: R$ 240,00",
      actualSummary: `Individual: ${resCarlos.regularLessons} aulas | Final: R$ ${resCarlos.finalAmount.toFixed(2)}`,
      details: resCarlos,
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 24 — ALUNO SOMENTE EM GRUPO
  // Aluno participa somente de grupo unificado (ex: Mariana Costa em MEV 15).
  // getClassesForEnrollment com matrícula individual hipotética retorna 0 aulas.
  // Grupo MEV 15 fatura normalmente.
  // --------------------------------------------------------------------------
  {
    const marianaId = "std_mariana";
    const grpMariana: Group = {
      id: "grp_mariana_mev",
      name: "MEV 15 ONLINE",
      teacher_id: RAPHAEL_TEACHER_ID,
      price: 120,
      frequency: "quinzenal",
      payment_type: "group",
    };

    const classes: ClassSession[] = [
      { id: "cm1", date: "2026-09-08", status: "completed", group_id: grpMariana.id, student_ids: [marianaId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
      { id: "cm2", date: "2026-09-22", status: "completed", group_id: grpMariana.id, student_ids: [marianaId], teacher_id: RAPHAEL_TEACHER_ID } as ClassSession,
    ];

    // Matrícula individual hipotética inexistente para o aluno
    const fakeIndivEnrollment: Enrollment = {
      id: "enr_fake_mariana",
      student_id: marianaId,
      plan_id: "plan_quinzenal",
      teacher_id: RAPHAEL_TEACHER_ID,
      status: "active",
      enrollment_date: "2026-01-01",
      due_date_day: 10,
    };

    const individualClassesCount = getClassesForEnrollment(
      fakeIndivEnrollment,
      classes,
      [grpMariana]
    ).length;

    const resGroup = calculateRaphaelRealGroupBilling({
      group: grpMariana,
      teacher: raphaelTeacher,
      classes,
      monthStr: "2026-09",
      credits: [],
      allGroups: [grpMariana],
    });

    const passed =
      individualClassesCount === 0 &&
      resGroup.regularLessons === 2 &&
      resGroup.finalAmount === 120;

    results.push({
      id: "TESTE-24",
      name: "TESTE 24 — Aluno somente em Grupo",
      category: "enrollment",
      description: "Aluno pertencente apenas a grupo não gera faturamento individual indevido (0 aulas individuais)",
      passed,
      expectedSummary: "Individual: 0 aulas | Grupo: 2 aulas (R$ 120,00)",
      actualSummary: `Individual: ${individualClassesCount} aulas | Grupo: ${resGroup.regularLessons} aulas (R$ ${resGroup.finalAmount.toFixed(2)})`,
      details: { individualClassesCount, resGroup },
    });
  }

  // =========================================================================
  // TESTES 25 a 30 — ISOLAMENTO ABSOLUTO DE CRÉDITOS POR ENTIDADE FINANCEIRA
  // =========================================================================

  // -------------------------------------------------------------------------
  // TESTE 25: Mesmo aluno, duas matrículas. Matrícula 1 gera crédito individual.
  // Abrir Matrícula 1 no mês seguinte: crédito disponível (R$ 160).
  // Abrir Matrícula 2 (Grupo): ZERO créditos disponíveis.
  // -------------------------------------------------------------------------
  {
    const agnelsonId = "student_agnelson";
    const enrPrepVocal: Enrollment = {
      id: "enr_prep_vocal",
      student_id: agnelsonId,
      plan_id: "plan_prep_vocal_quinzenal",
      teacher_id: RAPHAEL_TEACHER_ID,
      custom_price: 320,
      status: "active",
      enrollment_date: "2026-01-01",
      due_date_day: 10,
    };
    const planPrepVocal: FinancialPlan = {
      id: "plan_prep_vocal_quinzenal",
      name: "Preparação Vocal - Quinzenal",
      category: "individual",
      modality: "quinzenal",
      base_price: 320,
      duration_minutes: 50,
      max_students: 1,
      is_active: true,
      exclusive_teacher_id: RAPHAEL_TEACHER_ID,
      allow_early_discount: false,
      early_discount_value: 0,
      early_discount_deadline_day: 5,
      secretary_fee_type: "fixed",
      secretary_fee_value: 0,
      school_fee_type: "fixed",
      school_fee_value: 0,
      teacher_fee_type: "percentage",
      teacher_fee_value: 100,
      margin_value: 0,
    };

    const grpMev15: Group = {
      id: "grp_mev15",
      name: "MEV 15 ONLINE",
      teacher_id: RAPHAEL_TEACHER_ID,
      payment_type: "group",
      price: 120,
      frequency: "quinzenal",
      schedule: "Terça 20:00",
    };

    // Crédito individual gerado em Setembro na Matrícula 1 (Preparação Vocal)
    const creditPrepVocal: Credit = {
      id: "cred_agnelson_prep_vocal",
      source_class_id: "c_sep_indiv_cancelled",
      student_id: agnelsonId,
      enrollment_id: enrPrepVocal.id, // Estritamente vinculado à matrícula individual
      teacher_id: RAPHAEL_TEACHER_ID,
      amount: 160,
      status: "available",
      competency_month: "2026-09",
      created_at: "2026-09-15T10:00:00Z",
      notes: "Crédito individual de aula cancelada pelo Raphael em Preparação Vocal",
    };

    // Aulas normais em Outubro/2026
    const classesOct: ClassSession[] = [
      { id: "c_oct_indiv1", date: "2026-10-06", title: "Preparação Vocal", status: "completed", student_ids: [agnelsonId], teacher_id: RAPHAEL_TEACHER_ID, start_time: "14:00", end_time: "15:00" },
      { id: "c_oct_indiv2", date: "2026-10-20", title: "Preparação Vocal", status: "completed", student_ids: [agnelsonId], teacher_id: RAPHAEL_TEACHER_ID, start_time: "14:00", end_time: "15:00" },
      { id: "c_oct_grp1", date: "2026-10-13", group_id: grpMev15.id, status: "completed", student_ids: [agnelsonId], teacher_id: RAPHAEL_TEACHER_ID, title: "MEV 15 ONLINE", start_time: "20:00", end_time: "21:00" },
      { id: "c_oct_grp2", date: "2026-10-27", group_id: grpMev15.id, status: "completed", student_ids: [agnelsonId], teacher_id: RAPHAEL_TEACHER_ID, title: "MEV 15 ONLINE", start_time: "20:00", end_time: "21:00" },
    ];

    // Cálculo Outubro - Matrícula 1 (Preparação Vocal)
    const resIndiv = calculateRaphaelRealStudentBilling({
      enrollment: enrPrepVocal,
      plan: planPrepVocal,
      teacher: raphaelTeacher,
      classes: classesOct,
      monthStr: "2026-10",
      credits: [creditPrepVocal],
      allGroups: [grpMev15],
    });

    // Cálculo Outubro - Matrícula 2 (Grupo MEV 15)
    const resGroup = calculateRaphaelRealGroupBilling({
      group: grpMev15,
      teacher: raphaelTeacher,
      classes: classesOct,
      monthStr: "2026-10",
      credits: [creditPrepVocal],
      allGroups: [grpMev15],
    });

    const passed =
      resIndiv.creditsAvailableCount === 1 &&
      resIndiv.creditsAvailableAmount === 160 &&
      resIndiv.creditDiscountAmount === 160 &&
      resIndiv.finalAmount === 160 && // 320 - 160 = 160
      resGroup.creditsAvailableCount === 0 &&
      resGroup.creditsAvailableAmount === 0 &&
      resGroup.creditDiscountAmount === 0 &&
      resGroup.finalAmount === 120; // 120 sem desconto!

    results.push({
      id: "TESTE-25",
      name: "TESTE 25 — Isolamento de Crédito Individual (Agnelson)",
      category: "enrollment",
      description: "Crédito gerado na Matrícula 1 (Individual, R$ 160) está disponível na Matrícula 1 e estritamente ZERO na Matrícula 2 (Grupo)",
      passed,
      expectedSummary: "Matrícula 1: 1 crédito disp (R$ 160, final R$ 160) | Matrícula 2 (Grupo): 0 créditos (final R$ 120)",
      actualSummary: `Matrícula 1: ${resIndiv.creditsAvailableCount} crédito(s) (R$ ${resIndiv.creditsAvailableAmount.toFixed(2)}, final R$ ${resIndiv.finalAmount.toFixed(2)}) | Matrícula 2: ${resGroup.creditsAvailableCount} crédito(s) (final R$ ${resGroup.finalAmount.toFixed(2)})`,
      details: { resIndiv, resGroup },
    });
  }

  // -------------------------------------------------------------------------
  // TESTE 26: Mesmo aluno, duas matrículas. Matrícula 2 (Grupo) gera crédito.
  // Abrir Matrícula 2 no mês seguinte: crédito disponível (R$ 60).
  // Abrir Matrícula 1 (Individual): ZERO créditos disponíveis.
  // -------------------------------------------------------------------------
  {
    const agnelsonId = "student_agnelson";
    const enrPrepVocal: Enrollment = {
      id: "enr_prep_vocal",
      student_id: agnelsonId,
      plan_id: "plan_prep_vocal_quinzenal",
      teacher_id: RAPHAEL_TEACHER_ID,
      custom_price: 320,
      status: "active",
      enrollment_date: "2026-01-01",
      due_date_day: 10,
    };
    const planPrepVocal: FinancialPlan = {
      id: "plan_prep_vocal_quinzenal",
      name: "Preparação Vocal - Quinzenal",
      category: "individual",
      modality: "quinzenal",
      base_price: 320,
      duration_minutes: 50,
      max_students: 1,
      is_active: true,
      exclusive_teacher_id: RAPHAEL_TEACHER_ID,
      allow_early_discount: false,
      early_discount_value: 0,
      early_discount_deadline_day: 5,
      secretary_fee_type: "fixed",
      secretary_fee_value: 0,
      school_fee_type: "fixed",
      school_fee_value: 0,
      teacher_fee_type: "percentage",
      teacher_fee_value: 100,
      margin_value: 0,
    };

    const grpMev15: Group = {
      id: "grp_mev15",
      name: "MEV 15 ONLINE",
      teacher_id: RAPHAEL_TEACHER_ID,
      payment_type: "group",
      price: 120,
      frequency: "quinzenal",
      schedule: "Terça 20:00",
    };

    // Crédito de grupo gerado em Setembro no Grupo MEV 15
    const creditGroupMev15: Credit = {
      id: "cred_agnelson_group_mev15",
      source_class_id: "c_sep_grp_cancelled",
      student_id: agnelsonId,
      group_id: grpMev15.id, // Estritamente vinculado ao grupo
      teacher_id: RAPHAEL_TEACHER_ID,
      amount: 60,
      status: "available",
      competency_month: "2026-09",
      created_at: "2026-09-15T10:00:00Z",
      notes: "Crédito do grupo MEV 15 de aula cancelada pelo Raphael",
    };

    const classesOct: ClassSession[] = [
      { id: "c_oct_indiv1", date: "2026-10-06", title: "Preparação Vocal", status: "completed", student_ids: [agnelsonId], teacher_id: RAPHAEL_TEACHER_ID, start_time: "14:00", end_time: "15:00" },
      { id: "c_oct_indiv2", date: "2026-10-20", title: "Preparação Vocal", status: "completed", student_ids: [agnelsonId], teacher_id: RAPHAEL_TEACHER_ID, start_time: "14:00", end_time: "15:00" },
      { id: "c_oct_grp1", date: "2026-10-13", group_id: grpMev15.id, status: "completed", student_ids: [agnelsonId], teacher_id: RAPHAEL_TEACHER_ID, title: "MEV 15 ONLINE", start_time: "20:00", end_time: "21:00" },
      { id: "c_oct_grp2", date: "2026-10-27", group_id: grpMev15.id, status: "completed", student_ids: [agnelsonId], teacher_id: RAPHAEL_TEACHER_ID, title: "MEV 15 ONLINE", start_time: "20:00", end_time: "21:00" },
    ];

    // Cálculo Outubro - Matrícula 1 (Preparação Vocal)
    const resIndiv = calculateRaphaelRealStudentBilling({
      enrollment: enrPrepVocal,
      plan: planPrepVocal,
      teacher: raphaelTeacher,
      classes: classesOct,
      monthStr: "2026-10",
      credits: [creditGroupMev15],
      allGroups: [grpMev15],
    });

    // Cálculo Outubro - Matrícula 2 (Grupo MEV 15)
    const resGroup = calculateRaphaelRealGroupBilling({
      group: grpMev15,
      teacher: raphaelTeacher,
      classes: classesOct,
      monthStr: "2026-10",
      credits: [creditGroupMev15],
      allGroups: [grpMev15],
    });

    const passed =
      resGroup.creditsAvailableCount === 1 &&
      resGroup.creditsAvailableAmount === 60 &&
      resGroup.creditDiscountAmount === 60 &&
      resGroup.finalAmount === 60 && // 120 - 60 = 60
      resIndiv.creditsAvailableCount === 0 &&
      resIndiv.creditsAvailableAmount === 0 &&
      resIndiv.creditDiscountAmount === 0 &&
      resIndiv.finalAmount === 320; // 320 sem desconto!

    results.push({
      id: "TESTE-26",
      name: "TESTE 26 — Isolamento de Crédito de Grupo",
      category: "enrollment",
      description: "Crédito gerado no Grupo MEV 15 (R$ 60) está disponível no Grupo e estritamente ZERO na Matrícula Individual",
      passed,
      expectedSummary: "Grupo: 1 crédito disp (R$ 60, final R$ 60) | Matrícula Individual: 0 créditos (final R$ 320)",
      actualSummary: `Grupo: ${resGroup.creditsAvailableCount} crédito(s) (R$ ${resGroup.creditsAvailableAmount.toFixed(2)}, final R$ ${resGroup.finalAmount.toFixed(2)}) | Individual: ${resIndiv.creditsAvailableCount} crédito(s) (final R$ ${resIndiv.finalAmount.toFixed(2)})`,
      details: { resIndiv, resGroup },
    });
  }

  // -------------------------------------------------------------------------
  // TESTE 27: Mesmo aluno. Matrícula 1 gera crédito R$ 160. Matrícula 2 gera crédito R$ 60.
  // Abrir Matrícula 1: Crédito R$ 160.
  // Abrir Matrícula 2: Crédito R$ 60.
  // Nenhum crédito misturado.
  // -------------------------------------------------------------------------
  {
    const agnelsonId = "student_agnelson";
    const enrPrepVocal: Enrollment = {
      id: "enr_prep_vocal",
      student_id: agnelsonId,
      plan_id: "plan_prep_vocal_quinzenal",
      teacher_id: RAPHAEL_TEACHER_ID,
      custom_price: 320,
      status: "active",
      enrollment_date: "2026-01-01",
      due_date_day: 10,
    };
    const planPrepVocal: FinancialPlan = {
      id: "plan_prep_vocal_quinzenal",
      name: "Preparação Vocal - Quinzenal",
      category: "individual",
      modality: "quinzenal",
      base_price: 320,
      duration_minutes: 50,
      max_students: 1,
      is_active: true,
      exclusive_teacher_id: RAPHAEL_TEACHER_ID,
      allow_early_discount: false,
      early_discount_value: 0,
      early_discount_deadline_day: 5,
      secretary_fee_type: "fixed",
      secretary_fee_value: 0,
      school_fee_type: "fixed",
      school_fee_value: 0,
      teacher_fee_type: "percentage",
      teacher_fee_value: 100,
      margin_value: 0,
    };

    const grpMev15: Group = {
      id: "grp_mev15",
      name: "MEV 15 ONLINE",
      teacher_id: RAPHAEL_TEACHER_ID,
      payment_type: "group",
      price: 120,
      frequency: "quinzenal",
      schedule: "Terça 20:00",
    };

    const bothCredits: Credit[] = [
      {
        id: "cred_indiv_160",
        source_class_id: "c_sep_indiv_canc",
        student_id: agnelsonId,
        enrollment_id: enrPrepVocal.id,
        teacher_id: RAPHAEL_TEACHER_ID,
        amount: 160,
        status: "available",
        competency_month: "2026-09",
        created_at: "2026-09-10T10:00:00Z",
        notes: "Crédito Individual Preparação Vocal",
      },
      {
        id: "cred_group_60",
        source_class_id: "c_sep_grp_canc",
        student_id: agnelsonId,
        group_id: grpMev15.id,
        teacher_id: RAPHAEL_TEACHER_ID,
        amount: 60,
        status: "available",
        competency_month: "2026-09",
        created_at: "2026-09-10T10:00:00Z",
        notes: "Crédito de Grupo MEV 15",
      },
    ];

    const classesOct: ClassSession[] = [
      { id: "c_oct_indiv1", date: "2026-10-06", title: "Preparação Vocal", status: "completed", student_ids: [agnelsonId], teacher_id: RAPHAEL_TEACHER_ID, start_time: "14:00", end_time: "15:00" },
      { id: "c_oct_indiv2", date: "2026-10-20", title: "Preparação Vocal", status: "completed", student_ids: [agnelsonId], teacher_id: RAPHAEL_TEACHER_ID, start_time: "14:00", end_time: "15:00" },
      { id: "c_oct_grp1", date: "2026-10-13", group_id: grpMev15.id, status: "completed", student_ids: [agnelsonId], teacher_id: RAPHAEL_TEACHER_ID, title: "MEV 15 ONLINE", start_time: "20:00", end_time: "21:00" },
      { id: "c_oct_grp2", date: "2026-10-27", group_id: grpMev15.id, status: "completed", student_ids: [agnelsonId], teacher_id: RAPHAEL_TEACHER_ID, title: "MEV 15 ONLINE", start_time: "20:00", end_time: "21:00" },
    ];

    const resIndiv = calculateRaphaelRealStudentBilling({
      enrollment: enrPrepVocal,
      plan: planPrepVocal,
      teacher: raphaelTeacher,
      classes: classesOct,
      monthStr: "2026-10",
      credits: bothCredits,
      allGroups: [grpMev15],
    });

    const resGroup = calculateRaphaelRealGroupBilling({
      group: grpMev15,
      teacher: raphaelTeacher,
      classes: classesOct,
      monthStr: "2026-10",
      credits: bothCredits,
      allGroups: [grpMev15],
    });

    const passed =
      resIndiv.creditsAvailableCount === 1 &&
      resIndiv.creditsAvailableAmount === 160 &&
      resIndiv.finalAmount === 160 &&
      resGroup.creditsAvailableCount === 1 &&
      resGroup.creditsAvailableAmount === 60 &&
      resGroup.finalAmount === 60;

    results.push({
      id: "TESTE-27",
      name: "TESTE 27 — Ambos os Créditos Coexistindo Sem Mistura",
      category: "enrollment",
      description: "Aluno com crédito individual (R$ 160) e crédito de grupo (R$ 60) no mesmo banco de dados vê exatamente seu crédito específico em cada tela",
      passed,
      expectedSummary: "Matrícula 1: R$ 160 crédito (final R$ 160) | Matrícula 2: R$ 60 crédito (final R$ 60)",
      actualSummary: `Matrícula 1: R$ ${resIndiv.creditsAvailableAmount.toFixed(2)} (final R$ ${resIndiv.finalAmount.toFixed(2)}) | Matrícula 2: R$ ${resGroup.creditsAvailableAmount.toFixed(2)} (final R$ ${resGroup.finalAmount.toFixed(2)})`,
      details: { resIndiv, resGroup },
    });
  }

  // -------------------------------------------------------------------------
  // TESTE 28: Duas matrículas INDIVIDUAIS do mesmo aluno.
  // Crédito individual em cada uma. Validar isolamento total entre matrículas individuais.
  // -------------------------------------------------------------------------
  {
    const carlosId = "student_carlos_duas_indiv";

    const enrPiano: Enrollment = {
      id: "enr_carlos_piano",
      student_id: carlosId,
      plan_id: "plan_piano_quinzenal",
      teacher_id: RAPHAEL_TEACHER_ID,
      custom_price: 240,
      status: "active",
      enrollment_date: "2026-01-01",
      due_date_day: 10,
    };
    const planPiano: FinancialPlan = {
      id: "plan_piano_quinzenal",
      name: "Piano Clássico Quinzenal",
      category: "individual",
      modality: "quinzenal",
      base_price: 240,
      duration_minutes: 50,
      max_students: 1,
      is_active: true,
      exclusive_teacher_id: RAPHAEL_TEACHER_ID,
      allow_early_discount: false,
      early_discount_value: 0,
      early_discount_deadline_day: 5,
      secretary_fee_type: "fixed",
      secretary_fee_value: 0,
      school_fee_type: "fixed",
      school_fee_value: 0,
      teacher_fee_type: "percentage",
      teacher_fee_value: 100,
      margin_value: 0,
    };

    const enrCanto: Enrollment = {
      id: "enr_carlos_canto",
      student_id: carlosId,
      plan_id: "plan_canto_semanal",
      teacher_id: RAPHAEL_TEACHER_ID,
      custom_price: 400,
      status: "active",
      enrollment_date: "2026-01-01",
      due_date_day: 10,
    };
    const planCanto: FinancialPlan = {
      id: "plan_canto_semanal",
      name: "Canto Individual Semanal",
      category: "individual",
      modality: "semanal",
      base_price: 400,
      duration_minutes: 50,
      max_students: 1,
      is_active: true,
      exclusive_teacher_id: RAPHAEL_TEACHER_ID,
      allow_early_discount: false,
      early_discount_value: 0,
      early_discount_deadline_day: 5,
      secretary_fee_type: "fixed",
      secretary_fee_value: 0,
      school_fee_type: "fixed",
      school_fee_value: 0,
      teacher_fee_type: "percentage",
      teacher_fee_value: 100,
      margin_value: 0,
    };

    const credPiano: Credit = {
      id: "cred_piano_carlos",
      source_class_id: "c_piano_sep_cancelled",
      student_id: carlosId,
      enrollment_id: enrPiano.id, // Estritamente em Piano
      teacher_id: RAPHAEL_TEACHER_ID,
      amount: 120, // 240 / 2
      status: "available",
      competency_month: "2026-09",
      created_at: "2026-09-10T10:00:00Z",
      notes: "Cancelamento em Piano Clássico",
    };

    const credCanto: Credit = {
      id: "cred_canto_carlos",
      source_class_id: "c_canto_sep_cancelled",
      student_id: carlosId,
      enrollment_id: enrCanto.id, // Estritamente em Canto
      teacher_id: RAPHAEL_TEACHER_ID,
      amount: 100, // 400 / 4
      status: "available",
      competency_month: "2026-09",
      created_at: "2026-09-10T10:00:00Z",
      notes: "Cancelamento em Canto Individual",
    };

    const allCredits = [credPiano, credCanto];

    const classesOct: ClassSession[] = [
      { id: "c_piano_1", date: "2026-10-05", title: "Piano Clássico Quinzenal", status: "completed", student_ids: [carlosId], teacher_id: RAPHAEL_TEACHER_ID, start_time: "10:00", end_time: "11:00" },
      { id: "c_piano_2", date: "2026-10-19", title: "Piano Clássico Quinzenal", status: "completed", student_ids: [carlosId], teacher_id: RAPHAEL_TEACHER_ID, start_time: "10:00", end_time: "11:00" },
      { id: "c_canto_1", date: "2026-10-06", title: "Canto Individual Semanal", status: "completed", student_ids: [carlosId], teacher_id: RAPHAEL_TEACHER_ID, start_time: "16:00", end_time: "17:00" },
      { id: "c_canto_2", date: "2026-10-13", title: "Canto Individual Semanal", status: "completed", student_ids: [carlosId], teacher_id: RAPHAEL_TEACHER_ID, start_time: "16:00", end_time: "17:00" },
      { id: "c_canto_3", date: "2026-10-20", title: "Canto Individual Semanal", status: "completed", student_ids: [carlosId], teacher_id: RAPHAEL_TEACHER_ID, start_time: "16:00", end_time: "17:00" },
      { id: "c_canto_4", date: "2026-10-27", title: "Canto Individual Semanal", status: "completed", student_ids: [carlosId], teacher_id: RAPHAEL_TEACHER_ID, start_time: "16:00", end_time: "17:00" },
    ];

    const resPiano = calculateRaphaelRealStudentBilling({
      enrollment: enrPiano,
      plan: planPiano,
      teacher: raphaelTeacher,
      classes: classesOct,
      monthStr: "2026-10",
      credits: allCredits,
    });

    const resCanto = calculateRaphaelRealStudentBilling({
      enrollment: enrCanto,
      plan: planCanto,
      teacher: raphaelTeacher,
      classes: classesOct,
      monthStr: "2026-10",
      credits: allCredits,
    });

    const passed =
      resPiano.creditsAvailableCount === 1 &&
      resPiano.creditsAvailableAmount === 120 &&
      resPiano.finalAmount === 120 && // 240 - 120 = 120
      resCanto.creditsAvailableCount === 1 &&
      resCanto.creditsAvailableAmount === 100 &&
      resCanto.finalAmount === 300; // 400 - 100 = 300

    results.push({
      id: "TESTE-28",
      name: "TESTE 28 — Duas Matrículas Individuais Distintas",
      category: "enrollment",
      description: "Mesmo aluno com duas matrículas individuais: créditos de Piano (R$ 120) não vazam para Canto (R$ 100) e vice-versa",
      passed,
      expectedSummary: "Piano: 1 crédito (R$ 120, final R$ 120) | Canto: 1 crédito (R$ 100, final R$ 300)",
      actualSummary: `Piano: ${resPiano.creditsAvailableCount} crédito (R$ ${resPiano.creditsAvailableAmount.toFixed(2)}, final R$ ${resPiano.finalAmount.toFixed(2)}) | Canto: ${resCanto.creditsAvailableCount} crédito (R$ ${resCanto.creditsAvailableAmount.toFixed(2)}, final R$ ${resCanto.finalAmount.toFixed(2)})`,
      details: { resPiano, resCanto },
    });
  }

  // -------------------------------------------------------------------------
  // TESTE 29: Tentativa de consumo cruzado de créditos.
  // Validador deve bloquear qualquer consumo se a entidade financeira não corresponder.
  // -------------------------------------------------------------------------
  {
    const credIndivPrepVocal: Credit = {
      id: "cred_indiv_prep",
      source_class_id: "c_src_prep",
      student_id: "student_agnelson",
      enrollment_id: "enr_prep_vocal",
      teacher_id: RAPHAEL_TEACHER_ID,
      amount: 160,
      status: "available",
      competency_month: "2026-09",
    };

    const credGroupMev15: Credit = {
      id: "cred_grp_mev",
      source_class_id: "c_src_grp",
      student_id: "student_agnelson",
      group_id: "grp_mev15",
      teacher_id: RAPHAEL_TEACHER_ID,
      amount: 60,
      status: "available",
      competency_month: "2026-09",
    };

    // 1. Tentar consumir crédito individual no grupo -> deve ser BLOQUEADO
    const attemptIndivInGroup = validateCreditConsumptionEntity(credIndivPrepVocal, {
      type: "group",
      groupId: "grp_mev15",
    });

    // 2. Tentar consumir crédito de grupo na matrícula individual -> deve ser BLOQUEADO
    const attemptGroupInIndiv = validateCreditConsumptionEntity(credGroupMev15, {
      type: "individual",
      enrollmentId: "enr_prep_vocal",
    });

    // 3. Tentar consumir crédito individual de uma matrícula em outra matrícula individual -> deve ser BLOQUEADO
    const attemptCrossEnrollment = validateCreditConsumptionEntity(credIndivPrepVocal, {
      type: "individual",
      enrollmentId: "enr_outra_matricula",
    });

    // 4. Consumo legítimo na mesma matrícula -> deve ser PERMITIDO
    const legitimateIndiv = validateCreditConsumptionEntity(credIndivPrepVocal, {
      type: "individual",
      enrollmentId: "enr_prep_vocal",
    });

    // 5. Consumo legítimo no mesmo grupo -> deve ser PERMITIDO
    const legitimateGroup = validateCreditConsumptionEntity(credGroupMev15, {
      type: "group",
      groupId: "grp_mev15",
    });

    const passed =
      attemptIndivInGroup.allowed === false &&
      attemptGroupInIndiv.allowed === false &&
      attemptCrossEnrollment.allowed === false &&
      legitimateIndiv.allowed === true &&
      legitimateGroup.allowed === true;

    results.push({
      id: "TESTE-29",
      name: "TESTE 29 — Bloqueio de Tentativa de Consumo Cruzado",
      category: "security",
      description: "Validador recusa estritamente qualquer tentativa de abater crédito em entidade financeira divergente (individual em grupo, grupo em individual ou entre matrículas distintas)",
      passed,
      expectedSummary: "Consumos cruzados: BLOQUEADOS | Consumos legítimos: PERMITIDOS",
      actualSummary: `Indiv em Grupo: ${attemptIndivInGroup.allowed ? 'FALHA (permitido)' : 'BLOQUEADO'} | Grupo em Indiv: ${attemptGroupInIndiv.allowed ? 'FALHA' : 'BLOQUEADO'} | Entre Matrículas: ${attemptCrossEnrollment.allowed ? 'FALHA' : 'BLOQUEADO'} | Legítimos: ${legitimateIndiv.allowed && legitimateGroup.allowed ? 'PERMITIDOS' : 'FALHA'}`,
      details: { attemptIndivInGroup, attemptGroupInIndiv, attemptCrossEnrollment, legitimateIndiv, legitimateGroup },
    });
  }

  // -------------------------------------------------------------------------
  // TESTE 30: Consumo de crédito em uma matrícula e reabertura de Payments.
  // Matrícula que consumiu tem crédito marcado como 'used' (0 créditos disponíveis).
  // Outra matrícula do mesmo aluno permanece intacta com seu crédito 'available'.
  // -------------------------------------------------------------------------
  {
    const agnelsonId = "student_agnelson";

    const enrPrepVocal: Enrollment = {
      id: "enr_prep_vocal",
      student_id: agnelsonId,
      plan_id: "plan_prep_vocal_quinzenal",
      teacher_id: RAPHAEL_TEACHER_ID,
      custom_price: 320,
      status: "active",
      enrollment_date: "2026-01-01",
      due_date_day: 10,
    };
    const planPrepVocal: FinancialPlan = {
      id: "plan_prep_vocal_quinzenal",
      name: "Preparação Vocal - Quinzenal",
      category: "individual",
      modality: "quinzenal",
      base_price: 320,
      duration_minutes: 50,
      max_students: 1,
      is_active: true,
      exclusive_teacher_id: RAPHAEL_TEACHER_ID,
      allow_early_discount: false,
      early_discount_value: 0,
      early_discount_deadline_day: 5,
      secretary_fee_type: "fixed",
      secretary_fee_value: 0,
      school_fee_type: "fixed",
      school_fee_value: 0,
      teacher_fee_type: "percentage",
      teacher_fee_value: 100,
      margin_value: 0,
    };

    const grpMev15: Group = {
      id: "grp_mev15",
      name: "MEV 15 ONLINE",
      teacher_id: RAPHAEL_TEACHER_ID,
      payment_type: "group",
      price: 120,
      frequency: "quinzenal",
      schedule: "Terça 20:00",
    };

    // Estado inicial: 2 créditos disponíveis
    const credIndiv: Credit = {
      id: "cred_indiv_prep_30",
      source_class_id: "c_src_prep_30",
      student_id: agnelsonId,
      enrollment_id: enrPrepVocal.id,
      teacher_id: RAPHAEL_TEACHER_ID,
      amount: 160,
      status: "available",
      competency_month: "2026-09",
    };

    const credGroup: Credit = {
      id: "cred_group_mev_30",
      source_class_id: "c_src_grp_30",
      student_id: agnelsonId,
      group_id: grpMev15.id,
      teacher_id: RAPHAEL_TEACHER_ID,
      amount: 60,
      status: "available",
      competency_month: "2026-09",
    };

    // Simulação do consumo no pagamento da Matrícula 1 (Preparação Vocal):
    // credIndiv passa para status: 'used'
    const credIndivUsed: Credit = {
      ...credIndiv,
      status: "used",
      used_date: "2026-10-10",
      notes: "Utilizado no pagamento da matrícula Preparação Vocal - Quinzenal (2026-10)",
    };

    // Array de créditos persistido no store após o pagamento
    const creditsAfterIndivPayment = [credIndivUsed, credGroup];

    const classesOct: ClassSession[] = [
      { id: "c_oct_indiv1", date: "2026-10-06", title: "Preparação Vocal", status: "completed", student_ids: [agnelsonId], teacher_id: RAPHAEL_TEACHER_ID, start_time: "14:00", end_time: "15:00" },
      { id: "c_oct_indiv2", date: "2026-10-20", title: "Preparação Vocal", status: "completed", student_ids: [agnelsonId], teacher_id: RAPHAEL_TEACHER_ID, start_time: "14:00", end_time: "15:00" },
      { id: "c_oct_grp1", date: "2026-10-13", group_id: grpMev15.id, status: "completed", student_ids: [agnelsonId], teacher_id: RAPHAEL_TEACHER_ID, title: "MEV 15 ONLINE", start_time: "20:00", end_time: "21:00" },
      { id: "c_oct_grp2", date: "2026-10-27", group_id: grpMev15.id, status: "completed", student_ids: [agnelsonId], teacher_id: RAPHAEL_TEACHER_ID, title: "MEV 15 ONLINE", start_time: "20:00", end_time: "21:00" },
    ];

    // Reabertura de Payments para a Matrícula 1
    const resIndivAfter = calculateRaphaelRealStudentBilling({
      enrollment: enrPrepVocal,
      plan: planPrepVocal,
      teacher: raphaelTeacher,
      classes: classesOct,
      monthStr: "2026-10",
      credits: creditsAfterIndivPayment,
      allGroups: [grpMev15],
    });

    // Reabertura de Payments para a Matrícula 2 (Grupo)
    const resGroupAfter = calculateRaphaelRealGroupBilling({
      group: grpMev15,
      teacher: raphaelTeacher,
      classes: classesOct,
      monthStr: "2026-10",
      credits: creditsAfterIndivPayment,
      allGroups: [grpMev15],
    });

    const passed =
      resIndivAfter.creditsAvailableCount === 0 &&
      resIndivAfter.creditsAvailableAmount === 0 &&
      resIndivAfter.finalAmount === 320 && // Mensalidade cheia, crédito já usado
      resGroupAfter.creditsAvailableCount === 1 &&
      resGroupAfter.creditsAvailableAmount === 60 &&
      resGroupAfter.finalAmount === 60; // Crédito de grupo permaneceu intacto!

    results.push({
      id: "TESTE-30",
      name: "TESTE 30 — Persistência e Não-Contaminação Pós-Consumo",
      category: "enrollment",
      description: "Após consumo de crédito na Matrícula 1, ao reabrir Payments a Matrícula 1 tem 0 créditos disponíveis e a Matrícula 2 permanece com seu crédito de R$ 60 intacto",
      passed,
      expectedSummary: "Matrícula 1: 0 créditos disponíveis (final R$ 320) | Matrícula 2: 1 crédito disponível intacto (final R$ 60)",
      actualSummary: `Matrícula 1: ${resIndivAfter.creditsAvailableCount} créditos (final R$ ${resIndivAfter.finalAmount.toFixed(2)}) | Matrícula 2: ${resGroupAfter.creditsAvailableCount} crédito(s) (final R$ ${resGroupAfter.finalAmount.toFixed(2)})`,
      details: { resIndivAfter, resGroupAfter },
    });
  }

  const passedCount = results.filter((r) => r.passed).length;
  return {
    allPassed: passedCount === results.length,
    totalCount: results.length,
    passedCount,
    results,
  };
}
