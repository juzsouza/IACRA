import React, { useState } from 'react';
import { useAppStore, ChoirRegistration } from '../store';
import { Plus, Search, Edit2, Trash2, X, Users, CheckCircle, XCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Choir: React.FC = () => {
  const { state, addChoirRegistration, updateChoirRegistration, deleteChoirRegistration, addChoirVoiceType, updateChoirVoiceType, deleteChoirVoiceType } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVoiceTypeModalOpen, setIsVoiceTypeModalOpen] = useState(false);
  const [editingRegistration, setEditingRegistration] = useState<ChoirRegistration | null>(null);
  const [editingVoiceType, setEditingVoiceType] = useState<any | null>(null);
  const [voiceTypeFormData, setVoiceTypeFormData] = useState({ name: '', max_slots: 0 });
  const [error, setError] = useState<string | null>(null);
  const [voiceTypeError, setVoiceTypeError] = useState<string | null>(null);
  const [voiceTypeToDelete, setVoiceTypeToDelete] = useState<string | null>(null);

  const [formData, setFormData] = useState<Omit<ChoirRegistration, 'id'>>({
    student_id: '',
    voice_type_id: '',
    status: 'pending',
    monthly_fee: 150,
    is_internal_student: false,
  });

  const filteredRegistrations = state.choirRegistrations.filter(r => {
    const student = state.students.find(s => s.id === r.student_id);
    return student?.name.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getVoiceTypeStats = (voiceTypeId: string) => {
    const voiceType = state.choirVoiceTypes.find(v => v.id === voiceTypeId);
    if (!voiceType) return { total: 0, max: 0, available: 0 };
    
    const approvedCount = state.choirRegistrations.filter(
      r => r.voice_type_id === voiceTypeId && r.status === 'approved'
    ).length;
    
    return {
      total: approvedCount,
      max: voiceType.max_slots,
      available: voiceType.max_slots - approvedCount
    };
  };

  const handleStudentChange = (studentId: string) => {
    // Check if student is internal (has active enrollment in other plans)
    const hasActiveEnrollment = state.enrollments.some(e => e.student_id === studentId && e.status === 'active');
    
    setFormData({
      ...formData,
      student_id: studentId,
      is_internal_student: hasActiveEnrollment,
      monthly_fee: hasActiveEnrollment ? 20 : 150
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Validate slots if approving
    if (formData.status === 'approved') {
      const stats = getVoiceTypeStats(formData.voice_type_id);
      const isCurrentlyApproved = editingRegistration?.status === 'approved';
      
      if (!isCurrentlyApproved && stats.available <= 0) {
        setError('Não há vagas disponíveis para este naipe.');
        return;
      }
    }

    if (editingRegistration) {
      updateChoirRegistration(editingRegistration.id, formData);
    } else {
      addChoirRegistration(formData);
    }
    closeModal();
  };

  const openModal = (registration?: ChoirRegistration) => {
    if (registration) {
      const hasActiveEnrollment = state.enrollments.some(e => e.student_id === registration.student_id && e.status === 'active');
      
      setEditingRegistration(registration);
      setFormData({
        ...registration,
        is_internal_student: hasActiveEnrollment,
        monthly_fee: hasActiveEnrollment ? 20 : 150
      });
    } else {
      setEditingRegistration(null);
      setFormData({
        student_id: '',
        voice_type_id: '',
        status: 'pending',
        monthly_fee: 150,
        is_internal_student: false,
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRegistration(null);
    setError(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <span className="px-2.5 py-1 inline-flex items-center text-xs font-medium rounded-full bg-emerald-100 text-emerald-800"><CheckCircle className="w-3 h-3 mr-1" /> Aprovado</span>;
      case 'rejected':
        return <span className="px-2.5 py-1 inline-flex items-center text-xs font-medium rounded-full bg-rose-100 text-rose-800"><XCircle className="w-3 h-3 mr-1" /> Rejeitado</span>;
      default:
        return <span className="px-2.5 py-1 inline-flex items-center text-xs font-medium rounded-full bg-amber-100 text-amber-800"><Clock className="w-3 h-3 mr-1" /> Pendente</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Coral</h1>
          <p className="text-sm text-zinc-500 mt-1">Gestão de vagas, naipes e inscrições do coral.</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setIsVoiceTypeModalOpen(true)}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
          >
            <Users className="w-4 h-4 mr-2" />
            Gerenciar Naipes
          </button>
          <button
            onClick={() => openModal()}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Inscrição
          </button>
        </div>
      </div>

      {/* Voice Types Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {state.choirVoiceTypes.map(voice => {
          const stats = getVoiceTypeStats(voice.id);
          const isFull = stats.available <= 0;
          
          return (
            <div key={voice.id} className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-500">{voice.name}</p>
                <div className="mt-1 flex items-baseline">
                  <p className="text-2xl font-semibold text-zinc-900">{stats.total}</p>
                  <p className="ml-1 text-sm text-zinc-500">/ {stats.max}</p>
                </div>
              </div>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isFull ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                <Users className="w-6 h-6" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100">
          <div className="relative max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-zinc-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar aluno..."
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
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Naipe</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Tipo</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Mensalidade</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
              {filteredRegistrations.length > 0 ? (
                filteredRegistrations.map((reg) => {
                  const student = state.students.find(s => s.id === reg.student_id);
                  const voiceType = state.choirVoiceTypes.find(v => v.id === reg.voice_type_id);
                  
                  return (
                    <tr key={reg.id} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-zinc-900">{student?.name || 'Aluno não encontrado'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900">{voiceType?.name || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${
                          reg.is_internal_student ? 'bg-indigo-100 text-indigo-800' : 'bg-zinc-100 text-zinc-800'
                        }`}>
                          {reg.is_internal_student ? 'Interno' : 'Externo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-zinc-900">
                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(reg.monthly_fee)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(reg.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={() => openModal(reg)} className="text-indigo-600 hover:text-indigo-900 mr-4">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteChoirRegistration(reg.id)} className="text-rose-600 hover:text-rose-900">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-zinc-500 text-sm">
                    Nenhuma inscrição encontrada.
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
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-zinc-900">
                  {editingRegistration ? 'Editar Inscrição' : 'Nova Inscrição'}
                </h3>
                <button onClick={closeModal} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {error && (
                  <div className="p-3 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl">
                    {error}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Aluno</label>
                  <select
                    required
                    value={formData.student_id}
                    onChange={e => handleStudentChange(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  >
                    <option value="">Selecione um aluno</option>
                    {state.students.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Naipe</label>
                  <select
                    required
                    value={formData.voice_type_id}
                    onChange={e => setFormData({...formData, voice_type_id: e.target.value})}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  >
                    <option value="">Selecione um naipe</option>
                    {state.choirVoiceTypes.map(v => {
                      const stats = getVoiceTypeStats(v.id);
                      return (
                        <option key={v.id} value={v.id} disabled={stats.available <= 0 && formData.status === 'approved' && editingRegistration?.voice_type_id !== v.id}>
                          {v.name} ({stats.available} vagas)
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Status</label>
                  <select
                    required
                    value={formData.status}
                    onChange={e => setFormData({...formData, status: e.target.value as any})}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  >
                    <option value="pending">Pendente (Pré-inscrição)</option>
                    <option value="approved">Aprovado</option>
                    <option value="rejected">Rejeitado</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Tipo de Aluno</label>
                    <div className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-700">
                      {formData.is_internal_student ? 'Interno' : 'Externo'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Mensalidade (R$)</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={formData.monthly_fee}
                      onChange={e => setFormData({...formData, monthly_fee: parseFloat(e.target.value) || 0})}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end space-x-3">
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
                    Salvar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Voice Types Modal */}
      <AnimatePresence>
        {isVoiceTypeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => {
                setIsVoiceTypeModalOpen(false);
                setEditingVoiceType(null);
                setVoiceTypeFormData({ name: '', max_slots: 0 });
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden relative z-10 max-h-[90vh] flex flex-col"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center shrink-0">
                <h3 className="text-lg font-semibold text-zinc-900">Gerenciar Naipes</h3>
                <button
                  onClick={() => {
                    setIsVoiceTypeModalOpen(false);
                    setEditingVoiceType(null);
                    setVoiceTypeFormData({ name: '', max_slots: 0 });
                  }}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto space-y-6">
                {/* Add/Edit Form */}
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if (editingVoiceType) {
                    updateChoirVoiceType(editingVoiceType.id, voiceTypeFormData);
                  } else {
                    addChoirVoiceType(voiceTypeFormData);
                  }
                  setEditingVoiceType(null);
                  setVoiceTypeFormData({ name: '', max_slots: 0 });
                }} className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                  <h4 className="text-sm font-medium text-zinc-900 mb-3">
                    {editingVoiceType ? 'Editar Naipe' : 'Novo Naipe'}
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1">Nome</label>
                      <input
                        required
                        type="text"
                        value={voiceTypeFormData.name}
                        onChange={e => setVoiceTypeFormData({...voiceTypeFormData, name: e.target.value})}
                        className="w-full px-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        placeholder="Ex: Soprano"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1">Vagas</label>
                      <input
                        required
                        type="number"
                        min="1"
                        value={voiceTypeFormData.max_slots || ''}
                        onChange={e => setVoiceTypeFormData({...voiceTypeFormData, max_slots: parseInt(e.target.value) || 0})}
                        className="w-full px-3 py-1.5 text-sm border border-zinc-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end space-x-2">
                    {editingVoiceType && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingVoiceType(null);
                          setVoiceTypeFormData({ name: '', max_slots: 0 });
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50"
                      >
                        Cancelar
                      </button>
                    )}
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                    >
                      {editingVoiceType ? 'Salvar' : 'Adicionar'}
                    </button>
                  </div>
                </form>

                {/* List */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-zinc-900 mb-2">Naipes Cadastrados</h4>
                  {voiceTypeError && (
                    <div className="p-3 text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl mb-3">
                      {voiceTypeError}
                    </div>
                  )}
                  {state.choirVoiceTypes.map(voice => (
                    <div key={voice.id} className="flex items-center justify-between p-3 bg-white border border-zinc-200 rounded-xl">
                      <div>
                        <p className="text-sm font-medium text-zinc-900">{voice.name}</p>
                        <p className="text-xs text-zinc-500">{voice.max_slots} vagas no total</p>
                      </div>
                      {voiceTypeToDelete === voice.id ? (
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-rose-600 font-medium">Excluir?</span>
                          <button
                            onClick={() => {
                              deleteChoirVoiceType(voice.id);
                              setVoiceTypeToDelete(null);
                            }}
                            className="px-2 py-1 text-xs font-medium text-white bg-rose-600 rounded hover:bg-rose-700"
                          >
                            Sim
                          </button>
                          <button
                            onClick={() => setVoiceTypeToDelete(null)}
                            className="px-2 py-1 text-xs font-medium text-zinc-600 bg-zinc-100 rounded hover:bg-zinc-200"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <div className="flex space-x-1">
                          <button
                            onClick={() => {
                              setEditingVoiceType(voice);
                              setVoiceTypeFormData({ name: voice.name, max_slots: voice.max_slots });
                              setVoiceTypeError(null);
                            }}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              const hasRegistrations = state.choirRegistrations.some(r => r.voice_type_id === voice.id);
                              if (hasRegistrations) {
                                setVoiceTypeError('Não é possível excluir este naipe pois existem alunos matriculados nele. Remova ou transfira os alunos antes de excluir.');
                                return;
                              }
                              setVoiceTypeError(null);
                              setVoiceTypeToDelete(voice.id);
                            }}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {state.choirVoiceTypes.length === 0 && (
                    <p className="text-sm text-zinc-500 text-center py-4">Nenhum naipe cadastrado.</p>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
