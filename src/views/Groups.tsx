import React, { useState } from 'react';
import { useAppStore, Group } from '../store';
import { Users, Plus, Search, Edit2, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export const Groups: React.FC = () => {
  const { state, addGroup, updateGroup, deleteGroup, currentUserProfile } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    teacher_id: '',
    schedule: '',
    max_students: '',
    payment_type: 'individual' as 'group' | 'individual',
    price: ''
  });

  const filteredGroups = state.groups.filter(g =>
    g.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const openModal = (group?: Group) => {
    if (group) {
      setEditingGroup(group);
      setFormData({
        name: group.name,
        teacher_id: group.teacher_id || '',
        schedule: group.schedule || '',
        max_students: group.max_students?.toString() || '',
        payment_type: group.payment_type || 'individual',
        price: group.price?.toString() || ''
      });
    } else {
      setEditingGroup(null);
      setFormData({
        name: '',
        teacher_id: '',
        schedule: '',
        max_students: '',
        payment_type: 'individual',
        price: ''
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingGroup(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const groupData = {
      name: formData.name,
      teacher_id: formData.teacher_id || undefined,
      schedule: formData.schedule || undefined,
      max_students: formData.max_students ? parseInt(formData.max_students, 10) : undefined,
      payment_type: formData.payment_type,
      price: formData.payment_type === 'group' && formData.price ? parseFloat(formData.price) : undefined
    };

    if (editingGroup) {
      updateGroup(editingGroup.id, groupData);
    } else {
      addGroup(groupData);
    }
    closeModal();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Grupos</h1>
          <p className="text-sm text-zinc-500 mt-1">Gerencie os grupos e turmas da escola.</p>
        </div>
        {currentUserProfile?.role === "super_admin" && (
          <button
            onClick={() => openModal()}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Grupo
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
              placeholder="Buscar grupos..."
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
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Nome do Grupo</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Professor</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Horário</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Alunos</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
              {filteredGroups.length > 0 ? (
                filteredGroups.map((group) => {
                  const teacher = state.teachers.find(t => t.id === group.teacher_id);
                  const enrolledCount = state.enrollments.filter(e => e.group_id === group.id && e.status === 'active').length;
                  
                  return (
                    <tr key={group.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 bg-indigo-100 rounded-full flex items-center justify-center">
                            <Users className="h-5 w-5 text-indigo-600" />
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-zinc-900">{group.name}</div>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium mt-1 border ${
                              group.payment_type === 'group' 
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}>
                              {group.payment_type === 'group' 
                                ? `Cobrança: Por Grupo (${group.price !== undefined ? formatCurrency(group.price) : 'Valor não definido'})` 
                                : 'Cobrança: Individual'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900">{teacher?.name || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900">{group.schedule || '-'}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`text-sm font-semibold mb-1 flex items-center gap-1.5 ${
                          group.max_students && enrolledCount > group.max_students 
                            ? 'text-rose-600' 
                            : 'text-zinc-900'
                        }`}>
                          <span>{enrolledCount} {group.max_students ? `/ ${group.max_students}` : ''}</span>
                          {group.max_students && enrolledCount > group.max_students && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-md">
                              Excedido
                            </span>
                          )}
                        </div>
                        {(() => {
                          const enrolledStudents = state.students.filter(st =>
                            state.enrollments.some(e => e.group_id === group.id && e.student_id === st.id && e.status === 'active')
                          );
                          if (enrolledStudents.length > 0) {
                            return (
                              <div className="flex flex-wrap gap-1 max-w-xs mt-1">
                                {enrolledStudents.map(st => (
                                  <span key={st.id} className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-zinc-100 text-zinc-800 border border-zinc-200">
                                    {st.name}
                                  </span>
                                ))}
                              </div>
                            );
                          }
                          return <span className="text-xs text-zinc-400">Nenhum aluno ativo</span>;
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {currentUserProfile?.role === "super_admin" && (
                          groupToDelete === group.id ? (
                            <div className="flex items-center justify-end space-x-2">
                              <span className="text-xs text-rose-600 font-medium">Excluir?</span>
                              <button
                                onClick={() => {
                                  deleteGroup(group.id);
                                  setGroupToDelete(null);
                                }}
                                className="px-2 py-1 text-xs font-medium text-white bg-rose-600 rounded hover:bg-rose-700"
                              >
                                Sim
                              </button>
                              <button
                                onClick={() => setGroupToDelete(null)}
                                className="px-2 py-1 text-xs font-medium text-zinc-600 bg-zinc-100 rounded hover:bg-zinc-200"
                              >
                                Não
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => openModal(group)}
                                className="text-indigo-600 hover:text-indigo-900 mr-4 transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setGroupToDelete(group.id)}
                                className="text-red-600 hover:text-red-900 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-500 text-sm">
                    Nenhum grupo encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

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
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-zinc-900">
                  {editingGroup ? 'Editar Grupo' : 'Novo Grupo'}
                </h3>
                <button onClick={closeModal} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Nome do Grupo *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    placeholder="Ex: Teoria Musical - Turma A"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Professor</label>
                  <select
                    value={formData.teacher_id}
                    onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  >
                    <option value="">Selecione um professor (opcional)</option>
                    {state.teachers.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Horário</label>
                  <input
                    type="text"
                    value={formData.schedule}
                    onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    placeholder="Ex: Segundas, 14h às 15h"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Máximo de Alunos</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.max_students}
                    onChange={(e) => setFormData({ ...formData, max_students: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    placeholder="Ex: 15"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Tipo de Cobrança / Pagamento</label>
                  <select
                    value={formData.payment_type}
                    onChange={(e) => setFormData({ ...formData, payment_type: e.target.value as 'group' | 'individual' })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                  >
                    <option value="individual">Individual (Cada aluno paga individualmente)</option>
                    <option value="group">Por Grupo (O valor é unificado / cobrado de forma unificada)</option>
                  </select>
                </div>
                {formData.payment_type === 'group' && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Valor do Grupo (R$)</label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                      placeholder="Ex: 500"
                    />
                  </div>
                )}
                <div className="pt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700"
                  >
                    Salvar
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
