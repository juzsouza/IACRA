import React, { useState } from 'react';
import { useAppStore, Enrollment } from '../store';
import { Search, CheckCircle, Clock, DollarSign, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Payments: React.FC = () => {
  const { state, addTransaction } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEnrollment, setSelectedEnrollment] = useState<Enrollment | null>(null);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [useCustomAmount, setUseCustomAmount] = useState(false);

  const calculateBreakdown = (planId: string, studentId: string, currentEnrollmentId?: string, customPrice?: number) => {
    const plan = state.financialPlans.find(p => p.id === planId);
    if (!plan) return null;

    let basePrice = customPrice !== undefined ? customPrice : plan.base_price;
    let totalDiscount = 0;
    let choirFee = 0;
    let hasChoir = false;

    // Cross discounts and Choir fee
    if (studentId) {
      const activeChoir = state.choirRegistrations.find(r => r.student_id === studentId && r.status === 'approved');
      if (activeChoir) {
        // Check if choir fee was already paid this month
        const monthStr = selectedMonth.toString().padStart(2, '0');
        const choirAlreadyPaid = state.transactions.some(t => 
          t.type === 'income' && 
          t.status === 'completed' &&
          t.description.includes(`| ${monthStr}/${selectedYear} |`) &&
          t.description.includes(state.students.find(s => s.id === studentId)?.name || '') &&
          t.description.includes('+ Coral')
        );

        if (!choirAlreadyPaid) {
          choirFee = activeChoir.monthly_fee;
          hasChoir = true;
        }
      }

      const studentEnrollments = state.enrollments.filter(e => 
        e.student_id === studentId && 
        e.status === 'active' && 
        e.id !== currentEnrollmentId
      );
      const activePlanIds = studentEnrollments.map(e => e.plan_id);

      const applicableRules = state.discountRules.filter(r => 
        activePlanIds.includes(r.trigger_plan_id) && 
        r.target_plan_id === plan.id
      );

      applicableRules.forEach(rule => {
        totalDiscount += rule.discount_value;
      });
    }

    const finalPrice = basePrice - totalDiscount + choirFee;
    return { basePrice, finalPrice, totalDiscount, plan, choirFee, hasChoir };
  };

  const getPaymentStatus = (enrollmentId: string) => {
    const monthStr = selectedMonth.toString().padStart(2, '0');
    const descPattern = `Mensalidade | ${enrollmentId} | ${monthStr}/${selectedYear}`;
    const transaction = state.transactions.find(t => 
      t.type === 'income' && 
      t.description.includes(descPattern) &&
      t.status === 'completed'
    );
    return transaction;
  };

  const filteredEnrollments = state.enrollments.filter(e => {
    if (e.status !== 'active') return false;
    const student = state.students.find(s => s.id === e.student_id);
    const plan = state.financialPlans.find(p => p.id === e.plan_id);
    return (
      student?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plan?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const openPaymentModal = (enrollment: Enrollment) => {
    setSelectedEnrollment(enrollment);
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setCustomAmount('');
    setUseCustomAmount(false);
    setIsModalOpen(true);
  };

  const closePaymentModal = () => {
    setIsModalOpen(false);
    setSelectedEnrollment(null);
    setCustomAmount('');
    setUseCustomAmount(false);
  };

  const handlePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnrollment) return;

    const breakdown = calculateBreakdown(selectedEnrollment.plan_id, selectedEnrollment.student_id, selectedEnrollment.id, selectedEnrollment.custom_price);
    if (!breakdown) return;

    const { finalPrice, plan } = breakdown;
    let amountToPay = finalPrice;

    // Check early discount
    const paymentDay = parseInt(paymentDate.split('-')[2], 10);
    if (plan.allow_early_discount && paymentDay <= plan.early_discount_deadline_day) {
      amountToPay -= plan.early_discount_value;
    }

    if (useCustomAmount && customAmount !== '') {
      amountToPay = parseFloat(customAmount);
    }

    const monthStr = selectedMonth.toString().padStart(2, '0');
    const student = state.students.find(s => s.id === selectedEnrollment.student_id);

    const descriptionSuffix = breakdown.hasChoir ? ` + Coral` : '';

    addTransaction({
      type: 'income',
      amount: amountToPay,
      description: `Mensalidade | ${selectedEnrollment.id} | ${monthStr}/${selectedYear} | ${student?.name} - ${plan.name}${descriptionSuffix}`,
      date: paymentDate,
      status: 'completed'
    });

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
          <p className="text-sm text-zinc-500 mt-1">Gerencie os pagamentos mensais das matrículas ativas.</p>
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
              placeholder="Buscar por aluno ou plano..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl leading-5 bg-zinc-50 placeholder-zinc-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
            />
          </div>
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
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Aluno</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Plano</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Vencimento</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
              {filteredEnrollments.length > 0 ? (
                filteredEnrollments.map((enrollment) => {
                  const student = state.students.find(s => s.id === enrollment.student_id);
                  const plan = state.financialPlans.find(p => p.id === enrollment.plan_id);
                  const payment = getPaymentStatus(enrollment.id);

                  return (
                    <tr key={enrollment.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-zinc-900">{student?.name || 'Desconhecido'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900">{plan?.name || 'Desconhecido'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900">Dia {enrollment.due_date_day}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {payment ? (
                          <span className="px-2.5 py-1 inline-flex items-center text-xs leading-5 font-medium rounded-full bg-emerald-100 text-emerald-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Pago ({formatCurrency(payment.amount)})
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 inline-flex items-center text-xs leading-5 font-medium rounded-full bg-amber-100 text-amber-800">
                            <Clock className="w-3 h-3 mr-1" />
                            Pendente
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {!payment && (
                          <button 
                            onClick={() => openPaymentModal(enrollment)} 
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
                    Nenhuma matrícula ativa encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      <AnimatePresence>
        {isModalOpen && selectedEnrollment && (
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
                  const breakdown = calculateBreakdown(selectedEnrollment.plan_id, selectedEnrollment.student_id, selectedEnrollment.id, selectedEnrollment.custom_price);
                  if (!breakdown) return null;

                  const { finalPrice, plan } = breakdown;
                  let amountToPay = finalPrice;
                  const paymentDay = parseInt(paymentDate.split('-')[2], 10);
                  const isEarly = plan.allow_early_discount && paymentDay <= plan.early_discount_deadline_day;
                  
                  if (isEarly) {
                    amountToPay -= plan.early_discount_value;
                  }

                  return (
                    <div className="space-y-4">
                      <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-100 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-500">Valor Base:</span>
                          <span className="font-medium text-zinc-900">{formatCurrency(breakdown.basePrice)}</span>
                        </div>
                        {breakdown.totalDiscount > 0 && (
                          <div className="flex justify-between text-sm text-emerald-600">
                            <span>Desconto Cruzado:</span>
                            <span>-{formatCurrency(breakdown.totalDiscount)}</span>
                          </div>
                        )}
                        {breakdown.hasChoir && (
                          <div className="flex justify-between text-sm text-indigo-600">
                            <span>Adicional Coral:</span>
                            <span>+{formatCurrency(breakdown.choirFee)}</span>
                          </div>
                        )}
                        {isEarly && (
                          <div className="flex justify-between text-sm text-emerald-600">
                            <span>Desconto Antecipação (até dia {plan.early_discount_deadline_day}):</span>
                            <span>-{formatCurrency(plan.early_discount_value)}</span>
                          </div>
                        )}
                        <div className="pt-2 border-t border-zinc-200 flex justify-between font-semibold text-lg">
                          <span className="text-zinc-900">Total Calculado:</span>
                          <span className="text-indigo-600">{formatCurrency(amountToPay)}</span>
                        </div>
                      </div>

                      <div>
                        <label className="flex items-center space-x-2 text-sm font-medium text-zinc-700 mb-2">
                          <input
                            type="checkbox"
                            checked={useCustomAmount}
                            onChange={(e) => {
                              setUseCustomAmount(e.target.checked);
                              if (e.target.checked && customAmount === '') {
                                setCustomAmount(amountToPay.toString());
                              }
                            }}
                            className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>Alterar valor do recebimento</span>
                        </label>
                        
                        {useCustomAmount && (
                          <div className="mt-2 relative rounded-xl shadow-sm">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                              <span className="text-zinc-500 sm:text-sm">R$</span>
                            </div>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              required={useCustomAmount}
                              value={customAmount}
                              onChange={(e) => setCustomAmount(e.target.value)}
                              className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm outline-none transition-colors"
                              placeholder="0,00"
                            />
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">Data do Pagamento</label>
                        <input
                          type="date"
                          required
                          value={paymentDate}
                          onChange={e => setPaymentDate(e.target.value)}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                        />
                        {plan.allow_early_discount && (
                          <p className="mt-1 text-xs text-zinc-500">
                            Pagando até o dia {plan.early_discount_deadline_day}, o desconto de antecipação é aplicado.
                          </p>
                        )}
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
