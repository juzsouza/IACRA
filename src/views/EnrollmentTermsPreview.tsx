import React, { useState } from 'react';
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
        <strong>Simulação sem validade contratual.</strong> Não gera link público, assinatura, termo jurídico, aceite real, matrícula ou cobrança. Nada é salvo no Supabase ou no navegador; ao atualizar a página, a simulação é reiniciada.
      </div>
      <section className="bg-white border rounded-xl p-5 space-y-3">
        <label className="block text-sm font-semibold" htmlFor="dev-term-model">Modelo do termo</label>
        <select id="dev-term-model" className="w-full border rounded-lg p-3 bg-white" value={modelId} onChange={e => { setModelId(e.target.value as TermModelId); reset(); }}>
          {TERM_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <p className="text-sm text-zinc-600">{TERM_MODELS.find(m => m.id === modelId)?.description}</p>
        <p className="text-xs text-indigo-800 font-semibold">Estado: {steps[stage]}</p>
      </section>
      <section className="bg-white border rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Visualização do termo fictício</h2>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-7 border rounded-lg p-4 bg-zinc-50 text-zinc-800">{demoTermBody(modelId)}</pre>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => move('issue')} disabled={stage !== 'draft'} className="bg-indigo-700 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-40">Simular emissão</button>
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
