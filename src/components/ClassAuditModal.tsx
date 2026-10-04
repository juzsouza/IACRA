import React, { useState, useEffect, useMemo } from "react";
import { useAppStore, ClassAuditItem, AuditSummary, ClassRecoveryInspection, parsePackedReport } from "../store";
import {
  X,
  Search,
  RefreshCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Database,
  Laptop,
  ArrowRight,
  Filter,
  Copy,
  Check,
  Eye,
  FileText,
  AlertCircle,
  UploadCloud,
  Lock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ClassAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ClassAuditModal: React.FC<ClassAuditModalProps> = ({ isOpen, onClose }) => {
  const {
    state,
    currentUserProfile,
    runClassAudit,
    recoverPendingClasses,
    syncSingleClassSafely,
    inspectClassForRecovery,
    resolveClassConflict,
    latestAuditSummary,
    isAuditing
  } = useAppStore();

  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("all");
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showSynced, setShowSynced] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isRecovering, setIsRecovering] = useState<boolean>(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);

  // Inspection modal state
  const [inspectingItem, setInspectingItem] = useState<ClassAuditItem | null>(null);

  // Recovery modal state
  const [recoveryClassId, setRecoveryClassId] = useState<string | null>(null);
  const [recoveryInspection, setRecoveryInspection] = useState<ClassRecoveryInspection | null>(null);
  const [isInspectingRecovery, setIsInspectingRecovery] = useState<boolean>(false);
  const [isExecutingRecovery, setIsExecutingRecovery] = useState<boolean>(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  // Conflict resolution modal state
  const [conflictItem, setConflictItem] = useState<ClassAuditItem | null>(null);
  const [conflictMergedReport, setConflictMergedReport] = useState<string>("");
  const [conflictMergedVocal, setConflictMergedVocal] = useState<string>("");

  const userRole = currentUserProfile?.role;
  const isSuperAdmin = userRole === 'super_admin';
  const isTeacher = userRole === 'teacher';
  const isAdmin = userRole === 'admin';
  const currentUserTeacherId = currentUserProfile?.teacher_id;

  const handleStartRecoveryInspection = async (classId: string) => {
    setRecoveryClassId(classId);
    setRecoveryInspection(null);
    setIsInspectingRecovery(true);
    setRecoveryError(null);
    try {
      const insp = await inspectClassForRecovery(classId);
      setRecoveryInspection(insp);
    } catch (err: any) {
      setRecoveryError("Erro ao verificar dados no Supabase: " + (err?.message || "Falha"));
    } finally {
      setIsInspectingRecovery(false);
    }
  };

  const handleConfirmRecovery = async (classId: string) => {
    setIsExecutingRecovery(true);
    setRecoveryError(null);
    try {
      const res = await syncSingleClassSafely(classId);
      if (res.success) {
        setFeedbackMessage({
          type: "success",
          text: `🟢 ${res.message}`
        });
        setRecoveryClassId(null);
        setRecoveryInspection(null);
      } else {
        setRecoveryError(res.message);
      }
    } catch (err: any) {
      setRecoveryError(err?.message || "Erro inesperado ao gravar no Supabase.");
    } finally {
      setIsExecutingRecovery(false);
    }
  };

  // Available unique dates from audit items sorted descending
  const availableDates = useMemo(() => {
    if (!latestAuditSummary?.items) return [];
    const rawDates: string[] = latestAuditSummary.items.map(i => i.date).filter((d): d is string => Boolean(d));
    const uniqueDates: string[] = Array.from(new Set(rawDates));
    return uniqueDates.sort((a: string, b: string) => b.localeCompare(a));
  }, [latestAuditSummary]);

  useEffect(() => {
    if (isOpen && (isSuperAdmin || isAdmin) && !latestAuditSummary && !isAuditing) {
      runClassAudit().catch(err => {
        setFeedbackMessage({ type: "error", text: "Erro ao executar diagnóstico de leitura: " + (err?.message || "Falha") });
      });
    }
  }, [isOpen, isSuperAdmin, isAdmin]);

  // Auto-dismiss transient feedback banner
  useEffect(() => {
    if (!feedbackMessage) return;
    const timer = setTimeout(() => {
      setFeedbackMessage(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [feedbackMessage]);

  const handleRunAudit = async () => {
    setFeedbackMessage(null);
    try {
      const filterOpts: any = {};
      if (selectedTeacherId !== "all") filterOpts.filterTeacherId = selectedTeacherId;
      if (selectedDateFilter !== "all") filterOpts.filterDate = selectedDateFilter;
      const res = await runClassAudit(filterOpts);
      setFeedbackMessage({
        type: "info",
        text: `Diagnóstico de leitura concluído: ${res.items.length} aulas analisadas (${res.pendingCount} pendência(s), ${res.manualCheckCount || 0} conferência(s), ${res.conflictCount} conflito(s)).`
      });
    } catch (err: any) {
      setFeedbackMessage({ type: "error", text: "Erro ao executar auditoria: " + (err?.message || "Falha desconhecida") });
    }
  };

  const handleRecoverSingle = async (classId: string) => {
    setIsRecovering(true);
    setFeedbackMessage(null);
    try {
      const res = await syncSingleClassSafely(classId);
      if (res.success) {
        setFeedbackMessage({
          type: "success",
          text: `Aula recuperada e confirmada com sucesso no Supabase!`
        });
      } else {
        setFeedbackMessage({
          type: "error",
          text: `Falha na recuperação: ${res.message}`
        });
      }
    } catch (err: any) {
      setFeedbackMessage({ type: "error", text: "Erro na operação de recuperação: " + (err?.message || "Falha") });
    } finally {
      setIsRecovering(false);
    }
  };

  const handleRecoverAllPending = async () => {
    if (!latestAuditSummary || latestAuditSummary.pendingCount === 0) return;
    const confirmProceed = window.confirm(
      `Confirma a recuperação segura de ${latestAuditSummary.pendingCount} aula(s) com dados preenchidos localmente?\n\nEsta operação enviará os relatórios e status concluídos ao Supabase e validará a confirmação sem apagar nenhum dado.`
    );
    if (!confirmProceed) return;

    setIsRecovering(true);
    setFeedbackMessage(null);
    try {
      const pendingIds = latestAuditSummary.items
        .filter(i => i.category === "pending")
        .map(i => i.class_id);

      const res = await recoverPendingClasses(pendingIds);
      if (res.recoveredCount > 0) {
        setFeedbackMessage({
          type: "success",
          text: `Recuperação concluída: ${res.recoveredCount} aula(s) sincronizada(s) e confirmada(s) no Supabase. ${res.failedCount > 0 ? `${res.failedCount} falha(s).` : ""}`
        });
      } else {
        setFeedbackMessage({
          type: "error",
          text: `Nenhuma aula pôde ser sincronizada. Verifique permissões RLS ou conexão com a nuvem.`
        });
      }
    } catch (err: any) {
      setFeedbackMessage({ type: "error", text: "Erro na recuperação em lote: " + (err?.message || "Falha") });
    } finally {
      setIsRecovering(false);
    }
  };

  const handleResolveConflict = async (resolution: "use_local" | "use_remote" | "merge") => {
    if (!conflictItem) return;
    setIsRecovering(true);
    try {
      const res = await resolveClassConflict(
        conflictItem.class_id,
        resolution,
        resolution === "merge" ? {
          report: conflictMergedReport,
          vocal_routine: conflictMergedVocal,
          status: "completed"
        } : undefined
      );
      if (res.success) {
        setFeedbackMessage({ type: "success", text: res.message });
        setConflictItem(null);
      } else {
        setFeedbackMessage({ type: "error", text: res.message });
      }
    } catch (err: any) {
      setFeedbackMessage({ type: "error", text: "Erro na resolução: " + (err?.message || "Falha") });
    } finally {
      setIsRecovering(false);
    }
  };

  // Filtered audit items - Pre-filters out synced classes when showSynced is false
  const filteredItems = useMemo(() => {
    if (!latestAuditSummary) return [];
    return latestAuditSummary.items.filter(item => {
      // By default (showSynced === false), hide items that are already synced unless the user explicitly filtered by "synced"
      if (!showSynced && selectedCategory === "all" && item.category === "synced") {
        return false;
      }

      if (selectedTeacherId !== "all" && item.teacher_id !== selectedTeacherId) return false;
      if (selectedDateFilter !== "all" && item.date !== selectedDateFilter) return false;
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false;

      if (searchTerm.trim() !== "") {
        const term = searchTerm.toLowerCase();
        const tName = (item.teacher_name || "").toLowerCase();
        const tEmail = (item.teacher_email || "").toLowerCase();
        const title = (item.title || "").toLowerCase();
        const id = (item.class_id || "").toLowerCase();
        const repLocal = (item.localData?.report || "").toLowerCase();
        const repRemote = (item.remoteData?.report || "").toLowerCase();
        return (
          tName.includes(term) ||
          tEmail.includes(term) ||
          title.includes(term) ||
          id.includes(term) ||
          repLocal.includes(term) ||
          repRemote.includes(term)
        );
      }
      return true;
    });
  }, [latestAuditSummary, selectedTeacherId, selectedDateFilter, selectedCategory, showSynced, searchTerm]);

  // Copy Comprehensive Diagnosis Report to Clipboard
  const handleCopyMarkdownReport = () => {
    if (!latestAuditSummary) return;
    
    // 1. Queue summary
    const queue = latestAuditSummary.pendingSyncQueue || [];
    const pendingTotal = queue.length;

    // Group queue by date
    const queueDateCounts: Record<string, number> = {};
    queue.forEach(q => {
      const d = q.date || "Sem Data";
      queueDateCounts[d] = (queueDateCounts[d] || 0) + 1;
    });
    const queueDateBreakdown = Object.entries(queueDateCounts)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([d, count]) => `  - ${d.includes('-') ? d.split('-').reverse().join('/') : d}: ${count} pendência(s)`)
      .join("\n");

    const withReport = queue.filter(q => q.report && q.report.trim().length > 0 && !q.report.trim().startsWith("Aula de reposição")).length;
    const withVocal = queue.filter(q => q.vocal_routine && q.vocal_routine.trim().length > 0).length;
    const withAtt = queue.filter(q => q.attendance && Object.keys(q.attendance).length > 0).length;
    const emptyQueueItems = queue.filter(q => !((q.report && q.report.trim().length > 0) || (q.vocal_routine && q.vocal_routine.trim().length > 0) || (q.attendance && Object.keys(q.attendance).length > 0))).length;

    // By teacher in queue
    const queueTeacherCounts: Record<string, number> = {};
    queue.forEach(q => {
      const t = state.teachers.find(tch => tch.id === q.teacher_id);
      const name = t?.name || (q.teacher_id ? `ID: ${q.teacher_id.slice(0, 8)}` : "Sem Professor");
      queueTeacherCounts[name] = (queueTeacherCounts[name] || 0) + 1;
    });

    const queueTeacherBreakdown = Object.entries(queueTeacherCounts)
      .map(([name, count]) => `  - ${name}: ${count} pendência(s)`)
      .join("\n");

    const headerQueue = "| # | Class ID | Data | Horário | Professor | Status Local | Possui Relat.? | Possui Presença? | Possui Rotina Vocal? | Origem |\n|---|---|---|---|---|---|---|---|---|---|";
    const rowsQueue = queue.map((q, idx) => {
      const t = state.teachers.find(tch => tch.id === q.teacher_id);
      const tName = t?.name || q.teacher_id || "N/A";
      const hasRep = (q.report && q.report.trim().length > 0 && !q.report.trim().startsWith("Aula de reposição")) ? `SIM (${q.report.length} carac.)` : "NÃO";
      const hasAtt = (q.attendance && Object.keys(q.attendance).length > 0) ? `SIM (${Object.keys(q.attendance).length} alunos)` : "NÃO";
      const hasVoc = (q.vocal_routine && q.vocal_routine.trim().length > 0) ? `SIM (${q.vocal_routine.length} carac.)` : "NÃO";
      const origin = q.timestamp ? new Date(q.timestamp).toLocaleString("pt-BR") : "Storage Local";

      return `| ${idx + 1} | ${q.class_id} | ${q.date} | ${q.start_time} - ${q.end_time} | ${tName} | ${q.status} | ${hasRep} | ${hasAtt} | ${hasVoc} | ${origin} |`;
    });

    const headerAll = "| # | Class ID | Professor | Data Local | Data Supabase | Horário | Aluno/Grupo | Status Local | Status Supabase | Relat. Local (Tam) | Presença Local | Rotina Vocal Local | Relat. Supabase | Classificação |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";
    const rowsAll = filteredItems.map((item, idx) => {
      const locStatus = item.localData?.status || 'Ausente';
      const remStatus = item.remoteData?.status || 'Ausente';

      const locDate = item.localData?.date ? item.localData.date.split('-').reverse().join('/') : '-';
      const remDate = item.remoteData?.date ? item.remoteData.date.split('-').reverse().join('/') : '-';

      const locParsed = parsePackedReport(item.localData?.report);
      const locReportText = locParsed.report || "";
      const isLocRep = locReportText.length > 0 && !locReportText.startsWith("Aula de reposição");
      const locRepStr = isLocRep ? `SIM (${locReportText.length} carac.)` : 'NÃO';

      const remParsed = parsePackedReport(item.remoteData?.report);
      const remReportText = remParsed.report || "";
      const isRemRep = remReportText.length > 0 && !remReportText.startsWith("Aula de reposição");
      const remRepStr = isRemRep ? `SIM (${remReportText.length} carac.)` : 'NÃO';

      const locAtt = (item.localData?.attendance && Object.keys(item.localData.attendance).length > 0) ? item.localData.attendance : locParsed.attendance;
      const hasLocAtt = locAtt && Object.keys(locAtt).length > 0;
      const locAttStr = hasLocAtt ? `SIM (${Object.keys(locAtt).length} al.)` : 'NÃO';

      const locVoc = item.localData?.vocal_routine || locParsed.vocal_routine || "";
      const hasLocVoc = locVoc.trim().length > 0;
      const locVocStr = hasLocVoc ? `SIM (${locVoc.trim().length} carac.)` : 'NÃO';

      const catLabel = item.category === 'synced' ? '🟢 SINCRONIZADO' :
        item.category === 'pending' ? '🟠 RECUPERAÇÃO DISPONÍVEL' :
        item.category === 'conflict' ? '🔴 CONFLITO' :
        item.category === 'local_only' ? '⚪ SOMENTE LOCAL' :
        item.category === 'manual_check' ? '⚠️ CONFERÊNCIA NECESSÁRIA' : '🔵 SOMENTE SUPABASE';

      return `| ${idx + 1} | ${item.class_id} | ${item.teacher_name || 'N/A'} | ${locDate} | ${remDate} | ${item.start_time} - ${item.end_time} | ${item.student_names || item.title || 'N/A'} | ${locStatus} | ${remStatus} | ${locRepStr} | ${locAttStr} | ${locVocStr} | ${remRepStr} | ${catLabel} |`;
    });

    const markdown = `# RELATÓRIO DE AUDITORIA & DIAGNÓSTICO DE DADOS (100% SOMENTE LEITURA)
Data/Hora do Diagnóstico: ${new Date(latestAuditSummary.auditedAt).toLocaleString('pt-BR')}
Fonte da Fila: app_classes_pending_sync (localStorage: pending_class_syncs_v1)
Dados Locais Preservados: SIM (Zero mutação/exclusão)
Operação Realizada: SOMENTE LEITURA (SELECT)

---

### 1. RESUMO GERAL DAS PENDÊNCIAS LOCAIS
- **Total de pendências detectadas na fila**: ${pendingTotal}
- **Pendências por Data**:
${queueDateBreakdown ? queueDateBreakdown : "  - Nenhuma pendência na fila."}
- **Pendências por Professor**:
${queueTeacherBreakdown ? queueTeacherBreakdown : "  - Nenhuma pendência na fila."}
- **Conteúdo das Pendências**:
  - Com Relatório Pedagógico Local: ${withReport}
  - Com Lista de Presença Local: ${withAtt}
  - Com Conduta/Rotina Vocal Local: ${withVocal}
  - Recuperação Disponível: ${latestAuditSummary.pendingCount}
  - Totalmente Vazias: ${emptyQueueItems}

---

### 2. DETALHAMENTO DA FILA DE PENDÊNCIAS LOCAIS (app_classes_pending_sync)
${headerQueue}
${rowsQueue.join('\n')}

---

### 3. CONFRONTO COMPLETO COM O BANCO SUPABASE
- Total de Aulas Analisadas: ${latestAuditSummary.totalClasses}
- 🟢 Sincronizadas (Local = Supabase): ${latestAuditSummary.syncedCount}
- 🟠 Recuperação Disponível (Local preenchido / Nuvem vazia): ${latestAuditSummary.pendingCount}
- ⚠️ Conferência Necessária (Divergência estrutural: data/horário/professor): ${latestAuditSummary.manualCheckCount || 0}
- 🔴 Conflitos Pedagógicos (Dados divergentes): ${latestAuditSummary.conflictCount}
- ⚪ Somente Local (Não existe no Supabase): ${latestAuditSummary.localOnlyCount}
- 🔵 Somente Supabase (Sem dados no dispositivo): ${latestAuditSummary.remoteOnlyCount}

${headerAll}
${rowsAll.join('\n')}
`;

    navigator.clipboard.writeText(markdown);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 3000);
  };

  if (!isOpen || isTeacher || (!isSuperAdmin && !isAdmin)) return null;

  return (
    <div id="class-audit-modal-backdrop" className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <motion.div
        id="class-audit-modal-container"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[92vh] flex flex-col overflow-hidden border border-zinc-200"
      >
        {/* Header */}
        <div id="class-audit-modal-header" className="px-6 py-4 border-b border-zinc-100 bg-zinc-50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-zinc-900">Auditoria & Recuperação de Consistência de Aulas</h2>
                <span className="px-2 py-0.5 text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md">
                  Modo Seguro • Zero Perda
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Auditoria abrangente em todos os professores comparando estado local vs Supabase (incluindo datas, horários e relatórios).
              </p>
            </div>
          </div>
          <button
            id="close-class-audit-modal-btn"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        <AnimatePresence>
          {feedbackMessage && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className={`px-6 py-3 border-b flex items-center justify-between text-xs font-semibold ${
                feedbackMessage.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : feedbackMessage.type === "error"
                  ? "bg-rose-50 text-rose-800 border-rose-200"
                  : "bg-blue-50 text-blue-800 border-blue-200"
              }`}
            >
              <div className="flex items-center space-x-2">
                {feedbackMessage.type === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                {feedbackMessage.type === "error" && <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />}
                {feedbackMessage.type === "info" && <Database className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                <span>{feedbackMessage.text}</span>
              </div>
              <button
                onClick={() => setFeedbackMessage(null)}
                className="p-1 hover:opacity-70 rounded-md transition-opacity"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats Dashboard Summary */}
        {latestAuditSummary && (
          <div className="space-y-2 p-4 bg-zinc-50/70 border-b border-zinc-100 flex-shrink-0 text-xs">
            {/* Top Diagnostic Badges */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-indigo-50/80 border border-indigo-200/80 rounded-xl text-indigo-950 font-medium">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 bg-amber-500 text-white font-bold rounded-md shadow-xs">
                  Pendências locais detectadas: {latestAuditSummary.pendingSyncQueue?.length || 0}
                </span>
                <span className="text-zinc-600">|</span>
                <span className="text-zinc-700">Fonte da fila: <strong className="font-mono text-zinc-900">app_classes_pending_sync</strong></span>
                {!isSuperAdmin && (
                  <>
                    <span className="text-zinc-600">|</span>
                    <span className="text-indigo-900 font-semibold">Escopo: {state.teachers.find(t => t.id === currentUserProfile?.teacher_id)?.name || currentUserProfile?.email || "Minhas Aulas"}</span>
                  </>
                )}
              </div>
              <div className="flex items-center space-x-3 text-[11px]">
                <span className="inline-flex items-center text-emerald-700 font-bold bg-emerald-100/70 px-2 py-0.5 rounded-md border border-emerald-300/60">
                  <Check className="w-3 h-3 mr-1 text-emerald-600" />
                  Dados locais preservados: SIM
                </span>
                <span className="inline-flex items-center text-indigo-800 font-bold bg-indigo-100/70 px-2 py-0.5 rounded-md border border-indigo-300/60">
                  <ShieldCheck className="w-3 h-3 mr-1 text-indigo-600" />
                  Operação realizada: SOMENTE LEITURA
                </span>
              </div>
            </div>

            {/* Metric Cards Grid */}
            <div id="class-audit-stats-grid" className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
              <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-xs">
                <span className="text-zinc-500 font-medium block">Total Analisado</span>
                <span className="text-lg font-bold text-zinc-900">{latestAuditSummary.totalClasses}</span>
                <span className="text-[10px] text-zinc-400 block mt-0.5">{latestAuditSummary.totalTeachers} professores</span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-xs">
                <span className="text-emerald-700 font-medium block flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Sincronizadas</span>
                </span>
                <span className="text-lg font-bold text-emerald-800">{latestAuditSummary.syncedCount}</span>
                <span className="text-[10px] text-emerald-600 block mt-0.5">100% idênticas</span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-amber-300 shadow-xs">
                <span className="text-amber-800 font-medium block flex items-center space-x-1">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Recuperação</span>
                </span>
                <span className="text-lg font-bold text-amber-800">{latestAuditSummary.pendingCount}</span>
                <span className="text-[10px] text-amber-700 block mt-0.5">Local preenchido</span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-amber-400 shadow-xs bg-amber-50/20">
                <span className="text-amber-900 font-bold block flex items-center space-x-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
                  <span>Conferência</span>
                </span>
                <span className="text-lg font-bold text-amber-900">{latestAuditSummary.manualCheckCount || 0}</span>
                <span className="text-[10px] text-amber-800 block mt-0.5">Divergência estrutural</span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-rose-300 shadow-xs">
                <span className="text-rose-800 font-medium block flex items-center space-x-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Conflitos</span>
                </span>
                <span className="text-lg font-bold text-rose-800">{latestAuditSummary.conflictCount}</span>
                <span className="text-[10px] text-rose-600 block mt-0.5">Divergência de dados</span>
              </div>

              <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-xs">
                <span className="text-zinc-600 font-medium block">Diagnóstico</span>
                <span className="text-xs font-semibold text-zinc-800 block mt-1">
                  {new Date(latestAuditSummary.auditedAt).toLocaleTimeString('pt-BR')}
                </span>
                <span className="text-[10px] text-zinc-400 block">Modo seguro</span>
              </div>
            </div>
          </div>
        )}

        {/* Toolbar Controls & Actions */}
        <div id="class-audit-toolbar" className="p-4 border-b border-zinc-100 flex flex-wrap items-center justify-between gap-3 bg-white flex-shrink-0">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            {/* Search */}
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar professor, aula, ID ou texto..."
                className="w-full pl-8.5 pr-3 py-1.5 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
            </div>

            {/* Teacher Filter: SUPER ADMIN gets full global selector; Teacher & Standard Admin are scoped */}
            {isSuperAdmin ? (
              <select
                value={selectedTeacherId}
                onChange={e => setSelectedTeacherId(e.target.value)}
                className="py-1.5 px-3 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium text-zinc-700"
                title="Super Admin: Selecionar professor ou visão global"
              >
                <option value="all">Todos os Professores ({state.teachers.length})</option>
                {state.teachers.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : isTeacher ? (
              <div className="py-1.5 px-3 text-xs bg-indigo-50/80 border border-indigo-200 rounded-lg font-semibold text-indigo-800">
                Professor: {state.teachers.find(t => t.id === currentUserProfile?.teacher_id)?.name || currentUserProfile?.email || "Você"}
              </div>
            ) : (
              <div className="py-1.5 px-3 text-xs bg-amber-50/80 border border-amber-200 rounded-lg font-semibold text-amber-900">
                Admin: {state.teachers.find(t => t.id === currentUserProfile?.teacher_id)?.name || currentUserProfile?.email || "Escopo Restrito"}
              </div>
            )}

            {/* Dynamic Date Filter */}
            <select
              value={selectedDateFilter}
              onChange={e => setSelectedDateFilter(e.target.value)}
              className="py-1.5 px-3 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium text-zinc-700"
            >
              <option value="all">Todas as Datas {availableDates.length > 0 ? `(${availableDates.length})` : ""}</option>
              {availableDates.map(d => (
                <option key={d} value={d}>
                  {d.split('-').reverse().join('/')}
                </option>
              ))}
            </select>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              className="py-1.5 px-3 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium text-zinc-700"
            >
              <option value="all">Todas as Categorias</option>
              <option value="manual_check">⚠️ Conferência Necessária {latestAuditSummary?.manualCheckCount ? `(${latestAuditSummary.manualCheckCount})` : ''}</option>
              <option value="pending">🟠 Recuperação Disponível {latestAuditSummary?.pendingCount ? `(${latestAuditSummary.pendingCount})` : ''}</option>
              <option value="conflict">🔴 Conflito {latestAuditSummary?.conflictCount ? `(${latestAuditSummary.conflictCount})` : ''}</option>
              <option value="synced">🟢 Sincronizado {latestAuditSummary?.syncedCount ? `(${latestAuditSummary.syncedCount})` : ''}</option>
              <option value="local_only">⚪ Somente Local</option>
              <option value="remote_only">🔵 Somente Supabase</option>
            </select>

            {/* Toggle: Mostrar sincronizadas */}
            <label
              id="toggle-show-synced-classes-label"
              className={`inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors select-none ${
                showSynced
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100"
              }`}
              title="Exibir na tabela as aulas que já estão 100% idênticas e confirmadas no Supabase"
            >
              <input
                id="toggle-show-synced-classes"
                type="checkbox"
                checked={showSynced}
                onChange={e => setShowSynced(e.target.checked)}
                className="w-3.5 h-3.5 text-emerald-600 border-zinc-300 rounded focus:ring-emerald-500"
              />
              <span>Mostrar sincronizadas {latestAuditSummary?.syncedCount ? `(${latestAuditSummary.syncedCount})` : ''}</span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              id="copy-markdown-audit-report-btn"
              onClick={handleCopyMarkdownReport}
              className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-lg transition-colors shadow-2xs"
              title="Copiar relatório formatado de auditoria e confronto completo com Supabase"
            >
              {copiedReport ? <Check className="w-3.5 h-3.5 mr-1 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 mr-1 text-zinc-500" />}
              {copiedReport ? "Copiado!" : "Copiar Diagnóstico Completo"}
            </button>

            <button
              id="run-read-only-audit-btn"
              onClick={handleRunAudit}
              disabled={isAuditing}
              className="inline-flex items-center px-3.5 py-1.5 text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 rounded-lg transition-colors disabled:opacity-60"
            >
              <RefreshCcw className={`w-3.5 h-3.5 mr-1.5 ${isAuditing ? "animate-spin text-indigo-600" : "text-zinc-600"}`} />
              {isAuditing ? "Lendo e comparando..." : "Reexecutar Leitura"}
            </button>

            {latestAuditSummary && latestAuditSummary.pendingCount > 0 && (
              <button
                id="recover-all-pending-classes-btn"
                onClick={handleRecoverAllPending}
                disabled={isRecovering}
                className="inline-flex items-center px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-xs disabled:opacity-60"
              >
                <CheckCircle2 className={`w-3.5 h-3.5 mr-1.5 ${isRecovering ? "animate-spin" : ""}`} />
                {isRecovering ? "Recuperando e Confirmando..." : `Recuperar Pendências (${latestAuditSummary.pendingCount})`}
              </button>
            )}
          </div>
        </div>

        {/* Audit Results Table */}
        <div id="class-audit-table-scroll-container" className="flex-1 overflow-y-auto min-h-[300px]">
          {isAuditing ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-3">
              <RefreshCcw className="w-8 h-8 text-indigo-600 animate-spin" />
              <p className="text-sm font-semibold text-zinc-700">Executando auditoria segura de leitura no Supabase...</p>
              <p className="text-xs text-zinc-500">Buscando aulas de todos os professores sem realizar nenhuma alteração destrutiva.</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-72 text-zinc-500 space-y-3 p-6 text-center">
              {latestAuditSummary && latestAuditSummary.pendingCount === 0 && latestAuditSummary.conflictCount === 0 && (latestAuditSummary.manualCheckCount || 0) === 0 && !showSynced ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-xs">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div className="space-y-1 max-w-md">
                    <p className="text-sm font-bold text-zinc-800">✓ Tudo sincronizado. Não há registros que precisem de atenção.</p>
                    <p className="text-xs text-zinc-500">
                      Todas as {latestAuditSummary.syncedCount} aulas analisadas estão 100% idênticas e confirmadas no Supabase.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowSynced(true)}
                    className="mt-2 inline-flex items-center px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                    Mostrar {latestAuditSummary.syncedCount} aulas sincronizadas
                  </button>
                </>
              ) : (
                <>
                  <Database className="w-8 h-8 text-zinc-400" />
                  <p className="text-sm font-medium text-zinc-600">Nenhuma pendência ou aula encontrada para os filtros selecionados.</p>
                </>
              )}
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-zinc-100/90 backdrop-blur-xs text-zinc-600 font-semibold border-b border-zinc-200 z-10">
                <tr>
                  <th className="py-2.5 px-4">Professor</th>
                  <th className="py-2.5 px-3">Data</th>
                  <th className="py-2.5 px-3">Horário</th>
                  <th className="py-2.5 px-3 font-mono">Class ID</th>
                  <th className="py-2.5 px-3">Aluno / Grupo</th>
                  <th className="py-2.5 px-3">Estado Local</th>
                  <th className="py-2.5 px-3">Estado Supabase</th>
                  <th className="py-2.5 px-4">Resultado / Diagnóstico</th>
                  <th className="py-2.5 px-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredItems.map((item) => {
                  const isDateDiff = item.localData?.date && item.remoteData?.date && item.localData.date !== item.remoteData.date;
                  const isTimeDiff = (item.localData?.start_time && item.remoteData?.start_time && item.localData.start_time !== item.remoteData.start_time) ||
                    (item.localData?.end_time && item.remoteData?.end_time && item.localData.end_time !== item.remoteData.end_time);

                  return (
                    <tr
                      key={item.class_id}
                      className={`hover:bg-zinc-50/80 transition-colors ${
                        item.category === "pending"
                          ? "bg-amber-50/30"
                          : item.category === "conflict"
                          ? "bg-rose-50/30"
                          : item.category === "manual_check"
                          ? "bg-amber-50/20"
                          : ""
                      }`}
                    >
                      {/* Professor */}
                      <td className="py-2.5 px-4 font-semibold text-zinc-900">
                        <div className="flex items-center space-x-1.5">
                          <span>{item.teacher_name}</span>
                        </div>
                        <span className="text-[10px] text-zinc-400 font-normal block">{item.teacher_email}</span>
                      </td>

                      {/* Data */}
                      <td className="py-2.5 px-3 font-medium text-zinc-700">
                        {isDateDiff ? (
                          <div className="space-y-0.5">
                            <span className="inline-block text-[11px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200" title="Data no Navegador Local">
                              Local: {item.localData?.date ? item.localData.date.split('-').reverse().join('/') : '-'}
                            </span>
                            <span className="block text-[10px] text-zinc-500 font-mono" title="Data no Supabase">
                              Supa: {item.remoteData?.date ? item.remoteData.date.split('-').reverse().join('/') : '-'}
                            </span>
                          </div>
                        ) : (
                          item.date ? item.date.split('-').reverse().join('/') : '-'
                        )}
                      </td>

                      {/* Horário */}
                      <td className="py-2.5 px-3 font-mono text-zinc-600">
                        {isTimeDiff ? (
                          <div className="space-y-0.5 text-[11px]">
                            <span className="inline-block font-bold text-amber-900 bg-amber-100 px-1 rounded border border-amber-200">
                              L: {item.localData?.start_time.slice(0, 5)} - {item.localData?.end_time.slice(0, 5)}
                            </span>
                            <span className="block text-[10px] text-zinc-500">
                              S: {item.remoteData?.start_time.slice(0, 5)} - {item.remoteData?.end_time.slice(0, 5)}
                            </span>
                          </div>
                        ) : (
                          `${item.start_time.slice(0, 5)} - ${item.end_time.slice(0, 5)}`
                        )}
                      </td>

                      {/* Class ID */}
                      <td className="py-2.5 px-3 font-mono text-zinc-600 text-[11px]">
                        <div className="flex items-center space-x-1">
                          <span title={item.class_id}>{item.class_id.slice(0, 8)}...</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(item.class_id);
                              setFeedbackMessage({ type: "info", text: `UUID ${item.class_id} copiado!` });
                            }}
                            className="p-0.5 text-zinc-400 hover:text-zinc-700 rounded transition-colors"
                            title="Copiar UUID completo"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      {/* Aluno / Grupo */}
                      <td className="py-2.5 px-3 font-medium text-zinc-800 max-w-[130px] truncate" title={item.student_names || item.title}>
                        {item.student_names || item.title || '-'}
                      </td>

                      {/* Estado Local */}
                      <td className="py-2.5 px-3">
                        {item.localData ? (() => {
                          const locParsed = parsePackedReport(item.localData.report);
                          const locReportText = locParsed.report || (item.localData.report && !item.localData.report.includes("//") ? item.localData.report : "");
                          const locAtt = (item.localData.attendance && Object.keys(item.localData.attendance).length > 0) ? item.localData.attendance : locParsed.attendance;
                          const locAttCount = Object.keys(locAtt || {}).length;

                          return (
                            <div className="space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1">
                                <span
                                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md uppercase ${
                                    item.localData.status === "completed"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : item.localData.status === "cancelled"
                                      ? "bg-rose-100 text-rose-800"
                                      : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {item.localData.status || "agendada"}
                                </span>
                                {locReportText.trim().length > 0 && (
                                  <span className="px-1 py-0.2 text-[9px] bg-blue-100 text-blue-700 font-semibold rounded-sm">
                                    Relat. ({locReportText.length}c)
                                  </span>
                                )}
                                {locAttCount > 0 && (
                                  <span className="px-1 py-0.2 text-[9px] bg-purple-100 text-purple-700 font-semibold rounded-sm">
                                    Presença ({locAttCount})
                                  </span>
                                )}
                              </div>
                              {locReportText ? (
                                <p className="text-[10px] text-zinc-500 truncate max-w-[140px]" title={locReportText}>
                                  {locReportText}
                                </p>
                              ) : (
                                item.localData.status === "completed" ? (
                                  <span className="text-[10px] text-zinc-400 italic">Sem anotações</span>
                                ) : null
                              )}
                            </div>
                          );
                        })() : (
                          <span className="text-zinc-400 italic">Não existe localmente</span>
                        )}
                      </td>

                      {/* Estado Supabase */}
                      <td className="py-2.5 px-3">
                        {item.remoteData ? (() => {
                          const remParsed = parsePackedReport(item.remoteData.report);
                          const remReportText = remParsed.report || (item.remoteData.report && !item.remoteData.report.includes("//") ? item.remoteData.report : "");
                          const remAtt = (item.remoteData.attendance && Object.keys(item.remoteData.attendance).length > 0) ? item.remoteData.attendance : remParsed.attendance;
                          const remAttCount = Object.keys(remAtt || {}).length;

                          return (
                            <div className="space-y-0.5">
                              <div className="flex flex-wrap items-center gap-1">
                                <span
                                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md uppercase ${
                                    item.remoteData.status === "completed"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : item.remoteData.status === "cancelled"
                                      ? "bg-rose-100 text-rose-800"
                                      : "bg-amber-100 text-amber-800"
                                  }`}
                                >
                                  {item.remoteData.status || "agendada"}
                                </span>
                                {remReportText.trim().length > 0 && (
                                  <span className="px-1 py-0.2 text-[9px] bg-blue-100 text-blue-700 font-semibold rounded-sm">
                                    Relat. ({remReportText.length}c)
                                  </span>
                                )}
                                {remAttCount > 0 && (
                                  <span className="px-1 py-0.2 text-[9px] bg-purple-100 text-purple-700 font-semibold rounded-sm">
                                    Presença ({remAttCount})
                                  </span>
                                )}
                              </div>
                              {remReportText ? (
                                <p className="text-[10px] text-zinc-500 truncate max-w-[140px]" title={remReportText}>
                                  {remReportText}
                                </p>
                              ) : (
                                <span className="text-[10px] text-amber-700 italic font-medium">Relatório vazio na nuvem</span>
                              )}
                            </div>
                          );
                        })() : (
                          <span className="text-zinc-400 italic">Não gravado no Supabase</span>
                        )}
                      </td>

                      {/* Resultado / Categoria */}
                      <td className="py-2.5 px-4">
                        <div className="space-y-1">
                          {item.category === "synced" && (
                            <span className="inline-flex items-center text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <Check className="w-3 h-3 mr-1" />
                              🟢 SINCRONIZADO
                            </span>
                          )}
                          {item.category === "pending" && (
                            <span className="inline-flex items-center text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">
                              <Clock className="w-3 h-3 mr-1 text-amber-600" />
                              🟠 RECUPERAÇÃO DISPONÍVEL
                            </span>
                          )}
                          {item.category === "conflict" && (
                            <span className="inline-flex items-center text-rose-800 font-bold bg-rose-100 px-2 py-0.5 rounded-md border border-rose-300">
                              <AlertTriangle className="w-3 h-3 mr-1 text-rose-600" />
                              🔴 CONFLITO
                            </span>
                          )}
                          {item.category === "local_only" && (
                            <span className="inline-flex items-center text-zinc-700 font-semibold bg-zinc-100 px-2 py-0.5 rounded-md border border-zinc-200">
                              <Laptop className="w-3 h-3 mr-1 text-zinc-500" />
                              ⚪ SOMENTE LOCAL
                            </span>
                          )}
                          {item.category === "remote_only" && (
                            <span className="inline-flex items-center text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                              <Database className="w-3 h-3 mr-1 text-blue-500" />
                              🔵 SOMENTE SUPABASE
                            </span>
                          )}
                          {item.category === "manual_check" && (
                            <span className="inline-flex items-center text-amber-900 font-bold bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">
                              <AlertCircle className="w-3 h-3 mr-1 text-amber-700" />
                              ⚠️ CONFERÊNCIA NECESSÁRIA
                            </span>
                          )}

                          {item.diffSummary.length > 0 && (
                            <ul className="text-[10px] text-zinc-500 list-disc list-inside space-y-0.5">
                              {item.diffSummary.map((diff, idx) => (
                                <li key={idx}>{diff}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => setInspectingItem(item)}
                            className="p-1.5 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60 rounded-md transition-colors"
                            title="Inspecionar detalhes lado a lado"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {item.category === "local_only" && (
                            (() => {
                              const canRecoverItem = isSuperAdmin || (isTeacher && currentUserTeacherId && item.teacher_id === currentUserTeacherId);
                              return (
                                <button
                                  onClick={() => handleStartRecoveryInspection(item.class_id)}
                                  disabled={isRecovering || isExecutingRecovery || !canRecoverItem}
                                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors shadow-2xs whitespace-nowrap inline-flex items-center space-x-1 ${
                                    canRecoverItem
                                      ? "text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
                                      : "text-zinc-400 bg-zinc-100 cursor-not-allowed border border-zinc-200"
                                  }`}
                                  title={
                                    canRecoverItem
                                      ? "Recuperar esta aula e gravar no Supabase após verificação segura"
                                      : "Acesso restrito: você só pode recuperar suas próprias aulas"
                                  }
                                >
                                  {canRecoverItem ? (
                                    <>
                                      <UploadCloud className="w-3 h-3 mr-1" />
                                      <span>Recuperar aula</span>
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="w-3 h-3 mr-1" />
                                      <span>Acesso Restrito</span>
                                    </>
                                  )}
                                </button>
                              );
                            })()
                          )}

                          {(item.category === "pending" || item.category === "manual_check") && (
                            (() => {
                              const canRecoverItem = isSuperAdmin || (isTeacher && currentUserTeacherId && item.teacher_id === currentUserTeacherId);
                              return (
                                <button
                                  onClick={() => handleStartRecoveryInspection(item.class_id)}
                                  disabled={isRecovering || isExecutingRecovery || !canRecoverItem}
                                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors shadow-2xs whitespace-nowrap inline-flex items-center space-x-1 ${
                                    canRecoverItem
                                      ? "text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
                                      : "text-zinc-400 bg-zinc-100 cursor-not-allowed border border-zinc-200"
                                  }`}
                                  title={
                                    canRecoverItem
                                      ? "Sincronizar esta aula com verificação prévia e pós-confirmação segura"
                                      : "Acesso restrito: você só pode sincronizar suas próprias aulas"
                                  }
                                >
                                  {canRecoverItem ? (
                                    <span>Sincronizar</span>
                                  ) : (
                                    <>
                                      <Lock className="w-3 h-3 mr-1" />
                                      <span>Acesso Restrito</span>
                                    </>
                                  )}
                                </button>
                              );
                            })()
                          )}

                          {item.category === "conflict" && (
                            <button
                              onClick={() => {
                                setConflictItem(item);
                                const locP = parsePackedReport(item.localData?.report);
                                const remP = parsePackedReport(item.remoteData?.report);
                                const cleanLocR = locP.report || (item.localData?.report && !item.localData.report.includes("//") ? item.localData.report : "");
                                const cleanRemR = remP.report || (item.remoteData?.report && !item.remoteData.report.includes("//") ? item.remoteData.report : "");
                                setConflictMergedReport(cleanLocR || cleanRemR || "");
                                setConflictMergedVocal(item.localData?.vocal_routine || locP.vocal_routine || item.remoteData?.vocal_routine || remP.vocal_routine || "");
                              }}
                              className="px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors whitespace-nowrap"
                            >
                              Resolver Conflito
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div id="class-audit-modal-footer" className="px-6 py-3 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between text-xs text-zinc-500 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Nenhuma exclusão ou sobrescrita nula é permitida pelo motor de recuperação.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 font-semibold text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-100 rounded-xl transition-colors"
          >
            Fechar
          </button>
        </div>
      </motion.div>

      {/* Dedicated Safe Recovery Confirmation Modal */}
      <AnimatePresence>
        {recoveryClassId && (
          <div className="fixed inset-0 z-70 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-zinc-200"
            >
              {/* Header */}
              <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50 flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    {isInspectingRecovery ? (
                      <h3 className="font-bold text-zinc-900 text-sm">Verificando dados no Supabase...</h3>
                    ) : !recoveryInspection?.isAuthorized ? (
                      <>
                        <Lock className="w-4 h-4 text-rose-600" />
                        <h3 className="font-bold text-rose-800 text-sm">🔒 Acesso Não Autorizado</h3>
                      </>
                    ) : recoveryInspection?.existsInSupabase ? (
                      <>
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                        <h3 className="font-bold text-amber-900 text-sm">⚠️ REGISTRO EXISTE NO SUPABASE</h3>
                      </>
                    ) : recoveryInspection?.possibleDuplicates && recoveryInspection.possibleDuplicates.length > 0 ? (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-600" />
                        <h3 className="font-bold text-amber-900 text-sm">⚠️ POSSÍVEL DUPLICIDADE DETECTADA</h3>
                      </>
                    ) : (
                      <>
                        <Laptop className="w-4 h-4 text-zinc-700" />
                        <h3 className="font-bold text-zinc-900 text-sm">⚪ AULA SOMENTE LOCAL</h3>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {isInspectingRecovery
                      ? "Executando consulta SELECT somente leitura sem mutação..."
                      : !recoveryInspection?.isAuthorized
                      ? "Operação bloqueada pelas regras de escopo por professor."
                      : recoveryInspection?.existsInSupabase
                      ? "O ID desta aula já foi encontrado no banco de dados."
                      : recoveryInspection?.possibleDuplicates && recoveryInspection.possibleDuplicates.length > 0
                      ? "Outra aula com mesmo professor e horário foi encontrada no Supabase."
                      : "Esta aula existe apenas neste dispositivo e não foi encontrada no Supabase."}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (!isExecutingRecovery) {
                      setRecoveryClassId(null);
                      setRecoveryInspection(null);
                      setRecoveryError(null);
                    }
                  }}
                  disabled={isExecutingRecovery}
                  className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg disabled:opacity-40"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4 text-xs max-h-[72vh] overflow-y-auto">
                {isInspectingRecovery && (
                  <div className="py-8 flex flex-col items-center justify-center space-y-3 text-zinc-500">
                    <RefreshCcw className="w-7 h-7 text-indigo-600 animate-spin" />
                    <p className="text-xs font-medium">Executando consulta de diagnóstico no Supabase (SELECT)...</p>
                  </div>
                )}

                {!isInspectingRecovery && recoveryInspection && (
                  <>
                    {/* Unauthorized Case */}
                    {!recoveryInspection.isAuthorized && (
                      <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 space-y-2">
                        <span className="font-bold block">Bloqueio de Segurança:</span>
                        <p>{recoveryInspection.authMessage || "Você só possui autorização para recuperar e sincronizar aulas vinculadas ao seu próprio cadastro de professor."}</p>
                      </div>
                    )}

                    {/* Case A: Already exists in Supabase */}
                    {recoveryInspection.isAuthorized && recoveryInspection.existsInSupabase && (
                      <div className="space-y-3">
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                          <span className="font-bold block mb-1">Registro já cadastrado no Supabase</span>
                          <p>O ID desta aula já existe remotamente. Compare as versões antes de confirmar a atualização:</p>
                        </div>

                        <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-zinc-50 text-zinc-600 font-semibold border-b border-zinc-200">
                              <tr>
                                <th className="p-2.5">Campo</th>
                                <th className="p-2.5">Versão Local</th>
                                <th className="p-2.5">Versão Supabase</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                              <tr>
                                <td className="p-2.5 font-semibold text-zinc-600">Data</td>
                                <td className="p-2.5 font-bold text-zinc-900">{recoveryInspection.localData.date ? recoveryInspection.localData.date.split('-').reverse().join('/') : '-'}</td>
                                <td className="p-2.5 text-zinc-700">{recoveryInspection.remoteClass?.date ? recoveryInspection.remoteClass.date.split('-').reverse().join('/') : '-'}</td>
                              </tr>
                              <tr>
                                <td className="p-2.5 font-semibold text-zinc-600">Horário</td>
                                <td className="p-2.5 font-bold text-zinc-900">{recoveryInspection.localData.start_time?.slice(0, 5)} - {recoveryInspection.localData.end_time?.slice(0, 5)}</td>
                                <td className="p-2.5 text-zinc-700">{recoveryInspection.remoteClass?.start_time?.slice(0, 5)} - {recoveryInspection.remoteClass?.end_time?.slice(0, 5)}</td>
                              </tr>
                              <tr>
                                <td className="p-2.5 font-semibold text-zinc-600">Professor</td>
                                <td className="p-2.5 font-bold text-zinc-900">{recoveryInspection.localData.teacher_name || recoveryInspection.localData.teacher_id}</td>
                                <td className="p-2.5 text-zinc-700">{recoveryInspection.remoteClass?.teacher_name || recoveryInspection.remoteClass?.teacher_id}</td>
                              </tr>
                              <tr>
                                <td className="p-2.5 font-semibold text-zinc-600">Alunos</td>
                                <td className="p-2.5 font-bold text-zinc-900">{recoveryInspection.localData.student_names || recoveryInspection.localData.title}</td>
                                <td className="p-2.5 text-zinc-700">{recoveryInspection.remoteClass?.student_names || recoveryInspection.remoteClass?.title}</td>
                              </tr>
                              <tr>
                                <td className="p-2.5 font-semibold text-zinc-600">Status</td>
                                <td className="p-2.5 font-bold text-zinc-900 uppercase">{recoveryInspection.localData.status}</td>
                                <td className="p-2.5 text-zinc-700 uppercase">{recoveryInspection.remoteClass?.status}</td>
                              </tr>
                              {(() => {
                                const recLocParsed = parsePackedReport(recoveryInspection.localData?.report);
                                const recLocReport = recLocParsed.report || (recoveryInspection.localData?.report && !recoveryInspection.localData.report.includes("//") ? recoveryInspection.localData.report : "");
                                const recLocVocal = recoveryInspection.localData?.vocal_routine || recLocParsed.vocal_routine;
                                const recLocAtt = (recoveryInspection.localData?.attendance && Object.keys(recoveryInspection.localData.attendance).length > 0) ? recoveryInspection.localData.attendance : recLocParsed.attendance;

                                const recRemParsed = parsePackedReport(recoveryInspection.remoteClass?.report);
                                const recRemReport = recRemParsed.report || (recoveryInspection.remoteClass?.report && !recoveryInspection.remoteClass.report.includes("//") ? recoveryInspection.remoteClass.report : "");
                                const recRemVocal = recoveryInspection.remoteClass?.vocal_routine || recRemParsed.vocal_routine;
                                const recRemAtt = (recoveryInspection.remoteClass?.attendance && Object.keys(recoveryInspection.remoteClass.attendance).length > 0) ? recoveryInspection.remoteClass.attendance : recRemParsed.attendance;

                                return (
                                  <>
                                    <tr>
                                      <td className="p-2.5 font-semibold text-zinc-600">Relatório Pedagógico</td>
                                      <td className="p-2.5 text-zinc-900 max-w-[200px] truncate" title={recLocReport}>
                                        {recLocReport || <span className="italic text-zinc-400">Vazio</span>}
                                      </td>
                                      <td className="p-2.5 text-zinc-700 max-w-[200px] truncate" title={recRemReport}>
                                        {recRemReport || <span className="italic text-zinc-400">Vazio</span>}
                                      </td>
                                    </tr>
                                    {(recLocVocal || recRemVocal) && (
                                      <tr>
                                        <td className="p-2.5 font-semibold text-zinc-600">Conduta / Rotina Vocal</td>
                                        <td className="p-2.5 text-zinc-900 max-w-[200px] truncate" title={recLocVocal}>
                                          {recLocVocal || <span className="italic text-zinc-400">Vazio</span>}
                                        </td>
                                        <td className="p-2.5 text-zinc-700 max-w-[200px] truncate" title={recRemVocal}>
                                          {recRemVocal || <span className="italic text-zinc-400">Vazio</span>}
                                        </td>
                                      </tr>
                                    )}
                                    {(Object.keys(recLocAtt || {}).length > 0 || Object.keys(recRemAtt || {}).length > 0) && (
                                      <tr>
                                        <td className="p-2.5 font-semibold text-zinc-600">Presença</td>
                                        <td className="p-2.5">
                                          {Object.keys(recLocAtt || {}).length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                              {Object.entries(recLocAtt).map(([sid, val]) => {
                                                const sName = state.students.find(s => s.id === sid)?.name?.split(' ')[0] || sid.slice(0, 6);
                                                return (
                                                  <span key={sid} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${val === 'present' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}>
                                                    {sName}: {val === 'present' ? 'Presente' : 'Falta'}
                                                  </span>
                                                );
                                              })}
                                            </div>
                                          ) : (
                                            <span className="italic text-zinc-400">Sem chamada</span>
                                          )}
                                        </td>
                                        <td className="p-2.5">
                                          {Object.keys(recRemAtt || {}).length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                              {Object.entries(recRemAtt).map(([sid, val]) => {
                                                const sName = state.students.find(s => s.id === sid)?.name?.split(' ')[0] || sid.slice(0, 6);
                                                return (
                                                  <span key={sid} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${val === 'present' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'}`}>
                                                    {sName}: {val === 'present' ? 'Presente' : 'Falta'}
                                                  </span>
                                                );
                                              })}
                                            </div>
                                          ) : (
                                            <span className="italic text-zinc-400">Sem chamada</span>
                                          )}
                                        </td>
                                      </tr>
                                    )}
                                  </>
                                );
                              })()}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Case Special: Possible Duplicate found */}
                    {recoveryInspection.isAuthorized && !recoveryInspection.existsInSupabase && recoveryInspection.possibleDuplicates.length > 0 && (
                      <div className="space-y-3">
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                          <span className="font-bold block mb-1">Aviso de Possível Duplicidade</span>
                          <p>O ID não existe no Supabase, mas foi encontrada outra aula com mesmo professor e horário/data:</p>
                        </div>

                        {recoveryInspection.possibleDuplicates.map((dup, idx) => (
                          <div key={idx} className="p-3 bg-white border border-amber-300 rounded-xl space-y-1">
                            <div className="flex items-center justify-between text-zinc-800 font-semibold">
                              <span>Aula no Supabase: {dup.title || dup.student_names || 'Aula'}</span>
                              <span className="font-mono text-[10px] text-zinc-500">ID: {dup.id.slice(0, 8)}...</span>
                            </div>
                            <div className="text-zinc-600 text-[11px] grid grid-cols-2 gap-1">
                              <span>Data: {dup.date.split('-').reverse().join('/')}</span>
                              <span>Horário: {dup.start_time?.slice(0, 5)} - {dup.end_time?.slice(0, 5)}</span>
                              <span>Professor: {dup.teacher_name || dup.teacher_id}</span>
                              <span>Alunos: {dup.student_names}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Case B: Somente Local (Clean Insertion) */}
                    {recoveryInspection.isAuthorized && !recoveryInspection.existsInSupabase && recoveryInspection.possibleDuplicates.length === 0 && (
                      <div className="space-y-3">
                        <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-indigo-950">
                          <p className="font-medium">Esta aula existe somente neste dispositivo e ainda não foi encontrada no Supabase.</p>
                        </div>

                        {/* Structured Details Card */}
                        <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white rounded-lg border border-zinc-200">
                            <div>
                              <span className="text-[10px] text-zinc-500 font-semibold uppercase block">Professor:</span>
                              <span className="font-bold text-zinc-900 text-xs">{recoveryInspection.localData.teacher_name || recoveryInspection.localData.teacher_id}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-zinc-500 font-semibold uppercase block">Aluno / Grupo:</span>
                              <span className="font-bold text-zinc-900 text-xs">{recoveryInspection.localData.student_names || recoveryInspection.localData.title || "-"}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-zinc-500 font-semibold uppercase block">Data:</span>
                              <span className="font-bold text-zinc-900 text-xs">
                                {recoveryInspection.localData.date ? recoveryInspection.localData.date.split('-').reverse().join('/') : '-'}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-zinc-500 font-semibold uppercase block">Horário:</span>
                              <span className="font-bold text-zinc-900 text-xs">
                                {recoveryInspection.localData.start_time?.slice(0, 5)} - {recoveryInspection.localData.end_time?.slice(0, 5)}
                              </span>
                            </div>
                            {(isSuperAdmin || isAdmin) && (
                              <div className="sm:col-span-2">
                                <span className="text-[10px] text-zinc-500 font-semibold uppercase block">Class ID (UUID Completo):</span>
                                <div className="flex items-center space-x-2 mt-0.5">
                                  <span className="font-mono text-[11px] font-bold text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200 select-all">
                                    {recoveryInspection.localData.id}
                                  </span>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(recoveryInspection.localData.id);
                                      setFeedbackMessage({ type: "info", text: `UUID copiado com sucesso!` });
                                    }}
                                    className="p-1 text-zinc-500 hover:text-zinc-800 rounded transition-colors text-[10px] inline-flex items-center space-x-1"
                                    title="Copiar UUID Completo"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copiar</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          <div>
                            <span className="text-[10px] text-zinc-500 font-semibold uppercase block mb-1">Status Local:</span>
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase inline-block ${
                              recoveryInspection.localData.status === "completed"
                                ? "bg-emerald-100 text-emerald-800"
                                : recoveryInspection.localData.status === "cancelled"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
                            }`}>
                              {recoveryInspection.localData.status || "agendada"}
                            </span>
                          </div>

                          {(() => {
                            const recLocP = parsePackedReport(recoveryInspection.localData.report);
                            const cleanReport = recLocP.report || (recoveryInspection.localData.report && !recoveryInspection.localData.report.includes("//") ? recoveryInspection.localData.report : "");
                            const cleanVocal = recoveryInspection.localData.vocal_routine || recLocP.vocal_routine;
                            const cleanAtt = (recoveryInspection.localData.attendance && Object.keys(recoveryInspection.localData.attendance).length > 0) ? recoveryInspection.localData.attendance : recLocP.attendance;

                            return (
                              <>
                                {cleanReport && (
                                  <div>
                                    <span className="text-[10px] text-zinc-500 font-semibold uppercase block mb-1">Relatório Pedagógico Local:</span>
                                    <p className="p-2.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 whitespace-pre-wrap max-h-28 overflow-y-auto">
                                      {cleanReport}
                                    </p>
                                  </div>
                                )}

                                {cleanVocal && (
                                  <div>
                                    <span className="text-[10px] text-zinc-500 font-semibold uppercase block mb-1">Conduta / Rotina Vocal Local:</span>
                                    <p className="p-2.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 whitespace-pre-wrap max-h-20 overflow-y-auto">
                                      {cleanVocal}
                                    </p>
                                  </div>
                                )}

                                {cleanAtt && Object.keys(cleanAtt).length > 0 && (
                                  <div>
                                    <span className="text-[10px] text-zinc-500 font-semibold uppercase block mb-1">Frequência Local:</span>
                                    <div className="p-2 bg-white border border-zinc-200 rounded-lg flex flex-wrap gap-1.5">
                                      {Object.entries(cleanAtt).map(([sid, val]) => {
                                        const st = state.students.find(s => s.id === sid);
                                        const name = st?.name?.split(' ')[0] || sid.slice(0, 8);
                                        return (
                                          <span
                                            key={sid}
                                            className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border ${
                                              val === 'present'
                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                : 'bg-rose-50 text-rose-800 border-rose-200'
                                            }`}
                                          >
                                            {name}: {val === 'present' ? 'Presente' : 'Falta'}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>

                        {/* Missing required fields warning */}
                        {recoveryInspection.missingFields.length > 0 && (
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1">
                            <span className="font-bold block">⚠️ Não foi possível recuperar automaticamente:</span>
                            <p>Existem campos obrigatórios ausentes: <strong>{recoveryInspection.missingFields.join(", ")}</strong>.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Error display */}
                    {recoveryError && (
                      <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 space-y-1">
                        <span className="font-bold flex items-center space-x-1.5">
                          <AlertCircle className="w-4 h-4 text-rose-600" />
                          <span>Falha na gravação remota:</span>
                        </span>
                        <p>{recoveryError}</p>
                        <p className="text-[11px] text-rose-700 font-medium pt-1">
                          Os dados permanecem 100% preservados neste dispositivo e nenhuma pendência foi removida indevidamente.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t bg-zinc-50 flex items-center justify-between flex-shrink-0">
                <div className="flex items-center space-x-2 text-[11px] text-zinc-500">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Confirmação pós-gravação obrigatória</span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      setRecoveryClassId(null);
                      setRecoveryInspection(null);
                      setRecoveryError(null);
                    }}
                    disabled={isExecutingRecovery}
                    className="px-4 py-1.5 text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-100 rounded-xl transition-colors disabled:opacity-40"
                  >
                    Cancelar
                  </button>

                  {!isInspectingRecovery && recoveryInspection?.isAuthorized && (
                    <button
                      onClick={() => handleConfirmRecovery(recoveryInspection.class_id)}
                      disabled={isExecutingRecovery || recoveryInspection.missingFields.length > 0}
                      className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-xs disabled:opacity-50 inline-flex items-center space-x-1.5"
                    >
                      {isExecutingRecovery ? (
                        <>
                          <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                          <span>Gravando e confirmando...</span>
                        </>
                      ) : recoveryInspection.existsInSupabase ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Atualizar esta aula no Supabase</span>
                        </>
                      ) : (
                        <>
                          <UploadCloud className="w-3.5 h-3.5" />
                          <span>Recuperar aula no Supabase</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Side-by-side Inspection Modal */}
      <AnimatePresence>
        {inspectingItem && (
          <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden border border-zinc-200"
            >
              <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50 flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-zinc-900 text-sm">
                      Inspeção Lado a Lado: {inspectingItem.title || inspectingItem.student_names || 'Aula'}
                    </h3>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase ${
                      inspectingItem.category === 'synced' ? 'bg-emerald-100 text-emerald-800' :
                      inspectingItem.category === 'manual_check' ? 'bg-amber-100 text-amber-900' :
                      inspectingItem.category === 'pending' ? 'bg-amber-100 text-amber-800' :
                      inspectingItem.category === 'conflict' ? 'bg-rose-100 text-rose-800' : 'bg-zinc-100 text-zinc-800'
                    }`}>
                      {inspectingItem.category === 'manual_check' ? '⚠️ Conferência Necessária' : inspectingItem.category}
                    </span>
                  </div>
                  {(isSuperAdmin || isAdmin) && (
                    <div className="flex items-center space-x-2 mt-0.5">
                      <p className="text-xs text-zinc-500 font-mono">ID: {inspectingItem.class_id}</p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(inspectingItem.class_id);
                          setFeedbackMessage({ type: "info", text: `UUID ${inspectingItem.class_id} copiado!` });
                        }}
                        className="p-1 text-zinc-400 hover:text-zinc-700 rounded transition-colors text-[10px] inline-flex items-center space-x-1"
                        title="Copiar UUID"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copiar UUID</span>
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setInspectingItem(null)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-700 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {(() => {
                const locParsed = parsePackedReport(inspectingItem.localData?.report);
                const locReport = locParsed.report || (inspectingItem.localData?.report && !inspectingItem.localData.report.includes("//") ? inspectingItem.localData.report : "");
                const locVocal = inspectingItem.localData?.vocal_routine || locParsed.vocal_routine;
                const locAtt = (inspectingItem.localData?.attendance && Object.keys(inspectingItem.localData.attendance).length > 0) ? inspectingItem.localData.attendance : locParsed.attendance;

                const remParsed = parsePackedReport(inspectingItem.remoteData?.report);
                const remReport = remParsed.report || (inspectingItem.remoteData?.report && !inspectingItem.remoteData.report.includes("//") ? inspectingItem.remoteData.report : "");
                const remVocal = inspectingItem.remoteData?.vocal_routine || remParsed.vocal_routine;
                const remAtt = (inspectingItem.remoteData?.attendance && Object.keys(inspectingItem.remoteData.attendance).length > 0) ? inspectingItem.remoteData.attendance : remParsed.attendance;

                return (
                  <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Local Column */}
                      <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3">
                        <div className="flex items-center space-x-2 text-indigo-700 font-bold border-b pb-2">
                          <Laptop className="w-4 h-4" />
                          <span>Versão Local (Navegador do Professor)</span>
                        </div>
                        {inspectingItem.localData ? (
                          <div className="space-y-2.5">
                            <div className="grid grid-cols-2 gap-2 p-2 bg-white rounded-lg border border-zinc-200">
                              <div>
                                <span className="font-semibold text-zinc-500 block text-[10px]">Data Local:</span>
                                <span className="font-bold text-zinc-900">{inspectingItem.localData.date ? inspectingItem.localData.date.split('-').reverse().join('/') : '-'}</span>
                              </div>
                              <div>
                                <span className="font-semibold text-zinc-500 block text-[10px]">Horário Local:</span>
                                <span className="font-bold text-zinc-900">{inspectingItem.localData.start_time?.slice(0, 5)} - {inspectingItem.localData.end_time?.slice(0, 5)}</span>
                              </div>
                              <div>
                                <span className="font-semibold text-zinc-500 block text-[10px]">Status Local:</span>
                                <span className="font-bold text-zinc-900">{inspectingItem.localData.status || "agendada"}</span>
                              </div>
                              <div>
                                <span className="font-semibold text-zinc-500 block text-[10px]">Alunos:</span>
                                <span className="font-bold text-zinc-900 truncate block">{inspectingItem.student_names || inspectingItem.title || '-'}</span>
                              </div>
                            </div>

                            <div>
                              <span className="font-semibold text-zinc-600 block mb-1">Relatório Pedagógico:</span>
                              <p className="p-2.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 whitespace-pre-wrap max-h-36 overflow-y-auto">
                                {locReport || <span className="italic text-zinc-400">Vazio</span>}
                              </p>
                            </div>

                            {locVocal && (
                              <div>
                                <span className="font-semibold text-zinc-600 block mb-1">Conduta / Rotina Vocal:</span>
                                <p className="p-2.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 whitespace-pre-wrap max-h-24 overflow-y-auto">
                                  {locVocal}
                                </p>
                              </div>
                            )}

                            <div>
                              <span className="font-semibold text-zinc-600 block mb-1">Frequência / Presença:</span>
                              {locAtt && Object.keys(locAtt).length > 0 ? (
                                <div className="p-2 bg-white border border-zinc-200 rounded-lg flex flex-wrap gap-1.5">
                                  {Object.entries(locAtt).map(([sid, val]) => {
                                    const st = state.students.find(s => s.id === sid);
                                    const name = st?.name?.split(' ')[0] || sid.slice(0, 8);
                                    return (
                                      <span
                                        key={sid}
                                        className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border ${
                                          val === 'present'
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                            : 'bg-rose-50 text-rose-800 border-rose-200'
                                        }`}
                                      >
                                        {name}: {val === 'present' ? 'Presente' : 'Falta'}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="p-2 bg-white border border-zinc-200 rounded-lg text-zinc-400 italic text-[11px]">
                                  Sem registro de presença
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-zinc-400 italic">Não disponível localmente.</p>
                        )}
                      </div>

                      {/* Remote Column */}
                      <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-3">
                        <div className="flex items-center space-x-2 text-emerald-700 font-bold border-b pb-2">
                          <Database className="w-4 h-4" />
                          <span>Versão Remota (Supabase / Nuvem)</span>
                        </div>
                        {inspectingItem.remoteData ? (
                          <div className="space-y-2.5">
                            <div className="grid grid-cols-2 gap-2 p-2 bg-white rounded-lg border border-zinc-200">
                              <div>
                                <span className="font-semibold text-zinc-500 block text-[10px]">Data Supabase:</span>
                                <span className="font-bold text-zinc-900">{inspectingItem.remoteData.date ? inspectingItem.remoteData.date.split('-').reverse().join('/') : '-'}</span>
                              </div>
                              <div>
                                <span className="font-semibold text-zinc-500 block text-[10px]">Horário Supabase:</span>
                                <span className="font-bold text-zinc-900">{inspectingItem.remoteData.start_time?.slice(0, 5)} - {inspectingItem.remoteData.end_time?.slice(0, 5)}</span>
                              </div>
                              <div>
                                <span className="font-semibold text-zinc-500 block text-[10px]">Status Supabase:</span>
                                <span className="font-bold text-zinc-900">{inspectingItem.remoteData.status || "agendada"}</span>
                              </div>
                              <div>
                                <span className="font-semibold text-zinc-500 block text-[10px]">Alunos:</span>
                                <span className="font-bold text-zinc-900 truncate block">{inspectingItem.student_names || inspectingItem.title || '-'}</span>
                              </div>
                            </div>

                            <div>
                              <span className="font-semibold text-zinc-600 block mb-1">Relatório Pedagógico:</span>
                              <p className="p-2.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 whitespace-pre-wrap max-h-36 overflow-y-auto">
                                {remReport || <span className="italic text-zinc-400">Vazio no Supabase</span>}
                              </p>
                            </div>

                            {remVocal && (
                              <div>
                                <span className="font-semibold text-zinc-600 block mb-1">Conduta / Rotina Vocal:</span>
                                <p className="p-2.5 bg-white border border-zinc-200 rounded-lg text-zinc-800 whitespace-pre-wrap max-h-24 overflow-y-auto">
                                  {remVocal}
                                </p>
                              </div>
                            )}

                            <div>
                              <span className="font-semibold text-zinc-600 block mb-1">Frequência / Presença:</span>
                              {remAtt && Object.keys(remAtt).length > 0 ? (
                                <div className="p-2 bg-white border border-zinc-200 rounded-lg flex flex-wrap gap-1.5">
                                  {Object.entries(remAtt).map(([sid, val]) => {
                                    const st = state.students.find(s => s.id === sid);
                                    const name = st?.name?.split(' ')[0] || sid.slice(0, 8);
                                    return (
                                      <span
                                        key={sid}
                                        className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border ${
                                          val === 'present'
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                            : 'bg-rose-50 text-rose-800 border-rose-200'
                                        }`}
                                      >
                                        {name}: {val === 'present' ? 'Presente' : 'Falta'}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="p-2 bg-white border border-zinc-200 rounded-lg text-zinc-400 italic text-[11px]">
                                  Sem registro de presença no Supabase
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-zinc-400 italic">Não cadastrado no Supabase.</p>
                        )}
                      </div>
                    </div>

                    {/* Admin Diagnostic Section: Collapsible */}
                    {(isSuperAdmin || isAdmin) && (
                      <details className="mt-4 p-3 bg-zinc-100 rounded-xl border border-zinc-200 text-xs text-zinc-600">
                        <summary className="cursor-pointer font-bold text-zinc-700 select-none hover:text-zinc-900">
                          🔍 Dados brutos (DB / JSON) — Somente Administradores
                        </summary>
                        <div className="mt-2 space-y-2 pt-2 border-t border-zinc-200 font-mono text-[10px]">
                          <div>
                            <span className="font-bold text-zinc-700 block">Class ID:</span>
                            <span className="text-zinc-600 select-all">{inspectingItem.class_id}</span>
                          </div>
                          <div>
                            <span className="font-bold text-zinc-700 block">Report Bruto Supabase:</span>
                            <pre className="p-2 bg-white rounded border border-zinc-300 text-zinc-800 whitespace-pre-wrap">
                              {inspectingItem.remoteData?.report || "null / vazio"}
                            </pre>
                          </div>
                          {inspectingItem.localData?.report && inspectingItem.localData.report !== locReport && (
                            <div>
                              <span className="font-bold text-zinc-700 block">Report Bruto Local:</span>
                              <pre className="p-2 bg-white rounded border border-zinc-300 text-zinc-800 whitespace-pre-wrap">
                                {inspectingItem.localData.report}
                              </pre>
                            </div>
                          )}
                          {remAtt && Object.keys(remAtt).length > 0 && (
                            <div>
                              <span className="font-bold text-zinc-700 block">Attendance Supabase (JSON):</span>
                              <pre className="p-2 bg-white rounded border border-zinc-300 text-zinc-800 whitespace-pre-wrap">
                                {JSON.stringify(remAtt, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })()}

              {inspectingItem.diffSummary.length > 0 && (
                <div className="px-6 py-2.5 bg-amber-50 border-t border-b border-amber-200 text-xs">
                  <span className="font-bold text-amber-900 block mb-1">Diferenças Detectadas pelo Motor de Auditoria:</span>
                  <ul className="list-disc list-inside text-amber-800 space-y-0.5">
                    {inspectingItem.diffSummary.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="px-6 py-3 border-t bg-zinc-50 flex items-center justify-end space-x-2">
                {inspectingItem.category === "local_only" && (
                  <button
                    onClick={() => {
                      const cid = inspectingItem.class_id;
                      setInspectingItem(null);
                      handleStartRecoveryInspection(cid);
                    }}
                    disabled={isRecovering || isExecutingRecovery}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-xs inline-flex items-center space-x-1.5"
                    title="Recuperar aula com verificação prévia e confirmação segura"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Recuperar aula no Supabase</span>
                  </button>
                )}

                {(inspectingItem.category === "pending" || inspectingItem.category === "manual_check") && (
                  <button
                    onClick={() => {
                      const cid = inspectingItem.class_id;
                      setInspectingItem(null);
                      handleStartRecoveryInspection(cid);
                    }}
                    disabled={isRecovering || isExecutingRecovery}
                    className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-colors shadow-xs"
                    title="Sincronizar com verificação prévia e pós-confirmação"
                  >
                    Sincronizar para o Supabase (Modo Seguro)
                  </button>
                )}
                <button
                  onClick={() => setInspectingItem(null)}
                  className="px-4 py-1.5 text-xs font-semibold text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-100 rounded-xl transition-colors"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Conflict Resolution Modal */}
      <AnimatePresence>
        {conflictItem && (
          <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-zinc-200"
            >
              <div className="px-6 py-4 border-b border-rose-100 bg-rose-50 flex items-center justify-between">
                <div className="flex items-center space-x-2 text-rose-800">
                  <AlertTriangle className="w-5 h-5" />
                  <h3 className="font-bold text-sm">Resolução de Conflito de Dados</h3>
                </div>
                <button onClick={() => setConflictItem(null)} className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 space-y-4 text-xs">
                <p className="text-zinc-600">
                  Tanto o navegador local quanto o Supabase possuem relatórios distintos preenchidos para esta aula. Escolha como deseja resolver:
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="font-bold text-zinc-800 block mb-1">Relatório Consolidado (Editar para mesclar):</label>
                    <textarea
                      rows={4}
                      value={conflictMergedReport}
                      onChange={e => setConflictMergedReport(e.target.value)}
                      className="w-full p-2.5 bg-zinc-50 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-zinc-800 block mb-1">Conduta Vocal Consolidada:</label>
                    <textarea
                      rows={2}
                      value={conflictMergedVocal}
                      onChange={e => setConflictMergedVocal(e.target.value)}
                      className="w-full p-2.5 bg-zinc-50 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                  <button
                    onClick={() => handleResolveConflict("use_local")}
                    disabled={isRecovering}
                    className="p-2.5 bg-indigo-50 border border-indigo-200 text-indigo-800 hover:bg-indigo-100 rounded-xl font-bold text-center transition-colors"
                  >
                    Manter Versão Local (Enviar ao Supabase)
                  </button>

                  <button
                    onClick={() => handleResolveConflict("use_remote")}
                    disabled={isRecovering}
                    className="p-2.5 bg-zinc-100 border border-zinc-300 text-zinc-800 hover:bg-zinc-200 rounded-xl font-bold text-center transition-colors"
                  >
                    Manter Versão do Supabase (Adotar Local)
                  </button>

                  <button
                    onClick={() => handleResolveConflict("merge")}
                    disabled={isRecovering}
                    className="p-2.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl font-bold text-center transition-colors shadow-xs"
                  >
                    Salvar Versão Mesclada
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
