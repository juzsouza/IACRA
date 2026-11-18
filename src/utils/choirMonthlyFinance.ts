import type {ChoirCollaborator, ChoirRehearsal, ChoirAttendanceRecord} from '../store';

export type ChoirPayoutRow = {
  collaborator: ChoirCollaborator;
  presentCount: number;
  rate: number;
  payout: number;
  attendancePerDate: Record<string, {status: 'present' | 'absent'; isPresent: boolean}>;
};
export type ChoirMonthSummary = {
  competence: string;
  validRehearsals: ChoirRehearsal[];
  excludedRehearsals: Array<{date: string; title: string; reason: string}>;
  rows: ChoirPayoutRow[];
  totalPresentsCount: number;
  totalPayoutAmount: number;
  eligibleCount: number;
};
export function nowInSaoPaulo(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const get=(type:string)=>parts.find(x=>x.type===type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
function attendanceOf(rehearsal: ChoirRehearsal): ChoirAttendanceRecord[] {
  try {
    const data = typeof rehearsal.attendance === 'string'
      ? JSON.parse(rehearsal.attendance) : rehearsal.attendance;
    return Array.isArray(data) ? data.filter((r:any)=>r && r.person_id && r.type && r.status) : [];
  } catch {
    return [];
  }
}
function isCancelled(rehearsal: ChoirRehearsal): boolean {
  const explicitStatus = String((rehearsal as any).status || '').toLowerCase();
  return explicitStatus === 'cancelled' || /\bcancelad[oa]\b/i.test(
    `${rehearsal.title || ''} ${rehearsal.notes || ''}`
  );
}
/** Uma pessoa recebe apenas por presença comprovada, na competência do ensaio.
 *  Não soma ensaios futuros ou sem chamada, não cria/desfaz pagamentos.
 *  Histórico de inativos com presença permanece elegível.
 */
export function calculateChoirMonthlyFinance(
  collaborators: ChoirCollaborator[],
  rehearsals: ChoirRehearsal[],
  competence: string,
  today = nowInSaoPaulo()
): ChoirMonthSummary {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competence))
    throw new Error('Competência inválida: use AAAA-MM');
  const monthRehearsals = (rehearsals || [])
    .filter(r=>r.date?.startsWith(competence))
    .sort((a,b)=>a.date.localeCompare(b.date));
  const validRehearsals: ChoirRehearsal[] = [];
  const excludedRehearsals: ChoirMonthSummary['excludedRehearsals'] = [];
  const seenRehearsals = new Set<string>();
  for (const r of monthRehearsals) {
    const reason = r.date > today ? 'Ensaio futuro, não realizado'
      : isCancelled(r) ? 'Ensaio cancelado'
      : attendanceOf(r).length===0 ? 'Chamada de presença ainda não registrada'
      : seenRehearsals.has(r.id) ? 'Identificador de ensaio duplicado' : '';
    if (reason) excludedRehearsals.push({date:r.date,title:r.title || 'Ensaio',reason});
    else {validRehearsals.push(r);seenRehearsals.add(r.id);}
  }
  const rows=(collaborators || []).map(collaborator=>{
    const attendancePerDate: ChoirPayoutRow['attendancePerDate'] = {};
    let presentCount=0;
    for (const rehearsal of validRehearsals) {
      const records=attendanceOf(rehearsal);
      const isPresent=records.some(a=>a.person_id===collaborator.id && a.type==='collaborator' && a.status==='present');
      const hadRecord=records.some(a=>a.person_id===collaborator.id && a.type==='collaborator');
      attendancePerDate[rehearsal.date] = {status: isPresent ? 'present' : 'absent',isPresent};
      if(isPresent) presentCount++;
    }
    const rate=Number(collaborator.remuneration_value || 0);
    return {collaborator,presentCount,rate,payout:Math.round(presentCount*rate*100)/100,attendancePerDate};
  }).filter(row=>row.presentCount>0||row.collaborator.active!==false)
    .sort((a,b)=>a.collaborator.name.localeCompare(b.collaborator.name));
  return {
    competence, validRehearsals,excludedRehearsals,rows,
    totalPresentsCount:rows.reduce((s,r)=>s+r.presentCount,0),
    totalPayoutAmount:Math.round(rows.reduce((s,r)=>s+r.payout,0)*100)/100,
    eligibleCount:rows.length
  };
}
