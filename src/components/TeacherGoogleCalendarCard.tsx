import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, AlertCircle, RefreshCw, Unlink, X, Download } from 'lucide-react';
import {
  getGoogleConfig,
  getGoogleAuthUrl,
  getTeacherGoogleStatus,
  disconnectTeacherGoogle,
  syncTeacherFutureClasses,
  pullGoogleEvents,
  GoogleAccountStatus,
} from '../services/googleCalendarClient';
import { useAppStore } from '../store';

interface TeacherGoogleCalendarCardProps {
  teacherId: string;
  teacherName?: string;
  compact?: boolean;
}

export const TeacherGoogleCalendarCard: React.FC<TeacherGoogleCalendarCardProps> = ({
  teacherId,
  teacherName,
  compact = false,
}) => {
  const { state, currentUserProfile } = useAppStore();
  const [status, setStatus] = useState<GoogleAccountStatus>({
    connected: false,
    googleEmail: null,
    connectedAt: null,
    connectionStatus: 'disconnected',
  });
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [fallbackAuthUrl, setFallbackAuthUrl] = useState<string | null>(null);

  const isSelfTeacher = currentUserProfile?.role === 'teacher' && currentUserProfile?.teacher_id === teacherId;
  const isSuperAdminOrAdmin = currentUserProfile?.role === 'super_admin' || currentUserProfile?.role === 'admin';

  const loadStatus = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [config, account] = await Promise.all([
        getGoogleConfig(),
        getTeacherGoogleStatus(teacherId),
      ]);
      setIsConfigured(config.configured);
      setStatus(account);
    } catch (e: any) {
      setErrorMessage('Não foi possível verificar a conexão com o Google.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (teacherId) {
      loadStatus();
    }
  }, [teacherId]);

  // Listener para mensagens da janela popup do OAuth
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_OAUTH_SUCCESS' && event.data?.teacherId === teacherId) {
        setStatus((prev) => ({
          connected: true,
          googleEmail: event.data.email || prev.googleEmail,
          connectedAt: prev.connectedAt || new Date().toISOString(),
          connectionStatus: 'connected',
        }));
        setErrorMessage(null);
        setFallbackAuthUrl(null);
        setSyncFeedback(
          'Google Agenda autorizada e conectada com sucesso! Novas aulas e alterações serão sincronizadas automaticamente.'
        );
      } else if (event.data?.type === 'GOOGLE_OAUTH_CANCEL') {
        setFallbackAuthUrl(null);
        setErrorMessage('Autorização cancelada ou recusada.');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [teacherId]);

  const handleConnect = async () => {
    if (isActionLoading) return;

    setIsActionLoading(true);
    setErrorMessage(null);
    setSyncFeedback(null);
    setFallbackAuthUrl(null);

    // 1. PRÉ-ABRIR O POPUP DE FORMA SÍNCRONA
    // No contexto direto do clique do usuário e ANTES de qualquer await/fetch
    const width = 520;
    const height = 700;
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2);
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2);

    let popup: Window | null = null;
    try {
      popup = window.open(
        'about:blank',
        'google_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},status=no,toolbar=no,menubar=no`
      );
    } catch {
      popup = null;
    }

    try {
      // 2. BUSCAR A URL DO GOOGLE DEPOIS
      const authRes = await getGoogleAuthUrl(teacherId);

      if (authRes.url) {
        // 3. SE A URL EXISTIR E O POPUP ESTIVER DISPONÍVEL
        if (popup && !popup.closed) {
          popup.location.href = authRes.url;
          popup.focus?.();
        } else {
          // 4. DETECTAR POPUP BLOQUEADO
          setFallbackAuthUrl(authRes.url);
          setErrorMessage('O navegador bloqueou a janela do Google. Clique em "Abrir Google Agenda" para continuar.');
        }
      } else {
        // 7. SE authRes.url NÃO EXISTIR
        if (popup && !popup.closed) {
          popup.close();
        }
        setFallbackAuthUrl(null);
        setErrorMessage(authRes.error || 'Erro ao iniciar autorização com o Google.');
      }
    } catch (e: any) {
      // 6. SE HOUVER ERRO AO BUSCAR authRes
      if (popup && !popup.closed) {
        popup.close();
      }
      setFallbackAuthUrl(null);
      setErrorMessage(e?.message || 'Falha ao conectar com o Google.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleDisconnect = () => {
    setErrorMessage(null);
    setShowDisconnectModal(true);
  };

  const handleConfirmDisconnect = async () => {
    setIsActionLoading(true);
    setErrorMessage(null);
    setSyncFeedback(null);

    try {
      const res = await disconnectTeacherGoogle(teacherId);
      if (res.success) {
        setStatus({
          connected: false,
          googleEmail: null,
          connectedAt: null,
          connectionStatus: 'disconnected',
        });
        setFallbackAuthUrl(null);
        setShowDisconnectModal(false);
        setSyncFeedback('Google Agenda desconectada com sucesso.');
      } else {
        setErrorMessage(res.error || 'Erro ao desconectar Google Agenda.');
      }
    } catch (e: any) {
      setErrorMessage(e?.message || 'Falha ao desconectar.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleManualSyncFuture = async () => {
    setIsActionLoading(true);
    setErrorMessage(null);
    setSyncFeedback(null);

    try {
      const studentsMap: Record<string, string> = {};
      state.students.forEach((s) => {
        studentsMap[s.id] = s.name;
      });
      const groupsMap: Record<string, string> = {};
      state.groups.forEach((g) => {
        groupsMap[g.id] = g.name;
      });

      const res = await syncTeacherFutureClasses(
        teacherId,
        state.classes,
        studentsMap,
        groupsMap
      );
      const extraRemaining =
        res.remaining && res.remaining > 0
          ? ` (${res.remaining} restante(s) para o próximo lote)`
          : '';
      setSyncFeedback(
        `Sincronização em lote concluída: ${res.synced} aula(s) sincronizada(s), ${res.skipped} já estavam no Google${
          res.failed > 0 ? `, ${res.failed} falha(s)` : ''
        }${extraRemaining}.`
      );
    } catch (e: any) {
      setErrorMessage(e?.message || 'Falha ao sincronizar aulas futuras.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleInboundPull = async () => {
    if (isActionLoading) return;
    setIsActionLoading(true);
    setErrorMessage(null);
    setSyncFeedback(null);
    try {
      const res = await pullGoogleEvents({ teacherId });
      if (res.error) {
        setErrorMessage(`Falha na importação: ${res.error}`);
      } else {
        setSyncFeedback(
          `Importação concluída! ${res.imported} nova(s) aula(s), ${res.updated} atualizada(s), ${res.cancelled} cancelada(s)${
            res.pendingStudentLink > 0 ? `, ${res.pendingStudentLink} com aluno pendente` : ''
          }.`
        );
      }
    } catch (e: any) {
      setErrorMessage(e?.message || 'Falha ao importar aulas do Google Agenda.');
    } finally {
      setIsActionLoading(false);
    }
  };

  if (compact) {
    if (isLoading) {
      return (
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs text-zinc-500 shadow-2xs">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-zinc-400" />
          <span className="hidden sm:inline">Google Agenda...</span>
        </div>
      );
    }

    return (
      <div className="relative inline-flex items-center">
        {status.connected ? (
          <div className="inline-flex items-center gap-2 bg-emerald-50/70 border border-emerald-200 rounded-xl px-3 py-1.5 shadow-2xs text-xs">
            <div className="flex items-center gap-1.5 text-emerald-900 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-200" />
              <span className="font-semibold">Google Agenda</span>
              <span className="text-emerald-700 font-semibold">• Conectado</span>
              {status.googleEmail && (
                <span
                  className="text-emerald-700/80 hidden md:inline truncate max-w-[150px]"
                  title={`Conta vinculada: ${status.googleEmail}`}
                >
                  ({status.googleEmail})
                </span>
              )}
            </div>
            {isSelfTeacher && (
              <button
                type="button"
                onClick={handleConnect}
                disabled={isActionLoading || isConfigured === false}
                className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 px-2 py-0.5 rounded-lg hover:bg-white/80 border border-transparent hover:border-indigo-200 transition-colors disabled:opacity-50"
                title="Reautorizar e atualizar permissões do Google Agenda sem desconectar"
              >
                Reautorizar Google Agenda
              </button>
            )}
            <button
              type="button"
              onClick={handleInboundPull}
              disabled={isActionLoading}
              className="text-xs font-semibold text-sky-700 hover:text-sky-900 px-2 py-0.5 rounded-lg hover:bg-white/80 border border-transparent hover:border-sky-200 transition-colors disabled:opacity-50 inline-flex items-center"
              title="Importar aulas criadas no Google Agenda com a marcação [EAVRA]"
            >
              <Download className={`w-3 h-3 mr-1 ${isActionLoading ? 'animate-spin' : ''}`} />
              Importar
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isActionLoading}
              className="text-xs font-semibold text-zinc-500 hover:text-rose-600 px-2 py-0.5 rounded-lg hover:bg-white/80 border border-transparent hover:border-zinc-200 transition-colors disabled:opacity-50"
              title="Desconectar do Google Agenda"
            >
              Desconectar
            </button>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 bg-white border border-zinc-200 rounded-xl px-3 py-1.5 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs text-zinc-700 font-medium">
              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
              <span className="font-semibold text-zinc-800">Google Agenda</span>
            </div>
            <button
              type="button"
              onClick={handleConnect}
              disabled={isActionLoading || isConfigured === false}
              className="inline-flex items-center px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-2xs disabled:opacity-50"
              title="Conectar sua conta Google Agenda"
            >
              {isActionLoading && <RefreshCw className="w-3 h-3 mr-1 animate-spin" />}
              Conectar
            </button>
          </div>
        )}

        {/* Fallback de Popup Bloqueado (Modo Compacto) */}
        {fallbackAuthUrl && (
          <div className="absolute top-full left-0 mt-1.5 z-40 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-2.5 shadow-lg flex items-center gap-2 whitespace-nowrap animate-in fade-in duration-150">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="text-[11px] font-medium text-amber-900">Janela bloqueada:</span>
            <a
              href={fallbackAuthUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-2.5 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-2xs"
            >
              Abrir Google Agenda
            </a>
            <button
              type="button"
              onClick={() => {
                setFallbackAuthUrl(null);
                setErrorMessage(null);
              }}
              className="p-0.5 text-amber-500 hover:text-amber-800 rounded transition-colors"
              title="Fechar aviso"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Feedback ou Erro Compacto */}
        {errorMessage && !fallbackAuthUrl && (
          <div
            className="absolute top-full left-0 mt-1 z-30 bg-rose-50 border border-rose-200 text-rose-800 text-[11px] rounded-lg px-2.5 py-1 shadow-md whitespace-nowrap flex items-center gap-1"
            title={errorMessage}
          >
            <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
            <span className="truncate max-w-[220px]">{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="ml-1 text-rose-400 hover:text-rose-700">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Modal de Confirmação de Desconexão */}
        {showDisconnectModal && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-zinc-200 space-y-4 animate-in fade-in zoom-in-95 duration-150 text-left">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                    <Unlink className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-zinc-900 text-base">
                      Desconectar Google Agenda?
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isActionLoading}
                  onClick={() => setShowDisconnectModal(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 text-sm text-zinc-600">
                <p>Novas aulas não serão mais sincronizadas com esta conta.</p>
                {status.googleEmail && (
                  <p className="text-xs text-zinc-500 bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                    Conta: <strong>{status.googleEmail}</strong>
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  disabled={isActionLoading}
                  onClick={() => setShowDisconnectModal(false)}
                  className="px-4 py-2 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isActionLoading}
                  onClick={handleConfirmDisconnect}
                  className="inline-flex items-center px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-sm disabled:opacity-50"
                >
                  {isActionLoading && <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Desconectar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 bg-zinc-50 border border-zinc-200 rounded-2xl flex items-center space-x-3 text-sm text-zinc-500">
        <RefreshCw className="w-4 h-4 animate-spin text-zinc-400" />
        <span>Verificando integração com Google Agenda...</span>
      </div>
    );
  }

  return (
    <div className={`bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm space-y-4 ${compact ? 'text-xs' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-semibold text-zinc-900 flex items-center gap-2">
              Google Agenda
              {status.connected ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Conectado
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 text-zinc-600">
                  Desconectado
                </span>
              )}
            </h4>
            <p className="text-xs text-zinc-500 mt-0.5">
              Sincronização unidirecional: Aulas da plataforma são espelhadas diretamente na sua conta Google.
            </p>
          </div>
        </div>

        {status.connected ? (
          <div className="flex items-center gap-2">
            {isSelfTeacher && (
              <button
                type="button"
                onClick={handleConnect}
                disabled={isActionLoading || isConfigured === false}
                className="inline-flex items-center px-3 py-1.5 border border-indigo-200 text-xs font-semibold rounded-xl text-indigo-700 bg-indigo-50/60 hover:bg-indigo-100/70 transition-colors disabled:opacity-50"
                title="Reautorizar Google Agenda sem desconectar a conta"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isActionLoading ? 'animate-spin' : ''}`} />
                Reautorizar Google Agenda
              </button>
            )}
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={isActionLoading}
              className="inline-flex items-center px-3 py-1.5 border border-zinc-200 text-xs font-medium rounded-xl text-zinc-700 bg-white hover:bg-zinc-50 hover:text-rose-600 transition-colors disabled:opacity-50"
              title="Desconectar do Google Agenda"
            >
              <Unlink className="w-3.5 h-3.5 mr-1.5" />
              Desconectar
            </button>
          </div>
        ) : isSelfTeacher ? (
          <button
            type="button"
            onClick={handleConnect}
            disabled={isActionLoading || isConfigured === false}
            className="inline-flex items-center px-4 py-2 border border-transparent text-xs font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
          >
            {isActionLoading ? (
              <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
            )}
            Conectar Google Agenda
          </button>
        ) : (
          <span className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-500 bg-zinc-50 border border-zinc-200">
            Autorização pendente pelo professor
          </span>
        )}
      </div>

      {/* Detalhes de status quando conectado */}
      {status.connected && (
        <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 text-xs space-y-1.5 text-emerald-900">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="font-medium text-emerald-800">
              Conta vinculada: <strong>{status.googleEmail}</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleInboundPull}
                disabled={isActionLoading}
                className="inline-flex items-center px-2.5 py-1 rounded-lg bg-white border border-sky-200 text-sky-700 font-semibold text-[11px] hover:bg-sky-50 transition-colors"
                title="Importar aulas criadas diretamente no Google Agenda com prefixo [EAVRA]"
              >
                <Download className={`w-3 h-3 mr-1 ${isActionLoading ? 'animate-spin' : ''}`} />
                Importar Aulas do Google
              </button>
              <button
                type="button"
                onClick={handleManualSyncFuture}
                disabled={isActionLoading}
                className="inline-flex items-center px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-700 font-semibold text-[11px] hover:bg-emerald-100/50 transition-colors"
                title="Reenviar aulas futuras para o Google Agenda"
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${isActionLoading ? 'animate-spin' : ''}`} />
                Sincronizar Aulas Futuras
              </button>
            </div>
          </div>
          <p className="text-[11px] text-emerald-700">
            Agenda principal (primary) autorizada. Toda nova aula, alteração ou cancelamento feito nesta plataforma será atualizado em tempo real na sua agenda.
          </p>
        </div>
      )}

      {/* Aviso de Configuração do Google Cloud caso não esteja configurado */}
      {isConfigured === false && !status.connected && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
          <div>
            <span className="font-semibold">Configuração necessária no Google Cloud Console:</span>
            <p className="mt-0.5 text-amber-700">
              Para habilitar a conexão com o Google Agenda, defina as variáveis <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code> no painel de configurações da aplicação.
            </p>
          </div>
        </div>
      )}

      {/* Fallback de Popup Bloqueado (Modo Card Completo) */}
      {fallbackAuthUrl && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150">
          <div className="flex items-start space-x-2.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900">
                O navegador bloqueou a janela do Google.
              </p>
              <p className="mt-0.5 text-amber-700">
                Clique no botão ao lado para autorizar o acesso à sua agenda em uma nova aba com segurança.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <a
              href={fallbackAuthUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-2xs"
            >
              Abrir Google Agenda
            </a>
            <button
              type="button"
              onClick={() => {
                setFallbackAuthUrl(null);
                setErrorMessage(null);
              }}
              className="p-1.5 text-amber-500 hover:text-amber-800 rounded-lg transition-colors"
              title="Fechar aviso"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Mensagens de feedback e erro amigáveis */}
      {errorMessage && !fallbackAuthUrl && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-800 flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {syncFeedback && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-xs text-zinc-700 flex items-start space-x-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600 mt-0.5" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {/* Modal de Confirmação de Desconexão (Substitui window.confirm para funcionar em iframe) */}
      {showDisconnectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-zinc-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-rose-50 text-rose-600 rounded-xl">
                  <Unlink className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-zinc-900 text-base">
                    Desconectar Google Agenda
                  </h3>
                  <p className="text-xs text-zinc-500">
                    {teacherName ? `Professor: ${teacherName}` : 'Conta Google'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setShowDisconnectModal(false)}
                className="p-1 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-sm text-zinc-600">
              <p>
                Tem certeza que deseja desconectar o Google Agenda?
              </p>
              <div className="p-3 bg-zinc-50 border border-zinc-200/80 rounded-xl text-xs space-y-1 text-zinc-700">
                <p className="font-medium text-zinc-800">• Novas aulas ou alterações feitas na plataforma não serão mais enviadas para sua conta Google.</p>
                <p>• Os eventos que já foram sincronizados anteriormente permanecerão na sua agenda Google (não são apagados).</p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => setShowDisconnectModal(false)}
                className="px-4 py-2 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={handleConfirmDisconnect}
                className="inline-flex items-center px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                {isActionLoading && <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                {isActionLoading ? "Desconectando..." : "Sim, desconectar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
