import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store';
import { Search, CheckCircle, Clock, DollarSign, X, Users, Pencil, Check, Sparkles, ChevronDown, ChevronUp, Info, AlertTriangle, Calculator, CreditCard, ShieldCheck, History } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { isEnrollmentActiveForMonth, getMonthsToBill, isEnrollmentFinanciallyRelevantForMonth, hasAnyHistoricalFinancialData } from '../utils/dateUtils';
import {
  calculateRaphaelStudentMonthlySimulation,
  calculateRaphaelGroupMonthlySimulation,
  calculateCumulativePreviousCredits,
  calculateCumulativePreviousCreditsForGroup,
  isRaphaelTeacher,
  RAPHAEL_TEACHER_ID,
  RaphaelBillingSimulationResult,
  RaphaelGroupBillingSimulationResult,
} from '../utils/raphaelBillingSimulation';
import {
  calculateRaphaelRealStudentBilling,
  calculateRaphaelRealGroupBilling,
  getClassesForEnrollment,
  validateCreditConsumptionEntity,
  RaphaelBillingMemory,
} from '../utils/raphaelRealBilling';
import { RaphaelBillingSimulatorModal } from '../components/RaphaelBillingSimulatorModal';
import { RaphaelCreditsModal } from '../components/RaphaelCreditsModal';
import { RaphaelPaymentConfirmationCard } from '../components/RaphaelPaymentConfirmationCard';
import { RaphaelStage5TestsModal } from '../components/RaphaelStage5TestsModal';
import { HistoricalRegularizationModal } from '../components/HistoricalRegularizationModal';
import { resolveCompetenceBilling, ResolveBillingContext } from '../utils/competenceBillingResolver';

