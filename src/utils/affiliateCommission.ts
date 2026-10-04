/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CommissionTierRule {
  quantity: number;
  totalCommission: number | null;
  isDefined: boolean;
  label: string;
}

export function buildCommissionRulesMap(
  dbRules?: Array<{
    tier_quantity: number;
    total_commission_amount: number | null;
    is_defined: boolean;
    description?: string;
  }>
): Record<number, CommissionTierRule> {
  if (!dbRules || dbRules.length === 0) {
    return DEFAULT_COMMISSION_RULES;
  }
  const map: Record<number, CommissionTierRule> = {};
  for (const r of dbRules) {
    map[r.tier_quantity] = {
      quantity: r.tier_quantity,
      totalCommission: r.total_commission_amount !== null ? Number(r.total_commission_amount) : null,
      isDefined: r.is_defined,
      label: r.description || `${r.tier_quantity} indicações = R$ ${r.total_commission_amount !== null ? Number(r.total_commission_amount).toFixed(2).replace('.', ',') : '0,00'} total`,
    };
  }
  return map;
}

/**
 * Tabela Oficial Configurável de Comissões por Volume Mensal
 * Faixas 1 a 10: Valores totais definidos
 * Faixas > 10: Explicitamente NÃO DEFINIDAS (decisão pendente em reunião da diretoria)
 */
export const DEFAULT_COMMISSION_RULES: Record<number, CommissionTierRule> = {
  1: { quantity: 1, totalCommission: 40.0, isDefined: true, label: "1 indicação = R$ 40,00 total" },
  2: { quantity: 2, totalCommission: 80.0, isDefined: true, label: "2 indicações = R$ 80,00 total" },
  3: { quantity: 3, totalCommission: 150.0, isDefined: true, label: "3 indicações = R$ 150,00 total" },
  4: { quantity: 4, totalCommission: 200.0, isDefined: true, label: "4 indicações = R$ 200,00 total" },
  5: { quantity: 5, totalCommission: 300.0, isDefined: true, label: "5 indicações = R$ 300,00 total" },
  6: { quantity: 6, totalCommission: 360.0, isDefined: true, label: "6 indicações = R$ 360,00 total" },
  7: { quantity: 7, totalCommission: 490.0, isDefined: true, label: "7 indicações = R$ 490,00 total" },
  8: { quantity: 8, totalCommission: 560.0, isDefined: true, label: "8 indicações = R$ 560,00 total" },
  9: { quantity: 9, totalCommission: 630.0, isDefined: true, label: "9 indicações = R$ 630,00 total" },
  10: { quantity: 10, totalCommission: 700.0, isDefined: true, label: "10 indicações = R$ 700,00 total" },
};

export interface CommissionCalculationResult {
  validCount: number;
  totalAmount: number | null;
  isDefined: boolean;
  statusMessage: string;
  tierLabel: string;
}

/**
 * Calcula a comissão total da competência com base na quantidade exata de indicações válidas.
 * Regra estrita: Para quantidades > 10, retorna isDefined = false e totalAmount = null.
 */
export function calculateAffiliateCommission(
  validCount: number,
  customRules?: Record<number, CommissionTierRule>
): CommissionCalculationResult {
  if (validCount <= 0) {
    return {
      validCount: 0,
      totalAmount: 0,
      isDefined: true,
      statusMessage: "Nenhuma indicação convertida na competência.",
      tierLabel: "0 indicações (R$ 0,00)",
    };
  }

  const rules = customRules || DEFAULT_COMMISSION_RULES;

  // Faixas 1 a 10
  if (validCount >= 1 && validCount <= 10) {
    const rule = rules[validCount];
    if (rule && rule.isDefined && rule.totalCommission !== null) {
      return {
        validCount,
        totalAmount: rule.totalCommission,
        isDefined: true,
        statusMessage: `Faixa de ${validCount} ${validCount === 1 ? 'indicação' : 'indicações'} aplicada com sucesso.`,
        tierLabel: `${validCount} ${validCount === 1 ? 'indicação' : 'indicações'} (Total: R$ ${rule.totalCommission.toFixed(2).replace('.', ',')})`,
      };
    }
  }

  // Faixas superiores a 10: REGRA AINDA NÃO DEFINIDA
  return {
    validCount,
    totalAmount: null,
    isDefined: false,
    statusMessage: "Regra de comissão acima de 10 indicações não definida. Aguardando definição da direção.",
    tierLabel: `${validCount} indicações (Regra acima de 10 pendente de definição)`,
  };
}

