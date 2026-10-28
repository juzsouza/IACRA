/** Etapa 10 — Tela de permissões conectada às RPCs do PostgreSQL, DESLIGADA POR PADRÃO.
 * O cliente nunca faz escrita direta nas tabelas privadas.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAppStore } from '../store';
import {
  loadAdminPermissions, saveAdminPermission,
  type PermissionCatalogItem, type PermissionSnapshot,
  type PermissionSubject, type RoleTarget,
} from '../services/permissionsAdmin';
import { checkPermissionDevEnvironment, getPermissionDevEnvironment } from '../utils/permissionAdminConfig';

type Choice = 'inherit' | 'deny' | 'allow_own' | 'allow_all';
const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Painel', coral: 'Coral', agenda: 'Agenda', classes: 'Aulas',
  students: 'Alunos', enrollments: 'Matrículas', teachers: 'Professores',
  finance: 'Financeiro', payments: 'Pagamentos', google_calendar: 'Google Calendar',
  settings: 'Configurações', permissions: 'Gerenciamento de Permissões',
};
const ACTION_LABELS: Record<string, string> = {
  view: 'Visualizar', create: 'Criar', edit: 'Editar', delete: 'Excluir',
  manage: 'Administrar', manage_collaborators: 'Administrar colaboradores',
  view_individual_values: 'Consultar valores individuais', view_closings: 'Ver fechamentos',
  close_period: 'Fechar período', reopen_period: 'Reabrir período',
  view_reports: 'Relatórios', approve: 'Aprovar',
  view_consolidated: 'Ver consolidado', connect_own_account: 'Conectar minha conta Google',
  sync_own_events: 'Sincronizar meus eventos', disconnect_own_account: 'Desconectar minha conta',
};

function existingChoice(snapshot: PermissionSnapshot, item: PermissionCatalogItem,
  subject: PermissionSubject, target: string): Choice {
  const record = subject === 'role'
    ? snapshot.role_rules.find(r => r.role === target && r.key === item.key)
    : snapshot.user_rules.find(r => r.profile_id === target && r.key === item.key);
  if (!record) return 'inherit';
  if (record.decision === 'deny') return 'deny';
  return record.scope === 'own' ? 'allow_own' : 'allow_all';
}

export function PermissionsManager(): React.ReactElement {
  const { state, currentUserProfile } = useAppStore();
  const gate = checkPermissionDevEnvironment(getPermissionDevEnvironment());
  const [snapshot, setSnapshot] = useState<PermissionSnapshot | null>(null);
  const [subject, setSubject] = useState<PermissionSubject>('role');
  const [role, setRole] = useState<RoleTarget>('admin');
  const [targetId, setTargetId] = useState('');
  const [moduleName, setModuleName] = useState('coral');
  const [edits, setEdits] = useState<Record<string, Choice>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const eligibleProfiles = useMemo(() => (state.profiles || []).filter(
    p => (p.role === 'admin' || p.role === 'teacher') && p.access_status === 'active',
  ), [state.profiles]);
  const selectedProfile = eligibleProfiles.find(p => p.id === targetId);
  const selectedRole: RoleTarget = subject === 'role' ? role : (selectedProfile?.role as RoleTarget) || 'admin';
  const target = subject === 'role' ? role : targetId;
  const modules = useMemo(() => [...new Set(snapshot?.catalog.map(c => c.module) || [])].sort(), [snapshot]);
  const actions = snapshot?.catalog.filter(c => c.module === moduleName) || [];

  const refresh = async () => {
    if (!gate.ok) return;
    setLoading(true); setError(null); setNotice(null);
    try {
      const data = await loadAdminPermissions();
      setSnapshot(data); setEdits({});
      if (!data.catalog.some(c => c.module === moduleName) && data.catalog[0]) {
        setModuleName(data.catalog[0].module);
      }
    } catch (cause) {
      setSnapshot(null);
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar permissões.');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (gate.ok && currentUserProfile?.role === 'super_admin' &&
    currentUserProfile.access_status === 'active') void refresh();
    // Apenas na abertura; atualizações são explícitas para não sobrescrever escolhas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.ok, currentUserProfile?.id, currentUserProfile?.role, currentUserProfile?.access_status]);

  const save = async (item: PermissionCatalogItem) => {
    if (!snapshot || !gate.ok || busyKey || !target) return;
    if (subject === 'user' && !selectedProfile) { setError('Selecione um usuário ativo.'); return; }
    const editId = `${subject}:${target}:${item.key}`;
    const choice = edits[editId] ?? existingChoice(snapshot, item, subject, target);
    setBusyKey(editId); setError(null); setNotice(null);
    try {
      const result = await saveAdminPermission({
        subjectType: subject, target, permissionKey: item.key,
        decision: choice === 'inherit' ? 'inherit' : choice === 'deny' ? 'deny' : 'allow',
        scope: choice === 'allow_own' ? 'own' : choice === 'allow_all' ? 'all' : 'none',
      }, snapshot, selectedRole);
      // Update screen from authoritative database, not an optimistic local change.
      const latest = await loadAdminPermissions();
      setSnapshot(latest);
      setEdits(previous => { const next = { ...previous }; delete next[editId]; return next; });
      setNotice(result.changed ? 'Permissão registrada e auditada no DEV.' : 'A regra já estava configurada; nada mudou.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar regra.');
    } finally { setBusyKey(null); }
  };

  if (!currentUserProfile || currentUserProfile.role !== 'super_admin' || currentUserProfile.access_status !== 'active') {
    return <div className="p-8 text-rose-700" role="alert">Acesso restrito ao Super Admin ativo.</div>;
  }

  return <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="flex items-center gap-2 text-indigo-700 font-semibold text-sm"><ShieldCheck className="w-5 h-5"/> Área exclusiva do Super Admin</p>
        <h1 className="text-2xl font-bold mt-1">Gerenciamento de Permissões</h1>
        <p className="text-sm text-zinc-600">Permissões por perfil e exceções individuais. Toda gravação exige validação no banco.</p>
      </div>
      <button type="button" onClick={() => void refresh()} disabled={!gate.ok || loading || busyKey !== null}
        className="flex gap-2 items-center border rounded-lg px-4 py-2 bg-white text-sm disabled:opacity-50">
        <RefreshCw className="w-4 h-4"/> Atualizar
      </button>
    </div>
    {!gate.ok && <div role="status" className="flex gap-2 rounded-xl p-4 border border-amber-200 bg-amber-50 text-amber-950 text-sm">
      <AlertTriangle className="w-5 h-5 shrink-0"/><div><strong>Salvamento desativado nesta instalação.</strong><p>{gate.reason}</p><p>Não foi feito nenhum acesso ao banco de produção.</p></div>
    </div>}
    {error && <div role="alert" className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">{error}</div>}
    {notice && <div role="status" className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex gap-2"><CheckCircle2 className="w-4 h-4"/>{notice}</div>}
    {gate.ok && loading && <div role="status" className="p-4 text-zinc-600">Verificando permissões no banco DEV...</div>}
    {snapshot && <>
      <section className="bg-white border rounded-xl p-4 grid sm:grid-cols-3 gap-4">
        <label className="text-sm font-medium">Tipo de regra
          <select className="mt-1 block w-full border rounded-lg p-2" value={subject} onChange={e => {setSubject(e.target.value as PermissionSubject);setEdits({});}}>
            <option value="role">Padrão do perfil</option><option value="user">Exceção individual</option>
          </select>
        </label>
        {subject === 'role' ? <label className="text-sm font-medium">Perfil
          <select className="mt-1 block w-full border rounded-lg p-2" value={role} onChange={e => {setRole(e.target.value as RoleTarget);setEdits({});}}>
            <option value="admin">Admin</option><option value="teacher">Professor</option>
          </select>
        </label> : <label className="text-sm font-medium">Usuário ativo
          <select className="mt-1 block w-full border rounded-lg p-2" value={targetId} onChange={e => {setTargetId(e.target.value);setEdits({});}}>
            <option value="">Selecionar usuário</option>
            {eligibleProfiles.map(p => <option key={p.id} value={p.id}>{p.email} ({p.role})</option>)}
          </select>
        </label>}
        <label className="text-sm font-medium">Módulo
          <select className="mt-1 block w-full border rounded-lg p-2" value={moduleName} onChange={e=>setModuleName(e.target.value)}>
            {modules.map(m => <option key={m} value={m}>{MODULE_LABELS[m] || m}</option>)}
          </select>
        </label>
      </section>
      <section className="bg-white border rounded-xl divide-y overflow-hidden">
        <div className="p-4 bg-zinc-50"><h2 className="font-semibold">{MODULE_LABELS[moduleName] || moduleName}</h2>
          <p className="text-xs text-zinc-600">A autorização de uma ação não substitui a RLS de cada tabela nem permite acesso a dados de terceiros.</p>
        </div>
        {actions.map(item => {
          const editId = `${subject}:${target}:${item.key}`;
          const choice = edits[editId] ?? existingChoice(snapshot, item, subject, target);
          const locked = item.reserved || !target || (selectedRole === 'teacher' && item.admin_only);
          return <div key={item.key} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1"><div className="text-sm font-medium">{ACTION_LABELS[item.action] || item.action}</div>
              <p className="text-xs text-zinc-500">{locked && item.reserved ? 'Exclusivo do Super Admin' : item.admin_only ? 'Operação administrativa' : 'Permissão por ação'} · {item.key}</p>
            </div>
            <label className="text-xs">Regra
              <select aria-label={`Regra para ${item.key}`} className="mt-1 block border rounded-lg p-2 text-sm" value={choice}
                disabled={locked || busyKey !== null} onChange={e=>setEdits(old=>({...old,[editId]:e.target.value as Choice}))}>
                <option value="inherit">{subject === 'user' ? 'Herdar perfil' : 'Sem regra'}</option>
                <option value="deny">Negar</option>
                {!item.admin_only || selectedRole !== 'teacher' ? <option value="allow_own">Permitir · próprios dados</option> : null}
                {selectedRole !== 'teacher' && <option value="allow_all">Permitir · geral</option>}
              </select>
            </label>
            <button type="button" onClick={() => void save(item)} disabled={locked || !gate.ok || busyKey !== null}
              className="border border-indigo-700 bg-indigo-700 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              {busyKey === editId ? 'Salvando...' : 'Salvar regra'}
            </button>
          </div>;
        })}
      </section>
      <p className="text-xs text-zinc-600">O banco DEV deve conter as RPCs da Etapa 09 antes de ativar esta tela. Não use o Supabase IACRA original.</p>
    </>}
  </div>;
}
