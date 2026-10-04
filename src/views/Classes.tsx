import React, { useState } from "react";
import { useAppStore, ClassSession, parsePackedReport } from "../store";
import { isEnrollmentActiveOnDate, formatLocalDate } from "../utils/dateUtils";
import { getWhatsAppPhoneDetails, WhatsAppPhoneDetails } from "../utils/phone";
import { VocalRoutineModal } from "../components/VocalRoutineModal";
import { ClassAuditModal } from "../components/ClassAuditModal";
import { TeacherGoogleCalendarCard } from "../components/TeacherGoogleCalendarCard";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Calendar as CalendarIcon,
  Clock,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  RefreshCw,
  FileText,
  Printer,
  Copy,
  MessageCircle,
  ChevronDown,
  AlertCircle,
  Bell,
  Settings,
  History,
  Check,
  Users,
  ShieldCheck,
} from "lucide-react";
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

import { findGroupMatch, getGroupForSession } from "../utils/groupMatch";
export { findGroupMatch, getGroupForSession };

/**
 * Validador canônico de professor ativo:
 * Exige teachers.status = 'active' (rejeita 'inactive', 'inativo' e quaisquer outros)
 */
export const isTeacherActive = (t: { status?: string } | null | undefined): boolean => {
  const s = String(t?.status || '').trim().toLowerCase();
  return s === 'active';
};

export const getSessionStudentIds = (session: ClassSession, state: any): string[] => {
  let studentIds = session.student_ids || [];
  const groupMatch = getGroupForSession(session, state);

  // If the class has an explicit custom student list, return it directly and do NOT re-inject group enrollments
  if (session.has_custom_students) {
    return studentIds;
  }

  if (groupMatch) {
    const groupStudentIds = state.enrollments
      .filter((en: any) => en.group_id === groupMatch.id && en.status === 'active' && isEnrollmentActiveOnDate(en, session.date))
      .map((en: any) => en.student_id);

    const isMakeup = (session.title || "").toLowerCase().includes("reposição") || 
                     (session.title || "").toLowerCase().includes("reposicao") || 
                     (session.title || "").toLowerCase().includes("reagendad");

    if (!isMakeup) {
      // Filter out students who are actively enrolled in a DIFFERENT group and not in groupMatch
      studentIds = studentIds.filter((sid: string) => {
        if (groupStudentIds.includes(sid)) return true;
        const hasOtherActiveGroup = state.enrollments?.some(
          (en: any) => en.student_id === sid && en.status === 'active' && en.group_id && en.group_id !== groupMatch.id && isEnrollmentActiveOnDate(en, session.date)
        );
        if (hasOtherActiveGroup) return false;
        return true;
      });
    }

    studentIds = Array.from(new Set([...studentIds, ...groupStudentIds]));
  }

  return studentIds;
};

export const getSessionStudents = (session: ClassSession, state: any): any[] => {
  const studentIds = getSessionStudentIds(session, state);
  return state.students.filter((s: any) => s.status === "active" && !s.not_eligible && studentIds.includes(s.id));
};

/**
 * Determina se a aula ainda NÃO aconteceu (Agendada / Futura).
 * Regra de prioridade: Se a data da aula for posterior à data atual (ou hoje com horário posterior), ela ainda não aconteceu.
 */
export const checkIsClassFuture = (session: ClassSession): boolean => {
  if (!session.date) return false;
  
  const now = new Date();
  const todayStr = formatLocalDate(now);
  
  if (session.date > todayStr) {
    return true;
  }
  if (session.date < todayStr) {
    return false;
  }
  
  // session.date === todayStr: compara horário de início se presente
  if (session.start_time) {
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const parts = session.start_time.split(':').map(Number);
    const startH = parts[0];
    const startM = parts[1] || 0;
    
    if (!isNaN(startH)) {
      if (startH > currentHours) return true;
      if (startH === currentHours && startM > currentMinutes) return true;
      return false;
    }
  }
  
  // Se for hoje sem horário definido, considera agendada se status for scheduled
  return session.status === 'scheduled';
};

export type ClassVisualTheme = {
  type: 'future' | 'present' | 'absent_with_makeup' | 'absent_no_makeup';
  label: string;
  calendarCardClass: string;
  gridCardClass: string;
  badgeClass: string;
};

/**
 * Define o tema visual dos cards de aula da Grade do Professor:
 * 1. Se a aula ainda NÃO aconteceu -> ROXO (Futura / Agendada).
 * 2. Se a aula já aconteceu -> verificar presença:
 *    - Presente -> VERDE
 *    - Falta + passível de reposição -> AMARELO/ALARANJA
 *    - Falta + NÃO passível de reposição -> VERMELHO
 * 
 * Para múltiplos alunos: preserva a aula como realizada/presente caso haja presença (não fica vermelha se apenas um aluno faltar).
 */
export const getClassCardVisualTheme = (
  session: ClassSession,
  state: any
): ClassVisualTheme => {
  // REGRA DE PRIORIDADE 1: Se a aula ainda NÃO aconteceu -> ROXO (Futura / Agendada).
  // Não considerar ausência/presença para determinar a cor de uma aula futura.
  const isFuture = checkIsClassFuture(session);
  if (isFuture) {
    return {
      type: 'future',
      label: 'Agendada',
      calendarCardClass: 'bg-purple-50 border-purple-300 text-purple-950 hover:border-purple-400 hover:bg-purple-100/70',
      gridCardClass: 'bg-purple-50/20 border-purple-300 hover:border-purple-400 shadow-sm hover:shadow-md',
      badgeClass: 'bg-purple-100 text-purple-800 border border-purple-300 font-semibold',
    };
  }

  // REGRA DE PRIORIDADE 2: A aula JÁ aconteceu -> verificar estado de presença
  const parsed = parsePackedReport(session.report);
  const effectiveAttendance: Record<string, string> = 
    (session.attendance && Object.keys(session.attendance).length > 0)
      ? session.attendance
      : (parsed.attendance || {});

  const allowsMakeup = session.allow_makeup !== undefined 
    ? Boolean(session.allow_makeup) 
    : (parsed.allow_makeup !== undefined ? Boolean(parsed.allow_makeup) : false);

  const studentIds = getSessionStudentIds(session, state);
  const isSingleStudent = studentIds.length <= 1;

  if (isSingleStudent) {
    const singleStudentId = studentIds[0];
    const att = singleStudentId ? effectiveAttendance[singleStudentId] : undefined;

    const isAbsent = att === 'absent' || session.status === 'cancelled';
    const isPresent = att === 'present' || (!isAbsent && session.status === 'completed');

    if (isPresent) {
      return {
        type: 'present',
        label: 'Presente',
        calendarCardClass: 'bg-emerald-50 border-emerald-300 text-emerald-950 hover:border-emerald-400 hover:bg-emerald-100/70',
        gridCardClass: 'bg-emerald-50/20 border-emerald-300 hover:border-emerald-400 shadow-sm hover:shadow-md',
        badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold',
      };
    }

    if (isAbsent) {
      if (allowsMakeup) {
        return {
          type: 'absent_with_makeup',
          label: 'Falta (c/ Reposição)',
          calendarCardClass: 'bg-amber-50 border-amber-400 text-amber-950 hover:border-amber-500 hover:bg-amber-100/70',
          gridCardClass: 'bg-amber-50/20 border-amber-400 hover:border-amber-500 shadow-sm hover:shadow-md',
          badgeClass: 'bg-amber-100 text-amber-900 border border-amber-400 font-semibold',
        };
      } else {
        return {
          type: 'absent_no_makeup',
          label: 'Falta (s/ Reposição)',
          calendarCardClass: 'bg-rose-50 border-rose-300 text-rose-950 hover:border-rose-400 hover:bg-rose-100/70',
          gridCardClass: 'bg-rose-50/20 border-rose-300 hover:border-rose-400 shadow-sm hover:shadow-md',
          badgeClass: 'bg-rose-100 text-rose-800 border border-rose-300 font-semibold',
        };
      }
    }

    // Se aula passada sem presença registrada
    return {
      type: 'future',
      label: 'Agendada',
      calendarCardClass: 'bg-purple-50 border-purple-300 text-purple-950 hover:border-purple-400 hover:bg-purple-100/70',
      gridCardClass: 'bg-purple-50/20 border-purple-300 hover:border-purple-400 shadow-sm hover:shadow-md',
      badgeClass: 'bg-purple-100 text-purple-800 border border-purple-300 font-semibold',
    };
  }

  // Múltiplos alunos (Grupo ou coletiva):
  // "Para aulas com múltiplos alunos, preservar o comportamento atual e não assumir que a aula inteira deve ficar vermelha/amarela se apenas um aluno faltar."
  const attendanceValues = studentIds.map(id => effectiveAttendance[id]).filter(Boolean);
  const anyPresent = attendanceValues.some(v => v === 'present');
  const allAbsent = studentIds.length > 0 && attendanceValues.length > 0 && attendanceValues.every(v => v === 'absent');

  if (session.status === 'cancelled' || allAbsent) {
    if (allowsMakeup) {
      return {
        type: 'absent_with_makeup',
        label: 'Falta (c/ Reposição)',
        calendarCardClass: 'bg-amber-50 border-amber-400 text-amber-950 hover:border-amber-500 hover:bg-amber-100/70',
        gridCardClass: 'bg-amber-50/20 border-amber-400 hover:border-amber-500 shadow-sm hover:shadow-md',
        badgeClass: 'bg-amber-100 text-amber-900 border border-amber-400 font-semibold',
      };
    } else {
      return {
        type: 'absent_no_makeup',
        label: 'Cancelada / Falta',
        calendarCardClass: 'bg-rose-50 border-rose-300 text-rose-950 hover:border-rose-400 hover:bg-rose-100/70',
        gridCardClass: 'bg-rose-50/20 border-rose-300 hover:border-rose-400 shadow-sm hover:shadow-md',
        badgeClass: 'bg-rose-100 text-rose-800 border border-rose-300 font-semibold',
      };
    }
  }

  if (anyPresent || session.status === 'completed') {
    return {
      type: 'present',
      label: 'Realizada (Presentes)',
      calendarCardClass: 'bg-emerald-50 border-emerald-300 text-emerald-950 hover:border-emerald-400 hover:bg-emerald-100/70',
      gridCardClass: 'bg-emerald-50/20 border-emerald-300 hover:border-emerald-400 shadow-sm hover:shadow-md',
      badgeClass: 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold',
    };
  }

  return {
    type: 'future',
    label: 'Agendada',
    calendarCardClass: 'bg-purple-50 border-purple-300 text-purple-950 hover:border-purple-400 hover:bg-purple-100/70',
    gridCardClass: 'bg-purple-50/20 border-purple-300 hover:border-purple-400 shadow-sm hover:shadow-md',
    badgeClass: 'bg-purple-100 text-purple-800 border border-purple-300 font-semibold',
  };
};

