import React,{useEffect,useState} from 'react';
import {readRealDevOffer,submitRealDevOffer,type RealDevOffer} from '../services/enrollmentDevReal';
import {splitBoldSegments} from '../utils/termBoldMarkup';
export function PublicEnrollmentDev():React.ReactElement{
 const [token]=useState(()=>new URLSearchParams(window.location.search).get('convite')||'');
 const [offer,setOffer]=useState<RealDevOffer|null>(null);
 const [notice,setNotice]=useState('');
 const [sent,setSent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [student,setStudent]=useState({name:'',email:'',phone:'',cpf:'',birth_date:'',instrument:'',guardian_name:'',guardian_email:'',guardian_phone:'',guardian_relationship:'',guardian_cpf:''});
 const [accepted,setAccepted]=useState(false);
 const isMinor=Boolean(student.birth_date)&&(()=>{
   const birth=new Date(student.birth_date+'T12:00:00Z');
   if(Number.isNaN(birth.getTime()))return false;
   const today=new Date();
   const br=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(today);
   const [y,m,d]=br.split('-').map(Number);
   const age=y-birth.getUTCFullYear()-((m<birth.getUTCMonth()+1||(m===birth.getUTCMonth()+1&&d<birth.getUTCDate()))?1:0);
   return age<18;
 })();
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
   try{await submitRealDevOffer(token,student);setSent(true);setStudent({name:'',email:'',phone:'',cpf:'',birth_date:'',instrument:'',guardian_name:'',guardian_email:'',guardian_phone:'',guardian_relationship:'',guardian_cpf:''});}
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
       <p className="font-semibold text-amber-800">Prazo para preenchimento e aceite: {new Date(offer.expires_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})} (Brasília)</p>
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
       {isMinor&&<div className="border border-amber-200 rounded-lg p-3 space-y-3 bg-amber-50">
         <h3 className="font-semibold">Dados do responsável legal (obrigatórios para menores de 18 anos)</h3>
         <label className="block">Nome completo do responsável<input className="block border p-2 w-full rounded-lg" required value={student.guardian_name} onChange={e=>set('guardian_name',e.target.value)}/></label>
         <label className="block">Parentesco ou vínculo legal<input className="block border p-2 w-full rounded-lg" required value={student.guardian_relationship} onChange={e=>set('guardian_relationship',e.target.value)}/></label>
         <label className="block">E-mail do responsável<input type="email" className="block border p-2 w-full rounded-lg" required value={student.guardian_email} onChange={e=>set('guardian_email',e.target.value)}/></label>
         <label className="block">Telefone do responsável<input type="tel" className="block border p-2 w-full rounded-lg" required value={student.guardian_phone} onChange={e=>set('guardian_phone',e.target.value)}/></label>
         <label className="block">CPF do responsável (opcional no DEV)<input className="block border p-2 w-full rounded-lg" inputMode="numeric" value={student.guardian_cpf} onChange={e=>set('guardian_cpf',e.target.value)}/></label>
       </div>}
       <p className="text-sm text-zinc-600">Se o aluno já estiver cadastrado, o termo e o aceite serão recebidos normalmente. A secretaria conferirá o cadastro antes de aprovar, sem alterar seus dados automaticamente.</p>
     </section>
     <section className="border rounded-lg p-4 space-y-3">
       <h2 className="font-semibold">{offer.term_title}</h2>
       <p className="text-sm text-amber-800">Termo em teste, sem validade contratual.</p>
       <div className="whitespace-pre-wrap break-words max-h-72 overflow-y-auto text-sm">{splitBoldSegments(offer.term_body).map((p,i)=>p.bold?<strong key={i}>{p.text}</strong>:<React.Fragment key={i}>{p.text}</React.Fragment>)}</div>
       <label className="flex gap-2"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> {isMinor?'Como responsável legal informado, confirmo o aceite fictício do termo para teste no IACRA-DEV.':'Confirmo o aceite fictício somente para teste no IACRA-DEV.'}</label>
       <button disabled={!accepted||busy} className="bg-indigo-700 text-white rounded-lg px-4 py-2 disabled:opacity-40">Enviar solicitação ao DEV</button>
     </section>
   </form>}
 </main>;
}
