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
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  FileText,
  MessageCircle,
  ChevronDown,
  AlertCircle,
  Bell,
  Settings,
  History,
  Check,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export const findGroupMatch = (title: string, groups: any[]) => {
  if (!title) return undefined;
  const cleanTitle = title.toLowerCase().trim();
  return groups.find(g => {
    const cleanName = g.name.toLowerCase().trim();
    return (
      cleanTitle === `aula de ${cleanName}` ||
      cleanTitle === cleanName ||
      cleanTitle.startsWith(`${cleanName} -`) ||
      cleanTitle.startsWith(`${cleanName} `) ||
      cleanTitle.endsWith(`- ${cleanName}`) ||
      cleanTitle.includes(`de ${cleanName}`) ||
      cleanTitle.includes(`turma ${cleanName}`) ||
      cleanTitle.includes(`grupo ${cleanName}`)
    );
  });
};

export const Classes: React.FC = () => {
  const { state, addClass, updateClass, deleteClass, currentUserProfile } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTeacherId, setFilterTeacherId] = useState<string>("");
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'calendar'>('calendar');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassSession | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<'none' | 'semanal' | 'quinzenal' | 'mensal'>('none');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().split("T")[0];
  });
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // --- States and logic for Automatic Class Reminders ---
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [reminderActiveTab, setReminderActiveTab] = useState<'settings' | 'logs'>('settings');
  const [reminderSettings, setReminderSettings] = useState(() => {
    const saved = localStorage.getItem("reminder_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.template) {
          if (parsed.template.includes("amanhã, ")) {
            parsed.template = parsed.template.replace("amanhã, ", "");
          } else if (parsed.template.includes("amanhã ")) {
            parsed.template = parsed.template.replace("amanhã ", "");
          }
        }
        return parsed;
      } catch (e) {
        // use default
      }
    }
    return {
      enabled: true,
      advance_days: 1, // 1 dia de antecedência
      template: "Olá, {nome_aluno}! Tudo bem? Passando para lembrar da nossa aula de {nome_aula}, {data_aula}, às {hora_aula} com o(a) professor(a) {nome_professor}. Te esperamos!",
    };
  });

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
    return template
      .replace(/{nome_aluno}/g, studentName)
      .replace(/{nome_aula}/g, classTitle)
      .replace(/{titulo_aula}/g, classTitle)
      .replace(/{data_aula}/g, classDate)
      .replace(/{hora_aula}/g, classTime)
      .replace(/{nome_professor}/g, teacherName)
      .replace(/{professor}/g, teacherName);
  }, []);

  const runAutomaticRemindersCheck = React.useCallback(() => {
    if (!reminderSettings.enabled) return;

    const targetDateStr = getTargetDateStr(reminderSettings.advance_days);
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
      const students = state.students.filter(s => (session.student_ids || []).includes(s.id));
      const teacher = state.teachers.find(t => t.id === session.teacher_id);
      
      let formattedDate = "";
      try {
        const dateParts = session.date.split('-');
        if (dateParts.length === 3) {
          formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
        } else {
          formattedDate = session.date;
        }
      } catch (e) {
        formattedDate = session.date;
      }

      for (const student of students) {
        const uniqueKey = `${session.id}-${student.id}-${session.date}`;
        if (sentKeys.includes(uniqueKey)) {
          continue;
        }

        const messageText = compileTemplate(
          reminderSettings.template,
          student.name,
          session.title,
          formattedDate,
          session.start_time,
          teacher?.name || "escola"
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
  }, [state.classes, state.students, state.teachers, reminderSettings, reminderLogs, getTargetDateStr, compileTemplate]);

  React.useEffect(() => {
    if (state.classes.length > 0 && state.students.length > 0) {
      const timer = setTimeout(() => {
        runAutomaticRemindersCheck();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state.classes.length, state.students.length, runAutomaticRemindersCheck]);

  const [formData, setFormData] = useState({
    title: "",
    teacher_id: "",
    student_ids: [] as string[],
    date: new Date().toISOString().split("T")[0],
    start_time: "09:00",
    end_time: "10:00",
    status: "scheduled" as "scheduled" | "completed" | "cancelled",
    allow_makeup: false,
    report: "",
    attendance: {} as Record<string, "present" | "absent">,
  });

  const [showReport, setShowReport] = useState(false);
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);
  const [studentSearchTerm, setStudentSearchTerm] = useState("");

  const getConsecutiveAbsences = React.useCallback((studentId: string) => {
    // Filter completed classes that the student was scheduled to attend
    const studentClasses = state.classes
      .filter((c) => (c.student_ids || []).includes(studentId) && c.status === "completed")
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
  }, [state.classes]);

  const evasionAlertStudents = React.useMemo(() => {
    return state.students
      .filter((student) => student.status === "active")
      .map((student) => {
        const consecAbsences = getConsecutiveAbsences(student.id);
        return { student, consecAbsences };
      })
      .filter((item) => item.consecAbsences >= 3);
  }, [state.students, getConsecutiveAbsences]);

  const baseClasses = React.useMemo(() => {
    let classes = state.classes.filter((c) => c.status !== "cancelled");
    if (currentUserProfile?.role === "teacher" && currentUserProfile.teacher_id) {
      classes = classes.filter((c) => {
        if (c.teacher_id === currentUserProfile.teacher_id) return true;
        const groupMatch = findGroupMatch(c.title, state.groups);
        if (groupMatch && groupMatch.teacher_id === currentUserProfile.teacher_id) return true;
        return false;
      });
    } else if (filterTeacherId) {
      classes = classes.filter((c) => {
        if (c.teacher_id === filterTeacherId) return true;
        const groupMatch = findGroupMatch(c.title, state.groups);
        if (groupMatch && groupMatch.teacher_id === filterTeacherId) return true;
        return false;
      });
    }
    return classes;
  }, [state.classes, state.groups, currentUserProfile, filterTeacherId]);

  const filteredClasses = baseClasses
    .filter(
      (c) =>
        (c.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (state.teachers.find((t) => t.id === c.teacher_id)?.name || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()),
    )
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
    const students = state.students.filter(s => (session.student_ids || []).includes(s.id));
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
    const dateObj = new Date(session.date + 'T12:00:00');
    const formattedDate = dateObj.toLocaleDateString('pt-BR');
    
    const message = `Olá, ${targetStudent.name.split(' ')[0]}! Tudo bem? Passando para lembrar da nossa aula de ${session.title} amanhã, ${formattedDate}, às ${session.start_time} com o(a) professor(a) ${teacher?.name || 'da escola'}. Te esperamos!`;
    
    let phone = targetStudent.phone.replace(/\D/g, '');
    if (!phone.startsWith('55')) {
      phone = '55' + phone;
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (editingClass) {
        await updateClass(editingClass.id, formData);
      } else {
        if (recurrence === 'none') {
          await addClass(formData);
        } else {
          let currentDate = new Date(formData.date + 'T12:00:00');
          const end = new Date(recurrenceEndDate + 'T12:00:00');
          
          while (currentDate <= end) {
            await addClass({
              ...formData,
              date: currentDate.toISOString().split("T")[0]
            });
            
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
      setIsModalOpen(false);
      setEditingClass(null);
    } catch (err) {
      console.error("Error saving class:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openModal = (session?: ClassSession) => {
    setIsSubmitting(false);
    if (session) {
      setEditingClass(session);
      const groupMatch = findGroupMatch(session.title, state.groups);
      let initialStudentIds = session.student_ids || [];
      if (initialStudentIds.length === 0 && groupMatch) {
        initialStudentIds = state.enrollments
          .filter(en => en.group_id === groupMatch.id && en.status === 'active')
          .map(en => en.student_id);
      }
      setFormData({
        ...session,
        student_ids: initialStudentIds,
        allow_makeup: session.allow_makeup || false,
        report: session.report || "",
        attendance: session.attendance || {},
      });
      setShowReport(currentUserProfile?.role === "teacher");
      setStudentSearchTerm("");
      setIsStudentDropdownOpen(false);
    } else {
      setEditingClass(null);
      setRecurrence('none');
      setShowReport(false);
      setStudentSearchTerm("");
      setIsStudentDropdownOpen(false);
      const d = new Date();
      d.setMonth(d.getMonth() + 6);
      setRecurrenceEndDate(d.toISOString().split("T")[0]);
      const defaultTeacherId = (currentUserProfile?.role === "teacher" && currentUserProfile.teacher_id)
        ? currentUserProfile.teacher_id
        : (state.teachers[0]?.id || "");
      setFormData({
        title: "",
        teacher_id: defaultTeacherId,
        student_ids: [],
        date: new Date().toISOString().split("T")[0],
        start_time: "09:00",
        end_time: "10:00",
        status: "scheduled",
        allow_makeup: false,
        report: "",
        attendance: {},
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setIsModalOpen(false);
    setEditingClass(null);
  };

  const handleStudentToggle = (studentId: string) => {
    const isAdding = !formData.student_ids.includes(studentId);
    
    if (isAdding && !editingClass && recurrence === 'none') {
      const enrollment = state.enrollments.find(e => e.student_id === studentId && e.status === 'active');
      if (enrollment) {
        const plan = state.financialPlans.find(p => p.id === enrollment.plan_id);
        if (plan && ['semanal', 'quinzenal', 'mensal'].includes(plan.modality)) {
          setRecurrence(plan.modality as any);
        }
      }
    }

    setFormData((prev) => ({
      ...prev,
      student_ids: isAdding
        ? [...prev.student_ids, studentId]
        : prev.student_ids.filter((id) => id !== studentId),
    }));
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
              let phone = student.phone ? student.phone.replace(/\D/g, "") : "";
              if (phone && !phone.startsWith("55")) phone = "55" + phone;
              const waUrl = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null;

              return (
                <div key={student.id} className="bg-white border border-rose-100 p-3.5 rounded-xl flex flex-col justify-between space-y-3 shadow-sm">
                  <div>
                    <span className="text-xs font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full inline-block mb-1.5">
                      {consecAbsences} Faltas Consecutivas
                    </span>
                    <h3 className="font-semibold text-zinc-900 text-sm">{student.name}</h3>
                    <p className="text-xs text-zinc-500 font-mono mt-0.5">{student.phone || "Sem telefone"}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Instrumento: {student.instrument || "-"}</p>
                  </div>
                  {waUrl ? (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-2 rounded-xl transition-colors shadow-sm text-center"
                    >
                      <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                      Entrar em contato
                    </a>
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
        <div className="flex items-center gap-2">
          {["super_admin", "admin"].includes(currentUserProfile?.role || "") && (
            <button
              onClick={() => {
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

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-2xl">
            <div className="relative flex-1">
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
            {currentUserProfile?.role !== "teacher" && (
              <div className="relative w-full sm:w-64">
                <select
                  value={filterTeacherId}
                  onChange={(e) => setFilterTeacherId(e.target.value)}
                  className="block w-full px-3 py-2 border border-zinc-200 bg-zinc-50 rounded-xl leading-5 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors text-zinc-700 font-medium"
                >
                  <option value="">Professor (Todos)</option>
                  {state.teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
                          const students = state.students.filter(s => (session.student_ids || []).includes(s.id));
                          const studentNames = students.map(s => s.name.split(' ')[0]).join(', ') || 'Sem alunos';
                          const groupMatch = findGroupMatch(session.title, state.groups);
                          const displayNames = groupMatch ? `Grupo: ${groupMatch.name}` : studentNames;
                          
                          return (
                          <div 
                            key={session.id} 
                            onClick={() => openModal(session)}
                            className={`text-xs p-1.5 rounded border cursor-pointer hover:shadow-sm transition-shadow group/session ${
                              session.status === 'scheduled' ? 'bg-amber-50 border-amber-200 text-amber-800 hover:border-amber-300' :
                              session.status === 'completed' ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:border-emerald-300' :
                              'bg-rose-50 border-rose-200 text-rose-800 hover:border-rose-300'
                            }`}
                          >
                            <div className="font-semibold truncate flex items-center justify-between">
                              <span className="truncate">{session.start_time}</span>
                              <div className="flex items-center">
                                {session.report && <FileText className="w-3 h-3 ml-1 shrink-0 opacity-70" title="Possui relatório" />}
                                {session.allow_makeup && <RefreshCcw className="w-3 h-3 ml-1 shrink-0" title="Permite reposição" />}
                                {students.length > 0 && !groupMatch && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); sendWhatsAppReminder(session); }}
                                    className="ml-1 text-emerald-600 hover:text-emerald-700 opacity-0 group-hover/session:opacity-100 transition-opacity"
                                    title="Enviar lembrete pelo WhatsApp"
                                  >
                                    <MessageCircle className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="truncate opacity-90" title={displayNames}>{displayNames}</div>
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
                  const students = state.students.filter((s) =>
                    (session.student_ids || []).includes(s.id),
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
                            const groupMatch = findGroupMatch(session.title, state.groups);
                            if (groupMatch) {
                              return (
                                <div className="flex items-center text-sm text-zinc-900">
                                  <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs mr-2">
                                    {groupMatch.name.charAt(0).toUpperCase()}
                                  </div>
                                  Grupo: {groupMatch.name}
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
                                  onClick={(e) => { e.stopPropagation(); sendWhatsAppReminder(session, student.id); }}
                                  className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors opacity-0 group-hover/student:opacity-100"
                                  title="Enviar lembrete pelo WhatsApp"
                                >
                                  <MessageCircle className="w-4 h-4" />
                                </button>
                              </div>
                            ));
                          })()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-2">
                          <span
                            className={`px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full w-fit ${
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
                          {session.allow_makeup && (
                            <span className="inline-flex items-center text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md w-fit mt-2">
                              <RefreshCcw className="w-3 h-3 mr-1" />
                              Reposição
                            </span>
                          )}
                          {session.report && (
                            <span className="inline-flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md w-fit mt-2">
                              <FileText className="w-3 h-3 mr-1" />
                              Relatório
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
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
                            onClick={() => deleteClass(session.id)}
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
                        const students = state.students.filter(s => (session.student_ids || []).includes(s.id));
                        
                        return (
                          <div key={session.id} className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-all relative group flex flex-col h-full">
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <h4 className="font-semibold text-zinc-900">{session.title}</h4>
                                <div className="flex items-center text-xs text-zinc-500 mt-1.5">
                                  <Clock className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
                                  {session.start_time} - {session.end_time}
                                </div>
                              </div>
                              <span className={`px-2.5 py-1 text-[10px] font-medium rounded-full whitespace-nowrap ml-2 ${
                                session.status === "scheduled" ? "bg-amber-100 text-amber-800" : 
                                session.status === "completed" ? "bg-emerald-100 text-emerald-800" : 
                                "bg-rose-100 text-rose-800"
                              }`}>
                                {session.status === "scheduled" ? "Agendada" : session.status === "completed" ? "Concluída" : "Cancelada"}
                              </span>
                            </div>
                            
                            {session.allow_makeup && (
                              <div className="mb-3 flex items-center text-xs font-medium text-indigo-600 bg-indigo-50 w-fit px-2 py-1 rounded-md">
                                <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
                                Permite Reposição
                              </div>
                            )}
                            {session.report && (
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
                                const groupMatch = findGroupMatch(session.title, state.groups);
                                if (groupMatch) {
                                  return (
                                    <>
                                      <div className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Grupo</div>
                                      <div className="flex items-center text-sm text-zinc-700 bg-zinc-50 p-2 rounded-lg">
                                        <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm mr-3 shrink-0">
                                          {groupMatch.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="font-medium">{groupMatch.name}</span>
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
                                            className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-md transition-colors opacity-0 group-hover/student:opacity-100"
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
                            
                            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1 bg-white/90 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-zinc-100">
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
                                  onClick={() => deleteClass(session.id)}
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
                            .filter(en => en.group_id === groupId && en.status === 'active')
                            .map(en => en.student_id);
                          
                          setFormData({
                            ...formData,
                            title: `Aula de ${group.name}`,
                            teacher_id: group.teacher_id || formData.teacher_id,
                            student_ids: enrolledStudents
                          });
                        }
                      }}
                      className="w-full px-3 py-2 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white text-indigo-900"
                    >
                      <option value="">Selecione um grupo para preencher...</option>
                      {state.groups.map((g) => (
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
                    disabled={currentUserProfile?.role === "teacher" || currentUserProfile?.role === "admin"}
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
                      disabled={currentUserProfile?.role === "teacher" || currentUserProfile?.role === "admin"}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white disabled:bg-zinc-50 disabled:text-zinc-500"
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
                      {currentUserProfile?.role === "super_admin" && (
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
                      disabled={currentUserProfile?.role === "teacher" || currentUserProfile?.role === "admin"}
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
                      disabled={currentUserProfile?.role === "teacher" || currentUserProfile?.role === "admin"}
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
                      disabled={currentUserProfile?.role === "teacher" || currentUserProfile?.role === "admin"}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-zinc-50 disabled:text-zinc-500"
                    />
                  </div>
                </div>

                <div className="relative">
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    Alunos
                  </label>
                  
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
                                onClick={() => handleStudentToggle(id)}
                                className="ml-1.5 inline-flex items-center justify-center text-indigo-400 hover:text-indigo-600 focus:outline-none"
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
                        {state.students
                          .filter((s) => s.status === "active")
                          .filter(s => s.name.toLowerCase().includes(studentSearchTerm.toLowerCase()) || s.instrument.toLowerCase().includes(studentSearchTerm.toLowerCase()))
                          .length > 0 ? (
                          state.students
                            .filter((s) => s.status === "active")
                            .filter(s => s.name.toLowerCase().includes(studentSearchTerm.toLowerCase()) || s.instrument.toLowerCase().includes(studentSearchTerm.toLowerCase()))
                            .map((student) => (
                              <label
                                key={student.id}
                                className="flex items-center px-3 py-2.5 hover:bg-zinc-50 cursor-pointer transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={formData.student_ids.includes(student.id)}
                                  onChange={() => handleStudentToggle(student.id)}
                                  className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="ml-3 text-sm text-zinc-900 font-medium">
                                  {student.name}
                                </span>
                                <span className="ml-auto text-xs text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                                  {student.instrument}
                                </span>
                              </label>
                            ))
                        ) : (
                          <div className="p-4 text-sm text-zinc-500 text-center">
                            Nenhum aluno encontrado.
                          </div>
                        )}
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
                        const consecAbsences = getConsecutiveAbsences(studentId);
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
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    attendance: {
                                      ...(formData.attendance || {}),
                                      [studentId]: "present",
                                    }
                                  });
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
                                  setFormData({
                                    ...formData,
                                    attendance: {
                                      ...(formData.attendance || {}),
                                      [studentId]: "absent",
                                    }
                                  });
                                  
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
                    disabled={currentUserProfile?.role === "teacher" || currentUserProfile?.role === "admin"}
                    className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50"
                  />
                  <label htmlFor="allow_makeup" className="ml-2 block text-sm text-zinc-900">
                    Permite reposição
                  </label>
                </div>

                {editingClass && (
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
                          <textarea
                            value={formData.report}
                            onChange={(e) => setFormData({ ...formData, report: e.target.value })}
                            placeholder="Anote o que foi feito na aula, desempenho do aluno, tarefas de casa, etc..."
                            className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none min-h-[120px] resize-y"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

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
                      onClick={() => {
                        deleteClass(editingClass.id);
                        closeModal();
                      }}
                      className="px-4 py-2 text-sm font-medium text-rose-600 bg-rose-50 rounded-xl hover:bg-rose-100 transition-colors flex items-center"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Excluir
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
                    {currentUserProfile?.role !== "admin" && (
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
                      >
                        {isSubmitting ? "Salvando..." : "Salvar"}
                      </button>
                    )}
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
                          setReminderSettings(updated);
                          localStorage.setItem("reminder_settings", JSON.stringify(updated));
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
                          setReminderSettings(updated);
                          localStorage.setItem("reminder_settings", JSON.stringify(updated));
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
                          setReminderSettings(updated);
                          localStorage.setItem("reminder_settings", JSON.stringify(updated));
                        }}
                        placeholder="Escreva o modelo da mensagem..."
                        className="w-full px-3.5 py-2.5 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none min-h-[120px] resize-y text-sm text-zinc-700"
                      />
                      
                      {/* Placeholders helper */}
                      <div className="mt-2">
                        <span className="text-xs font-semibold text-zinc-500">Variáveis disponíveis (clique para copiar):</span>
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
                              onClick={() => {
                                navigator.clipboard.writeText(ph.code);
                              }}
                              className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-800 rounded-lg text-xs font-mono font-medium transition-colors"
                              title={`Copiar ${ph.desc}`}
                            >
                              {ph.code}
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
                            "João Silva",
                            "Aula de Violão",
                            new Date(getTargetDateStr(reminderSettings.advance_days) + 'T12:00:00').toLocaleDateString('pt-BR'),
                            "14:00",
                            "Carlos Souza"
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
                      runAutomaticRemindersCheck();
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
    </div>
  );
};
