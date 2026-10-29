import React, { useState } from 'react';
import { splitBoldSegments } from '../utils/termBoldMarkup';
import { getDemoOffer, saveDemoRequest } from '../utils/enrollmentDevInbox';

export function EnrollmentStudentTest(): React.ReactElement {
  const [offer] = useState(() => {
    try { return getDemoOffer(localStorage, new URLSearchParams(window.location.search).get('convite')); }
    catch { return null; }
  });
  const [name,setName] = useState('Aluno Exemplo');
  const [email,setEmail] = useState('aluno@example.com');
  const [phone,setPhone] = useState('11999999999');
  const [cpf,setCpf] = useState('00000000000');
  const [birth,setBirth] = useState('2000-01-01');
  const [instrument,setInstrument] = useState('Canto');
  const [minor,setMinor] = useState(false);
  const [guardian,setGuardian] = useState('Responsável Exemplo');
  const [accepted,setAccepted] = useState(false);
  const [sent,setSent] = useState(false);
  const [error,setError] = useState('');

  if (!offer) return <main className="max-w-2xl mx-auto p-6"><h1 className="text-xl font-bold">Convite DEV não encontrado</h1><p>Gere um convite fictício em Termos (DEV) no mesmo navegador. Nenhuma matrícula foi criada.</p></main>;
  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!accepted || name.trim().length < 3 || (minor && guardian.trim().length < 3) ||
      cpf.replace(/\D/g,'').length !== 11 || !birth || !instrument.trim() || !email.includes('@') ||
      phone.replace(/\D/g,'').length < 10) {
      setError('Revise os campos obrigatórios e confirme o aceite fictício.');
      return;
    }
    try { saveDemoRequest(localStorage,offer.id); setSent(true); }
    catch { setError('Não foi possível registrar o teste neste navegador.'); }
  };
  return <main className="max-w-2xl mx-auto p-6 space-y-5">
    <h1 className="text-2xl font-bold">Matrícula — simulação DEV</h1>
    <p className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-sm">Somente dados fictícios. Nome, CPF, e-mail e telefone não serão armazenados nem enviados ao banco. Apenas o convite e a situação são mantidos neste navegador.</p>
    {sent ? <div role="status" className="p-4 rounded-lg bg-green-50">Teste concluído. Solicitação fictícia enviada à caixa DEV; nenhuma matrícula real foi criada.</div> :
    <form onSubmit={onSubmit} className="space-y-5">
      <section className="border rounded-xl p-4 space-y-2 bg-zinc-50">
        <h2 className="font-bold text-lg">Informações definidas pela secretaria</h2>
        <p>Professor: <strong>{offer.teacherName}</strong></p>
        <p>Plano: <strong>{offer.planName}</strong></p>
        {offer.groupName && <p>Grupo/Turma: <strong>{offer.groupName}</strong></p>}
        <p>Início das aulas: <strong>{offer.startDate}</strong></p>
        <p>Data de matrícula: <strong>{offer.enrollmentDate}</strong></p>
        <p>Mensalidade: <strong>{offer.monthlyAmount.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></p>
        <p>Vencimento: <strong>dia {offer.dueDay}</strong></p>
        <p className="text-xs text-zinc-500">Essas condições são somente leitura.</p>
      </section>
      <section className="border rounded-xl p-4 space-y-3">
        <h2 className="font-bold">Dados obrigatórios do aluno — fictícios</h2>
        <label className="block">Nome completo<input required className="block w-full border p-2 rounded-lg" value={name} onChange={e=>setName(e.target.value)}/></label>
        <label className="block">E-mail<input required type="email" className="block w-full border p-2 rounded-lg" value={email} onChange={e=>setEmail(e.target.value)}/></label>
        <label className="block">Telefone (E.164 no cadastro definitivo)<input required className="block w-full border p-2 rounded-lg" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
        <label className="block">Instrumento principal<input required className="block w-full border p-2 rounded-lg" value={instrument} onChange={e=>setInstrument(e.target.value)}/></label>
        <label className="block">CPF fictício<input required inputMode="numeric" className="block w-full border p-2 rounded-lg" value={cpf} onChange={e=>setCpf(e.target.value)}/></label>
        <label className="block">Data de nascimento<input required type="date" className="block w-full border p-2 rounded-lg" value={birth} onChange={e=>setBirth(e.target.value)}/></label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={minor} onChange={e=>setMinor(e.target.checked)}/> Aluno menor de idade</label>
        {minor && <label className="block">Nome fictício do responsável<input required className="block w-full border p-2 rounded-lg" value={guardian} onChange={e=>setGuardian(e.target.value)}/></label>}
      </section>
      <section className="border rounded-xl p-4 space-y-3">
        <h2 className="font-semibold">{offer.term.title}</h2>
        <p className="text-xs text-amber-900">DOCUMENTO FICTÍCIO — SEM VALIDADE CONTRATUAL</p>
        <div className="whitespace-pre-wrap break-words max-h-64 overflow-auto text-sm">{splitBoldSegments(offer.term.body).map((segment,i)=>segment.bold?<strong key={i}>{segment.text}</strong>:<React.Fragment key={i}>{segment.text}</React.Fragment>)}</div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> Simular aceite do termo</label>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <button type="submit" disabled={!accepted} className="px-4 py-2 rounded-lg bg-indigo-700 text-white disabled:opacity-50">Simular envio</button>
      </section>
    </form>}
  </main>;
}
