/**
 * Proteções da baixa individual por competência.
 * Não registra transações: somente decide o que pode ser selecionado no formulário.
 */
export type CompletedIncome = {
  type?: string | null;
  status?: string | null;
  description: string;
};
export type PaymentCandidate = {
  itemKey: string;
  monthStr: string;
  yearStr: string;
  isPaid: boolean;
  groupId?: string | null;
};

export function hasRecordedGroupPayment(
  transactions: CompletedIncome[],
  groupId: string | null | undefined,
  monthStr: string,
  yearStr: string,
): boolean {
  if (!groupId) return false;
  const prefix = `Mensalidade Grupo | ${groupId} | ${monthStr}/${yearStr} |`;
  return transactions.some(t =>
    t.type === 'income' &&
    t.status === 'completed' &&
    t.description.startsWith(prefix)
  );
}

export function getInitialPaymentSelection(
  items: PaymentCandidate[],
  selectedMonth: number,
  selectedYear: number,
  transactions: CompletedIncome[],
): Record<string, boolean> {
  const currentMonth = String(selectedMonth).padStart(2, '0');
  const currentYear = String(selectedYear);
  const firstEligible = items.find(item =>
    !item.isPaid &&
    item.monthStr === currentMonth &&
    item.yearStr === currentYear &&
    !hasRecordedGroupPayment(transactions, item.groupId, item.monthStr, item.yearStr)
  );
  return firstEligible ? { [firstEligible.itemKey]: true } : {};
}

export function pickSinglePaymentCompetence(itemKey: string, checked: boolean): Record<string, boolean> {
  return checked ? { [itemKey]: true } : {};
}
