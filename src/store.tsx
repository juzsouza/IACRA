import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { supabase } from "./lib/supabase";
import { createClient } from "@supabase/supabase-js";

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
};

export type ClassSession = {
  id: string;
  title: string;
  teacher_id: string;
  student_ids: string[];
  date: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "completed" | "cancelled";
  allow_makeup?: boolean;
  makeup_scheduled?: boolean;
  report?: string;
  attendance?: Record<string, "present" | "absent">;
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
  status: 'pending' | 'approved' | 'rejected';
  monthly_fee: number;
  is_internal_student: boolean;
};

export type Group = {
  id: string;
  name: string;
  teacher_id?: string;
  schedule?: string;
  max_students?: number;
  payment_type?: 'group' | 'individual';
  price?: number;
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
  due_date_day: number;
  due_day?: number;
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
  lead_status?: "contato_iniciado" | "aguardando_retorno" | "nao_deu_retorno" | "";
  message_history?: { id: string; date: string; note: string; status: string }[];
  not_eligible?: boolean;
  ineligibility_reason?: string;
};

export type UserProfile = {
  id: string;
  email: string;
  role: "super_admin" | "admin" | "teacher";
  teacher_id?: string;
  temp_password?: string;
  created_at?: string;
};

type AppState = {
  students: Student[];
  teachers: Teacher[];
  classes: ClassSession[];
  transactions: Transaction[];
  financialPlans: FinancialPlan[];
  choirVoiceTypes: ChoirVoiceType[];
  choirRegistrations: ChoirRegistration[];
  enrollments: Enrollment[];
  discountRules: DiscountRule[];
  groups: Group[];
  prospects: Prospect[];
  profiles: UserProfile[];
  globalError: string | null;
};

type AppContextType = {
  state: AppState;
  currentUserProfile: UserProfile | null;
  setGlobalError: (error: string | null) => void;
  addStudent: (student: Omit<Student, "id">) => void;
  updateStudent: (id: string, student: Partial<Student>) => void;
  deleteStudent: (id: string) => void;

  addTeacher: (teacher: Omit<Teacher, "id">) => void;
  updateTeacher: (id: string, teacher: Partial<Teacher>) => void;
  deleteTeacher: (id: string) => void;

  addClass: (session: Omit<ClassSession, "id">) => void;
  updateClass: (id: string, session: Partial<ClassSession>) => void;
  deleteClass: (id: string) => void;

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

  addEnrollment: (enrollment: Omit<Enrollment, "id">) => void;
  updateEnrollment: (id: string, enrollment: Partial<Enrollment>) => void;
  deleteEnrollment: (id: string) => void;

  addDiscountRule: (rule: Omit<DiscountRule, "id">) => void;
  updateDiscountRule: (id: string, rule: Partial<DiscountRule>) => void;
  deleteDiscountRule: (id: string) => void;

  addGroup: (group: Omit<Group, "id">) => void;
  updateGroup: (id: string, group: Partial<Group>) => void;
  deleteGroup: (id: string) => void;

  addProspect: (prospect: Omit<Prospect, "id">) => Promise<void>;
  updateProspect: (id: string, prospect: Partial<Prospect>) => Promise<void>;
  deleteProspect: (id: string) => Promise<void>;

  addProfile: (profile: UserProfile, password?: string) => Promise<void>;
  updateProfile: (id: string, profile: Partial<UserProfile>) => Promise<void>;
  deleteProfile: (id: string) => Promise<void>;
  reloadCurrentUserProfile: () => Promise<void>;
};

const AppContext = createContext<AppContextType | undefined>(undefined);

