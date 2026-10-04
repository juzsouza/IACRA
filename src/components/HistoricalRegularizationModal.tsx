import React, { useState, useMemo } from 'react';
import { useAppStore, CompetenceBilling, findCompetenceBilling } from '../store';
import {
  X,
  History,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Sparkles,
  Info,
  Calendar,
  User,
  Users,
  Music,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import {
  HistoricalRegularizationInput,
  SUGGESTED_REGULARIZATION_CASES,
  SuggestedCase,
  validateHistoricalRegularizationInput,
  buildHistoricalRegularizationRecord,
  validateSnapshotCorrectionInput,
} from '../utils/historicalRegularizationService';

interface HistoricalRegularizationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoricalRegularizationModal: React.FC<HistoricalRegularizationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    state,
    currentUserProfile,
    createCompetenceBilling,
    correctPendingCompetenceBilling,
  } = useAppStore();

  // Permissão de acesso: estritamente super_admin ou admin
  const isAuthorized =
    currentUserProfile?.role === 'super_admin' || currentUserProfile?.role === 'admin';

  // Estados do formulário
  const [category, setCategory] = useState<'individual' | 'choir' | 'group'>('individual');
  const [sourceId, setSourceId] = useState<string>('');
  const [competence, setCompetence] = useState<string>('2026-07');
  const [basePrice, setBasePrice] = useState<number>(100);
  const [discount, setDiscount] = useState<number>(0);
  const [finalPrice, setFinalPrice] = useState<number>(100);
  const [status, setStatus] = useState<'pending' | 'waived' | 'paid' | 'closed'>('pending');
  const [isPaying, setIsPaying] = useState<boolean>(true);
  const [reason, setReason] = useState<string>('');
  const [confirmed, setConfirmed] = useState<boolean>(false);

  // Estados da interface
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [step, setStep] = useState<'form' | 'confirm'>('form');

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Entidades disponíveis para seleção
  const filteredEnrollments = useMemo(() => {
    const list = state.enrollments || [];
    return list.map((enr) => {
      const student = state.students.find((s) => s.id === enr.student_id);
      const plan = state.financialPlans.find((p) => p.id === enr.plan_id);
      return {
        id: enr.id,
        name: student ? student.name : 'Aluno desconhecido',
        detail: plan ? `${plan.name} (Atual: R$ ${enr.custom_price ?? plan.base_price})` : 'Plano individual',
        studentId: enr.student_id,
      };
    }).filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [state.enrollments, state.students, state.financialPlans, searchTerm]);

  const filteredChoirRegistrations = useMemo(() => {
    const list = state.choirRegistrations || [];
    return list.map((reg) => {
      const student = state.students.find((s) => s.id === reg.student_id);
      return {
        id: reg.id,
        name: student ? student.name : 'Coralista',
        detail: `Coral (Atual: ${reg.monthly_fee > 0 ? `R$ ${reg.monthly_fee}` : 'Isento'})`,
        studentId: reg.student_id,
      };
    }).filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [state.choirRegistrations, state.students, searchTerm]);

  const filteredGroups = useMemo(() => {
    const list = state.groups || [];
    return list.map((grp) => ({
      id: grp.id,
      name: grp.name,
      detail: `Grupo Coletivo (Atual: R$ ${grp.price})`,
    })).filter(item => item.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [state.groups, searchTerm]);

  // Checagem de snapshot existente
  const existingSnapshot = useMemo(() => {
    if (!sourceId || !competence) return null;
    return findCompetenceBilling(state.competenceBillings || [], category, sourceId, competence.trim());
  }, [state.competenceBillings, category, sourceId, competence]);

  // Elegibilidade estrita para correção de snapshot (deve ser pending, não congelado e sem transaction_id)
  const isEligibleForCorrection = useMemo(() => {
    if (!existingSnapshot) return false;
    return (
      existingSnapshot.status === 'pending' &&
      !existingSnapshot.is_frozen &&
      !existingSnapshot.transaction_id
    );
  }, [existingSnapshot]);

  // Carregar preset sugerido da direção (Ozéias / Carolina)
  const handleApplyPreset = (preset: SuggestedCase) => {
    setFeedback(null);
    setCategory(preset.category);
    setCompetence(preset.competence);
    setBasePrice(preset.basePrice);
    setDiscount(preset.discount);
    setFinalPrice(preset.finalPrice);
    setStatus(preset.status);
    setIsPaying(preset.isPaying);
    setReason(preset.defaultReason);
    setConfirmed(false);
    setStep('form');

    // Localizar a entidade correspondente no banco
    if (preset.category === 'individual') {
      const student = state.students.find((s) =>
        s.name.toLowerCase().includes(preset.studentNamePattern.toLowerCase())
      );
      if (student) {
        const enr = state.enrollments.find((e) => e.student_id === student.id);
        if (enr) {
          setSourceId(enr.id);
          return;
        }
      }
    } else if (preset.category === 'choir') {
      const student = state.students.find((s) =>
        s.name.toLowerCase().includes(preset.studentNamePattern.toLowerCase())
      );
      if (student) {
        const reg = state.choirRegistrations.find((r) => r.student_id === student.id);
        if (reg) {
          setSourceId(reg.id);
          return;
        }
      }
    }
  };

  // Obter nome descritivo da entidade selecionada
  const selectedEntityLabel = useMemo(() => {
    if (!sourceId) return 'Nenhuma entidade selecionada';
    if (category === 'individual') {
      const enr = state.enrollments.find((e) => e.id === sourceId);
      const student = enr ? state.students.find((s) => s.id === enr.student_id) : null;
      return student ? `${student.name} (Matrícula: ${sourceId})` : `Matrícula ${sourceId}`;
    }
    if (category === 'choir') {
      const reg = state.choirRegistrations.find((r) => r.id === sourceId);
      const student = reg ? state.students.find((s) => s.id === reg.student_id) : null;
      return student ? `${student.name} (Coral: ${sourceId})` : `Coralista ${sourceId}`;
    }
    if (category === 'group') {
      const grp = state.groups.find((g) => g.id === sourceId);
      return grp ? grp.name : `Grupo ${sourceId}`;
    }
    return sourceId;
  }, [category, sourceId, state.enrollments, state.students, state.choirRegistrations, state.groups]);

  // Atualização de valores
  const handleBasePriceChange = (val: number) => {
    setBasePrice(val);
    setFinalPrice(Math.max(0, val - discount));
  };

  const handleDiscountChange = (val: number) => {
    setDiscount(val);
    setFinalPrice(Math.max(0, basePrice - val));
  };

  // Validação preliminar para avançar ao resumo
  const handleProceedToConfirm = () => {
    setFeedback(null);

    // Caso de Correção de Snapshot Pendente Existente
    if (existingSnapshot && isEligibleForCorrection) {
      const correctionValidation = validateSnapshotCorrectionInput(
        {
          billingId: existingSnapshot.id,
          basePrice,
          finalPrice,
          reason,
          operatorId: currentUserProfile?.id || 'admin',
          operatorEmail: currentUserProfile?.email,
          operatorRole: currentUserProfile?.role,
          confirmed: true,
        },
        existingSnapshot
      );
      if (!correctionValidation.isValid) {
        setFeedback({ type: 'error', message: correctionValidation.error || 'Parâmetros inválidos.' });
        return;
      }
      setStep('confirm');
      return;
    }

    const input: HistoricalRegularizationInput = {
      category,
      sourceId,
      competence,
      basePrice,
      discount,
      finalPrice,
      status,
      isPaying,
      reason,
      operatorId: currentUserProfile?.id || 'admin',
      operatorEmail: currentUserProfile?.email,
      operatorRole: currentUserProfile?.role,
      confirmed: true, // testar se passa os demais requisitos
    };

    const validation = validateHistoricalRegularizationInput(input, state.competenceBillings || []);
    if (!validation.isValid) {
      setFeedback({ type: 'error', message: validation.error || 'Parâmetros inválidos.' });
      return;
    }

    setStep('confirm');
  };

  // Gravação definitiva do competence_billing (Criação ou Correção)
  const handleSaveRegularization = async () => {
    if (!confirmed) {
      setFeedback({
        type: 'error',
        message: 'Por favor, marque a caixa de confirmação expressa do operador antes de prosseguir.',
      });
      return;
    }

    // Fluxo de Correção de Snapshot Pendente Existente
    if (existingSnapshot && isEligibleForCorrection) {
      const correctionValidation = validateSnapshotCorrectionInput(
        {
          billingId: existingSnapshot.id,
          basePrice,
          finalPrice,
          reason,
          operatorId: currentUserProfile?.id || 'admin',
          operatorEmail: currentUserProfile?.email,
          operatorRole: currentUserProfile?.role,
          confirmed: true,
        },
        existingSnapshot
      );
      if (!correctionValidation.isValid) {
        setFeedback({ type: 'error', message: correctionValidation.error || 'Validação falhou.' });
        return;
      }

      setIsSubmitting(true);
      setFeedback(null);

      try {
        await correctPendingCompetenceBilling({
          id: existingSnapshot.id,
          basePrice,
          finalPrice,
          reason,
          confirmed: true,
          userRole: currentUserProfile?.role,
          userId: currentUserProfile?.id,
          userEmail: currentUserProfile?.email,
        });

        setFeedback({
          type: 'success',
          message: `Correção concluída com sucesso! O snapshot pendente da competência ${competence} foi atualizado para ${formatCurrency(finalPrice)} e confirmado fisicamente no Supabase com auditoria.`,
        });

        setTimeout(() => {
          setStep('form');
          setConfirmed(false);
          setReason('');
        }, 1500);
      } catch (err: any) {
        console.error('Erro na correção de snapshot:', err);
        setFeedback({
          type: 'error',
          message: err?.message || 'Erro ao persistir a correção no banco de dados.',
        });
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const input: HistoricalRegularizationInput = {
      category,
      sourceId,
      competence,
      basePrice,
      discount,
      finalPrice,
      status,
      isPaying,
      reason,
      operatorId: currentUserProfile?.id || 'admin',
      operatorEmail: currentUserProfile?.email,
      operatorRole: currentUserProfile?.role,
      confirmed: true,
    };

    const validation = validateHistoricalRegularizationInput(input, state.competenceBillings || []);
    if (!validation.isValid) {
      setFeedback({ type: 'error', message: validation.error || 'Validação falhou.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const record = buildHistoricalRegularizationRecord(input, {
        students: state.students,
        enrollments: state.enrollments,
        choirRegistrations: state.choirRegistrations,
        groups: state.groups,
        financialPlans: state.financialPlans,
        competenceBillings: state.competenceBillings,
      });

      if (!createCompetenceBilling) {
        throw new Error('Função de criação de competence_billing não disponível no Store.');
      }

      await createCompetenceBilling(record);

      setFeedback({
        type: 'success',
        message: `Regularização concluída! O snapshot da competência ${competence} foi gravado e confirmado fisicamente no banco de dados Supabase.`,
      });

      // Retornar ao step do form após salvar com sucesso
      setTimeout(() => {
        setStep('form');
        setConfirmed(false);
        setReason('');
      }, 1500);
    } catch (err: any) {
      console.error('Erro na regularização histórica:', err);
      setFeedback({
        type: 'error',
        message: err?.message || 'Erro ao persistir a regularização histórica no banco.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between bg-gradient-to-r from-zinc-50 to-amber-50/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold shadow-xs">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-zinc-900 tracking-tight">
                  Regularização Histórica Assistida
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                  Admin Exclusivo
                </span>
              </div>
              <p className="text-xs text-zinc-500">
                Fixação manual de competências antigas sem snapshot persistido
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 p-2 rounded-xl hover:bg-zinc-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Mensagem Institucional Obrigatória */}
          <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-start gap-3 shadow-xs">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-amber-950 text-sm">
                Aviso Importante sobre Alterações Históricas
              </p>
              <p className="text-amber-850 leading-relaxed font-medium">
                Esta operação altera apenas o histórico financeiro da competência selecionada. O
                cadastro atual do aluno não será alterado.
              </p>
              <p className="text-[11px] text-amber-750">
                Nenhum pagamento financeiro (transaction) é criado. Para dívidas não pagas, o
                registro será gravado como <span className="font-semibold">pending</span> para ser
                liquidado via fluxo normal de caixa.
              </p>
            </div>
          </div>

          {/* Verificação de Permissão */}
          {!isAuthorized && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <span>Acesso restrito: Você precisa de perfil Administrador ou Super Admin para operar esta ferramenta.</span>
            </div>
          )}

          {/* Feedback Messages */}
          {feedback && (
            <div
              className={`p-4 rounded-xl text-sm flex items-start gap-3 ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border border-red-200 text-red-900'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="font-medium text-xs leading-relaxed">{feedback.message}</div>
            </div>
          )}

          {/* Casos Sugeridos da Direção (Ozéias / Carolina) */}
          <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50/60 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                Atalhos Históricos Confirmados pela Direção
              </span>
              <span className="text-[11px] text-zinc-400">Pré-carrega o formulário para conferência individual</span>
            </div>

            <div className="space-y-3">
              {/* Grupo Ozéias */}
              <div>
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                  Ozéias Vitoriano Barbosa (Matrícula Individual)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {SUGGESTED_REGULARIZATION_CASES.filter((c) => c.category === 'individual').map((cs) => (
                    <button
                      key={cs.id}
                      type="button"
                      onClick={() => handleApplyPreset(cs)}
                      className="text-left p-2.5 rounded-lg border border-zinc-200 bg-white hover:border-amber-400 hover:bg-amber-50/40 transition-all text-xs group"
                    >
                      <div className="font-bold text-zinc-900 group-hover:text-amber-900 flex items-center justify-between">
                        <span>{cs.label.split('—')[1]?.trim() || cs.label}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-amber-700 transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1 flex items-center justify-between">
                        <span>{cs.note}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Grupo Carolina */}
              <div>
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                  Carolina Seno Gomes (Coral)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SUGGESTED_REGULARIZATION_CASES.filter((c) => c.category === 'choir').map((cs) => (
                    <button
                      key={cs.id}
                      type="button"
                      onClick={() => handleApplyPreset(cs)}
                      className="text-left p-2.5 rounded-lg border border-zinc-200 bg-white hover:border-amber-400 hover:bg-amber-50/40 transition-all text-xs group"
                    >
                      <div className="font-bold text-zinc-900 group-hover:text-amber-900 flex items-center justify-between">
                        <span>{cs.label.split('—')[1]?.trim() || cs.label}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-amber-700 transition-transform group-hover:translate-x-0.5" />
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-1 flex items-center justify-between">
                        <span>{cs.note}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {step === 'form' ? (
            /* FORMULÁRIO DE REGULARIZAÇÃO */
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Categoria */}
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Categoria <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value as any);
                      setSourceId('');
                    }}
                    className="w-full text-xs rounded-xl border border-zinc-300 p-2.5 bg-white text-zinc-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="individual">Individual (Matrícula)</option>
                    <option value="choir">Coral (Coralista)</option>
                    <option value="group">Grupo Coletivo</option>
                  </select>
                </div>

                {/* Competência YYYY-MM */}
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Competência (YYYY-MM) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 2026-07"
                    value={competence}
                    onChange={(e) => setCompetence(e.target.value.trim())}
                    className="w-full text-xs rounded-xl border border-zinc-300 p-2.5 bg-white text-zinc-900 focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono"
                  />
                </div>

                {/* Situação da Cobrança */}
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Situação de Cobrança <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full text-xs rounded-xl border border-zinc-300 p-2.5 bg-white text-zinc-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="pending">Pendente (Dívida em Aberto)</option>
                    <option value="waived">Isento / Dispensado (Waived)</option>
                    <option value="paid">Pago (Histórico Quitado)</option>
                    <option value="closed">Encerrado (Closed)</option>
                  </select>
                </div>
              </div>

              {/* Seleção da Entidade / Origem */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-zinc-700">
                  Entidade / Origem <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Filtrar por nome..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-1/3 text-xs rounded-xl border border-zinc-300 p-2.5 bg-white text-zinc-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <select
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                    className="w-2/3 text-xs rounded-xl border border-zinc-300 p-2.5 bg-white text-zinc-900 focus:ring-2 focus:ring-amber-500 focus:outline-none font-medium"
                  >
                    <option value="">Selecione uma entidade...</option>
                    {category === 'individual' &&
                      filteredEnrollments.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} — {item.detail}
                        </option>
                      ))}
                    {category === 'choir' &&
                      filteredChoirRegistrations.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} — {item.detail}
                        </option>
                      ))}
                    {category === 'group' &&
                      filteredGroups.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} — {item.detail}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Alerta de Snapshot Já Existente (Bloqueio vs Modo Correção Administrativa) */}
              {existingSnapshot && (
                isEligibleForCorrection ? (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-1.5">
                    <div className="flex items-center gap-2 font-bold text-amber-900">
                      <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Snapshot PENDENTE Localizado — Modo Correção Administrativa Ativo</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-900">
                      Já existe um registro preliminar nesta competência com valor de{' '}
                      <strong>{formatCurrency(existingSnapshot.final_price)}</strong> ({existingSnapshot.status}).
                      Como está pendente e não congelado, esta operação irá <strong>atualizar o snapshot existente</strong>{' '}
                      para <strong>{formatCurrency(finalPrice)}</strong>, registrando sua justificativa na auditoria.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>
                      <strong>Snapshot já existe e não pode ser corrigido:</strong> Já há um registro de competência em {competence} ({existingSnapshot.status} • {formatCurrency(existingSnapshot.final_price)}). Snapshots já pagos, congelados ou com transação vinculada não podem ser alterados.
                    </span>
                  </div>
                )
              )}

              {/* Valores Financeiros */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Valor Histórico Base (R$)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={basePrice}
                    onChange={(e) => handleBasePriceChange(Number(e.target.value))}
                    className="w-full text-xs rounded-xl border border-zinc-300 p-2.5 bg-white text-zinc-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Desconto (R$)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discount}
                    onChange={(e) => handleDiscountChange(Number(e.target.value))}
                    className="w-full text-xs rounded-xl border border-zinc-300 p-2.5 bg-white text-zinc-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-700 mb-1">
                    Valor Final Devido (R$)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={finalPrice}
                    onChange={(e) => setFinalPrice(Number(e.target.value))}
                    className="w-full text-xs rounded-xl border border-zinc-300 p-2.5 bg-zinc-50 font-bold text-zinc-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Pagante / Não Pagante (Especialmente Coral) */}
              {category === 'choir' && (
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-zinc-800">Coralista Pagante?</span>
                    <p className="text-[11px] text-zinc-500">
                      Não pagantes ficam com valor R$ 0,00 e situação Waived (Isento).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsPaying(false);
                        setFinalPrice(0);
                        setStatus('waived');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        !isPaying ? 'bg-amber-600 text-white' : 'bg-zinc-200 text-zinc-700'
                      }`}
                    >
                      Não Pagante (Isento)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPaying(true);
                        setStatus('pending');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        isPaying ? 'bg-amber-600 text-white' : 'bg-zinc-200 text-zinc-700'
                      }`}
                    >
                      Pagante
                    </button>
                  </div>
                </div>
              )}

              {/* Motivo Obrigatório */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-bold text-zinc-700">
                    Motivo Obrigatório da Regularização <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] text-zinc-400">Gravado na auditoria metadata</span>
                </div>
                <textarea
                  rows={2}
                  placeholder="Informe detalhadamente a justificativa institucional fornecida pela direção..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full text-xs rounded-xl border border-zinc-300 p-2.5 bg-white text-zinc-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            /* ETAPA DE CONFIRMAÇÃO DO OPERADOR */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  {existingSnapshot && isEligibleForCorrection
                    ? 'Resumo da Correção de Snapshot Pendente'
                    : 'Resumo da Regularização Histórica'}
                </h3>

                <div className="grid grid-cols-2 gap-y-3 text-xs">
                  <div>
                    <span className="text-zinc-500 block">Entidade / Matrícula:</span>
                    <span className="font-bold text-zinc-900">{selectedEntityLabel}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Competência:</span>
                    <span className="font-bold font-mono text-zinc-900">{competence}</span>
                  </div>
                  {existingSnapshot && isEligibleForCorrection && (
                    <div className="col-span-2 p-2.5 rounded-lg bg-amber-100/70 border border-amber-200 flex items-center justify-between">
                      <span className="text-zinc-700 font-medium">Valor Atual no Snapshot (a substituir):</span>
                      <span className="font-bold text-zinc-900 line-through">
                        {formatCurrency(existingSnapshot.final_price)}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-zinc-500 block">
                      {existingSnapshot && isEligibleForCorrection ? 'Novo Valor Final Corrigido:' : 'Valor Final Devido:'}
                    </span>
                    <span className="font-bold text-zinc-900 text-sm">
                      {formatCurrency(finalPrice)}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Situação de Cobrança:</span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800">
                      {status.toUpperCase()} {isPaying ? '(Pagante)' : '(Não Pagante)'}
                    </span>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-zinc-200">
                    <span className="text-zinc-500 block">Motivo Fornecido:</span>
                    <p className="font-medium text-zinc-800 italic mt-0.5">"{reason}"</p>
                  </div>
                </div>
              </div>

              {/* Checkbox de Confirmação Obrigatória do Operador */}
              <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-300 space-y-2">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                  />
                  <div className="text-xs text-amber-950 font-medium leading-relaxed">
                    <strong>Confirmação Expressa do Operador:</strong> Confirmo que os dados acima
                    foram validados com base nas instruções e registros da direção. Entendo que esta
                    ação {existingSnapshot && isEligibleForCorrection ? 'atualizará o snapshot existente em' : 'criará um registro em'}{' '}
                    <span className="font-mono">competence_billings</span> com
                    minha assinatura digital de auditoria, sem alterar cadastros vigentes.
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 flex items-center justify-between bg-zinc-50">
          <div>
            {step === 'confirm' && (
              <button
                type="button"
                onClick={() => setStep('form')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/60 rounded-xl transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Voltar e Editar
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 rounded-xl hover:bg-zinc-100 transition-colors"
            >
              Cancelar
            </button>
            {step === 'form' ? (
              <button
                type="button"
                disabled={!isAuthorized || (!!existingSnapshot && !isEligibleForCorrection) || !sourceId}
                onClick={handleProceedToConfirm}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors"
              >
                <span>{existingSnapshot && isEligibleForCorrection ? 'Revisar Correção do Snapshot' : 'Revisar e Confirmar'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={!isAuthorized || !confirmed || isSubmitting}
                onClick={handleSaveRegularization}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Gravando...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>{existingSnapshot && isEligibleForCorrection ? 'Confirmar Correção do Snapshot' : 'Confirmar Regularização'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
