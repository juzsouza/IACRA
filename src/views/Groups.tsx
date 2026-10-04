import React, { useState } from 'react';
import { useAppStore, Group } from '../store';
import { Users, Plus, Search, Edit2, Trash2, X, FileText, Calendar as CalendarIcon, Clock, CheckCircle2, AlertCircle, User, Power, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doesClassBelongToGroup } from '../utils/groupMatch';
import { getSessionStudentIds } from './Classes';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export const Groups: React.FC = () => {
  const { state, addGroup, updateGroup, deleteGroup, currentUserProfile } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
  const [groupToToggleStatus, setGroupToToggleStatus] = useState<Group | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusActionError, setStatusActionError] = useState<string | null>(null);
  const [selectedGroupForReports, setSelectedGroupForReports] = useState<Group | null>(null);
  const [groupReportsStudentFilter, setGroupReportsStudentFilter] = useState<string>('all');

  const [formData, setFormData] = useState({
    name: '',
    teacher_id: '',
    schedule: '',
    frequency: '' as 'semanal' | 'quinzenal' | '',
    max_students: '',
    payment_type: 'individual' as 'group' | 'individual',
    price: '',
    status: 'active' as 'active' | 'inactive'
  });

  const filteredGroups = state.groups.filter(g => {
    const matchesSearch = g.name.toLowerCase().includes(searchTerm.toLowerCase());
    const groupStatus = g.status === 'inactive' ? 'inactive' : 'active';
    const matchesStatus = statusFilter === 'all' || groupStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openModal = (group?: Group) => {
    if (group) {
      setEditingGroup(group);
      setFormData({
        name: group.name,
        teacher_id: group.teacher_id || '',
        schedule: group.schedule || '',
        frequency: (group.frequency as 'semanal' | 'quinzenal') || '',
        max_students: group.max_students?.toString() || '',
        payment_type: group.payment_type || 'individual',
        price: group.price?.toString() || '',
        status: group.status === 'inactive' ? 'inactive' : 'active'
      });
    } else {
      setEditingGroup(null);
      setFormData({
        name: '',
        teacher_id: '',
        schedule: '',
        frequency: '',
        max_students: '',
        payment_type: 'individual',
        price: '',
        status: 'active'
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingGroup(null);
  };

  const handleToggleStatus = async (group: Group) => {
    const nextStatus = group.status === 'inactive' ? 'active' : 'inactive';
    setIsUpdatingStatus(true);
    setStatusActionError(null);
    try {
      const res = await updateGroup(group.id, { status: nextStatus });
      if (!res.success) {
        setStatusActionError(res.error?.message || 'Erro ao alterar status do grupo.');
      } else {
        setGroupToToggleStatus(null);
      }
    } catch (err: any) {
      setStatusActionError(err?.message || 'Erro inesperado.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup && !formData.frequency) {
      alert("Por favor, selecione a Frequência das Aulas (Semanal ou Quinzenal).");
      return;
    }

    const groupData: Omit<Group, "id"> = {
      name: formData.name,
      teacher_id: formData.teacher_id || undefined,
      schedule: formData.schedule || undefined,
      frequency: (formData.frequency === 'semanal' || formData.frequency === 'quinzenal') ? formData.frequency : null,
      max_students: formData.max_students ? parseInt(formData.max_students, 10) : undefined,
      payment_type: formData.payment_type,
      price: formData.payment_type === 'group' && formData.price ? parseFloat(formData.price) : undefined,
      status: formData.status
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
        <div className="p-4 border-b border-zinc-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="relative w-full sm:max-w-md">
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

          <div className="flex items-center gap-1.5 self-stretch sm:self-auto bg-zinc-100 p-1 rounded-xl border border-zinc-200/80 text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                statusFilter === 'all'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Todos ({state.groups.length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                statusFilter === 'active'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Ativos ({state.groups.filter(g => g.status !== 'inactive').length})
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                statusFilter === 'inactive'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Inativos ({state.groups.filter(g => g.status === 'inactive').length})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Nome do Grupo</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
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
                  const isInactive = group.status === 'inactive';
                  
                  return (
                    <tr key={group.id} className={`hover:bg-zinc-50 transition-colors ${isInactive ? 'bg-zinc-50/50 opacity-80' : ''}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${
                            isInactive ? 'bg-zinc-200 text-zinc-500' : 'bg-indigo-100 text-indigo-600'
                          }`}>
                            <Users className="h-5 w-5" />
                          </div>
                          <div className="ml-4">
                            <div className={`text-sm font-medium ${isInactive ? 'text-zinc-600 line-through decoration-zinc-400' : 'text-zinc-900'}`}>
                              {group.name}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                group.payment_type === 'group' 
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}>
                                {group.payment_type === 'group' 
                                  ? (currentUserProfile?.role === "super_admin"
                                      ? `Cobrança: Por Grupo (${group.price !== undefined ? formatCurrency(group.price) : 'Valor não definido'})`
                                      : 'Cobrança: Por Grupo')
                                  : 'Cobrança: Individual'}
                              </span>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                group.frequency === 'semanal'
                                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                                  : group.frequency === 'quinzenal'
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                              }`}>
                                Frequência: {group.frequency === 'semanal' ? 'Semanal' : group.frequency === 'quinzenal' ? 'Quinzenal' : 'Não definida'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                          isInactive 
                            ? 'bg-zinc-100 text-zinc-600 border-zinc-300' 
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isInactive ? 'bg-zinc-400' : 'bg-emerald-500'}`} />
                          {isInactive ? 'Inativo' : 'Ativo'}
                        </span>
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
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => {
                              setSelectedGroupForReports(group);
                              setGroupReportsStudentFilter('all');
                            }}
                            title="Ver Relatórios Exclusivos do Grupo"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Relatórios</span>
                          </button>

                          {currentUserProfile?.role === "super_admin" && (
                            <>
                              <button
                                onClick={() => setGroupToToggleStatus(group)}
                                title={isInactive ? "Reativar Grupo" : "Inativar Grupo"}
                                className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                                  isInactive
                                    ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                                    : 'text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200'
                                }`}
                              >
                                <Power className="w-3.5 h-3.5" />
                                <span>{isInactive ? 'Reativar' : 'Inativar'}</span>
                              </button>

                              {groupToDelete === group.id ? (
                                <div className="flex items-center space-x-2 ml-2">
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
                                <div className="flex items-center space-x-2 ml-2">
                                  <button
                                    onClick={() => openModal(group)}
                                    className="text-indigo-600 hover:text-indigo-900 transition-colors p-1"
                                    title="Editar Turma"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setGroupToDelete(group.id)}
                                    className="text-red-600 hover:text-red-900 transition-colors p-1"
                                    title="Excluir Turma"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-zinc-500 text-sm">
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
                    {state.teachers
                      .filter(t => t.status === 'active' || (editingGroup && t.id === formData.teacher_id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}{t.status === 'inactive' ? ' (Inativo)' : ''}
                        </option>
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
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Frequência das Aulas {!editingGroup && <span className="text-rose-500">*</span>}
                  </label>
                  <select
                    required={!editingGroup}
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value as 'semanal' | 'quinzenal' | '' })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                  >
                    <option value="">{editingGroup ? 'Não definida (Selecione para definir)' : 'Selecione a frequência (obrigatório)'}</option>
                    <option value="semanal">Semanal</option>
                    <option value="quinzenal">Quinzenal</option>
                  </select>
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
                {editingGroup && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Status do Grupo</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
                    >
                      <option value="active">Ativo (Em funcionamento)</option>
                      <option value="inactive">Inativo (Aulas encerradas, histórico preservado)</option>
                    </select>
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

      {/* Modal de Confirmação para Inativar / Reativar Grupo */}
      <AnimatePresence>
        {groupToToggleStatus && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => {
                if (!isUpdatingStatus) {
                  setGroupToToggleStatus(null);
                  setStatusActionError(null);
                }
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative z-10 p-6"
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  groupToToggleStatus.status === 'inactive'
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-amber-100 text-amber-600'
                }`}>
                  <Power className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-zinc-900">
                    {groupToToggleStatus.status === 'inactive'
                      ? `Reativar Grupo: ${groupToToggleStatus.name}`
                      : `Inativar Grupo: ${groupToToggleStatus.name}`}
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    {groupToToggleStatus.status === 'inactive' ? (
                      <>
                        O grupo voltará ao status <strong>Ativo</strong>. Ele aparecerá novamente nas opções de novas matrículas e agendamento de aulas.
                      </>
                    ) : (
                      <>
                        Ao inativar este grupo, <strong>nenhuma aula futura será gerada</strong> e ele <strong>não aparecerá em novas matrículas</strong>. Todos os históricos de aulas passadas, presenças e relatórios serão <strong>preservados intactos</strong>.
                      </>
                    )}
                  </p>
                </div>
              </div>

              {statusActionError && (
                <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{statusActionError}</span>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => {
                    setGroupToToggleStatus(null);
                    setStatusActionError(null);
                  }}
                  className="px-4 py-2 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-50 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => handleToggleStatus(groupToToggleStatus)}
                  className={`px-4 py-2 text-xs font-semibold text-white rounded-xl transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 ${
                    groupToToggleStatus.status === 'inactive'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {isUpdatingStatus ? (
                    'Atualizando...'
                  ) : groupToToggleStatus.status === 'inactive' ? (
                    'Sim, Reativar Grupo'
                  ) : (
                    'Sim, Inativar Grupo'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Relatórios Exclusivos do Grupo */}
      <AnimatePresence>
        {selectedGroupForReports && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setSelectedGroupForReports(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              {(() => {
                const group = selectedGroupForReports;
                const teacher = state.teachers.find(t => t.id === group.teacher_id);
                const enrolledStudentIds = state.enrollments
                  .filter(e => e.group_id === group.id && e.status === "active")
                  .map(e => e.student_id);
                const enrolledStudents = state.students.filter(s => enrolledStudentIds.includes(s.id));

                // Aulas que pertencem ESTRITAMENTE a este grupo
                const groupClasses = state.classes
                  .filter(c => doesClassBelongToGroup(c, group.id, state))
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                const completedClasses = groupClasses.filter(c => c.status === "completed");

                // Cálculo de presença
                let presenceInfo = { label: "Presença Geral da Turma", rate: 100, present: 0, total: 0 };
                if (groupReportsStudentFilter === "all") {
                  let totalPresences = 0;
                  let totalRecords = 0;
                  completedClasses.forEach(c => {
                    if (c.attendance) {
                      Object.values(c.attendance).forEach(status => {
                        totalRecords++;
                        if (status === "present") totalPresences++;
                      });
                    }
                  });
                  presenceInfo = {
                    label: "Presença Geral da Turma",
                    rate: totalRecords > 0 ? Math.round((totalPresences / totalRecords) * 100) : 100,
                    present: totalPresences,
                    total: totalRecords
                  };
                } else {
                  const selStudent = state.students.find(s => s.id === groupReportsStudentFilter);
                  const stClasses = completedClasses.filter(c => c.attendance && c.attendance[groupReportsStudentFilter]);
                  const stPresent = stClasses.filter(c => c.attendance?.[groupReportsStudentFilter] === "present").length;
                  const stTotal = stClasses.length;
                  presenceInfo = {
                    label: `Frequência de ${selStudent?.name || "Aluno"} no Grupo`,
                    rate: stTotal > 0 ? Math.round((stPresent / stTotal) * 100) : 100,
                    present: stPresent,
                    total: stTotal
                  };
                }

                // Filtrar aulas com conteúdo ou pela seleção
                const classesToShow = groupClasses.filter(c => {
                  const hasContent = (c.report && c.report.trim() !== "") || (c.vocal_routine && c.vocal_routine.trim() !== "");
                  if (!hasContent) return false;
                  if (groupReportsStudentFilter !== "all") {
                    const sessionStudentIds = getSessionStudentIds(c, state);
                    if (!sessionStudentIds.includes(groupReportsStudentFilter)) return false;
                  }
                  return true;
                });

                return (
                  <>
                    <div className="px-6 py-4 border-b border-zinc-100 bg-white shrink-0">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-lg bg-sky-50 text-sky-700">
                              <Users className="w-5 h-5" />
                            </div>
                            <h3 className="text-lg font-bold text-zinc-900">
                              Relatório do Grupo: {group.name}
                            </h3>
                          </div>
                          <p className="text-xs text-zinc-500 mt-1">
                            {teacher ? `Prof. ${teacher.name}` : "Sem professor"} • {group.schedule || "Sem horário definido"}
                          </p>
                        </div>
                        <button
                          onClick={() => setSelectedGroupForReports(null)}
                          className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition-colors"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Alunos Matriculados */}
                      {enrolledStudents.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5 items-center">
                          <span className="text-[11px] font-semibold text-zinc-400 mr-1">Alunos da Turma:</span>
                          {enrolledStudents.map(st => (
                            <span
                              key={st.id}
                              className={`text-[11px] px-2 py-0.5 rounded-md font-medium border transition-colors ${
                                groupReportsStudentFilter === st.id
                                  ? "bg-sky-100 text-sky-800 border-sky-300"
                                  : "bg-zinc-50 text-zinc-700 border-zinc-200"
                              }`}
                            >
                              {st.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Filtro por Aluno */}
                      <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-zinc-600">Filtrar por Aluno do Grupo:</span>
                        <select
                          value={groupReportsStudentFilter}
                          onChange={(e) => setGroupReportsStudentFilter(e.target.value)}
                          className="text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-1.5 font-medium text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-sky-500"
                        >
                          <option value="all">Todos os Alunos da Turma</option>
                          {enrolledStudents.map(st => (
                            <option key={st.id} value={st.id}>
                              {st.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-zinc-50/50 space-y-4">
                      {/* Summary Metrics */}
                      <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                          <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                            <span className="text-[10px] uppercase font-bold text-zinc-400 block">Aulas do Grupo</span>
                            <span className="text-lg font-bold text-zinc-900">{completedClasses.length}</span>
                          </div>
                          <div className="bg-sky-50/60 p-3 rounded-lg border border-sky-100">
                            <span className="text-[10px] uppercase font-bold text-sky-700 block">Registros de Presença</span>
                            <span className="text-lg font-bold text-sky-700">{presenceInfo.present} / {presenceInfo.total}</span>
                          </div>
                          <div className="bg-emerald-50/60 p-3 rounded-lg border border-emerald-100 col-span-2 sm:col-span-1">
                            <span className="text-[10px] uppercase font-bold text-emerald-700 block">{presenceInfo.label}</span>
                            <span className="text-lg font-bold text-emerald-700">{presenceInfo.rate}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Lista de Aulas e Relatórios Exclusivos deste Grupo */}
                      {classesToShow.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-xl border border-zinc-200">
                          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 mb-3">
                            <FileText className="w-6 h-6 text-zinc-400" />
                          </div>
                          <h4 className="text-sm font-medium text-zinc-900 mb-1">Nenhum relatório encontrado</h4>
                          <p className="text-xs text-zinc-500">
                            {groupReportsStudentFilter === "all"
                              ? "Nenhuma aula com relatório cadastrado para esta turma."
                              : "Nenhuma aula com relatório registrada para o aluno selecionado nesta turma."}
                          </p>
                        </div>
                      ) : (
                        classesToShow.map(session => {
                          const classTeacher = state.teachers.find(t => t.id === session.teacher_id) || teacher;
                          const sessionStudentIds = getSessionStudentIds(session, state);

                          return (
                            <div key={session.id} className="bg-white p-5 rounded-xl border border-zinc-200 shadow-2xs">
                              <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-zinc-900 text-sm">{session.title}</h4>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
                                      Aula do Grupo
                                    </span>
                                  </div>
                                  <div className="flex items-center text-xs text-zinc-500 mt-1 space-x-3">
                                    <span className="flex items-center">
                                      <CalendarIcon className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                                      {new Date(session.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                    </span>
                                    <span className="flex items-center">
                                      <Clock className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                                      {session.start_time} - {session.end_time}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-lg">
                                  Prof. {classTeacher?.name || "Desconhecido"}
                                </div>
                              </div>

                              {/* Lista de Presença da Aula */}
                              {session.attendance && Object.keys(session.attendance).length > 0 && (
                                <div className="mb-3 p-3 bg-zinc-50/70 rounded-xl border border-zinc-100">
                                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                                    Presença na Turma
                                  </span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {Object.entries(session.attendance).map(([sId, status]) => {
                                      const st = state.students.find(s => s.id === sId);
                                      if (!st) return null;
                                      const isPresent = status === "present";
                                      const isHighlighted = groupReportsStudentFilter === sId;
                                      return (
                                        <span
                                          key={sId}
                                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border ${
                                            isPresent
                                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                              : "bg-rose-50 text-rose-800 border-rose-200"
                                          } ${isHighlighted ? 'ring-2 ring-sky-500 font-bold' : ''}`}
                                        >
                                          {st.name}: {isPresent ? "Presente" : "Falta"}
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Relatório */}
                              {session.report && session.report.trim() !== "" && (
                                <div className="mt-3 pt-3 border-t border-zinc-100">
                                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                                    Relatório da Aula do Grupo
                                  </span>
                                  <p className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed bg-zinc-50/50 p-3 rounded-xl border border-zinc-100">
                                    {session.report}
                                  </p>
                                </div>
                              )}

                              {/* Rotina / Treino */}
                              {session.vocal_routine && session.vocal_routine.trim() !== "" && (
                                <div className="mt-3 pt-3 border-t border-zinc-100">
                                  <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wider block mb-1">
                                    Treino / Exercícios do Grupo
                                  </span>
                                  <p className="text-sm text-zinc-800 bg-teal-50/50 p-3 rounded-xl border border-teal-100/60 whitespace-pre-wrap leading-relaxed">
                                    {session.vocal_routine}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="px-6 py-4 border-t border-zinc-100 bg-white shrink-0 flex justify-end">
                      <button
                        onClick={() => setSelectedGroupForReports(null)}
                        className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-colors"
                      >
                        Fechar
                      </button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
