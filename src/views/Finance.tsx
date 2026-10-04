import React, { useState, useMemo } from "react";
import { useAppStore, parseAttendance } from "../store";
import { isEnrollmentActiveForMonth, isEnrollmentFinanciallyRelevantForMonth } from "../utils/dateUtils";
import { resolveCompetenceBilling, ResolveBillingContext } from "../utils/competenceBillingResolver";
import * as XLSX from "xlsx";
import {
  TrendingUp,
  TrendingDown,
  Users,
  GraduationCap,
  Wallet,
  Building2,
  ChevronDown,
  ChevronUp,
  Printer,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Music,
  BookOpen,
  FileText,
  Check,
  X,
  Pencil,
  DollarSign,
  FileSpreadsheet,
  Download
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export const Finance: React.FC = () => {
  const { state, updateTransaction, addTransaction } = useAppStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'teachers' | 'secretary'>('overview');
  const [reportType, setReportType] = useState<'projected' | 'actual'>('projected');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    const yr = d.getFullYear();
    const mo = d.getMonth() + 1;
    if (yr < 2026 || (yr === 2026 && mo < 9)) return 9;
    return mo;
  });
  const [selectedYear, setSelectedYear] = useState(() => {
    const d = new Date();
    const yr = d.getFullYear();
    return yr < 2026 ? 2026 : yr;
  });
  const [expandedTeachers, setExpandedTeachers] = useState<Record<string, boolean>>({});

  // Filters for student payment report tab
  const [studentSearchTerm, setStudentSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'both' | 'enrollment_only' | 'choir_only' | 'group_only'>('all');
  const [studentStatusFilter, setStudentStatusFilter] = useState<'all' | 'paid' | 'pending'>('all');

  const resolveContext: ResolveBillingContext = useMemo(() => ({
    competenceBillings: state.competenceBillings,
    transactions: state.transactions,
    enrollments: state.enrollments,
    financialPlans: state.financialPlans,
    discountRules: state.discountRules,
    groups: state.groups,
    choirRegistrations: state.choirRegistrations,
    teachers: state.teachers,
    students: state.students,
    classes: state.classes,
    credits: state.credits,
  }), [
    state.competenceBillings,
    state.transactions,
    state.enrollments,
    state.financialPlans,
    state.discountRules,
    state.groups,
    state.choirRegistrations,
    state.teachers,
    state.students,
    state.classes,
    state.credits,
  ]);

  // Correction Modal state
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<{
    studentName: string;
    category: string;
    description: string;
    currentPrice: number;
    transactionId?: string;
    transactionDate?: string;
    defaultDescription: string;
  } | null>(null);
  const [correctedValueInput, setCorrectedValueInput] = useState<string>('');
  const [correctedDateInput, setCorrectedDateInput] = useState<string>('');
  const [correctionSuccessMsg, setCorrectionSuccessMsg] = useState<string>('');

  const handleOpenCorrection = (studentName: string, item: any) => {
    setCorrectionTarget({
      studentName,
      category: item.category,
      description: item.description,
      currentPrice: item.finalPrice,
      transactionId: item.transactionId,
      transactionDate: item.transactionDate,
      defaultDescription: item.defaultDescription
    });
    setCorrectedValueInput(item.finalPrice.toString());
    setCorrectedDateInput(item.transactionDate || new Date().toISOString().split('T')[0]);
    setIsCorrectionModalOpen(true);
  };

  const handleSaveCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionTarget) return;

    const parsedVal = parseFloat(correctedValueInput);
    if (isNaN(parsedVal) || parsedVal < 0) return;

    if (correctionTarget.transactionId) {
      updateTransaction(correctionTarget.transactionId, {
        amount: parsedVal,
        date: correctedDateInput,
        status: 'completed'
      });
    } else {
      addTransaction({
        type: 'income',
        amount: parsedVal,
        description: correctionTarget.defaultDescription,
        date: correctedDateInput,
        status: 'completed'
      });
    }

    setCorrectionSuccessMsg(`Valor pago de "${correctionTarget.description}" (${correctionTarget.studentName}) corrigido para ${formatCurrency(parsedVal)}!`);
    setIsCorrectionModalOpen(false);
    setCorrectionTarget(null);

    setTimeout(() => {
      setCorrectionSuccessMsg('');
    }, 4000);
  };

  const handlePrint = () => {
    try {
      window.focus();
      setTimeout(() => {
        window.print();
      }, 100);
    } catch (e) {
      console.error("Print error:", e);
      window.print();
    }
  };

  const handleExportExcel = () => {
    const monthStr = selectedMonth.toString().padStart(2, '0');
    const periodLabel = reportType === 'actual' ? `${monthStr}_${selectedYear}` : 'Projetado';
    const fileName = `Dashboard_Financeiro_${periodLabel}.xlsx`;

    const wb = XLSX.utils.book_new();

    // 1. Visão Geral
    const overviewRows = [
      ["DASHBOARD FINANCEIRO"],
      ["Tipo de Relatório", reportType === 'projected' ? 'Projetado' : 'Realizado'],
      ["Período / Data", reportType === 'actual' ? `${monthStr}/${selectedYear}` : new Date().toLocaleDateString('pt-BR')],
      [],
      ["INDICADOR", "VALOR (R$)"],
      ["Receita Bruta (Alunos)", financials.totalRevenue],
      ["Repasses (Professores)", financials.totalTeacherPayout],
      ["Repasses (Secretária)", financials.totalSecretaryPayout],
      ["Lucro Líquido (Escola)", Math.max(0, financials.totalRevenue - financials.totalTeacherPayout - financials.totalSecretaryPayout)],
      [],
      ["RESUMO DE MATRÍCULAS"],
      ["Matrículas Ativas em Planos", state.enrollments.filter(e => {
        if (e.status !== 'active') return false;
        const s = state.students.find(st => st.id === e.student_id);
        return s && s.status === 'active' && !s.not_eligible;
      }).length],
      ["Inscrições no Coral", state.choirRegistrations.filter(r => {
        if (r.status !== 'approved') return false;
        const s = state.students.find(st => st.id === r.student_id);
        return s && s.status === 'active' && !s.not_eligible;
      }).length]
    ];
    const wsOverview = XLSX.utils.aoa_to_sheet(overviewRows);
    XLSX.utils.book_append_sheet(wb, wsOverview, "Visão Geral");

    // 2. Relatório por Aluno e Grupos
    const studentRows: any[] = [];
    filteredStudentReports.forEach((s) => {
      s.items.forEach((item) => {
        studentRows.push({
          "Tipo": s.isGroup ? "Grupo" : "Aluno",
          "Nome Aluno / Grupo": s.studentName,
          "Contato": s.studentPhone || "",
          "Categoria": item.category,
          "Descrição do Item": item.description,
          "Valor Bruto (R$)": item.basePrice,
          "Desconto (R$)": item.discount,
          "Valor Final (R$)": item.finalPrice,
          "Status": item.statusLabel,
          "Data do Pagamento": item.transactionDate ? new Date(item.transactionDate).toLocaleDateString('pt-BR') : ""
        });
      });
    });
    if (studentRows.length > 0) {
      const wsStudents = XLSX.utils.json_to_sheet(studentRows);
      XLSX.utils.book_append_sheet(wb, wsStudents, "Alunos e Grupos");
    }

    // 3. Extrato Professores
    const teacherRows: any[] = [];
    Object.entries(financials.teacherPayouts).forEach(([teacherId, amount]) => {
      const teacher = state.teachers.find(t => t.id === teacherId);
      const teacherName = teacher?.name || 'Professor Desconhecido';
      const breakdown = financials.teacherBreakdowns[teacherId] || [];
      breakdown.forEach((item) => {
        teacherRows.push({
          "Professor": teacherName,
          "Aluno": item.studentName,
          "Plano / Curso": item.planName,
          "Valor Aluno (R$)": item.totalPrice,
          "Repasse Professor (R$)": item.teacherShare,
          "Status": item.status
        });
      });
    });
    if (teacherRows.length > 0) {
      const wsTeachers = XLSX.utils.json_to_sheet(teacherRows);
      XLSX.utils.book_append_sheet(wb, wsTeachers, "Extrato Professores");
    }

    // 4. Extrato Secretária
    const secretaryRows = financials.secretaryBreakdown
      .filter(item => item.secretaryShare > 0 && item.totalPrice > 0)
      .map(item => ({
        "Aluno": item.studentName,
        "Plano / Curso": item.planName,
        "Valor Aluno (R$)": item.totalPrice,
        "Taxa Secretária (R$)": item.secretaryShare,
        "Status": item.status
      }));
    if (secretaryRows.length > 0) {
      const wsSecretary = XLSX.utils.json_to_sheet(secretaryRows);
      XLSX.utils.book_append_sheet(wb, wsSecretary, "Extrato Secretária");
    }

    XLSX.writeFile(wb, fileName);
  };

  const handleExportCSV = () => {
    const monthStr = selectedMonth.toString().padStart(2, '0');
    const periodLabel = reportType === 'actual' ? `${monthStr}_${selectedYear}` : 'Projetado';
    const fileName = `Dashboard_Financeiro_${periodLabel}.csv`;

    const headers = ["Tipo", "Nome", "Contato", "Categoria", "Item/Curso", "Valor Bruto (R$)", "Desconto (R$)", "Valor Final (R$)", "Status"];
    const rows: string[][] = [headers];

    filteredStudentReports.forEach((s) => {
      s.items.forEach((item) => {
        rows.push([
          s.isGroup ? "Grupo" : "Aluno",
          `"${s.studentName.replace(/"/g, '""')}"`,
          `"${(s.studentPhone || '').replace(/"/g, '""')}"`,
          `"${item.category}"`,
          `"${item.description.replace(/"/g, '""')}"`,
          item.basePrice.toFixed(2).replace('.', ','),
          item.discount.toFixed(2).replace('.', ','),
          item.finalPrice.toFixed(2).replace('.', ','),
          `"${item.statusLabel}"`
        ]);
      });
    });

    const csvContent = "\uFEFF" + rows.map(r => r.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleTeacher = (id: string) => {
    setExpandedTeachers(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Calculate financials based on active enrollments or actual transactions
  const calculateFinancials = () => {
    let totalRevenue = 0;
    let totalTeacherPayout = 0;
    let totalSecretaryPayout = 0;
    let totalSchoolShare = 0;
    let totalMargin = 0;

    const teacherPayouts: Record<string, number> = {};
    let secretaryPayout = 0;
    const teacherBreakdowns: Record<string, Array<{
      studentName: string,
      planName: string,
      totalPrice: number,
      teacherShare: number,
      status: string
    }>> = {};

    const secretaryBreakdown: Array<{
      studentName: string,
      planName: string,
      totalPrice: number,
      secretaryShare: number,
      status: string
    }> = [];

    const monthStr = selectedMonth.toString().padStart(2, '0');
    const comp = `${selectedYear}-${monthStr}`;

    if (reportType === 'projected') {
      // Process regular enrollments
      const seenProjectedKeys = new Set<string>();
      state.enrollments
        .filter(e => {
          const student = state.students.find(s => s.id === e.student_id);
          if (!student || student.not_eligible) return false;
          if (e.status === 'active' && student.status !== 'inactive') {
            return isEnrollmentActiveForMonth(e, selectedMonth, selectedYear);
          }
          return isEnrollmentFinanciallyRelevantForMonth(e, selectedMonth, selectedYear, {
            competenceBillings: state.competenceBillings,
            transactions: state.transactions,
          });
        })
        .filter(e => {
          const key = `${e.student_id}_${e.plan_id}`;
          if (seenProjectedKeys.has(key)) return false;
          seenProjectedKeys.add(key);
          return true;
        })
        .forEach(enrollment => {
          // If enrollment belongs to a group with payment_type === 'group', skip individual student billing (handled at group level)
          if (enrollment.group_id) {
            const parentGroup = state.groups.find(g => g.id === enrollment.group_id);
            if (parentGroup && parentGroup.payment_type === 'group') {
              return;
            }
          }

          const plan = state.financialPlans.find(p => p.id === enrollment.plan_id);
          if (!plan) return;

          const resolved = resolveCompetenceBilling({
            category: 'individual',
            sourceId: enrollment.id,
            competence: comp,
            context: resolveContext,
          });

          const finalPrice = resolved.finalPrice;
          const teacherShare = resolved.teacherShare;
          const secShare = resolved.secShare;
          const finalSchoolShare = resolved.schoolShare;
          const margin = plan.margin_value;

          totalRevenue += finalPrice;
          totalTeacherPayout += teacherShare;
          totalSecretaryPayout += secShare;
          totalSchoolShare += finalSchoolShare;
          totalMargin += margin;

          // Aggregate teacher payouts
          if (finalPrice > 0) {
            const effectiveTeacherId = plan.exclusive_teacher_id || enrollment.teacher_id;
            if (effectiveTeacherId) {
              teacherPayouts[effectiveTeacherId] = (teacherPayouts[effectiveTeacherId] || 0) + teacherShare;
              
              if (!teacherBreakdowns[effectiveTeacherId]) {
                teacherBreakdowns[effectiveTeacherId] = [];
              }
              const student = state.students.find(s => s.id === enrollment.student_id);
              teacherBreakdowns[effectiveTeacherId].push({
                studentName: student?.name || 'Desconhecido',
                planName: plan.name,
                totalPrice: finalPrice,
                teacherShare: teacherShare,
                status: resolved.isPaid ? 'Pago' : (resolved.isFrozen ? 'Congelado' : 'Ativo (Projetado)')
              });
            }
            
            secretaryPayout += secShare;

            if (secShare > 0) {
              const student = state.students.find(s => s.id === enrollment.student_id);
              secretaryBreakdown.push({
                studentName: student?.name || 'Desconhecido',
                planName: plan.name,
                totalPrice: finalPrice,
                secretaryShare: secShare,
                status: resolved.isPaid ? 'Pago' : (resolved.isFrozen ? 'Congelado' : 'Ativo (Projetado)')
              });
            }
          }
        });

      // Process groups with group-level billing
      state.groups.forEach(group => {
        if ((group.payment_type === 'group' || (group.price && group.price > 0))) {
          const resolvedGroup = resolveCompetenceBilling({
            category: 'group',
            sourceId: group.id,
            competence: comp,
            context: resolveContext,
          });

          if (resolvedGroup.finalPrice > 0 || (group.price && group.price > 0)) {
            const groupPrice = resolvedGroup.finalPrice;
            totalRevenue += groupPrice;
            totalSchoolShare += resolvedGroup.schoolShare;
            totalTeacherPayout += resolvedGroup.teacherShare;
            totalSecretaryPayout += resolvedGroup.secShare;
            totalMargin += resolvedGroup.schoolShare;

            if (group.teacher_id) {
              if (!teacherBreakdowns[group.teacher_id]) {
                teacherBreakdowns[group.teacher_id] = [];
              }
              teacherBreakdowns[group.teacher_id].push({
                studentName: `Grupo: ${group.name}`,
                planName: 'Cobrança em Grupo',
                totalPrice: groupPrice,
                teacherShare: resolvedGroup.teacherShare,
                status: resolvedGroup.isPaid ? 'Pago (Grupo)' : (resolvedGroup.isFrozen ? 'Congelado (Grupo)' : 'Projetado (Grupo)')
              });
            }
          }
        }
      });

      // Process choir registrations and collaborators
      const approvedChoirRegs = state.choirRegistrations.filter(r => {
        const student = state.students.find(s => s.id === r.student_id);
        if (!student || student.not_eligible) return false;
        if (r.status === 'approved' && student.status !== 'inactive') return true;
        return isEnrollmentFinanciallyRelevantForMonth(
          { id: r.id, start_date: r.created_at || r.date, status: r.status },
          selectedMonth,
          selectedYear,
          { competenceBillings: state.competenceBillings, transactions: state.transactions }
        );
      });
      const choirRevenueTotal = approvedChoirRegs.reduce((sum, r) => {
        const resolvedChoir = resolveCompetenceBilling({
          category: 'choir',
          sourceId: r.id,
          competence: comp,
          context: resolveContext,
        });
        return sum + (resolvedChoir.isPaying ? resolvedChoir.finalPrice : 0);
      }, 0);
      const approvedChoirStudentsCount = approvedChoirRegs.length;

      let choirCollaboratorPayoutsTotal = 0;
      // Filtrar estritamente ensaios da competência selecionada
      const rehearsals = (state.choirRehearsals || []).filter(
        r => r.date && r.date.startsWith(comp)
      );
      const totalRehearsalsCount = rehearsals.length;

      (state.choirCollaborators || []).forEach(collab => {
        // Regra Canônica: colaborador inativo (active === false OU teacher.status === 'inactive')
        // só recebe repasse se tiver presença comprovada em ensaio do mês selecionado
        const linkedTeacher = collab.teacher_id ? state.teachers.find(t => t.id === collab.teacher_id) : undefined;
        const isInactive = collab.active === false || (linkedTeacher && linkedTeacher.status === 'inactive');

        const presentRehearsals = rehearsals.filter(r => {
          const attList = parseAttendance(r.attendance);
          const rec = attList.find(a => a.person_id === collab.id && a.type === 'collaborator');
          return rec?.status === 'present';
        });
        const presentCount = presentRehearsals.length;

        if (isInactive && presentCount === 0) {
          return;
        }

        let payout = 0;
        if (collab.remuneration_type === 'per_rehearsal') {
          payout = presentCount * (collab.remuneration_value || 0);
        } else if (collab.remuneration_type === 'fixed') {
          if (totalRehearsalsCount > 0) {
            payout = (collab.remuneration_value || 0) * (presentCount / totalRehearsalsCount);
          } else {
            payout = collab.remuneration_value || 0;
          }
        } else if (collab.remuneration_type === 'percentage') {
          const basePayout = (choirRevenueTotal * (collab.remuneration_value || 0)) / 100;
          payout = totalRehearsalsCount > 0 ? basePayout * (presentCount / totalRehearsalsCount) : basePayout;
        } else if (collab.remuneration_type === 'per_student') {
          if (totalRehearsalsCount > 0) {
            let totalStudentPresents = 0;
            presentRehearsals.forEach(r => {
              const attList = parseAttendance(r.attendance);
              const studentPresentsInRehearsal = attList.filter(
                a => a.type === 'singer' && a.status === 'present'
              ).length;
              totalStudentPresents += studentPresentsInRehearsal;
            });
            payout = totalStudentPresents * (collab.remuneration_value || 0);
          } else {
            payout = approvedChoirStudentsCount * (collab.remuneration_value || 0);
          }
        }

        choirCollaboratorPayoutsTotal += payout;

        if (collab.teacher_id && payout > 0) {
          teacherPayouts[collab.teacher_id] = (teacherPayouts[collab.teacher_id] || 0) + payout;
          if (!teacherBreakdowns[collab.teacher_id]) {
            teacherBreakdowns[collab.teacher_id] = [];
          }
          teacherBreakdowns[collab.teacher_id].push({
            studentName: 'Coral (Colaborador)',
            planName: `Coral - ${collab.role}`,
            totalPrice: choirRevenueTotal,
            teacherShare: payout,
            status: 'Projetado (Coral)'
          });
        }
      });

      totalRevenue += choirRevenueTotal;
      totalTeacherPayout += choirCollaboratorPayoutsTotal;
      const choirNetSchool = choirRevenueTotal - choirCollaboratorPayoutsTotal;
      totalSchoolShare += choirNetSchool;
      totalMargin += choirNetSchool;
    } else {
      // Process actual transactions for the selected month/year
      const targetPattern = `${monthStr}/${selectedYear}`;
      const processedEnrollmentPayments = new Set<string>();
      
      state.transactions.filter(t => t.type === 'income' && t.status === 'completed' && t.description.includes(targetPattern)).forEach(t => {
        // Try to find if it's an enrollment payment
        const match = t.description.match(/Mensalidade \| (.*?) \|/);
        if (match && match[1]) {
          const enrollmentId = match[1].trim();
          const enrollment = state.enrollments.find(e => e.id === enrollmentId);
          const studentId = enrollment?.student_id;
          const planId = enrollment?.plan_id;

          const dedupeKey = studentId && planId 
            ? `${studentId}_${planId}_${targetPattern}`
            : `${enrollmentId}_${targetPattern}`;

          if (processedEnrollmentPayments.has(dedupeKey)) {
            return; // Prevent duplicate counting of payment for the same student + plan + month
          }
          processedEnrollmentPayments.add(dedupeKey);

          totalRevenue += t.amount;

          if (enrollment) {
            const plan = state.financialPlans.find(p => p.id === enrollment.plan_id);
            if (plan) {
              const resolved = resolveCompetenceBilling({
                category: 'individual',
                sourceId: enrollment.id,
                competence: comp,
                context: resolveContext,
              });

              const teacherShare = resolved.teacherShare;
              const secShare = resolved.secShare;
              
              totalTeacherPayout += teacherShare;
              totalSecretaryPayout += secShare;
              
              // The rest goes to the school
              const remaining = t.amount - teacherShare - secShare;
              totalSchoolShare += remaining;
              totalMargin += remaining; // Simplification for actuals
              
              if (t.amount > 0) {
                const effectiveTeacherId = plan.exclusive_teacher_id || enrollment.teacher_id;
                if (effectiveTeacherId) {
                  const student = state.students.find(s => s.id === enrollment.student_id);
                  const studentName = student?.name || 'Desconhecido';
                  const planName = plan.name;
                  const status = 'Pago (Confirmado)';

                  if (!teacherBreakdowns[effectiveTeacherId]) {
                    teacherBreakdowns[effectiveTeacherId] = [];
                  }

                  const exists = teacherBreakdowns[effectiveTeacherId].some(
                    b => b.studentName === studentName && b.planName === planName && b.status === status
                  );

                  if (!exists) {
                    teacherPayouts[effectiveTeacherId] = (teacherPayouts[effectiveTeacherId] || 0) + teacherShare;
                    teacherBreakdowns[effectiveTeacherId].push({
                      studentName,
                      planName,
                      totalPrice: t.amount,
                      teacherShare,
                      status
                    });
                  }
                }
                secretaryPayout += secShare;

                if (secShare > 0) {
                  const student = state.students.find(s => s.id === enrollment.student_id);
                  const studentName = student?.name || 'Desconhecido';
                  const planName = plan.name;
                  const status = 'Pago (Confirmado)';

                  const secExists = secretaryBreakdown.some(
                    sb => sb.studentName === studentName && sb.planName === planName && sb.status === status
                  );

                  if (!secExists) {
                    secretaryBreakdown.push({
                      studentName,
                      planName,
                      totalPrice: t.amount,
                      secretaryShare: secShare,
                      status
                    });
                  }
                }
              }
            }
          }
        } else {
          // Generic income
          totalRevenue += t.amount;
          totalSchoolShare += t.amount;
          totalMargin += t.amount;
        }
      });
    }

    return {
      totalRevenue,
      totalTeacherPayout,
      totalSecretaryPayout,
      totalSchoolShare,
      totalMargin,
      teacherPayouts,
      secretaryPayout,
      teacherBreakdowns,
      secretaryBreakdown
    };
  };

  const financials = calculateFinancials();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Consolidate student and group financial report data (including regular enrollments, choir registrations, and groups)
  const studentReports = useMemo(() => {
    const monthStr = selectedMonth.toString().padStart(2, '0');
    const comp = `${selectedYear}-${monthStr}`;
    const targetPattern = `${monthStr}/${selectedYear}`;

    const list: Array<{
      studentId: string;
      studentName: string;
      studentPhone?: string;
      studentEmail?: string;
      items: Array<{
        category: 'Matrícula' | 'Coral' | 'Grupo';
        description: string;
        basePrice: number;
        discount: number;
        finalPrice: number;
        teacherShare: number;
        secShare: number;
        schoolShare: number;
        isPaid: boolean;
        statusLabel: string;
        transactionId?: string;
        transactionDate?: string;
        defaultDescription: string;
        isFrozen?: boolean;
        isHistorical?: boolean;
      }>;
      totalBasePrice: number;
      totalDiscount: number;
      totalFinalPrice: number;
      totalTeacherShare: number;
      totalSecShare: number;
      totalSchoolShare: number;
      isPaidFully: boolean;
      hasChoir: boolean;
      hasEnrollment: boolean;
      hasGroup?: boolean;
      isGroup?: boolean;
    }> = [];

    // 1. Individual Students
    state.students.forEach(student => {
      if (student.not_eligible) return;
      const seenPlanIds = new Set<string>();
      const activeEnrollments = state.enrollments.filter(
        e => {
          if (e.student_id !== student.id) return false;
          if (e.status === 'active' && student.status !== 'inactive') {
            return isEnrollmentActiveForMonth(e, selectedMonth, selectedYear);
          }
          return isEnrollmentFinanciallyRelevantForMonth(e, selectedMonth, selectedYear, {
            competenceBillings: state.competenceBillings,
            transactions: state.transactions,
          });
        }
      ).filter(e => {
        if (seenPlanIds.has(e.plan_id)) return false;
        seenPlanIds.add(e.plan_id);
        return true;
      });

      const choirReg = state.choirRegistrations.find(
        r => {
          if (r.student_id !== student.id) return false;
          if (r.status === 'approved' && student.status !== 'inactive') return true;
          return isEnrollmentFinanciallyRelevantForMonth(
            { id: r.id, start_date: r.created_at || r.date, status: r.status },
            selectedMonth,
            selectedYear,
            { competenceBillings: state.competenceBillings, transactions: state.transactions }
          );
        }
      );

      const studentTransactions = state.transactions.filter(t => 
        t.type === 'income' && 
        t.status === 'completed' && 
        t.description.includes(targetPattern) &&
        t.description.toLowerCase().includes(student.name.toLowerCase())
      );

      if (activeEnrollments.length === 0 && !choirReg && studentTransactions.length === 0) {
        return;
      }

      const items: Array<{
        category: 'Matrícula' | 'Coral' | 'Grupo';
        description: string;
        basePrice: number;
        discount: number;
        finalPrice: number;
        teacherShare: number;
        secShare: number;
        schoolShare: number;
        isPaid: boolean;
        statusLabel: string;
        transactionId?: string;
        transactionDate?: string;
        defaultDescription: string;
        isFrozen?: boolean;
        isHistorical?: boolean;
      }> = [];

      let hasEnrollment = false;
      let hasChoir = false;

      // Regular active enrollments
      activeEnrollments.forEach(e => {
        // If enrollment belongs to a group with payment_type === 'group', skip individual student billing (handled at group level)
        if (e.group_id) {
          const parentGroup = state.groups.find(g => g.id === e.group_id);
          if (parentGroup && parentGroup.payment_type === 'group') {
            return;
          }
        }

        const plan = state.financialPlans.find(p => p.id === e.plan_id);
        if (!plan) return;
        hasEnrollment = true;

        const resolved = resolveCompetenceBilling({
          category: 'individual',
          sourceId: e.id,
          competence: comp,
          context: resolveContext,
        });

        const isPaid = resolved.isPaid;
        const statusLabel = isPaid 
          ? 'Pago (Confirmado)' 
          : (reportType === 'actual' ? 'Pendente de Pagamento' : 'Projetado (Pendente)');

        let planDescription = plan.name;
        if (e.group_id) {
          const groupObj = state.groups.find(g => g.id === e.group_id);
          if (groupObj) {
            planDescription += ` (Grupo: ${groupObj.name})`;
          }
        }

        items.push({
          category: 'Matrícula',
          description: planDescription,
          basePrice: resolved.basePrice,
          discount: resolved.discount,
          finalPrice: resolved.finalPrice,
          teacherShare: resolved.teacherShare,
          secShare: resolved.secShare,
          schoolShare: resolved.schoolShare,
          isPaid,
          statusLabel,
          transactionId: resolved.transaction?.id,
          transactionDate: resolved.transaction?.date,
          defaultDescription: resolved.transaction?.description || `Mensalidade | ${e.id} | ${monthStr}/${selectedYear} | ${student.name} - ${plan.name}`,
          isFrozen: resolved.isFrozen,
          isHistorical: resolved.isHistorical,
        });
      });

      // Choir Registration
      if (choirReg) {
        hasChoir = true;
        const voiceType = state.choirVoiceTypes.find(v => v.id === choirReg.voice_type_id);
        const resolved = resolveCompetenceBilling({
          category: 'choir',
          sourceId: choirReg.id,
          competence: comp,
          context: resolveContext,
        });

        const isPaid = resolved.isPaid;
        const statusLabel = isPaid 
          ? 'Pago (Confirmado)' 
          : (reportType === 'actual' ? 'Pendente de Pagamento' : 'Projetado (Pendente)');

        items.push({
          category: 'Coral',
          description: `Coral (${voiceType ? voiceType.name : 'Naipe Vocal'})`,
          basePrice: resolved.basePrice,
          discount: resolved.discount,
          finalPrice: resolved.finalPrice,
          teacherShare: 0,
          secShare: 0,
          schoolShare: resolved.schoolShare,
          isPaid,
          statusLabel,
          transactionId: resolved.transaction?.id,
          transactionDate: resolved.transaction?.date,
          defaultDescription: resolved.transaction?.description || `Mensalidade Coral | ${choirReg.id} | ${monthStr}/${selectedYear} | ${student.name}`,
          isFrozen: resolved.isFrozen,
          isHistorical: resolved.isHistorical,
        });
      }

      // Filter out items with R$ 0,00 value and unpaid items when in 'actual' report mode
      const validItems = items.filter(item => {
        if (item.finalPrice <= 0) return false;
        if (reportType === 'actual' && !item.isPaid) return false;
        return true;
      });

      if (validItems.length > 0) {
        const totalBasePrice = validItems.reduce((sum, item) => sum + item.basePrice, 0);
        const totalDiscount = validItems.reduce((sum, item) => sum + item.discount, 0);
        const totalFinalPrice = validItems.reduce((sum, item) => sum + item.finalPrice, 0);
        const totalTeacherShare = validItems.reduce((sum, item) => sum + item.teacherShare, 0);
        const totalSecShare = validItems.reduce((sum, item) => sum + item.secShare, 0);
        const totalSchoolShare = validItems.reduce((sum, item) => sum + item.schoolShare, 0);
        const isPaidFully = validItems.every(item => item.isPaid);

        const hasChoirInValid = validItems.some(i => i.category === 'Coral');
        const hasEnrollmentInValid = validItems.some(i => i.category === 'Matrícula');

        list.push({
          studentId: student.id,
          studentName: student.name,
          studentPhone: student.phone,
          studentEmail: student.email,
          items: validItems,
          totalBasePrice,
          totalDiscount,
          totalFinalPrice,
          totalTeacherShare,
          totalSecShare,
          totalSchoolShare,
          isPaidFully,
          hasChoir: hasChoirInValid,
          hasEnrollment: hasEnrollmentInValid,
          hasGroup: false,
          isGroup: false
        });
      }
    });

    // 2. Groups (e.g. DUPLA SERGIO E RAFAELA, CASA DE ORAÇÃO PRUDENTE, ADONAI)
    state.groups.forEach(group => {
      const resolved = resolveCompetenceBilling({
        category: 'group',
        sourceId: group.id,
        competence: comp,
        context: resolveContext,
      });

      // Only include if group has price, or group payment mode, or paid transaction
      if (resolved.finalPrice <= 0 && group.payment_type !== 'group' && !resolved.isPaid) {
        return;
      }

      const isPaid = resolved.isPaid;
      const statusLabel = isPaid 
        ? 'Pago (Confirmado)' 
        : (reportType === 'actual' ? 'Pendente de Pagamento' : 'Projetado (Pendente)');

      const items: Array<{
        category: 'Matrícula' | 'Coral' | 'Grupo';
        description: string;
        basePrice: number;
        discount: number;
        finalPrice: number;
        teacherShare: number;
        secShare: number;
        schoolShare: number;
        isPaid: boolean;
        statusLabel: string;
        transactionId?: string;
        transactionDate?: string;
        defaultDescription: string;
        isFrozen?: boolean;
        isHistorical?: boolean;
      }> = [{
        category: 'Grupo',
        description: `Mensalidade de Grupo (${group.name})`,
        basePrice: resolved.basePrice,
        discount: resolved.discount,
        finalPrice: resolved.finalPrice,
        teacherShare: resolved.teacherShare,
        secShare: resolved.secShare,
        schoolShare: resolved.schoolShare,
        isPaid,
        statusLabel,
        transactionId: resolved.transaction?.id,
        transactionDate: resolved.transaction?.date,
        defaultDescription: resolved.transaction?.description || `Mensalidade Grupo | ${group.id} | ${monthStr}/${selectedYear} | ${group.name}`,
        isFrozen: resolved.isFrozen,
        isHistorical: resolved.isHistorical,
      }];

      const validItems = items.filter(item => {
        if (item.finalPrice <= 0) return false;
        if (reportType === 'actual' && !item.isPaid) return false;
        return true;
      });

      if (validItems.length > 0) {
        const teacher = state.teachers.find(t => t.id === group.teacher_id);
        list.push({
          studentId: `group_${group.id}`,
          studentName: group.name,
          studentPhone: teacher ? `Prof. ${teacher.name}` : 'Cobrança em Grupo',
          studentEmail: '',
          items: validItems,
          totalBasePrice: resolved.basePrice,
          totalDiscount: resolved.discount,
          totalFinalPrice: resolved.finalPrice,
          totalTeacherShare: resolved.teacherShare,
          totalSecShare: resolved.secShare,
          totalSchoolShare: resolved.schoolShare,
          isPaidFully: isPaid,
          hasChoir: false,
          hasEnrollment: false,
          hasGroup: true,
          isGroup: true
        });
      }
    });

    return list.sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [state.students, state.groups, state.teachers, state.enrollments, state.choirRegistrations, state.financialPlans, state.discountRules, state.transactions, state.choirVoiceTypes, state.competenceBillings, resolveContext, selectedMonth, selectedYear, reportType]);

  const filteredStudentReports = useMemo(() => {
    return studentReports.map(student => {
      let items = student.items;
      if (categoryFilter === 'enrollment_only') {
        items = student.items.filter(i => i.category === 'Matrícula');
      } else if (categoryFilter === 'choir_only') {
        items = student.items.filter(i => i.category === 'Coral');
      } else if (categoryFilter === 'group_only') {
        items = student.items.filter(i => i.category === 'Grupo');
      }

      if (items.length === 0) return null;

      const totalBasePrice = items.reduce((sum, item) => sum + item.basePrice, 0);
      const totalDiscount = items.reduce((sum, item) => sum + item.discount, 0);
      const totalFinalPrice = items.reduce((sum, item) => sum + item.finalPrice, 0);
      const totalTeacherShare = items.reduce((sum, item) => sum + item.teacherShare, 0);
      const totalSecShare = items.reduce((sum, item) => sum + item.secShare, 0);
      const totalSchoolShare = items.reduce((sum, item) => sum + item.schoolShare, 0);
      const isPaidFully = items.every(item => item.isPaid);

      return {
        ...student,
        items,
        totalBasePrice,
        totalDiscount,
        totalFinalPrice,
        totalTeacherShare,
        totalSecShare,
        totalSchoolShare,
        isPaidFully
      };
    }).filter((student): student is NonNullable<typeof student> => {
      if (!student) return false;

      if (studentSearchTerm.trim()) {
        const query = studentSearchTerm.toLowerCase();
        const matchesName = student.studentName.toLowerCase().includes(query);
        const matchesPhone = (student.studentPhone || '').includes(query);
        if (!matchesName && !matchesPhone) return false;
      }

      if (categoryFilter === 'both' && (!student.hasChoir || (!student.hasEnrollment && !student.hasGroup))) return false;

      if (studentStatusFilter === 'paid' && !student.isPaidFully) return false;
      if (studentStatusFilter === 'pending' && student.isPaidFully) return false;

      return true;
    });
  }, [studentReports, studentSearchTerm, categoryFilter, studentStatusFilter]);

  const printStats = useMemo(() => {
    let totalBase = 0;
    let totalDiscount = 0;
    let grandTotal = 0;
    let enrollmentTotal = 0;
    let choirTotal = 0;
    let groupTotal = 0;

    filteredStudentReports.forEach(s => {
      totalBase += s.totalBasePrice;
      totalDiscount += s.totalDiscount;
      grandTotal += s.totalFinalPrice;

      s.items.forEach(item => {
        if (item.category === 'Matrícula') enrollmentTotal += item.finalPrice;
        if (item.category === 'Coral') choirTotal += item.finalPrice;
        if (item.category === 'Grupo') groupTotal += item.finalPrice;
      });
    });

    return {
      totalBase,
      totalDiscount,
      grandTotal,
      enrollmentTotal,
      choirTotal,
      groupTotal
    };
  }, [filteredStudentReports]);

  return (
    <>
      {/* IMPRESSÃO LAYOUT (OCULTO NA TELA, VISÍVEL NO PRINT) */}
      <div className="hidden print:block p-4 space-y-6 bg-white text-zinc-900 font-sans">
        <div className="border-b-2 border-zinc-900 pb-4 flex justify-between items-start">
          <div>
            <h1 className="text-xl font-black uppercase tracking-tight text-zinc-900">
              Escora da Música - Relatório de Valores Pagos por Aluno e Grupos
            </h1>
            <p className="text-xs font-semibold text-zinc-600 mt-1">
              Período de Referência: {new Date(2000, selectedMonth - 1, 1).toLocaleString('pt-BR', { month: 'long' }).toUpperCase()} / {selectedYear} | Modalidade: {reportType === 'projected' ? 'Projeção de Mensalidades (Ativas)' : 'Valores Realizados / Confirmados'}
            </p>
          </div>
          <div className="text-right text-xs text-zinc-500">
            <p className="font-bold text-zinc-800">Relatório Financeiro</p>
            <p>Gerado em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}</p>
          </div>
        </div>

        {/* Resumo Consolidado para Impressão */}
        <div className="grid grid-cols-5 gap-2 text-xs">
          <div className="p-2 border border-zinc-300 rounded-lg bg-zinc-50">
            <p className="text-[9px] uppercase font-bold text-zinc-500">Total Registros</p>
            <p className="text-base font-black text-zinc-900">{filteredStudentReports.length}</p>
            <p className="text-[9px] text-zinc-500">Alunos e Grupos</p>
          </div>
          <div className="p-2 border border-zinc-300 rounded-lg bg-zinc-50">
            <p className="text-[9px] uppercase font-bold text-zinc-500">Receita Cursos</p>
            <p className="text-base font-black text-zinc-900">{formatCurrency(printStats.enrollmentTotal)}</p>
          </div>
          <div className="p-2 border border-zinc-300 rounded-lg bg-zinc-50">
            <p className="text-[9px] uppercase font-bold text-zinc-500">Receita Coral</p>
            <p className="text-base font-black text-indigo-900">{formatCurrency(printStats.choirTotal)}</p>
          </div>
          <div className="p-2 border border-zinc-300 rounded-lg bg-zinc-50">
            <p className="text-[9px] uppercase font-bold text-zinc-500">Receita Grupos</p>
            <p className="text-base font-black text-amber-900">{formatCurrency(printStats.groupTotal)}</p>
          </div>
          <div className="p-2 border border-zinc-300 rounded-lg bg-zinc-50">
            <p className="text-[9px] uppercase font-bold text-zinc-500">Total Geral</p>
            <p className="text-base font-black text-emerald-900">{formatCurrency(printStats.grandTotal)}</p>
          </div>
        </div>

        {/* Tabela Detalhada para Impressão */}
        <div className="border border-zinc-300 rounded-lg overflow-hidden">
          <table className="w-full text-left text-xs divide-y divide-zinc-200">
            <thead className="bg-zinc-100 font-bold uppercase text-[10px] text-zinc-700">
              <tr>
                <th className="p-2 border-r border-zinc-200 w-8">#</th>
                <th className="p-2 border-r border-zinc-200">Aluno / Grupo</th>
                <th className="p-2 border-r border-zinc-200">Cursos, Coral & Grupos</th>
                <th className="p-2 text-right border-r border-zinc-200">Valor Bruto</th>
                <th className="p-2 text-right border-r border-zinc-200">Desconto</th>
                <th className="p-2 text-right border-r border-zinc-200">Valor Final (R$)</th>
                <th className="p-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {filteredStudentReports.map((student, idx) => (
                <tr key={student.studentId} className={idx % 2 === 0 ? 'bg-white' : 'bg-zinc-50/50'}>
                  <td className="p-2 text-zinc-500 font-mono text-[11px] border-r border-zinc-200">{idx + 1}</td>
                  <td className="p-2 font-bold text-zinc-900 border-r border-zinc-200">
                    <div className="flex items-center gap-1">
                      {student.isGroup && <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1 py-0.2 rounded">GRUPO</span>}
                      <span>{student.studentName}</span>
                    </div>
                    {student.studentPhone && <div className="text-[10px] font-normal text-zinc-500">{student.studentPhone}</div>}
                  </td>
                  <td className="p-2 border-r border-zinc-200">
                    <div className="space-y-0.5">
                      {student.items.map((item, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[11px]">
                          <span className={item.category === 'Coral' ? 'font-semibold text-indigo-900' : item.category === 'Grupo' ? 'font-semibold text-amber-900' : 'text-zinc-800'}>
                            {item.category === 'Coral' ? '🎵 ' : item.category === 'Grupo' ? '👥 ' : '📚 '}{item.description}
                          </span>
                          <span className="text-[10px] text-zinc-500">({formatCurrency(item.finalPrice)})</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="p-2 text-right text-zinc-700 font-medium border-r border-zinc-200">
                    {formatCurrency(student.totalBasePrice)}
                  </td>
                  <td className="p-2 text-right text-emerald-700 font-medium border-r border-zinc-200">
                    {student.totalDiscount > 0 ? `-${formatCurrency(student.totalDiscount)}` : 'R$ 0,00'}
                  </td>
                  <td className="p-2 text-right font-bold text-zinc-950 border-r border-zinc-200">
                    {formatCurrency(student.totalFinalPrice)}
                  </td>
                  <td className="p-2 text-center font-medium">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      student.isPaidFully 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' 
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}>
                      {student.isPaidFully ? 'PAGO' : 'PENDENTE'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-zinc-100 font-bold border-t-2 border-zinc-300 text-xs">
              <tr>
                <td colSpan={3} className="p-2.5 text-right uppercase tracking-wider text-zinc-800">
                  Totais do Relatório ({filteredStudentReports.length} registros):
                </td>
                <td className="p-2.5 text-right text-zinc-900 border-r border-zinc-200">
                  {formatCurrency(printStats.totalBase)}
                </td>
                <td className="p-2.5 text-right text-emerald-700 border-r border-zinc-200">
                  -{formatCurrency(printStats.totalDiscount)}
                </td>
                <td className="p-2.5 text-right text-zinc-950 font-black border-r border-zinc-200 text-sm">
                  {formatCurrency(printStats.grandTotal)}
                </td>
                <td className="p-2.5 text-center text-zinc-600">
                  -
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="pt-8 flex justify-between items-end text-xs text-zinc-500">
          <div>
            <p className="font-semibold text-zinc-700">Observações:</p>
            <p className="text-[11px] text-zinc-500 max-w-md">
              Relatório oficial consolidado contendo os valores cobrados de cursos regulares e inscrições de coral por aluno.
            </p>
          </div>
          <div className="text-center">
            <div className="border-t border-zinc-400 w-48 mb-1"></div>
            <p className="font-bold text-zinc-700 text-[11px]">Assinatura / Responsável Financeiro</p>
          </div>
        </div>
      </div>

      {/* TELA PRINCIPAL DO DASHBOARD (OCULTA NO PRINT) */}
      <div className="space-y-6 print:hidden">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
              Dashboard Financeiro
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              {reportType === 'projected' ? 'Projeção mensal baseada nas matrículas e planos ativos.' : 'Relatório baseado nos pagamentos realizados no mês selecionado.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2 bg-emerald-50 border border-emerald-200/80 text-emerald-800 hover:bg-emerald-100/80 text-sm font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2"
              title="Exportar relatórios em planilha Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Exportar Excel</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-blue-50 border border-blue-200/80 text-blue-800 hover:bg-blue-100/80 text-sm font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2"
              title="Exportar relatórios em arquivo CSV (.csv)"
            >
              <Download className="w-4 h-4 text-blue-600" />
              <span>Exportar CSV</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3.5 py-2 bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 text-sm font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-2"
            >
              <Printer className="w-4 h-4 text-zinc-500" />
              <span>Imprimir Relatório</span>
            </button>

            {reportType === 'actual' && (
              <div className="flex gap-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                  className="px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString('pt-BR', { month: 'long' })}</option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                >
                  {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex bg-zinc-100 p-1 rounded-xl">
              <button
                onClick={() => setReportType('projected')}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  reportType === 'projected'
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                Projetado
              </button>
              <button
                onClick={() => setReportType('actual')}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  reportType === 'actual'
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                Realizado
              </button>
            </div>
          </div>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-emerald-100 text-emerald-600">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">Receita Bruta (Alunos)</p>
            <p className="text-2xl font-bold text-zinc-900">
              {formatCurrency(financials.totalRevenue)}
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-indigo-100 text-indigo-600">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">Repasses (Professores)</p>
            <p className="text-2xl font-bold text-zinc-900">
              {formatCurrency(financials.totalTeacherPayout)}
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-amber-100 text-amber-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">Repasses (Secretária)</p>
            <p className="text-2xl font-bold text-zinc-900">
              {formatCurrency(financials.totalSecretaryPayout)}
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">Lucro Líquido (Escola)</p>
            <p className="text-2xl font-bold text-zinc-900">
              {formatCurrency(Math.max(0, financials.totalRevenue - financials.totalTeacherPayout - financials.totalSecretaryPayout))}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="border-b border-zinc-200">
          <nav className="flex -mb-px overflow-x-auto" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 py-4 px-4 text-center border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === 'overview'
                  ? 'border-indigo-500 text-indigo-600 font-bold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              }`}
            >
              Visão Geral
            </button>
            <button
              onClick={() => setActiveTab('students')}
              className={`flex-1 py-4 px-4 text-center border-b-2 font-medium text-sm whitespace-nowrap transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'students'
                  ? 'border-indigo-500 text-indigo-600 font-bold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Relatório por Aluno e Grupos</span>
            </button>
            <button
              onClick={() => setActiveTab('teachers')}
              className={`flex-1 py-4 px-4 text-center border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === 'teachers'
                  ? 'border-indigo-500 text-indigo-600 font-bold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              }`}
            >
              Extrato Professores
            </button>
            <button
              onClick={() => setActiveTab('secretary')}
              className={`flex-1 py-4 px-4 text-center border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === 'secretary'
                  ? 'border-indigo-500 text-indigo-600 font-bold'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              }`}
            >
              Extrato Secretária
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-zinc-900">Resumo de Matrículas Ativas</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                  <p className="text-sm text-zinc-500">Matrículas em Planos</p>
                  <p className="text-2xl font-semibold text-zinc-900">{state.enrollments.filter(e => {
                    if (e.status !== 'active') return false;
                    const s = state.students.find(st => st.id === e.student_id);
                    return s && s.status === 'active' && !s.not_eligible;
                  }).length}</p>
                </div>
                <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                  <p className="text-sm text-zinc-500">Inscrições no Coral</p>
                  <p className="text-2xl font-semibold text-zinc-900">{state.choirRegistrations.filter(r => {
                    if (r.status !== 'approved') return false;
                    const s = state.students.find(st => st.id === r.student_id);
                    return s && s.status === 'active' && !s.not_eligible;
                  }).length}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'students' && (
            <div className="space-y-6">
              {/* Header bar and filters */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
                <div>
                  <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    <span>Relatório de Mensalidades, Coral e Grupos</span>
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1">
                    Visualize e imprima o extrato completo com os valores por aluno e grupo, incluindo matérias/cursos, coral e mensalidades de grupo.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
                  <button
                    onClick={handleExportExcel}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                    title="Exportar em Excel (.xlsx)"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Exportar Excel</span>
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                    title="Exportar em CSV (.csv)"
                  >
                    <Download className="w-4 h-4" />
                    <span>Exportar CSV</span>
                  </button>
                  <button
                    onClick={handlePrint}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Imprimir</span>
                  </button>
                </div>
              </div>

              {/* Filtering Controls */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar aluno ou grupo por nome..."
                    value={studentSearchTerm}
                    onChange={(e) => setStudentSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {studentSearchTerm && (
                    <button
                      onClick={() => setStudentSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-zinc-200 rounded-xl">
                  <Filter className="w-4 h-4 text-zinc-400 shrink-0" />
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value as any)}
                    className="w-full bg-transparent text-sm text-zinc-700 outline-none cursor-pointer"
                  >
                    <option value="all">Todas as Categorias (Curso, Coral e Grupos)</option>
                    <option value="both">Alunos/Grupos com Múltiplas Modalidades</option>
                    <option value="enrollment_only">Apenas Cursos/Planos</option>
                    <option value="choir_only">Apenas Coral</option>
                    <option value="group_only">Apenas Grupos</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-zinc-200 rounded-xl">
                  <select
                    value={studentStatusFilter}
                    onChange={(e) => setStudentStatusFilter(e.target.value as any)}
                    className="w-full bg-transparent text-sm text-zinc-700 outline-none cursor-pointer"
                  >
                    <option value="all">Todos os Status (Pagos e Pendentes)</option>
                    <option value="paid">Somente Pagos (Confirmados)</option>
                    <option value="pending">Somente Pendentes</option>
                  </select>
                </div>
              </div>

              {/* Success Notification Banner */}
              {correctionSuccessMsg && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm font-semibold flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <span>{correctionSuccessMsg}</span>
                  </div>
                  <button onClick={() => setCorrectionSuccessMsg('')} className="text-emerald-600 hover:text-emerald-800">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* KPI Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
                  <p className="text-xs font-medium text-zinc-500">Registros no Relatório</p>
                  <p className="text-2xl font-bold text-zinc-900 mt-1">{filteredStudentReports.length}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
                  <p className="text-xs font-medium text-zinc-500">Total Cursos e Planos</p>
                  <p className="text-2xl font-bold text-zinc-900 mt-1">{formatCurrency(printStats.enrollmentTotal)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
                  <p className="text-xs font-medium text-zinc-500">Total Coral</p>
                  <p className="text-2xl font-bold text-indigo-600 mt-1">{formatCurrency(printStats.choirTotal)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
                  <p className="text-xs font-medium text-zinc-500">Total Grupos</p>
                  <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(printStats.groupTotal)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
                  <p className="text-xs font-medium text-zinc-500">Valor Total Bruto</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(printStats.grandTotal)}</p>
                </div>
              </div>

              {/* Student Report Table */}
              <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-zinc-200 text-sm">
                  <thead className="bg-zinc-50">
                    <tr>
                      <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Aluno / Grupo</th>
                      <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Itens Pagos / Cursos / Coral / Grupos</th>
                      <th scope="col" className="px-6 py-3.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Valor Bruto</th>
                      <th scope="col" className="px-6 py-3.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Descontos</th>
                      <th scope="col" className="px-6 py-3.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Valor Final</th>
                      <th scope="col" className="px-6 py-3.5 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status Geral</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredStudentReports.map((student) => (
                      <tr key={student.studentId} className="hover:bg-zinc-50/60 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-bold text-zinc-900 flex items-center gap-1.5">
                            {student.isGroup && <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded border border-amber-200">GRUPO</span>}
                            <span>{student.studentName}</span>
                          </div>
                          {student.studentPhone && (
                            <div className="text-xs text-zinc-500 mt-0.5">{student.studentPhone}</div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1.5">
                            {student.items.map((item, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-xs flex-wrap">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                  item.category === 'Coral'
                                    ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                    : item.category === 'Grupo'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-blue-100 text-blue-700 border border-blue-200'
                                }`}>
                                  {item.category === 'Coral' ? '🎵 Coral' : item.category === 'Grupo' ? '👥 Grupo' : '📚 Curso'}
                                </span>
                                <span className="font-medium text-zinc-800">{item.description}</span>
                                <span className="text-zinc-500 font-mono">({formatCurrency(item.finalPrice)})</span>
                                {item.isPaid ? (
                                  <span className="text-emerald-600 font-semibold text-[10px] flex items-center gap-0.5">
                                    <CheckCircle2 className="w-3 h-3" /> Pago
                                  </span>
                                ) : (
                                  <span className="text-amber-600 font-medium text-[10px] flex items-center gap-0.5">
                                    <Clock className="w-3 h-3" /> Pendente
                                  </span>
                                )}
                                {item.isFrozen && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                    Congelado
                                  </span>
                                )}
                                {item.isHistorical && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
                                    Histórico
                                  </span>
                                )}
                                <button
                                  onClick={() => handleOpenCorrection(student.studentName, item)}
                                  title="Corrigir valor pago ou projetado"
                                  className="ml-1 text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded text-[11px] font-bold transition-colors flex items-center gap-1 border border-indigo-200/60"
                                >
                                  <Pencil className="w-3 h-3" /> Corrigir
                                </button>
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-zinc-600 font-medium">
                          {formatCurrency(student.totalBasePrice)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-emerald-600 font-medium">
                          {student.totalDiscount > 0 ? `-${formatCurrency(student.totalDiscount)}` : 'R$ 0,00'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-zinc-950 font-bold text-base">
                          {formatCurrency(student.totalFinalPrice)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                            student.isPaidFully
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {student.isPaidFully ? 'Total Pago' : 'Pendente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filteredStudentReports.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-zinc-400">
                          Nenhum registro encontrado para os filtros selecionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'teachers' && (
            <div className="space-y-4">
              <div className="text-sm text-zinc-500 mb-2">
                Selecione um professor para visualizar o extrato detalhado de seus alunos e os respectivos repasses.
              </div>
              <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-2xl overflow-hidden bg-white">
                {Object.entries(financials.teacherPayouts).map(([teacherId, amount]) => {
                  const teacher = state.teachers.find(t => t.id === teacherId);
                  const isExpanded = !!expandedTeachers[teacherId];
                  const breakdown = financials.teacherBreakdowns[teacherId] || [];

                  return (
                    <div key={teacherId} className="transition-colors">
                      <button
                        onClick={() => toggleTeacher(teacherId)}
                        className="w-full flex items-center justify-between p-5 text-left hover:bg-zinc-50 focus:outline-none transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                            <GraduationCap className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-sm font-bold text-zinc-900 block">
                              {teacher?.name || 'Professor Desconhecido'}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {breakdown.length} {breakdown.length === 1 ? 'aluno vinculado' : 'alunos vinculados'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className="text-sm font-bold text-indigo-600">
                            {formatCurrency(amount)}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-zinc-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-zinc-400" />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="bg-zinc-50/50 px-5 pb-5 pt-2 border-t border-zinc-100">
                          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white mt-2">
                            <table className="min-w-full divide-y divide-zinc-200 text-sm">
                              <thead className="bg-zinc-50">
                                <tr>
                                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Aluno</th>
                                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Plano</th>
                                  <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Valor do Aluno</th>
                                  <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Repasse Professor</th>
                                  <th scope="col" className="px-4 py-2.5 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100">
                                {breakdown.map((item, idx) => (
                                  <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap font-medium text-zinc-900">
                                      {item.studentName}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-zinc-600">
                                      {item.planName}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right text-zinc-950 font-medium">
                                      {formatCurrency(item.totalPrice)}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right text-indigo-600 font-semibold">
                                      {formatCurrency(item.teacherShare)}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-center">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                                        item.status.includes('Pago') 
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                          : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                                      }`}>
                                        {item.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                                {breakdown.length === 0 && (
                                  <tr>
                                    <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                                      Nenhuma informação detalhada para este professor.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {Object.keys(financials.teacherPayouts).length === 0 && (
                  <div className="p-8 text-center text-sm text-zinc-500">
                    Nenhum repasse de professor calculado.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'secretary' && (
            <div className="space-y-6">
              <div className="bg-amber-50/60 rounded-2xl p-6 border border-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-amber-100 rounded-xl text-amber-600">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">Extrato Consolidado da Secretária</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {reportType === 'projected' 
                        ? 'Baseado em matrículas ativas projetadas para este mês.' 
                        : 'Baseado em pagamentos reais recebidos no mês selecionado.'}
                    </p>
                  </div>
                </div>
                <div className="text-left md:text-right bg-white px-5 py-3 rounded-xl border border-zinc-150 shadow-sm md:self-stretch flex flex-col justify-center">
                  <span className="text-xs text-zinc-400 font-medium uppercase">Repasse Total do Período</span>
                  <span className="text-2xl font-black text-amber-600">
                    {formatCurrency(financials.secretaryPayout)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-zinc-800">Detalhamento por Aluno e Plano</h4>
                <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead className="bg-zinc-50">
                      <tr>
                        <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Aluno</th>
                        <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Plano</th>
                        <th scope="col" className="px-6 py-3.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Valor do Aluno</th>
                        <th scope="col" className="px-6 py-3.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Taxa Secretária</th>
                        <th scope="col" className="px-6 py-3.5 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {financials.secretaryBreakdown.filter(item => item.secretaryShare > 0 && item.totalPrice > 0).map((item, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap font-medium text-zinc-900">
                            {item.studentName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-zinc-600">
                            {item.planName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-zinc-950 font-medium">
                            {formatCurrency(item.totalPrice)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-amber-600 font-bold">
                            {formatCurrency(item.secretaryShare)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                              item.status.includes('Pago') 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {financials.secretaryBreakdown.filter(item => item.secretaryShare > 0 && item.totalPrice > 0).length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-zinc-400">
                            Nenhum repasse de secretaria encontrado para este período.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Correction Modal */}
      <AnimatePresence>
        {isCorrectionModalOpen && correctionTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-xs"
              onClick={() => setIsCorrectionModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                    <Pencil className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-900">Corrigir Valor Pago</h3>
                    <p className="text-xs text-zinc-500">Ajuste manual do valor registrado no relatório</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsCorrectionModalOpen(false)} 
                  className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-200/50 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveCorrection} className="p-6 space-y-4">
                <div className="bg-indigo-50/60 p-3.5 rounded-xl border border-indigo-100/80 text-xs space-y-1">
                  <div className="text-zinc-600">Aluno / Grupo: <strong className="text-zinc-900 font-bold">{correctionTarget.studentName}</strong></div>
                  <div className="text-zinc-600">Item: <strong className="text-indigo-900 font-semibold">{correctionTarget.description}</strong></div>
                  <div className="text-zinc-600">Valor Atual Registrado: <strong className="text-zinc-900 font-bold">{formatCurrency(correctionTarget.currentPrice)}</strong></div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                    Novo Valor Pago (R$)
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400 text-sm font-semibold">R$</span>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={correctedValueInput}
                      onChange={(e) => setCorrectedValueInput(e.target.value)}
                      className="w-full pl-10 pr-3 py-2.5 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-bold text-base text-zinc-900 bg-white"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1">
                    Data do Pagamento
                  </label>
                  <input
                    type="date"
                    required
                    value={correctedDateInput}
                    onChange={(e) => setCorrectedDateInput(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-zinc-800 bg-white font-medium"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCorrectionModalOpen(false)}
                    className="px-4 py-2 border border-zinc-200 text-xs font-semibold rounded-xl text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    Salvar Correção
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </>
  );
};
