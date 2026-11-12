import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {markDigitalOfferSent,readDigitalOfferTracking,type DigitalOfferTracking} from '../services/digitalEnrollment';

type Status='created'|'sent'|'opened'|'expired'|'submitted'|'approved';
const statusNames:Record<Status,string>={
 created:'Criado (sem abertura registrada)',
 sent:'Envio informado (sem abertura registrada)',
 opened:'Visualizado, sem preenchimento',
 expired:'Vencido sem preenchimento',
 submitted:'Preenchido, aguardando análise',
 approved:'Aprovado',
};
export function invitationStatus(row:DigitalOfferTracking,now=Date.now()):Status{
 if(row.submission_status==='approved')return 'approved';
 if(row.submitted_at)return 'submitted';
 if(new Date(row.expires_at).getTime()<=now)return 'expired';
 if(row.first_opened_at)return 'opened';
 if(row.sent_at)return 'sent';
 return 'created';
}
const stamp=(date:string|null|undefined)=>date?
 new Date(date).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'Não registrado';

export function EnrollmentInvitationTracking({canMarkSent,revision}:{canMarkSent:boolean;revision:number}):React.ReactElement{
 const [records,setRecords]=useState<DigitalOfferTracking[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [filter,setFilter]=useState<Status|'all'>('all');
 const [search,setSearch]=useState('');
 const [sending,setSending]=useState<string|null>(null);
 const [recipient,setRecipient]=useState<Record<string,string>>({});
 const [now,setNow]=useState(()=>Date.now());
 const [page,setPage]=useState(1);
 const PAGE_SIZE=8;
 const refresh=useCallback(async()=>{
  setLoading(true);setError('');
  try{setRecords(await readDigitalOfferTracking());setNow(Date.now());}
  catch(e){setError(e instanceof Error?e.message:'Falha ao carregar convites');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void refresh();},[refresh,revision]);
 const totals=useMemo(()=>{
  const counts:Record<Status,number>={created:0,sent:0,opened:0,expired:0,submitted:0,approved:0};
  for(const r of records)counts[invitationStatus(r,now)]++;
  return counts;
 },[records,now]);
 const shown=useMemo(()=>records.filter(r=>{
  if(filter!=='all'&&invitationStatus(r,now)!==filter)return false;
  const q=search.trim().toLocaleLowerCase('pt-BR');
  return !q||[r.recipient_label,r.term_title,r.teacher_name,r.plan_name,r.group_name]
    .some(value=>String(value||'').toLocaleLowerCase('pt-BR').includes(q));
 }),[records,filter,search,now]);
 const pageCount=Math.max(1,Math.ceil(shown.length/PAGE_SIZE));
 const currentPage=Math.min(page,pageCount);
 const pageRows=shown.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
 const markSent=async(row:DigitalOfferTracking)=>{
  if(sending||!canMarkSent)return;
  if(!window.confirm('Confirma que você enviou esse convite fora do IACRA? Isso registra uma informação manual, não a entrega pelo WhatsApp.'))return;
  setSending(row.id);setError('');
  try{await markDigitalOfferSent(row.id,recipient[row.id]||'');await refresh();}
  catch(e){setError(e instanceof Error?e.message:'Falha ao registrar envio');}
  finally{setSending(null);}
 };
 return <section className="border bg-white rounded-xl p-4 sm:p-5 space-y-3">
  <div className="flex items-center justify-between gap-3 flex-wrap">
   <div><h2 className="text-lg font-bold">Acompanhamento de Termos</h2>
    <p className="text-sm text-zinc-600">Convites criados, aberturas do formulário, preenchimentos e vencimentos.</p>
   </div>
   <button type="button" onClick={()=>void refresh()} disabled={loading} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">{loading?'Carregando...':'Atualizar acompanhamento'}</button>
  </div>
  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
   {(['created','sent','opened','expired','submitted','approved'] as Status[]).map(status=>
    <button key={status} type="button" onClick={()=>{setFilter(filter===status?'all':status);setPage(1)}}
     aria-pressed={filter===status}
     className={'rounded-md border px-2 py-2 text-left text-xs '+(filter===status?'border-indigo-600 bg-indigo-50':'border-zinc-200 hover:bg-zinc-50')}>
     <strong className="block text-base">{totals[status]}</strong><span className="leading-tight block">{statusNames[status]}</span>
    </button>
   )}
  </div>
  <div className="flex flex-wrap gap-3">
   <label className="text-sm flex-1 min-w-[220px]">Buscar termo, grupo ou destinatário
    <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Buscar..." className="block w-full border rounded-lg p-2"/>
   </label>
   <label className="text-sm">Situação
    <select className="block border rounded-lg p-2" value={filter} onChange={e=>{setFilter(e.target.value as Status|'all');setPage(1)}}>
     <option value="all">Todos</option>
     {(Object.keys(statusNames) as Status[]).map(s=><option key={s} value={s}>{statusNames[s]}</option>)}
    </select>
   </label>
  </div>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  <p className="text-xs text-zinc-600">“Visualizado” significa que a página válida foi aberta; não comprova leitura. Prévia do WhatsApp não conta como abertura. “Enviado” é informado manualmente pela secretaria. Convites antigos podem ter sido abertos antes do início do rastreamento.</p>
  {shown.length===0&&<p className="text-sm text-zinc-600">Nenhum convite encontrado.</p>}
  <div className="text-xs text-zinc-600">Mostrando {shown.length===0?0:(currentPage-1)*PAGE_SIZE+1}–{Math.min(currentPage*PAGE_SIZE,shown.length)} de {shown.length} convites</div>
  <div className="space-y-1.5">
  {pageRows.map(r=><details key={r.id} className="group border rounded-lg px-3 py-2 text-sm">
    <summary className="flex flex-wrap items-center justify-between gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
     <div className="min-w-0 flex-1"><strong className="block truncate">{r.term_title}</strong>
      <span className="text-xs text-zinc-600">{r.recipient_label||'Destinatário não identificado'} · {r.group_name||r.plan_name}</span>
     </div>
     <span className="text-xs font-semibold text-indigo-800">{statusNames[invitationStatus(r,now)]}</span>
     <span aria-hidden="true" className="text-zinc-500 group-open:rotate-180">⌄</span>
    </summary>
    <div className="mt-2 border-t pt-2 space-y-2">
     <p className="text-xs text-zinc-600">Professor: {r.teacher_name}</p>
     <div className="grid sm:grid-cols-2 gap-1 text-xs text-zinc-700">
      <span>Criado: {stamp(r.created_at)}</span>
      <span>Validade: {stamp(r.expires_at)}</span>
      <span>Primeira abertura: {stamp(r.first_opened_at)}</span>
      <span>Preenchimento: {stamp(r.submitted_at)}</span>
     </div>
     {r.sent_at&&<p className="text-xs text-zinc-600">Envio informado: {stamp(r.sent_at)}</p>}
     {canMarkSent&&!r.sent_at&&!r.submitted_at&&new Date(r.expires_at).getTime()>now&&<div className="flex flex-wrap gap-2 items-end">
      <label className="text-xs flex-1 min-w-[180px]">Destinatário (opcional)
       <input className="block border rounded-lg p-2 w-full text-sm" maxLength={120} placeholder="Nome para controle interno"
        value={recipient[r.id]||''} onChange={e=>setRecipient(old=>({...old,[r.id]:e.target.value}))}/>
      </label>
      <button type="button" onClick={()=>void markSent(r)} disabled={sending===r.id}
       className="border rounded-lg px-3 py-2 disabled:opacity-50">Marcar como enviado</button>
     </div>}
    </div>
   </details>)}
  </div>
  {pageCount>1&&<nav aria-label="Páginas dos termos" className="flex justify-center items-center gap-3 text-sm">
   <button type="button" className="border rounded px-3 py-1 disabled:opacity-40" disabled={currentPage===1} onClick={()=>setPage(Math.max(1,currentPage-1))}>Anterior</button>
   <span>Página {currentPage} de {pageCount}</span>
   <button type="button" className="border rounded px-3 py-1 disabled:opacity-40" disabled={currentPage>=pageCount} onClick={()=>setPage(Math.min(pageCount,currentPage+1))}>Próxima</button>
  </nav>}
  <p className="text-xs text-zinc-500">Exibidos os 300 convites mais recentes. Os dados de acompanhamento não incluem o link confidencial.</p>
 </section>;
}
