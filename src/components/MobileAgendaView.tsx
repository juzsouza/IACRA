import React, { useState, useMemo, useCallback } from "react";
import { useAppStore, ClassSession } from "../store";
import { formatLocalDate, isEnrollmentActiveOnDate } from "../utils/dateUtils";
import { getGroupForSession } from "../utils/groupMatch";
import {
  getClassCardVisualTheme,
  getSessionStudents,
  getGoogleSyncBadgeInfo,
  isTeacherActive,
} from "../views/Classes";
import {
  Calendar as CalendarIcon,
  Clock,
  Users,
  MessageCircle,
  Edit2,
  Trash2,
  Plus,
  RefreshCw,
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  AlertCircle,
  Check,
  ShieldCheck,
  Bell,
  Download,
  Filter,
} from "lucide-react";

export type MobileTab = "today" | "tomorrow" | "week" | "custom";

/**
 * Retorna as 7 datas (YYYY-MM-DD) da semana corrente (Segunda a Domingo)
 * a partir de uma data base, respeitando rigorosamente o fuso local.
 */
export const getWeekDates = (baseDate: Date): string[] => {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 12, 0, 0);
  const day = d.getDay(); // 0 = Domingo, 1 = Segunda, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const current = new Date(monday);
    current.setDate(monday.getDate() + i);
    dates.push(formatLocalDate(current));
  }
  return dates;
};

/**
 * Formata data local (YYYY-MM-DD) para formato legível pt-BR (DD/MM/AAAA)
 * sem sofrer deslocamento UTC.
 */
export const formatLocalDatePtBr = (dateStr: string): string => {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateStr;
};

/**
 * Retorna o nome por extenso do dia da semana em pt-BR (ex: "segunda-feira", "sexta-feira").
 */
export const getWeekdayLong = (dateStr: string): string => {
  if (!dateStr) return "";
  const dateObj = new Date(`${dateStr}T12:00:00`);
  return dateObj.toLocaleDateString("pt-BR", { weekday: "long" });
};

/**
 * Retorna o dia da semana curto em pt-BR (ex: "Seg", "Ter", "Sex").
 */
export const getWeekdayShort = (dateStr: string): string => {
  if (!dateStr) return "";
  const dateObj = new Date(`${dateStr}T12:00:00`);
  const raw = dateObj.toLocaleDateString("pt-BR", { weekday: "short" });
  return raw.replace(".", "").toUpperCase();
};

export interface MobileAgendaViewProps {
  openModal: (session?: ClassSession) => void;
  sendWhatsAppReminder: (session: ClassSession, studentId?: string) => void;
  deleteClass: (id: string) => Promise<any>;
  resyncClassGoogle?: (id: string) => Promise<any>;
  currentUserProfile?: any;
  setSyncFeedback?: (msg: string | null) => void;
  resyncingClassId?: string | null;
  setResyncingClassId?: (id: string | null) => void;
  searchTerm?: string;
  setSearchTerm?: (term: string) => void;
  filterTeacherId?: string;
  setFilterTeacherId?: (teacherId: string) => void;
  onOpenAuditModal?: () => void;
  onOpenReminderModal?: () => void;
}

