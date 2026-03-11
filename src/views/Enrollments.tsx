import React, { useState } from 'react';
import { useAppStore, Enrollment, FinancialPlan } from '../store';
import { Plus, Search, Edit2, Trash2, X, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Enrollments: React.FC = () => {
  const { state, addEnrollment, updateEnrollment, deleteEnrollment } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEnrollment, setEditingEnrollment] = useState<Enrollment | null>(null);

  const [formData, setFormData] = useState<Omit<Enrollment, 'id'>>({
    student_id: '',
    plan_id: '',
    teacher_id: '',
    group_id: '',
    custom_price: undefined,
    status: 'active',
    enrollment_date: new Date().toISOString().split('T')[0],
    due_date_day: 5,
  });

  const filteredEnrollments = state.enrollments.filter(e => {
    const student = state.students.find(s => s.id === e.student_id);
    const plan = state.financialPlans.find(p => p.id === e.plan_id);
    return (
      student?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      plan?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const calculateBreakdown = (planId: string, studentId: string, currentEnrollmentId?: string, customPrice?: number) => {
    const plan = state.financialPlans.find(p => p.id === planId);
    if (!plan) return null;

    let basePrice = customPrice !== undefined ? customPrice : plan.base_price;
    let schoolShare = plan.school_fee_value;
    let teacherShare = plan.teacher_fee_type === 'percentage' ? (basePrice * plan.teacher_fee_value / 100) : plan.teacher_fee_value;
    let secretaryShare = plan.secretary_fee_value;
    
    let totalDiscount = 0;
    let schoolDiscount = 0;

    // Cross discounts
    if (studentId) {
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
        if (rule.applies_to === 'total_price') {
          totalDiscount += rule.discount_value;
        } else if (rule.applies_to === 'school_share') {
          schoolDiscount += rule.discount_value;
          totalDiscount += rule.discount_value; // Discount on school share reduces the total price for the student
        }
      });
    }

    const finalPrice = basePrice - totalDiscount;
    const finalSchoolShare = schoolShare - schoolDiscount;
    const margin = plan.margin_value;

    return { basePrice, finalPrice, finalSchoolShare, teacherShare, secretaryShare, margin, totalDiscount };
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingEnrollment) {
      updateEnrollment(editingEnrollment.id, formData);
    } else {
      addEnrollment(formData);
    }
    closeModal();
  };

  const openModal = (enrollment?: Enrollment) => {
    if (enrollment) {
      setEditingEnrollment(enrollment);
      setFormData({
        ...enrollment,
        teacher_id: enrollment.teacher_id || '',
        group_id: enrollment.group_id || '',
        custom_price: enrollment.custom_price,
      });
    } else {
      setEditingEnrollment(null);
      setFormData({
        student_id: '',
        plan_id: '',
        teacher_id: '',
        group_id: '',
        custom_price: undefined,
        status: 'active',
        enrollment_date: new Date().toISOString().split('T')[0],
        due_date_day: 5,
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEnrollment(null);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Matrículas</h1>
          <p className="text-sm text-zinc-500 mt-1">Vincule alunos aos planos financeiros e gere mensalidades.</p>
        </div>
        <button
          onClick={() => openModal()}
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Matrícula
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100">
          <div className="relative max-w-md">
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
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Aluno</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Plano</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Grupo</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Valor Final</th>
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
                  const group = state.groups.find(g => g.id === enrollment.group_id);
                  const breakdown = calculateBreakdown(enrollment.plan_id, enrollment.student_id, enrollment.id, enrollment.custom_price);

                  return (
                    <tr key={enrollment.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-zinc-900">{student?.name || 'Desconhecido'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900">{plan?.name || 'Desconhecido'}</div>
                        {breakdown && breakdown.totalDiscount > 0 && (
                          <div className="text-xs text-emerald-600">Desconto Cruzado Ativo</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900">{group?.name || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-zinc-900">
                          {breakdown ? formatCurrency(breakdown.finalPrice) : '-'}
                        </div>
                        {breakdown && breakdown.totalDiscount > 0 && (
                          <div className="text-xs text-zinc-500 line-through">{formatCurrency(breakdown.basePrice)}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900">Dia {enrollment.due_date_day}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${
                          enrollment.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {enrollment.status === 'active' ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={() => openModal(enrollment)} className="text-indigo-600 hover:text-indigo-900 mr-4">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteEnrollment(enrollment.id)} className="text-rose-600 hover:text-rose-900">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-zinc-500 text-sm">
                    Nenhuma matrícula encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={closeModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden relative z-10 max-h-[90vh] flex flex-col"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center shrink-0">
                <h3 className="text-lg font-semibold text-zinc-900">
                  {editingEnrollment ? 'Editar Matrícula' : 'Nova Matrícula'}
                </h3>
                <button onClick={closeModal} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Aluno</label>
                    <select
                      required
                      value={formData.student_id}
                      onChange={e => setFormData({...formData, student_id: e.target.value})}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      <option value="">Selecione um aluno</option>
                      {state.students.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Plano Financeiro</label>
                    <select
                      required
                      value={formData.plan_id}
                      onChange={e => setFormData({...formData, plan_id: e.target.value})}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      <option value="">Selecione um plano</option>
                      {state.financialPlans.filter(p => p.is_active).map(p => (
                        <option key={p.id} value={p.id}>{p.name} - {formatCurrency(p.base_price)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Professor (Opcional)</label>
                    <select
                      value={formData.teacher_id || ''}
                      onChange={e => setFormData({...formData, teacher_id: e.target.value})}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      <option value="">Selecione um professor</option>
                      {state.teachers.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-zinc-500 mt-1">Se o plano já tiver um professor exclusivo, ele será priorizado.</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Grupo/Turma (Opcional)</label>
                    <select
                      value={formData.group_id || ''}
                      onChange={e => setFormData({...formData, group_id: e.target.value})}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      <option value="">Selecione um grupo</option>
                      {state.groups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Preço Personalizado (Opcional)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.custom_price !== undefined ? formData.custom_price : ''}
                      onChange={e => setFormData({...formData, custom_price: e.target.value ? parseFloat(e.target.value) : undefined})}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      placeholder="Deixe em branco para usar o preço do plano"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Data de Matrícula</label>
                    <input
                      required
                      type="date"
                      value={formData.enrollment_date}
                      onChange={e => setFormData({...formData, enrollment_date: e.target.value})}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Dia de Vencimento</label>
                    <input
                      required
                      type="number"
                      min="1"
                      max="31"
                      value={formData.due_date_day}
                      onChange={e => setFormData({...formData, due_date_day: parseInt(e.target.value) || 5})}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Status</label>
                    <select
                      required
                      value={formData.status}
                      onChange={e => setFormData({...formData, status: e.target.value as any})}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </div>
                </div>

                {/* Preview Financeiro */}
                {formData.plan_id && formData.student_id && (
                  <div className="mt-6 bg-zinc-50 rounded-xl border border-zinc-200 p-4">
                    <h4 className="text-sm font-semibold text-zinc-900 flex items-center mb-3">
                      <FileText className="w-4 h-4 mr-2" />
                      Simulação Financeira (Mensalidade)
                    </h4>
                    {(() => {
                      const breakdown = calculateBreakdown(formData.plan_id, formData.student_id, editingEnrollment?.id, formData.custom_price);
                      if (!breakdown) return null;

                      return (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between text-zinc-600">
                            <span>Valor Base do Plano:</span>
                            <span>{formatCurrency(breakdown.basePrice)}</span>
                          </div>
                          {breakdown.totalDiscount > 0 && (
                            <div className="flex justify-between text-emerald-600 font-medium">
                              <span>Desconto Cruzado Aplicável:</span>
                              <span>-{formatCurrency(breakdown.totalDiscount)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-zinc-900 font-bold pt-2 border-t border-zinc-200">
                            <span>Valor Final para o Aluno:</span>
                            <span>{formatCurrency(breakdown.finalPrice)}</span>
                          </div>
                          
                          <div className="pt-4 mt-4 border-t border-zinc-200">
                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Distribuição (Repasses)</p>
                            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600">
                              <div className="flex justify-between">
                                <span>Professor:</span>
                                <span>{formatCurrency(breakdown.teacherShare)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Secretária:</span>
                                <span>{formatCurrency(breakdown.secretaryShare)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Escola:</span>
                                <span>{formatCurrency(breakdown.finalSchoolShare)}</span>
                              </div>
                              <div className="flex justify-between font-medium text-indigo-600">
                                <span>Margem:</span>
                                <span>{formatCurrency(breakdown.margin)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div className="pt-4 flex justify-end space-x-3 shrink-0">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    Salvar Matrícula
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
