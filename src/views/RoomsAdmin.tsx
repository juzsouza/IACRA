import React,{useEffect,useState} from 'react';
import { DoorOpen, CalendarDays, Clock3, CheckCircle2, AlertCircle, RefreshCw, ShieldCheck, Save, Trash2, Music2, UserRound } from 'lucide-react';
import {supabase} from '../lib/supabase';
import {useAppStore} from '../store';
import {iacraFeaturesEnabled} from '../lib/iacraFeatureGate';
import {useIacraFeaturePermissions} from '../hooks/useIacraFeaturePermissions';
import {automaticRoomActivity,filteredRoomClasses,filteredRoomReservations} from '../utils/roomAdjustments';

type Room={slug:string;name:string;activities:string[];note:string;raphael_only:boolean};
type Assignment={class_id:string;room_slug:string;activity:string;title:string;teacher_name:string|null;start_time:string;end_time:string;status:string};
type Overview={rooms:Room[];assignments:Assignment[]};
const fmt=(s:string)=>String(s||'').slice(0,5);

export function RoomsAdmin():React.ReactElement{
 const {state,currentUserProfile}=useAppStore();
 const permissions=useIacraFeaturePermissions(currentUserProfile);
 const [day,setDay]=useState(()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}));
 const [overview,setOverview]=useState<Overview>({rooms:[],assignments:[]});
 const [classId,setClassId]=useState('');
 const [roomSlug,setRoomSlug]=useState('');
 const [teacherFilter,setTeacherFilter]=useState('');
 const [roomFilter,setRoomFilter]=useState('');
 const [activity,setActivity]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const authorized=currentUserProfile?.access_status==='active' && permissions.rooms.view && iacraFeaturesEnabled();
 const load=async()=>{
  const {data,error}=await supabase.rpc('eavra_dev_room_overview',{p_day:day});
  if(error)throw error;
  setOverview(data as Overview);
 };
 useEffect(()=>{if(authorized)void load().catch(e=>setMessage(e.message));},[day,authorized]);
 const classes=state.classes.filter(c=>c.date===day&&c.status!=='cancelled').sort((a,b)=>a.start_time.localeCompare(b.start_time));
 const filteredClasses=filteredRoomClasses(classes,teacherFilter) as typeof classes;
 const classStudentNames=(studentIds:string[])=>studentIds.map(id=>state.students.find(student=>student.id===id)?.name).filter((name):name is string=>!!name);
 const duplicateTimeClasses=classes.filter(c=>c.teacher_id===classes.find(x=>x.id===classId)?.teacher_id && c.id!==classId && c.start_time===classes.find(x=>x.id===classId)?.start_time && c.end_time===classes.find(x=>x.id===classId)?.end_time);
 const classTeachers=new Map<string,string>(classes.map(c=>[c.id,c.teacher_id] as [string,string]));
 const shownReservations=filteredRoomReservations(overview.assignments,teacherFilter,roomFilter,classTeachers) as Assignment[];
 const chosenClass=classes.find(c=>c.id===classId);
 const chosenRoom=overview.rooms.find(r=>r.slug===roomSlug);
 const teacher=state.teachers.find(t=>t.id===chosenClass?.teacher_id);
 const availableRooms=overview.rooms.filter(r=>!r.raphael_only||/raphael/i.test(teacher?.name||''));
 const assignmentsByClass=new Map<string,Assignment>(overview.assignments.map(a=>[a.class_id,a] as [string,Assignment]));
 const activeReservations=overview.assignments.filter(a=>a.status!=='cancelled');
 const listedReservations=shownReservations.filter(a=>a.status!=='cancelled');
 const effectiveActivity=automaticRoomActivity(!!chosenRoom?.raphael_only,chosenClass?.title,activity);
 const reservedRoomsCount=new Set(activeReservations.map(a=>a.room_slug)).size;
 const overlaps=overview.assignments.filter(a=>chosenClass&&a.room_slug===roomSlug&&a.class_id!==classId&&a.status!=='cancelled'&&a.start_time<chosenClass.end_time&&a.end_time>chosenClass.start_time);
 const save=async()=>{
  if(!authorized||!permissions.rooms.assign||!chosenClass||!chosenRoom||!effectiveActivity)return;
  setBusy(true);setMessage('');
  try{
   const {error}=await supabase.rpc('eavra_dev_room_assign',{p_class_id:classId,p_room_slug:roomSlug,p_activity:effectiveActivity});
   if(error)throw error;
   await load();setMessage('Sala vinculada à aula.');
  }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível vincular a sala');}
  finally{setBusy(false)}
 };
 const release=async(targetClassId:string)=>{
  const assignment=assignmentsByClass.get(targetClassId);
  if(!authorized||!permissions.rooms.unassign||!assignment||assignment.status==='cancelled')return;
  const roomName=overview.rooms.find(r=>r.slug===assignment.room_slug)?.name||assignment.room_slug;
  if(!window.confirm('Excluir somente a reserva de '+roomName+' para '+assignment.title+' ('+fmt(assignment.start_time)+'–'+fmt(assignment.end_time)+')? A aula e os pagamentos serão preservados.'))return;
  setBusy(true);setMessage('');
  try{
   const {error}=await supabase.rpc('eavra_dev_room_unassign',{p_class_id:targetClassId});
   if(error)throw error;
   if(classId===targetClassId){setRoomSlug('');setActivity('');}
   await load();setMessage('Reserva da sala excluída. A aula permanece na agenda.');
  }
  catch(e){setMessage(e instanceof Error?e.message:'Falha ao excluir a reserva')}
  finally{setBusy(false)}
 };

 if(!authorized)return <div className="bg-white border border-zinc-200 rounded-2xl p-6 text-sm text-rose-700" role="alert">Acesso a Salas não autorizado.</div>;
 return <div className="space-y-6">
  <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
   <div>
    <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Salas de atendimento</h1>
    <p className="text-sm text-zinc-500 mt-1">Organize os ambientes e acompanhe a ocupação das aulas.</p>
    {!permissions.rooms.assign && <p className="text-xs text-amber-800 mt-1">Somente consulta: vincular salas não foi autorizado para seu perfil.</p>}
   </div>
   <button type="button" disabled={busy} onClick={()=>void load()} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-indigo-700 bg-white border border-indigo-200 rounded-xl shadow-sm hover:bg-indigo-50 transition-colors disabled:opacity-40">
    <RefreshCw className="w-4 h-4"/> Atualizar salas
   </button>
  </header>

  <div className="flex items-start gap-2.5 px-4 py-3.5 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl">
   <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5"/>
   <p>Os vínculos de sala são registrados separadamente da agenda. Apenas aulas já sincronizadas podem receber sala.</p>
  </div>

  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
   <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm px-4 py-4 flex items-center gap-3">
    <div className="h-11 w-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><DoorOpen className="w-5 h-5"/></div>
    <div><p className="text-xs text-zinc-500 font-medium">Salas cadastradas</p><p className="text-2xl font-bold text-zinc-900">{overview.rooms.length}</p></div>
   </div>
   <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm px-4 py-4 flex items-center gap-3">
    <div className="h-11 w-11 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0"><CalendarDays className="w-5 h-5"/></div>
    <div><p className="text-xs text-zinc-500 font-medium">Aulas na data</p><p className="text-2xl font-bold text-zinc-900">{classes.length}</p></div>
   </div>
   <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm px-4 py-4 flex items-center gap-3">
    <div className="h-11 w-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0"><CheckCircle2 className="w-5 h-5"/></div>
    <div><p className="text-xs text-zinc-500 font-medium">Salas com reservas</p><p className="text-2xl font-bold text-zinc-900">{reservedRoomsCount}</p></div>
   </div>
  </div>

  <section className="space-y-3">
   <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-2">
    <div>
     <h2 className="text-lg font-semibold text-zinc-900">Ambientes disponíveis</h2>
     <p className="text-sm text-zinc-500 mt-1">Conheça as salas e as atividades disponíveis em cada uma.</p>
    </div>
    <p className="text-xs text-zinc-500">Reservas para {day.split('-').reverse().join('/')}</p>
   </div>
   <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
    {overview.rooms.map(room=>{
     const count=activeReservations.filter(a=>a.room_slug===room.slug).length;
     return <article key={room.slug} className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-5 hover:border-indigo-200 hover:shadow-md transition-all">
      <div className="flex items-start gap-3">
       <div className="h-11 w-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><DoorOpen className="w-5 h-5"/></div>
       <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-zinc-900">{room.name}</h3>
        <span className={count?'inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100':'inline-flex items-center gap-1.5 mt-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100'}>
         <span className={count?'w-1.5 h-1.5 bg-indigo-500 rounded-full':'w-1.5 h-1.5 bg-emerald-500 rounded-full'}/>
         {count?count+' reserva(s) no dia':'Sem reservas no dia'}
        </span>
       </div>
      </div>
      <div className="mt-4 pt-3 border-t border-zinc-100 min-h-12 flex flex-wrap items-start gap-1.5">
       {room.activities.length?room.activities.map(a=><span key={a} className="px-2.5 py-1 text-xs font-medium text-zinc-600 bg-zinc-100 rounded-lg">{a}</span>):<span className="text-xs text-zinc-500">{room.note||'Atividade definida pelo professor'}</span>}
      </div>
     </article>
    })}
   </div>
  </section>

  <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
   <div className="px-5 sm:px-6 py-5 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
    <div className="flex items-center gap-3">
     <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><CalendarDays className="w-5 h-5"/></div>
     <div><h2 className="text-lg font-semibold text-zinc-900">Vincular sala à aula</h2><p className="text-xs text-zinc-500 mt-0.5">Escolha a data, a aula e o ambiente adequado.</p></div>
    </div>
    <span className="self-start sm:self-auto inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-600 bg-zinc-100 rounded-full"><ShieldCheck className="w-3.5 h-3.5"/> Super Admin</span>
   </div>
   <div className="p-5 sm:p-6 space-y-5">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
     <div>
      <label htmlFor="room-date" className="block text-sm font-medium text-zinc-700 mb-1.5">Data da aula</label>
      <input id="room-date" type="date" value={day} onChange={e=>{setDay(e.target.value);setClassId('');setRoomSlug('');setActivity('');setMessage('')}} className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-colors"/>
     </div>
     <div>
      <label htmlFor="room-filter-teacher" className="block text-sm font-medium text-zinc-700 mb-1.5">Filtrar por professor</label>
      <select id="room-filter-teacher" value={teacherFilter} onChange={e=>{setTeacherFilter(e.target.value);setClassId('');setRoomSlug('');setActivity('')}} className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl">
       <option value="">Todos os professores</option>
       {state.teachers.filter(t=>classes.some(c=>c.teacher_id===t.id)).sort((a,b)=>a.name.localeCompare(b.name)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
     </div>
     <div>
      <label htmlFor="room-filter-room" className="block text-sm font-medium text-zinc-700 mb-1.5">Filtrar por sala</label>
      <select id="room-filter-room" value={roomFilter} onChange={e=>{setRoomFilter(e.target.value);setRoomSlug(e.target.value);setActivity('')}} className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl">
       <option value="">Todas as salas</option>
       {overview.rooms.map(r=><option key={r.slug} value={r.slug}>{r.name}</option>)}
      </select>
     </div>
     <div>
      <label htmlFor="room-class" className="block text-sm font-medium text-zinc-700 mb-1.5">Aula</label>
      <select id="room-class" value={classId} onChange={e=>{const id=e.target.value;setClassId(id);const a=assignmentsByClass.get(id);setRoomSlug(a?.room_slug||'');setActivity(a?.activity||'');setMessage('')}} className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-colors">
       <option value="">Selecione uma aula</option>
       {filteredClasses.map(c=><option key={c.id} value={c.id}>{fmt(c.start_time)}–{fmt(c.end_time)} · {c.title} · {classStudentNames(c.student_ids).join(', ')||'Sem aluno vinculado'} · {state.teachers.find(t=>t.id===c.teacher_id)?.name||'Professor'}</option>)}
      </select>
      {filteredClasses.length===0&&<p className="text-xs text-zinc-500 mt-1.5">Nenhuma aula encontrada para esse professor na data.</p>}
     </div>
     <div>
      <label htmlFor="room-select" className="block text-sm font-medium text-zinc-700 mb-1.5">Sala</label>
      <select id="room-select" disabled={!classId} value={roomSlug} onChange={e=>{setRoomSlug(e.target.value);setActivity('');setMessage('')}} className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-60">
       <option value="">Selecione uma sala</option>
       {availableRooms.filter(r=>!roomFilter||r.slug===roomFilter).map(r=><option key={r.slug} value={r.slug}>{r.name}</option>)}
      </select>
     </div>
     <div>
      <label htmlFor="room-activity" className="block text-sm font-medium text-zinc-700 mb-1.5">Atividade</label>
      {chosenRoom?.raphael_only?
       <input id="room-activity" disabled value={effectiveActivity} aria-label="Atividade automática do Raphael" className="w-full px-3.5 py-2.5 text-sm bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-900" />:
       chosenRoom&&chosenRoom.activities.length?
       <select id="room-activity" value={activity} onChange={e=>setActivity(e.target.value)} className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-colors"><option value="">Selecione a atividade</option>{chosenRoom.activities.map(a=><option key={a} value={a}>{a}</option>)}</select>:
       <input id="room-activity" value={activity} disabled={!chosenRoom} onChange={e=>setActivity(e.target.value)} placeholder="Informe a atividade" className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-colors disabled:opacity-60"/>}
     </div>
    </div>
    {chosenClass&&<div className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-zinc-50 border border-zinc-100 rounded-xl p-3.5 text-sm">
     <span className="inline-flex items-center gap-2 text-zinc-700"><Clock3 className="w-4 h-4 text-indigo-500"/>{fmt(chosenClass.start_time)} às {fmt(chosenClass.end_time)}</span>
     <span className="inline-flex items-center gap-2 text-zinc-700"><UserRound className="w-4 h-4 text-indigo-500"/>{teacher?.name||'Professor não identificado'}</span>
     {assignmentsByClass.has(classId)&&<span className="inline-flex items-center gap-1.5 text-indigo-700 font-medium"><CheckCircle2 className="w-4 h-4"/>Sala já vinculada</span>}
    </div>}
    {chosenClass&&duplicateTimeClasses.length>0&&<div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900"><strong>Horário duplicado na agenda:</strong> existem {duplicateTimeClasses.length+1} aulas diferentes do mesmo professor neste horário. A aula selecionada é de {classStudentNames(chosenClass.student_ids).join(', ')||'aluno não identificado'}. Confira a agenda antes de vincular a sala; nenhum registro será excluído automaticamente.</div>}
    {overlaps.length>0&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 flex items-start gap-2 text-sm text-rose-800"><AlertCircle className="w-5 h-5 shrink-0"/><p><strong>Conflito de horário.</strong> Sala reservada: {overlaps.map(a=>a.title+' ('+fmt(a.start_time)+'–'+fmt(a.end_time)+')').join(', ')}.</p></div>}
    {message&&<div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 flex items-center gap-2 text-sm text-emerald-800"><CheckCircle2 className="w-4 h-4 shrink-0"/>{message}</div>}
    <div className="flex flex-col sm:flex-row gap-3">
     <button type="button" disabled={!permissions.rooms.assign||busy||!classId||!roomSlug||!effectiveActivity||overlaps.length>0} onClick={()=>void save()} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl shadow-sm hover:bg-indigo-700 disabled:opacity-40 transition-colors"><Save className="w-4 h-4"/>{busy?'Processando...':'Salvar vínculo da sala'}</button>
     {permissions.rooms.unassign&&classId&&assignmentsByClass.has(classId)&&<button type="button" disabled={busy} onClick={()=>void release(classId)} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-rose-700 border border-rose-200 bg-white rounded-xl hover:bg-rose-50 disabled:opacity-40 transition-colors"><Trash2 className="w-4 h-4"/>Liberar sala</button>}
    </div>
   </div>
  </section>

  <section className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
   <div className="px-5 sm:px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-100">
    <div><h2 className="text-lg font-semibold text-zinc-900">Ocupação das salas</h2><p className="text-sm text-zinc-500 mt-1">Reservas registradas em {day.split('-').reverse().join('/')}.</p></div>
    <span className="self-start sm:self-auto text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-full">{listedReservations.length} reserva(s)</span>
   </div>
   {shownReservations.length===0?
    <div className="p-10 text-center flex flex-col items-center gap-2"><div className="p-3 rounded-full bg-zinc-100 text-zinc-400"><Music2 className="w-6 h-6"/></div><p className="text-sm font-medium text-zinc-700">Nenhuma sala reservada nesta data</p><p className="text-xs text-zinc-500">Selecione uma aula acima para registrar uma reserva.</p></div>:
    <div className="overflow-x-auto"><table className="min-w-full divide-y divide-zinc-100"><thead className="bg-zinc-50 text-xs font-semibold text-zinc-500 uppercase tracking-wide"><tr><th className="px-5 py-3.5 text-left">Sala</th><th className="px-5 py-3.5 text-left">Horário</th><th className="px-5 py-3.5 text-left">Aula e atividade</th><th className="px-5 py-3.5 text-left">Professor</th><th className="px-5 py-3.5 text-left">Situação</th><th className="px-5 py-3.5 text-left">Ações</th></tr></thead><tbody className="divide-y divide-zinc-100 bg-white">{shownReservations.map(a=><tr key={a.class_id} className="hover:bg-zinc-50/80 transition-colors text-sm"><td className="px-5 py-4 whitespace-nowrap font-semibold text-zinc-900">{overview.rooms.find(r=>r.slug===a.room_slug)?.name||a.room_slug}</td><td className="px-5 py-4 whitespace-nowrap text-zinc-600">{fmt(a.start_time)}–{fmt(a.end_time)}</td><td className="px-5 py-4 min-w-48"><p className="font-medium text-zinc-800">{a.title}</p><p className="text-xs text-zinc-500 mt-0.5">{a.activity}</p></td><td className="px-5 py-4 whitespace-nowrap text-zinc-600">{a.teacher_name||'Não informado'}</td><td className="px-5 py-4"><span className={a.status==='cancelled'?'inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-100 border border-zinc-200 text-zinc-600':'inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700'}>{a.status==='cancelled'?'Aula cancelada':'Sala reservada'}</span></td><td className="px-5 py-4">{permissions.rooms.unassign&&a.status!=='cancelled'&&<button type="button" disabled={busy} onClick={()=>void release(a.class_id)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40"><Trash2 className="w-3.5 h-3.5"/>Excluir reserva</button>}</td></tr>)}</tbody></table></div>}
  </section>
 </div>;
}
