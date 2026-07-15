import React, { useState } from 'react';
import { useAppStore } from '../store';
import { Search, CheckCircle, Clock, DollarSign, X, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Payments: React.FC = () => {
  const { state, addTransaction, currentUserProfile } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<'to_pay' | 'paid' | 'all'>('to_pay');

  const getStudentBilling = (studentId: string) => {
    const student = state.students.find(s => s.id === studentId);
    if (!student) return null;

    const activeEnrollments = state.enrollments.filter(e => {
      if (e.student_id !== studentId || e.status !== 'active') return false;
      if (e.group_id) {
        const group = state.groups.find(g => g.id === e.group_id);
        if (group && group.payment_type === 'group') {
          return false; // Skip billing individually for group-level payment
        }
      }
      return true;
    });
    const approvedChoir = state.choirRegistrations.find(r => r.student_id === studentId && r.status === 'approved');

    const monthStr = selectedMonth.toString().padStart(2, '0');

    // Calculate enrollments billing
    const enrollmentsBilling = activeEnrollments.map(e => {
      const plan = state.financialPlans.find(p => p.id === e.plan_id);
      if (!plan) return null;

      const basePrice = e.custom_price !== undefined ? e.custom_price : plan.base_price;
      let crossDiscount = 0;

      // Cross discount calculation: check other active enrollments (excluding this one)
      const otherActiveEnrollments = activeEnrollments.filter(oe => oe.id !== e.id);
      const otherPlanIds = otherActiveEnrollments.map(oe => oe.plan_id);
      const applicableRules = state.discountRules.filter(r => 
        otherPlanIds.includes(r.trigger_plan_id) && r.target_plan_id === plan.id
      );
      applicableRules.forEach(rule => {
        crossDiscount += rule.discount_value;
      });

      const priceWithDiscount = Math.max(0, basePrice - crossDiscount);

      // Check if paid
      const descPattern = `Mensalidade | ${e.id} | ${monthStr}/${selectedYear}`;
      const transaction = state.transactions.find(t => 
        t.type === 'income' && 
        t.description.includes(descPattern) &&
        t.status === 'completed'
      );

      return {
        enrollment: e,
        plan,
        basePrice,
        crossDiscount,
        priceWithDiscount,
        isPaid: !!transaction,
        transaction,
      };
    }).filter(Boolean);

    // Calculate Choir billing
    let choirBilling = null;
    if (approvedChoir) {
      const choirPaidTransaction = state.transactions.find(t => 
        t.type === 'income' && 
        t.status === 'completed' &&
        t.description.includes(`${monthStr}/${selectedYear}`) &&
        t.description.includes(student.name) &&
        (t.description.includes('+ Coral') || t.description.includes('Coral |') || t.description.includes('Inscrição Coral') || t.description.includes('Mensalidade Coral'))
      );

      choirBilling = {
        registration: approvedChoir,
        monthlyFee: approvedChoir.monthly_fee,
        isPaid: !!choirPaidTransaction,
        transaction: choirPaidTransaction,
      };
    }

    return {
      student,
      enrollmentsBilling: enrollmentsBilling as Array<{
        enrollment: any;
        plan: any;
        basePrice: number;
        crossDiscount: number;
        priceWithDiscount: number;
        isPaid: boolean;
        transaction: any;
      }>,
      choirBilling,
    };
  };

  const monthStr = selectedMonth.toString().padStart(2, '0');

  // Groups with unified payment
  const groupsWithBilling = state.groups.filter(g => g.payment_type === 'group');

  // Get all students with active enrollment or approved choir registration
  const studentsWithBilling = state.students.filter(student => {
    if (student.not_eligible || student.status === 'inactive') return false;
    const hasActiveEnrollment = state.enrollments.some(e => {
      if (e.student_id !== student.id || e.status !== 'active') return false;
      if (e.group_id) {
        const group = state.groups.find(g => g.id === e.group_id);
        if (group && group.payment_type === 'group') {
          return false;
        }
      }
      return true;
    });
    const hasApprovedChoir = state.choirRegistrations.some(r => r.student_id === student.id && r.status === 'approved');
    return hasActiveEnrollment || hasApprovedChoir;
  });

  const groupsBillingList = groupsWithBilling.map(group => {
    const descPattern = `Mensalidade Grupo | ${group.id} | ${monthStr}/${selectedYear}`;
    const transaction = state.transactions.find(t => 
      t.type === 'income' && 
      t.description.includes(descPattern) &&
      t.status === 'completed'
    );
    const isPaid = !!transaction;
    return {
      id: group.id,
      type: 'group' as const,
      name: group.name,
      price: group.price || 0,
      isPaid,
      transaction,
      group,
      totalAmount: group.price || 0,
      totalPaid: isPaid ? (group.price || 0) : 0,
      totalPending: isPaid ? 0 : (group.price || 0),
      paymentStatus: isPaid ? 'paid' as const : 'pending' as const,
    };
  });

  const studentsBillingList = studentsWithBilling.map(student => {
    const billing = getStudentBilling(student.id);
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

    if (choirBilling) {
      totalAmount += choirBilling.monthlyFee;
      if (choirBilling.isPaid) {
        totalPaid += choirBilling.transaction?.amount || choirBilling.monthlyFee;
        anyPaid = true;
      } else {
        totalPending += choirBilling.monthlyFee;
        allPaid = false;
      }
    }

    const paymentStatus = allPaid ? 'paid' as const : (anyPaid ? 'partial' : 'pending' as const);

    return {
      id: student.id,
      type: 'student' as const,
      name: student.name,
      billing,
      totalAmount,
      totalPaid,
      totalPending,
      paymentStatus,
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);

  const allBillingItems = [
    ...groupsBillingList,
    ...studentsBillingList,
  ];

  const filteredBillingItems = allBillingItems.filter(item => {
    // 1. Filter by payment status
    if (statusFilter === 'to_pay' && item.paymentStatus === 'paid') return false;
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
  };

  React.useEffect(() => {
    if (!isModalOpen) return;
    if (selectedGroupId) {
      const group = state.groups.find(g => g.id === selectedGroupId);
      const initialAmount = group?.price !== undefined ? group.price.toString() : '';
      setCustomAmounts({
        [`group_${selectedGroupId}`]: initialAmount
      });
    } else if (selectedStudentId) {
      const billing = getStudentBilling(selectedStudentId);
      const initialAmounts: Record<string, string> = {};
      if (billing) {
        const paymentDay = parseInt(paymentDate.split('-')[2], 10);
        billing.enrollmentsBilling.forEach(eb => {
          if (!eb.isPaid) {
            let amount = eb.priceWithDiscount;
            if (eb.plan.allow_early_discount && paymentDay <= eb.plan.early_discount_deadline_day) {
              amount -= eb.plan.early_discount_value;
            }
            initialAmounts[`enrollment_${eb.enrollment.id}`] = amount.toString();
          }
        });
        if (billing.choirBilling && !billing.choirBilling.isPaid) {
          initialAmounts[`choir_${billing.choirBilling.registration.id}`] = billing.choirBilling.monthlyFee.toString();
        }
      }
      setCustomAmounts(initialAmounts);
    }
  }, [paymentDate, selectedStudentId, selectedGroupId, isModalOpen]);

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedGroupId) {
      const group = state.groups.find(g => g.id === selectedGroupId);
      if (group) {
        const customPriceStr = customAmounts[`group_${group.id}`];
        const finalAmount = customPriceStr !== undefined && customPriceStr !== '' ? parseFloat(customPriceStr) : (group.price || 0);

        addTransaction({
          type: 'income',
          amount: finalAmount,
          description: `Mensalidade Grupo | ${group.id} | ${monthStr}/${selectedYear} | ${group.name}`,
          date: paymentDate,
          status: 'completed'
        });
      }
      closePaymentModal();
      return;
    }

    if (!selectedStudentId) return;

    const billing = getStudentBilling(selectedStudentId);
    if (!billing) return;

    const { student, enrollmentsBilling, choirBilling } = billing;

    // Register transaction for each unpaid enrollment
    enrollmentsBilling.forEach(eb => {
      if (!eb.isPaid) {
        const customPriceStr = customAmounts[`enrollment_${eb.enrollment.id}`];
        const amountToPay = customPriceStr !== undefined && customPriceStr !== '' ? parseFloat(customPriceStr) : eb.priceWithDiscount;

        addTransaction({
          type: 'income',
          amount: amountToPay,
          description: `Mensalidade | ${eb.enrollment.id} | ${monthStr}/${selectedYear} | ${student.name} - ${eb.plan.name}`,
          date: paymentDate,
          status: 'completed'
        });
      }
    });

    // Register transaction for unpaid Choir
    if (choirBilling && !choirBilling.isPaid) {
      const customPriceStr = customAmounts[`choir_${choirBilling.registration.id}`];
      const amountToPay = customPriceStr !== undefined && customPriceStr !== '' ? parseFloat(customPriceStr) : choirBilling.monthlyFee;

      addTransaction({
        type: 'income',
        amount: amountToPay,
        description: `Mensalidade Coral | ${choirBilling.registration.id} | ${monthStr}/${selectedYear} | ${student.name}`,
        date: paymentDate,
        status: 'completed'
      });
    }

    closePaymentModal();
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Baixa de Pagamentos</h1>
          <p className="text-sm text-zinc-500 mt-1">Gerencie os pagamentos mensais consolidados por aluno ou grupo.</p>
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
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 mt-1">
                                Grupo / Turma
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1.5">
                            <div className="text-sm flex items-center space-x-2">
                              <span className="font-medium text-zinc-850">Mensalidade Unificada</span>
                              <span className="text-zinc-400">|</span>
                              <span className="text-zinc-600">{formatCurrency(item.price)}</span>
                              {item.isPaid ? (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Pago</span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">Pendente</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-semibold text-zinc-900">
                            {formatCurrency(item.price)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {item.isPaid ? (
                            <span className="px-2.5 py-1 inline-flex items-center text-xs leading-5 font-semibold rounded-full bg-emerald-100 text-emerald-800">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Pago ({formatCurrency(item.price)})
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 inline-flex items-center text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800">
                              <Clock className="w-3 h-3 mr-1" />
                              Pendente ({formatCurrency(item.price)})
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          {currentUserProfile?.role === "super_admin" && !item.isPaid && (
                            <button 
                              onClick={() => openPaymentModal(item.id, 'group')} 
                              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                              <DollarSign className="w-3.5 h-3.5 mr-1" />
                              Baixar
                            </button>
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

                  if (choirBilling) {
                    totalAmount += choirBilling.monthlyFee;
                    if (choirBilling.isPaid) {
                      totalPaid += choirBilling.transaction?.amount || choirBilling.monthlyFee;
                      anyPaid = true;
                    } else {
                      totalPending += choirBilling.monthlyFee;
                      allPaid = false;
                    }
                  }

                  const paymentStatus = allPaid ? 'paid' : (anyPaid ? 'partial' : 'pending');

                  return (
                    <tr key={`student_${item.id}`} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-zinc-900">{item.name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-1.5">
                          {enrollmentsBilling.map(eb => (
                            <div key={eb.enrollment.id} className="text-sm flex items-center space-x-2">
                              <span className="font-medium text-zinc-850">{eb.plan.name}</span>
                              <span className="text-zinc-400">|</span>
                              <span className="text-zinc-600">{formatCurrency(eb.priceWithDiscount)}</span>
                              {eb.isPaid ? (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Pago</span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">Pendente</span>
                              )}
                            </div>
                          ))}
                          {choirBilling && (
                            <div className="text-sm flex items-center space-x-2">
                              <span className="font-medium text-zinc-850">Coral</span>
                              <span className="text-zinc-400">|</span>
                              <span className="text-zinc-600">{formatCurrency(choirBilling.monthlyFee)}</span>
                              {choirBilling.isPaid ? (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">Pago</span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">Pendente</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-zinc-900">
                          {formatCurrency(totalAmount)}
                        </div>
                        {(enrollmentsBilling.length + (choirBilling ? 1 : 0)) > 1 && (
                          <div className="text-[10px] text-zinc-400 mt-0.5">
                            {enrollmentsBilling.length + (choirBilling ? 1 : 0)} atribuições somadas
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
                        {currentUserProfile?.role === "super_admin" && paymentStatus !== 'paid' && (
                          <button 
                            onClick={() => openPaymentModal(item.id, 'student')} 
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                          >
                            <DollarSign className="w-3.5 h-3.5 mr-1" />
                            Baixar
                          </button>
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
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-zinc-900">Confirmar Pagamento</h3>
                <button onClick={closePaymentModal} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handlePayment} className="p-6 space-y-6">
                {(() => {
                  if (selectedGroupId) {
                    const group = state.groups.find(g => g.id === selectedGroupId);
                    if (!group) return null;

                    const price = group.price || 0;
                    const customGroupVal = customAmounts[`group_${group.id}`] || '';
                    const customGroupNum = parseFloat(customGroupVal || '0');

                    return (
                      <div className="space-y-4">
                        <div className="text-sm font-medium text-zinc-700">
                          Baixando pagamentos para o grupo: <span className="font-bold text-zinc-950">{group.name}</span>
                        </div>

                        <div className="space-y-1.5">
                          <label className="block text-sm font-medium text-zinc-700">Valor do Pagamento (R$)</label>
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400 text-sm">R$</span>
                            <input
                              type="number"
                              required
                              min="0"
                              step="0.01"
                              value={customGroupVal}
                              onChange={(e) => setCustomAmounts({
                                ...customAmounts,
                                [`group_${group.id}`]: e.target.value
                              })}
                              className="w-full pl-9 pr-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm font-semibold text-zinc-900"
                              placeholder="Digite o valor pago"
                            />
                          </div>
                        </div>

                        <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-500 font-medium">Valor de Referência</span>
                            <span className="font-medium text-zinc-900">{formatCurrency(price)}</span>
                          </div>
                          <div className="pt-2 border-t border-zinc-200 flex justify-between font-bold text-lg">
                            <span className="text-zinc-900">Total a Lançar:</span>
                            <span className="text-indigo-600">{formatCurrency(customGroupNum)}</span>
                          </div>
                        </div>

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
                  const unpaidChoir = choirBilling && !choirBilling.isPaid ? choirBilling : null;

                  const paymentDay = parseInt(paymentDate.split('-')[2], 10);

                  return (
                    <div className="space-y-4">
                      <div className="text-sm font-medium text-zinc-700">
                        Baixando pagamentos para o aluno: <span className="font-bold text-zinc-950">{student.name}</span>
                      </div>

                      <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                        {unpaidEnrollments.map(eb => {
                          const isEarly = eb.plan.allow_early_discount && paymentDay <= eb.plan.early_discount_deadline_day;
                          const refAmount = eb.priceWithDiscount - (isEarly ? eb.plan.early_discount_value : 0);

                          return (
                            <div key={eb.enrollment.id} className="p-3 border border-zinc-100 bg-zinc-50 rounded-xl space-y-2">
                              <div className="flex justify-between text-xs text-zinc-500 font-medium">
                                <span className="truncate max-w-[220px]">
                                  {eb.plan.name} {isEarly && <span className="text-emerald-600 font-semibold">(Desconto Aplicado)</span>}
                                </span>
                                <span>Ref: {formatCurrency(refAmount)}</span>
                              </div>
                              <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400 text-sm">R$</span>
                                <input
                                  type="number"
                                  required
                                  min="0"
                                  step="0.01"
                                  value={customAmounts[`enrollment_${eb.enrollment.id}`] || ''}
                                  onChange={(e) => setCustomAmounts({
                                    ...customAmounts,
                                    [`enrollment_${eb.enrollment.id}`]: e.target.value
                                  })}
                                  className="w-full pl-9 pr-3 py-1.5 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm font-semibold text-zinc-800"
                                  placeholder="Digite o valor"
                                />
                              </div>
                            </div>
                          );
                        })}

                        {unpaidChoir && (() => {
                          const refAmount = unpaidChoir.monthlyFee;
                          return (
                            <div className="p-3 border border-zinc-100 bg-zinc-50 rounded-xl space-y-2">
                              <div className="flex justify-between text-xs text-zinc-500 font-medium">
                                <span>Mensalidade Coral</span>
                                <span>Ref: {formatCurrency(refAmount)}</span>
                              </div>
                              <div className="relative">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-zinc-400 text-sm">R$</span>
                                <input
                                  type="number"
                                  required
                                  min="0"
                                  step="0.01"
                                  value={customAmounts[`choir_${unpaidChoir.registration.id}`] || ''}
                                  onChange={(e) => setCustomAmounts({
                                    ...customAmounts,
                                    [`choir_${unpaidChoir.registration.id}`]: e.target.value
                                  })}
                                  className="w-full pl-9 pr-3 py-1.5 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm font-semibold text-zinc-800"
                                  placeholder="Digite o valor"
                                />
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      {(() => {
                        let runningTotal = 0;
                        unpaidEnrollments.forEach(eb => {
                          const val = parseFloat(customAmounts[`enrollment_${eb.enrollment.id}`] || '0');
                          runningTotal += isNaN(val) ? 0 : val;
                        });
                        if (unpaidChoir) {
                          const val = parseFloat(customAmounts[`choir_${unpaidChoir.registration.id}`] || '0');
                          runningTotal += isNaN(val) ? 0 : val;
                        }

                        return (
                          <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex justify-between font-bold text-lg items-center">
                            <span className="text-zinc-900 text-sm font-semibold">Total a Receber:</span>
                            <span className="text-indigo-600">{formatCurrency(runningTotal)}</span>
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

                <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={closePaymentModal}
                    className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Confirmar Recebimento
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
