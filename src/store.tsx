import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "./lib/supabase";
import { createClient } from "@supabase/supabase-js";
import { normalizePhoneNumber, PhoneNormalizationResult } from "./utils/phone";
import { calculateRaphaelClassCreditValue } from "./utils/raphaelBillingSimulation";
import { resolveCreditEnrollmentId } from "./utils/raphaelRealBilling";
import { ensureDueCompetenceBilling as serviceEnsureDueCompetenceBilling } from "./utils/dueCompetenceService";
import {
  triggerGoogleClassSync,
  fetchClassDeleteContext,
  resyncClassWithGoogle,
  reconcileGoogleClasses,
  fetchUnsyncedClassesStatus,
  SyncResult,
} from "./services/googleCalendarClient";
import {
  EnrollmentPersistenceResult,
  sanitizeEnrollmentInsertPayload,
  reconcileAndAuditLoadedEnrollments,
  executeAddEnrollmentFlow,
  executeUpdateEnrollmentFlow,
  syncEnrollmentAffiliateReferral,
} from "./utils/enrollmentPersistence";

export type Student = {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf?: string;
  instrument: string;
  status: "active" | "inactive";
  enrollment_date: string;
  birth_date?: string;
  not_eligible?: boolean;
  ineligibility_reason?: string;
};

export type WorkHour = {
  day_of_week: number; // 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado
  start_time: string;
  end_time: string;
};

export type Teacher = {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf?: string;
  specialties: string[];
  birth_date?: string;
  schedule?: WorkHour[];
  status: 'active' | 'inactive';
};

export type ClassSession = {
  id: string;
  group_id?: string;
  title: string;
  teacher_id: string;
  student_ids: string[];
  date: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "completed" | "cancelled";
  allow_makeup?: boolean;
  makeup_scheduled?: boolean;
  cancelled_by_teacher?: boolean;
  has_custom_students?: boolean;
  report?: string;
  vocal_routine?: string;
  attendance?: Record<string, "present" | "absent">;
};

export type PendingClassSync = {
  class_id: string;
  teacher_id?: string | null;
  group_id?: string | null;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  status: string;
  report?: string;
  vocal_routine?: string;
  attendance?: Record<string, "present" | "absent">;
  student_ids?: string[];
  allow_makeup?: boolean;
  makeup_scheduled?: boolean;
  cancelled_by_teacher?: boolean;
  timestamp: number;
  syncStatus: "pending" | "saving" | "synced" | "error" | "conflict";
  is_offline_created?: boolean;
  lastError?: string;
};

export type ClassAuditCategory = "synced" | "pending" | "conflict" | "remote_only" | "local_only" | "manual_check";

export type ClassRecoveryInspection = {
  class_id: string;
  isAuthorized: boolean;
  authMessage?: string;
  existsInSupabase: boolean;
  remoteClass?: {
    id: string;
    teacher_id?: string;
    teacher_name?: string;
    group_id?: string;
    title: string;
    date: string;
    start_time: string;
    end_time: string;
    status: string;
    report?: string;
    vocal_routine?: string;
    attendance?: Record<string, "present" | "absent">;
    student_ids?: string[];
    student_names?: string;
    allow_makeup?: boolean;
    makeup_scheduled?: boolean;
  };
  possibleDuplicates: Array<{
    id: string;
    teacher_id?: string;
    teacher_name?: string;
    date: string;
    start_time: string;
    end_time: string;
    title: string;
    student_names?: string;
    status: string;
    report?: string;
  }>;
  missingFields: string[];
  localData: {
    id: string;
    teacher_id?: string;
    teacher_name?: string;
    group_id?: string;
    title: string;
    date: string;
    start_time: string;
    end_time: string;
    status: string;
    report?: string;
    vocal_routine?: string;
    attendance?: Record<string, "present" | "absent">;
    student_ids?: string[];
    student_names?: string;
    allow_makeup?: boolean;
    makeup_scheduled?: boolean;
  };
  canDirectInsert: boolean;
};

export type ClassAuditItem = {
  class_id: string;
  teacher_id?: string;
  teacher_name?: string;
  teacher_email?: string;
  title: string;
  student_names?: string;
  date: string;
  start_time: string;
  end_time: string;
  category: ClassAuditCategory;
  localData?: {
    date?: string;
    start_time?: string;
    end_time?: string;
    teacher_id?: string;
    teacher_name?: string;
    group_id?: string;
    status?: string;
    report?: string;
    vocal_routine?: string;
    attendance?: Record<string, "present" | "absent">;
    student_ids?: string[];
    student_names?: string;
    title?: string;
    allow_makeup?: boolean;
    makeup_scheduled?: boolean;
  };
  remoteData?: {
    date?: string;
    start_time?: string;
    end_time?: string;
    teacher_id?: string;
    teacher_name?: string;
    group_id?: string;
    status?: string;
    report?: string;
    vocal_routine?: string;
    attendance?: Record<string, "present" | "absent">;
    student_ids?: string[];
    student_names?: string;
    title?: string;
    allow_makeup?: boolean;
    makeup_scheduled?: boolean;
  };
  diffSummary: string[];
  lastError?: string;
};

export type AuditSummary = {
  totalTeachers: number;
  totalClasses: number;
  syncedCount: number;
  pendingCount: number;
  conflictCount: number;
  manualCheckCount: number;
  localOnlyCount: number;
  remoteOnlyCount: number;
  errorCount: number;
  items: ClassAuditItem[];
  pendingSyncQueue: PendingClassSync[];
  auditedAt: number;
};

export type Transaction = {
  id: string;
  type: "income" | "expense";
  amount: number;
  description: string;
  date: string;
  status: "pending" | "completed";
};

export type FinancialPlan = {
  id: string;
  name: string;
  category: 'individual' | 'group' | 'coral' | 'mentoria' | 'mev' | 'personalizado';
  modality: 'semanal' | 'quinzenal' | 'avulso' | 'mensal' | 'personalizado';
  base_price: number;
  duration_minutes: number;
  max_students: number;
  is_active: boolean;
  exclusive_teacher_id: string | null;
  allow_early_discount: boolean;
  early_discount_value: number;
  early_discount_deadline_day: number;
  secretary_fee_type: 'fixed' | 'per_student';
  secretary_fee_value: number;
  school_fee_type: 'fixed' | 'per_student';
  school_fee_value: number;
  teacher_fee_type: 'fixed' | 'per_student' | 'percentage';
  teacher_fee_value: number;
  margin_value: number;
};

export type ChoirVoiceType = {
  id: string;
  name: string;
  max_slots: number;
};

export type ChoirRegistration = {
  id: string;
  student_id: string;
  voice_type_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'inactive';
  active?: boolean;
  monthly_fee: number;
  is_internal_student: boolean;
};

export type ChoirCollaborator = {
  id: string;
  name: string;
  role: string;
  teacher_id?: string;
  remuneration_type: 'fixed' | 'percentage' | 'per_student' | 'per_rehearsal';
  remuneration_value: number;
  phone?: string;
  email?: string;
  notes?: string;
  active?: boolean;
};

export type ChoirAttendanceRecord = {
  person_id: string; // student_id for singer OR collaborator_id for collaborator
  type: 'singer' | 'collaborator';
  status: 'present' | 'absent' | 'justified';
  notes?: string;
};

export type ChoirRehearsal = {
  id: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm
  title?: string;
  notes?: string;
  attendance: ChoirAttendanceRecord[];
};

export type Group = {
  id: string;
  name: string;
  teacher_id?: string;
  schedule?: string;
  frequency?: 'semanal' | 'quinzenal' | null;
  max_students?: number;
  payment_type?: 'group' | 'individual';
  price?: number;
  status?: 'active' | 'inactive';
};

export type Enrollment = {
  id: string;
  student_id: string;
  plan_id: string;
  teacher_id?: string;
  group_id?: string;
  custom_price?: number;
  status: 'active' | 'inactive';
  enrollment_date: string;
  start_date?: string;
  end_date?: string;
  due_date_day: number;
  due_day?: number;
  affiliate_id?: string;
};

export type AffiliateStatus = 'active' | 'inactive' | 'suspended';

export type Affiliate = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  cpf_cnpj?: string;
  pix_key?: string;
  pix_key_type?: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random' | 'outro';
  referral_code?: string;
  status: AffiliateStatus;
  created_at: string;
  updated_at?: string;
};

export type AffiliateReferralStatus = 
  | 'registered'
  | 'enrolled_pending_payment'
  | 'converted'
  | 'cancelled';

export type AffiliateReferral = {
  id: string;
  affiliate_id: string;
  prospect_id?: string;
  student_id?: string;
  enrollment_id?: string;
  referred_name: string;
  referred_phone?: string;
  referred_email?: string;
  referral_date: string;
  status: AffiliateReferralStatus;
  conversion_date?: string;
  conversion_competence?: string; // Formato: YYYY-MM
  first_transaction_id?: string;
  notes?: string;
  created_at: string;
  updated_at?: string;
};

export type AffiliateMonthlyClosing = {
  id: string;
  competence: string; // YYYY-MM
  version: number;
  is_current: boolean;
  status: 'closed' | 'reopened';
  total_valid_referrals: number;
  total_payout_amount: number;
  closed_at: string;
  closed_by?: string;
  closed_by_name?: string;
  reopened_at?: string;
  reopen_reason?: string;
  notes?: string;
  created_at: string;
};

export type AffiliateClosingItem = {
  id: string;
  closing_id: string;
  affiliate_id: string;
  affiliate_name_snapshot: string;
  affiliate_pix_snapshot?: string;
  valid_referrals_count: number;
  tier_applied: string;
  amount_due: number | null; // null se > 10 e não definido
  rule_status: 'defined' | 'pending_definition';
  payment_status: 'pending' | 'paid';
  paid_at?: string;
  payout_transaction_id?: string;
  notes?: string;
  created_at: string;
};

export type AffiliateCommissionRule = {
  id: string;
  tier_quantity: number;
  total_commission_amount: number | null;
  is_defined: boolean;
  description?: string;
  created_at?: string;
  updated_at?: string;
};

export type DiscountRule = {
  id: string;
  trigger_plan_id: string;
  target_plan_id: string;
  discount_value: number;
  applies_to: 'school_share' | 'total_price';
  start_date: string | null;
  end_date: string | null;
  description: string;
};

export type Prospect = {
  id: string;
  name: string;
  email: string;
  phone: string;
  cpf?: string;
  instrument: string;
  term_signed: boolean;
  approved: boolean;
  notes?: string;
  created_at?: string;
  lead_status?: "contato_iniciado" | "aguardando_retorno" | "nao_deu_retorno" | "matriculado" | "";
  message_history?: { id: string; date: string; note: string; status: string }[];
  not_eligible?: boolean;
  ineligibility_reason?: string;
};

export function encodeProspectNotes(
  notes?: string,
  lead_status?: string,
  message_history?: any[],
  term_signed?: boolean,
  approved?: boolean
) {
  const cleanNotes = (notes || "").replace(/\[META_PROSPECT:.*?\]/sg, "").trim();
  const metaObj: any = {};
  if (lead_status) metaObj.lead_status = lead_status;
  if (message_history && message_history.length > 0) metaObj.message_history = message_history;
  if (term_signed !== undefined) metaObj.term_signed = term_signed;
  if (approved !== undefined) metaObj.approved = approved;

  if (Object.keys(metaObj).length === 0) return cleanNotes;
  const metaStr = `\n[META_PROSPECT:${JSON.stringify(metaObj)}]`;
  return cleanNotes ? `${cleanNotes}${metaStr}` : metaStr.trim();
}

export function parseProspectNotes(rawNotes?: string) {
  let notes = rawNotes || "";
  let lead_status: any = "";
  let message_history: any[] = [];
  let term_signed: boolean | undefined = undefined;
  let approved: boolean | undefined = undefined;

  if (notes.includes("[META_PROSPECT:")) {
    const match = notes.match(/\[META_PROSPECT:(.*?)\]/s);
    if (match) {
      try {
        const metaObj = JSON.parse(match[1]);
        if (metaObj.lead_status) lead_status = metaObj.lead_status;
        if (Array.isArray(metaObj.message_history)) message_history = metaObj.message_history;
        if (metaObj.term_signed !== undefined) term_signed = !!metaObj.term_signed;
        if (metaObj.approved !== undefined) approved = !!metaObj.approved;
      } catch (e) {
        console.warn("Error parsing prospect meta notes", e);
      }
      notes = notes.replace(/\[META_PROSPECT:.*?\]/sg, "").trim();
    }
  }
  return { notes, lead_status, message_history, term_signed, approved };
}

export function packReport(
  report?: string,
  vocal_routine?: string,
  attendance?: Record<string, any>,
  makeup_scheduled?: boolean,
  allow_makeup?: boolean,
  cancelled_by_teacher?: boolean,
  has_custom_students?: boolean
) {
  let cleanRep = (report || "").trim();
  if (cleanRep.includes(" // VOCAL_ROUTINE: ")) {
    cleanRep = cleanRep.split(" // VOCAL_ROUTINE: ")[0].trim();
  }
  cleanRep = cleanRep
    .split(" // ATTENDANCE: ")[0]
    .split(" // MAKEUP_SCHEDULED: ")[0]
    .split(" // ALLOW_MAKEUP: ")[0]
    .split(" // CANCELLED_BY_TEACHER: ")[0]
    .split(" // CUSTOM_STUDENTS: ")[0]
    .trim();

  let cleanVocal = (vocal_routine || "").trim();
  if (cleanVocal.includes(" // VOCAL_ROUTINE: ")) {
    cleanVocal = cleanVocal.split(" // VOCAL_ROUTINE: ")[0].trim();
  }
  cleanVocal = cleanVocal
    .split(" // ATTENDANCE: ")[0]
    .split(" // MAKEUP_SCHEDULED: ")[0]
    .split(" // ALLOW_MAKEUP: ")[0]
    .split(" // CANCELLED_BY_TEACHER: ")[0]
    .split(" // CUSTOM_STUDENTS: ")[0]
    .trim();

  let dbReport = cleanRep;
  if (cleanVocal) {
    dbReport = `${dbReport} // VOCAL_ROUTINE: ${cleanVocal}`;
  }
  if (attendance && Object.keys(attendance).length > 0) {
    dbReport = `${dbReport} // ATTENDANCE: ${JSON.stringify(attendance)}`;
  }
  if (makeup_scheduled) {
    dbReport = `${dbReport} // MAKEUP_SCHEDULED: true`;
  }
  if (allow_makeup) {
    dbReport = `${dbReport} // ALLOW_MAKEUP: true`;
  }
  if (cancelled_by_teacher) {
    dbReport = `${dbReport} // CANCELLED_BY_TEACHER: true`;
  }
  if (has_custom_students === true) {
    dbReport = `${dbReport} // CUSTOM_STUDENTS: true`;
  } else if (has_custom_students === false) {
    dbReport = `${dbReport} // CUSTOM_STUDENTS: false`;
  }
  return dbReport.trim();
}

export function parsePackedReport(rawReport?: string | null) {
  if (!rawReport) {
    return {
      report: "",
      vocal_routine: "",
      attendance: {} as Record<string, string>,
      makeup_scheduled: undefined as boolean | undefined,
      allow_makeup: undefined as boolean | undefined,
      cancelled_by_teacher: undefined as boolean | undefined,
      has_custom_students: undefined as boolean | undefined,
    };
  }

  let makeup_scheduled: boolean | undefined = undefined;
  let allow_makeup: boolean | undefined = undefined;
  let cancelled_by_teacher: boolean | undefined = undefined;
  let has_custom_students: boolean | undefined = undefined;
  let attendance: Record<string, string> = {};
  let vocal_routine = "";
  let report = rawReport;

  if (rawReport.includes("MAKEUP_SCHEDULED: true")) {
    makeup_scheduled = true;
  } else if (rawReport.includes("MAKEUP_SCHEDULED: false")) {
    makeup_scheduled = false;
  }

  if (rawReport.includes("ALLOW_MAKEUP: true")) {
    allow_makeup = true;
  } else if (rawReport.includes("ALLOW_MAKEUP: false")) {
    allow_makeup = false;
  }

  if (rawReport.includes("CANCELLED_BY_TEACHER: true")) {
    cancelled_by_teacher = true;
  } else if (rawReport.includes("CANCELLED_BY_TEACHER: false")) {
    cancelled_by_teacher = false;
  }

  if (rawReport.includes("CUSTOM_STUDENTS: true")) {
    has_custom_students = true;
  } else if (rawReport.includes("CUSTOM_STUDENTS: false")) {
    has_custom_students = false;
  }

  if (rawReport.includes("// ATTENDANCE:")) {
    try {
      const parts = rawReport.split("// ATTENDANCE:");
      const attCandidate = parts[parts.length - 1] || parts[1];
      const jsonCandidate = attCandidate
        .split("// MAKEUP_SCHEDULED:")[0]
        .split("// ALLOW_MAKEUP:")[0]
        .split("// CANCELLED_BY_TEACHER:")[0]
        .split("// CUSTOM_STUDENTS:")[0]
        .split("// VOCAL_ROUTINE:")[0]
        .trim();
      attendance = JSON.parse(jsonCandidate);
    } catch (e) {
      console.warn("Could not parse attendance from report string:", e);
    }
  }

  if (rawReport.includes("// VOCAL_ROUTINE:")) {
    const parts = rawReport.split("// VOCAL_ROUTINE:");
    report = parts[0].trim();
    const vocalCandidate = parts.slice(1).join("// VOCAL_ROUTINE:");
    vocal_routine = vocalCandidate
      .split("// ATTENDANCE:")[0]
      .split("// MAKEUP_SCHEDULED:")[0]
      .split("// ALLOW_MAKEUP:")[0]
      .split("// CANCELLED_BY_TEACHER:")[0]
      .split("// CUSTOM_STUDENTS:")[0]
      .trim();
  } else {
    report = rawReport
      .split("// ATTENDANCE:")[0]
      .split("// MAKEUP_SCHEDULED:")[0]
      .split("// ALLOW_MAKEUP:")[0]
      .split("// CANCELLED_BY_TEACHER:")[0]
      .split("// CUSTOM_STUDENTS:")[0]
      .trim();
  }

  return {
    report: (report || "").trim(),
    vocal_routine: (vocal_routine || "").trim(),
    attendance,
    makeup_scheduled,
    allow_makeup,
    cancelled_by_teacher,
    has_custom_students,
  };
}

export type UserProfile = {
  id: string;
  email: string;
  role: "super_admin" | "admin" | "teacher";
  teacher_id?: string;
  temp_password?: string;
  access_status?: 'active' | 'blocked';
  created_at?: string;
};

export type Credit = {
  id: string;
  student_id?: string;
  enrollment_id?: string;
  group_id?: string;
  teacher_id: string;
  source_class_id: string;
  amount: number;
  status: "available" | "used" | "cancelled";
  competency_month: string;
  created_at?: string;
  used_date?: string;
  notes?: string;
};

export type CompetenceBillingCategory = 'individual' | 'group' | 'choir';
export type CompetenceBillingStatus = 'pending' | 'paid' | 'waived' | 'closed';

export type CompetenceBilling = {
  id: string;
  competence: string;
  category: 'individual' | 'group' | 'choir';
  enrollment_id: string | null;
  choir_registration_id: string | null;
  group_id: string | null;
  student_id: string | null;
  teacher_id: string | null;
  is_paying: boolean;
  base_price: number;
  discount: number;
  final_price: number;
  teacher_fee_type: string | null;
  teacher_fee_value: number | null;
  teacher_share: number;
  school_share: number;
  status: 'pending' | 'paid' | 'waived' | 'closed';
  transaction_id: string | null;
  is_frozen: boolean;
  frozen_at: string | null;
  frozen_by: string | null;
  metadata: Record<string, any>;
  created_at: string;
};

export function findCompetenceBilling(
  billings: CompetenceBilling[] | undefined,
  category: 'individual' | 'group' | 'choir',
  sourceId: string,
  competence: string
): CompetenceBilling | undefined {
  if (!billings || !Array.isArray(billings)) return undefined;
  const comp = (competence || '').trim();
  return billings.find((b) => {
    if (b.competence !== comp) return false;
    if (category === 'individual') return b.category === 'individual' && b.enrollment_id === sourceId;
    if (category === 'group') return b.category === 'group' && b.group_id === sourceId;
    if (category === 'choir') return b.category === 'choir' && b.choir_registration_id === sourceId;
    return false;
  });
}

export function validateCompetenceBillingInput(
  input: Partial<CompetenceBilling>
): { isValid: boolean; error?: string } {
  if (!input.category || !['individual', 'group', 'choir'].includes(input.category)) {
    return { isValid: false, error: 'Categoria inválida. Deve ser "individual", "group" ou "choir".' };
  }
  const comp = (input.competence || '').trim();
  if (!/^[0-9]{4}-[0-9]{2}$/.test(comp)) {
    return { isValid: false, error: 'Competência inválida. Deve estar no formato YYYY-MM.' };
  }
  if (input.category === 'individual') {
    if (!input.enrollment_id || input.group_id || input.choir_registration_id) {
      return { isValid: false, error: 'Origem incompatível: categoria "individual" exige enrollment_id e não permite group_id ou choir_registration_id.' };
    }
  } else if (input.category === 'group') {
    if (!input.group_id || input.enrollment_id || input.choir_registration_id) {
      return { isValid: false, error: 'Origem incompatível: categoria "group" exige group_id e não permite enrollment_id ou choir_registration_id.' };
    }
  } else if (input.category === 'choir') {
    if (!input.choir_registration_id || input.enrollment_id || input.group_id) {
      return { isValid: false, error: 'Origem incompatível: categoria "choir" exige choir_registration_id e não permite enrollment_id ou group_id.' };
    }
  }
  return { isValid: true };
}

type AppState = {
  students: Student[];
  teachers: Teacher[];
  classes: ClassSession[];
  transactions: Transaction[];
  financialPlans: FinancialPlan[];
  choirVoiceTypes: ChoirVoiceType[];
  choirRegistrations: ChoirRegistration[];
  choirCollaborators: ChoirCollaborator[];
  choirRehearsals: ChoirRehearsal[];
  enrollments: Enrollment[];
  discountRules: DiscountRule[];
  groups: Group[];
  prospects: Prospect[];
  profiles: UserProfile[];
  credits: Credit[];
  affiliates: Affiliate[];
  affiliateReferrals: AffiliateReferral[];
  affiliateCommissionRules: AffiliateCommissionRule[];
  affiliateClosings: AffiliateMonthlyClosing[];
  affiliateClosingItems: AffiliateClosingItem[];
  competenceBillings: CompetenceBilling[];
  globalError: string | null;
};

