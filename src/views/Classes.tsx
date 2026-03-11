import React, { useState } from "react";
import { useAppStore, ClassSession } from "../store";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Calendar as CalendarIcon,
  Clock,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export const Classes: React.FC = () => {
  const { state, addClass, updateClass, deleteClass } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassSession | null>(null);

  const [formData, setFormData] = useState({
    title: "",
    teacher_id: "",
    student_ids: [] as string[],
    date: new Date().toISOString().split("T")[0],
    start_time: "09:00",
    end_time: "10:00",
    status: "scheduled" as "scheduled" | "completed" | "cancelled",
  });

  const filteredClasses = state.classes
    .filter(
      (c) =>
        c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        state.teachers
          .find((t) => t.id === c.teacher_id)
          ?.name.toLowerCase()
          .includes(searchTerm.toLowerCase()),
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingClass) {
      updateClass(editingClass.id, formData);
    } else {
      addClass(formData);
    }
    closeModal();
  };

  const openModal = (session?: ClassSession) => {
    if (session) {
      setEditingClass(session);
      setFormData(session);
    } else {
      setEditingClass(null);
      setFormData({
        title: "",
        teacher_id: state.teachers[0]?.id || "",
        student_ids: [],
        date: new Date().toISOString().split("T")[0],
        start_time: "09:00",
        end_time: "10:00",
        status: "scheduled",
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingClass(null);
  };

  const handleStudentToggle = (studentId: string) => {
    setFormData((prev) => ({
      ...prev,
      student_ids: prev.student_ids.includes(studentId)
        ? prev.student_ids.filter((id) => id !== studentId)
        : [...prev.student_ids, studentId],
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Aulas
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Agende e gerencie as aulas da escola.
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Aula
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100">
          <div className="relative max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-zinc-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por título ou professor..."
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
                  Aula
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Data e Hora
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Professor
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Alunos
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Status
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
              {filteredClasses.length > 0 ? (
                filteredClasses.map((session) => {
                  const teacher = state.teachers.find(
                    (t) => t.id === session.teacher_id,
                  );
                  const students = state.students.filter((s) =>
                    session.student_ids.includes(s.id),
                  );

                  return (
                    <tr
                      key={session.id}
                      className="hover:bg-zinc-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-zinc-900">
                          {session.title}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-zinc-900">
                          <CalendarIcon className="w-4 h-4 mr-2 text-zinc-400" />
                          {new Date(session.date).toLocaleDateString("pt-BR")}
                        </div>
                        <div className="flex items-center text-sm text-zinc-500 mt-1">
                          <Clock className="w-4 h-4 mr-2 text-zinc-400" />
                          {session.startTime} - {session.endTime}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900">
                          {teacher?.name || "Não atribuído"}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex -space-x-2 overflow-hidden">
                          {students.map((student) => (
                            <div
                              key={student.id}
                              className="inline-block h-8 w-8 rounded-full ring-2 ring-white bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs"
                              title={student.name}
                            >
                              {student.name.charAt(0).toUpperCase()}
                            </div>
                          ))}
                          {students.length === 0 && (
                            <span className="text-sm text-zinc-500">
                              Nenhum
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${
                            session.status === "scheduled"
                              ? "bg-amber-100 text-amber-800"
                              : session.status === "completed"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {session.status === "scheduled"
                            ? "Agendada"
                            : session.status === "completed"
                              ? "Concluída"
                              : "Cancelada"}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => openModal(session)}
                          className="text-indigo-600 hover:text-indigo-900 mr-4"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteClass(session.id)}
                          className="text-rose-600 hover:text-rose-900"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-zinc-500 text-sm"
                  >
                    Nenhuma aula encontrada.
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
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden relative z-10 max-h-[90vh] flex flex-col"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center shrink-0">
                <h3 className="text-lg font-semibold text-zinc-900">
                  {editingClass ? "Editar Aula" : "Nova Aula"}
                </h3>
                <button
                  onClick={closeModal}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form
                onSubmit={handleSubmit}
                className="p-6 space-y-4 overflow-y-auto"
              >
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Título da Aula
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="Ex: Aula de Piano Iniciante"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
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
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          status: e.target.value as any,
                        })
                      }
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                    >
                      <option value="scheduled">Agendada</option>
                      <option value="completed">Concluída</option>
                      <option value="cancelled">Cancelada</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Data
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
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    Alunos
                  </label>
                  <div className="border border-zinc-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-zinc-100">
                    {state.students.filter((s) => s.status === "active")
                      .length > 0 ? (
                      state.students
                        .filter((s) => s.status === "active")
                        .map((student) => (
                          <label
                            key={student.id}
                            className="flex items-center px-3 py-2 hover:bg-zinc-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={formData.studentIds.includes(student.id)}
                              onChange={() => handleStudentToggle(student.id)}
                              className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="ml-3 text-sm text-zinc-900">
                              {student.name}
                            </span>
                            <span className="ml-auto text-xs text-zinc-500">
                              {student.instrument}
                            </span>
                          </label>
                        ))
                    ) : (
                      <div className="p-3 text-sm text-zinc-500 text-center">
                        Nenhum aluno ativo encontrado.
                      </div>
                    )}
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
