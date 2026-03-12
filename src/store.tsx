import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "./lib/supabase";

export type Student = {
  id: string;
  name: string;
  email: string;
  phone: string;
  instrument: string;
  status: "active" | "inactive";
  enrollment_date: string;
};

export type Teacher = {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialties: string[];
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
  name: 'Soprano' | 'Contralto' | 'Tenor' | 'Barítono';
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
  due_date_day: number;
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
};

type AppContextType = {
  state: AppState;
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

  useEffect(() => {
    const fetchFromSupabase = async () => {
      try {
        const [
          { data: students },
          { data: teachers },
          { data: classes },
          { data: transactions },
          { data: financialPlans },
          { data: choirVoiceTypes },
          { data: choirRegistrations },
          { data: enrollments },
          { data: discountRules },
          { data: groups }
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

        setState(s => {
          // Sync local data to Supabase if it exists locally but not in Supabase
          const syncToSupabase = async () => {
            if (s.students.length > 0 && (!students || students.length === 0)) {
              await supabase.from('students').insert(s.students);
            }
            if (s.teachers.length > 0 && (!teachers || teachers.length === 0)) {
              await supabase.from('teachers').insert(s.teachers);
            }
            if (s.classes.length > 0 && (!classes || classes.length === 0)) {
              const classesToInsert = s.classes.map(({ student_ids, ...rest }) => rest);
              await supabase.from('classes').insert(classesToInsert);
              
              const classStudentsToInsert = s.classes.flatMap(c => 
                (c.student_ids || []).map(student_id => ({ class_id: c.id, student_id }))
              );
              if (classStudentsToInsert.length > 0) {
                await supabase.from('class_students').insert(classStudentsToInsert);
              }
            }
            if (s.transactions.length > 0 && (!transactions || transactions.length === 0)) {
              await supabase.from('transactions').insert(s.transactions);
            }
            if (s.financialPlans.length > 0 && (!financialPlans || financialPlans.length === 0)) {
              await supabase.from('financial_plans').insert(s.financialPlans);
            }
          };
          
          syncToSupabase();

          return {
            students: students && students.length > 0 ? students : s.students,
            teachers: teachers && teachers.length > 0 ? teachers : s.teachers,
            classes: classes && classes.length > 0 ? classes.map(c => {
              const { class_students, ...rest } = c;
              return {
                ...rest,
                student_ids: class_students?.map((cs: any) => cs.student_id) || []
              };
            }) : s.classes,
            transactions: transactions && transactions.length > 0 ? transactions : s.transactions,
            financialPlans: financialPlans && financialPlans.length > 0 ? financialPlans : s.financialPlans,
            choirVoiceTypes: choirVoiceTypes && choirVoiceTypes.length > 0 ? choirVoiceTypes : s.choirVoiceTypes,
            choirRegistrations: choirRegistrations && choirRegistrations.length > 0 ? choirRegistrations : s.choirRegistrations,
            enrollments: enrollments && enrollments.length > 0 ? enrollments : s.enrollments,
            discountRules: discountRules && discountRules.length > 0 ? discountRules : s.discountRules,
            groups: groups && groups.length > 0 ? groups : s.groups,
          };
        });
      } catch (error) {
        console.error('Error fetching from Supabase:', error);
      }
    };

    fetchFromSupabase();
  }, []);

  const addStudent = async (student: Omit<Student, "id">) => {
    const newStudent = { ...student, id: generateId() };
    setState((s) => ({
      ...s,
      students: [...s.students, newStudent],
    }));
    if (true) {
      const { error } = await supabase.from('students').insert([newStudent]);
      if (error) {
        console.error('Error adding student:', error);
        alert('Erro ao salvar aluno no banco de dados. Por favor, tente novamente.');
        // Revert local state
        setState((s) => ({
          ...s,
          students: s.students.filter(st => st.id !== newStudent.id),
        }));
      }
    }
  };
  const updateStudent = async (id: string, updates: Partial<Student>) => {
    // Save previous state for rollback
    let previousStudent: Student | undefined;
    setState((s) => {
      previousStudent = s.students.find(st => st.id === id);
      return {
        ...s,
        students: s.students.map((st) =>
          st.id === id ? { ...st, ...updates } : st,
        ),
      };
    });
    if (true) {
      const { error } = await supabase.from('students').update(updates).eq('id', id);
      if (error) {
        console.error('Error updating student:', error);
        alert('Erro ao atualizar aluno no banco de dados.');
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
        alert('Erro ao excluir aluno no banco de dados.');
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
      const { error } = await supabase.from('teachers').update(updates).eq('id', id);
      if (error) console.error('Error updating teacher:', error);
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
      const { student_ids, ...classData } = newClass;
      const { error } = await supabase.from('classes').insert([classData]);
      if (error) {
        console.error('Error adding class:', error);
        alert('Erro ao salvar aula no banco de dados. Verifique se o schema.sql foi atualizado no Supabase.');
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
    setState((s) => ({
      ...s,
      classes: s.classes.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
    if (true) {
      const { student_ids, ...classData } = updates;
      if (Object.keys(classData).length > 0) {
        const { error } = await supabase.from('classes').update(classData).eq('id', id);
        if (error) console.error('Error updating class:', error);
      }
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
    const newEnrollment = { ...enrollment, id: generateId() };
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
    setState((s) => ({
      ...s,
      enrollments: s.enrollments.map((e) =>
        e.id === id ? { ...e, ...updates } : e,
      ),
    }));
    if (true) {
      const { error } = await supabase.from('enrollments').update(updates).eq('id', id);
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
      const { error } = await supabase.from('groups').insert([newGroup]);
      if (error) console.error('Error adding group:', error);
    }
  };
  const updateGroup = async (id: string, updates: Partial<Group>) => {
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) =>
        g.id === id ? { ...g, ...updates } : g,
      ),
    }));
    if (true) {
      const { error } = await supabase.from('groups').update(updates).eq('id', id);
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

  return (
    <AppContext.Provider
      value={{
        state,
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
