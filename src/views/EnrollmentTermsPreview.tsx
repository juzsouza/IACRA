import React, { useEffect, useRef, useState } from 'react';
import { changeDemoRequestStatus, demoLink, DEV_INBOX_KEY, readDemoRequests, type DemoRequest } from '../utils/enrollmentDevInbox';
import { splitBoldSegments, toggleBoldSelection } from '../utils/termBoldMarkup';
import { originalTermDraft, readSavedTermDraft, termDraftStorageKey, validateTermDraft, TERM_TITLE_MAX_LENGTH, TERM_BODY_MAX_LENGTH, type TermDraft } from '../utils/enrollmentTermsDraft';
import { FileText, ShieldCheck, RotateCcw, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../store';
import { getPermissionDevEnvironment, checkPermissionDevEnvironment } from '../utils/permissionAdminConfig';
import { TERM_MODELS, demoTermBody, nextDemoStage, type TermModelId, type DemoStage, type DemoAction } from '../utils/enrollmentTermsDemo';

const steps: Record<DemoStage, string> = {
  draft: '1. Modelo selecionado',
  issued: '2. Solicitação fictícia emitida',
  accepted: '3. Aceite fictício registrado apenas nesta tela',
  reviewed: '4. Aprovação fictícia concluída',
};

export function EnrollmentTermsPreview(): React.ReactElement {
  const { currentUserProfile } = useAppStore();
  const gate = checkPermissionDevEnvironment(getPermissionDevEnvironment());
  const [modelId, setModelId] = useState<TermModelId>(TERM_MODELS[0].id);
  const [stage, setStage] = useState<DemoStage>('draft');
  const [agreed, setAgreed] = useState(false);
  const [drafts, setDrafts] = useState<Partial<Record<TermModelId, TermDraft>>>({});
  const [feedback, setFeedback] = useState('');
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [linkCopied, setLinkCopied] = useState('');
  const refreshRequests = () => {
    try { setRequests(readDemoRequests(localStorage.getItem(DEV_INBOX_KEY))); }
    catch { setRequests([]); }
  };
  useEffect(() => {
    refreshRequests();
    const onStorage = (event: StorageEvent) => { if (event.key === DEV_INBOX_KEY) refreshRequests(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const updateRequest = (id: string, status: 'approved' | 'changes_requested') => {
    try { setRequests(changeDemoRequestStatus(localStorage,id,status)); }
    catch { setFeedback('Não foi possível alterar a solicitação fictícia.'); }
  };
  const getLink = () => demoLink(window.location.origin, modelId);
  const termEditorRef = useRef<HTMLTextAreaElement>(null);
  const draft = drafts[modelId] ?? originalTermDraft(modelId);
  const updateDraft = (changes: Partial<TermDraft>) => {
    setDrafts(prev => ({ ...prev, [modelId]: { ...(prev[modelId] ?? originalTermDraft(modelId)), ...changes } }));
    setFeedback('Alterações ainda não salvas.');
    setStage('draft');
    setAgreed(false);
  };
  const formatBold = () => {
    const editor = termEditorRef.current;
    if (!editor || stage !== 'draft') return;
    const formatted = toggleBoldSelection(draft.body, editor.selectionStart, editor.selectionEnd);
    updateDraft({ body: formatted.text });
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(formatted.start, formatted.end);
    });
  };
  const saveDraft = () => {
    if (!validateTermDraft(draft)) { setFeedback('Informe um título e conteúdo válidos antes de salvar.'); return; }
    try {
      localStorage.setItem(termDraftStorageKey(modelId), JSON.stringify(draft));
      setFeedback('Rascunho salvo somente neste navegador, sem envio ao banco.');
    } catch { setFeedback('Não foi possível salvar no navegador. Copie seu texto antes de sair.'); }
  };
  const loadDraft = () => {
    try {
      const stored = readSavedTermDraft(localStorage.getItem(termDraftStorageKey(modelId)));
      if (!stored) { setFeedback('Nenhum rascunho local válido encontrado para este modelo.'); return; }
      setDrafts(prev => ({ ...prev, [modelId]: stored }));
      setFeedback('Rascunho carregado deste navegador.');
      setStage('draft'); setAgreed(false);
    } catch { setFeedback('Não foi possível acessar o armazenamento local.'); }
  };
  const restoreDraft = () => {
    setDrafts(prev => ({ ...prev, [modelId]: originalTermDraft(modelId) }));
    setFeedback('Texto original restaurado na tela. Clique em Salvar rascunho para substituir a cópia local.');
    setStage('draft'); setAgreed(false);
  };

  if (!gate.ok || currentUserProfile?.role !== 'super_admin' || currentUserProfile.access_status !== 'active') {
    return <div className="p-8 text-rose-700" role="alert">Prévia indisponível: somente Super Admin ativo no ambiente IACRA-DEV autorizado.</div>;
  }

  const move = (action: DemoAction) => {
    try {
      setStage(previous => nextDemoStage(previous, action));
    } catch {
      // Proteção extra: não altera o estado quando a transição não é válida.
    }
  };
  const reset = () => { setStage('draft'); setAgreed(false); };
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-6">
      <div className="space-y-2">
        <p className="text-indigo-700 text-sm font-semibold flex items-center gap-2"><ShieldCheck size={18}/> Apenas Super Admin · IACRA-DEV</p>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileText size={25}/> Termos de Matrícula — Simulação DEV</h1>
        <p className="text-zinc-600 text-sm">Prévia do fluxo de matrícula digital com os quatro modelos previstos. Todos os dados são fictícios.</p>
      </div>
      <div className="border border-amber-300 rounded-xl bg-amber-50 p-4 text-amber-950 text-sm" role="status">
        <strong>Simulação sem validade contratual.</strong> Não gera link público, assinatura, termo jurídico, aceite real, matrícula ou cobrança. Os rascunhos podem ser salvos apenas neste navegador; nada é enviado ao Supabase. Ao atualizar a página, o fluxo de simulação é reiniciado.
      </div>
      <section className="bg-white border rounded-xl p-5 space-y-3">
        <label className="block text-sm font-semibold" htmlFor="dev-term-model">Modelo do termo</label>
        <select id="dev-term-model" className="w-full border rounded-lg p-3 bg-white" value={modelId} onChange={e => { setModelId(e.target.value as TermModelId); reset(); setFeedback(''); }}>
          {TERM_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <p className="text-sm text-zinc-600">{TERM_MODELS.find(m => m.id === modelId)?.description}</p>
        <p className="text-xs text-indigo-800 font-semibold">Estado: {steps[stage]}</p>
      </section>
      <section className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Link da matrícula de teste</h2>
        <p className="text-sm">Abra no mesmo navegador e origem, em outra aba. Não compartilhe com alunos reais. A caixa DEV só registra modelo e situação fictícia, nunca nomes ou contatos.</p>
        <div className="flex flex-wrap gap-2">
          <a href={getLink()} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-lg bg-indigo-700 text-white">Abrir formulário fictício</a>
          <button type="button" className="px-4 py-2 border rounded-lg" onClick={() => {
            void navigator.clipboard.writeText(getLink()).then(() => setLinkCopied('Link copiado.')).catch(() => setLinkCopied('Copie o endereço da aba aberta.'));
          }}>Copiar link DEV</button>
        </div>
        {linkCopied && <p className="text-sm" role="status">{linkCopied}</p>}
      </section>
      <section className="bg-white border rounded-xl p-5 space-y-4">
        <div className="flex justify-between items-center gap-2">
          <h2 className="text-lg font-semibold">Solicitações fictícias da secretaria</h2>
          <button type="button" className="border rounded-lg px-3 py-2 text-sm" onClick={refreshRequests}>Atualizar lista</button>
        </div>
        <p className="text-sm text-zinc-600">Registros somente neste navegador. Aprovar aqui não gera aluno ou matrícula.</p>
        {requests.length === 0 ? <p className="text-sm">Nenhuma solicitação fictícia recebida neste navegador.</p> : requests.map(item =>
          <div key={item.id} className="border rounded-lg p-3 space-y-2">
            <p className="font-medium">{TERM_MODELS.find(model => model.id === item.modelId)?.label}</p>
            <p className="text-xs text-zinc-500">Código: {item.id.slice(0,8)} · Situação: {item.status === 'pending' ? 'Pendente' : item.status === 'approved' ? 'Aprovado (simulação)' : 'Correção solicitada (simulação)'}</p>
            {item.status === 'pending' && <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => updateRequest(item.id,'approved')} className="bg-indigo-700 text-white rounded-lg px-3 py-2 text-sm">Simular aprovação</button>
              <button type="button" onClick={() => updateRequest(item.id,'changes_requested')} className="border rounded-lg px-3 py-2 text-sm">Simular pedido de correção</button>
            </div>}
          </div>
        )}
      </section>
      <section className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Editar termo fictício</h2>
        <p className="text-sm text-zinc-600">Faça alterações no título e conteúdo do modelo selecionado. O texto será exibido na prévia logo abaixo.</p>
        <label htmlFor="dev-term-title" className="block text-sm font-medium">Título do termo</label>
        <input id="dev-term-title" className="w-full border rounded-lg p-3" maxLength={TERM_TITLE_MAX_LENGTH} value={draft.title} onChange={e => updateDraft({ title: e.target.value })} disabled={stage !== 'draft'} />
        <label htmlFor="dev-term-body" className="block text-sm font-medium">Conteúdo do termo</label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={formatBold} disabled={stage !== 'draft'} className="border rounded-lg px-4 py-2 font-bold disabled:opacity-40" aria-label="Aplicar negrito ao texto selecionado">B — Negrito</button>
          <span className="text-xs text-zinc-600">Selecione um trecho e clique em Negrito. Use novamente para desfazer.</span>
        </div>
        <textarea ref={termEditorRef} onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            formatBold();
          }
        }} id="dev-term-body" rows={12} maxLength={TERM_BODY_MAX_LENGTH} className="w-full border rounded-lg p-3 leading-6" value={draft.body} onChange={e => updateDraft({ body: e.target.value })} disabled={stage !== 'draft'} />
        <p className="text-xs text-zinc-500">{draft.body.length}/{TERM_BODY_MAX_LENGTH} caracteres. Não insira dados pessoais reais nesta simulação.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={saveDraft} disabled={stage !== 'draft' || !validateTermDraft(draft)} className="bg-indigo-700 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-40">Salvar rascunho no navegador</button>
          <button type="button" onClick={loadDraft} disabled={stage !== 'draft'} className="border rounded-lg px-4 py-2 text-sm disabled:opacity-40">Carregar rascunho</button>
          <button type="button" onClick={restoreDraft} disabled={stage !== 'draft'} className="border rounded-lg px-4 py-2 text-sm disabled:opacity-40">Restaurar texto original</button>
        </div>
        {feedback && <p role="status" className="text-sm text-indigo-800">{feedback}</p>}
      </section>
      <section className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Visualização do termo fictício</h2>
        <div className="whitespace-pre-wrap break-words font-sans text-sm leading-7 border rounded-lg p-4 bg-zinc-50 text-zinc-800">
          <strong>DOCUMENTO DE TESTE — SEM VALIDADE CONTRATUAL</strong>{'\n\n'}<strong>{draft.title}</strong>{'\n\n'}
          {splitBoldSegments(draft.body).map((segment, index) =>
            segment.bold ? <strong key={index}>{segment.text}</strong> : <React.Fragment key={index}>{segment.text}</React.Fragment>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => move('issue')} disabled={stage !== 'draft' || !validateTermDraft(draft)} className="bg-indigo-700 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-40">Simular emissão</button>
          <button type="button" onClick={reset} className="border rounded-lg px-4 py-2 text-sm flex items-center gap-2"><RotateCcw size={16}/> Reiniciar teste</button>
        </div>
      </section>
      {stage !== 'draft' && <section className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Simulação de aceite do responsável</h2>
        <p className="text-sm">Solicitação fictícia emitida. Nenhum link foi gerado ou enviado.</p>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={agreed} onChange={e => setAgreed(e.target.checked)} disabled={stage !== 'issued'}/>
          <span>Estou testando o fluxo visual de aceite de um documento fictício, sem assinatura válida.</span>
        </label>
        <button type="button" disabled={stage !== 'issued' || !agreed} onClick={() => move('accept')} className="bg-indigo-700 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-40">Simular aceite</button>
        {(stage === 'accepted' || stage === 'reviewed') && <p className="text-emerald-800 text-sm flex items-center gap-2"><CheckCircle2 size={17}/> Aceite fictício concluído somente nesta sessão.</p>}
      </section>}
      {(stage === 'accepted' || stage === 'reviewed') && <section className="bg-white border rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-semibold">Análise administrativa (simulação)</h2>
        <button type="button" disabled={stage !== 'accepted'} onClick={() => move('review')} className="bg-indigo-700 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-40">Simular aprovação</button>
        {stage === 'reviewed' && <p className="text-emerald-800 text-sm flex items-center gap-2"><CheckCircle2 size={17}/> Fluxo de demonstração concluído. Nenhuma matrícula foi ativada.</p>}
      </section>}
    </div>
  );
}
