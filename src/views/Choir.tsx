import React, { useState, useEffect } from 'react';
import {
  useAppStore,
  ChoirRegistration,
  ChoirCollaborator,
  ChoirRehearsal,
  ChoirAttendanceRecord,
  getStudentChoirConsecutiveAbsences,
  getEligibleChoirCollaboratorsForRehearsal,
  getEligibleChoirSingersForRehearsal,
  parseAttendance
} from '../store';
import {
  Plus, Search, Edit2, Trash2, X, Users, CheckCircle, XCircle, Clock, ChevronDown, Check,
  DollarSign, FileText, UserPlus, Calculator, Printer, Phone, Mail, Percent, TrendingUp,
  Wallet, PieChart, Shield, Calendar, AlertTriangle, CheckCircle2, UserCheck, UserX,
  Repeat, Sparkles, ListChecks, Zap, Award, Info, Filter, AlertCircle, RefreshCw,
  ShieldCheck, Power, RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChoirMonthlyClosingTab } from '../components/ChoirMonthlyClosingTab';
import { ChoirAttendanceTestsModal } from '../components/ChoirAttendanceTestsModal';

export const isChoirRegistrationActive = (r: { active?: boolean; status?: string } | null | undefined): boolean => {
  return r?.active !== false && r?.status !== 'inactive';
};

