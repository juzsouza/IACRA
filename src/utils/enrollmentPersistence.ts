import type { Enrollment, Group, FinancialPlan, Student, ClassSession, AffiliateReferral } from '../store';
import { extractCompetenceFromDateStr } from './affiliateCommission';

export interface EnrollmentPersistenceResult {
  success: boolean;
  enrollment?: Enrollment;
  error?: string;
  technicalError?: any;
}

/**
 * Normaliza campos opcionais (como chaves estrangeiras nullable no PostgreSQL).
 * Converte string vazia ('') ou apenas espaços ('   ') ou undefined em null.
 */
export function normalizeOptionalFk(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

/**
 * Colunas reais existentes na tabela public.enrollments do Supabase.
 * Nota: `end_date` NÃO existe em public.enrollments e nunca deve ser enviado.
 */
export interface DbEnrollmentRow {
  id: string;
  student_id: string;
  plan_id: string;
  teacher_id: string | null;
  group_id: string | null;
  custom_price: number | null;
  start_date: string;
  enrollment_date: string;
  status: 'active' | 'inactive';
  due_day: number;
  due_date_day: number;
  affiliate_id: string | null;
}

/**
 * Chave canônica de uma matrícula ativa:
 * - Com grupo: student_id + plan_id + group_id
 * - Individual sem grupo: student_id + plan_id + null
 */
export function getCanonicalEnrollmentKey(enrollment: {
  student_id: string;
  plan_id: string;
  group_id?: string | null;
}): string {
  const studentId = (enrollment.student_id || '').trim();
  const planId = (enrollment.plan_id || '').trim();
  const groupId = normalizeOptionalFk(enrollment.group_id) ?? 'null';
  return `${studentId}::${planId}::${groupId}`;
}

/**
 * Verifica se já existe uma matrícula ativa equivalente para o mesmo aluno.
 * - Mesmo student_id + plan_id + group_id (incluindo group_id = null) -> duplicada
 * - Mesmo student_id + mesmo group_id (quando group_id não é nulo) -> duplicada no grupo
 * - Mesmo student_id + mesmo plan_id, mas grupos diferentes -> NÃO é duplicada
 */
export function findDuplicateActiveEnrollment(
  candidate: {
    id?: string;
    student_id: string;
    plan_id: string;
    group_id?: string | null;
    status?: 'active' | 'inactive';
  },
  existingEnrollments: Enrollment[]
): Enrollment | undefined {
  const status = candidate.status ?? 'active';
  if (status !== 'active') return undefined;

  const candidateKey = getCanonicalEnrollmentKey(candidate);
  const candidateGroupId = normalizeOptionalFk(candidate.group_id);

  return existingEnrollments.find((existing) => {
    if (existing.status !== 'active') return false;
    if (candidate.id && existing.id === candidate.id) return false;

    const existingGroupId = normalizeOptionalFk(existing.group_id);

    // Se ambos têm o mesmo group_id não-nulo para o mesmo aluno, já está ativo nesse grupo
    if (
      candidateGroupId &&
      existingGroupId &&
      existing.student_id === candidate.student_id &&
      candidateGroupId === existingGroupId
    ) {
      return true;
    }

    return getCanonicalEnrollmentKey(existing) === candidateKey;
  });
}

/**
 * Sanitiza o payload de criação de matrícula (INSERT) garantindo:
 * 1. affiliate_id, teacher_id e group_id vazios ('') viram null
 * 2. end_date NUNCA é enviado ao banco
 * 3. start_date, due_day e due_date_day são preenchidos de forma consistente
 */
export function sanitizeEnrollmentInsertPayload(
  enrollment: Omit<Enrollment, 'id'> & { id?: string; end_date?: string },
  generatedId: string
): { dbPayload: DbEnrollmentRow; normalizedEnrollment: Enrollment } {
  const id = (enrollment.id && enrollment.id.trim()) ? enrollment.id.trim() : generatedId;
  const teacherId = normalizeOptionalFk(enrollment.teacher_id);
  const groupId = normalizeOptionalFk(enrollment.group_id);
  const affiliateId = normalizeOptionalFk(enrollment.affiliate_id);

  const customPrice =
    enrollment.custom_price !== undefined &&
    enrollment.custom_price !== null &&
    String(enrollment.custom_price).trim() !== '' &&
    !Number.isNaN(Number(enrollment.custom_price))
      ? Number(enrollment.custom_price)
      : null;

  const enrollmentDate = enrollment.enrollment_date || new Date().toISOString().split('T')[0];
  const startDate =
    enrollment.start_date && enrollment.start_date.trim() !== ''
      ? enrollment.start_date.trim()
      : enrollmentDate;

  const dueDateDay = Number(enrollment.due_date_day || enrollment.due_day || 5) || 5;
  const dueDay = Number(enrollment.due_day || enrollment.due_date_day || 5) || 5;

  const dbPayload: DbEnrollmentRow = {
    id,
    student_id: enrollment.student_id,
    plan_id: enrollment.plan_id,
    teacher_id: teacherId,
    group_id: groupId,
    custom_price: customPrice,
    start_date: startDate,
    enrollment_date: enrollmentDate,
    status: enrollment.status || 'active',
    due_day: dueDay,
    due_date_day: dueDateDay,
    affiliate_id: affiliateId,
  };

  const normalizedEnrollment: Enrollment = {
    id,
    student_id: dbPayload.student_id,
    plan_id: dbPayload.plan_id,
    teacher_id: teacherId ?? undefined,
    group_id: groupId ?? undefined,
    custom_price: customPrice ?? undefined,
    start_date: dbPayload.start_date,
    enrollment_date: dbPayload.enrollment_date,
    status: dbPayload.status,
    due_day: dbPayload.due_day,
    due_date_day: dbPayload.due_date_day,
    affiliate_id: affiliateId ?? undefined,
  };

  return { dbPayload, normalizedEnrollment };
}

/**
 * Sanitiza o payload de atualização de matrícula (UPDATE) garantindo:
 * 1. affiliate_id, teacher_id e group_id vazios ('') viram null
 * 2. end_date NUNCA é enviado ao banco
 * 3. Apenas colunas reais de public.enrollments são incluídas
 */
export function sanitizeEnrollmentUpdatePayload(
  updates: Partial<Enrollment> & { end_date?: string },
  previousEnrollment?: Enrollment
): { dbUpdates: Record<string, any>; mergedEnrollment?: Enrollment } {
  const dbUpdates: Record<string, any> = {};

  if ('student_id' in updates && updates.student_id !== undefined) {
    dbUpdates.student_id = updates.student_id;
  }
  if ('plan_id' in updates && updates.plan_id !== undefined) {
    dbUpdates.plan_id = updates.plan_id;
  }
  if ('teacher_id' in updates) {
    dbUpdates.teacher_id = normalizeOptionalFk(updates.teacher_id);
  }
  if ('group_id' in updates) {
    dbUpdates.group_id = normalizeOptionalFk(updates.group_id);
  }
  if ('affiliate_id' in updates) {
    dbUpdates.affiliate_id = normalizeOptionalFk(updates.affiliate_id);
  }
  if ('custom_price' in updates) {
    dbUpdates.custom_price =
      updates.custom_price !== undefined &&
      updates.custom_price !== null &&
      String(updates.custom_price).trim() !== '' &&
      !Number.isNaN(Number(updates.custom_price))
        ? Number(updates.custom_price)
        : null;
  }
  if ('status' in updates && updates.status !== undefined) {
    dbUpdates.status = updates.status;
  }
  if ('enrollment_date' in updates && updates.enrollment_date !== undefined) {
    dbUpdates.enrollment_date = updates.enrollment_date;
    if (!('start_date' in updates) || !updates.start_date) {
      dbUpdates.start_date = updates.enrollment_date;
    }
  }
  if ('start_date' in updates && updates.start_date !== undefined && updates.start_date.trim() !== '') {
    dbUpdates.start_date = updates.start_date.trim();
  }
  if ('due_date_day' in updates && updates.due_date_day !== undefined) {
    const day = Number(updates.due_date_day) || 5;
    dbUpdates.due_date_day = day;
    dbUpdates.due_day = day;
  }
  if ('due_day' in updates && updates.due_day !== undefined) {
    const day = Number(updates.due_day) || 5;
    dbUpdates.due_day = day;
    if (dbUpdates.due_date_day === undefined) {
      dbUpdates.due_date_day = day;
    }
  }

  // Garantir explicitamente que end_date nunca exista em dbUpdates
  delete dbUpdates.end_date;

  let mergedEnrollment: Enrollment | undefined = undefined;
  if (previousEnrollment) {
    const nextTeacherId =
      'teacher_id' in dbUpdates ? (dbUpdates.teacher_id ?? undefined) : normalizeOptionalFk(previousEnrollment.teacher_id) ?? undefined;
    const nextGroupId =
      'group_id' in dbUpdates ? (dbUpdates.group_id ?? undefined) : normalizeOptionalFk(previousEnrollment.group_id) ?? undefined;
    const nextAffiliateId =
      'affiliate_id' in dbUpdates ? (dbUpdates.affiliate_id ?? undefined) : normalizeOptionalFk(previousEnrollment.affiliate_id) ?? undefined;
    const nextCustomPrice =
      'custom_price' in dbUpdates ? (dbUpdates.custom_price ?? undefined) : previousEnrollment.custom_price;

    mergedEnrollment = {
      ...previousEnrollment,
      student_id: dbUpdates.student_id ?? previousEnrollment.student_id,
      plan_id: dbUpdates.plan_id ?? previousEnrollment.plan_id,
      teacher_id: nextTeacherId,
      group_id: nextGroupId,
      affiliate_id: nextAffiliateId,
      custom_price: nextCustomPrice,
      status: dbUpdates.status ?? previousEnrollment.status,
      enrollment_date: dbUpdates.enrollment_date ?? previousEnrollment.enrollment_date,
      start_date:
        dbUpdates.start_date ||
        previousEnrollment.start_date ||
        dbUpdates.enrollment_date ||
        previousEnrollment.enrollment_date,
      due_day: dbUpdates.due_day ?? previousEnrollment.due_day ?? previousEnrollment.due_date_day ?? 5,
      due_date_day: dbUpdates.due_date_day ?? previousEnrollment.due_date_day ?? previousEnrollment.due_day ?? 5,
    };
    delete (mergedEnrollment as any).end_date;
  }

  return { dbUpdates, mergedEnrollment };
}

export function formatEnrollmentPersistenceError(error: any): string {
  if (!error) return 'Erro desconhecido ao salvar matrícula no banco de dados.';
  const rawMsg = typeof error === 'string' ? error : error.message || error.details || JSON.stringify(error);
  return `Erro ao gravar matrícula no banco de dados: ${rawMsg}`;
}

/**
 * Reconcilia e audita matrículas carregadas do Supabase.
 * - Normaliza FKs vazias ('') para undefined em memória (preservando null semântico)
 * - Usa a chave canônica (student_id + plan_id + group_id) apenas para detectar duplicidades reais
 * - NUNCA exclui matrículas automaticamente do banco nem descarta matrículas de grupos diferentes
 */
export function reconcileAndAuditLoadedEnrollments(
  rawEnrollments: any[],
  studentMap: Map<string, { id: string; status?: string; not_eligible?: boolean }>,
  idMapping: Record<string, string> = {}
): {
  enrollments: Enrollment[];
  detectedDuplicates: Array<{ key: string; primaryId: string; duplicateId: string }>;
} {
  let mappedEnrollments: Enrollment[] = (rawEnrollments || []).map((e: any) => {
    const mappedStudentId = idMapping[e.student_id] ? idMapping[e.student_id] : e.student_id;
    const st = studentMap.get(mappedStudentId);
    const isStudentInactive = st ? st.status === 'inactive' || !!st.not_eligible : false;

    const normTeacher = normalizeOptionalFk(e.teacher_id);
    const normGroup = normalizeOptionalFk(e.group_id);
    const normAffiliate = normalizeOptionalFk(e.affiliate_id);

    const normalized: Enrollment = {
      ...e,
      student_id: mappedStudentId,
      teacher_id: normTeacher ?? undefined,
      group_id: normGroup ?? undefined,
      affiliate_id: normAffiliate ?? undefined,
      status: isStudentInactive ? 'inactive' : e.status,
      due_date_day: e.due_date_day || e.due_day || 5,
      due_day: e.due_day || e.due_date_day || 5,
    };
    delete (normalized as any).end_date;
    return normalized;
  });

  // Auditoria não-destrutiva de duplicidade pela chave canônica (student_id + plan_id + group_id)
  const seenActiveByCanonicalKey = new Map<string, string>();
  const detectedDuplicates: Array<{ key: string; primaryId: string; duplicateId: string }> = [];

  for (const e of mappedEnrollments) {
    if (e.status === 'active') {
      const canonicalKey = getCanonicalEnrollmentKey(e);
      const existingPrimaryId = seenActiveByCanonicalKey.get(canonicalKey);
      if (existingPrimaryId && existingPrimaryId !== e.id) {
        detectedDuplicates.push({
          key: canonicalKey,
          primaryId: existingPrimaryId,
          duplicateId: e.id,
        });
      } else {
        seenActiveByCanonicalKey.set(canonicalKey, e.id);
      }
    }
  }

  return {
    enrollments: mappedEnrollments,
    detectedDuplicates,
  };
}

/**
 * Fluxo seguro de criação de matrícula (sem atualização otimista antes da confirmação do Supabase).
 */
export async function executeAddEnrollmentFlow(params: {
  enrollmentInput: Omit<Enrollment, 'id'> & { id?: string; end_date?: string };
  generatedId: string;
  currentEnrollments: Enrollment[];
  supabaseClient: {
    from: (table: string) => {
      insert: (rows: any[]) => PromiseLike<{ error: any }>;
    };
  };
  onCommitState: (nextEnrollments: Enrollment[], created: Enrollment) => void;
  onSyncGroupFutureClasses?: (groupId: string, nextEnrollments: Enrollment[]) => Promise<void>;
  onSyncAffiliateReferral?: (created: Enrollment) => Promise<void>;
}): Promise<EnrollmentPersistenceResult> {
  const {
    enrollmentInput,
    generatedId,
    currentEnrollments,
    supabaseClient,
    onCommitState,
    onSyncGroupFutureClasses,
    onSyncAffiliateReferral,
  } = params;

  if (!enrollmentInput.student_id || !enrollmentInput.student_id.trim()) {
    return { success: false, error: 'Por favor, selecione um aluno válido.' };
  }
  if (!enrollmentInput.plan_id || !enrollmentInput.plan_id.trim()) {
    return { success: false, error: 'Por favor, selecione um plano financeiro válido.' };
  }

  // Verificar duplicidade real (mesmo student_id + plan_id + group_id, ou mesmo group_id ativo)
  const duplicate = findDuplicateActiveEnrollment(enrollmentInput, currentEnrollments);
  if (duplicate) {
    return {
      success: false,
      error: 'Este aluno já possui uma matrícula ativa idêntica neste plano/grupo.',
    };
  }

  const { dbPayload, normalizedEnrollment } = sanitizeEnrollmentInsertPayload(enrollmentInput, generatedId);

  try {
    const { error } = await supabaseClient.from('enrollments').insert([dbPayload]);
    if (error) {
      console.error('Error adding enrollment to Supabase:', error);
      return {
        success: false,
        error: formatEnrollmentPersistenceError(error),
        technicalError: error,
      };
    }
  } catch (err: any) {
    console.error('Unexpected exception adding enrollment to Supabase:', err);
    return {
      success: false,
      error: formatEnrollmentPersistenceError(err),
      technicalError: err,
    };
  }

  // Somente após confirmação de sucesso do Supabase:
  const nextEnrollments = [...currentEnrollments, normalizedEnrollment];
  onCommitState(nextEnrollments, normalizedEnrollment);

  if (normalizedEnrollment.group_id && onSyncGroupFutureClasses) {
    await onSyncGroupFutureClasses(normalizedEnrollment.group_id, nextEnrollments);
  }

  if (normalizedEnrollment.affiliate_id && onSyncAffiliateReferral) {
    await onSyncAffiliateReferral(normalizedEnrollment);
  }

  return {
    success: true,
    enrollment: normalizedEnrollment,
  };
}

/**
 * Sincroniza de forma idempotente o vínculo de afiliado de uma matrícula
 * (em criação ou atualização) com a tabela public.affiliate_referrals.
 * - Se não houver affiliate_id válido na matrícula, não faz nada.
 * - Se já existir referral equivalente (mesmo student_id + enrollment_id + affiliate_id,
 *   ou mesmo enrollment_id, ou mesmo affiliate_id + student_id/nome), atualiza sem duplicar
 *   (preservando status 'converted' caso já esteja convertido).
 * - Se não existir, cria o registro com status 'enrolled_pending_payment'.
 */
export async function syncEnrollmentAffiliateReferral(params: {
  enrollment: Enrollment;
  students: Array<{ id: string; name: string; phone?: string; email?: string }>;
  existingReferrals: AffiliateReferral[];
  addAffiliateReferral: (referral: Omit<AffiliateReferral, 'id' | 'created_at'>) => Promise<void>;
  updateAffiliateReferral: (id: string, updates: Partial<AffiliateReferral>) => Promise<void>;
}): Promise<{
  action: 'skipped_no_affiliate' | 'already_synced' | 'updated' | 'created';
  referralId?: string;
}> {
  const { enrollment, students, existingReferrals, addAffiliateReferral, updateAffiliateReferral } = params;

  const affiliateId = normalizeOptionalFk(enrollment.affiliate_id);
  if (!affiliateId) {
    return { action: 'skipped_no_affiliate' };
  }

  const student = students.find((st) => st.id === enrollment.student_id);
  const studentName = (student?.name || 'Aluno Indicado').trim();
  const startDateStr =
    enrollment.start_date ||
    enrollment.enrollment_date ||
    new Date().toISOString().split('T')[0];
  const compMonth = extractCompetenceFromDateStr(startDateStr);
  const referralDate =
    enrollment.enrollment_date && enrollment.enrollment_date.trim() !== ''
      ? enrollment.enrollment_date.trim()
      : new Date().toISOString().split('T')[0];

  const referralsList = existingReferrals || [];

  // 1. Prioridade máxima: mesmo student_id + enrollment_id + affiliate_id
  let existingRef = referralsList.find(
    (r) =>
      r.student_id === enrollment.student_id &&
      r.enrollment_id === enrollment.id &&
      r.affiliate_id === affiliateId
  );

  // 2. Segunda prioridade: mesmo enrollment_id (caso tenha trocado o afiliado ou editado a mesma matrícula)
  if (!existingRef) {
    existingRef = referralsList.find((r) => r.enrollment_id && r.enrollment_id === enrollment.id);
  }

  // 3. Terceira prioridade: mesmo affiliate_id + mesmo student_id (ex: indicação pré-cadastrada antes da matrícula)
  if (!existingRef) {
    existingRef = referralsList.find(
      (r) => r.affiliate_id === affiliateId && r.student_id && r.student_id === enrollment.student_id
    );
  }

  // 4. Quarta prioridade: mesmo affiliate_id + mesmo nome de aluno normalizado
  if (!existingRef && student) {
    const cleanStudentName = student.name.trim().toLowerCase();
    existingRef = referralsList.find(
      (r) => r.affiliate_id === affiliateId && (r.referred_name || '').trim().toLowerCase() === cleanStudentName
    );
  }

  if (existingRef) {
    // Nunca rebaixar uma indicação já convertida ('converted') para 'enrolled_pending_payment'
    const nextStatus =
      existingRef.status === 'converted' ? 'converted' : 'enrolled_pending_payment';
    const nextCompetence =
      existingRef.status === 'converted' && existingRef.conversion_competence
        ? existingRef.conversion_competence
        : compMonth;
    const nextEnrollmentId =
      existingRef.status === 'converted' && existingRef.enrollment_id
        ? existingRef.enrollment_id
        : enrollment.id;

    const needsUpdate =
      existingRef.affiliate_id !== affiliateId ||
      existingRef.student_id !== enrollment.student_id ||
      existingRef.enrollment_id !== nextEnrollmentId ||
      existingRef.status !== nextStatus ||
      existingRef.conversion_competence !== nextCompetence;

    if (!needsUpdate) {
      return { action: 'already_synced', referralId: existingRef.id };
    }

    try {
      await updateAffiliateReferral(existingRef.id, {
        affiliate_id: affiliateId,
        student_id: enrollment.student_id,
        enrollment_id: nextEnrollmentId,
        status: nextStatus,
        conversion_competence: nextCompetence,
      });
    } catch (e) {
      console.warn('Could not link/update existing referral to enrollment:', e);
    }
    return { action: 'updated', referralId: existingRef.id };
  }

  const studentUuid =
    enrollment.student_id && enrollment.student_id.trim() !== ''
      ? enrollment.student_id
      : undefined;

  try {
    await addAffiliateReferral({
      affiliate_id: affiliateId,
      student_id: studentUuid,
      enrollment_id: enrollment.id,
      referred_name: studentName,
      referred_phone: student?.phone || undefined,
      referred_email: student?.email || undefined,
      referral_date: referralDate,
      status: 'enrolled_pending_payment',
      conversion_competence: compMonth,
    });
  } catch (e) {
    console.warn('Could not insert referral for enrollment into Supabase:', e);
  }

  return { action: 'created' };
}

/**
 * Fluxo seguro de atualização de matrícula (sem atualização otimista antes da confirmação do Supabase).
 */
export async function executeUpdateEnrollmentFlow(params: {
  id: string;
  updates: Partial<Enrollment> & { end_date?: string };
  currentEnrollments: Enrollment[];
  supabaseClient: {
    from: (table: string) => {
      update: (values: Record<string, any>) => {
        eq: (column: string, value: string) => PromiseLike<{ error: any }>;
      };
    };
  };
  onCommitState: (nextEnrollments: Enrollment[], updated: Enrollment) => void;
  onSyncGroupFutureClasses?: (groupId: string, nextEnrollments: Enrollment[]) => Promise<void>;
  onSyncAffiliateReferral?: (updated: Enrollment, previous: Enrollment) => Promise<void>;
}): Promise<EnrollmentPersistenceResult> {
  const {
    id,
    updates,
    currentEnrollments,
    supabaseClient,
    onCommitState,
    onSyncGroupFutureClasses,
    onSyncAffiliateReferral,
  } = params;

  const previousEnrollment = currentEnrollments.find((e) => e.id === id);
  if (!previousEnrollment) {
    return {
      success: false,
      error: 'Matrícula não encontrada para atualização.',
    };
  }

  const { dbUpdates, mergedEnrollment } = sanitizeEnrollmentUpdatePayload(updates, previousEnrollment);
  if (!mergedEnrollment) {
    return {
      success: false,
      error: 'Falha ao preparar atualização da matrícula.',
    };
  }

  // Verificar duplicidade real caso a matrícula continue/fique ativa
  const duplicate = findDuplicateActiveEnrollment(mergedEnrollment, currentEnrollments);
  if (duplicate) {
    return {
      success: false,
      error: 'Este aluno já possui outra matrícula ativa idêntica neste plano/grupo.',
    };
  }

  try {
    const { error } = await supabaseClient.from('enrollments').update(dbUpdates).eq('id', id);
    if (error) {
      console.error('Error updating enrollment in Supabase:', error);
      return {
        success: false,
        error: formatEnrollmentPersistenceError(error),
        technicalError: error,
      };
    }
  } catch (err: any) {
    console.error('Unexpected exception updating enrollment in Supabase:', err);
    return {
      success: false,
      error: formatEnrollmentPersistenceError(err),
      technicalError: err,
    };
  }

  // Somente após confirmação de sucesso do Supabase:
  const nextEnrollments = currentEnrollments.map((e) => (e.id === id ? mergedEnrollment : e));
  onCommitState(nextEnrollments, mergedEnrollment);

  if (onSyncGroupFutureClasses) {
    const affectedGroupIds = new Set<string>();
    if (previousEnrollment.group_id) affectedGroupIds.add(previousEnrollment.group_id);
    if (mergedEnrollment.group_id) affectedGroupIds.add(mergedEnrollment.group_id);
    for (const gid of affectedGroupIds) {
      await onSyncGroupFutureClasses(gid, nextEnrollments);
    }
  }

  if (mergedEnrollment.affiliate_id && onSyncAffiliateReferral) {
    await onSyncAffiliateReferral(mergedEnrollment, previousEnrollment);
  }

  return {
    success: true,
    enrollment: mergedEnrollment,
  };
}

/**
 * Ferramenta READ-ONLY de diagnóstico e preparação para reconstrução segura das matrículas
 * afetadas pelo bug de FK vazia (NÃO executa escritas no banco).
 */
export interface AffectedStudentEnrollmentCandidate {
  student_id: string;
  student_name: string;
  student_status: string;
  student_enrollment_date?: string;
  inferred_group_id: string;
  inferred_group_name: string;
  inferred_teacher_id: string | null;
  suggested_plan_id: string | null;
  suggested_plan_name: string | null;
  future_classes_linked_count: number;
  existing_active_enrollments_count: number;
  existing_inactive_enrollments_count: number;
}

export function buildReadOnlyMissingGroupEnrollmentsReport(params: {
  students: Student[];
  enrollments: Enrollment[];
  groups: Group[];
  financialPlans: FinancialPlan[];
  classes: ClassSession[];
  referenceDate?: string;
}): AffectedStudentEnrollmentCandidate[] {
  const {
    students,
    enrollments,
    groups,
    financialPlans,
    classes,
    referenceDate = '2026-09-28',
  } = params;

  const defaultGroupPlan =
    financialPlans.find(
      (p) => p.is_active && (p.name.toLowerCase().includes('grupo') || p.category === 'group' || p.category === 'mev')
    ) || financialPlans[0];

  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const studentMap = new Map(students.map((s) => [s.id, s]));

  // Map student_id -> Map<group_id, count of future scheduled classes>
  const studentGroupClassCounts = new Map<string, Map<string, { count: number; teacherId: string | null }>>();

  for (const cls of classes) {
    if (!cls.group_id || cls.status !== 'scheduled' || !cls.date || cls.date < referenceDate) continue;
    const sids = Array.isArray(cls.student_ids) ? cls.student_ids : [];
    for (const sid of sids) {
      if (!studentGroupClassCounts.has(sid)) {
        studentGroupClassCounts.set(sid, new Map());
      }
      const gMap = studentGroupClassCounts.get(sid)!;
      const prev = gMap.get(cls.group_id) || { count: 0, teacherId: cls.teacher_id || null };
      gMap.set(cls.group_id, {
        count: prev.count + 1,
        teacherId: prev.teacherId || cls.teacher_id || null,
      });
    }
  }

  const candidates: AffectedStudentEnrollmentCandidate[] = [];

  for (const [sid, gMap] of studentGroupClassCounts.entries()) {
    const st = studentMap.get(sid);
    if (!st || st.status === 'inactive' || st.not_eligible) continue;

    const studentEnrollments = enrollments.filter((e) => e.student_id === sid);
    const activeCount = studentEnrollments.filter((e) => e.status === 'active').length;
    const inactiveCount = studentEnrollments.filter((e) => e.status !== 'active').length;

    for (const [gid, info] of gMap.entries()) {
      const hasActiveInThisGroup = studentEnrollments.some(
        (e) => normalizeOptionalFk(e.group_id) === gid && e.status === 'active'
      );
      if (!hasActiveInThisGroup) {
        const grp = groupMap.get(gid);
        candidates.push({
          student_id: sid,
          student_name: st.name,
          student_status: st.status,
          student_enrollment_date: st.enrollment_date,
          inferred_group_id: gid,
          inferred_group_name: grp?.name || gid,
          inferred_teacher_id: normalizeOptionalFk(grp?.teacher_id) || info.teacherId,
          suggested_plan_id: defaultGroupPlan?.id || null,
          suggested_plan_name: defaultGroupPlan?.name || null,
          future_classes_linked_count: info.count,
          existing_active_enrollments_count: activeCount,
          existing_inactive_enrollments_count: inactiveCount,
        });
      }
    }
  }

  return candidates;
}

export interface ControlledRepairSpecItem {
  label: string;
  student_id: string;
  mode: 'create_group' | 'create_individual' | 'keep_existing_only';
  group_id?: string | null;
  teacher_id?: string | null;
  plan_id?: string | null;
  exact_plan_name?: string;
  explicit_start_date?: string | null;
  explicit_enrollment_date?: string | null;
  explicit_due_day?: number | null;
  explicit_custom_price?: number | null;
}

export interface ControlledRepairPreviewRow {
  label: string;
  student_name: string;
  student_id: string;
  group_name: string;
  group_id: string | null;
  teacher_name: string;
  teacher_id: string | null;
  plan_name: string;
  plan_id: string | null;
  existing_enrollments_summary: string;
  determined_start_date: string | null;
  determined_enrollment_date: string | null;
  determined_due_day: number | null;
  determined_due_date_day: number | null;
  determined_custom_price: number | null;
  missing_or_ambiguous_fields: string[];
  proposed_action: 'CRIAR' | 'JÁ EXISTIA' | 'MANTER COMO ESTÁ (NÃO ALTERAR)' | 'PENDENTE' | 'ERRO';
  existing_matching_enrollment_id: string | null;
}

/**
 * Gera a prévia completa e segura (100% READ-ONLY) para reparo controlado de matrículas,
 * verificando FKs, unicidade de plano por nome, idempotência e campos NOT NULL (id, start_date, due_day, created_at).
 */
export function buildControlledEnrollmentRepairPreview(params: {
  specs: ControlledRepairSpecItem[];
  students: any[];
  enrollments: any[];
  groups: any[];
  teachers: any[];
  financialPlans: any[];
  classes: any[];
  classStudents: any[];
}): ControlledRepairPreviewRow[] {
  const { specs, students, enrollments, groups, teachers, financialPlans, classes, classStudents } = params;

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const groupMap = new Map(groups.map((g) => [g.id, g]));
  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const planMap = new Map(financialPlans.map((p) => [p.id, p]));
  const classMap = new Map(classes.map((c) => [c.id, c]));

  return specs.map((spec) => {
    const st = studentMap.get(spec.student_id);
    const stEnrs = enrollments.filter((e) => e.student_id === spec.student_id);

    const existingSummary =
      stEnrs.length === 0
        ? 'Nenhuma (0 registros)'
        : stEnrs
            .map((e) => {
              const gName = e.group_id ? groupMap.get(e.group_id)?.name || e.group_id : 'Individual';
              return `${e.id} [${e.status} | ${gName} | start=${e.start_date} | due=${e.due_day ?? e.due_date_day}]`;
            })
            .join('; ');

    if (spec.mode === 'keep_existing_only') {
      return {
        label: spec.label,
        student_name: st?.name || 'NÃO ENCONTRADO',
        student_id: spec.student_id,
        group_name: '—',
        group_id: null,
        teacher_name: '—',
        teacher_id: null,
        plan_name: '—',
        plan_id: null,
        existing_enrollments_summary: existingSummary,
        determined_start_date: null,
        determined_enrollment_date: null,
        determined_due_day: null,
        determined_due_date_day: null,
        determined_custom_price: null,
        missing_or_ambiguous_fields: [],
        proposed_action: 'MANTER COMO ESTÁ (NÃO ALTERAR)',
        existing_matching_enrollment_id: stEnrs.find((e) => e.status === 'active')?.id || stEnrs[0]?.id || null,
      };
    }

    const missing: string[] = [];
    if (!st) {
      missing.push(`student_id inválido (${spec.student_id})`);
    }

    const normalizedGroupId = normalizeOptionalFk(spec.group_id);
    const grp = normalizedGroupId ? groupMap.get(normalizedGroupId) : null;
    if (spec.mode === 'create_group' && !grp) {
      missing.push(`group_id inválido (${spec.group_id})`);
    }

    const normalizedTeacherId = normalizeOptionalFk(spec.teacher_id);
    const tch = normalizedTeacherId ? teacherMap.get(normalizedTeacherId) : null;
    if (!tch) {
      missing.push(`teacher_id inválido (${spec.teacher_id})`);
    }

    let resolvedPlanId: string | null = normalizeOptionalFk(spec.plan_id);
    let resolvedPlanName = 'NÃO IDENTIFICADO';

    if (spec.exact_plan_name) {
      const exactMatches = financialPlans.filter(
        (p) => (p.name || '').trim() === spec.exact_plan_name!.trim()
      );
      if (exactMatches.length === 0) {
        missing.push(`plan_id: 0 planos encontrados com nome exato "${spec.exact_plan_name}"`);
        resolvedPlanId = null;
      } else if (exactMatches.length > 1) {
        missing.push(
          `plan_id ambíguo: ${exactMatches.length} planos com nome exato "${spec.exact_plan_name}" (${exactMatches
            .map((m) => m.id)
            .join(', ')})`
        );
        resolvedPlanId = null;
        resolvedPlanName = `${spec.exact_plan_name} (AMBÍGUO: ${exactMatches.length} IDs)`;
      } else {
        resolvedPlanId = exactMatches[0].id;
        resolvedPlanName = exactMatches[0].name;
      }
    } else if (resolvedPlanId) {
      const pl = planMap.get(resolvedPlanId);
      if (!pl) {
        missing.push(`plan_id inválido (${resolvedPlanId})`);
      } else {
        resolvedPlanName = pl.name;
      }
    } else {
      missing.push('plan_id não informado');
    }

    // Check idempotency against existing active enrollments
    // Group rule: student_id + plan_id + group_id
    // Individual rule: student_id + plan_id + teacher_id + group_id NULL
    const existingMatch = stEnrs.find((e) => {
      if (e.status !== 'active') return false;
      const eGroupId = normalizeOptionalFk(e.group_id);
      const eTeacherId = normalizeOptionalFk(e.teacher_id);
      if (spec.mode === 'create_group') {
        return (
          e.student_id === spec.student_id &&
          e.plan_id === resolvedPlanId &&
          eGroupId === normalizedGroupId
        );
      } else {
        return (
          e.student_id === spec.student_id &&
          e.plan_id === resolvedPlanId &&
          eTeacherId === normalizedTeacherId &&
          eGroupId === null
        );
      }
    });

    if (existingMatch) {
      return {
        label: spec.label,
        student_name: st?.name || '',
        student_id: spec.student_id,
        group_name: grp ? grp.name : 'NULL (Aula Individual)',
        group_id: normalizedGroupId,
        teacher_name: tch?.name || '',
        teacher_id: normalizedTeacherId,
        plan_name: resolvedPlanName,
        plan_id: resolvedPlanId,
        existing_enrollments_summary: existingSummary,
        determined_start_date: existingMatch.start_date,
        determined_enrollment_date: existingMatch.enrollment_date,
        determined_due_day: existingMatch.due_day,
        determined_due_date_day: existingMatch.due_date_day,
        determined_custom_price: existingMatch.custom_price ?? null,
        missing_or_ambiguous_fields: [],
        proposed_action: 'JÁ EXISTIA',
        existing_matching_enrollment_id: existingMatch.id,
      };
    }

    // Check historical dates & NOT NULL columns (start_date, due_day)
    const studentCsClasses = classStudents
      .filter((cs) => cs.student_id === spec.student_id)
      .map((cs) => classMap.get(cs.class_id))
      .filter(Boolean)
      .filter((cls) => {
        if (spec.mode === 'create_group') return cls.group_id === normalizedGroupId;
        return !cls.group_id && cls.teacher_id === normalizedTeacherId;
      });

    const classDatesSorted = studentCsClasses.map((c) => c.date).filter(Boolean).sort();
    const firstClassDate = classDatesSorted[0] || null;

    // Validate student.enrollment_date (e.g. Rodrigo has 2007-09-13 which is his birth_date!)
    const rawStudentEnrollmentDate = st?.enrollment_date || null;
    const isStudentEnrollmentDatePlausible =
      rawStudentEnrollmentDate &&
      rawStudentEnrollmentDate >= '2025-01-01' &&
      rawStudentEnrollmentDate !== st?.birth_date;

    // Determine start_date & enrollment_date
    let determinedEnrollmentDate: string | null = spec.explicit_enrollment_date ?? null;
    let determinedStartDate: string | null = spec.explicit_start_date ?? null;

    if (!determinedEnrollmentDate) {
      if (isStudentEnrollmentDatePlausible && rawStudentEnrollmentDate >= '2026-09-01') {
        determinedEnrollmentDate = rawStudentEnrollmentDate;
      } else if (firstClassDate) {
        determinedEnrollmentDate = firstClassDate;
      }
    }

    if (!determinedStartDate) {
      if (isStudentEnrollmentDatePlausible && rawStudentEnrollmentDate >= '2026-09-01') {
        determinedStartDate = rawStudentEnrollmentDate;
      } else if (firstClassDate) {
        determinedStartDate = firstClassDate;
      }
    }

    if (!determinedStartDate) {
      missing.push('start_date (coluna NOT NULL em public.enrollments sem data determinável sem ambiguidade)');
    }

    // Determine due_day (NOT NULL in public.enrollments) and due_date_day
    // Rule 11: "Especialmente não assumir due_date_day sem evidência."
    let determinedDueDay: number | null = spec.explicit_due_day ?? null;
    if (determinedDueDay === null && stEnrs.length === 1) {
      const prevDue = stEnrs[0].due_date_day ?? stEnrs[0].due_day;
      if (typeof prevDue === 'number' && prevDue > 0) {
        determinedDueDay = prevDue;
      }
    }

    if (determinedDueDay === null) {
      missing.push(
        'due_day / due_date_day (due_day é NOT NULL no schema do PostgreSQL e não há evidência individual no histórico do aluno)'
      );
    }

    return {
      label: spec.label,
      student_name: st?.name || '',
      student_id: spec.student_id,
      group_name: grp ? grp.name : 'NULL (Aula Individual)',
      group_id: normalizedGroupId,
      teacher_name: tch?.name || '',
      teacher_id: normalizedTeacherId,
      plan_name: resolvedPlanName,
      plan_id: resolvedPlanId,
      existing_enrollments_summary: existingSummary,
      determined_start_date: determinedStartDate,
      determined_enrollment_date: determinedEnrollmentDate,
      determined_due_day: determinedDueDay,
      determined_due_date_day: determinedDueDay,
      determined_custom_price: spec.explicit_custom_price ?? null,
      missing_or_ambiguous_fields: missing,
      proposed_action: missing.length > 0 ? 'PENDENTE' : 'CRIAR',
      existing_matching_enrollment_id: null,
    };
  });
}

