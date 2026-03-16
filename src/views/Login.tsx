import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Music, Lock, Mail } from 'lucide-react';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setSuccess('Cadastro realizado com sucesso! Verifique seu email se necessário, ou faça login.');
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message || 'Ocorreu um erro na autenticação.');
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
          {isSignUp ? 'Criar conta de Administrador' : 'Acesso ao Sistema'}
        </h2>
        <p className="mt-2 text-center text-sm text-zinc-600">
          Área restrita para administração
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-xl shadow-zinc-200/50 sm:rounded-2xl sm:px-10 border border-zinc-100">
          <form className="space-y-6" onSubmit={handleAuth}>
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-600 px-4 py-3 rounded-xl text-sm">
                {success}
              </div>
            )}
            
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
                  placeholder="admin@escola.com"
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
                {loading ? 'Aguarde...' : (isSignUp ? 'Cadastrar' : 'Entrar')}
              </button>
            </div>
            
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
              >
                {isSignUp ? 'Já tenho uma conta. Fazer login.' : 'Não tem conta? Cadastrar-se.'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
