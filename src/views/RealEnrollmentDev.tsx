import React,{useEffect,useState} from 'react';
import {useAppStore} from '../store';
import {TERM_MODELS,type TermModelId} from '../utils/enrollmentTermsDemo';
import {originalTermDraft,readSavedTermDraft,termDraftStorageKey} from '../utils/enrollmentTermsDraft';
import {createRealDevOffer,readRealDevInbox,approveRealDevRequest,reviewRealDevStudentMatch,readRealDevTermAudit,type RealDevTermAudit,type RealDevRequest,type RealDevStudentMatch} from '../services/enrollmentDevReal';
import {isGroupModel} from '../utils/enrollmentDevInbox';
import {EnrollmentDevSuccess} from '../components/EnrollmentDevSuccess';
import {splitBoldSegments} from '../utils/termBoldMarkup';
import {openDevEnrollmentReceipt} from '../utils/enrollmentDevReceipt';

export function RealEnrollmentDev({onNavigate}:{onNavigate:(view:'students'|'enrollments')=>void}):React.ReactElement{
 const {state,currentUserProfile}=useAppStore();
 const [model,setModel]=useState<TermModelId>('individual_instruments_vocal');
 const [planId,setPlanId]=useState('');
 const [teacherId,setTeacherId]=useState('');
 const [groupId,setGroupId]=useState('');
 const [price,setPrice]=useState<string|null>(null);
 const [start,setStart]=useState(()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}));
 const [date,setDate]=useState(()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}));
 const [due,setDue]=useState('10');
 const [expiresOn,setExpiresOn]=useState('');
 const [url,setUrl]=useState('');
 const [notice,setNotice]=useState('');
 const [records,setRecords]=useState<RealDevRequest[]>([]);
 const [busy,setBusy]=useState(false);
 const [audit,setAudit]=useState<RealDevTermAudit|null>(null);
 const [auditId,setAuditId]=useState<string|null>(null);
 const [auditBusy,setAuditBusy]=useState(false);
 const [recentApprovedId,setRecentApprovedId]=useState<string|null>(null);
 const [reviewId,setReviewId]=useState<string|null>(null);
 const [match,setMatch]=useState<RealDevStudentMatch|null>(null);
 const [updateExisting,setUpdateExisting]=useState(false);
 const [forceNewEnrollment,setForceNewEnrollment]=useState(false);
 const approvedRequest = records.find(r => r.id === recentApprovedId && r.status === 'approved' && r.student_id && r.enrollment_id)
   ?? records.find(r => r.status === 'approved' && r.student_id && r.enrollment_id);
 const plans=state.financialPlans.filter(p=>p.is_active);
 const teachers=state.teachers.filter(t=>t.status==='active');
 const groups=state.groups.filter(g=>g.status!=='inactive');
 const plan=plans.find(p=>p.id===planId);
 const group=isGroupModel(model)?groups.find(g=>g.id===groupId):undefined;
 const resolvedId=group?.teacher_id||plan?.exclusive_teacher_id||teacherId;
 const teacher=teachers.find(t=>t.id===resolvedId);
 const amount=Number(price??plan?.base_price);
 const validAmount=(price??(plan?String(plan.base_price):''))!==''&&Number.isFinite(amount)&&amount>=0&&amount<=100000&&Math.round(amount*100)===amount*100;
 const conflict=Boolean(group?.teacher_id&&plan?.exclusive_teacher_id&&group.teacher_id!==plan.exclusive_teacher_id);
 const refresh=async()=>{try{setRecords(await readRealDevInbox())}catch(e){setNotice(e instanceof Error?e.message:'Não foi possível carregar solicitações');}};
 useEffect(()=>{if(currentUserProfile?.role==='super_admin')void refresh()},[currentUserProfile?.id,currentUserProfile?.role]);
 if(currentUserProfile?.role!=='super_admin'||currentUserProfile.access_status!=='active')return <div role="alert">Área restrita ao Super Admin ativo.</div>;
 const issue=async()=>{
   if(!teacher||!plan||(isGroupModel(model)&&!group)||!validAmount||conflict||!expiresOn)return;
   setBusy(true);setUrl('');setNotice('');
   try{
     let term=originalTermDraft(model);
     try{term=readSavedTermDraft(localStorage.getItem(termDraftStorageKey(model)))||term}catch{}
     const result=await createRealDevOffer({modelId:model,teacherId:teacher.id,planId:plan.id,groupId:group?.id||null,
       startDate:start,enrollmentDate:date,dueDay:Number(due),monthlyAmount:amount,term,expiresOn});
     setUrl(result);setNotice('Convite de homologação criado no banco DEV. Use somente dados inventados.');
   }catch(e){setNotice(e instanceof Error?e.message:'Falha ao criar convite');}finally{setBusy(false)}
 };
 const viewAudit=async(id:string)=>{
   setAudit(null);setAuditId(id);setAuditBusy(true);setNotice('');
   try{setAudit(await readRealDevTermAudit(id));}
   catch(e){setNotice(e instanceof Error?e.message:'Não foi possível consultar o termo');setAuditId(null)}
   finally{setAuditBusy(false)}
 };
 const openReview=async(id:string)=>{
   setBusy(true);setNotice('');setMatch(null);
   try{const result=await reviewRealDevStudentMatch(id);setMatch(result);setReviewId(id);setUpdateExisting(false);setForceNewEnrollment(false);}
   catch(e){setNotice(e instanceof Error?e.message:'Não foi possível conferir o aluno');}finally{setBusy(false)}
 };
 const approve=async()=>{
   if(!reviewId||!match||match.match_count>1)return;
   if(!window.confirm('Confirmar aprovação do termo no IACRA-DEV? O cadastro será reutilizado quando houver aluno com o mesmo CPF.'))return;
   setBusy(true);
   try{
     const result=await approveRealDevRequest(reviewId,{updateStudent:updateExisting,forceNewEnrollment});
     setNotice(result.student_reused?'Termo aprovado e vinculado ao aluno existente no DEV.':'Novo aluno e termo aprovados no DEV.');
     setRecentApprovedId(reviewId);setReviewId(null);setMatch(null);await refresh();
   }catch(e){setNotice(e instanceof Error?e.message:'Falha ao aprovar');}finally{setBusy(false)}
 };
 return <div className="max-w-5xl mx-auto p-6 space-y-5">
  <h1 className="text-2xl font-bold">Matrícula digital — banco DEV</h1>
  <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg text-sm">Homologação com escrita no banco IACRA-DEV. Use exclusivamente dados inventados. A secretaria define o vencimento de cada convite, que pode ser usado apenas uma vez. Não envie para alunos reais.</div>
  {approvedRequest && (
    <div id="dev-enrollment-confirmation">
      <EnrollmentDevSuccess request={approvedRequest} onNavigate={onNavigate}/>
    </div>
  )}
  <section className="bg-white border rounded-xl p-5 space-y-3">
   <h2 className="font-bold text-lg">Preparar convite</h2>
   <label className="block">Termo<select className="block w-full border p-2" value={model} onChange={e=>{setModel(e.target.value as TermModelId);setUrl('')}}>{TERM_MODELS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
   <label className="block">Plano<select className="block w-full border p-2" value={planId} onChange={e=>{setPlanId(e.target.value);setPrice(null);setUrl('')}}><option value="">Selecione um plano</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name} — R$ {p.base_price.toFixed(2)}</option>)}</select></label>
   {isGroupModel(model)&&<label className="block">Grupo<select className="block w-full border p-2" value={groupId} onChange={e=>{setGroupId(e.target.value);setUrl('')}}><option value="">Selecione um grupo</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}
   <label className="block">Professor<select className="block w-full border p-2 disabled:bg-zinc-100" value={resolvedId} disabled={Boolean(group?.teacher_id||plan?.exclusive_teacher_id)} onChange={e=>{setTeacherId(e.target.value);setUrl('')}}><option value="">Selecione um professor</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <label className="block">Mensalidade da matrícula (R$)<input className="block w-full border p-2" type="number" min="0" step="0.01" value={price??(plan?String(plan.base_price):'')} onChange={e=>{setPrice(e.target.value);setUrl('')}}/></label>
   <div className="grid grid-cols-2 gap-3"><label>Início<input className="block w-full border p-2" type="date" value={start} onChange={e=>{setStart(e.target.value);setUrl('')}}/></label><label>Data da matrícula<input className="block w-full border p-2" type="date" value={date} onChange={e=>{setDate(e.target.value);setUrl('')}}/></label></div>
   <label className="block">Dia de vencimento da mensalidade<input className="block w-full border p-2" type="number" min="1" max="31" value={due} onChange={e=>{setDue(e.target.value);setUrl('')}}/></label>
   <label className="block">Data de validade do link para preenchimento <span className="text-red-700">*</span><input className="block w-full border p-2" type="date" required min={new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})} value={expiresOn} onChange={e=>{setExpiresOn(e.target.value);setUrl('')}}/><span className="text-sm text-zinc-600">O preenchimento e aceite ficam disponíveis até 23h59 (horário de Brasília) na data escolhida.</span></label>
   {conflict&&<p role="alert" className="text-red-700">Professor do grupo e professor exclusivo do plano não coincidem.</p>}
   <button type="button" disabled={busy||!teacher||!plan||(isGroupModel(model)&&!group)||!validAmount||conflict||!expiresOn||expiresOn<new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})} onClick={issue} className="bg-indigo-700 text-white rounded-lg px-4 py-2 disabled:opacity-40">Gerar link no DEV</button>
   {url&&<div className="space-y-2"><p className="text-xs">O token é confidencial: não compartilhe o link fora da homologação.</p><a href={url} target="_blank" rel="noopener noreferrer" className="block text-indigo-700 underline">Abrir matrícula fictícia</a><button type="button" onClick={()=>void navigator.clipboard.writeText(url)} className="border px-3 py-2 rounded-lg">Copiar link de teste</button></div>}
  </section>
  <section className="border bg-white rounded-xl p-5 space-y-4">
   <div className="flex justify-between gap-3"><h2 className="font-bold text-lg">Solicitações recebidas no DEV</h2><button type="button" onClick={()=>void refresh()} className="border px-3 py-2 rounded-lg">Atualizar</button></div>
   {records.length===0&&<p>Sem solicitações.</p>}
   {records.map(r=><div key={r.id} className="border rounded-lg p-4 space-y-2">
     <p><strong>{r.student?.name}</strong> · {r.plan_name} · {r.teacher_name} · R$ {Number(r.monthly_amount).toFixed(2)}</p>
     <p className="text-sm">Situação: {r.status} · CPF fictício: {r.student?.cpf} · Matrícula: {r.enrollment_id||'pendente'}</p>
     <button type="button" disabled={auditBusy} onClick={()=>void viewAudit(r.id)} className="border border-indigo-200 text-indigo-800 rounded-lg px-3 py-2 disabled:opacity-40">Ver termo e histórico</button>
     {r.status==='pending'&&<button disabled={busy} onClick={()=>void openReview(r.id)} className="bg-indigo-700 text-white rounded-lg px-3 py-2 disabled:opacity-40">Conferir aluno e aprovar termo</button>}
     {r.status==='approved'&&r.student_id&&r.enrollment_id&&<button type="button" onClick={()=>{
       setRecentApprovedId(r.id);
       document.getElementById('dev-enrollment-confirmation')?.scrollIntoView({behavior:'smooth',block:'start'});
     }} className="rounded-lg border border-indigo-200 text-indigo-800 px-3 py-2 hover:bg-indigo-50">Ver confirmação da matrícula</button>}
   </div>)}
  </section>
  {reviewId&&match&&<section className="fixed inset-0 z-50 bg-black/50 p-3 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Revisar cadastro e termo">
    <div className="bg-white p-5 rounded-xl max-w-xl w-full max-h-full overflow-y-auto space-y-3">
      <h2 className="text-lg font-bold">Conferir aluno e aprovar termo (DEV)</h2>
      {match.match_count===0&&<p>Nenhum aluno encontrado com esse CPF. Ao aprovar, o DEV criará um cadastro novo.</p>}
      {match.match_count===1&&<div className="space-y-2">
        <p className="font-semibold">Aluno já cadastrado: {match.student?.name}</p>
        <p className="text-sm">E-mail atual: {match.student?.email||'não informado'} · Telefone atual: {match.student?.phone||'não informado'}</p>
        <p>O termo poderá ser aprovado sem duplicar o aluno, preservando os dados originais.</p>
        <label className="flex gap-2"><input type="checkbox" checked={updateExisting} onChange={e=>setUpdateExisting(e.target.checked)}/> Atualizar os dados cadastrais com as informações deste formulário</label>
      </div>}
      {match.match_count>1&&<p role="alert" className="text-red-700">Há mais de um cadastro com este CPF. O termo aceito está preservado. É necessário revisar as duplicidades antes de vincular.</p>}
      {match.match_count<=1&&<div className="space-y-2">
        {match.matching_enrollment_id&&<p>Já existe uma matrícula ativa para este plano e professor. Ela será reutilizada, salvo se você escolher uma nova.</p>}
        <label className="flex gap-2"><input type="checkbox" checked={forceNewEnrollment} onChange={e=>setForceNewEnrollment(e.target.checked)}/> Criar nova matrícula em vez de reutilizar uma matrícula ativa correspondente</label>
      </div>}
      <div className="flex gap-2">
        <button type="button" className="border rounded-lg px-3 py-2" onClick={()=>{setReviewId(null);setMatch(null)}}>Cancelar</button>
        <button type="button" className="bg-indigo-700 text-white rounded-lg px-3 py-2 disabled:opacity-40" disabled={busy||match.match_count>1} onClick={()=>void approve()}>Confirmar aprovação no DEV</button>
      </div>
    </div>
  </section>}
  {auditId&&<section className="fixed inset-0 z-50 bg-black/50 p-3 sm:p-8 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Termo e histórico da matrícula">
    <div className="bg-white rounded-xl w-full max-w-3xl max-h-full overflow-y-auto p-5 sm:p-7 space-y-4">
      <div className="flex justify-between items-start gap-3"><h2 className="text-xl font-bold">Termo e histórico da matrícula (DEV)</h2><button type="button" className="border rounded-lg px-3 py-1" onClick={()=>{setAuditId(null);setAudit(null)}}>Fechar</button></div>
      {auditBusy&&<p>Carregando termo do banco DEV…</p>}
      {audit&&<>
        <p className="text-sm text-zinc-600">Situação: {audit.status==='approved'?'Aprovada':audit.status==='pending'?'Pendente':audit.status}</p>
        <div className="rounded-lg bg-indigo-50 p-4 space-y-2 text-sm">
          <p><strong>Aceite:</strong> {audit.accepted_at?new Date(audit.accepted_at).toLocaleString('pt-BR'):'Não localizado'}</p>
          <p><strong>Aprovação:</strong> {audit.reviewed_at?new Date(audit.reviewed_at).toLocaleString('pt-BR'):'Ainda não aprovada'}</p>
          <p><strong>Responsável pela aprovação (identificador):</strong> {audit.reviewed_by||'Não registrado'}</p>
          <p><strong>Vínculo da matrícula:</strong> {audit.enrollment_id||'Aguardando aprovação'}</p>
          {audit.guardian_name&&<p><strong>Responsável legal informado no aceite:</strong> {audit.guardian_name} ({audit.guardian_relationship||'vínculo não informado'}), {audit.guardian_email||'sem e-mail'}, {audit.guardian_phone||'sem telefone'}</p>}
        </div>
        <div className="border rounded-lg p-4">
          <h3 className="font-bold text-lg mb-3">{audit.term_title}</h3>
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">{splitBoldSegments(audit.term_body).map((seg,i)=>seg.bold?<strong key={i}>{seg.text}</strong>:<React.Fragment key={i}>{seg.text}</React.Fragment>)}</div>
        </div>
        {audit.status==='approved'&&records.find(r=>r.id===auditId)?.enrollment_id&&<button type="button" className="bg-indigo-700 text-white rounded-lg px-4 py-2" onClick={()=>{try{const record=records.find(r=>r.id===auditId);if(record)openDevEnrollmentReceipt(record,audit)}catch(e){setNotice(e instanceof Error?e.message:'Erro ao emitir comprovante')}}}>Emitir comprovante em PDF (DEV)</button>}
        <p className="text-xs text-zinc-500">Cópia preservada no banco de testes. O registro de aceite não é um certificado de assinatura digital.</p>
      </>}
    </div>
  </section>}
  {notice&&<p role="status" className="border rounded-lg p-3">{notice}</p>}
 </div>
}
