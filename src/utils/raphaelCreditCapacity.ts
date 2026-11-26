/** Verifica se a aula cancelada pelo Raphael reduziu a carga mensal CONTRATADA.
 * Quinzenal = 2 aulas; semanal = 4. A terceira aula cancelada não gera
 * crédito se duas aulas regulares já foram realizadas/agendadas.
 * Função pura: não altera aulas, créditos nem pagamentos.
 */
export type ClassForCreditCapacity={
 id:string;date:string;status:string;cancelled_by_teacher?:boolean;
 title?:string;report?:string;
};
const makeup=(c:ClassForCreditCapacity)=>{
 const t=`${c.title||''} ${c.report||''}`.toLowerCase();
 return t.includes('reposição')||t.includes('reposicao');
};
export function getEligibleTeacherCancelledClasses<T extends ClassForCreditCapacity>(
 classes:readonly T[],baseLessons:number
):Set<string>{
 const quota=Math.max(0,Math.floor(baseLessons||0));
 const normal=classes.filter(c=>(c.status==='completed'||c.status==='scheduled')&&!makeup(c)).length;
 const remaining=Math.max(0,quota-normal);
 return new Set(classes.filter(c=>c.status==='cancelled'&&c.cancelled_by_teacher===true)
  .sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))
  .slice(0,remaining).map(c=>c.id));
}
