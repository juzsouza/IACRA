/** Validação da mensalidade por matrícula no simulador isolado.
 * R$ 0,00 é válido (gratuidade/isenção); valor negativo nunca é válido.
 */
export function isValidDevMonthlyAmount(value: number): boolean {
  return Number.isFinite(value) &&
    value >= 0 &&
    value <= 100000 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
}

export function parseDevMonthlyAmount(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw);
  return isValidDevMonthlyAmount(value) ? value : null;
}
