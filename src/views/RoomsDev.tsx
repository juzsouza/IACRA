import React,{useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';
import {useAppStore} from '../store';
import {checkPermissionDevEnvironment,getPermissionDevEnvironment} from '../utils/permissionAdminConfig';

type Room={slug:string;name:string;activities:string[];note:string;raphael_only:boolean};
type Assignment={class_id:string;room_slug:string;activity:string;title:string;teacher_name:string|null;start_time:string;end_time:string;status:string};
type Overview={rooms:Room[];assignments:Assignment[]};
const fmt=(s:string)=>String(s||'').slice(0,5);

export function RoomsDev():React.ReactElement{
 const {state,currentUserProfile}=useAppStore();
 const [day,setDay]=useState(()=>new Date().toLocaleDateString('en-CA'));
 const [overview,setOverview]=useState<Overview>({rooms:[],assignments:[]});
 const [classId,setClassId]=useState('');
 const [roomSlug,setRoomSlug]=useState('');
 const [activity,setActivity]=useState('');
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const authorized=currentUserProfile?.role==='super_admin'&&currentUserProfile?.access_status==='active'
    &&checkPermissionDevEnvironment(getPermissionDevEnvironment()).ok;
 const load=async()=>{
  const {data,error}=await supabase.rpc('eavra_dev_room_overview',{p_day:day});
  if(error)throw error;
  setOverview(data as Overview);
 };
 useEffect(()=>{if(authorized)void load().catch(e=>setMessage(e.message));},[day,authorized]);
 const classes=state.classes.filter(c=>c.date===day&&c.status!=='cancelled').sort((a,b)=>a.start_time.localeCompare(b.start_time));
 const chosenClass=classes.find(c=>c.id===classId);
 const chosenRoom=overview.rooms.find(r=>r.slug===roomSlug);
 const teacher=state.teachers.find(t=>t.id===chosenClass?.teacher_id);
 const availableRooms=overview.rooms.filter(r=>!r.raphael_only||/raphael/i.test(teacher?.name||''));
 const assignmentsByClass=new Map(overview.assignments.map(a=>[a.class_id,a]));
 const overlaps=overview.assignments.filter(a=>chosenClass&&a.room_slug===roomSlug&&a.class_id!==classId&&a.status!=='cancelled'&&a.start_time<chosenClass.end_time&&a.end_time>chosenClass.start_time);
 const save=async()=>{
  if(!authorized||!chosenClass||!chosenRoom||!activity)return;
  setBusy(true);setMessage('');
  try{
   const {error}=await supabase.rpc('eavra_dev_room_assign',{p_class_id:classId,p_room_slug:roomSlug,p_activity:activity});
   if(error)throw error;
   await load();setMessage('Sala vinculada à aula no IACRA-DEV.');
  }catch(e){setMessage(e instanceof Error?e.message:'Não foi possível vincular a sala');}
  finally{setBusy(false)}
 };
 const release=async()=>{
  if(!authorized||!classId||!assignmentsByClass.has(classId)||!window.confirm('Liberar a sala desta aula no ambiente DEV?'))return;
  setBusy(true);setMessage('');
  try{const {error}=await supabase.rpc('eavra_dev_room_unassign',{p_class_id:classId});if(error)throw error;await load();setMessage('Sala liberada no DEV.');}
  catch(e){setMessage(e instanceof Error?e.message:'Falha ao liberar sala')}finally{setBusy(false)}
 };
 if(!authorized)return <p role="alert">Área exclusiva do Super Admin no IACRA-DEV.</p>;
 return <div className="max-w-6xl mx-auto p-6 space-y-5">
  <h1 className="text-2xl font-bold">Salas de atendimento — DEV</h1>
  <p className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">Ambiente de testes. Os vínculos são armazenados separadamente da agenda original. Apenas aulas já sincronizadas podem receber sala.</p>
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
   {overview.rooms.map(r=><div key={r.slug} className="bg-white rounded-xl border p-4"><h2 className="font-bold">{r.name}</h2><p className="text-sm text-zinc-600 mt-1">{r.activities.length?r.activities.join(' · '):r.note}</p></div>)}
  </div>
  <section className="bg-white border rounded-xl p-5 space-y-3">
   <h2 className="text-lg font-bold">Vincular sala à aula</h2>
   <label className="block text-sm">Data<input className="block border p-2 rounded-lg" type="date" value={day} onChange={e=>{setDay(e.target.value);setClassId('');setRoomSlug('');setActivity('')}}/></label>
   <label className="block text-sm">Aula<select className="block w-full border p-2 rounded-lg" value={classId} onChange={e=>{const id=e.target.value;setClassId(id);const a=assignmentsByClass.get(id);setRoomSlug(a?.room_slug||'');setActivity(a?.activity||'')}}><option value="">Selecione a aula</option>{classes.map(c=><option key={c.id} value={c.id}>{fmt(c.start_time)}–{fmt(c.end_time)} · {c.title} · {state.teachers.find(t=>t.id===c.teacher_id)?.name||'Professor'}</option>)}</select></label>
   <label className="block text-sm">Sala<select disabled={!classId} className="block w-full border p-2 rounded-lg disabled:bg-zinc-100" value={roomSlug} onChange={e=>{setRoomSlug(e.target.value);setActivity('')}}><option value="">Selecione a sala</option>{availableRooms.map(r=><option key={r.slug} value={r.slug}>{r.name}</option>)}</select></label>
   <label className="block text-sm">Atividade{chosenRoom&&chosenRoom.activities.length?
    <select className="block w-full border p-2 rounded-lg" value={activity} onChange={e=>setActivity(e.target.value)}><option value="">Selecione a atividade</option>{chosenRoom.activities.map(a=><option key={a} value={a}>{a}</option>)}</select>:
    <input className="block w-full border p-2 rounded-lg" value={activity} onChange={e=>setActivity(e.target.value)} placeholder="Atividade da aula" disabled={!chosenRoom}/>}</label>
   {overlaps.length>0&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Sala ocupada nesse horário: {overlaps.map(a=>a.title+' ('+fmt(a.start_time)+'–'+fmt(a.end_time)+')').join(', ')}</p>}
   <div className="flex flex-wrap gap-2"><button type="button" disabled={busy||!classId||!roomSlug||!activity||overlaps.length>0} onClick={()=>void save()} className="bg-indigo-700 text-white rounded-lg px-4 py-2 disabled:opacity-40">Salvar vínculo da sala</button>
   {classId&&assignmentsByClass.has(classId)&&<button type="button" disabled={busy} onClick={()=>void release()} className="border rounded-lg px-4 py-2 disabled:opacity-40">Liberar sala</button>}</div>
   {message&&<p role="status" className="text-sm border rounded-lg p-3">{message}</p>}
  </section>
  <section className="bg-white border rounded-xl p-5"><h2 className="text-lg font-bold mb-3">Ocupação das salas em {day.split('-').reverse().join('/')}</h2>
   {overview.assignments.length===0?<p className="text-sm text-zinc-600">Nenhuma sala vinculada nessa data.</p>:<div className="space-y-2">{overview.assignments.map(a=><div key={a.class_id} className="border rounded-lg p-3 text-sm"><strong>{overview.rooms.find(r=>r.slug===a.room_slug)?.name||a.room_slug}</strong> · {fmt(a.start_time)}–{fmt(a.end_time)} · {a.activity}<p className="text-zinc-600">{a.title} · {a.teacher_name||'Professor'}</p></div>)}</div>}
  </section>
 </div>
}
