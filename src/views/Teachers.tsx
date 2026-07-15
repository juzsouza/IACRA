import React, { useState } from "react";
import { useAppStore, Teacher, WorkHour } from "../store";
import { Plus, Search, Edit2, Trash2, X, Clock, Calendar, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const formatCPF = (value: string) => {
  const digits = value.replace(/\D/g, "");
  const truncated = digits.slice(0, 11);
  if (truncated.length <= 3) return truncated;
  if (truncated.length <= 6) return `${truncated.slice(0, 3)}.${truncated.slice(3)}`;
  if (truncated.length <= 9) return `${truncated.slice(0, 3)}.${truncated.slice(3, 6)}.${truncated.slice(6)}`;
  return `${truncated.slice(0, 3)}.${truncated.slice(3, 6)}.${truncated.slice(6, 9)}-${truncated.slice(9)}`;
};

const DAYS_OF_WEEK = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

const getGroupedSchedule = (schedule?: WorkHour[]): [string, string[]][] => {
  if (!schedule) return [];
  const acc: Record<string, string[]> = {};
  const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  for (const curr of schedule) {
    const dayAbbrev = dayLabels[curr.day_of_week];
    if (!acc[dayAbbrev]) acc[dayAbbrev] = [];
    acc[dayAbbrev].push(`${curr.start_time}-${curr.end_time}`);
  }
  return Object.entries(acc);
};

export const Teachers: React.FC = () => {
  const { state, addTeacher, updateTeacher, deleteTeacher, currentUserProfile } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);

  // States for Schedule Grid
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [activeTeacher, setActiveTeacher] = useState<Teacher | null>(null);
  const [newDayOfWeek, setNewDayOfWeek] = useState<number>(1);
  const [newStartTime, setNewStartTime] = useState<string>("08:00");
  const [newEndTime, setNewEndTime] = useState<string>("12:00");

  const handleAddWorkHour = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTeacher) return;

    const currentSchedule = activeTeacher.schedule || [];

    if (newStartTime >= newEndTime) {
      alert("O horário de início deve ser anterior ao horário de término.");
      return;
    }

    const newEntry = {
      day_of_week: newDayOfWeek,
      start_time: newStartTime,
      end_time: newEndTime,
    };

    // Sort by day and start time
    const updatedSchedule = [...currentSchedule, newEntry].sort((a, b) => {
      if (a.day_of_week !== b.day_of_week) {
        return a.day_of_week - b.day_of_week;
      }
      return a.start_time.localeCompare(b.start_time);
    });

    await updateTeacher(activeTeacher.id, {
      schedule: updatedSchedule,
    });

    setActiveTeacher({
      ...activeTeacher,
      schedule: updatedSchedule,
    });
    
    // Reset to defaults
    setNewStartTime("08:00");
    setNewEndTime("12:00");
  };

  const handleRemoveWorkHour = async (indexToRemove: number) => {
    if (!activeTeacher) return;

    const currentSchedule = activeTeacher.schedule || [];
    const updatedSchedule = currentSchedule.filter((_, idx) => idx !== indexToRemove);

    await updateTeacher(activeTeacher.id, {
      schedule: updatedSchedule,
    });

    setActiveTeacher({
      ...activeTeacher,
      schedule: updatedSchedule,
    });
  };

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    cpf: "",
    specialties: "",
    birth_date: "",
  });

  const filteredTeachers = state.teachers.filter((t) => {
    const nameMatch = (t.name || "").toLowerCase().includes(searchTerm.toLowerCase());
    const specialtiesMatch = (t.specialties || []).some((s) =>
      (s || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
    const cleanSearchCpf = searchTerm.replace(/\D/g, "");
    const cleanTeacherCpf = (t.cpf || "").replace(/\D/g, "");
    const cpfMatch = cleanSearchCpf ? cleanTeacherCpf.includes(cleanSearchCpf) : false;
    return nameMatch || specialtiesMatch || cpfMatch;
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanCpf = formData.cpf.replace(/\D/g, "");
    if (cleanCpf) {
      const duplicate = state.teachers.find(t => 
        t.id !== editingTeacher?.id && 
        (t.cpf || "").replace(/\D/g, "") === cleanCpf
      );
      if (duplicate) {
        setErrorMsg(`Este CPF já possui cadastro (Professor: "${duplicate.name}").`);
        return;
      }
    }

    const specialtiesArray = formData.specialties
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (editingTeacher) {
      updateTeacher(editingTeacher.id, {
        ...formData,
        specialties: specialtiesArray,
      });
    } else {
      addTeacher({ ...formData, specialties: specialtiesArray });
    }
    closeModal();
  };

  const openModal = (teacher?: Teacher) => {
    setErrorMsg(null);
    if (teacher) {
      setEditingTeacher(teacher);
      setFormData({
        name: teacher.name,
        email: teacher.email,
        phone: teacher.phone,
        cpf: teacher.cpf || "",
        specialties: teacher.specialties.join(", "),
        birth_date: teacher.birth_date || "",
      });
    } else {
      setEditingTeacher(null);
      setFormData({
        name: "",
        email: "",
        phone: "",
        cpf: "",
        specialties: "",
        birth_date: "",
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTeacher(null);
    setErrorMsg(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Professores
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Gerencie a equipe de professores.
          </p>
        </div>
        {currentUserProfile?.role === "super_admin" && (
          <button
            onClick={() => openModal()}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Professor
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
              placeholder="Buscar por nome ou especialidade..."
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
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Nome
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Contato
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Especialidades
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Grade de Horários
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
              {filteredTeachers.length > 0 ? (
                filteredTeachers.map((teacher) => (
                  <tr
                    key={teacher.id}
                    className="hover:bg-zinc-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
                          {teacher.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-zinc-900">
                            {teacher.name}
                          </div>
                          {teacher.birth_date && (
                            <div className="text-xs text-zinc-400 mt-0.5">
                              Nasc.: {new Date(teacher.birth_date + "T00:00:00").toLocaleDateString("pt-BR")}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-zinc-900">
                        {teacher.email}
                      </div>
                      <div className="text-sm text-zinc-500">
                        {teacher.phone}
                      </div>
                      {teacher.cpf && (
                        <div className="text-xs text-zinc-400 mt-0.5">
                          CPF: {teacher.cpf}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {teacher.specialties.map((spec, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full bg-zinc-100 text-zinc-800"
                          >
                            {spec}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-zinc-600 max-w-xs truncate font-medium">
                        {teacher.schedule && teacher.schedule.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {getGroupedSchedule(teacher.schedule).map(([day, slots]) => (
                              <span key={day} className="px-2 py-0.5 bg-indigo-50 border border-indigo-100/60 text-indigo-700 rounded-md font-semibold text-[10px]">
                                {day}: {slots.join(", ")}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-zinc-400 italic">Não definida</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => {
                          setActiveTeacher(teacher);
                          setIsScheduleModalOpen(true);
                        }}
                        className="text-emerald-600 hover:text-emerald-900 mr-4 inline-flex items-center"
                        title={currentUserProfile?.role === "super_admin" ? "Definir Grade de Horários" : "Visualizar Grade de Horários"}
                      >
                        <Clock className="w-4 h-4 mr-1" />
                        <span className="text-xs font-semibold">Grade</span>
                      </button>
                      {currentUserProfile?.role === "super_admin" && (
                        <>
                          <button
                            onClick={() => openModal(teacher)}
                            className="text-indigo-600 hover:text-indigo-900 mr-4 inline-flex items-center"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteTeacher(teacher.id)}
                            className="text-rose-600 hover:text-rose-900 inline-flex items-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-zinc-500 text-sm"
                  >
                    Nenhum professor encontrado.
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
                  {editingTeacher ? "Editar Professor" : "Novo Professor"}
                </h3>
                <button
                  onClick={closeModal}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {errorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{errorMsg}</span>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Nome Completo
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Email
                    </label>
                    <input
                      required
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Telefone
                    </label>
                    <input
                      required
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Especialidades (separadas por vírgula)
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.specialties}
                    onChange={(e) =>
                      setFormData({ ...formData, specialties: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="Ex: Piano, Teoria Musical, Canto..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    CPF
                  </label>
                  <input
                    type="text"
                    value={formData.cpf}
                    onChange={(e) =>
                      setFormData({ ...formData, cpf: formatCPF(e.target.value) })
                    }
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Data de Nascimento
                  </label>
                  <input
                    type="date"
                    value={formData.birth_date}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        birth_date: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
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

      {/* Modal de Grade de Horários */}
      <AnimatePresence>
        {isScheduleModalOpen && activeTeacher && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsScheduleModalOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-zinc-100 shadow-2xl w-full max-w-lg overflow-hidden relative z-10 flex flex-col max-h-[85vh]"
            >
              <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between flex-shrink-0">
                <div>
                  <h3 className="font-bold text-lg text-zinc-900">
                    Grade de Horários
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    {activeTeacher.name} • Especialidades: {activeTeacher.specialties.join(", ")}
                  </p>
                </div>
                <button
                  onClick={() => setIsScheduleModalOpen(false)}
                  className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Visual Grid of Existing Schedule */}
              <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-zinc-50/50">
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    Horários Definidos ({activeTeacher.schedule?.length || 0})
                  </h4>
                  {(!activeTeacher.schedule || activeTeacher.schedule.length === 0) ? (
                    <div className="bg-white rounded-2xl border border-zinc-100 p-6 text-center text-zinc-500 text-sm italic">
                      Nenhum horário de trabalho definido ainda.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeTeacher.schedule.map((slot, idx) => (
                        <div
                          key={idx}
                          className="bg-white rounded-xl border border-zinc-150 px-4 py-3 shadow-sm flex items-center justify-between hover:border-zinc-200 transition-all"
                        >
                          <div className="flex items-center space-x-3">
                            <span className="flex-shrink-0 text-xs font-bold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg">
                              {DAYS_OF_WEEK.find(d => d.value === slot.day_of_week)?.label || "Segunda-feira"}
                            </span>
                            <span className="text-sm font-semibold text-zinc-800 flex items-center">
                              <Clock className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
                              {slot.start_time} às {slot.end_time}
                            </span>
                          </div>
                          {currentUserProfile?.role === "super_admin" && (
                            <button
                              type="button"
                              onClick={() => handleRemoveWorkHour(idx)}
                              className="p-1 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                              title="Remover horário"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Add form (Only for super_admin) */}
              {currentUserProfile?.role === "super_admin" ? (
                <div className="p-6 border-t border-zinc-100 bg-white flex-shrink-0">
                  <form onSubmit={handleAddWorkHour} className="space-y-4">
                    <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                      Adicionar Novo Horário
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-500 mb-1">
                          Dia da Semana
                        </label>
                        <select
                          value={newDayOfWeek}
                          onChange={(e) => setNewDayOfWeek(parseInt(e.target.value, 10))}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white text-sm font-medium"
                        >
                          {DAYS_OF_WEEK.map((d) => (
                            <option key={d.value} value={d.value}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-500 mb-1">
                          Hora Início
                        </label>
                        <input
                          type="time"
                          required
                          value={newStartTime}
                          onChange={(e) => setNewStartTime(e.target.value)}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-500 mb-1">
                          Hora Fim
                        </label>
                        <input
                          type="time"
                          required
                          value={newEndTime}
                          onChange={(e) => setNewEndTime(e.target.value)}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors shadow-sm shadow-indigo-100 flex items-center"
                      >
                        <Plus className="w-4 h-4 mr-1.5" />
                        Adicionar à Grade
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="p-4 bg-zinc-50 border-t border-zinc-100 text-center text-xs text-zinc-500 font-medium">
                  Apenas administradores podem modificar a grade de horários.
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
