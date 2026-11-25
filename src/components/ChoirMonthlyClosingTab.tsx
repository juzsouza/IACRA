import React, {useMemo, useState} from 'react';
import type {ChoirCollaborator, ChoirRehearsal, ChoirRegistration, CompetenceBilling, Transaction} from '../store';
import {calculateChoirMonthlyFinance, nowInSaoPaulo} from '../utils/choirMonthlyFinance';
import {getChoirCompetenceCharge,isChoirDecemberSingleRehearsal} from '../utils/choirDecember2026Billing';

interface Props {
 collaborators: ChoirCollaborator[];
 rehearsals: ChoirRehearsal[];
 registrations?: ChoirRegistration[];
 billings?: CompetenceBilling[];
 transactions?: Transaction[];
 formatCurrency: (amount:number)=>string;
}
function monthLabel(month:string) {
 const [year,number] = month.split('-').map(Number);
 return new Date(year,number-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
}
/** Somente visualizacao: este componente NUNCA efetua pagamentos ou fechamentos no banco. */
export const ChoirMonthlyClosingTab:React.FC<Props>=({
 collaborators,rehearsals,registrations=[],billings=[],transactions=[],formatCurrency
})=>{
 const [selectedMonth,setSelectedMonth]=useState(nowInSaoPaulo().slice(0,7));
 const availableMonths=useMemo(()=>Array.from(new Set([
   nowInSaoPaulo().slice(0,7),
   '2026-12',
   ...rehearsals.map(r=>r.date?.slice(0,7)).filter((x):x is string=>Boolean(x&&/^\d{4}-\d{2}$/.test(x))),
   ...billings.filter(b=>b.category==='choir').map(b=>b.competence)
 ])).sort().reverse(),[rehearsals,billings]);
 const summary=useMemo(()=>calculateChoirMonthlyFinance(collaborators,rehearsals,selectedMonth),[collaborators,rehearsals,selectedMonth]);
 const snapshots=billings.filter(b=>b.category==='choir'&&b.competence===selectedMonth);
 const revenueExpected=snapshots.length
    ? snapshots.reduce((total,b)=>total+(b.is_paying?Number(b.final_price||0):0),0)
    : registrations.filter(r=>r.status==='approved').reduce((total,r)=>total+getChoirCompetenceCharge(Number(r.monthly_fee||0),selectedMonth).finalPrice,0);
 const fallbackRevenue=snapshots.length===0;
 // Data do recebimento e diferente de competencia devida: mostrar em indicadores separados.
 const realizedTransactions=transactions.filter(t=>
   t.type==='income'&&t.status==='completed'&&t.date?.startsWith(selectedMonth)&&/coral/i.test(t.description||''));
 const realizedRevenue=realizedTransactions.reduce((sum,t)=>sum+Number(t.amount||0),0);
 const projectedBalance=revenueExpected-summary.totalPayoutAmount;
 const unpaidOrUnlinked=summary.rows.filter(r=>r.payout>0&&!r.collaborator.teacher_id);
 return <div id="choir-monthly-closing-container" className="space-y-5">
  <div className="bg-white p-5 rounded-2xl border border-zinc-200 space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div>
     <h2 className="text-xl font-bold text-zinc-900">Fechamento mensal — {monthLabel(selectedMonth)}</h2>
     <p className="text-xs text-amber-700 font-semibold">Modo conferência: sem lançamentos ou pagamentos automáticos</p>
    </div>
    <label className="text-xs font-semibold text-zinc-700">Competência
     <select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)}
      className="block mt-1 px-3 py-2 border border-zinc-200 rounded-lg bg-white">
      {availableMonths.map(month=><option value={month} key={month}>{monthLabel(month)}</option>)}
     </select>
    </label>
   </div>
   <p className="text-xs text-zinc-500">Somente ensaios deste mês com chamada registrada, realizados até hoje e não cancelados. Colaboradores inativos mantêm as presenças históricas. Valores calculados ainda não são comprovantes de pagamento.</p>
   {isChoirDecemberSingleRehearsal(selectedMonth) && (
    <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-900">
      Cobrança de Dez/2026: somente 1 ensaio antecipado, equivalente a 50% da mensalidade.
      Os repasses dos colaboradores seguem as presenças reais nas datas dos ensaios.
    </p>
   )}
  </div>
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
   {[
    ['Ensaios apurados',String(summary.validRehearsals.length)],
    ['Ensaios não apurados',String(summary.excludedRehearsals.length)],
    ['Presenças',String(summary.totalPresentsCount)],
    ['Repasses devidos',formatCurrency(summary.totalPayoutAmount)],
    ['Mensalidades previstas',formatCurrency(revenueExpected)],
    ['Recebido no mês',formatCurrency(realizedRevenue)],
   ].map(([label,value])=><div key={label} className="bg-white p-4 border border-zinc-200 rounded-xl">
    <p className="text-xs text-zinc-500">{label}</p><p className="font-bold text-lg text-zinc-900 mt-1">{value}</p>
   </div>)}
  </div>
  <div className="bg-white border border-zinc-200 rounded-xl p-4 text-sm">
   <p><strong>Resultado previsto:</strong> {formatCurrency(projectedBalance)} (mensalidades previstas menos repasses apurados)</p>
   <p className="text-xs text-zinc-500 mt-1">
    {fallbackRevenue?'Sem snapshots de competência: receita estimada pelo cadastro atual, não representa o histórico confirmado.':'Receita prevista obtida dos registros da competência.'}
    {' '}O recebimento acima usa a data da transação, que pode ser diferente do mês da mensalidade.
   </p>
  </div>
  {unpaidOrUnlinked.length>0&&<div className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-900">
    <strong>Atenção: {unpaidOrUnlinked.length} colaborador(es) com repasse apurado e sem vínculo com professor.</strong>
    {' '}Esses valores não podem ser direcionados automaticamente ao fechamento de um professor. Vincule somente após confirmar o cadastro correto.
   </div>}
  <div className="bg-white border border-zinc-200 rounded-2xl overflow-x-auto">
   <table className="min-w-full divide-y divide-zinc-200 text-sm">
    <thead className="bg-zinc-50 text-left text-zinc-600">
     <tr><th className="p-3">Colaborador</th><th className="p-3">Situação atual</th><th className="p-3 text-right">Por ensaio</th>
     {summary.validRehearsals.map(r=><th key={r.id} className="p-3 text-center">{r.date.slice(8,10)}/{r.date.slice(5,7)}</th>)}
     <th className="p-3 text-center">Presenças</th><th className="p-3 text-right">Repasse devido</th></tr>
    </thead>
    <tbody className="divide-y divide-zinc-100">
    {summary.rows.map(row=><tr key={row.collaborator.id}>
      <td className="p-3 font-semibold">{row.collaborator.name}<div className="text-xs text-zinc-500 font-normal">{row.collaborator.role}</div></td>
      <td className="p-3">{row.collaborator.active===false?'Inativo':'Ativo'}</td>
      <td className="p-3 text-right">{formatCurrency(row.rate)}</td>
      {summary.validRehearsals.map(r=><td key={r.id} className="p-3 text-center">{row.attendancePerDate[r.date]?.isPresent?'Presente':'—'}</td>)}
      <td className="p-3 text-center">{row.presentCount}</td>
      <td className="p-3 text-right font-bold">{formatCurrency(row.payout)}</td>
     </tr>)}
     <tr className="bg-zinc-50 font-bold"><td colSpan={3+summary.validRehearsals.length} className="p-3">TOTAL APURADO</td>
      <td className="p-3 text-center">{summary.totalPresentsCount}</td><td className="p-3 text-right">{formatCurrency(summary.totalPayoutAmount)}</td></tr>
    </tbody>
   </table>
  </div>
  {summary.excludedRehearsals.length>0&&<div className="bg-white border border-zinc-200 rounded-xl p-4">
   <h3 className="font-semibold text-sm">Ensaios não considerados</h3>
   <ul className="mt-2 text-xs text-zinc-600 space-y-1">
    {summary.excludedRehearsals.map((r,i)=><li key={i}>{r.date.split('-').reverse().join('/')} — {r.title}: {r.reason}</li>)}
   </ul>
  </div>}
  <p className="text-xs text-amber-800">Valores de ensaios históricos usam a remuneração atualmente cadastrada. Se o valor por ensaio mudou no passado, será necessário conferir o histórico antes de pagar.</p>
 </div>;
};
