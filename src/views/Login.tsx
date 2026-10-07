import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Music, Lock, Mail, KeyRound, ArrowLeft, Send, CheckCircle2 } from 'lucide-react';

export const Login: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'reset' | 'update_password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    // Detect password recovery redirect from email
    if (window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery')) {
      setMode('update_password');
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const cleanEmail = email.trim().toLowerCase();

    try {
      // 1. Verificar prévia se o usuário está com access_status = 'blocked'
      try {
        const { data: profCheck } = await supabase
          .from('profiles')
          .select('access_status')
          .ilike('email', cleanEmail)
          .maybeSingle();

        if (profCheck && profCheck.access_status === 'blocked') {
          await supabase.auth.signOut();
          setError('Acesso bloqueado pela administração da escola. Entre em contato com a coordenação.');
          setLoading(false);
          return;
        }
      } catch (checkErr) {
        console.warn('Pre-login profile check warning:', checkErr);
      }

      // 2. Autenticação estrita com senha. Não permite cadastro público.
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      
      if (error) {
        const errMsg = error.message?.toLowerCase() || '';
        if (errMsg.includes('banned') || errMsg.includes('suspended') || errMsg.includes('blocked')) {
          await supabase.auth.signOut();
          setError('Acesso bloqueado pela administração da escola. Entre em contato com a coordenação.');
          return;
        }

        throw error;
      }

      // 3. Pós-login bem-sucedido: garantir que não está bloqueado
      const { data: postCheck } = await supabase
        .from('profiles')
        .select('access_status')
        .ilike('email', cleanEmail)
        .maybeSingle();
      if (postCheck && postCheck.access_status === 'blocked') {
        await supabase.auth.signOut();
        setError('Acesso bloqueado pela administração da escola. Entre em contato com a coordenação.');
        return;
      }
    } catch (err: any) {
      const msg = err.message || '';
      const lower = msg.toLowerCase();
      if (lower.includes('banned') || lower.includes('suspended') || lower.includes('blocked') || (err.status === 400 && lower.includes('grant'))) {
        setError('Acesso bloqueado pela administração da escola. Entre em contato com a coordenação.');
      } else if (msg.includes('Email not confirmed') || msg.includes('Invalid login credentials')) {
        setError('E-mail ou senha incorretos. Se esqueceu sua senha, utilize a opção de redefinição por e-mail abaixo.');
      } else if (msg.includes('User already registered')) {
        setError('Este e-mail já está cadastrado. Tente fazer login.');
      } else {
        setError(msg || 'Ocorreu um erro na autenticação.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    const cleanEmail = (resetEmail || email).trim().toLowerCase();
    if (!cleanEmail) {
      setError('Informe um e-mail válido.');
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}`,
      });
      if (error) throw error;
      setSuccess(`E-mail de redefinição enviado para ${cleanEmail}! Verifique sua caixa de entrada e pasta de spam.`);
    } catch (err: any) {
      setError(err.message || 'Erro ao enviar e-mail de redefinição. Verifique o endereço informado.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 6) {
      setError('A senha deve conter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas informadas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setSuccess('Sua senha foi redefinida com sucesso! Acesse o sistema utilizando sua nova senha.');
      setMode('login');
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar a senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <Music className="w-8 h-8 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-zinc-900">
          {mode === 'reset' 
            ? 'Recuperar Senha' 
            : mode === 'update_password'
            ? 'Redefinir Senha'
            : 'Acesso ao Sistema'}
        </h2>
        <p className="mt-2 text-center text-sm text-zinc-600">
          Área restrita para administração
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-zinc-200/50 sm:rounded-2xl sm:px-10 border border-zinc-100">
          {error && (
            <div className="mb-6 bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm">
              <p>{error}</p>
            </div>
          )}
          {success && (
            <div className="mb-6 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <p>{success}</p>
            </div>
          )}

          {/* MODE: LOGIN */}
          {mode === 'login' && (
            <form className="space-y-6" onSubmit={handleAuth}>
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Email
                </label>
                <div className="mt-1 relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-zinc-400" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm outline-none transition-colors"
                    placeholder="seuemail@exemplo.com"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-zinc-700">
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setSuccess(null);
                      setResetEmail(email);
                      setMode('reset');
                    }}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                  >
                    Esqueceu sua senha?
                  </button>
                </div>
                <div className="mt-1 relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-zinc-400" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm outline-none transition-colors"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Aguarde...' : 'Entrar'}
                </button>
              </div>
              
              <div className="text-center pt-2 border-t border-zinc-100 flex flex-col gap-2">
                <div className="pt-2 text-xs text-zinc-400">
                  <a
                    href="/politica-de-privacidade"
                    className="hover:text-zinc-600 underline transition-colors"
                  >
                    Política de Privacidade
                  </a>
                </div>
              </div>
            </form>
          )}

          {/* MODE: REQUEST PASSWORD RESET */}
          {mode === 'reset' && (
            <form className="space-y-6" onSubmit={handleReset}>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Informe o seu e-mail cadastrado para receber um link de redirecionamento e criar uma nova senha.
              </p>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  E-mail do Cadastro
                </label>
                <div className="mt-1 relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-zinc-400" />
                  </div>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm outline-none transition-colors"
                    placeholder="seuemail@exemplo.com"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
                >
                  <Send className="w-4 h-4" />
                  {loading ? 'Enviando...' : 'Enviar e-mail de redefinição'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccess(null);
                    setMode('login');
                  }}
                  className="w-full flex justify-center items-center gap-1.5 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Voltar para o Login
                </button>
              </div>
            </form>
          )}

          {/* MODE: UPDATE PASSWORD (FROM EMAIL RECOVERY LINK) */}
          {mode === 'update_password' && (
            <form className="space-y-6" onSubmit={handleUpdatePassword}>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Digite sua nova senha abaixo para atualizar seu acesso.
              </p>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Nova Senha
                </label>
                <div className="mt-1 relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-zinc-400" />
                  </div>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm outline-none transition-colors"
                    placeholder="Mínimo 6 caracteres"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Confirmar Nova Senha
                </label>
                <div className="mt-1 relative rounded-xl shadow-sm">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-zinc-400" />
                  </div>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm outline-none transition-colors"
                    placeholder="Repita a nova senha"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center gap-2 py-2.5 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
                >
                  <KeyRound className="w-4 h-4" />
                  {loading ? 'Salvando...' : 'Salvar Nova Senha'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccess(null);
                    setMode('login');
                  }}
                  className="w-full flex justify-center items-center gap-1.5 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

