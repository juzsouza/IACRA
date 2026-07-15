import React, { useState } from 'react';
import { useAppStore, DiscountRule } from '../store';
import { Plus, Search, Edit2, Trash2, X, Percent } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const DiscountRules: React.FC = () => {
  const { state, addDiscountRule, updateDiscountRule, deleteDiscountRule, currentUserProfile } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DiscountRule | null>(null);

  const [formData, setFormData] = useState<Omit<DiscountRule, 'id'>>({
    trigger_plan_id: '',
    target_plan_id: '',
    discount_value: 0,
    applies_to: 'total_price',
    start_date: null,
    end_date: null,
    description: '',
  });

  const filteredRules = state.discountRules.filter(r => {
    const triggerPlan = state.financialPlans.find(p => p.id === r.trigger_plan_id);
    const targetPlan = state.financialPlans.find(p => p.id === r.target_plan_id);
    return (
      (r.description || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (triggerPlan?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (targetPlan?.name || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingRule) {
      updateDiscountRule(editingRule.id, formData);
    } else {
      addDiscountRule(formData);
    }
    closeModal();
  };

  const openModal = (rule?: DiscountRule) => {
    if (rule) {
      setEditingRule(rule);
      setFormData(rule);
    } else {
      setEditingRule(null);
      setFormData({
        trigger_plan_id: '',
        target_plan_id: '',
        discount_value: 0,
        applies_to: 'total_price',
        start_date: null,
        end_date: null,
        description: '',
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRule(null);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const seedDefaultRules = () => {
    const planSemanal = state.financialPlans.find(p => p.name.includes('Instrumento e Técnica Vocal (Semanal)'));
    const planQuinzenal = state.financialPlans.find(p => p.name.includes('Instrumento e Técnica Vocal (Quinzenal)'));
    const planGrupoInst = state.financialPlans.find(p => p.name.includes('Instrumentos em Grupo'));
    const planGrupoCanto = state.financialPlans.find(p => p.name.includes('Canto em Grupo'));
    const planMev = state.financialPlans.find(p => p.name === 'MEV');
    const planMevOnline = state.financialPlans.find(p => p.name === 'MEV Online');

    const rules: Omit<DiscountRule, 'id'>[] = [];

    if (planSemanal) {
      // Instrumento semanal (aluno vocal) -> 50 na parte da escola
      rules.push({
        description: 'Desconto 2ª modalidade (Semanal) - Absorvido pela Escola',
        trigger_plan_id: planSemanal.id,
        target_plan_id: planSemanal.id,
        discount_value: 50,
        applies_to: 'school_share',
        start_date: null,
        end_date: null,
      });

      if (planQuinzenal) {
        // Instrumento quinzenal (aluno vocal) -> 30 na parte da escola
        rules.push({
          description: 'Desconto 2ª modalidade (Quinzenal) - Absorvido pela Escola',
          trigger_plan_id: planSemanal.id,
          target_plan_id: planQuinzenal.id,
          discount_value: 30,
          applies_to: 'school_share',
          start_date: null,
          end_date: null,
        });
        rules.push({
          description: 'Desconto 2ª modalidade (Quinzenal) - Absorvido pela Escola',
          trigger_plan_id: planQuinzenal.id,
          target_plan_id: planQuinzenal.id,
          discount_value: 30,
          applies_to: 'school_share',
          start_date: null,
          end_date: null,
        });
      }

      // Aluno grupo/MEV -> 30
      const targets = [planGrupoInst, planGrupoCanto, planMev, planMevOnline].filter(Boolean);
      targets.forEach(target => {
        if (target) {
          rules.push({
            description: `Desconto Aluno (Semanal) em ${target.name}`,
            trigger_plan_id: planSemanal.id,
            target_plan_id: target.id,
            discount_value: 30,
            applies_to: 'total_price',
            start_date: null,
            end_date: null,
          });
          if (planQuinzenal) {
            rules.push({
              description: `Desconto Aluno (Quinzenal) em ${target.name}`,
              trigger_plan_id: planQuinzenal.id,
              target_plan_id: target.id,
              discount_value: 30,
              applies_to: 'total_price',
              start_date: null,
              end_date: null,
            });
          }
        }
      });
    }

    rules.forEach(rule => addDiscountRule(rule));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Regras de Desconto</h1>
          <p className="text-sm text-zinc-500 mt-1">Configure descontos cruzados entre planos (ex: Aluno de Canto ganha desconto no Violão).</p>
        </div>
        {currentUserProfile?.role === "super_admin" && (
          <div className="flex space-x-3">
            <button
              onClick={seedDefaultRules}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 rounded-xl hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-500 transition-colors shadow-sm"
            >
              Carregar Regras Padrão
            </button>
            <button
              onClick={() => openModal()}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Regra
            </button>
          </div>
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
              placeholder="Buscar regras..."
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
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Descrição</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Condição (Se tiver...)</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Alvo (...ganha desconto em)</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Desconto</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Aplica-se a</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
              {filteredRules.length > 0 ? (
                filteredRules.map((rule) => {
                  const triggerPlan = state.financialPlans.find(p => p.id === rule.trigger_plan_id);
                  const targetPlan = state.financialPlans.find(p => p.id === rule.target_plan_id);

                  return (
                    <tr key={rule.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-zinc-900">{rule.description}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-600">{triggerPlan?.name || 'Plano não encontrado'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900 font-medium">{targetPlan?.name || 'Plano não encontrado'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-bold text-emerald-600">
                          -{formatCurrency(rule.discount_value)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${
                          rule.applies_to === 'school_share' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          {rule.applies_to === 'school_share' ? 'Repasse da Escola' : 'Valor Total'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {currentUserProfile?.role === "super_admin" && (
                          <>
                            <button onClick={() => openModal(rule)} className="text-indigo-600 hover:text-indigo-900 mr-4">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteDiscountRule(rule.id)} className="text-rose-600 hover:text-rose-900">
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
                  <td colSpan={6} className="px-6 py-12 text-center text-zinc-500 text-sm">
                    Nenhuma regra de desconto encontrada.
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
                <h3 className="text-lg font-semibold text-zinc-900 flex items-center">
                  <Percent className="w-5 h-5 mr-2 text-indigo-600" />
                  {editingRule ? 'Editar Regra de Desconto' : 'Nova Regra de Desconto'}
                </h3>
                <button onClick={closeModal} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Descrição da Regra</label>
                  <input
                    required
                    type="text"
                    placeholder="Ex: Desconto de R$ 50 no Violão para alunos de Canto"
                    value={formData.description}
                    onChange={e => setFormData({...formData, description: e.target.value})}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                    <label className="block text-sm font-semibold text-zinc-900 mb-2">Condição (Se o aluno tiver...)</label>
                    <select
                      required
                      value={formData.trigger_plan_id}
                      onChange={e => setFormData({...formData, trigger_plan_id: e.target.value})}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      <option value="">Selecione o plano gatilho</option>
                      {state.financialPlans.filter(p => p.is_active).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-zinc-500 mt-2">O aluno precisa estar matriculado neste plano para ganhar o desconto.</p>
                  </div>

                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                    <label className="block text-sm font-semibold text-indigo-900 mb-2">Alvo (...ele ganha desconto em)</label>
                    <select
                      required
                      value={formData.target_plan_id}
                      onChange={e => setFormData({...formData, target_plan_id: e.target.value})}
                      className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      <option value="">Selecione o plano alvo</option>
                      {state.financialPlans.filter(p => p.is_active).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-indigo-600/70 mt-2">O desconto será aplicado na mensalidade deste plano.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Valor do Desconto (R$)</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={formData.discount_value}
                      onChange={e => setFormData({...formData, discount_value: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Onde o desconto é abatido?</label>
                    <select
                      required
                      value={formData.applies_to}
                      onChange={e => setFormData({...formData, applies_to: e.target.value as any})}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      <option value="total_price">Valor Total (Afeta todos os repasses)</option>
                      <option value="school_share">Apenas no Repasse da Escola</option>
                    </select>
                    <p className="text-xs text-zinc-500 mt-1">
                      {formData.applies_to === 'school_share' 
                        ? 'O professor recebe o valor integral. A escola absorve o desconto.' 
                        : 'O desconto reduz o valor base do plano antes de calcular os repasses.'}
                    </p>
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
                    Salvar Regra
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
