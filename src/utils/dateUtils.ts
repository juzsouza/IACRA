export interface EnrollmentLike {
  id?: string;
  start_date?: string | null;
  enrollment_date?: string | null;
  end_date?: string | null;
  status?: string | null;
}

/**
 * Formats a local Date object into a YYYY-MM-DD string without UTC timezone shift.
 */
export const formatLocalDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Checks if an enrollment is active for a given reference month and year.
 * For example, if start_date is in August 2026 (01/08/2026),
 * it is NOT active for July 2026, but IS active for August 2026 onwards.
 * If end_date is provided and target month is after end_date, returns false.
 */
export const isEnrollmentActiveForMonth = (
  enrollment: EnrollmentLike,
  targetMonth: number, // 1 - 12
  targetYear: number   // e.g. 2026
): boolean => {
  const dateStr = enrollment.start_date || enrollment.enrollment_date;
  if (dateStr) {
    const parts = dateStr.split('-');
    if (parts.length >= 2) {
      const startYear = parseInt(parts[0], 10);
      const startMonth = parseInt(parts[1], 10);
      if (!isNaN(startYear) && !isNaN(startMonth)) {
        if (targetYear < startYear) return false;
        if (targetYear === startYear && targetMonth < startMonth) return false;
      }
    }
  }

  if (enrollment.end_date) {
    const endParts = enrollment.end_date.split('-');
    if (endParts.length >= 2) {
      const endYear = parseInt(endParts[0], 10);
      const endMonth = parseInt(endParts[1], 10);
      if (!isNaN(endYear) && !isNaN(endMonth)) {
        if (targetYear > endYear) return false;
        if (targetYear === endYear && targetMonth > endMonth) return false;
      }
    }
  }

  if (!enrollment.status || enrollment.status === 'active') {
    return true;
  }

  return false;
};

export interface FinancialRelevanceContext {
  competenceBillings?: Array<{
    category?: string;
    enrollment_id?: string;
    choir_registration_id?: string;
    group_id?: string;
    competence?: string;
    status?: string;
    is_frozen?: boolean;
  }>;
  transactions?: Array<{
    type?: string;
    status?: string;
    description?: string;
    date?: string;
    amount?: number;
  }>;
}

/**
 * Verifica se uma matrícula é financeiramente relevante para um determinado mês de competência.
 *
 * REGRA:
 * - Se ativa: relevante a partir de start_date (e até end_date se informado).
 * - Se inativa:
 *   1. Relevante se end_date cobre a competência.
 *   2. Relevante se existir snapshot/competence_billing para a competência.
 *   3. Relevante se existir transação histórica registrada para a competência.
 *   4. Não relevante para competências futuras/posteriores ao encerramento que não possuam vínculo financeiro.
 */
export const isEnrollmentFinanciallyRelevantForMonth = (
  enrollment: EnrollmentLike,
  targetMonth: number,
  targetYear: number,
  context?: FinancialRelevanceContext
): boolean => {
  const dateStr = enrollment.start_date || enrollment.enrollment_date;
  if (dateStr) {
    const parts = dateStr.split('-');
    if (parts.length >= 2) {
      const startYear = parseInt(parts[0], 10);
      const startMonth = parseInt(parts[1], 10);
      if (!isNaN(startYear) && !isNaN(startMonth)) {
        if (targetYear < startYear) return false;
        if (targetYear === startYear && targetMonth < startMonth) return false;
      }
    }
  }

  const targetComp = `${targetYear}-${targetMonth.toString().padStart(2, '0')}`;

  // Se ativa:
  if (!enrollment.status || enrollment.status === 'active') {
    if (enrollment.end_date) {
      const endParts = enrollment.end_date.split('-');
      if (endParts.length >= 2) {
        const endYear = parseInt(endParts[0], 10);
        const endMonth = parseInt(endParts[1], 10);
        if (!isNaN(endYear) && !isNaN(endMonth)) {
          if (targetYear > endYear) return false;
          if (targetYear === endYear && targetMonth > endMonth) return false;
        }
      }
    }
    return true;
  }

  // Se inativa:
  // 1. Se tem end_date explícito e a competência está dentro do período devido
  if (enrollment.end_date) {
    const endParts = enrollment.end_date.split('-');
    if (endParts.length >= 2) {
      const endYear = parseInt(endParts[0], 10);
      const endMonth = parseInt(endParts[1], 10);
      if (!isNaN(endYear) && !isNaN(endMonth)) {
        if (targetYear < endYear || (targetYear === endYear && targetMonth <= endMonth)) {
          return true;
        }
      }
    }
  }

  // 2. Se existe competence_billing/snapshot para esta competência
  if (enrollment.id && context?.competenceBillings) {
    const hasBilling = context.competenceBillings.some(
      (b) => b.category === 'individual' && b.enrollment_id === enrollment.id && b.competence === targetComp
    );
    if (hasBilling) return true;
  }

  // 3. Se existe transação histórica para esta competência
  if (enrollment.id && context?.transactions) {
    const slashRef = `${targetMonth.toString().padStart(2, '0')}/${targetYear}`;
    const pattern = `Mensalidade | ${enrollment.id} | ${slashRef}`;
    const hasTx = context.transactions.some(
      (t) => t.type === 'income' && t.status === 'completed' && t.description?.includes(pattern)
    );
    if (hasTx) return true;
  }

  return false;
};

