import React,{useEffect,useState} from 'react';
import {useAppStore} from '../store';
import {TERM_MODELS,validTermForIssue,type TermDraft,type TermModelId} from '../utils/enrollmentTermModels';

import {createDigitalOffer,readDigitalInbox,approveDigitalRequest,reviewDigitalStudentMatch,readDigitalTermAudit,type DigitalTermAudit,type DigitalRequest,type DigitalStudentMatch} from '../services/digitalEnrollment';
import {isGroupModel} from '../utils/enrollmentTermModels';
import {EnrollmentSuccess} from '../components/EnrollmentSuccess';
import {EnrollmentInvitationTracking} from '../components/EnrollmentInvitationTracking';
import {termToSafeHtml} from '../utils/richTermMarkup';
import {RichTermEditor} from '../components/RichTermEditor';
import {openEnrollmentReceipt} from '../utils/enrollmentReceipt';
import {groupLabelForTerm,isMevGroupName,termWithGroupSnapshot} from '../utils/enrollmentTermGroup';
import {useIacraFeaturePermissions} from '../hooks/useIacraFeaturePermissions';

export function DigitalEnrollmentAdmin({onNavigate}:{onNavigate:(view:'students'|'enrollments')=>void}):React.ReactElement{
 const {state,currentUserProfile}=useAppStore();
 const access=useIacraFeaturePermissions(currentUserProfile);
 const active=Boolean(currentUserProfile?.access_status==='active' && access.digital_enrollment.view);
 const [model,setModel]=useState<TermModelId>('individual_instruments_vocal');
 const [planId,setPlanId]=useState('');
 const [teacherId,setTeacherId]=useState('');
 const [groupId,setGroupId]=useState('');
 const [price,setPrice]=useState<string|null>(null);
 const [instrument,setInstrument]=useState('');
 const [start,setStart]=useState(()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}));
 const [date,setDate]=useState(()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}));
 const [due,setDue]=useState('10');
 const [expiresOn,setExpiresOn]=useState('');
 const [term,setTerm]=useState<TermDraft>({title:TERM_MODELS[0].label,body:''});
 const [url,setUrl]=useState('');
 const [notice,setNotice]=useState('');
 const [records,setRecords]=useState<DigitalRequest[]>([]);
 const [invitationsRevision,setInvitationsRevision]=useState(0);
 const [busy,setBusy]=useState(false);
 const [audit,setAudit]=useState<DigitalTermAudit|null>(null);
 const [auditId,setAuditId]=useState<string|null>(null);
 const [auditBusy,setAuditBusy]=useState(false);
 const [recentApprovedId,setRecentApprovedId]=useState<string|null>(null);
 const [reviewId,setReviewId]=useState<string|null>(null);
 const [match,setMatch]=useState<DigitalStudentMatch|null>(null);
 const [updateExisting,setUpdateExisting]=useState(false);
 const [forceNewEnrollment,setForceNewEnrollment]=useState(false);
 const approvedRequest = records.find(r => r.id === recentApprovedId && r.status === 'approved' && r.student_id && r.enrollment_id)
   ?? records.find(r => r.status === 'approved' && r.student_id && r.enrollment_id);
 const plans=state.financialPlans.filter(p=>p.is_active);
 const teachers=state.teachers.filter(t=>t.status==='active');
 const groups=state.groups.filter(g=>g.status!=='inactive');
 const selectableGroups=groups.filter(g=>model==='mev_group'?isMevGroupName(g.name):model==='institutional_group'?!isMevGroupName(g.name):true);
 const plan=plans.find(p=>p.id===planId);
 const group=isGroupModel(model)?selectableGroups.find(g=>g.id===groupId):undefined;
 const groupTerm=isGroupModel(model)&&group?termWithGroupSnapshot(term,model,group.name):term;
 const groupNameInTerm=isGroupModel(model)&&group?groupLabelForTerm(model,group.name):'';
 const resolvedId=group?.teacher_id||plan?.exclusive_teacher_id||teacherId;
 const teacher=teachers.find(t=>t.id===resolvedId);
 const amount=Number(price??plan?.base_price);
 const validAmount=(price??(plan?String(plan.base_price):''))!==''&&Number.isFinite(amount)&&amount>=0&&amount<=100000&&Math.round(amount*100)===amount*100;
 const conflict=Boolean(group?.teacher_id&&plan?.exclusive_teacher_id&&group.teacher_id!==plan.exclusive_teacher_id);
 const refresh=async()=>{try{setRecords(await readDigitalInbox())}catch(e){setNotice(e instanceof Error?e.message:'Não foi possível carregar solicitações');}};
 useEffect(()=>{if(active)void refresh()},[active,currentUserProfile?.id]);
 if(!active)return <div role="alert">Sem permissão para Matrícula Digital.</div>;
 const issue=async()=>{
   if(!access.digital_enrollment.create||!teacher||!plan||(isGroupModel(model)&&!group)||!validAmount||conflict||!validTermForIssue(groupTerm)||!expiresOn||instrument.trim().length<2)return;
   setBusy(true);setUrl('');setNotice('');
   try{
     if(!validTermForIssue(groupTerm))throw new Error('Preencha e revise o texto do termo antes de enviar o convite.');
     const result=await createDigitalOffer({modelId:model,teacherId:teacher.id,planId:plan.id,groupId:group?.id||null,
       startDate:start,enrollmentDate:date,dueDay:Number(due),monthlyAmount:amount,term:groupTerm,expiresOn,instrument:instrument.trim()});
     setUrl(result);setInvitationsRevision(n=>n+1);setNotice('Convite criado. Confira o link antes de enviar ao aluno.');
   }catch(e){setNotice(e instanceof Error?e.message:'Falha ao criar convite');}finally{setBusy(false)}
 };
 const viewAudit=async(id:string)=>{
   setAudit(null);setAuditId(id);setAuditBusy(true);setNotice('');
   try{setAudit(await readDigitalTermAudit(id));}
   catch(e){setNotice(e instanceof Error?e.message:'Não foi possível consultar o termo');setAuditId(null)}
   finally{setAuditBusy(false)}
 };
 const openReview=async(id:string)=>{
   setBusy(true);setNotice('');setMatch(null);
   try{const result=await reviewDigitalStudentMatch(id);setMatch(result);setReviewId(id);setUpdateExisting(false);setForceNewEnrollment(false);}
   catch(e){setNotice(e instanceof Error?e.message:'Não foi possível conferir o aluno');}finally{setBusy(false)}
 };
 const approve=async()=>{
   if(!access.digital_enrollment.approve||!reviewId||!match||match.match_count>1)return;
   if(!window.confirm('Confirmar aprovação do termo no IACRA? O cadastro será reutilizado quando houver aluno com o mesmo CPF.'))return;
   setBusy(true);
   try{
     const result=await approveDigitalRequest(reviewId,{updateStudent:updateExisting,forceNewEnrollment});
     setNotice(result.student_reused?'Termo aprovado e vinculado ao aluno existente.':'Novo aluno e termo aprovados.');
     setRecentApprovedId(reviewId);setReviewId(null);setMatch(null);await refresh();
   }catch(e){setNotice(e instanceof Error?e.message:'Falha ao aprovar');}finally{setBusy(false)}
 };
 return <div className="max-w-5xl mx-auto p-6 space-y-5">
  <h1 className="text-2xl font-bold">Matrícula digital — IACRA</h1>
  <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg text-sm">A secretaria define o vencimento do convite. Cada link pode ser utilizado uma única vez, e todos os dados recebidos precisam de aprovação.</div>
  {approvedRequest && (
    <div id="enrollment-confirmation">
      <EnrollmentSuccess request={approvedRequest} onNavigate={onNavigate}/>
    </div>
  )}
  <section className="bg-white border rounded-xl p-5 space-y-3">
   <h2 className="font-bold text-lg">Preparar convite</h2>
   <label className="block">Modelo de termo<select className="block w-full border p-2" value={model} onChange={e=>{const id=e.target.value as TermModelId;setModel(id);setGroupId('');setTerm({title:TERM_MODELS.find(x=>x.id===id)?.label||'',body:'' });setUrl('')}}>{TERM_MODELS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
   <label className="block">Instrumento ou atividade definido pela secretaria <span className="text-red-700">*</span><input className="block w-full border p-2" maxLength={120} minLength={2} required value={instrument} placeholder="Ex.: Piano, Violão, Canto ou Musicalização" onChange={e=>{setInstrument(e.target.value);setUrl('')}}/><span className="text-xs text-zinc-600">Esse campo será mostrado ao aluno, mas não poderá ser alterado por ele.</span></label>
   <label className="block">Título do termo<input className="block w-full border p-2" maxLength={160} required value={term.title} onChange={e=>{setTerm(v=>({...v,title:e.target.value}));setUrl('')}}/></label>
   <div className="space-y-2"><label className="block font-medium">Texto completo do termo</label><RichTermEditor value={term.body} onChange={body=>{setTerm(v=>({...v,body}));setUrl('')}}/></div>
   {!validTermForIssue(groupTerm)&&<p role="status" className="text-sm text-amber-800">Preencha o texto do termo para liberar o convite. O conteúdo precisa ser revisado pela secretaria.</p>}
   <label className="block">Plano<select className="block w-full border p-2" value={planId} onChange={e=>{setPlanId(e.target.value);setPrice(null);setUrl('')}}><option value="">Selecione um plano</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name} — R$ {p.base_price.toFixed(2)}</option>)}</select></label>
   {isGroupModel(model)&&<div className="space-y-2"><label className="block">{model==='mev_group'?'Turma MEV cadastrada':'Grupo cadastrado'}<select className="block w-full border p-2" value={groupId} onChange={e=>{setGroupId(e.target.value);setUrl('')}}><option value="">Selecione um grupo</option>{selectableGroups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>{groupNameInTerm&&<div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-900"><strong>Identificação inserida automaticamente no termo:</strong> {groupNameInTerm}<p className="text-xs mt-1">O termo emitido guardará esse nome, mesmo se o cadastro do grupo mudar depois.</p></div>}{!selectableGroups.length&&<p className="text-sm text-amber-800">Nenhum grupo ativo dessa categoria encontrado no cadastro de Grupos.</p>}</div>}
   <label className="block">Professor<select className="block w-full border p-2 disabled:bg-zinc-100" value={resolvedId} disabled={Boolean(group?.teacher_id||plan?.exclusive_teacher_id)} onChange={e=>{setTeacherId(e.target.value);setUrl('')}}><option value="">Selecione um professor</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <label className="block">Mensalidade da matrícula (R$)<input className="block w-full border p-2" type="number" min="0" step="0.01" value={price??(plan?String(plan.base_price):'')} onChange={e=>{setPrice(e.target.value);setUrl('')}}/></label>
   <div className="grid grid-cols-2 gap-3"><label>Início<input className="block w-full border p-2" type="date" value={start} onChange={e=>{setStart(e.target.value);setUrl('')}}/></label><label>Data da matrícula<input className="block w-full border p-2" type="date" value={date} onChange={e=>{setDate(e.target.value);setUrl('')}}/></label></div>
   <label className="block">Dia de vencimento da mensalidade<input className="block w-full border p-2" type="number" min="1" max="31" value={due} onChange={e=>{setDue(e.target.value);setUrl('')}}/></label>
   <label className="block">Data de validade do link para preenchimento <span className="text-red-700">*</span><input className="block w-full border p-2" type="date" required min={new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})} value={expiresOn} onChange={e=>{setExpiresOn(e.target.value);setUrl('')}}/><span className="text-sm text-zinc-600">O preenchimento e aceite ficam disponíveis até 23h59 (horário de Brasília) na data escolhida.</span></label>
   {conflict&&<p role="alert" className="text-red-700">Professor do grupo e professor exclusivo do plano não coincidem.</p>}
   <button type="button" disabled={!access.digital_enrollment.create||busy||!teacher||!plan||(isGroupModel(model)&&!group)||!validAmount||conflict||!validTermForIssue(groupTerm)||instrument.trim().length<2||!expiresOn||expiresOn<new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})} onClick={issue} className="bg-indigo-700 text-white rounded-lg px-4 py-2 disabled:opacity-40">Gerar link de matrícula</button>
   {url&&<div className="space-y-2"><p className="text-xs">O link é individual e confidencial. Envie apenas ao destinatário correto.</p><a href={url} target="_blank" rel="noopener noreferrer" className="block text-indigo-700 underline">Abrir formulário de matrícula</a><button type="button" onClick={()=>void navigator.clipboard.writeText(url)} className="border px-3 py-2 rounded-lg">Copiar link</button></div>}
  </section>
  <EnrollmentInvitationTracking canMarkSent={access.digital_enrollment.create} revision={invitationsRevision}/>
  <section className="border bg-white rounded-xl p-5 space-y-4">
   <div className="flex justify-between gap-3"><h2 className="font-bold text-lg">Solicitações recebidas</h2><button type="button" onClick={()=>void refresh()} className="border px-3 py-2 rounded-lg">Atualizar</button></div>
   {records.length===0&&<p>Sem solicitações.</p>}
   {records.map(r=><div key={r.id} className="border rounded-lg p-4 space-y-2">
     <p><strong>{r.student?.name}</strong> · {r.plan_name} · {r.teacher_name} · R$ {Number(r.monthly_amount).toFixed(2)}</p>
     <p className="text-sm">Situação: {r.status} · CPF: {r.student?.cpf} · Matrícula: {r.enrollment_id||'pendente'}</p>
     <button type="button" disabled={auditBusy} onClick={()=>void viewAudit(r.id)} className="border border-indigo-200 text-indigo-800 rounded-lg px-3 py-2 disabled:opacity-40">Ver termo e histórico</button>
     {r.status==='pending'&&access.digital_enrollment.approve&&<button disabled={busy} onClick={()=>void openReview(r.id)} className="bg-indigo-700 text-white rounded-lg px-3 py-2 disabled:opacity-40">Conferir aluno e aprovar termo</button>}
     {r.status==='approved'&&r.student_id&&r.enrollment_id&&<button type="button" onClick={()=>{
       setRecentApprovedId(r.id);
       document.getElementById('enrollment-confirmation')?.scrollIntoView({behavior:'smooth',block:'start'});
     }} className="rounded-lg border border-indigo-200 text-indigo-800 px-3 py-2 hover:bg-indigo-50">Ver confirmação da matrícula</button>}
   </div>)}
  </section>
  {reviewId&&match&&<section className="fixed inset-0 z-50 bg-black/50 p-3 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Revisar cadastro e termo">
    <div className="bg-white p-5 rounded-xl max-w-xl w-full max-h-full overflow-y-auto space-y-3">
      <h2 className="text-lg font-bold">Conferir aluno e aprovar termo</h2>
      {match.match_count===0&&<p>Nenhum aluno encontrado com esse CPF. Ao aprovar, o sistema criará um cadastro novo.</p>}
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
        <button type="button" className="bg-indigo-700 text-white rounded-lg px-3 py-2 disabled:opacity-40" disabled={!access.digital_enrollment.approve||busy||match.match_count>1} onClick={()=>void approve()}>Confirmar aprovação</button>
      </div>
    </div>
  </section>}
  {auditId&&<section className="fixed inset-0 z-50 bg-black/50 p-3 sm:p-8 flex items-center justify-center" role="dialog" aria-modal="true" aria-label="Termo e histórico da matrícula">
    <div className="bg-white rounded-xl w-full max-w-3xl max-h-full overflow-y-auto p-5 sm:p-7 space-y-4">
      <div className="flex justify-between items-start gap-3"><h2 className="text-xl font-bold">Termo e histórico da matrícula</h2><button type="button" className="border rounded-lg px-3 py-1" onClick={()=>{setAuditId(null);setAudit(null)}}>Fechar</button></div>
      {auditBusy&&<p>Carregando termo…</p>}
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
          <div className="break-words text-sm leading-relaxed [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6" dangerouslySetInnerHTML={{__html:termToSafeHtml(audit.term_body)}}/>
        </div>
        {audit.status==='approved'&&records.find(r=>r.id===auditId)?.enrollment_id&&<button type="button" className="bg-indigo-700 text-white rounded-lg px-4 py-2" onClick={()=>{try{const record=records.find(r=>r.id===auditId);if(record)openEnrollmentReceipt(record,audit)}catch(e){setNotice(e instanceof Error?e.message:'Erro ao emitir comprovante')}}}>Emitir comprovante em PDF</button>}
        <p className="text-xs text-zinc-500">Cópia preservada no sistema. O registro de aceite não é um certificado de assinatura digital.</p>
      </>}
    </div>
  </section>}
  {notice&&<p role="status" className="border rounded-lg p-3">{notice}</p>}
 </div>
}
