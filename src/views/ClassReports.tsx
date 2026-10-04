import React, { useState, useMemo, useEffect } from "react";
import { useAppStore } from "../store";
import { VocalRoutineModal } from "../components/VocalRoutineModal";
import { ClassAuditModal } from "../components/ClassAuditModal";
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
  Printer,
  Copy,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import { ClassSession, parsePackedReport } from "../store";
import { findGroupMatch, getGroupForSession, getSessionStudents, getSessionStudentIds } from "./Classes";
import { motion, AnimatePresence } from "motion/react";
import {
  saveReportDraft,
  getReportDraft,
  hasReportDraft,
  clearReportDraft,
  setActiveDraftClassId,
  getActiveDraftClassId,
  getActiveDraftView,
  clearActiveDraftClassId,
} from "../utils/reportDrafts";

export const ClassReports: React.FC = () => {
  const { state, updateClass, currentUserProfile, pendingClassSyncs, pendingSyncCount, syncPendingClasses } = useAppStore();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

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
  const [vocalRoutineText, setVocalRoutineText] = useState("");
  const [attendanceState, setAttendanceState] = useState<Record<string, "present" | "absent">>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Draft Autosave & Recovery states
  const [isDraftRestored, setIsDraftRestored] = useState(false);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<number | null>(null);

  // 1. Restaurar rascunho ativo ao carregar ou voltar para a tela
  useEffect(() => {
    const activeId = getActiveDraftClassId();
    const activeView = getActiveDraftView();
    if (!activeId || isModalOpen) return;
    if (activeView && activeView !== 'class_reports') return;

    const targetSession = state.classes.find((c) => c.id === activeId);
    if (targetSession) {
      const draft = getReportDraft(activeId);
      if (draft) {
        setSelectedSession(targetSession);
        setReportText(draft.report || "");
        setVocalRoutineText(draft.vocal_routine || "");
        setAttendanceState(draft.attendance || targetSession.attendance || {});
        setIsDraftRestored(true);
        setLastDraftSavedAt(draft.updatedAt || Date.now());
        setIsModalOpen(true);
      }
    }
  }, [state.classes]);

  // 2. Autosave em tempo real enquanto o professor digita
  useEffect(() => {
    if (!isModalOpen || !selectedSession) return;
    const parsed = parsePackedReport(selectedSession.report);
    const cleanSessionReport = (selectedSession.report && !selectedSession.report.includes("//")) ? selectedSession.report : (parsed.report || "");
    const cleanSessionVocal = selectedSession.vocal_routine || parsed.vocal_routine || "";
    const cleanSessionAtt = (selectedSession.attendance && Object.keys(selectedSession.attendance).length > 0)
      ? selectedSession.attendance
      : (parsed.attendance || {});

    const isDifferent =
      reportText !== cleanSessionReport ||
      vocalRoutineText !== cleanSessionVocal ||
      JSON.stringify(attendanceState) !== JSON.stringify(cleanSessionAtt);

    if (isDifferent) {
      saveReportDraft(selectedSession.id, {
        report: reportText,
        vocal_routine: vocalRoutineText,
        attendance: attendanceState,
      });
      setActiveDraftClassId(selectedSession.id, 'class_reports');
      setLastDraftSavedAt(Date.now());
    }
  }, [reportText, vocalRoutineText, attendanceState, isModalOpen, selectedSession]);

  // Modal State for Conduta Vocal PDF / Whats
  const [isVocalModalOpen, setIsVocalModalOpen] = useState(false);
  const [vocalModalData, setVocalModalData] = useState<{
    studentName: string;
    studentPhone?: string;
    date: string;
    vocalRoutine: string;
    onSave?: (newRoutine: string) => void;
  } | null>(null);

  const lastReportNote = useMemo(() => {
    if (!selectedSession) return null;
    const currentStudentIds = selectedSession.student_ids || [];
    const groupMatch = getGroupForSession(selectedSession, state);
    const groupId = selectedSession.group_id || groupMatch?.id || null;

    if (currentStudentIds.length === 0 && !groupId) return null;

    const matchingClasses = state.classes.filter((c) => {
      if (c.id === selectedSession.id) return false;
      if (!c.report || c.report.trim() === "") return false;

      // Restringir à mesma modalidade/professor para evitar misturar relatórios de aulas distintas do mesmo aluno
      if (selectedSession.teacher_id && c.teacher_id && c.teacher_id !== selectedSession.teacher_id) {
        return false;
      }

      const cGroupMatch = getGroupForSession(c, state);
      const cGroupId = c.group_id || cGroupMatch?.id || null;

      // REGRA DE ISOLAMENTO:
      // Se a aula atual pertence a um grupo, DEVE buscar SOMENTE do mesmo grupo
      if (groupId) {
        if (cGroupId !== groupId) return false;
      } else {
        // Se a aula atual é individual, DEVE buscar SOMENTE de aulas individuais
        if (cGroupId) return false;
        const hasMatchingStudent = (c.student_ids || []).some((id) =>
          currentStudentIds.includes(id)
        );
        if (!hasMatchingStudent) return false;
      }

      // Filter by date / time (must be before the current session)
      if (selectedSession.date) {
        if (c.date > selectedSession.date) return false;
        if (c.date === selectedSession.date && selectedSession.start_time && c.start_time) {
          if (c.start_time >= selectedSession.start_time) return false;
        }
      }

      return true;
    });

    if (matchingClasses.length === 0) return null;

    matchingClasses.sort((a, b) => {
      const dateCompare = (b.date || "").localeCompare(a.date || "");
      if (dateCompare !== 0) return dateCompare;
      return (b.start_time || "").localeCompare(a.start_time || "");
    });

    const latest = matchingClasses[0];
    const cleanRep = (latest.report || "")
      .split(" // VOCAL_ROUTINE: ")[0]
      .split(" // ATTENDANCE: ")[0]
      .trim();

    if (!cleanRep) return null;

    return {
      date: latest.date,
      report: cleanRep,
    };
  }, [selectedSession, state.classes, state.groups, state.enrollments]);

  const lastVocalRoutineNote = useMemo(() => {
    if (!selectedSession) return null;
    const currentStudentIds = selectedSession.student_ids || [];
    const groupMatch = getGroupForSession(selectedSession, state);
    const groupId = selectedSession.group_id || groupMatch?.id || null;

    if (currentStudentIds.length === 0 && !groupId) return null;

    const matchingClasses = state.classes.filter((c) => {
      if (c.id === selectedSession.id) return false;
      if (!c.vocal_routine || c.vocal_routine.trim() === "") return false;

      // Restringir à mesma modalidade/professor para evitar misturar relatórios de aulas distintas do mesmo aluno
      if (selectedSession.teacher_id && c.teacher_id && c.teacher_id !== selectedSession.teacher_id) {
        return false;
      }

      const cGroupMatch = getGroupForSession(c, state);
      const cGroupId = c.group_id || cGroupMatch?.id || null;

      // REGRA DE ISOLAMENTO:
      // Se a aula atual pertence a um grupo, DEVE buscar SOMENTE do mesmo grupo
      if (groupId) {
        if (cGroupId !== groupId) return false;
      } else {
        // Se a aula atual é individual, DEVE buscar SOMENTE de aulas individuais
        if (cGroupId) return false;
        const hasMatchingStudent = (c.student_ids || []).some((id) =>
          currentStudentIds.includes(id)
        );
        if (!hasMatchingStudent) return false;
      }

      // Filter by date / time (must be before the current session)
      if (selectedSession.date) {
        if (c.date > selectedSession.date) return false;
        if (c.date === selectedSession.date && selectedSession.start_time && c.start_time) {
          if (c.start_time >= selectedSession.start_time) return false;
        }
      }

      return true;
    });

    if (matchingClasses.length === 0) return null;

    matchingClasses.sort((a, b) => {
      const dateCompare = (b.date || "").localeCompare(a.date || "");
      if (dateCompare !== 0) return dateCompare;
      return (b.start_time || "").localeCompare(a.start_time || "");
    });

    const latest = matchingClasses[0];
    const cleanVocal = (latest.vocal_routine || "").trim();

    if (!cleanVocal) return null;

    return {
      date: latest.date,
      vocal_routine: cleanVocal,
    };
  }, [selectedSession, state.classes, state.groups]);

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
      .filter((session) => session.status !== "cancelled")
      .map((session) => {
        const teacher = state.teachers.find((t) => t.id === session.teacher_id);
        const students = getSessionStudents(session, state);
        const groupMatch = getGroupForSession(session, state);

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
        if (studentFilter !== "all" && !getSessionStudentIds(session, state).includes(studentFilter)) {
          return false;
        }

        // 5. Group Filter
        if (groupFilter !== "all") {
          const classGroupId = session.group_id || groupMatch?.id;
          if (classGroupId !== groupFilter) {
            return false;
          }
        }

        // 6. Teacher Filter (Admin/Master)
        if (!isTeacher && teacherFilter !== "all") {
          const teachesClass = session.teacher_id === teacherFilter;
          const teachesGroup = groupMatch && groupMatch.teacher_id === teacherFilter;
          if (!teachesClass && !teachesGroup) return false;
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
      const hasRep = !!item.session.report && item.session.report.trim().length > 0 && !item.session.report.trim().startsWith("Aula de reposição");
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
    const parsed = parsePackedReport(session.report);
    const cleanReport = (session.report && !session.report.includes("//")) ? session.report : (parsed.report || "");
    const cleanVocal = session.vocal_routine || parsed.vocal_routine || "";
    const cleanAttendance = (session.attendance && Object.keys(session.attendance).length > 0)
      ? session.attendance
      : (parsed.attendance || {});

    const draft = getReportDraft(session.id);
    const hasDraftContent = draft && (draft.report !== undefined || draft.vocal_routine !== undefined);

    if (hasDraftContent) {
      setReportText(draft.report !== undefined ? draft.report : cleanReport);
      setVocalRoutineText(draft.vocal_routine !== undefined ? draft.vocal_routine : cleanVocal);
      setAttendanceState(draft.attendance && Object.keys(draft.attendance).length > 0 ? draft.attendance : cleanAttendance);
      setIsDraftRestored(true);
      setLastDraftSavedAt(draft.updatedAt || Date.now());
    } else {
      setReportText(cleanReport);
      setVocalRoutineText(cleanVocal);
      setAttendanceState(cleanAttendance);
      setIsDraftRestored(false);
      setLastDraftSavedAt(null);
    }
    setActiveDraftClassId(session.id, 'class_reports');
    setIsModalOpen(true);
  };

  const handleDiscardDraft = () => {
    if (!selectedSession) return;
    clearReportDraft(selectedSession.id);
    clearActiveDraftClassId();
    const parsed = parsePackedReport(selectedSession.report);
    const cleanReport = (selectedSession.report && !selectedSession.report.includes("//")) ? selectedSession.report : (parsed.report || "");
    const cleanVocal = selectedSession.vocal_routine || parsed.vocal_routine || "";
    const cleanAttendance = (selectedSession.attendance && Object.keys(selectedSession.attendance).length > 0)
      ? selectedSession.attendance
      : (parsed.attendance || {});

    setReportText(cleanReport);
    setVocalRoutineText(cleanVocal);
    setAttendanceState(cleanAttendance);
    setIsDraftRestored(false);
    setLastDraftSavedAt(null);
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    clearActiveDraftClassId();
    setIsModalOpen(false);
    setIsDraftRestored(false);
  };

  // Handle save report
  const handleSaveReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSession || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const cleanText = reportText.trim();
      const cleanVocal = vocalRoutineText.trim();
      const hasAttendance = Object.keys(attendanceState).length > 0;
      const isMakeupNoteOnly = cleanText.startsWith("Aula de reposição");
      const hasRealReport = (cleanText.length > 0 && !isMakeupNoteOnly) || cleanVocal.length > 0 || hasAttendance;
      const newStatus = (selectedSession.status === "scheduled" && hasRealReport)
        ? "completed"
        : selectedSession.status;

      const allSessionStudentIds = getSessionStudentIds(selectedSession, state);

      const res = await updateClass(selectedSession.id, { 
        report: reportText,
        vocal_routine: vocalRoutineText,
        attendance: attendanceState,
        student_ids: allSessionStudentIds.length > 0 ? allSessionStudentIds : selectedSession.student_ids,
        status: newStatus 
      });

      // Limpar rascunho salvo do dispositivo após sucesso
      clearReportDraft(selectedSession.id);
      clearActiveDraftClassId();
      setIsDraftRestored(false);
      setLastDraftSavedAt(null);

      setIsModalOpen(false);
      setSelectedSession(null);
      setReportText("");
      setVocalRoutineText("");
      setAttendanceState({});

      if (res && res.pending) {
        setSyncFeedback("Não foi possível confirmar o salvamento no servidor. Seus dados foram preservados neste computador. Tente novamente quando a conexão estiver disponível.");
        setTimeout(() => setSyncFeedback(null), 8000);
      }
    } catch (err: any) {
      console.error("Error saving report:", err);
      alert(err?.message || "Não foi possível confirmar o salvamento no servidor. Seus dados foram preservados neste computador. Tente novamente quando a conexão estiver disponível.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncFeedback("Sincronizando com o Supabase...");
    try {
      const result = await syncPendingClasses();
      if (result.syncedCount > 0) {
        setSyncFeedback(`${result.syncedCount} alteração(ões) sincronizada(s) com sucesso com o servidor!`);
      } else if (result.pendingCount === 0) {
        setSyncFeedback("Todas as aulas e relatórios já estão 100% sincronizados com a nuvem.");
      } else {
        setSyncFeedback(`${result.pendingCount} aula(s) aguardando conexão/permissão com a nuvem.`);
      }
    } catch (e: any) {
      setSyncFeedback("Erro durante sincronização: " + (e?.message || "Falha"));
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(null), 6000);
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

        <div className="flex items-center gap-3">
          {!isTeacher && (
            <>
              {pendingSyncCount > 0 && (
                <button
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="inline-flex items-center px-4 py-2 text-xs font-bold rounded-xl bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition-all shadow-xs"
                >
                  <RefreshCcw className={`w-3.5 h-3.5 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
                  {isSyncing ? "Sincronizando..." : `Sincronizar ${pendingSyncCount} pendência(s)`}
                </button>
              )}

              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="inline-flex items-center px-3.5 py-2 text-xs font-semibold rounded-xl bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-50 transition-all shadow-xs"
                title="Verificar e sincronizar diários com a nuvem"
              >
                <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 text-zinc-500 ${isSyncing ? "animate-spin" : ""}`} />
                Sincronizar Nuvem
              </button>

              <button
                id="open-class-reports-audit-modal-btn"
                onClick={() => setIsAuditModalOpen(true)}
                className="inline-flex items-center px-3.5 py-2 text-xs font-bold rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-all shadow-xs"
                title="Auditar consistência de relatórios entre Professor e Super Admin"
              >
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                Auditoria de Dados
              </button>
            </>
          )}
        </div>
      </div>

      {syncFeedback && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-medium flex items-center justify-between shadow-xs"
        >
          <span>{syncFeedback}</span>
          <button onClick={() => setSyncFeedback(null)} className="text-indigo-500 hover:text-indigo-700">
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}

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
                    {teacher.name}{teacher.status === 'inactive' ? ' (Inativo)' : ''}
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
                      {((session.title || "").toLowerCase().includes("reposição") || (session.title || "").toLowerCase().includes("reposicao") || (session.report || "").toLowerCase().includes("aula de reposição")) && (
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                          <RefreshCcw className="w-3 h-3 mr-1 text-amber-700" />
                          Reposição
                        </span>
                      )}
                      {pendingClassSyncs && pendingClassSyncs[session.id] && (
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-300 animate-pulse" title="Alteração salva localmente, aguardando envio para o servidor">
                          <RefreshCcw className="w-3 h-3 mr-1 text-amber-700" />
                          Não sincronizado
                        </span>
                      )}
                      {hasReportDraft(session.id) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs" title="Existe rascunho salvo no dispositivo">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          Rascunho salvo
                        </span>
                      )}
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
              <div className="p-6 bg-zinc-50/20 space-y-3">
                {session.attendance && Object.keys(session.attendance).length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs pb-1">
                    <span className="font-semibold text-zinc-500 mr-1">Frequência:</span>
                    {Object.entries(session.attendance).map(([stId, attVal]) => {
                      const st = state.students.find(s => s.id === stId);
                      if (!st) return null;
                      return (
                        <span
                          key={stId}
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                            attVal === "present"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-rose-50 text-rose-700 border-rose-200"
                          }`}
                        >
                          {st.name.split(' ')[0]}: {attVal === "present" ? "Presente" : "Falta"}
                        </span>
                      );
                    })}
                  </div>
                )}

                {hasReport ? (
                  <div className="relative">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">Relatório / Anotações</span>
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

                {session.vocal_routine && session.vocal_routine.trim() !== "" && (
                  <div className="mt-3 pt-3 border-t border-zinc-100">
                    <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wider block mb-1">Treino do Aluno</span>
                    <p className="text-sm text-zinc-800 bg-teal-50/50 p-3 rounded-xl border border-teal-100/60 whitespace-pre-wrap leading-relaxed">
                      {session.vocal_routine}
                    </p>
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
              onClick={() => !isSubmitting && handleCloseModal()}
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
                  onClick={handleCloseModal}
                  className="p-1.5 hover:bg-zinc-100 rounded-xl text-zinc-400 hover:text-zinc-600 transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveReport} className="flex-1 flex flex-col">
                {isDraftRestored && (
                  <div className="mx-6 mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between text-xs text-amber-900 gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        <strong>Rascunho recuperado!</strong> O texto que você estava digitando foi preservado no seu dispositivo.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleDiscardDraft}
                      className="text-xs font-bold text-amber-800 hover:text-amber-950 underline shrink-0 px-2 py-1"
                    >
                      Descartar rascunho
                    </button>
                  </div>
                )}

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

                  {/* Controle de Frequência / Presença */}
                  {selectedSession && (() => {
                    const sessionStudents = getSessionStudents(selectedSession, state);
                    if (sessionStudents.length === 0) return null;

                    const markAllPresent = () => {
                      const updated: Record<string, "present" | "absent"> = {};
                      sessionStudents.forEach((st) => {
                        updated[st.id] = "present";
                      });
                      setAttendanceState(updated);
                    };

                    return (
                      <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200/80 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                            Controle de Frequência / Presença ({sessionStudents.length} {sessionStudents.length === 1 ? 'aluno' : 'alunos'})
                          </span>
                          <button
                            type="button"
                            onClick={markAllPresent}
                            className="text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-colors shadow-2xs"
                          >
                            Marcar Todos Presentes
                          </button>
                        </div>
                        
                        <div className="divide-y divide-zinc-200/60 max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                          {sessionStudents.map((st) => {
                            const currentVal = attendanceState[st.id] || "";
                            return (
                              <div key={st.id} className="py-2 flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-zinc-900 truncate">
                                  {st.name}
                                </span>
                                <div className="flex items-center space-x-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setAttendanceState((prev) => ({
                                        ...prev,
                                        [st.id]: "present",
                                      }))
                                    }
                                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors border ${
                                      currentVal === "present"
                                        ? "bg-emerald-50 border-emerald-300 text-emerald-700 font-bold"
                                        : "bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                                    }`}
                                  >
                                    Presente
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setAttendanceState((prev) => ({
                                        ...prev,
                                        [st.id]: "absent",
                                      }))
                                    }
                                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors border ${
                                      currentVal === "absent"
                                        ? "bg-rose-50 border-rose-300 text-rose-700 font-bold"
                                        : "bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50"
                                    }`}
                                  >
                                    Falta
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  <div className="space-y-1.5">
                    <label className="block text-sm font-semibold text-zinc-700">
                      Relatório de Conteúdo & Evolução
                    </label>

                    {isDraftRestored && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs flex items-center justify-between">
                        <span className="text-amber-900 font-medium flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-amber-600" />
                          Rascunho recuperado automaticamente
                        </span>
                        <button
                          type="button"
                          onClick={handleDiscardDraft}
                          className="text-[11px] font-bold text-rose-600 hover:text-rose-700 bg-white border border-rose-200 px-2 py-0.5 rounded-md hover:bg-rose-50 transition-colors"
                        >
                          Descartar rascunho
                        </button>
                      </div>
                    )}

                    {lastReportNote && (
                      <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs">
                        <div className="flex items-center justify-between mb-1.5 font-semibold text-indigo-900">
                          <span className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-indigo-600" />
                            Última Anotação ({formatDate(lastReportNote.date)}):
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setReportText((prev) => prev ? `${prev}\n\n[Anterior]: ${lastReportNote.report}` : lastReportNote.report);
                            }}
                            className="text-[11px] font-bold text-indigo-700 hover:text-indigo-800 bg-white border border-indigo-200 px-2 py-0.5 rounded-md shadow-2xs hover:bg-indigo-50 transition-colors flex items-center gap-1 shrink-0"
                          >
                            <Copy className="w-3 h-3" />
                            Copiar para aula atual
                          </button>
                        </div>
                        <div className="text-zinc-700 italic bg-white/80 p-2 rounded-lg border border-indigo-100/50 whitespace-pre-wrap max-h-24 overflow-y-auto">
                          {lastReportNote.report}
                        </div>
                      </div>
                    )}

                    <textarea
                      value={reportText}
                      onChange={(e) => setReportText(e.target.value)}
                      placeholder="Descreva o que foi desenvolvido na aula, as conquistas do aluno, deveres de casa, dificuldades e observações gerais sobre a evolução..."
                      className="w-full min-h-[120px] p-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none resize-y transition-all placeholder:text-zinc-400"
                    />
                    <div className="flex items-center justify-between text-[11px] text-zinc-400 mt-1 px-1">
                      <span>Rascunho salvo no dispositivo</span>
                      {lastDraftSavedAt && (
                        <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                          <Check className="w-3 h-3" />
                          Salvo às {new Date(lastDraftSavedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Campo de Treino do Aluno */}
                  <div className="space-y-1.5 pt-3 border-t border-zinc-100">
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-semibold text-zinc-800 flex items-center">
                        <FileText className="w-4 h-4 mr-1.5 text-teal-600" />
                        Treino do Aluno
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const student = state.students.find(s => selectedSession.student_ids?.includes(s.id));
                          setVocalModalData({
                            studentName: student?.name || selectedSession.title || 'Aluno',
                            studentPhone: student?.phone,
                            date: selectedSession.date,
                            vocalRoutine: vocalRoutineText || '',
                            onSave: (newRoutine) => setVocalRoutineText(newRoutine),
                          });
                          setIsVocalModalOpen(true);
                        }}
                        className="text-xs font-bold text-teal-700 hover:text-teal-800 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-lg hover:bg-teal-100 transition-colors flex items-center shadow-xs"
                      >
                        <Printer className="w-3.5 h-3.5 mr-1" />
                        Exportar PDF / Whats
                      </button>
                    </div>

                    {lastVocalRoutineNote && (
                      <div className="p-3 bg-teal-50/70 border border-teal-100 rounded-xl text-xs">
                        <div className="flex items-center justify-between mb-1.5 font-semibold text-teal-900">
                          <span className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-teal-600" />
                            Último Treino Registrado ({formatDate(lastVocalRoutineNote.date)}):
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setVocalRoutineText((prev) => prev ? `${prev}\n\n[Anterior]: ${lastVocalRoutineNote.vocal_routine}` : lastVocalRoutineNote.vocal_routine);
                            }}
                            className="text-[11px] font-bold text-teal-700 hover:text-teal-800 bg-white border border-teal-200 px-2 py-0.5 rounded-md shadow-2xs hover:bg-teal-50 transition-colors flex items-center gap-1 shrink-0"
                          >
                            <Copy className="w-3 h-3" />
                            Copiar para treino atual
                          </button>
                        </div>
                        <div className="text-zinc-700 italic bg-white/80 p-2 rounded-lg border border-teal-100/50 whitespace-pre-wrap max-h-24 overflow-y-auto">
                          {lastVocalRoutineNote.vocal_routine}
                        </div>
                      </div>
                    )}
                    <textarea
                      value={vocalRoutineText}
                      onChange={(e) => setVocalRoutineText(e.target.value)}
                      placeholder="Digite aqui os exercícios de vocalise, conduta vocal e orientações para o treino do aluno..."
                      className="w-full min-h-[120px] p-4 bg-teal-50/20 border border-teal-200/80 rounded-2xl text-sm focus:ring-2 focus:ring-teal-500/10 focus:border-teal-500 outline-none resize-y transition-all placeholder:text-zinc-400 text-zinc-900"
                    />
                  </div>
                </div>

                <div className="p-6 bg-zinc-50/50 border-t border-zinc-100 flex items-center justify-between">
                  <div>
                    {selectedSession && hasReportDraft(selectedSession.id) && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleDiscardDraft}
                        className="text-xs font-semibold text-zinc-500 hover:text-rose-600 transition-colors"
                      >
                        Descartar rascunho
                      </button>
                    )}
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleCloseModal}
                      className="px-4 py-2 text-sm font-medium text-zinc-600 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 hover:text-zinc-800 transition-all disabled:opacity-50"
                    >
                      Fechar
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
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Conduta Vocal / Treino PDF */}
      {vocalModalData && (
        <VocalRoutineModal
          isOpen={isVocalModalOpen}
          onClose={() => {
            setIsVocalModalOpen(false);
            setVocalModalData(null);
          }}
          studentName={vocalModalData.studentName}
          studentPhone={vocalModalData.studentPhone}
          date={vocalModalData.date}
          vocalRoutine={vocalModalData.vocalRoutine}
          onSaveRoutine={(newRoutine) => {
            if (vocalModalData.onSave) {
              vocalModalData.onSave(newRoutine);
            }
          }}
        />
      )}

      {/* Modal Auditoria e Recuperação Segura */}
      <ClassAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
      />
    </div>
  );
};
