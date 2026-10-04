/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { 
  useAppStore, 
  Affiliate, 
  AffiliateReferral, 
  AffiliateMonthlyClosing, 
  AffiliateClosingItem 
} from '../store';
import { 
  DEFAULT_COMMISSION_RULES, 
  calculateAffiliateCommission, 
  evaluateReferralStatus, 
  formatCompetence, 
  parseCompetence, 
  getCompetenceLabel,
  getCompetenceValidReferrals,
  buildCommissionRulesMap,
  CommissionTierRule
} from '../utils/affiliateCommission';
import { 
  Users, 
  UserPlus, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Calendar, 
  Search, 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  DollarSign, 
  Lock, 
  Unlock, 
  Info, 
  HelpCircle,
  QrCode,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Affiliates: React.FC = () => {
  const { 
    state, 
    addAffiliate, 
    updateAffiliate, 
    deleteAffiliate, 
    addAffiliateReferral, 
    updateAffiliateReferral, 
    deleteAffiliateReferral,
    addAffiliateClosing,
    reopenAffiliateClosing,
    currentUserProfile 
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'affiliates' | 'referrals' | 'closings' | 'rules'>('affiliates');

  // Competência selecionada para apuração (padrão: mês atual YYYY-MM)
  const currentMonthCompetence = useMemo(() => {
    const now = new Date();
    return formatCompetence(now.getFullYear(), now.getMonth() + 1);
  }, []);
  const [selectedCompetence, setSelectedCompetence] = useState<string>(currentMonthCompetence);

  // Filtros
  const [affiliateSearch, setAffiliateSearch] = useState('');
  const [affiliateStatusFilter, setAffiliateStatusFilter] = useState<'all' | 'active' | 'inactive' | 'suspended'>('all');
  const [referralSearch, setReferralSearch] = useState('');
  const [referralAffiliateFilter, setReferralAffiliateFilter] = useState<string>('all');
  const [referralStatusFilter, setReferralStatusFilter] = useState<string>('all');

  // Modais de Afiliado
  const [isAffiliateModalOpen, setIsAffiliateModalOpen] = useState(false);
  const [editingAffiliate, setEditingAffiliate] = useState<Affiliate | null>(null);
  const [affiliateForm, setAffiliateForm] = useState({
    name: '',
    email: '',
    phone: '',
    cpf_cnpj: '',
    pix_key: '',
    pix_key_type: 'cpf' as 'cpf' | 'cnpj' | 'email' | 'phone' | 'random' | 'outro',
    referral_code: '',
    status: 'active' as 'active' | 'inactive' | 'suspended',
  });

  // Modais de Indicação
  const [isReferralModalOpen, setIsReferralModalOpen] = useState(false);
  const [editingReferral, setEditingReferral] = useState<AffiliateReferral | null>(null);
  const [referralForm, setReferralForm] = useState({
    affiliate_id: '',
    referred_name: '',
    referred_phone: '',
    referred_email: '',
    student_id: '',
    referral_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Modal de Fechamento / Reabertura
  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [expandedAffiliateId, setExpandedAffiliateId] = useState<string | null>(null);

  // Estados de Feedback e Operação Supabase
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Mapa de regras de comissão dinâmicas do banco ou padrão
  const commissionRulesMap = useMemo(() => {
    return buildCommissionRulesMap(state.affiliateCommissionRules || []);
  }, [state.affiliateCommissionRules]);

  // Formatação monetária
  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return 'Não definido';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Avaliação em tempo real de todas as indicações
  const evaluatedReferrals = useMemo(() => {
    const rawReferrals = state.affiliateReferrals || [];
    return rawReferrals.map(ref => {
      const evaluation = evaluateReferralStatus(
        ref,
        state.students || [],
        state.enrollments || [],
        state.transactions || []
      );
      return {
        ...ref,
        evaluatedStatus: evaluation.status,
        evaluatedStudentId: evaluation.studentId || ref.student_id,
        evaluatedEnrollmentId: evaluation.enrollmentId || ref.enrollment_id,
        evaluatedCompetence: evaluation.conversionCompetence || ref.conversion_competence,
        firstTransactionId: evaluation.firstTransactionId || ref.first_transaction_id,
      };
    });
  }, [state.affiliateReferrals, state.students, state.enrollments, state.transactions]);

  // Apuração da Competência Selecionada
  const competenceAudit = useMemo(() => {
    const affiliates = state.affiliates || [];
    
    // Indicações pertencentes à competência selecionada
    const targetReferrals = evaluatedReferrals.filter(
      r => r.evaluatedCompetence === selectedCompetence
    );

    // Avaliação e trava anti-duplicidade (com base em todas as indicações para não duplicar aluno entre meses)
    const { validList, duplicateList } = getCompetenceValidReferrals(
      selectedCompetence,
      evaluatedReferrals.map(r => ({
        id: r.id,
        affiliate_id: r.affiliate_id,
        student_id: r.evaluatedStudentId,
        referred_name: r.referred_name,
        status: r.evaluatedStatus,
        conversion_competence: r.evaluatedCompetence,
        conversion_date: r.conversion_date,
        created_at: r.created_at,
      }))
    );

    // Resumo por afiliado
    const summaryPerAffiliate = affiliates.map(aff => {
      const affAllReferrals = targetReferrals.filter(r => r.affiliate_id === aff.id);
      const affValid = validList.filter(r => r.affiliate_id === aff.id);
      const affDuplicates = duplicateList.filter(r => r.affiliate_id === aff.id);
      const affPendingPayment = affAllReferrals.filter(r => r.evaluatedStatus === 'enrolled_pending_payment');
      const affRegisteredOnly = affAllReferrals.filter(r => r.evaluatedStatus === 'registered');

      const calc = calculateAffiliateCommission(affValid.length, commissionRulesMap);

      return {
        affiliate: aff,
        allReferralsCount: affAllReferrals.length,
        validCount: affValid.length,
        validReferrals: affValid,
        duplicatesCount: affDuplicates.length,
        pendingPaymentCount: affPendingPayment.length,
        registeredCount: affRegisteredOnly.length,
        calc,
      };
    });

    // Totais globais
    const totalValid = validList.length;
    let totalPayout = 0;
    let hasUndefinedRule = false;

    summaryPerAffiliate.forEach(item => {
      if (!item.calc.isDefined) {
        hasUndefinedRule = true;
      } else if (item.calc.totalAmount) {
        totalPayout += item.calc.totalAmount;
      }
    });

    // Checar se já existe fechamento registrado para esta competência
    const existingClosing = (state.affiliateClosings || []).find(
      c => c.competence === selectedCompetence && c.is_current
    );

    const existingClosingItems = existingClosing
      ? (state.affiliateClosingItems || []).filter(item => item.closing_id === existingClosing.id)
      : [];

    return {
      summaryPerAffiliate,
      totalValid,
      totalPayout,
      hasUndefinedRule,
      existingClosing,
      existingClosingItems,
    };
  }, [state.affiliates, evaluatedReferrals, selectedCompetence, state.affiliateClosings, state.affiliateClosingItems, commissionRulesMap]);

  // Navegação de competência
  const changeCompetence = (deltaMonths: number) => {
    const { year, month } = parseCompetence(selectedCompetence);
    const newDate = new Date(year, month - 1 + deltaMonths, 1);
    setSelectedCompetence(formatCompetence(newDate.getFullYear(), newDate.getMonth() + 1));
  };

  // Handlers de Afiliado
  const handleOpenAffiliateModal = (affiliate?: Affiliate) => {
    setModalError(null);
    if (affiliate) {
      setEditingAffiliate(affiliate);
      setAffiliateForm({
        name: affiliate.name,
        email: affiliate.email || '',
        phone: affiliate.phone || '',
        cpf_cnpj: affiliate.cpf_cnpj || '',
        pix_key: affiliate.pix_key || '',
        pix_key_type: affiliate.pix_key_type || 'cpf',
        referral_code: affiliate.referral_code || '',
        status: affiliate.status,
      });
    } else {
      setEditingAffiliate(null);
      setAffiliateForm({
        name: '',
        email: '',
        phone: '',
        cpf_cnpj: '',
        pix_key: '',
        pix_key_type: 'cpf',
        referral_code: '',
        status: 'active',
      });
    }
    setIsAffiliateModalOpen(true);
  };

  const handleSaveAffiliate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!affiliateForm.name.trim()) return;
    setIsProcessing(true);
    setModalError(null);
    setErrorMessage(null);

    try {
      if (editingAffiliate) {
        await updateAffiliate(editingAffiliate.id, {
          name: affiliateForm.name.trim(),
          email: affiliateForm.email.trim() || undefined,
          phone: affiliateForm.phone.trim() || undefined,
          cpf_cnpj: affiliateForm.cpf_cnpj.trim() || undefined,
          pix_key: affiliateForm.pix_key.trim() || undefined,
          pix_key_type: affiliateForm.pix_key_type,
          referral_code: affiliateForm.referral_code.trim().toUpperCase() || undefined,
          status: affiliateForm.status,
        });
        setSuccessMessage('Afiliado atualizado com sucesso no Supabase!');
      } else {
        await addAffiliate({
          name: affiliateForm.name.trim(),
          email: affiliateForm.email.trim() || undefined,
          phone: affiliateForm.phone.trim() || undefined,
          cpf_cnpj: affiliateForm.cpf_cnpj.trim() || undefined,
          pix_key: affiliateForm.pix_key.trim() || undefined,
          pix_key_type: affiliateForm.pix_key_type,
          referral_code: affiliateForm.referral_code.trim().toUpperCase() || undefined,
          status: affiliateForm.status,
        });
        setSuccessMessage('Afiliado cadastrado com sucesso no Supabase!');
      }
      setIsAffiliateModalOpen(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setModalError(err.message || 'Erro ao salvar afiliado no Supabase');
      setErrorMessage(err.message || 'Erro ao salvar afiliado no Supabase');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteAffiliate = async (id: string, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o afiliado "${name}"?`)) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      await deleteAffiliate(id);
      setSuccessMessage('Afiliado excluído com sucesso.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao excluir afiliado no Supabase.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handlers de Indicação
  const handleOpenReferralModal = (referral?: AffiliateReferral) => {
    setModalError(null);
    if (referral) {
      setEditingReferral(referral);
      setReferralForm({
        affiliate_id: referral.affiliate_id,
        referred_name: referral.referred_name,
        referred_phone: referral.referred_phone || '',
        referred_email: referral.referred_email || '',
        student_id: referral.student_id || '',
        referral_date: referral.referral_date,
        notes: referral.notes || '',
      });
    } else {
      setEditingReferral(null);
      setReferralForm({
        affiliate_id: (state.affiliates && state.affiliates[0]?.id) || '',
        referred_name: '',
        referred_phone: '',
        referred_email: '',
        student_id: '',
        referral_date: new Date().toISOString().split('T')[0],
        notes: '',
      });
    }
    setIsReferralModalOpen(true);
  };

  const handleSaveReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referralForm.affiliate_id || !referralForm.referred_name.trim()) return;
    setIsProcessing(true);
    setModalError(null);
    setErrorMessage(null);

    try {
      if (editingReferral) {
        await updateAffiliateReferral(editingReferral.id, {
          affiliate_id: referralForm.affiliate_id,
          referred_name: referralForm.referred_name.trim(),
          referred_phone: referralForm.referred_phone.trim() || undefined,
          referred_email: referralForm.referred_email.trim() || undefined,
          student_id: referralForm.student_id || undefined,
          referral_date: referralForm.referral_date,
          notes: referralForm.notes.trim() || undefined,
        });
        setSuccessMessage('Indicação atualizada com sucesso no Supabase!');
      } else {
        await addAffiliateReferral({
          affiliate_id: referralForm.affiliate_id,
          referred_name: referralForm.referred_name.trim(),
          referred_phone: referralForm.referred_phone.trim() || undefined,
          referred_email: referralForm.referred_email.trim() || undefined,
          student_id: referralForm.student_id || undefined,
          referral_date: referralForm.referral_date,
          status: 'registered',
          notes: referralForm.notes.trim() || undefined,
        });
        setSuccessMessage('Indicação cadastrada com sucesso no Supabase!');
      }
      setIsReferralModalOpen(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setModalError(err.message || 'Erro ao salvar indicação no Supabase');
      setErrorMessage(err.message || 'Erro ao salvar indicação no Supabase');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteReferral = async (id: string, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir a indicação de "${name}"?`)) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      await deleteAffiliateReferral(id);
      setSuccessMessage('Indicação excluída com sucesso.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao excluir indicação no Supabase.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Fechamento de Competência
  const handleExecuteClosing = async () => {
    setIsProcessing(true);
    setModalError(null);
    setErrorMessage(null);

    try {
      const itemsToSave = competenceAudit.summaryPerAffiliate
        .filter(item => item.validCount > 0)
        .map(item => ({
          affiliate_id: item.affiliate.id,
          affiliate_name_snapshot: item.affiliate.name,
          affiliate_pix_snapshot: item.affiliate.pix_key 
            ? `${item.affiliate.pix_key_type?.toUpperCase()}: ${item.affiliate.pix_key}`
            : undefined,
          valid_referrals_count: item.validCount,
          tier_applied: item.calc.tierLabel,
          amount_due: item.calc.totalAmount,
          rule_status: item.calc.isDefined ? ('defined' as const) : ('pending_definition' as const),
          payment_status: 'pending' as const,
          notes: item.calc.isDefined ? undefined : 'Pendente de definição de regra pela diretoria (> 10 indicações)',
        }));

      await addAffiliateClosing(
        {
          competence: selectedCompetence,
          version: competenceAudit.existingClosing ? competenceAudit.existingClosing.version + 1 : 1,
          is_current: true,
          status: 'closed',
          total_valid_referrals: competenceAudit.totalValid,
          total_payout_amount: competenceAudit.totalPayout,
          closed_at: new Date().toISOString(),
          closed_by: currentUserProfile?.id,
          closed_by_name: currentUserProfile?.email || 'Administrador',
          notes: closingNotes.trim() || undefined,
        },
        itemsToSave
      );

      setIsClosingModalOpen(false);
      setClosingNotes('');
      setSuccessMessage('Competência fechada com sucesso no Supabase!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setModalError(err.message || 'Erro ao fechar competência no Supabase');
      setErrorMessage(err.message || 'Erro ao fechar competência no Supabase');
    } finally {
      setIsProcessing(false);
    }
  };

  // Reabertura de Competência
  const handleReopenClosing = async () => {
    if (!reopenReason.trim() || !competenceAudit.existingClosing) return;
    setIsProcessing(true);
    setModalError(null);
    setErrorMessage(null);

    try {
      await reopenAffiliateClosing(competenceAudit.existingClosing.id, reopenReason.trim());
      setIsReopenModalOpen(false);
      setReopenReason('');
      setSuccessMessage('Competência reaberta com sucesso no Supabase.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setModalError(err.message || 'Erro ao reabrir competência no Supabase');
      setErrorMessage(err.message || 'Erro ao reabrir competência no Supabase');
    } finally {
      setIsProcessing(false);
    }
  };

  // Listas filtradas
  const filteredAffiliates = useMemo(() => {
    return (state.affiliates || []).filter(aff => {
      const matchSearch = aff.name.toLowerCase().includes(affiliateSearch.toLowerCase()) ||
        (aff.referral_code && aff.referral_code.toLowerCase().includes(affiliateSearch.toLowerCase())) ||
        (aff.email && aff.email.toLowerCase().includes(affiliateSearch.toLowerCase())) ||
        (aff.pix_key && aff.pix_key.toLowerCase().includes(affiliateSearch.toLowerCase()));
      
      const matchStatus = affiliateStatusFilter === 'all' || aff.status === affiliateStatusFilter;
      return matchSearch && matchStatus;
    });
  }, [state.affiliates, affiliateSearch, affiliateStatusFilter]);

  const filteredReferrals = useMemo(() => {
    return evaluatedReferrals.filter(ref => {
      const aff = (state.affiliates || []).find(a => a.id === ref.affiliate_id);
      const matchSearch = ref.referred_name.toLowerCase().includes(referralSearch.toLowerCase()) ||
        (aff && aff.name.toLowerCase().includes(referralSearch.toLowerCase())) ||
        (ref.referred_phone && ref.referred_phone.includes(referralSearch));
      
      const matchAffiliate = referralAffiliateFilter === 'all' || ref.affiliate_id === referralAffiliateFilter;
      const matchStatus = referralStatusFilter === 'all' || ref.evaluatedStatus === referralStatusFilter;

      return matchSearch && matchAffiliate && matchStatus;
    });
  }, [evaluatedReferrals, state.affiliates, referralSearch, referralAffiliateFilter, referralStatusFilter]);

  return (
    <div className="space-y-6">
      {/* Alertas de Feedback Supabase */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-rose-900 shadow-sm"
          >
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <div>
                <div className="font-semibold text-sm">Atenção na sincronização</div>
                <div className="text-xs text-rose-700">{errorMessage}</div>
              </div>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="p-1 hover:bg-rose-100 rounded-lg text-rose-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-emerald-900 shadow-sm"
          >
            <div className="flex items-center space-x-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="text-sm font-medium">{successMessage}</div>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="p-1 hover:bg-emerald-100 rounded-lg text-emerald-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">Módulo de Afiliados & Indicações</h1>
              <p className="text-sm text-zinc-500">
                Acompanhamento de parceiros, fluxo de conversão com proteção anti-duplicidade e apuração de comissões por competência.
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-3 py-1.5 bg-zinc-50 rounded-xl border border-zinc-200 text-xs">
            <span className="text-zinc-500 block">Afiliados Ativos</span>
            <span className="font-semibold text-zinc-900 text-sm">
              {(state.affiliates || []).filter(a => a.status === 'active').length}
            </span>
          </div>
          <div className="px-3 py-1.5 bg-zinc-50 rounded-xl border border-zinc-200 text-xs">
            <span className="text-zinc-500 block">Indicações Totais</span>
            <span className="font-semibold text-zinc-900 text-sm">
              {(state.affiliateReferrals || []).length}
            </span>
          </div>
          <div className="px-3 py-1.5 bg-emerald-50 rounded-xl border border-emerald-200 text-xs">
            <span className="text-emerald-700 block">Convertidas ({getCompetenceLabel(selectedCompetence)})</span>
            <span className="font-semibold text-emerald-800 text-sm">
              {competenceAudit.totalValid}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 space-x-2">
        <button
          onClick={() => setActiveTab('affiliates')}
          className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'affiliates'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Afiliados ({(state.affiliates || []).length})</span>
        </button>

        <button
          onClick={() => setActiveTab('referrals')}
          className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'referrals'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          <span>Indicações ({(state.affiliateReferrals || []).length})</span>
        </button>

        <button
          onClick={() => setActiveTab('closings')}
          className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'closings'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Apuração & Fechamento</span>
          {competenceAudit.existingClosing && (
            <span className="ml-1.5 px-2 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-800 rounded-full">
              Fechada
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('rules')}
          className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'rules'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>Tabela de Regras</span>
        </button>
      </div>

      {/* TAB 1: AFILIADOS */}
      {activeTab === 'affiliates' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar por nome, código ou PIX..."
                  value={affiliateSearch}
                  onChange={e => setAffiliateSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                value={affiliateStatusFilter}
                onChange={e => setAffiliateStatusFilter(e.target.value as any)}
                className="px-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Todos os status</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
                <option value="suspended">Suspensos</option>
              </select>
            </div>

            <button
              onClick={() => handleOpenAffiliateModal()}
              className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center space-x-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Novo Afiliado</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Afiliado</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Código</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Contato</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Chave PIX</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">Indicações / Convertidas</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-zinc-200">
                  {filteredAffiliates.length > 0 ? (
                    filteredAffiliates.map(aff => {
                      const affReferrals = evaluatedReferrals.filter(r => r.affiliate_id === aff.id);
                      const convertedCount = affReferrals.filter(r => r.evaluatedStatus === 'converted').length;

                      return (
                        <tr key={aff.id} className="hover:bg-zinc-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-semibold text-zinc-900 text-sm">{aff.name}</div>
                            {aff.cpf_cnpj && (
                              <div className="text-xs text-zinc-400">CPF/CNPJ: {aff.cpf_cnpj}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {aff.referral_code ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {aff.referral_code}
                              </span>
                            ) : (
                              <span className="text-zinc-400 text-xs italic">Não definido</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600">
                            <div>{aff.phone || '-'}</div>
                            <div className="text-xs text-zinc-400">{aff.email || ''}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600">
                            {aff.pix_key ? (
                              <div>
                                <span className="font-mono text-xs">{aff.pix_key}</span>
                                <span className="text-[10px] text-zinc-400 block uppercase">({aff.pix_key_type || 'outro'})</span>
                              </div>
                            ) : (
                              <span className="text-zinc-400 text-xs italic">Não cadastrado</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                            <span className="font-semibold text-zinc-900">{affReferrals.length}</span>
                            <span className="text-zinc-400 mx-1">/</span>
                            <span className="font-semibold text-emerald-600">{convertedCount}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                              aff.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : aff.status === 'suspended'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                            }`}>
                              {aff.status === 'active' ? 'Ativo' : aff.status === 'suspended' ? 'Suspenso' : 'Inativo'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => handleOpenAffiliateModal(aff)}
                                className="p-1 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Editar afiliado"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteAffiliate(aff.id, aff.name)}
                                disabled={isProcessing}
                                className="p-1 text-rose-600 hover:text-rose-900 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Excluir afiliado"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-sm text-zinc-500">
                        Nenhum afiliado encontrado com os filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INDICAÇÕES */}
      {activeTab === 'referrals' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-3 w-full sm:w-auto flex-wrap gap-y-2">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar indicado..."
                  value={referralSearch}
                  onChange={e => setReferralSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <select
                value={referralAffiliateFilter}
                onChange={e => setReferralAffiliateFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Todos os afiliados</option>
                {(state.affiliates || []).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>

              <select
                value={referralStatusFilter}
                onChange={e => setReferralStatusFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Todos os status</option>
                <option value="converted">Convertido & Pago (Válido)</option>
                <option value="enrolled_pending_payment">Matriculado (Aguardando Pagto)</option>
                <option value="registered">Registrado (Sem Matrícula)</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </div>

            <button
              onClick={() => handleOpenReferralModal()}
              className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center space-x-2 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Indicação</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Aluno Indicado</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Afiliado</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Data Indicação</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Vínculo Aluno/Matrícula</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Competência</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status do Funil</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-zinc-200">
                  {filteredReferrals.length > 0 ? (
                    filteredReferrals.map(ref => {
                      const aff = (state.affiliates || []).find(a => a.id === ref.affiliate_id);
                      const student = ref.evaluatedStudentId ? (state.students || []).find(s => s.id === ref.evaluatedStudentId) : null;
                      const enrollment = ref.evaluatedEnrollmentId ? (state.enrollments || []).find(e => e.id === ref.evaluatedEnrollmentId) : null;
                      const plan = enrollment ? (state.financialPlans || []).find(p => p.id === enrollment.plan_id) : null;

                      return (
                        <tr key={ref.id} className="hover:bg-zinc-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="font-semibold text-zinc-900 text-sm">{ref.referred_name}</div>
                            {ref.referred_phone && (
                              <div className="text-xs text-zinc-400">{ref.referred_phone}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-zinc-900">{aff?.name || 'Desconhecido'}</div>
                            {aff?.referral_code && (
                              <div className="text-[11px] text-indigo-600 font-mono">#{aff.referral_code}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600">
                            {ref.referral_date ? new Date(ref.referral_date + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {student ? (
                              <div>
                                <span className="inline-flex items-center text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  Aluno Cadastrado
                                </span>
                                {plan && (
                                  <div className="text-xs text-zinc-500 mt-1">
                                    Plano: {plan.name}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-zinc-400 text-xs italic">Ainda não matriculado</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-900">
                            {ref.evaluatedCompetence ? getCompetenceLabel(ref.evaluatedCompetence) : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {ref.evaluatedStatus === 'converted' && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Convertido & Pago
                              </span>
                            )}
                            {ref.evaluatedStatus === 'enrolled_pending_payment' && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                <Clock className="w-3 h-3 mr-1" />
                                Aguardando 1º Pagto
                              </span>
                            )}
                            {ref.evaluatedStatus === 'registered' && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-zinc-100 text-zinc-700 border border-zinc-200">
                                <Info className="w-3 h-3 mr-1" />
                                Apenas Indicado
                              </span>
                            )}
                            {ref.evaluatedStatus === 'cancelled' && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800 border border-rose-200">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                Cancelado
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => handleOpenReferralModal(ref)}
                                className="p-1 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Editar indicação"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteReferral(ref.id, ref.referred_name)}
                                disabled={isProcessing}
                                className="p-1 text-rose-600 hover:text-rose-900 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Excluir indicação"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-sm text-zinc-500">
                        Nenhuma indicação encontrada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: APURAÇÃO & FECHAMENTO */}
      {activeTab === 'closings' && (
        <div className="space-y-6">
          {/* Competence Selector Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => changeCompetence(-1)}
                className="p-2 hover:bg-zinc-100 rounded-xl transition-colors border border-zinc-200"
                title="Mês anterior"
              >
                <ChevronLeft className="w-5 h-5 text-zinc-600" />
              </button>
              <div className="text-center sm:text-left">
                <div className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Competência de Apuração</div>
                <div className="text-xl font-bold text-zinc-900 flex items-center space-x-2">
                  <span>{getCompetenceLabel(selectedCompetence)}</span>
                  {competenceAudit.existingClosing ? (
                    <span className="px-2.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                      Fechada (v{competenceAudit.existingClosing.version})
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 rounded-full border border-amber-200">
                      Aberta (Cálculo em Tempo Real)
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => changeCompetence(1)}
                className="p-2 hover:bg-zinc-100 rounded-xl transition-colors border border-zinc-200"
                title="Próximo mês"
              >
                <ChevronRight className="w-5 h-5 text-zinc-600" />
              </button>
            </div>

            <div className="flex items-center space-x-3">
              {competenceAudit.existingClosing ? (
                <button
                  onClick={() => setIsReopenModalOpen(true)}
                  className="px-4 py-2 bg-amber-50 text-amber-800 border border-amber-300 rounded-xl text-sm font-medium hover:bg-amber-100 transition-colors flex items-center space-x-2"
                >
                  <Unlock className="w-4 h-4" />
                  <span>Reabrir Competência</span>
                </button>
              ) : (
                <button
                  onClick={() => setIsClosingModalOpen(true)}
                  disabled={competenceAudit.totalValid === 0}
                  className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center space-x-2 transition-colors ${
                    competenceAudit.totalValid > 0
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                      : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                  }`}
                >
                  <Lock className="w-4 h-4" />
                  <span>Fechar Competência {getCompetenceLabel(selectedCompetence)}</span>
                </button>
              )}
            </div>
          </div>

          {/* Banner de Aviso de Regra > 10 */}
          {competenceAudit.hasUndefinedRule && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start space-x-3 text-amber-900">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <span className="font-semibold">Atenção - Faixa acima de 10 indicações detectada:</span> Um ou mais afiliados atingiram mais de 10 conversões nesta competência. Conforme determinação da diretoria, a regra acima de 10 não foi definida e deve ser combinada previamente antes da liquidação.
              </div>
            </div>
          )}

          {/* Tabela de Apuração por Afiliado */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-zinc-100 flex justify-between items-center">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">Demonstrativo por Afiliado</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Conversões auditadas com pagamento confirmado na competência {getCompetenceLabel(selectedCompetence)}.
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-zinc-500 block">Total Previsto de Comissões</span>
                <span className="text-xl font-bold text-emerald-600">
                  {formatCurrency(competenceAudit.totalPayout)}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Afiliado</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Dados PIX</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">Indicações Totais</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">Válidas & Pagas</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Faixa Aplicada</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Valor a Pagar</th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">Detalhes</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-zinc-200">
                  {competenceAudit.summaryPerAffiliate.length > 0 ? (
                    competenceAudit.summaryPerAffiliate.map(item => {
                      const isExpanded = expandedAffiliateId === item.affiliate.id;

                      return (
                        <React.Fragment key={item.affiliate.id}>
                          <tr className="hover:bg-zinc-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-semibold text-zinc-900 text-sm">{item.affiliate.name}</div>
                              {item.affiliate.referral_code && (
                                <div className="text-xs text-indigo-600 font-mono">#{item.affiliate.referral_code}</div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600">
                              {item.affiliate.pix_key ? (
                                <div>
                                  <span className="font-mono text-xs">{item.affiliate.pix_key}</span>
                                  <span className="text-[10px] text-zinc-400 block uppercase">({item.affiliate.pix_key_type})</span>
                                </div>
                              ) : (
                                <span className="text-zinc-400 text-xs italic">Sem PIX</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-zinc-700">
                              {item.allReferralsCount}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                item.validCount > 0 
                                  ? 'bg-emerald-100 text-emerald-800' 
                                  : 'bg-zinc-100 text-zinc-500'
                              }`}>
                                {item.validCount}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              {item.calc.isDefined ? (
                                <span className="text-zinc-700">{item.calc.tierLabel}</span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                  {item.calc.statusMessage}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-sm">
                              {item.calc.isDefined ? (
                                <span className={item.calc.totalAmount ? 'text-emerald-600' : 'text-zinc-400'}>
                                  {formatCurrency(item.calc.totalAmount)}
                                </span>
                              ) : (
                                <span className="text-amber-600 font-medium text-xs">Pendente</span>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              {item.validCount > 0 ? (
                                <button
                                  onClick={() => setExpandedAffiliateId(isExpanded ? null : item.affiliate.id)}
                                  className="p-1 hover:bg-zinc-100 rounded-lg text-zinc-500 hover:text-zinc-800 transition-colors"
                                  title="Ver alunos convertidos"
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              ) : (
                                <span className="text-zinc-300">-</span>
                              )}
                            </td>
                          </tr>

                          {/* Linha de Detalhes dos Alunos Convertidos */}
                          {isExpanded && (
                            <tr className="bg-zinc-50/70">
                              <td colSpan={7} className="px-8 py-3">
                                <div className="text-xs font-semibold text-zinc-600 mb-2">
                                  Alunos convertidos e pagos que contabilizaram nesta competência ({item.validCount}):
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                  {item.validReferrals.map((vRef, idx) => (
                                    <div key={vRef.id} className="p-2 bg-white rounded-lg border border-zinc-200 flex items-center justify-between text-xs">
                                      <span className="font-medium text-zinc-800">
                                        {idx + 1}. {vRef.referred_name}
                                      </span>
                                      <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-medium">
                                        Confirmado
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-sm text-zinc-500">
                        Nenhum afiliado cadastrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TABELA DE REGRAS OFICIAIS */}
      {activeTab === 'rules' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm">
            <h3 className="text-lg font-bold text-zinc-900 mb-2">Tabela Oficial de Comissões por Volume Mensal</h3>
            <p className="text-sm text-zinc-500 mb-6">
              A remuneração do afiliado é determinada pelo volume total de matrículas pagas e finalizadas dentro do mesmo mês de competência.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              {(Object.values(commissionRulesMap) as CommissionTierRule[]).sort((a, b) => a.quantity - b.quantity).map((rule) => (
                <div key={rule.quantity} className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 flex flex-col justify-between">
                  <div>
                    <span className="text-xs text-zinc-500 font-semibold uppercase tracking-wider block">
                      {rule.quantity} {rule.quantity === 1 ? 'Indicação' : 'Indicações'}
                    </span>
                    <div className="text-2xl font-black text-indigo-600 mt-1">
                      {formatCurrency(rule.totalCommission)}
                    </div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-zinc-200/60 text-[11px] text-zinc-500">
                    Valor total pago ao afiliado
                  </div>
                </div>
              ))}

              {/* Faixa > 10 */}
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 flex flex-col justify-between">
                <div>
                  <span className="text-xs text-amber-700 font-semibold uppercase tracking-wider block">
                    Acima de 10
                  </span>
                  <div className="text-base font-bold text-amber-800 mt-1">
                    Não Definido
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-amber-200 text-[11px] text-amber-700">
                  Aguardando deliberação da diretoria
                </div>
              </div>
            </div>
          </div>

          {/* Diretrizes e Regras Fundamentais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm space-y-3">
              <div className="flex items-center space-x-2 text-zinc-900 font-semibold">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h4>Gatilho de Conversão Válida</h4>
              </div>
              <ul className="text-sm text-zinc-600 space-y-2 list-disc pl-5">
                <li>O aluno precisa efetivar a matrícula no sistema.</li>
                <li>A primeira mensalidade ou taxa de matrícula deve estar efetivamente recebida/concluída.</li>
                <li>A comissão é paga <strong>apenas uma vez</strong> por aluno convertido.</li>
                <li>Meses seguintes e renovações do mesmo aluno NÃO geram comissão recorrente.</li>
              </ul>
            </div>

            <div className="p-6 bg-white rounded-2xl border border-zinc-200 shadow-sm space-y-3">
              <div className="flex items-center space-x-2 text-zinc-900 font-semibold">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h4>Competência e Integridade de Dados</h4>
              </div>
              <ul className="text-sm text-zinc-600 space-y-2 list-disc pl-5">
                <li>A comissão pertence ao mês da <strong>conversão/início</strong> da matrícula, não à data do lead.</li>
                <li>Proteção First-Touch: se o mesmo aluno for indicado por mais de um afiliado, a conversão é vinculada à primeira indicação válida.</li>
                <li>Múltiplas matrículas do mesmo aluno (ex: piano e coral) contam como <strong>1 única conversão</strong>.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NOVO / EDITAR AFILIADO */}
      <AnimatePresence>
        {isAffiliateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsAffiliateModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden relative z-10"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-zinc-900">
                  {editingAffiliate ? 'Editar Afiliado' : 'Novo Afiliado'}
                </h3>
                <button onClick={() => setIsAffiliateModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveAffiliate} className="p-6 space-y-4">
                {modalError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                    {modalError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Nome Completo *</label>
                  <input
                    required
                    type="text"
                    value={affiliateForm.name}
                    onChange={e => setAffiliateForm({ ...affiliateForm, name: e.target.value })}
                    placeholder="Ex: Carlos Eduardo de Oliveira"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Código de Indicação</label>
                    <input
                      type="text"
                      value={affiliateForm.referral_code}
                      onChange={e => setAffiliateForm({ ...affiliateForm, referral_code: e.target.value.toUpperCase() })}
                      placeholder="Ex: CARLOS10"
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Status</label>
                    <select
                      value={affiliateForm.status}
                      onChange={e => setAffiliateForm({ ...affiliateForm, status: e.target.value as any })}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                      <option value="suspended">Suspenso</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Telefone (WhatsApp)</label>
                    <input
                      type="text"
                      value={affiliateForm.phone}
                      onChange={e => setAffiliateForm({ ...affiliateForm, phone: e.target.value })}
                      placeholder="(11) 98765-4321"
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">E-mail</label>
                    <input
                      type="email"
                      value={affiliateForm.email}
                      onChange={e => setAffiliateForm({ ...affiliateForm, email: e.target.value })}
                      placeholder="carlos@email.com"
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">CPF ou CNPJ</label>
                  <input
                    type="text"
                    value={affiliateForm.cpf_cnpj}
                    onChange={e => setAffiliateForm({ ...affiliateForm, cpf_cnpj: e.target.value })}
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="pt-2 border-t border-zinc-100">
                  <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Dados para Pagamento (PIX)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-600 mb-1">Tipo de Chave</label>
                      <select
                        value={affiliateForm.pix_key_type}
                        onChange={e => setAffiliateForm({ ...affiliateForm, pix_key_type: e.target.value as any })}
                        className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                      >
                        <option value="cpf">CPF</option>
                        <option value="cnpj">CNPJ</option>
                        <option value="email">E-mail</option>
                        <option value="phone">Telefone</option>
                        <option value="random">Aleatória</option>
                        <option value="outro">Outro</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-zinc-600 mb-1">Chave PIX</label>
                      <input
                        type="text"
                        value={affiliateForm.pix_key}
                        onChange={e => setAffiliateForm({ ...affiliateForm, pix_key: e.target.value })}
                        placeholder="Chave para transferências"
                        className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex justify-end space-x-3">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => setIsAffiliateModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-800 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                  >
                    <span>{isProcessing ? 'Salvando no Supabase...' : (editingAffiliate ? 'Salvar Alterações' : 'Cadastrar Afiliado')}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: NOVA / EDITAR INDICAÇÃO */}
      <AnimatePresence>
        {isReferralModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsReferralModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-zinc-900">
                  {editingReferral ? 'Editar Indicação' : 'Nova Indicação'}
                </h3>
                <button onClick={() => setIsReferralModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveReferral} className="p-6 space-y-4">
                {modalError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                    {modalError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Afiliado Responsável *</label>
                  <select
                    required
                    value={referralForm.affiliate_id}
                    onChange={e => setReferralForm({ ...referralForm, affiliate_id: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  >
                    <option value="">Selecione o afiliado...</option>
                    {(state.affiliates || []).map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} {a.referral_code ? `(#${a.referral_code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Nome do Aluno Indicado *</label>
                  <input
                    required
                    type="text"
                    value={referralForm.referred_name}
                    onChange={e => setReferralForm({ ...referralForm, referred_name: e.target.value })}
                    placeholder="Nome completo do potencial aluno"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Vincular a Aluno Já Cadastrado (Opcional)</label>
                  <select
                    value={referralForm.student_id}
                    onChange={e => {
                      const stId = e.target.value;
                      const selectedStudent = (state.students || []).find(s => s.id === stId);
                      setReferralForm({
                        ...referralForm,
                        student_id: stId,
                        referred_name: selectedStudent ? selectedStudent.name : referralForm.referred_name,
                        referred_phone: selectedStudent?.phone || referralForm.referred_phone,
                        referred_email: selectedStudent?.email || referralForm.referred_email,
                      });
                    }}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  >
                    <option value="">Nenhum (aluno novo ou ainda não cadastrado)</option>
                    {(state.students || []).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Telefone</label>
                    <input
                      type="text"
                      value={referralForm.referred_phone}
                      onChange={e => setReferralForm({ ...referralForm, referred_phone: e.target.value })}
                      placeholder="(11) 98765-4321"
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">Data da Indicação</label>
                    <input
                      required
                      type="date"
                      value={referralForm.referral_date}
                      onChange={e => setReferralForm({ ...referralForm, referral_date: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Observações</label>
                  <textarea
                    rows={2}
                    value={referralForm.notes}
                    onChange={e => setReferralForm({ ...referralForm, notes: e.target.value })}
                    placeholder="Informações adicionais..."
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  />
                </div>

                <div className="pt-4 flex justify-end space-x-3">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => setIsReferralModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-800 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                  >
                    <span>{isProcessing ? 'Salvando no Supabase...' : 'Salvar Indicação'}</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: FECHAMENTO DE COMPETÊNCIA */}
      <AnimatePresence>
        {isClosingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsClosingModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-indigo-50/50">
                <div className="flex items-center space-x-2 text-indigo-900">
                  <Lock className="w-5 h-5 text-indigo-600" />
                  <h3 className="text-lg font-bold">
                    Fechar Competência {getCompetenceLabel(selectedCompetence)}
                  </h3>
                </div>
                <button onClick={() => setIsClosingModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {modalError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                    {modalError}
                  </div>
                )}
                <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2 text-sm">
                  <div className="flex justify-between text-zinc-600">
                    <span>Total de conversões pagas:</span>
                    <span className="font-bold text-zinc-900">{competenceAudit.totalValid}</span>
                  </div>
                  <div className="flex justify-between text-zinc-600">
                    <span>Total de comissões apuradas:</span>
                    <span className="font-bold text-emerald-600">{formatCurrency(competenceAudit.totalPayout)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-600">
                    <span>Afiliados contemplados:</span>
                    <span className="font-bold text-zinc-900">
                      {competenceAudit.summaryPerAffiliate.filter(s => s.validCount > 0).length}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-zinc-500 bg-amber-50 p-3 rounded-xl border border-amber-200">
                  <strong>Aviso de Escopo:</strong> Este fechamento registra o snapshot oficial da competência com versionamento auditável. Nenhum lançamento financeiro automático ou pagamento via PIX é disparado nesta etapa.
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Observações do Fechamento</label>
                  <textarea
                    rows={2}
                    value={closingNotes}
                    onChange={e => setClosingNotes(e.target.value)}
                    placeholder="Ex: Fechamento regular da competência aprovado pela diretoria."
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  />
                </div>

                <div className="pt-4 flex justify-end space-x-3">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => setIsClosingModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-800 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleExecuteClosing}
                    disabled={isProcessing}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center space-x-2 disabled:opacity-50"
                  >
                    <Lock className="w-4 h-4" />
                    <span>{isProcessing ? 'Registrando no Supabase...' : 'Confirmar Fechamento'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: REABERTURA DE COMPETÊNCIA */}
      <AnimatePresence>
        {isReopenModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsReopenModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-amber-50/50">
                <div className="flex items-center space-x-2 text-amber-900">
                  <Unlock className="w-5 h-5 text-amber-600" />
                  <h3 className="text-lg font-bold">
                    Reabrir Competência {getCompetenceLabel(selectedCompetence)}
                  </h3>
                </div>
                <button onClick={() => setIsReopenModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {modalError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                    {modalError}
                  </div>
                )}
                <p className="text-sm text-zinc-600">
                  Para auditar alterações posteriores, informe o motivo/justificativa para a reabertura desta competência:
                </p>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">Motivo da Reabertura *</label>
                  <textarea
                    required
                    rows={3}
                    value={reopenReason}
                    onChange={e => setReopenReason(e.target.value)}
                    placeholder="Ex: Necessidade de vincular indicação retroativa autorizada pela coordenação..."
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  />
                </div>

                <div className="pt-4 flex justify-end space-x-3">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={() => setIsReopenModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-800 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleReopenClosing}
                    disabled={!reopenReason.trim() || isProcessing}
                    className={`px-4 py-2 rounded-xl text-sm font-medium flex items-center space-x-2 transition-colors ${
                      reopenReason.trim() && !isProcessing
                        ? 'bg-amber-600 text-white hover:bg-amber-700'
                        : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                    }`}
                  >
                    <Unlock className="w-4 h-4" />
                    <span>{isProcessing ? 'Reabrindo no Supabase...' : 'Confirmar Reabertura'}</span>
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
