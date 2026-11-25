/** Cobrança excepcional do Coral na competência dezembro/2026.
 * O ensaio foi antecipado: cobrar um ensaio independe da data do evento.
 * Outros meses usam a mensalidade integral; remuneração dos músicos é separada.
 */
export const CHOIR_SINGLE_REHEARSAL_DECEMBER = '2026-12';
export function isChoirDecemberSingleRehearsal(competence: string): boolean {
  return competence === CHOIR_SINGLE_REHEARSAL_DECEMBER;
}
export function getChoirCompetenceCharge(monthlyFee: number, competence: string) {
  const raw=Number(monthlyFee || 0);
  const cents=Number.isFinite(raw)?Math.max(0,Math.round(raw*100)):0;
  const oneRehearsal=isChoirDecemberSingleRehearsal(competence);
  const dueCents=oneRehearsal ? Math.round(cents/2) : cents;
  return {
    basePrice:cents/100,
    discount:(cents-dueCents)/100,
    finalPrice:dueCents/100,
    singleRehearsalDecember:oneRehearsal,
    explanation:oneRehearsal ? 'Coral — dezembro/2026: 1 ensaio (antecipado)' : null,
  };
}