type AppContextType = {
  state: AppState;
  currentUserProfile: UserProfile | null;
  isProfileLoading: boolean;
  isSaving: boolean;
  setGlobalError: (error: string | null) => void;
  addStudent: (student: Omit<Student, "id">) => Promise<void> | void;
  updateStudent: (id: string, student: Partial<Student>) => Promise<void> | void;
  deleteStudent: (id: string) => Promise<void> | void;
  normalizeAllStudentPhones: () => Promise<{
    total: number;
    updatedCount: number;
    alreadyE164Count: number;
    invalidCount: number;
    reportItems: Array<{
      studentId: string;
      studentName: string;
      originalPhone: string;
      newPhone: string | null;
      status: "already_e164" | "normalized" | "empty" | "invalid";
      error?: string;
    }>;
  }>;

  activeTeachers: Teacher[];
  addTeacher: (teacher: Omit<Teacher, "id">) => void;
  updateTeacher: (id: string, teacher: Partial<Teacher>) => void;
  deleteTeacher: (id: string) => void;
  toggleTeacherStatus: (teacherId: string, status: 'active' | 'inactive') => Promise<{ success: boolean; error?: string }>;

  addClass: (session: Omit<ClassSession, "id">) => Promise<{ success: boolean; pending: boolean; error?: string; googleSyncPromise?: Promise<SyncResult> }>;
  updateClass: (id: string, session: Partial<ClassSession>) => Promise<{ success: boolean; pending: boolean; error?: string; googleSyncPromise?: Promise<SyncResult> }>;
  deleteClass: (id: string) => Promise<void>;
  googleSyncMap: Record<string, { status: 'synced' | 'failed' | 'pending' | 'unsynced'; error?: string; eventId?: string; lastAttemptAt?: string }>;
  resyncClassGoogle: (classId: string) => Promise<SyncResult>;
  reconcileGoogleCalendar: (teacherId?: string) => Promise<{
    totalChecked: number;
    totalEligible: number;
    synced: number;
    skipped: number;
    failed: number;
    remaining: number;
    details?: any[];
    error?: string;
  }>;
  refreshGoogleSyncStatus: () => Promise<void>;
  pendingClassSyncs: Record<string, PendingClassSync>;
  pendingSyncCount: number;
  syncPendingClasses: () => Promise<{ syncedCount: number; pendingCount: number }>;
  syncSingleClassSafely: (classId: string) => Promise<{ success: boolean; message: string; conflict?: boolean }>;
  inspectClassForRecovery: (classId: string) => Promise<ClassRecoveryInspection>;
  runClassAudit: (options?: { filterTeacherId?: string; filterDate?: string }) => Promise<AuditSummary>;
  recoverPendingClasses: (classIds?: string[]) => Promise<{ recoveredCount: number; failedCount: number; results: Array<{ id: string; success: boolean; message: string }> }>;
  resolveClassConflict: (classId: string, resolution: "use_local" | "use_remote" | "merge", mergedData?: Partial<ClassSession>) => Promise<{ success: boolean; message: string }>;
  latestAuditSummary: AuditSummary | null;
  isAuditing: boolean;

  addCredit: (credit: Omit<Credit, "id">) => Promise<{ success: boolean; error?: string }> | void;
  updateCredit: (id: string, credit: Partial<Credit>) => Promise<{ success: boolean; error?: string }>;
  deleteCredit: (id: string) => Promise<{ success: boolean; error?: string }>;
  reconcileRaphaelCredits: () => Promise<void> | void;

  addTransaction: (transaction: Omit<Transaction, "id">) => void;
  updateTransaction: (id: string, transaction: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;

  addFinancialPlan: (plan: Omit<FinancialPlan, "id">) => void;
  updateFinancialPlan: (id: string, plan: Partial<FinancialPlan>) => void;
  deleteFinancialPlan: (id: string) => void;

  addChoirVoiceType: (voiceType: Omit<ChoirVoiceType, "id">) => void;
  updateChoirVoiceType: (id: string, voiceType: Partial<ChoirVoiceType>) => void;
  deleteChoirVoiceType: (id: string) => void;

  addChoirRegistration: (registration: Omit<ChoirRegistration, "id">) => void;
  updateChoirRegistration: (id: string, registration: Partial<ChoirRegistration>) => void;
  deleteChoirRegistration: (id: string) => void;

  addChoirCollaborator: (collaborator: Omit<ChoirCollaborator, "id">) => void;
  updateChoirCollaborator: (id: string, collaborator: Partial<ChoirCollaborator>) => void;
  deleteChoirCollaborator: (id: string) => void;

  addChoirRehearsal: (rehearsal: Omit<ChoirRehearsal, "id">) => void;
  updateChoirRehearsal: (id: string, rehearsal: Partial<ChoirRehearsal>) => void;
  deleteChoirRehearsal: (id: string) => Promise<{ success: boolean; message?: string }>;
  generateBiweeklyRehearsals: (startDate: string, count: number, time?: string, titlePrefix?: string) => void;
  cleanDuplicateRehearsals: () => Promise<void>;

  addEnrollment: (enrollment: Omit<Enrollment, "id">) => Promise<EnrollmentPersistenceResult>;
  updateEnrollment: (id: string, enrollment: Partial<Enrollment>) => Promise<EnrollmentPersistenceResult>;
  deleteEnrollment: (id: string) => void;

  addDiscountRule: (rule: Omit<DiscountRule, "id">) => void;
  updateDiscountRule: (id: string, rule: Partial<DiscountRule>) => void;
  deleteDiscountRule: (id: string) => void;

  addGroup: (group: Omit<Group, "id">) => void;
  updateGroup: (id: string, group: Partial<Group>) => Promise<{ success: boolean; error?: any }>;
  deleteGroup: (id: string) => void;

  addProspect: (prospect: Omit<Prospect, "id">) => Promise<void>;
  updateProspect: (id: string, prospect: Partial<Prospect>) => Promise<void>;
  deleteProspect: (id: string) => Promise<void>;

  addProfile: (profile: UserProfile, password?: string) => Promise<void>;
  updateProfile: (id: string, profile: Partial<UserProfile>) => Promise<void>;
  deleteProfile: (id: string, email?: string) => Promise<void>;
  toggleProfileAccess: (
    profileId: string,
    accessStatus: 'active' | 'blocked'
  ) => Promise<{ success: boolean; error?: string; edgeFunctionMissing?: boolean; rpcMissing?: boolean }>;
  reloadCurrentUserProfile: (sessionUser?: { id: string } | null, options?: { silent?: boolean }) => Promise<void>;
  syncGroupFutureClasses: (groupId: string, overrideEnrollments?: Enrollment[]) => Promise<void>;

  addAffiliate: (affiliate: Omit<Affiliate, "id" | "created_at">) => Promise<void>;
  updateAffiliate: (id: string, affiliate: Partial<Affiliate>) => Promise<void>;
  deleteAffiliate: (id: string) => Promise<void>;

  addAffiliateReferral: (referral: Omit<AffiliateReferral, "id" | "created_at">) => Promise<void>;
  updateAffiliateReferral: (id: string, referral: Partial<AffiliateReferral>) => Promise<void>;
  deleteAffiliateReferral: (id: string) => Promise<void>;

  addAffiliateClosing: (
    closing: Omit<AffiliateMonthlyClosing, "id" | "created_at">,
    items: Omit<AffiliateClosingItem, "id" | "closing_id" | "created_at">[]
  ) => Promise<void>;
  reopenAffiliateClosing: (closingId: string, reason: string) => Promise<void>;

  getCompetenceBilling: (
    category: 'individual' | 'group' | 'choir',
    sourceId: string,
    competence: string
  ) => CompetenceBilling | undefined;
  createCompetenceBilling: (
    input: Omit<CompetenceBilling, 'id' | 'created_at'> & { id?: string }
  ) => Promise<CompetenceBilling>;
  updateCompetenceBilling: (
    id: string,
    updates: Partial<CompetenceBilling>
  ) => Promise<CompetenceBilling>;
  correctPendingCompetenceBilling: (
    input: {
      id: string;
      basePrice?: number;
      finalPrice: number;
      reason: string;
      confirmed: boolean;
      userRole?: string;
      userId?: string;
      userEmail?: string;
    }
  ) => Promise<CompetenceBilling>;
  freezeCompetenceBilling: (
    id: string,
    userId: string
  ) => Promise<CompetenceBilling>;
  ensureDueCompetenceBilling: (
    params: {
      category: CompetenceBillingCategory;
      sourceId: string;
      competence: string;
    }
  ) => Promise<CompetenceBilling | null>;
  ensureDueCompetencesForCycle: (
    competence: string
  ) => Promise<void>;
};

const AppContext = createContext<AppContextType | undefined>(undefined);

const generateId = () => crypto.randomUUID();

export const parseAttendance = (att: any): ChoirAttendanceRecord[] => {
  if (Array.isArray(att)) return att;
  if (typeof att === 'string') {
    try {
      const parsed = JSON.parse(att);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }
  return [];
};

export function mergeAndDeduplicateRehearsals(rehearsals: ChoirRehearsal[]) {
  if (!rehearsals || rehearsals.length === 0) {
    return { cleanRehearsals: [], deletedIds: [] };
  }

  const grouped = new Map<string, ChoirRehearsal[]>();
  for (const r of rehearsals) {
    if (!r || !r.date) continue;
    const dateKey = r.date.trim();
    if (!grouped.has(dateKey)) {
      grouped.set(dateKey, []);
    }
    grouped.get(dateKey)!.push(r);
  }

  const cleanRehearsals: ChoirRehearsal[] = [];
  const deletedIds: string[] = [];

  for (const [_, list] of grouped.entries()) {
    if (list.length === 1) {
      cleanRehearsals.push({
        ...list[0],
        attendance: parseAttendance(list[0].attendance)
      });
      continue;
    }

    // Multiple rehearsals on same date - pick canonical with most presents
    let canonical = list[0];
    let maxPresents = -1;

    for (const item of list) {
      const att = parseAttendance(item.attendance);
      const presents = att.filter(a => a.status === 'present').length;
      if (presents > maxPresents || (presents === maxPresents && att.length > parseAttendance(canonical.attendance).length)) {
        canonical = item;
        maxPresents = presents;
      }
    }

    // Merge attendance records from ALL duplicates
    const attendanceMap = new Map<string, ChoirAttendanceRecord>();
    for (const item of list) {
      const attList = parseAttendance(item.attendance);
      for (const rec of attList) {
        if (!rec || !rec.person_id) continue;
        const key = `${rec.person_id}_${rec.type || 'student'}`;
        if (!attendanceMap.has(key)) {
          attendanceMap.set(key, { ...rec });
        } else {
          const existing = attendanceMap.get(key)!;
          if (rec.status === 'present') {
            existing.status = 'present';
          }
          if (rec.notes && !existing.notes) {
            existing.notes = rec.notes;
          }
        }
      }
    }

    const mergedAttendance = Array.from(attendanceMap.values());

    cleanRehearsals.push({
      ...canonical,
      time: canonical.time || list.find(x => x.time)?.time || '19:30',
      title: canonical.title || list.find(x => x.title)?.title || 'Ensaio Quinzenal do Coral',
      notes: canonical.notes || list.find(x => x.notes)?.notes || 'Ensaio quinzenal programado',
      attendance: mergedAttendance
    });

    for (const item of list) {
      if (item.id !== canonical.id) {
        deletedIds.push(item.id);
      }
    }
  }

  return { cleanRehearsals, deletedIds };
}

export function mergeAndDeduplicateCollaborators(
  collabs: ChoirCollaborator[],
  rehearsals: ChoirRehearsal[]
) {
  if (!collabs || collabs.length === 0) {
    return { cleanCollabs: [], cleanRehearsals: rehearsals || [], deletedIds: [] };
  }

  const map = new Map<string, ChoirCollaborator>();
  const idMap = new Map<string, string>();
  const deletedIds: string[] = [];

  collabs.forEach(c => {
    if (!c || !c.name || !c.name.trim()) return;

    // Use normalized name as canonical grouping key
    const key = c.name.trim().toLowerCase();

    if (!map.has(key)) {
      map.set(key, { ...c });
      idMap.set(c.id, c.id);
    } else {
      const existing = map.get(key)!;
      deletedIds.push(c.id);
      idMap.set(c.id, existing.id);

      // Merge data: preserve richest role, remuneration, phone, email, teacher_id, and active status
      if ((c.remuneration_value || 0) > (existing.remuneration_value || 0)) {
        existing.remuneration_value = c.remuneration_value;
        existing.remuneration_type = c.remuneration_type || existing.remuneration_type;
      }
      if (c.active !== undefined && existing.active === undefined) {
        existing.active = c.active;
      }
      if (!existing.role || existing.role === 'Colaborador' || existing.role === 'Assistente Coral') {
        if (c.role && c.role !== 'Colaborador' && c.role !== 'Assistente Coral') {
          existing.role = c.role;
        } else if (!existing.role) {
          existing.role = c.role;
        }
      }
      if (!existing.phone && c.phone) existing.phone = c.phone;
      if (!existing.email && c.email) existing.email = c.email;
      if (!existing.notes && c.notes) existing.notes = c.notes;
      if (!existing.teacher_id && c.teacher_id) existing.teacher_id = c.teacher_id;
    }
  });

  const cleanCollabs = Array.from(map.values());

  const cleanRehearsals = (rehearsals || []).map(r => {
    const rawAtt = parseAttendance(r.attendance);
    let changed = false;
    const newAtt: ChoirAttendanceRecord[] = [];
    const seenPersons = new Set<string>();

    for (const att of rawAtt) {
      if (att.type === 'collaborator' && idMap.has(att.person_id)) {
        const canonicalId = idMap.get(att.person_id)!;
        if (canonicalId !== att.person_id) {
          changed = true;
        }
        const personKey = `collab:${canonicalId}`;
        if (!seenPersons.has(personKey)) {
          seenPersons.add(personKey);
          newAtt.push({ ...att, person_id: canonicalId });
        } else {
          const existingIdx = newAtt.findIndex(a => a.type === 'collaborator' && a.person_id === canonicalId);
          if (existingIdx !== -1 && att.status === 'present') {
            newAtt[existingIdx].status = 'present';
          }
          changed = true;
        }
      } else {
        newAtt.push(att);
      }
    }

    return changed ? { ...r, attendance: newAtt } : r;
  });

  return { cleanCollabs, cleanRehearsals, deletedIds };
}

const syncRehearsalsToSupabase = async (rehearsals: ChoirRehearsal[]) => {
  const currentList = rehearsals || [];
  if (currentList.length > 0) {
    for (const r of currentList) {
      const attendanceRecords = parseAttendance(r.attendance);
      const dbPayload = {
        id: r.id,
        date: r.date,
        time: r.time || '19:30',
        title: r.title || 'Ensaio Quinzenal do Coral',
        notes: r.notes || '',
        attendance: JSON.stringify(attendanceRecords)
      };
      try {
        const { error: fullErr } = await supabase.from('choir_rehearsals').upsert(dbPayload);
        if (fullErr) {
          console.warn('Upserting full rehearsal failed, trying minimal payload:', fullErr.message || fullErr);
          const minimalPayload = {
            id: r.id,
            date: r.date,
            title: r.title || 'Ensaio Quinzenal do Coral',
            attendance: JSON.stringify(attendanceRecords)
          };
          const { error: minErr } = await supabase.from('choir_rehearsals').upsert(minimalPayload);
          if (minErr) {
            console.warn('Upserting minimal rehearsal with attendance failed, trying basic payload without attendance:', minErr.message || minErr);
            const basicPayload = {
              id: r.id,
              date: r.date,
              title: r.title || 'Ensaio Quinzenal do Coral'
            };
            await supabase.from('choir_rehearsals').upsert(basicPayload);
          }
        }
      } catch (e) {
        console.warn('Error upserting choir rehearsal:', e);
      }
    }
  }
};

const syncCollaboratorsToSupabase = async (collaborators: ChoirCollaborator[]) => {
  const currentList = collaborators || [];
  if (currentList.length > 0) {
    for (const c of currentList) {
      try {
        const { error: fullErr } = await supabase.from('choir_collaborators').upsert(c);
        if (fullErr) {
          console.warn('Upserting full choir collaborator failed, trying adaptive payload:', fullErr.message || fullErr);
          
          const adaptivePayload: any = {
            id: c.id,
            name: c.name,
            role: c.role || 'Colaborador',
            remuneration_type: c.remuneration_type || 'per_rehearsal',
            remuneration_value: c.remuneration_value !== undefined ? c.remuneration_value : 0,
            pix_key: c.notes || '',
            active: c.active !== false,
          };
          if (c.teacher_id) adaptivePayload.teacher_id = c.teacher_id;
          if (c.phone) adaptivePayload.phone = c.phone;
          if (c.email) adaptivePayload.email = c.email;
          if (c.notes) adaptivePayload.notes = c.notes;
          
          const { error: adaptErr } = await supabase.from('choir_collaborators').upsert(adaptivePayload);
          if (adaptErr) {
            console.warn('Upserting adaptive collaborator failed, trying minimal payload:', adaptErr.message || adaptErr);
            
            const minimalPayload: any = {
              id: c.id,
              name: c.name,
              role: c.role || 'Colaborador',
              pix_key: c.notes || '',
              active: c.active !== false,
            };
            await supabase.from('choir_collaborators').upsert(minimalPayload);
          }
        }
      } catch (e) {
        console.warn('Error upserting choir collaborator:', e);
      }
    }
  }
};

export interface EffectiveScope {
  isSuperAdmin: boolean;
  isTeacher: boolean;
  isAdmin: boolean;
  hasTeacherLinked: boolean;
  effectiveTeacherId: string | null;
  scopeDescription: string;
}

export const getEffectiveAuditScope = (
  userProfile: UserProfile | null | undefined,
  teachers: Teacher[] = [],
  filterTeacherId?: string
): EffectiveScope => {
  const isSuperAdmin = userProfile?.role === "super_admin";
  const isTeacher = userProfile?.role === "teacher";
  const isAdmin = userProfile?.role === "admin";
  const userTeacherId = userProfile?.teacher_id?.trim() || null;

  if (isSuperAdmin) {
    const effectiveTeacherId = (filterTeacherId && filterTeacherId !== "all") ? filterTeacherId : null;
    const teacherName = effectiveTeacherId ? (teachers.find(t => t.id === effectiveTeacherId)?.name || "Professor Selecionado") : "Todos os Professores (Visão Global)";
    return {
      isSuperAdmin: true,
      isTeacher: false,
      isAdmin: false,
      hasTeacherLinked: !!userTeacherId,
      effectiveTeacherId,
      scopeDescription: teacherName
    };
  }

  if (isTeacher) {
    const effectiveTeacherId = userTeacherId || "unassigned_teacher";
    const teacherName = teachers.find(t => t.id === effectiveTeacherId)?.name || userProfile?.email || "Minhas Aulas";
    return {
      isSuperAdmin: false,
      isTeacher: true,
      isAdmin: false,
      hasTeacherLinked: !!userTeacherId,
      effectiveTeacherId,
      scopeDescription: teacherName
    };
  }

  if (isAdmin) {
    if (userTeacherId) {
      const teacherName = teachers.find(t => t.id === userTeacherId)?.name || userProfile?.email || "Aulas Vinculadas";
      return {
        isSuperAdmin: false,
        isTeacher: false,
        isAdmin: true,
        hasTeacherLinked: true,
        effectiveTeacherId: userTeacherId,
        scopeDescription: teacherName
      };
    }
    return {
      isSuperAdmin: false,
      isTeacher: false,
      isAdmin: true,
      hasTeacherLinked: false,
      effectiveTeacherId: "unassigned_admin",
      scopeDescription: "Admin: Escopo Restrito (Sem Professor Vinculado)"
    };
  }

  return {
    isSuperAdmin: false,
    isTeacher: false,
    isAdmin: false,
    hasTeacherLinked: false,
    effectiveTeacherId: userTeacherId || "unassigned_user",
    scopeDescription: "Acesso Restrito"
  };
};

export const resolveTeacherIdForPendingSync = (
  p: PendingClassSync,
  groupsMap: Map<string, Group>,
  localClassesMap: Map<string, ClassSession>,
  remoteClassesMap?: Map<string, any>
): string => {
  if (p.teacher_id && p.teacher_id.trim() !== '') {
    return p.teacher_id.trim();
  }
  if (p.group_id) {
    const grp = groupsMap.get(p.group_id);
    if (grp?.teacher_id && grp.teacher_id.trim() !== '') {
      return grp.teacher_id.trim();
    }
  }
  if (p.class_id) {
    const loc = localClassesMap.get(p.class_id);
    if (loc) {
      if (loc.teacher_id && loc.teacher_id.trim() !== '') return loc.teacher_id.trim();
      if (loc.group_id) {
        const grp = groupsMap.get(loc.group_id);
        if (grp?.teacher_id && grp.teacher_id.trim() !== '') return grp.teacher_id.trim();
      }
    }
  }
  if (p.class_id && remoteClassesMap) {
    const rem = remoteClassesMap.get(p.class_id);
    if (rem) {
      if (rem.teacher_id && rem.teacher_id.trim() !== '') return rem.teacher_id.trim();
      if (rem.group_id) {
        const grp = groupsMap.get(rem.group_id);
        if (grp?.teacher_id && grp.teacher_id.trim() !== '') return grp.teacher_id.trim();
      }
    }
  }
  return '';
};

export const findGroupMatch = (title: string, groups: Group[] | any[]): Group | undefined => {
  if (!title || !groups || groups.length === 0) return undefined;

  const cleanTitle = title.toLowerCase().trim().replace(/_/g, ' ');
  const sortedGroups = [...groups].sort((a, b) => ((b.name || '').length - (a.name || '').length));

  for (const g of sortedGroups) {
    if (!g.name) continue;
    const cleanName = g.name.toLowerCase().trim().replace(/_/g, ' ');
    if (!cleanName) continue;

    if (
      cleanTitle === cleanName ||
      cleanTitle === `aula de ${cleanName}` ||
      cleanTitle === `turma ${cleanName}` ||
      cleanTitle === `grupo ${cleanName}`
    ) {
      return g;
    }
  }

  return undefined;
};

export interface ClassComparisonResult {
  isEquivalent: boolean;
  category: ClassAuditCategory;
  diffSummary: string[];
}

/**
 * Unified comparison engine to classify classes between local state/pending syncs and Supabase.
 * Enforces business rules:
 * - Priority given to class status (cancellations are NOT converted to completed simply because of reports/attendance)
 * - CANCELLED + CANCELLED => SINCRONIZADA
 * - SCHEDULED + SCHEDULED => SINCRONIZADA (unless local has unsynced report/attendance)
 * - COMPLETED + COMPLETED => SINCRONIZADA (if equivalent)
 * - COMPLETED local + SCHEDULED remote => RECUPERAÇÃO DISPONÍVEL
 * - Date/time/teacher discrepancies => CONFERÊNCIA NECESSÁRIA (Divergência Estrutural)
 * - Conflicting pedagogical data => CONFLITO
 */
export function compareAndClassifyClass(
  local?: Partial<ClassSession> | PendingClassSync | null,
  remote?: Partial<ClassSession> | any | null,
  teachersMap?: Map<string, Teacher>
): ClassComparisonResult {
  const diffSummary: string[] = [];

  if (!local && !remote) {
    return { isEquivalent: true, category: "synced", diffSummary: [] };
  }

  if (local && !remote) {
    diffSummary.push("Existe apenas no navegador local (ainda não inserida no Supabase).");
    return { isEquivalent: false, category: "local_only", diffSummary };
  }

  if (!local && remote) {
    diffSummary.push("Existe apenas no Supabase remoto.");
    return { isEquivalent: false, category: "remote_only", diffSummary };
  }

  const loc = local!;
  const rem = remote!;

  // 1. Structural Comparisons
  const formatPtBrDate = (d?: string) => d && d.includes('-') ? d.split('-').reverse().join('/') : (d || '-');

  const normLocalDate = (loc.date || '').trim();
  const normRemoteDate = (rem.date || '').trim();
  const isDateDiff = Boolean(normLocalDate && normRemoteDate && normLocalDate !== normRemoteDate);

  const localStart = (loc.start_time || '').substring(0, 5);
  const remoteStart = (rem.start_time || '').substring(0, 5);
  const isStartTimeDiff = Boolean(localStart && remoteStart && localStart !== remoteStart);

  const localEnd = (loc.end_time || '').substring(0, 5);
  const remoteEnd = (rem.end_time || '').substring(0, 5);
  const isEndTimeDiff = Boolean(localEnd && remoteEnd && localEnd !== remoteEnd);

  const localTeacherId = (loc.teacher_id || '').trim();
  const remoteTeacherId = (rem.teacher_id || '').trim();
  const isTeacherDiff = Boolean(localTeacherId && remoteTeacherId && localTeacherId !== remoteTeacherId);

  const localGroupId = (loc.group_id || '').trim();
  const remoteGroupId = (rem.group_id || '').trim();
  const isGroupDiff = Boolean(localGroupId && remoteGroupId && localGroupId !== remoteGroupId);

  const localSids = [...(loc.student_ids || [])].sort();
  const remoteSids = [...(rem.student_ids || [])].sort();
  const isStudentIdsDiff = (localSids.length > 0 && remoteSids.length > 0) &&
    (localSids.length !== remoteSids.length || localSids.some((id, idx) => id !== remoteSids[idx]));

  const isStructuralDiff = isDateDiff || isStartTimeDiff || isEndTimeDiff || isTeacherDiff || isGroupDiff || isStudentIdsDiff;

  if (isDateDiff) {
    diffSummary.push(`⚠️ Data divergente: Local [${formatPtBrDate(normLocalDate)}] vs Supabase [${formatPtBrDate(normRemoteDate)}]`);
  }
  if (isStartTimeDiff || isEndTimeDiff) {
    diffSummary.push(`⚠️ Horário divergente: Local [${localStart}-${localEnd}] vs Supabase [${remoteStart}-${remoteEnd}]`);
  }
  if (isTeacherDiff) {
    const locTeacher = teachersMap?.get(localTeacherId)?.name || localTeacherId;
    const remTeacher = teachersMap?.get(remoteTeacherId)?.name || remoteTeacherId;
    diffSummary.push(`⚠️ Professor divergente: Local [${locTeacher}] vs Supabase [${remTeacher}]`);
  }
  if (isGroupDiff) {
    diffSummary.push(`⚠️ Grupo de aula divergente entre dispositivo e Supabase.`);
  }
  if (isStudentIdsDiff) {
    diffSummary.push(`⚠️ Alunos vinculados divergentes entre dispositivo e Supabase.`);
  }

  // 2. Pedagogical Fields & Metadata Parsing
  const locParsed = parsePackedReport(loc.report);
  const remParsed = parsePackedReport(rem.report);

  const locReport = (loc.report && loc.report.includes("//") ? locParsed.report : (loc.report || "")).trim();
  const remReport = (rem.report && rem.report.includes("//") ? remParsed.report : (rem.report || "")).trim();

  const locVocal = (loc.vocal_routine || locParsed.vocal_routine || "").trim();
  const remVocal = (rem.vocal_routine || remParsed.vocal_routine || "").trim();

  const locAtt = (loc.attendance && Object.keys(loc.attendance).length > 0) ? loc.attendance : (locParsed.attendance || {});
  const remAtt = (rem.attendance && Object.keys(rem.attendance).length > 0) ? rem.attendance : (remParsed.attendance || {});

  const localHasRep = locReport.length > 0 && !locReport.startsWith("Aula de reposição");
  const remoteHasRep = remReport.length > 0 && !remReport.startsWith("Aula de reposição");
  const localHasVocal = locVocal.length > 0;
  const remoteHasVocal = remVocal.length > 0;
  const localHasAtt = Object.keys(locAtt).length > 0;
  const remoteHasAtt = Object.keys(remAtt).length > 0;

  // Status values:
  const localStatus = (loc.status || 'scheduled').toLowerCase();
  const remoteStatus = (rem.status || 'scheduled').toLowerCase();

  // 3. Pedagogical Conflicts (both sides have non-empty divergent pedagogical data)
  const isReportConflict = Boolean(localHasRep && remoteHasRep && locReport !== remReport);
  const isVocalConflict = Boolean(localHasVocal && remoteHasVocal && locVocal !== remVocal);

  let isAttConflict = false;
  if (localHasAtt && remoteHasAtt) {
    const allStudentKeys = new Set([...Object.keys(locAtt), ...Object.keys(remAtt)]);
    for (const sid of Array.from(allStudentKeys)) {
      const locVal = locAtt[sid];
      const remVal = remAtt[sid];
      if (locVal && remVal && locVal !== remVal) {
        isAttConflict = true;
        break;
      }
    }
  }

  if (isReportConflict || isVocalConflict || isAttConflict) {
    if (isReportConflict) diffSummary.push("Conflito no relatório de aula: conteúdo local difere do remoto.");
    if (isVocalConflict) diffSummary.push("Conflito na rotina vocal: conteúdo local difere do remoto.");
    if (isAttConflict) diffSummary.push("Conflito no registro de presenças dos alunos.");
    return { isEquivalent: false, category: "conflict", diffSummary };
  }

  // 4. Structural differences -> Conferência Necessária
  if (isStructuralDiff) {
    return { isEquivalent: false, category: "manual_check", diffSummary };
  }

  // 5. CANCELLED + CANCELLED => SINCRONIZADA
  if (localStatus === 'cancelled' && remoteStatus === 'cancelled') {
    return { isEquivalent: true, category: "synced", diffSummary: [] };
  }

  // 6. SCHEDULED + SCHEDULED => SINCRONIZADA (unless local has unsynced pedagogical content)
  if (localStatus === 'scheduled' && remoteStatus === 'scheduled') {
    if (!localHasRep && !localHasVocal && !localHasAtt) {
      return { isEquivalent: true, category: "synced", diffSummary: [] };
    }
    if ((localHasRep && !remoteHasRep) || (localHasVocal && !remoteHasVocal) || (localHasAtt && !remoteHasAtt)) {
      if (localHasRep && !remoteHasRep) diffSummary.push("Relatório preenchido localmente mas ausente no Supabase.");
      if (localHasVocal && !remoteHasVocal) diffSummary.push("Conduta vocal preenchida localmente mas ausente no Supabase.");
      if (localHasAtt && !remoteHasAtt) diffSummary.push("Lista de presença preenchida localmente mas ausente no Supabase.");
      return { isEquivalent: false, category: "pending", diffSummary };
    }
    return { isEquivalent: true, category: "synced", diffSummary: [] };
  }

  // 7. COMPLETED + COMPLETED => SINCRONIZADA (if content matches or remote already has content)
  if (localStatus === 'completed' && remoteStatus === 'completed') {
    if ((localHasRep && !remoteHasRep) || (localHasVocal && !remoteHasVocal) || (localHasAtt && !remoteHasAtt)) {
      if (localHasRep && !remoteHasRep) diffSummary.push("Relatório preenchido localmente mas ausente no Supabase.");
      if (localHasVocal && !remoteHasVocal) diffSummary.push("Conduta vocal preenchida localmente mas ausente no Supabase.");
      if (localHasAtt && !remoteHasAtt) diffSummary.push("Lista de presença preenchida localmente mas ausente no Supabase.");
      return { isEquivalent: false, category: "pending", diffSummary };
    }
    return { isEquivalent: true, category: "synced", diffSummary: [] };
  }

  // 8. COMPLETED local + SCHEDULED remote => RECUPERAÇÃO DISPONÍVEL
  if (localStatus === 'completed' && remoteStatus === 'scheduled') {
    diffSummary.push("Status concluído localmente mas marcado como agendado no Supabase.");
    if (localHasRep && !remoteHasRep) diffSummary.push("Relatório preenchido localmente mas ausente no Supabase.");
    if (localHasVocal && !remoteHasVocal) diffSummary.push("Conduta vocal preenchida localmente mas ausente no Supabase.");
    if (localHasAtt && !remoteHasAtt) diffSummary.push("Lista de presença preenchida localmente mas ausente no Supabase.");
    return { isEquivalent: false, category: "pending", diffSummary };
  }

  // 9. Remote CANCELLED + local not cancelled => CONFERÊNCIA
  if (remoteStatus === 'cancelled' && localStatus !== 'cancelled') {
    diffSummary.push(`Status divergente: Local [${localStatus}] vs Supabase [cancelada]`);
    return { isEquivalent: false, category: "manual_check", diffSummary };
  }

  // 10. Local CANCELLED + remote not cancelled => RECUPERAÇÃO (cancelamento precisa sincronizar)
  if (localStatus === 'cancelled' && remoteStatus !== 'cancelled') {
    diffSummary.push(`Status cancelado localmente mas no Supabase consta como [${remoteStatus}]`);
    return { isEquivalent: false, category: "pending", diffSummary };
  }

  // 11. Generic Status match
  if (localStatus === remoteStatus) {
    return { isEquivalent: true, category: "synced", diffSummary: [] };
  }

  diffSummary.push(`Status divergente: Local [${localStatus}] vs Supabase [${remoteStatus}]`);
  return { isEquivalent: false, category: "pending", diffSummary };
}

export const computeScopedPendingSyncs = (
  pendingMap: Record<string, PendingClassSync>,
  userProfile: UserProfile | null | undefined,
  classes: ClassSession[] = [],
  groups: Group[] = [],
  teachers: Teacher[] = [],
  remoteClassesMap?: Map<string, any>
): PendingClassSync[] => {
  const scope = getEffectiveAuditScope(userProfile, teachers);
  if (scope.isAdmin && !scope.hasTeacherLinked) {
    return [];
  }
  if (!scope.isSuperAdmin && !scope.isTeacher && !scope.isAdmin) {
    return [];
  }

  const groupsMap = new Map<string, Group>(groups.map(g => [g.id, g]));
  const localClassesMap = new Map<string, ClassSession>(classes.map(c => [c.id, c]));
  const teachersMap = new Map<string, Teacher>(teachers.map(t => [t.id, t]));

  const allItems = Object.values(pendingMap);
  return allItems.filter(item => {
    // If this pending item is already equivalent to confirmed state, it's not an active pending action!
    const targetRemote = remoteClassesMap?.get(item.class_id);
    const targetLocal = localClassesMap.get(item.class_id);
    if (targetRemote) {
      const comp = compareAndClassifyClass(item, targetRemote, teachersMap);
      if (comp.isEquivalent || comp.category === "synced") {
        return false;
      }
    } else if (targetLocal && !item.is_offline_created) {
      const comp = compareAndClassifyClass(item, targetLocal, teachersMap);
      if (comp.isEquivalent || comp.category === "synced") {
        return false;
      }
    }

    if (scope.isSuperAdmin && !scope.effectiveTeacherId) {
      return true;
    }
    const resolvedTeacherId = resolveTeacherIdForPendingSync(item, groupsMap, localClassesMap, remoteClassesMap);
    if (!resolvedTeacherId) {
      return false;
    }
    return resolvedTeacherId === scope.effectiveTeacherId;
  });
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [state, setState] = useState<AppState>(() => {
    const defaultState: AppState = {
      students: [],
      teachers: [],
      classes: [],
      transactions: [],
      financialPlans: [],
      choirVoiceTypes: [],
      choirRegistrations: [],
      choirCollaborators: [],
      choirRehearsals: [],
      enrollments: [],
      discountRules: [],
      groups: [],
      prospects: [],
      profiles: [],
      credits: [],
      affiliates: [],
      affiliateReferrals: [],
      affiliateCommissionRules: [],
      affiliateClosings: [],
      affiliateClosingItems: [],
      competenceBillings: [],
      globalError: null,
    };
    const saved = localStorage.getItem("music_school_state");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...defaultState,
          ...parsed,
          students: parsed.students || [],
          teachers: (parsed.teachers || []).map((t: any) => ({
            ...t,
            status: (t.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
          })),
          classes: parsed.classes || [],
          transactions: parsed.transactions || [],
          financialPlans: parsed.financialPlans || [],
          choirVoiceTypes: parsed.choirVoiceTypes || [],
          choirRegistrations: parsed.choirRegistrations || [],
          choirCollaborators: parsed.choirCollaborators || [],
          choirRehearsals: parsed.choirRehearsals || [],
          enrollments: parsed.enrollments || [],
          discountRules: parsed.discountRules || [],
          groups: parsed.groups || [],
          prospects: parsed.prospects || [],
          profiles: Array.from(new Map(((parsed.profiles || []) as UserProfile[]).map((p: any) => [p.id, p])).values()),
          credits: parsed.credits || [],
          affiliates: parsed.affiliates || [],
          affiliateReferrals: parsed.affiliateReferrals || [],
          affiliateCommissionRules: parsed.affiliateCommissionRules || [],
          affiliateClosings: parsed.affiliateClosings || [],
          affiliateClosingItems: parsed.affiliateClosingItems || [],
          competenceBillings: [], // Supabase is the sole source of truth
        };
      } catch (e) {
        console.error("Failed to parse state", e);
      }
    }
    return defaultState;
  });

  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const currentUserProfileRef = useRef<UserProfile | null>(null);
  useEffect(() => {
    currentUserProfileRef.current = currentUserProfile;
  }, [currentUserProfile]);

  const [isProfileLoading, setIsProfileLoading] = useState(true);

  const reloadCurrentUserProfile = async (
    sessionUser?: { id: string } | null,
    options?: { silent?: boolean }
  ) => {
    if (sessionUser === null) {
      currentUserProfileRef.current = null;
      setCurrentUserProfile(null);
      setIsProfileLoading(false);
      return;
    }

    // Se options?.silent for true, ou se já existe perfil em memória, a revalidação é silenciosa
    // em segundo plano (stale-while-revalidate), NÃO ativando o spinner e NÃO desmontando telas.
    const isSilent = options?.silent ?? (currentUserProfileRef.current !== null);
    if (!isSilent) {
      setIsProfileLoading(true);
    }

    // Timeout de segurança de 10s para redes móveis instáveis: impede carregamento infinito sem conceder acesso falso
    const timeoutPromise = new Promise<{ data: { user: null }; error: Error }>((resolve) => {
      setTimeout(() => {
        resolve({ data: { user: null }, error: new Error('Profile fetch timed out') });
      }, 10000);
    });

    try {
      let user: { id: string; email?: string } | null = (sessionUser as any) || null;
      if (!user) {
        const userResult = await Promise.race([
          supabase.auth.getUser(),
          timeoutPromise,
        ]);
        user = (userResult?.data?.user as any) || null;
      }

      if (user && user.id) {
        let userProfile: UserProfile | null = null;
        const cleanEmail = (user.email || '').trim().toLowerCase();

        // 1. Buscar perfil prioritariamente pelo ID de autenticação
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

          if (!error && data) {
            userProfile = data;
          } else if (error) {
            console.warn('[AUTH] Could not fetch user profile by ID from Supabase:', error.message);
          }
        } catch (e) {
          console.warn('[AUTH] Could not fetch user profile by ID from Supabase:', e);
        }

        // 2. Se não encontrar e houver email: buscar por email normalizado (resiliência contra divergência de ID)
        if (!userProfile && cleanEmail) {
          try {
            const { data: profileByEmail, error: emailErr } = await supabase
              .from('profiles')
              .select('*')
              .ilike('email', cleanEmail)
              .maybeSingle();

            if (!emailErr && profileByEmail) {
              console.warn(
                `[AUTH DIAGNÓSTICO] Inconsistência de identificador detectada para ${cleanEmail}: ` +
                `auth user.id (${user.id}) diverge do profiles.id (${profileByEmail.id}). ` +
                `Perfil carregado com sucesso por e-mail com role "${profileByEmail.role}".`
              );
              userProfile = profileByEmail;
            } else if (emailErr) {
              console.warn('[AUTH] Erro ao buscar perfil por email:', emailErr.message);
            }
          } catch (e) {
            console.warn('[AUTH] Erro ao buscar perfil por email:', e);
          }
        }

        // 3. Fallback no cache local em memória (state.profiles)
        if (!userProfile) {
          const localById = state.profiles.find(p => p.id === user!.id);
          if (localById) {
            userProfile = localById;
          } else if (cleanEmail) {
            const localByEmail = state.profiles.find(p => (p.email || '').trim().toLowerCase() === cleanEmail);
            if (localByEmail) {
              console.warn(`[AUTH DIAGNÓSTICO] Perfil recuperado de state.profiles por e-mail para ${cleanEmail}.`);
              userProfile = localByEmail;
            }
          }
        }

        // 4. Validação Crítica: Se perfil estiver com acesso bloqueado, revogar sessão imediatamente
        if (userProfile && userProfile.access_status === 'blocked') {
          console.warn('[AUTH] Acesso bloqueado pela administração da escola para usuário.');
          await supabase.auth.signOut();
          currentUserProfileRef.current = null;
          setCurrentUserProfile(null);
          setGlobalError('Acesso bloqueado pela administração da escola. Entre em contato com a coordenação.');
          return;
        }

        // 5. Se o perfil for resolvido, atualiza currentUserProfile; se NÃO for encontrado, define null SEM assumir teacher
        if (userProfile) {
          currentUserProfileRef.current = userProfile;
          setCurrentUserProfile(userProfile);
        } else {
          console.warn('[AUTH SEGURANÇA] Perfil de usuário não localizado nem por ID nem por e-mail. currentUserProfile definido como null sem atribuição de roles.');
          currentUserProfileRef.current = null;
          setCurrentUserProfile(null);
        }
      } else {
        // Falha transitória de rede ou timeout ao voltar do segundo plano:
        // NÃO destruir o perfil existente se já houver um carregado em memória!
        if (currentUserProfileRef.current) {
          console.warn('[AUTH] Verificação de usuário em background não obteve resposta imediata; mantendo perfil ativo.');
        } else {
          setCurrentUserProfile(null);
        }
      }
    } catch (error: any) {
      console.error('[AUTH] Erro ao carregar perfil do usuário:', error?.message || 'Erro inesperado');
      // Preserva a segurança: mantém o perfil existente em caso de erro transitório
    } finally {
      if (!isSilent) {
        setIsProfileLoading(false);
      }
    }
  };

  useEffect(() => {
    reloadCurrentUserProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        classGoogleEventsMapRef.current.clear();
        currentUserProfileRef.current = null;
        setCurrentUserProfile(null);
        setIsProfileLoading(false);
        return;
      }

      if (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED' ||
        event === 'INITIAL_SESSION'
      ) {
        const isSilent = currentUserProfileRef.current !== null;
        void reloadCurrentUserProfile(session.user, { silent: isSilent });
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("music_school_state", JSON.stringify(state));
  }, [state]);

  const setGlobalError = (error: string | null) => {
    setState((s) => ({ ...s, globalError: error }));
  };

  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const activeSavingCountRef = useRef(0);
  const lastSaveTimestampRef = useRef<number>(0);
  const currentFetchIdRef = useRef<number>(0);
  const isFetchingRef = useRef(false);
  const localEditsVersionRef = useRef<number>(0);
  const recentlySavedClassesRef = useRef<Map<string, {
    classData: ClassSession;
    timestamp: number;
    updatedFields: Array<keyof ClassSession>;
    confirmedBySelect?: boolean;
  }>>(new Map());
  const syncTriggeredRef = useRef(false);
  const syncProfilesTriggeredRef = useRef(false);

  // Persistent pending queue for class changes that await Supabase confirmation
  const getStoredPendingSyncs = (): Record<string, PendingClassSync> => {
    try {
      const raw = localStorage.getItem("pending_class_syncs_v1");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const saveStoredPendingSyncs = (map: Record<string, PendingClassSync>) => {
    try {
      localStorage.setItem("pending_class_syncs_v1", JSON.stringify(map));
    } catch (e) {
      console.warn("Error persisting pending class syncs:", e);
    }
  };

  const [pendingClassSyncs, setPendingClassSyncs] = useState<Record<string, PendingClassSync>>(() => getStoredPendingSyncs());
  const classGoogleEventsMapRef = useRef<Map<string, {
    platformClassId: string;
    googleEventId: string;
    googleCalendarId?: string;
    teacherId?: string | null;
  }>>(new Map());
  const inFlightGoogleSyncRef = useRef<Map<string, Promise<SyncResult>>>(new Map());

  // Rastreamento estruturado de status de sincronização Google Calendar
  const [googleSyncMap, setGoogleSyncMap] = useState<Record<string, {
    status: 'synced' | 'failed' | 'pending' | 'unsynced';
    error?: string;
    eventId?: string;
    lastAttemptAt?: string;
  }>>({});

  const setGoogleClassSyncStatus = (classId: string, info: {
    status: 'synced' | 'failed' | 'pending' | 'unsynced';
    error?: string;
    eventId?: string;
    lastAttemptAt?: string;
  }) => {
    setGoogleSyncMap(prev => ({
      ...prev,
      [classId]: info,
    }));
  };

  const refreshGoogleSyncStatus = async (): Promise<void> => {
    try {
      const res = await fetchUnsyncedClassesStatus();
      if (res.success && Array.isArray(res.classes)) {
        setGoogleSyncMap(prev => {
          const next = { ...prev };
          for (const item of res.classes) {
            next[item.id] = {
              status: item.sync_status || 'unsynced',
              error: item.last_error || undefined,
              lastAttemptAt: item.last_attempt_at || undefined,
            };
          }
          return next;
        });
      }
    } catch (e) {
      console.warn('[GoogleSync] Falha ao atualizar status de sincronização:', e);
    }
  };

  const resyncClassGoogle = async (classId: string): Promise<SyncResult> => {
    setGoogleClassSyncStatus(classId, {
      status: 'pending',
      lastAttemptAt: new Date().toISOString(),
    });
    try {
      const res = await resyncClassWithGoogle(classId);
      const confirmedEventId = res.eventId || res.googleEventId;
      if (res.synced && confirmedEventId) {
        classGoogleEventsMapRef.current.set(classId, {
          platformClassId: classId,
          googleEventId: confirmedEventId,
          googleCalendarId: 'primary',
        });
        setGoogleClassSyncStatus(classId, {
          status: 'synced',
          eventId: confirmedEventId,
          lastAttemptAt: new Date().toISOString(),
        });
      } else {
        setGoogleClassSyncStatus(classId, {
          status: 'failed',
          error: res.error || res.actionTaken,
          lastAttemptAt: new Date().toISOString(),
        });
      }
      return res;
    } catch (e: any) {
      setGoogleClassSyncStatus(classId, {
        status: 'failed',
        error: e?.message || 'Erro ao resincronizar',
        lastAttemptAt: new Date().toISOString(),
      });
      return { synced: false, actionTaken: 'network_error', eventId: null, googleEventId: null, error: e?.message };
    }
  };

  const reconcileGoogleCalendar = async (teacherId?: string) => {
    try {
      const result = await reconcileGoogleClasses(teacherId);
      void refreshGoogleSyncStatus();
      return result;
    } catch (e: any) {
      console.warn('[GoogleSync] Falha na reconciliação do Google Calendar:', e);
      return {
        totalChecked: 0,
        totalEligible: 0,
        synced: 0,
        skipped: 0,
        failed: 0,
        remaining: 0,
        error: e?.message || 'Falha na reconciliação',
      };
    }
  };

  const [pendingSyncCount, setPendingSyncCount] = useState<number>(() => {
    const rawMap = getStoredPendingSyncs();
    return computeScopedPendingSyncs(rawMap, null, [], [], []).length;
  });

  // Keep pendingSyncCount in sync with the current user's authorized scope
  useEffect(() => {
    const scopedPending = computeScopedPendingSyncs(
      pendingClassSyncs,
      currentUserProfile,
      state.classes,
      state.groups,
      state.teachers
    );
    setPendingSyncCount(scopedPending.length);
  }, [pendingClassSyncs, currentUserProfile, state.classes, state.groups, state.teachers]);

  const executeSaveOperation = async <T,>(op: () => Promise<T>): Promise<T> => {
    activeSavingCountRef.current++;
    isSavingRef.current = true;
    setIsSaving(true);
    localEditsVersionRef.current++;
    lastSaveTimestampRef.current = Date.now();
    currentFetchIdRef.current++; // Invalidate any in-flight background fetches immediately

    try {
      return await op();
    } finally {
      lastSaveTimestampRef.current = Date.now();
      activeSavingCountRef.current = Math.max(0, activeSavingCountRef.current - 1);
      if (activeSavingCountRef.current === 0) {
        isSavingRef.current = false;
        setIsSaving(false);
      }
    }
  };

  // Safe paginated query to fetch all classes without truncation
  const fetchAllClassesFromSupabase = async () => {
    let allRows: any[] = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;
    let queryError: any = null;

    while (hasMore) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      try {
        const { data, error } = await supabase
          .from('classes')
          .select('*, class_students(student_id)')
          .order('date', { ascending: false })
          .range(from, to);

        if (error) {
          queryError = error;
          break;
        }

        if (data && data.length > 0) {
          allRows.push(...data);
          if (data.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
      } catch (e) {
        queryError = e;
        break;
      }
    }

    return { data: allRows, error: queryError };
  };

  // Dedicated background synchronization to safely push pending local changes to Supabase
  const syncPendingClasses = async (): Promise<{ syncedCount: number; pendingCount: number }> => {
    if (isSavingRef.current) {
      const remainingMap = getStoredPendingSyncs();
      const scopedCount = computeScopedPendingSyncs(remainingMap, currentUserProfile, state.classes, state.groups, state.teachers).length;
      return { syncedCount: 0, pendingCount: scopedCount };
    }

    const currentPending = getStoredPendingSyncs();
    const entries = Object.entries(currentPending);
    if (entries.length === 0) {
      setPendingSyncCount(0);
      return { syncedCount: 0, pendingCount: 0 };
    }

    let syncedCount = 0;
    const remainingPending = { ...currentPending };

    for (const [classId, item] of entries) {
      try {
        const { data: remoteData, error: fetchErr } = await supabase
          .from('classes')
          .select('id, date, start_time, end_time, teacher_id, group_id, title, status, report, allow_makeup, makeup_scheduled')
          .eq('id', classId)
          .maybeSingle();

        if (fetchErr) {
          console.warn(`[SYNC PENDING PRE-CHECK] Could not verify remote status for class ${classId}:`, fetchErr);
          remainingPending[classId] = {
            ...item,
            syncStatus: "error",
            lastError: `Falha na consulta prévia: ${fetchErr.message || "Erro de leitura"}`
          };
          continue; // ABORT for this item: Never attempt UPDATE or INSERT if pre-check SELECT failed!
        }

        const remoteParsed = parsePackedReport(remoteData?.report);
        const remoteHasReport = Boolean((remoteData?.report && remoteData.report.trim().length > 0 && !remoteData.report.trim().startsWith("Aula de reposição")) || (remoteParsed.report && remoteParsed.report.length > 0));
        const remoteHasVocal = Boolean(remoteParsed.vocal_routine && remoteParsed.vocal_routine.length > 0);
        const remoteHasAtt = Boolean(remoteParsed.attendance && Object.keys(remoteParsed.attendance).length > 0);

        const localHasReport = Boolean(item.report && item.report.trim().length > 0 && !item.report.trim().startsWith("Aula de reposição"));
        const localHasVocal = Boolean(item.vocal_routine && item.vocal_routine.trim().length > 0);
        const localHasAtt = Boolean(item.attendance && Object.keys(item.attendance).length > 0);

        if (remoteData) {
          const teachersMapForSync = new Map<string, Teacher>(state.teachers.map(t => [t.id, t]));
          const comparison = compareAndClassifyClass(item, remoteData, teachersMapForSync);
          if (comparison.isEquivalent || comparison.category === "synced") {
            delete remainingPending[classId];
            syncedCount++;
            continue;
          }
        }

        const dbReport = packReport(
          item.report || "",
          item.vocal_routine || "",
          item.attendance,
          item.makeup_scheduled,
          item.allow_makeup
        );

        let validTeacherId: string | null = null;
        if (item.teacher_id && item.teacher_id.trim() !== "") {
          const teacherExists = state.teachers.some(t => t.id === item.teacher_id);
          if (teacherExists) validTeacherId = item.teacher_id.trim();
        }

        let validGroupId: string | null = null;
        if (item.group_id && item.group_id.trim() !== "") {
          const groupExists = state.groups.some(g => g.id === item.group_id);
          if (groupExists) validGroupId = item.group_id.trim();
        }

        let finalStatus = item.status || 'scheduled';
        if ((localHasReport || localHasVocal || localHasAtt) && finalStatus === 'scheduled') {
          finalStatus = 'completed';
        }

        const dbClass: any = {
          id: item.class_id,
          group_id: validGroupId,
          title: item.title || 'Aula',
          teacher_id: validTeacherId,
          date: item.date,
          start_time: formatClassTime(item.start_time),
          end_time: formatClassTime(item.end_time),
          status: finalStatus,
          allow_makeup: !!item.allow_makeup,
          makeup_scheduled: !!item.makeup_scheduled,
          report: dbReport,
        };

        let pushSuccess = false;
        let lastOpError: any = null;

        if (remoteData) {
          // Record exists on Supabase -> STRICTLY UPDATE ONLY (NEVER INSERT)
          const { error: updErr } = await supabase.from('classes').update(dbClass).eq('id', classId);
          if (!updErr) {
            pushSuccess = true;
          } else {
            console.warn(`Retry minimal update for class ${classId}:`, updErr);
            const minimalUpd: any = {
              title: item.title || 'Aula',
              teacher_id: validTeacherId,
              date: item.date,
              start_time: formatClassTime(item.start_time),
              end_time: formatClassTime(item.end_time),
              status: dbClass.status,
              report: dbReport,
            };
            const { error: minErr } = await supabase.from('classes').update(minimalUpd).eq('id', classId);
            if (!minErr) {
              pushSuccess = true;
            } else {
              lastOpError = minErr;
            }
          }
        } else {
          // Record does not exist on Supabase -> INSERT ONLY
          const { error: insErr } = await supabase.from('classes').insert([dbClass]);
          if (!insErr) {
            pushSuccess = true;
          } else {
            console.warn(`Retry minimal insert for class ${classId}:`, insErr);
            const minimalIns: any = {
              id: item.class_id,
              title: item.title || 'Aula',
              teacher_id: validTeacherId,
              date: item.date,
              start_time: formatClassTime(item.start_time),
              end_time: formatClassTime(item.end_time),
              status: dbClass.status,
              report: dbReport,
            };
            const { error: minInsErr } = await supabase.from('classes').insert([minimalIns]);
            if (!minInsErr) {
              pushSuccess = true;
            } else {
              lastOpError = minInsErr;
            }
          }
        }

        if (pushSuccess) {
          console.log(`[SYNC PENDING] class_id=${classId} timestamp=${Date.now()} local_date=${item.date} remote_date=${remoteData?.date} local_start_time=${item.start_time} remote_start_time=${remoteData?.start_time} local_teacher_id=${validTeacherId} remote_teacher_id=${remoteData?.teacher_id} action=SYNCED_TO_SUPABASE`);
          // Sync class_students
          if (item.student_ids && item.student_ids.length > 0) {
            try {
              await supabase.from('class_students').delete().eq('class_id', classId);
              const validStudentIds = item.student_ids.filter(sid => state.students.some(s => s.id === sid));
              if (validStudentIds.length > 0) {
                await supabase.from('class_students').insert(validStudentIds.map(student_id => ({ class_id: classId, student_id })));
              }
            } catch (csErr) {
              console.warn('Error syncing class_students during push:', csErr);
            }
          }
          delete remainingPending[classId];
          syncedCount++;
        } else {
          remainingPending[classId] = {
            ...item,
            syncStatus: "error",
            lastError: "Falha ao gravar no servidor"
          };
        }
      } catch (err: any) {
        console.warn(`Error during sync of pending class ${classId}:`, err);
        remainingPending[classId] = {
          ...item,
          syncStatus: "error",
          lastError: err?.message || "Erro de conexão"
        };
      }
    }

    saveStoredPendingSyncs(remainingPending);
    setPendingClassSyncs(remainingPending);
    const scopedCount = computeScopedPendingSyncs(remainingPending, currentUserProfile, state.classes, state.groups, state.teachers).length;
    setPendingSyncCount(scopedCount);
    return { syncedCount, pendingCount: scopedCount };
  };

  const [latestAuditSummary, setLatestAuditSummary] = useState<AuditSummary | null>(null);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);

  // READ-ONLY Comprehensive Audit Engine across ALL teachers and dates
  const runClassAudit = async (options?: { filterTeacherId?: string; filterDate?: string }): Promise<AuditSummary> => {
    setIsAuditing(true);
    try {
      let activeUserProfile = currentUserProfile;
      if (!activeUserProfile) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) {
          const { data } = await supabase.from('profiles').select('*').eq('email', user.email).maybeSingle();
          if (data) activeUserProfile = data;
          else {
            const local = state.profiles.find(p => p.email === user.email);
            if (local) activeUserProfile = local;
          }
        }
      }

      const scope = getEffectiveAuditScope(activeUserProfile, state.teachers, options?.filterTeacherId);
      const effectiveTeacherFilter = scope.effectiveTeacherId;

      // Groups map for validating group ownership by teacher
      const groupsMap = new Map<string, Group>();
      (state.groups || []).forEach(g => {
        if (g && g.id) groupsMap.set(g.id, g);
      });

      // Helper to resolve effective teacher for a class (checking direct teacher_id, then group teacher_id)
      const resolveClassTeacherId = (cls?: Partial<ClassSession> | null): string => {
        if (!cls) return '';
        if (cls.teacher_id && cls.teacher_id.trim() !== '') return cls.teacher_id.trim();
        if (cls.group_id) {
          const grp = groupsMap.get(cls.group_id);
          if (grp?.teacher_id) return grp.teacher_id;
        }
        return '';
      };

      // 1. Fetch complete current state from Supabase (paginated, read-only)
      const { data: remoteRows, error: remoteErr } = await fetchAllClassesFromSupabase();
      if (remoteErr) {
        console.warn("Audit remote query warning:", remoteErr);
      }

      const allRemoteClasses = (remoteRows || []).map((dbClass: any) => {
        const student_ids = dbClass.class_students
          ? dbClass.class_students.map((cs: any) => cs.student_id)
          : [];
        const parsed = parsePackedReport(dbClass.report);
        return {
          id: dbClass.id,
          group_id: dbClass.group_id,
          title: dbClass.title || 'Aula',
          teacher_id: dbClass.teacher_id,
          student_ids,
          date: dbClass.date,
          start_time: dbClass.start_time,
          end_time: dbClass.end_time,
          status: dbClass.status || 'scheduled',
          allow_makeup: dbClass.allow_makeup,
          makeup_scheduled: dbClass.makeup_scheduled,
          has_custom_students: parsed.has_custom_students !== undefined ? !!parsed.has_custom_students : false,
          report: parsed.report || (dbClass.report && !dbClass.report.includes("//") ? dbClass.report : ""),
          vocal_routine: dbClass.vocal_routine || parsed.vocal_routine,
          attendance: (dbClass.attendance && Object.keys(dbClass.attendance).length > 0) ? dbClass.attendance : parsed.attendance,
        };
      });

      // Quick lookup map of remote classes by id
      const fullRemoteMap = new Map<string, any>(allRemoteClasses.map(c => [c.id, c]));

      // 2. Map all local classes (from state, localStorage, and pending syncs)
      const allLocalClassesMap = new Map<string, ClassSession>();
      (state.classes || []).forEach(c => {
        if (c && c.id) allLocalClassesMap.set(c.id, c);
      });

      const pendingMap = getStoredPendingSyncs();
      const allPendingQueueList: PendingClassSync[] = Object.values(pendingMap);

      // Prioritize pending queue data because it has the most fresh user inputs awaiting sync
      allPendingQueueList.forEach(p => {
        if (p && p.class_id) {
          const existing = allLocalClassesMap.get(p.class_id);
          const remoteFallback = fullRemoteMap.get(p.class_id);
          const resolvedTeacher = resolveTeacherIdForPendingSync(p, groupsMap, allLocalClassesMap, fullRemoteMap) || existing?.teacher_id || remoteFallback?.teacher_id || '';
          allLocalClassesMap.set(p.class_id, {
            id: p.class_id,
            teacher_id: resolvedTeacher,
            group_id: p.group_id || existing?.group_id || remoteFallback?.group_id || undefined,
            title: p.title || existing?.title || remoteFallback?.title || 'Aula',
            date: p.date || existing?.date || remoteFallback?.date || '',
            start_time: p.start_time || existing?.start_time || remoteFallback?.start_time || '',
            end_time: p.end_time || existing?.end_time || remoteFallback?.end_time || '',
            status: p.status as any || existing?.status || remoteFallback?.status || 'scheduled',
            report: (p.report !== undefined && p.report !== null) ? p.report : (existing?.report ?? remoteFallback?.report),
            vocal_routine: (p.vocal_routine !== undefined && p.vocal_routine !== null) ? p.vocal_routine : (existing?.vocal_routine ?? remoteFallback?.vocal_routine),
            attendance: p.attendance || existing?.attendance || remoteFallback?.attendance,
            student_ids: (p.student_ids && p.student_ids.length > 0) ? p.student_ids : (existing?.student_ids || remoteFallback?.student_ids || []),
            allow_makeup: p.allow_makeup !== undefined ? p.allow_makeup : (existing?.allow_makeup ?? remoteFallback?.allow_makeup),
            makeup_scheduled: p.makeup_scheduled !== undefined ? p.makeup_scheduled : (existing?.makeup_scheduled ?? remoteFallback?.makeup_scheduled)
          });
        }
      });

      // FILTER THE UNIVERSE BEFORE CREATING AUDIT MAPS & COUNTERS:
      // If effectiveTeacherFilter is active, strictly filter local, remote and pending sets
      const isClassAuthorized = (cId: string, loc?: ClassSession, rem?: any): boolean => {
        if (scope.isSuperAdmin && !effectiveTeacherFilter) return true; // Super Admin viewing all
        if (scope.isAdmin && !scope.hasTeacherLinked) return false; // Admin without teacher has 0 access
        const tLoc = resolveClassTeacherId(loc);
        const tRem = resolveClassTeacherId(rem);
        return tLoc === effectiveTeacherFilter || tRem === effectiveTeacherFilter;
      };

      const localClassesMap = new Map<string, ClassSession>();
      allLocalClassesMap.forEach((cls, id) => {
        const rem = fullRemoteMap.get(id);
        if (isClassAuthorized(id, cls, rem)) {
          localClassesMap.set(id, cls);
        }
      });

      const remoteClasses = allRemoteClasses.filter(rem => {
        const loc = allLocalClassesMap.get(rem.id);
        return isClassAuthorized(rem.id, loc, rem);
      });
      const remoteMap = new Map<string, any>(remoteClasses.map(c => [c.id, c]));

      // Scoped Pending Queue: only include items belonging to effective authorized scope
      const scopedPendingQueue: PendingClassSync[] = computeScopedPendingSyncs(
        pendingMap,
        activeUserProfile,
        state.classes,
        state.groups,
        state.teachers,
        fullRemoteMap
      );

      // Teachers map
      const teachersMap = new Map<string, Teacher>();
      (state.teachers || []).forEach(t => {
        if (t && t.id) teachersMap.set(t.id, t);
      });

      const profilesMap = new Map<string, UserProfile>();
      (state.profiles || []).forEach(p => {
        if (p && p.teacher_id) profilesMap.set(p.teacher_id, p);
      });

      const studentsMap = new Map<string, any>();
      (state.students || []).forEach(st => {
        if (st && st.id) studentsMap.set(st.id, st);
      });

      // Union of all authorized class IDs
      const allClassIds = new Set<string>([
        ...Array.from(localClassesMap.keys()),
        ...remoteClasses.map(c => c.id)
      ]);

      const auditItems: ClassAuditItem[] = [];
      let syncedCount = 0;
      let pendingCount = 0;
      let conflictCount = 0;
      let manualCheckCount = 0;
      let localOnlyCount = 0;
      let remoteOnlyCount = 0;
      let errorCount = 0;

      for (const classId of Array.from(allClassIds)) {
        const local = localClassesMap.get(classId);
        const remote = remoteMap.get(classId);

        const teacherId = resolveClassTeacherId(local) || resolveClassTeacherId(remote);
        const teacher = teachersMap.get(teacherId);
        const profile = profilesMap.get(teacherId);

        const date = (local?.date || remote?.date || '');
        const startTime = (local?.start_time || remote?.start_time || '');
        const endTime = (local?.end_time || remote?.end_time || '');
        const title = (local?.title || remote?.title || 'Aula');

        // Apply secondary date filter if provided
        if (options?.filterDate && options.filterDate !== date) {
          continue;
        }

        const comparison = compareAndClassifyClass(local, remote, teachersMap);
        const category: ClassAuditCategory = comparison.category;
        const diffSummary: string[] = comparison.diffSummary;

        if (category === "synced") syncedCount++;
        else if (category === "pending") pendingCount++;
        else if (category === "conflict") conflictCount++;
        else if (category === "manual_check") manualCheckCount++;
        else if (category === "local_only") localOnlyCount++;
        else if (category === "remote_only") remoteOnlyCount++;

        const allStudentIds = Array.from(new Set([
          ...(local?.student_ids || []),
          ...(remote?.student_ids || [])
        ]));
        const resolvedNames = allStudentIds
          .map(sid => studentsMap.get(sid)?.name)
          .filter(Boolean);
        const student_names = resolvedNames.length > 0 
          ? resolvedNames.join(", ") 
          : (title !== "Aula" && title ? title : "Sem Aluno Vinculado");

        auditItems.push({
          class_id: classId,
          teacher_id: teacherId,
          teacher_name: teacher?.name || 'Professor Desconhecido',
          teacher_email: profile?.email || teacher?.email || 'N/A',
          title,
          student_names,
          date,
          start_time: startTime,
          end_time: endTime,
          category,
          localData: local ? {
            date: local.date,
            start_time: local.start_time,
            end_time: local.end_time,
            teacher_id: local.teacher_id,
            teacher_name: teachersMap.get(local.teacher_id || '')?.name,
            group_id: local.group_id,
            status: local.status,
            report: local.report,
            vocal_routine: local.vocal_routine,
            attendance: local.attendance,
            student_ids: local.student_ids,
            student_names: (local.student_ids || []).map(sid => studentsMap.get(sid)?.name).filter(Boolean).join(", "),
            title: local.title
          } : undefined,
          remoteData: remote ? {
            date: remote.date,
            start_time: remote.start_time,
            end_time: remote.end_time,
            teacher_id: remote.teacher_id,
            teacher_name: teachersMap.get(remote.teacher_id || '')?.name,
            group_id: remote.group_id,
            status: remote.status,
            report: remote.report,
            vocal_routine: remote.vocal_routine,
            attendance: remote.attendance,
            student_ids: remote.student_ids,
            student_names: (remote.student_ids || []).map(sid => studentsMap.get(sid)?.name).filter(Boolean).join(", "),
            title: remote.title
          } : undefined,
          diffSummary,
          lastError: pendingMap[classId]?.lastError
        });
      }

      // Sort audit items: conflict first, manual_check next, pending next, then local_only, then synced
      auditItems.sort((a, b) => {
        const orderMap: Record<ClassAuditCategory, number> = {
          conflict: 1,
          manual_check: 2,
          pending: 3,
          local_only: 4,
          remote_only: 5,
          synced: 6
        };
        const orderDiff = (orderMap[a.category] || 99) - (orderMap[b.category] || 99);
        if (orderDiff !== 0) return orderDiff;
        const dateCompare = (b.date || "").localeCompare(a.date || "");
        if (dateCompare !== 0) return dateCompare;
        return (b.start_time || "").localeCompare(a.start_time || "");
      });

      const summary: AuditSummary = {
        totalTeachers: effectiveTeacherFilter ? (teachersMap.has(effectiveTeacherFilter) ? 1 : 0) : teachersMap.size,
        totalClasses: auditItems.length,
        syncedCount,
        pendingCount,
        conflictCount,
        manualCheckCount,
        localOnlyCount,
        remoteOnlyCount,
        errorCount,
        items: auditItems,
        pendingSyncQueue: scopedPendingQueue,
        auditedAt: Date.now()
      };

      setLatestAuditSummary(summary);
      setPendingSyncCount(scopedPendingQueue.length);
      return summary;
    } catch (err: any) {
      console.error("Audit error:", err);
      throw err;
    } finally {
      setIsAuditing(false);
    }
  };

  // Read-only pre-recovery inspection for classes (checks remote existence, possible duplicates, missing fields, and user authorization)
  const inspectClassForRecovery = async (classId: string): Promise<ClassRecoveryInspection> => {
    // 0. Locate local representation
    const pendingMap = getStoredPendingSyncs();
    const pendingItem = pendingMap[classId];
    const localClass = state.classes.find(c => c.id === classId);

    const localData = {
      id: classId,
      teacher_id: pendingItem?.teacher_id || localClass?.teacher_id || '',
      teacher_name: state.teachers.find(t => t.id === (pendingItem?.teacher_id || localClass?.teacher_id))?.name,
      group_id: pendingItem?.group_id || localClass?.group_id || undefined,
      title: pendingItem?.title || localClass?.title || 'Aula',
      date: pendingItem?.date || localClass?.date || '',
      start_time: pendingItem?.start_time || localClass?.start_time || '',
      end_time: pendingItem?.end_time || localClass?.end_time || '',
      status: pendingItem?.status || localClass?.status || 'scheduled',
      report: pendingItem?.report !== undefined ? pendingItem.report : localClass?.report,
      vocal_routine: pendingItem?.vocal_routine !== undefined ? pendingItem.vocal_routine : localClass?.vocal_routine,
      attendance: pendingItem?.attendance || localClass?.attendance || {},
      student_ids: (pendingItem?.student_ids && pendingItem.student_ids.length > 0) ? pendingItem.student_ids : (localClass?.student_ids || []),
      student_names: '',
      allow_makeup: pendingItem?.allow_makeup !== undefined ? pendingItem.allow_makeup : localClass?.allow_makeup,
      makeup_scheduled: pendingItem?.makeup_scheduled !== undefined ? pendingItem.makeup_scheduled : localClass?.makeup_scheduled,
    };

    // Resolve teacher_id if missing from group
    if (!localData.teacher_id && localData.group_id) {
      const grp = state.groups.find(g => g.id === localData.group_id);
      if (grp?.teacher_id) {
        localData.teacher_id = grp.teacher_id;
        localData.teacher_name = state.teachers.find(t => t.id === grp.teacher_id)?.name;
      }
    }

    // Resolve student names
    const sNames = localData.student_ids
      .map(sid => state.students.find(s => s.id === sid)?.name)
      .filter(Boolean)
      .join(', ');
    localData.student_names = sNames || localData.title;

    // 1. Check permissions
    const userProfile = currentUserProfile;
    const isSuperAdmin = userProfile?.role === 'super_admin';
    const isTeacher = userProfile?.role === 'teacher';
    const currentUserTeacherId = userProfile?.teacher_id;

    let isAuthorized = true;
    let authMessage: string | undefined = undefined;

    if (!isSuperAdmin) {
      if (isTeacher) {
        if (currentUserTeacherId && localData.teacher_id && localData.teacher_id !== currentUserTeacherId) {
          isAuthorized = false;
          authMessage = `Acesso não autorizado: esta aula pertence ao professor "${localData.teacher_name || localData.teacher_id}", mas seu usuário está autenticado como outro professor.`;
        }
      } else if (userProfile?.role === 'admin') {
        if (currentUserTeacherId && localData.teacher_id && localData.teacher_id !== currentUserTeacherId) {
          isAuthorized = false;
          authMessage = `Acesso não autorizado para o escopo do usuário.`;
        }
      }
    }

    // 2. Validate required fields
    const missingFields: string[] = [];
    if (!localData.id || localData.id.trim() === '') missingFields.push('ID da aula');
    if (!localData.date || localData.date.trim() === '') missingFields.push('Data');
    if (!localData.start_time || localData.start_time.trim() === '') missingFields.push('Horário de Início');
    if (!localData.end_time || localData.end_time.trim() === '') missingFields.push('Horário de Término');
    if (!localData.teacher_id || localData.teacher_id.trim() === '') {
      missingFields.push('Professor Responsável');
    } else {
      const teacherExists = state.teachers.some(t => t.id === localData.teacher_id);
      if (!teacherExists) {
        missingFields.push(`Professor ID (${localData.teacher_id}) não cadastrado na base`);
      }
    }

    // 3. Perform 100% READ-ONLY check on Supabase
    let existsInSupabase = false;
    let remoteClass: any = undefined;
    const possibleDuplicates: any[] = [];

    try {
      // Step A: Check if class_id already exists in Supabase
      const { data: existingRow, error: checkErr } = await supabase
        .from('classes')
        .select('*, class_students(student_id)')
        .eq('id', classId)
        .maybeSingle();

      if (!checkErr && existingRow) {
        existsInSupabase = true;
        const parsed = parsePackedReport(existingRow.report);
        const remSids = Array.isArray(existingRow.class_students) 
          ? existingRow.class_students.map((cs: any) => cs.student_id)
          : [];
        const remSNames = remSids
          .map((sid: string) => state.students.find(s => s.id === sid)?.name)
          .filter(Boolean)
          .join(', ');

        remoteClass = {
          id: existingRow.id,
          teacher_id: existingRow.teacher_id,
          teacher_name: state.teachers.find(t => t.id === existingRow.teacher_id)?.name || 'Professor Desconhecido',
          group_id: existingRow.group_id,
          title: existingRow.title || 'Aula',
          date: existingRow.date,
          start_time: existingRow.start_time,
          end_time: existingRow.end_time,
          status: existingRow.status,
          report: parsed.report || existingRow.report || '',
          vocal_routine: parsed.vocal_routine || existingRow.vocal_routine || '',
          attendance: (parsed.attendance && Object.keys(parsed.attendance).length > 0) ? parsed.attendance : (existingRow.attendance || {}),
          student_ids: remSids,
          student_names: remSNames || existingRow.title || 'Sem Aluno Vinculado',
          allow_makeup: existingRow.allow_makeup,
          makeup_scheduled: existingRow.makeup_scheduled,
        };
      }

      // Step B: If class_id does not exist, check for potential duplicates on the same date + teacher
      if (!existsInSupabase && localData.date && localData.teacher_id) {
        const { data: sameDayClasses, error: dupErr } = await supabase
          .from('classes')
          .select('*, class_students(student_id)')
          .eq('date', localData.date)
          .eq('teacher_id', localData.teacher_id);

        if (!dupErr && sameDayClasses && sameDayClasses.length > 0) {
          for (const sdc of sameDayClasses) {
            if (sdc.id === classId) continue;
            const sameStart = sdc.start_time?.slice(0, 5) === localData.start_time.slice(0, 5);
            const sameEnd = sdc.end_time?.slice(0, 5) === localData.end_time.slice(0, 5);
            
            const sdcStudents = Array.isArray(sdc.class_students) ? sdc.class_students.map((cs: any) => cs.student_id) : [];
            const hasCommonStudents = localData.student_ids.length > 0 && sdcStudents.some((sid: string) => localData.student_ids.includes(sid));

            if (sameStart || sameEnd || hasCommonStudents) {
              const parsed = parsePackedReport(sdc.report);
              const dupStudentNames = sdcStudents
                .map((sid: string) => state.students.find(s => s.id === sid)?.name)
                .filter(Boolean)
                .join(', ');

              possibleDuplicates.push({
                id: sdc.id,
                teacher_id: sdc.teacher_id,
                teacher_name: state.teachers.find(t => t.id === sdc.teacher_id)?.name,
                date: sdc.date,
                start_time: sdc.start_time,
                end_time: sdc.end_time,
                title: sdc.title || 'Aula',
                student_names: dupStudentNames || sdc.title || 'Sem Alunos',
                status: sdc.status,
                report: parsed.report || sdc.report || ''
              });
            }
          }
        }
      }
    } catch (queryException) {
      console.warn('[RECOVERY INSPECTION] Error reading from Supabase:', queryException);
    }

    const canDirectInsert = isAuthorized && !existsInSupabase && possibleDuplicates.length === 0 && missingFields.length === 0;

    return {
      class_id: classId,
      isAuthorized,
      authMessage,
      existsInSupabase,
      remoteClass,
      possibleDuplicates,
      missingFields,
      localData,
      canDirectInsert
    };
  };

  // Safe individual class synchronization following strict pre-check -> update -> post-confirmation -> queue removal
  const syncSingleClassSafely = async (classId: string): Promise<{ success: boolean; message: string; conflict?: boolean }> => {
    return executeSaveOperation(async () => {
      // 0. Strict authorization check at the motor level
      const userProfile = currentUserProfile;
      const isSuperAdmin = userProfile?.role === 'super_admin';
      const isTeacher = userProfile?.role === 'teacher';
      const currentUserTeacherId = userProfile?.teacher_id;

      // 1. Get current local state and pending queue record
      const pendingMap = getStoredPendingSyncs();
      const pendingItem = pendingMap[classId];
      const localClass = state.classes.find(c => c.id === classId) || (pendingItem ? {
        id: classId,
        teacher_id: pendingItem.teacher_id || '',
        group_id: pendingItem.group_id || undefined,
        title: pendingItem.title || 'Aula',
        date: pendingItem.date || '',
        start_time: pendingItem.start_time || '',
        end_time: pendingItem.end_time || '',
        status: (pendingItem.status as any) || 'scheduled',
        report: pendingItem.report,
        vocal_routine: pendingItem.vocal_routine,
        attendance: pendingItem.attendance,
        student_ids: pendingItem.student_ids || [],
        allow_makeup: pendingItem.allow_makeup,
        makeup_scheduled: pendingItem.makeup_scheduled,
      } : undefined);

      if (!localClass && !pendingItem) {
        return { success: false, message: "Aula não encontrada no dispositivo local." };
      }

      // Security check: If teacher, verify that this class or group belongs to them
      if (!isSuperAdmin) {
        let classTeacherId = pendingItem?.teacher_id || localClass?.teacher_id || '';
        const targetGroupId = pendingItem?.group_id || localClass?.group_id;
        if (!classTeacherId && targetGroupId) {
          const grp = state.groups.find(g => g.id === targetGroupId);
          if (grp?.teacher_id) classTeacherId = grp.teacher_id;
        }

        if (isTeacher && currentUserTeacherId && classTeacherId && classTeacherId !== currentUserTeacherId) {
          return { success: false, message: "Acesso não autorizado: você só pode sincronizar suas próprias aulas." };
        }
      }

      const effectiveData = {
        date: pendingItem?.date || localClass?.date || '',
        start_time: pendingItem?.start_time || localClass?.start_time || '',
        end_time: pendingItem?.end_time || localClass?.end_time || '',
        teacher_id: pendingItem?.teacher_id || localClass?.teacher_id || '',
        group_id: pendingItem?.group_id || localClass?.group_id || null,
        title: pendingItem?.title || localClass?.title || 'Aula',
        status: pendingItem?.status || localClass?.status || 'scheduled',
        report: pendingItem?.report !== undefined ? pendingItem.report : localClass?.report,
        vocal_routine: pendingItem?.vocal_routine !== undefined ? pendingItem.vocal_routine : localClass?.vocal_routine,
        attendance: pendingItem?.attendance || localClass?.attendance || {},
        student_ids: (pendingItem?.student_ids && pendingItem.student_ids.length > 0) ? pendingItem.student_ids : (localClass?.student_ids || []),
        allow_makeup: pendingItem?.allow_makeup !== undefined ? pendingItem.allow_makeup : localClass?.allow_makeup,
        makeup_scheduled: pendingItem?.makeup_scheduled !== undefined ? pendingItem.makeup_scheduled : localClass?.makeup_scheduled,
      };

      try {
        // STEP 1: PRE-CHECK SELECT from Supabase
        const { data: remoteData, error: preFetchErr } = await supabase
          .from('classes')
          .select('id, date, start_time, end_time, teacher_id, group_id, title, status, report, allow_makeup, makeup_scheduled')
          .eq('id', classId)
          .maybeSingle();

        if (preFetchErr) {
          console.error(`[SYNC PRE-CHECK ERROR] Error querying remote class ${classId}:`, preFetchErr);
          return {
            success: false,
            message: `Falha na consulta de verificação no Supabase: ${preFetchErr.message || 'Erro de leitura'}. Seus dados locais permanecem preservados.`
          };
        }

        // STEP 2: CONSTRUCT ACCURATE PAYLOAD
        const dbReport = packReport(
          effectiveData.report || "",
          effectiveData.vocal_routine || "",
          effectiveData.attendance,
          effectiveData.makeup_scheduled,
          effectiveData.allow_makeup
        );

        let validTeacherId: string | null = null;
        if (effectiveData.teacher_id && effectiveData.teacher_id.trim() !== "") {
          const teacherExists = state.teachers.some(t => t.id === effectiveData.teacher_id);
          if (teacherExists) validTeacherId = effectiveData.teacher_id.trim();
        }

        let validGroupId: string | null = null;
        if (effectiveData.group_id && effectiveData.group_id.trim() !== "") {
          const groupExists = state.groups.some(g => g.id === effectiveData.group_id);
          if (groupExists) validGroupId = effectiveData.group_id.trim();
        }

        const hasAttendance = effectiveData.attendance && Object.keys(effectiveData.attendance).length > 0;
        const hasReport = (effectiveData.report && effectiveData.report.trim().length > 0 && !effectiveData.report.trim().startsWith("Aula de reposição")) || (effectiveData.vocal_routine && effectiveData.vocal_routine.trim().length > 0);
        let finalStatus = effectiveData.status || 'scheduled';
        if ((hasAttendance || hasReport) && finalStatus === 'scheduled') {
          finalStatus = 'completed';
        }

        const dbClass: any = {
          id: classId,
          group_id: validGroupId,
          title: effectiveData.title || 'Aula',
          teacher_id: validTeacherId,
          date: effectiveData.date,
          start_time: formatClassTime(effectiveData.start_time),
          end_time: formatClassTime(effectiveData.end_time),
          status: finalStatus,
          allow_makeup: !!effectiveData.allow_makeup,
          makeup_scheduled: !!effectiveData.makeup_scheduled,
          report: dbReport,
        };

        // STEP 3: STRICT EXECUTE UPDATE OR INSERT (NEVER FALLBACK UPDATE -> INSERT)
        let writeError: any = null;
        if (remoteData) {
          // Record exists on Supabase -> STRICTLY UPDATE ONLY
          const { error: updErr } = await supabase
            .from('classes')
            .update(dbClass)
            .eq('id', classId);
          if (updErr) {
            console.warn(`[SYNC UPDATE] Full update failed for ${classId}, trying minimal:`, updErr);
            const minimalUpd: any = {
              title: dbClass.title,
              teacher_id: validTeacherId,
              date: dbClass.date,
              start_time: dbClass.start_time,
              end_time: dbClass.end_time,
              status: dbClass.status,
              report: dbReport,
            };
            const { error: minErr } = await supabase.from('classes').update(minimalUpd).eq('id', classId);
            writeError = minErr || updErr;
          }
        } else {
          // Record does NOT exist on Supabase -> INSERT ONLY
          const { error: insErr } = await supabase
            .from('classes')
            .insert([dbClass]);
          if (insErr) {
            console.warn(`[SYNC INSERT] Full insert failed for ${classId}, trying minimal:`, insErr);
            const minimalIns: any = {
              id: classId,
              title: dbClass.title,
              teacher_id: validTeacherId,
              date: dbClass.date,
              start_time: dbClass.start_time,
              end_time: dbClass.end_time,
              status: dbClass.status,
              report: dbReport,
            };
            const { error: minInsErr } = await supabase.from('classes').insert([minimalIns]);
            writeError = minInsErr || insErr;
          }
        }

        if (writeError) {
          // Update pending queue with error without deleting
          pendingMap[classId] = {
            class_id: classId,
            teacher_id: effectiveData.teacher_id,
            group_id: effectiveData.group_id,
            title: effectiveData.title,
            date: effectiveData.date,
            start_time: effectiveData.start_time,
            end_time: effectiveData.end_time,
            status: finalStatus,
            report: effectiveData.report,
            vocal_routine: effectiveData.vocal_routine,
            attendance: effectiveData.attendance,
            student_ids: effectiveData.student_ids,
            timestamp: Date.now(),
            syncStatus: "error",
            lastError: writeError.message || "Erro na gravação remota"
          };
          saveStoredPendingSyncs(pendingMap);
          setPendingClassSyncs(pendingMap);
          setPendingSyncCount(Object.keys(pendingMap).length);
          return { success: false, message: `Falha ao atualizar no Supabase: ${writeError.message || 'Erro desconhecido'}. Seus dados locais permanecem preservados.` };
        }

        // Sync class_students
        if (effectiveData.student_ids && effectiveData.student_ids.length > 0) {
          try {
            await supabase.from('class_students').delete().eq('class_id', classId);
            const validStudentIds = effectiveData.student_ids.filter(sid => state.students.some(s => s.id === sid));
            if (validStudentIds.length > 0) {
              await supabase.from('class_students').insert(validStudentIds.map(student_id => ({ class_id: classId, student_id })));
            }
          } catch (csErr) {
            console.warn(`class_students sync warning for ${classId}:`, csErr);
          }
        }

        // STEP 4: STRICT POST-UPDATE SELECT TO CONFIRM DATA IN SUPABASE
        const { data: postConfirmRow, error: postConfirmErr } = await supabase
          .from('classes')
          .select('id, date, start_time, end_time, teacher_id, status, report')
          .eq('id', classId)
          .maybeSingle();

        if (postConfirmErr || !postConfirmRow) {
          pendingMap[classId] = {
            class_id: classId,
            teacher_id: effectiveData.teacher_id,
            group_id: effectiveData.group_id,
            title: effectiveData.title,
            date: effectiveData.date,
            start_time: effectiveData.start_time,
            end_time: effectiveData.end_time,
            status: finalStatus,
            report: effectiveData.report,
            vocal_routine: effectiveData.vocal_routine,
            attendance: effectiveData.attendance,
            student_ids: effectiveData.student_ids,
            timestamp: Date.now(),
            syncStatus: "error",
            lastError: "Gravado mas falhou na consulta de confirmação pós-gravação"
          };
          saveStoredPendingSyncs(pendingMap);
          setPendingClassSyncs(pendingMap);
          return { success: false, message: "Gravado no banco, mas a consulta de confirmação não retornou o registro." };
        }

        // Compare confirmed fields
        const confirmedDate = postConfirmRow.date;
        if (confirmedDate !== effectiveData.date) {
          console.warn(`[SYNC POST-CHECK] Date mismatch after update for ${classId}: expected=${effectiveData.date}, actual=${confirmedDate}`);
          return { success: false, message: `Divergência pós-gravação: a data salva (${confirmedDate}) não confere com a esperada (${effectiveData.date}).` };
        }

        // STEP 5: REMOVE FROM PENDING QUEUE ONLY AFTER CONFIRMED SUCCESS
        delete pendingMap[classId];
        saveStoredPendingSyncs(pendingMap);
        setPendingClassSyncs(pendingMap);
        setPendingSyncCount(Object.keys(pendingMap).length);

        // Update local cache and state
        const confirmedClass: ClassSession = {
          id: classId,
          teacher_id: validTeacherId || '',
          group_id: validGroupId || undefined,
          title: effectiveData.title,
          date: effectiveData.date,
          start_time: effectiveData.start_time,
          end_time: effectiveData.end_time,
          status: finalStatus as any,
          report: effectiveData.report || '',
          vocal_routine: effectiveData.vocal_routine || '',
          attendance: effectiveData.attendance || {},
          student_ids: effectiveData.student_ids || [],
          allow_makeup: !!effectiveData.allow_makeup,
          makeup_scheduled: !!effectiveData.makeup_scheduled,
        };

        recentlySavedClassesRef.current.set(classId, {
          classData: confirmedClass,
          timestamp: Date.now(),
          confirmedBySelect: true
        });

        setState(s => ({
          ...s,
          classes: s.classes.map(c => c.id === classId ? confirmedClass : c)
        }));

        // Re-run read-only audit to update latest diagnostic summary
        await runClassAudit();

        return { success: true, message: `Aula de ${effectiveData.date.split('-').reverse().join('/')} sincronizada e confirmada no Supabase!` };

      } catch (err: any) {
        console.error(`[SYNC EXCEPTION] Error syncing class ${classId}:`, err);
        return { success: false, message: err?.message || "Exceção inesperada durante a sincronização." };
      }
    });
  };

  // Safe and Controlled Recovery for Pending and Manual Check Classes with Pre/Post Confirmation Checks
  const recoverPendingClasses = async (classIds?: string[]): Promise<{ recoveredCount: number; failedCount: number; results: Array<{ id: string; success: boolean; message: string }> }> => {
    return executeSaveOperation(async () => {
      const audit = await runClassAudit();
      const recoverableItems = audit.items.filter(item => {
        if (item.category !== "pending" && item.category !== "manual_check") return false;
        if (classIds && classIds.length > 0) return classIds.includes(item.class_id);
        return true;
      });

      if (recoverableItems.length === 0) {
        return { recoveredCount: 0, failedCount: 0, results: [] };
      }

      let recoveredCount = 0;
      let failedCount = 0;
      const results: Array<{ id: string; success: boolean; message: string }> = [];

      for (const item of recoverableItems) {
        const res = await syncSingleClassSafely(item.class_id);
        if (res.success) {
          recoveredCount++;
          results.push({ id: item.class_id, success: true, message: res.message });
        } else {
          failedCount++;
          results.push({ id: item.class_id, success: false, message: res.message });
        }
      }

      return { recoveredCount, failedCount, results };
    });
  };

  // Resolve Class Conflicts with explicit user direction
  const resolveClassConflict = async (
    classId: string,
    resolution: "use_local" | "use_remote" | "merge",
    mergedData?: Partial<ClassSession>
  ): Promise<{ success: boolean; message: string }> => {
    return executeSaveOperation(async () => {
      const audit = await runClassAudit();
      const item = audit.items.find(i => i.class_id === classId);
      if (!item) {
        return { success: false, message: "Aula não encontrada no diagnóstico" };
      }

      if (resolution === "use_remote") {
        // Adopt remote data locally for all fields
        if (item.remoteData) {
          recentlySavedClassesRef.current.delete(classId);
          setState(s => ({
            ...s,
            classes: s.classes.map(c => c.id === classId ? {
              ...c,
              date: item.remoteData!.date || c.date,
              start_time: item.remoteData!.start_time || c.start_time,
              end_time: item.remoteData!.end_time || c.end_time,
              teacher_id: item.remoteData!.teacher_id || c.teacher_id,
              title: item.remoteData!.title || c.title,
              status: (item.remoteData!.status as any) || c.status,
              report: item.remoteData!.report,
              vocal_routine: item.remoteData!.vocal_routine,
              attendance: item.remoteData!.attendance,
              student_ids: item.remoteData!.student_ids || c.student_ids,
              allow_makeup: item.remoteData!.allow_makeup !== undefined ? item.remoteData!.allow_makeup : c.allow_makeup,
              makeup_scheduled: item.remoteData!.makeup_scheduled !== undefined ? item.remoteData!.makeup_scheduled : c.makeup_scheduled,
            } : c)
          }));
          const pendingMap = getStoredPendingSyncs();
          delete pendingMap[classId];
          saveStoredPendingSyncs(pendingMap);
          setPendingClassSyncs(pendingMap);
          setPendingSyncCount(Object.keys(pendingMap).length);
          await runClassAudit();
          return { success: true, message: "Versão do Supabase adotada com sucesso. Dados locais sincronizados." };
        }
      } else if (resolution === "use_local") {
        // Push local data to remote
        const recResult = await recoverPendingClasses([classId]);
        if (recResult.recoveredCount > 0) {
          return { success: true, message: "Versão local gravada e confirmada no Supabase." };
        } else {
          return { success: false, message: "Falha ao gravar versão local no Supabase." };
        }
      } else if (resolution === "merge" && mergedData) {
        // Apply custom merged data
        const updateRes = await updateClass(classId, mergedData);
        await runClassAudit();
        if (updateRes.success) {
          return { success: true, message: "Dados mesclados gravados com sucesso no Supabase." };
        } else {
          return { success: false, message: "Dados mesclados salvos localmente, pendente envio para o Supabase." };
        }
      }
      return { success: false, message: "Resolução inválida." };
    });
  };

  useEffect(() => {
    let active = true;

    const fetchFromSupabase = async (force: boolean = false) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return;
      }

      // Concurrency guard: prioritize saving operations and avoid overlapping fetches
      if (!force) {
        if (isSavingRef.current || isFetchingRef.current) return;
        if (Date.now() - lastSaveTimestampRef.current < 4000) return;
      }

      isFetchingRef.current = true;
      const fetchId = ++currentFetchIdRef.current;
      const fetchStartVersion = localEditsVersionRef.current;
      const fetchStartTime = Date.now();
      console.log(`[FETCH FROM SUPABASE] fetchId=${fetchId} timestamp=${fetchStartTime} force=${force} action=START_FETCH`);

      try {
        const [
          { data: students, error: studentsErr },
          { data: teachers, error: teachersErr },
          { data: classes, error: classesErr },
          { data: transactions, error: transactionsErr },
          { data: financialPlans, error: plansErr },
          { data: choirVoiceTypes, error: voiceErr },
          { data: choirRegistrations, error: regErr },
          { data: enrollments, error: enrollmentsErr },
          { data: discountRules, error: rulesErr },
          { data: groups, error: groupsErr }
        ] = await Promise.all([
          supabase.from('students').select('*'),
          supabase.from('teachers').select('*'),
          fetchAllClassesFromSupabase(),
          supabase.from('transactions').select('*'),
          supabase.from('financial_plans').select('*'),
          supabase.from('choir_voice_types').select('*'),
          supabase.from('choir_registrations').select('*'),
          supabase.from('enrollments').select('*'),
          supabase.from('financial_discount_rules').select('*'),
          supabase.from('groups').select('*')
        ]);

        if (!active) return;
        if (fetchId !== currentFetchIdRef.current) {
          // A newer fetch or save mutation occurred, discard this stale response
          return;
        }
        if (isSavingRef.current) {
          // A user save operation is active, protect local state
          return;
        }

        if (studentsErr || teachersErr || classesErr || transactionsErr || plansErr || voiceErr || regErr || enrollmentsErr || rulesErr || groupsErr) {
          console.warn('One or more fetch requests had errors (this is normal if some tables are not yet queried or empty):', {
            studentsErr, teachersErr, classesErr, transactionsErr, plansErr, voiceErr, regErr, enrollmentsErr, rulesErr, groupsErr
          });
        }

        let prospects: any[] = [];
        try {
          const { data, error } = await supabase.from('prospects').select('*');
          if (error) {
            console.warn('Could not load prospects from Supabase:', error.message);
          } else {
            prospects = data || [];
          }
        } catch (e) {
          console.warn('Could not load prospects from Supabase:', e);
        }

        let profiles: any[] = [];
        try {
          const { data, error } = await supabase.from('profiles').select('*');
          if (error) {
            console.warn('Could not load profiles from Supabase:', error.message);
          } else {
            profiles = data || [];
          }
        } catch (e) {
          console.warn('Could not load profiles from Supabase:', e);
        }

        let choirCollaborators: any[] = [];
        let loadedCollabsDb = false;
        try {
          const { data, error } = await supabase.from('choir_collaborators').select('*');
          if (!error && data) {
            choirCollaborators = data;
            loadedCollabsDb = true;
          }
        } catch (e) {
          console.warn('Could not load choir_collaborators from Supabase:', e);
        }

        let choirRehearsals: any[] = [];
        let loadedRehearsalsDb = false;
        try {
          const { data, error } = await supabase.from('choir_rehearsals').select('*');
          if (!error && data) {
            choirRehearsals = data.map((r: any) => ({
              ...r,
              attendance: parseAttendance(r.attendance)
            }));
            loadedRehearsalsDb = true;
          }
        } catch (e) {
          console.warn('Could not load choir_rehearsals from Supabase:', e);
        }

        let dbCredits: any[] = [];
        try {
          const { data, error } = await supabase.from('credits').select('*');
          if (!error && data) {
            dbCredits = data;
          }
        } catch (e) {
          console.warn('Could not load credits from Supabase:', e);
        }

        let dbAffiliates: any[] = [];
        let affiliatesLoaded = false;
        try {
          const { data, error } = await supabase.from('affiliates').select('*').order('name');
          if (!error && data) {
            dbAffiliates = data;
            affiliatesLoaded = true;
          }
        } catch (e) {
          console.warn('Could not load affiliates from Supabase:', e);
        }

        let dbAffiliateReferrals: any[] = [];
        let referralsLoaded = false;
        try {
          const { data, error } = await supabase.from('affiliate_referrals').select('*').order('created_at', { ascending: false });
          if (!error && data) {
            dbAffiliateReferrals = data;
            referralsLoaded = true;
          }
        } catch (e) {
          console.warn('Could not load affiliate_referrals from Supabase:', e);
        }

        let dbAffiliateRules: any[] = [];
        let rulesLoaded = false;
        try {
          const { data, error } = await supabase.from('affiliate_commission_rules').select('*').order('tier_quantity');
          if (!error && data) {
            dbAffiliateRules = data;
            rulesLoaded = true;
          }
        } catch (e) {
          console.warn('Could not load affiliate_commission_rules from Supabase:', e);
        }

        let dbAffiliateClosings: any[] = [];
        let closingsLoaded = false;
        try {
          const { data, error } = await supabase.from('affiliate_monthly_closings').select('*').order('competence', { ascending: false });
          if (!error && data) {
            dbAffiliateClosings = data;
            closingsLoaded = true;
          }
        } catch (e) {
          console.warn('Could not load affiliate_monthly_closings from Supabase:', e);
        }

        let dbAffiliateClosingItems: any[] = [];
        let closingItemsLoaded = false;
        try {
          const { data, error } = await supabase.from('affiliate_closing_items').select('*');
          if (!error && data) {
            dbAffiliateClosingItems = data;
            closingItemsLoaded = true;
          }
        } catch (e) {
          console.warn('Could not load affiliate_closing_items from Supabase:', e);
        }

        let dbCompetenceBillings: CompetenceBilling[] = [];
        let competenceBillingsLoaded = false;
        try {
          const { data, error } = await supabase
            .from('competence_billings')
            .select('*')
            .order('competence', { ascending: false });
          if (error) {
            console.error('Error loading competence_billings from Supabase:', error);
          } else if (data) {
            dbCompetenceBillings = data.map((b: any) => ({
              ...b,
              base_price: Number(b.base_price || 0),
              discount: Number(b.discount || 0),
              final_price: Number(b.final_price || 0),
              teacher_fee_value: b.teacher_fee_value != null ? Number(b.teacher_fee_value) : null,
              teacher_share: Number(b.teacher_share || 0),
              school_share: Number(b.school_share || 0),
              is_paying: b.is_paying !== undefined ? !!b.is_paying : true,
              is_frozen: !!b.is_frozen,
              metadata: typeof b.metadata === 'object' && b.metadata !== null 
                ? b.metadata 
                : (typeof b.metadata === 'string' ? JSON.parse(b.metadata) : {})
            }));
            competenceBillingsLoaded = true;
          }
        } catch (e) {
          console.error('Unexpected error loading competence_billings from Supabase:', e);
        }

        // Clean up any legacy system backup items from choir_voice_types to prevent ghost resurrects
        if (choirVoiceTypes && choirVoiceTypes.some((v: any) => v.id === 'sys_rehearsals_backup' || v.id === 'sys_collaborators_backup')) {
          try {
            await supabase.from('choir_voice_types').delete().in('id', ['sys_rehearsals_backup', 'sys_collaborators_backup']);
          } catch (e) {
            console.warn('Could not clean sys backup voice types:', e);
          }
        }

        const { cleanRehearsals: cleanInitRehearsals, deletedIds: initDeletedIds } = mergeAndDeduplicateRehearsals(choirRehearsals);
        choirRehearsals = cleanInitRehearsals;
        if (initDeletedIds.length > 0) {
          supabase.from('choir_rehearsals').delete().in('id', initDeletedIds).then(({ error }) => {
            if (error) console.warn('Error deleting initial duplicate rehearsals:', error);
          });
        }

        const newCreditsToAutoPersist: any[] = [];

        setState(s => {
          // Sync local data to Supabase if it exists locally but not in Supabase, sequentially to honor foreign keys
          const syncToSupabase = async () => {
            if (syncTriggeredRef.current) return;
            syncTriggeredRef.current = true;

            try {
              // 1. Students
              if (s.students.length > 0 && (!students || students.length === 0)) {
                const studentsToInsert = s.students.map(({ not_eligible, ineligibility_reason, ...rest }) => {
                  let dbInstrument = rest.instrument || "";
                  if (not_eligible && ineligibility_reason) {
                    dbInstrument = `${rest.instrument} // INELIGIBLE: ${ineligibility_reason}`;
                  }
                  return {
                    ...rest,
                    instrument: dbInstrument,
                  };
                });
                const { error } = await supabase.from('students').insert(studentsToInsert);
                if (error) console.error('Error syncing students:', error);
                else console.log('Successfully synced students');
              }

              // 2. Teachers
              if (s.teachers.length > 0 && (!teachers || teachers.length === 0)) {
                const { error } = await supabase.from('teachers').insert(s.teachers);
                if (error) console.error('Error syncing teachers:', error);
                else console.log('Successfully synced teachers');
              }

              // 3. Financial Plans
              if (s.financialPlans.length > 0 && (!financialPlans || financialPlans.length === 0)) {
                const { error } = await supabase.from('financial_plans').insert(s.financialPlans);
                if (error) console.error('Error syncing financial_plans:', error);
                else console.log('Successfully synced financial plans');
              }

              // 4. Groups
              if (s.groups.length > 0 && (!groups || groups.length === 0)) {
                const groupsToInsert = s.groups.map(({ payment_type, schedule, price, frequency, ...rest }) => {
                  let dbSchedule = schedule || "";
                  if (payment_type) {
                    dbSchedule = `${dbSchedule} // PAYMENT: ${payment_type}`;
                  }
                  if (price !== undefined) {
                    dbSchedule = `${dbSchedule} // PRICE: ${price}`;
                  }
                  if (frequency) {
                    dbSchedule = `${dbSchedule} // FREQ: ${frequency}`;
                  }
                  return {
                    ...rest,
                    schedule: dbSchedule,
                  };
                });
                const { error } = await supabase.from('groups').insert(groupsToInsert);
                if (error) console.error('Error syncing groups:', error);
                else console.log('Successfully synced groups');
              }

              // 5. Enrollments (Matrículas) - Sync when local exists but Supabase is empty!
              if (s.enrollments.length > 0 && (!enrollments || enrollments.length === 0)) {
                const enrollmentsToInsert = s.enrollments.map((e) =>
                  sanitizeEnrollmentInsertPayload(e, e.id || generateId()).dbPayload
                );
                const { error } = await supabase.from('enrollments').insert(enrollmentsToInsert);
                if (error) console.error('Error syncing enrollments:', error);
                else console.log('Successfully synced enrollments');
              }

              // 6. Discount Rules
              if (s.discountRules.length > 0 && (!discountRules || discountRules.length === 0)) {
                const { error } = await supabase.from('financial_discount_rules').insert(s.discountRules);
                if (error) console.error('Error syncing financial_discount_rules:', error);
                else console.log('Successfully synced discount rules');
              }

              // 7. Choir Voice Types
              if (s.choirVoiceTypes.length > 0 && (!choirVoiceTypes || choirVoiceTypes.length === 0)) {
                const { error } = await supabase.from('choir_voice_types').insert(s.choirVoiceTypes);
                if (error) console.error('Error syncing choir_voice_types:', error);
                else console.log('Successfully synced choir voice types');
              }

              // 8. Choir Registrations
              if (s.choirRegistrations.length > 0 && (!choirRegistrations || choirRegistrations.length === 0)) {
                const regsToInsert = s.choirRegistrations.map((r: any) => {
                  const isInactive = r.status === 'inactive' || r.active === false;
                  return {
                    id: r.id,
                    student_id: r.student_id,
                    voice_type_id: r.voice_type_id,
                    monthly_fee: r.monthly_fee,
                    is_internal_student: r.is_internal_student,
                    status: isInactive ? 'rejected' : (r.status === 'approved' ? 'approved' : 'pending'),
                  };
                });
                const { error } = await supabase.from('choir_registrations').insert(regsToInsert);
                if (error) console.error('Error syncing choir_registrations:', error);
                else console.log('Successfully synced choir registrations');
              }

              // 9. Classes & Class Students
              if (s.classes.length > 0 && (!classes || classes.length === 0)) {
                const classesToInsert = s.classes.map(({ student_ids, attendance, ...rest }) => {
                  let dbReport = rest.report || "";
                  if (attendance && Object.keys(attendance).length > 0) {
                    dbReport = `${dbReport} // ATTENDANCE: ${JSON.stringify(attendance)}`;
                  }
                  return {
                    ...rest,
                    report: dbReport
                  };
                });
                const { error: classesError } = await supabase.from('classes').insert(classesToInsert);
                if (classesError) console.error('Error syncing classes:', classesError);
                else {
                  console.log('Successfully synced classes');
                  const classStudentsToInsert = s.classes.flatMap(c => 
                    (c.student_ids || []).map(student_id => ({ class_id: c.id, student_id }))
                  );
                  if (classStudentsToInsert.length > 0) {
                    const { error: csError } = await supabase.from('class_students').insert(classStudentsToInsert);
                    if (csError) console.error('Error syncing class_students:', csError);
                    else console.log('Successfully synced class_students');
                  }
                }
              }

              // 10. Transactions
              if (s.transactions.length > 0 && (!transactions || transactions.length === 0)) {
                const { error } = await supabase.from('transactions').insert(s.transactions);
                if (error) console.error('Error syncing transactions:', error);
                else console.log('Successfully synced transactions');
              }

              // 11. Prospects
              if (s.prospects.length > 0 && (!prospects || prospects.length === 0)) {
                const prospectsToInsert = s.prospects.map(({ not_eligible, ineligibility_reason, ...rest }) => {
                  let dbInstrument = rest.instrument || "";
                  if (not_eligible && ineligibility_reason) {
                    dbInstrument = `${rest.instrument} // INELIGIBLE: ${ineligibility_reason}`;
                  }
                  const dbNotes = encodeProspectNotes(rest.notes, rest.lead_status, rest.message_history, rest.term_signed, rest.approved);
                  return {
                    ...rest,
                    instrument: dbInstrument,
                    notes: dbNotes,
                    lead_status: rest.lead_status || "",
                    message_history: rest.message_history ? JSON.stringify(rest.message_history) : null,
                  };
                });
                let { error } = await supabase.from('prospects').insert(prospectsToInsert);
                if (error) {
                  // Fallback without direct lead_status columns if table doesn't have them
                  const fallbackProspects = prospectsToInsert.map(({ lead_status, message_history, ...r }) => r);
                  const retry = await supabase.from('prospects').insert(fallbackProspects);
                  if (retry.error) console.error('Error syncing prospects:', retry.error);
                  else console.log('Successfully synced prospects (fallback)');
                } else console.log('Successfully synced prospects');
              }

              // 12. Choir Collaborators
              if (s.choirCollaborators && s.choirCollaborators.length > 0) {
                await syncCollaboratorsToSupabase(s.choirCollaborators);
              }
            } catch (err) {
              console.error('Unexpected error during syncToSupabase:', err);
            }
          };
          
          syncToSupabase();

          const rawStudents = students && students.length > 0 ? students : s.students;
          const parsedStudentsList = rawStudents.map((st: any) => {
            let not_eligible = false;
            let ineligibility_reason = "";
            let instrument = st.instrument || "";
            if (instrument.includes(" // INELIGIBLE: ")) {
              const parts = instrument.split(" // INELIGIBLE: ");
              instrument = parts[0];
              not_eligible = true;
              ineligibility_reason = parts[1];
            }
            return {
              ...st,
              instrument,
              not_eligible,
              ineligibility_reason,
            };
          });

          // Group students by cleaned CPF to find duplicates
          const studentsByCpf: Record<string, typeof parsedStudentsList> = {};
          parsedStudentsList.forEach(st => {
            const cleanCpf = (st.cpf || "").replace(/\D/g, "");
            if (cleanCpf) {
              if (!studentsByCpf[cleanCpf]) {
                studentsByCpf[cleanCpf] = [];
              }
              studentsByCpf[cleanCpf].push(st);
            }
          });

          // Identify duplicate sets
          const duplicateGroups = Object.values(studentsByCpf).filter(g => g.length > 1);
          const studentsToKeep = [...parsedStudentsList];
          const duplicateIdsToDelete: string[] = [];
          const idMapping: Record<string, string> = {}; // maps duplicateId -> primaryId

          duplicateGroups.forEach(group => {
            // Sort by status ('active' first) then enrollment_date/id
            const sortedGroup = [...group].sort((a, b) => {
              if (a.status === 'active' && b.status !== 'active') return -1;
              if (b.status === 'active' && a.status !== 'active') return 1;
              return 0; // maintain order
            });

            const primary = sortedGroup[0];
            const duplicates = sortedGroup.slice(1);

            duplicates.forEach(dup => {
              duplicateIdsToDelete.push(dup.id);
              idMapping[dup.id] = primary.id;
              // Remove from studentsToKeep
              const idx = studentsToKeep.findIndex(st => st.id === dup.id);
              if (idx !== -1) {
                studentsToKeep.splice(idx, 1);
              }
            });
          });

          // Map local entities to the primary student and audit canonical enrollment uniqueness
          // Canonical key: student_id + plan_id + group_id (or null for individual)
          // Never auto-delete enrollments from Supabase.
          const studentMap = new Map((studentsToKeep || []).map((st: any) => [st.id, st]));
          const {
            enrollments: finalEnrollments,
            detectedDuplicates: detectedDuplicateEnrollments,
          } = reconcileAndAuditLoadedEnrollments(enrollments || [], studentMap, idMapping);

          if (detectedDuplicateEnrollments.length > 0) {
            console.warn(
              '[ENROLLMENT AUDIT] Detected duplicate active enrollments sharing canonical key (student_id + plan_id + group_id). Auto-deletion is disabled:',
              detectedDuplicateEnrollments
            );
          }

          let finalChoirRegistrations = (choirRegistrations || []).map((r: any) => {
            let mappedStudentId = r.student_id;
            if (Object.keys(idMapping).length > 0 && idMapping[r.student_id]) {
              mappedStudentId = idMapping[r.student_id];
            }

            const isInactive = r.status === 'rejected' || r.status === 'inactive' || r.active === false;
            const isApproved = !isInactive && r.status === 'approved';
            const isPending = !isInactive && !isApproved && r.status === 'pending';

            return {
              ...r,
              student_id: mappedStudentId,
              status: isInactive ? 'inactive' : (isApproved ? 'approved' : (isPending ? 'pending' : r.status || 'inactive')),
              active: isApproved,
            };
          });

          let finalClasses = (classes || []).map(c => {
            const { class_students, ...rest } = c;
            const parsed = parsePackedReport(rest.report);
            const report = parsed.report || "";
            const vocal_routine = (rest.vocal_routine && rest.vocal_routine.trim()) ? rest.vocal_routine.trim() : (parsed.vocal_routine || "");
            const attendance = (rest.attendance && typeof rest.attendance === "object" && Object.keys(rest.attendance).length > 0)
              ? rest.attendance
              : parsed.attendance;
            const makeup_scheduled = rest.makeup_scheduled !== undefined ? !!rest.makeup_scheduled : (parsed.makeup_scheduled !== undefined ? parsed.makeup_scheduled : false);
            const allow_makeup = rest.allow_makeup !== undefined ? !!rest.allow_makeup : (parsed.allow_makeup !== undefined ? parsed.allow_makeup : false);
            const cancelled_by_teacher = rest.cancelled_by_teacher !== undefined
              ? !!rest.cancelled_by_teacher
              : (parsed.cancelled_by_teacher !== undefined ? !!parsed.cancelled_by_teacher : false);
            
            let student_ids = class_students?.map((cs: any) => cs.student_id) || [];
            if (Object.keys(idMapping).length > 0) {
              student_ids = student_ids.map((sid: string) => idMapping[sid] || sid);
              // deduplicate student_ids within the same class
              student_ids = Array.from(new Set(student_ids));
            }

            if (student_ids.length === 0 && rest.title && students) {
              const cleanTitle = rest.title.replace(/\s*\(Repos.*?\)/i, "").trim().toLowerCase();
              const matchedStudent = students.find((s: any) => 
                s.name && (
                  s.name.toLowerCase().trim() === cleanTitle ||
                  cleanTitle.includes(s.name.toLowerCase().trim()) ||
                  s.name.toLowerCase().trim().includes(cleanTitle)
                )
              );
              if (matchedStudent) {
                student_ids = [matchedStudent.id];
              }
            }

            let status = rest.status || 'scheduled';
            const isMakeupNoteOnly = (report || "").trim().startsWith("Aula de reposição") || (rest.title || "").toLowerCase().includes("reposição") || (rest.title || "").toLowerCase().includes("reposicao") || (rest.title || "").toLowerCase().includes("reagendad");
            const hasActualAttendance = attendance && Object.keys(attendance).length > 0;
            const hasActualReport = report && report.trim().length > 0 && !report.trim().startsWith("Aula de reposição");
            const hasActualVocal = vocal_routine && vocal_routine.trim().length > 0;

            if (hasActualAttendance || hasActualReport || hasActualVocal) {
              if (status === 'scheduled') {
                status = 'completed';
              }
            } else if (isMakeupNoteOnly && !hasActualAttendance) {
              status = 'scheduled';
            }

            return {
              ...rest,
              start_time: rest.start_time ? rest.start_time.substring(0, 5) : rest.start_time,
              end_time: rest.end_time ? rest.end_time.substring(0, 5) : rest.end_time,
              status,
              report: (report || "").trim(),
              vocal_routine: (vocal_routine || "").trim(),
              attendance,
              student_ids,
              makeup_scheduled: !!makeup_scheduled,
              allow_makeup: allow_makeup !== undefined ? !!allow_makeup : !!rest.allow_makeup,
              cancelled_by_teacher,
              has_custom_students: parsed.has_custom_students !== undefined ? !!parsed.has_custom_students : (rest.has_custom_students !== undefined ? !!rest.has_custom_students : false),
            };
          });

          // Reconcile and protect recently saved classes and local state from being overwritten
          const now = Date.now();
          for (const [cid, saveInfo] of recentlySavedClassesRef.current.entries()) {
            if (now - saveInfo.timestamp > 60000) {
              recentlySavedClassesRef.current.delete(cid);
            }
          }

          const localClassesMap = new Map<string, ClassSession>((s.classes || []).map((c: ClassSession) => [c.id, c]));
          const pendingSyncsToRegister: Record<string, PendingClassSync> = getStoredPendingSyncs();

          const reconciledClasses = finalClasses.map(fc => {
            const recentSave = recentlySavedClassesRef.current.get(fc.id);
            if (recentSave && (now - recentSave.timestamp < 30000) && recentSave.confirmedBySelect) {
              return {
                ...fc,
                ...recentSave.classData,
              };
            }

            const pendingItem = pendingSyncsToRegister[fc.id];
            if (pendingItem) {
              const teachersMap = new Map<string, Teacher>((s.teachers || []).map((t: Teacher) => [t.id, t]));
              const comparison = compareAndClassifyClass(pendingItem, fc, teachersMap);
              if (comparison.isEquivalent || comparison.category === "synced") {
                // Already confirmed and equivalent on Supabase -> Safely purge from pending queue
                delete pendingSyncsToRegister[fc.id];
                return fc;
              }

              // Active pending sync exists: verify if there is a conflict
              const hasDateConflict = pendingItem.date && fc.date && pendingItem.date !== fc.date;
              const hasTimeConflict = pendingItem.start_time && fc.start_time && formatClassTime(pendingItem.start_time) !== formatClassTime(fc.start_time);
              if (hasDateConflict || hasTimeConflict) {
                console.warn(`[RECONCILIATION] Conflict detected for class ${fc.id}: pending date=${pendingItem.date}, remote date=${fc.date}`);
                pendingSyncsToRegister[fc.id] = {
                  ...pendingItem,
                  syncStatus: "conflict",
                  lastError: `Divergência detectada com o Supabase: Data local (${pendingItem.date}) vs Remota (${fc.date})`
                };
              }
              // Return pending item representation until resolved or confirmed
              return {
                ...fc,
                date: pendingItem.date || fc.date,
                start_time: pendingItem.start_time || fc.start_time,
                end_time: pendingItem.end_time || fc.end_time,
                title: pendingItem.title || fc.title,
                teacher_id: pendingItem.teacher_id || fc.teacher_id,
                group_id: pendingItem.group_id || fc.group_id,
                status: (pendingItem.status as any) || fc.status,
                report: pendingItem.report !== undefined ? pendingItem.report : fc.report,
                vocal_routine: pendingItem.vocal_routine !== undefined ? pendingItem.vocal_routine : fc.vocal_routine,
                attendance: pendingItem.attendance || fc.attendance,
                student_ids: (pendingItem.student_ids && pendingItem.student_ids.length > 0) ? pendingItem.student_ids : fc.student_ids,
                allow_makeup: pendingItem.allow_makeup !== undefined ? pendingItem.allow_makeup : fc.allow_makeup,
                makeup_scheduled: pendingItem.makeup_scheduled !== undefined ? pendingItem.makeup_scheduled : fc.makeup_scheduled,
              };
            }

            // No pending sync exists: Supabase is the single source of truth!
            return fc;
          });

          // ANTI-RESURRECTION: Only preserve local classes that were explicitly created offline and have a pending sync!
          (s.classes || []).forEach(localClass => {
            if (!reconciledClasses.some(c => c.id === localClass.id)) {
              const pendingEntry = pendingSyncsToRegister[localClass.id];
              if (pendingEntry && (pendingEntry as any).is_offline_created) {
                reconciledClasses.push(localClass);
              } else {
                console.log(`[ANTI-RESURRECTION] Skipping unconfirmed/deleted local class ${localClass.id}`);
              }
            }
          });

          saveStoredPendingSyncs(pendingSyncsToRegister);
          setPendingClassSyncs(pendingSyncsToRegister);
          const scopedPendingCount = computeScopedPendingSyncs(
            pendingSyncsToRegister,
            currentUserProfile,
            reconciledClasses,
            s.groups || [],
            s.teachers || []
          ).length;
          setPendingSyncCount(scopedPendingCount);

          // Deduplicate classes purely in-memory (never delete non-reconciled rows from Supabase DB)
          const seenUniqueClassIds = new Set<string>();
          const classesToKeep: ClassSession[] = [];
          for (const cls of reconciledClasses) {
            if (cls.id) {
              if (!seenUniqueClassIds.has(cls.id)) {
                seenUniqueClassIds.add(cls.id);
                classesToKeep.push(cls);
              }
            } else {
              classesToKeep.push(cls);
            }
          }

          // Asynchronously perform the database cleanup
          const runDatabaseDeduplication = async () => {
            if (duplicateIdsToDelete.length === 0) return;
            console.log('Running background database deduplication for students:', duplicateIdsToDelete);
            try {
              for (const [dupId, primId] of Object.entries(idMapping)) {
                // 1. Move enrollments
                const { error: err1 } = await supabase
                  .from('enrollments')
                  .update({ student_id: primId })
                  .eq('student_id', dupId);
                if (err1) console.error(`Error migrating enrollments for duplicate ${dupId}:`, err1);

                // 2. Move choir registrations
                const { error: err2 } = await supabase
                  .from('choir_registrations')
                  .update({ student_id: primId })
                  .eq('student_id', dupId);
                if (err2) console.error(`Error migrating choir_registrations for duplicate ${dupId}:`, err2);

                // 3. Move class_students (join table)
                const { data: dupMemberships } = await supabase
                  .from('class_students')
                  .select('*')
                  .eq('student_id', dupId);

                if (dupMemberships && dupMemberships.length > 0) {
                  for (const membership of dupMemberships) {
                    const { data: primMembership } = await supabase
                      .from('class_students')
                      .select('*')
                      .eq('class_id', membership.class_id)
                      .eq('student_id', primId);

                    if (primMembership && primMembership.length > 0) {
                      await supabase
                        .from('class_students')
                        .delete()
                        .eq('class_id', membership.class_id)
                        .eq('student_id', dupId);
                    } else {
                      await supabase
                        .from('class_students')
                        .update({ student_id: primId })
                        .eq('class_id', membership.class_id)
                        .eq('student_id', dupId);
                    }
                  }
                }
              }

              // NOTE: Automatic destructive deletion of enrollments is disabled.
              // Enrollments are preserved intact; any canonical duplicates are only logged for audit.

              // 4. Delete duplicate student records
              if (duplicateIdsToDelete.length > 0) {
                const { error: deleteErr } = await supabase
                  .from('students')
                  .delete()
                  .in('id', duplicateIdsToDelete);
                if (deleteErr) console.error('Error deleting duplicate students:', deleteErr);
                else console.log('Successfully completed database deduplication!');
              }
            } catch (err) {
              console.error('Unexpected error during database deduplication:', err);
            }
          };

          if (duplicateIdsToDelete.length > 0) {
            runDatabaseDeduplication();
          }

          const rawProspects = prospects.length > 0 ? prospects : s.prospects;
          const parsedProspects = rawProspects.map((pr: any) => {
            let not_eligible = false;
            let ineligibility_reason = "";
            let instrument = pr.instrument || "";
            if (instrument.includes(" // INELIGIBLE: ")) {
              const parts = instrument.split(" // INELIGIBLE: ");
              instrument = parts[0];
              not_eligible = true;
              ineligibility_reason = parts[1];
            }

            const {
              notes: cleanNotes,
              lead_status: metaStatus,
              message_history: metaHistory,
              term_signed: metaTermSigned,
              approved: metaApproved,
            } = parseProspectNotes(pr.notes);

            let message_history = pr.message_history;
            if (typeof message_history === 'string') {
              try {
                message_history = JSON.parse(message_history);
              } catch (e) {
                message_history = [];
              }
            }
            if (!Array.isArray(message_history) || message_history.length === 0) {
              message_history = metaHistory;
            }

            const lead_status = metaStatus || pr.lead_status || "";

            const term_signed =
              pr.term_signed !== undefined && pr.term_signed !== null
                ? !!pr.term_signed
                : metaTermSigned !== undefined
                ? metaTermSigned
                : lead_status === "matriculado";

            const approved =
              pr.approved !== undefined && pr.approved !== null
                ? !!pr.approved
                : metaApproved !== undefined
                ? metaApproved
                : lead_status === "matriculado";

            return {
              ...pr,
              notes: cleanNotes,
              lead_status,
              message_history,
              instrument,
              not_eligible,
              ineligibility_reason,
              term_signed,
              approved,
            };
          });

          let finalChoirCollaborators: any[] = [];
          if (loadedCollabsDb) {
            finalChoirCollaborators = [...(choirCollaborators || [])];
          } else {
            finalChoirCollaborators = [...(choirCollaborators || [])];
            (s.choirCollaborators || []).forEach(localC => {
              if (!finalChoirCollaborators.some(c => c.id === localC.id)) {
                finalChoirCollaborators.push(localC);
              }
            });
          }

          let finalChoirRehearsals: any[] = [];
          if (loadedRehearsalsDb) {
            finalChoirRehearsals = [...(choirRehearsals || [])];
          } else {
            finalChoirRehearsals = [...(choirRehearsals || [])];
            (s.choirRehearsals || []).forEach(localR => {
              const localAtt = parseAttendance(localR.attendance);
              const existingIdx = finalChoirRehearsals.findIndex(r => r.id === localR.id);
              if (existingIdx === -1) {
                finalChoirRehearsals.push({ ...localR, attendance: localAtt });
              } else {
                const dbAtt = parseAttendance(finalChoirRehearsals[existingIdx].attendance);
                if (localAtt.length >= dbAtt.length && localAtt.length > 0) {
                  finalChoirRehearsals[existingIdx] = {
                    ...finalChoirRehearsals[existingIdx],
                    ...localR,
                    attendance: localAtt
                  };
                } else if (dbAtt.length > 0) {
                  finalChoirRehearsals[existingIdx] = {
                    ...localR,
                    ...finalChoirRehearsals[existingIdx],
                    attendance: dbAtt
                  };
                }
              }
            });
          }

          const { cleanRehearsals: initCleanRehearsals, deletedIds: initDeletedRehearsalIds } = mergeAndDeduplicateRehearsals(finalChoirRehearsals);
          if (initDeletedRehearsalIds.length > 0) {
            supabase.from('choir_rehearsals').delete().in('id', initDeletedRehearsalIds).then(({ error }) => {
              if (error) console.warn('Error deleting initial duplicate rehearsals:', error);
            });
          }

          const { cleanCollabs: deduplicatedCollabs, cleanRehearsals: deduplicatedRehearsals, deletedIds: deletedCollabIds } = mergeAndDeduplicateCollaborators(
            finalChoirCollaborators,
            initCleanRehearsals
          );

          if (deletedCollabIds.length > 0) {
            supabase.from('choir_collaborators').delete().in('id', deletedCollabIds).then(({ error }) => {
              if (error) console.warn('Error deleting duplicate choir collaborators:', error);
            });
            syncCollaboratorsToSupabase(deduplicatedCollabs);
          }

          const parsedTeachers = teachers && teachers.length > 0 ? teachers.map((t: any) => ({
            ...t,
            status: (t.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
            schedule: Array.isArray(t.schedule) ? t.schedule : (typeof t.schedule === 'string' ? JSON.parse(t.schedule) : (t.schedule || []))
          })) : s.teachers.map((t: any) => ({
            ...t,
            status: (t.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
          }));

          // Ensure RAPHAEL AUGUSTO PINTO teacher record exists and has correct email
          let raphaelTeacher = (parsedTeachers || []).find((t: any) =>
            (t.email && t.email.trim().toLowerCase() === 'raphael.augustop@gmail.com') ||
            (t.name && t.name.toUpperCase().includes('RAPHAEL AUGUSTO'))
          );
          if (!raphaelTeacher) {
            raphaelTeacher = {
              id: 'dada085e-c187-43d2-9ab0-a9e0539df450',
              name: 'RAPHAEL AUGUSTO PINTO',
              email: 'raphael.augustop@gmail.com',
              phone: '',
              cpf: '',
              specialties: ['Música'],
              schedule: [],
              status: 'active'
            };
            parsedTeachers.push(raphaelTeacher);
          } else {
            if (!raphaelTeacher.status) {
              raphaelTeacher.status = 'active';
            }
            if (!raphaelTeacher.name || !raphaelTeacher.name.toUpperCase().includes('RAPHAEL AUGUSTO PINTO')) {
              raphaelTeacher.name = 'RAPHAEL AUGUSTO PINTO';
            }
            if (!raphaelTeacher.email || raphaelTeacher.email.trim().toLowerCase() !== 'raphael.augustop@gmail.com') {
              raphaelTeacher.email = 'raphael.augustop@gmail.com';
            }
          }

          const baseProfiles = profiles.length > 0
            ? profiles.map((p: any) => {
                const local = s.profiles.find((lp: any) => lp.id === p.id);
                return local && local.temp_password && !p.temp_password ? { ...p, temp_password: local.temp_password } : p;
              })
            : s.profiles;

          // Deduplicação canônica por profile.id (fonte da verdade: public.profiles)
          const uniqueProfiles = Array.from(
            new Map(baseProfiles.map((p: UserProfile) => [p.id, p])).values()
          );

          return {
            students: studentsToKeep,
            teachers: parsedTeachers,
            classes: classesToKeep,
            transactions: transactions || [],
            financialPlans: financialPlans || [],
            choirVoiceTypes: (choirVoiceTypes || []).filter(
              (v: any) => v.id !== 'sys_rehearsals_backup' && v.id !== 'sys_collaborators_backup'
            ),
            choirRegistrations: finalChoirRegistrations,
            choirCollaborators: deduplicatedCollabs,
            choirRehearsals: deduplicatedRehearsals,
            enrollments: finalEnrollments,
            discountRules: discountRules || [],
            groups: (groups || []).map((g: any) => {
              let payment_type: 'group' | 'individual' = 'individual';
              let price: number | undefined = undefined;
              let frequency: 'semanal' | 'quinzenal' | null = null;
              let schedule = g.schedule || "";
              if (schedule.includes(" // FREQ: ")) {
                const parts = schedule.split(" // FREQ: ");
                schedule = parts[0];
                const rawFreq = parts[1]?.trim();
                frequency = (rawFreq === 'semanal' || rawFreq === 'quinzenal') ? rawFreq : null;
              }
              if (schedule.includes(" // PRICE: ")) {
                const parts = schedule.split(" // PRICE: ");
                schedule = parts[0];
                price = Number(parts[1]);
              }
              if (schedule.includes(" // PAYMENT: ")) {
                const parts = schedule.split(" // PAYMENT: ");
                schedule = parts[0];
                payment_type = parts[1] as 'group' | 'individual';
              }
              return {
                ...g,
                status: (g.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
                schedule,
                payment_type,
                price,
                frequency,
              };
            }),
            prospects: parsedProspects,
            profiles: uniqueProfiles,
            credits: (() => {
              const baseCredits: Credit[] = dbCredits && dbCredits.length > 0 ? dbCredits : (s.credits || []);
              const creditsMap = new Map<string, Credit>();
              baseCredits.forEach((c: Credit) => {
                if (c.source_class_id) creditsMap.set(c.source_class_id, c);
                if (c.id) creditsMap.set(c.id, c);
              });
              const reconciled: Credit[] = [...baseCredits];

              classesToKeep.forEach((cl: ClassSession) => {
                const calc = calculateRaphaelClassCreditValue(
                  cl,
                  finalEnrollments,
                  financialPlans || [],
                  (groups || []),
                  parsedTeachers
                );

                if (calc.isEligible) {
                  const existing = creditsMap.get(cl.id) || creditsMap.get(`credit_${cl.id}`);
                  if (existing) {
                    const idx = reconciled.findIndex((c) => c.id === existing.id);
                    if (idx !== -1) {
                      reconciled[idx] = {
                        ...reconciled[idx],
                        amount: calc.amount,
                        student_id: calc.studentId,
                        enrollment_id: calc.enrollmentId || reconciled[idx].enrollment_id,
                        group_id: calc.groupId,
                        teacher_id: calc.teacherId,
                        competency_month: (cl.date || "").substring(0, 7),
                        // Preservar estritamente o status persistido do banco
                        status: existing.status,
                        used_date: existing.used_date || reconciled[idx].used_date,
                        notes: existing.notes || reconciled[idx].notes,
                      };
                    }
                  } else {
                    const newCred: Credit = {
                      id: `credit_${cl.id}`,
                      student_id: calc.studentId,
                      enrollment_id: calc.enrollmentId,
                      group_id: calc.groupId,
                      teacher_id: calc.teacherId,
                      source_class_id: cl.id,
                      amount: calc.amount,
                      status: "available",
                      competency_month: (cl.date || "").substring(0, 7),
                      created_at: new Date().toISOString(),
                      notes: `Crédito gerado pelo cancelamento da aula de ${cl.date} (Professor Raphael)`,
                    };
                    reconciled.push(newCred);
                    creditsMap.set(cl.id, newCred);
                    creditsMap.set(newCred.id, newCred);
                    newCreditsToAutoPersist.push({
                      id: newCred.id,
                      teacher_id: newCred.teacher_id,
                      student_id: newCred.student_id || null,
                      enrollment_id: newCred.enrollment_id || null,
                      group_id: newCred.group_id || null,
                      source_class_id: newCred.source_class_id || null,
                      amount: newCred.amount,
                      status: newCred.status,
                      competency_month: newCred.competency_month,
                      used_date: newCred.used_date || null,
                      notes: newCred.notes || null,
                      created_at: newCred.created_at || new Date().toISOString(),
                    });
                  }
                } else {
                  // Se a aula não for mais elegível e o crédito estiver como 'available', marcar como 'cancelled'.
                  // Se já foi 'used', NUNCA alterar, pois o crédito já foi utilizado contabilmente!
                  const existing = creditsMap.get(cl.id) || creditsMap.get(`credit_${cl.id}`);
                  if (existing && existing.status === "available") {
                    const idx = reconciled.findIndex((c) => c.id === existing.id);
                    if (idx !== -1) {
                      reconciled[idx] = {
                        ...reconciled[idx],
                        status: "cancelled",
                      };
                    }
                  }
                }
              });

              // Backfill de enrollment_id para créditos legados individuais
              reconciled.forEach((cred) => {
                if (!cred.group_id && !cred.enrollment_id && cred.student_id) {
                  const resolvedId = resolveCreditEnrollmentId(
                    cred,
                    finalEnrollments,
                    financialPlans || [],
                    groups || [],
                    classesToKeep
                  );
                  if (resolvedId) {
                    cred.enrollment_id = resolvedId;
                  }
                }
              });

              return reconciled;
            })(),
            affiliates: affiliatesLoaded ? dbAffiliates : (s.affiliates || []),
            affiliateReferrals: referralsLoaded ? dbAffiliateReferrals : (s.affiliateReferrals || []),
            affiliateCommissionRules: rulesLoaded ? dbAffiliateRules : (s.affiliateCommissionRules || []),
            affiliateClosings: closingsLoaded ? dbAffiliateClosings : (s.affiliateClosings || []),
            affiliateClosingItems: closingItemsLoaded ? dbAffiliateClosingItems : (s.affiliateClosingItems || []),
            competenceBillings: competenceBillingsLoaded ? dbCompetenceBillings : (s.competenceBillings || []),
          };
        });

        // Auto-persistência em lote de créditos novos gerados por cancelamento
        if (newCreditsToAutoPersist.length > 0) {
          try {
            void supabase.from('credits').upsert(newCreditsToAutoPersist, { onConflict: 'id', ignoreDuplicates: true });
          } catch (e) {
            console.warn('Erro ao auto-persistir créditos novos em fetchData:', e);
          }
        }
      } catch (error: any) {
        if (!active) return;
        console.error('Error fetching from Supabase:', error);
        setGlobalError('Não foi possível conectar ao banco de dados Supabase. O aplicativo continuará funcionando em modo offline com os dados salvos localmente no seu navegador.');
      } finally {
        isFetchingRef.current = false;
      }
    };

    fetchFromSupabase(true);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && active && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
        fetchFromSupabase(true);
      }
    });

    const intervalId = setInterval(() => {
      if (active && !isSavingRef.current && !isFetchingRef.current && !document.hidden) {
        fetchFromSupabase();
      }
    }, 60000);

    let lastFocusFetchTime = 0;
    const handleFocus = () => {
      const now = Date.now();
      if (active) {
        void reloadCurrentUserProfile(undefined, { silent: true });
      }
      if (active && !isSavingRef.current && !isFetchingRef.current && (now - lastFocusFetchTime > 30000)) {
        lastFocusFetchTime = now;
        fetchFromSupabase();
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      active = false;
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      subscription?.unsubscribe();
    };
  }, []);

  const syncGroupFutureClasses = async (groupId: string, overrideEnrollments?: Enrollment[]) => {
    if (!groupId || !groupId.trim()) return;

    // Use current group from state
    const currentGroup = state.groups.find((g) => g.id === groupId);
    if (!currentGroup) return;

    // Se o grupo estiver inativo, não alterar nem sincronizar novas aulas/alunos
    if (currentGroup.status === 'inactive') return;

    const allEnrollments = overrideEnrollments || state.enrollments;
    const allGroupEnrollments = allEnrollments.filter((e) => e.group_id === groupId);
    const allGroupStudentIds = new Set(allGroupEnrollments.map((e) => e.student_id));
    const activeGroupStudentIds = new Set(
      allGroupEnrollments
        .filter((e) => e.status === "active")
        .map((e) => e.student_id)
    );

    // Current date YYYY-MM-DD
    const todayStr = new Date().toISOString().split("T")[0];

    const eligibleClasses = state.classes.filter((c) => {
      // Direct group_id match or title matching fallback
      const isThisGroup =
        c.group_id === groupId ||
        (!c.group_id && findGroupMatch(c.title, state.groups)?.id === groupId);

      if (!isThisGroup) return false;

      // Must be future / today onwards
      if (!c.date || c.date < todayStr) return false;

      // Must be scheduled
      if (c.status !== "scheduled") return false;

      // Must not have attendance registered
      if (c.attendance && Object.keys(c.attendance).length > 0) {
        const hasRealAttendance = Object.values(c.attendance).some(
          (val) => val === "present" || val === "absent"
        );
        if (hasRealAttendance) return false;
      }

      // Must not have report or vocal routine
      if (c.report && c.report.trim() !== "") {
        const parsed = parsePackedReport(c.report);
        if (parsed.report?.trim() || parsed.vocal_routine?.trim()) {
          return false;
        }
      }

      return true;
    });

    if (eligibleClasses.length === 0) return;

    const updatedClassesMap = new Map<string, string[]>();
    const dbUpdatesList: {
      classId: string;
      addedSids: string[];
      removedSids: string[];
      nextStudentIds: string[];
      needSetGroupId: boolean;
    }[] = [];

    for (const c of eligibleClasses) {
      const currentStudentIds = Array.isArray(c.student_ids) ? c.student_ids : [];

      // Students to keep:
      // 1. If sid is currently active in this group -> KEEP
      // 2. If sid is not in allGroupStudentIds (i.e. guest / makeup student outside this group) -> KEEP
      // 3. If sid is in allGroupStudentIds but NOT in activeGroupStudentIds -> REMOVE
      const studentsToKeep = currentStudentIds.filter((sid) => {
        if (activeGroupStudentIds.has(sid)) return true;
        if (!allGroupStudentIds.has(sid)) return true;
        return false;
      });

      // Students to add: active group students not yet in the class
      const studentsToAdd = Array.from(activeGroupStudentIds).filter(
        (sid) => !currentStudentIds.includes(sid)
      );

      // Next student ids (deduplicated)
      const nextStudentIds = Array.from(new Set([...studentsToKeep, ...studentsToAdd]));

      const addedSids = nextStudentIds.filter((sid) => !currentStudentIds.includes(sid));
      const removedSids = currentStudentIds.filter((sid) => !nextStudentIds.includes(sid));
      const needSetGroupId = !c.group_id;

      if (addedSids.length > 0 || removedSids.length > 0 || needSetGroupId) {
        updatedClassesMap.set(c.id, nextStudentIds);
        dbUpdatesList.push({
          classId: c.id,
          addedSids,
          removedSids,
          nextStudentIds,
          needSetGroupId,
        });
      }
    }

    if (dbUpdatesList.length === 0) {
      return; // Idempotent
    }

    // Update local state
    setState((s) => ({
      ...s,
      classes: s.classes.map((c) => {
        const nextSids = updatedClassesMap.get(c.id);
        if (nextSids !== undefined) {
          return {
            ...c,
            student_ids: nextSids,
            group_id: c.group_id || groupId,
          };
        }
        return c;
      }),
    }));

    // Update Supabase incrementally
    for (const item of dbUpdatesList) {
      try {
        if (item.needSetGroupId) {
          await supabase.from("classes").update({ group_id: groupId }).eq("id", item.classId);
        }

        if (item.removedSids.length > 0) {
          const { error: delErr } = await supabase
            .from("class_students")
            .delete()
            .eq("class_id", item.classId)
            .in("student_id", item.removedSids);
          if (delErr) {
            console.warn(`[GROUP SYNC] Error removing students from class_students (${item.classId}):`, delErr);
          }
        }

        if (item.addedSids.length > 0) {
          const rowsToInsert = item.addedSids.map((sid) => ({
            class_id: item.classId,
            student_id: sid,
          }));
          const { error: insErr } = await supabase
            .from("class_students")
            .insert(rowsToInsert);
          if (insErr) {
            console.warn(`[GROUP SYNC] Error inserting students into class_students (${item.classId}):`, insErr);
          }
        }
      } catch (err) {
        console.warn(`[GROUP SYNC] Exception syncing class ${item.classId}:`, err);
      }
    }
  };

  const addStudent = async (student: Omit<Student, "id">) => {
    const cleanCpf = (student.cpf || "").replace(/\D/g, "");
    const exists = state.students.some(st => {
      const stCpf = (st.cpf || "").replace(/\D/g, "");
      if (cleanCpf && stCpf && cleanCpf === stCpf) return true;
      return st.name.toLowerCase().trim() === student.name.toLowerCase().trim();
    });

    if (exists) {
      console.warn("Duplicate student registration blocked for:", student.name);
      return;
    }

    const phoneRes = normalizePhoneNumber(student.phone);
    const finalPhone = phoneRes.normalized ? phoneRes.normalized : (student.phone ? student.phone.trim() : "");

    const newStudent = { ...student, phone: finalPhone, id: generateId() };
    setState((s) => ({
      ...s,
      students: [...s.students, newStudent],
    }));

    let dbInstrument = student.instrument || "";
    if (student.not_eligible && student.ineligibility_reason) {
      dbInstrument = `${student.instrument} // INELIGIBLE: ${student.ineligibility_reason}`;
    }

    const dbStudent = {
      id: newStudent.id,
      name: student.name,
      email: student.email && student.email.trim() !== "" ? student.email : null,
      phone: finalPhone && finalPhone.trim() !== "" ? finalPhone : null,
      cpf: student.cpf && student.cpf.trim() !== "" ? student.cpf : null,
      instrument: dbInstrument || null,
      status: student.status,
      enrollment_date: (student.enrollment_date && student.enrollment_date.trim() !== "") ? student.enrollment_date : null,
      birth_date: (student.birth_date && student.birth_date.trim() !== "") ? student.birth_date : null,
    };

    const { error } = await supabase.from('students').insert([dbStudent]);
    if (error) {
      console.error('Error adding student:', error);
      setGlobalError('Erro ao salvar aluno no banco de dados. Por favor, tente novamente.');
      // Revert local state
      setState((s) => ({
        ...s,
        students: s.students.filter(st => st.id !== newStudent.id),
      }));
    } else {
      // Sync matching prospect if any
      const matchingProspect = state.prospects.find(p => {
        const pCpf = (p.cpf || "").replace(/\D/g, "");
        const stCpf = (student.cpf || "").replace(/\D/g, "");
        if (pCpf && stCpf && pCpf === stCpf) return true;
        if (p.email && student.email && p.email.toLowerCase().trim() === student.email.toLowerCase().trim()) return true;
        return p.name.toLowerCase().trim() === student.name.toLowerCase().trim();
      });
      if (matchingProspect) {
        updateProspect(matchingProspect.id, {
          lead_status: 'matriculado',
          approved: true,
          term_signed: true,
        });
      }
    }
  };

  const updateStudent = async (id: string, updates: Partial<Student>) => {
    // Save previous state for rollback
    let previousStudent: Student | undefined;
    let mergedStudent: Student | undefined;

    let normalizedUpdates = { ...updates };
    if (updates.phone !== undefined) {
      const phoneRes = normalizePhoneNumber(updates.phone);
      if (phoneRes.normalized) {
        normalizedUpdates.phone = phoneRes.normalized;
      }
    }

    setState((s) => {
      previousStudent = s.students.find(st => st.id === id);
      const updatedList = s.students.map((st) => {
        if (st.id === id) {
          const m = { ...st, ...normalizedUpdates };
          mergedStudent = m;
          return m;
        }
        return st;
      });
      const isInactive = mergedStudent?.status === "inactive" || mergedStudent?.not_eligible;

      return {
        ...s,
        students: updatedList,
        enrollments: isInactive
          ? s.enrollments.map((en) => {
              if (en.student_id === id && en.status === "active") {
                return { ...en, status: "inactive" as const };
              }
              return en;
            })
          : s.enrollments,
      };
    });

    if (mergedStudent) {
      let dbInstrument = mergedStudent.instrument || "";
      if (mergedStudent.not_eligible && mergedStudent.ineligibility_reason) {
        dbInstrument = `${mergedStudent.instrument} // INELIGIBLE: ${mergedStudent.ineligibility_reason}`;
      }

      const isInactive = mergedStudent.status === "inactive" || mergedStudent.not_eligible;
      if (isInactive) {
        // Inactivate student enrollments in DB
        supabase.from('enrollments').update({ status: 'inactive' }).eq('student_id', id).then(({ error }) => {
          if (error) console.error('Error inactivating student enrollments:', error);
        });

        // Trigger safe incremental sync for all groups the student was active in (does NOT delete historical classes)
        const studentGroupIds = state.enrollments
          .filter((en): en is Enrollment & { group_id: string } => en.student_id === id && typeof en.group_id === 'string' && en.group_id.trim() !== '' && en.status === 'active')
          .map(en => en.group_id);

        const nextEnrollments = state.enrollments.map((en) => {
          if (en.student_id === id && en.status === "active") {
            return { ...en, status: "inactive" as const };
          }
          return en;
        });

        const uniqueGroupIds: string[] = [];
        studentGroupIds.forEach(gid => {
          if (!uniqueGroupIds.includes(gid)) uniqueGroupIds.push(gid);
        });

        for (const gid of uniqueGroupIds) {
          syncGroupFutureClasses(gid, nextEnrollments);
        }
      }

      const phoneRes = normalizePhoneNumber(mergedStudent.phone);
      const dbPhone = phoneRes.normalized ? phoneRes.normalized : (mergedStudent.phone && mergedStudent.phone.trim() !== "" ? mergedStudent.phone.trim() : null);

      const dbUpdates = {
        name: mergedStudent.name,
        email: mergedStudent.email && mergedStudent.email.trim() !== "" ? mergedStudent.email : null,
        phone: dbPhone,
        cpf: mergedStudent.cpf && mergedStudent.cpf.trim() !== "" ? mergedStudent.cpf : null,
        instrument: dbInstrument || null,
        status: mergedStudent.status,
        enrollment_date: (mergedStudent.enrollment_date && mergedStudent.enrollment_date.trim() !== "") ? mergedStudent.enrollment_date : null,
        birth_date: (mergedStudent.birth_date && mergedStudent.birth_date.trim() !== "") ? mergedStudent.birth_date : null,
      };

      const { error } = await supabase.from('students').update(dbUpdates).eq('id', id);
      if (error) {
        console.error('Error updating student:', error);
        setGlobalError('Erro ao atualizar aluno no banco de dados.');
        // Revert local state
        if (previousStudent) {
          setState((s) => ({
            ...s,
            students: s.students.map((st) =>
              st.id === id ? previousStudent! : st,
            ),
          }));
        }
      }
    }
  };

  const normalizeAllStudentPhones = async () => {
    let updatedCount = 0;
    const reportItems: Array<{
      studentId: string;
      studentName: string;
      originalPhone: string;
      newPhone: string | null;
      status: "already_e164" | "normalized" | "empty" | "invalid";
      error?: string;
    }> = [];

    const studentsToUpdateInDb: Array<{ id: string; phone: string }> = [];

    const updatedStudents = state.students.map((student) => {
      const res = normalizePhoneNumber(student.phone);
      reportItems.push({
        studentId: student.id,
        studentName: student.name,
        originalPhone: student.phone || "",
        newPhone: res.normalized,
        status: res.status,
        error: res.error,
      });

      if (res.status === "normalized" && res.normalized && res.normalized !== student.phone) {
        updatedCount++;
        studentsToUpdateInDb.push({ id: student.id, phone: res.normalized });
        return {
          ...student,
          phone: res.normalized,
        };
      }
      return student;
    });

    if (updatedCount > 0) {
      setState((s) => ({
        ...s,
        students: updatedStudents,
      }));

      for (const item of studentsToUpdateInDb) {
        try {
          await supabase.from('students').update({ phone: item.phone }).eq('id', item.id);
        } catch (e) {
          console.error("Error updating normalized phone in Supabase for student:", item.id, e);
        }
      }
    }

    return {
      total: state.students.length,
      updatedCount,
      alreadyE164Count: reportItems.filter(r => r.status === "already_e164").length,
      invalidCount: reportItems.filter(r => r.status === "invalid" || r.status === "empty").length,
      reportItems,
    };
  };
  const deleteStudent = async (id: string) => {
    let deletedStudent: Student | undefined;
    setState((s) => {
      deletedStudent = s.students.find(st => st.id === id);
      return {
        ...s,
        students: s.students.filter((st) => st.id !== id),
      };
    });
    if (true) {
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) {
        console.error('Error deleting student:', error);
        setGlobalError('Erro ao excluir aluno no banco de dados.');
        // Revert local state
        if (deletedStudent) {
          setState((s) => ({
            ...s,
            students: [...s.students, deletedStudent!],
          }));
        }
      }
    }
  };

  const addTeacher = async (teacher: Omit<Teacher, "id">) => {
    const cleanCpf = (teacher.cpf || "").replace(/\D/g, "");
    if (cleanCpf) {
      const duplicate = state.teachers.find(t => (t.cpf || "").replace(/\D/g, "") === cleanCpf);
      if (duplicate) {
        setGlobalError(`Este CPF já possui cadastro (Professor: "${duplicate.name}").`);
        return;
      }
    }

    const newTeacher: Teacher = {
      ...teacher,
      id: generateId(),
      status: teacher.status || 'active',
      specialties: teacher.specialties || [],
      schedule: teacher.schedule || [],
      birth_date: teacher.birth_date && teacher.birth_date.trim() !== "" ? teacher.birth_date : undefined,
      email: teacher.email ? teacher.email.trim() : "",
      phone: teacher.phone ? teacher.phone.trim() : "",
      cpf: teacher.cpf ? teacher.cpf.trim() : "",
    };

    setState((s) => ({
      ...s,
      teachers: [...s.teachers, newTeacher],
    }));

    const dbTeacher = {
      id: newTeacher.id,
      name: newTeacher.name,
      email: newTeacher.email && newTeacher.email.trim() !== "" ? newTeacher.email : null,
      phone: newTeacher.phone && newTeacher.phone.trim() !== "" ? newTeacher.phone : null,
      cpf: newTeacher.cpf && newTeacher.cpf.trim() !== "" ? newTeacher.cpf : null,
      specialties: newTeacher.specialties,
      birth_date: (newTeacher.birth_date && newTeacher.birth_date.trim() !== "") ? newTeacher.birth_date : null,
      schedule: newTeacher.schedule || [],
      status: newTeacher.status,
    };

    const { error } = await supabase.from('teachers').insert([dbTeacher]);
    if (error) {
      console.error('Error adding teacher:', error);
      setGlobalError(`Erro ao salvar professor no banco de dados (${error.message || 'Falha ao inserir'}).`);
      setState((s) => ({
        ...s,
        teachers: s.teachers.filter(t => t.id !== newTeacher.id),
      }));
    }
  };

  const updateTeacher = async (id: string, updates: Partial<Teacher>) => {
    let previousTeacher: Teacher | undefined;
    let mergedTeacher: Teacher | undefined;

    setState((s) => {
      previousTeacher = s.teachers.find(t => t.id === id);
      const updatedList = s.teachers.map((t) => {
        if (t.id === id) {
          const m = { ...t, ...updates };
          mergedTeacher = m;
          return m;
        }
        return t;
      });
      return {
        ...s,
        teachers: updatedList,
      };
    });

    if (mergedTeacher) {
      const dbUpdates: Record<string, any> = {};
      if (updates.name !== undefined) dbUpdates.name = mergedTeacher.name;
      if (updates.email !== undefined) dbUpdates.email = mergedTeacher.email && mergedTeacher.email.trim() !== "" ? mergedTeacher.email : null;
      if (updates.phone !== undefined) dbUpdates.phone = mergedTeacher.phone && mergedTeacher.phone.trim() !== "" ? mergedTeacher.phone : null;
      if (updates.cpf !== undefined) dbUpdates.cpf = mergedTeacher.cpf && mergedTeacher.cpf.trim() !== "" ? mergedTeacher.cpf : null;
      if (updates.specialties !== undefined) dbUpdates.specialties = mergedTeacher.specialties;
      if (updates.schedule !== undefined) dbUpdates.schedule = mergedTeacher.schedule;
      if (updates.birth_date !== undefined) dbUpdates.birth_date = (mergedTeacher.birth_date && mergedTeacher.birth_date.trim() !== "") ? mergedTeacher.birth_date : null;
      if (updates.status !== undefined) dbUpdates.status = mergedTeacher.status;

      if (Object.keys(dbUpdates).length > 0) {
        const { error } = await supabase.from('teachers').update(dbUpdates).eq('id', id);
        if (error) {
          console.error('Error updating teacher:', error);
          setGlobalError(`Erro ao atualizar professor no banco de dados (${error.message || 'Falha na atualização'}).`);
          if (previousTeacher) {
            setState((s) => ({
              ...s,
              teachers: s.teachers.map((t) => (t.id === id ? previousTeacher! : t)),
            }));
          }
        }
      }
    }
  };

  const toggleTeacherStatus = async (
    teacherId: string,
    status: 'active' | 'inactive'
  ): Promise<{ success: boolean; error?: string }> => {
    // 1. Validar permissão: SOMENTE super_admin pode inativar/reativar professores
    if (currentUserProfile?.role !== 'super_admin') {
      const err = 'Permissão negada. Apenas Super Administradores podem inativar ou reativar professores.';
      setGlobalError(err);
      return { success: false, error: err };
    }

    const currentTeacher = state.teachers.find(t => t.id === teacherId);
    if (!currentTeacher) {
      const err = 'Professor não encontrado.';
      setGlobalError(err);
      return { success: false, error: err };
    }

    if (currentTeacher.status === status) {
      return { success: true };
    }

    // 2. Chamar RPC seguro ou atualizar no Supabase com validação no backend
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('admin_toggle_teacher_status', {
        target_teacher_id: teacherId,
        target_status: status,
      });

      if (rpcErr) {
        console.warn('RPC admin_toggle_teacher_status fallback to direct update:', rpcErr.message);
        const { error } = await supabase
          .from('teachers')
          .update({ status })
          .eq('id', teacherId);

        if (error) {
          console.error('Error toggling teacher status:', error);
          const errMsg = `Erro ao atualizar status do professor no banco de dados (${error.message || 'Falha na gravação'}).`;
          setGlobalError(errMsg);
          return { success: false, error: errMsg };
        }
      } else if (rpcRes && (rpcRes as any).success === false) {
        const errMsg = (rpcRes as any).message || 'Falha ao atualizar status do professor.';
        setGlobalError(errMsg);
        return { success: false, error: errMsg };
      }

      // 3. Somente depois de confirmar a gravação, atualizar o estado local
      setState(s => ({
        ...s,
        teachers: s.teachers.map(t => t.id === teacherId ? { ...t, status } : t)
      }));

      return { success: true };
    } catch (err: any) {
      console.error('Unexpected error toggling teacher status:', err);
      const errMsg = `Erro inesperado ao salvar status do professor: ${err?.message || 'Falha de conexão'}`;
      setGlobalError(errMsg);
      return { success: false, error: errMsg };
    }
  };

  const deleteTeacher = async (id: string) => {
    // Bloqueio de exclusão física para preservação de integridade referencial e histórica
    console.warn(`[TEACHER] Physical deletion blocked to preserve historical integrity. Use toggleTeacherStatus instead. id=${id}`);
    setGlobalError("Exclusão física desabilitada para preservar o histórico de aulas e financeiro. Utilize a opção Inativar.");
  };

  const formatClassTime = (t?: string) => {
    if (!t) return "00:00:00";
    if (t.length === 5) return `${t}:00`;
    return t;
  };

  const addClass = async (session: Omit<ClassSession, "id">) => {
    return executeSaveOperation(async () => {
      const rawReport = session.report || "";
      const parsed = parsePackedReport(rawReport);
      const cleanSessionReport = (session.report && !session.report.includes("//")) ? session.report : (parsed.report || "");
      const cleanSessionVocalRoutine = session.vocal_routine || parsed.vocal_routine || "";
      const cleanAttendance: Record<string, "present" | "absent"> =
        (session.attendance && Object.keys(session.attendance).length > 0)
          ? (session.attendance as Record<string, "present" | "absent">)
          : (parsed.attendance as Record<string, "present" | "absent">);

      // Bloquear agendamento de novas aulas para professor inativo
      if (session.teacher_id && session.teacher_id.trim() !== "") {
        const assignedTeacher = state.teachers.find(t => t.id === session.teacher_id);
        if (assignedTeacher && assignedTeacher.status === 'inactive') {
          console.warn(`[CLASS CREATION BLOCKED] Cannot create new class for inactive teacher: ${assignedTeacher.name}`);
          return {
            success: false,
            pending: false,
            error: `Não é permitido agendar novas aulas para o professor "${assignedTeacher.name}" pois ele está inativo.`
          };
        }
      }

      if (session.group_id && session.group_id.trim() !== "") {
        const grp = state.groups.find(g => g.id === session.group_id);
        if (grp && grp.teacher_id) {
          const grpTeacher = state.teachers.find(t => t.id === grp.teacher_id);
          if (grpTeacher && grpTeacher.status === 'inactive') {
            console.warn(`[CLASS CREATION BLOCKED] Cannot generate class for group with inactive teacher: ${grpTeacher.name}`);
            return {
              success: false,
              pending: false,
              error: `Não é possível gerar aulas para a turma "${grp.name}": o professor responsável está inativo.`
            };
          }
        }
      }

      const newClass: ClassSession = {
        ...session,
        id: generateId(),
        report: cleanSessionReport,
        vocal_routine: cleanSessionVocalRoutine,
        attendance: cleanAttendance,
      };

      // Record in recent saves cache immediately to guard against background fetch race conditions
      recentlySavedClassesRef.current.set(newClass.id, {
        classData: newClass,
        timestamp: Date.now(),
        updatedFields: ['date', 'start_time', 'end_time', 'teacher_id', 'group_id', 'title', 'status', 'report', 'vocal_routine', 'attendance', 'student_ids', 'allow_makeup', 'makeup_scheduled'],
        confirmedBySelect: false
      });

      setState((s) => ({
        ...s,
        classes: [...s.classes, newClass],
      }));

      const { student_ids } = newClass;
      const dbReport = packReport(
        cleanSessionReport,
        cleanSessionVocalRoutine,
        cleanAttendance,
        newClass.makeup_scheduled,
        newClass.allow_makeup,
        newClass.cancelled_by_teacher,
        newClass.has_custom_students
      );

      // Validate foreign keys
      let validTeacherId: string | null = null;
      if (newClass.teacher_id && newClass.teacher_id.trim() !== "") {
        const teacherExists = state.teachers.some(t => t.id === newClass.teacher_id);
        if (teacherExists) {
          validTeacherId = newClass.teacher_id.trim();
        }
      }

      let validGroupId: string | null = null;
      if (newClass.group_id && newClass.group_id.trim() !== "") {
        const groupExists = state.groups.some(g => g.id === newClass.group_id);
        if (groupExists) {
          validGroupId = newClass.group_id.trim();
        }
      }

      const dbClass: any = {
        id: newClass.id,
        group_id: validGroupId,
        title: newClass.title || 'Aula',
        teacher_id: validTeacherId,
        date: newClass.date,
        start_time: formatClassTime(newClass.start_time),
        end_time: formatClassTime(newClass.end_time),
        status: newClass.status || 'scheduled',
        allow_makeup: !!newClass.allow_makeup,
        makeup_scheduled: !!newClass.makeup_scheduled,
        report: dbReport,
      };

      let isConfirmed = false;
      let syncError: any = null;

      try {
        const { data: insData, error } = await supabase.from('classes').insert([dbClass]).select('id');
        if (!error && insData && insData.length > 0) {
          isConfirmed = true;
        } else {
          syncError = error;
          console.warn('Insert class failed with full fields, trying minimal insert:', error);
          if (error && (error.code === '42501' || error.message?.toLowerCase().includes('row-level security') || error.message?.toLowerCase().includes('permission denied'))) {
            console.error('Supabase RLS Permission Error on addClass:', error);
            setGlobalError('Aviso de Segurança (RLS): O Supabase bloqueou a gravação da aula. Execute o script de permissões RLS no painel de Perfis/Usuários para liberar acesso aos professores e admins.');
          }
          const minimalClass: any = {
            id: newClass.id,
            title: newClass.title || 'Aula',
            teacher_id: validTeacherId,
            date: newClass.date,
            start_time: formatClassTime(newClass.start_time),
            end_time: formatClassTime(newClass.end_time),
            status: newClass.status || 'scheduled',
            report: dbReport,
          };
          const { data: retryData, error: retryErr } = await supabase.from('classes').insert([minimalClass]).select('id');
          if (!retryErr && retryData && retryData.length > 0) {
            isConfirmed = true;
            syncError = null;
          } else {
            console.warn('Minimal insert failed, trying without teacher_id:', retryErr);
            delete minimalClass.teacher_id;
            const { data: noTeacherData, error: noTeacherErr } = await supabase.from('classes').insert([minimalClass]).select('id');
            if (!noTeacherErr && noTeacherData && noTeacherData.length > 0) {
              isConfirmed = true;
              syncError = null;
            } else {
              syncError = noTeacherErr || retryErr || error;
            }
          }
        }
      } catch (e: any) {
        console.warn('Error during addClass database insert:', e);
        syncError = e;
      }
      
      if (student_ids && student_ids.length > 0) {
        const existingStudentIds = new Set(state.students.map(s => s.id));
        const validStudentIds = student_ids.filter(sid => Boolean(sid && String(sid).trim() && existingStudentIds.has(sid)));
        if (validStudentIds.length > 0) {
          const classStudents = validStudentIds.map(student_id => ({ class_id: newClass.id, student_id }));
          try {
            await supabase.from('class_students').insert(classStudents);
          } catch (err) {
            console.warn('Error inserting class_students:', err);
          }
        }
      }

      const pendingMap = getStoredPendingSyncs();
      if (isConfirmed) {
        delete pendingMap[newClass.id];
        saveStoredPendingSyncs(pendingMap);
        setPendingClassSyncs(pendingMap);
        setPendingSyncCount(Object.keys(pendingMap).length);

        // Disparo assíncrono e NÃO-BLOQUEANTE para Google Calendar (segundo plano)
        let googleSyncPromise: Promise<SyncResult> | undefined = undefined;
        try {
          const studentNames = (newClass.student_ids || [])
            .map(sid => state.students.find(s => s.id === sid)?.name)
            .filter(Boolean) as string[];
          const groupName = newClass.group_id ? state.groups.find(g => g.id === newClass.group_id)?.name : undefined;

          googleSyncPromise = triggerGoogleClassSync({
            action: 'create',
            classSession: newClass,
            studentName: studentNames.join(', '),
            groupName,
          }).then(res => {
            inFlightGoogleSyncRef.current.delete(newClass.id);
            const confirmedEventId = res.eventId || res.googleEventId;
            if (res.synced && confirmedEventId) {
              classGoogleEventsMapRef.current.set(newClass.id, {
                platformClassId: newClass.id,
                googleEventId: confirmedEventId,
                googleCalendarId: 'primary',
                teacherId: newClass.teacher_id || null,
              });
              setGoogleClassSyncStatus(newClass.id, {
                status: 'synced',
                eventId: confirmedEventId,
                lastAttemptAt: new Date().toISOString(),
              });
            } else {
              setGoogleClassSyncStatus(newClass.id, {
                status: 'failed',
                error: res.error || res.actionTaken,
                lastAttemptAt: new Date().toISOString(),
              });
            }
            if (!res.synced) {
              console.warn(`[GoogleSync] Sincronização em segundo plano da aula ${newClass.id} finalizou com aviso:`, res.actionTaken, res.error);
            }
            return res;
          }).catch(e => {
            inFlightGoogleSyncRef.current.delete(newClass.id);
            console.warn('[GoogleSync] Erro assíncrono em segundo plano na criação:', e);
            setGoogleClassSyncStatus(newClass.id, {
              status: 'failed',
              error: e?.message || 'Erro de rede',
              lastAttemptAt: new Date().toISOString(),
            });
            return { synced: false, actionTaken: 'network_error', eventId: null, googleEventId: null, error: e?.message };
          });
          inFlightGoogleSyncRef.current.set(newClass.id, googleSyncPromise);
        } catch (syncErr) {
          console.warn('[GoogleSync] Falha ao disparar sincronização em segundo plano:', syncErr);
        }

        return { success: true, pending: false, googleSyncPromise };
      } else {
        pendingMap[newClass.id] = {
          class_id: newClass.id,
          teacher_id: newClass.teacher_id,
          group_id: newClass.group_id,
          title: newClass.title || 'Aula',
          date: newClass.date,
          start_time: newClass.start_time,
          end_time: newClass.end_time,
          status: newClass.status,
          report: newClass.report,
          vocal_routine: newClass.vocal_routine,
          attendance: newClass.attendance,
          student_ids: newClass.student_ids,
          allow_makeup: newClass.allow_makeup,
          makeup_scheduled: newClass.makeup_scheduled,
          cancelled_by_teacher: newClass.cancelled_by_teacher,
          timestamp: Date.now(),
          syncStatus: "pending",
          is_offline_created: true,
          lastError: syncError?.message || "Servidor não confirmou gravação"
        };
        saveStoredPendingSyncs(pendingMap);
        setPendingClassSyncs(pendingMap);
        setPendingSyncCount(Object.keys(pendingMap).length);
        return {
          success: false,
          pending: true,
          error: syncError?.message || "Aula salva localmente no navegador."
        };
      }
    });
  };

  const updateClass = async (id: string, updates: Partial<ClassSession>): Promise<{ success: boolean; pending: boolean; error?: string; googleSyncPromise?: Promise<SyncResult> }> => {
    return executeSaveOperation(async () => {
      console.log(`[CLASS SYNC] Initiating update for class ${id}...`, updates);

      const currentClass = state.classes.find(c => c.id === id);
      if (!currentClass) {
        console.error(`[CLASS SYNC] Class ${id} not found in local state`);
        return { success: false, pending: false, error: "Aula não encontrada no estado local" };
      }

      // Impedir transferência de aula para um professor inativo
      if (updates.teacher_id && updates.teacher_id !== currentClass.teacher_id) {
        const targetTeacher = state.teachers.find(t => t.id === updates.teacher_id);
        if (targetTeacher && targetTeacher.status === 'inactive') {
          return {
            success: false,
            pending: false,
            error: `Não é possível transferir a aula para o professor "${targetTeacher.name}" pois ele está inativo.`
          };
        }
      }

      // Compute prospective merged class
      const rawNewReport = (updates.report !== undefined && updates.report !== null) ? String(updates.report) : (currentClass.report || "");
      const parsed = parsePackedReport(rawNewReport);
      const cleanNewReport = (updates.report !== undefined && !rawNewReport.includes("//"))
        ? rawNewReport
        : (parsed.report || currentClass.report || "");

      const cleanNewVocalRoutine = (updates.vocal_routine !== undefined && updates.vocal_routine !== null)
        ? String(updates.vocal_routine)
        : (parsed.vocal_routine || currentClass.vocal_routine || "");

      const finalAttendance: Record<string, "present" | "absent"> = updates.attendance !== undefined
        ? (updates.attendance as Record<string, "present" | "absent">)
        : (Object.keys(parsed.attendance).length > 0 ? (parsed.attendance as Record<string, "present" | "absent">) : (currentClass.attendance || {}));

      const finalStudentIds = updates.student_ids !== undefined ? updates.student_ids : currentClass.student_ids;
      const hasAttendance = finalAttendance && Object.keys(finalAttendance).length > 0;
      const isMakeupNoteOnly = (cleanNewReport || "").trim().startsWith("Aula de reposição") || (currentClass.title || "").toLowerCase().includes("reposição") || (currentClass.title || "").toLowerCase().includes("reposicao") || (updates.title || "").toLowerCase().includes("reposição") || (updates.title || "").toLowerCase().includes("reposicao");
      const hasReport = (cleanNewReport && cleanNewReport.trim().length > 0 && !cleanNewReport.trim().startsWith("Aula de reposição")) || (cleanNewVocalRoutine && cleanNewVocalRoutine.length > 0);

      let computedStatus = updates.status || currentClass.status;
      if ((hasAttendance || hasReport) && computedStatus === 'scheduled') {
        computedStatus = 'completed';
      } else if (isMakeupNoteOnly && !hasAttendance && !hasReport && computedStatus !== 'cancelled') {
        computedStatus = 'scheduled';
      }

      const finalAllowMakeup = updates.allow_makeup !== undefined ? updates.allow_makeup : currentClass.allow_makeup;
      const finalMakeupScheduled = updates.makeup_scheduled !== undefined ? updates.makeup_scheduled : currentClass.makeup_scheduled;
      const finalCancelledByTeacher = updates.cancelled_by_teacher !== undefined
        ? updates.cancelled_by_teacher
        : (currentClass.cancelled_by_teacher !== undefined ? currentClass.cancelled_by_teacher : parsed.cancelled_by_teacher);

      const finalHasCustomStudents = updates.has_custom_students !== undefined
        ? updates.has_custom_students
        : (currentClass.has_custom_students !== undefined ? currentClass.has_custom_students : parsed.has_custom_students);

      const mergedClass: ClassSession = {
        ...currentClass,
        ...updates,
        student_ids: finalStudentIds,
        status: computedStatus,
        report: cleanNewReport,
        vocal_routine: cleanNewVocalRoutine,
        attendance: finalAttendance,
        allow_makeup: finalAllowMakeup,
        makeup_scheduled: finalMakeupScheduled,
        cancelled_by_teacher: computedStatus === "cancelled" ? finalCancelledByTeacher : false,
        has_custom_students: finalHasCustomStudents,
      };

      const dbReport = packReport(
        mergedClass.report || "",
        mergedClass.vocal_routine || "",
        mergedClass.attendance,
        mergedClass.makeup_scheduled,
        mergedClass.allow_makeup,
        mergedClass.cancelled_by_teacher,
        mergedClass.has_custom_students
      );

      // Validate teacher_id against state.teachers
      let validTeacherId: string | null = null;
      if (mergedClass.teacher_id && mergedClass.teacher_id.trim() !== "") {
        const teacherExists = state.teachers.some(t => t.id === mergedClass.teacher_id);
        if (teacherExists) {
          validTeacherId = mergedClass.teacher_id.trim();
        }
      }

      // Validate group_id against state.groups
      let validGroupId: string | null = null;
      if (mergedClass.group_id && mergedClass.group_id.trim() !== "") {
        const groupExists = state.groups.some(g => g.id === mergedClass.group_id);
        if (groupExists) {
          validGroupId = mergedClass.group_id.trim();
        }
      }

      const dbClass: any = {
        group_id: validGroupId,
        title: mergedClass.title || 'Aula',
        teacher_id: validTeacherId,
        date: mergedClass.date,
        start_time: formatClassTime(mergedClass.start_time),
        end_time: formatClassTime(mergedClass.end_time),
        status: mergedClass.status || 'scheduled',
        allow_makeup: !!mergedClass.allow_makeup,
        makeup_scheduled: !!mergedClass.makeup_scheduled,
        report: dbReport,
      };

      // Execute UPDATE directly on Supabase (optimizing roundtrips, no optimistic false success)
      let updateError: any = null;
      let confirmedData: any = null;

      try {
        const { data: updateRes, error: updErr } = await supabase
          .from('classes')
          .update(dbClass)
          .eq('id', id)
          .select('id, date, start_time, end_time, teacher_id, group_id, status, report, allow_makeup, makeup_scheduled');

        if (updErr) {
          console.error(`[CLASS SYNC] Supabase update failed for class ${id}:`, updErr);
          throw updErr;
        }

        if (!updateRes || updateRes.length === 0) {
          console.error(`[CLASS SYNC] Class ${id} does not exist on Supabase for update`);
          throw new Error(`A aula não existe no servidor Supabase. O registro pode ter sido excluído.`);
        }

        confirmedData = updateRes[0];

        // STEP 3: Sync class_students if student_ids was updated
        if (updates.student_ids !== undefined) {
          try {
            await supabase.from('class_students').delete().eq('class_id', id);
            const existingStudentIds = new Set(state.students.map(s => s.id));
            const validStudentIds = updates.student_ids.filter(sid => Boolean(sid && String(sid).trim() && existingStudentIds.has(sid)));
            if (validStudentIds.length > 0) {
              const classStudents = validStudentIds.map(student_id => ({ class_id: id, student_id }));
              const { error: csErr } = await supabase.from('class_students').insert(classStudents);
              if (csErr) console.warn('[CLASS SYNC] Warning inserting class_students in Supabase:', csErr);
            }
          } catch (csException) {
            console.warn('[CLASS SYNC] Exception during class_students sync:', csException);
          }
        }

        // STEP 4: Confirm returned data matches requested critical fields
        const parsedReport = parsePackedReport(confirmedData.report);
        const confirmedDate = confirmedData.date;
        const confirmedStartTime = confirmedData.start_time ? confirmedData.start_time.substring(0, 5) : '';
        const confirmedEndTime = confirmedData.end_time ? confirmedData.end_time.substring(0, 5) : '';
        const confirmedStatus = confirmedData.status;
        const confirmedMakeup = confirmedData.makeup_scheduled !== undefined ? confirmedData.makeup_scheduled : parsedReport.makeup_scheduled;

        const expectedStartTime = updates.start_time ? updates.start_time.substring(0, 5) : '';
        const expectedEndTime = updates.end_time ? updates.end_time.substring(0, 5) : '';

        const isDateMatching = !updates.date || confirmedDate === updates.date;
        const isStartTimeMatching = !updates.start_time || confirmedStartTime === expectedStartTime;
        const isEndTimeMatching = !updates.end_time || confirmedEndTime === expectedEndTime;
        const isStatusMatching = !updates.status || confirmedStatus === mergedClass.status || confirmedStatus === updates.status;
        const isMakeupMatching = updates.makeup_scheduled === undefined || !!confirmedMakeup === !!mergedClass.makeup_scheduled || !!confirmedMakeup === !!updates.makeup_scheduled;

        if (!isDateMatching || !isStartTimeMatching || !isEndTimeMatching || !isStatusMatching || !isMakeupMatching) {
          console.warn(`[CLASS SYNC] Confirmation field mismatch for class ${id}:`, {
            expected: { date: updates.date, start_time: expectedStartTime, end_time: expectedEndTime, status: mergedClass.status, makeup_scheduled: mergedClass.makeup_scheduled },
            actual: { date: confirmedDate, start_time: confirmedStartTime, end_time: confirmedEndTime, status: confirmedStatus, makeup_scheduled: confirmedMakeup }
          });
          throw new Error("Os dados retornados pelo servidor não conferem com a alteração solicitada.");
        }

        console.log(`[CLASS SYNC] Supabase update confirmed for class ${id}`);

      } catch (err: any) {
        updateError = err;
        console.error(`[CLASS SYNC] Supabase update failed for class ${id}:`, err);
      }

      const pendingMap = getStoredPendingSyncs();

      if (!updateError && confirmedData) {
        // STEP 5: ONLY NOW update React State & localStorage
        setState((s) => {
          const updatedList = s.classes.map((c) => (c.id === id ? mergedClass : c));

          // Reconcile credit for this specific class
          const calc = calculateRaphaelClassCreditValue(
            mergedClass,
            s.enrollments,
            s.financialPlans,
            s.groups,
            s.teachers
          );
          const updatedCredits = [...(s.credits || [])];
          const existingIdx = updatedCredits.findIndex((c) => c.source_class_id === id);

          if (calc.isEligible) {
            if (existingIdx !== -1) {
              updatedCredits[existingIdx] = {
                ...updatedCredits[existingIdx],
                amount: calc.amount,
                student_id: calc.studentId,
                enrollment_id: calc.enrollmentId || updatedCredits[existingIdx].enrollment_id,
                group_id: calc.groupId,
                teacher_id: calc.teacherId,
                competency_month: (mergedClass.date || "").substring(0, 7),
                status: updatedCredits[existingIdx].status === "used" ? "used" : "available",
              };
            } else {
              updatedCredits.push({
                id: `credit_${id}`,
                student_id: calc.studentId,
                enrollment_id: calc.enrollmentId,
                group_id: calc.groupId,
                teacher_id: calc.teacherId,
                source_class_id: id,
                amount: calc.amount,
                status: "available",
                competency_month: (mergedClass.date || "").substring(0, 7),
                created_at: new Date().toISOString(),
                notes: `Crédito gerado pelo cancelamento da aula de ${mergedClass.date} (Professor Raphael)`,
              });
            }
          } else if (existingIdx !== -1 && updatedCredits[existingIdx].status === "available") {
            updatedCredits[existingIdx] = {
              ...updatedCredits[existingIdx],
              status: "cancelled",
            };
          }

          return { ...s, classes: updatedList, credits: updatedCredits };
        });

        // Record in cache with confirmed status
        recentlySavedClassesRef.current.set(id, {
          classData: mergedClass,
          timestamp: Date.now(),
          updatedFields: Object.keys(updates) as Array<keyof ClassSession>,
          confirmedBySelect: true
        });

        // Remove from pending queue
        delete pendingMap[id];
        saveStoredPendingSyncs(pendingMap);
        setPendingClassSyncs(pendingMap);
        setPendingSyncCount(Object.keys(pendingMap).length);

        console.log(`[CLASS SYNC] Local state updated & pending sync removed for class ${id}`);

        // Disparo assíncrono e NÃO-BLOQUEANTE para Google Calendar (atualização ou cancelamento em segundo plano)
        let googleSyncPromise: Promise<SyncResult> | undefined = undefined;
        try {
          const prevTeacherId = currentClass.teacher_id;
          const studentNames = (mergedClass.student_ids || [])
            .map(sid => state.students.find(s => s.id === sid)?.name)
            .filter(Boolean) as string[];
          const groupName = mergedClass.group_id ? state.groups.find(g => g.id === mergedClass.group_id)?.name : undefined;

          const cachedContext = classGoogleEventsMapRef.current.get(id);
          googleSyncPromise = triggerGoogleClassSync({
            action: 'update',
            classSession: mergedClass,
            previousTeacherId: prevTeacherId,
            studentName: studentNames.join(', '),
            groupName,
            googleSyncContext: mergedClass.status === 'cancelled' && cachedContext ? cachedContext : undefined,
          }).then(res => {
            inFlightGoogleSyncRef.current.delete(id);
            const confirmedEventId = res.eventId || res.googleEventId;
            if (mergedClass.status === 'cancelled' && res.synced) {
              classGoogleEventsMapRef.current.delete(id);
              setGoogleClassSyncStatus(id, {
                status: 'synced',
                lastAttemptAt: new Date().toISOString(),
              });
            } else if (res.synced && confirmedEventId) {
              classGoogleEventsMapRef.current.set(id, {
                platformClassId: id,
                googleEventId: confirmedEventId,
                googleCalendarId: 'primary',
                teacherId: mergedClass.teacher_id || null,
              });
              setGoogleClassSyncStatus(id, {
                status: 'synced',
                eventId: confirmedEventId,
                lastAttemptAt: new Date().toISOString(),
              });
            } else {
              setGoogleClassSyncStatus(id, {
                status: 'failed',
                error: res.error || res.actionTaken,
                lastAttemptAt: new Date().toISOString(),
              });
            }
            if (!res.synced) {
              console.warn(`[GoogleSync] Sincronização em segundo plano na atualização da aula ${id} finalizou com aviso:`, res.actionTaken, res.error);
            }
            return res;
          }).catch(e => {
            inFlightGoogleSyncRef.current.delete(id);
            console.warn('[GoogleSync] Erro assíncrono em segundo plano na atualização:', e);
            setGoogleClassSyncStatus(id, {
              status: 'failed',
              error: e?.message || 'Erro de rede',
              lastAttemptAt: new Date().toISOString(),
            });
            return { synced: false, actionTaken: 'network_error', eventId: null, googleEventId: null, error: e?.message };
          });
          inFlightGoogleSyncRef.current.set(id, googleSyncPromise);
        } catch (syncErr) {
          console.warn('[GoogleSync] Falha ao disparar atualização em segundo plano:', syncErr);
        }

        return { success: true, pending: false, googleSyncPromise };
      } else {
        // Save failed! DO NOT update local state as if it succeeded!
        // Record pending item with error status to preserve the user's intent without hiding the error
        pendingMap[id] = {
          class_id: id,
          teacher_id: mergedClass.teacher_id,
          group_id: mergedClass.group_id,
          title: mergedClass.title || 'Aula',
          date: mergedClass.date,
          start_time: mergedClass.start_time,
          end_time: mergedClass.end_time,
          status: mergedClass.status,
          report: mergedClass.report,
          vocal_routine: mergedClass.vocal_routine,
          attendance: mergedClass.attendance,
          student_ids: mergedClass.student_ids,
          allow_makeup: mergedClass.allow_makeup,
          makeup_scheduled: mergedClass.makeup_scheduled,
          cancelled_by_teacher: mergedClass.cancelled_by_teacher,
          timestamp: Date.now(),
          syncStatus: "error",
          lastError: updateError?.message || "Não foi possível salvar esta alteração no servidor. A alteração não foi confirmada."
        };
        saveStoredPendingSyncs(pendingMap);
        setPendingClassSyncs(pendingMap);
        setPendingSyncCount(Object.keys(pendingMap).length);

        return {
          success: false,
          pending: true,
          error: updateError?.message || "Não foi possível salvar esta alteração no servidor. A alteração não foi confirmada."
        };
      }
    });
  };

  const deleteClass = async (id: string) => {
    return executeSaveOperation(async () => {
      recentlySavedClassesRef.current.delete(id);

      // Clean pending map
      const pendingMap = getStoredPendingSyncs();
      if (pendingMap[id]) {
        delete pendingMap[id];
        saveStoredPendingSyncs(pendingMap);
        setPendingClassSyncs(pendingMap);
        setPendingSyncCount(Object.keys(pendingMap).length);
      }

      const classToDelete = state.classes.find((c) => c.id === id);

      // 0. Se houver sincronização de criação/atualização em andamento para esta aula,
      // aguarda brevemente (máx 4s) para garantir que o google_event_id já tenha sido registrado
      const inFlightSync = inFlightGoogleSyncRef.current.get(id);
      if (inFlightSync) {
        try {
          await Promise.race([
            inFlightSync,
            new Promise((resolve) => setTimeout(resolve, 4000)),
          ]);
        } catch {
          // Ignorar erro de sync anterior; prosseguir com exclusão
        }
      }

      // 1. ANTES de excluir a aula na plataforma, captura o mapeamento do Google Calendar
      // priorizando o endpoint backend dedicado (/api/google/class-delete-context com supabaseAdmin)
      // e preservando classGoogleEventsMapRef como fallback em memória.
      const memoryContext = classGoogleEventsMapRef.current.get(id);
      let googleSyncContext: {
        platformClassId: string;
        googleEventId: string;
        googleCalendarId?: string;
        teacherId?: string | null;
      } | undefined = memoryContext;

      try {
        const ctxRes = await fetchClassDeleteContext(id);
        if (ctxRes.exists && ctxRes.googleEventId) {
          googleSyncContext = {
            platformClassId: id,
            googleEventId: ctxRes.googleEventId,
            googleCalendarId: ctxRes.googleCalendarId || memoryContext?.googleCalendarId || 'primary',
            teacherId: ctxRes.teacherId || classToDelete?.teacher_id || memoryContext?.teacherId || null,
          };
        }
      } catch (mappingErr) {
        console.warn('[GoogleSync] Aviso ao buscar mapeamento antes da exclusão:', mappingErr);
      }

      classGoogleEventsMapRef.current.delete(id);

      // 2. Exclusão no UI e no Supabase (Plataforma é a fonte da verdade e é excluída primeiro)
      setState((s) => ({
        ...s,
        classes: s.classes.filter((c) => c.id !== id),
        credits: (s.credits || []).map((c) =>
          c.source_class_id === id && c.status === "available" ? { ...c, status: "cancelled" as const } : c
        ),
      }));
      const { error } = await supabase.from('classes').delete().eq('id', id);
      if (error) console.error('Error deleting class from Supabase:', error);

      // 3. SOMENTE APÓS A EXCLUSÃO DA PLATAFORMA:
      // Disparo assíncrono e NÃO-BLOQUEANTE para remover evento do Google Calendar em segundo plano
      const resolvedTeacherId = googleSyncContext?.teacherId || classToDelete?.teacher_id || null;
      const sessionToSync: ClassSession = classToDelete
        ? {
            ...classToDelete,
            teacher_id: resolvedTeacherId || classToDelete.teacher_id,
          }
        : {
            id,
            title: 'Aula Excluída',
            date: '',
            start_time: '',
            end_time: '',
            teacher_id: resolvedTeacherId,
          };

      try {
        void triggerGoogleClassSync({
          action: 'delete',
          classSession: sessionToSync,
          googleSyncContext,
        }).catch(e => console.warn('[GoogleSync] Erro assíncrono em segundo plano na exclusão:', e));
      } catch (syncErr) {
        console.warn('[GoogleSync] Falha ao disparar exclusão em segundo plano:', syncErr);
      }
    });
  };

  const addTransaction = async (transaction: Omit<Transaction, "id">) => {
    const newTransaction = { ...transaction, id: generateId() };
    setState((s) => ({
      ...s,
      transactions: [...s.transactions, newTransaction],
    }));
    if (true) {
      const { error } = await supabase.from('transactions').insert([newTransaction]);
      if (error) console.error('Error adding transaction:', error);
    }
  };
  const updateTransaction = async (id: string, updates: Partial<Transaction>) => {
    setState((s) => ({
      ...s,
      transactions: s.transactions.map((t) =>
        t.id === id ? { ...t, ...updates } : t,
      ),
    }));
    if (true) {
      const { error } = await supabase.from('transactions').update(updates).eq('id', id);
      if (error) console.error('Error updating transaction:', error);
    }
  };
  const deleteTransaction = async (id: string) => {
    setState((s) => ({
      ...s,
      transactions: s.transactions.filter((t) => t.id !== id),
    }));
    if (true) {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) console.error('Error deleting transaction:', error);
    }
  };

  const addFinancialPlan = async (plan: Omit<FinancialPlan, "id">) => {
    const newPlan = { ...plan, id: generateId() };
    setState((s) => ({
      ...s,
      financialPlans: [...s.financialPlans, newPlan],
    }));
    if (true) {
      const { error } = await supabase.from('financial_plans').insert([newPlan]);
      if (error) console.error('Error adding financial plan:', error);
    }
  };
  const updateFinancialPlan = async (id: string, updates: Partial<FinancialPlan>) => {
    setState((s) => ({
      ...s,
      financialPlans: s.financialPlans.map((p) =>
        p.id === id ? { ...p, ...updates } : p,
      ),
    }));
    if (true) {
      const { error } = await supabase.from('financial_plans').update(updates).eq('id', id);
      if (error) console.error('Error updating financial plan:', error);
    }
  };
  const deleteFinancialPlan = async (id: string) => {
    setState((s) => ({
      ...s,
      financialPlans: s.financialPlans.filter((p) => p.id !== id),
    }));
    if (true) {
      const { error } = await supabase.from('financial_plans').delete().eq('id', id);
      if (error) console.error('Error deleting financial plan:', error);
    }
  };

  const addChoirVoiceType = async (voiceType: Omit<ChoirVoiceType, "id">) => {
    const newVoiceType = { ...voiceType, id: generateId() };
    setState((s) => ({
      ...s,
      choirVoiceTypes: [...s.choirVoiceTypes, newVoiceType],
    }));
    if (true) {
      const { error } = await supabase.from('choir_voice_types').insert([newVoiceType]);
      if (error) console.error('Error adding choir voice type:', error);
    }
  };
  const updateChoirVoiceType = async (id: string, updates: Partial<ChoirVoiceType>) => {
    setState((s) => ({
      ...s,
      choirVoiceTypes: s.choirVoiceTypes.map((v) =>
        v.id === id ? { ...v, ...updates } : v,
      ),
    }));
    if (true) {
      const { error } = await supabase.from('choir_voice_types').update(updates).eq('id', id);
      if (error) console.error('Error updating choir voice type:', error);
    }
  };
  const deleteChoirVoiceType = async (id: string) => {
    setState((s) => ({
      ...s,
      choirVoiceTypes: s.choirVoiceTypes.filter((v) => v.id !== id),
    }));
    if (true) {
      const { error } = await supabase.from('choir_voice_types').delete().eq('id', id);
      if (error) console.error('Error deleting choir voice type:', error);
    }
  };

  const addChoirRegistration = async (registration: Omit<ChoirRegistration, "id">) => {
    const isInactive = registration.status === 'inactive' || registration.active === false;
    const isApproved = !isInactive && (registration.status === 'approved' || registration.active === true);
    const resolvedActive = isApproved;
    const resolvedStatus: ChoirRegistration['status'] = isInactive ? 'inactive' : (isApproved ? 'approved' : (registration.status || 'pending'));

    const newRegistration: ChoirRegistration = {
      ...registration,
      id: generateId(),
      status: resolvedStatus,
      active: resolvedActive,
    };

    setState((s) => ({
      ...s,
      choirRegistrations: [...s.choirRegistrations, newRegistration],
    }));

    const dbPayload: any = {
      id: newRegistration.id,
      student_id: newRegistration.student_id,
      voice_type_id: newRegistration.voice_type_id,
      monthly_fee: newRegistration.monthly_fee,
      is_internal_student: newRegistration.is_internal_student,
      status: isInactive ? 'rejected' : (isApproved ? 'approved' : 'pending'),
    };

    try {
      const { error: err1 } = await supabase.from('choir_registrations').insert([
        { ...dbPayload, active: resolvedActive }
      ]);
      if (err1) {
        const { error: err2 } = await supabase.from('choir_registrations').insert([dbPayload]);
        if (err2) console.error('Error adding choir registration to Supabase:', err2);
      }
    } catch (e) {
      console.warn('Exception adding choir registration to Supabase:', e);
    }
  };

  const updateChoirRegistration = async (id: string, updates: Partial<ChoirRegistration>) => {
    const isInactive = updates.status === 'inactive' || updates.active === false;
    const isApproved = !isInactive && (updates.status === 'approved' || updates.active === true);

    const normalizedUpdates: Partial<ChoirRegistration> = {
      ...updates,
      ...(isInactive ? { status: 'inactive', active: false } : {}),
      ...(isApproved ? { status: 'approved', active: true } : {}),
    };

    setState((s) => ({
      ...s,
      choirRegistrations: s.choirRegistrations.map((r) =>
        r.id === id ? { ...r, ...normalizedUpdates } : r,
      ),
    }));

    const dbPayload: any = { ...updates };
    if (isInactive) {
      dbPayload.status = 'rejected';
      dbPayload.active = false;
    } else if (isApproved) {
      dbPayload.status = 'approved';
      dbPayload.active = true;
    }

    try {
      // 1. Try with active field
      const { error: err1 } = await supabase
        .from('choir_registrations')
        .update(dbPayload)
        .eq('id', id);

      if (err1) {
        // 2. Fallback without active column (using status 'rejected'/'approved'/'pending')
        const cleanPayload: any = { ...dbPayload };
        delete cleanPayload.active;
        if (isInactive) cleanPayload.status = 'rejected';
        else if (isApproved) cleanPayload.status = 'approved';

        const { error: err2 } = await supabase
          .from('choir_registrations')
          .update(cleanPayload)
          .eq('id', id);

        if (err2) {
          console.error('Error updating choir registration in Supabase:', err2);
        }
      }
    } catch (e) {
      console.warn('Exception updating choir registration in Supabase:', e);
    }
  };

  const deleteChoirRegistration = async (id: string) => {
    setState((s) => ({
      ...s,
      choirRegistrations: s.choirRegistrations.filter((r) => r.id !== id),
    }));
    try {
      const { error } = await supabase.from('choir_registrations').delete().eq('id', id);
      if (error) console.error('Error deleting choir registration:', error);
    } catch (e) {
      console.warn('Exception deleting choir registration:', e);
    }
  };

  const addChoirCollaborator = async (collaborator: Omit<ChoirCollaborator, "id">) => {
    let nextCollabs: ChoirCollaborator[] = [];
    let deletedCollabIds: string[] = [];

    setState((s) => {
      const existingIdx = (s.choirCollaborators || []).findIndex(c => {
        if (collaborator.teacher_id && c.teacher_id && c.teacher_id.trim() === collaborator.teacher_id.trim()) {
          return true;
        }
        return c.name && collaborator.name && c.name.trim().toLowerCase() === collaborator.name.trim().toLowerCase();
      });

      let updatedList = [...(s.choirCollaborators || [])];
      if (existingIdx !== -1) {
        const existing = updatedList[existingIdx];
        updatedList[existingIdx] = {
          ...existing,
          ...collaborator,
          active: collaborator.active !== undefined ? collaborator.active : (existing.active !== false),
          id: existing.id
        };
      } else {
        const newCollaborator: ChoirCollaborator = {
          ...collaborator,
          active: collaborator.active !== undefined ? collaborator.active : true,
          id: generateId()
        };
        updatedList.push(newCollaborator);
      }

      const dedup = mergeAndDeduplicateCollaborators(updatedList, s.choirRehearsals || []);
      nextCollabs = dedup.cleanCollabs;
      deletedCollabIds = dedup.deletedIds;

      return {
        ...s,
        choirCollaborators: nextCollabs,
        choirRehearsals: dedup.cleanRehearsals
      };
    });

    if (deletedCollabIds.length > 0) {
      try {
        await supabase.from('choir_collaborators').delete().in('id', deletedCollabIds);
      } catch (e) {
        console.warn('Error deleting duplicate collaborator:', e);
      }
    }

    await syncCollaboratorsToSupabase(nextCollabs);
  };

  const updateChoirCollaborator = async (id: string, updates: Partial<ChoirCollaborator>) => {
    let nextCollabs: ChoirCollaborator[] = [];
    let deletedCollabIds: string[] = [];

    setState((s) => {
      const updatedList = (s.choirCollaborators || []).map((c) =>
        c.id === id ? { ...c, ...updates } : c
      );

      const dedup = mergeAndDeduplicateCollaborators(updatedList, s.choirRehearsals || []);
      nextCollabs = dedup.cleanCollabs;
      deletedCollabIds = dedup.deletedIds;

      return {
        ...s,
        choirCollaborators: nextCollabs,
        choirRehearsals: dedup.cleanRehearsals
      };
    });

    if (deletedCollabIds.length > 0) {
      try {
        await supabase.from('choir_collaborators').delete().in('id', deletedCollabIds);
      } catch (e) {
        console.warn('Error deleting duplicate collaborator:', e);
      }
    }

    await syncCollaboratorsToSupabase(nextCollabs);
  };

  const deleteChoirCollaborator = async (id: string) => {
    let nextCollabs: ChoirCollaborator[] = [];
    setState((s) => {
      nextCollabs = (s.choirCollaborators || []).filter((c) => c.id !== id);
      return {
        ...s,
        choirCollaborators: nextCollabs,
      };
    });
    try {
      await supabase.from('choir_collaborators').delete().eq('id', id);
    } catch (e) {
      console.warn('Error deleting choir collaborator:', e);
    }
  };

  const addChoirRehearsal = async (rehearsal: Omit<ChoirRehearsal, "id">) => {
    let nextRehearsals: ChoirRehearsal[] = [];
    let deletedIds: string[] = [];

    setState((s) => {
      const currentList = [...(s.choirRehearsals || [])];
      const existingIdx = currentList.findIndex(r => r.date === rehearsal.date);

      if (existingIdx !== -1) {
        currentList[existingIdx] = {
          ...currentList[existingIdx],
          ...rehearsal,
          attendance: parseAttendance(rehearsal.attendance).length > 0
            ? parseAttendance(rehearsal.attendance)
            : currentList[existingIdx].attendance
        };
      } else {
        currentList.push({
          ...rehearsal,
          id: generateId(),
          attendance: parseAttendance(rehearsal.attendance)
        });
      }

      const dedup = mergeAndDeduplicateRehearsals(currentList);
      nextRehearsals = dedup.cleanRehearsals;
      deletedIds = dedup.deletedIds;

      return {
        ...s,
        choirRehearsals: nextRehearsals,
      };
    });

    if (deletedIds.length > 0) {
      try {
        await supabase.from('choir_rehearsals').delete().in('id', deletedIds);
      } catch (e) {
        console.warn('Error deleting duplicate rehearsal from Supabase:', e);
      }
    }

    await syncRehearsalsToSupabase(nextRehearsals);
  };

  const updateChoirRehearsal = async (id: string, updates: Partial<ChoirRehearsal>) => {
    let nextRehearsals: ChoirRehearsal[] = [];
    let deletedIds: string[] = [];

    setState((s) => {
      const updatedList = (s.choirRehearsals || []).map((r) =>
        r.id === id ? { ...r, ...updates } : r
      );

      const dedup = mergeAndDeduplicateRehearsals(updatedList);
      nextRehearsals = dedup.cleanRehearsals;
      deletedIds = dedup.deletedIds;

      return {
        ...s,
        choirRehearsals: nextRehearsals,
      };
    });

    if (deletedIds.length > 0) {
      try {
        await supabase.from('choir_rehearsals').delete().in('id', deletedIds);
      } catch (e) {
        console.warn('Error deleting duplicate rehearsal from Supabase:', e);
      }
    }

    await syncRehearsalsToSupabase(nextRehearsals);
  };

  const deleteChoirRehearsal = async (id: string): Promise<{ success: boolean; message?: string }> => {
    let idsToDelete: string[] = [id];
    const target = (state.choirRehearsals || []).find(r => r.id === id);
    if (target && target.date) {
      const sameDateIds = (state.choirRehearsals || [])
        .filter(r => r.date === target.date)
        .map(r => r.id);
      idsToDelete = Array.from(new Set([...idsToDelete, ...sameDateIds]));
    }

    try {
      const { error } = await supabase.from('choir_rehearsals').delete().in('id', idsToDelete);
      if (error) {
        console.error('Erro ao excluir ensaio no Supabase:', error);
        return { success: false, message: `Erro ao excluir no Supabase: ${error.message}` };
      }
    } catch (e: any) {
      console.warn('Exceção ao excluir ensaio no Supabase:', e);
      return { success: false, message: e?.message || 'Falha de conexão ao excluir ensaio' };
    }

    setState((s) => ({
      ...s,
      choirRehearsals: (s.choirRehearsals || []).filter((r) => !idsToDelete.includes(r.id)),
    }));
    return { success: true };
  };

  const generateBiweeklyRehearsals = async (
    startDate: string,
    count: number,
    time: string = '19:30',
    titlePrefix: string = 'Ensaio Quinzenal do Coral'
  ) => {
    const baseDate = new Date(startDate + 'T00:00:00');
    let nextRehearsals: ChoirRehearsal[] = [];
    let deletedRehearsalIds: string[] = [];

    setState((s) => {
      const currentRehearsals = [...(s.choirRehearsals || [])];
      const newRehearsals: ChoirRehearsal[] = [];

      for (let i = 0; i < count; i++) {
        const rehearsalDate = new Date(baseDate);
        rehearsalDate.setDate(baseDate.getDate() + i * 14);
        const dateStr = rehearsalDate.toISOString().split('T')[0];

        const existingIdx = currentRehearsals.findIndex(r => r.date === dateStr);
        if (existingIdx !== -1) {
          currentRehearsals[existingIdx] = {
            ...currentRehearsals[existingIdx],
            time: time || currentRehearsals[existingIdx].time || '19:30',
            title: currentRehearsals[existingIdx].title || `${titlePrefix} #${i + 1}`,
          };
        } else {
          newRehearsals.push({
            id: generateId(),
            date: dateStr,
            time,
            title: `${titlePrefix} #${i + 1}`,
            notes: 'Ensaio quinzenal programado',
            attendance: [],
          });
        }
      }

      const dedup = mergeAndDeduplicateRehearsals([...currentRehearsals, ...newRehearsals]);
      nextRehearsals = dedup.cleanRehearsals;
      deletedRehearsalIds = dedup.deletedIds;

      return {
        ...s,
        choirRehearsals: nextRehearsals,
      };
    });

    if (deletedRehearsalIds.length > 0) {
      try {
        await supabase.from('choir_rehearsals').delete().in('id', deletedRehearsalIds);
      } catch (e) {
        console.warn('Error deleting duplicate rehearsals from Supabase:', e);
      }
    }

    await syncRehearsalsToSupabase(nextRehearsals);
  };

  const cleanDuplicateRehearsals = async () => {
    let nextRehearsals: ChoirRehearsal[] = [];
    let nextCollabs: ChoirCollaborator[] = [];
    let deletedRehearsalIds: string[] = [];
    let deletedCollabIds: string[] = [];

    setState((s) => {
      const dedupR = mergeAndDeduplicateRehearsals(s.choirRehearsals || []);
      const dedupC = mergeAndDeduplicateCollaborators(s.choirCollaborators || [], dedupR.cleanRehearsals);

      nextRehearsals = dedupC.cleanRehearsals;
      nextCollabs = dedupC.cleanCollabs;
      deletedRehearsalIds = dedupR.deletedIds;
      deletedCollabIds = dedupC.deletedIds;

      return {
        ...s,
        choirRehearsals: nextRehearsals,
        choirCollaborators: nextCollabs,
      };
    });

    if (deletedRehearsalIds.length > 0) {
      try {
        await supabase.from('choir_rehearsals').delete().in('id', deletedRehearsalIds);
      } catch (e) {
        console.warn('Error deleting duplicate rehearsal IDs:', e);
      }
    }

    if (deletedCollabIds.length > 0) {
      try {
        await supabase.from('choir_collaborators').delete().in('id', deletedCollabIds);
      } catch (e) {
        console.warn('Error deleting duplicate collaborator IDs:', e);
      }
    }

    await syncRehearsalsToSupabase(nextRehearsals);
    await syncCollaboratorsToSupabase(nextCollabs);
  };

  const addEnrollment = async (enrollment: Omit<Enrollment, "id">): Promise<EnrollmentPersistenceResult> => {
    isSavingRef.current = true;
    localEditsVersionRef.current++;
    currentFetchIdRef.current++;

    try {
      return await executeAddEnrollmentFlow({
        enrollmentInput: enrollment,
        generatedId: generateId(),
        currentEnrollments: state.enrollments,
        supabaseClient: supabase as any,
        onCommitState: (nextEnrollments) => {
          setState((s) => ({
            ...s,
            enrollments: nextEnrollments,
          }));
        },
        onSyncGroupFutureClasses: async (groupId, nextEnrollments) => {
          await syncGroupFutureClasses(groupId, nextEnrollments);
        },
        onSyncAffiliateReferral: async (newEnrollment) => {
          await syncEnrollmentAffiliateReferral({
            enrollment: newEnrollment,
            students: state.students,
            existingReferrals: state.affiliateReferrals || [],
            addAffiliateReferral,
            updateAffiliateReferral,
          });
        },
      });
    } finally {
      isSavingRef.current = false;
    }
  };
  const updateEnrollment = async (id: string, updates: Partial<Enrollment>): Promise<EnrollmentPersistenceResult> => {
    isSavingRef.current = true;
    localEditsVersionRef.current++;
    currentFetchIdRef.current++;

    try {
      return await executeUpdateEnrollmentFlow({
        id,
        updates,
        currentEnrollments: state.enrollments,
        supabaseClient: supabase as any,
        onCommitState: (nextEnrollments) => {
          setState((s) => ({
            ...s,
            enrollments: nextEnrollments,
          }));
        },
        onSyncGroupFutureClasses: async (groupId, nextEnrollments) => {
          await syncGroupFutureClasses(groupId, nextEnrollments);
        },
        onSyncAffiliateReferral: async (updatedEnrollment) => {
          await syncEnrollmentAffiliateReferral({
            enrollment: updatedEnrollment,
            students: state.students,
            existingReferrals: state.affiliateReferrals || [],
            addAffiliateReferral,
            updateAffiliateReferral,
          });
        },
      });
    } finally {
      isSavingRef.current = false;
    }
  };
  const deleteEnrollment = async (id: string) => {
    const previousEnrollment = state.enrollments.find((e) => e.id === id);
    const nextEnrollments = state.enrollments.filter((e) => e.id !== id);
    setState((s) => ({
      ...s,
      enrollments: nextEnrollments,
    }));
    if (true) {
      const { error } = await supabase.from('enrollments').delete().eq('id', id);
      if (error) console.error('Error deleting enrollment:', error);
    }

    if (previousEnrollment?.group_id) {
      await syncGroupFutureClasses(previousEnrollment.group_id, nextEnrollments);
    }
  };

  const addDiscountRule = async (rule: Omit<DiscountRule, "id">) => {
    const newRule = { ...rule, id: generateId() };
    setState((s) => ({
      ...s,
      discountRules: [...s.discountRules, newRule],
    }));
    if (true) {
      const { error } = await supabase.from('financial_discount_rules').insert([newRule]);
      if (error) console.error('Error adding discount rule:', error);
    }
  };
  const updateDiscountRule = async (id: string, updates: Partial<DiscountRule>) => {
    setState((s) => ({
      ...s,
      discountRules: s.discountRules.map((r) =>
        r.id === id ? { ...r, ...updates } : r,
      ),
    }));
    if (true) {
      const { error } = await supabase.from('financial_discount_rules').update(updates).eq('id', id);
      if (error) console.error('Error updating discount rule:', error);
    }
  };
  const deleteDiscountRule = async (id: string) => {
    setState((s) => ({
      ...s,
      discountRules: s.discountRules.filter((r) => r.id !== id),
    }));
    if (true) {
      const { error } = await supabase.from('financial_discount_rules').delete().eq('id', id);
      if (error) console.error('Error deleting discount rule:', error);
    }
  };

  const addGroup = async (group: Omit<Group, "id">) => {
    const newGroup: Group = { ...group, id: generateId(), status: group.status || 'active' };
    setState((s) => ({
      ...s,
      groups: [...s.groups, newGroup],
    }));
    if (true) {
      let dbSchedule = group.schedule || "";
      if (group.payment_type) {
        dbSchedule = `${group.schedule || ""} // PAYMENT: ${group.payment_type}`;
      }
      if (group.price !== undefined) {
        dbSchedule = `${dbSchedule} // PRICE: ${group.price}`;
      }
      if (group.frequency) {
        dbSchedule = `${dbSchedule} // FREQ: ${group.frequency}`;
      }
      const dbGroup: any = {
        id: newGroup.id,
        name: group.name,
        teacher_id: group.teacher_id,
        max_students: group.max_students,
        schedule: dbSchedule,
        status: newGroup.status || 'active',
      };
      const { error } = await supabase.from('groups').insert([dbGroup]);
      if (error) console.error('Error adding group:', error);
    }
  };
  const updateGroup = async (id: string, updates: Partial<Group>): Promise<{ success: boolean; error?: any }> => {
    let mergedGroup: Group | undefined;
    setState((s) => {
      const updatedList = s.groups.map((g) => {
        if (g.id === id) {
          const m = { ...g, ...updates };
          mergedGroup = m;
          return m;
        }
        return g;
      });
      return {
        ...s,
        groups: updatedList,
      };
    });

    if (mergedGroup) {
      let dbSchedule = mergedGroup.schedule || "";
      if (mergedGroup.payment_type) {
        dbSchedule = `${mergedGroup.schedule || ""} // PAYMENT: ${mergedGroup.payment_type}`;
      }
      if (mergedGroup.price !== undefined) {
        dbSchedule = `${dbSchedule} // PRICE: ${mergedGroup.price}`;
      }
      if (mergedGroup.frequency) {
        dbSchedule = `${dbSchedule} // FREQ: ${mergedGroup.frequency}`;
      }
      const dbGroup: any = {
        name: mergedGroup.name,
        teacher_id: mergedGroup.teacher_id,
        max_students: mergedGroup.max_students,
        schedule: dbSchedule,
      };
      if (mergedGroup.status !== undefined) {
        dbGroup.status = mergedGroup.status;
      }
      const { error } = await supabase.from('groups').update(dbGroup).eq('id', id);
      if (error) {
        console.error('Error updating group:', error);
        return { success: false, error };
      }
      return { success: true };
    }
    return { success: false, error: new Error('Group not found') };
  };
  const deleteGroup = async (id: string) => {
    setState((s) => ({
      ...s,
      groups: s.groups.filter((g) => g.id !== id),
    }));
    if (true) {
      const { error } = await supabase.from('groups').delete().eq('id', id);
      if (error) console.error('Error deleting group:', error);
    }
  };

  const addProspect = async (prospect: Omit<Prospect, "id">) => {
    const newProspect = { 
      ...prospect, 
      id: generateId(), 
      created_at: new Date().toISOString(),
      approved: prospect.lead_status === 'matriculado' ? true : !!prospect.approved,
      term_signed: prospect.lead_status === 'matriculado' ? true : !!prospect.term_signed,
    };
    setState((s) => ({
      ...s,
      prospects: [...s.prospects, newProspect],
    }));

    try {
      let dbInstrument = newProspect.instrument || "";
      if (newProspect.not_eligible && newProspect.ineligibility_reason) {
        dbInstrument = `${newProspect.instrument} // INELIGIBLE: ${newProspect.ineligibility_reason}`;
      }

      const dbNotes = encodeProspectNotes(
        newProspect.notes,
        newProspect.lead_status,
        newProspect.message_history,
        newProspect.term_signed,
        newProspect.approved
      );

      const dbProspect: any = {
        id: newProspect.id,
        name: newProspect.name,
        email: newProspect.email,
        phone: newProspect.phone,
        cpf: newProspect.cpf,
        instrument: dbInstrument,
        term_signed: newProspect.term_signed,
        approved: newProspect.approved,
        notes: dbNotes,
        lead_status: newProspect.lead_status || "",
        message_history: newProspect.message_history ? JSON.stringify(newProspect.message_history) : null,
        created_at: newProspect.created_at,
      };

      let { error } = await supabase.from('prospects').insert([dbProspect]);
      if (error) {
        console.warn('First insert attempt error, retrying without message_history column:', error.message);
        delete dbProspect.message_history;
        let retry1 = await supabase.from('prospects').insert([dbProspect]);
        if (retry1.error) {
          console.warn('Second insert attempt error, retrying without lead_status column:', retry1.error.message);
          delete dbProspect.lead_status;
          let retry2 = await supabase.from('prospects').insert([dbProspect]);
          if (retry2.error) console.error('Error adding prospect:', retry2.error);
        }
      }
    } catch (e) {
      console.warn('Error saving prospect to Supabase:', e);
    }
  };

  const updateProspect = async (id: string, updates: Partial<Prospect>) => {
    let oldProspect: Prospect | undefined;
    let mergedProspect: Prospect | undefined;

    // Automatically approve prospect and mark term signed if lead_status is updated to 'matriculado'
    if (updates.lead_status === 'matriculado') {
      if (updates.approved === undefined) updates.approved = true;
      if (updates.term_signed === undefined) updates.term_signed = true;
    }

    setState((s) => {
      oldProspect = s.prospects.find(p => p.id === id);
      const updatedList = s.prospects.map((p) => {
        if (p.id === id) {
          const m = { ...p, ...updates };
          mergedProspect = m;
          return m;
        }
        return p;
      });
      return {
        ...s,
        prospects: updatedList,
      };
    });

    if (mergedProspect) {
      try {
        let dbInstrument = mergedProspect.instrument || "";
        if (mergedProspect.not_eligible && mergedProspect.ineligibility_reason) {
          dbInstrument = `${mergedProspect.instrument} // INELIGIBLE: ${mergedProspect.ineligibility_reason}`;
        }

        const dbNotes = encodeProspectNotes(
          mergedProspect.notes,
          mergedProspect.lead_status,
          mergedProspect.message_history,
          mergedProspect.term_signed,
          mergedProspect.approved
        );

        const dbUpdates: any = {
          name: mergedProspect.name,
          email: mergedProspect.email,
          phone: mergedProspect.phone,
          cpf: mergedProspect.cpf,
          instrument: dbInstrument,
          term_signed: mergedProspect.term_signed,
          approved: mergedProspect.approved,
          notes: dbNotes,
          lead_status: mergedProspect.lead_status || "",
          message_history: mergedProspect.message_history ? JSON.stringify(mergedProspect.message_history) : null,
        };

        let { error } = await supabase.from('prospects').update(dbUpdates).eq('id', id);
        if (error) {
          console.warn('First update attempt error, retrying without message_history column:', error.message);
          delete dbUpdates.message_history;
          let retry1 = await supabase.from('prospects').update(dbUpdates).eq('id', id);
          if (retry1.error) {
            console.warn('Second update attempt error, retrying without lead_status column:', retry1.error.message);
            delete dbUpdates.lead_status;
            let retry2 = await supabase.from('prospects').update(dbUpdates).eq('id', id);
            if (retry2.error) console.error('Error updating prospect in Supabase:', retry2.error);
          }
        }
      } catch (e) {
        console.warn('Error updating prospect in Supabase:', e);
      }
    }
  };

  const deleteProspect = async (id: string) => {
    setState((s) => ({
      ...s,
      prospects: s.prospects.filter((p) => p.id !== id),
    }));

    try {
      const { error } = await supabase.from('prospects').delete().eq('id', id);
      if (error) console.error('Error deleting prospect:', error);
    } catch (e) {
      console.warn('Error deleting prospect from Supabase:', e);
    }
  };

  const addProfile = async (profile: UserProfile, password?: string) => {
    // 1. Validar permissão: SOMENTE super_admin pode criar usuários/logins
    if (currentUserProfile?.role !== 'super_admin') {
      const err = 'Permissão negada. Apenas Super Administradores podem criar novos usuários e credenciais de acesso.';
      setGlobalError(err);
      throw new Error(err);
    }

    let finalProfile: UserProfile = { ...profile };
    const cleanEmail = (profile.email || "").trim().toLowerCase();
    finalProfile.email = cleanEmail;
    finalProfile.access_status = profile.access_status || 'active';

    // 1. Tentar primeiro criação e sincronização via backend Admin API oficial
    // para garantir que public.profiles.id === auth.users.id
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const response = await fetch('/api/admin/create-or-resolve-user', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            email: cleanEmail,
            password: password,
            role: finalProfile.role,
            teacher_id: finalProfile.teacher_id,
          })
        });

        if (response.ok) {
          const resJson = await response.json();
          if (resJson.success && resJson.authUserId) {
            finalProfile.id = resJson.authUserId;
            if (resJson.profile) {
              finalProfile = { ...resJson.profile, ...finalProfile, id: resJson.authUserId };
            }
            setState((s) => ({
              ...s,
              profiles: [...s.profiles.filter((p) => p.id !== finalProfile.id && (p.email || "").trim().toLowerCase() !== cleanEmail), finalProfile],
            }));
            return;
          }
        }
      }
    } catch (apiErr) {
      console.warn('[ADMIN API] Nota: endpoint server-side não respondeu, prosseguindo com fluxo direto:', apiErr);
    }

    // 2. Check if profile with this email already exists in local state
    const existingInState = state.profiles.find(p => (p.email || "").trim().toLowerCase() === cleanEmail);
    if (existingInState) {
      finalProfile = {
        ...existingInState,
        ...profile,
        id: existingInState.id,
        email: cleanEmail,
      };
    } else {
      // 2. Check if profile already exists in Supabase public.profiles table
      try {
        const { data: existingDbProfiles } = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', cleanEmail);

        if (existingDbProfiles && existingDbProfiles.length > 0) {
          const dbProfile = existingDbProfiles[0];
          finalProfile = {
            ...dbProfile,
            ...profile,
            id: dbProfile.id,
            email: cleanEmail,
          };
        }
      } catch (checkErr: any) {
        console.warn('DB profile check warning:', checkErr);
      }
    }

    // 3. Try creating Auth account if password provided
    if (password) {
      finalProfile.temp_password = password;
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ldumzwrwbhjtrnlioigg.supabase.co';
        const supabaseKey = import.meta.env.VITE_SUPABASE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkdW16d3J3YmhqdHJubGlvaWdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwNTU0MDcsImV4cCI6MjA4ODYzMTQwN30.PgzhWMBsYifm6ADnYm-EQu83DK9BShDQAVZlQw5sayU';
        
        const tempClient = createClient(supabaseUrl, supabaseKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        });

        const { data: authData, error: authError } = await tempClient.auth.signUp({
          email: cleanEmail,
          password: password,
        });

        if (authData?.user) {
          finalProfile.id = authData.user.id;
        } else if (authError) {
          console.warn(`Auth signup warning for ${cleanEmail}:`, authError.message);
          // Try logging in with the password to retrieve the user's Auth ID if already registered
          try {
            const { data: loginData } = await tempClient.auth.signInWithPassword({
              email: cleanEmail,
              password: password,
            });
            if (loginData?.user) {
              finalProfile.id = loginData.user.id;
            }
          } catch (loginErr) {
            console.warn('Login test during addProfile:', loginErr);
          }
        }
      } catch (e: any) {
        console.warn('Non-fatal auth account creation note:', e);
      }
    }

    // 4. Ensure created_at is always present to satisfy Postgres NOT NULL constraints
    if (!finalProfile.created_at) {
      finalProfile.created_at = new Date().toISOString();
    }

    // 5. Save to local React state so UI updates immediately
    setState((s) => ({
      ...s,
      profiles: [...s.profiles.filter((p) => p.id !== finalProfile.id && (p.email || "").trim().toLowerCase() !== cleanEmail), finalProfile],
    }));

    // 6. Save/upsert to Supabase public.profiles table
    try {
      const { error } = await supabase.from('profiles').upsert([finalProfile]);
      if (error) {
        console.warn('Upsert profile warning:', error.message);
        // Fallback: if temp_password column doesn't exist in DB, remove it and retry
        const cleanProfile = { ...finalProfile };
        delete (cleanProfile as any).temp_password;

        const { error: errClean } = await supabase.from('profiles').upsert([cleanProfile]);
        if (errClean) {
          console.warn('Fallback clean profile upsert error:', errClean.message);
          const { error: updateErr } = await supabase.from('profiles').update({
            role: finalProfile.role,
            teacher_id: finalProfile.teacher_id,
          }).ilike('email', cleanEmail);

          if (updateErr) {
            console.warn('Update by email error:', updateErr.message);
            await supabase.from('profiles').insert([{
              id: finalProfile.id,
              email: cleanEmail,
              role: finalProfile.role,
              teacher_id: finalProfile.teacher_id,
              created_at: finalProfile.created_at || new Date().toISOString(),
            }]);
          }
        }
      }
    } catch (e: any) {
      console.warn('Error saving profile to Supabase:', e);
    }
  };

  const updateProfile = async (id: string, updates: Partial<UserProfile>) => {
    // 1. Validar permissão: SOMENTE super_admin pode alterar usuários, e-mails ou credenciais de acesso
    if (currentUserProfile?.role !== 'super_admin') {
      const err = 'Permissão negada. Apenas Super Administradores podem alterar usuários, e-mails ou perfis de acesso.';
      setGlobalError(err);
      throw new Error(err);
    }

    setState((s) => ({
      ...s,
      profiles: s.profiles.map((p) =>
        p.id === id ? { ...p, ...updates } : p,
      ),
    }));

    try {
      const { error } = await supabase.from('profiles').update(updates).eq('id', id);
      if (error) {
        if (error.message?.includes('temp_password') || error.code === '42703') {
          // If temp_password column doesn't exist in Supabase DB table, update without it
          const cleanUpdates = { ...updates };
          delete (cleanUpdates as any).temp_password;
          if (Object.keys(cleanUpdates).length > 0) {
            await supabase.from('profiles').update(cleanUpdates).eq('id', id);
          }
        } else {
          console.error('Error updating profile:', error);
        }
      }
    } catch (e) {
      console.warn('Error updating profile in Supabase:', e);
    }

    // If we updated the currently logged in user's profile, update current state
    const { data: { user } } = await supabase.auth.getUser();
    if (user && user.id === id) {
      setCurrentUserProfile(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const deleteProfile = async (id: string, email?: string) => {
    // 1. Validar permissão: SOMENTE super_admin pode excluir perfis de usuários
    if (currentUserProfile?.role !== 'super_admin') {
      const err = 'Permissão negada. Apenas Super Administradores podem remover perfis de usuários.';
      setGlobalError(err);
      throw new Error(err);
    }

    const targetProfile = state.profiles.find((p) => p.id === id || (email && p.email?.toLowerCase() === email.toLowerCase()));
    const targetEmail = email || targetProfile?.email;
    const originalProfiles = state.profiles;

    setState((s) => ({
      ...s,
      profiles: s.profiles.filter(
        (p) => p.id !== id && (!targetEmail || p.email?.toLowerCase() !== targetEmail.toLowerCase())
      ),
    }));

    try {
      if (id) {
        await supabase.from('profiles').delete().eq('id', id);
      }
      if (targetEmail) {
        await supabase.from('profiles').delete().ilike('email', targetEmail);
      }
    } catch (e: any) {
      console.warn('Error deleting profile from Supabase:', e);
      setState((s) => ({
        ...s,
        profiles: originalProfiles,
      }));
      throw e;
    }
  };

  const toggleProfileAccess = async (
    profileId: string,
    newAccessStatus: 'active' | 'blocked'
  ): Promise<{ success: boolean; error?: string; edgeFunctionMissing?: boolean; rpcMissing?: boolean }> => {
    // 1. Validar permissão: SOMENTE super_admin pode bloquear ou liberar acesso
    if (currentUserProfile?.role !== 'super_admin') {
      const err = 'Permissão negada. Apenas Super Administradores podem bloquear ou liberar o acesso de usuários.';
      setGlobalError(err);
      return { success: false, error: err };
    }

    // 2. Impedir auto-bloqueio do Super Admin
    if (currentUserProfile?.id === profileId && newAccessStatus === 'blocked') {
      const err = 'Operação não permitida: você não pode bloquear a sua própria conta de Super Administrador.';
      setGlobalError(err);
      return { success: false, error: err };
    }

    const targetProfile = state.profiles.find(p => p.id === profileId);
    if (!targetProfile) {
      const err = 'Usuário não encontrado.';
      setGlobalError(err);
      return { success: false, error: err };
    }

    if (targetProfile.access_status === newAccessStatus) {
      return { success: true };
    }

    try {
      let backendSuccess = false;
      let lastErrorMessage = '';
      let isEdgeFunctionMissing = false;

      // 3. Mecanismo Principal: Invocar a Supabase Edge Function 'admin-toggle-user-access'
      // Utiliza a Supabase Auth Admin API (updateUserById com ban_duration)
      try {
        const { data: funcData, error: funcErr } = await supabase.functions.invoke('admin-toggle-user-access', {
          body: {
            target_user_id: profileId,
            target_access_status: newAccessStatus,
          },
        });

        if (!funcErr && funcData && funcData.success) {
          backendSuccess = true;
        } else {
          if (funcErr) {
            lastErrorMessage = funcErr.message || '';
            const status = (funcErr as any).status;
            if (status === 404 || lastErrorMessage.includes('Failed to send a request') || lastErrorMessage.includes('FunctionsFetchError')) {
              isEdgeFunctionMissing = true;
            }
          } else if (funcData && funcData.error) {
            lastErrorMessage = funcData.error;
          }
        }
      } catch (edgeErr: any) {
        lastErrorMessage = edgeErr.message || '';
        isEdgeFunctionMissing = true;
      }

      // 4. Se a Edge Function ainda não estiver respondendo na nuvem, invocar o endpoint da Auth Admin API no backend
      if (!backendSuccess) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            const apiRes = await fetch('/api/admin/toggle-user-access', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                target_user_id: profileId,
                target_access_status: newAccessStatus,
              }),
            });

            const apiData = await apiRes.json();
            if (apiRes.ok && apiData.success) {
              backendSuccess = true;
            } else {
              lastErrorMessage = apiData.error || lastErrorMessage;
            }
          }
        } catch (serverErr: any) {
          console.warn('Falha na tentativa de rota administrativa /api/admin:', serverErr?.message);
        }
      }

      // 5. REGRA DE CONSISTÊNCIA / SEM SUCESSO FALSO:
      // Se a operação no Supabase Auth Admin API não for confirmada, NÃO alterar estado local!
      if (!backendSuccess) {
        const fullMsg = lastErrorMessage || 'Falha ao sincronizar o bloqueio no Supabase Auth Admin API.';
        setGlobalError(fullMsg);
        return {
          success: false,
          error: fullMsg,
          edgeFunctionMissing: isEdgeFunctionMissing,
        };
      }

      // 6. Sucesso confirmado no Auth Admin API: atualizar o estado local de profiles
      setState(s => ({
        ...s,
        profiles: s.profiles.map(p => p.id === profileId ? { ...p, access_status: newAccessStatus } : p)
      }));

      // Se o usuário bloqueado for o usuário atualmente autenticado, revogar sessão
      const { data: { user } } = await supabase.auth.getUser();
      if (user && user.id === profileId && newAccessStatus === 'blocked') {
        await supabase.auth.signOut();
        setCurrentUserProfile(null);
        window.location.reload();
      }

      return { success: true };
    } catch (err: any) {
      console.error('Unexpected error in toggleProfileAccess:', err);
      const errMsg = `Erro inesperado ao alterar status de acesso: ${err?.message || 'Falha de comunicação'}`;
      setGlobalError(errMsg);
      return { success: false, error: errMsg };
    }
  };

  const addCredit = async (credit: Omit<Credit, "id">): Promise<{ success: boolean; error?: string }> => {
    const newCredit: Credit = { ...credit, id: generateId() };
    const payload = {
      id: newCredit.id,
      teacher_id: newCredit.teacher_id,
      student_id: newCredit.student_id || null,
      enrollment_id: newCredit.enrollment_id || null,
      group_id: newCredit.group_id || null,
      source_class_id: newCredit.source_class_id || null,
      amount: newCredit.amount,
      status: newCredit.status,
      competency_month: newCredit.competency_month,
      used_date: newCredit.used_date || null,
      notes: newCredit.notes || null,
      created_at: newCredit.created_at || new Date().toISOString(),
    };
    try {
      const { error } = await supabase.from('credits').insert([payload]);
      if (error) {
        console.error('Could not insert credit into Supabase:', error.message);
        return { success: false, error: error.message };
      }
      setState((s) => ({
        ...s,
        credits: [...(s.credits || []), newCredit],
      }));
      return { success: true };
    } catch (e: any) {
      console.warn('Could not insert credit into Supabase:', e);
      return { success: false, error: e?.message || 'Falha ao inserir crédito' };
    }
  };

  const updateCredit = async (
    id: string,
    updates: Partial<Credit>
  ): Promise<{ success: boolean; error?: string }> => {
    const currentCredit = (state.credits || []).find((c) => c.id === id);
    if (!currentCredit) {
      const err = `Crédito não encontrado: ${id}`;
      console.error(`[updateCredit] ${err}`);
      return { success: false, error: err };
    }

    const preparedUpdates = { ...updates };
    if (preparedUpdates.status === 'used' && !preparedUpdates.used_date && !currentCredit.used_date) {
      preparedUpdates.used_date = new Date().toISOString().split('T')[0];
    }

    try {
      const fullCreditPayload = {
        id: currentCredit.id,
        teacher_id: currentCredit.teacher_id,
        student_id: currentCredit.student_id || null,
        enrollment_id: currentCredit.enrollment_id || null,
        group_id: currentCredit.group_id || null,
        source_class_id: currentCredit.source_class_id || null,
        amount: preparedUpdates.amount !== undefined ? preparedUpdates.amount : currentCredit.amount,
        status: preparedUpdates.status || currentCredit.status,
        competency_month: preparedUpdates.competency_month || currentCredit.competency_month,
        used_date: preparedUpdates.used_date !== undefined ? preparedUpdates.used_date : (currentCredit.used_date || null),
        notes: preparedUpdates.notes !== undefined ? preparedUpdates.notes : (currentCredit.notes || null),
        created_at: currentCredit.created_at || new Date().toISOString(),
      };

      const { error } = await supabase.from('credits').upsert(fullCreditPayload, { onConflict: 'id' });
      if (error) {
        console.error('[updateCredit] Erro ao persistir crédito no Supabase:', error.message);
        return { success: false, error: error.message };
      }

      // Somente após confirmação do Supabase, atualizar o estado local
      setState((s) => ({
        ...s,
        credits: (s.credits || []).map((c) => (c.id === id ? { ...c, ...preparedUpdates } : c)),
      }));

      return { success: true };
    } catch (e: any) {
      const errMsg = e?.message || 'Falha de comunicação ao atualizar crédito no Supabase';
      console.error('[updateCredit] Exceção:', errMsg);
      return { success: false, error: errMsg };
    }
  };

  const deleteCredit = async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.from('credits').delete().eq('id', id);
      if (error) {
        console.error('Could not delete credit from Supabase:', error.message);
        return { success: false, error: error.message };
      }
      setState((s) => ({
        ...s,
        credits: (s.credits || []).filter((c) => c.id !== id),
      }));
      return { success: true };
    } catch (e: any) {
      console.warn('Could not delete credit from Supabase:', e);
      return { success: false, error: e?.message || 'Falha ao deletar crédito' };
    }
  };

  const reconcileRaphaelCredits = async (): Promise<void> => {
    let dbCreditsMap = new Map<string, Credit>();
    try {
      const { data, error } = await supabase.from('credits').select('*');
      if (!error && data && Array.isArray(data)) {
        data.forEach((c: any) => {
          if (c.source_class_id) dbCreditsMap.set(c.source_class_id, c);
          if (c.id) dbCreditsMap.set(c.id, c);
        });
      }
    } catch (e) {
      console.warn('Erro ao consultar créditos do Supabase em reconcileRaphaelCredits:', e);
    }

    const newCreditsToPersist: Credit[] = [];

    setState((s) => {
      const baseCredits: Credit[] = (s.credits || []).length > 0 ? s.credits : Array.from(dbCreditsMap.values());
      const creditsMap = new Map<string, Credit>();
      baseCredits.forEach((c) => {
        if (c.source_class_id) creditsMap.set(c.source_class_id, c);
        if (c.id) creditsMap.set(c.id, c);
      });
      // Prioridade absoluta para dados persistidos no banco
      dbCreditsMap.forEach((c, key) => {
        creditsMap.set(key, c);
      });

      const reconciled: Credit[] = [...baseCredits];

      s.classes.forEach((cl) => {
        const calc = calculateRaphaelClassCreditValue(
          cl,
          s.enrollments,
          s.financialPlans,
          s.groups,
          s.teachers
        );

        if (calc.isEligible) {
          const existing = creditsMap.get(cl.id) || creditsMap.get(`credit_${cl.id}`);
          if (existing) {
            const idx = reconciled.findIndex((c) => c.id === existing.id);
            if (idx !== -1) {
              reconciled[idx] = {
                ...reconciled[idx],
                amount: calc.amount,
                student_id: calc.studentId,
                enrollment_id: calc.enrollmentId || reconciled[idx].enrollment_id,
                group_id: calc.groupId,
                teacher_id: calc.teacherId,
                competency_month: (cl.date || "").substring(0, 7),
                // PRESERVAÇÃO ESTRITA: status do banco NUNCA é rebaixado de 'used' ou 'cancelled' para 'available'
                status: existing.status,
                used_date: existing.used_date || reconciled[idx].used_date,
                notes: existing.notes || reconciled[idx].notes,
              };
            }
          } else {
            const newCred: Credit = {
              id: `credit_${cl.id}`,
              student_id: calc.studentId,
              enrollment_id: calc.enrollmentId,
              group_id: calc.groupId,
              teacher_id: calc.teacherId,
              source_class_id: cl.id,
              amount: calc.amount,
              status: "available",
              competency_month: (cl.date || "").substring(0, 7),
              created_at: new Date().toISOString(),
              notes: `Crédito gerado pelo cancelamento da aula de ${cl.date} (Professor Raphael)`,
            };
            reconciled.push(newCred);
            creditsMap.set(cl.id, newCred);
            creditsMap.set(newCred.id, newCred);
            newCreditsToPersist.push(newCred);
          }
        } else {
          // Se a aula não for mais elegível e o crédito estiver como 'available', marcar como 'cancelled'.
          // Se já foi 'used', NUNCA alterar, pois o crédito já foi utilizado contabilmente!
          const existing = creditsMap.get(cl.id) || creditsMap.get(`credit_${cl.id}`);
          if (existing && existing.status === "available") {
            const idx = reconciled.findIndex((c) => c.id === existing.id);
            if (idx !== -1) {
              reconciled[idx] = {
                ...reconciled[idx],
                status: "cancelled",
              };
            }
          }
        }
      });

      // Backfill de enrollment_id para créditos legados individuais
      reconciled.forEach((cred) => {
        if (!cred.group_id && !cred.enrollment_id && cred.student_id) {
          const resolvedId = resolveCreditEnrollmentId(
            cred,
            s.enrollments,
            s.financialPlans,
            s.groups,
            s.classes
          );
          if (resolvedId) {
            cred.enrollment_id = resolvedId;
          }
        }
      });

      return {
        ...s,
        credits: reconciled,
      };
    });

    if (newCreditsToPersist.length > 0) {
      try {
        const payload = newCreditsToPersist.map((c) => ({
          id: c.id,
          teacher_id: c.teacher_id,
          student_id: c.student_id || null,
          enrollment_id: c.enrollment_id || null,
          group_id: c.group_id || null,
          source_class_id: c.source_class_id || null,
          amount: c.amount,
          status: c.status,
          competency_month: c.competency_month,
          used_date: c.used_date || null,
          notes: c.notes || null,
          created_at: c.created_at || new Date().toISOString(),
        }));
        await supabase.from('credits').upsert(payload, { onConflict: 'id', ignoreDuplicates: true });
      } catch (e) {
        console.warn('Erro ao auto-persistir créditos reconciliados no Supabase:', e);
      }
    }
  };

  const addAffiliate = async (affiliate: Omit<Affiliate, "id" | "created_at">) => {
    const newAffiliate: Affiliate = {
      ...affiliate,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const dbPayload = {
      id: newAffiliate.id,
      name: newAffiliate.name,
      email: newAffiliate.email || null,
      phone: newAffiliate.phone || null,
      cpf_cnpj: newAffiliate.cpf_cnpj || null,
      pix_key: newAffiliate.pix_key || null,
      pix_key_type: newAffiliate.pix_key_type || null,
      referral_code: newAffiliate.referral_code || null,
      status: newAffiliate.status || 'active',
      created_at: newAffiliate.created_at,
      updated_at: newAffiliate.updated_at,
    };

    const { error } = await supabase.from('affiliates').insert([dbPayload]);
    if (error) {
      console.error('Error adding affiliate to Supabase:', error);
      if (error.code === '23505' || error.message?.includes('affiliates_referral_code_key')) {
        throw new Error('Este código de indicação já está em uso por outro afiliado.');
      }
      throw new Error(error.message || 'Erro ao cadastrar afiliado no Supabase');
    }

    setState((s) => ({
      ...s,
      affiliates: [...(s.affiliates || []), newAffiliate],
    }));
  };

  const updateAffiliate = async (id: string, updates: Partial<Affiliate>) => {
    const updatedWithTime: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    };
    if (updates.email !== undefined) updatedWithTime.email = updates.email || null;
    if (updates.phone !== undefined) updatedWithTime.phone = updates.phone || null;
    if (updates.cpf_cnpj !== undefined) updatedWithTime.cpf_cnpj = updates.cpf_cnpj || null;
    if (updates.pix_key !== undefined) updatedWithTime.pix_key = updates.pix_key || null;
    if (updates.pix_key_type !== undefined) updatedWithTime.pix_key_type = updates.pix_key_type || null;
    if (updates.referral_code !== undefined) updatedWithTime.referral_code = updates.referral_code || null;

    const { error } = await supabase.from('affiliates').update(updatedWithTime).eq('id', id);
    if (error) {
      console.error('Error updating affiliate in Supabase:', error);
      if (error.code === '23505' || error.message?.includes('affiliates_referral_code_key')) {
        throw new Error('Este código de indicação já está em uso por outro afiliado.');
      }
      throw new Error(error.message || 'Erro ao atualizar afiliado no Supabase');
    }

    setState((s) => ({
      ...s,
      affiliates: (s.affiliates || []).map((a) => (a.id === id ? { ...a, ...updatedWithTime } : a)),
    }));
  };

  const deleteAffiliate = async (id: string) => {
    const { error } = await supabase.from('affiliates').delete().eq('id', id);
    if (error) {
      console.error('Error deleting affiliate in Supabase:', error);
      if (error.code === '23503') {
        throw new Error('Não é possível excluir este afiliado pois ele possui indicações, matrículas ou fechamentos vinculados.');
      }
      throw new Error(error.message || 'Erro ao excluir afiliado no Supabase');
    }

    setState((s) => ({
      ...s,
      affiliates: (s.affiliates || []).filter((a) => a.id !== id),
    }));
  };

  const addAffiliateReferral = async (referral: Omit<AffiliateReferral, "id" | "created_at">) => {
    const newReferral: AffiliateReferral = {
      ...referral,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const dbPayload = {
      id: newReferral.id,
      affiliate_id: newReferral.affiliate_id,
      prospect_id: newReferral.prospect_id || null,
      student_id: (newReferral.student_id && newReferral.student_id.trim() !== '') ? newReferral.student_id : null,
      enrollment_id: newReferral.enrollment_id || null,
      referred_name: newReferral.referred_name,
      referred_phone: newReferral.referred_phone || null,
      referred_email: newReferral.referred_email || null,
      referral_date: newReferral.referral_date || new Date().toISOString().split('T')[0],
      status: newReferral.status || 'registered',
      conversion_date: newReferral.conversion_date || null,
      conversion_competence: newReferral.conversion_competence || null,
      first_transaction_id: newReferral.first_transaction_id || null,
      notes: newReferral.notes || null,
      created_at: newReferral.created_at,
      updated_at: newReferral.updated_at,
    };

    if (dbPayload.student_id && dbPayload.enrollment_id && dbPayload.affiliate_id) {
      const { data: existingRows } = await supabase
        .from('affiliate_referrals')
        .select('*')
        .eq('student_id', dbPayload.student_id)
        .eq('enrollment_id', dbPayload.enrollment_id)
        .eq('affiliate_id', dbPayload.affiliate_id)
        .limit(1);

      if (existingRows && existingRows.length > 0) {
        const existingRow = existingRows[0] as AffiliateReferral;
        setState((s) => {
          const alreadyInState = (s.affiliateReferrals || []).some((r) => r.id === existingRow.id);
          return {
            ...s,
            affiliateReferrals: alreadyInState
              ? (s.affiliateReferrals || []).map((r) => (r.id === existingRow.id ? existingRow : r))
              : [...(s.affiliateReferrals || []), existingRow],
          };
        });
        return;
      }
    }

    const { error } = await supabase.from('affiliate_referrals').insert([dbPayload]);
    if (error) {
      console.error('Error adding referral to Supabase:', error);
      if (error.code === '23505' || error.message?.includes('idx_affiliate_referrals_unique_converted_student')) {
        throw new Error('Este aluno já foi convertido anteriormente e não pode gerar nova comissão.');
      }
      throw new Error(error.message || 'Erro ao cadastrar indicação no Supabase');
    }

    setState((s) => ({
      ...s,
      affiliateReferrals: [...(s.affiliateReferrals || []), newReferral],
    }));
  };

  const updateAffiliateReferral = async (id: string, updates: Partial<AffiliateReferral>) => {
    const dbUpdates: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    };
    if (updates.prospect_id !== undefined) dbUpdates.prospect_id = updates.prospect_id || null;
    if (updates.student_id !== undefined) {
      dbUpdates.student_id = (updates.student_id && updates.student_id.trim() !== '') ? updates.student_id : null;
    }
    if (updates.enrollment_id !== undefined) dbUpdates.enrollment_id = updates.enrollment_id || null;
    if (updates.referred_phone !== undefined) dbUpdates.referred_phone = updates.referred_phone || null;
    if (updates.referred_email !== undefined) dbUpdates.referred_email = updates.referred_email || null;
    if (updates.conversion_date !== undefined) dbUpdates.conversion_date = updates.conversion_date || null;
    if (updates.conversion_competence !== undefined) dbUpdates.conversion_competence = updates.conversion_competence || null;
    if (updates.first_transaction_id !== undefined) dbUpdates.first_transaction_id = updates.first_transaction_id || null;
    if (updates.notes !== undefined) dbUpdates.notes = updates.notes || null;

    const { error } = await supabase.from('affiliate_referrals').update(dbUpdates).eq('id', id);
    if (error) {
      console.error('Error updating referral in Supabase:', error);
      if (error.code === '23505' || error.message?.includes('idx_affiliate_referrals_unique_converted_student')) {
        throw new Error('Este aluno já foi convertido anteriormente e não pode gerar nova comissão.');
      }
      throw new Error(error.message || 'Erro ao atualizar indicação no Supabase');
    }

    setState((s) => ({
      ...s,
      affiliateReferrals: (s.affiliateReferrals || []).map((r) =>
        r.id === id ? { ...r, ...updates, updated_at: dbUpdates.updated_at } : r
      ),
    }));
  };

  const deleteAffiliateReferral = async (id: string) => {
    const { error } = await supabase.from('affiliate_referrals').delete().eq('id', id);
    if (error) {
      console.error('Error deleting referral in Supabase:', error);
      throw new Error(error.message || 'Erro ao excluir indicação no Supabase');
    }

    setState((s) => ({
      ...s,
      affiliateReferrals: (s.affiliateReferrals || []).filter((r) => r.id !== id),
    }));
  };

  const addAffiliateClosing = async (
    closing: Omit<AffiliateMonthlyClosing, "id" | "created_at">,
    items: Omit<AffiliateClosingItem, "id" | "closing_id" | "created_at">[]
  ) => {
    const closingId = generateId();
    const newClosing: AffiliateMonthlyClosing = {
      ...closing,
      id: closingId,
      created_at: new Date().toISOString(),
    };
    const newItems: AffiliateClosingItem[] = items.map((it) => ({
      ...it,
      id: generateId(),
      closing_id: closingId,
      created_at: new Date().toISOString(),
    }));

    const dbClosing = {
      id: newClosing.id,
      competence: newClosing.competence,
      version: newClosing.version,
      is_current: newClosing.is_current,
      status: newClosing.status,
      total_valid_referrals: newClosing.total_valid_referrals,
      total_payout_amount: newClosing.total_payout_amount,
      closed_at: newClosing.closed_at,
      closed_by: newClosing.closed_by || null,
      closed_by_name: newClosing.closed_by_name || null,
      reopened_at: newClosing.reopened_at || null,
      reopen_reason: newClosing.reopen_reason || null,
      notes: newClosing.notes || null,
      created_at: newClosing.created_at,
    };

    const dbItems = newItems.map((it) => ({
      id: it.id,
      closing_id: it.closing_id,
      affiliate_id: it.affiliate_id,
      affiliate_name_snapshot: it.affiliate_name_snapshot,
      affiliate_pix_snapshot: it.affiliate_pix_snapshot || null,
      valid_referrals_count: it.valid_referrals_count,
      tier_applied: it.tier_applied,
      amount_due: it.amount_due !== null && it.amount_due !== undefined ? it.amount_due : null,
      rule_status: it.rule_status,
      payment_status: it.payment_status || 'pending',
      paid_at: it.paid_at || null,
      payout_transaction_id: it.payout_transaction_id || null,
      notes: it.notes || null,
      created_at: it.created_at,
    }));

    const { error: closingErr } = await supabase.from('affiliate_monthly_closings').insert([dbClosing]);
    if (closingErr) {
      console.error('Error saving closing to Supabase:', closingErr);
      throw new Error(closingErr.message || 'Erro ao registrar fechamento mensal no Supabase');
    }

    if (dbItems.length > 0) {
      const { error: itemsErr } = await supabase.from('affiliate_closing_items').insert(dbItems);
      if (itemsErr) {
        console.error('Error saving closing items to Supabase:', itemsErr);
        await supabase.from('affiliate_monthly_closings').delete().eq('id', closingId);
        throw new Error(itemsErr.message || 'Erro ao registrar itens do fechamento no Supabase');
      }
    }

    setState((s) => ({
      ...s,
      affiliateClosings: [...(s.affiliateClosings || []), newClosing],
      affiliateClosingItems: [...(s.affiliateClosingItems || []), ...newItems],
    }));
  };

  const reopenAffiliateClosing = async (closingId: string, reason: string) => {
    const reopenedAt = new Date().toISOString();
    const { error } = await supabase
      .from('affiliate_monthly_closings')
      .update({
        status: 'reopened',
        is_current: false,
        reopened_at: reopenedAt,
        reopen_reason: reason,
      })
      .eq('id', closingId);

    if (error) {
      console.error('Error reopening closing in Supabase:', error);
      throw new Error(error.message || 'Erro ao reabrir competência no Supabase');
    }

    setState((s) => ({
      ...s,
      affiliateClosings: (s.affiliateClosings || []).map((c) =>
        c.id === closingId
          ? {
              ...c,
              status: 'reopened',
              is_current: false,
              reopened_at: reopenedAt,
              reopen_reason: reason,
            }
          : c
      ),
    }));
  };

  const getCompetenceBilling = (
    category: 'individual' | 'group' | 'choir',
    sourceId: string,
    competence: string
  ): CompetenceBilling | undefined => {
    return findCompetenceBilling(state.competenceBillings, category, sourceId, competence);
  };

  const createCompetenceBilling = async (
    input: Omit<CompetenceBilling, 'id' | 'created_at'> & { id?: string }
  ): Promise<CompetenceBilling> => {
    // 1. Validar categoria
    if (!input.category || !['individual', 'group', 'choir'].includes(input.category)) {
      throw new Error('Categoria inválida. Deve ser "individual", "group" ou "choir".');
    }

    // 2. Validar competência YYYY-MM
    const competence = (input.competence || '').trim();
    if (!/^[0-9]{4}-[0-9]{2}$/.test(competence)) {
      throw new Error('Competência inválida. Deve estar no formato YYYY-MM.');
    }

    // 3. Validar origem correspondente
    if (input.category === 'individual') {
      if (!input.enrollment_id || input.group_id || input.choir_registration_id) {
        throw new Error('Origem incompatível: categoria "individual" exige enrollment_id e não permite group_id ou choir_registration_id.');
      }
    } else if (input.category === 'group') {
      if (!input.group_id || input.enrollment_id || input.choir_registration_id) {
        throw new Error('Origem incompatível: categoria "group" exige group_id e não permite enrollment_id ou choir_registration_id.');
      }
    } else if (input.category === 'choir') {
      if (!input.choir_registration_id || input.enrollment_id || input.group_id) {
        throw new Error('Origem incompatível: categoria "choir" exige choir_registration_id e não permite enrollment_id ou group_id.');
      }
    }

    // 4. Gerar ID compatível com o projeto
    const id = input.id || crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const newRecord: CompetenceBilling = {
      id,
      competence,
      category: input.category,
      enrollment_id: input.category === 'individual' ? (input.enrollment_id || null) : null,
      choir_registration_id: input.category === 'choir' ? (input.choir_registration_id || null) : null,
      group_id: input.category === 'group' ? (input.group_id || null) : null,
      student_id: input.student_id || null,
      teacher_id: input.teacher_id || null,
      is_paying: input.is_paying !== undefined ? !!input.is_paying : true,
      base_price: Number(input.base_price || 0),
      discount: Number(input.discount || 0),
      final_price: Number(input.final_price || 0),
      teacher_fee_type: input.teacher_fee_type || null,
      teacher_fee_value: input.teacher_fee_value != null ? Number(input.teacher_fee_value) : null,
      teacher_share: Number(input.teacher_share || 0),
      school_share: Number(input.school_share || 0),
      status: input.status || 'pending',
      transaction_id: input.transaction_id || null,
      is_frozen: !!input.is_frozen,
      frozen_at: input.frozen_at || null,
      frozen_by: input.frozen_by || null,
      metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
      created_at: createdAt,
    };

    // 5. Executar INSERT no Supabase com .select() para retorno imediato do registro gravado
    const { data: insertedData, error: insertError } = await supabase
      .from('competence_billings')
      .insert([newRecord])
      .select();

    if (insertError) {
      console.error('Error inserting competence_billing into Supabase:', insertError);
      throw new Error(`Falha ao persistir no Supabase: ${insertError.message} (Código: ${insertError.code || 'UNKNOWN'})`);
    }

    if (!insertedData || insertedData.length === 0) {
      throw new Error('O banco de dados não retornou o registro criado após INSERT (possível bloqueio por política RLS).');
    }

    // 6. Consultar e confirmar que o registro existe fisicamente no Supabase
    const { data: verifiedRows, error: verifyError } = await supabase
      .from('competence_billings')
      .select('*')
      .eq('id', newRecord.id);

    if (verifyError || !verifiedRows || verifiedRows.length === 0) {
      console.error('Error verifying inserted competence_billing in Supabase:', verifyError);
      throw new Error('Falha de confirmação no Supabase: o registro foi inserido mas não pôde ser verificado na consulta pós-gravação.');
    }

    const verifiedRecord: CompetenceBilling = {
      ...verifiedRows[0],
      base_price: Number(verifiedRows[0].base_price || 0),
      discount: Number(verifiedRows[0].discount || 0),
      final_price: Number(verifiedRows[0].final_price || 0),
      teacher_fee_value: verifiedRows[0].teacher_fee_value != null ? Number(verifiedRows[0].teacher_fee_value) : null,
      teacher_share: Number(verifiedRows[0].teacher_share || 0),
      school_share: Number(verifiedRows[0].school_share || 0),
      is_paying: verifiedRows[0].is_paying !== undefined ? !!verifiedRows[0].is_paying : true,
      is_frozen: !!verifiedRows[0].is_frozen,
      metadata: typeof verifiedRows[0].metadata === 'object' && verifiedRows[0].metadata !== null 
        ? verifiedRows[0].metadata 
        : (typeof verifiedRows[0].metadata === 'string' ? JSON.parse(verifiedRows[0].metadata) : {}),
    };

    // 7. Somente após sucesso e confirmação física do banco atualizar o estado local
    setState((s) => ({
      ...s,
      competenceBillings: [verifiedRecord, ...(s.competenceBillings || []).filter((b) => b.id !== verifiedRecord.id)],
    }));

    return verifiedRecord;
  };

  const updateCompetenceBilling = async (
    id: string,
    updates: Partial<CompetenceBilling>
  ): Promise<CompetenceBilling> => {
    // 1. Localizar registro
    const existing = (state.competenceBillings || []).find((b) => b.id === id);
    if (!existing) {
      throw new Error(`Snapshot de faturamento com ID "${id}" não foi encontrado.`);
    }

    // 2. Verificar se is_frozen = true
    if (existing.is_frozen) {
      const protectedFields: (keyof CompetenceBilling)[] = [
        'base_price',
        'discount',
        'final_price',
        'teacher_share',
        'school_share',
        'is_paying',
        'teacher_fee_type',
        'teacher_fee_value',
        'metadata',
        'is_frozen',
        'category',
        'competence',
        'enrollment_id',
        'group_id',
        'choir_registration_id',
        'student_id',
        'teacher_id',
      ];
      const isViolated = protectedFields.some(
        (f) => updates[f] !== undefined && updates[f] !== existing[f]
      );
      if (isViolated) {
        throw new Error('Competência congelada. O histórico financeiro não pode ser alterado.');
      }
    }

    // Se aberto e atualizando categoria / competência / origens, validar
    const targetCategory = updates.category !== undefined ? updates.category : existing.category;
    const targetCompetence = updates.competence !== undefined ? updates.competence.trim() : existing.competence;
    const targetEnrollmentId = updates.enrollment_id !== undefined ? updates.enrollment_id : existing.enrollment_id;
    const targetGroupId = updates.group_id !== undefined ? updates.group_id : existing.group_id;
    const targetChoirId = updates.choir_registration_id !== undefined ? updates.choir_registration_id : existing.choir_registration_id;

    if (
      updates.category !== undefined ||
      updates.competence !== undefined ||
      updates.enrollment_id !== undefined ||
      updates.group_id !== undefined ||
      updates.choir_registration_id !== undefined
    ) {
      if (!['individual', 'group', 'choir'].includes(targetCategory)) {
        throw new Error('Categoria inválida. Deve ser "individual", "group" ou "choir".');
      }
      if (!/^[0-9]{4}-[0-9]{2}$/.test(targetCompetence)) {
        throw new Error('Competência inválida. Deve estar no formato YYYY-MM.');
      }
      if (targetCategory === 'individual') {
        if (!targetEnrollmentId || targetGroupId || targetChoirId) {
          throw new Error('Origem incompatível: categoria "individual" exige enrollment_id e não permite group_id ou choir_registration_id.');
        }
      } else if (targetCategory === 'group') {
        if (!targetGroupId || targetEnrollmentId || targetChoirId) {
          throw new Error('Origem incompatível: categoria "group" exige group_id e não permite enrollment_id ou choir_registration_id.');
        }
      } else if (targetCategory === 'choir') {
        if (!targetChoirId || targetEnrollmentId || targetGroupId) {
          throw new Error('Origem incompatível: categoria "choir" exige choir_registration_id e não permite enrollment_id ou group_id.');
        }
      }
    }

    // Montar payload limpo para o Supabase
    const dbUpdates: any = {};
    if (updates.competence !== undefined) dbUpdates.competence = updates.competence.trim();
    if (updates.category !== undefined) dbUpdates.category = updates.category;
    if (updates.enrollment_id !== undefined) dbUpdates.enrollment_id = updates.enrollment_id;
    if (updates.choir_registration_id !== undefined) dbUpdates.choir_registration_id = updates.choir_registration_id;
    if (updates.group_id !== undefined) dbUpdates.group_id = updates.group_id;
    if (updates.student_id !== undefined) dbUpdates.student_id = updates.student_id;
    if (updates.teacher_id !== undefined) dbUpdates.teacher_id = updates.teacher_id;
    if (updates.is_paying !== undefined) dbUpdates.is_paying = !!updates.is_paying;
    if (updates.base_price !== undefined) dbUpdates.base_price = Number(updates.base_price);
    if (updates.discount !== undefined) dbUpdates.discount = Number(updates.discount);
    if (updates.final_price !== undefined) dbUpdates.final_price = Number(updates.final_price);
    if (updates.teacher_fee_type !== undefined) dbUpdates.teacher_fee_type = updates.teacher_fee_type;
    if (updates.teacher_fee_value !== undefined) dbUpdates.teacher_fee_value = updates.teacher_fee_value != null ? Number(updates.teacher_fee_value) : null;
    if (updates.teacher_share !== undefined) dbUpdates.teacher_share = Number(updates.teacher_share);
    if (updates.school_share !== undefined) dbUpdates.school_share = Number(updates.school_share);
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.transaction_id !== undefined) dbUpdates.transaction_id = updates.transaction_id;
    if (updates.is_frozen !== undefined) dbUpdates.is_frozen = !!updates.is_frozen;
    if (updates.frozen_at !== undefined) dbUpdates.frozen_at = updates.frozen_at;
    if (updates.frozen_by !== undefined) dbUpdates.frozen_by = updates.frozen_by;
    if (updates.metadata !== undefined) dbUpdates.metadata = updates.metadata;

    // 4. Executar UPDATE no Supabase
    const { error } = await supabase
      .from('competence_billings')
      .update(dbUpdates)
      .eq('id', id);

    if (error) {
      console.error('Error updating competence_billing in Supabase:', error);
      throw new Error(error.message || 'Erro ao atualizar faturamento de competência no Supabase.');
    }

    // 5. Somente após sucesso atualizar o estado local
    const updatedRecord: CompetenceBilling = {
      ...existing,
      ...updates,
      competence: updates.competence !== undefined ? updates.competence.trim() : existing.competence,
      base_price: updates.base_price !== undefined ? Number(updates.base_price) : existing.base_price,
      discount: updates.discount !== undefined ? Number(updates.discount) : existing.discount,
      final_price: updates.final_price !== undefined ? Number(updates.final_price) : existing.final_price,
      teacher_fee_value: updates.teacher_fee_value !== undefined ? (updates.teacher_fee_value != null ? Number(updates.teacher_fee_value) : null) : existing.teacher_fee_value,
      teacher_share: updates.teacher_share !== undefined ? Number(updates.teacher_share) : existing.teacher_share,
      school_share: updates.school_share !== undefined ? Number(updates.school_share) : existing.school_share,
    };

    setState((s) => ({
      ...s,
      competenceBillings: (s.competenceBillings || []).map((b) => (b.id === id ? updatedRecord : b)),
    }));

    return updatedRecord;
  };

  const correctPendingCompetenceBilling = async (
    input: {
      id: string;
      basePrice?: number;
      finalPrice: number;
      reason: string;
      confirmed: boolean;
      userRole?: string;
      userId?: string;
      userEmail?: string;
    }
  ): Promise<CompetenceBilling> => {
    // 1. Role: admin ou super_admin
    const effectiveRole = input.userRole || currentUserProfile?.role;
    if (!effectiveRole || !['super_admin', 'admin'].includes(effectiveRole)) {
      throw new Error('Acesso negado: Apenas administradores ou super administradores podem corrigir snapshots.');
    }

    // 2. Confirmação explícita obrigatória
    if (!input.confirmed) {
      throw new Error('Confirmação obrigatória: É necessário confirmar expressamente a correção do snapshot.');
    }

    // 3. Motivo obrigatório
    const trimmedReason = (input.reason || '').trim();
    if (!trimmedReason || trimmedReason.length < 5) {
      throw new Error('Motivo obrigatório: Justifique detalhadamente a correção para fins de auditoria.');
    }

    // 4. Localizar snapshot
    let existing = (state.competenceBillings || []).find((b) => b.id === input.id);
    if (!existing) {
      const { data: dbRow } = await supabase.from('competence_billings').select('*').eq('id', input.id).maybeSingle();
      if (dbRow) {
        existing = {
          id: dbRow.id,
          competence: dbRow.competence,
          category: dbRow.category,
          enrollment_id: dbRow.enrollment_id,
          choir_registration_id: dbRow.choir_registration_id,
          group_id: dbRow.group_id,
          student_id: dbRow.student_id,
          teacher_id: dbRow.teacher_id,
          is_paying: dbRow.is_paying !== undefined ? !!dbRow.is_paying : true,
          base_price: Number(dbRow.base_price || 0),
          discount: Number(dbRow.discount || 0),
          final_price: Number(dbRow.final_price || 0),
          teacher_fee_type: dbRow.teacher_fee_type,
          teacher_fee_value: dbRow.teacher_fee_value != null ? Number(dbRow.teacher_fee_value) : null,
          teacher_share: Number(dbRow.teacher_share || 0),
          school_share: Number(dbRow.school_share || 0),
          status: dbRow.status,
          transaction_id: dbRow.transaction_id,
          is_frozen: !!dbRow.is_frozen,
          frozen_at: dbRow.frozen_at,
          frozen_by: dbRow.frozen_by,
          metadata: typeof dbRow.metadata === 'object' && dbRow.metadata !== null 
            ? dbRow.metadata 
            : (typeof dbRow.metadata === 'string' ? JSON.parse(dbRow.metadata) : {}),
          created_at: dbRow.created_at,
        };
      }
    }

    if (!existing) {
      throw new Error(`Snapshot de faturamento com ID "${input.id}" não foi encontrado.`);
    }

    // 5. Regras de segurança estritas
    if (existing.is_frozen) {
      throw new Error('Operação bloqueada: Não é permitido corrigir snapshot congelado (is_frozen = true).');
    }
    if (existing.status === 'paid') {
      throw new Error('Operação bloqueada: Não é permitido alterar snapshot de competência já paga (status = paid).');
    }
    if (existing.transaction_id) {
      throw new Error('Operação bloqueada: Não é permitido alterar snapshot vinculado a transação financeira (transaction_id).');
    }
    if (existing.status !== 'pending') {
      throw new Error(`Operação bloqueada: Apenas snapshots com status 'pending' podem ser corrigidos (status atual: ${existing.status}).`);
    }

    const finalPrice = Number(input.finalPrice);
    const basePrice = input.basePrice !== undefined ? Number(input.basePrice) : finalPrice;
    const discount = Math.max(0, basePrice - finalPrice);

    let teacherShare = existing.teacher_share;
    let schoolShare = existing.school_share;
    if (existing.teacher_fee_type === 'percentage') {
      const pct = existing.teacher_fee_value != null ? existing.teacher_fee_value : 100;
      teacherShare = (finalPrice * pct) / 100;
      schoolShare = finalPrice - teacherShare;
    } else if (existing.teacher_fee_type === 'fixed') {
      teacherShare = Math.min(finalPrice, existing.teacher_fee_value || 0);
      schoolShare = finalPrice - teacherShare;
    } else if (existing.teacher_share === existing.final_price) {
      teacherShare = finalPrice;
      schoolShare = 0;
    }

    const existingMeta = typeof existing.metadata === 'object' && existing.metadata !== null ? existing.metadata : {};
    const updatedMetadata = {
      ...existingMeta,
      source: 'historical_regularization_correction',
      reason: trimmedReason,
      corrected_by: input.userEmail || currentUserProfile?.email || input.userId || currentUserProfile?.id || 'admin',
      corrected_at: new Date().toISOString(),
      previous_final_price: existing.final_price,
      previous_base_price: existing.base_price,
    };

    const dbPayload = {
      base_price: basePrice,
      discount: discount,
      final_price: finalPrice,
      teacher_share: teacherShare,
      school_share: schoolShare,
      metadata: updatedMetadata,
    };

    const { data: updatedRows, error } = await supabase
      .from('competence_billings')
      .update(dbPayload)
      .eq('id', input.id)
      .select('*');

    if (error) {
      console.error('Error updating competence_billing in Supabase:', error);
      throw new Error(error.message || 'Erro ao atualizar faturamento de competência no Supabase.');
    }

    if (!updatedRows || updatedRows.length === 0) {
      throw new Error('Falha ao confirmar a gravação física da correção no banco de dados Supabase.');
    }

    const confirmedRecord: CompetenceBilling = {
      ...existing,
      base_price: Number(updatedRows[0].base_price),
      discount: Number(updatedRows[0].discount),
      final_price: Number(updatedRows[0].final_price),
      teacher_share: Number(updatedRows[0].teacher_share),
      school_share: Number(updatedRows[0].school_share),
      metadata: updatedRows[0].metadata || updatedMetadata,
    };

    setState((s) => ({
      ...s,
      competenceBillings: [
        confirmedRecord,
        ...(s.competenceBillings || []).filter((b) => b.id !== confirmedRecord.id),
      ],
    }));

    return confirmedRecord;
  };

  const freezeCompetenceBilling = async (id: string, userId: string): Promise<CompetenceBilling> => {
    const existing = (state.competenceBillings || []).find((b) => b.id === id);
    if (!existing) {
      throw new Error(`Snapshot de faturamento com ID "${id}" não foi encontrado.`);
    }

    const frozenAt = new Date().toISOString();
    const freezePayload = {
      is_frozen: true,
      frozen_at: frozenAt,
      frozen_by: userId || null,
    };

    const { error } = await supabase
      .from('competence_billings')
      .update(freezePayload)
      .eq('id', id);

    if (error) {
      console.error('Error freezing competence_billing in Supabase:', error);
      throw new Error(error.message || 'Erro ao congelar faturamento no Supabase.');
    }

    const frozenRecord: CompetenceBilling = {
      ...existing,
      ...freezePayload,
    };

    setState((s) => ({
      ...s,
      competenceBillings: (s.competenceBillings || []).map((b) => (b.id === id ? frozenRecord : b)),
    }));

    return frozenRecord;
  };

  const ensureDueCompetenceBilling = async (params: {
    category: CompetenceBillingCategory;
    sourceId: string;
    competence: string;
  }): Promise<CompetenceBilling | null> => {
    return await serviceEnsureDueCompetenceBilling({
      category: params.category,
      sourceId: params.sourceId,
      competence: params.competence,
      context: {
        students: state.students,
        enrollments: state.enrollments,
        choirRegistrations: state.choirRegistrations,
        financialPlans: state.financialPlans,
        groups: state.groups,
        competenceBillings: state.competenceBillings || [],
        classes: state.classes,
        teachers: state.teachers,
        credits: state.credits,
        discountRules: state.discountRules,
      },
      onBillingCreated: (created) => {
        setState((s) => {
          const list = s.competenceBillings || [];
          if (list.some((b) => b.id === created.id)) return s;
          return {
            ...s,
            competenceBillings: [created, ...list],
          };
        });
      },
    });
  };

  const ensureDueCompetencesForCycle = async (competence: string): Promise<void> => {
    const comp = (competence || '').trim();
    if (!/^\d{4}-\d{2}$/.test(comp)) return;

    const promises: Promise<any>[] = [];

    // 1. Matrículas Individuais Ativas
    for (const enr of state.enrollments) {
      if (enr.status === 'active' || enr.end_date) {
        const existing = findCompetenceBilling(state.competenceBillings, 'individual', enr.id, comp);
        if (!existing) {
          promises.push(ensureDueCompetenceBilling({ category: 'individual', sourceId: enr.id, competence: comp }));
        }
      }
    }

    // 2. Registros de Coral Ativos
    for (const ch of state.choirRegistrations) {
      if (ch.status === 'approved' || ch.active !== false) {
        const existing = findCompetenceBilling(state.competenceBillings, 'choir', ch.id, comp);
        if (!existing) {
          promises.push(ensureDueCompetenceBilling({ category: 'choir', sourceId: ch.id, competence: comp }));
        }
      }
    }

    // 3. Grupos com cobrança unificada ativa
    for (const gr of state.groups) {
      if (gr.payment_type === 'group' && gr.price && gr.price > 0 && gr.status !== 'inactive') {
        const existing = findCompetenceBilling(state.competenceBillings, 'group', gr.id, comp);
        if (!existing) {
          promises.push(ensureDueCompetenceBilling({ category: 'group', sourceId: gr.id, competence: comp }));
        }
      }
    }

    if (promises.length > 0) {
      await Promise.all(promises);
    }
  };

  const activeTeachers = useMemo(() => {
    return state.teachers.filter(t => t.status === 'active');
  }, [state.teachers]);

  return (
    <AppContext.Provider
      value={{
        state,
        isSaving,
        currentUserProfile,
        isProfileLoading,
        pendingClassSyncs,
        pendingSyncCount,
        syncPendingClasses,
        syncSingleClassSafely,
        inspectClassForRecovery,
        runClassAudit,
        recoverPendingClasses,
        resolveClassConflict,
        latestAuditSummary,
        isAuditing,
        setGlobalError,
        addStudent,
        updateStudent,
        deleteStudent,
        normalizeAllStudentPhones,
        activeTeachers,
        addTeacher,
        updateTeacher,
        deleteTeacher,
        toggleTeacherStatus,
        addClass,
        updateClass,
        deleteClass,
        googleSyncMap,
        resyncClassGoogle,
        reconcileGoogleCalendar,
        refreshGoogleSyncStatus,
        addCredit,
        updateCredit,
        deleteCredit,
        reconcileRaphaelCredits,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        addFinancialPlan,
        updateFinancialPlan,
        deleteFinancialPlan,
        addChoirVoiceType,
        updateChoirVoiceType,
        deleteChoirVoiceType,
        addChoirRegistration,
        updateChoirRegistration,
        deleteChoirRegistration,
        addChoirCollaborator,
        updateChoirCollaborator,
        deleteChoirCollaborator,
        addChoirRehearsal,
        updateChoirRehearsal,
        deleteChoirRehearsal,
        generateBiweeklyRehearsals,
        cleanDuplicateRehearsals,
        addEnrollment,
        updateEnrollment,
        deleteEnrollment,
        addDiscountRule,
        updateDiscountRule,
        deleteDiscountRule,
        addGroup,
        updateGroup,
        deleteGroup,
        addProspect,
        updateProspect,
        deleteProspect,
        addProfile,
        updateProfile,
        deleteProfile,
        toggleProfileAccess,
        reloadCurrentUserProfile,
        syncGroupFutureClasses,
        addAffiliate,
        updateAffiliate,
        deleteAffiliate,
        addAffiliateReferral,
        updateAffiliateReferral,
        deleteAffiliateReferral,
        addAffiliateClosing,
        reopenAffiliateClosing,
        getCompetenceBilling,
        createCompetenceBilling,
        updateCompetenceBilling,
        correctPendingCompetenceBilling,
        freezeCompetenceBilling,
        ensureDueCompetenceBilling,
        ensureDueCompetencesForCycle,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppStore = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppStore must be used within AppProvider");
  return context;
};

export const getStudentChoirConsecutiveAbsences = (
  studentId: string,
  rehearsals: ChoirRehearsal[]
): number => {
  if (!rehearsals || rehearsals.length === 0) return 0;
  // Sort rehearsals chronologically ascending
  const sorted = [...rehearsals].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let consecutive = 0;
  for (const rehearsal of sorted) {
    const attendance = parseAttendance(rehearsal.attendance);
    const record = attendance.find(
      (a) => a.person_id === studentId && a.type === 'singer'
    );
    if (!record) continue;
    if (record.status === 'absent') {
      consecutive++;
    } else if (record.status === 'present') {
      consecutive = 0;
    }
  }
  return consecutive;
};

export const getEligibleChoirCollaboratorsForRehearsal = (
  rehearsal: ChoirRehearsal | { date: string; attendance?: any } | null,
  collaborators: ChoirCollaborator[]
): ChoirCollaborator[] => {
  if (!rehearsal) return [];
  const rehearsalDate = rehearsal.date || '';
  const isFromSept2026 = rehearsalDate >= '2026-09-01';

  if (isFromSept2026) {
    // A partir de 01/09/2026: integrantes com active === false NÃO aparecem na chamada
    return (collaborators || []).filter((c) => c.active !== false);
  } else {
    // Para chamadas com data até 31/08/2026: preservar o histórico normalmente
    return (collaborators || []);
  }
};

export const getEligibleChoirSingersForRehearsal = (
  rehearsal: ChoirRehearsal | { date: string; attendance?: any } | null,
  registrations: ChoirRegistration[]
): ChoirRegistration[] => {
  if (!rehearsal) return [];
  const rehearsalDate = rehearsal.date || '';
  const isFromSept2026 = rehearsalDate >= '2026-09-01';

  if (isFromSept2026) {
    // A partir de 01/09/2026: participantes com active === false ou status === 'inactive' NÃO aparecem na chamada
    return (registrations || []).filter(
      (r) => r.status === 'approved' && r.active !== false
    );
  } else {
    // Para chamadas com data até 31/08/2026: preservar o histórico normalmente
    return (registrations || []).filter(
      (r) => r.status === 'approved' || r.status === 'inactive' || r.active !== undefined
    );
  }
};

