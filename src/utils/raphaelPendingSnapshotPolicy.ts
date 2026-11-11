import type { CompetenceBilling } from '../store';

/**
 * Um snapshot gerado automaticamente e ainda pendente pode ter sido calculado
 * pelo motor anterior (aulas de outros alunos). Recalcular apenas a prévia
 * desses snapshots; os pagos, congelados e ajustes manuais são históricos.
 */
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
    snapshot.metadata?.source === 'due_competence_materializer'
  );
}
