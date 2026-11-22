import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Music, Lock, Mail } from 'lucide-react';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

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
        setError('E-mail ou senha incorretos. Para redefinir o acesso, procure a administração do Instituto.');
      } else if (msg.includes('User already registered')) {
        setError('Este e-mail já está cadastrado. Tente fazer login.');
      } else {
        setError(msg || 'Ocorreu um erro na autenticação.');
      }
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
          Acesso ao Sistema
        </h2>
        <p className="mt-2 text-center text-sm text-zinc-600">Área restrita para administração</p>
      </div>
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-zinc-200/50 sm:rounded-2xl sm:px-10 border border-zinc-100">
          {error && (
            <div className="mb-6 bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm">
              <p>{error}</p>
            </div>
          )}
          {/* Redefinicao de acesso realizada exclusivamente pela administracao. */}
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
                <label className="block text-sm font-medium text-zinc-700">
                  Senha
                </label>
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
                <div className="text-[11px] text-zinc-500 leading-relaxed">
                  Desenvolvido por{' '}
                  <a
                    href="https://hostware.com.br"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-indigo-700 hover:text-indigo-900 underline underline-offset-2 transition-colors"
                  >
                    Hostware Tecnologia e Soluções Digitais
                  </a>
                </div>
              </div>
            </form>
        </div>
      </div>
    </div>
  );
};
