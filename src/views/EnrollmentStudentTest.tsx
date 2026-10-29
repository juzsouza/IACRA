import React, { useState } from 'react';
import { TERM_MODELS } from '../utils/enrollmentTermsDemo';

export function EnrollmentStudentTest(): React.ReactElement {
  const [nome, setNome] = useState('Aluno Exemplo');
  const [responsavel, setResponsavel] = useState('Responsável Exemplo');
  const [menor, setMenor] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [enviado, setEnviado] = useState(false);

  return <main className="max-w-2xl mx-auto p-6 space-y-5">
    <h1 className="text-2xl font-bold">Matrícula — simulação DEV</h1>
    <p className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm">Use somente informações inventadas. Nada será transmitido, salvo ou assinado.</p>
    {enviado ? <div role="status" className="p-4 rounded-lg bg-green-50">Teste concluído. Nenhuma matrícula foi criada.</div> :
      <form onSubmit={e => { e.preventDefault(); if (aceite) setEnviado(true); }} className="space-y-4">
        <label className="block">Modelo de termo
          <select className="block w-full p-3 border rounded-lg">{TERM_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        </label>
        <label className="block">Nome fictício do aluno
          <input className="block w-full p-3 border rounded-lg" value={nome} onChange={e => setNome(e.target.value)} required />
        </label>
        <label className="block"><input type="checkbox" checked={menor} onChange={e => setMenor(e.target.checked)} /> Simular aluno menor de idade</label>
        {menor && <label className="block">Responsável fictício
          <input className="block w-full p-3 border rounded-lg" value={responsavel} onChange={e => setResponsavel(e.target.value)} required />
        </label>}
        <p className="p-4 border rounded-lg">Termo de teste — sem valor contratual. Este é apenas um teste de leitura.</p>
        <label className="block"><input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} /> Simular aceite do termo fictício</label>
        <button disabled={!aceite} className="bg-indigo-700 text-white px-4 py-2 rounded-lg disabled:opacity-50">Simular envio</button>
      </form>}
  </main>;
}