export const MobileAgendaView: React.FC<MobileAgendaViewProps> = ({
  openModal,
  sendWhatsAppReminder,
  deleteClass,
  resyncClassGoogle,
  currentUserProfile,
  setSyncFeedback,
  resyncingClassId,
  setResyncingClassId,
  searchTerm: externalSearchTerm,
  setSearchTerm: externalSetSearchTerm,
  filterTeacherId: externalFilterTeacherId,
  setFilterTeacherId: externalSetFilterTeacherId,
  onOpenAuditModal,
  onOpenReminderModal,
}) => {
  const { state, googleSyncMap, pendingSyncCount } = useAppStore();

  // Estados locais para pesquisa e professor se não fornecidos via props
  const [internalSearch, setInternalSearch] = useState("");
  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : internalSearch;
  const setSearchTerm = externalSetSearchTerm || setInternalSearch;

  const [internalTeacherId, setInternalTeacherId] = useState("");
  const filterTeacherId = externalFilterTeacherId !== undefined ? externalFilterTeacherId : internalTeacherId;
  const setFilterTeacherId = externalSetFilterTeacherId || setInternalTeacherId;

  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<MobileTab>("today");

  // Navegação de datas
  const [todayStr] = useState(() => formatLocalDate(new Date()));
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return formatLocalDate(d);
  }, []);

  const [customDate, setCustomDate] = useState<string>(() => formatLocalDate(new Date()));
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // Semanas calculadas a partir de hoje + weekOffset semanas
  const currentWeekBase = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekDates = useMemo(() => {
    return getWeekDates(currentWeekBase);
  }, [currentWeekBase]);

  // Conjunto de datas alvos para a visualização atual
  const targetDateSet = useMemo(() => {
    if (activeTab === "today") return new Set([todayStr]);
    if (activeTab === "tomorrow") return new Set([tomorrowStr]);
    if (activeTab === "week") return new Set(weekDates);
    return new Set([customDate]);
  }, [activeTab, todayStr, tomorrowStr, weekDates, customDate]);

  // =========================================================================
  // OTIMIZAÇÃO CRÍTICA DE PERFORMANCE:
  // Delimita PRIMEIRO as aulas temporalmente relevantes por data antes de
  // executar qualquer cálculo custoso de grupo, matrículas ou elegibilidade!
  // =========================================================================
  const timeScopedClasses = useMemo(() => {
    return state.classes.filter((c) => {
      if (c.status === "cancelled") return false;
      if (!c.date) return false;
      return targetDateSet.has(c.date);
    });
  }, [state.classes, targetDateSet]);

  // Filtra elegibilidade e grupos APENAS para as aulas já delimitadas
  const eligibleClasses = useMemo(() => {
    return timeScopedClasses.filter((c) => {
      const groupMatch = getGroupForSession(c, state);
      if (groupMatch) {
        const activeGroupEnrollments = state.enrollments.filter((en) => {
          if (en.group_id !== groupMatch.id || en.status !== "active") return false;
          if (!isEnrollmentActiveOnDate(en, c.date)) return false;
          const s = state.students.find((st) => st.id === en.student_id);
          return s && s.status === "active" && !s.not_eligible;
        });
        const activeDirectStudents = (c.student_ids || []).filter((sId) => {
          const s = state.students.find((st) => st.id === sId);
          return s && s.status === "active" && !s.not_eligible;
        });
        return activeGroupEnrollments.length > 0 || activeDirectStudents.length > 0;
      } else {
        if (c.student_ids && c.student_ids.length > 0) {
          const activeDirectStudents = c.student_ids.filter((sId) => {
            const s = state.students.find((st) => st.id === sId);
            return s && s.status === "active" && !s.not_eligible;
          });
          return activeDirectStudents.length > 0;
        }
        return true;
      }
    });
  }, [timeScopedClasses, state.enrollments, state.students, state.groups]);

  // Filtro de escopo do usuário, professor selecionado e busca textual
  const mobileClasses = useMemo(() => {
    let list = eligibleClasses;

    // Escopo de professor
    if (currentUserProfile?.role === "teacher" && currentUserProfile.teacher_id) {
      const teacherId = currentUserProfile.teacher_id;
      list = list.filter((c) => {
        if (c.teacher_id === teacherId) return true;
        const groupMatch = getGroupForSession(c, state);
        return groupMatch && groupMatch.teacher_id === teacherId;
      });
    } else if (filterTeacherId) {
      list = list.filter((c) => {
        if (c.teacher_id === filterTeacherId) return true;
        const groupMatch = getGroupForSession(c, state);
        return groupMatch && groupMatch.teacher_id === filterTeacherId;
      });
    }

    // Busca textual
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      list = list.filter((c) => {
        const titleMatch = (c.title || "").toLowerCase().includes(term);
        const teacherMatch = (
          state.teachers.find((t) => t.id === c.teacher_id)?.name || ""
        )
          .toLowerCase()
          .includes(term);

        const directStudentMatch = (c.student_ids || []).some((sId) => {
          const s = state.students.find(
            (st) => st.id === sId && st.status === "active" && !st.not_eligible
          );
          return s ? s.name.toLowerCase().includes(term) : false;
        });

        let groupStudentMatch = false;
        const groupMatch = getGroupForSession(c, state);
        if (groupMatch) {
          groupStudentMatch = state.enrollments.some((en) => {
            if (en.group_id !== groupMatch.id || en.status !== "active") return false;
            if (!isEnrollmentActiveOnDate(en, c.date)) return false;
            const s = state.students.find(
              (st) => st.id === en.student_id && st.status === "active" && !st.not_eligible
            );
            return s ? s.name.toLowerCase().includes(term) : false;
          });
        }

        return titleMatch || teacherMatch || directStudentMatch || groupStudentMatch;
      });
    }

    // Ordenação cronológica estrita: Data ascendente -> Horário ascendente
    return list.slice().sort((a, b) => {
      const dComp = (a.date || "").localeCompare(b.date || "");
      if (dComp !== 0) return dComp;
      return (a.start_time || "").localeCompare(b.start_time || "");
    });
  }, [
    eligibleClasses,
    currentUserProfile,
    filterTeacherId,
    searchTerm,
    state.teachers,
    state.students,
    state.enrollments,
    state.groups,
  ]);

  // Agrupamento por data para a visualização semanal
  const classesByDate = useMemo(() => {
    const acc: Record<string, ClassSession[]> = {};
    for (const session of mobileClasses) {
      const d = session.date;
      if (!acc[d]) acc[d] = [];
      acc[d].push(session);
    }
    return acc;
  }, [mobileClasses]);

  const sortedGroupedDates = useMemo(() => {
    return Object.keys(classesByDate).sort();
  }, [classesByDate]);

  // Ações de navegação rápida
  const handlePrevDay = useCallback(() => {
    const d = new Date(`${customDate}T12:00:00`);
    d.setDate(d.getDate() - 1);
    setCustomDate(formatLocalDate(d));
  }, [customDate]);

  const handleNextDay = useCallback(() => {
    const d = new Date(`${customDate}T12:00:00`);
    d.setDate(d.getDate() + 1);
    setCustomDate(formatLocalDate(d));
  }, [customDate]);

  const handleResyncGoogle = async (sessionId: string, sessionTitle: string) => {
    if (!resyncClassGoogle || !setResyncingClassId) return;
    setResyncingClassId(sessionId);
    try {
      const res = await resyncClassGoogle(sessionId);
      if (setSyncFeedback) {
        if (res.synced) {
          setSyncFeedback(`Aula "${sessionTitle}" sincronizada com o Google Calendar!`);
        } else {
          setSyncFeedback(`Aviso na sincronização: ${res.error || res.actionTaken}`);
        }
        setTimeout(() => setSyncFeedback(null), 5000);
      }
    } catch (e: any) {
      if (setSyncFeedback) {
        setSyncFeedback(`Erro ao ressincronizar: ${e?.message}`);
        setTimeout(() => setSyncFeedback(null), 5000);
      }
    } finally {
      setResyncingClassId(null);
    }
  };

  const isSuperAdmin = currentUserProfile?.role === "super_admin";
  const isAdmin = ["super_admin", "admin"].includes(currentUserProfile?.role || "");
  const isTeacher = currentUserProfile?.role === "teacher";

  return (
    <div className="w-full space-y-4 pb-12">
      {/* Header Mobile com Ações Principais */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-indigo-600 shrink-0" />
              <span>Agenda</span>
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {mobileClasses.length}{" "}
              {mobileClasses.length === 1 ? "aula encontrada" : "aulas encontradas"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              aria-label="Filtros de busca"
              className={`min-h-[44px] min-w-[44px] p-2.5 rounded-xl border flex items-center justify-center transition-colors shadow-2xs ${
                showFilters || searchTerm || filterTeacherId
                  ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                  : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
              }`}
              title="Filtros e busca"
            >
              <Search className="w-5 h-5" />
            </button>

            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => openModal()}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
                title="Agendar Nova Aula"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Aula</span>
              </button>
            )}
          </div>
        </div>

        {/* Barra de Busca e Filtro de Professor Retrátil */}
        {showFilters && (
          <div className="pt-2 border-t border-zinc-100 space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por aluno, aula ou professor..."
                className="w-full min-h-[44px] pl-9 pr-9 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600"
                  title="Limpar busca"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {!isTeacher && (
              <div className="relative">
                <select
                  value={filterTeacherId}
                  onChange={(e) => setFilterTeacherId(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                >
                  <option value="">Professor (Todos)</option>
                  {state.teachers.filter(isTeacherActive).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {filterTeacherId && (
                  <button
                    type="button"
                    onClick={() => setFilterTeacherId("")}
                    className="absolute right-8 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600"
                    title="Limpar filtro de professor"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Atalhos Rápidos para Administrador (Auditoria / Lembretes) */}
        {isAdmin && (
          <div className="flex items-center gap-2 pt-1 overflow-x-auto custom-scrollbar pb-1 text-xs">
            {pendingSyncCount > 0 && onOpenAuditModal && (
              <button
                type="button"
                onClick={onOpenAuditModal}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-bold flex items-center gap-1.5 shrink-0"
              >
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>{pendingSyncCount} Pendência(s)</span>
              </button>
            )}

            {onOpenAuditModal && (
              <button
                type="button"
                onClick={onOpenAuditModal}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-700 font-medium flex items-center gap-1.5 shrink-0 hover:bg-zinc-100"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                <span>Auditoria Nuvem</span>
              </button>
            )}

            {onOpenReminderModal && (
              <button
                type="button"
                onClick={onOpenReminderModal}
                className="min-h-[38px] px-3 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-700 font-medium flex items-center gap-1.5 shrink-0 hover:bg-zinc-100"
              >
                <Bell className="w-3.5 h-3.5 text-zinc-500" />
                <span>Lembretes</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Navegação por Abas: Hoje, Amanhã, Semana, Outra Data */}
      <div className="grid grid-cols-4 gap-1.5 bg-zinc-100 p-1.5 rounded-2xl border border-zinc-200/80">
        <button
          type="button"
          onClick={() => setActiveTab("today")}
          className={`min-h-[48px] px-2 py-1.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center ${
            activeTab === "today"
              ? "bg-white text-indigo-600 shadow-sm border border-zinc-200/60"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          <span>Hoje</span>
          <span className="text-[10px] font-normal text-zinc-400 mt-0.5">
            {formatLocalDatePtBr(todayStr).substring(0, 5)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("tomorrow")}
          className={`min-h-[48px] px-2 py-1.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center ${
            activeTab === "tomorrow"
              ? "bg-white text-indigo-600 shadow-sm border border-zinc-200/60"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          <span>Amanhã</span>
          <span className="text-[10px] font-normal text-zinc-400 mt-0.5">
            {formatLocalDatePtBr(tomorrowStr).substring(0, 5)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("week")}
          className={`min-h-[48px] px-2 py-1.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center ${
            activeTab === "week"
              ? "bg-white text-indigo-600 shadow-sm border border-zinc-200/60"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          <span>Semana</span>
          <span className="text-[10px] font-normal text-zinc-400 mt-0.5">7 Dias</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("custom")}
          className={`min-h-[48px] px-2 py-1.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center ${
            activeTab === "custom"
              ? "bg-white text-indigo-600 shadow-sm border border-zinc-200/60"
              : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          <span>Outra Data</span>
          <span className="text-[10px] font-normal text-zinc-400 mt-0.5">
            {activeTab === "custom" ? formatLocalDatePtBr(customDate).substring(0, 5) : "Escolher"}
          </span>
        </button>
      </div>

      {/* Controles Específicos para a aba "Semana" */}
      {activeTab === "week" && (
        <div className="bg-white p-3 rounded-2xl border border-zinc-200 flex items-center justify-between text-xs shadow-2xs">
          <button
            type="button"
            onClick={() => setWeekOffset((prev) => prev - 1)}
            className="min-h-[44px] min-w-[44px] p-2 rounded-xl text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200 flex items-center justify-center transition-colors"
            title="Semana anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="text-center">
            <span className="font-bold text-zinc-900 block">
              {formatLocalDatePtBr(weekDates[0])} a {formatLocalDatePtBr(weekDates[6])}
            </span>
            {weekOffset !== 0 ? (
              <button
                type="button"
                onClick={() => setWeekOffset(0)}
                className="text-[11px] text-indigo-600 font-semibold underline mt-0.5"
              >
                Voltar p/ Esta Semana
              </button>
            ) : (
              <span className="text-[10px] text-zinc-500 font-medium">Semana Atual</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setWeekOffset((prev) => prev + 1)}
            className="min-h-[44px] min-w-[44px] p-2 rounded-xl text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200 flex items-center justify-center transition-colors"
            title="Próxima semana"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Controles Específicos para a aba "Outra Data" */}
      {activeTab === "custom" && (
        <div className="bg-white p-3 rounded-2xl border border-zinc-200 flex items-center gap-2 shadow-2xs">
          <button
            type="button"
            onClick={handlePrevDay}
            className="min-h-[44px] min-w-[44px] p-2 rounded-xl text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200 flex items-center justify-center transition-colors"
            title="Dia anterior"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex-1">
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <button
            type="button"
            onClick={handleNextDay}
            className="min-h-[44px] min-w-[44px] p-2 rounded-xl text-zinc-600 hover:bg-zinc-100 active:bg-zinc-200 flex items-center justify-center transition-colors"
            title="Próximo dia"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Subcabeçalho de Contexto da Data Selecionada */}
      <div className="px-1 text-xs text-zinc-500 font-medium flex items-center justify-between">
        <span className="capitalize">
          {activeTab === "today" && `Hoje, ${formatLocalDatePtBr(todayStr)} (${getWeekdayLong(todayStr)})`}
          {activeTab === "tomorrow" &&
            `Amanhã, ${formatLocalDatePtBr(tomorrowStr)} (${getWeekdayLong(tomorrowStr)})`}
          {activeTab === "week" && `Aulas no intervalo da semana`}
          {activeTab === "custom" &&
            `${formatLocalDatePtBr(customDate)} (${getWeekdayLong(customDate)})`}
        </span>
        <span className="font-semibold text-zinc-700">
          {mobileClasses.length} {mobileClasses.length === 1 ? "aula" : "aulas"}
        </span>
      </div>

      {/* LISTA CRONOLÓGICA DE AULAS */}
      {mobileClasses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-200/80 p-8 text-center space-y-3 shadow-2xs">
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
            <CalendarIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-800">Nenhuma aula encontrada</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
              Não há aulas agendadas para o período selecionado ou os filtros aplicados não retornaram resultados.
            </p>
          </div>
          {(searchTerm || filterTeacherId) && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setFilterTeacherId("");
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors"
            >
              Limpar Filtros
            </button>
          )}
        </div>
      ) : activeTab === "week" ? (
        // Modo Semana com Separadores por Dia
        <div className="space-y-6">
          {sortedGroupedDates.map((dateKey) => {
            const daySessions = classesByDate[dateKey] || [];
            return (
              <div key={dateKey} className="space-y-3">
                <div className="sticky top-2 z-10 bg-zinc-100/90 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-zinc-200/60 flex items-center justify-between text-xs font-bold text-zinc-800 shadow-2xs">
                  <span className="capitalize">
                    {getWeekdayLong(dateKey)}, {formatLocalDatePtBr(dateKey)}
                  </span>
                  <span className="text-[11px] font-semibold text-zinc-500 bg-white px-2 py-0.5 rounded-full border border-zinc-200">
                    {daySessions.length} {daySessions.length === 1 ? "aula" : "aulas"}
                  </span>
                </div>

                <div className="space-y-3">
                  {daySessions.map((session) => (
                    <MobileClassCard
                      key={session.id}
                      session={session}
                      state={state}
                      googleSyncMap={googleSyncMap}
                      currentUserProfile={currentUserProfile}
                      onOpenModal={openModal}
                      onSendWhatsApp={sendWhatsAppReminder}
                      onDeleteClass={deleteClass}
                      onResyncGoogle={handleResyncGoogle}
                      resyncingClassId={resyncingClassId}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // Lista Cronológica Vertical Direta (Hoje, Amanhã, Outra Data)
        <div className="space-y-3">
          {mobileClasses.map((session) => (
            <MobileClassCard
              key={session.id}
              session={session}
              state={state}
              googleSyncMap={googleSyncMap}
              currentUserProfile={currentUserProfile}
              onOpenModal={openModal}
              onSendWhatsApp={sendWhatsAppReminder}
              onDeleteClass={deleteClass}
              onResyncGoogle={handleResyncGoogle}
              resyncingClassId={resyncingClassId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface MobileClassCardProps {
  session: ClassSession;
  state: any;
  googleSyncMap: any;
  currentUserProfile: any;
  onOpenModal: (session?: ClassSession) => void;
  onSendWhatsApp: (session: ClassSession, studentId?: string) => void;
  onDeleteClass: (id: string) => Promise<any>;
  onResyncGoogle: (id: string, title: string) => Promise<void>;
  resyncingClassId?: string | null;
}

const MobileClassCard: React.FC<MobileClassCardProps> = ({
  session,
  state,
  googleSyncMap,
  currentUserProfile,
  onOpenModal,
  onSendWhatsApp,
  onDeleteClass,
  onResyncGoogle,
  resyncingClassId,
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const teacher = state.teachers.find((t: any) => t.id === session.teacher_id);
  const students = getSessionStudents(session, state);
  const groupMatch = getGroupForSession(session, state);

  const visualTheme = getClassCardVisualTheme(session, state);

  const isMakeup =
    (session.title || "").toLowerCase().includes("reposição") ||
    (session.title || "").toLowerCase().includes("reposicao") ||
    (session.title || "").toLowerCase().includes("reagendad") ||
    (session.report || "").toLowerCase().includes("aula de reposição") ||
    (session.report || "").toLowerCase().includes("aula de reposicao");

  const hasReport =
    session.report &&
    session.report.trim().length > 0 &&
    !session.report.trim().startsWith("Aula de reposição");

  const isTeacher = currentUserProfile?.role === "teacher";
  const isSuperAdmin = currentUserProfile?.role === "super_admin";
  const isAdmin = ["super_admin", "admin"].includes(currentUserProfile?.role || "");

  // Informações de Sincronização com o Google Calendar
  const syncInfo = googleSyncMap?.[session.id] || {
    status: (session as any).google_calendar_sync_status || "unsynced",
    error: (session as any).google_calendar_sync_error,
  };
  const syncBadge = getGoogleSyncBadgeInfo(syncInfo.status, syncInfo.error);

  const handleDelete = async () => {
    if (!window.confirm(`Deseja realmente excluir a aula "${session.title}"?`)) return;
    setIsDeleting(true);
    try {
      await onDeleteClass(session.id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className={`rounded-2xl p-4 border transition-all shadow-xs flex flex-col justify-between space-y-3.5 bg-white ${
        visualTheme.type === "present"
          ? "border-emerald-300 ring-1 ring-emerald-200/50"
          : visualTheme.type === "absent_with_makeup"
          ? "border-amber-300 ring-1 ring-amber-200/50"
          : visualTheme.type === "absent_no_makeup"
          ? "border-rose-300 ring-1 ring-rose-200/50"
          : "border-purple-300 ring-1 ring-purple-200/50"
      }`}
    >
      {/* Topo do Card: Horário, Badges de Status e Google Sync */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 font-mono text-xs font-bold text-zinc-900 border border-zinc-200">
            <Clock className="w-3.5 h-3.5 text-zinc-600" />
            <span>
              {session.start_time}
              {session.end_time ? ` - ${session.end_time}` : ""}
            </span>
          </div>

          {/* Badge de Status / Tema Visual */}
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${visualTheme.badgeClass}`}>
            {visualTheme.label}
          </span>

          {/* Indicador de Reposição */}
          {isMakeup && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
              <RefreshCw className="w-2.5 h-2.5" />
              <span>Reposição</span>
            </span>
          )}

          {/* Indicador de Presença de Relatório */}
          {hasReport && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1">
              <FileText className="w-2.5 h-2.5" />
              <span>Relatório OK</span>
            </span>
          )}
        </div>

        {/* Badge Google Sync & Botão de Ressincronização */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${syncBadge.colorClass}`}
            title={syncBadge.title}
          >
            {syncBadge.label}
          </span>

          {isAdmin && (
            <button
              type="button"
              onClick={() => onResyncGoogle(session.id, session.title)}
              disabled={resyncingClassId === session.id}
              className="min-h-[36px] min-w-[36px] p-1.5 rounded-lg text-teal-700 bg-teal-50 border border-teal-200 hover:bg-teal-100 active:bg-teal-200 flex items-center justify-center transition-colors disabled:opacity-50"
              title="Ressincronizar com o Google Calendar"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${resyncingClassId === session.id ? "animate-spin" : ""}`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Título e Professor */}
      <div>
        <h3 className="font-bold text-zinc-900 text-base leading-snug tracking-tight">
          {session.title}
        </h3>
        <p className="text-xs text-zinc-500 font-medium mt-1">
          Professor(a): <span className="text-zinc-800 font-semibold">{teacher?.name || "Não atribuído"}</span>
        </p>
        {groupMatch && (
          <div className="mt-1 flex items-center gap-1 text-xs text-indigo-700 font-semibold">
            <Users className="w-3.5 h-3.5" />
            <span>Turma / Grupo: {groupMatch.name}</span>
          </div>
        )}
      </div>

      {/* Lista de Alunos Associados */}
      <div className="pt-2 border-t border-zinc-100">
        <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
          {students.length <= 1 ? "Aluno(a):" : `Alunos (${students.length}):`}
        </span>

        {students.length === 0 ? (
          <span className="text-xs text-zinc-400 italic">Nenhum aluno ativo vinculado</span>
        ) : (
          <div className="space-y-2">
            {students.map((st: any) => {
              const hasPhone = Boolean(st.phone && st.phone.trim().length > 0);
              return (
                <div
                  key={st.id}
                  className="flex items-center justify-between p-2 rounded-xl bg-zinc-50/80 border border-zinc-200/60 text-xs"
                >
                  <div className="pr-2">
                    <span className="font-semibold text-zinc-900 block">{st.name}</span>
                    <span className="text-[11px] text-zinc-500">
                      {st.phone || "Sem telefone"} {st.instrument ? `• ${st.instrument}` : ""}
                    </span>
                  </div>

                  {/* Botão de WhatsApp de Toque Fácil (mínimo 44px de toque) */}
                  <button
                    type="button"
                    onClick={() => onSendWhatsApp(session, st.id)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold text-xs flex items-center gap-1.5 shadow-2xs transition-colors shrink-0"
                    title={`Enviar confirmação via WhatsApp para ${st.name}`}
                  >
                    <MessageCircle className="w-4 h-4 shrink-0" />
                    <span>WhatsApp</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Barra de Ações Inferior (Edição / Relatório / Exclusão com Touch Target >= 44x44px) */}
      <div className="pt-3 border-t border-zinc-100 flex items-center gap-2">
        {isTeacher ? (
          <button
            type="button"
            onClick={() => onOpenModal(session)}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
            title="Preencher relatório e presença da aula"
          >
            <FileText className="w-4 h-4" />
            <span>Relatório da Aula</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onOpenModal(session)}
            className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-colors"
            title="Editar aula"
          >
            <Edit2 className="w-4 h-4" />
            <span>Editar Aula</span>
          </button>
        )}

        {isSuperAdmin && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="min-h-[44px] min-w-[44px] p-2.5 rounded-xl text-rose-600 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 flex items-center justify-center transition-colors disabled:opacity-50"
            title="Excluir aula"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