/**
 * Verifica se uma entidade inativa (matrícula, coral ou grupo) possui qualquer histórico financeiro
 * (cobranças, snapshots ou transações passadas).
 */
export const hasAnyHistoricalFinancialData = (
  entityId: string,
  category: 'individual' | 'group' | 'choir',
  context?: FinancialRelevanceContext
): boolean => {
  if (!entityId || !context) return false;

  if (context.competenceBillings) {
    const hasBilling = context.competenceBillings.some((b) => {
      if (category === 'individual') return b.category === 'individual' && b.enrollment_id === entityId;
      if (category === 'group') return b.category === 'group' && b.group_id === entityId;
      if (category === 'choir') return b.category === 'choir' && b.choir_registration_id === entityId;
      return false;
    });
    if (hasBilling) return true;
  }

  if (context.transactions) {
    const hasTx = context.transactions.some((t) => {
      if (!t.description) return false;
      if (category === 'individual') return t.description.includes(`Mensalidade | ${entityId} |`);
      if (category === 'group') return t.description.includes(`Mensalidade Grupo | ${entityId} |`);
      if (category === 'choir') return t.description.includes(entityId);
      return false;
    });
    if (hasTx) return true;
  }

  return false;
};

/**
 * Checks if an enrollment is active for a given class/agenda date (YYYY-MM-DD).
 * For example, if start_date is in August 2026 (2026-08-01),
 * a class in July 2026 (2026-07-22) is BEFORE the start month -> false.
 * A class in August 2026 (2026-08-05) is in or after the start month -> true.
 */
export const isEnrollmentActiveOnDate = (
  enrollment: EnrollmentLike,
  targetDateStr: string // "YYYY-MM-DD"
): boolean => {
  if (enrollment.status && enrollment.status !== 'active') return false;
  const dateStr = enrollment.start_date || enrollment.enrollment_date;
  if (!dateStr || !targetDateStr) return true;

  const tParts = targetDateStr.split('-');
  const sParts = dateStr.split('-');
  if (tParts.length < 2 || sParts.length < 2) return true;

  const tYear = parseInt(tParts[0], 10);
  const tMonth = parseInt(tParts[1], 10);
  const sYear = parseInt(sParts[0], 10);
  const sMonth = parseInt(sParts[1], 10);

  if (isNaN(tYear) || isNaN(tMonth) || isNaN(sYear) || isNaN(sMonth)) return true;

  if (tYear > sYear) return true;
  if (tYear < sYear) return false;
  return tMonth >= sMonth;
};

export interface MonthRef {
  month: number;
  year: number;
  monthStr: string;
  yearStr: string;
  isCurrent: boolean;
  refLabel: string;
}

/**
 * Returns an array of months from the enrollment start date up to targetMonth/targetYear.
 * Used to collect current and past pending months for billing.
 * If endDateStr is provided, does not generate months after endDateStr.
 */
export const getMonthsToBill = (
  startDateStr: string | undefined | null,
  targetMonth: number,
  targetYear: number,
  endDateStr?: string | null
): MonthRef[] => {
  const result: MonthRef[] = [];

  let startYear = targetYear;
  let startMonth = targetMonth;

  if (startDateStr) {
    const parts = startDateStr.split('-');
    if (parts.length >= 2) {
      const sy = parseInt(parts[0], 10);
      const sm = parseInt(parts[1], 10);
      if (!isNaN(sy) && !isNaN(sm)) {
        startYear = sy;
        startMonth = sm;
      }
    }
  }

  let endYear: number | null = null;
  let endMonth: number | null = null;
  if (endDateStr) {
    const eParts = endDateStr.split('-');
    if (eParts.length >= 2) {
      const ey = parseInt(eParts[0], 10);
      const em = parseInt(eParts[1], 10);
      if (!isNaN(ey) && !isNaN(em)) {
        endYear = ey;
        endMonth = em;
      }
    }
  }

  // If start date is in the future relative to target month/year, no months to bill yet
  if (startYear > targetYear || (startYear === targetYear && startMonth > targetMonth)) {
    return [];
  }

  let currY = startYear;
  let currM = startMonth;

  const monthDiff = (targetYear - startYear) * 12 + (targetMonth - startMonth);
  if (monthDiff > 12) {
    const startDate = new Date(targetYear, targetMonth - 1 - 12, 1);
    currY = startDate.getFullYear();
    currM = startDate.getMonth() + 1;
  }

  while (currY < targetYear || (currY === targetYear && currM <= targetMonth)) {
    // Stop if past the end date
    if (endYear !== null && endMonth !== null) {
      if (currY > endYear || (currY === endYear && currM > endMonth)) {
        break;
      }
    }

    const monthStr = currM.toString().padStart(2, '0');
    const isCurrent = (currY === targetYear && currM === targetMonth);
    const monthName = new Date(currY, currM - 1, 1).toLocaleString('pt-BR', { month: 'long' });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    result.push({
      month: currM,
      year: currY,
      monthStr,
      yearStr: currY.toString(),
      isCurrent,
      refLabel: `${capitalizedMonth}/${currY}`
    });

    currM++;
    if (currM > 12) {
      currM = 1;
      currY++;
    }
  }

  return result;
};
