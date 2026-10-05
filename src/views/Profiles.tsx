import React, { useState } from "react";
import { Plus, Search, Edit2, Trash2, X, Shield, User, GraduationCap, Eye, EyeOff, Copy, Check, Database, CheckCircle2, ChevronDown, ChevronUp, Lock, Unlock, UserCheck, UserX, AlertTriangle, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAppStore, UserProfile } from "../store";
import { supabase } from "../lib/supabase";
import { TeacherGoogleCalendarCard } from "../components/TeacherGoogleCalendarCard";

export const Profiles: React.FC = () => {
  const { state, addProfile, updateProfile, deleteProfile, toggleProfileAccess, currentUserProfile } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [accessFilter, setAccessFilter] = useState<'all' | 'active' | 'blocked'>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null);

  // Estado para Bloquear / Liberar Acesso (Regra Mestra: Super Admin)
  const [confirmAccessProfile, setConfirmAccessProfile] = useState<UserProfile | null>(null);
  const [targetAccessStatus, setTargetAccessStatus] = useState<'active' | 'blocked'>('blocked');
  const [isTogglingAccess, setIsTogglingAccess] = useState(false);
  const [toggleAccessError, setToggleAccessError] = useState<string | null>(null);
  const [isEdgeFunctionMissing, setIsEdgeFunctionMissing] = useState(false);
  const [copiedDeployCmd, setCopiedDeployCmd] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    role: "teacher" as "super_admin" | "admin" | "teacher",
    teacher_id: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resetEmailStatus, setResetEmailStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [newDirectPassword, setNewDirectPassword] = useState("");
  const [directResetStatus, setDirectResetStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'missing_rpc'>('idle');
  const [rpcErrorText, setRpcErrorText] = useState("");
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedRlsSql, setCopiedRlsSql] = useState(false);
  const [showRlsCard, setShowRlsCard] = useState(false);

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "super_admin":
        return (
          <span className="px-2.5 py-1 inline-flex items-center text-xs font-semibold rounded-full bg-rose-50 text-rose-700 border border-rose-150">
            <Shield className="w-3.5 h-3.5 mr-1" />
            Super Admin
          </span>
        );
      case "admin":
        return (
          <span className="px-2.5 py-1 inline-flex items-center text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-150">
            <User className="w-3.5 h-3.5 mr-1" />
            Admin
          </span>
        );
      case "teacher":
        return (
          <span className="px-2.5 py-1 inline-flex items-center text-xs font-semibold rounded-full bg-amber-50 text-amber-700 border border-amber-150">
            <GraduationCap className="w-3.5 h-3.5 mr-1" />
            Professor
          </span>
        );
      default:
        return null;
    }
  };

  const totalProfilesCount = state.profiles.length;
  const activeProfilesCount = state.profiles.filter(
    (p) => (p.access_status || "active") !== "blocked"
  ).length;
  const blockedProfilesCount = state.profiles.filter(
    (p) => p.access_status === "blocked"
  ).length;

  const filteredProfiles = state.profiles.filter((p) => {
    const isBlocked = p.access_status === "blocked";
    if (accessFilter === "active" && isBlocked) return false;
    if (accessFilter === "blocked" && !isBlocked) return false;

    const emailMatch = (p.email || "").toLowerCase().includes(searchTerm.toLowerCase());
    const roleMatch = (p.role || "").toLowerCase().includes(searchTerm.toLowerCase());
    const associatedTeacher = p.teacher_id
      ? state.teachers.find((t) => t.id === p.teacher_id)
      : null;
    const teacherMatch = associatedTeacher
      ? (associatedTeacher.name || "").toLowerCase().includes(searchTerm.toLowerCase())
      : false;

    return emailMatch || roleMatch || teacherMatch;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email.trim()) {
      setError("Por favor, preencha o email.");
      return;
    }

    if (!editingProfile && !formData.password.trim()) {
      setError("Por favor, digite uma senha para o novo usuário.");
      return;
    }

    if (!editingProfile && formData.password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const cleanEmail = formData.email.trim().toLowerCase();
      const existingProfile = state.profiles.find(p => (p.email || "").trim().toLowerCase() === cleanEmail);
      const payload: UserProfile = {
        id: editingProfile ? editingProfile.id : (existingProfile ? existingProfile.id : crypto.randomUUID()),
        email: cleanEmail,
        role: formData.role,
        teacher_id: formData.role === "teacher" && formData.teacher_id ? formData.teacher_id : undefined,
      };

      if (editingProfile) {
        await updateProfile(editingProfile.id, payload);
      } else {
        await addProfile(payload, formData.password);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      setError(err.message || "Erro ao salvar perfil.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openModal = (profile?: UserProfile) => {
    setError(null);
    setResetEmailStatus('idle');
    setNewDirectPassword("");
    setDirectResetStatus('idle');
    setRpcErrorText("");
    setCopiedSql(false);
    if (profile) {
      setEditingProfile(profile);
      setFormData({
        email: profile.email || "",
        password: "",
        role: profile.role || "teacher",
        teacher_id: profile.teacher_id || "",
      });
    } else {
      setEditingProfile(null);
      setFormData({
        email: "",
        password: "",
        role: "teacher",
        teacher_id: "",
      });
    }
    setIsModalOpen(true);
  };

  const handleToggleAccess = async () => {
    if (!confirmAccessProfile) return;
    setIsTogglingAccess(true);
    setToggleAccessError(null);
    setIsEdgeFunctionMissing(false);
    try {
      const res = await toggleProfileAccess(confirmAccessProfile.id, targetAccessStatus);
      if (!res.success) {
        setToggleAccessError(res.error || 'Erro ao alterar status de acesso do usuário.');
        if (res.edgeFunctionMissing) {
          setIsEdgeFunctionMissing(true);
        }
        return;
      }
      setConfirmAccessProfile(null);
    } catch (err: any) {
      setToggleAccessError(err.message || 'Erro inesperado ao alterar status de acesso.');
    } finally {
      setIsTogglingAccess(false);
    }
  };

  // Regra Mestra: Usuário role = 'admin' ou 'teacher' não pode acessar esta tela
  if (currentUserProfile && currentUserProfile.role !== "super_admin") {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="p-8 bg-white border border-rose-200 rounded-2xl shadow-sm text-center space-y-4">
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-2xl mx-auto flex items-center justify-center">
            <Shield className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-zinc-900">Acesso Restrito ao Super Administrador</h2>
          <p className="text-sm text-zinc-600 max-w-lg mx-auto leading-relaxed">
            O gerenciamento de contas, credenciais de login e status de acesso ao sistema é de controle exclusivo do Super Administrador da escola.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Controle de Usuários e Permissões
          </h1>
          <p className="text-zinc-500 text-sm">
            Gerencie logins, credenciais e liberação de acesso ao sistema para todas as contas.
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="flex items-center justify-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-sm transition-colors shadow-sm shadow-indigo-100"
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Usuário / Perfil
        </button>
      </div>

      {/* Regra Mestra: Entidades Distintas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 bg-emerald-50/70 border border-emerald-200/90 rounded-2xl space-y-1.5 text-xs text-emerald-950">
          <div className="flex items-center gap-2 font-bold text-emerald-900 text-sm">
            <GraduationCap className="w-4 h-4 text-emerald-700" />
            <span>1. Professor da Escola (teachers.status)</span>
          </div>
          <p className="leading-relaxed">
            Controlado na tela de <strong>Professores</strong>. Define se o docente está ativo para receber novas turmas, matrículas e horários de aula. Inativar o professor não bloqueia o login e não apaga o histórico.
          </p>
        </div>

        <div className="p-4 bg-indigo-50/70 border border-indigo-200/90 rounded-2xl space-y-1.5 text-xs text-indigo-950">
          <div className="flex items-center gap-2 font-bold text-indigo-900 text-sm">
            <Lock className="w-4 h-4 text-indigo-700" />
            <span>2. Conta de Login (profiles.access_status)</span>
          </div>
          <p className="leading-relaxed">
            Controlado nesta tela pelo <strong>Super Admin</strong>. Define se a conta pode fazer login na plataforma. Bloquear o acesso desconecta o usuário imediatamente sem apagar dados ou integrações.
          </p>
        </div>
      </div>

      {/* Info Warning Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 flex items-start space-x-3">
        <Shield className="w-5 h-5 flex-shrink-0 text-amber-600 mt-0.5" />
        <div>
          <span className="font-semibold">Níveis de Acesso:</span>
          <ul className="list-disc list-inside mt-1 space-y-1 text-amber-700">
            <li><strong>Super Admin:</strong> Acesso total, incluindo este painel de usuários e permissões.</li>
            <li><strong>Admin:</strong> Supervisão de vendas, financeiro, relatórios, alunos e prospectos, sem acesso a este painel de usuários.</li>
            <li><strong>Professor:</strong> Visualização restrita apenas a seus próprios alunos e sua agenda de aulas, sem acesso ao financeiro.</li>
          </ul>
        </div>
      </div>

      {/* RLS & Database Permission Policy Card */}
      <div className="bg-white border border-indigo-150 rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-900">
                Políticas de Permissões RLS (Supabase Row Level Security)
              </h2>
              <p className="text-xs text-zinc-500">
                Garante que Professores e Administradores consigam salvar relatórios, condutas vocais e presenças no banco de dados.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowRlsCard(!showRlsCard)}
            className="flex items-center space-x-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-colors"
          >
            <span>{showRlsCard ? "Ocultar Script SQL" : "Ver Script de Correção SQL"}</span>
            {showRlsCard ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showRlsCard && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 pt-3 border-t border-zinc-100"
          >
            <div className="text-xs text-zinc-600 leading-relaxed bg-zinc-50 p-3.5 rounded-xl border border-zinc-150 space-y-1.5">
              <p className="font-semibold text-zinc-800">
                💡 Se os professores ou admins receberem erro de permissão ao salvar relatórios de aulas:
              </p>
              <p>
                Isso ocorre quando o Supabase possui políticas de segurança RLS antigas bloqueando comandos <code>UPDATE</code> ou <code>INSERT</code> na tabela <code>classes</code> e <code>class_students</code>.
              </p>
              <p>
                Para solucionar de forma definitiva, copie o script SQL abaixo e execute-o no <strong>SQL Editor</strong> do seu painel Supabase:
              </p>
            </div>

            <div className="relative">
              <pre className="bg-zinc-900 text-zinc-100 p-3.5 rounded-xl font-mono text-[11px] overflow-x-auto max-h-60 leading-relaxed">
{`-- Habilitar RLS e aplicar permissões para todas as tabelas (classes, relatórios, alunos)
ALTER TABLE IF EXISTS public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financial_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financial_discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.choir_voice_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.choir_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.teacher_choir_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.choir_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.choir_rehearsals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.academic_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT timezone('utc'::text, now());
ALTER TABLE IF EXISTS public.profiles ALTER COLUMN created_at SET DEFAULT timezone('utc'::text, now());
ALTER TABLE IF EXISTS public.choir_registrations ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE IF EXISTS public.groups ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
UPDATE public.groups SET status = 'active' WHERE status IS NULL;

DO $$
DECLARE
  tbl_name text;
  pol_name text;
  tables text[] := ARRAY[
    'students', 'teachers', 'classes', 'enrollments', 'class_students',
    'transactions', 'groups', 'financial_plans', 'financial_discount_rules',
    'choir_voice_types', 'choir_registrations', 'teacher_choir_payments',
    'choir_collaborators', 'choir_rehearsals', 'academic_calendar',
    'prospects', 'profiles'
  ];
BEGIN
  FOREACH tbl_name IN ARRAY tables LOOP
    FOR pol_name IN (
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl_name
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_name, tbl_name);
    END LOOP;
    EXECUTE format('CREATE POLICY "Allow all" ON public.%I FOR ALL USING (true) WITH CHECK (true)', tbl_name);
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;`}
              </pre>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`-- Habilitar RLS e aplicar permissões para todas as tabelas (classes, relatórios, alunos)
ALTER TABLE IF EXISTS public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financial_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financial_discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.choir_voice_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.choir_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.teacher_choir_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.choir_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.choir_rehearsals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.academic_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.profiles ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT timezone('utc'::text, now());
ALTER TABLE IF EXISTS public.profiles ALTER COLUMN created_at SET DEFAULT timezone('utc'::text, now());
ALTER TABLE IF EXISTS public.choir_registrations ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;
ALTER TABLE IF EXISTS public.groups ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
UPDATE public.groups SET status = 'active' WHERE status IS NULL;

DO $$
DECLARE
  tbl_name text;
  pol_name text;
  tables text[] := ARRAY[
    'students', 'teachers', 'classes', 'enrollments', 'class_students',
    'transactions', 'groups', 'financial_plans', 'financial_discount_rules',
    'choir_voice_types', 'choir_registrations', 'teacher_choir_payments',
    'choir_collaborators', 'choir_rehearsals', 'academic_calendar',
    'prospects', 'profiles'
  ];
BEGIN
  FOREACH tbl_name IN ARRAY tables LOOP
    FOR pol_name IN (
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl_name
    ) LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_name, tbl_name);
    END LOOP;
    EXECUTE format('CREATE POLICY "Allow all" ON public.%I FOR ALL USING (true) WITH CHECK (true)', tbl_name);
  END LOOP;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;`);
                  setCopiedRlsSql(true);
                  setTimeout(() => setCopiedRlsSql(false), 2500);
                }}
                className="absolute right-3 top-3 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-xs flex items-center space-x-1.5 shadow transition-colors"
                title="Copiar script SQL RLS"
              >
                {copiedRlsSql ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Copiado com Sucesso!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Script RLS</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Profiles Table */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-zinc-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por email, nível ou professor associado..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl leading-5 bg-zinc-50 placeholder-zinc-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
            />
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-zinc-100 rounded-xl self-start sm:self-auto">
            <button
              onClick={() => setAccessFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                accessFilter === 'all'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Todos ({totalProfilesCount})
            </button>
            <button
              onClick={() => setAccessFilter('active')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                accessFilter === 'active'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-zinc-600 hover:text-emerald-700'
              }`}
            >
              Acesso Liberado ({activeProfilesCount})
            </button>
            <button
              onClick={() => setAccessFilter('blocked')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                accessFilter === 'blocked'
                  ? 'bg-white text-rose-700 shadow-sm'
                  : 'text-zinc-600 hover:text-rose-700'
              }`}
            >
              Acesso Bloqueado ({blockedProfilesCount})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-360px)] min-h-[300px] border-t border-zinc-100">
          <table className="w-full text-left border-collapse min-w-[1020px]">
            <thead className="sticky top-0 z-10 shadow-xs">
              <tr className="bg-zinc-50 border-b border-zinc-200 text-xs font-semibold text-zinc-600 uppercase tracking-wider">
                <th className="px-6 py-3.5 bg-zinc-50 min-w-[240px] whitespace-nowrap">Usuário (Email)</th>
                <th className="px-6 py-3.5 bg-zinc-50 min-w-[140px] whitespace-nowrap">Nível de Permissão</th>
                <th className="px-6 py-3.5 bg-zinc-50 min-w-[190px] whitespace-nowrap">Professor Associado</th>
                <th className="px-6 py-3.5 bg-zinc-50 min-w-[150px] whitespace-nowrap">Status do Professor</th>
                <th className="px-6 py-3.5 bg-zinc-50 min-w-[160px] whitespace-nowrap">Status do Acesso</th>
                <th className="px-6 py-3.5 bg-zinc-50 min-w-[150px] whitespace-nowrap">Senha Provisória</th>
                <th className="px-6 py-3.5 bg-zinc-50 text-right min-w-[210px] whitespace-nowrap sticky right-0">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-sm">
              {filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 mb-3 text-zinc-400">
                      <User className="w-6 h-6" />
                    </div>
                    <p className="font-semibold text-zinc-800 text-sm">
                      {accessFilter === 'blocked'
                        ? 'Nenhum usuário com acesso bloqueado.'
                        : accessFilter === 'active'
                        ? 'Nenhum usuário com acesso liberado.'
                        : 'Nenhum usuário configurado.'}
                    </p>
                    {searchTerm && (
                      <p className="text-xs text-zinc-400 mt-1">
                        Tente ajustar os termos da busca para localizar o usuário.
                      </p>
                    )}
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((p) => {
                  const associatedTeacher = p.teacher_id
                    ? state.teachers.find((t) => t.id === p.teacher_id)
                    : null;
                  const isSelf = currentUserProfile?.email === p.email;

                  return (
                    <tr key={p.id} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-zinc-900 flex items-center">
                          {p.email}
                          {isSelf && (
                            <span className="ml-2 text-xs bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded-md font-medium">
                              Você
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-zinc-400 font-mono mt-0.5 select-all flex items-center gap-1">
                          <span>ID: {p.id && p.id.length > 12 ? `${p.id.slice(0, 8)}...${p.id.slice(-3)}` : p.id}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">{getRoleBadge(p.role)}</td>
                      <td className="px-6 py-4 text-zinc-600 font-medium">
                        {p.role === "teacher" ? (
                          associatedTeacher ? (
                            <span className="text-zinc-950 font-semibold">{associatedTeacher.name}</span>
                          ) : (
                            <span className="text-amber-600 text-xs font-semibold flex items-center">
                              ⚠️ Aguardando associação
                            </span>
                          )
                        ) : (
                          <span className="text-zinc-400 font-normal">N/A</span>
                        )}
                      </td>

                      {/* Status do Professor (teachers.status) */}
                      <td className="px-6 py-4">
                        {p.role === "teacher" && associatedTeacher ? (
                          associatedTeacher.status === "inactive" ? (
                            <span className="px-2.5 py-1 inline-flex items-center text-xs font-semibold rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                              <UserX className="w-3.5 h-3.5 mr-1 text-amber-600" />
                              Inativo
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 inline-flex items-center text-xs font-semibold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                              <UserCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                              Ativo
                            </span>
                          )
                        ) : (
                          <span className="text-zinc-400 text-xs">N/A</span>
                        )}
                      </td>

                      {/* Status do Acesso (profiles.access_status) */}
                      <td className="px-6 py-4">
                        {p.access_status === "blocked" ? (
                          <span className="px-2.5 py-1 inline-flex items-center text-xs font-semibold rounded-full bg-rose-50 text-rose-800 border border-rose-200">
                            <Lock className="w-3.5 h-3.5 mr-1 text-rose-600" />
                            Acesso Bloqueado
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 inline-flex items-center text-xs font-semibold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                            <Unlock className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                            Acesso Liberado
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {p.temp_password ? (
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-xs bg-zinc-100 px-2 py-1 rounded select-all">
                              {visiblePasswords[p.id] ? p.temp_password : "••••••"}
                            </span>
                            <button
                              onClick={() => togglePasswordVisibility(p.id)}
                              className="p-1 hover:bg-zinc-200 rounded text-zinc-500 transition-colors"
                              title={visiblePasswords[p.id] ? "Ocultar" : "Mostrar"}
                            >
                              {visiblePasswords[p.id] ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-zinc-400 text-xs italic">Não registrada</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap min-w-[210px]">
                        <div className="flex items-center justify-end space-x-2">
                          {p.access_status === "blocked" ? (
                            <button
                              onClick={() => {
                                setConfirmAccessProfile(p);
                                setTargetAccessStatus("active");
                                setToggleAccessError(null);
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 transition-colors inline-flex items-center shadow-xs"
                              title="Liberar Acesso do Usuário"
                            >
                              <Unlock className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                              <span>Liberar Acesso</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setConfirmAccessProfile(p);
                                setTargetAccessStatus("blocked");
                                setToggleAccessError(null);
                              }}
                              disabled={isSelf}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 transition-colors inline-flex items-center shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                              title={isSelf ? "Você não pode bloquear o seu próprio acesso" : "Bloquear Acesso do Usuário"}
                            >
                              <Lock className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
                              <span>Bloquear Acesso</span>
                            </button>
                          )}

                          <button
                            onClick={() => openModal(p)}
                            className="p-1.5 hover:bg-zinc-100 text-zinc-600 hover:text-indigo-600 rounded-lg transition-colors"
                            title="Editar Perfil / Credenciais"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={async () => {
                              if (isSelf) {
                                alert("Você não pode excluir o seu próprio perfil!");
                                return;
                              }
                              if (confirm(`ATENÇÃO: A exclusão física remove permanentemente o registro de ${p.email}. Use 'Bloquear Acesso' se deseja apenas suspender o login.\n\nDeseja realmente excluir em definitivo?`)) {
                                try {
                                  await deleteProfile(p.id, p.email);
                                } catch (err: any) {
                                  alert(`Erro ao excluir perfil: ${err.message || "Erro desconhecido"}`);
                                }
                              }
                            }}
                            className="p-1.5 hover:bg-rose-50 text-zinc-400 hover:text-rose-600 rounded-lg transition-colors disabled:opacity-30"
                            disabled={isSelf}
                            title="Excluir Registro Permanente"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Form */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl border border-zinc-100 shadow-2xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
                <h3 className="font-bold text-lg text-zinc-900">
                  {editingProfile ? "Editar Usuário" : "Novo Usuário"}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {error && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm font-medium">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Email de Login <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    disabled={isSubmitting}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:opacity-50"
                    placeholder="ex: professor@escola.com"
                  />
                  <p className="text-xs text-zinc-400 mt-1">
                    Este email deve ser o mesmo utilizado pela pessoa ao se cadastrar/logar.
                  </p>
                </div>

                {!editingProfile ? (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Senha <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="password"
                      required
                      disabled={isSubmitting}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:opacity-50"
                      placeholder="Mínimo de 6 caracteres"
                    />
                  </div>
                ) : (
                  <div className="space-y-4 border border-zinc-150 rounded-2xl p-4 bg-zinc-50/50">
                    <div className="flex items-center space-x-2 text-indigo-600 font-semibold text-sm">
                      <Shield className="w-4 h-4" />
                      <span>Gerenciamento de Senha</span>
                    </div>

                    <div className="border-t border-zinc-100 pt-3 space-y-3">
                      {/* Option 1: Direct update */}
                      <div>
                        <label className="block text-xs font-semibold text-zinc-600 mb-1">
                          Definir Nova Senha Direto (Instante)
                        </label>
                        <div className="flex space-x-2">
                          <input
                            type="text"
                            placeholder="Nova senha (mín. 6 caracteres)"
                            value={newDirectPassword}
                            onChange={(e) => setNewDirectPassword(e.target.value)}
                            disabled={directResetStatus === 'loading'}
                            className="flex-1 px-3 py-1.5 border border-zinc-200 rounded-lg text-xs outline-none bg-white focus:ring-1 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            disabled={newDirectPassword.length < 6 || directResetStatus === 'loading'}
                            onClick={async () => {
                              if (newDirectPassword.length < 6) return;
                              setDirectResetStatus('loading');
                              setRpcErrorText("");
                              try {
                                // 1. Attempt to call RPC
                                const { data, error: rpcErr } = await supabase.rpc('admin_reset_user_password', {
                                  target_user_id: editingProfile.id,
                                  new_password: newDirectPassword
                                });

                                if (rpcErr) {
                                  setDirectResetStatus('missing_rpc');
                                  setRpcErrorText(rpcErr.message);
                                  return;
                                }

                                const response = data as any;
                                if (response && response.success === false) {
                                  throw new Error(response.message || 'Erro na redefinição.');
                                }

                                // 2. Update the local state & profiles table
                                await updateProfile(editingProfile.id, { temp_password: newDirectPassword });
                                setDirectResetStatus('success');
                                setNewDirectPassword("");
                              } catch (err: any) {
                                console.error('Error in direct password reset:', err);
                                setDirectResetStatus('error');
                                setRpcErrorText(err.message || 'Erro desconhecido ao tentar alterar senha.');
                              }
                            }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm disabled:opacity-40"
                          >
                            {directResetStatus === 'loading' ? 'Alterando...' : 'Alterar Agora'}
                          </button>
                        </div>
                        
                        {directResetStatus === 'success' && (
                          <p className="text-xs text-emerald-600 font-semibold mt-1">
                            ✅ Senha alterada e anotada com sucesso!
                          </p>
                        )}
                        {directResetStatus === 'error' && (
                          <p className="text-xs text-rose-600 font-medium mt-1">
                            ❌ {rpcErrorText}
                          </p>
                        )}
                        
                        {/* Missing RPC Instructions */}
                        {directResetStatus === 'missing_rpc' && (
                          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2 text-zinc-700">
                            <div className="flex items-center space-x-1.5 font-bold text-amber-800 text-xs">
                              <span>⚠️ Executar Script SQL no Supabase</span>
                            </div>
                            <p className="text-[11px] leading-relaxed text-zinc-600">
                              Para o Super Admin alterar senhas diretamente no banco Supabase (sem depender de confirmações de e-mail), execute a função abaixo no <strong>SQL Editor</strong> do seu projeto Supabase:
                            </p>
                            
                            <button
                              type="button"
                              onClick={async () => {
                                setDirectResetStatus('loading');
                                try {
                                  // Just update the profile annotation
                                  await updateProfile(editingProfile.id, { temp_password: newDirectPassword });
                                  setDirectResetStatus('success');
                                  setNewDirectPassword("");
                                } catch (err: any) {
                                  setDirectResetStatus('error');
                                  setRpcErrorText(err.message || 'Erro ao anotar.');
                                }
                              }}
                              className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition-colors shadow-sm"
                            >
                              Salvar como "Anotação de Senha" no Perfil
                            </button>

                            <div className="mt-2 space-y-2 text-left">
                              <p className="text-[10px] font-semibold text-zinc-600">
                                Script SQL para rodar no Supabase SQL Editor:
                              </p>
                              <div className="relative">
                                <pre className="bg-zinc-900 text-zinc-100 p-2.5 rounded-lg font-mono text-[9px] overflow-x-auto max-h-40 leading-relaxed">
                                  {`ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS temp_password text;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  target_user_id text,
  new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  caller_role text;
  uuid_target uuid;
  hashed_pwd text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid()::text;
  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas Super Admins podem redefinir senhas.');
  END IF;

  BEGIN
    uuid_target := target_user_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'ID de usuário inválido.');
  END;

  BEGIN
    hashed_pwd := extensions.crypt(new_password, extensions.gen_salt('bf', 10));
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      hashed_pwd := crypt(new_password, gen_salt('bf', 10));
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'message', 'Extensão pgcrypto ausente no Supabase.');
    END;
  END;

  UPDATE auth.users 
  SET encrypted_password = hashed_pwd,
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = uuid_target;

  BEGIN
    UPDATE public.profiles 
    SET temp_password = new_password 
    WHERE id = target_user_id;
  EXCEPTION WHEN OTHERS THEN
    -- Ignorar caso a coluna temp_password ainda não exista
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'message', 'Senha alterada com sucesso.');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(text, text) TO service_role;`}
                                </pre>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(`ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS temp_password text;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  target_user_id text,
  new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  caller_role text;
  uuid_target uuid;
  hashed_pwd text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid()::text;
  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas Super Admins podem redefinir senhas.');
  END IF;

  BEGIN
    uuid_target := target_user_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'ID de usuário inválido.');
  END;

  BEGIN
    hashed_pwd := extensions.crypt(new_password, extensions.gen_salt('bf', 10));
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      hashed_pwd := crypt(new_password, gen_salt('bf', 10));
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'message', 'Extensão pgcrypto ausente no Supabase.');
    END;
  END;

  UPDATE auth.users 
  SET encrypted_password = hashed_pwd,
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE id = uuid_target;

  BEGIN
    UPDATE public.profiles 
    SET temp_password = new_password 
    WHERE id = target_user_id;
  EXCEPTION WHEN OTHERS THEN
    -- Ignorar caso a coluna temp_password ainda não exista
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'message', 'Senha alterada com sucesso.');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_user_password(text, text) TO service_role;`);
                                    setCopiedSql(true);
                                    setTimeout(() => setCopiedSql(false), 2000);
                                  }}
                                  className="absolute right-2 top-2 px-2 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded text-[10px] flex items-center space-x-1 shadow transition-colors"
                                  title="Copiar código SQL"
                                >
                                  {copiedSql ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-300" />
                                      <span>Copiado!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>Copiar SQL</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Nível de Permissão
                  </label>
                  <select
                    disabled={isSubmitting}
                    value={formData.role}
                    onChange={(e: any) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm font-medium text-zinc-700 disabled:opacity-50"
                  >
                    <option value="super_admin">Super Admin</option>
                    <option value="admin">Admin</option>
                    <option value="teacher">Professor</option>
                  </select>
                </div>

                {formData.role === "teacher" && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-zinc-50 border border-zinc-150 rounded-2xl space-y-2"
                  >
                    <label className="block text-sm font-semibold text-zinc-800">
                      Vincular ao Cadastro de Professor <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      disabled={isSubmitting}
                      value={formData.teacher_id}
                      onChange={(e) => setFormData({ ...formData, teacher_id: e.target.value })}
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm disabled:opacity-50"
                    >
                      <option value="">-- Selecione o Professor --</option>
                      {state.teachers
                        .filter(teacher => teacher.status === 'active' || (editingProfile && teacher.id === formData.teacher_id))
                        .map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.name} ({teacher.email || "Sem email"}){teacher.status === 'inactive' ? ' (Inativo)' : ''}
                          </option>
                        ))}
                    </select>
                    <p className="text-xs text-zinc-500">
                      Necessário para que o professor consiga visualizar somente seus alunos e sua agenda própria de aulas.
                    </p>

                    {formData.teacher_id && (
                      <div className="pt-2">
                        <TeacherGoogleCalendarCard
                          teacherId={formData.teacher_id}
                          teacherName={state.teachers.find(t => t.id === formData.teacher_id)?.name}
                        />
                      </div>
                    )}
                  </motion.div>
                )}

                <div className="pt-4 flex justify-end space-x-3 border-t border-zinc-100">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm shadow-indigo-100 disabled:opacity-50 flex items-center justify-center min-w-[80px]"
                  >
                    {isSubmitting ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Confirmação: Bloquear / Liberar Acesso (Regra Mestra: Super Admin) */}
      <AnimatePresence>
        {confirmAccessProfile && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-zinc-200"
            >
              <div
                className={`px-6 py-5 border-b flex items-center justify-between ${
                  targetAccessStatus === "blocked"
                    ? "bg-rose-50/70 border-rose-100"
                    : "bg-emerald-50/70 border-emerald-100"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`p-2.5 rounded-xl ${
                      targetAccessStatus === "blocked"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {targetAccessStatus === "blocked" ? (
                      <Lock className="w-5 h-5" />
                    ) : (
                      <Unlock className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-900">
                      {targetAccessStatus === "blocked"
                        ? "Bloquear Acesso do Usuário"
                        : "Liberar Acesso do Usuário"}
                    </h3>
                    <p className="text-xs text-zinc-500 font-mono">
                      {confirmAccessProfile.email}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmAccessProfile(null);
                    setToggleAccessError(null);
                  }}
                  disabled={isTogglingAccess}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {toggleAccessError && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2.5">
                    <div className="flex items-start gap-2 font-medium">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600 mt-0.5" />
                      <span>{toggleAccessError}</span>
                    </div>

                    {isEdgeFunctionMissing && (
                      <div className="pt-2 border-t border-rose-200/80 space-y-2 text-zinc-700">
                        <p className="font-semibold text-zinc-900">
                          Deploy da Edge Function no Supabase CLI:
                        </p>
                        <p className="text-[11px] text-zinc-600">
                          A Edge Function oficial foi criada em <code className="bg-zinc-200/70 px-1 py-0.5 rounded text-zinc-800">/supabase/functions/admin-toggle-user-access</code>. Para implantá-la no seu projeto Supabase com suporte à Auth Admin API, execute:
                        </p>
                        <div className="relative">
                          <pre className="bg-zinc-900 text-zinc-100 p-2.5 rounded-lg font-mono text-[10px] overflow-x-auto leading-relaxed">
{`supabase functions deploy admin-toggle-user-access`}
                          </pre>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(`supabase functions deploy admin-toggle-user-access`);
                              setCopiedDeployCmd(true);
                              setTimeout(() => setCopiedDeployCmd(false), 2500);
                            }}
                            className="absolute right-2 top-2 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-semibold transition-colors flex items-center gap-1 shadow"
                          >
                            {copiedDeployCmd ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-300" />
                                <span>Copiado!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copiar Comando</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {targetAccessStatus === "blocked" ? (
                  <div className="space-y-3 text-xs text-zinc-600 leading-relaxed">
                    <div className="p-3.5 bg-rose-50/80 border border-rose-200 rounded-xl text-rose-900 space-y-1">
                      <div className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                        <span>O que acontece ao bloquear:</span>
                      </div>
                      <ul className="list-disc pl-5 space-y-1 pt-1 text-rose-950">
                        <li>O usuário será desconectado e impedido de fazer login no sistema.</li>
                        <li>Tentativas de login receberão aviso de acesso bloqueado pela coordenação.</li>
                      </ul>
                    </div>

                    <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-zinc-700 space-y-1">
                      <span className="font-semibold block text-zinc-900">Dados integralmente preservados:</span>
                      <p>
                        O perfil, histórico de aulas, permissões, relatórios e vínculo com Google Agenda <strong>permanecem intactos</strong>. O bloqueio atua exclusivamente na permissão de login.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 text-xs text-zinc-600 leading-relaxed">
                    <p className="text-sm font-semibold text-zinc-900">
                      Liberar o acesso para este usuário?
                    </p>
                    <p>
                      O usuário <strong>{confirmAccessProfile.email}</strong> voltará a poder realizar login normalmente na plataforma com suas credenciais cadastradas.
                    </p>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmAccessProfile(null);
                    setToggleAccessError(null);
                  }}
                  disabled={isTogglingAccess}
                  className="px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-200/80 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleToggleAccess}
                  disabled={isTogglingAccess}
                  className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow transition-all flex items-center gap-1.5 ${
                    targetAccessStatus === "blocked"
                      ? "bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400"
                      : "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400"
                  }`}
                >
                  {isTogglingAccess ? (
                    <span>Processando...</span>
                  ) : targetAccessStatus === "blocked" ? (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Confirmar Bloqueio</span>
                    </>
                  ) : (
                    <>
                      <Unlock className="w-3.5 h-3.5" />
                      <span>Confirmar Liberação</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
