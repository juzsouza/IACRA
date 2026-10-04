import React, { useState, useMemo } from 'react';
import { useAppStore, Credit } from '../store';
import {
  X,
  CreditCard,
  CheckCircle,
  Clock,
  Ban,
  Search,
  RefreshCw,
  Info,
  Calendar,
  User,
  Users,
  ShieldCheck,
  DollarSign,
  AlertCircle
} from 'lucide-react';
import { RAPHAEL_TEACHER_ID } from '../utils/raphaelBillingSimulation';

interface RaphaelCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RaphaelCreditsModal: React.FC<RaphaelCreditsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { state, reconcileRaphaelCredits, updateCredit } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'used' | 'cancelled'>('available');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [isReconciling, setIsReconciling] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleReconcile = async () => {
    setIsReconciling(true);
    setActionError(null);
    try {
      await reconcileRaphaelCredits();
    } finally {
      setTimeout(() => {
        setIsReconciling(false);
      }, 500);
    }
  };

  const handleToggleStatus = async (creditId: string, targetStatus: 'available' | 'used') => {
    setActionLoadingId(creditId);
    setActionError(null);
    try {
      const res = await updateCredit(creditId, { status: targetStatus });
      if (res && !res.success) {
        setActionError(`Erro ao salvar no banco de dados: ${res.error || 'Falha de persistência'}`);
      }
    } catch (err: any) {
      setActionError(`Erro inesperado: ${err?.message || 'Falha de comunicação'}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filter credits for Raphael
  const creditsList = useMemo(() => {
    const list = state.credits || [];
    return list.filter((c) => {
      // Must belong to Raphael
      if (c.teacher_id && c.teacher_id !== RAPHAEL_TEACHER_ID) {
        return false;
      }
      return true;
    });
  }, [state.credits]);

  // Unique months available
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    creditsList.forEach((c) => {
      if (c.competency_month) months.add(c.competency_month);
    });
    return Array.from(months).sort().reverse();
  }, [creditsList]);

  // Enriched credits with student / group and class info
  const enrichedCredits = useMemo(() => {
    return creditsList.map((c) => {
      const student = c.student_id ? state.students.find((s) => s.id === c.student_id) : undefined;
      const group = c.group_id ? state.groups.find((g) => g.id === c.group_id) : undefined;
      const sourceClass = state.classes.find((cl) => cl.id === c.source_class_id);

      const targetName = group ? group.name : student ? student.name : 'Aluno não identificado';
      const isGroup = !!group;

      return {
        ...c,
        targetName,
        isGroup,
        student,
        group,
        sourceClass,
      };
    });
  }, [creditsList, state.students, state.groups, state.classes]);

  // Filtered list based on user controls
  const filteredCredits = useMemo(() => {
    return enrichedCredits.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      if (monthFilter !== 'all' && item.competency_month !== monthFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesName = item.targetName.toLowerCase().includes(query);
        const matchesClassDate = item.sourceClass?.date?.includes(query);
        const matchesNotes = item.notes?.toLowerCase().includes(query);
        if (!matchesName && !matchesClassDate && !matchesNotes) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      const dateA = a.sourceClass?.date || a.competency_month || '';
      const dateB = b.sourceClass?.date || b.competency_month || '';
      return dateB.localeCompare(dateA);
    });
  }, [enrichedCredits, statusFilter, monthFilter, searchTerm]);

  // Summary Metrics
  const summary = useMemo(() => {
    const available = enrichedCredits.filter((c) => c.status === 'available');
    const used = enrichedCredits.filter((c) => c.status === 'used');
    const cancelled = enrichedCredits.filter((c) => c.status === 'cancelled');

    const totalAvailableAmount = available.reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalUsedAmount = used.reduce((sum, c) => sum + (c.amount || 0), 0);

    const distinctStudents = new Set<string>();
    available.forEach((c) => {
      if (c.student_id) distinctStudents.add(c.student_id);
      if (c.group_id) distinctStudents.add(`group_${c.group_id}`);
    });

    return {
      availableCount: available.length,
      availableAmount: totalAvailableAmount,
      usedCount: used.length,
      usedAmount: totalUsedAmount,
      cancelledCount: cancelled.length,
      distinctCount: distinctStudents.size,
      totalCreditsRecorded: enrichedCredits.length,
    };
  }, [enrichedCredits]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-zinc-100 flex items-start justify-between bg-zinc-50/50">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 flex-shrink-0 mt-0.5">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-zinc-900 tracking-tight">
                  Controle de Créditos por Cancelamento
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                  Professor Raphael
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Etapa 4 — Registro, auditoria e conferência dos créditos financeiros gerados por cancelamentos de aula.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 p-2 rounded-xl hover:bg-zinc-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Action Error Banner */}
          {actionError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800 animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span className="font-semibold">{actionError}</span>
              </div>
              <button
                type="button"
                onClick={() => setActionError(null)}
                className="text-rose-600 hover:text-rose-800 text-xs font-bold underline ml-2"
              >
                Fechar
              </button>
            </div>
          )}

          {/* Safety & Compliance Banner */}
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl flex items-start gap-3.5">
            <ShieldCheck className="w-5 h-5 text-purple-700 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-purple-950 space-y-1">
              <p className="font-bold text-sm">
                🛡️ Modo de Auditoria e Segurança (Etapa 4)
              </p>
              <p className="leading-relaxed text-purple-900">
                Esta tela gerencia com precisão os créditos de aula decorrentes de cancelamentos realizados pelo professor <strong>Raphael Augusto Pinto</strong> (ID: <code className="bg-purple-100/80 px-1 py-0.5 rounded font-mono text-[11px]">{RAPHAEL_TEACHER_ID}</code>).
              </p>
              <p className="font-semibold text-purple-800 pt-0.5">
                • O abatimento automático nas mensalidades permanece <u>DESATIVADO</u> para garantir total segurança e validação prévia.
              </p>
            </div>
          </div>

          {/* Metric Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200/80">
              <div className="flex items-center justify-between text-emerald-800">
                <span className="text-xs font-semibold uppercase tracking-wider">Créditos Disponíveis</span>
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-900 mt-2">
                {summary.availableCount} <span className="text-sm font-normal text-emerald-700">aula(s)</span>
              </div>
              <div className="text-xs font-semibold text-emerald-700 mt-0.5">
                Saldo total: {formatCurrency(summary.availableAmount)}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200/80">
              <div className="flex items-center justify-between text-indigo-800">
                <span className="text-xs font-semibold uppercase tracking-wider">Alunos com Crédito</span>
                <User className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-2xl font-bold text-indigo-900 mt-2">
                {summary.distinctCount} <span className="text-sm font-normal text-indigo-700">aluno(s)/grupo(s)</span>
              </div>
              <div className="text-xs text-indigo-600 mt-0.5">
                Aguardando reposição ou futuro abatimento
              </div>
            </div>

            <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200">
              <div className="flex items-center justify-between text-zinc-700">
                <span className="text-xs font-semibold uppercase tracking-wider">Créditos Utilizados</span>
                <Clock className="w-4 h-4 text-zinc-500" />
              </div>
              <div className="text-2xl font-bold text-zinc-900 mt-2">
                {summary.usedCount} <span className="text-sm font-normal text-zinc-500">aula(s)</span>
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Total compensado: {formatCurrency(summary.usedAmount)}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-purple-50/50 border border-purple-200/60">
              <div className="flex items-center justify-between text-purple-800">
                <span className="text-xs font-semibold uppercase tracking-wider">Total Registrado</span>
                <DollarSign className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-2xl font-bold text-purple-950 mt-2">
                {summary.totalCreditsRecorded} <span className="text-sm font-normal text-purple-700">registros</span>
              </div>
              <div className="text-xs text-purple-700 mt-0.5">
                Histórico auditável e sincronizado
              </div>
            </div>
          </div>

          {/* Filter Bar & Reconcile Button */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-zinc-50 p-3 rounded-xl border border-zinc-200">
            <div className="flex-1 relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar por aluno, grupo ou data..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium text-zinc-700"
              >
                <option value="available">Status: Disponíveis</option>
                <option value="used">Status: Utilizados</option>
                <option value="cancelled">Status: Cancelados</option>
                <option value="all">Status: Todos</option>
              </select>

              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium text-zinc-700"
              >
                <option value="all">Mês: Todos</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    Mês: {m}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleReconcile}
                disabled={isReconciling}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs disabled:opacity-50"
                title="Escanear e sincronizar cancelamentos do professor Raphael"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isReconciling ? 'animate-spin' : ''}`} />
                <span>Reconciliar Aulas</span>
              </button>
            </div>
          </div>

          {/* Credits Table */}
          <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-left">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Aluno / Grupo
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Aula Cancelada
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Valor do Crédito
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Competência
                    </th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-zinc-500 uppercase tracking-wider text-right">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-xs text-zinc-700">
                  {filteredCredits.length > 0 ? (
                    filteredCredits.map((item) => {
                      const classDate = item.sourceClass?.date || 'Data não disponível';
                      const classTime = item.sourceClass?.start_time
                        ? `${item.sourceClass.start_time} - ${item.sourceClass.end_time || ''}`
                        : '';

                      return (
                        <tr key={item.id} className="hover:bg-zinc-50/70 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            {item.status === 'available' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle className="w-3 h-3" />
                                Disponível
                              </span>
                            ) : item.status === 'used' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-100 text-zinc-700 border border-zinc-300">
                                <Clock className="w-3 h-3" />
                                Utilizado
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                                <Ban className="w-3 h-3" />
                                Cancelado
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <div className="font-semibold text-zinc-900 flex items-center gap-1.5">
                              {item.isGroup ? (
                                <Users className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                              ) : (
                                <User className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                              )}
                              <span>{item.targetName}</span>
                            </div>
                            {item.isGroup && (
                              <span className="text-[10px] text-indigo-600 font-medium">Turma Coletiva</span>
                            )}
                          </td>

                          <td className="px-4 py-3">
                            <div className="font-medium text-zinc-900 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                              <span>{classDate}</span>
                              {classTime && <span className="text-zinc-500 text-[11px]">({classTime})</span>}
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate max-w-xs">
                              {item.notes || 'Cancelamento registrado pelo professor Raphael'}
                            </div>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-bold text-zinc-900">
                              {formatCurrency(item.amount)}
                            </div>
                            <span className="text-[10px] text-zinc-400">1 aula-crédito</span>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-medium bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200 text-zinc-800 text-[11px]">
                              {item.competency_month || '-'}
                            </span>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {item.status === 'available' ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleStatus(item.id, 'used')}
                                  disabled={actionLoadingId === item.id}
                                  className="px-2 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded text-[10px] font-semibold transition-colors border border-zinc-200 disabled:opacity-50"
                                  title="Marcar como utilizado manualmente"
                                >
                                  {actionLoadingId === item.id ? 'Salvando...' : 'Marcar Usado'}
                                </button>
                              ) : item.status === 'used' ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleStatus(item.id, 'available')}
                                  disabled={actionLoadingId === item.id}
                                  className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded text-[10px] font-semibold transition-colors border border-emerald-200 disabled:opacity-50"
                                  title="Reativar como disponível"
                                >
                                  {actionLoadingId === item.id ? 'Salvando...' : 'Reativar'}
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-zinc-400">
                        <CreditCard className="w-8 h-8 mx-auto text-zinc-300 mb-2" />
                        <p className="font-medium text-zinc-600">Nenhum crédito encontrado com os filtros selecionados.</p>
                        <p className="text-xs text-zinc-400 mt-1">
                          Quando uma aula do professor Raphael for cancelada com o motivo "Cancelada pelo professor", ela aparecerá aqui automaticamente.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-100 bg-zinc-50 flex items-center justify-between">
          <div className="text-xs text-zinc-500 flex items-center gap-1">
            <Info className="w-4 h-4 text-purple-600 flex-shrink-0" />
            <span>Dados mantidos em conformidade contábil. Histórico preservado.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