/**
 * Formata a competência a partir de uma data ou ano/mês
 * Formato padrão: YYYY-MM (ex: 2026-09)
 */
export function formatCompetence(year: number, month: number): string {
  const m = month.toString().padStart(2, '0');
  return `${year}-${m}`;
}

/**
 * Extrai ano e mês de uma string YYYY-MM
 */
export function parseCompetence(comp: string): { year: number; month: number } {
  if (!comp || !comp.includes('-')) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  const parts = comp.split('-');
  const year = parseInt(parts[0], 10) || new Date().getFullYear();
  const month = parseInt(parts[1], 10) || (new Date().getMonth() + 1);
  return { year, month };
}

/**
 * Retorna o nome amigável da competência (ex: "Setembro/2026")
 */
export function getCompetenceLabel(comp: string): string {
  const { year, month } = parseCompetence(comp);
  const date = new Date(year, month - 1, 1);
  const monthName = date.toLocaleString('pt-BR', { month: 'long' });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)}/${year}`;
}

/**
 * Extrai a competência (YYYY-MM) de uma string de data (YYYY-MM-DD ou ISO)
 * sem deslocamento de fuso horário UTC -> local em datas do dia 01.
 */
export function extractCompetenceFromDateStr(dateStr?: string): string {
  if (dateStr) {
    const trimmed = dateStr.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}`;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return formatCompetence(parsed.getFullYear(), parsed.getMonth() + 1);
    }
  }
  const now = new Date();
  return formatCompetence(now.getFullYear(), now.getMonth() + 1);
}

/**
 * Avalia o status em tempo real de uma indicação com base nas entidades existentes:
 * - student: se existe cadastro em alunos
 * - enrollments: se existe matrícula ativa
 * - transactions: se existe pagamento concluído vinculado especificamente à matrícula da indicação
 * 
 * Regra:
 * - Sem matrícula ativa -> 'registered' (indicação cadastrada)
 * - Matrícula ativa, mas sem pagamento concluído da matrícula vinculada -> 'enrolled_pending_payment'
 * - Matrícula ativa + 1º pagamento concluído da matrícula vinculada -> 'converted'
 */
export function evaluateReferralStatus(
  referral: {
    id: string;
    student_id?: string;
    enrollment_id?: string;
    referred_name: string;
    status: string;
    conversion_competence?: string;
  },
  students: Array<{ id: string; name: string; status: string }>,
  enrollments: Array<{ id: string; student_id: string; status: string; start_date?: string; enrollment_date?: string }>,
  transactions: Array<{ id: string; type: string; status: string; amount: number; description: string; date: string }>
): {
  status: 'registered' | 'enrolled_pending_payment' | 'converted' | 'cancelled';
  studentId?: string;
  enrollmentId?: string;
  firstTransactionId?: string;
  conversionDate?: string;
  conversionCompetence?: string;
} {
  // Se o registro foi explicitamente cancelado, respeitar cancelamento
  if (referral.status === 'cancelled') {
    return { status: 'cancelled' };
  }

  // 1. Identificar o aluno
  let matchedStudent = referral.student_id ? students.find(s => s.id === referral.student_id) : undefined;
  if (!matchedStudent && referral.referred_name) {
    const cleanRefName = referral.referred_name.trim().toLowerCase();
    matchedStudent = students.find(s => s.name.trim().toLowerCase() === cleanRefName);
  }

  if (!matchedStudent) {
    return { status: 'registered' };
  }

  // 2. Identificar matrícula ativa
  const studentEnrollments = enrollments.filter(e => e.student_id === matchedStudent!.id && e.status === 'active');
  if (studentEnrollments.length === 0) {
    return { status: 'registered', studentId: matchedStudent.id };
  }

  // Matrícula de referência: se referral.enrollment_id existir, usa exclusivamente a matrícula vinculada
  const hasExplicitEnrollmentId = Boolean(referral.enrollment_id && referral.enrollment_id.trim() !== '');
  const targetEnrollment = hasExplicitEnrollmentId
    ? studentEnrollments.find(e => e.id === referral.enrollment_id)
    : studentEnrollments[0];

  if (!targetEnrollment) {
    return { status: 'registered', studentId: matchedStudent.id };
  }

  const startDateStr = targetEnrollment.start_date || targetEnrollment.enrollment_date || new Date().toISOString().split('T')[0];
  const targetCompetence = extractCompetenceFromDateStr(startDateStr);

  // 3. Identificar pagamento confirmado vinculado especificamente à matrícula de referência
  // Não utiliza o nome do aluno como prova de pagamento para evitar falso positivo entre múltiplas matrículas
  const enrollmentDescPattern = `Mensalidade | ${targetEnrollment.id} |`;
  const matchedTx = transactions.find(t => 
    t.type === 'income' && 
    t.status === 'completed' &&
    typeof t.description === 'string' &&
    t.description.includes(enrollmentDescPattern)
  );

  if (!matchedTx) {
    return {
      status: 'enrolled_pending_payment',
      studentId: matchedStudent.id,
      enrollmentId: targetEnrollment.id,
      conversionCompetence: targetCompetence,
    };
  }

  // Se o aluno tem matrícula ativa e pagamento confirmado -> CONVERTIDO!
  // A competência da comissão deve ser o mês em que ocorreu a conversão válida / primeiro pagamento confirmado (YYYY-MM)
  let conversionComp = referral.conversion_competence;
  if (!conversionComp && matchedTx.date) {
    conversionComp = extractCompetenceFromDateStr(matchedTx.date);
  }
  if (!conversionComp) {
    conversionComp = targetCompetence;
  }

  return {
    status: 'converted',
    studentId: matchedStudent.id,
    enrollmentId: targetEnrollment.id,
    firstTransactionId: matchedTx.id,
    conversionDate: matchedTx.date || startDateStr,
    conversionCompetence: conversionComp,
  };
}

