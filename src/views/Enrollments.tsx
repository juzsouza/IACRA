import React, { useState } from 'react';
import { useAppStore, Enrollment, FinancialPlan } from '../store';
import { findDuplicateActiveEnrollment, normalizeOptionalFk } from '../utils/enrollmentPersistence';
import { Plus, Search, Edit2, Trash2, X, FileText, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Enrollments: React.FC = () => {
  const { state, addEnrollment, updateEnrollment, deleteEnrollment, currentUserProfile } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEnrollment, setEditingEnrollment] = useState<Enrollment | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState<Omit<Enrollment, 'id'>>({
    student_id: '',
    plan_id: '',
    teacher_id: '',
    group_id: '',
    custom_price: undefined,
    status: 'active',
    enrollment_date: new Date().toISOString().split('T')[0],
    start_date: new Date().toISOString().split('T')[0],
    due_date_day: 5,
    affiliate_id: '',
  });

  const filteredEnrollments = state.enrollments.filter(e => {
    const student = state.students.find(s => s.id === e.student_id);
    if (student?.not_eligible || student?.status === 'inactive') return false;
    const plan = state.financialPlans.find(p => p.id === e.plan_id);
    return (
      (student?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (plan?.name || "").toLowerCase().includes(searchTerm.toLowerCase())
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    if (!formData.student_id) {
      setErrorMsg("Por favor, selecione um aluno.");
      return;
    }

    if (!formData.plan_id) {
      setErrorMsg("Por favor, selecione um plano financeiro.");
      return;
    }

    const student = state.students.find(s => s.id === formData.student_id);
    if (student?.status === 'inactive' || student?.not_eligible) {
      setErrorMsg(`Este aluno (${student.name}) está inativo/não elegível e não pode ser matriculado. Reative-o primeiro para prosseguir.`);
      return;
    }
    
    const duplicate = findDuplicateActiveEnrollment(
      {
        id: editingEnrollment?.id,
        student_id: formData.student_id,
        plan_id: formData.plan_id,
        group_id: formData.group_id,
        status: formData.status,
      },
      state.enrollments
    );
    if (duplicate) {
      const normalizedGroupId = normalizeOptionalFk(formData.group_id);
      if (normalizedGroupId) {
        const group = state.groups.find(g => g.id === normalizedGroupId);
        setErrorMsg(`Este aluno (${student?.name || 'Aluno'}) já possui uma matrícula ativa no grupo "${group?.name || 'Grupo selecionado'}".`);
      } else {
        const plan = state.financialPlans.find(p => p.id === formData.plan_id);
        setErrorMsg(`Este aluno (${student?.name || 'Aluno'}) já possui uma matrícula individual ativa no plano "${plan?.name || 'Plano selecionado'}".`);
      }
      return;
    }

    setErrorMsg('');
    setIsSaving(true);

    try {
      // Construir payload limpo sem end_date (coluna inexistente em public.enrollments)
      const { end_date: _ignoredEndDate, ...cleanForm } = formData as any;
      const dataToSave: Omit<Enrollment, 'id'> = {
        ...cleanForm,
        teacher_id: normalizeOptionalFk(formData.teacher_id) ?? undefined,
        group_id: normalizeOptionalFk(formData.group_id) ?? undefined,
        affiliate_id: normalizeOptionalFk(formData.affiliate_id) ?? undefined,
      };

      const result = editingEnrollment
        ? await updateEnrollment(editingEnrollment.id, dataToSave)
        : await addEnrollment(dataToSave);

      if (!result.success) {
        setErrorMsg(result.error || 'Não foi possível salvar a matrícula no banco de dados. Verifique os dados e tente novamente.');
        return;
      }

      closeModal();
    } finally {
      setIsSaving(false);
    }
  };

  const openModal = (enrollment?: Enrollment) => {
    setStudentSearch('');
    setIsStudentDropdownOpen(false);
    setErrorMsg('');
    if (enrollment) {
      setEditingEnrollment(enrollment);
      setFormData({
        ...enrollment,
        teacher_id: enrollment.teacher_id || '',
        group_id: enrollment.group_id || '',
        custom_price: enrollment.custom_price,
        start_date: enrollment.start_date || enrollment.enrollment_date,
        end_date: enrollment.end_date || '',
        affiliate_id: enrollment.affiliate_id || '',
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
        start_date: new Date().toISOString().split('T')[0],
        end_date: undefined,
        due_date_day: 5,
        affiliate_id: '',
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingEnrollment(null);
    setStudentSearch('');
    setIsStudentDropdownOpen(false);
    setErrorMsg('');
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
        {currentUserProfile?.role === "super_admin" && (
          <button
            onClick={() => openModal()}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Matrícula
          </button>
        )}
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

        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Aluno</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Plano</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Grupo</th>
                {currentUserProfile?.role === "super_admin" && (
                  <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Valor Final</th>
                )}
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
                  const affiliate = enrollment.affiliate_id ? state.affiliates?.find(a => a.id === enrollment.affiliate_id) : null;

                  return (
                    <tr key={enrollment.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-zinc-900">{student?.name || 'Desconhecido'}</div>
                        {affiliate && (
                          <div className="mt-0.5 inline-flex items-center text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Afiliado: {affiliate.name}
                          </div>
                        )}
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
                      {currentUserProfile?.role === "super_admin" && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-zinc-900">
                            {breakdown ? formatCurrency(breakdown.finalPrice) : '-'}
                          </div>
                          {breakdown && breakdown.totalDiscount > 0 && (
                            <div className="text-xs text-zinc-500 line-through">{formatCurrency(breakdown.basePrice)}</div>
                          )}
                        </td>
                      )}
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
                        {currentUserProfile?.role === "super_admin" && (
                          <>
                            <button onClick={() => openModal(enrollment)} className="text-indigo-600 hover:text-indigo-900 mr-4">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteEnrollment(enrollment.id)} className="text-rose-600 hover:text-rose-900">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
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
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setIsStudentDropdownOpen(!isStudentDropdownOpen)}
                        className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-left focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white flex justify-between items-center shadow-sm text-sm"
                      >
                        <span className={formData.student_id ? "text-zinc-900 font-medium" : "text-zinc-400"}>
                          {formData.student_id
                            ? (() => {
                                const st = state.students.find(s => s.id === formData.student_id);
                                return st ? `${st.name}${st.cpf ? ` (CPF: ${st.cpf})` : ''}` : "Aluno selecionado";
                              })()
                            : "Selecione um aluno"}
                        </span>
                        <ChevronDown className="w-4 h-4 text-zinc-400" />
                      </button>

                      {isStudentDropdownOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-20"
                            onClick={() => {
                              setIsStudentDropdownOpen(false);
                              setStudentSearch('');
                            }}
                          />
                          <div className="absolute left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-xl shadow-lg z-30 overflow-hidden flex flex-col max-h-60">
                            <div className="p-2 border-b border-zinc-100 shrink-0 flex items-center space-x-2 bg-zinc-50">
                              <Search className="w-4 h-4 text-zinc-400 shrink-0" />
                              <input
                                type="text"
                                placeholder="Pesquisar aluno por nome ou CPF..."
                                value={studentSearch}
                                onChange={e => setStudentSearch(e.target.value)}
                                className="w-full text-xs outline-none bg-transparent placeholder-zinc-400 text-zinc-700 py-1"
                                autoFocus
                              />
                            </div>
                            <div className="overflow-y-auto max-h-48 py-1 divide-y divide-zinc-50">
                              {state.students
                                .filter(s => {
                                  if (s.not_eligible || s.status === 'inactive') return false;
                                  const nameMatch = (s.name || '').toLowerCase().includes(studentSearch.toLowerCase());
                                  const cleanSearch = studentSearch.replace(/\D/g, '');
                                  const cpfMatch = cleanSearch ? (s.cpf || '').replace(/\D/g, '').includes(cleanSearch) : false;
                                  return nameMatch || cpfMatch;
                                })
                                .map(s => {
                                  const isSelected = s.id === formData.student_id;
                                  return (
                                    <button
                                      key={s.id}
                                      type="button"
                                      onClick={() => {
                                        setFormData({...formData, student_id: s.id});
                                        setIsStudentDropdownOpen(false);
                                        setStudentSearch('');
                                      }}
                                      className={`w-full text-left px-4 py-2 text-xs flex justify-between items-center hover:bg-zinc-50 transition-colors ${
                                        isSelected ? "bg-indigo-50/50 text-indigo-700 font-semibold" : "text-zinc-700"
                                      }`}
                                    >
                                      <div className="flex flex-col">
                                        <span className="font-medium">{s.name}</span>
                                        {s.cpf && <span className="text-[10px] text-zinc-400 font-normal">CPF: {s.cpf}</span>}
                                      </div>
                                      {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                                    </button>
                                  );
                                })}
                              {state.students.filter(s => {
                                if (s.not_eligible || s.status === 'inactive') return false;
                                const nameMatch = (s.name || '').toLowerCase().includes(studentSearch.toLowerCase());
                                const cleanSearch = studentSearch.replace(/\D/g, '');
                                const cpfMatch = cleanSearch ? (s.cpf || '').replace(/\D/g, '').includes(cleanSearch) : false;
                                return nameMatch || cpfMatch;
                              }).length === 0 && (
                                <div className="p-4 text-center text-xs text-zinc-400">
                                  Nenhum aluno encontrado
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">CPF do Aluno</label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={formData.student_id ? (state.students.find(s => s.id === formData.student_id)?.cpf || 'Não cadastrado') : ''}
                      placeholder="Nenhum aluno selecionado"
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl bg-zinc-50 text-zinc-500 text-sm outline-none cursor-not-allowed"
                    />
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
                      {state.teachers
                        .filter(t => t.status === 'active' || (editingEnrollment && t.id === formData.teacher_id))
                        .map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name}{t.status === 'inactive' ? ' (Inativo)' : ''}
                          </option>
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
                      {state.groups
                        .filter(g => (g.status !== 'inactive') || (formData.group_id === g.id))
                        .map(g => (
                          <option key={g.id} value={g.id}>
                            {g.name}{g.status === 'inactive' ? ' (Inativo)' : ''}
                          </option>
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
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Data de Início</label>
                    <input
                      required
                      type="date"
                      value={formData.start_date || formData.enrollment_date}
                      onChange={e => setFormData({...formData, start_date: e.target.value})}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                    <p className="text-[11px] text-indigo-600 mt-1">
                      A fatura e a inclusão na agenda serão geradas somente a partir do mês de referência ({new Date((formData.start_date || formData.enrollment_date) + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}).
                    </p>
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
                  {formData.status === 'inactive' && (
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">
                        Data de Encerramento (Desmatrícula)
                      </label>
                      <input
                        type="date"
                        value={formData.end_date || new Date().toISOString().split('T')[0]}
                        onChange={e => setFormData({...formData, end_date: e.target.value})}
                        className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                      />
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Competências até esta data mantêm cobranças devidas. Competências futuras não são geradas.
                      </p>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Afiliado / Indicação <span className="text-zinc-400 font-normal text-xs">(Opcional)</span>
                    </label>
                    <select
                      value={formData.affiliate_id || ''}
                      onChange={e => setFormData({...formData, affiliate_id: e.target.value || undefined})}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                    >
                      <option value="">Nenhum afiliado (matrícula direta)</option>
                      {(state.affiliates || [])
                        .filter(a => a.status === 'active' || a.id === formData.affiliate_id)
                        .map(aff => (
                          <option key={aff.id} value={aff.id}>
                            {aff.name} {aff.referral_code ? `(${aff.referral_code})` : ''}
                          </option>
                        ))}
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
                              {breakdown.secretaryShare > 0 && (
                                <div className="flex justify-between">
                                  <span>Secretária:</span>
                                  <span>{formatCurrency(breakdown.secretaryShare)}</span>
                                </div>
                              )}
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

                {errorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl leading-relaxed">
                    {errorMsg}
                  </div>
                )}

                <div className="pt-4 flex justify-end space-x-3 shrink-0">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isSaving ? 'Salvando...' : 'Salvar Matrícula'}
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
