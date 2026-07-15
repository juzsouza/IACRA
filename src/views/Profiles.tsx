import React, { useState } from "react";
import { Plus, Search, Edit2, Trash2, X, Shield, User, GraduationCap, Eye, EyeOff, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAppStore, UserProfile } from "../store";
import { supabase } from "../lib/supabase";

export const Profiles: React.FC = () => {
  const { state, addProfile, updateProfile, deleteProfile, currentUserProfile } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null);

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

  const filteredProfiles = state.profiles.filter(
    (p) =>
      (p.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.role || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

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
      const payload: UserProfile = {
        id: editingProfile ? editingProfile.id : crypto.randomUUID(),
        email: formData.email.trim().toLowerCase(),
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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Controle de Usuários e Permissões
          </h1>
          <p className="text-zinc-500 text-sm">
            Gerencie os níveis de acesso (Super Admin, Admin, Professor) e associe professores aos seus cadastros.
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

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-sm flex items-center">
        <div className="flex-1 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar por email ou nível de acesso..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      {/* Profiles Table */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-100 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                <th className="px-6 py-4">Usuário (Email)</th>
                <th className="px-6 py-4">Nível de Permissão</th>
                <th className="px-6 py-4">Professor Associado</th>
                <th className="px-6 py-4">Senha Provisória</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-sm">
              {filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                    Nenhum usuário configurado.
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
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => openModal(p)}
                            className="p-1.5 hover:bg-zinc-100 text-zinc-600 hover:text-indigo-600 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={async () => {
                              if (isSelf) {
                                alert("Você não pode excluir o seu próprio perfil!");
                                return;
                              }
                              if (confirm(`Tem certeza de que deseja remover o acesso de ${p.email}?`)) {
                                try {
                                  await deleteProfile(p.id);
                                } catch (err: any) {
                                  alert(`Erro ao excluir perfil: ${err.message || "Erro desconhecido"}`);
                                }
                              }
                            }}
                            className="p-1.5 hover:bg-rose-50 text-zinc-400 hover:text-rose-600 rounded-lg transition-colors disabled:opacity-30"
                            disabled={isSelf}
                            title="Excluir"
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
                                  // Check if the RPC is missing
                                  if (rpcErr.message?.includes('does not exist') || rpcErr.code === 'P0001' || rpcErr.message?.includes('function')) {
                                    setDirectResetStatus('missing_rpc');
                                    setRpcErrorText(rpcErr.message);
                                  } else {
                                    throw rpcErr;
                                  }
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
                              <span>⚠️ Função SQL do Supabase Ausente</span>
                            </div>
                            <p className="text-[11px] leading-relaxed text-zinc-600">
                              Para redefinir senhas diretamente sem e-mail, seu banco precisa de uma permissão especial de Admin. 
                              <strong> Alternativa:</strong> Se preferir não fazer isso, nós salvamos a senha apenas na tabela local:
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
                              className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition-colors"
                            >
                              Salvar apenas como "Anotação de Senha"
                            </button>

                            <details className="mt-1">
                              <summary className="text-[11px] text-indigo-600 font-semibold cursor-pointer outline-none hover:underline">
                                Ver script SQL para habilitar alteração real
                              </summary>
                              <div className="mt-2 space-y-2 text-left">
                                <p className="text-[10px] text-zinc-500">
                                  Copie o código abaixo e cole no <strong>SQL Editor</strong> do painel do seu Supabase, depois clique em "Run":
                                </p>
                                <div className="relative">
                                  <pre className="bg-zinc-900 text-zinc-100 p-2 rounded-lg font-mono text-[9px] overflow-x-auto max-h-36">
                                    {`CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  target_user_id text,
  new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_role text;
  uuid_target uuid;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid()::text;
  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas Super Admins podem redefinir senhas.');
  END IF;
  BEGIN
    uuid_target := target_user_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'ID inválido.');
  END;
  UPDATE auth.users SET encrypted_password = crypt(new_password, gen_salt('bf', 10)) WHERE id = uuid_target;
  UPDATE public.profiles SET temp_password = new_password WHERE id = target_user_id;
  RETURN jsonb_build_object('success', true, 'message', 'Senha redefinida com sucesso.');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;`}
                                  </pre>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(`CREATE OR REPLACE FUNCTION public.admin_reset_user_password(
  target_user_id text,
  new_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_role text;
  uuid_target uuid;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid()::text;
  IF caller_role IS NULL OR caller_role != 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas Super Admins podem redefinir senhas.');
  END IF;
  BEGIN
    uuid_target := target_user_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', 'ID inválido.');
  END;
  UPDATE auth.users SET encrypted_password = crypt(new_password, gen_salt('bf', 10)) WHERE id = uuid_target;
  UPDATE public.profiles SET temp_password = new_password WHERE id = target_user_id;
  RETURN jsonb_build_object('success', true, 'message', 'Senha redefinida com sucesso.');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;`);
                                      setCopiedSql(true);
                                      setTimeout(() => setCopiedSql(false), 2000);
                                    }}
                                    className="absolute right-2 top-2 p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded border border-zinc-700 transition-colors"
                                    title="Copiar código SQL"
                                  >
                                    {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                            </details>
                          </div>
                        )}
                      </div>

                      {/* Option 2: Email reset */}
                      <div className="border-t border-zinc-100 pt-3">
                        <label className="block text-xs font-semibold text-zinc-600 mb-1">
                          Ou Disparar Link de Redefinição por E-mail
                        </label>
                        <button
                          type="button"
                          disabled={resetEmailStatus === 'sending' || isSubmitting}
                          onClick={async () => {
                            if (!editingProfile?.email) return;
                            setResetEmailStatus('sending');
                            setError(null);
                            try {
                              const { error } = await supabase.auth.resetPasswordForEmail(editingProfile.email, {
                                redirectTo: `${window.location.origin}/`,
                              });
                              if (error) throw error;
                              setResetEmailStatus('success');
                            } catch (err: any) {
                              setResetEmailStatus('error');
                              setError(err.message || 'Erro ao enviar e-mail de redefinição.');
                            }
                          }}
                          className="w-full px-4 py-2 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-semibold text-indigo-600 shadow-sm transition-colors disabled:opacity-50"
                        >
                          {resetEmailStatus === 'sending' && "Enviando..."}
                          {resetEmailStatus === 'success' && "✅ E-mail enviado!"}
                          {resetEmailStatus === 'error' && "❌ Erro ao enviar, tente novamente"}
                          {resetEmailStatus === 'idle' && "Disparar e-mail de redefinição"}
                        </button>
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
                      {state.teachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.name} ({teacher.email || "Sem email"})
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-zinc-500">
                      Necessário para que o professor consiga visualizar somente seus alunos e sua agenda própria de aulas.
                    </p>
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
    </div>
  );
};