/**
 * Agrupa e filtra as indicações válidas de um ou mais afiliados em uma competência,
 * garantindo proteção contra:
 * 1. Duplicação de aluno (1 aluno convertido = 1 indicação, mesmo com 2+ matrículas)
 * 2. Dupla atribuição (mesmo aluno indicado por 2 afiliados: apenas o primeiro convertido é aceito)
 * 3. Recorrência (meses seguintes e renovações do mesmo aluno NÃO contam novamente)
 */
export function getCompetenceValidReferrals(
  targetCompetence: string,
  referrals: Array<{
    id: string;
    affiliate_id: string;
    student_id?: string;
    referred_name: string;
    status: string;
    conversion_competence?: string;
    conversion_date?: string;
    created_at?: string;
  }>
) {
  // 1. Identificar alunos já convertidos em competências anteriores a esta
  const historicallyConvertedStudentIds = new Set<string>();
  const historicallyConvertedNames = new Set<string>();

  for (const r of referrals) {
    if (r.status === 'converted' && r.conversion_competence && r.conversion_competence < targetCompetence) {
      if (r.student_id) historicallyConvertedStudentIds.add(`id:${r.student_id}`);
      if (r.referred_name) historicallyConvertedNames.add(`name:${r.referred_name.trim().toLowerCase()}`);
    }
  }

  // 2. Filtrar indicações que pertençam a esta competência e estejam convertidas
  const competenceReferrals = referrals.filter(r => 
    r.status === 'converted' && 
    r.conversion_competence === targetCompetence
  );

  // 3. Aplicar trava anti-duplicidade em memória (1 aluno = 1 conversão única)
  const convertedStudentIds = new Set<string>();
  const convertedNames = new Set<string>();
  const validList: typeof referrals = [];
  const duplicateList: typeof referrals = [];

  // Ordenar por data de conversão ou criação para garantir First-Touch
  const sorted = [...competenceReferrals].sort((a, b) => {
    const dateA = a.conversion_date || a.created_at || '';
    const dateB = b.conversion_date || b.created_at || '';
    return dateA.localeCompare(dateB);
  });

  for (const ref of sorted) {
    const studentKey = ref.student_id ? `id:${ref.student_id}` : null;
    const nameKey = ref.referred_name ? `name:${ref.referred_name.trim().toLowerCase()}` : null;

    let isDuplicate = false;
    // Checar se já foi convertido em meses anteriores
    if (studentKey && historicallyConvertedStudentIds.has(studentKey)) {
      isDuplicate = true;
    }
    if (nameKey && historicallyConvertedNames.has(nameKey)) {
      isDuplicate = true;
    }
    // Checar se já foi convertido nesta mesma competência
    if (studentKey && convertedStudentIds.has(studentKey)) {
      isDuplicate = true;
    }
    if (nameKey && convertedNames.has(nameKey)) {
      isDuplicate = true;
    }

    if (isDuplicate) {
      duplicateList.push(ref);
    } else {
      if (studentKey) convertedStudentIds.add(studentKey);
      if (nameKey) convertedNames.add(nameKey);
      validList.push(ref);
    }
  }

  return {
    validList,
    duplicateList,
  };
}
