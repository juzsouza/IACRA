import React, { useState } from 'react';
import { useAppStore, FinancialPlan } from '../store';
import { Plus, Search, Edit2, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const FinancialPlans: React.FC = () => {
  const { state, addFinancialPlan, updateFinancialPlan, deleteFinancialPlan } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<FinancialPlan | null>(null);

  const [formData, setFormData] = useState<Omit<FinancialPlan, 'id'>>({
    name: '',
    category: 'individual',
    modality: 'semanal',
    base_price: 0,
    duration_minutes: 50,
    max_students: 1,
    is_active: true,
    exclusive_teacher_id: null,
    allow_early_discount: false,
    early_discount_value: 0,
    early_discount_deadline_day: 5,
    secretary_fee_type: 'fixed',
    secretary_fee_value: 0,
    school_fee_type: 'fixed',
    school_fee_value: 0,
    teacher_fee_type: 'fixed',
    teacher_fee_value: 0,
    margin_value: 0,
  });

  const filteredPlans = state.financialPlans.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPlan) {
      updateFinancialPlan(editingPlan.id, formData);
    } else {
      addFinancialPlan(formData);
    }
    closeModal();
  };

  const openModal = (plan?: FinancialPlan) => {
    if (plan) {
      setEditingPlan(plan);
      setFormData(plan);
    } else {
      setEditingPlan(null);
      setFormData({
        name: '',
        category: 'individual',
        modality: 'semanal',
        base_price: 0,
        duration_minutes: 50,
        max_students: 1,
        is_active: true,
        exclusive_teacher_id: null,
        allow_early_discount: false,
        early_discount_value: 0,
        early_discount_deadline_day: 5,
        secretary_fee_type: 'fixed',
        secretary_fee_value: 0,
        school_fee_type: 'fixed',
        school_fee_value: 0,
        teacher_fee_type: 'fixed',
        teacher_fee_value: 0,
        margin_value: 0,
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPlan(null);
  };

  const seedDefaultPlans = () => {
    const defaultPlans: Omit<FinancialPlan, 'id'>[] = [
      {
        name: 'Aulas Individuais – Instrumento e Técnica Vocal (Semanal)',
        category: 'individual',
        modality: 'semanal',
        base_price: 350,
        duration_minutes: 50,
        max_students: 1,
        is_active: true,
        exclusive_teacher_id: null,
        allow_early_discount: true,
        early_discount_value: 30,
        early_discount_deadline_day: 5,
        secretary_fee_type: 'fixed',
        secretary_fee_value: 20,
        school_fee_type: 'fixed',
        school_fee_value: 120,
        teacher_fee_type: 'fixed',
        teacher_fee_value: 180,
        margin_value: 30,
      },
      {
        name: 'Aulas Individuais – Instrumento e Técnica Vocal (Quinzenal)',
        category: 'individual',
        modality: 'quinzenal',
        base_price: 230,
        duration_minutes: 50,
        max_students: 1,
        is_active: true,
        exclusive_teacher_id: null,
        allow_early_discount: true,
        early_discount_value: 30,
        early_discount_deadline_day: 5,
        secretary_fee_type: 'fixed',
        secretary_fee_value: 20,
        school_fee_type: 'fixed',
        school_fee_value: 90,
        teacher_fee_type: 'fixed',
        teacher_fee_value: 90,
        margin_value: 30,
      },
      {
        name: 'Musicalização Infantil',
        category: 'group',
        modality: 'semanal',
        base_price: 210,
        duration_minutes: 50,
        max_students: 5,
        is_active: true,
        exclusive_teacher_id: null,
        allow_early_discount: false,
        early_discount_value: 0,
        early_discount_deadline_day: 5,
        secretary_fee_type: 'per_student',
        secretary_fee_value: 20,
        school_fee_type: 'per_student',
        school_fee_value: 60,
        teacher_fee_type: 'per_student',
        teacher_fee_value: 100,
        margin_value: 30,
      },
      {
        name: 'Canto em Grupo (outros professores)',
        category: 'group',
        modality: 'quinzenal',
        base_price: 140,
        duration_minutes: 50,
        max_students: 8,
        is_active: true,
        exclusive_teacher_id: null,
        allow_early_discount: false,
        early_discount_value: 0,
        early_discount_deadline_day: 5,
        secretary_fee_type: 'per_student',
        secretary_fee_value: 20,
        school_fee_type: 'per_student',
        school_fee_value: 50,
        teacher_fee_type: 'per_student',
        teacher_fee_value: 50,
        margin_value: 20,
      },
      {
        name: 'Instrumentos em Grupo',
        category: 'group',
        modality: 'semanal',
        base_price: 220,
        duration_minutes: 50,
        max_students: 6,
        is_active: true,
        exclusive_teacher_id: null,
        allow_early_discount: false,
        early_discount_value: 0,
        early_discount_deadline_day: 5,
        secretary_fee_type: 'per_student',
        secretary_fee_value: 20,
        school_fee_type: 'per_student',
        school_fee_value: 80,
        teacher_fee_type: 'per_student',
        teacher_fee_value: 120,
        margin_value: 20,
      },
      {
        name: 'Atendimentos Fonoaudiológicos (Sessão Avulsa)',
        category: 'individual',
        modality: 'avulso',
        base_price: 180,
        duration_minutes: 50,
        max_students: 1,
        is_active: true,
        exclusive_teacher_id: null,
        allow_early_discount: false,
        early_discount_value: 0,
        early_discount_deadline_day: 5,
        secretary_fee_type: 'fixed',
        secretary_fee_value: 0,
        school_fee_type: 'fixed',
        school_fee_value: 60,
        teacher_fee_type: 'fixed',
        teacher_fee_value: 120,
        margin_value: 0,
      },
      {
        name: 'Atendimentos Fonoaudiológicos (Quinzenal)',
        category: 'individual',
        modality: 'quinzenal',
        base_price: 300,
        duration_minutes: 50,
        max_students: 1,
        is_active: true,
        exclusive_teacher_id: null,
        allow_early_discount: false,
        early_discount_value: 0,
        early_discount_deadline_day: 5,
        secretary_fee_type: 'fixed',
        secretary_fee_value: 0,
        school_fee_type: 'fixed',
        school_fee_value: 100,
        teacher_fee_type: 'fixed',
        teacher_fee_value: 200,
        margin_value: 0,
      },
      {
        name: 'Atendimentos Fonoaudiológicos (Semanal)',
        category: 'individual',
        modality: 'semanal',
        base_price: 500,
        duration_minutes: 50,
        max_students: 1,
        is_active: true,
        exclusive_teacher_id: null,
        allow_early_discount: false,
        early_discount_value: 0,
        early_discount_deadline_day: 5,
        secretary_fee_type: 'fixed',
        secretary_fee_value: 0,
        school_fee_type: 'fixed',
        school_fee_value: 150,
        teacher_fee_type: 'fixed',
        teacher_fee_value: 350,
        margin_value: 0,
      }
    ];

    defaultPlans.forEach(plan => {
      const existing = state.financialPlans.find(p => p.name === plan.name);
      if (existing) {
        updateFinancialPlan(existing.id, plan);
      } else {
        addFinancialPlan(plan);
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Planos Financeiros</h1>
          <p className="text-sm text-zinc-500 mt-1">Configure os planos, valores e regras de repasse.</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={seedDefaultPlans}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 rounded-xl hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-500 transition-colors shadow-sm"
          >
            Atualizar Repasses
          </button>
          <button
            onClick={() => openModal()}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Plano
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100">
          <div className="relative max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-zinc-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nome ou categoria..."
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
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Nome do Plano</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Categoria/Modalidade</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Valor Base</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Repasses (Sec/Esc/Prof)</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
              {filteredPlans.length > 0 ? (
                filteredPlans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-zinc-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-zinc-900">{plan.name}</div>
                      {plan.exclusive_teacher_id && (
                        <div className="text-xs text-zinc-500">Exclusivo: {state.teachers.find(t => t.id === plan.exclusive_teacher_id)?.name}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-zinc-900 capitalize">{plan.category}</div>
                      <div className="text-xs text-zinc-500 capitalize">{plan.modality} - {plan.duration_minutes}min</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-zinc-900">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plan.base_price)}
                      </div>
                      {plan.allow_early_discount && (
                        <div className="text-xs text-emerald-600">
                          Desc: -{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(plan.early_discount_value)} até dia {plan.early_discount_deadline_day}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-xs text-zinc-600">
                        S: {plan.secretary_fee_value}{plan.secretary_fee_type === 'percentage' ? '%' : ''} | 
                        E: {plan.school_fee_value}{plan.school_fee_type === 'percentage' ? '%' : ''} | 
                        P: {plan.teacher_fee_value}{plan.teacher_fee_type === 'percentage' ? '%' : ''}
                      </div>
                      <div className="text-xs font-medium text-indigo-600 mt-1">Margem: {plan.margin_value}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${
                        plan.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {plan.is_active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button onClick={() => openModal(plan)} className="text-indigo-600 hover:text-indigo-900 mr-4">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteFinancialPlan(plan.id)} className="text-rose-600 hover:text-rose-900">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-zinc-500 text-sm">
                    Nenhum plano encontrado.
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
                  {editingPlan ? 'Editar Plano' : 'Novo Plano'}
                </h3>
                <button onClick={closeModal} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-zinc-900 border-b pb-2">Informações Básicas</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Nome do Plano</label>
                      <input
                        required
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Professor Exclusivo (Opcional)</label>
                      <select
                        value={formData.exclusive_teacher_id || ''}
                        onChange={e => setFormData({...formData, exclusive_teacher_id: e.target.value || null})}
                        className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      >
                        <option value="">Nenhum (Plano Geral)</option>
                        {state.teachers.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Categoria</label>
                      <select
                        value={formData.category}
                        onChange={e => setFormData({...formData, category: e.target.value as any})}
                        className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      >
                        <option value="individual">Individual</option>
                        <option value="group">Grupo</option>
                        <option value="coral">Coral</option>
                        <option value="mentoria">Mentoria</option>
                        <option value="mev">MEV</option>
                        <option value="personalizado">Personalizado</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Modalidade</label>
                      <select
                        value={formData.modality}
                        onChange={e => setFormData({...formData, modality: e.target.value as any})}
                        className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      >
                        <option value="semanal">Semanal</option>
                        <option value="quinzenal">Quinzenal</option>
                        <option value="mensal">Mensal</option>
                        <option value="avulso">Avulso</option>
                        <option value="personalizado">Personalizado</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">Valor Base (R$)</label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        value={formData.base_price}
                        onChange={e => setFormData({...formData, base_price: parseFloat(e.target.value) || 0})}
                        className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">Duração (min)</label>
                        <input
                          required
                          type="number"
                          value={formData.duration_minutes}
                          onChange={e => setFormData({...formData, duration_minutes: parseInt(e.target.value) || 0})}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">Máx. Alunos</label>
                        <input
                          required
                          type="number"
                          value={formData.max_students}
                          onChange={e => setFormData({...formData, max_students: parseInt(e.target.value) || 1})}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-zinc-900 border-b pb-2">Desconto de Pontualidade</h4>
                  <div className="flex items-center mb-4">
                    <input
                      type="checkbox"
                      id="allow_early_discount"
                      checked={formData.allow_early_discount}
                      onChange={e => setFormData({...formData, allow_early_discount: e.target.checked})}
                      className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 mr-2"
                    />
                    <label htmlFor="allow_early_discount" className="text-sm text-zinc-700">Permitir desconto para pagamento antecipado</label>
                  </div>
                  {formData.allow_early_discount && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">Valor do Desconto (R$)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={formData.early_discount_value}
                          onChange={e => setFormData({...formData, early_discount_value: parseFloat(e.target.value) || 0})}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">Dia Limite (ex: 5)</label>
                        <input
                          type="number"
                          value={formData.early_discount_deadline_day}
                          onChange={e => setFormData({...formData, early_discount_deadline_day: parseInt(e.target.value) || 5})}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-zinc-900 border-b pb-2">Repasses e Margem</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Secretária */}
                    <div className="space-y-2 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                      <label className="block text-sm font-medium text-zinc-900">Secretária</label>
                      <select
                        value={formData.secretary_fee_type}
                        onChange={e => setFormData({...formData, secretary_fee_type: e.target.value as any})}
                        className="w-full px-3 py-1.5 text-sm border border-zinc-200 rounded-lg outline-none bg-white"
                      >
                        <option value="fixed">Fixo</option>
                        <option value="per_student">Por Aluno</option>
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.secretary_fee_value}
                        onChange={e => setFormData({...formData, secretary_fee_value: parseFloat(e.target.value) || 0})}
                        className="w-full px-3 py-1.5 text-sm border border-zinc-200 rounded-lg outline-none"
                        placeholder="Valor"
                      />
                    </div>
                    {/* Escola */}
                    <div className="space-y-2 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                      <label className="block text-sm font-medium text-zinc-900">Escola</label>
                      <select
                        value={formData.school_fee_type}
                        onChange={e => setFormData({...formData, school_fee_type: e.target.value as any})}
                        className="w-full px-3 py-1.5 text-sm border border-zinc-200 rounded-lg outline-none bg-white"
                      >
                        <option value="fixed">Fixo</option>
                        <option value="per_student">Por Aluno</option>
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.school_fee_value}
                        onChange={e => setFormData({...formData, school_fee_value: parseFloat(e.target.value) || 0})}
                        className="w-full px-3 py-1.5 text-sm border border-zinc-200 rounded-lg outline-none"
                        placeholder="Valor"
                      />
                    </div>
                    {/* Professor */}
                    <div className="space-y-2 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                      <label className="block text-sm font-medium text-zinc-900">Professor</label>
                      <select
                        value={formData.teacher_fee_type}
                        onChange={e => setFormData({...formData, teacher_fee_type: e.target.value as any})}
                        className="w-full px-3 py-1.5 text-sm border border-zinc-200 rounded-lg outline-none bg-white"
                      >
                        <option value="fixed">Fixo</option>
                        <option value="per_student">Por Aluno</option>
                        <option value="percentage">Porcentagem (%)</option>
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.teacher_fee_value}
                        onChange={e => setFormData({...formData, teacher_fee_value: parseFloat(e.target.value) || 0})}
                        className="w-full px-3 py-1.5 text-sm border border-zinc-200 rounded-lg outline-none"
                        placeholder="Valor"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Margem de Lucro (R$)</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={formData.margin_value}
                      onChange={e => setFormData({...formData, margin_value: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

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
                    Salvar Plano
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
