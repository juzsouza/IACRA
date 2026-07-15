import React, { useState } from "react";
import { useAppStore, ClassSession } from "../store";
import {
  Calendar as CalendarIcon,
  Clock,
  RefreshCcw,
  Check,
  X,
  Search,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export const Makeups: React.FC = () => {
  const { state, addClass, updateClass, currentUserProfile } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassSession | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    start_time: "09:00",
    end_time: "10:00",
    teacher_id: "",
  });

  // Filter classes that are cancelled, allow makeup, and haven't been scheduled yet
  const pendingMakeups = state.classes.filter(
    (c) => c.status === "cancelled" && c.allow_makeup && !c.makeup_scheduled
  ).filter((c) => {
    const students = state.students.filter(s => (c.student_ids || []).includes(s.id));
    const studentNames = students.map(s => s.name).join(", ");
    return (
      (c.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (studentNames || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const openModal = (session: ClassSession) => {
    setSelectedClass(session);
    setFormData({
      date: new Date().toISOString().split("T")[0],
      start_time: session.start_time,
      end_time: session.end_time,
      teacher_id: session.teacher_id,
    });
    setIsSubmitting(false);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setIsModalOpen(false);
    setSelectedClass(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClass || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // Create the new makeup class
      await addClass({
        title: `${selectedClass.title} (Reposição)`,
        teacher_id: formData.teacher_id,
        student_ids: selectedClass.student_ids,
        date: formData.date,
        start_time: formData.start_time,
        end_time: formData.end_time,
        status: "scheduled",
        allow_makeup: false, // Usually makeup classes don't allow another makeup
      });

      // Mark the original class as having its makeup scheduled
      await updateClass(selectedClass.id, { makeup_scheduled: true });
      setIsModalOpen(false);
      setSelectedClass(null);
    } catch (err) {
      console.error("Error scheduling makeup:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
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
            onClick={async () => {
              if (window.confirm(`Deseja marcar todas as ${pendingMakeups.length} reposições pendentes listadas como já agendadas/resolvidas?`)) {
                setIsSubmitting(true);
                try {
                  for (const session of pendingMakeups) {
                    await updateClass(session.id, { makeup_scheduled: true });
                  }
                } catch (err) {
                  console.error("Error clearing pending makeups:", err);
                } finally {
                  setIsSubmitting(false);
                }
              }
            }}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 transition-colors rounded-xl shadow-sm disabled:opacity-50"
          >
            <Check className="w-4 h-4 mr-2" />
            Limpar Todas as Pendentes
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100">
          <div className="relative w-full max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-zinc-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por aula ou aluno..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl leading-5 bg-zinc-50 placeholder-zinc-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
            />
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
                          onClick={async () => {
                            if (window.confirm("Deseja marcar esta reposição como já agendada/resolvida para removê-la da lista?")) {
                              setIsSubmitting(true);
                              try {
                                await updateClass(session.id, { makeup_scheduled: true });
                              } catch (err) {
                                console.error("Error updating class makeup status:", err);
                              } finally {
                                setIsSubmitting(false);
                              }
                            }
                          }}
                          disabled={isSubmitting}
                          className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-xl hover:bg-zinc-100 transition-colors disabled:opacity-50"
                        >
                          <Check className="w-4 h-4 mr-2 text-emerald-600" />
                          Marcar como Já Agendada
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
                    {state.teachers.map((t) => (
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