export const Classes: React.FC = () => {
  const {
    state,
    addClass,
    updateClass,
    deleteClass,
    currentUserProfile,
    pendingClassSyncs,
    pendingSyncCount,
    syncPendingClasses,
    googleSyncMap,
    resyncClassGoogle,
    reconcileGoogleCalendar,
    refreshGoogleSyncStatus,
  } = useAppStore();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [isReconcilingGoogle, setIsReconcilingGoogle] = useState(false);
  const [resyncingClassId, setResyncingClassId] = useState<string | null>(null);

  React.useEffect(() => {
    if (["super_admin", "admin"].includes(currentUserProfile?.role || "")) {
      void refreshGoogleSyncStatus();
    }
  }, [currentUserProfile?.role]);

  const handleReconcileGoogle = async () => {
    if (isReconcilingGoogle) return;
    setIsReconcilingGoogle(true);
    setSyncFeedback(null);
    try {
      const res = await reconcileGoogleCalendar();
      if (res.error) {
        setSyncFeedback(`Aviso na reconciliação: ${res.error}`);
      } else {
        setSyncFeedback(
          `Reconciliação Google concluída! ${res.synced} aula(s) sincronizada(s), ${res.skipped} já sincronizada(s), ${res.failed} falha(s).`
        );
      }
    } catch (e: any) {
      setSyncFeedback(`Erro na reconciliação: ${e?.message}`);
    } finally {
      setIsReconcilingGoogle(false);
      setTimeout(() => setSyncFeedback(null), 6000);
    }
  };
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTeacherId, setFilterTeacherId] = useState<string>("");
  const [filterDate, setFilterDate] = useState<string>("");
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'calendar'>('calendar');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassSession | null>(null);
  const [isDraftRestored, setIsDraftRestored] = useState(false);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<'none' | 'semanal' | 'quinzenal' | 'mensal'>('none');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().split("T")[0];
  });
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [whatsAppModalData, setWhatsAppModalData] = useState<{
    studentName: string;
    originalPhone: string;
    primaryFormatted: string;
    primaryUrl: string;
    alternateFormatted: string | null;
    alternateUrl: string | null;
  } | null>(null);

  // --- States and logic for Automatic Class Reminders ---
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [reminderActiveTab, setReminderActiveTab] = useState<'settings' | 'logs'>('settings');

  const DEFAULT_REMINDER_TEMPLATE = `Olá, {nome_aluno}! Tudo bem?
Passando para lembrar da nossa aula de {nome_aula}, {data_aula}, às {hora_aula} com o(a) professor(a) {nome_professor}.
Te esperamos!`;

  const formatClassDate = React.useCallback((dateStr: string): string => {
    if (!dateStr) return "";
    const trimmed = String(dateStr).trim();
    const parts = trimmed.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }
    return trimmed;
  }, []);

  const defaultReminderSettings = React.useMemo(() => ({
    enabled: false,
    advance_days: 1, // 1 dia de antecedência
    template: DEFAULT_REMINDER_TEMPLATE,
  }), [DEFAULT_REMINDER_TEMPLATE]);

  const loadReminderSettingsFromStorage = React.useCallback(() => {
    const saved = localStorage.getItem("reminder_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            enabled: parsed.enabled === true,
            advance_days: typeof parsed.advance_days === 'number' && !isNaN(parsed.advance_days) ? parsed.advance_days : 1,
            template: typeof parsed.template === 'string' && parsed.template.trim().length > 0 
              ? parsed.template 
              : DEFAULT_REMINDER_TEMPLATE
          };
        }
      } catch (e) {
        // use default
      }
    }
    return {
      enabled: false,
      advance_days: 1,
      template: DEFAULT_REMINDER_TEMPLATE
    };
  }, [DEFAULT_REMINDER_TEMPLATE]);

  const [reminderSettings, setReminderSettings] = useState(() => loadReminderSettingsFromStorage());

  const saveReminderSettings = React.useCallback((newSettings: { enabled: boolean; advance_days: number; template: string }) => {
    setReminderSettings(newSettings);
    localStorage.setItem("reminder_settings", JSON.stringify(newSettings));
  }, []);

  const [reminderLogs, setReminderLogs] = useState<any[]>(() => {
    const saved = localStorage.getItem("reminder_logs");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [showReminderNotification, setShowReminderNotification] = useState<string | null>(null);

  const getTargetDateStr = React.useCallback((advanceDays: number) => {
    const target = new Date();
    target.setDate(target.getDate() + advanceDays);
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const compileTemplate = React.useCallback((
    template: string,
    studentName: string,
    classTitle: string,
    classDate: string,
    classTime: string,
    teacherName: string
  ) => {
    const activeTemplate = template && template.trim().length > 0 ? template : DEFAULT_REMINDER_TEMPLATE;
    return activeTemplate
      .replace(/{nome_aluno}/g, studentName)
      .replace(/{nome_aula}/g, classTitle)
      .replace(/{titulo_aula}/g, classTitle)
      .replace(/{data_aula}/g, classDate)
      .replace(/{hora_aula}/g, classTime)
      .replace(/{nome_professor}/g, teacherName)
      .replace(/{professor}/g, teacherName);
  }, [DEFAULT_REMINDER_TEMPLATE]);

  const runAutomaticRemindersCheck = React.useCallback((customSettings?: { enabled: boolean; advance_days: number; template: string }) => {
    const settings = customSettings || reminderSettings;
    if (!settings.enabled) return;

    const targetDateStr = getTargetDateStr(settings.advance_days ?? 1);
    const targetClasses = state.classes.filter(
      c => c.status === "scheduled" && c.date === targetDateStr
    );

    if (targetClasses.length === 0) return;

    const sentKeysSaved = localStorage.getItem("sent_automatic_reminder_keys");
    let sentKeys: string[] = [];
    if (sentKeysSaved) {
      try {
        sentKeys = JSON.parse(sentKeysSaved);
      } catch (e) {
        sentKeys = [];
      }
    }

    const newLogs: any[] = [];
    const newSentKeys: string[] = [];
    let sentCount = 0;

    for (const session of targetClasses) {
      const students = getSessionStudents(session, state);
      const teacher = state.teachers.find(t => t.id === session.teacher_id);
      const formattedDate = formatClassDate(session.date);

      for (const student of students) {
        const uniqueKey = `${session.id}-${student.id}-${session.date}`;
        if (sentKeys.includes(uniqueKey)) {
          continue;
        }

        const messageText = compileTemplate(
          settings.template,
          student.name,
          session.title,
          formattedDate,
          session.start_time,
          teacher?.name || "da escola"
        );

        const hasPhone = !!student.phone;
        const logEntry = {
          id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          class_id: session.id,
          class_title: session.title,
          student_id: student.id,
          student_name: student.name,
          student_phone: student.phone || "",
          date_sent: new Date().toISOString(),
          message_text: messageText,
          status: hasPhone ? "success" : "warning_no_phone",
        };

        newLogs.push(logEntry);
        newSentKeys.push(uniqueKey);
        if (hasPhone) {
          sentCount++;
        }
      }
    }

    if (newLogs.length > 0) {
      const updatedLogs = [...newLogs, ...reminderLogs];
      setReminderLogs(updatedLogs);
      localStorage.setItem("reminder_logs", JSON.stringify(updatedLogs));

      const updatedSentKeys = [...sentKeys, ...newSentKeys];
      localStorage.setItem("sent_automatic_reminder_keys", JSON.stringify(updatedSentKeys));

      if (sentCount > 0) {
        setShowReminderNotification(
          `Disparo automático: ${sentCount} lembrete(s) de aula enviado(s) via simulação com sucesso.`
        );
        setTimeout(() => setShowReminderNotification(null), 8000);
      }
    }
  }, [state.classes, state.students, state.teachers, reminderSettings, reminderLogs, getTargetDateStr, compileTemplate, formatClassDate]);

  React.useEffect(() => {
    if (state.classes.length > 0 && state.students.length > 0) {
      const timer = setTimeout(() => {
        runAutomaticRemindersCheck();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state.classes.length, state.students.length, runAutomaticRemindersCheck]);

  const isSuperAdmin = currentUserProfile?.role === "super_admin" || currentUserProfile?.role === "superadmin";

  const [formData, setFormData] = useState({
    title: "",
    teacher_id: "",
    group_id: undefined as string | undefined,
    student_ids: [] as string[],
    has_custom_students: false as boolean | undefined,
    date: new Date().toISOString().split("T")[0],
    start_time: "09:00",
    end_time: "10:00",
    status: "scheduled" as "scheduled" | "completed" | "cancelled",
    allow_makeup: false,
    cancelled_by_teacher: false,
    report: "",
    vocal_routine: "",
    attendance: {} as Record<string, "present" | "absent">,
  });

  const isRaphaelForFormData = React.useMemo(() => {
    const targetTeacherId = formData.teacher_id;
    if (targetTeacherId === "dada085e-c187-43d2-9ab0-a9e0539df450") return true;
    const teacher = state.teachers.find(t => t.id === targetTeacherId);
    if (teacher?.name && teacher.name.toLowerCase().includes("raphael")) return true;
    if (formData.group_id) {
      const grp = state.groups.find(g => g.id === formData.group_id);
      if (grp?.teacher_id === "dada085e-c187-43d2-9ab0-a9e0539df450") return true;
      const grpTeacher = state.teachers.find(t => t.id === grp?.teacher_id);
      if (grpTeacher?.name && grpTeacher.name.toLowerCase().includes("raphael")) return true;
    }
    return false;
  }, [formData.teacher_id, formData.group_id, state.teachers, state.groups]);

  const [showReport, setShowReport] = useState(false);
  const [isVocalModalOpen, setIsVocalModalOpen] = useState(false);
  const [vocalModalData, setVocalModalData] = useState<{
    studentName: string;
    studentPhone?: string;
    date: string;
    vocalRoutine: string;
    onSave?: (newRoutine: string) => void;
  } | null>(null);

  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);
  const [studentSearchTerm, setStudentSearchTerm] = useState("");

  const getConsecutiveAbsences = React.useCallback((studentId: string, currentGroupId?: string | null) => {
    // Filter completed classes that the student was scheduled to attend
    const studentClasses = state.classes
      .filter((c) => {
        if (c.status !== "completed") return false;
        const cGroupMatch = getGroupForSession(c, state);
        const cGroupId = c.group_id || cGroupMatch?.id || null;

        // Isolamento de origem entre individual e grupo:
        if (currentGroupId) {
          if (cGroupId !== currentGroupId) return false;
        } else if (currentGroupId === null) {
          if (cGroupId) return false;
        }

        return (c.student_ids || []).includes(studentId);
      })
      // Sort newest to oldest
      .sort((a, b) => {
        const dateCompare = (b.date || "").localeCompare(a.date || "");
        if (dateCompare !== 0) return dateCompare;
        return (b.start_time || "").localeCompare(a.start_time || "");
      });

    let consecutiveCount = 0;
    for (const c of studentClasses) {
      const att = c.attendance?.[studentId];
      if (att === "absent") {
        consecutiveCount++;
      } else if (att === "present") {
        break; // chain broken
      }
    }
    return consecutiveCount;
  }, [state.classes, state.groups]);

  const lastReportNote = React.useMemo(() => {
    if (!formData) return null;
    const currentStudentIds = formData.student_ids || [];
    const groupMatch = getGroupForSession(formData, state);
    const groupId = formData.group_id || groupMatch?.id || null;

    if (currentStudentIds.length === 0 && !groupId) return null;

    const matchingClasses = state.classes.filter((c) => {
      if (c.id === formData.id) return false;
      if (!c.report || c.report.trim() === "") return false;

      // Restringir à mesma modalidade/professor para evitar misturar relatórios de aulas distintas do mesmo aluno
      if (formData.teacher_id && c.teacher_id && c.teacher_id !== formData.teacher_id) {
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
      if (formData.date) {
        if (c.date > formData.date) return false;
        if (c.date === formData.date && formData.start_time && c.start_time) {
          if (c.start_time >= formData.start_time) return false;
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
  }, [formData, state.classes, state.groups, state.enrollments]);

  const lastVocalRoutineNote = React.useMemo(() => {
    if (!formData) return null;
    const currentStudentIds = formData.student_ids || [];
    const groupMatch = getGroupForSession(formData, state);
    const groupId = formData.group_id || groupMatch?.id || null;

    if (currentStudentIds.length === 0 && !groupId) return null;

    const matchingClasses = state.classes.filter((c) => {
      if (c.id === formData.id) return false;
      if (!c.vocal_routine || c.vocal_routine.trim() === "") return false;

      // Restringir à mesma modalidade/professor para evitar misturar relatórios de aulas distintas do mesmo aluno
      if (formData.teacher_id && c.teacher_id && c.teacher_id !== formData.teacher_id) {
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
      if (formData.date) {
        if (c.date > formData.date) return false;
        if (c.date === formData.date && formData.start_time && c.start_time) {
          if (c.start_time >= formData.start_time) return false;
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
  }, [formData, state.classes, state.groups]);

  const evasionAlertStudents = React.useMemo(() => {
    let eligibleStudents = state.students.filter((student) => student.status === "active");

    // Scope check: Teachers only see their linked students
    if (currentUserProfile?.role === "teacher" && currentUserProfile.teacher_id) {
      const teacherId = currentUserProfile.teacher_id;
      const enrolledStudentIds = state.enrollments
        .filter((e) => e.teacher_id === teacherId)
        .map((e) => e.student_id);

      const groupTeacherIds = state.groups
        .filter((g) => g.teacher_id === teacherId)
        .map((g) => g.id);
      const groupStudentIds = state.enrollments
        .filter((e) => e.group_id && groupTeacherIds.includes(e.group_id))
        .map((e) => e.student_id);

      const classStudentIds = state.classes
        .filter((c) => c.teacher_id === teacherId)
        .flatMap((c) => c.student_ids || []);

      const myStudentIds = new Set([
        ...enrolledStudentIds,
        ...groupStudentIds,
        ...classStudentIds,
      ]);

      eligibleStudents = eligibleStudents.filter((s) => myStudentIds.has(s.id));
    }

    return eligibleStudents
      .map((student) => {
        const consecAbsences = getConsecutiveAbsences(student.id);
        return { student, consecAbsences };
      })
      .filter((item) => item.consecAbsences >= 3);
  }, [state.students, state.enrollments, state.groups, state.classes, currentUserProfile, getConsecutiveAbsences]);

  const baseClasses = React.useMemo(() => {
    let classes = state.classes.filter((c) => c.status !== "cancelled");

    // Filter out classes where assigned direct students are all inactive or not eligible
    classes = classes.filter((c) => {
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

    if (currentUserProfile?.role === "teacher" && currentUserProfile.teacher_id) {
      classes = classes.filter((c) => {
        if (c.teacher_id === currentUserProfile.teacher_id) return true;
        const groupMatch = getGroupForSession(c, state);
        if (groupMatch && groupMatch.teacher_id === currentUserProfile.teacher_id) return true;
        return false;
      });
    } else if (filterTeacherId) {
      classes = classes.filter((c) => {
        if (c.teacher_id === filterTeacherId) return true;
        const groupMatch = getGroupForSession(c, state);
        if (groupMatch && groupMatch.teacher_id === filterTeacherId) return true;
        return false;
      });
    }
    if (filterDate) {
      classes = classes.filter((c) => c.date === filterDate);
    }
    return classes;
  }, [state.classes, state.groups, state.students, state.enrollments, currentUserProfile, filterTeacherId, filterDate]);

  const filteredClasses = baseClasses
    .filter((c) => {
      const term = searchTerm.toLowerCase().trim();
      if (!term) return true;

      const titleMatch = (c.title || "").toLowerCase().includes(term);
      const teacherMatch = (
        state.teachers.find((t) => t.id === c.teacher_id)?.name || ""
      )
        .toLowerCase()
        .includes(term);

      const directStudentMatch = (c.student_ids || []).some((sId) => {
        const s = state.students.find((st) => st.id === sId && st.status === "active" && !st.not_eligible);
        return s ? s.name.toLowerCase().includes(term) : false;
      });

      let groupStudentMatch = false;
      const groupMatch = getGroupForSession(c, state);
      if (groupMatch) {
        groupStudentMatch = state.enrollments.some((en) => {
          if (en.group_id !== groupMatch.id || en.status !== "active") return false;
          if (!isEnrollmentActiveOnDate(en, c.date)) return false;
          const s = state.students.find((st) => st.id === en.student_id && st.status === "active" && !st.not_eligible);
          return s ? s.name.toLowerCase().includes(term) : false;
        });
      }

      return titleMatch || teacherMatch || directStudentMatch || groupStudentMatch;
    })
    .sort((a, b) => {
      const dateCompare = (a.date || "").localeCompare(b.date || "");
      if (dateCompare !== 0) return dateCompare;
      return (a.start_time || "").localeCompare(b.start_time || "");
    });

  const groupedClasses = filteredClasses.reduce((acc, session) => {
    const date = session.date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(session);
    return acc;
  }, {} as Record<string, ClassSession[]>);

  const sortedDates = Object.keys(groupedClasses).sort();

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    
    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  const sendWhatsAppReminder = (session: ClassSession, studentId?: string) => {
    setError(null);
    const students = getSessionStudents(session, state);
    const targetStudent = studentId ? students.find(s => s.id === studentId) : students[0];

    if (!targetStudent) {
      setError("Aluno não encontrado.");
      setTimeout(() => setError(null), 3000);
      return;
    }

    if (!targetStudent.phone) {
      setError(`O aluno ${targetStudent.name} não possui telefone cadastrado.`);
      setTimeout(() => setError(null), 3000);
      return;
    }

    const teacher = state.teachers.find(t => t.id === session.teacher_id);
    const formattedDate = formatClassDate(session.date);
    
    const message = compileTemplate(
      reminderSettings.template,
      targetStudent.name,
      session.title,
      formattedDate,
      session.start_time,
      teacher?.name || 'da escola'
    );
    
    const details = getWhatsAppPhoneDetails(targetStudent.phone, message);
    if (!details) {
      setError(`O número de telefone de ${targetStudent.name} é inválido.`);
      setTimeout(() => setError(null), 3000);
      return;
    }

    window.open(details.primaryUrl, '_blank');

    setWhatsAppModalData({
      studentName: targetStudent.name,
      originalPhone: targetStudent.phone,
      primaryFormatted: details.primaryFormatted,
      primaryUrl: details.primaryUrl,
      alternateFormatted: details.alternateFormatted,
      alternateUrl: details.alternateUrl,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const activeTeacher = state.teachers.find(t => isTeacherActive(t));
      const fallbackTeacher = (currentUserProfile?.role === "teacher" && currentUserProfile.teacher_id)
        ? currentUserProfile.teacher_id
        : (activeTeacher?.id || "");
      const finalTeacherId = formData.teacher_id || fallbackTeacher;

      if (!finalTeacherId) {
        setError("Por favor, selecione um professor para a aula.");
        setIsSubmitting(false);
        return;
      }

      const hasAttendance = Object.keys(formData.attendance || {}).length > 0;
      const isMakeupNoteOnly = (formData.report || "").trim().startsWith("Aula de reposição") || (formData.title || "").toLowerCase().includes("reposição") || (formData.title || "").toLowerCase().includes("reposicao");
      const hasReport = (formData.report || "").trim().length > 0 && !(formData.report || "").trim().startsWith("Aula de reposição");
      let payload = { ...formData, teacher_id: finalTeacherId };
      if ((hasAttendance || hasReport) && payload.status === "scheduled") {
        payload.status = "completed";
      } else if (isMakeupNoteOnly && !hasAttendance && !hasReport && payload.status !== "cancelled") {
        payload.status = "scheduled";
      }

      const finalCancelledByTeacher = isRaphaelForFormData && payload.status === "cancelled" ? Boolean(formData.cancelled_by_teacher) : false;
      payload = {
        ...payload,
        cancelled_by_teacher: finalCancelledByTeacher
      };

      const googleSyncPromises: Promise<{ synced: boolean; actionTaken: string; eventId?: string | null; error?: string }>[] = [];
      let hadOfflinePending = false;

      if (editingClass) {
        const res = await updateClass(editingClass.id, payload);
        if (res && res.pending) {
          hadOfflinePending = true;
        } else if (res?.googleSyncPromise) {
          googleSyncPromises.push(res.googleSyncPromise);
        }
      } else {
        if (recurrence === 'none') {
          const res = await addClass(payload);
          if (res && res.pending) {
            hadOfflinePending = true;
          } else if (res?.googleSyncPromise) {
            googleSyncPromises.push(res.googleSyncPromise);
          }
        } else {
          let currentDate = new Date(payload.date + 'T12:00:00');
          const end = new Date(recurrenceEndDate + 'T12:00:00');
          
          while (currentDate <= end) {
            const currentDateStr = currentDate.toISOString().split("T")[0];
            const validStudentIdsForDate = payload.student_ids.filter(studentId =>
              state.enrollments.some(e =>
                e.student_id === studentId &&
                e.status === 'active' &&
                isEnrollmentActiveOnDate(e, currentDateStr)
              )
            );

            const res = await addClass({
              ...payload,
              student_ids: validStudentIdsForDate,
              date: currentDateStr
            });
            if (res && res.pending) {
              hadOfflinePending = true;
            } else if (res?.googleSyncPromise) {
              googleSyncPromises.push(res.googleSyncPromise);
            }
            
            if (recurrence === 'semanal') {
              currentDate.setDate(currentDate.getDate() + 7);
            } else if (recurrence === 'quinzenal') {
              currentDate.setDate(currentDate.getDate() + 14);
            } else if (recurrence === 'mensal') {
              currentDate.setMonth(currentDate.getMonth() + 1);
            } else {
              break;
            }
          }
        }
      }

      if (editingClass) {
        clearReportDraft(editingClass.id);
        clearActiveDraftClassId();
        setIsDraftRestored(false);
        setLastDraftSavedAt(null);
      }

      setIsModalOpen(false);
      setEditingClass(null);

      if (hadOfflinePending) {
        setSyncFeedback("Não foi possível confirmar o salvamento no servidor. Seus dados foram preservados neste computador. Tente novamente quando a conexão estiver disponível.");
        setTimeout(() => setSyncFeedback(null), 8000);
      } else {
        setSyncFeedback("Aula salva na plataforma. Sincronização com Google pendente.");
        if (googleSyncPromises.length > 0) {
          void Promise.all(googleSyncPromises)
            .then((results) => {
              const hasFailure = results.some((r) => !r.synced);
              const allConfirmedWithEventId = results.length > 0 && results.every((r) => r.synced && Boolean(r.eventId));
              if (hasFailure) {
                setSyncFeedback("Aula salva na plataforma. Falha na sincronização com Google.");
              } else if (allConfirmedWithEventId) {
                setSyncFeedback("Aula salva na plataforma. Google Calendar sincronizado.");
              } else {
                setSyncFeedback("Aula salva na plataforma. Sincronização com Google pendente.");
              }
              setTimeout(() => setSyncFeedback(null), 6000);
            })
            .catch(() => {
              setSyncFeedback("Aula salva na plataforma. Falha na sincronização com Google.");
              setTimeout(() => setSyncFeedback(null), 6000);
            });
        } else {
          setTimeout(() => setSyncFeedback(null), 4000);
        }
      }
    } catch (err: any) {
      console.error("Error saving class:", err);
      setError(err?.message || "Erro ao salvar a aula. Tente novamente.");
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
        setSyncFeedback(`${result.syncedCount} aula(s) sincronizada(s) com sucesso com o servidor!`);
      } else if (result.pendingCount === 0) {
        setSyncFeedback("Todas as aulas e diários já estão 100% sincronizados com a nuvem.");
      } else {
        setSyncFeedback(`${result.pendingCount} aula(s) aguardando conexão com a nuvem.`);
      }
    } catch (e: any) {
      setSyncFeedback("Erro na sincronização: " + (e?.message || "Falha"));
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncFeedback(null), 6000);
    }
  };

  const openModal = (session?: ClassSession, restoredDraft?: any) => {
    setIsSubmitting(false);
    setError(null);
    const activeTeacher = state.teachers.find(t => isTeacherActive(t));
    const defaultTeacherId = (currentUserProfile?.role === "teacher" && currentUserProfile.teacher_id)
      ? currentUserProfile.teacher_id
      : (activeTeacher?.id || "");

    if (session) {
      setEditingClass(session);
      let initialStudentIds = getSessionStudentIds(session, state);
      if (initialStudentIds.length === 0) {
        const cleanTitle = session.title.replace(/\s*\(Repos.*?\)/i, "").trim().toLowerCase();
        const matchedStudent = state.students.find(s => 
          s.name && (
            s.name.toLowerCase().trim() === cleanTitle ||
            cleanTitle.includes(s.name.toLowerCase().trim()) ||
            s.name.toLowerCase().trim().includes(cleanTitle)
          )
        );
        if (matchedStudent) {
          initialStudentIds = [matchedStudent.id];
        }
      }
      const parsed = parsePackedReport(session.report);
      const initialReport = (session.report && !session.report.includes("//")) ? session.report : (parsed.report || "");
      const initialVocalRoutine = session.vocal_routine || parsed.vocal_routine || "";
      const initialAttendance = (session.attendance && Object.keys(session.attendance).length > 0)
        ? session.attendance
        : parsed.attendance;

      const initialCancelledByTeacher = session.cancelled_by_teacher !== undefined
        ? session.cancelled_by_teacher
        : (parsed.cancelled_by_teacher !== undefined ? parsed.cancelled_by_teacher : false);

      const initialHasCustomStudents = session.has_custom_students !== undefined
        ? !!session.has_custom_students
        : (parsed.has_custom_students !== undefined ? !!parsed.has_custom_students : false);

      // Check for saved draft
      const draft = restoredDraft || getReportDraft(session.id);
      const hasDraftContent = draft && (draft.report !== undefined || draft.vocal_routine !== undefined);

      setFormData({
        ...session,
        teacher_id: session.teacher_id || defaultTeacherId,
        student_ids: initialStudentIds,
        has_custom_students: initialHasCustomStudents,
        allow_makeup: session.allow_makeup !== undefined ? session.allow_makeup : (parsed.allow_makeup !== undefined ? parsed.allow_makeup : false),
        cancelled_by_teacher: initialCancelledByTeacher,
        report: hasDraftContent && draft.report !== undefined ? draft.report : initialReport,
        vocal_routine: hasDraftContent && draft.vocal_routine !== undefined ? draft.vocal_routine : initialVocalRoutine,
        attendance: hasDraftContent && draft.attendance && Object.keys(draft.attendance).length > 0 ? draft.attendance : (initialAttendance || {}),
      });

      if (hasDraftContent) {
        setIsDraftRestored(true);
        setLastDraftSavedAt(draft.updatedAt || Date.now());
      } else {
        setIsDraftRestored(false);
        setLastDraftSavedAt(null);
      }

      setActiveDraftClassId(session.id, 'classes');
      setShowReport(true);
      setStudentSearchTerm("");
      setIsStudentDropdownOpen(false);
    } else {
      setEditingClass(null);
      setIsDraftRestored(false);
      setLastDraftSavedAt(null);
      setRecurrence('none');
      setShowReport(true);
      setStudentSearchTerm("");
      setIsStudentDropdownOpen(false);
      const d = new Date();
      d.setMonth(d.getMonth() + 6);
      setRecurrenceEndDate(d.toISOString().split("T")[0]);
      setFormData({
        title: "",
        teacher_id: defaultTeacherId,
        student_ids: [],
        has_custom_students: false,
        date: new Date().toISOString().split("T")[0],
        start_time: "09:00",
        end_time: "10:00",
        status: "scheduled",
        allow_makeup: false,
        cancelled_by_teacher: false,
        report: "",
        vocal_routine: "",
        attendance: {},
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    clearActiveDraftClassId();
    setIsModalOpen(false);
    setEditingClass(null);
    setIsDraftRestored(false);
    setLastDraftSavedAt(null);
  };

  const handleDiscardDraft = () => {
    if (!editingClass) return;
    clearReportDraft(editingClass.id);
    clearActiveDraftClassId();
    const parsed = parsePackedReport(editingClass.report);
    const initialReport = (editingClass.report && !editingClass.report.includes("//")) ? editingClass.report : (parsed.report || "");
    const initialVocalRoutine = editingClass.vocal_routine || parsed.vocal_routine || "";
    const initialAttendance = (editingClass.attendance && Object.keys(editingClass.attendance).length > 0)
      ? editingClass.attendance
      : (parsed.attendance || {});

    setFormData(prev => ({
      ...prev,
      report: initialReport,
      vocal_routine: initialVocalRoutine,
      attendance: initialAttendance,
    }));
    setIsDraftRestored(false);
    setLastDraftSavedAt(null);
  };

  // 1. Restaurar rascunho ativo ao carregar ou voltar para a tela de Aulas
  React.useEffect(() => {
    const activeId = getActiveDraftClassId();
    const activeView = getActiveDraftView();
    if (!activeId || isModalOpen) return;
    if (activeView && activeView !== 'classes') return;

    const targetSession = state.classes.find((c) => c.id === activeId);
    if (targetSession) {
      const draft = getReportDraft(activeId);
      if (draft) {
        openModal(targetSession, draft);
      }
    }
  }, [state.classes]);

  // 2. Autosave em tempo real enquanto o professor digita
  React.useEffect(() => {
    if (!isModalOpen || !editingClass) return;
    const parsed = parsePackedReport(editingClass.report);
    const cleanSessionReport = (editingClass.report && !editingClass.report.includes("//")) ? editingClass.report : (parsed.report || "");
    const cleanSessionVocal = editingClass.vocal_routine || parsed.vocal_routine || "";
    const cleanSessionAtt = (editingClass.attendance && Object.keys(editingClass.attendance).length > 0)
      ? editingClass.attendance
      : (parsed.attendance || {});

    const isDifferent =
      formData.report !== cleanSessionReport ||
      formData.vocal_routine !== cleanSessionVocal ||
      JSON.stringify(formData.attendance || {}) !== JSON.stringify(cleanSessionAtt);

    if (isDifferent) {
      saveReportDraft(editingClass.id, {
        report: formData.report,
        vocal_routine: formData.vocal_routine,
        attendance: formData.attendance,
      });
      setActiveDraftClassId(editingClass.id, 'classes');
      setLastDraftSavedAt(Date.now());
    }
  }, [formData.report, formData.vocal_routine, formData.attendance, isModalOpen, editingClass]);

  const handleStudentToggle = (studentId: string) => {
    if (isSubmitting) return;
    const isAdding = !formData.student_ids.includes(studentId);
    
    if (isAdding) {
      const activeEnrollment = state.enrollments.find(e => e.student_id === studentId && e.status === 'active');
      if (activeEnrollment && !isEnrollmentActiveOnDate(activeEnrollment, formData.date)) {
        const student = state.students.find(s => s.id === studentId);
        const startDate = activeEnrollment.start_date || activeEnrollment.enrollment_date;
        const formattedStartDate = startDate ? startDate.split('-').reverse().join('/') : '';
        const monthYearStr = new Date(formData.date + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
        setError(`Atenção: O aluno(a) ${student?.name || ''} possui início de matrícula em ${formattedStartDate}, portanto não pode ser incluído na agenda no mês de ${monthYearStr}.`);
        return;
      }

      if (!editingClass && recurrence === 'none' && activeEnrollment) {
        const plan = state.financialPlans.find(p => p.id === activeEnrollment.plan_id);
        if (plan && ['semanal', 'quinzenal', 'mensal'].includes(plan.modality)) {
          setRecurrence(plan.modality as any);
        }
      }
    }

    setFormData((prev) => {
      const updatedStudentIds = isAdding
        ? [...prev.student_ids, studentId]
        : prev.student_ids.filter((id) => id !== studentId);

      const formGroupMatch = getGroupForSession(prev as any, state);
      const isGroup = Boolean(prev.group_id || formGroupMatch);

      return {
        ...prev,
        student_ids: updatedStudentIds,
        has_custom_students: isGroup ? true : prev.has_custom_students,
      };
    });
  };

  const handleRestoreGroupStudents = () => {
    if (isSubmitting) return;
    const groupMatch = getGroupForSession(formData as any, state);
    if (groupMatch) {
      const groupStudentIds = state.enrollments
        .filter((en: any) => en.group_id === groupMatch.id && en.status === 'active' && isEnrollmentActiveOnDate(en, formData.date))
        .map((en: any) => en.student_id);
      setFormData((prev) => ({
        ...prev,
        student_ids: Array.from(new Set(groupStudentIds)),
        has_custom_students: false,
      }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl flex items-center justify-between"
          >
            <span>{error}</span>
            <button onClick={() => setError(null)} className="p-1 hover:bg-rose-100 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
        {showReminderNotification && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-center justify-between shadow-sm"
          >
            <div className="flex items-center space-x-2">
              <div className="p-1 bg-emerald-500 rounded-lg text-white">
                <Bell className="w-4 h-4 animate-bounce" />
              </div>
              <span className="text-sm font-semibold">{showReminderNotification}</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  setReminderActiveTab('logs');
                  setIsReminderModalOpen(true);
                }}
                className="text-xs text-emerald-700 hover:text-emerald-900 underline font-semibold mr-2"
              >
                Ver Logs
              </button>
              <button onClick={() => setShowReminderNotification(null)} className="p-1 hover:bg-emerald-100 rounded-lg transition-colors text-emerald-600 hover:text-emerald-800">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alunos em Alerta de Evasão (3+ Faltas Consecutivas) */}
      {evasionAlertStudents.length > 0 && (
        <div className="bg-rose-50 border border-rose-200/80 rounded-2xl p-5 space-y-3 shadow-sm shadow-rose-100/50">
          <div className="flex items-center space-x-2 text-rose-800">
            <AlertCircle className="w-5 h-5" />
            <h2 className="text-sm font-bold uppercase tracking-wider">
              Alunos em Alerta de Evasão ({evasionAlertStudents.length})
            </h2>
          </div>
          <p className="text-xs text-rose-700 font-medium">
            Os alunos abaixo possuem 3 ou mais faltas consecutivas em aulas concluídas. Favor entrar em contato para saber o porquê não estão comparecendo.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {evasionAlertStudents.map(({ student, consecAbsences }) => {
              const message = `Olá, ${student.name.split(" ")[0]}! Sentimos sua falta nas últimas aulas de música. Está tudo bem por aí? Queremos muito te ver de volta! Me avisa se precisar reagendar ou se pudermos ajudar em algo.`;
              const details = getWhatsAppPhoneDetails(student.phone, message);

              return (
                <div key={student.id} className="bg-white border border-rose-100 p-3.5 rounded-xl flex flex-col justify-between space-y-3 shadow-sm">
                  <div>
                    <span className="text-xs font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full inline-block mb-1.5">
                      {consecAbsences} Faltas Consecutivas
                    </span>
                    <h3 className="font-semibold text-zinc-900 text-sm">{student.name}</h3>
                    <p className="text-xs text-zinc-500 font-mono mt-0.5">{details?.primaryFormatted || student.phone || "Sem telefone"}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Instrumento: {student.instrument || "-"}</p>
                  </div>
                  {details ? (
                    <div className="flex flex-col space-y-1.5">
                      <a
                        href={details.primaryUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-xl transition-colors shadow-sm text-center"
                      >
                        <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                        Contato ({details.primaryFormatted})
                      </a>
                      {details.alternateUrl && (
                        <a
                          href={details.alternateUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center justify-center text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 px-2.5 py-1 rounded-lg transition-colors text-center"
                          title="Tentar sem/com o 9º dígito caso receba erro no WhatsApp"
                        >
                          Tentar sem 9º dígito ({details.alternateFormatted})
                        </a>
                      )}
                    </div>
                  ) : (
                    <button
                      disabled
                      className="inline-flex items-center justify-center text-xs font-semibold text-zinc-400 bg-zinc-150 px-3 py-2 rounded-xl"
                    >
                      Sem telefone
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Aulas
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Agende e gerencie as aulas da escola.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {currentUserProfile?.role === "teacher" && currentUserProfile.teacher_id && (
            <TeacherGoogleCalendarCard
              teacherId={currentUserProfile.teacher_id}
              compact={true}
            />
          )}

          {["super_admin", "admin"].includes(currentUserProfile?.role || "") && (
            <>
              {pendingSyncCount > 0 && (
                <button
                  id="classes-pending-sync-indicator-btn"
                  onClick={() => setIsAuditModalOpen(true)}
                  className="inline-flex items-center justify-center px-3.5 py-2 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-300 rounded-xl hover:bg-amber-100 transition-colors shadow-xs"
                  title="Abrir auditoria e diagnóstico para conferir e recuperar pendências de forma segura"
                >
                  <Clock className="w-3.5 h-3.5 mr-1.5 text-amber-600" />
                  <span>Conferir {pendingSyncCount} pendência(s)</span>
                </button>
              )}

              <button
                id="classes-cloud-sync-audit-btn"
                onClick={() => setIsAuditModalOpen(true)}
                className="inline-flex items-center justify-center px-3.5 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors shadow-xs"
                title="Diagnóstico e sincronização segura com o Supabase"
              >
                <RefreshCcw className="w-3.5 h-3.5 mr-1.5 text-zinc-500" />
                Sincronizar Nuvem
              </button>

              <button
                id="open-class-audit-modal-btn"
                onClick={() => setIsAuditModalOpen(true)}
                className="inline-flex items-center justify-center px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors shadow-xs"
                title="Diagnóstico de consistência de dados local vs Supabase"
              >
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                Auditoria de Dados
              </button>

              <button
                id="classes-reconcile-google-btn"
                onClick={handleReconcileGoogle}
                disabled={isReconcilingGoogle}
                className="inline-flex items-center justify-center px-3.5 py-2 text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 rounded-xl hover:bg-teal-100 transition-colors shadow-xs disabled:opacity-50"
                title="Reconciliação segura e idempotente com o Google Calendar para aulas pendentes"
              >
                <CalendarIcon className={`w-3.5 h-3.5 mr-1.5 text-teal-600 ${isReconcilingGoogle ? 'animate-spin' : ''}`} />
                {isReconcilingGoogle ? 'Reconciliando...' : 'Reconciliar Google'}
              </button>
            </>
          )}

          {["super_admin", "admin"].includes(currentUserProfile?.role || "") && (
            <button
              onClick={() => {
                setReminderSettings(loadReminderSettingsFromStorage());
                setReminderActiveTab('settings');
                setIsReminderModalOpen(true);
              }}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-500 transition-colors shadow-sm"
            >
              <Bell className="w-4 h-4 mr-2 text-zinc-500" />
              Lembretes Automáticos
            </button>
          )}
          {currentUserProfile?.role === "super_admin" && (
            <button
              onClick={() => openModal()}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Aula
            </button>
          )}
        </div>
      </div>

      {syncFeedback && (
        <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-medium flex items-center justify-between shadow-xs">
          <span>{syncFeedback}</span>
          <button onClick={() => setSyncFeedback(null)} className="text-indigo-500 hover:text-indigo-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-3xl flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-zinc-400" />
              </div>
              <input
                type="text"
                placeholder="Buscar por título, professor ou aluno..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl leading-5 bg-zinc-50 placeholder-zinc-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
              />
            </div>
            {currentUserProfile?.role !== "teacher" && (
              <div className="relative w-full sm:w-56">
                <select
                  value={filterTeacherId}
                  onChange={(e) => setFilterTeacherId(e.target.value)}
                  className="block w-full px-3 py-2 border border-zinc-200 bg-zinc-50 rounded-xl leading-5 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors text-zinc-700 font-medium"
                >
                  <option value="">Professor (Todos)</option>
                  {state.teachers
                    .filter(isTeacherActive)
                    .map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name}
                      </option>
                    ))}
                </select>
              </div>
            )}
            <div className="relative w-full sm:w-48 flex items-center">
              <input
                type="date"
                value={filterDate}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterDate(val);
                  if (val) {
                    const parts = val.split('-');
                    if (parts.length === 3) {
                      setCurrentMonth(new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1));
                    }
                  }
                }}
                className="block w-full px-3 py-2 border border-zinc-200 bg-zinc-50 rounded-xl leading-5 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors text-zinc-700 font-medium"
                title="Filtrar por Data"
              />
              {filterDate && (
                <button
                  type="button"
                  onClick={() => setFilterDate('')}
                  className="absolute right-2 p-1 text-zinc-400 hover:text-zinc-600 rounded-md hover:bg-zinc-200/50"
                  title="Limpar filtro de data"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          
          <div className="flex bg-zinc-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('calendar')}
              className={`p-2 rounded-md flex items-center transition-colors ${
                viewMode === 'calendar' 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
              title="Visualização em Calendário"
            >
              <CalendarIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md flex items-center transition-colors ${
                viewMode === 'grid' 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
              title="Visualização em Grade"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md flex items-center transition-colors ${
                viewMode === 'list' 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
              title="Visualização em Lista"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Legenda de Cores dos Cards da Grade */}
        <div className="px-6 py-2.5 bg-zinc-50 border-b border-zinc-200/80 flex flex-wrap items-center gap-4 text-xs text-zinc-600">
          <span className="font-semibold text-zinc-700">Legenda da Grade:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-purple-200 border border-purple-400 inline-block shadow-2xs"></span>
            <span className="font-medium text-zinc-700">Roxo: Futura / Agendada</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-emerald-200 border border-emerald-400 inline-block shadow-2xs"></span>
            <span className="font-medium text-zinc-700">Verde: Presente</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-amber-200 border border-amber-400 inline-block shadow-2xs"></span>
            <span className="font-medium text-zinc-700">Amarelo: Falta (c/ Reposição)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-rose-200 border border-rose-400 inline-block shadow-2xs"></span>
            <span className="font-medium text-zinc-700">Vermelho: Falta (s/ Reposição)</span>
          </div>
        </div>

        {viewMode === 'calendar' ? (
          <div className="p-6 bg-zinc-50/50">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-zinc-900">
                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </h2>
              <div className="flex space-x-2">
                <button
                  onClick={prevMonth}
                  className="p-2 rounded-lg border border-zinc-200 hover:bg-zinc-100 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-zinc-600" />
                </button>
                <button
                  onClick={nextMonth}
                  className="p-2 rounded-lg border border-zinc-200 hover:bg-zinc-100 transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-zinc-600" />
                </button>
              </div>
            </div>
            
            <div className="block md:hidden text-center text-[11px] text-zinc-500 mb-3 bg-zinc-100/60 py-1.5 rounded-lg border border-zinc-200/40 font-medium">
              <span>Arraste para o lado para ver o calendário completo ↔</span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-zinc-200/80 shadow-sm">
              <div className="min-w-[850px] grid grid-cols-7 gap-px bg-zinc-200">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                  <div key={day} className="bg-zinc-50 py-2 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    {day}
                  </div>
                ))}
                
                {getDaysInMonth(currentMonth).map((date, index) => {
                  if (!date) {
                    return <div key={`empty-${index}`} className="bg-zinc-50/50 min-h-[120px]" />;
                  }
                  
                  const dateStr = date.toISOString().split('T')[0];
                  const dayClasses = groupedClasses[dateStr] || [];
                  const isToday = new Date().toISOString().split('T')[0] === dateStr;
                  
                  return (
                    <div key={dateStr} className={`bg-white min-h-[120px] p-2 ${isToday ? 'ring-2 ring-indigo-500 ring-inset' : ''}`}>
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white' : 'text-zinc-700'}`}>
                          {date.getDate()}
                        </span>
                        {dayClasses.length > 0 && (
                          <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-md">
                            {dayClasses.length}
                          </span>
                        )}
                      </div>
                      
                      <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1 custom-scrollbar">
                        {dayClasses.map(session => {
                          const students = getSessionStudents(session, state);
                          const studentNames = students.map(s => s.name.split(' ')[0]).join(', ') || 'Sem alunos';
                          const groupMatch = getGroupForSession(session, state);
                          const displayNames = groupMatch ? `Grupo: ${groupMatch.name}` : studentNames;
                          const isMakeup = (session.title || "").toLowerCase().includes("reposição") || 
                                           (session.title || "").toLowerCase().includes("reposicao") || 
                                           (session.title || "").toLowerCase().includes("reagendad") || 
                                           (session.report || "").toLowerCase().includes("aula de reposição") || 
                                           (session.report || "").toLowerCase().includes("aula de reposicao");
                          const hasReport = session.report && session.report.trim().length > 0 && !session.report.trim().startsWith("Aula de reposição");
                          const visualTheme = getClassCardVisualTheme(session, state);
                          
                          return (
                          <div 
                            key={session.id} 
                            onClick={() => openModal(session)}
                            className={`text-xs p-1.5 rounded border cursor-pointer hover:shadow-sm transition-shadow group/session ${
                              visualTheme.calendarCardClass
                            }`}
                          >
                            <div className="font-semibold truncate flex items-center justify-between">
                              <span className="truncate flex items-center gap-1">
                                {session.start_time}
                                {groupMatch && <Users className="w-3 h-3 text-indigo-600 shrink-0 inline" title={`Grupo: ${groupMatch.name}`} />}
                              </span>
                              <div className="flex items-center">
                                {hasReport && <FileText className="w-3 h-3 ml-1 shrink-0 opacity-70 text-emerald-700" title="Possui relatório" />}
                                {session.allow_makeup && <RefreshCcw className="w-3 h-3 ml-1 shrink-0 text-indigo-600" title="Permite reposição" />}
                                {students.length > 0 && (
                                  <button 
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); sendWhatsAppReminder(session); }}
                                    className="ml-1 text-emerald-700 bg-emerald-100 hover:bg-emerald-200 p-1 rounded-full transition-colors shrink-0 flex items-center justify-center shadow-xs"
                                    title="Enviar confirmação / lembrete pelo WhatsApp"
                                  >
                                    <MessageCircle className="w-3 h-3 text-emerald-700" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="truncate opacity-90 font-medium" title={groupMatch ? `Grupo: ${groupMatch.name} (${studentNames})` : studentNames}>{displayNames}</div>
                            {session.status === 'cancelled' && session.cancelled_by_teacher && (
                              <div className="mt-1 flex items-center gap-0.5 text-[9px] font-bold text-rose-800 bg-rose-100/90 px-1 py-0.5 rounded border border-rose-200 truncate" title="Cancelada pelo Professor">
                                <span className="truncate">Cancelada p/ Prof</span>
                              </div>
                            )}
                            {isMakeup && (
                              <div className="mt-1 flex items-center gap-0.5 text-[9px] font-bold text-amber-900 bg-amber-200/90 px-1 py-0.5 rounded border border-amber-300/60 truncate" title="Aula de Reposição / Reagendada">
                                <RefreshCcw className="w-2.5 h-2.5 shrink-0 text-amber-800" />
                                <span className="truncate">Reposição</span>
                              </div>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : viewMode === 'list' ? (
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
                  const students = getSessionStudents(session, state);

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
                          {new Date(session.date + "T12:00:00").toLocaleDateString("pt-BR")}
                        </div>
                        <div className="flex items-center text-sm text-zinc-500 mt-1">
                          <Clock className="w-4 h-4 mr-2 text-zinc-400" />
                          {session.start_time} - {session.end_time}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900">
                          {teacher?.name || "Não atribuído"}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {(() => {
                            const groupMatch = getGroupForSession(session, state);
                            if (groupMatch) {
                              return (
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center text-sm font-semibold text-indigo-900">
                                    <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs mr-2">
                                      {groupMatch.name.charAt(0).toUpperCase()}
                                    </div>
                                    Grupo: {groupMatch.name}
                                  </div>
                                  {students.length > 0 && (
                                    <div className="text-xs text-zinc-500 pl-8">
                                      {students.map(s => s.name).join(', ')}
                                    </div>
                                  )}
                                </div>
                              );
                            }
                            
                            if (students.length === 0) {
                              return (
                                <span className="text-sm text-zinc-500">
                                  Nenhum
                                </span>
                              );
                            }

                            return students.map((student) => (
                              <div
                                key={student.id}
                                className="flex items-center justify-between text-sm text-zinc-900 group/student"
                              >
                                <div className="flex items-center">
                                  <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs mr-2">
                                    {student.name.charAt(0).toUpperCase()}
                                  </div>
                                  {student.name}
                                </div>
                                <button 
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); sendWhatsAppReminder(session, student.id); }}
                                  className="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors flex items-center justify-center shrink-0 ml-2"
                                  title="Enviar confirmação / lembrete pelo WhatsApp"
                                >
                                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                                </button>
                              </div>
                            ));
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-2">
                          {(() => {
                            const isMakeup = (session.title || "").toLowerCase().includes("reposição") || 
                                             (session.title || "").toLowerCase().includes("reposicao") || 
                                             (session.title || "").toLowerCase().includes("reagendad") || 
                                             (session.report || "").toLowerCase().includes("aula de reposição") || 
                                             (session.report || "").toLowerCase().includes("aula de reposicao");
                            const hasReport = session.report && session.report.trim().length > 0 && !session.report.trim().startsWith("Aula de reposição");
                            const visualTheme = getClassCardVisualTheme(session, state);
                            return (
                              <>
                                <span
                                  className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full w-fit ${
                                    visualTheme.badgeClass
                                  }`}
                                >
                                  {visualTheme.label}
                                </span>
                                {session.status === "cancelled" && session.cancelled_by_teacher && (
                                  <span className="inline-flex items-center text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md w-fit">
                                    Cancelada pelo Professor
                                  </span>
                                )}
                                {isMakeup && (
                                  <span className="inline-flex items-center text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-300/80 px-2 py-0.5 rounded-md w-fit">
                                    <RefreshCcw className="w-3 h-3 mr-1 text-amber-700" />
                                    Aula de Reposição
                                  </span>
                                )}
                                {session.allow_makeup && !isMakeup && (
                                  <span className="inline-flex items-center text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md w-fit">
                                    <RefreshCcw className="w-3 h-3 mr-1" />
                                    Permite Reposição
                                  </span>
                                )}
                                {hasReport && (
                                  <span className="inline-flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md w-fit">
                                    <FileText className="w-3 h-3 mr-1" />
                                    Relatório
                                  </span>
                                )}
                                {pendingClassSyncs && pendingClassSyncs[session.id] && (
                                  <span className="inline-flex items-center text-xs font-bold text-amber-800 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-md w-fit animate-pulse" title="Salvo no navegador, sincronizando...">
                                    <RefreshCcw className="w-3 h-3 mr-1 text-amber-700" />
                                    Pendente Nuvem
                                  </span>
                                )}
                                {["super_admin", "admin"].includes(currentUserProfile?.role || "") && session.status !== "cancelled" && googleSyncMap[session.id] && (
                                  <span
                                    className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md w-fit ${
                                      googleSyncMap[session.id].status === 'synced'
                                        ? 'text-teal-800 bg-teal-50 border border-teal-200'
                                        : googleSyncMap[session.id].status === 'pending'
                                        ? 'text-amber-800 bg-amber-50 border border-amber-300 animate-pulse'
                                        : 'text-rose-800 bg-rose-50 border border-rose-300'
                                    }`}
                                    title={googleSyncMap[session.id].error || (googleSyncMap[session.id].status === 'synced' ? 'Sincronizada no Google Calendar' : 'Pendente de sincronização')}
                                  >
                                    <CalendarIcon className="w-3 h-3 mr-1" />
                                    {googleSyncMap[session.id].status === 'synced'
                                      ? 'Google OK'
                                      : googleSyncMap[session.id].status === 'pending'
                                      ? 'Sincronizando Google...'
                                      : 'Google Falhou'}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {["super_admin", "admin"].includes(currentUserProfile?.role || "") && session.status !== "cancelled" && (
                          <button
                            onClick={async () => {
                              setResyncingClassId(session.id);
                              try {
                                const res = await resyncClassGoogle(session.id);
                                if (res.synced) {
                                  setSyncFeedback(`Aula "${session.title}" sincronizada com o Google Calendar!`);
                                } else {
                                  setSyncFeedback(`Aviso na sincronização: ${res.error || res.actionTaken}`);
                                }
                              } catch (e: any) {
                                setSyncFeedback(`Erro ao ressincronizar: ${e?.message}`);
                              } finally {
                                setResyncingClassId(null);
                                setTimeout(() => setSyncFeedback(null), 5000);
                              }
                            }}
                            disabled={resyncingClassId === session.id}
                            className="text-teal-600 hover:text-teal-900 mr-4 inline-flex items-center disabled:opacity-50"
                            title="Ressincronizar esta aula no Google Calendar (Idempotente)"
                          >
                            <RefreshCw className={`w-4 h-4 ${resyncingClassId === session.id ? 'animate-spin' : ''}`} />
                          </button>
                        )}
                        <button
                          onClick={() => openModal(session)}
                          className={`${currentUserProfile?.role === "teacher" ? "text-emerald-600 hover:text-emerald-900" : "text-indigo-600 hover:text-indigo-900"} mr-4 inline-flex items-center`}
                          title={currentUserProfile?.role === "teacher" ? "Gerar Relatório da Aula" : "Editar Aula"}
                        >
                          {currentUserProfile?.role === "teacher" ? (
                            <>
                              <FileText className="w-4 h-4 mr-1" />
                              <span className="text-xs font-semibold">Relatório</span>
                            </>
                          ) : (
                            <Edit2 className="w-4 h-4" />
                          )}
                        </button>
                        {currentUserProfile?.role === "super_admin" && (
                          <button
                            onClick={async () => {
                              await deleteClass(session.id);
                              setSyncFeedback("Aula excluída da plataforma! Remoção no Google em segundo plano.");
                              setTimeout(() => setSyncFeedback(null), 4000);
                            }}
                            className="text-rose-600 hover:text-rose-900"
                            title="Excluir Aula"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
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
        ) : (
          <div className="p-6 space-y-8 bg-zinc-50/50">
            {sortedDates.length > 0 ? (
              sortedDates.map(date => {
                const dateObj = new Date(date + 'T12:00:00');
                const dayName = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
                const formattedDate = dateObj.toLocaleDateString('pt-BR');
                
                return (
                  <div key={date} className="space-y-4">
                    <h3 className="text-lg font-semibold text-zinc-900 capitalize flex items-center">
                      <CalendarIcon className="w-5 h-5 mr-2 text-indigo-600" />
                      {dayName}, {formattedDate}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {groupedClasses[date].map(session => {
                        const teacher = state.teachers.find(t => t.id === session.teacher_id);
                        const students = getSessionStudents(session, state);
                        const isMakeup = (session.title || "").toLowerCase().includes("reposição") || 
                                         (session.title || "").toLowerCase().includes("reposicao") || 
                                         (session.title || "").toLowerCase().includes("reagendad") || 
                                         (session.report || "").toLowerCase().includes("aula de reposição") || 
                                         (session.report || "").toLowerCase().includes("aula de reposicao");
                        const hasReport = session.report && session.report.trim().length > 0 && !session.report.trim().startsWith("Aula de reposição");
                        const visualTheme = getClassCardVisualTheme(session, state);

                        return (
                          <div key={session.id} className={`p-5 rounded-2xl border transition-all relative group flex flex-col h-full ${visualTheme.gridCardClass}`}>
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <h4 className="font-semibold text-zinc-900">{session.title}</h4>
                                <div className="flex items-center text-xs text-zinc-500 mt-1.5">
                                  <Clock className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
                                  {session.start_time} - {session.end_time}
                                </div>
                              </div>
                              <span className={`px-2.5 py-1 text-[10px] rounded-full whitespace-nowrap ml-2 ${
                                visualTheme.badgeClass
                              }`}>
                                {visualTheme.label}
                              </span>
                            </div>
                            
                            {session.status === "cancelled" && session.cancelled_by_teacher && (
                              <div className="mb-3 flex items-center text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 w-fit px-2 py-1 rounded-md">
                                Cancelada pelo Professor
                              </div>
                            )}
                            {isMakeup && (
                              <div className="mb-3 flex items-center text-xs font-semibold text-amber-900 bg-amber-100 border border-amber-300/80 w-fit px-2 py-1 rounded-md">
                                <RefreshCcw className="w-3.5 h-3.5 mr-1.5 text-amber-700" />
                                Aula de Reposição
                              </div>
                            )}
                            {session.allow_makeup && !isMakeup && (
                              <div className="mb-3 flex items-center text-xs font-medium text-indigo-600 bg-indigo-50 w-fit px-2 py-1 rounded-md">
                                <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
                                Permite Reposição
                              </div>
                            )}
                            {hasReport && (
                              <div className="mb-3 flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 w-fit px-2 py-1 rounded-md">
                                <FileText className="w-3.5 h-3.5 mr-1.5" />
                                Possui Relatório
                              </div>
                            )}

                            <div className="mb-4">
                              <div className="text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wider">Professor</div>
                              <div className="text-sm text-zinc-900 flex items-center">
                                <div className="h-6 w-6 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 font-bold text-xs mr-2">
                                  {teacher?.name.charAt(0).toUpperCase() || "?"}
                                </div>
                                {teacher?.name || "Não atribuído"}
                              </div>
                            </div>
                            
                            <div className="flex-1">
                              {(() => {
                                const groupMatch = getGroupForSession(session, state);
                                if (groupMatch) {
                                  return (
                                    <>
                                      <div className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Grupo</div>
                                      <div className="flex flex-col gap-1.5 text-sm text-zinc-700 bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                                        <div className="flex items-center font-semibold text-indigo-950">
                                          <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs mr-2 shrink-0">
                                            {groupMatch.name.charAt(0).toUpperCase()}
                                          </div>
                                          <span>{groupMatch.name}</span>
                                        </div>
                                        {students.length > 0 && (
                                          <div className="text-xs text-zinc-600 pl-9">
                                            <strong>Alunos ({students.length}):</strong> {students.map(s => s.name).join(', ')}
                                          </div>
                                        )}
                                      </div>
                                    </>
                                  );
                                }

                                return (
                                  <>
                                    <div className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Alunos ({students.length})</div>
                                    <div className="flex flex-col gap-2">
                                      {students.map(student => (
                                        <div key={student.id} className="flex items-center justify-between text-sm text-zinc-700 bg-zinc-50 p-1.5 rounded-lg group/student">
                                          <div className="flex items-center truncate">
                                            <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs mr-2 shrink-0">
                                              {student.name.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="truncate">{student.name}</span>
                                          </div>
                                          <button 
                                            onClick={(e) => { e.stopPropagation(); sendWhatsAppReminder(session, student.id); }}
                                            className="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors flex items-center justify-center shrink-0 ml-2"
                                            title="Enviar lembrete pelo WhatsApp"
                                          >
                                            <MessageCircle className="w-4 h-4" />
                                          </button>
                                        </div>
                                      ))}
                                      {students.length === 0 && <span className="text-sm text-zinc-400 italic">Nenhum aluno matriculado</span>}
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                            
                            <div className="absolute top-3 right-3 flex space-x-1 bg-white/95 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-zinc-200">
                              <button
                                onClick={() => openModal(session)}
                                className={`p-1.5 rounded-md transition-colors ${currentUserProfile?.role === "teacher" ? "text-emerald-600 hover:bg-emerald-50" : "text-indigo-600 hover:bg-indigo-50"}`}
                                title={currentUserProfile?.role === "teacher" ? "Gerar Relatório da Aula" : "Editar Aula"}
                              >
                                {currentUserProfile?.role === "teacher" ? (
                                  <FileText className="w-4 h-4" />
                                ) : (
                                  <Edit2 className="w-4 h-4" />
                                )}
                              </button>
                              {currentUserProfile?.role === "super_admin" && (
                                <button
                                  onClick={async () => {
                                    await deleteClass(session.id);
                                    setSyncFeedback("Aula excluída da plataforma! Remoção no Google em segundo plano.");
                                    setTimeout(() => setSyncFeedback(null), 4000);
                                  }}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                                  title="Excluir Aula"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12">
                <p className="text-zinc-500">Nenhuma aula encontrada.</p>
              </div>
            )}
          </div>
        )}
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
                {error && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                {((formData.title || "").toLowerCase().includes("reposição") || (formData.title || "").toLowerCase().includes("reposicao") || (formData.title || "").toLowerCase().includes("reagendad") || (formData.report || "").toLowerCase().includes("aula de reposição")) && (
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-medium flex items-center gap-2">
                    <RefreshCcw className="w-4 h-4 text-amber-600 shrink-0" />
                    <span><strong>Aula de Reposição / Reagendada:</strong> Esta aula está agendada como reposição de aula anterior.</span>
                  </div>
                )}
                {!editingClass && (
                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                    <label className="block text-sm font-medium text-indigo-900 mb-1">
                      Agendar para um Grupo (Opcional)
                    </label>
                    <select
                      onChange={(e) => {
                        const groupId = e.target.value;
                        if (!groupId) return;
                        const group = state.groups.find(g => g.id === groupId);
                        if (group) {
                          const enrolledStudents = state.enrollments
                            .filter(en => en.group_id === groupId && en.status === 'active' && isEnrollmentActiveOnDate(en, formData.date))
                            .map(en => en.student_id);
                          
                          const grpTeacher = state.teachers.find(t => t.id === group.teacher_id);
                          const targetTeacherId = (grpTeacher && isTeacherActive(grpTeacher))
                            ? grpTeacher.id
                            : (formData.teacher_id || (state.teachers.find(t => isTeacherActive(t))?.id || ""));

                          setFormData({
                            ...formData,
                            group_id: groupId,
                            title: `Aula de ${group.name}`,
                            teacher_id: targetTeacherId,
                            student_ids: enrolledStudents
                          });
                        }
                      }}
                      className="w-full px-3 py-2 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white text-indigo-900"
                    >
                      <option value="">Selecione um grupo para preencher...</option>
                      {state.groups
                        .filter(g => g.status !== 'inactive')
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                    </select>
                    <p className="text-xs text-indigo-700 mt-2">
                      Ao selecionar um grupo, o título, professor e alunos serão preenchidos automaticamente.
                    </p>
                  </div>
                )}

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
                    disabled={currentUserProfile?.role === "teacher"}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-zinc-50 disabled:text-zinc-500"
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
                      disabled={currentUserProfile?.role === "teacher"}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white disabled:bg-zinc-50 disabled:text-zinc-500"
                    >
                      <option value="" disabled>
                        Selecione um professor
                      </option>
                      {state.teachers
                        .filter((t) => {
                          const active = isTeacherActive(t);
                          if (!editingClass) {
                            // Para novas aulas/agendamentos: SOMENTE professores com teachers.status = 'active'
                            return active;
                          }
                          // Para aula existente: professores ativos OU o professor já vinculado à aula existente
                          return active || t.id === editingClass.teacher_id;
                        })
                        .map((t) => {
                          const active = isTeacherActive(t);
                          return (
                            <option key={t.id} value={t.id}>
                              {t.name}{!active ? ' (Inativo)' : ''}
                            </option>
                          );
                        })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => {
                        const newStatus = e.target.value as any;
                        setFormData({
                          ...formData,
                          status: newStatus,
                          allow_makeup: newStatus === "cancelled" ? true : formData.allow_makeup,
                          cancelled_by_teacher: newStatus === "cancelled" ? formData.cancelled_by_teacher : false,
                        });
                      }}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                    >
                      <option value="scheduled">Agendada</option>
                      <option value="completed">Concluída</option>
                      {isSuperAdmin && (
                        <option value="cancelled">Cancelada</option>
                      )}
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
                      disabled={currentUserProfile?.role === "teacher"}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-zinc-50 disabled:text-zinc-500"
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
                      disabled={currentUserProfile?.role === "teacher"}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-zinc-50 disabled:text-zinc-500"
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
                      disabled={currentUserProfile?.role === "teacher"}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-zinc-50 disabled:text-zinc-500"
                    />
                  </div>
                </div>

                <div className="relative">
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    Alunos
                  </label>

                  {/* Group student sync / custom override indicator */}
                  {(() => {
                    const modalGroupMatch = getGroupForSession(formData as any, state);
                    const isGroupModalClass = Boolean(formData.group_id || modalGroupMatch);
                    if (!isGroupModalClass) return null;

                    if (formData.has_custom_students) {
                      return (
                        <div className="flex items-center justify-between bg-amber-50/90 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-900 mb-2.5">
                          <span className="flex items-center gap-1.5 font-medium">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            Lista personalizada desta aula (exceção salva exclusivamente para esta aula)
                          </span>
                          {currentUserProfile?.role !== "teacher" && (
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={handleRestoreGroupStudents}
                              className="text-[11px] text-indigo-700 hover:text-indigo-900 font-semibold underline disabled:opacity-50 transition-colors shrink-0 ml-2"
                              title="Restaurar a lista padrão de alunos da turma para esta aula"
                            >
                              Restaurar da turma
                            </button>
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="flex items-center justify-between bg-blue-50/80 border border-blue-200/70 rounded-xl px-3 py-2 text-xs text-blue-800 mb-2.5">
                        <span className="flex items-center gap-1.5 font-medium">
                          <Users className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          Lista automática da turma (sincronizada com as matrículas do grupo)
                        </span>
                        <span className="text-[11px] text-blue-600 bg-white px-2 py-0.5 rounded-md border border-blue-100 font-semibold">
                          Automático
                        </span>
                      </div>
                    );
                  })()}
                  
                  {/* Selected Students Tags */}
                  {formData.student_ids.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {formData.student_ids.map(id => {
                        const student = state.students.find(s => s.id === id);
                        if (!student) return null;
                        return (
                          <span key={id} className="inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium bg-indigo-50 text-indigo-700">
                            {student.name}
                            {currentUserProfile?.role !== "teacher" && (
                              <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => handleStudentToggle(id)}
                                className="ml-1.5 inline-flex items-center justify-center text-indigo-400 hover:text-indigo-600 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                                title="Remover aluno desta aula"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Dropdown Toggle */}
                  {currentUserProfile?.role !== "teacher" && (
                    <div 
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl bg-white flex items-center justify-between cursor-pointer hover:border-indigo-500 transition-colors"
                      onClick={() => setIsStudentDropdownOpen(!isStudentDropdownOpen)}
                    >
                      <span className="text-zinc-500 text-sm">
                        {formData.student_ids.length === 0 ? "Selecione os alunos..." : "Adicionar mais alunos..."}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-zinc-400 transition-transform ${isStudentDropdownOpen ? 'rotate-180' : ''}`} />
                    </div>
                  )}

                  {/* Dropdown Menu */}
                  {isStudentDropdownOpen && (
                    <div className="absolute z-10 mt-1 w-full bg-white border border-zinc-200 rounded-xl shadow-lg overflow-hidden">
                      <div className="p-2 border-b border-zinc-100">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
                          <input
                            type="text"
                            placeholder="Buscar aluno..."
                            value={studentSearchTerm}
                            onChange={(e) => setStudentSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {(() => {
                          const matchingStudents = state.students
                            .filter((s) => s.status === "active")
                            .filter(s => s.name.toLowerCase().includes(studentSearchTerm.toLowerCase()) || (s.instrument || "").toLowerCase().includes(studentSearchTerm.toLowerCase()));

                          if (matchingStudents.length === 0) {
                            return (
                              <div className="p-4 text-sm text-zinc-500 text-center">
                                Nenhum aluno encontrado.
                              </div>
                            );
                          }

                          return matchingStudents.map((student) => {
                            const isSelected = formData.student_ids.includes(student.id);
                            const enrollment = state.enrollments.find(e => e.student_id === student.id && e.status === 'active');
                            const isActiveForClassDate = enrollment ? isEnrollmentActiveOnDate(enrollment, formData.date) : true;
                            const startDateStr = enrollment?.start_date || enrollment?.enrollment_date;

                            return (
                              <label
                                key={student.id}
                                className={`flex items-center px-3 py-2.5 hover:bg-zinc-50 cursor-pointer transition-colors ${!isActiveForClassDate && !isSelected ? 'opacity-60 bg-zinc-50/50' : ''}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleStudentToggle(student.id)}
                                  className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="ml-3 text-sm text-zinc-900 font-medium">
                                  {student.name}
                                </span>
                                <div className="ml-auto flex items-center gap-1.5">
                                  {!isActiveForClassDate && startDateStr && (
                                    <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                                      Início: {startDateStr.split('-').reverse().join('/')}
                                    </span>
                                  )}
                                  <span className="text-xs text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                                    {student.instrument || 'Geral'}
                                  </span>
                                </div>
                              </label>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  )}
                </div>

                {formData.student_ids.length > 0 && (
                  <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-zinc-800">Controle de Presença</span>
                      <span className="text-xs text-zinc-500 font-medium">Selecione Presente ou Falta</span>
                    </div>
                    
                    <div className="divide-y divide-zinc-200/60 max-h-48 overflow-y-auto space-y-2">
                      {formData.student_ids.map((studentId) => {
                        const student = state.students.find(s => s.id === studentId);
                        if (!student) return null;
                        
                        const currentVal = formData.attendance?.[studentId] || "";
                        
                        // Check if student has more than 3 consecutive absences!
                        const formGroupMatch = getGroupForSession(formData, state);
                        const formGroupId = formData.group_id || formGroupMatch?.id || null;
                        const consecAbsences = getConsecutiveAbsences(studentId, formGroupId);
                        const hasExcessiveAbsences = consecAbsences >= 3;
                        
                        return (
                          <div key={studentId} className="py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm font-medium text-zinc-900 truncate">
                                {student.name}
                              </span>
                              {hasExcessiveAbsences && (
                                <span className="inline-flex items-center text-[10px] font-bold text-rose-600 mt-0.5">
                                  <AlertCircle className="w-3 h-3 mr-1 shrink-0" />
                                  Atenção: {consecAbsences} faltas consecutivas! Entrar em contato.
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center space-x-1 shrink-0 self-end sm:self-auto">
                              <button
                                type="button"
                                onClick={() => sendWhatsAppReminder(editingClass || formData, studentId)}
                                className="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors flex items-center justify-center shrink-0 mr-1"
                                title="Enviar confirmação / lembrete via WhatsApp pelo Celular"
                              >
                                <MessageCircle className="w-4 h-4 text-emerald-600" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData((prev) => ({
                                    ...prev,
                                    status: "completed",
                                    attendance: {
                                      ...(prev.attendance || {}),
                                      [studentId]: "present",
                                    }
                                  }));
                                }}
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
                                onClick={() => {
                                  setFormData((prev) => ({
                                    ...prev,
                                    status: "completed",
                                    attendance: {
                                      ...(prev.attendance || {}),
                                      [studentId]: "absent",
                                    }
                                  }));
                                  
                                  // Prompt warning immediately if they select absent and they already had >=2 absences, making it 3 consecutive absences!
                                  if (consecAbsences >= 2) {
                                    // Make sure it doesn't alert multiple times on toggle
                                    if (currentVal !== "absent") {
                                      alert(`Atenção: Com esta falta, o(a) aluno(a) ${student.name} atinge ${consecAbsences + 1} faltas consecutivas. Favor entrar em contato para entender o motivo do sumiço!`);
                                    }
                                  }
                                }}
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
                )}

                <div className="flex items-center pt-2">
                  <input
                    type="checkbox"
                    id="allow_makeup"
                    checked={formData.allow_makeup}
                    onChange={(e) => setFormData({ ...formData, allow_makeup: e.target.checked })}
                    disabled={currentUserProfile?.role === "teacher"}
                    className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                  />
                  <label htmlFor="allow_makeup" className="ml-2 block text-sm text-zinc-900">
                    Permite reposição
                  </label>
                </div>

                {isRaphaelForFormData && (
                  <div className="pt-2 space-y-1">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="cancelled_by_teacher"
                        checked={formData.cancelled_by_teacher}
                        onChange={(e) => setFormData({ ...formData, cancelled_by_teacher: e.target.checked })}
                        disabled={!isSuperAdmin}
                        className="h-4 w-4 rounded border-zinc-300 text-rose-600 focus:ring-rose-500 disabled:opacity-50"
                      />
                      <label htmlFor="cancelled_by_teacher" className="ml-2 block text-sm font-medium text-zinc-900">
                        Cancelada pelo professor
                      </label>
                    </div>
                    {formData.cancelled_by_teacher && (
                      <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 mt-1">
                        Esta aula foi cancelada por indisponibilidade do Professor Raphael e gerará o crédito correspondente aos alunos na mensalidade.
                      </p>
                    )}
                  </div>
                )}

                <div className="pt-2 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setShowReport(!showReport)}
                    className="flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    {showReport ? "Ocultar Relatório" : "Adicionar/Ver Relatório da Aula"}
                  </button>
                  
                  <AnimatePresence>
                    {showReport && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden mt-3"
                      >
                        <label className="block text-sm font-medium text-zinc-700 mb-1">
                          Relatório / Anotações
                        </label>

                        {isDraftRestored && (
                          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs flex items-center justify-between mb-2">
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
                          <div className="mb-2.5 p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs">
                            <div className="flex items-center justify-between mb-1.5 font-semibold text-indigo-900">
                              <span className="flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                                Última Anotação ({lastReportNote.date.split('-').reverse().join('/')}):
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData((prev) => ({
                                    ...prev,
                                    report: prev.report ? `${prev.report}\n\n[Anterior]: ${lastReportNote.report}` : lastReportNote.report,
                                    status: "completed"
                                  }));
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
                          value={formData.report}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormData((prev) => ({
                              ...prev,
                              report: val,
                              status: (val.trim() || prev.vocal_routine?.trim()) ? "completed" : prev.status,
                            }));
                          }}
                          placeholder="Anote o que foi feito na aula, desempenho do aluno, tarefas de casa, etc..."
                          className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none min-h-[100px] resize-y text-sm"
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

                        {/* Campo de Treino do Aluno */}
                        <div className="mt-4 pt-3 border-t border-zinc-200">
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-sm font-semibold text-zinc-800 flex items-center">
                              <FileText className="w-4 h-4 mr-1.5 text-teal-600" />
                              Treino do Aluno
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                const selectedStudent = state.students.find(s => formData.student_ids.includes(s.id));
                                setVocalModalData({
                                  studentName: selectedStudent?.name || formData.title || 'Aluno',
                                  studentPhone: selectedStudent?.phone,
                                  date: formData.date,
                                  vocalRoutine: formData.vocal_routine || '',
                                  onSave: (newRoutine) => {
                                    setFormData(prev => ({ ...prev, vocal_routine: newRoutine }));
                                  }
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
                            <div className="mb-2.5 p-3 bg-teal-50/70 border border-teal-100 rounded-xl text-xs">
                              <div className="flex items-center justify-between mb-1.5 font-semibold text-teal-900">
                                <span className="flex items-center gap-1.5">
                                  <FileText className="w-3.5 h-3.5 text-teal-600" />
                                  Último Treino Registrado ({lastVocalRoutineNote.date.split('-').reverse().join('/')}):
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFormData((prev) => ({
                                      ...prev,
                                      vocal_routine: prev.vocal_routine ? `${prev.vocal_routine}\n\n[Anterior]: ${lastVocalRoutineNote.vocal_routine}` : lastVocalRoutineNote.vocal_routine,
                                      status: "completed"
                                    }));
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
                            value={formData.vocal_routine}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormData(prev => ({
                                ...prev,
                                vocal_routine: val,
                                status: (val.trim() || prev.report?.trim()) ? "completed" : prev.status,
                              }));
                            }}
                            placeholder="Digite aqui os exercícios de vocalise, conduta vocal e orientações de treino para o aluno..."
                            className="w-full px-3 py-2 border border-teal-200/80 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none min-h-[100px] resize-y text-sm bg-teal-50/20 text-zinc-900"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {!editingClass && (
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-100">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">
                        Recorrência
                      </label>
                      <select
                        value={recurrence}
                        onChange={(e) => setRecurrence(e.target.value as any)}
                        className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                      >
                        <option value="none">Não repetir (Avulsa)</option>
                        <option value="semanal">Semanal</option>
                        <option value="quinzenal">Quinzenal</option>
                        <option value="mensal">Mensal</option>
                      </select>
                    </div>
                    {recurrence !== 'none' && (
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">
                          Repetir até
                        </label>
                        <input
                          type="date"
                          required
                          value={recurrenceEndDate}
                          onChange={(e) => setRecurrenceEndDate(e.target.value)}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-4 flex justify-between items-center shrink-0">
                  {editingClass && currentUserProfile?.role === "super_admin" ? (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={async () => {
                        setIsSubmitting(true);
                        try {
                          await deleteClass(editingClass.id);
                          setIsModalOpen(false);
                          setEditingClass(null);
                          setSyncFeedback("Aula excluída da plataforma! Remoção no Google em segundo plano.");
                          setTimeout(() => setSyncFeedback(null), 4000);
                        } finally {
                          setIsSubmitting(false);
                        }
                      }}
                      className="px-4 py-2 text-sm font-medium text-rose-600 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors flex items-center disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {isSubmitting ? "Excluindo..." : "Excluir"}
                    </button>
                  ) : editingClass && hasReportDraft(editingClass.id) ? (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleDiscardDraft}
                      className="text-xs font-semibold text-zinc-500 hover:text-rose-600 transition-colors"
                    >
                      Descartar rascunho
                    </button>
                  ) : (
                    <div></div>
                  )}
                  <div className="flex space-x-3">
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
                      {isSubmitting ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Lembretes Automáticos */}
      <AnimatePresence>
        {isReminderModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white max-w-2xl w-full rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-indigo-50/30">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-indigo-50 border border-indigo-100/60 rounded-xl text-indigo-600">
                    <Bell className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-zinc-900 leading-tight">Lembretes Automáticos</h2>
                    <p className="text-xs text-zinc-500">Configuração e disparo automático de mensagens de aula</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsReminderModalOpen(false)}
                  className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-zinc-100 px-6 bg-zinc-50/50">
                <button
                  onClick={() => setReminderActiveTab('settings')}
                  className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
                    reminderActiveTab === 'settings'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>Configurações</span>
                </button>
                <button
                  onClick={() => setReminderActiveTab('logs')}
                  className={`py-3 px-4 text-sm font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
                    reminderActiveTab === 'logs'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <History className="w-4 h-4" />
                  <span>Histórico de Envios</span>
                  {reminderLogs.length > 0 && (
                    <span className="ml-1.5 px-2 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700 rounded-full">
                      {reminderLogs.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {reminderActiveTab === 'settings' ? (
                  <div className="space-y-6">
                    {/* Ativar/Desativar */}
                    <div className="flex items-center justify-between p-4 bg-zinc-50 rounded-xl border border-zinc-200/60">
                      <div>
                        <h3 className="text-sm font-bold text-zinc-900">Ativar disparos automáticos</h3>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Verifica novas aulas agendadas e envia notificações simuladas automaticamente ao abrir o sistema
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          const updated = { ...reminderSettings, enabled: !reminderSettings.enabled };
                          saveReminderSettings(updated);
                        }}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          reminderSettings.enabled ? 'bg-indigo-600' : 'bg-zinc-200'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                            reminderSettings.enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Antecedência */}
                    <div>
                      <label className="block text-sm font-bold text-zinc-700 mb-1.5">
                        Tempo de Antecedência
                      </label>
                      <select
                        value={reminderSettings.advance_days}
                        onChange={(e) => {
                          const updated = { ...reminderSettings, advance_days: Number(e.target.value) };
                          saveReminderSettings(updated);
                        }}
                        className="w-full px-3.5 py-2.5 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white text-sm text-zinc-700 font-medium"
                      >
                        <option value={0}>No mesmo dia da aula</option>
                        <option value={1}>1 dia antes da aula (Recomendado)</option>
                        <option value={2}>2 dias antes da aula</option>
                      </select>
                    </div>

                    {/* Template */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-sm font-bold text-zinc-700">
                          Modelo da Mensagem (WhatsApp)
                        </label>
                        <span className="text-[11px] text-indigo-600 font-medium bg-indigo-50 px-2 py-0.5 border border-indigo-100 rounded-full">
                          WhatsApp Web formatado
                        </span>
                      </div>
                      <textarea
                        value={reminderSettings.template}
                        onChange={(e) => {
                          const updated = { ...reminderSettings, template: e.target.value };
                          saveReminderSettings(updated);
                        }}
                        placeholder="Escreva o modelo da mensagem..."
                        className="w-full px-3.5 py-2.5 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none min-h-[120px] resize-y text-sm text-zinc-700"
                      />
                      
                      {/* Placeholders helper */}
                      <div className="mt-2">
                        <span className="text-xs font-semibold text-zinc-500">Variáveis disponíveis (clique para inserir):</span>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {[
                            { code: "{nome_aluno}", desc: "Nome Aluno" },
                            { code: "{nome_aula}", desc: "Nome da Aula" },
                            { code: "{data_aula}", desc: "Data" },
                            { code: "{hora_aula}", desc: "Horário" },
                            { code: "{nome_professor}", desc: "Professor" },
                          ].map((ph) => (
                            <button
                              key={ph.code}
                              type="button"
                              onClick={() => {
                                const updated = {
                                  ...reminderSettings,
                                  template: (reminderSettings.template || "") + " " + ph.code
                                };
                                saveReminderSettings(updated);
                              }}
                              className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-800 rounded-lg text-xs font-mono font-medium transition-colors"
                              title={`Inserir ${ph.desc}`}
                            >
                              + {ph.code}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Preview box */}
                    <div className="p-4 bg-zinc-50 border border-zinc-200/60 rounded-xl space-y-2">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Visualização Prévia do Lembrete:</span>
                      <div className="bg-white p-3.5 border border-zinc-100 rounded-lg shadow-sm relative text-sm text-zinc-800 leading-relaxed">
                        <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500"></div>
                        <p className="whitespace-pre-wrap">
                          {compileTemplate(
                            reminderSettings.template,
                            "Anna",
                            "VIOLINO",
                            formatClassDate(getTargetDateStr(reminderSettings.advance_days)),
                            "19:30",
                            "Natália Rizzo Neto Mota"
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Header bar with controls */}
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                        Histórico recente de envios automáticos
                      </span>
                      {reminderLogs.length > 0 && (
                        <button
                          onClick={() => {
                            if (window.confirm("Deseja realmente limpar todo o histórico de envios?")) {
                              setReminderLogs([]);
                              localStorage.removeItem("reminder_logs");
                            }
                          }}
                          className="text-xs text-rose-600 hover:text-rose-700 font-bold transition-colors"
                        >
                          Limpar Histórico
                        </button>
                      )}
                    </div>

                    {reminderLogs.length === 0 ? (
                      <div className="py-12 text-center space-y-3">
                        <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto text-zinc-400">
                          <History className="w-6 h-6" />
                        </div>
                        <div className="max-w-sm mx-auto">
                          <p className="text-sm font-bold text-zinc-800">Nenhum lembrete enviado automaticamente</p>
                          <p className="text-xs text-zinc-500 mt-1">
                            Os disparos acontecem automaticamente em segundo plano ao carregar o sistema se houverem aulas agendadas para o período configurado ({reminderSettings.advance_days} dia(s) de antecedência).
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {reminderLogs.map((log: any) => (
                          <div key={log.id} className="p-4 bg-zinc-50/50 hover:bg-zinc-50 border border-zinc-200/50 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex items-center flex-wrap gap-2">
                                <span className="text-xs font-bold text-zinc-800 truncate">{log.student_name}</span>
                                <span className="text-[10px] font-mono text-zinc-400">{log.student_phone || "Sem telefone"}</span>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                  log.status === "success"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                    : "bg-amber-50 text-amber-700 border border-amber-100"
                                }`}>
                                  {log.status === "success" ? "Disparado (Simulado)" : "Aviso: Sem Telefone"}
                                </span>
                              </div>
                              <p className="text-xs text-zinc-600 line-clamp-2 italic">"{log.message_text}"</p>
                              <p className="text-[10px] text-zinc-400 font-medium">
                                Enviado em: {new Date(log.date_sent).toLocaleString('pt-BR')}
                              </p>
                            </div>
                            <div className="shrink-0 flex items-center">
                              {log.student_phone ? (
                                <button
                                  onClick={() => {
                                    let phone = log.student_phone.replace(/\D/g, '');
                                    if (!phone.startsWith('55')) phone = '55' + phone;
                                    const url = `https://wa.me/${phone}?text=${encodeURIComponent(log.message_text)}`;
                                    window.open(url, '_blank');
                                  }}
                                  className="w-full md:w-auto inline-flex items-center justify-center px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors"
                                  title="Abrir no WhatsApp Web"
                                >
                                  <MessageCircle className="w-3.5 h-3.5 mr-1" />
                                  Reenviar no WhatsApp
                                </button>
                              ) : (
                                <span className="text-[11px] text-zinc-400 font-semibold italic">Não é possível reenviar</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-zinc-100 flex justify-between items-center bg-zinc-50/50">
                <span className="text-xs font-medium text-zinc-500">
                  {reminderActiveTab === 'settings' 
                    ? "*As configurações são salvas automaticamente." 
                    : `Mostrando os últimos ${reminderLogs.length} envios.`
                  }
                </span>
                <button
                  onClick={() => {
                    if (reminderActiveTab === 'settings') {
                      saveReminderSettings(reminderSettings);
                      if (reminderSettings.enabled) {
                        runAutomaticRemindersCheck(reminderSettings);
                      }
                      setShowReminderNotification("Configurações de lembretes salvas com sucesso!");
                      setTimeout(() => setShowReminderNotification(null), 4000);
                    }
                    setIsReminderModalOpen(false);
                  }}
                  className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm"
                >
                  {reminderActiveTab === 'settings' ? 'Salvar & Fechar' : 'Fechar'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* WhatsApp Helper / Fallback Modal */}
      <AnimatePresence>
        {whatsAppModalData && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-zinc-200"
            >
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-100">
                <div className="flex items-center space-x-2 text-emerald-600">
                  <MessageCircle className="w-6 h-6" />
                  <h3 className="font-bold text-lg text-zinc-900">Confirmação via WhatsApp</h3>
                </div>
                <button
                  onClick={() => setWhatsAppModalData(null)}
                  className="p-1 hover:bg-zinc-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl text-xs text-emerald-800 flex items-center space-x-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Abrimos o WhatsApp para <strong>{whatsAppModalData.studentName}</strong> ({whatsAppModalData.primaryFormatted}).
                  </span>
                </div>

                {whatsAppModalData.alternateUrl && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-start space-x-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-amber-900">
                          WhatsApp informou "O número de telefone não está no WhatsApp"?
                        </h4>
                        <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
                          No Brasil, muitas contas do WhatsApp foram cadastradas sem o 9º dígito. Clique no botão abaixo para tentar a versão alternativa:
                        </p>
                      </div>
                    </div>
                    <a
                      href={whatsAppModalData.alternateUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full inline-flex items-center justify-center px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl transition-colors shadow-xs"
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Tentar sem/com 9º dígito ({whatsAppModalData.alternateFormatted})
                    </a>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-5 border-t border-zinc-100 mt-5">
                <button
                  onClick={() => setWhatsAppModalData(null)}
                  className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-semibold text-xs rounded-xl transition-colors"
                >
                  Entendi / Fechar
                </button>
              </div>
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
