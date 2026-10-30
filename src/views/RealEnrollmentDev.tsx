import React,{useEffect,useState} from 'react';
import {useAppStore} from '../store';
import {TERM_MODELS,type TermModelId} from '../utils/enrollmentTermsDemo';
import {originalTermDraft,readSavedTermDraft,termDraftStorageKey} from '../utils/enrollmentTermsDraft';
import {createRealDevOffer,readRealDevInbox,approveRealDevRequest,type RealDevRequest} from '../services/enrollmentDevReal';
import {isGroupModel} from '../utils/enrollmentDevInbox';

export function RealEnrollmentDev():React.ReactElement{
 const {state,currentUserProfile}=useAppStore();
 const [model,setModel]=useState<TermModelId>('individual_instruments_vocal');
 const [planId,setPlanId]=useState('');
 const [teacherId,setTeacherId]=useState('');
 const [groupId,setGroupId]=useState('');
 const [price,setPrice]=useState<string|null>(null);
 const [start,setStart]=useState('2026-11-02');
 const [date,setDate]=useState('2026-10-29');
 const [due,setDue]=useState('10');
 const [url,setUrl]=useState('');
 const [notice,setNotice]=useState('');
 const [records,setRecords]=useState<RealDevRequest[]>([]);
 const [busy,setBusy]=useState(false);
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
   if(!teacher||!plan||(isGroupModel(model)&&!group)||!validAmount||conflict)return;
   setBusy(true);setUrl('');setNotice('');
   try{
     let term=originalTermDraft(model);
     try{term=readSavedTermDraft(localStorage.getItem(termDraftStorageKey(model)))||term}catch{}
     const result=await createRealDevOffer({modelId:model,teacherId:teacher.id,planId:plan.id,groupId:group?.id||null,
       startDate:start,enrollmentDate:date,dueDay:Number(due),monthlyAmount:amount,term});
     setUrl(result);setNotice('Convite de homologação criado no banco DEV. Use somente dados inventados.');
   }catch(e){setNotice(e instanceof Error?e.message:'Falha ao criar convite');}finally{setBusy(false)}
 };
 const approve=async(id:string)=>{
   if(!window.confirm('Criar aluno e matrícula fictícios no banco IACRA-DEV? A operação poderá acionar rotinas de cadastro do sistema.'))return;
   setBusy(true);try{const result=await approveRealDevRequest(id);setNotice('Gravado no DEV: aluno '+result.student_id+' / matrícula '+result.enrollment_id);await refresh();}
   catch(e){setNotice(e instanceof Error?e.message:'Falha ao aprovar');}finally{setBusy(false)}
 };
 return <div className="max-w-5xl mx-auto p-6 space-y-5">
  <h1 className="text-2xl font-bold">Matrícula digital — banco DEV</h1>
  <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg text-sm">Homologação com escrita no banco IACRA-DEV. Use exclusivamente dados inventados. Os convites duram sete dias e são usados uma única vez. Não envie para alunos reais.</div>
  <section className="bg-white border rounded-xl p-5 space-y-3">
   <h2 className="font-bold text-lg">Preparar convite</h2>
   <label className="block">Termo<select className="block w-full border p-2" value={model} onChange={e=>{setModel(e.target.value as TermModelId);setUrl('')}}>{TERM_MODELS.map(m=><option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
   <label className="block">Plano<select className="block w-full border p-2" value={planId} onChange={e=>{setPlanId(e.target.value);setPrice(null);setUrl('')}}><option value="">Selecione um plano</option>{plans.map(p=><option key={p.id} value={p.id}>{p.name} — R$ {p.base_price.toFixed(2)}</option>)}</select></label>
   {isGroupModel(model)&&<label className="block">Grupo<select className="block w-full border p-2" value={groupId} onChange={e=>{setGroupId(e.target.value);setUrl('')}}><option value="">Selecione um grupo</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}
   <label className="block">Professor<select className="block w-full border p-2 disabled:bg-zinc-100" value={resolvedId} disabled={Boolean(group?.teacher_id||plan?.exclusive_teacher_id)} onChange={e=>{setTeacherId(e.target.value);setUrl('')}}><option value="">Selecione um professor</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <label className="block">Mensalidade da matrícula (R$)<input className="block w-full border p-2" type="number" min="0" step="0.01" value={price??(plan?String(plan.base_price):'')} onChange={e=>{setPrice(e.target.value);setUrl('')}}/></label>
   <div className="grid grid-cols-2 gap-3"><label>Início<input className="block w-full border p-2" type="date" value={start} onChange={e=>{setStart(e.target.value);setUrl('')}}/></label><label>Data da matrícula<input className="block w-full border p-2" type="date" value={date} onChange={e=>{setDate(e.target.value);setUrl('')}}/></label></div>
   <label className="block">Dia de vencimento<input className="block w-full border p-2" type="number" min="1" max="31" value={due} onChange={e=>{setDue(e.target.value);setUrl('')}}/></label>
   {conflict&&<p role="alert" className="text-red-700">Professor do grupo e professor exclusivo do plano não coincidem.</p>}
   <button type="button" disabled={busy||!teacher||!plan||(isGroupModel(model)&&!group)||!validAmount||conflict} onClick={issue} className="bg-indigo-700 text-white rounded-lg px-4 py-2 disabled:opacity-40">Gerar link no DEV</button>
   {url&&<div className="space-y-2"><p className="text-xs">O token é confidencial: não compartilhe o link fora da homologação.</p><a href={url} target="_blank" rel="noopener noreferrer" className="block text-indigo-700 underline">Abrir matrícula fictícia</a><button type="button" onClick={()=>void navigator.clipboard.writeText(url)} className="border px-3 py-2 rounded-lg">Copiar link de teste</button></div>}
  </section>
  <section className="border bg-white rounded-xl p-5 space-y-4">
   <div className="flex justify-between gap-3"><h2 className="font-bold text-lg">Solicitações recebidas no DEV</h2><button type="button" onClick={()=>void refresh()} className="border px-3 py-2 rounded-lg">Atualizar</button></div>
   {records.length===0&&<p>Sem solicitações.</p>}
   {records.map(r=><div key={r.id} className="border rounded-lg p-4 space-y-2">
     <p><strong>{r.student?.name}</strong> · {r.plan_name} · {r.teacher_name} · R$ {Number(r.monthly_amount).toFixed(2)}</p>
     <p className="text-sm">Situação: {r.status} · CPF fictício: {r.student?.cpf} · Matrícula: {r.enrollment_id||'pendente'}</p>
     {r.status==='pending'&&<button disabled={busy} onClick={()=>void approve(r.id)} className="bg-indigo-700 text-white rounded-lg px-3 py-2 disabled:opacity-40">Aprovar e gravar aluno + matrícula no DEV</button>}
   </div>)}
  </section>
  {notice&&<p role="status" className="border rounded-lg p-3">{notice}</p>}
 </div>
}
