import type { CompetenceBilling } from '../store';

/**
 * Um snapshot gerado automaticamente e ainda pendente pode ter sido calculado
 * pelo motor anterior (aulas de outros alunos). Recalcular apenas a prévia
 * desses snapshots; os pagos, congelados e ajustes manuais são históricos.
 */
/** Conciliação da secretaria: valor fixado em competência pendente, sem
 * consumo automático de créditos. Nunca modifica pagamentos históricos.
 */
export function isManualPendingFixedBilling(
 snapshot: Pick<CompetenceBilling,'status'|'is_frozen'|'transaction_id'|'metadata'|'final_price'> | null | undefined
):boolean{
 const fix=snapshot?.metadata?.manual_billing_override;
 return Boolean(snapshot && snapshot.status==='pending' && !snapshot.is_frozen &&
  !snapshot.transaction_id && fix?.mode==='fixed_amount_no_credits' &&
  Number.isFinite(Number(snapshot.final_price)) && Number(snapshot.final_price)>=0 &&
  Number(fix.final_amount)===Number(snapshot.final_price));
}
export function shouldRecalculatePendingRaphaelSnapshot(
  snapshot: Pick<CompetenceBilling, 'status' | 'is_frozen' | 'transaction_id' | 'metadata'> | null | undefined,
  isPaid: boolean
): boolean {
  return Boolean(
    snapshot &&
    !isPaid &&
    snapshot.status === 'pending' &&
    !snapshot.is_frozen &&
    !snapshot.transaction_id &&
    snapshot.metadata?.source === 'due_competence_materializer' &&
    !isManualPendingFixedBilling(snapshot)
  );
}
