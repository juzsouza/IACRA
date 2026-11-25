/** Recesso do Raphael: 10/dez/2026 até 10/jan/2027 (inclusive).
 * Apuração apenas por aulas explicitamente vinculadas na agenda da plataforma.
 * Não altera agenda, créditos, snapshots congelados ou transações históricas.
 */
export const RAPHAEL_VACATION_START = '2026-12-10';
export const RAPHAEL_VACATION_END = '2027-01-10';
export function isRaphaelVacationCompetence(competence: string): boolean {
  return competence === '2026-12' || competence === '2027-01';
}
export function isRaphaelVacationDate(date: string): boolean {
  return Boolean(date && date >= RAPHAEL_VACATION_START && date <= RAPHAEL_VACATION_END);
}
export function calculateRaphaelVacationGross(
  contractualAmount: number, baseLessons: number, eligibleClasses: number
): number {
  const baseCents=Math.max(0,Math.round(Number(contractualAmount || 0)*100));
  const n=Math.max(0,Math.min(Math.floor(Number(eligibleClasses)||0),Math.floor(Number(baseLessons)||0)));
  const total=Math.max(0,Math.floor(Number(baseLessons)||0));
  return total>0 ? Math.round((baseCents*n)/total)/100 : 0;
}
