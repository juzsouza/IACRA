import React,{useEffect,useState} from 'react';
import {readRealDevOffer,submitRealDevOffer,type RealDevOffer} from '../services/enrollmentDevReal';
import {splitBoldSegments} from '../utils/termBoldMarkup';
export function PublicEnrollmentDev():React.ReactElement{
 const [token]=useState(()=>new URLSearchParams(window.location.search).get('convite')||'');
 const [offer,setOffer]=useState<RealDevOffer|null>(null);
 const [notice,setNotice]=useState('');
 const [sent,setSent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [student,setStudent]=useState({name:'Aluno Teste',email:'aluno@example.com',phone:'11999999999',cpf:'00000000000',birth_date:'2000-01-01',instrument:'Canto',guardian_name:'',guardian_email:''});
 const [accepted,setAccepted]=useState(false);
 const set=(field:keyof typeof student,value:string)=>setStudent(prev=>({...prev,[field]:value}));
 useEffect(()=>{if(!/^[0-9a-f]{64}$/.test(token)){setNotice('Link inválido.');return;}
   let active=true;
   void readRealDevOffer(token).then(x=>{if(active)setOffer(x)}).catch(()=>{if(active)setNotice('Convite inválido, expirado ou já utilizado.');});
   return()=>{active=false};
 },[token]);
 const submit=async(event:React.FormEvent)=>{
   event.preventDefault();
   if(!accepted||busy)return;
   setBusy(true);setNotice('');
   try{await submitRealDevOffer(token,student);setSent(true);setStudent({name:'',email:'',phone:'',cpf:'',birth_date:'',instrument:'',guardian_name:'',guardian_email:''});}
   catch(e){setNotice(e instanceof Error?e.message:'Não foi possível enviar');}finally{setBusy(false)}
 };
 return <main className="max-w-2xl mx-auto p-6 space-y-5">
   <h1 className="text-2xl font-bold">Matrícula digital — IACRA-DEV</h1>
   <p className="p-4 border border-amber-300 bg-amber-50 rounded-lg">Ambiente de homologação. Este formulário grava dados no banco IACRA-DEV. Utilize somente informações fictícias; nunca envie a alunos reais.</p>
   {notice&&<p role="alert">{notice}</p>}
   {sent?<div role="status" className="p-4 border rounded-lg">Solicitação recebida no IACRA-DEV e aguardando aprovação da secretaria. Aluno e matrícula ainda não foram criados.</div>:
   offer&&<form onSubmit={submit} autoComplete="off" className="space-y-4">
     <section className="border rounded-lg p-4 bg-zinc-50 space-y-2">
       <h2 className="font-semibold">Informações definidas pela secretaria (não editáveis)</h2>
       <p>Professor: {offer.teacher_name}</p><p>Plano: {offer.plan_name}</p>
       {offer.group_name&&<p>Grupo: {offer.group_name}</p>}
       <p>Início: {offer.start_date} · Matrícula: {offer.enrollment_date}</p>
       <p>Mensalidade: {Number(offer.monthly_amount).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · Vencimento dia {offer.due_day}</p>
     </section>
     <section className="border rounded-lg p-4 space-y-3">
       <h2 className="font-semibold">Dados do aluno (somente dados fictícios)</h2>
       <label className="block">Nome completo<input className="block border p-2 w-full rounded-lg" required value={student.name} onChange={e=>set('name',e.target.value)}/></label>
       <label className="block">E-mail<input type="email" className="block border p-2 w-full rounded-lg" required value={student.email} onChange={e=>set('email',e.target.value)}/></label>
       <label className="block">Telefone com DDD<input className="block border p-2 w-full rounded-lg" required value={student.phone} onChange={e=>set('phone',e.target.value)}/></label>
       <label className="block">CPF fictício<input className="block border p-2 w-full rounded-lg" required value={student.cpf} onChange={e=>set('cpf',e.target.value)}/></label>
       <label className="block">Data de nascimento<input type="date" className="block border p-2 w-full rounded-lg" required value={student.birth_date} onChange={e=>set('birth_date',e.target.value)}/></label>
       <label className="block">Instrumento<input className="block border p-2 w-full rounded-lg" required value={student.instrument} onChange={e=>set('instrument',e.target.value)}/></label>
       <p className="text-sm">Se o aluno for menor de idade, preencha também os dados do responsável:</p>
       <label className="block">Responsável legal<input className="block border p-2 w-full rounded-lg" value={student.guardian_name} onChange={e=>set('guardian_name',e.target.value)}/></label>
       <label className="block">E-mail do responsável<input type="email" className="block border p-2 w-full rounded-lg" value={student.guardian_email} onChange={e=>set('guardian_email',e.target.value)}/></label>
     </section>
     <section className="border rounded-lg p-4 space-y-3">
       <h2 className="font-semibold">{offer.term_title}</h2>
       <p className="text-sm text-amber-800">Termo em teste, sem validade contratual.</p>
       <div className="whitespace-pre-wrap break-words max-h-72 overflow-y-auto text-sm">{splitBoldSegments(offer.term_body).map((p,i)=>p.bold?<strong key={i}>{p.text}</strong>:<React.Fragment key={i}>{p.text}</React.Fragment>)}</div>
       <label className="flex gap-2"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> Confirmo o aceite fictício somente para teste no IACRA-DEV.</label>
       <button disabled={!accepted||busy} className="bg-indigo-700 text-white rounded-lg px-4 py-2 disabled:opacity-40">Enviar solicitação ao DEV</button>
     </section>
   </form>}
 </main>;
}
