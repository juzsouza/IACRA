import assert from 'node:assert/strict';
import {calculateChoirMonthlyFinance as calc} from '../utils/choirMonthlyFinance';
const c=[
  {id:'a',name:'Ativa',role:'Assistente',active:true,remuneration_type:'per_rehearsal',remuneration_value:45},
  {id:'b',name:'Inativa com histórico',role:'Assistente',active:false,remuneration_type:'per_rehearsal',remuneration_value:60},
  {id:'c',name:'Inativa sem presença',role:'Assistente',active:false,remuneration_type:'per_rehearsal',remuneration_value:100},
] as any;
const mk=(id:string,date:string,attendance:any[],notes='')=>({id,date,attendance,notes,title:'Ensaio'}) as any;
const present=(id:string)=>({person_id:id,type:'collaborator',status:'present'});
const rehearsals=[
mk('1','2026-07-02',[present('a'),present('b')]),
mk('2','2026-07-16',[present('a')]),
mk('3','2026-07-30',[present('c')],'Cancelado'),
mk('4','2026-08-13',[present('a'),present('b')]),
mk('5','2026-11-19',[present('a')]),
mk('6','2026-11-12',[]),
];
const july=calc(c,rehearsals,'2026-07','2026-11-18');
assert.equal(july.validRehearsals.length,2);
assert.equal(july.totalPayoutAmount,150);
assert.equal(july.totalPresentsCount,3);
assert.equal(july.rows.find(x=>x.collaborator.id==='b')?.payout,60);
assert.equal(july.rows.some(x=>x.collaborator.id==='c'),false);
assert.equal(july.excludedRehearsals.length,1);
assert.equal(calc(c,rehearsals,'2026-08','2026-11-18').totalPayoutAmount,105);
const november=calc(c,rehearsals,'2026-11','2026-11-18');
assert.equal(november.totalPayoutAmount,0);
assert.equal(november.validRehearsals.length,0);
assert.equal(november.excludedRehearsals.length,2);
assert.equal(calc(c,[],'2026-11','2026-11-18').totalPayoutAmount,0);
assert.throws(()=>calc(c,[],'2026-13','2026-11-18'));
console.log('PASS coral: competência, presença real, inativo histórico, futuro e cancelado');
