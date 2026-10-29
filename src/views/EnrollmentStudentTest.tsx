import React, { useState } from 'react';
import { TERM_MODELS, type TermModelId } from '../utils/enrollmentTermsDemo';
import { splitBoldSegments } from '../utils/termBoldMarkup';
import { readSavedTermDraft, originalTermDraft, termDraftStorageKey } from '../utils/enrollmentTermsDraft';
import { saveDemoRequest, isValidModel } from '../utils/enrollmentDevInbox';

export function EnrollmentStudentTest(): React.ReactElement {
  const [nome, setNome] = useState('Aluno Exemplo');
  const [responsavel, setResponsavel] = useState('Responsável Exemplo');
  const [menor, setMenor] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [modelo, setModelo] = useState<TermModelId>(() => {
    const param = new URLSearchParams(window.location.search).get('modelo');
    return isValidModel(param) ? param : TERM_MODELS[0].id;
  });
  const [erro, setErro] = useState('');
  const saved = (() => {
    try { return readSavedTermDraft(localStorage.getItem(termDraftStorageKey(modelo))); }
    catch { return null; }
  })();
  const termo = saved ?? originalTermDraft(modelo);

  return <main className="max-w-2xl mx-auto p-6 space-y-5">
    <h1 className="text-2xl font-bold">Matrícula — simulação DEV</h1>
    <p className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm">Use somente informações inventadas. Somente dados fictícios. Apenas o modelo e a situação da solicitação são salvos neste navegador; nomes não são guardados. Nada é enviado ao banco ou assinado.</p>
    {enviado ? <div role="status" className="p-4 rounded-lg bg-green-50">Teste concluído. Solicitação fictícia enviada à caixa DEV deste navegador; nenhuma matrícula real foi criada.</div> :
      <form onSubmit={e => {
        e.preventDefault();
        if (!aceite || nome.trim().length < 3 || (menor && responsavel.trim().length < 3)) return;
        try { saveDemoRequest(localStorage, modelo); setEnviado(true); setErro(''); }
        catch { setErro('Não foi possível guardar a solicitação fictícia neste navegador.'); }
      }} className="space-y-4">
        <label className="block">Modelo de termo
          <select value={modelo} onChange={e => {setModelo(e.target.value as TermModelId);setAceite(false);}} className="block w-full p-3 border rounded-lg">{TERM_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        </label>
        <label className="block">Nome fictício do aluno
          <input className="block w-full p-3 border rounded-lg" value={nome} onChange={e => setNome(e.target.value)} required />
        </label>
        <label className="block"><input type="checkbox" checked={menor} onChange={e => setMenor(e.target.checked)} /> Simular aluno menor de idade</label>
        {menor && <label className="block">Responsável fictício
          <input className="block w-full p-3 border rounded-lg" value={responsavel} onChange={e => setResponsavel(e.target.value)} required />
        </label>}
        <div className="p-4 border rounded-lg space-y-3">
          <p className="font-bold text-amber-800">DOCUMENTO FICTÍCIO — SEM VALIDADE CONTRATUAL</p>
          <p className="font-semibold">{termo.title}</p>
          <div className="whitespace-pre-wrap break-words text-sm max-h-64 overflow-y-auto">
            {splitBoldSegments(termo.body).map((item,index) => item.bold ? <strong key={index}>{item.text}</strong> : <React.Fragment key={index}>{item.text}</React.Fragment>)}
          </div>
        </div>
        {erro && <p role="alert" className="text-red-700">{erro}</p>}
        <label className="block"><input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} /> Simular aceite do termo fictício</label>
        <button disabled={!aceite} className="bg-indigo-700 text-white px-4 py-2 rounded-lg disabled:opacity-50">Simular envio</button>
      </form>}
  </main>;
}