export const Payments: React.FC = () => {
  const {
    state,
    addTransaction,
    updateTransaction,
    updateCredit,
    currentUserProfile,
    createCompetenceBilling,
    updateCompetenceBilling,
    freezeCompetenceBilling,
    ensureDueCompetenceBilling,
    ensureDueCompetencesForCycle,
  } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [customDiscounts, setCustomDiscounts] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<'to_pay' | 'paid' | 'all'>('to_pay');
  const [isSimulatorModalOpen, setIsSimulatorModalOpen] = useState(false);
  const [isCreditsModalOpen, setIsCreditsModalOpen] = useState(false);
  const [isStage5TestsModalOpen, setIsStage5TestsModalOpen] = useState(false);
  const [isHistoricalRegularizationModalOpen, setIsHistoricalRegularizationModalOpen] = useState(false);
  const [expandedRaphaelDetails, setExpandedRaphaelDetails] = useState<Record<string, boolean>>({});

  const toggleRaphaelDetails = (itemKey: string) => {
    setExpandedRaphaelDetails(prev => ({
      ...prev,
      [itemKey]: !prev[itemKey]
    }));
  };

  const isTeacherRole = currentUserProfile?.role === "teacher";
  const canManagePayments = !isTeacherRole;

  // Correction Modal State
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<{
    studentName: string;
    itemDescription: string;
    currentAmount: number;
    transactionId?: string;
    transactionDate?: string;
    defaultDescription: string;
  } | null>(null);
  const [correctedAmountInput, setCorrectedAmountInput] = useState('');
  const [correctedDateInput, setCorrectedDateInput] = useState('');

  const openCorrectionModal = (target: {
    studentName: string;
    itemDescription: string;
    currentAmount: number;
    transactionId?: string;
    transactionDate?: string;
    defaultDescription: string;
  }) => {
    setCorrectionTarget(target);
    setCorrectedAmountInput(target.currentAmount.toString());
    setCorrectedDateInput(target.transactionDate || new Date().toISOString().split('T')[0]);
    setIsCorrectionModalOpen(true);
  };

  const handleSaveCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionTarget) return;

    const newAmount = parseFloat(correctedAmountInput);
    if (isNaN(newAmount) || newAmount < 0) return;

    if (correctionTarget.transactionId) {
      updateTransaction(correctionTarget.transactionId, {
        amount: newAmount,
        date: correctedDateInput,
        status: 'completed'
      });
    } else {
      addTransaction({
        type: 'income',
        amount: newAmount,
        description: correctionTarget.defaultDescription,
        date: correctedDateInput,
        status: 'completed'
      });
    }

    setIsCorrectionModalOpen(false);
    setCorrectionTarget(null);
  };

  // Materialização controlada e idempotente de competências devidas para o ciclo em exibição
  useEffect(() => {
    let isCancelled = false;
    const compStr = `${selectedYear}-${selectedMonth.toString().padStart(2, '0')}`;

    if (
      !state.enrollments.length &&
      !state.choirRegistrations.length &&
      !state.groups.length
    ) {
      return;
    }

    const timer = setTimeout(() => {
      if (!isCancelled && ensureDueCompetencesForCycle) {
        ensureDueCompetencesForCycle(compStr).catch((err) => {
          console.warn('[Payments] Aviso na materialização assíncrona do ciclo:', err);
        });
      }
    }, 300);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [
    selectedMonth,
    selectedYear,
    state.enrollments.length,
    state.choirRegistrations.length,
    state.groups.length,
  ]);

  const getStudentBilling = (studentId: string) => {
    const student = state.students.find(s => s.id === studentId);
    if (!student) return null;

    const seenPlanIds = new Set<string>();
    const eligibleEnrollments = state.enrollments.filter(e => {
      if (e.student_id !== studentId) return false;
      if (e.status === 'active') {
        if (!isEnrollmentActiveForMonth(e, selectedMonth, selectedYear)) return false;
      } else {
        const isRelevant = isEnrollmentFinanciallyRelevantForMonth(
          e,
          selectedMonth,
          selectedYear,
          {
            competenceBillings: state.competenceBillings,
            transactions: state.transactions,
          }
        ) || hasAnyHistoricalFinancialData(e.id, 'individual', {
          competenceBillings: state.competenceBillings,
          transactions: state.transactions,
        });
        if (!isRelevant) return false;
      }

      if (seenPlanIds.has(e.plan_id)) return false;
      if (e.group_id) {
        const group = state.groups.find(g => g.id === e.group_id);
        if (group && group.payment_type === 'group') {
          return false; // Skip billing individually for group-level payment
        }
      }
      seenPlanIds.add(e.plan_id);
      return true;
    });

    const rawChoir = state.choirRegistrations.find(r => r.student_id === studentId);
    let relevantChoir: typeof rawChoir = undefined;
    if (rawChoir) {
      if (rawChoir.status === 'approved') {
        relevantChoir = rawChoir;
      } else {
        const isRelevant = hasAnyHistoricalFinancialData(rawChoir.id, 'choir', {
          competenceBillings: state.competenceBillings,
          transactions: state.transactions,
        });
        if (isRelevant) relevantChoir = rawChoir;
      }
    }

    // Build context for centralized billing resolution
    const resolveContext: ResolveBillingContext = {
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
    };

    // Calculate enrollments billing across current and past months
    const enrollmentsBilling: Array<{
      enrollment: any;
      plan: any;
      basePrice: number;
      crossDiscount: number;
      priceWithDiscount: number;
      isPaid: boolean;
      transaction: any;
      monthStr: string;
      yearStr: string;
      refLabel: string;
      isPast: boolean;
      itemKey: string;
      isRaphael: boolean;
      raphaelPreview: RaphaelBillingSimulationResult | null;
      raphaelRealBilling?: RaphaelBillingMemory | null;
      isFrozen?: boolean;
      isHistorical?: boolean;
      statusLabel?: string;
      resolvedSource?: string;
    }> = [];

    eligibleEnrollments.forEach(e => {
      const plan = state.financialPlans.find(p => p.id === e.plan_id);
      if (!plan) return;

      const teacher = state.teachers.find(t => t.id === e.teacher_id);
      const isRaphael = isRaphaelTeacher(e.teacher_id, teacher?.name, plan.exclusive_teacher_id);

      const monthsToBill = getMonthsToBill(e.start_date || e.enrollment_date, selectedMonth, selectedYear, e.end_date);

      monthsToBill.forEach(mRef => {
        const comp = `${mRef.yearStr}-${mRef.monthStr}`;
        const resolved = resolveCompetenceBilling({
          category: 'individual',
          sourceId: e.id,
          competence: comp,
          context: resolveContext,
        });

        const isPaid = resolved.isPaid;
        const transaction = resolved.transaction;

        // Skip past months if already paid
        if (!mRef.isCurrent && isPaid) {
          return;
        }

        // Skip 0.00 price items unless it's a frozen snapshot or already paid
        if (!isPaid && !resolved.isFrozen && resolved.finalPrice <= 0) {
          return;
        }

        let raphaelPreview: RaphaelBillingSimulationResult | null = null;
        let raphaelRealBilling: RaphaelBillingMemory | null = resolved.raphaelBilling || null;

        if (isRaphael && !resolved.raphaelBilling && !resolved.isFrozen && !isPaid) {
          const monthRefStr = `${mRef.yearStr}-${mRef.monthStr}`;
          const enrollmentClasses = getClassesForEnrollment(
            e,
            state.classes,
            state.groups,
            plan
          );
          const previousCredits = calculateCumulativePreviousCredits(
            student.id,
            enrollmentClasses,
            monthRefStr
          );
          raphaelPreview = calculateRaphaelStudentMonthlySimulation({
            enrollment: e,
            plan,
            teacher: teacher || { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
            studentClasses: enrollmentClasses,
            monthStr: monthRefStr,
            previousCredits,
            allGroups: state.groups,
          });

          // ETAPA 5: Motor de Cálculo Real do Raphael (Cálculo estrito por matrícula/entidade)
          raphaelRealBilling = calculateRaphaelRealStudentBilling({
            enrollment: e,
            plan,
            teacher: teacher || { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
            classes: enrollmentClasses,
            monthStr: monthRefStr,
            credits: state.credits || [],
            applyCredits: true,
            studentName: student.name,
            allGroups: state.groups,
          });
        }

        enrollmentsBilling.push({
          enrollment: e,
          plan,
          basePrice: resolved.basePrice,
          crossDiscount: resolved.discount,
          priceWithDiscount: resolved.finalPrice,
          isPaid,
          transaction,
          monthStr: mRef.monthStr,
          yearStr: mRef.yearStr,
          refLabel: mRef.refLabel,
          isPast: !mRef.isCurrent,
          itemKey: `enrollment_${e.id}_${mRef.monthStr}_${mRef.yearStr}`,
          isRaphael,
          raphaelPreview,
          raphaelRealBilling,
          isFrozen: resolved.isFrozen,
          isHistorical: resolved.isHistorical,
          statusLabel: resolved.statusLabel,
          resolvedSource: resolved.source,
        });
      });
    });

    // Choir billing across current and past months
    const choirBilling: Array<{
      registration: any;
      monthlyFee: number;
      isPaid: boolean;
      transaction: any;
      monthStr: string;
      yearStr: string;
      refLabel: string;
      isPast: boolean;
      itemKey: string;
      isFrozen?: boolean;
      isHistorical?: boolean;
      statusLabel?: string;
      resolvedSource?: string;
    }> = [];

    if (relevantChoir) {
      const choirMonths = getMonthsToBill(
        relevantChoir.created_at || relevantChoir.date,
        selectedMonth,
        selectedYear,
        (relevantChoir as any).end_date
      );

      choirMonths.forEach(mRef => {
        const comp = `${mRef.yearStr}-${mRef.monthStr}`;
        const resolved = resolveCompetenceBilling({
          category: 'choir',
          sourceId: relevantChoir.id,
          competence: comp,
          context: resolveContext,
        });

        const isPaid = resolved.isPaid;
        const choirPaidTransaction = resolved.transaction;

        if (!mRef.isCurrent && isPaid) {
          return;
        }

        if (!isPaid && !resolved.isFrozen && resolved.finalPrice <= 0 && !resolved.isPaying) {
          return;
        }

        choirBilling.push({
          registration: relevantChoir,
          monthlyFee: resolved.finalPrice,
          isPaid,
          transaction: choirPaidTransaction,
          monthStr: mRef.monthStr,
          yearStr: mRef.yearStr,
          refLabel: mRef.refLabel,
          isPast: !mRef.isCurrent,
          itemKey: `choir_${relevantChoir.id}_${mRef.monthStr}_${mRef.yearStr}`,
          isFrozen: resolved.isFrozen,
          isHistorical: resolved.isHistorical,
          statusLabel: resolved.statusLabel,
          resolvedSource: resolved.source,
        });
      });
    }

    return {
      student,
      enrollmentsBilling,
      choirBilling,
    };
  };

  const monthStr = selectedMonth.toString().padStart(2, '0');

  // Groups with unified payment
  const groupsWithBilling = state.groups.filter(g => g.payment_type === 'group');

  const groupsBillingList = groupsWithBilling.map(group => {
    if (!group.price || group.price <= 0) return null;

    const monthsToBill = getMonthsToBill(group.created_at, selectedMonth, selectedYear);
    let totalAmount = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let allPaid = true;
    let hasPastPending = false;

    const groupItems: Array<{
      group: any;
      price: number;
      effectivePrice?: number;
      isPaid: boolean;
      transaction: any;
      monthStr: string;
      yearStr: string;
      refLabel: string;
      isPast: boolean;
      itemKey: string;
      raphaelPreview?: RaphaelGroupBillingSimulationResult;
      raphaelRealBilling?: RaphaelBillingMemory | null;
      isFrozen?: boolean;
      isHistorical?: boolean;
      statusLabel?: string;
      resolvedSource?: string;
    }> = [];

    const teacher = state.teachers.find(t => t.id === group.teacher_id);
    const isRaphael = isRaphaelTeacher(group.teacher_id, teacher?.name, null);

    const resolveContext: ResolveBillingContext = {
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
    };

    monthsToBill.forEach(mRef => {
      const comp = `${mRef.yearStr}-${mRef.monthStr}`;
      const resolved = resolveCompetenceBilling({
        category: 'group',
        sourceId: group.id,
        competence: comp,
        context: resolveContext,
      });

      const isPaid = resolved.isPaid;
      const transaction = resolved.transaction;

      if (!mRef.isCurrent && isPaid) return;

      const targetMonthStr = `${mRef.yearStr}-${mRef.monthStr}`;
      let raphaelPreview: RaphaelGroupBillingSimulationResult | undefined = undefined;
      let raphaelRealBilling: RaphaelBillingMemory | undefined = resolved.raphaelBilling || undefined;

      if (isRaphael && group.payment_type === 'group' && !resolved.raphaelBilling && !resolved.isFrozen && !isPaid) {
        const prevCredits = calculateCumulativePreviousCreditsForGroup(
          group.id,
          state.classes,
          targetMonthStr,
          group,
          state.groups
        );
        raphaelPreview = calculateRaphaelGroupMonthlySimulation({
          group,
          teacher,
          groupClasses: state.classes,
          monthStr: targetMonthStr,
          previousCredits: prevCredits,
          allGroups: state.groups,
        });

        // ETAPA 5: Motor de Cálculo Real do Grupo do Raphael
        raphaelRealBilling = calculateRaphaelRealGroupBilling({
          group,
          teacher: teacher || { id: RAPHAEL_TEACHER_ID, name: "RAPHAEL AUGUSTO PINTO" },
          classes: state.classes,
          monthStr: targetMonthStr,
          credits: state.credits || [],
          applyCredits: true,
          allGroups: state.groups,
        });
      }

      const effectivePrice = resolved.finalPrice;

      totalAmount += effectivePrice;
      if (isPaid) {
        totalPaid += transaction?.amount || effectivePrice;
      } else {
        totalPending += effectivePrice;
        allPaid = false;
        if (!mRef.isCurrent) hasPastPending = true;
      }

      groupItems.push({
        group,
        price: resolved.basePrice,
        effectivePrice,
        isPaid,
        transaction,
        monthStr: mRef.monthStr,
        yearStr: mRef.yearStr,
        refLabel: mRef.refLabel,
        isPast: !mRef.isCurrent,
        itemKey: `group_${group.id}_${mRef.monthStr}_${mRef.yearStr}`,
        raphaelPreview,
        raphaelRealBilling,
        isFrozen: resolved.isFrozen,
        isHistorical: resolved.isHistorical,
        statusLabel: resolved.statusLabel,
        resolvedSource: resolved.source,
      });
    });

    if (groupItems.length === 0 || totalAmount <= 0) return null;

    return {
      id: group.id,
      type: 'group' as const,
      name: group.name,
      price: group.price || 0,
      isPaid: allPaid,
      groupItems,
      group,
      totalAmount,
      totalPaid,
      totalPending,
      paymentStatus: allPaid ? 'paid' as const : 'pending' as const,
      hasPastPending,
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  const studentsBillingList = state.students.filter(student => {
    if (student.not_eligible) return false;
    return true;
  }).map(student => {
    const billing = getStudentBilling(student.id);
    if (!billing) return null;

    const { enrollmentsBilling, choirBilling } = billing;
    if (enrollmentsBilling.length === 0 && choirBilling.length === 0) return null;

    let totalAmount = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let allPaid = true;
    let anyPaid = false;
    let hasPastPending = false;

    enrollmentsBilling.forEach(eb => {
      const effectiveAmount = eb.isRaphael && eb.raphaelRealBilling
        ? eb.raphaelRealBilling.finalAmount
        : eb.priceWithDiscount;

      totalAmount += effectiveAmount;
      if (eb.isPaid) {
        totalPaid += eb.transaction?.amount || effectiveAmount;
        anyPaid = true;
      } else {
        totalPending += effectiveAmount;
        allPaid = false;
        if (eb.isPast) hasPastPending = true;
      }
    });

    choirBilling.forEach(cb => {
      totalAmount += cb.monthlyFee;
      if (cb.isPaid) {
        totalPaid += cb.transaction?.amount || cb.monthlyFee;
        anyPaid = true;
      } else {
        totalPending += cb.monthlyFee;
        allPaid = false;
        if (cb.isPast) hasPastPending = true;
      }
    });

    // Exclude R$ 0,00 students ("não mostrar para baixa alunos com valor 0,00")
    if (totalAmount <= 0) return null;

    const paymentStatus = allPaid ? 'paid' as const : (anyPaid ? 'partial' : 'pending' as const);

    return {
      id: student.id,
      type: 'student' as const,
      name: student.name,
      isInactiveStudent: student.status === 'inactive',
      billing,
      totalAmount,
      totalPaid,
      totalPending,
      paymentStatus,
      hasPastPending,
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  const allBillingItems = [
    ...groupsBillingList,
    ...studentsBillingList,
  ];

  const filteredBillingItems = allBillingItems.filter(item => {
    // 0. Exclude 0.00 items
    if (item.totalAmount <= 0) return false;

    // 1. Filter by payment status
    if (statusFilter === 'to_pay' && (item.paymentStatus === 'paid' || item.totalPending <= 0)) return false;
    if (statusFilter === 'paid' && item.paymentStatus !== 'paid') return false;

    // 2. Filter by search term
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
    if (item.type === 'student') {
      const matchesPlans = item.billing?.enrollmentsBilling.some(eb => eb.plan.name.toLowerCase().includes(searchTerm.toLowerCase()));
      return matchesSearch || matchesPlans;
    }
    return matchesSearch;
  });

  const openPaymentModal = (id: string, type: 'student' | 'group') => {
    if (type === 'group') {
      setSelectedGroupId(id);
      setSelectedStudentId(null);
    } else {
      setSelectedStudentId(id);
      setSelectedGroupId(null);
    }
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setIsModalOpen(true);
  };

  const closePaymentModal = () => {
    setIsModalOpen(false);
    setSelectedStudentId(null);
    setSelectedGroupId(null);
    setCustomAmounts({});
    setCustomDiscounts({});
  };

  const handleDiscountChange = (itemKey: string, refPrice: number, discountStr: string) => {
    const parsedDiscount = parseFloat(discountStr);
    const discountVal = isNaN(parsedDiscount) || parsedDiscount < 0 ? 0 : parsedDiscount;
    const finalVal = Math.max(0, refPrice - discountVal);

    setCustomDiscounts(prev => ({ ...prev, [itemKey]: discountStr }));
    setCustomAmounts(prev => ({ ...prev, [itemKey]: finalVal.toString() }));
  };

  const handleAmountChange = (itemKey: string, refPrice: number, amountStr: string) => {
    const parsedAmount = parseFloat(amountStr);
    const amountVal = isNaN(parsedAmount) || parsedAmount < 0 ? 0 : parsedAmount;
    const discountVal = Math.max(0, refPrice - amountVal);

    setCustomAmounts(prev => ({ ...prev, [itemKey]: amountStr }));
    setCustomDiscounts(prev => ({ ...prev, [itemKey]: discountVal > 0 ? discountVal.toString() : '0' }));
  };

  useEffect(() => {
    if (!isModalOpen) return;
    if (selectedGroupId) {
      const groupItem = groupsBillingList.find(g => g.id === selectedGroupId);
      const initialAmounts: Record<string, string> = {};
      const initialDiscounts: Record<string, string> = {};
      if (groupItem) {
        groupItem.groupItems.forEach(gi => {
          if (!gi.isPaid) {
            if (gi.raphaelRealBilling) {
              initialAmounts[gi.itemKey] = gi.raphaelRealBilling.finalAmount.toString();
              initialDiscounts[gi.itemKey] = gi.raphaelRealBilling.creditDiscountAmount.toString();
            } else {
              initialAmounts[gi.itemKey] = gi.price.toString();
              initialDiscounts[gi.itemKey] = '0';
            }
          }
        });
      }
      setCustomAmounts(initialAmounts);
      setCustomDiscounts(initialDiscounts);
    } else if (selectedStudentId) {
      const billing = getStudentBilling(selectedStudentId);
      const initialAmounts: Record<string, string> = {};
      const initialDiscounts: Record<string, string> = {};
      if (billing) {
        const paymentDay = parseInt(paymentDate.split('-')[2], 10);
        billing.enrollmentsBilling.forEach(eb => {
          if (!eb.isPaid) {
            if (eb.isRaphael && eb.raphaelRealBilling) {
              initialAmounts[eb.itemKey] = eb.raphaelRealBilling.finalAmount.toString();
              initialDiscounts[eb.itemKey] = eb.raphaelRealBilling.creditDiscountAmount.toString();
            } else {
              let amount = eb.priceWithDiscount;
              let discount = 0;
              if (eb.plan.allow_early_discount && paymentDay <= eb.plan.early_discount_deadline_day && !eb.isPast) {
                discount = eb.plan.early_discount_value;
                amount -= discount;
              }
              initialAmounts[eb.itemKey] = amount.toString();
              initialDiscounts[eb.itemKey] = discount > 0 ? discount.toString() : '0';
            }
          }
        });
        billing.choirBilling.forEach(cb => {
          if (!cb.isPaid) {
            initialAmounts[cb.itemKey] = cb.monthlyFee.toString();
            initialDiscounts[cb.itemKey] = '0';
          }
        });
      }
      setCustomAmounts(initialAmounts);
      setCustomDiscounts(initialDiscounts);
    }
  }, [paymentDate, selectedStudentId, selectedGroupId, isModalOpen]);

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedGroupId) {
      const groupItem = groupsBillingList.find(g => g.id === selectedGroupId);
      if (groupItem) {
        for (const gi of groupItem.groupItems) {
          if (!gi.isPaid) {
            const isRaphael = gi.raphaelRealBilling && gi.group.teacher_id === RAPHAEL_TEACHER_ID;

            // Double-billing safety check
            const descPattern = `Mensalidade Grupo | ${gi.group.id} | ${gi.monthStr}/${gi.yearStr}`;
            const alreadyPaid = state.transactions.some(t => 
              t.type === 'income' && 
              t.description.includes(descPattern) &&
              t.status === 'completed'
            );
            if (alreadyPaid) {
              console.warn(`Mensalidade de grupo já liquidada para ${descPattern}`);
              continue;
            }

            const customPriceStr = customAmounts[gi.itemKey];
            const finalAmount = customPriceStr !== undefined && customPriceStr !== '' ? parseFloat(customPriceStr) : (isRaphael && gi.raphaelRealBilling ? gi.raphaelRealBilling.finalAmount : gi.price);
            const discountStr = customDiscounts[gi.itemKey];
            const discountVal = discountStr ? parseFloat(discountStr) : (isRaphael && gi.raphaelRealBilling ? gi.raphaelRealBilling.creditDiscountAmount : 0);
            const discountLabel = discountVal > 0 ? ` (Desconto: ${formatCurrency(discountVal)})` : '';

            // Consume credits if Raphael
            if (isRaphael && gi.raphaelRealBilling) {
              for (const cred of gi.raphaelRealBilling.creditsConsumedList) {
                // Validação estrita de isolamento de crédito (Etapa 5)
                const validation = validateCreditConsumptionEntity(cred, { type: 'group', groupId: gi.group.id });
                if (!validation.allowed) {
                  console.error(`[Segurança] Bloqueio de consumo cruzado no grupo ${gi.group.name}: ${validation.reason}`);
                  continue;
                }
                const currentCredit = (state.credits || []).find(c => c.id === cred.id);
                if (currentCredit && currentCredit.status === 'available') {
                  updateCredit(cred.id, {
                    status: 'used',
                    used_date: paymentDate,
                    notes: `Utilizado no pagamento do grupo ${gi.group.name} (${gi.monthStr}/${gi.yearStr})`,
                  });
                }
              }
            }

            const raphaelTag = isRaphael ? ` [Raphael Etapa 5]` : '';
            const newTxId = crypto.randomUUID();

            addTransaction({
              id: newTxId,
              type: 'income',
              amount: finalAmount,
              description: `Mensalidade Grupo | ${gi.group.id} | ${gi.monthStr}/${gi.yearStr} | ${gi.group.name}${discountLabel}${raphaelTag}`,
              date: paymentDate,
              status: 'completed'
            });

            // Etapa 3: Congelamento ou gravação de snapshot da competência
            const comp = `${gi.yearStr}-${gi.monthStr}`;
            try {
              const existingSnap = (state.competenceBillings || []).find(
                b => b.category === 'group' && b.group_id === gi.group.id && b.competence === comp
              );
              if (existingSnap) {
                await updateCompetenceBilling(existingSnap.id, {
                  status: 'paid',
                  transaction_id: newTxId,
                  is_frozen: true,
                  frozen_at: new Date().toISOString(),
                  frozen_by: currentUserProfile?.id || 'admin',
                  final_price: finalAmount,
                  discount: discountVal,
                  metadata: {
                    ...(existingSnap.metadata || {}),
                    paymentDate,
                    discountLabel,
                    raphaelTag,
                    raphaelBilling: gi.raphaelRealBilling || existingSnap.metadata?.raphaelBilling || undefined,
                    source: 'payment_checkout',
                  },
                });
              } else if (createCompetenceBilling) {
                await createCompetenceBilling({
                  competence: comp,
                  category: 'group',
                  group_id: gi.group.id,
                  enrollment_id: null,
                  choir_registration_id: null,
                  student_id: null,
                  teacher_id: gi.group.teacher_id || null,
                  is_paying: true,
                  base_price: gi.price,
                  discount: discountVal,
                  final_price: finalAmount,
                  teacher_share: 0,
                  school_share: finalAmount,
                  status: 'paid',
                  transaction_id: newTxId,
                  is_frozen: true,
                  frozen_at: new Date().toISOString(),
                  frozen_by: currentUserProfile?.id || 'admin',
                  metadata: {
                    paymentDate,
                    discountLabel,
                    raphaelTag,
                    raphaelBilling: gi.raphaelRealBilling || undefined,
                    source: 'payment_checkout',
                  },
                });
              }
            } catch (snapErr) {
              console.warn('[Snapshot] Aviso ao congelar competência de grupo:', snapErr);
            }
          }
        }
      }
      closePaymentModal();
      return;
    }

    if (!selectedStudentId) return;

    const billing = getStudentBilling(selectedStudentId);
    if (!billing) return;

    const { student, enrollmentsBilling, choirBilling } = billing;

    // Register transaction for each unpaid enrollment month
    for (const eb of enrollmentsBilling) {
      if (!eb.isPaid) {
        const isRaphael = eb.isRaphael && eb.raphaelRealBilling;

        // Double-billing safety check
        const descPattern = `Mensalidade | ${eb.enrollment.id} | ${eb.monthStr}/${eb.yearStr}`;
        const alreadyPaid = state.transactions.some(t => 
          t.type === 'income' && 
          t.description.includes(descPattern) &&
          t.status === 'completed'
        );
        if (alreadyPaid) {
          console.warn(`Mensalidade já liquidada para ${descPattern}`);
          continue;
        }

        const customPriceStr = customAmounts[eb.itemKey];
        const amountToPay = customPriceStr !== undefined && customPriceStr !== '' ? parseFloat(customPriceStr) : (isRaphael && eb.raphaelRealBilling ? eb.raphaelRealBilling.finalAmount : eb.priceWithDiscount);
        const discountStr = customDiscounts[eb.itemKey];
        const discountVal = discountStr ? parseFloat(discountStr) : (isRaphael && eb.raphaelRealBilling ? eb.raphaelRealBilling.creditDiscountAmount : 0);
        const discountLabel = discountVal > 0 ? ` (Desconto: ${formatCurrency(discountVal)})` : '';

        // Consume credits if Raphael
        if (isRaphael && eb.raphaelRealBilling) {
          for (const cred of eb.raphaelRealBilling.creditsConsumedList) {
            // Validação estrita de isolamento de crédito por matrícula (Etapa 5)
            const validation = validateCreditConsumptionEntity(cred, { type: 'individual', enrollmentId: eb.enrollment.id });
            if (!validation.allowed) {
              console.error(`[Segurança] Bloqueio de consumo cruzado na matrícula ${eb.enrollment.id}: ${validation.reason}`);
              continue;
            }
            const currentCredit = (state.credits || []).find(c => c.id === cred.id);
            if (currentCredit && currentCredit.status === 'available') {
              updateCredit(cred.id, {
                status: 'used',
                used_date: paymentDate,
                notes: `Utilizado no pagamento da matrícula ${eb.plan.name} (${eb.monthStr}/${eb.yearStr})`,
              });
            }
          }
        }

        const raphaelTag = isRaphael ? ` [Raphael Etapa 5]` : '';
        const newTxId = crypto.randomUUID();

        addTransaction({
          id: newTxId,
          type: 'income',
          amount: amountToPay,
          description: `Mensalidade | ${eb.enrollment.id} | ${eb.monthStr}/${eb.yearStr} | ${student.name} - ${eb.plan.name}${discountLabel}${raphaelTag}`,
          date: paymentDate,
          status: 'completed'
        });

        // Etapa 3: Congelamento ou gravação de snapshot da competência liquidada
        const comp = `${eb.yearStr}-${eb.monthStr}`;
        try {
          const existingSnap = (state.competenceBillings || []).find(
            b => b.category === 'individual' && b.enrollment_id === eb.enrollment.id && b.competence === comp
          );
          if (existingSnap) {
            await updateCompetenceBilling(existingSnap.id, {
              status: 'paid',
              transaction_id: newTxId,
              is_frozen: true,
              frozen_at: new Date().toISOString(),
              frozen_by: currentUserProfile?.id || 'admin',
              final_price: amountToPay,
              discount: discountVal,
              metadata: {
                ...(existingSnap.metadata || {}),
                paymentDate,
                discountLabel,
                raphaelTag,
                raphaelBilling: eb.raphaelRealBilling || existingSnap.metadata?.raphaelBilling || undefined,
                source: 'payment_checkout',
              },
            });
          } else if (createCompetenceBilling) {
            const plan = eb.plan;
            const teacherShare = plan.teacher_fee_type === 'percentage'
              ? (amountToPay * (plan.teacher_fee_value || 0) / 100)
              : (plan.teacher_fee_value || 0);
            const schoolShare = Math.max(0, amountToPay - teacherShare - (plan.secretary_fee_value || 0));

            await createCompetenceBilling({
              competence: comp,
              category: 'individual',
              enrollment_id: eb.enrollment.id,
              group_id: null,
              choir_registration_id: null,
              student_id: student.id,
              teacher_id: eb.enrollment.teacher_id || plan.exclusive_teacher_id || null,
              is_paying: true,
              base_price: eb.basePrice,
              discount: discountVal,
              final_price: amountToPay,
              teacher_fee_type: plan.teacher_fee_type,
              teacher_fee_value: plan.teacher_fee_value,
              teacher_share: teacherShare,
              school_share: schoolShare,
              status: 'paid',
              transaction_id: newTxId,
              is_frozen: true,
              frozen_at: new Date().toISOString(),
              frozen_by: currentUserProfile?.id || 'admin',
              metadata: {
                paymentDate,
                discountLabel,
                raphaelTag,
                raphaelBilling: eb.raphaelRealBilling || undefined,
                source: 'payment_checkout',
              },
            });
          }
        } catch (snapErr) {
          console.warn('[Snapshot] Aviso ao congelar competência de matrícula:', snapErr);
        }
      }
    }

    // Register transaction for each unpaid Choir month
    for (const cb of choirBilling) {
      if (!cb.isPaid) {
        const descPattern = `Mensalidade Coral | ${cb.registration.id} | ${cb.monthStr}/${cb.yearStr}`;
        const alreadyPaid = state.transactions.some(t => 
          t.type === 'income' && 
          t.description.includes(descPattern) &&
          t.status === 'completed'
        );
        if (alreadyPaid) continue;

        const customPriceStr = customAmounts[cb.itemKey];
        const amountToPay = customPriceStr !== undefined && customPriceStr !== '' ? parseFloat(customPriceStr) : cb.monthlyFee;
        const discountStr = customDiscounts[cb.itemKey];
        const discountVal = discountStr ? parseFloat(discountStr) : 0;
        const discountLabel = discountVal > 0 ? ` (Desconto: ${formatCurrency(discountVal)})` : '';
        const newTxId = crypto.randomUUID();

        addTransaction({
          id: newTxId,
          type: 'income',
          amount: amountToPay,
          description: `Mensalidade Coral | ${cb.registration.id} | ${cb.monthStr}/${cb.yearStr} | ${student.name}${discountLabel}`,
          date: paymentDate,
          status: 'completed'
        });

        // Etapa 3: Congelamento ou gravação de snapshot da competência de coral
        const comp = `${cb.yearStr}-${cb.monthStr}`;
        try {
          const existingSnap = (state.competenceBillings || []).find(
            b => b.category === 'choir' && b.choir_registration_id === cb.registration.id && b.competence === comp
          );
          if (existingSnap) {
            await updateCompetenceBilling(existingSnap.id, {
              status: 'paid',
              transaction_id: newTxId,
              is_frozen: true,
              frozen_at: new Date().toISOString(),
              frozen_by: currentUserProfile?.id || 'admin',
              final_price: amountToPay,
              discount: discountVal,
              is_paying: amountToPay > 0,
              metadata: {
                ...(existingSnap.metadata || {}),
                paymentDate,
                discountLabel,
                source: 'payment_checkout',
              },
            });
          } else if (createCompetenceBilling) {
            await createCompetenceBilling({
              competence: comp,
              category: 'choir',
              choir_registration_id: cb.registration.id,
              enrollment_id: null,
              group_id: null,
              student_id: student.id,
              teacher_id: null,
              is_paying: amountToPay > 0,
              base_price: cb.monthlyFee,
              discount: discountVal,
              final_price: amountToPay,
              teacher_share: 0,
              school_share: amountToPay,
              status: 'paid',
              transaction_id: newTxId,
              is_frozen: true,
              frozen_at: new Date().toISOString(),
              frozen_by: currentUserProfile?.id || 'admin',
              metadata: {
                paymentDate,
                discountLabel,
                source: 'payment_checkout',
              },
            });
          }
        } catch (snapErr) {
          console.warn('[Snapshot] Aviso ao congelar competência de coral:', snapErr);
        }
      }
    }

    closePaymentModal();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const raphaelAvailableCredits = (state.credits || []).filter(c => c.status === 'available');
  const raphaelAvailableCreditsCount = raphaelAvailableCredits.length;
  const raphaelAvailableCreditsAmount = raphaelAvailableCredits.reduce((sum, c) => sum + (c.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Baixa de Pagamentos</h1>
          <p className="text-sm text-zinc-500 mt-1">Gerencie os pagamentos mensais consolidados por aluno ou grupo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(currentUserProfile?.role === 'super_admin' || currentUserProfile?.role === 'admin') && (
            <button
              type="button"
              onClick={() => setIsHistoricalRegularizationModalOpen(true)}
              className="inline-flex items-center px-3.5 py-2 border border-amber-300 text-xs font-bold rounded-xl text-amber-900 bg-amber-50 hover:bg-amber-100 shadow-xs transition-colors gap-1.5"
              title="Regularização Histórica Assistida para competências antigas sem snapshot"
            >
              <History className="w-4 h-4 text-amber-700" />
              <span>Regularização Histórica</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsStage5TestsModalOpen(true)}
            className="inline-flex items-center px-3.5 py-2 border border-purple-300 text-xs font-bold rounded-xl text-purple-900 bg-purple-100 hover:bg-purple-200 shadow-xs transition-colors gap-1.5"
            title="Validação Oficial Etapa 5 — Testes Canônicos do Faturamento Real e Isolamento de Créditos (30 Testes)"
          >
            <ShieldCheck className="w-4 h-4 text-purple-700" />
            <span>Validação Etapa 5 (30 Testes)</span>
          </button>
          <button
            type="button"
            onClick={() => setIsCreditsModalOpen(true)}
            className="inline-flex items-center px-3.5 py-2 border border-emerald-300 text-xs font-semibold rounded-xl text-emerald-800 bg-emerald-50 hover:bg-emerald-100 shadow-xs transition-colors gap-1.5"
            title="Conferir créditos gerados por cancelamento do professor Raphael"
          >
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <span>Créditos Raphael ({raphaelAvailableCreditsCount} • {formatCurrency(raphaelAvailableCreditsAmount)})</span>
          </button>
          <button
            type="button"
            onClick={() => setIsSimulatorModalOpen(true)}
            className="inline-flex items-center px-3.5 py-2 border border-purple-200 text-xs font-semibold rounded-xl text-purple-700 bg-purple-50 hover:bg-purple-100 shadow-xs transition-colors gap-1.5"
            title="Abrir o simulador do motor de faturamento para conferência"
          >
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span>Simulador Faturamento Raphael</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100 flex flex-col sm:flex-row gap-4 justify-between">
          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-zinc-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por aluno, grupo ou plano..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl leading-5 bg-zinc-50 placeholder-zinc-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm font-medium text-zinc-700"
            >
              <option value="to_pay">Status: A Pagar (Pendentes)</option>
              <option value="paid">Status: Pagos</option>
              <option value="all">Status: Todos</option>
            </select>
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
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Aluno / Grupo</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Atribuições / Valores</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Geral</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
              {filteredBillingItems.length > 0 ? (
                filteredBillingItems.map((item) => {
                  if (item.type === 'group') {
                    return (
                      <tr key={`group_${item.id}`} className="hover:bg-zinc-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center">
                              <Users className="h-5 w-5 text-indigo-600" />
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-semibold text-zinc-900">{item.name}</div>
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  Grupo / Turma
                                </span>
                                {item.hasPastPending && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                                    Acumula mês anterior
                                  </span>
                                )}
                                {(() => {
                                  const groupCredits = (state.credits || []).filter(c => c.group_id === item.id && c.status === 'available');
                                  if (groupCredits.length === 0) return null;
                                  const totalCred = groupCredits.reduce((s, c) => s + (c.amount || 0), 0);
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => setIsCreditsModalOpen(true)}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-colors"
                                      title="Ver detalhes dos créditos deste grupo"
                                    >
                                      <CreditCard className="w-2.5 h-2.5 text-emerald-600" />
                                      <span>Crédito: {groupCredits.length} aula(s) • {formatCurrency(totalCred)}</span>
                                    </button>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-2">
                            {item.groupItems.map((gi: any) => (
                              <div key={gi.itemKey} className="space-y-1.5">
                                <div className="text-sm flex flex-wrap items-center gap-1.5">
                                  <span className="font-medium text-zinc-850">Mensalidade Unificada</span>
                                  <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                    Ref: {gi.refLabel}
                                  </span>
                                  <span className="text-zinc-400">|</span>
                                  <span className="text-zinc-600">
                                    {gi.raphaelRealBilling ? formatCurrency(gi.raphaelRealBilling.finalAmount) : formatCurrency(gi.price)}
                                  </span>
                                  {gi.raphaelRealBilling && (
                                    <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200" title="Cálculo real motor Raphael (Etapa 5)">
                                      Raphael Etapa 5
                                    </span>
                                  )}
                                  {gi.isPaid ? (
                                    <div className="inline-flex items-center gap-1">
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        Pago
                                      </span>
                                      {gi.isFrozen && (
                                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-cyan-50 text-cyan-800 border border-cyan-200" title="Competência congelada no snapshot">
                                          Congelado
                                        </span>
                                      )}
                                      {!gi.isFrozen && gi.isHistorical && (
                                        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200" title="Valor comprovado por transação histórica">
                                          Histórico
                                        </span>
                                      )}
                                      {canManagePayments && (
                                        <button
                                          onClick={() => {
                                            const groupTx = gi.transaction;
                                            openCorrectionModal({
                                              studentName: item.name,
                                              itemDescription: `Mensalidade Grupo (${item.name})`,
                                              currentAmount: groupTx?.amount || gi.price,
                                              transactionId: groupTx?.id,
                                              transactionDate: groupTx?.date,
                                              defaultDescription: `Mensalidade Grupo | ${item.id} | ${gi.monthStr}/${gi.yearStr} | ${item.name}`
                                            });
                                          }}
                                          className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors inline-flex items-center gap-0.5 border border-indigo-200/60"
                                          title="Corrigir valor pago"
                                        >
                                          <Pencil className="w-2.5 h-2.5" /> Corrigir
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="inline-flex items-center gap-1">
                                      <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold ${gi.isPast ? 'bg-amber-100 text-amber-800 border border-amber-300 font-bold' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                        {gi.isPast ? 'Pendente (Anterior)' : 'Pendente'}
                                      </span>
                                      {canManagePayments && (
                                        <button
                                          onClick={() => openPaymentModal(item.id, 'group')}
                                          className="text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors inline-flex items-center gap-0.5 border border-emerald-200/60"
                                          title="Baixar pagamento do grupo"
                                        >
                                          <CheckCircle className="w-2.5 h-2.5" /> Baixar
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {/* Preview Raphael unified group special calculation if applicable */}
                                {gi.raphaelPreview && gi.raphaelPreview.isRaphaelRule && (
                                  <div className="p-3 bg-purple-50/80 border border-purple-200/90 rounded-xl space-y-2.5 text-xs mt-2">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-1.5 font-semibold text-purple-900">
                                        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                                        <span>Mensalidade Unificada — Raphael <span className="text-[10px] font-normal text-purple-600">(Prévia)</span></span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => toggleRaphaelDetails(gi.itemKey)}
                                        className="text-[11px] font-medium text-purple-700 hover:text-purple-900 flex items-center gap-0.5 bg-purple-100 hover:bg-purple-200 px-2 py-0.5 rounded-md transition-colors"
                                      >
                                        {expandedRaphaelDetails[gi.itemKey] ? (
                                          <><span>Ocultar</span><ChevronUp className="w-3 h-3" /></>
                                        ) : (
                                          <><span>Conferir cálculo</span><ChevronDown className="w-3 h-3" /></>
                                        )}
                                      </button>
                                    </div>

                                    {/* Warnings if undefined frequency */}
                                    {gi.raphaelPreview.hasUndefinedFrequency ? (
                                      <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] flex items-center gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                        <span>{gi.raphaelPreview.frequencyWarning || "Frequência do grupo não definida — requer conferência."}</span>
                                      </div>
                                    ) : (
                                      <>
                                        {/* Summary comparison row */}
                                        <div className="grid grid-cols-3 gap-2 bg-white/95 p-2 rounded-lg border border-purple-100 text-[11px]">
                                          <div>
                                            <span className="text-zinc-500 block text-[10px]">Valor Atual</span>
                                            <span className="font-semibold text-zinc-800">{formatCurrency(gi.price)}</span>
                                          </div>
                                          <div>
                                            <span className="text-zinc-500 block text-[10px]">Novo Cálculo</span>
                                            <span className="font-bold text-purple-700">{formatCurrency(gi.raphaelPreview.finalMonthlyAmount)}</span>
                                          </div>
                                          <div>
                                            <span className="text-zinc-500 block text-[10px]">Diferença</span>
                                            <span className={`font-bold ${gi.raphaelPreview.differenceFromContract > 0 ? 'text-emerald-700' : gi.raphaelPreview.differenceFromContract < 0 ? 'text-amber-700' : 'text-zinc-600'}`}>
                                              {gi.raphaelPreview.differenceFromContract > 0 ? `+${formatCurrency(gi.raphaelPreview.differenceFromContract)}` : formatCurrency(gi.raphaelPreview.differenceFromContract)}
                                            </span>
                                          </div>
                                        </div>

                                        {gi.raphaelPreview.hasUncreditedMakeup && (
                                          <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] flex items-center gap-1.5">
                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                                            <span>{gi.raphaelPreview.uncreditedMakeupWarning}</span>
                                          </div>
                                        )}
                                      </>
                                    )}

                                    {/* Expanded details */}
                                    {expandedRaphaelDetails[gi.itemKey] && (
                                      <div className="pt-2 space-y-2.5 border-t border-purple-100 text-[11px] text-zinc-700">
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                          <div className="bg-purple-100/40 p-2 rounded-lg">
                                            <span className="text-zinc-500 block text-[10px]">Mensalidade Contratada</span>
                                            <span className="font-semibold text-zinc-900">{formatCurrency(gi.price)}</span>
                                          </div>
                                          <div className="bg-purple-100/40 p-2 rounded-lg">
                                            <span className="text-zinc-500 block text-[10px]">Frequência</span>
                                            <span className="font-semibold text-zinc-900 capitalize">{gi.raphaelPreview.frequency || 'Não definida'}</span>
                                          </div>
                                          <div className="bg-purple-100/40 p-2 rounded-lg">
                                            <span className="text-zinc-500 block text-[10px]">Aulas-base</span>
                                            <span className="font-semibold text-zinc-900">{gi.raphaelPreview.baseLessons > 0 ? `${gi.raphaelPreview.baseLessons} aulas` : 'Não definida'}</span>
                                          </div>
                                          <div className="bg-purple-100/40 p-2 rounded-lg">
                                            <span className="text-zinc-500 block text-[10px]">Valor por Aula</span>
                                            <span className="font-semibold text-zinc-900">{gi.raphaelPreview.pricePerLesson > 0 ? formatCurrency(gi.raphaelPreview.pricePerLesson) : 'N/A'}</span>
                                          </div>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                          <div className="bg-zinc-50 p-2 rounded-lg border border-zinc-100">
                                            <span className="text-zinc-500 block text-[10px]">Aulas Normais</span>
                                            <span className="font-semibold text-zinc-800">{gi.raphaelPreview.regularLessons}</span>
                                          </div>
                                          <div className="bg-zinc-50 p-2 rounded-lg border border-zinc-100">
                                            <span className="text-zinc-500 block text-[10px]">Canceladas Elegíveis</span>
                                            <span className="font-semibold text-zinc-800">{gi.raphaelPreview.cancelledLessonsEligibleForCredit}</span>
                                          </div>
                                          <div className="bg-zinc-50 p-2 rounded-lg border border-zinc-100">
                                            <span className="text-zinc-500 block text-[10px]">Créditos Gerados</span>
                                            <span className="font-semibold text-emerald-700">+{gi.raphaelPreview.creditsGenerated} ({formatCurrency(gi.raphaelPreview.creditsGenerated * gi.raphaelPreview.pricePerLesson)})</span>
                                          </div>
                                          <div className="bg-zinc-50 p-2 rounded-lg border border-zinc-100">
                                            <span className="text-zinc-500 block text-[10px]">Reposições / Usados</span>
                                            <span className="font-semibold text-indigo-700">{gi.raphaelPreview.makeupLessons} (Usou {gi.raphaelPreview.creditsConsumed})</span>
                                          </div>
                                        </div>

                                        {/* Classes breakdown */}
                                        {gi.raphaelPreview.classifiedClasses && gi.raphaelPreview.classifiedClasses.length > 0 && (
                                          <div className="space-y-1 mt-2">
                                            <span className="font-semibold text-zinc-800 text-[10px] uppercase tracking-wider block">Aulas Identificadas no Mês:</span>
                                            <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                                              {gi.raphaelPreview.classifiedClasses.map((cl: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between p-1.5 bg-white rounded border border-zinc-100 text-[10px]">
                                                  <div>
                                                    <span className="font-medium text-zinc-800">{cl.classSession.date}</span>
                                                    <span className="text-zinc-500 ml-1">({cl.classSession.time || 'Horário padrão'})</span>
                                                    <span className="text-zinc-400 ml-1.5">• {cl.notes}</span>
                                                  </div>
                                                  <span className={`px-1.5 py-0.2 rounded font-semibold ${
                                                    cl.type === 'regular' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                                                    cl.type === 'makeup' ? 'bg-sky-50 text-sky-700 border border-sky-200' :
                                                    cl.type === 'cancelled_teacher_credit' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                                                    'bg-amber-50 text-amber-700 border border-amber-200'
                                                  }`}>
                                                    {cl.type === 'regular' ? 'Normal' : cl.type === 'makeup' ? 'Reposição' : cl.type === 'cancelled_teacher_credit' ? 'Crédito' : 'Requer Conferência'}
                                                  </span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}

                                        <div className="p-2 bg-purple-100/60 rounded-lg text-purple-900 text-[10px] leading-relaxed border border-purple-200/50">
                                          <span className="font-bold">Aviso importante:</span> Este valor é apenas uma <strong>PRÉ-VISUALIZAÇÃO</strong>. A cobrança atual cadastrada no sistema continua sendo <strong>{formatCurrency(gi.price)}</strong> até que a nova regra seja oficialmente autorizada.
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-semibold text-zinc-900">
                            {formatCurrency(item.totalAmount)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {item.paymentStatus === 'paid' ? (
                            <span className="px-2.5 py-1 inline-flex items-center text-xs leading-5 font-semibold rounded-full bg-emerald-100 text-emerald-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Pago ({formatCurrency(item.totalPaid)})
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 inline-flex items-center text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800">
                              <Clock className="w-3 h-3 mr-1" />
                              Pendente ({formatCurrency(item.totalPending)})
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          {canManagePayments && (
                            <div className="flex items-center justify-end space-x-2">
                              {!item.isPaid && (
                                <button 
                                  onClick={() => openPaymentModal(item.id, 'group')} 
                                  className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                >
                                  <DollarSign className="w-3.5 h-3.5 mr-1" />
                                  Baixar
                                </button>
                              )}
                              {item.totalPaid > 0 && (
                                <button 
                                  onClick={() => {
                                    const paidGi = item.groupItems.find((gi: any) => gi.isPaid) || item.groupItems[0];
                                    const groupTx = paidGi?.transaction;
                                    openCorrectionModal({
                                      studentName: item.name,
                                      itemDescription: `Mensalidade Grupo (${item.name})`,
                                      currentAmount: groupTx?.amount || paidGi?.price || item.price,
                                      transactionId: groupTx?.id,
                                      transactionDate: groupTx?.date,
                                      defaultDescription: `Mensalidade Grupo | ${item.id} | ${paidGi?.monthStr || selectedMonth.toString().padStart(2, '0')}/${paidGi?.yearStr || selectedYear} | ${item.name}`
                                    });
                                  }}
                                  className="inline-flex items-center px-3 py-1.5 border border-indigo-200 text-xs font-semibold rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 shadow-xs transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                                  Corrigir Valor
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  }

                  const billing = item.billing;
                  if (!billing) return null;

                  const { enrollmentsBilling, choirBilling } = billing;

                  let totalAmount = 0;
                  let totalPaid = 0;
                  let totalPending = 0;
                  let allPaid = true;
                  let anyPaid = false;

                  enrollmentsBilling.forEach(eb => {
                    totalAmount += eb.priceWithDiscount;
                    if (eb.isPaid) {
                      totalPaid += eb.transaction?.amount || eb.priceWithDiscount;
                      anyPaid = true;
                    } else {
                      totalPending += eb.priceWithDiscount;
                      allPaid = false;
                    }
                  });

                  choirBilling.forEach(cb => {
                    totalAmount += cb.monthlyFee;
                    if (cb.isPaid) {
                      totalPaid += cb.transaction?.amount || cb.monthlyFee;
                      anyPaid = true;
                    } else {
                      totalPending += cb.monthlyFee;
                      allPaid = false;
                    }
                  });

                  const paymentStatus = allPaid ? 'paid' : (anyPaid ? 'partial' : 'pending');

                  return (
                    <tr key={`student_${item.id}`} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-zinc-900 flex items-center gap-1.5">
                          <span>{item.name}</span>
                          {item.isInactiveStudent && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-700 border border-zinc-300">
                              Desmatriculado
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {item.hasPastPending && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                              Acumula mês anterior
                            </span>
                          )}
                          {(() => {
                            const studentCredits = (state.credits || []).filter(c => c.student_id === item.id && !c.group_id && c.status === 'available');
                            if (studentCredits.length === 0) return null;
                            const totalCred = studentCredits.reduce((s, c) => s + (c.amount || 0), 0);
                            return (
                              <button
                                type="button"
                                onClick={() => setIsCreditsModalOpen(true)}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition-colors"
                                title="Ver detalhes dos créditos deste aluno"
                              >
                                <CreditCard className="w-2.5 h-2.5 text-emerald-600" />
                                <span>Crédito: {studentCredits.length} aula(s) • {formatCurrency(totalCred)}</span>
                              </button>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-2">
                          {enrollmentsBilling.map(eb => (
                            <div key={eb.itemKey} className="space-y-1.5">
                              <div className="text-sm flex flex-wrap items-center gap-1.5">
                                <span className="font-medium text-zinc-850">{eb.plan.name}</span>
                                {eb.enrollment.status === 'inactive' && (
                                  <span className="text-[10px] font-medium text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                                    Matrícula Encerrada
                                  </span>
                                )}
                                <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                  Ref: {eb.refLabel}
                                </span>
                                <span className="text-zinc-400">|</span>
                                <span className="text-zinc-600">
                                  {eb.isRaphael && eb.raphaelRealBilling ? formatCurrency(eb.raphaelRealBilling.finalAmount) : formatCurrency(eb.priceWithDiscount)}
                                </span>
                                {eb.isRaphael && eb.raphaelRealBilling && (
                                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200" title="Cálculo real motor Raphael (Etapa 5)">
                                    Raphael Etapa 5
                                  </span>
                                )}
                                {eb.isPaid ? (
                                  <div className="inline-flex items-center gap-1">
                                    <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      Pago
                                    </span>
                                    {eb.isFrozen && (
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-cyan-50 text-cyan-800 border border-cyan-200" title="Competência congelada no snapshot">
                                        Congelado
                                      </span>
                                    )}
                                    {!eb.isFrozen && eb.isHistorical && (
                                      <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200" title="Valor comprovado por transação histórica">
                                        Histórico
                                      </span>
                                    )}
                                    {canManagePayments && (
                                      <button
                                        onClick={() => openCorrectionModal({
                                          studentName: item.name,
                                          itemDescription: `${eb.plan.name} (Ref: ${eb.refLabel})`,
                                          currentAmount: eb.transaction?.amount || (eb.isRaphael && eb.raphaelRealBilling ? eb.raphaelRealBilling.finalAmount : eb.priceWithDiscount),
                                          transactionId: eb.transaction?.id,
                                          transactionDate: eb.transaction?.date,
                                          defaultDescription: `Mensalidade | ${eb.enrollment.id} | ${eb.monthStr}/${eb.yearStr} | ${item.name} - ${eb.plan.name}`
                                        })}
                                        className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors inline-flex items-center gap-0.5 border border-indigo-200/60"
                                        title="Corrigir valor pago"
                                      >
                                        <Pencil className="w-2.5 h-2.5" /> Corrigir
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center gap-1">
                                    <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold ${eb.isPast ? 'bg-amber-100 text-amber-800 border border-amber-300 font-bold' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                      {eb.isPast ? 'Pendente (Anterior)' : 'Pendente'}
                                    </span>
                                    {canManagePayments && (
                                      <button
                                        onClick={() => {
                                          if (eb.isRaphael && eb.raphaelRealBilling) {
                                            openPaymentModal(item.id, 'student');
                                          } else {
                                            openCorrectionModal({
                                              studentName: item.name,
                                              itemDescription: `${eb.plan.name} (Ref: ${eb.refLabel})`,
                                              currentAmount: eb.priceWithDiscount,
                                              transactionId: undefined,
                                              transactionDate: new Date().toISOString().split('T')[0],
                                              defaultDescription: `Mensalidade | ${eb.enrollment.id} | ${eb.monthStr}/${eb.yearStr} | ${item.name} - ${eb.plan.name}`
                                            });
                                          }
                                        }}
                                        className="text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors inline-flex items-center gap-0.5 border border-emerald-200/60"
                                        title={eb.isRaphael ? "Baixar com confirmação e cálculo real Raphael" : "Registrar pagamento individual"}
                                      >
                                        <CheckCircle className="w-2.5 h-2.5" /> Baixar
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Preview Raphael special calculation if applicable */}
                              {eb.raphaelPreview && eb.raphaelPreview.isRaphaelRule && (
                                <div className="p-2.5 bg-purple-50/70 border border-purple-200/80 rounded-xl space-y-2 text-xs">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 font-semibold text-purple-900">
                                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                                      <span>Cálculo por aulas — Raphael <span className="text-[10px] font-normal text-purple-600">(Prévia)</span></span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => toggleRaphaelDetails(eb.itemKey)}
                                      className="text-[11px] font-medium text-purple-700 hover:text-purple-900 flex items-center gap-0.5 bg-purple-100/70 hover:bg-purple-200/80 px-2 py-0.5 rounded-md transition-colors"
                                    >
                                      {expandedRaphaelDetails[eb.itemKey] ? (
                                        <><span>Ocultar</span><ChevronUp className="w-3 h-3" /></>
                                      ) : (
                                        <><span>Conferir cálculo</span><ChevronDown className="w-3 h-3" /></>
                                      )}
                                    </button>
                                  </div>

                                  {/* Summary comparison row */}
                                  <div className="grid grid-cols-3 gap-2 bg-white/90 p-2 rounded-lg border border-purple-100 text-[11px]">
                                    <div>
                                      <span className="text-zinc-500 block text-[10px]">Valor Atual</span>
                                      <span className="font-semibold text-zinc-800">{formatCurrency(eb.basePrice)}</span>
                                    </div>
                                    <div>
                                      <span className="text-zinc-500 block text-[10px]">Novo Cálculo</span>
                                      <span className="font-bold text-purple-700">{formatCurrency(eb.raphaelPreview.finalMonthlyAmount)}</span>
                                    </div>
                                    <div>
                                      <span className="text-zinc-500 block text-[10px]">Diferença</span>
                                      <span className={`font-bold ${eb.raphaelPreview.differenceFromContract > 0 ? 'text-emerald-700' : eb.raphaelPreview.differenceFromContract < 0 ? 'text-amber-700' : 'text-zinc-600'}`}>
                                        {eb.raphaelPreview.differenceFromContract > 0 ? `+${formatCurrency(eb.raphaelPreview.differenceFromContract)}` : formatCurrency(eb.raphaelPreview.differenceFromContract)}
                                      </span>
                                    </div>
                                  </div>

                                  {/* Expanded details */}
                                  {expandedRaphaelDetails[eb.itemKey] && (
                                    <div className="pt-2 space-y-2 border-t border-purple-100 text-[11px] text-zinc-700">
                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                        <div className="bg-purple-100/40 p-2 rounded-lg">
                                          <span className="text-zinc-500 block text-[10px]">Preço contratado</span>
                                          <span className="font-semibold text-zinc-900">{formatCurrency(eb.raphaelPreview.monthlyBasePrice)}</span>
                                        </div>
                                        <div className="bg-purple-100/40 p-2 rounded-lg">
                                          <span className="text-zinc-500 block text-[10px]">Aulas-base</span>
                                          <span className="font-semibold text-zinc-900">{eb.raphaelPreview.baseLessons} aulas ({eb.plan.modality || 'quinzenal'})</span>
                                        </div>
                                        <div className="bg-purple-100/40 p-2 rounded-lg">
                                          <span className="text-zinc-500 block text-[10px]">Valor por aula</span>
                                          <span className="font-semibold text-zinc-900">{formatCurrency(eb.raphaelPreview.pricePerLesson)}</span>
                                        </div>
                                        <div className="bg-purple-100/40 p-2 rounded-lg">
                                          <span className="text-zinc-500 block text-[10px]">Aulas normais no mês</span>
                                          <span className="font-semibold text-zinc-900">{eb.raphaelPreview.regularLessons}</span>
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                                        <div className="bg-purple-100/40 p-2 rounded-lg">
                                          <span className="text-zinc-500 block text-[10px]">Reposições utilizadas</span>
                                          <span className="font-semibold text-zinc-900">{eb.raphaelPreview.makeupLessons} (créd. consumidos: {eb.raphaelPreview.creditsConsumed})</span>
                                        </div>
                                        <div className="bg-purple-100/40 p-2 rounded-lg">
                                          <span className="text-zinc-500 block text-[10px]">Créditos disponíveis</span>
                                          <span className="font-semibold text-zinc-900">{eb.raphaelPreview.creditsAvailable} ({eb.raphaelPreview.creditsRemaining} saldo)</span>
                                        </div>
                                        <div className="bg-purple-100/40 p-2 rounded-lg">
                                          <span className="text-zinc-500 block text-[10px]">Cancelamento Raphael</span>
                                          <span className="font-semibold text-zinc-900">{eb.raphaelPreview.cancelledLessonsEligibleForCredit} (+{eb.raphaelPreview.creditsGenerated} crédito)</span>
                                        </div>
                                        <div className="bg-purple-100/40 p-2 rounded-lg">
                                          <span className="text-zinc-500 block text-[10px]">Faltas do aluno</span>
                                          <span className="font-semibold text-zinc-900">{eb.raphaelPreview.studentAbsences} (cobrada)</span>
                                        </div>
                                      </div>

                                      {eb.raphaelPreview.hasUncreditedMakeup && (
                                        <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-start gap-1.5">
                                          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                          <div>
                                            <span className="font-bold">Aviso: </span>
                                            {eb.raphaelPreview.uncreditedMakeupWarning}
                                          </div>
                                        </div>
                                      )}

                                      <div className="text-[10px] text-purple-700/90 italic flex items-center gap-1 pt-0.5">
                                        <Info className="w-3 h-3 text-purple-500" />
                                        <span>Informação em modo pré-visualização. Nenhuma cobrança foi criada ou alterada no banco.</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                          {choirBilling.map(cb => (
                            <div key={cb.itemKey} className="text-sm flex flex-wrap items-center gap-1.5">
                              <span className="font-medium text-zinc-850">Coral</span>
                              <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                Ref: {cb.refLabel}
                              </span>
                              <span className="text-zinc-400">|</span>
                              <span className="text-zinc-600">{formatCurrency(cb.monthlyFee)}</span>
                              {cb.isPaid ? (
                                <div className="inline-flex items-center gap-1">
                                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    Pago
                                  </span>
                                  {cb.isFrozen && (
                                    <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-cyan-50 text-cyan-800 border border-cyan-200" title="Competência congelada no snapshot">
                                      Congelado
                                    </span>
                                  )}
                                  {!cb.isFrozen && cb.isHistorical && (
                                    <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200" title="Valor comprovado por transação histórica">
                                      Histórico
                                    </span>
                                  )}
                                  {canManagePayments && (
                                    <button
                                      onClick={() => openCorrectionModal({
                                        studentName: item.name,
                                        itemDescription: `Coral (Ref: ${cb.refLabel})`,
                                        currentAmount: cb.transaction?.amount || cb.monthlyFee,
                                        transactionId: cb.transaction?.id,
                                        transactionDate: cb.transaction?.date,
                                        defaultDescription: `Mensalidade Coral | ${cb.registration.id} | ${cb.monthStr}/${cb.yearStr} | ${item.name}`
                                      })}
                                      className="text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors inline-flex items-center gap-0.5 border border-indigo-200/60"
                                      title="Corrigir valor pago"
                                    >
                                      <Pencil className="w-2.5 h-2.5" /> Corrigir
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="inline-flex items-center gap-1">
                                  <span className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold ${cb.isPast ? 'bg-amber-100 text-amber-800 border border-amber-300 font-bold' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                    {cb.isPast ? 'Pendente (Anterior)' : 'Pendente'}
                                  </span>
                                  {canManagePayments && (
                                    <button
                                      onClick={() => openCorrectionModal({
                                        studentName: item.name,
                                        itemDescription: `Coral (Ref: ${cb.refLabel})`,
                                        currentAmount: cb.monthlyFee,
                                        transactionId: undefined,
                                        transactionDate: new Date().toISOString().split('T')[0],
                                        defaultDescription: `Mensalidade Coral | ${cb.registration.id} | ${cb.monthStr}/${cb.yearStr} | ${item.name}`
                                      })}
                                      className="text-emerald-600 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors inline-flex items-center gap-0.5 border border-emerald-200/60"
                                      title="Registrar pagamento do coral"
                                    >
                                      <CheckCircle className="w-2.5 h-2.5" /> Baixar
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-zinc-900">
                          {formatCurrency(totalAmount)}
                        </div>
                        {(enrollmentsBilling.length + choirBilling.length) > 1 && (
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            {enrollmentsBilling.length + choirBilling.length} atribuições somadas
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {paymentStatus === 'paid' && (
                          <span className="px-2.5 py-1 inline-flex items-center text-xs leading-5 font-semibold rounded-full bg-emerald-100 text-emerald-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Pago ({formatCurrency(totalPaid)})
                          </span>
                        )}
                        {paymentStatus === 'partial' && (
                          <span className="px-2.5 py-1 inline-flex items-center text-xs leading-5 font-semibold rounded-full bg-sky-100 text-sky-800">
                            <Clock className="w-3 h-3 mr-1" />
                            Parcial ({formatCurrency(totalPaid)} / {formatCurrency(totalAmount)})
                          </span>
                        )}
                        {paymentStatus === 'pending' && (
                          <span className="px-2.5 py-1 inline-flex items-center text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3 mr-1" />
                            Pendente ({formatCurrency(totalPending)})
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {canManagePayments && (
                          <div className="flex items-center justify-end space-x-2">
                            {!allPaid && (
                              <button 
                                onClick={() => openPaymentModal(item.id, 'student')} 
                                className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
                                title="Baixar pagamento pendente"
                              >
                                <DollarSign className="w-3.5 h-3.5 mr-1" />
                                Baixar
                              </button>
                            )}
                            {anyPaid && (
                              <button 
                                onClick={() => {
                                  const paidEb = enrollmentsBilling.find(e => e.isPaid);
                                  const paidCb = choirBilling.find(c => c.isPaid);
                                  if (paidEb) {
                                    openCorrectionModal({
                                      studentName: item.name,
                                      itemDescription: `${paidEb.plan.name} (Ref: ${paidEb.refLabel})`,
                                      currentAmount: paidEb.transaction?.amount || paidEb.priceWithDiscount,
                                      transactionId: paidEb.transaction?.id,
                                      transactionDate: paidEb.transaction?.date,
                                      defaultDescription: `Mensalidade | ${paidEb.enrollment.id} | ${paidEb.monthStr}/${paidEb.yearStr} | ${item.name} - ${paidEb.plan.name}`
                                    });
                                  } else if (paidCb) {
                                    openCorrectionModal({
                                      studentName: item.name,
                                      itemDescription: `Coral (Ref: ${paidCb.refLabel})`,
                                      currentAmount: paidCb.transaction?.amount || paidCb.monthlyFee,
                                      transactionId: paidCb.transaction?.id,
                                      transactionDate: paidCb.transaction?.date,
                                      defaultDescription: `Mensalidade Coral | ${paidCb.registration.id} | ${paidCb.monthStr}/${paidCb.yearStr} | ${item.name}`
                                    });
                                  }
                                }}
                                className="inline-flex items-center px-3 py-1.5 border border-indigo-200 text-xs font-semibold rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 shadow-xs transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5 mr-1 text-indigo-600" />
                                Corrigir Valor
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 text-sm">
                    Nenhum pagamento pendente ou ativo encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      <AnimatePresence>
        {isModalOpen && (selectedStudentId || selectedGroupId) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={closePaymentModal}
            />
            {(() => {
              const isRaphaelTarget = Boolean(
                (selectedGroupId && groupsBillingList.find(g => g.id === selectedGroupId)?.group.teacher_id === RAPHAEL_TEACHER_ID) ||
                (selectedStudentId && getStudentBilling(selectedStudentId)?.enrollmentsBilling.some(eb => eb.isRaphael && !eb.isPaid))
              );

              return (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className={`bg-white rounded-2xl shadow-xl w-full ${isRaphaelTarget ? 'max-w-2xl max-h-[90vh] flex flex-col' : 'max-w-md'} overflow-hidden relative z-10`}
                >
                  <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-zinc-900">Confirmar Pagamento</h3>
                      {isRaphaelTarget && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                          <Sparkles className="w-3 h-3 text-purple-600" />
                          Motor Real Raphael (Etapa 5)
                        </span>
                      )}
                    </div>
                    <button onClick={closePaymentModal} className="text-zinc-400 hover:text-zinc-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <form onSubmit={handlePayment} className={`p-6 space-y-6 ${isRaphaelTarget ? 'overflow-y-auto' : ''}`}>
                    {(() => {
                      if (selectedGroupId) {
                        const groupItem = groupsBillingList.find(g => g.id === selectedGroupId);
                        if (!groupItem) return null;

                        const unpaidGroupItems = groupItem.groupItems.filter(gi => !gi.isPaid);

                        return (
                          <div className="space-y-4">
                            <div className="text-sm font-medium text-zinc-700">
                              Baixando pagamentos para o grupo: <span className="font-bold text-zinc-950">{groupItem.name}</span>
                            </div>

                            <div className={`space-y-3 ${isRaphaelTarget ? '' : 'max-h-[250px] overflow-y-auto pr-1'}`}>
                              {unpaidGroupItems.map(gi => {
                                if (gi.raphaelRealBilling) {
                                  return (
                                    <RaphaelPaymentConfirmationCard
                                      key={gi.itemKey}
                                      itemKey={gi.itemKey}
                                      memory={gi.raphaelRealBilling}
                                      customAmount={customAmounts[gi.itemKey] ?? ''}
                                      customDiscount={customDiscounts[gi.itemKey] ?? ''}
                                      onAmountChange={(val) => handleAmountChange(gi.itemKey, gi.raphaelRealBilling!.finalAmount, val)}
                                      onDiscountChange={(val) => handleDiscountChange(gi.itemKey, gi.raphaelRealBilling!.grossAmount, val)}
                                    />
                                  );
                                }
                                return (
                                  <div key={gi.itemKey} className="p-3 border border-zinc-100 bg-zinc-50 rounded-xl space-y-2">
                                    <div className="flex justify-between text-xs text-zinc-600 font-medium">
                                      <span className="font-semibold">Mensalidade Grupo <span className="text-indigo-600">({gi.refLabel})</span></span>
                                      <span className="font-bold">Ref: {formatCurrency(gi.price)}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="block text-[11px] font-medium text-zinc-500 mb-1">Desconto (R$)</label>
                                        <div className="relative">
                                          <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-zinc-400 text-xs font-medium">R$</span>
                                          <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={customDiscounts[gi.itemKey] ?? ''}
                                            onChange={(e) => handleDiscountChange(gi.itemKey, gi.price, e.target.value)}
                                            className="w-full pl-8 pr-2 py-1.5 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-xs font-semibold text-emerald-700"
                                            placeholder="0,00"
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <label className="block text-[11px] font-medium text-zinc-500 mb-1">Valor a Receber</label>
                                        <div className="relative">
                                          <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-zinc-400 text-xs font-medium">R$</span>
                                          <input
                                            type="number"
                                            required
                                            min="0"
                                            step="0.01"
                                            value={customAmounts[gi.itemKey] ?? ''}
                                            onChange={(e) => handleAmountChange(gi.itemKey, gi.price, e.target.value)}
                                            className="w-full pl-8 pr-2 py-1.5 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-xs font-semibold text-zinc-800"
                                            placeholder="0,00"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {(() => {
                              let runningTotal = 0;
                              let totalRef = 0;
                              let totalDiscount = 0;
                              unpaidGroupItems.forEach(gi => {
                                const refAmount = gi.raphaelRealBilling ? gi.raphaelRealBilling.finalAmount : gi.price;
                                const val = parseFloat(customAmounts[gi.itemKey] || '0');
                                const disc = parseFloat(customDiscounts[gi.itemKey] || '0');
                                totalRef += refAmount;
                                runningTotal += isNaN(val) ? 0 : val;
                                totalDiscount += isNaN(disc) ? 0 : disc;
                              });

                              return (
                                <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-100 space-y-1.5">
                                  <div className="flex justify-between text-xs text-zinc-600 font-medium">
                                    <span>Valor Ref. Total:</span>
                                    <span className="font-semibold text-zinc-800">{formatCurrency(totalRef)}</span>
                                  </div>
                                  {totalDiscount > 0 && (
                                    <div className="flex justify-between text-xs text-emerald-700 font-medium">
                                      <span>Desconto Total:</span>
                                      <span className="font-semibold">- {formatCurrency(totalDiscount)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between font-bold text-base items-center pt-1 border-t border-indigo-100">
                                    <span className="text-zinc-900 text-xs font-semibold">Total a Receber:</span>
                                    <span className="text-indigo-600 font-bold text-lg">{formatCurrency(runningTotal)}</span>
                                  </div>
                                </div>
                              );
                            })()}

                            <div>
                              <label className="block text-sm font-medium text-zinc-700 mb-1">Data do Pagamento</label>
                              <input
                                type="date"
                                required
                                value={paymentDate}
                                onChange={e => setPaymentDate(e.target.value)}
                                className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                              />
                            </div>
                          </div>
                        );
                      }

                      if (!selectedStudentId) return null;
                      const billing = getStudentBilling(selectedStudentId);
                      if (!billing) return null;

                      const { student, enrollmentsBilling, choirBilling } = billing;
                      const unpaidEnrollments = enrollmentsBilling.filter(eb => !eb.isPaid);
                      const unpaidChoir = choirBilling.filter(cb => !cb.isPaid);

                      const paymentDay = parseInt(paymentDate.split('-')[2], 10);

                      return (
                        <div className="space-y-4">
                          <div className="text-sm font-medium text-zinc-700">
                            Baixando pagamentos para o aluno: <span className="font-bold text-zinc-950">{student.name}</span>
                          </div>

                          <div className={`space-y-3 ${isRaphaelTarget ? '' : 'max-h-[250px] overflow-y-auto pr-1'}`}>
                            {unpaidEnrollments.map(eb => {
                              if (eb.isRaphael && eb.raphaelRealBilling) {
                                return (
                                  <RaphaelPaymentConfirmationCard
                                    key={eb.itemKey}
                                    itemKey={eb.itemKey}
                                    memory={eb.raphaelRealBilling}
                                    customAmount={customAmounts[eb.itemKey] ?? ''}
                                    customDiscount={customDiscounts[eb.itemKey] ?? ''}
                                    onAmountChange={(val) => handleAmountChange(eb.itemKey, eb.raphaelRealBilling!.finalAmount, val)}
                                    onDiscountChange={(val) => handleDiscountChange(eb.itemKey, eb.raphaelRealBilling!.grossAmount, val)}
                                  />
                                );
                              }

                              const isEarly = eb.plan.allow_early_discount && paymentDay <= eb.plan.early_discount_deadline_day && !eb.isPast;
                              const refAmount = eb.priceWithDiscount - (isEarly ? eb.plan.early_discount_value : 0);

                              return (
                                <div key={eb.itemKey} className="p-3 border border-zinc-100 bg-zinc-50 rounded-xl space-y-2">
                                  <div className="flex justify-between text-xs text-zinc-600 font-medium">
                                    <span className="truncate max-w-[220px] font-semibold">
                                      {eb.plan.name} <span className="text-indigo-600">({eb.refLabel})</span> {isEarly && <span className="text-emerald-600 font-semibold">(Desconto Aplicado)</span>}
                                    </span>
                                    <span className="font-bold">Ref: {formatCurrency(refAmount)}</span>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[11px] font-medium text-zinc-500 mb-1">Desconto (R$)</label>
                                      <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-zinc-400 text-xs font-medium">R$</span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={customDiscounts[eb.itemKey] ?? ''}
                                          onChange={(e) => handleDiscountChange(eb.itemKey, refAmount, e.target.value)}
                                          className="w-full pl-8 pr-2 py-1.5 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-xs font-semibold text-emerald-700"
                                          placeholder="0,00"
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-medium text-zinc-500 mb-1">Valor a Receber</label>
                                      <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-zinc-400 text-xs font-medium">R$</span>
                                        <input
                                          type="number"
                                          required
                                          min="0"
                                          step="0.01"
                                          value={customAmounts[eb.itemKey] ?? ''}
                                          onChange={(e) => handleAmountChange(eb.itemKey, refAmount, e.target.value)}
                                          className="w-full pl-8 pr-2 py-1.5 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-xs font-semibold text-zinc-800"
                                          placeholder="0,00"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {unpaidChoir.map(cb => {
                              const refAmount = cb.monthlyFee;
                              return (
                                <div key={cb.itemKey} className="p-3 border border-zinc-100 bg-zinc-50 rounded-xl space-y-2">
                                  <div className="flex justify-between text-xs text-zinc-600 font-medium">
                                    <span className="font-semibold">Mensalidade Coral <span className="text-indigo-600">({cb.refLabel})</span></span>
                                    <span className="font-bold">Ref: {formatCurrency(refAmount)}</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="block text-[11px] font-medium text-zinc-500 mb-1">Desconto (R$)</label>
                                      <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-zinc-400 text-xs font-medium">R$</span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          value={customDiscounts[cb.itemKey] ?? ''}
                                          onChange={(e) => handleDiscountChange(cb.itemKey, refAmount, e.target.value)}
                                          className="w-full pl-8 pr-2 py-1.5 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-xs font-semibold text-emerald-700"
                                          placeholder="0,00"
                                        />
                                      </div>
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-medium text-zinc-500 mb-1">Valor a Receber</label>
                                      <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-zinc-400 text-xs font-medium">R$</span>
                                        <input
                                          type="number"
                                          required
                                          min="0"
                                          step="0.01"
                                          value={customAmounts[cb.itemKey] ?? ''}
                                          onChange={(e) => handleAmountChange(cb.itemKey, refAmount, e.target.value)}
                                          className="w-full pl-8 pr-2 py-1.5 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-xs font-semibold text-zinc-800"
                                          placeholder="0,00"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {(() => {
                            let runningTotal = 0;
                            let totalRef = 0;
                            let totalDiscount = 0;

                            unpaidEnrollments.forEach(eb => {
                              const isEarly = eb.plan.allow_early_discount && paymentDay <= eb.plan.early_discount_deadline_day && !eb.isPast;
                              const standardRef = eb.priceWithDiscount - (isEarly ? eb.plan.early_discount_value : 0);
                              const refAmount = eb.isRaphael && eb.raphaelRealBilling ? eb.raphaelRealBilling.finalAmount : standardRef;
                              const val = parseFloat(customAmounts[eb.itemKey] || '0');
                              const disc = parseFloat(customDiscounts[eb.itemKey] || '0');
                              totalRef += refAmount;
                              runningTotal += isNaN(val) ? 0 : val;
                              totalDiscount += isNaN(disc) ? 0 : disc;
                            });

                            unpaidChoir.forEach(cb => {
                              const refAmount = cb.monthlyFee;
                              const val = parseFloat(customAmounts[cb.itemKey] || '0');
                              const disc = parseFloat(customDiscounts[cb.itemKey] || '0');
                              totalRef += refAmount;
                              runningTotal += isNaN(val) ? 0 : val;
                              totalDiscount += isNaN(disc) ? 0 : disc;
                            });

                            return (
                              <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-100 space-y-1.5">
                                <div className="flex justify-between text-xs text-zinc-600 font-medium">
                                  <span>Valor Ref. Total:</span>
                                  <span className="font-semibold text-zinc-800">{formatCurrency(totalRef)}</span>
                                </div>
                                {totalDiscount > 0 && (
                                  <div className="flex justify-between text-xs text-emerald-700 font-medium">
                                    <span>Desconto Total:</span>
                                    <span className="font-semibold">- {formatCurrency(totalDiscount)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between font-bold text-base items-center pt-1 border-t border-indigo-100">
                                  <span className="text-zinc-900 text-xs font-semibold">Total a Receber:</span>
                                  <span className="text-indigo-600 font-bold text-lg">{formatCurrency(runningTotal)}</span>
                                </div>
                              </div>
                            );
                          })()}

                          <div>
                            <label className="block text-sm font-medium text-zinc-700 mb-1">Data do Pagamento</label>
                            <input
                              type="date"
                              required
                              value={paymentDate}
                              onChange={e => setPaymentDate(e.target.value)}
                              className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                            />
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 shrink-0">
                      <button
                        type="button"
                        onClick={closePaymentModal}
                        className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className={`px-4 py-2 text-sm font-bold text-white ${
                          isRaphaelTarget
                            ? 'bg-purple-700 hover:bg-purple-800 focus:ring-purple-500 shadow-sm'
                            : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
                        } border border-transparent rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors flex items-center gap-1.5`}
                      >
                        {isRaphaelTarget ? (
                          <>
                            <ShieldCheck className="w-4 h-4" />
                            <span>Confirmar Baixa com Cálculo Real</span>
                          </>
                        ) : (
                          <span>Confirmar Recebimento</span>
                        )}
                      </button>
                    </div>
                  </form>
                </motion.div>
              );
            })()}
          </div>
        )}
      </AnimatePresence>

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
                    <p className="text-xs text-zinc-500">Ajuste manual do valor do pagamento registrado</p>
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
                  <div className="text-zinc-600">Item: <strong className="text-indigo-900 font-semibold">{correctionTarget.itemDescription}</strong></div>
                  <div className="text-zinc-600">Valor Atual Registrado: <strong className="text-zinc-900 font-bold">{formatCurrency(correctionTarget.currentAmount)}</strong></div>
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
                      value={correctedAmountInput}
                      onChange={(e) => setCorrectedAmountInput(e.target.value)}
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
      {/* Raphael Billing Simulator Modal */}
      <RaphaelBillingSimulatorModal
        isOpen={isSimulatorModalOpen}
        onClose={() => setIsSimulatorModalOpen(false)}
      />
      {/* Raphael Credits Modal (Stage 4) */}
      <RaphaelCreditsModal
        isOpen={isCreditsModalOpen}
        onClose={() => setIsCreditsModalOpen(false)}
      />
      {/* Raphael Stage 5 Validation Tests Modal */}
      <RaphaelStage5TestsModal
        isOpen={isStage5TestsModalOpen}
        onClose={() => setIsStage5TestsModalOpen(false)}
      />
      {/* Historical Regularization Modal (Etapa 5) */}
      <HistoricalRegularizationModal
        isOpen={isHistoricalRegularizationModalOpen}
        onClose={() => setIsHistoricalRegularizationModalOpen(false)}
      />
    </div>
  );
};
