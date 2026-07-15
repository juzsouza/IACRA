import React, { useState, useMemo } from "react";
import { useAppStore } from "../store";
import {
  FileText,
  Search,
  Filter,
  Calendar,
  User,
  Users,
  GraduationCap,
  Clock,
  Check,
  Edit3,
  AlertCircle,
  X,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { ClassSession } from "../store";
import { findGroupMatch } from "./Classes";
import { motion, AnimatePresence } from "motion/react";

export const ClassReports: React.FC = () => {
  const { state, updateClass, currentUserProfile } = useAppStore();

  // State for search and filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "with_report" | "no_report">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "individual" | "group">("all");
  const [studentFilter, setStudentFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState(""); // YYYY-MM format

  // Modal State for adding/editing a report
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<ClassSession | null>(null);
  const [reportText, setReportText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Helper to format date
  const formatDate = (dateStr: string) => {
    try {
      const dateParts = dateStr.split("-");
      if (dateParts.length === 3) {
        return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
      }
      return dateStr;
    } catch (e) {
      return dateStr;
    }
  };

  // Helper to format day of week
  const getDayOfWeek = (dateStr: string) => {
    try {
      const date = new Date(dateStr + "T12:00:00");
      return date.toLocaleDateString("pt-BR", { weekday: "long" });
    } catch (e) {
      return "";
    }
  };

  // Determine current user context
  const isTeacher = currentUserProfile?.role === "teacher";
  const currentTeacherId = isTeacher ? currentUserProfile?.teacher_id : null;

  // Filter and prepare classes
  const classesWithMetadata = useMemo(() => {
    return state.classes
      .map((session) => {
        const teacher = state.teachers.find((t) => t.id === session.teacher_id);
        const students = state.students.filter((s) => (session.student_ids || []).includes(s.id));
        const groupMatch = findGroupMatch(session.title, state.groups);

        return {
          session,
          teacher,
          students,
          groupMatch,
          isGroup: !!groupMatch,
        };
      })
      .filter((item) => {
        // If logged in as teacher, only show their own classes or groups they teach
        if (isTeacher && currentTeacherId) {
          const teachesClass = item.session.teacher_id === currentTeacherId;
          const teachesGroup = item.groupMatch && item.groupMatch.teacher_id === currentTeacherId;
          if (!teachesClass && !teachesGroup) return false;
        }
        return true;
      });
  }, [state.classes, state.teachers, state.students, state.groups, isTeacher, currentTeacherId]);

  // Apply search & interactive filters
  const filteredReports = useMemo(() => {
    return classesWithMetadata
      .filter((item) => {
        const { session, teacher, students, groupMatch, isGroup } = item;

        // 1. Text Search Filter
        const studentNames = students.map((s) => s.name).join(" ").toLowerCase();
        const groupName = groupMatch ? groupMatch.name.toLowerCase() : "";
        const teacherName = teacher ? teacher.name.toLowerCase() : "";
        const title = (session.title || "").toLowerCase();
        const report = (session.report || "").toLowerCase();
        const searchLower = searchTerm.toLowerCase().trim();

        if (
          searchLower &&
          !studentNames.includes(searchLower) &&
          !groupName.includes(searchLower) &&
          !teacherName.includes(searchLower) &&
          !title.includes(searchLower) &&
          !report.includes(searchLower)
        ) {
          return false;
        }

        // 2. Report Status Filter
        const hasReport = !!session.report && session.report.trim().length > 0;
        if (statusFilter === "with_report" && !hasReport) return false;
        if (statusFilter === "no_report" && hasReport) return false;

        // 3. Class Type Filter
        if (typeFilter === "individual" && isGroup) return false;
        if (typeFilter === "group" && !isGroup) return false;

        // 4. Student Filter
        if (studentFilter !== "all" && !session.student_ids?.includes(studentFilter)) {
          return false;
        }

        // 5. Group Filter
        if (groupFilter !== "all" && (!groupMatch || groupMatch.id !== groupFilter)) {
          return false;
        }

        // 6. Teacher Filter (Admin only)
        if (!isTeacher && teacherFilter !== "all" && session.teacher_id !== teacherFilter) {
          return false;
        }

        // 7. Month Filter
        if (monthFilter) {
          const [year, month] = monthFilter.split("-");
          const sessionDate = new Date(session.date + "T12:00:00");
          const sYear = sessionDate.getFullYear().toString();
          const sMonth = (sessionDate.getMonth() + 1).toString().padStart(2, "0");
          if (sYear !== year || sMonth !== month) {
            return false;
          }
        }

        return true;
      })
      // Sort by date descending, then start time descending
      .sort((a, b) => {
        const dateCompare = b.session.date.localeCompare(a.session.date);
        if (dateCompare !== 0) return dateCompare;
        return b.session.start_time.localeCompare(a.session.start_time);
      });
  }, [classesWithMetadata, searchTerm, statusFilter, typeFilter, studentFilter, groupFilter, teacherFilter, monthFilter, isTeacher]);

  // Statistics calculation
  const stats = useMemo(() => {
    let total = filteredReports.length;
    let withReport = 0;
    let pendingReport = 0;

    filteredReports.forEach((item) => {
      const hasRep = !!item.session.report && item.session.report.trim().length > 0;
      if (hasRep) {
        withReport++;
      } else if (item.session.status === "completed") {
        pendingReport++;
      }
    });

    return { total, withReport, pendingReport };
  }, [filteredReports]);

  // Handle open modal
  const handleOpenEditModal = (session: ClassSession) => {
    setSelectedSession(session);
    setReportText(session.report || "");
    setIsModalOpen(true);
  };

  // Handle save report
  const handleSaveReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await updateClass(selectedSession.id, { report: reportText });
      setIsModalOpen(false);
      setSelectedSession(null);
      setReportText("");
    } catch (err) {
      console.error("Error saving report:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
            Relatórios de Aulas
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {isTeacher
              ? "Gerencie e acompanhe os relatórios e evolução das suas turmas e alunos."
              : "Acompanhe e audite os diários e relatórios de aulas de todos os professores."}
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
              Total de Aulas Listadas
            </span>
            <span className="text-3xl font-black text-zinc-900 mt-1 block">
              {stats.total}
            </span>
          </div>
          <div className="p-3 bg-zinc-50 rounded-xl text-zinc-600">
            <Calendar className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
              Aulas com Relatório
            </span>
            <span className="text-3xl font-black text-emerald-600 mt-1 block">
              {stats.withReport}
            </span>
          </div>
          <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600">
            <Check className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
              Aulas Realizadas sem Relatório
            </span>
            <span className="text-3xl font-black text-amber-600 mt-1 block">
              {stats.pendingReport}
            </span>
          </div>
          <div className="p-3 bg-amber-50 rounded-xl text-amber-600">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter panel */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Text Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar por aluno, grupo, professor ou conteúdo do relatório..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-50/50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none text-sm transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Class Type selector */}
            <div className="flex bg-zinc-100 p-1 rounded-xl">
              <button
                onClick={() => setTypeFilter("all")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  typeFilter === "all" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setTypeFilter("individual")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  typeFilter === "individual" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                Individual
              </button>
              <button
                onClick={() => setTypeFilter("group")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  typeFilter === "group" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                Grupos
              </button>
            </div>

            {/* Report Status Filter */}
            <div className="flex bg-zinc-100 p-1 rounded-xl">
              <button
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  statusFilter === "all" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                Tudo
              </button>
              <button
                onClick={() => setStatusFilter("with_report")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  statusFilter === "with_report" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                Com Relatório
              </button>
              <button
                onClick={() => setStatusFilter("no_report")}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  statusFilter === "no_report" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                Sem Relatório
              </button>
            </div>
          </div>
        </div>

        {/* Dropdown filters row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-zinc-100">
          {/* Select Student */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Aluno</label>
            <select
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="all">Todos os Alunos</option>
              {state.students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
          </div>

          {/* Select Group */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Grupo / Turma</label>
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="w-full text-xs px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="all">Todos os Grupos</option>
              {state.groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          {/* Select Teacher (Admin only) */}
          {!isTeacher && (
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Professor</label>
              <select
                value={teacherFilter}
                onChange={(e) => setTeacherFilter(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="all">Todos os Professores</option>
                {state.teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Select Month */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">Mês de Referência</label>
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="w-full text-xs px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none h-[34px]"
            />
          </div>

          {/* Reset button if any filter is active */}
          {(searchTerm || statusFilter !== "all" || typeFilter !== "all" || studentFilter !== "all" || groupFilter !== "all" || teacherFilter !== "all" || monthFilter) && (
            <div className="flex items-end sm:col-span-2 md:col-span-1">
              <button
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("all");
                  setTypeFilter("all");
                  setStudentFilter("all");
                  setGroupFilter("all");
                  setTeacherFilter("all");
                  setMonthFilter("");
                }}
                className="w-full py-2 px-4 text-xs font-medium text-zinc-500 hover:text-zinc-900 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Limpar Filtros
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Reports Listing */}
      <div className="space-y-4">
        {filteredReports.map(({ session, teacher, students, groupMatch, isGroup }) => {
          const hasReport = !!session.report && session.report.trim().length > 0;
          return (
            <div
              key={session.id}
              className={`bg-white rounded-2xl border transition-all duration-200 shadow-sm overflow-hidden flex flex-col ${
                hasReport ? "border-zinc-200" : "border-amber-200 bg-amber-50/10"
              }`}
            >
              {/* Header block */}
              <div className="p-6 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start space-x-3.5">
                  <div className={`p-2.5 rounded-xl mt-0.5 ${
                    isGroup ? "bg-sky-50 text-sky-600" : "bg-indigo-50 text-indigo-600"
                  }`}>
                    {isGroup ? <Users className="w-5 h-5" /> : <User className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-bold text-zinc-950">
                        {isGroup ? `Grupo: ${groupMatch?.name}` : students.map((s) => s.name).join(", ") || "Sem alunos"}
                      </h3>
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider ${
                        isGroup ? "bg-sky-50 text-sky-700 border border-sky-200" : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                      }`}>
                        {isGroup ? "Grupo" : "Individual"}
                      </span>
                      {session.status === "cancelled" && (
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-100">
                          Cancelada
                        </span>
                      )}
                    </div>
                    {/* Class Date / Hour */}
                    <div className="flex flex-wrap items-center text-xs text-zinc-500 mt-1 gap-x-4 gap-y-1">
                      <span className="flex items-center">
                        <Calendar className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                        {formatDate(session.date)}
                        <span className="ml-1 text-[11px] font-medium text-zinc-400 capitalize">
                          ({getDayOfWeek(session.date)})
                        </span>
                      </span>
                      <span className="flex items-center">
                        <Clock className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                        {session.start_time} - {session.end_time}
                      </span>
                      <span className="flex items-center">
                        <GraduationCap className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                        Prof. {teacher?.name || "Não informado"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="sm:self-center">
                  <button
                    onClick={() => handleOpenEditModal(session)}
                    className={`inline-flex items-center px-4 py-2 text-xs font-semibold rounded-xl border transition-all ${
                      hasReport
                        ? "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300"
                        : "bg-amber-600 text-white border-transparent hover:bg-amber-700 shadow-sm"
                    }`}
                  >
                    {hasReport ? (
                      <>
                        <Edit3 className="w-3.5 h-3.5 mr-1.5" />
                        Editar Relatório
                      </>
                    ) : (
                      <>
                        <FileText className="w-3.5 h-3.5 mr-1.5" />
                        Preencher Relatório
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Report content */}
              <div className="p-6 bg-zinc-50/20">
                {hasReport ? (
                  <div className="relative">
                    <div className="text-zinc-700 text-sm leading-relaxed whitespace-pre-wrap font-sans pl-4 border-l-2 border-indigo-500">
                      {session.report}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start space-x-3 text-amber-800 bg-amber-50/50 rounded-2xl p-4.5 border border-amber-100">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold">Nenhum relatório preenchido</h4>
                      <p className="text-xs text-amber-700/80 mt-1 leading-relaxed">
                        Esta aula {session.status === "cancelled" ? "foi cancelada" : "foi concluída"}, mas ainda não possui anotações de evolução ou conteúdo. Clique em &quot;Preencher Relatório&quot; para registrar os detalhes.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {filteredReports.length === 0 && (
          <div className="bg-white rounded-2xl border border-zinc-200 p-16 text-center shadow-sm">
            <FileText className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
            <h3 className="text-base font-semibold text-zinc-900 mb-1">Nenhum relatório encontrado</h3>
            <p className="text-sm text-zinc-500 max-w-md mx-auto">
              Não existem aulas com relatórios para os filtros selecionados ou no período informado. Tente ajustar os filtros ou redefinir a busca.
            </p>
          </div>
        )}
      </div>

      {/* Modal definition */}
      <AnimatePresence>
        {isModalOpen && selectedSession && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSubmitting && setIsModalOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-xl border border-zinc-200 w-full max-w-lg relative z-10 overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                <div className="flex items-center space-x-2.5 text-zinc-900">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-lg">
                    {selectedSession.report ? "Editar Relatório de Aula" : "Novo Relatório de Aula"}
                  </h3>
                </div>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 hover:bg-zinc-100 rounded-xl text-zinc-400 hover:text-zinc-600 transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveReport} className="flex-1 flex flex-col">
                <div className="p-6 space-y-4">
                  {/* Class Metadata Preview */}
                  <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-150 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-400 font-medium">Aula / Título:</span>
                      <span className="text-zinc-800 font-semibold text-right">{selectedSession.title}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400 font-medium">Data / Hora:</span>
                      <span className="text-zinc-800 font-semibold">
                        {formatDate(selectedSession.date)} às {selectedSession.start_time}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-zinc-700">
                      Relatório de Conteúdo & Evolução
                    </label>
                    <textarea
                      value={reportText}
                      onChange={(e) => setReportText(e.target.value)}
                      required
                      placeholder="Descreva o que foi desenvolvido na aula, as conquistas do aluno, deveres de casa, dificuldades e observações gerais sobre a evolução..."
                      className="w-full min-h-[180px] p-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none resize-y transition-all placeholder:text-zinc-400"
                    />
                  </div>
                </div>

                <div className="p-6 bg-zinc-50/50 border-t border-zinc-100 flex justify-end space-x-3">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-zinc-600 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 hover:text-zinc-800 transition-all disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm disabled:opacity-50 flex items-center"
                  >
                    {isSubmitting ? (
                      "Salvando..."
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-1.5" />
                        Salvar Relatório
                      </>
                    )}
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
