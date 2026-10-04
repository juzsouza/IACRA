import React, { useState } from "react";
import { useAppStore, ClassSession } from "../store";
import { getSessionStudents, getSessionStudentIds } from "./Classes";
import {
  Calendar as CalendarIcon,
  Clock,
  RefreshCcw,
  Check,
  X,
  Search,
  Filter,
  User,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export const Makeups: React.FC = () => {
  const { state, addClass, updateClass, currentUserProfile } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassSession | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savingClassId, setSavingClassId] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    start_time: "09:00",
    end_time: "10:00",
    teacher_id: "",
  });

  // Filter classes that are cancelled, allow makeup, and haven't been scheduled yet
  const pendingMakeups = state.classes.filter(
    (c) => c.status === "cancelled" && c.allow_makeup !== false && !c.makeup_scheduled
  ).filter((c) => {
    const cStudentIds = getSessionStudentIds(c, state);
    const originalDateFormatted = new Date(c.date + 'T12:00:00').toLocaleDateString('pt-BR');
    
    // Check if there is already a makeup session created in state specifically for this student/class
    const hasMakeupSessionCreated = state.classes.some(other => {
      if (other.id === c.id) return false;
      const matchesDate = (other.report || "").includes(`referente à aula original de ${originalDateFormatted}`) ||
                          (other.title || "").includes(`Reposição de ${originalDateFormatted}`);
      if (!matchesDate) return false;
      
      const otherStudentIds = getSessionStudentIds(other, state);
      // Only consider it a match if it shares at least one student
      return cStudentIds.length > 0 && cStudentIds.some(sid => otherStudentIds.includes(sid));
    });

    if (hasMakeupSessionCreated) {
      return false;
    }

    if (selectedTeacherId !== "all" && c.teacher_id !== selectedTeacherId) {
      return false;
    }
    const students = getSessionStudents(c, state);
    const studentNames = students.map(s => s.name).join(", ");
    const teacher = state.teachers.find(t => t.id === c.teacher_id);
    const teacherName = teacher?.name || "";
    return (
      (c.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (studentNames || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (teacherName || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const openModal = (session: ClassSession) => {
    setSelectedClass(session);
    const originalTeacher = state.teachers.find(t => t.id === session.teacher_id);
    const initialTeacherId = (originalTeacher && originalTeacher.status === 'active')
      ? session.teacher_id
      : (state.teachers.find(t => t.status === 'active')?.id || "");

    setFormData({
      date: new Date().toISOString().split("T")[0],
      start_time: session.start_time,
      end_time: session.end_time,
      teacher_id: initialTeacherId,
    });
    setIsSubmitting(false);
    setIsModalOpen(true);
    setFeedbackMessage(null);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setIsModalOpen(false);
    setSelectedClass(null);
  };

  const handleMarkAsScheduled = async (session: ClassSession) => {
    if (!window.confirm("Deseja marcar esta reposição como já agendada/resolvida para removê-la da lista?")) {
      return;
    }
    setSavingClassId(session.id);
    setFeedbackMessage(null);
    try {
      const res = await updateClass(session.id, { makeup_scheduled: true });
      if (res.success) {
        setFeedbackMessage({
          type: "success",
          text: `Reposição de "${session.title}" marcada como agendada e confirmada no Supabase!`
        });
      } else {
        const errMsg = res.error || "Não foi possível salvar esta alteração no servidor. A alteração não foi confirmada.";
        setFeedbackMessage({
          type: "error",
          text: errMsg
        });
        alert(`Erro ao salvar no servidor: ${errMsg}`);
      }
    } catch (err: any) {
      console.error("[MAKEUPS] Error updating class makeup status:", err);
      const errMsg = err?.message || "Falha de conexão com o servidor.";
      setFeedbackMessage({
        type: "error",
        text: errMsg
      });
      alert(`Erro: ${errMsg}`);
    } finally {
      setSavingClassId(null);
    }
  };

  const handleMarkAllAsScheduled = async () => {
    if (!window.confirm(`Deseja marcar todas as ${pendingMakeups.length} reposições pendentes listadas como já agendadas/resolvidas?`)) {
      return;
    }
    setIsSubmitting(true);
    setFeedbackMessage(null);
    let successCount = 0;
    let failCount = 0;
    try {
      for (const session of pendingMakeups) {
        const res = await updateClass(session.id, { makeup_scheduled: true });
        if (res.success) {
          successCount++;
        } else {
          failCount++;
        }
      }
      if (failCount === 0) {
        setFeedbackMessage({
          type: "success",
          text: `Todas as ${successCount} reposições foram marcadas como agendadas e confirmadas no Supabase.`
        });
      } else {
        setFeedbackMessage({
          type: "error",
          text: `${successCount} reposição(ões) salva(s) com sucesso, mas ${failCount} falhou(aram) ao confirmar no Supabase.`
        });
      }
    } catch (err: any) {
      console.error("Error clearing pending makeups:", err);
      setFeedbackMessage({
        type: "error",
        text: `Erro ao processar reposições em lote: ${err?.message || 'Falha desconhecida'}`
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass || isSubmitting) return;

    setIsSubmitting(true);
    setFeedbackMessage(null);
    try {
      const originalDateFormatted = new Date(selectedClass.date + 'T12:00:00').toLocaleDateString('pt-BR');

      // Create the new makeup class
      const addRes = await addClass({
        title: `${selectedClass.title} (Reposição de ${originalDateFormatted} às ${selectedClass.start_time})`,
        teacher_id: formData.teacher_id,
        student_ids: getSessionStudentIds(selectedClass, state),
        date: formData.date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        status: "scheduled",
        allow_makeup: false, // Usually makeup classes don't allow another makeup
        report: `Aula de reposição referente à aula original de ${originalDateFormatted} das ${selectedClass.start_time} às ${selectedClass.end_time}.`,
      });

      if (!addRes.success) {
        throw new Error(addRes.error || "Erro ao criar aula de reposição");
      }

      // Mark the original class as having its makeup scheduled
      const updRes = await updateClass(selectedClass.id, { makeup_scheduled: true });
      if (!updRes.success) {
        throw new Error(updRes.error || "Erro ao atualizar status da aula original");
      }

      setIsModalOpen(false);
      setSelectedClass(null);
      setFeedbackMessage({
        type: "success",
        text: "Aula de reposição agendada e confirmada com sucesso no Supabase!"
      });
    } catch (err: any) {
      console.error("Error scheduling makeup:", err);
      setFeedbackMessage({
        type: "error",
        text: err?.message || "Falha ao agendar reposição no servidor."
      });
      alert(`Erro: ${err?.message || "Falha ao agendar reposição no servidor."}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {feedbackMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-sm font-medium ${
            feedbackMessage.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="p-1 text-zinc-500 hover:text-zinc-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Reposições Pendentes
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Gerencie as aulas canceladas que têm direito a reposição.
          </p>
        </div>
        {pendingMakeups.length > 0 && (currentUserProfile?.role === "super_admin" || currentUserProfile?.role === "admin") && (
          <button
            onClick={handleMarkAllAsScheduled}
            disabled={isSubmitting || !!savingClassId}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-xs disabled:opacity-50"
          >
            <Check className="w-4 h-4 mr-2" />
            {isSubmitting ? "Processando..." : "Marcar Todas como Já Agendadas"}
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative w-full sm:max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-zinc-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por aula, aluno ou professor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl leading-5 bg-zinc-50 placeholder-zinc-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider shrink-0">
              <Filter className="w-3.5 h-3.5 text-zinc-400" />
              <span>Professor:</span>
            </div>
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="w-full sm:w-64 px-3 py-2 border border-zinc-200 rounded-xl text-sm leading-5 bg-zinc-50 font-medium text-zinc-800 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
            >
              <option value="all">Todos os Professores</option>
              {state.teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.status === 'inactive' ? ' (Inativo)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-6 bg-zinc-50/50">
          {pendingMakeups.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingMakeups.map((session) => {
                const teacher = state.teachers.find((t) => t.id === session.teacher_id);
                const students = state.students.filter((s) => (session.student_ids || []).includes(s.id));

                return (
                  <div key={session.id} className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-all flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-semibold text-zinc-900">{session.title}</h4>
                        <div className="flex items-center text-xs text-zinc-500 mt-1.5">
                          <CalendarIcon className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
                          {new Date(session.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </div>
                        <div className="flex items-center text-xs text-zinc-500 mt-1">
                          <Clock className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
                          {session.start_time} - {session.end_time}
                        </div>
                      </div>
                      <span className="px-2.5 py-1 text-[10px] font-medium rounded-full whitespace-nowrap ml-2 bg-rose-100 text-rose-800">
                        Cancelada
                      </span>
                    </div>

                    <div className="mb-4">
                      <div className="text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wider">Professor Original</div>
                      <div className="text-sm text-zinc-900 flex items-center">
                        <div className="h-6 w-6 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 font-bold text-xs mr-2">
                          {teacher?.name.charAt(0).toUpperCase() || "?"}
                        </div>
                        {teacher?.name || "Não atribuído"}
                      </div>
                    </div>

                    <div className="flex-1 mb-4">
                      <div className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Alunos ({students.length})</div>
                      <div className="flex flex-col gap-2">
                        {students.map((student) => (
                          <div key={student.id} className="flex items-center text-sm text-zinc-700 bg-zinc-50 p-1.5 rounded-lg">
                            <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs mr-2 shrink-0">
                              {student.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="truncate">{student.name}</span>
                          </div>
                        ))}
                        {students.length === 0 && <span className="text-sm text-zinc-400 italic">Nenhum aluno matriculado</span>}
                      </div>
                    </div>

                    {(currentUserProfile?.role === "super_admin" || currentUserProfile?.role === "admin") && (
                      <div className="mt-auto flex flex-col gap-2 pt-2">
                        <button
                          onClick={() => openModal(session)}
                          className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors"
                        >
                          <RefreshCcw className="w-4 h-4 mr-2" />
                          Agendar Reposição
                        </button>
                        <button
                          onClick={() => handleMarkAsScheduled(session)}
                          disabled={isSubmitting || savingClassId === session.id}
                          className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-zinc-600 bg-zinc-50 border border-zinc-200 rounded-xl hover:bg-zinc-100 transition-colors disabled:opacity-50"
                        >
                          {savingClassId === session.id ? (
                            <>
                              <RefreshCcw className="w-4 h-4 mr-2 animate-spin text-indigo-600" />
                              Salvando no Supabase...
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4 mr-2 text-emerald-600" />
                              Marcar como Já Agendada
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-medium text-zinc-900 mb-1">Tudo em dia!</h3>
              <p className="text-zinc-500">Não há aulas pendentes de reposição no momento.</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && selectedClass && (
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
                  Agendar Reposição
                </h3>
                <button
                  onClick={closeModal}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="bg-zinc-50 p-3 rounded-xl border border-zinc-200 mb-4">
                  <p className="text-sm font-medium text-zinc-900 mb-1">Aula Original:</p>
                  <p className="text-xs text-zinc-600">{selectedClass.title}</p>
                  <p className="text-xs text-zinc-600">
                    {new Date(selectedClass.date + 'T12:00:00').toLocaleDateString('pt-BR')} das {selectedClass.start_time} às {selectedClass.end_time}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Nova Data
                  </label>
                  <input
                    required
                    type="date"
                    value={formData.date}
                    onChange={(e) =>
                      setFormData({ ...formData, date: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Início
                    </label>
                    <input
                      required
                      type="time"
                      value={formData.start_time}
                      onChange={(e) =>
                        setFormData({ ...formData, start_time: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Fim
                    </label>
                    <input
                      required
                      type="time"
                      value={formData.end_time}
                      onChange={(e) =>
                        setFormData({ ...formData, end_time: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Professor
                  </label>
                  <select
                    required
                    value={formData.teacher_id}
                    onChange={(e) =>
                      setFormData({ ...formData, teacher_id: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                  >
                    <option value="" disabled>
                      Selecione um professor
                    </option>
                    {state.teachers
                      .filter(t => t.status === 'active')
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="pt-4 flex justify-end space-x-3">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
                  >
                    {isSubmitting ? "Agendando..." : "Confirmar Agendamento"}
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