export const Choir: React.FC = () => {
  const {
    state,
    addChoirRegistration,
    updateChoirRegistration,
    deleteChoirRegistration,
    addChoirVoiceType,
    updateChoirVoiceType,
    deleteChoirVoiceType,
    addChoirCollaborator,
    updateChoirCollaborator,
    deleteChoirCollaborator,
    addChoirRehearsal,
    updateChoirRehearsal,
    deleteChoirRehearsal,
    generateBiweeklyRehearsals,
    cleanDuplicateRehearsals,
    currentUserProfile
  } = useAppStore();

  const isSuperAdmin = currentUserProfile?.role === "super_admin";
  const isCanManage = isSuperAdmin || currentUserProfile?.role === "admin";

  const [activeTab, setActiveTab] = useState<'registrations' | 'rehearsals' | 'collaborators' | 'statement' | 'closing'>('registrations');

  useEffect(() => {
    if (!isSuperAdmin && activeTab === 'statement') {
      setActiveTab('registrations');
    }
  }, [isSuperAdmin, activeTab]);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [registrationStatusFilter, setRegistrationStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [collaboratorSearch, setCollaboratorSearch] = useState('');
  const [collaboratorStatusFilter, setCollaboratorStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [rehearsalSearch, setRehearsalSearch] = useState('');
  const [statementFilterStatus, setStatementFilterStatus] = useState<'approved' | 'all'>('approved');

  // Student registration dropdown search
  const [studentSearch, setStudentSearch] = useState('');
  const [attendanceSearch, setAttendanceSearch] = useState('');
  const [isStudentDropdownOpen, setIsStudentDropdownOpen] = useState(false);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVoiceTypeModalOpen, setIsVoiceTypeModalOpen] = useState(false);
  const [isCollaboratorModalOpen, setIsCollaboratorModalOpen] = useState(false);

  // Rehearsal & Attendance Modals
  const [isRehearsalModalOpen, setIsRehearsalModalOpen] = useState(false);
  const [isBiweeklyModalOpen, setIsBiweeklyModalOpen] = useState(false);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);

  // Edit states
  const [editingRegistration, setEditingRegistration] = useState<ChoirRegistration | null>(null);
  const [editingVoiceType, setEditingVoiceType] = useState<any | null>(null);
  const [editingCollaborator, setEditingCollaborator] = useState<ChoirCollaborator | null>(null);
  const [editingRehearsal, setEditingRehearsal] = useState<ChoirRehearsal | null>(null);
  const [selectedRehearsalForAttendance, setSelectedRehearsalForAttendance] = useState<ChoirRehearsal | null>(null);
  const [isAttendanceTestsModalOpen, setIsAttendanceTestsModalOpen] = useState(false);

  // Attendance draft state: key is student_id or collaborator_id
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, { status: 'present' | 'absent' | 'justified'; notes?: string }>>({});
  const [activeAttendanceSection, setActiveAttendanceSection] = useState<'singers' | 'collaborators'>('singers');
  const [selectedVoiceFilter, setSelectedVoiceFilter] = useState<string>('all');

  // Form states
  const [voiceTypeFormData, setVoiceTypeFormData] = useState({ name: '', max_slots: 0 });
  const [error, setError] = useState<string | null>(null);
  const [voiceTypeError, setVoiceTypeError] = useState<string | null>(null);
  const [voiceTypeToDelete, setVoiceTypeToDelete] = useState<string | null>(null);
  const [registrationToDeactivate, setRegistrationToDeactivate] = useState<ChoirRegistration | null>(null);
  const [isDeactivatingRegistration, setIsDeactivatingRegistration] = useState(false);
  const [collaboratorToDeactivate, setCollaboratorToDeactivate] = useState<ChoirCollaborator | null>(null);
  const [isDeactivatingCollaborator, setIsDeactivatingCollaborator] = useState(false);
  const [rehearsalToDelete, setRehearsalToDelete] = useState<ChoirRehearsal | null>(null);
  const [isDeletingRehearsal, setIsDeletingRehearsal] = useState(false);
  const [rehearsalDeleteError, setRehearsalDeleteError] = useState<string | null>(null);

  const [formData, setFormData] = useState<Omit<ChoirRegistration, 'id'>>({
    student_id: '',
    voice_type_id: '',
    status: 'pending',
    monthly_fee: 150,
    is_internal_student: false,
  });

  const [collaboratorFormData, setCollaboratorFormData] = useState<Omit<ChoirCollaborator, 'id'>>({
    name: '',
    role: 'Regente',
    teacher_id: '',
    remuneration_type: 'per_rehearsal',
    remuneration_value: 100,
    phone: '',
    email: '',
    notes: '',
  });

  const [importSearchQuery, setImportSearchQuery] = useState('');
  const [isImportDropdownOpen, setIsImportDropdownOpen] = useState(false);
  const [importFeedback, setImportFeedback] = useState('');

  const [rehearsalFormData, setRehearsalFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    time: '19:30',
    title: 'Ensaio Quinzenal do Coral',
    notes: '',
  });

  const [biweeklyFormData, setBiweeklyFormData] = useState({
    startDate: new Date().toISOString().split('T')[0],
    count: 6,
    time: '19:30',
    titlePrefix: 'Ensaio Quinzenal do Coral',
  });

  // Calculate students with 3+ consecutive absences alert (approved active members)
  const approvedRegistrations = state.choirRegistrations.filter(r => r.status === 'approved' && r.active !== false);

  const studentsWithConsecutiveAbsenceAlert = approvedRegistrations
    .map(reg => {
      const student = state.students.find(s => s.id === reg.student_id);
      const voiceType = state.choirVoiceTypes.find(v => v.id === reg.voice_type_id);
      const consecutive = getStudentChoirConsecutiveAbsences(reg.student_id, state.choirRehearsals || []);
      return {
        registration: reg,
        student,
        voiceType,
        consecutiveAbsences: consecutive
      };
    })
    .filter(item => item.consecutiveAbsences >= 3);

  // Filter registration (singers) counts
  const activeRegistrationsCount = (state.choirRegistrations || []).filter(r => isChoirRegistrationActive(r)).length;
  const inactiveRegistrationsCount = (state.choirRegistrations || []).filter(r => !isChoirRegistrationActive(r)).length;
  const totalRegistrationsCount = (state.choirRegistrations || []).length;

  // Filtering registrations
  const filteredRegistrations = (state.choirRegistrations || []).filter(r => {
    const isActive = isChoirRegistrationActive(r);
    if (registrationStatusFilter === 'active' && !isActive) {
      return false;
    }
    if (registrationStatusFilter === 'inactive' && isActive) {
      return false;
    }
    const student = state.students.find(s => s.id === r.student_id);
    return (student?.name || "").toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Filter collaborator counts
  const activeCollaboratorsCount = (state.choirCollaborators || []).filter(c => c.active !== false).length;
  const inactiveCollaboratorsCount = (state.choirCollaborators || []).filter(c => c.active === false).length;
  const totalCollaboratorsCount = (state.choirCollaborators || []).length;

  // Filtering collaborators
  const filteredCollaborators = (state.choirCollaborators || []).filter(c => {
    const isInactive = c.active === false;
    if (collaboratorStatusFilter === 'active' && isInactive) {
      return false;
    }
    if (collaboratorStatusFilter === 'inactive' && !isInactive) {
      return false;
    }
    const search = collaboratorSearch.toLowerCase();
    return (c.name || '').toLowerCase().includes(search) ||
      (c.role || '').toLowerCase().includes(search) ||
      (c.phone || '').includes(search) ||
      (c.email || '').toLowerCase().includes(search);
  });

  // Filtering rehearsals
  const sortedRehearsals = [...(state.choirRehearsals || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const filteredRehearsals = sortedRehearsals.filter(r => {
    return (r.title || '').toLowerCase().includes(rehearsalSearch.toLowerCase()) ||
      (r.date || '').includes(rehearsalSearch) ||
      (r.notes || '').toLowerCase().includes(rehearsalSearch.toLowerCase());
  });

  const getVoiceTypeStats = (voiceTypeId: string) => {
    const voiceType = state.choirVoiceTypes.find(v => v.id === voiceTypeId);
    if (!voiceType) return { total: 0, max: 0, available: 0 };

    const approvedCount = state.choirRegistrations.filter(
      r => r.voice_type_id === voiceTypeId && r.status === 'approved' && r.active !== false
    ).length;

    return {
      total: approvedCount,
      max: voiceType.max_slots,
      available: Math.max(0, voiceType.max_slots - approvedCount)
    };
  };

  const handleStudentChange = (studentId: string) => {
    const hasActiveEnrollment = state.enrollments.some(e => e.student_id === studentId && e.status === 'active');

    setFormData({
      ...formData,
      student_id: studentId,
      is_internal_student: hasActiveEnrollment,
      monthly_fee: hasActiveEnrollment ? 20 : 150
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (formData.status === 'approved') {
      const stats = getVoiceTypeStats(formData.voice_type_id);
      const isCurrentlyApproved = editingRegistration?.status === 'approved' && editingRegistration?.active !== false;

      if (!isCurrentlyApproved && stats.available <= 0) {
        setError('Não há vagas disponíveis para este naipe.');
        return;
      }
    }

    const payload: Partial<ChoirRegistration> = {
      ...formData,
      active: formData.status === 'inactive' ? false : formData.status === 'approved' ? true : undefined,
    };

    if (editingRegistration) {
      updateChoirRegistration(editingRegistration.id, payload);
    } else {
      addChoirRegistration(payload as any);
    }
    closeModal();
  };

  const handleOpenVoiceTypeModal = () => {
    setEditingVoiceType(null);
    setVoiceTypeFormData({ name: '', max_slots: 20 });
    setVoiceTypeError(null);
    setVoiceTypeToDelete(null);
    setIsVoiceTypeModalOpen(true);
  };

  const handleEditVoiceType = (vt: { id: string; name: string; max_slots: number }) => {
    setEditingVoiceType(vt);
    setVoiceTypeFormData({ name: vt.name, max_slots: vt.max_slots });
    setVoiceTypeError(null);
  };

  const handleCancelVoiceTypeEdit = () => {
    setEditingVoiceType(null);
    setVoiceTypeFormData({ name: '', max_slots: 20 });
    setVoiceTypeError(null);
  };

  const handleVoiceTypeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setVoiceTypeError(null);

    const trimmedName = voiceTypeFormData.name.trim();
    if (!trimmedName) {
      setVoiceTypeError('O nome do naipe é obrigatório.');
      return;
    }

    const slots = Number(voiceTypeFormData.max_slots);
    if (isNaN(slots) || slots < 0) {
      setVoiceTypeError('O limite de vagas deve ser um número maior ou igual a zero.');
      return;
    }

    if (editingVoiceType) {
      updateChoirVoiceType(editingVoiceType.id, {
        name: trimmedName,
        max_slots: slots,
      });
    } else {
      addChoirVoiceType({
        name: trimmedName,
        max_slots: slots,
      });
    }

    setEditingVoiceType(null);
    setVoiceTypeFormData({ name: '', max_slots: 20 });
  };

  const handleDeleteVoiceType = (id: string) => {
    const isUsed = state.choirRegistrations.some(r => r.voice_type_id === id);
    if (isUsed) {
      setVoiceTypeError('Não é possível excluir este naipe pois existem alunos cadastrados nele.');
      return;
    }
    deleteChoirVoiceType(id);
    setVoiceTypeToDelete(null);
    setVoiceTypeError(null);
  };

  const handleCollaboratorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!collaboratorFormData.name.trim()) {
      return;
    }

    if (editingCollaborator) {
      updateChoirCollaborator(editingCollaborator.id, collaboratorFormData);
    } else {
      addChoirCollaborator(collaboratorFormData);
    }
    closeCollaboratorModal();
  };

  const handleRehearsalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rehearsalFormData.date) return;

    if (editingRehearsal) {
      updateChoirRehearsal(editingRehearsal.id, {
        date: rehearsalFormData.date,
        time: rehearsalFormData.time,
        title: rehearsalFormData.title,
        notes: rehearsalFormData.notes,
      });
    } else {
      addChoirRehearsal({
        date: rehearsalFormData.date,
        time: rehearsalFormData.time,
        title: rehearsalFormData.title || 'Ensaio Quinzenal do Coral',
        notes: rehearsalFormData.notes,
        attendance: [],
      });
    }
    closeRehearsalModal();
  };

  const handleBiweeklySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!biweeklyFormData.startDate) return;

    generateBiweeklyRehearsals(
      biweeklyFormData.startDate,
      Number(biweeklyFormData.count) || 6,
      biweeklyFormData.time || '19:30',
      biweeklyFormData.titlePrefix || 'Ensaio Quinzenal do Coral'
    );

    setIsBiweeklyModalOpen(false);
    setActiveTab('rehearsals');
  };

  const openAttendanceModal = (rehearsal: ChoirRehearsal) => {
    setSelectedRehearsalForAttendance(rehearsal);

    // Build initial draft map from existing attendance records or default to 'present'
    const draft: Record<string, { status: 'present' | 'absent' | 'justified'; notes?: string }> = {};
    const attendanceRecords = parseAttendance(rehearsal.attendance);

    // Singers:
    // For rehearsals from 01/09/2026+: ONLY active singers (active !== false && status === 'approved').
    // For rehearsals up to 31/08/2026: all historical singers are preserved.
    const eligibleSingers = getEligibleChoirSingersForRehearsal(rehearsal, state.choirRegistrations || []);
    eligibleSingers.forEach(reg => {
      const rec = attendanceRecords.find(a => a.person_id === reg.student_id && a.type === 'singer');
      draft[reg.student_id] = {
        status: rec?.status || 'present',
        notes: rec?.notes || '',
      };
    });

    // Collaborators:
    // For rehearsals from 01/09/2026+: ONLY active collaborators (active !== false).
    // For rehearsals up to 31/08/2026: all historical collaborators are preserved.
    const eligibleCollabs = getEligibleChoirCollaboratorsForRehearsal(rehearsal, state.choirCollaborators || []);
    eligibleCollabs.forEach(collab => {
      const rec = attendanceRecords.find(a => a.person_id === collab.id && a.type === 'collaborator');
      draft[collab.id] = {
        status: rec?.status || 'present',
        notes: rec?.notes || '',
      };
    });

    setAttendanceDraft(draft);
    setAttendanceSearch('');
    setIsAttendanceModalOpen(true);
  };

  const handleSaveAttendance = () => {
    if (!selectedRehearsalForAttendance) return;

    const newAttendanceRecords: ChoirAttendanceRecord[] = [];

    // Singers: strictly save records for eligible singers for this rehearsal
    const eligibleSingers = getEligibleChoirSingersForRehearsal(selectedRehearsalForAttendance, state.choirRegistrations || []);
    eligibleSingers.forEach(reg => {
      const d = attendanceDraft[reg.student_id];
      if (d) {
        newAttendanceRecords.push({
          person_id: reg.student_id,
          type: 'singer',
          status: d.status,
          notes: d.notes,
        });
      }
    });

    // Collaborators: strictly save records for eligible collaborators for this rehearsal
    const eligibleCollabs = getEligibleChoirCollaboratorsForRehearsal(selectedRehearsalForAttendance, state.choirCollaborators || []);
    eligibleCollabs.forEach(collab => {
      const d = attendanceDraft[collab.id];
      if (d) {
        newAttendanceRecords.push({
          person_id: collab.id,
          type: 'collaborator',
          status: d.status,
          notes: d.notes,
        });
      }
    });

    updateChoirRehearsal(selectedRehearsalForAttendance.id, {
      attendance: newAttendanceRecords,
    });

    setIsAttendanceModalOpen(false);
    setSelectedRehearsalForAttendance(null);
  };

  const setAllAttendanceStatus = (type: 'singers' | 'collaborators', status: 'present' | 'absent') => {
    const updated = { ...attendanceDraft };
    if (type === 'singers') {
      const eligibleSingers = getEligibleChoirSingersForRehearsal(selectedRehearsalForAttendance, state.choirRegistrations || []);
      eligibleSingers.forEach(reg => {
        updated[reg.student_id] = { ...updated[reg.student_id], status };
      });
    } else {
      const eligibleCollabs = getEligibleChoirCollaboratorsForRehearsal(selectedRehearsalForAttendance, state.choirCollaborators || []);
      eligibleCollabs.forEach(collab => {
        updated[collab.id] = { ...updated[collab.id], status };
      });
    }
    setAttendanceDraft(updated);
  };

  const openModal = (registration?: ChoirRegistration) => {
    setStudentSearch('');
    setIsStudentDropdownOpen(false);
    if (registration) {
      const hasActiveEnrollment = state.enrollments.some(e => e.student_id === registration.student_id && e.status === 'active');

      setEditingRegistration(registration);
      setFormData({
        ...registration,
        status: (registration.status === 'inactive' || registration.active === false) ? 'inactive' : registration.status,
        is_internal_student: hasActiveEnrollment,
        monthly_fee: hasActiveEnrollment ? 20 : 150
      });
    } else {
      setEditingRegistration(null);
      setFormData({
        student_id: '',
        voice_type_id: '',
        status: 'pending',
        monthly_fee: 150,
        is_internal_student: false,
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRegistration(null);
    setError(null);
    setStudentSearch('');
    setIsStudentDropdownOpen(false);
  };

  const openCollaboratorModal = (collaborator?: ChoirCollaborator) => {
    setImportSearchQuery('');
    setIsImportDropdownOpen(false);
    setImportFeedback('');
    if (collaborator) {
      setEditingCollaborator(collaborator);
      setCollaboratorFormData({
        name: collaborator.name || '',
        role: collaborator.role || 'Assistente de Naipe',
        teacher_id: collaborator.teacher_id || '',
        remuneration_type: collaborator.remuneration_type || 'per_rehearsal',
        remuneration_value: collaborator.remuneration_value !== undefined && collaborator.remuneration_value !== null ? collaborator.remuneration_value : 45,
        phone: collaborator.phone || '',
        email: collaborator.email || '',
        notes: collaborator.notes || '',
      });
    } else {
      setEditingCollaborator(null);
      setCollaboratorFormData({
        name: '',
        role: 'Assistente de Naipe',
        teacher_id: '',
        remuneration_type: 'per_rehearsal',
        remuneration_value: 45,
        phone: '',
        email: '',
        notes: '',
      });
    }
    setIsCollaboratorModalOpen(true);
  };

  const closeCollaboratorModal = () => {
    setIsCollaboratorModalOpen(false);
    setEditingCollaborator(null);
    setIsImportDropdownOpen(false);
    setImportFeedback('');
  };

  const openRehearsalModal = (rehearsal?: ChoirRehearsal) => {
    if (rehearsal) {
      setEditingRehearsal(rehearsal);
      setRehearsalFormData({
        date: rehearsal.date || new Date().toISOString().split('T')[0],
        time: rehearsal.time || '19:30',
        title: rehearsal.title || 'Ensaio Quinzenal do Coral',
        notes: rehearsal.notes || '',
      });
    } else {
      setEditingRehearsal(null);
      setRehearsalFormData({
        date: new Date().toISOString().split('T')[0],
        time: '19:30',
        title: 'Ensaio Quinzenal do Coral',
        notes: '',
      });
    }
    setIsRehearsalModalOpen(true);
  };

  const closeRehearsalModal = () => {
    setIsRehearsalModalOpen(false);
    setEditingRehearsal(null);
  };

  const getStatusBadge = (status: string, active?: boolean) => {
    if (status === 'inactive' || active === false) {
      return (
        <span className="px-2.5 py-1 inline-flex items-center text-xs font-semibold rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200">
          <UserX className="w-3 h-3 mr-1 text-zinc-500" /> Inativo
        </span>
      );
    }
    switch (status) {
      case 'approved':
        return <span className="px-2.5 py-1 inline-flex items-center text-xs font-medium rounded-full bg-emerald-100 text-emerald-800"><CheckCircle className="w-3 h-3 mr-1" /> Aprovado</span>;
      case 'rejected':
        return <span className="px-2.5 py-1 inline-flex items-center text-xs font-medium rounded-full bg-rose-100 text-rose-800"><XCircle className="w-3 h-3 mr-1" /> Rejeitado</span>;
      default:
        return <span className="px-2.5 py-1 inline-flex items-center text-xs font-medium rounded-full bg-amber-100 text-amber-800"><Clock className="w-3 h-3 mr-1" /> Pendente</span>;
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  // --- Financial & Remuneration Calculations ---
  const activeStatementRegistrations = statementFilterStatus === 'approved'
    ? state.choirRegistrations.filter(r => r.status === 'approved')
    : state.choirRegistrations.filter(r => r.status !== 'rejected');

  const approvedCountForCalc = state.choirRegistrations.filter(r => r.status === 'approved').length;
  const totalStudentsForCalc = activeStatementRegistrations.length;

  const totalChoirRevenue = activeStatementRegistrations.reduce((acc, r) => acc + (r.monthly_fee || 0), 0);

  // Calculate remuneration for each collaborator based on attendance and rule
  const calculateCollaboratorPayout = (collab: ChoirCollaborator) => {
    const rehearsals = state.choirRehearsals || [];
    const totalRehearsalsCount = rehearsals.length;

    // Filter rehearsals where collaborator was present
    const presentRehearsals = rehearsals.filter(r => {
      const attendance = parseAttendance(r.attendance);
      const rec = attendance.find(a => a.person_id === collab.id && a.type === 'collaborator');
      return rec?.status === 'present';
    });
    const presentCount = presentRehearsals.length;

    if (collab.remuneration_type === 'per_rehearsal') {
      const payout = presentCount * (collab.remuneration_value || 0);
      return {
        payout,
        presentCount,
        totalRehearsalsCount,
        explain: totalRehearsalsCount > 0
          ? `${presentCount} de ${totalRehearsalsCount} ensaios com presença (R$ ${collab.remuneration_value || 0} / ensaio)`
          : `R$ ${collab.remuneration_value || 0} por ensaio presente (nenhum ensaio realizado)`
      };
    } else if (collab.remuneration_type === 'fixed') {
      if (totalRehearsalsCount > 0) {
        const ratio = presentCount / totalRehearsalsCount;
        const payout = (collab.remuneration_value || 0) * ratio;
        return {
          payout,
          presentCount,
          totalRehearsalsCount,
          explain: `${presentCount}/${totalRehearsalsCount} ensaios presentes (${Math.round(ratio * 100)}% de R$ ${collab.remuneration_value || 0})`
        };
      }
      return {
        payout: collab.remuneration_value || 0,
        presentCount,
        totalRehearsalsCount,
        explain: `Valor fixo mensal: ${formatCurrency(collab.remuneration_value || 0)}`
      };
    } else if (collab.remuneration_type === 'percentage') {
      const basePayout = (totalChoirRevenue * (collab.remuneration_value || 0)) / 100;
      if (totalRehearsalsCount > 0) {
        const ratio = presentCount / totalRehearsalsCount;
        return {
          payout: basePayout * ratio,
          presentCount,
          totalRehearsalsCount,
          explain: `${collab.remuneration_value}% da receita (${presentCount}/${totalRehearsalsCount} ensaios presentes)`
        };
      }
      return {
        payout: basePayout,
        presentCount,
        totalRehearsalsCount,
        explain: `${collab.remuneration_value}% sobre a receita do coral`
      };
    } else if (collab.remuneration_type === 'per_student') {
      let totalStudentPresents = 0;
      if (totalRehearsalsCount > 0) {
        presentRehearsals.forEach(r => {
          const attendance = parseAttendance(r.attendance);
          const studentPresentsInRehearsal = attendance.filter(
            a => a.type === 'singer' && a.status === 'present'
          ).length;
          totalStudentPresents += studentPresentsInRehearsal;
        });
        return {
          payout: totalStudentPresents * (collab.remuneration_value || 0),
          presentCount,
          totalRehearsalsCount,
          explain: `${totalStudentPresents} presenças de alunos em ${presentCount} ensaio(s) x ${formatCurrency(collab.remuneration_value || 0)}`
        };
      }
      const count = statementFilterStatus === 'approved' ? approvedCountForCalc : totalStudentsForCalc;
      return {
        payout: (collab.remuneration_value || 0) * count,
        presentCount,
        totalRehearsalsCount,
        explain: `${count} alunos x ${formatCurrency(collab.remuneration_value || 0)}`
      };
    }

    return { payout: 0, presentCount: 0, totalRehearsalsCount: 0, explain: '-' };
  };

  const totalCollaboratorPayouts = (state.choirCollaborators || []).reduce(
    (acc, c) => acc + calculateCollaboratorPayout(c).payout, 0
  );
  const netSchoolShare = totalChoirRevenue - totalCollaboratorPayouts;
  const marginPercent = totalChoirRevenue > 0 ? (netSchoolShare / totalChoirRevenue) * 100 : 0;

  const getRemunerationRuleText = (collab: ChoirCollaborator) => {
    const valFormatted = formatCurrency(collab.remuneration_value !== undefined && collab.remuneration_value !== null ? collab.remuneration_value : 0);
    const type = collab.remuneration_type || 'per_rehearsal';
    if (type === 'per_rehearsal') {
      return `Remuneração por Presença: ${valFormatted} por ensaio`;
    } else if (type === 'fixed') {
      return `Fixo: ${valFormatted} / mês`;
    } else if (type === 'percentage') {
      return `${collab.remuneration_value || 0}% da receita do coral`;
    } else if (type === 'per_student') {
      return `${valFormatted} por presença de aluno`;
    }
    return `Remuneração por Presença: ${valFormatted} por ensaio`;
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
            <span>Coral</span>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-800">
              Ensaios Quinzenais
            </span>
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Gestão de vagas, naipes, chamadas de ensaios quinzenais, alertas de faltas e remuneração de colaboradores por presença.
          </p>
        </div>
        {isCanManage && (
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {activeTab === 'registrations' && (
              <>
                <button
                  onClick={handleOpenVoiceTypeModal}
                  className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Gerenciar Naipes
                </button>
                <button
                  onClick={() => openModal()}
                  className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Inscrição
                </button>
              </>
            )}

            {activeTab === 'rehearsals' && (
              <>
                <button
                  onClick={() => setIsAttendanceTestsModalOpen(true)}
                  className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors shadow-sm"
                  title="Executar bateria de testes canônicos das chamadas"
                >
                  <ShieldCheck className="w-4 h-4 mr-2 text-emerald-600" />
                  Auditoria Chamadas (7 Testes)
                </button>
                <button
                  onClick={() => setIsBiweeklyModalOpen(true)}
                  className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 transition-colors shadow-sm"
                >
                  <Repeat className="w-4 h-4 mr-2 text-indigo-600" />
                  Gerar Ensaios Quinzenais
                </button>
                <button
                  onClick={() => openRehearsalModal()}
                  className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Ensaio
                </button>
              </>
            )}

            {activeTab === 'collaborators' && (
              <button
                onClick={() => openCollaboratorModal()}
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Novo Colaborador
              </button>
            )}

            {activeTab === 'statement' && isSuperAdmin && (
              <button
                onClick={() => {
                  try {
                    window.focus();
                    setTimeout(() => window.print(), 100);
                  } catch (e) {
                    window.print();
                  }
                }}
                className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 rounded-xl hover:bg-zinc-50 transition-colors shadow-sm"
              >
                <Printer className="w-4 h-4 mr-2 text-zinc-600" />
                Imprimir Extrato
              </button>
            )}
          </div>
        )}
      </div>

      {/* Global Alert Banner for 3+ Consecutive Absences */}
      {studentsWithConsecutiveAbsenceAlert.length > 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-xl shadow-sm flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0 animate-bounce" />
            <div>
              <h4 className="text-sm font-bold text-amber-900">
                Alerta de Faltas Consecutivas! ({studentsWithConsecutiveAbsenceAlert.length} aluno{studentsWithConsecutiveAbsenceAlert.length > 1 ? 's' : ''})
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                Os seguintes alunos possuem 3 ou mais faltas consecutivas nos ensaios do coral e precisam de acompanhamento:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {studentsWithConsecutiveAbsenceAlert.map(item => (
                  <span key={item.registration.id} className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 border border-amber-300 text-amber-900 rounded-lg text-xs font-semibold">
                    <span className="font-bold">{item.student?.name || 'Aluno'}</span>
                    <span className="text-amber-700">({item.voiceType?.name || 'Naipe'})</span>
                    <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded font-bold text-[10px]">
                      {item.consecutiveAbsences} faltas
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('rehearsals')}
            className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-200 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap"
          >
            Ver Ensaios
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-zinc-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          <button
            onClick={() => setActiveTab('registrations')}
            className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
              activeTab === 'registrations'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
            }`}
          >
            <Users className="w-4 h-4 mr-2" />
            Inscrições e Naipes
          </button>

          <button
            onClick={() => setActiveTab('rehearsals')}
            className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
              activeTab === 'rehearsals'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
            }`}
          >
            <Calendar className="w-4 h-4 mr-2" />
            Ensaios e Presença
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100">
              {(state.choirRehearsals || []).length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('collaborators')}
            className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
              activeTab === 'collaborators'
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
            }`}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Colaboradores do Coral
            <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-zinc-100 text-zinc-600 font-semibold">
              {(state.choirCollaborators || []).length}
            </span>
          </button>

          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab('statement')}
              className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === 'statement'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              }`}
            >
              <FileText className="w-4 h-4 mr-2" />
              Extrato Financeiro do Coral
            </button>
          )}

          {isCanManage && (
            <button
              onClick={() => setActiveTab('closing')}
              className={`py-4 px-1 inline-flex items-center border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                activeTab === 'closing'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              }`}
            >
              <ShieldCheck className="w-4 h-4 mr-2 text-amber-600" />
              Fechamento Mensal
              <span className="ml-2 px-2 py-0.5 text-[11px] rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-300">
                Simulação
              </span>
            </button>
          )}
        </nav>
      </div>

      {/* TAB 1: INSCRICOES E NAIPES */}
      {activeTab === 'registrations' && (
        <div className="space-y-6">
          {/* Voice Types Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {state.choirVoiceTypes.map(voice => {
              const stats = getVoiceTypeStats(voice.id);
              const isFull = stats.available <= 0;

              return (
                <div key={voice.id} className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-500">{voice.name}</p>
                    <div className="mt-1 flex items-baseline">
                      <p className="text-2xl font-semibold text-zinc-900">{stats.total}</p>
                      <p className="ml-1 text-sm text-zinc-500">/ {stats.max}</p>
                    </div>
                  </div>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isFull ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    <Users className="w-6 h-6" />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-zinc-100 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
              <div className="relative max-w-md w-full">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-zinc-400" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar aluno no coral..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl leading-5 bg-zinc-50 placeholder-zinc-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                />
              </div>

              <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-xl border border-zinc-200 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setRegistrationStatusFilter('active')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    registrationStatusFilter === 'active'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-zinc-600 hover:text-emerald-700'
                  }`}
                >
                  Ativos ({activeRegistrationsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setRegistrationStatusFilter('inactive')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    registrationStatusFilter === 'inactive'
                      ? 'bg-white text-zinc-800 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Inativos ({inactiveRegistrationsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setRegistrationStatusFilter('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    registrationStatusFilter === 'all'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Todos ({totalRegistrationsCount})
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="bg-zinc-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Aluno</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Naipe</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Presença em Ensaios</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Tipo</th>
                    {isSuperAdmin && (
                      <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Mensalidade</th>
                    )}
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-zinc-200">
                  {filteredRegistrations.length > 0 ? (
                    filteredRegistrations.map((reg) => {
                      const student = state.students.find(s => s.id === reg.student_id);
                      const voiceType = state.choirVoiceTypes.find(v => v.id === reg.voice_type_id);
                      const consecutiveAbsences = getStudentChoirConsecutiveAbsences(reg.student_id, state.choirRehearsals || []);
                      const has3AbsencesAlert = consecutiveAbsences >= 3;

                      return (
                        <tr key={reg.id} className={`hover:bg-zinc-50 transition-colors ${has3AbsencesAlert ? 'bg-amber-50/40' : ''}`}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-zinc-900">{student?.name || 'Aluno não encontrado'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-zinc-900">{voiceType?.name || '-'}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {has3AbsencesAlert ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                                {consecutiveAbsences} Faltas Consecutivas!
                              </span>
                            ) : consecutiveAbsences > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-zinc-100 text-zinc-700">
                                {consecutiveAbsences} falta(s) recente(s)
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700">
                                <CheckCircle className="w-3 h-3 text-emerald-500" />
                                Regular
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${
                              reg.is_internal_student ? 'bg-indigo-100 text-indigo-800' : 'bg-zinc-100 text-zinc-800'
                            }`}>
                              {reg.is_internal_student ? 'Interno' : 'Externo'}
                            </span>
                          </td>
                          {isSuperAdmin && (
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-zinc-900">
                                {formatCurrency(reg.monthly_fee)}
                              </div>
                            </td>
                          )}
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(reg.status, reg.active)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end space-x-1.5">
                              {isCanManage && (
                                <>
                                  <button
                                    onClick={() => openModal(reg)}
                                    className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                    title="Editar Inscrição"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>

                                  {reg.status === 'inactive' || reg.active === false ? (
                                    <button
                                      onClick={async () => {
                                        await updateChoirRegistration(reg.id, {
                                          status: 'approved',
                                          active: true,
                                        });
                                      }}
                                      className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-1"
                                      title="Reativar Participante"
                                    >
                                      <UserCheck className="w-4 h-4" />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => setRegistrationToDeactivate(reg)}
                                      className="p-1.5 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                      title="Inativar Participante"
                                    >
                                      <UserX className="w-4 h-4" />
                                    </button>
                                  )}

                                  <button
                                    onClick={() => {
                                      if (window.confirm('Tem certeza que deseja excluir esta inscrição? Esta ação não pode ser desfeita.')) {
                                        deleteChoirRegistration(reg.id);
                                      }
                                    }}
                                    className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                    title="Excluir Inscrição"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={isSuperAdmin ? 7 : 6} className="px-6 py-8 text-center text-sm text-zinc-500">
                        {registrationStatusFilter === 'inactive'
                          ? 'Nenhum cantor/aluno inativo encontrado.'
                          : registrationStatusFilter === 'active'
                          ? 'Nenhum cantor/aluno ativo encontrado.'
                          : 'Nenhuma inscrição encontrada.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ENSAIOS E PRESENÇA (QUINZENAL) */}
      {activeTab === 'rehearsals' && (
        <div className="space-y-6">
          {/* Rehearsals Header Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
            <div>
              <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                Cronograma de Ensaios Quinzenais
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                O coral realiza ensaios a cada 14 dias (quinzenal). Lance chamadas para naipes e colaboradores.
              </p>
            </div>
            {isCanManage && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => cleanDuplicateRehearsals()}
                  title="Mesclar datas duplicadas e consolidar presenças"
                  className="px-3 py-2 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-xl transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Corrigir Duplicidades
                </button>
                <button
                  onClick={() => setIsBiweeklyModalOpen(true)}
                  className="px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-xl transition-colors flex items-center gap-1.5"
                >
                  <Repeat className="w-4 h-4" />
                  Gerar Ensaios Quinzenais
                </button>
                <button
                  onClick={() => openRehearsalModal()}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  Novo Ensaio
                </button>
              </div>
            )}
          </div>

          {/* Search bar for rehearsals */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-zinc-100">
              <div className="relative max-w-md">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-zinc-400" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar por data, título do ensaio ou observações..."
                  value={rehearsalSearch}
                  onChange={(e) => setRehearsalSearch(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl leading-5 bg-zinc-50 placeholder-zinc-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="bg-zinc-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Data / Horário</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Título do Ensaio</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Presença de Alunos (Naipes)</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Colaboradores Presentes</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-zinc-200">
                  {filteredRehearsals.length > 0 ? (
                    filteredRehearsals.map((rehearsal) => {
                      const attendance = parseAttendance(rehearsal.attendance);
                      const singerRecords = attendance.filter(a => a.type === 'singer');
                      const collabRecords = attendance.filter(a => a.type === 'collaborator');

                      const singerPresents = singerRecords.filter(a => a.status === 'present').length;
                      const collabPresents = collabRecords.filter(a => a.status === 'present').length;

                      const hasRecordedAttendance = attendance.length > 0;
                      const eligibleCollabs = getEligibleChoirCollaboratorsForRehearsal(rehearsal, state.choirCollaborators || []);
                      const eligibleSingers = getEligibleChoirSingersForRehearsal(rehearsal, state.choirRegistrations || []);

                      return (
                        <tr key={rehearsal.id} className="hover:bg-zinc-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-bold text-zinc-900">
                              {rehearsal.date ? new Date(rehearsal.date + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
                            </div>
                            <div className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3 text-zinc-400" />
                              {rehearsal.time || '19:30'}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-semibold text-zinc-900">{rehearsal.title}</div>
                            {rehearsal.notes && (
                              <div className="text-xs text-zinc-500 mt-0.5">{rehearsal.notes}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {hasRecordedAttendance ? (
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  {singerPresents} / {eligibleSingers.length} Presentes
                                </span>
                              </div>
                            ) : (
                              <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                Pendente de Chamada
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {hasRecordedAttendance ? (
                              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {collabPresents} / {eligibleCollabs.length} Colaboradores
                              </span>
                            ) : (
                              <span className="text-xs text-zinc-400">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => openAttendanceModal(rehearsal)}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                              >
                                <ListChecks className="w-3.5 h-3.5" />
                                {hasRecordedAttendance ? 'Editar Chamada' : 'Lançar Chamada'}
                              </button>
                              {isCanManage && (
                                <>
                                  <button
                                    onClick={() => openRehearsalModal(rehearsal)}
                                    className="p-1.5 text-zinc-400 hover:text-indigo-600 transition-colors"
                                    title="Editar Ensaio"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setRehearsalDeleteError(null);
                                      setRehearsalToDelete(rehearsal);
                                    }}
                                    className="p-1.5 text-zinc-400 hover:text-rose-600 transition-colors"
                                    title="Excluir Ensaio"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center">
                        <Calendar className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                        <h4 className="text-sm font-semibold text-zinc-800">Nenhum ensaio quinzenal cadastrado</h4>
                        <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                          Clique em &quot;Gerar Ensaios Quinzenais&quot; para agendar automaticamente os ensaios do coral a cada 14 dias!
                        </p>
                        <button
                          onClick={() => setIsBiweeklyModalOpen(true)}
                          className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl inline-flex items-center gap-2 shadow-sm"
                        >
                          <Repeat className="w-4 h-4" />
                          Gerar Ensaios Quinzenais
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: COLABORADORES DO CORAL */}
      {activeTab === 'collaborators' && (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="relative max-w-md w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-zinc-400" />
              </div>
              <input
                type="text"
                placeholder="Buscar colaborador ou função..."
                value={collaboratorSearch}
                onChange={(e) => setCollaboratorSearch(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl leading-5 bg-zinc-50 placeholder-zinc-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-1 p-1 bg-zinc-100 rounded-xl border border-zinc-200">
                <button
                  type="button"
                  onClick={() => setCollaboratorStatusFilter('active')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    collaboratorStatusFilter === 'active'
                      ? 'bg-white text-emerald-700 shadow-sm'
                      : 'text-zinc-600 hover:text-emerald-700'
                  }`}
                >
                  Ativos ({activeCollaboratorsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCollaboratorStatusFilter('inactive')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    collaboratorStatusFilter === 'inactive'
                      ? 'bg-white text-zinc-800 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Inativos ({inactiveCollaboratorsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCollaboratorStatusFilter('all')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    collaboratorStatusFilter === 'all'
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  Todos ({totalCollaboratorsCount})
                </button>
              </div>

              <div className="hidden lg:flex text-xs text-zinc-500 bg-indigo-50/70 p-2 rounded-xl border border-indigo-100 items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                <span>Remunerações calculadas por presença</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCollaborators.length > 0 ? (
              filteredCollaborators.map((collab) => {
                const payoutData = calculateCollaboratorPayout(collab);
                const isInactive = collab.active === false;

                return (
                  <div
                    key={collab.id}
                    className={`bg-white rounded-2xl border shadow-sm p-6 space-y-4 transition-all ${
                      isInactive
                        ? 'border-zinc-200 bg-zinc-50/60 opacity-80'
                        : 'border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className={`text-lg font-bold ${isInactive ? 'text-zinc-500 line-through' : 'text-zinc-900'}`}>
                            {collab.name}
                          </h3>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              isInactive
                                ? 'bg-zinc-200 text-zinc-600'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isInactive ? 'Inativo' : 'Ativo'}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-full inline-block mt-1">
                          {collab.role}
                        </p>
                      </div>
                      {isCanManage && (
                        <div className="flex space-x-1">
                          <button
                            onClick={() => openCollaboratorModal(collab)}
                            title="Editar colaborador"
                            className="p-1.5 text-zinc-400 hover:text-indigo-600 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {isInactive ? (
                            <button
                              onClick={() => {
                                updateChoirCollaborator(collab.id, { active: true });
                              }}
                              title="Reativar colaborador"
                              className="p-1.5 text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => setCollaboratorToDeactivate(collab)}
                              title="Desativar colaborador"
                              className="p-1.5 text-zinc-400 hover:text-rose-600 transition-colors"
                            >
                              <Power className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="border-t border-zinc-100 pt-4 space-y-2 text-sm text-zinc-600">
                      {isCanManage && (
                        <div className="flex items-center text-xs">
                          <DollarSign className="w-4 h-4 mr-2 text-zinc-400" />
                          <span className="font-semibold text-zinc-900 mr-1">Regra:</span>
                          <span>{getRemunerationRuleText(collab)}</span>
                        </div>
                      )}

                      {collab.phone && (
                        <div className="flex items-center text-xs">
                          <Phone className="w-4 h-4 mr-2 text-zinc-400" />
                          <span>{collab.phone}</span>
                        </div>
                      )}

                      {collab.email && (
                        <div className="flex items-center text-xs">
                          <Mail className="w-4 h-4 mr-2 text-zinc-400" />
                          <span>{collab.email}</span>
                        </div>
                      )}

                      {collab.notes && (
                        <p className="text-xs text-zinc-500 bg-zinc-50 p-2 rounded-lg italic">
                          &quot;{collab.notes}&quot;
                        </p>
                      )}
                    </div>

                    {/* Calculated Remuneration Box */}
                    {isCanManage ? (
                      <div className="bg-gradient-to-br from-indigo-50 to-emerald-50/50 p-3.5 rounded-xl border border-indigo-100/80 space-y-1">
                        <p className="text-[11px] font-semibold text-indigo-900 uppercase tracking-wider flex items-center justify-between">
                          <span>Remuneração Calculada</span>
                          <span className="text-xs text-emerald-700 font-bold">
                            {payoutData.presentCount} presenças
                          </span>
                        </p>
                        <p className="text-xl font-bold text-indigo-950">
                          {formatCurrency(payoutData.payout)}
                        </p>
                        <p className="text-[11px] text-zinc-600">
                          {payoutData.explain}
                        </p>
                      </div>
                    ) : (
                      <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-100 flex items-center justify-between">
                        <span className="text-xs font-semibold text-indigo-900">Presenças Gravadas</span>
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-100 px-2.5 py-1 rounded-full">
                          {payoutData.presentCount} presenças
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-zinc-200">
                <UserPlus className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-zinc-600">
                  {collaboratorStatusFilter === 'inactive'
                    ? 'Nenhum colaborador inativo encontrado.'
                    : collaboratorStatusFilter === 'active'
                    ? 'Nenhum colaborador ativo encontrado.'
                    : 'Nenhum colaborador encontrado.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: EXTRATO FINANCEIRO DO CORAL */}
      {activeTab === 'statement' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-zinc-900">Extrato Financeiro do Coral</h2>
              <p className="text-sm text-zinc-500">Resumo de receitas dos alunos e despesas com colaboradores remunerados por presença.</p>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-zinc-600">Filtrar inscrições:</span>
              <select
                value={statementFilterStatus}
                onChange={(e) => setStatementFilterStatus(e.target.value as any)}
                className="px-3 py-1.5 border border-zinc-200 rounded-xl text-xs font-semibold bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
              >
                <option value="approved">Apenas Alunos Aprovados</option>
                <option value="all">Aprovados + Pendentes</option>
              </select>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Receita Total de Mensalidades</p>
              <p className="text-2xl font-bold text-emerald-600 mt-2">{formatCurrency(totalChoirRevenue)}</p>
              <p className="text-xs text-zinc-400 mt-1">{totalStudentsForCalc} alunos pagantes considerados</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total Repasses a Colaboradores</p>
              <p className="text-2xl font-bold text-rose-600 mt-2">{formatCurrency(totalCollaboratorPayouts)}</p>
              <p className="text-xs text-zinc-400 mt-1">{(state.choirCollaborators || []).length} colaboradores (ajustado por presença)</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Resultado Líquido Escola</p>
              <p className="text-2xl font-bold text-indigo-600 mt-2">{formatCurrency(netSchoolShare)}</p>
              <p className="text-xs text-zinc-400 mt-1">Sobra do coral retida pela escola</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Margem de Retenção</p>
              <p className="text-2xl font-bold text-zinc-900 mt-2">{marginPercent.toFixed(1)}%</p>
              <p className="text-xs text-zinc-400 mt-1">Percentual mantido pela escola</p>
            </div>
          </div>

          {/* Breakdown Table */}
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-zinc-100 font-bold text-zinc-900 text-sm">
              Detalhamento de Pagamentos por Presença nos Ensaios
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="bg-zinc-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Colaborador</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Função</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Regra de Remuneração</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ensaios Presentes</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Valor Devido</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-zinc-200">
                  {(state.choirCollaborators || []).map((collab) => {
                    const payoutData = calculateCollaboratorPayout(collab);
                    return (
                      <tr key={collab.id} className="hover:bg-zinc-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-zinc-900">
                          {collab.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600">
                          {collab.role}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-600">
                          {getRemunerationRuleText(collab)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-zinc-700 font-medium">
                          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700">
                            {payoutData.presentCount} / {payoutData.totalRehearsalsCount} ensaios
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-emerald-600">
                          {formatCurrency(payoutData.payout)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: FECHAMENTO MENSAL DO CORAL (CONFERÊNCIA / SIMULAÇÃO) */}
      {activeTab === 'closing' && (
        <ChoirMonthlyClosingTab
          collaborators={state.choirCollaborators || []}
          rehearsals={state.choirRehearsals || []}
          formatCurrency={formatCurrency}
        />
      )}

      {/* MODAL GERENCIAR NAIPES */}
      {isVoiceTypeModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-xl border border-zinc-100">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">Gerenciar Naipes do Coral</h3>
                  <p className="text-xs text-zinc-500">Cadastre novos naipes, altere o limite de vagas ou exclua naipes</p>
                </div>
              </div>
              <button
                onClick={() => setIsVoiceTypeModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {voiceTypeError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium flex items-center justify-between">
                <span>{voiceTypeError}</span>
                <button onClick={() => setVoiceTypeError(null)} className="text-rose-500 hover:text-rose-700">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* FORM ADICIONAR / EDITAR NAIPE */}
            <form onSubmit={handleVoiceTypeSubmit} className="bg-zinc-50 p-4 rounded-xl border border-zinc-200/80 space-y-3">
              <h4 className="text-xs font-bold text-zinc-800 uppercase tracking-wider flex items-center justify-between">
                <span>{editingVoiceType ? '✏️ Editar Naipe' : '➕ Adicionar Novo Naipe'}</span>
                {editingVoiceType && (
                  <button
                    type="button"
                    onClick={handleCancelVoiceTypeEdit}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 underline"
                  >
                    Cancelar Edição
                  </button>
                )}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Nome do Naipe</label>
                  <input
                    type="text"
                    value={voiceTypeFormData.name}
                    onChange={(e) => setVoiceTypeFormData({ ...voiceTypeFormData, name: e.target.value })}
                    placeholder="Ex: Soprano, Contralto, Tenor, Baixo..."
                    required
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Limite de Vagas</label>
                  <input
                    type="number"
                    min="0"
                    value={voiceTypeFormData.max_slots}
                    onChange={(e) => setVoiceTypeFormData({ ...voiceTypeFormData, max_slots: Number(e.target.value) })}
                    required
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {editingVoiceType ? 'Salvar Alterações' : 'Cadastrar Naipe'}
                </button>
              </div>
            </form>

            {/* LISTA DE NAIPES CADASTRADOS */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                Naipes Cadastrados ({state.choirVoiceTypes.length})
              </h4>

              {state.choirVoiceTypes.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
                  Nenhum naipe cadastrado no momento. Utilize o formulário acima para criar um.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {state.choirVoiceTypes.map(vt => {
                    const stats = getVoiceTypeStats(vt.id);
                    const isDeleting = voiceTypeToDelete === vt.id;

                    return (
                      <div
                        key={vt.id}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between ${
                          editingVoiceType?.id === vt.id
                            ? 'bg-indigo-50/80 border-indigo-200'
                            : 'bg-white border-zinc-200 hover:border-zinc-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-zinc-900">{vt.name}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-700 font-medium">
                              {stats.total} / {vt.max_slots} vagas
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-0.5">
                            {stats.available > 0
                              ? `${stats.available} vaga(s) disponível(is)`
                              : '⚠️ Vagas esgotadas'}
                          </p>
                        </div>

                        <div className="flex items-center gap-1">
                          {isDeleting ? (
                            <div className="flex items-center gap-1 bg-rose-50 p-1 rounded-lg border border-rose-200">
                              <span className="text-[10px] font-bold text-rose-700 px-1">Excluir?</span>
                              <button
                                type="button"
                                onClick={() => handleDeleteVoiceType(vt.id)}
                                className="px-2 py-0.5 bg-rose-600 text-white text-[10px] font-bold rounded-md hover:bg-rose-700"
                              >
                                Sim
                              </button>
                              <button
                                type="button"
                                onClick={() => setVoiceTypeToDelete(null)}
                                className="px-2 py-0.5 bg-zinc-200 text-zinc-700 text-[10px] font-bold rounded-md hover:bg-zinc-300"
                              >
                                Não
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEditVoiceType(vt)}
                                title="Editar Naipe"
                                className="p-1.5 text-zinc-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setVoiceTypeToDelete(vt.id)}
                                title="Excluir Naipe"
                                className="p-1.5 text-zinc-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-zinc-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsVoiceTypeModalOpen(false)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold rounded-xl transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: REGISTRATION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <h3 className="text-lg font-bold text-zinc-900">
                {editingRegistration ? 'Editar Inscrição no Coral' : 'Nova Inscrição no Coral'}
              </h3>
              <button onClick={closeModal} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Aluno</label>
                {editingRegistration ? (
                  <input
                    type="text"
                    disabled
                    value={state.students.find(s => s.id === formData.student_id)?.name || 'Aluno'}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-100 text-zinc-600 font-medium cursor-not-allowed"
                  />
                ) : (
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Pesquisar aluno pelo nome..."
                        value={studentSearch}
                        onChange={(e) => setStudentSearch(e.target.value)}
                        className="w-full pl-9 pr-8 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all"
                      />
                      {studentSearch && (
                        <button
                          type="button"
                          onClick={() => setStudentSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <select
                      value={formData.student_id}
                      onChange={(e) => handleStudentChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">
                        {studentSearch.trim()
                          ? `(${state.students.filter(s => s.name.toLowerCase().includes(studentSearch.toLowerCase())).length}) Selecione o aluno...`
                          : 'Selecione um aluno...'}
                      </option>
                      {state.students
                        .filter(s => !studentSearch.trim() || s.name.toLowerCase().includes(studentSearch.toLowerCase()) || (s.cpf && s.cpf.includes(studentSearch)))
                        .map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))
                      }
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Naipe</label>
                <select
                  value={formData.voice_type_id}
                  onChange={(e) => setFormData({ ...formData, voice_type_id: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Selecione um naipe...</option>
                  {state.choirVoiceTypes.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>

              {isSuperAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Valor Mensalidade (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.monthly_fee}
                    onChange={(e) => setFormData({ ...formData, monthly_fee: parseFloat(e.target.value) || 0 })}
                    required
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-zinc-400 mt-1">
                    {formData.is_internal_student ? 'Aluno interno da escola (desconto aplicado).' : 'Aluno externo.'}
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Status da Inscrição</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="pending">Pendente</option>
                  <option value="approved">Aprovado</option>
                  <option value="inactive">Inativo</option>
                  <option value="rejected">Rejeitado</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: COLLABORATOR MODAL */}
      {isCollaboratorModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <h3 className="text-lg font-bold text-zinc-900">
                {editingCollaborator ? 'Editar Colaborador do Coral' : 'Novo Colaborador do Coral'}
              </h3>
              <button onClick={closeCollaboratorModal} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCollaboratorSubmit} className="space-y-4">
              <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-100/90 space-y-2 relative">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-indigo-600" />
                    Importar dados de Aluno ou Professor
                  </label>
                  {importFeedback && (
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-600" />
                      {importFeedback}
                    </span>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="w-4 h-4 text-indigo-500" />
                  </div>
                  <input
                    type="text"
                    value={importSearchQuery}
                    onFocus={() => setIsImportDropdownOpen(true)}
                    onChange={(e) => {
                      setImportSearchQuery(e.target.value);
                      setIsImportDropdownOpen(true);
                    }}
                    placeholder="🔍 Pesquise por nome ou telefone do aluno/professor..."
                    className="w-full pl-9 pr-8 py-2 border border-indigo-200 rounded-xl text-xs bg-white text-zinc-900 font-medium placeholder-zinc-400 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                  />
                  {importSearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setImportSearchQuery('');
                        setIsImportDropdownOpen(false);
                      }}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-zinc-400 hover:text-zinc-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Autocomplete Results Dropdown */}
                {isImportDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white border border-indigo-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto divide-y divide-zinc-100">
                    {/* Alunos section */}
                    {state.students.filter(s =>
                      !importSearchQuery.trim() ||
                      (s.name || '').toLowerCase().includes(importSearchQuery.toLowerCase()) ||
                      (s.phone || '').includes(importSearchQuery)
                    ).length > 0 && (
                      <div>
                        <div className="bg-indigo-50/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-900 sticky top-0 border-b border-indigo-100 flex items-center justify-between">
                          <span>🎓 Alunos Cadastrados</span>
                          <span className="bg-indigo-200/80 text-indigo-800 px-1.5 py-0.2 rounded font-semibold text-[9px]">
                            {state.students.filter(s =>
                              !importSearchQuery.trim() ||
                              (s.name || '').toLowerCase().includes(importSearchQuery.toLowerCase()) ||
                              (s.phone || '').includes(importSearchQuery)
                            ).length}
                          </span>
                        </div>
                        {state.students.filter(s =>
                          !importSearchQuery.trim() ||
                          (s.name || '').toLowerCase().includes(importSearchQuery.toLowerCase()) ||
                          (s.phone || '').includes(importSearchQuery)
                        ).slice(0, 20).map(s => (
                          <button
                            key={`student:${s.id}`}
                            type="button"
                            onClick={() => {
                              setCollaboratorFormData(prev => ({
                                ...prev,
                                name: s.name || prev.name,
                                phone: s.phone || prev.phone,
                                email: s.email || prev.email,
                              }));
                              setImportFeedback(`Dados de "${s.name}" preenchidos!`);
                              setImportSearchQuery('');
                              setIsImportDropdownOpen(false);
                              setTimeout(() => setImportFeedback(''), 4000);
                            }}
                            className="w-full text-left px-3.5 py-2.5 hover:bg-indigo-50/70 transition-colors flex items-center justify-between group"
                          >
                            <div>
                              <p className="text-xs font-semibold text-zinc-900 group-hover:text-indigo-900">{s.name}</p>
                              <p className="text-[11px] text-zinc-500">{s.phone ? `📱 ${s.phone}` : 'Sem telefone'} {s.email ? `• ✉️ ${s.email}` : ''}</p>
                            </div>
                            <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-md group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                              Importar
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Professores section */}
                    {state.teachers.filter(t =>
                      t.status === 'active' && (
                        !importSearchQuery.trim() ||
                        (t.name || '').toLowerCase().includes(importSearchQuery.toLowerCase()) ||
                        (t.phone || '').includes(importSearchQuery)
                      )
                    ).length > 0 && (
                      <div>
                        <div className="bg-emerald-50/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-900 sticky top-0 border-b border-emerald-100 flex items-center justify-between">
                          <span>🎵 Professores Cadastrados</span>
                          <span className="bg-emerald-200/80 text-emerald-800 px-1.5 py-0.2 rounded font-semibold text-[9px]">
                            {state.teachers.filter(t =>
                              t.status === 'active' && (
                                !importSearchQuery.trim() ||
                                (t.name || '').toLowerCase().includes(importSearchQuery.toLowerCase()) ||
                                (t.phone || '').includes(importSearchQuery)
                              )
                            ).length}
                          </span>
                        </div>
                        {state.teachers.filter(t =>
                          t.status === 'active' && (
                            !importSearchQuery.trim() ||
                            (t.name || '').toLowerCase().includes(importSearchQuery.toLowerCase()) ||
                            (t.phone || '').includes(importSearchQuery)
                          )
                        ).slice(0, 20).map(t => (
                          <button
                            key={`teacher:${t.id}`}
                            type="button"
                            onClick={() => {
                              setCollaboratorFormData(prev => ({
                                ...prev,
                                name: t.name || prev.name,
                                phone: t.phone || prev.phone,
                                email: t.email || prev.email,
                                teacher_id: t.id,
                              }));
                              setImportFeedback(`Dados de "${t.name}" preenchidos!`);
                              setImportSearchQuery('');
                              setIsImportDropdownOpen(false);
                              setTimeout(() => setImportFeedback(''), 4000);
                            }}
                            className="w-full text-left px-3.5 py-2.5 hover:bg-emerald-50/70 transition-colors flex items-center justify-between group"
                          >
                            <div>
                              <p className="text-xs font-semibold text-zinc-900 group-hover:text-emerald-900">{t.name}</p>
                              <p className="text-[11px] text-zinc-500">{t.phone ? `📱 ${t.phone}` : 'Sem telefone'} {t.email ? `• ✉️ ${t.email}` : ''}</p>
                            </div>
                            <span className="text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-md group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                              Importar
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Empty state */}
                    {state.students.filter(s =>
                      !importSearchQuery.trim() ||
                      (s.name || '').toLowerCase().includes(importSearchQuery.toLowerCase()) ||
                      (s.phone || '').includes(importSearchQuery)
                    ).length === 0 && state.teachers.filter(t =>
                      t.status === 'active' && (
                        !importSearchQuery.trim() ||
                        (t.name || '').toLowerCase().includes(importSearchQuery.toLowerCase()) ||
                        (t.phone || '').includes(importSearchQuery)
                      )
                    ).length === 0 && (
                      <div className="p-4 text-center text-xs text-zinc-500">
                        Nenhum aluno ou professor encontrado para "{importSearchQuery}"
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-indigo-900/70">
                  Ao pesquisar e clicar em um aluno ou professor, o Nome, Telefone e E-mail são preenchidos automaticamente abaixo.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  value={collaboratorFormData.name}
                  onChange={(e) => setCollaboratorFormData({ ...collaboratorFormData, name: e.target.value })}
                  required
                  placeholder="Ex: Rafaela Oliveira Cintra"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Função</label>
                <input
                  type="text"
                  value={collaboratorFormData.role}
                  onChange={(e) => setCollaboratorFormData({ ...collaboratorFormData, role: e.target.value })}
                  required
                  placeholder="Ex: Assistente de Naipe, Regente, Pianista"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {isCanManage && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">Regra de Remuneração</label>
                    <select
                      value={collaboratorFormData.remuneration_type}
                      onChange={(e) => setCollaboratorFormData({ ...collaboratorFormData, remuneration_type: e.target.value as any })}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="per_rehearsal">R$ Fixo por Ensaio Presente (Remuneração por Presença)</option>
                      <option value="fixed">R$ Valor Fixo Mensal</option>
                      <option value="percentage">% Porcentagem da Receita do Coral</option>
                      <option value="per_student">R$ Por Aluno Presente nos Ensaios</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1">
                      {collaboratorFormData.remuneration_type === 'percentage'
                        ? 'Porcentagem (%)'
                        : 'Valor (R$)'}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={collaboratorFormData.remuneration_value}
                      onChange={(e) => setCollaboratorFormData({ ...collaboratorFormData, remuneration_value: parseFloat(e.target.value) || 0 })}
                      required
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Telefone</label>
                  <input
                    type="text"
                    value={collaboratorFormData.phone}
                    onChange={(e) => setCollaboratorFormData({ ...collaboratorFormData, phone: e.target.value })}
                    placeholder="(00) 00000-0000"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={collaboratorFormData.email}
                    onChange={(e) => setCollaboratorFormData({ ...collaboratorFormData, email: e.target.value })}
                    placeholder="email@exemplo.com"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={closeCollaboratorModal}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: GERAR ENSAIOS QUINZENAIS */}
      {isBiweeklyModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                <Repeat className="w-5 h-5 text-indigo-600" />
                Gerar Ensaios Quinzenais
              </h3>
              <button onClick={() => setIsBiweeklyModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 bg-indigo-50 p-3 rounded-xl border border-indigo-100">
              Gera automaticamente uma sequência de ensaios com intervalo quinzenal (14 em 14 dias).
            </p>

            <form onSubmit={handleBiweeklySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Data do 1º Ensaio</label>
                <input
                  type="date"
                  value={biweeklyFormData.startDate}
                  onChange={(e) => setBiweeklyFormData({ ...biweeklyFormData, startDate: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Quantidade de Ensaios</label>
                <select
                  value={biweeklyFormData.count}
                  onChange={(e) => setBiweeklyFormData({ ...biweeklyFormData, count: parseInt(e.target.value) || 6 })}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={2}>2 Ensaios (1 mês)</option>
                  <option value={4}>4 Ensaios (2 meses)</option>
                  <option value={6}>6 Ensaios (3 meses)</option>
                  <option value={8}>8 Ensaios (4 meses)</option>
                  <option value={12}>12 Ensaios (6 meses)</option>
                  <option value={24}>24 Ensaios (1 ano)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Horário do Ensaio</label>
                <input
                  type="time"
                  value={biweeklyFormData.time}
                  onChange={(e) => setBiweeklyFormData({ ...biweeklyFormData, time: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Título Base</label>
                <input
                  type="text"
                  value={biweeklyFormData.titlePrefix}
                  onChange={(e) => setBiweeklyFormData({ ...biweeklyFormData, titlePrefix: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsBiweeklyModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm inline-flex items-center gap-1.5"
                >
                  <Repeat className="w-4 h-4" />
                  Gerar {biweeklyFormData.count} Ensaios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: NOVO / EDITAR ENSAIO INDIVIDUAL */}
      {isRehearsalModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-3">
              <h3 className="text-lg font-bold text-zinc-900">
                {editingRehearsal ? 'Editar Ensaio' : 'Novo Ensaio do Coral'}
              </h3>
              <button onClick={closeRehearsalModal} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRehearsalSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Data</label>
                <input
                  type="date"
                  value={rehearsalFormData.date}
                  onChange={(e) => setRehearsalFormData({ ...rehearsalFormData, date: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Horário</label>
                <input
                  type="time"
                  value={rehearsalFormData.time}
                  onChange={(e) => setRehearsalFormData({ ...rehearsalFormData, time: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Título / Descrição</label>
                <input
                  type="text"
                  value={rehearsalFormData.title}
                  onChange={(e) => setRehearsalFormData({ ...rehearsalFormData, title: e.target.value })}
                  required
                  placeholder="Ex: Ensaio Geral, Ensaio de Naipe"
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Observações / Repertório</label>
                <textarea
                  value={rehearsalFormData.notes}
                  onChange={(e) => setRehearsalFormData({ ...rehearsalFormData, notes: e.target.value })}
                  rows={3}
                  placeholder="Observações sobre o repertório ou pauta do ensaio..."
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-sm bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={closeRehearsalModal}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: LANÇAR CHAMADA DO ENSAIO (NAIPES & COLABORADORES) */}
      {isAttendanceModalOpen && selectedRehearsalForAttendance && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-zinc-100 pb-3 flex-shrink-0">
              <div>
                <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
                  <ListChecks className="w-5 h-5 text-indigo-600" />
                  Lançar Chamada: {selectedRehearsalForAttendance.title}
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Data: {new Date(selectedRehearsalForAttendance.date + 'T00:00:00').toLocaleDateString('pt-BR')} às {selectedRehearsalForAttendance.time || '19:30'}
                </p>
              </div>
              <button onClick={() => setIsAttendanceModalOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions, Search & Section Switcher */}
            <div className="flex flex-col gap-3 bg-zinc-50 p-3 rounded-xl flex-shrink-0">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                <div className="flex gap-2">
                  {(() => {
                    const eligibleSingers = getEligibleChoirSingersForRehearsal(selectedRehearsalForAttendance, state.choirRegistrations || []);
                    return (
                      <button
                        onClick={() => setActiveAttendanceSection('singers')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                          activeAttendanceSection === 'singers'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5" />
                        Alunos por Naipe ({eligibleSingers.length})
                      </button>
                    );
                  })()}
                  {(() => {
                    const eligibleCollabs = getEligibleChoirCollaboratorsForRehearsal(selectedRehearsalForAttendance, state.choirCollaborators || []);
                    const availableCollabsCount = eligibleCollabs.length;

                    return (
                      <button
                        onClick={() => setActiveAttendanceSection('collaborators')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
                          activeAttendanceSection === 'collaborators'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-white text-zinc-700 border border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        Colaboradores ({availableCollabsCount})
                      </button>
                    );
                  })()}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAllAttendanceStatus(activeAttendanceSection, 'present')}
                    className="px-2.5 py-1 text-xs font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <CheckCircle className="w-3 h-3" />
                    Todos Presentes
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllAttendanceStatus(activeAttendanceSection, 'absent')}
                    className="px-2.5 py-1 text-xs font-medium text-rose-700 bg-rose-100 hover:bg-rose-200 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <XCircle className="w-3 h-3" />
                    Todos Ausentes
                  </button>
                </div>
              </div>

              {/* Lupa de Pesquisa do Aluno pelo Nome na Chamada */}
              <div className="relative w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder={
                    activeAttendanceSection === 'singers'
                      ? "Pesquisar aluno pelo nome na chamada..."
                      : "Pesquisar colaborador pelo nome..."
                  }
                  value={attendanceSearch}
                  onChange={(e) => setAttendanceSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 border border-zinc-200 rounded-xl text-xs bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                />
                {attendanceSearch && (
                  <button
                    type="button"
                    onClick={() => setAttendanceSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* SECTION 1: SINGERS BY NAIPE */}
            {activeAttendanceSection === 'singers' && (() => {
              const eligibleSingers = getEligibleChoirSingersForRehearsal(selectedRehearsalForAttendance, state.choirRegistrations || []);

              return (
                <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                  {/* Naipe Filter Pills */}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setSelectedVoiceFilter('all')}
                      className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                        selectedVoiceFilter === 'all'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      Todos Naipes
                    </button>
                    {state.choirVoiceTypes.map(vt => (
                      <button
                        key={vt.id}
                        onClick={() => setSelectedVoiceFilter(vt.id)}
                        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                          selectedVoiceFilter === vt.id
                            ? 'bg-indigo-600 text-white'
                            : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                        }`}
                      >
                        {vt.name}
                      </button>
                    ))}
                  </div>

                  {/* Singers List Grouped by Voice Type */}
                  {eligibleSingers.filter(r => {
                    if (!attendanceSearch.trim()) return true;
                    const student = state.students.find(s => s.id === r.student_id);
                    return student?.name.toLowerCase().includes(attendanceSearch.toLowerCase());
                  }).length === 0 && (
                    <div className="p-8 text-center text-xs text-zinc-500 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
                      Nenhum aluno encontrado para "{attendanceSearch}".
                    </div>
                  )}

                  {state.choirVoiceTypes
                    .filter(vt => selectedVoiceFilter === 'all' || selectedVoiceFilter === vt.id)
                    .map(voiceType => {
                      const voiceRegistrations = eligibleSingers.filter(r => {
                        if (r.voice_type_id !== voiceType.id) return false;
                        if (!attendanceSearch.trim()) return true;
                        const student = state.students.find(s => s.id === r.student_id);
                        return student?.name.toLowerCase().includes(attendanceSearch.toLowerCase());
                      });
                      if (voiceRegistrations.length === 0) return null;

                    return (
                      <div key={voiceType.id} className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
                        <div className="bg-zinc-50 px-4 py-2 border-b border-zinc-200 flex justify-between items-center">
                          <span className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
                            Naipe: {voiceType.name} ({voiceRegistrations.length})
                          </span>
                        </div>

                        <div className="divide-y divide-zinc-100">
                          {voiceRegistrations.length > 0 ? (
                            voiceRegistrations.map(reg => {
                              const student = state.students.find(s => s.id === reg.student_id);
                              const currentStatus = attendanceDraft[reg.student_id]?.status || 'present';
                              const consecutiveAbsences = getStudentChoirConsecutiveAbsences(reg.student_id, state.choirRehearsals || []);
                              const has3AbsencesAlert = consecutiveAbsences >= 3;

                              return (
                                <div key={reg.id} className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${has3AbsencesAlert ? 'bg-amber-50/50' : ''}`}>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-bold text-zinc-900">{student?.name || 'Aluno'}</span>
                                      {has3AbsencesAlert && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-500 text-white animate-pulse">
                                          <AlertTriangle className="w-3 h-3" />
                                          Alerta 3ª+ falta!
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-xs text-zinc-500">
                                      {consecutiveAbsences > 0 ? `${consecutiveAbsences} falta(s) consecutiva(s)` : 'Sem faltas recentes'}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => setAttendanceDraft({
                                        ...attendanceDraft,
                                        [reg.student_id]: { ...attendanceDraft[reg.student_id], status: 'present' }
                                      })}
                                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                                        currentStatus === 'present'
                                          ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300'
                                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                      }`}
                                    >
                                      <CheckCircle className="w-3.5 h-3.5" />
                                      Presente
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setAttendanceDraft({
                                        ...attendanceDraft,
                                        [reg.student_id]: { ...attendanceDraft[reg.student_id], status: 'absent' }
                                      })}
                                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                                        currentStatus === 'absent'
                                          ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-300'
                                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                      }`}
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      Ausente
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setAttendanceDraft({
                                        ...attendanceDraft,
                                        [reg.student_id]: { ...attendanceDraft[reg.student_id], status: 'justified' }
                                      })}
                                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                                        currentStatus === 'justified'
                                          ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-300'
                                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                      }`}
                                    >
                                      <Clock className="w-3.5 h-3.5" />
                                      Justificado
                                    </button>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className="p-3 text-xs text-zinc-400 italic">
                              Nenhum aluno aprovado neste naipe.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* SECTION 2: COLLABORATORS */}
            {activeAttendanceSection === 'collaborators' && (
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {(() => {
                  const availableCollabs = getEligibleChoirCollaboratorsForRehearsal(selectedRehearsalForAttendance, state.choirCollaborators || []);

                  const filteredCollabs = availableCollabs.filter(collab =>
                    !attendanceSearch.trim() ||
                    collab.name.toLowerCase().includes(attendanceSearch.toLowerCase()) ||
                    collab.role.toLowerCase().includes(attendanceSearch.toLowerCase())
                  );

                  if (filteredCollabs.length === 0) {
                    return (
                      <div className="p-8 text-center text-xs text-zinc-500 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
                        {attendanceSearch ? `Nenhum colaborador encontrado para "${attendanceSearch}".` : 'Nenhum colaborador disponível para esta chamada.'}
                      </div>
                    );
                  }

                  return filteredCollabs.map(collab => {
                    const currentStatus = attendanceDraft[collab.id]?.status || 'present';

                    return (
                      <div key={collab.id} className="p-4 border border-zinc-200 rounded-xl bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-zinc-900">{collab.name}</span>
                          </div>
                          <div className="text-xs text-indigo-600 font-semibold">{collab.role}</div>
                          <div className="text-[11px] text-zinc-500 mt-0.5">
                            Regra de Pagamento: {getRemunerationRuleText(collab)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setAttendanceDraft({
                              ...attendanceDraft,
                              [collab.id]: { ...attendanceDraft[collab.id], status: 'present' }
                            })}
                            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
                              currentStatus === 'present'
                                ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300'
                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                            }`}
                          >
                            <CheckCircle className="w-4 h-4" />
                            Presente (Remunerado)
                          </button>

                          <button
                            type="button"
                            onClick={() => setAttendanceDraft({
                              ...attendanceDraft,
                              [collab.id]: { ...attendanceDraft[collab.id], status: 'absent' }
                            })}
                            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 ${
                              currentStatus === 'absent'
                                ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-300'
                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                            }`}
                          >
                            <XCircle className="w-4 h-4" />
                            Ausente
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-100 flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsAttendanceModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveAttendance}
                className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-sm flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Salvar Chamada
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAÇÃO DE DESATIVAÇÃO DE COLABORADOR */}
      {collaboratorToDeactivate && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-zinc-100">
            <div className="flex justify-between items-start border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2 text-amber-600">
                <div className="p-2 bg-amber-50 rounded-xl">
                  <Power className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900">Desativar colaborador?</h3>
              </div>
              <button
                onClick={() => {
                  if (!isDeactivatingCollaborator) {
                    setCollaboratorToDeactivate(null);
                  }
                }}
                disabled={isDeactivatingCollaborator}
                className="text-zinc-400 hover:text-zinc-600 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2 text-sm text-zinc-700">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <span className="font-semibold text-zinc-900">
                  {collaboratorToDeactivate.name}
                </span>
              </div>
              <div className="text-xs text-zinc-600">
                <span className="font-medium text-zinc-800">Função:</span> {collaboratorToDeactivate.role}
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
              <p className="font-semibold flex items-center gap-1.5 text-amber-950">
                <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
                Preservação Integral do Histórico
              </p>
              <p>
                O colaborador não será excluído do banco. Ele deixará de aparecer nas novas chamadas de ensaios e na lista principal, mas todo o histórico de presenças e fechamentos mensais anteriores permanecerá 100% intacto.
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setCollaboratorToDeactivate(null)}
                disabled={isDeactivatingCollaborator}
                className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeactivatingCollaborator}
                onClick={async () => {
                  if (!collaboratorToDeactivate) return;
                  setIsDeactivatingCollaborator(true);
                  try {
                    await updateChoirCollaborator(collaboratorToDeactivate.id, { active: false });
                    setCollaboratorToDeactivate(null);
                  } catch (err: any) {
                    console.error('Erro ao desativar colaborador:', err);
                  } finally {
                    setIsDeactivatingCollaborator(false);
                  }
                }}
                className="px-4 py-2 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors shadow-sm inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeactivatingCollaborator ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Desativando...
                  </>
                ) : (
                  <>
                    <Power className="w-4 h-4" />
                    Desativar Colaborador
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAÇÃO DE INATIVAÇÃO DE PARTICIPANTE DO CORAL */}
      {registrationToDeactivate && (() => {
        const student = state.students.find(s => s.id === registrationToDeactivate.student_id);
        const voiceType = state.choirVoiceTypes.find(v => v.id === registrationToDeactivate.voice_type_id);

        return (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-zinc-100">
              <div className="flex justify-between items-start border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2 text-amber-600">
                  <div className="p-2 bg-amber-50 rounded-xl">
                    <UserX className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900">Inativar participante do Coral?</h3>
                </div>
                <button
                  onClick={() => {
                    if (!isDeactivatingRegistration) {
                      setRegistrationToDeactivate(null);
                    }
                  }}
                  disabled={isDeactivatingRegistration}
                  className="text-zinc-400 hover:text-zinc-600 disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="text-sm text-zinc-700 font-medium">
                Tem certeza que deseja inativar este participante do Coral?
              </div>

              <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2 text-sm text-zinc-700">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                  <span className="font-semibold text-zinc-900">
                    {student?.name || 'Aluno'}
                  </span>
                </div>
                <div className="text-xs text-zinc-600">
                  <span className="font-medium text-zinc-800">Naipe:</span> {voiceType?.name || '-'}
                </div>
              </div>

              <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
                <p className="font-semibold flex items-center gap-1.5 text-amber-950">
                  <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  Preservação Integral do Histórico
                </p>
                <p>
                  Ele não aparecerá nas chamadas a partir de 01/09/2026, mas seu histórico de presenças será preservado.
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRegistrationToDeactivate(null)}
                  disabled={isDeactivatingRegistration}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeactivatingRegistration}
                  onClick={async () => {
                    if (!registrationToDeactivate) return;
                    setIsDeactivatingRegistration(true);
                    try {
                      await updateChoirRegistration(registrationToDeactivate.id, {
                        status: 'inactive',
                        active: false,
                      });
                      setRegistrationToDeactivate(null);
                    } catch (err: any) {
                      console.error('Erro ao inativar participante:', err);
                    } finally {
                      setIsDeactivatingRegistration(false);
                    }
                  }}
                  className="px-4 py-2 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors shadow-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isDeactivatingRegistration ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Inativando...
                    </>
                  ) : (
                    <>
                      <UserX className="w-4 h-4" />
                      Inativar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL: CONFIRMAÇÃO DE EXCLUSÃO DE ENSAIO */}
      {rehearsalToDelete && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl border border-zinc-100">
            <div className="flex justify-between items-start border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2 text-rose-600">
                <div className="p-2 bg-rose-50 rounded-xl">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900">Excluir ensaio?</h3>
              </div>
              <button
                onClick={() => {
                  if (!isDeletingRehearsal) {
                    setRehearsalToDelete(null);
                    setRehearsalDeleteError(null);
                  }
                }}
                disabled={isDeletingRehearsal}
                className="text-zinc-400 hover:text-zinc-600 disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2 text-sm text-zinc-700">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <span className="font-semibold text-zinc-900">
                  Data: {rehearsalToDelete.date ? new Date(rehearsalToDelete.date + 'T00:00:00').toLocaleDateString('pt-BR') : 'Data não informada'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                <span>Horário: {rehearsalToDelete.time || '19:30'}</span>
              </div>
              <div className="text-xs text-zinc-600 pt-1 border-t border-zinc-200">
                <span className="font-medium text-zinc-800">Título:</span> {rehearsalToDelete.title || 'Ensaio do Coral'}
              </div>
            </div>

            <div className="p-3 bg-rose-50 rounded-xl border border-rose-100 text-xs text-rose-800">
              Esta ação excluirá o ensaio do sistema e não poderá ser desfeita.
            </div>

            {rehearsalDeleteError && (
              <div className="p-3 bg-rose-100 border border-rose-300 rounded-xl text-xs text-rose-900 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <div>{rehearsalDeleteError}</div>
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRehearsalToDelete(null);
                  setRehearsalDeleteError(null);
                }}
                disabled={isDeletingRehearsal}
                className="px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingRehearsal}
                onClick={async () => {
                  if (!rehearsalToDelete) return;
                  setIsDeletingRehearsal(true);
                  setRehearsalDeleteError(null);
                  try {
                    const res = await deleteChoirRehearsal(rehearsalToDelete.id);
                    if (res.success) {
                      setRehearsalToDelete(null);
                      setRehearsalDeleteError(null);
                    } else {
                      setRehearsalDeleteError(res.message || 'Erro ao excluir o ensaio no Supabase.');
                    }
                  } catch (err: any) {
                    setRehearsalDeleteError(err?.message || 'Falha de comunicação ao excluir ensaio.');
                  } finally {
                    setIsDeletingRehearsal(false);
                  }
                }}
                className="px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-sm inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingRehearsal ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Excluir ensaio
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Choir Attendance Rules Validation Modal */}
      <ChoirAttendanceTestsModal
        isOpen={isAttendanceTestsModalOpen}
        onClose={() => setIsAttendanceTestsModalOpen(false)}
      />
    </div>
  );
};
