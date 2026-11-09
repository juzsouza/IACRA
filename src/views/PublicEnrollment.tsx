import React,{useEffect,useRef,useState} from 'react';
import {validateEnrollmentStudent} from '../utils/enrollmentStudentValidation';
import {readDigitalOffer,submitDigitalOffer,type DigitalOffer} from '../services/digitalEnrollment';
import {splitBoldSegments} from '../utils/termBoldMarkup';
export function PublicEnrollment():React.ReactElement{
 const formRef=useRef<HTMLFormElement|null>(null);
 const [token]=useState(()=>new URLSearchParams(window.location.search).get('convite')||'');
 const [offer,setOffer]=useState<DigitalOffer|null>(null);
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
   void readDigitalOffer(token).then(x=>{if(active)setOffer(x)}).catch(()=>{if(active)setNotice('Convite inválido, expirado ou já utilizado.');});
   return()=>{active=false};
 },[token]);
 const focusField=(field:string)=>{
   const input=formRef.current?.querySelector<HTMLInputElement>('[data-field="'+field+'"]');
   input?.focus();input?.scrollIntoView({behavior:'smooth',block:'center'});
 };
 const submit=async(event:React.FormEvent)=>{
   event.preventDefault();
   if(busy)return;
   if(!accepted){setNotice('Leia e confirme o aceite dos termos antes de enviar.');return;}
   const invalid=validateEnrollmentStudent(student,isMinor);
   if(invalid){setNotice(invalid.message);focusField(invalid.field);return;}
   setBusy(true);setNotice('');
   try{
     await submitDigitalOffer(token,student);
     setSent(true);
     window.scrollTo({top:0,behavior:'smooth'});
   }catch(e){
     const cause=e instanceof Error?e.message:'';
     const message=cause.includes('invalid_or_expired_link')?'Este convite já foi usado ou expirou. Solicite outro à secretaria.':
       cause.includes('guardian_required')?'Confira todos os dados obrigatórios do responsável legal.':
       cause.includes('invalid_student_data')?'Confira nome, e-mail, telefone, CPF, data de nascimento e instrumento.':
       cause.includes('invalid_birth_date')?'Confira a data de nascimento informada.':
       cause.includes('invalid_guardian_cpf')?'Confira o CPF do responsável ou deixe-o em branco.':
       'Não foi possível enviar. Confira os dados e tente novamente. Se persistir, entre em contato com a secretaria.';
     setNotice(message);
   }finally{setBusy(false)}
 };
 return <main className="max-w-2xl mx-auto p-6 space-y-5">
   <h1 className="text-2xl font-bold">Matrícula digital — IACRA</h1>
   <p className="text-sm text-zinc-600">Preencha os dados para enviar sua solicitação à secretaria. O envio não cria uma matrícula automaticamente.</p>
   {notice&&<p role="alert">{notice}</p>}
   {sent?<div role="status" className="p-4 border rounded-lg">Solicitação recebida e aguardando aprovação da secretaria. Aluno e matrícula ainda não foram criados.</div>:
   offer&&<form ref={formRef} noValidate onSubmit={submit} autoComplete="off" className="space-y-4">
     <section className="border rounded-lg p-4 bg-zinc-50 space-y-2">
       <h2 className="font-semibold">Informações definidas pela secretaria (não editáveis)</h2>
       <p>Professor: {offer.teacher_name}</p><p>Plano: {offer.plan_name}</p>
       {offer.group_name&&<p>Grupo: {offer.group_name}</p>}
       <p>Início: {offer.start_date} · Matrícula: {offer.enrollment_date}</p>
       <p className="font-semibold text-amber-800">Prazo para preenchimento e aceite: {new Date(offer.expires_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})} (Brasília)</p>
       <p>Mensalidade: {Number(offer.monthly_amount).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} · Vencimento dia {offer.due_day}</p>
     </section>
     <section className="border rounded-lg p-4 space-y-3">
       <h2 className="font-semibold">Dados do aluno</h2>
       <label className="block">Nome completo<input className="block border p-2 w-full rounded-lg" required data-field="name" value={student.name} onChange={e=>set('name',e.target.value)}/></label>
       <label className="block">E-mail<input type="email" className="block border p-2 w-full rounded-lg" required data-field="email" value={student.email} onChange={e=>set('email',e.target.value)}/></label>
       <label className="block">Telefone com DDD<input className="block border p-2 w-full rounded-lg" required data-field="phone" value={student.phone} onChange={e=>set('phone',e.target.value)}/></label>
       <label className="block">CPF<input className="block border p-2 w-full rounded-lg" required data-field="cpf" value={student.cpf} onChange={e=>set('cpf',e.target.value)}/></label>
       <label className="block">Data de nascimento<input type="date" className="block border p-2 w-full rounded-lg" required data-field="birth_date" value={student.birth_date} onChange={e=>set('birth_date',e.target.value)}/></label>
       <label className="block">Instrumento<input className="block border p-2 w-full rounded-lg" required data-field="instrument" value={student.instrument} onChange={e=>set('instrument',e.target.value)}/></label>
       {isMinor&&<div className="border border-amber-200 rounded-lg p-3 space-y-3 bg-amber-50">
         <h3 className="font-semibold">Dados do responsável legal (obrigatórios para menores de 18 anos)</h3>
         <label className="block">Nome completo do responsável<input className="block border p-2 w-full rounded-lg" required data-field="guardian_name" value={student.guardian_name} onChange={e=>set('guardian_name',e.target.value)}/></label>
         <label className="block">Parentesco ou vínculo legal<input className="block border p-2 w-full rounded-lg" required data-field="guardian_relationship" value={student.guardian_relationship} onChange={e=>set('guardian_relationship',e.target.value)}/></label>
         <label className="block">E-mail do responsável<input type="email" className="block border p-2 w-full rounded-lg" required data-field="guardian_email" value={student.guardian_email} onChange={e=>set('guardian_email',e.target.value)}/></label>
         <label className="block">Telefone do responsável<input type="tel" className="block border p-2 w-full rounded-lg" required data-field="guardian_phone" value={student.guardian_phone} onChange={e=>set('guardian_phone',e.target.value)}/></label>
         <label className="block">CPF do responsável (opcional)<input className="block border p-2 w-full rounded-lg" inputMode="numeric" data-field="guardian_cpf" value={student.guardian_cpf} onChange={e=>set('guardian_cpf',e.target.value)}/></label>
       </div>}
       <p className="text-sm text-zinc-600">Se o aluno já estiver cadastrado, o termo e o aceite serão recebidos normalmente. A secretaria conferirá o cadastro antes de aprovar, sem alterar seus dados automaticamente.</p>
     </section>
     <section className="border rounded-lg p-4 space-y-3">
       <h2 className="font-semibold">{offer.term_title}</h2>
       <p className="text-sm text-zinc-600">Leia atentamente o documento antes de confirmar o aceite.</p>
       <div className="whitespace-pre-wrap break-words max-h-72 overflow-y-auto text-sm">{splitBoldSegments(offer.term_body).map((p,i)=>p.bold?<strong key={i}>{p.text}</strong>:<React.Fragment key={i}>{p.text}</React.Fragment>)}</div>
       <label className="flex gap-2"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/> {isMinor?'Declaro que sou o responsável legal informado e que li e aceito os termos apresentados.':'Declaro que li e aceito os termos apresentados.'}</label>
       {notice&&<p role="alert" aria-live="assertive" className="rounded-lg border border-rose-200 bg-rose-50 text-rose-800 p-3 text-sm">{notice}</p>}
       <button type="submit" disabled={busy} className="bg-indigo-700 text-white rounded-lg px-4 py-2 disabled:opacity-40">{busy?'Enviando solicitação...':'Enviar solicitação'}</button>
     </section>
   </form>}
 </main>;
}
