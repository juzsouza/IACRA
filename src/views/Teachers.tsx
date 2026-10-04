import React, { useState } from "react";
import { useAppStore, Teacher, WorkHour } from "../store";
import { Plus, Search, Edit2, Trash2, X, Clock, Calendar, AlertCircle, UserX, UserCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { TeacherGoogleCalendarCard } from "../components/TeacherGoogleCalendarCard";

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
  const { state, addTeacher, updateTeacher, toggleTeacherStatus, currentUserProfile } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);

  // States for Inactivation / Reactivation confirmation
  const [confirmStatusTeacher, setConfirmStatusTeacher] = useState<Teacher | null>(null);
  const [targetStatus, setTargetStatus] = useState<'active' | 'inactive'>('inactive');
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const [toggleStatusError, setToggleStatusError] = useState<string | null>(null);

  // States for Schedule Grid
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [activeTeacher, setActiveTeacher] = useState<Teacher | null>(null);
  const [newDayOfWeek, setNewDayOfWeek] = useState<number>(1);
  const [newStartTime, setNewStartTime] = useState<string>("08:00");
  const [newEndTime, setNewEndTime] = useState<string>("12:00");

  // States for Google Calendar Integration
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [googleModalTeacher, setGoogleModalTeacher] = useState<Teacher | null>(null);

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

  const totalTeachersCount = state.teachers.length;
  const activeTeachersCount = state.teachers.filter(t => t.status === 'active').length;
  const inactiveTeachersCount = state.teachers.filter(t => t.status === 'inactive').length;

  const filteredTeachers = state.teachers.filter((t) => {
    if (statusFilter === 'active' && t.status === 'inactive') return false;
    if (statusFilter === 'inactive' && t.status !== 'inactive') return false;

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

  const handleSubmit = async (e: React.FormEvent) => {
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
      await updateTeacher(editingTeacher.id, {
        ...formData,
        specialties: specialtiesArray,
      });
    } else {
      await addTeacher({ ...formData, specialties: specialtiesArray });
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
        {currentUserProfile?.role !== "teacher" && (
          <button
            onClick={() => openModal()}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Professor
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-zinc-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 bg-white z-20">
          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-zinc-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nome, especialidade ou CPF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl leading-5 bg-zinc-50 placeholder-zinc-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-zinc-100 rounded-xl self-start sm:self-auto">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                statusFilter === 'all'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Todos ({totalTeachersCount})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                statusFilter === 'active'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-zinc-600 hover:text-emerald-700'
              }`}
            >
              Ativos ({activeTeachersCount})
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                statusFilter === 'inactive'
                  ? 'bg-white text-zinc-700 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Inativos ({inactiveTeachersCount})
            </button>
          </div>
        </div>

        {/* Área de listagem com rolagem vertical interna e cabeçalho fixo (sticky) */}
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-270px)] min-h-[420px] relative">
          <table className="min-w-full divide-y divide-zinc-200 border-separate border-spacing-0">
            <thead className="bg-zinc-50 sticky top-0 z-10 shadow-xs">
              <tr>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-zinc-50 px-6 py-3.5 text-left text-xs font-semibold text-zinc-600 uppercase tracking-wider border-b border-zinc-200"
                >
                  Nome
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-zinc-50 px-6 py-3.5 text-left text-xs font-semibold text-zinc-600 uppercase tracking-wider border-b border-zinc-200"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-zinc-50 px-6 py-3.5 text-left text-xs font-semibold text-zinc-600 uppercase tracking-wider border-b border-zinc-200"
                >
                  Contato
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-zinc-50 px-6 py-3.5 text-left text-xs font-semibold text-zinc-600 uppercase tracking-wider border-b border-zinc-200"
                >
                  Especialidades
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-zinc-50 px-6 py-3.5 text-left text-xs font-semibold text-zinc-600 uppercase tracking-wider border-b border-zinc-200"
                >
                  Grade de Horários
                </th>
                <th
                  scope="col"
                  className="sticky top-0 z-10 bg-zinc-50 px-6 py-3.5 text-right text-xs font-semibold text-zinc-600 uppercase tracking-wider border-b border-zinc-200 min-w-[290px]"
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
                    className="hover:bg-zinc-50/80 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap border-b border-zinc-100">
                      <div className="flex items-center">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold ${
                          teacher.status === 'inactive'
                            ? 'bg-zinc-200 text-zinc-600'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {teacher.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-zinc-900 flex items-center gap-2">
                            {teacher.name}
                            {teacher.status === 'inactive' && (
                              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 border border-zinc-200">
                                Inativo
                              </span>
                            )}
                          </div>
                          {teacher.birth_date && (
                            <div className="text-xs text-zinc-400 mt-0.5">
                              Nasc.: {new Date(teacher.birth_date + "T00:00:00").toLocaleDateString("pt-BR")}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-b border-zinc-100">
                      {teacher.status === 'inactive' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-600 border border-zinc-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
                          Inativo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Ativo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap border-b border-zinc-100">
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
                    <td className="px-6 py-4 border-b border-zinc-100">
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
                    <td className="px-6 py-4 border-b border-zinc-100">
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
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium border-b border-zinc-100">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setActiveTeacher(teacher);
                            setIsScheduleModalOpen(true);
                          }}
                          className="h-8 px-2.5 rounded-lg text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-100 hover:text-zinc-900 border border-zinc-200/90 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                          title={currentUserProfile?.role === "super_admin" ? "Definir Grade de Horários" : "Visualizar Grade de Horários"}
                        >
                          <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Grade</span>
                        </button>
                        <button
                          onClick={() => {
                            setGoogleModalTeacher(teacher);
                            setIsGoogleModalOpen(true);
                          }}
                          className="h-8 px-2.5 rounded-lg text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-100 hover:text-zinc-900 border border-zinc-200/90 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                          title="Gerenciar Integração Google Agenda"
                        >
                          <Calendar className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <span>Google</span>
                        </button>
                        {currentUserProfile?.role !== "teacher" && (
                          <button
                            onClick={() => openModal(teacher)}
                            className="h-8 px-2.5 rounded-lg text-xs font-medium text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200/80 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                            title="Editar Professor"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            <span>Editar</span>
                          </button>
                        )}
                        {/* Ações de inativação/reativação: EXCLUSIVAS DO SUPER ADMIN */}
                        {currentUserProfile?.role === "super_admin" && (
                          teacher.status === 'inactive' ? (
                            <button
                              onClick={() => {
                                setConfirmStatusTeacher(teacher);
                                setTargetStatus('active');
                                setToggleStatusError(null);
                              }}
                              className="h-8 px-2.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50/80 hover:bg-emerald-100 border border-emerald-300/80 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                              title="Reativar Professor"
                            >
                              <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>Reativar</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setConfirmStatusTeacher(teacher);
                                setTargetStatus('inactive');
                                setToggleStatusError(null);
                              }}
                              className="h-8 px-2.5 rounded-lg text-xs font-medium text-amber-800 bg-amber-50/80 hover:bg-amber-100 border border-amber-300/80 transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                              title="Inativar Professor"
                            >
                              <UserX className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              <span>Inativar</span>
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
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

                {editingTeacher && (
                  <div className="pt-3 border-t border-zinc-150">
                    <TeacherGoogleCalendarCard
                      teacherId={editingTeacher.id}
                      teacherName={editingTeacher.name}
                    />
                  </div>
                )}

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

      {/* Modal de Google Agenda */}
      <AnimatePresence>
        {isGoogleModalOpen && googleModalTeacher && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsGoogleModalOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-zinc-100 shadow-2xl w-full max-w-md overflow-hidden relative z-10 flex flex-col"
            >
              <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg text-zinc-900">
                    Integração Google Agenda
                  </h3>
                  <p className="text-xs text-zinc-500 font-medium">
                    Professor: {googleModalTeacher.name}
                  </p>
                </div>
                <button
                  onClick={() => setIsGoogleModalOpen(false)}
                  className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <TeacherGoogleCalendarCard
                  teacherId={googleModalTeacher.id}
                  teacherName={googleModalTeacher.name}
                />
              </div>
              <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsGoogleModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors shadow-sm"
                >
                  Fechar
                </button>
              </div>
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
        {/* Inactivation / Reactivation Confirmation Modal */}
        {confirmStatusTeacher && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => {
                if (!isTogglingStatus) setConfirmStatusTeacher(null);
              }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden relative z-10 border border-zinc-200"
            >
              <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    targetStatus === 'inactive'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {targetStatus === 'inactive' ? (
                      <UserX className="w-5 h-5" />
                    ) : (
                      <UserCheck className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">
                      {targetStatus === 'inactive' ? 'Confirmar Inativação' : 'Confirmar Reativação'}
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Professor: <span className="font-semibold text-zinc-800">{confirmStatusTeacher.name}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isTogglingStatus}
                  onClick={() => setConfirmStatusTeacher(null)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {toggleStatusError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{toggleStatusError}</span>
                  </div>
                )}

                {targetStatus === 'inactive' ? (
                  <>
                    <div className="p-4 bg-amber-50/80 border border-amber-200/90 rounded-xl space-y-1.5">
                      <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
                        <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <span>Aviso: O histórico será preservado</span>
                      </div>
                      <p className="text-xs text-amber-900/90 leading-relaxed">
                        Inativar este professor <strong>não apagará seu histórico</strong>. Aulas passadas, relatórios, presenças e histórico financeiro serão preservados integralmente.
                      </p>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        O professor deixará de aparecer em novos cadastros e novas seleções.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                        Vínculos e Registros Atuais
                      </h4>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl text-center">
                          <span className="block text-xl font-bold text-zinc-900">
                            {state.enrollments.filter(e => e.teacher_id === confirmStatusTeacher.id && e.status === 'active').length}
                          </span>
                          <span className="text-[11px] font-medium text-zinc-500">Matrículas Ativas</span>
                        </div>
                        <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl text-center">
                          <span className="block text-xl font-bold text-zinc-900">
                            {state.groups.filter(g => g.teacher_id === confirmStatusTeacher.id && g.status !== 'inactive').length}
                          </span>
                          <span className="text-[11px] font-medium text-zinc-500">Grupos / Turmas</span>
                        </div>
                        <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl text-center">
                          <span className="block text-xl font-bold text-zinc-900">
                            {state.classes.filter(c => c.teacher_id === confirmStatusTeacher.id && c.date >= new Date().toISOString().split('T')[0] && c.status !== 'cancelled').length}
                          </span>
                          <span className="text-[11px] font-medium text-zinc-500">Aulas Futuras</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-blue-50/60 border border-blue-200/70 rounded-xl text-xs text-blue-900 leading-relaxed">
                      <strong>Nota Operacional:</strong> Aulas futuras e turmas existentes não são canceladas automaticamente. O remanejamento poderá ser feito pela secretaria quando oportuno.
                    </div>

                    <div className="p-3 bg-zinc-100 border border-zinc-200 rounded-xl text-xs text-zinc-700 leading-relaxed">
                      <strong>Importante (Login & Google):</strong> Inativar o professor altera apenas seu status pedagógico na escola. Não bloqueia o login do usuário no sistema e não desconecta a conta Google Agenda.
                    </div>
                  </>
                ) : (
                  <div className="py-2 space-y-3">
                    <p className="text-base font-semibold text-zinc-900">
                      Reativar este professor?
                    </p>
                    <p className="text-xs text-zinc-600 leading-relaxed">
                      O professor <strong>{confirmStatusTeacher.name}</strong> voltará a ficar disponível para novos agendamentos, turmas e matrículas. Todo o histórico permanece preservado.
                    </p>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isTogglingStatus}
                  onClick={() => setConfirmStatusTeacher(null)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-100 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isTogglingStatus}
                  onClick={async () => {
                    if (!confirmStatusTeacher) return;
                    setIsTogglingStatus(true);
                    setToggleStatusError(null);
                    const res = await toggleTeacherStatus(confirmStatusTeacher.id, targetStatus);
                    setIsTogglingStatus(false);
                    if (res && !res.success) {
                      setToggleStatusError(res.error || 'Erro ao alterar status do professor.');
                    } else {
                      setConfirmStatusTeacher(null);
                    }
                  }}
                  className={`px-4 py-2 text-xs font-semibold text-white rounded-xl transition-all shadow-sm disabled:opacity-50 flex items-center gap-2 ${
                    targetStatus === 'inactive'
                      ? 'bg-amber-600 hover:bg-amber-700 focus:ring-2 focus:ring-amber-500'
                      : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-500'
                  }`}
                >
                  {isTogglingStatus && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  {targetStatus === 'inactive' ? 'Inativar professor' : 'Reativar professor'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