const generateId = () => crypto.randomUUID();

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
      enrollments: [],
      discountRules: [],
      groups: [],
      prospects: [],
      profiles: [],
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
          teachers: parsed.teachers || [],
          classes: parsed.classes || [],
          transactions: parsed.transactions || [],
          financialPlans: parsed.financialPlans || [],
          choirVoiceTypes: parsed.choirVoiceTypes || [],
          choirRegistrations: parsed.choirRegistrations || [],
          enrollments: parsed.enrollments || [],
          discountRules: parsed.discountRules || [],
          groups: parsed.groups || [],
          prospects: parsed.prospects || [],
          profiles: parsed.profiles || [],
        };
      } catch (e) {
        console.error("Failed to parse state", e);
      }
    }
    return defaultState;
  });

  useEffect(() => {
    localStorage.setItem("music_school_state", JSON.stringify(state));
  }, [state]);

  const setGlobalError = (error: string | null) => {
    setState((s) => ({ ...s, globalError: error }));
  };

  const syncTriggeredRef = useRef(false);

  useEffect(() => {
    const fetchFromSupabase = async () => {
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
          supabase.from('classes').select('*, class_students(student_id)'),
          supabase.from('transactions').select('*'),
          supabase.from('financial_plans').select('*'),
          supabase.from('choir_voice_types').select('*'),
          supabase.from('choir_registrations').select('*'),
          supabase.from('enrollments').select('*'),
          supabase.from('financial_discount_rules').select('*'),
          supabase.from('groups').select('*')
        ]);

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
                const groupsToInsert = s.groups.map(({ payment_type, schedule, price, ...rest }) => {
                  let dbSchedule = schedule || "";
                  if (payment_type) {
                    dbSchedule = `${dbSchedule} // PAYMENT: ${payment_type}`;
                  }
                  if (price !== undefined) {
                    dbSchedule = `${dbSchedule} // PRICE: ${price}`;
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
                const enrollmentsToInsert = s.enrollments.map((e) => ({
                  ...e,
                  start_date: e.start_date || e.enrollment_date,
                  due_day: e.due_day || e.due_date_day || 5,
                  due_date_day: e.due_date_day || e.due_day || 5,
                }));
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
                const { error } = await supabase.from('choir_registrations').insert(s.choirRegistrations);
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
                  return {
                    ...rest,
                    instrument: dbInstrument,
                  };
                });
                const { error } = await supabase.from('prospects').insert(prospectsToInsert);
                if (error) console.error('Error syncing prospects:', error);
                else console.log('Successfully synced prospects');
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

          // Map local entities to the primary student
          let finalEnrollments = enrollments && enrollments.length > 0 ? enrollments.map((e: any) => ({
            ...e,
            due_date_day: e.due_date_day || e.due_day || 5,
            due_day: e.due_day || e.due_date_day || 5,
          })) : s.enrollments;

          if (Object.keys(idMapping).length > 0) {
            finalEnrollments = finalEnrollments.map((e: any) => {
              if (idMapping[e.student_id]) {
                return { ...e, student_id: idMapping[e.student_id] };
              }
              return e;
            });
          }

          let finalChoirRegistrations = choirRegistrations && choirRegistrations.length > 0 ? choirRegistrations : s.choirRegistrations;
          if (Object.keys(idMapping).length > 0) {
            finalChoirRegistrations = finalChoirRegistrations.map((r: any) => {
              if (idMapping[r.student_id]) {
                return { ...r, student_id: idMapping[r.student_id] };
              }
              return r;
            });
          }

          let finalClasses = classes && classes.length > 0 ? classes.map(c => {
            const { class_students, ...rest } = c;
            let report = rest.report || "";
            let attendance = {};
            if (report.includes(" // ATTENDANCE: ")) {
              const parts = report.split(" // ATTENDANCE: ");
              report = parts[0];
              try {
                attendance = JSON.parse(parts[1]);
              } catch (e) {
                console.error("Error parsing attendance:", e);
              }
            }
            
            let student_ids = class_students?.map((cs: any) => cs.student_id) || [];
            if (Object.keys(idMapping).length > 0) {
              student_ids = student_ids.map((sid: string) => idMapping[sid] || sid);
              // deduplicate student_ids within the same class
              student_ids = Array.from(new Set(student_ids));
            }

            return {
              ...rest,
              report,
              attendance,
              student_ids
            };
          }) : s.classes;

          // Deduplicate classes to guarantee consistency
          const classesBySignature: Record<string, typeof finalClasses> = {};
          finalClasses.forEach(cls => {
            const sortedStudents = [...(cls.student_ids || [])].sort().join(",");
            const normTitle = (cls.title || "").toLowerCase().trim();
            const signature = `${cls.date}|${cls.start_time}|${cls.end_time}|${cls.teacher_id}|${normTitle}|${sortedStudents}`;
            if (!classesBySignature[signature]) {
              classesBySignature[signature] = [];
            }
            classesBySignature[signature].push(cls);
          });

          const duplicateClassGroups = Object.values(classesBySignature).filter(g => g.length > 1);
          const classesToKeep = [...finalClasses];
          const duplicateClassIdsToDelete: string[] = [];

          duplicateClassGroups.forEach(group => {
            const sortedGroup = [...group].sort((a, b) => {
              const score = (status: string) => {
                if (status === 'completed') return 3;
                if (status === 'scheduled') return 2;
                return 1; // cancelled
              };
              if (score(b.status) !== score(a.status)) {
                return score(b.status) - score(a.status);
              }
              const bMakeup = b.makeup_scheduled ? 1 : 0;
              const aMakeup = a.makeup_scheduled ? 1 : 0;
              if (bMakeup !== aMakeup) {
                return bMakeup - aMakeup;
              }
              const bHasReport = b.report ? 1 : 0;
              const aHasReport = a.report ? 1 : 0;
              if (bHasReport !== aHasReport) {
                return bHasReport - aHasReport;
              }
              return (b.id || "").localeCompare(a.id || "");
            });
            const primary = sortedGroup[0];
            const duplicates = sortedGroup.slice(1);
            duplicates.forEach(dup => {
              duplicateClassIdsToDelete.push(dup.id);
              const idx = classesToKeep.findIndex(c => c.id === dup.id);
              if (idx !== -1) {
                classesToKeep.splice(idx, 1);
              }
            });
          });

          const runClassDeduplication = async () => {
            if (duplicateClassIdsToDelete.length === 0) return;
            console.log('Running background database deduplication for classes:', duplicateClassIdsToDelete);
            try {
              const { error: csErr } = await supabase
                .from('class_students')
                .delete()
                .in('class_id', duplicateClassIdsToDelete);
              if (csErr) console.error('Error deleting class_students for duplicates:', csErr);

              const { error: deleteErr } = await supabase
                .from('classes')
                .delete()
                .in('id', duplicateClassIdsToDelete);
              if (deleteErr) console.error('Error deleting duplicate classes:', deleteErr);
              else console.log('Successfully completed class database deduplication!');
            } catch (err) {
              console.error('Unexpected error during class database deduplication:', err);
            }
          };

          if (duplicateClassIdsToDelete.length > 0) {
            runClassDeduplication();
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

              // 4. Delete duplicate student records
              const { error: deleteErr } = await supabase
                .from('students')
                .delete()
                .in('id', duplicateIdsToDelete);
              if (deleteErr) console.error('Error deleting duplicate students:', deleteErr);
              else console.log('Successfully completed database deduplication!');
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
            return {
              ...pr,
              instrument,
              not_eligible,
              ineligibility_reason,
            };
          });

          return {
            students: studentsToKeep,
            teachers: teachers && teachers.length > 0 ? teachers.map((t: any) => ({
              ...t,
              schedule: Array.isArray(t.schedule) ? t.schedule : (typeof t.schedule === 'string' ? JSON.parse(t.schedule) : (t.schedule || []))
            })) : s.teachers,
            classes: classesToKeep,
            transactions: transactions && transactions.length > 0 ? transactions : s.transactions,
            financialPlans: financialPlans && financialPlans.length > 0 ? financialPlans : s.financialPlans,
            choirVoiceTypes: choirVoiceTypes && choirVoiceTypes.length > 0 ? choirVoiceTypes : s.choirVoiceTypes,
            choirRegistrations: finalChoirRegistrations,
            enrollments: finalEnrollments,
            discountRules: discountRules && discountRules.length > 0 ? discountRules : s.discountRules,
            groups: (groups && groups.length > 0 ? groups : s.groups).map((g: any) => {
              let payment_type: 'group' | 'individual' = 'individual';
              let price: number | undefined = undefined;
              let schedule = g.schedule || "";
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
                schedule,
                payment_type,
                price,
              };
            }),
            prospects: parsedProspects,
            profiles: profiles.length > 0 ? profiles : s.profiles,
          };
        });
      } catch (error: any) {
        console.error('Error fetching from Supabase:', error);
        setGlobalError('Não foi possível conectar ao banco de dados Supabase. O aplicativo continuará funcionando em modo offline com os dados salvos localmente no seu navegador.');
      }
    };

    fetchFromSupabase();
  }, []);

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

    const newStudent = { ...student, id: generateId() };
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
      email: student.email,
      phone: student.phone,
      cpf: student.cpf,
      instrument: dbInstrument,
      status: student.status,
      enrollment_date: student.enrollment_date,
      birth_date: student.birth_date,
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
    }
  };
  const updateStudent = async (id: string, updates: Partial<Student>) => {
    // Save previous state for rollback
    let previousStudent: Student | undefined;
    let mergedStudent: Student | undefined;
    setState((s) => {
      previousStudent = s.students.find(st => st.id === id);
      const updatedList = s.students.map((st) => {
        if (st.id === id) {
          const m = { ...st, ...updates };
          mergedStudent = m;
          return m;
        }
        return st;
      });
      return {
        ...s,
        students: updatedList,
      };
    });

    if (mergedStudent) {
      let dbInstrument = mergedStudent.instrument || "";
      if (mergedStudent.not_eligible && mergedStudent.ineligibility_reason) {
        dbInstrument = `${mergedStudent.instrument} // INELIGIBLE: ${mergedStudent.ineligibility_reason}`;
      }

      const dbUpdates = {
        name: mergedStudent.name,
        email: mergedStudent.email,
        phone: mergedStudent.phone,
        cpf: mergedStudent.cpf,
        instrument: dbInstrument,
        status: mergedStudent.status,
        enrollment_date: mergedStudent.enrollment_date,
        birth_date: mergedStudent.birth_date,
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
    const newTeacher = { ...teacher, id: generateId() };
    setState((s) => ({
      ...s,
      teachers: [...s.teachers, newTeacher],
    }));
    if (true) {
      const { error } = await supabase.from('teachers').insert([newTeacher]);
      if (error) console.error('Error adding teacher:', error);
    }
  };
  const updateTeacher = async (id: string, updates: Partial<Teacher>) => {
    setState((s) => ({
      ...s,
      teachers: s.teachers.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    }));
    if (true) {
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from('teachers').update(updates).eq('id', id);
        if (error) console.error('Error updating teacher:', error);
      }
    }
  };
  const deleteTeacher = async (id: string) => {
    setState((s) => ({
      ...s,
      teachers: s.teachers.filter((t) => t.id !== id),
    }));
    if (true) {
      const { error } = await supabase.from('teachers').delete().eq('id', id);
      if (error) console.error('Error deleting teacher:', error);
    }
  };

  const addClass = async (session: Omit<ClassSession, "id">) => {
    const newClass = { ...session, id: generateId() };
    setState((s) => ({
      ...s,
      classes: [...s.classes, newClass],
    }));
    if (true) {
      const { student_ids, attendance, ...classData } = newClass;
      let dbReport = classData.report || "";
      if (attendance && Object.keys(attendance).length > 0) {
        dbReport = `${dbReport} // ATTENDANCE: ${JSON.stringify(attendance)}`;
      }
      const dbClass = {
        ...classData,
        report: dbReport,
      };
      const { error } = await supabase.from('classes').insert([dbClass]);
      if (error) {
        console.error('Error adding class:', error);
        setGlobalError('Erro ao salvar aula no banco de dados. Verifique se o schema.sql foi atualizado no Supabase.');
        setState((s) => ({
          ...s,
          classes: s.classes.filter(c => c.id !== newClass.id),
        }));
      }
      else if (student_ids && student_ids.length > 0) {
        const classStudents = student_ids.map(student_id => ({ class_id: newClass.id, student_id }));
        await supabase.from('class_students').insert(classStudents);
      }
    }
  };
  const updateClass = async (id: string, updates: Partial<ClassSession>) => {
    let previousClass: ClassSession | undefined;
    let mergedClass: ClassSession | undefined;
    setState((s) => {
      previousClass = s.classes.find(c => c.id === id);
      const updatedList = s.classes.map((c) => {
        if (c.id === id) {
          const m = { ...c, ...updates };
          mergedClass = m;
          return m;
        }
        return c;
      });
      return {
        ...s,
        classes: updatedList,
      };
    });

    if (mergedClass) {
      const { student_ids, attendance, ...classData } = updates;
      let dbReport = mergedClass.report || "";
      if (mergedClass.attendance && Object.keys(mergedClass.attendance).length > 0) {
        dbReport = `${dbReport} // ATTENDANCE: ${JSON.stringify(mergedClass.attendance)}`;
      }
      const dbClass = {
        title: mergedClass.title,
        teacher_id: mergedClass.teacher_id,
        date: mergedClass.date,
        start_time: mergedClass.start_time,
        end_time: mergedClass.end_time,
        status: mergedClass.status,
        allow_makeup: !!mergedClass.allow_makeup,
        makeup_scheduled: !!mergedClass.makeup_scheduled,
        report: dbReport,
      };
      const { error } = await supabase.from('classes').update(dbClass).eq('id', id);
      if (error) console.error('Error updating class:', error);

      if (student_ids) {
        await supabase.from('class_students').delete().eq('class_id', id);
        if (student_ids.length > 0) {
          const classStudents = student_ids.map(student_id => ({ class_id: id, student_id }));
          await supabase.from('class_students').insert(classStudents);
        }
      }
    }
  };
  const deleteClass = async (id: string) => {
    setState((s) => ({ ...s, classes: s.classes.filter((c) => c.id !== id) }));
    if (true) {
      const { error } = await supabase.from('classes').delete().eq('id', id);
      if (error) console.error('Error deleting class:', error);
    }
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
    const newRegistration = { ...registration, id: generateId() };
    setState((s) => ({
      ...s,
      choirRegistrations: [...s.choirRegistrations, newRegistration],
    }));
    if (true) {
      const { error } = await supabase.from('choir_registrations').insert([newRegistration]);
      if (error) console.error('Error adding choir registration:', error);
    }
  };
  const updateChoirRegistration = async (id: string, updates: Partial<ChoirRegistration>) => {
    setState((s) => ({
      ...s,
      choirRegistrations: s.choirRegistrations.map((r) =>
        r.id === id ? { ...r, ...updates } : r,
      ),
    }));
    if (true) {
      const { error } = await supabase.from('choir_registrations').update(updates).eq('id', id);
      if (error) console.error('Error updating choir registration:', error);
    }
  };
  const deleteChoirRegistration = async (id: string) => {
    setState((s) => ({
      ...s,
      choirRegistrations: s.choirRegistrations.filter((r) => r.id !== id),
    }));
    if (true) {
      const { error } = await supabase.from('choir_registrations').delete().eq('id', id);
      if (error) console.error('Error deleting choir registration:', error);
    }
  };

  const addEnrollment = async (enrollment: Omit<Enrollment, "id">) => {
    const newEnrollment = {
      ...enrollment,
      id: generateId(),
      start_date: enrollment.start_date || enrollment.enrollment_date,
      due_day: enrollment.due_day || enrollment.due_date_day || 5,
      due_date_day: enrollment.due_date_day || enrollment.due_day || 5,
    };
    setState((s) => ({
      ...s,
      enrollments: [...s.enrollments, newEnrollment],
    }));
    if (true) {
      const { error } = await supabase.from('enrollments').insert([newEnrollment]);
      if (error) console.error('Error adding enrollment:', error);
    }
  };
  const updateEnrollment = async (id: string, updates: Partial<Enrollment>) => {
    const dbUpdates: any = {
      ...updates,
    };
    if (updates.enrollment_date && !updates.start_date) {
      dbUpdates.start_date = updates.enrollment_date;
    }
    if (updates.due_date_day !== undefined) {
      dbUpdates.due_day = updates.due_date_day;
    }
    if (updates.due_day !== undefined) {
      dbUpdates.due_date_day = updates.due_day;
    }
    setState((s) => ({
      ...s,
      enrollments: s.enrollments.map((e) =>
        e.id === id ? { ...e, ...updates, start_date: updates.start_date || e.start_date || e.enrollment_date, due_day: updates.due_day || updates.due_date_day || e.due_day, due_date_day: updates.due_date_day || updates.due_day || e.due_date_day } : e,
      ),
    }));
    if (true) {
      const { error } = await supabase.from('enrollments').update(dbUpdates).eq('id', id);
      if (error) console.error('Error updating enrollment:', error);
    }
  };
  const deleteEnrollment = async (id: string) => {
    setState((s) => ({
      ...s,
      enrollments: s.enrollments.filter((e) => e.id !== id),
    }));
    if (true) {
      const { error } = await supabase.from('enrollments').delete().eq('id', id);
      if (error) console.error('Error deleting enrollment:', error);
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
    const newGroup = { ...group, id: generateId() };
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
      const dbGroup = {
        id: newGroup.id,
        name: group.name,
        teacher_id: group.teacher_id,
        max_students: group.max_students,
        schedule: dbSchedule,
      };
      const { error } = await supabase.from('groups').insert([dbGroup]);
      if (error) console.error('Error adding group:', error);
    }
  };
  const updateGroup = async (id: string, updates: Partial<Group>) => {
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
      const dbGroup = {
        name: mergedGroup.name,
        teacher_id: mergedGroup.teacher_id,
        max_students: mergedGroup.max_students,
        schedule: dbSchedule,
      };
      const { error } = await supabase.from('groups').update(dbGroup).eq('id', id);
      if (error) console.error('Error updating group:', error);
    }
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
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);

  const reloadCurrentUserProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && user.email) {
      let userProfile: UserProfile | null = null;
      try {
        const { data, error } = await supabase.from('profiles').select('*').eq('email', user.email).maybeSingle();
        if (!error && data) {
          userProfile = data;
        }
      } catch (e) {
        console.warn('Could not fetch user profile from Supabase:', e);
      }

      if (!userProfile) {
        const localProfile = state.profiles.find(p => p.email === user.email);
        if (localProfile) {
          userProfile = localProfile;
        }
      }

      if (!userProfile) {
        // If there are absolutely no profiles in the system, we make this first user the super_admin
        const hasAnyProfiles = state.profiles.length > 0;
        const isSuperAdminEmail = user.email.toLowerCase() === "jusssouzaa@gmail.com";
        const newProfile: UserProfile = {
          id: user.id,
          email: user.email,
          role: (isSuperAdminEmail || !hasAnyProfiles) ? "super_admin" : "teacher",
        };

        setState(s => ({
          ...s,
          profiles: [...s.profiles.filter(p => p.email !== user.email), newProfile]
        }));

        try {
          await supabase.from('profiles').insert([newProfile]);
        } catch (e) {
          console.warn('Could not save new profile to Supabase:', e);
        }
        userProfile = newProfile;
      }

      // Enforce super_admin role if email is jusssouzaa@gmail.com
      if (userProfile && user.email.toLowerCase() === "jusssouzaa@gmail.com" && userProfile.role !== "super_admin") {
        userProfile = { ...userProfile, role: "super_admin" };
        try {
          await supabase.from('profiles').update({ role: "super_admin" }).eq('email', user.email);
        } catch (e) {
          console.warn('Could not update super_admin role for jusssouzaa@gmail.com:', e);
        }
      }

      setCurrentUserProfile(userProfile);
    } else {
      setCurrentUserProfile(null);
    }
  };

  useEffect(() => {
    reloadCurrentUserProfile();
  }, [state.profiles.length]);

  const addProspect = async (prospect: Omit<Prospect, "id">) => {
    const newProspect = { ...prospect, id: generateId(), created_at: new Date().toISOString() };
    setState((s) => ({
      ...s,
      prospects: [...s.prospects, newProspect],
    }));

    try {
      let dbInstrument = newProspect.instrument || "";
      if (newProspect.not_eligible && newProspect.ineligibility_reason) {
        dbInstrument = `${newProspect.instrument} // INELIGIBLE: ${newProspect.ineligibility_reason}`;
      }

      const dbProspect = {
        id: newProspect.id,
        name: newProspect.name,
        email: newProspect.email,
        phone: newProspect.phone,
        cpf: newProspect.cpf,
        instrument: dbInstrument,
        term_signed: newProspect.term_signed,
        approved: newProspect.approved,
        notes: newProspect.notes,
        created_at: newProspect.created_at,
      };

      const { error } = await supabase.from('prospects').insert([dbProspect]);
      if (error) console.error('Error adding prospect:', error);
    } catch (e) {
      console.warn('Error saving prospect to Supabase:', e);
    }

    // Auto-create student if approved
    if (newProspect.approved) {
      const cleanProspectCpf = (newProspect.cpf || "").replace(/\D/g, "");
      const exists = state.students.some(st => {
        const stCpf = (st.cpf || "").replace(/\D/g, "");
        if (cleanProspectCpf && stCpf && cleanProspectCpf === stCpf) return true;
        return (st.email && st.email === newProspect.email) || 
               st.name.toLowerCase().trim() === newProspect.name.toLowerCase().trim();
      });
      if (!exists) {
        addStudent({
          name: newProspect.name,
          email: newProspect.email || "",
          phone: newProspect.phone || "",
          cpf: newProspect.cpf || "",
          instrument: newProspect.instrument || "",
          status: "active",
          enrollment_date: new Date().toISOString().split("T")[0]
        });
      }
    }
  };

  const updateProspect = async (id: string, updates: Partial<Prospect>) => {
    let oldProspect: Prospect | undefined;
    let mergedProspect: Prospect | undefined;
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

        const dbUpdates = {
          name: mergedProspect.name,
          email: mergedProspect.email,
          phone: mergedProspect.phone,
          cpf: mergedProspect.cpf,
          instrument: dbInstrument,
          term_signed: mergedProspect.term_signed,
          approved: mergedProspect.approved,
          notes: mergedProspect.notes,
        };

        const { error } = await supabase.from('prospects').update(dbUpdates).eq('id', id);
        if (error) console.error('Error updating prospect:', error);
      } catch (e) {
        console.warn('Error updating prospect in Supabase:', e);
      }
    }

    // Auto-create student if approved is set to true and was previously false/undefined
    const wasApproved = oldProspect?.approved;
    const isApprovedNow = updates.approved !== undefined ? updates.approved : oldProspect?.approved;
    const finalMergedProspect = { ...oldProspect, ...updates } as Prospect;

    if (isApprovedNow && !wasApproved) {
      const cleanProspectCpf = (finalMergedProspect.cpf || "").replace(/\D/g, "");
      const exists = state.students.some(st => {
        const stCpf = (st.cpf || "").replace(/\D/g, "");
        if (cleanProspectCpf && stCpf && cleanProspectCpf === stCpf) return true;
        return (st.email && st.email === finalMergedProspect.email) || 
               st.name.toLowerCase().trim() === finalMergedProspect.name.toLowerCase().trim();
      });
      if (!exists) {
        addStudent({
          name: finalMergedProspect.name,
          email: finalMergedProspect.email || "",
          phone: finalMergedProspect.phone || "",
          cpf: finalMergedProspect.cpf || "",
          instrument: finalMergedProspect.instrument || "",
          status: "active",
          enrollment_date: new Date().toISOString().split("T")[0]
        });
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
    let finalProfile = { ...profile };

    if (password) {
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
          email: profile.email,
          password: password,
        });

        if (authError) {
          throw authError;
        }

        if (authData.user) {
          finalProfile.id = authData.user.id;
          finalProfile.temp_password = password;
        }
      } catch (e: any) {
        console.error('Error creating auth user:', e);
        throw new Error(e.message || 'Erro ao criar credenciais de acesso para o usuário.');
      }
    }

    setState((s) => ({
      ...s,
      profiles: [...s.profiles.filter(p => p.id !== finalProfile.id), finalProfile],
    }));

    try {
      const { error } = await supabase.from('profiles').insert([finalProfile]);
      if (error) {
        console.error('Error adding profile:', error);
        throw error;
      }
    } catch (e: any) {
      console.warn('Error adding profile to Supabase:', e);
      throw e;
    }
  };

  const updateProfile = async (id: string, updates: Partial<UserProfile>) => {
    setState((s) => ({
      ...s,
      profiles: s.profiles.map((p) =>
        p.id === id ? { ...p, ...updates } : p,
      ),
    }));

    try {
      const { error } = await supabase.from('profiles').update(updates).eq('id', id);
      if (error) console.error('Error updating profile:', error);
    } catch (e) {
      console.warn('Error updating profile in Supabase:', e);
    }

    // If we updated the currently logged in user's profile, update current state
    const { data: { user } } = await supabase.auth.getUser();
    if (user && user.id === id) {
      setCurrentUserProfile(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const deleteProfile = async (id: string) => {
    const originalProfiles = state.profiles;
    setState((s) => ({
      ...s,
      profiles: s.profiles.filter((p) => p.id !== id),
    }));

    try {
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) {
        throw error;
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

  return (
    <AppContext.Provider
      value={{
        state,
        currentUserProfile,
        setGlobalError,
        addStudent,
        updateStudent,
        deleteStudent,
        addTeacher,
        updateTeacher,
        deleteTeacher,
        addClass,
        updateClass,
        deleteClass,
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
        reloadCurrentUserProfile,
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
