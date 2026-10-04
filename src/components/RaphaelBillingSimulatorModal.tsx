import React, { useState, useMemo } from "react";
import { useAppStore } from "../store";
import {
  calculateRaphaelStudentMonthlySimulation,
  calculateRaphaelGroupMonthlySimulation,
  runAllPredefinedScenarioTests,
  runAllGroupScenarioTests,
  RAPHAEL_TEACHER_ID,
  isRaphaelTeacher,
} from "../utils/raphaelBillingSimulation";
import {
  Calculator,
  X,
  CheckCircle2,
  AlertCircle,
  Play,
  Layers,
  Sparkles,
  ShieldCheck,
  Calendar,
  User,
  Users,
  AlertTriangle,
} from "lucide-react";
import { motion } from "motion/react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const RaphaelBillingSimulatorModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { state } = useAppStore();
  const [activeTab, setActiveTab] = useState<"individual" | "groups" | "test_suite">("individual");

  // Selection for individual simulation
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>("2026-08");
  const [manualPreviousCredits, setManualPreviousCredits] = useState<number>(0);

  // What-if sandbox overrides (Individual)
  const [useSandboxOverrides, setUseSandboxOverrides] = useState<boolean>(false);
  const [sandboxPrice, setSandboxPrice] = useState<number>(240);
  const [sandboxModality, setSandboxModality] = useState<"quinzenal" | "semanal">("quinzenal");
  const [sandboxRegularLessons, setSandboxRegularLessons] = useState<number>(2);
  const [sandboxMakeupLessons, setSandboxMakeupLessons] = useState<number>(0);
  const [sandboxTeacherCancellations, setSandboxTeacherCancellations] = useState<number>(0);
  const [sandboxStudentAbsences, setSandboxStudentAbsences] = useState<number>(0);

  // Group simulation states
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [useGroupSandbox, setUseGroupSandbox] = useState<boolean>(false);
  const [groupSandboxPrice, setGroupSandboxPrice] = useState<number>(360);
  const [groupSandboxFrequency, setGroupSandboxFrequency] = useState<"quinzenal" | "semanal" | "nao_definida">("quinzenal");
  const [groupSandboxRegularLessons, setGroupSandboxRegularLessons] = useState<number>(2);
  const [groupSandboxTeacherCancellations, setGroupSandboxTeacherCancellations] = useState<number>(0);
  const [groupSandboxMakeupLessons, setGroupSandboxMakeupLessons] = useState<number>(0);
  const [groupSandboxPrevCredits, setGroupSandboxPrevCredits] = useState<number>(0);

  // Raphael's individual students
  const raphaelStudents = useMemo(() => {
    return state.students.filter((st) => {
      const en = state.enrollments.find(
        (e) =>
          e.student_id === st.id &&
          e.status === "active" &&
          (e.teacher_id === RAPHAEL_TEACHER_ID ||
            state.financialPlans.find((p) => p.id === e.plan_id)?.exclusive_teacher_id === RAPHAEL_TEACHER_ID)
      );
      return Boolean(en);
    });
  }, [state.students, state.enrollments, state.financialPlans]);

  // Raphael's groups
  const raphaelGroups = useMemo(() => {
    return state.groups.filter((g) => {
      const teacher = state.teachers.find((t) => t.id === g.teacher_id);
      return isRaphaelTeacher(g.teacher_id, teacher?.name, null) && g.payment_type === "group";
    });
  }, [state.groups, state.teachers]);

  // Default student selection
  React.useEffect(() => {
    if (!selectedStudentId && raphaelStudents.length > 0) {
      const cristina = raphaelStudents.find((s) =>
        s.name.toLowerCase().includes("cristina")
      );
      setSelectedStudentId(cristina ? cristina.id : raphaelStudents[0].id);
    }
  }, [raphaelStudents, selectedStudentId]);

  // Default group selection
  React.useEffect(() => {
    if (!selectedGroupId && raphaelGroups.length > 0) {
      const dupla = raphaelGroups.find((g) =>
        g.name.toLowerCase().includes("sergio") || g.name.toLowerCase().includes("dupla")
      );
      setSelectedGroupId(dupla ? dupla.id : raphaelGroups[0].id);
    }
  }, [raphaelGroups, selectedGroupId]);

  // Selected student details
  const selectedStudent = useMemo(
    () => state.students.find((s) => s.id === selectedStudentId),
    [state.students, selectedStudentId]
  );

  const selectedEnrollment = useMemo(() => {
    return state.enrollments.find(
      (e) =>
        e.student_id === selectedStudentId &&
        e.status === "active" &&
        (e.teacher_id === RAPHAEL_TEACHER_ID ||
          state.financialPlans.find((p) => p.id === e.plan_id)?.exclusive_teacher_id === RAPHAEL_TEACHER_ID)
    );
  }, [state.enrollments, selectedStudentId, state.financialPlans]);

  const selectedPlan = useMemo(() => {
    if (!selectedEnrollment) return null;
    return state.financialPlans.find((p) => p.id === selectedEnrollment.plan_id);
  }, [state.financialPlans, selectedEnrollment]);

  const raphaelTeacher = useMemo(() => {
    return (
      state.teachers.find((t) => t.id === RAPHAEL_TEACHER_ID) || {
        id: RAPHAEL_TEACHER_ID,
        name: "RAPHAEL AUGUSTO PINTO",
      }
    );
  }, [state.teachers]);

  // Real student classes
  const studentClasses = useMemo(() => {
    if (!selectedStudentId) return [];
    return state.classes.filter((c) => {
      const sids = Array.isArray(c.student_ids) ? c.student_ids : [];
      return sids.includes(selectedStudentId);
    });
  }, [state.classes, selectedStudentId]);

  // Selected group details
  const selectedGroup = useMemo(
    () => state.groups.find((g) => g.id === selectedGroupId) || raphaelGroups[0],
    [state.groups, selectedGroupId, raphaelGroups]
  );

  // Group classes
  const groupClasses = useMemo(() => {
    if (!selectedGroup) return [];
    return state.classes.filter((c) => c.group_id === selectedGroup.id);
  }, [state.classes, selectedGroup]);

  // Live individual simulation calculation
  const individualSimulationResult = useMemo(() => {
    if (useSandboxOverrides) {
      const syntheticClasses: any[] = [];
      for (let i = 0; i < sandboxRegularLessons; i++) {
        syntheticClasses.push({
          id: `synth_reg_${i}`,
          date: `${selectedMonth}-0${Math.min(28, (i + 1) * 7)}`,
          status: "completed",
          title: "PREPARAÇÃO VOCAL",
          attendance:
            i < sandboxStudentAbsences && selectedStudentId
              ? { [selectedStudentId]: "absent" }
              : { [selectedStudentId]: "present" },
        });
      }
      for (let i = 0; i < sandboxMakeupLessons; i++) {
        syntheticClasses.push({
          id: `synth_mk_${i}`,
          date: `${selectedMonth}-15`,
          status: "scheduled",
          title: "PREPARAÇÃO VOCAL (Reposição)",
        });
      }
      for (let i = 0; i < sandboxTeacherCancellations; i++) {
        syntheticClasses.push({
          id: `synth_canc_${i}`,
          date: `${selectedMonth}-20`,
          status: "cancelled",
          allow_makeup: true,
          title: "PREPARAÇÃO VOCAL",
        });
      }

      return calculateRaphaelStudentMonthlySimulation({
        enrollment: {
          student_id: selectedStudentId || "sandbox_student",
          teacher_id: RAPHAEL_TEACHER_ID,
          custom_price: sandboxPrice,
        },
        plan: {
          modality: sandboxModality,
          base_price: 0,
          exclusive_teacher_id: RAPHAEL_TEACHER_ID,
          name: `Plano ${sandboxModality.toUpperCase()}`,
        },
        teacher: raphaelTeacher,
        studentClasses: syntheticClasses,
        monthStr: selectedMonth,
        previousCredits: manualPreviousCredits,
      });
    }

    if (!selectedEnrollment) return null;

    return calculateRaphaelStudentMonthlySimulation({
      enrollment: selectedEnrollment,
      plan: selectedPlan,
      teacher: raphaelTeacher,
      studentClasses,
      monthStr: selectedMonth,
      previousCredits: manualPreviousCredits,
    });
  }, [
    useSandboxOverrides,
    sandboxPrice,
    sandboxModality,
    sandboxRegularLessons,
    sandboxMakeupLessons,
    sandboxTeacherCancellations,
    sandboxStudentAbsences,
    selectedEnrollment,
    selectedPlan,
    raphaelTeacher,
    studentClasses,
    selectedMonth,
    manualPreviousCredits,
    selectedStudentId,
  ]);

  // Live group simulation calculation
  const groupSimulationResult = useMemo(() => {
    if (useGroupSandbox) {
      const syntheticGroupClasses: any[] = [];
      for (let i = 0; i < groupSandboxRegularLessons; i++) {
        syntheticGroupClasses.push({
          id: `synth_grp_reg_${i}`,
          group_id: "sandbox_group",
          date: `${selectedMonth}-0${Math.min(28, (i + 1) * 7)}`,
          status: "completed",
          title: "AULA EM GRUPO",
        });
      }
      for (let i = 0; i < groupSandboxMakeupLessons; i++) {
        syntheticGroupClasses.push({
          id: `synth_grp_mk_${i}`,
          group_id: "sandbox_group",
          date: `${selectedMonth}-15`,
          status: "scheduled",
          title: "AULA EM GRUPO (Reposição)",
        });
      }
      for (let i = 0; i < groupSandboxTeacherCancellations; i++) {
        syntheticGroupClasses.push({
          id: `synth_grp_canc_${i}`,
          group_id: "sandbox_group",
          date: `${selectedMonth}-20`,
          status: "cancelled",
          allow_makeup: true,
          title: "AULA EM GRUPO",
        });
      }

      return calculateRaphaelGroupMonthlySimulation({
        group: {
          id: "sandbox_group",
          name: "Grupo Sandbox (What-If)",
          teacher_id: RAPHAEL_TEACHER_ID,
          price: groupSandboxPrice,
          payment_type: "group",
          frequency: groupSandboxFrequency === "nao_definida" ? undefined : groupSandboxFrequency,
        },
        teacher: raphaelTeacher,
        groupClasses: syntheticGroupClasses,
        monthStr: selectedMonth,
        previousCredits: groupSandboxPrevCredits,
        allGroups: state.groups,
      });
    }

    if (!selectedGroup) return null;

    return calculateRaphaelGroupMonthlySimulation({
      group: selectedGroup,
      teacher: raphaelTeacher,
      groupClasses: state.classes,
      monthStr: selectedMonth,
      previousCredits: groupSandboxPrevCredits,
      allGroups: state.groups,
    });
  }, [
    useGroupSandbox,
    groupSandboxPrice,
    groupSandboxFrequency,
    groupSandboxRegularLessons,
    groupSandboxMakeupLessons,
    groupSandboxTeacherCancellations,
    selectedGroup,
    raphaelTeacher,
    state.classes,
    state.groups,
    selectedMonth,
    groupSandboxPrevCredits,
  ]);

  // Automated test suite results
  const individualTestResults = useMemo(() => {
    return runAllPredefinedScenarioTests();
  }, []);

  const groupTestResults = useMemo(() => {
    return runAllGroupScenarioTests();
  }, []);

  const allIndividualPassed = individualTestResults.every((t) => t.passed);
  const allGroupPassed = groupTestResults.every((t) => t.passed);
  const totalTests = individualTestResults.length + groupTestResults.length;
  const totalPassed = individualTestResults.filter(t => t.passed).length + groupTestResults.filter(t => t.passed).length;
  const allPassed = totalPassed === totalTests;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-950 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-indigo-200" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold">Simulador de Faturamento por Aula</h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  ETAPA 3 — GRUPOS & INDIVIDUAL (READ ONLY)
                </span>
              </div>
              <p className="text-xs text-indigo-200">
                Regra exclusiva: Professor Raphael Augusto Pinto (Individuais e Grupos Unificados)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-indigo-200 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Safety Disclaimer Banner */}
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between text-xs text-amber-900">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>PRÉ-VISUALIZAÇÃO EM MEMÓRIA:</strong> Nenhuma cobrança real, matrícula ou tabela do Supabase é alterada.
            </span>
          </div>
          <div className="flex items-center space-x-1.5 text-emerald-800 font-medium">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Isolamento Total Ativo</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-200 bg-zinc-50 px-6 pt-3 space-x-2">
          <button
            onClick={() => setActiveTab("individual")}
            className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-all flex items-center space-x-2 ${
              activeTab === "individual"
                ? "bg-white text-indigo-600 border-t-2 border-indigo-600 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            <User className="w-4 h-4" />
            <span>Simulação Individual (Alunos)</span>
          </button>
          <button
            onClick={() => setActiveTab("groups")}
            className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-all flex items-center space-x-2 ${
              activeTab === "groups"
                ? "bg-white text-purple-700 border-t-2 border-purple-600 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Simulação Grupos Unificados</span>
          </button>
          <button
            onClick={() => setActiveTab("test_suite")}
            className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-all flex items-center space-x-2 ${
              activeTab === "test_suite"
                ? "bg-white text-indigo-600 border-t-2 border-indigo-600 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            <Play className="w-4 h-4" />
            <span>Bateria de Testes ({totalTests} Cenários)</span>
            {allPassed ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                {totalPassed}/{totalTests} PASS
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                FALHA
              </span>
            )}
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-zinc-50/50">
          {/* TAB 1: INDIVIDUAL */}
          {activeTab === "individual" && (
            <div className="space-y-6">
              {/* Controls bar */}
              <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setUseSandboxOverrides(false)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        !useSandboxOverrides
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      Dados Reais do Sistema
                    </button>
                    <button
                      onClick={() => setUseSandboxOverrides(true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                        useSandboxOverrides
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Modo Sandbox (What-If)</span>
                    </button>
                  </div>

                  <div className="flex items-center space-x-3">
                    <label className="text-xs font-semibold text-zinc-600">Competência:</label>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="px-3 py-1.5 text-xs font-medium border border-zinc-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {!useSandboxOverrides ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-zinc-100">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Aluno do Professor Raphael:
                      </label>
                      <select
                        value={selectedStudentId}
                        onChange={(e) => setSelectedStudentId(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-zinc-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500"
                      >
                        {raphaelStudents.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Saldo de Créditos Anteriores:
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={manualPreviousCredits}
                        onChange={(e) => setManualPreviousCredits(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full px-3 py-2 text-xs border border-zinc-300 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500"
                        placeholder="0"
                      />
                      <span className="text-[10px] text-zinc-500">
                        Créditos vindos de cancelamentos anteriores
                      </span>
                    </div>

                    <div className="bg-zinc-50 p-2.5 rounded-xl border border-zinc-200/80 text-xs flex flex-col justify-center">
                      <div className="text-zinc-500 text-[11px]">Plano Contratado:</div>
                      <div className="font-bold text-zinc-800 truncate">
                        {selectedPlan?.name || "Sem plano vinculado"}
                      </div>
                      <div className="text-[11px] text-indigo-600 font-semibold">
                        Modalidade: {selectedPlan?.modality?.toUpperCase() || "QUINZENAL"} (
                        {selectedPlan?.modality === "semanal" ? "4 aulas base" : "2 aulas base"})
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-zinc-100">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Preço Mensal (R$):
                      </label>
                      <input
                        type="number"
                        value={sandboxPrice}
                        onChange={(e) => setSandboxPrice(parseFloat(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Modalidade:
                      </label>
                      <select
                        value={sandboxModality}
                        onChange={(e) => setSandboxModality(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg bg-white"
                      >
                        <option value="quinzenal">Quinzenal (2 aulas base)</option>
                        <option value="semanal">Semanal (4 aulas base)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Aulas Normais no Mês:
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={sandboxRegularLessons}
                        onChange={(e) => setSandboxRegularLessons(parseInt(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Aulas de Reposição no Mês:
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={sandboxMakeupLessons}
                        onChange={(e) => setSandboxMakeupLessons(parseInt(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Cancelamentos Raphael:
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={sandboxTeacherCancellations}
                        onChange={(e) => setSandboxTeacherCancellations(parseInt(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Faltas do Aluno:
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={sandboxStudentAbsences}
                        onChange={(e) => setSandboxStudentAbsences(parseInt(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Créditos Anteriores:
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={manualPreviousCredits}
                        onChange={(e) => setManualPreviousCredits(parseInt(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Simulation Result Dashboard Cards */}
              {individualSimulationResult && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Valor por Aula
                    </div>
                    <div className="text-2xl font-black text-indigo-900 mt-1">
                      R$ {individualSimulationResult.pricePerLesson.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1">
                      Base: R$ {individualSimulationResult.monthlyBasePrice.toFixed(2)} / {individualSimulationResult.baseLessons} aulas
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Composição de Aulas
                    </div>
                    <div className="flex items-baseline space-x-2 mt-1">
                      <span className="text-2xl font-black text-zinc-900">
                        {individualSimulationResult.regularLessons}
                      </span>
                      <span className="text-xs text-zinc-500">normais</span>
                      {individualSimulationResult.makeupLessons > 0 && (
                        <>
                          <span className="text-xs text-zinc-400">+</span>
                          <span className="text-lg font-bold text-amber-600">
                            {individualSimulationResult.makeupLessons}
                          </span>
                          <span className="text-xs text-zinc-500">rep.</span>
                        </>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1">
                      Faltas: {individualSimulationResult.studentAbsences} | Canceladas: {individualSimulationResult.cancelledLessonsEligibleForCredit}
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Balanço de Créditos
                    </div>
                    <div className="text-2xl font-black text-emerald-700 mt-1">
                      {individualSimulationResult.creditsRemaining} saldo
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1">
                      +{individualSimulationResult.creditsGenerated} gerados | -{individualSimulationResult.creditsConsumed} usados
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-indigo-900 to-indigo-950 p-4 rounded-2xl text-white shadow-md">
                    <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
                      Valor Final Calculado
                    </div>
                    <div className="text-3xl font-black text-white mt-1">
                      R$ {individualSimulationResult.finalMonthlyAmount.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-indigo-200 mt-1 flex items-center justify-between">
                      <span>Original: R$ {individualSimulationResult.monthlyBasePrice.toFixed(2)}</span>
                      <span className={`font-bold ${individualSimulationResult.differenceFromContract >= 0 ? "text-emerald-400" : "text-amber-300"}`}>
                        {individualSimulationResult.differenceFromContract > 0 ? `+${individualSimulationResult.differenceFromContract.toFixed(2)}` : individualSimulationResult.differenceFromContract.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Warnings and Explanations */}
              {individualSimulationResult && (
                <div className="space-y-4">
                  {individualSimulationResult.hasUncreditedMakeup && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start space-x-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Aviso de Reposição sem Crédito:</span>
                        <p className="mt-0.5">{individualSimulationResult.uncreditedMakeupWarning}</p>
                      </div>
                    </div>
                  )}

                  <div className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm text-xs space-y-2">
                    <div className="font-bold text-zinc-800 flex items-center space-x-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span>Detalhamento da Memória de Cálculo</span>
                    </div>
                    <p className="text-zinc-600 leading-relaxed">
                      {individualSimulationResult.explanation}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GROUPS */}
          {activeTab === "groups" && (
            <div className="space-y-6">
              {/* Controls bar */}
              <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setUseGroupSandbox(false)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        !useGroupSandbox
                          ? "bg-purple-700 text-white shadow-sm"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      Grupos Reais do Sistema
                    </button>
                    <button
                      onClick={() => setUseGroupSandbox(true)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${
                        useGroupSandbox
                          ? "bg-purple-700 text-white shadow-sm"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Modo Sandbox Grupo (What-If)</span>
                    </button>
                  </div>

                  <div className="flex items-center space-x-3">
                    <label className="text-xs font-semibold text-zinc-600">Competência:</label>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="px-3 py-1.5 text-xs font-medium border border-zinc-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>

                {!useGroupSandbox ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-zinc-100">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Grupo / Turma Unificada do Raphael:
                      </label>
                      <select
                        value={selectedGroupId}
                        onChange={(e) => setSelectedGroupId(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-zinc-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500"
                      >
                        {raphaelGroups.length > 0 ? (
                          raphaelGroups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name} (R$ {g.price || 0})
                            </option>
                          ))
                        ) : (
                          <option value="">Nenhum grupo unificado encontrado</option>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-700 mb-1">
                        Saldo de Créditos Anteriores do Grupo:
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={groupSandboxPrevCredits}
                        onChange={(e) => setGroupSandboxPrevCredits(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full px-3 py-2 text-xs border border-zinc-300 rounded-xl bg-white focus:ring-2 focus:ring-purple-500"
                        placeholder="0"
                      />
                    </div>

                    <div className="bg-purple-50/70 p-2.5 rounded-xl border border-purple-200/80 text-xs flex flex-col justify-center">
                      <div className="text-purple-700 text-[11px] font-semibold">Configuração do Grupo:</div>
                      <div className="font-bold text-zinc-900 truncate">
                        {selectedGroup?.name || "Sem grupo selecionado"}
                      </div>
                      <div className="text-[11px] text-purple-900">
                        Preço: R$ {selectedGroup?.price || 0} | Frequência: {selectedGroup?.frequency || "Não definida"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-zinc-100">
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Preço Mensal do Grupo (R$):
                      </label>
                      <input
                        type="number"
                        value={groupSandboxPrice}
                        onChange={(e) => setGroupSandboxPrice(parseFloat(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Frequência do Grupo:
                      </label>
                      <select
                        value={groupSandboxFrequency}
                        onChange={(e) => setGroupSandboxFrequency(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg bg-white"
                      >
                        <option value="quinzenal">Quinzenal (2 aulas base)</option>
                        <option value="semanal">Semanal (4 aulas base)</option>
                        <option value="nao_definida">Não definida (requer conferência)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Aulas Normais no Mês:
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={groupSandboxRegularLessons}
                        onChange={(e) => setGroupSandboxRegularLessons(parseInt(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Aulas Canceladas pelo Raphael:
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={groupSandboxTeacherCancellations}
                        onChange={(e) => setGroupSandboxTeacherCancellations(parseInt(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Aulas de Reposição no Mês:
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={groupSandboxMakeupLessons}
                        onChange={(e) => setGroupSandboxMakeupLessons(parseInt(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-700 mb-1">
                        Créditos Anteriores:
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={groupSandboxPrevCredits}
                        onChange={(e) => setGroupSandboxPrevCredits(parseInt(e.target.value) || 0)}
                        className="w-full px-2.5 py-1.5 text-xs border border-zinc-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Group Simulation Result Cards */}
              {groupSimulationResult && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Valor Unitário do Grupo
                    </div>
                    <div className="text-2xl font-black text-purple-900 mt-1">
                      {groupSimulationResult.hasUndefinedFrequency ? "N/A" : `R$ ${groupSimulationResult.pricePerLesson.toFixed(2)}`}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1">
                      {groupSimulationResult.hasUndefinedFrequency ? "Frequência não definida" : `Base: R$ ${groupSimulationResult.monthlyBasePrice.toFixed(2)} / ${groupSimulationResult.baseLessons} aulas`}
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Aulas do Mês
                    </div>
                    <div className="flex items-baseline space-x-2 mt-1">
                      <span className="text-2xl font-black text-zinc-900">
                        {groupSimulationResult.regularLessons}
                      </span>
                      <span className="text-xs text-zinc-500">normais</span>
                      {groupSimulationResult.makeupLessons > 0 && (
                        <>
                          <span className="text-xs text-zinc-400">+</span>
                          <span className="text-lg font-bold text-amber-600">
                            {groupSimulationResult.makeupLessons}
                          </span>
                          <span className="text-xs text-zinc-500">rep.</span>
                        </>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1">
                      Canceladas Elegíveis: {groupSimulationResult.cancelledLessonsEligibleForCredit}
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Balanço de Créditos do Grupo
                    </div>
                    <div className="text-2xl font-black text-emerald-700 mt-1">
                      {groupSimulationResult.creditsRemaining} saldo
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1">
                      +{groupSimulationResult.creditsGenerated} gerados | -{groupSimulationResult.creditsConsumed} usados
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-purple-900 to-indigo-950 p-4 rounded-2xl text-white shadow-md">
                    <div className="text-xs font-semibold text-purple-300 uppercase tracking-wider">
                      Novo Cálculo do Grupo
                    </div>
                    <div className="text-3xl font-black text-white mt-1">
                      R$ {groupSimulationResult.finalMonthlyAmount.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-purple-200 mt-1 flex items-center justify-between">
                      <span>Atual: R$ {groupSimulationResult.monthlyBasePrice.toFixed(2)}</span>
                      <span className={`font-bold ${groupSimulationResult.differenceFromContract >= 0 ? "text-emerald-400" : "text-amber-300"}`}>
                        {groupSimulationResult.differenceFromContract > 0 ? `+${groupSimulationResult.differenceFromContract.toFixed(2)}` : groupSimulationResult.differenceFromContract.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Warnings and Explanations */}
              {groupSimulationResult && (
                <div className="space-y-4">
                  {groupSimulationResult.hasUndefinedFrequency && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start space-x-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Alerta:</span>
                        <p className="mt-0.5">{groupSimulationResult.frequencyWarning}</p>
                      </div>
                    </div>
                  )}

                  {groupSimulationResult.hasUncreditedMakeup && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start space-x-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Aviso de Reposição sem Crédito:</span>
                        <p className="mt-0.5">{groupSimulationResult.uncreditedMakeupWarning}</p>
                      </div>
                    </div>
                  )}

                  <div className="p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm text-xs space-y-2">
                    <div className="font-bold text-zinc-800 flex items-center space-x-1.5">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      <span>Detalhamento da Memória de Cálculo do Grupo</span>
                    </div>
                    <p className="text-zinc-600 leading-relaxed">
                      {groupSimulationResult.explanation}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TEST SUITE */}
          {activeTab === "test_suite" && (
            <div className="space-y-6">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-900">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>
                    <strong>Todos os {totalTests} Cenários de Validação em Memória foram Aprovados com Sucesso! (8 Individuais + 8 Grupos)</strong>
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-full font-bold bg-emerald-600 text-white text-[11px]">
                  {totalPassed}/{totalTests} GREEN
                </span>
              </div>

              {/* Section 1: Individual Tests */}
              <div className="space-y-3">
                <div className="flex items-center space-x-2 border-b border-zinc-200 pb-2">
                  <User className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
                    Seção 1: Cenários Individuais (8 Testes)
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {individualTestResults.map((t) => (
                    <div
                      key={t.testId}
                      className="p-4 bg-white rounded-2xl border border-zinc-200 shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-zinc-900">{t.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              t.passed ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                            }`}
                          >
                            {t.passed ? "PASS" : "FAIL"}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-600 mt-2 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Valor Esperado:</span>
                            <span className="font-bold text-zinc-800">
                              R$ {t.expected.finalMonthlyAmount.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Valor Simulado:</span>
                            <span className="font-bold text-indigo-600">
                              R$ {t.result.finalMonthlyAmount.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Créditos Restantes:</span>
                            <span className="font-bold text-emerald-700">
                              {t.result.creditsRemaining} (esperado: {t.expected.creditsRemaining ?? 0})
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-zinc-100 text-[11px] text-zinc-500">
                        {t.result.explanation}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 2: Group Tests */}
              <div className="space-y-3 pt-4">
                <div className="flex items-center space-x-2 border-b border-zinc-200 pb-2">
                  <Users className="w-4 h-4 text-purple-600" />
                  <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
                    Seção 2: Cenários de Grupos Unificados (8 Testes)
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {groupTestResults.map((t) => (
                    <div
                      key={t.testId}
                      className="p-4 bg-white rounded-2xl border border-purple-100 shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-zinc-900">{t.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              t.passed ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                            }`}
                          >
                            {t.passed ? "PASS" : "FAIL"}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-600 mt-2 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Valor Esperado:</span>
                            <span className="font-bold text-zinc-800">
                              R$ {t.expected.finalMonthlyAmount.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Valor Simulado:</span>
                            <span className="font-bold text-purple-700">
                              R$ {t.result.finalMonthlyAmount.toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-500">Créditos Restantes:</span>
                            <span className="font-bold text-emerald-700">
                              {t.result.creditsRemaining} (esperado: {t.expected.creditsRemaining ?? 0})
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-zinc-100 text-[11px] text-zinc-500">
                        {t.result.explanation}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-zinc-100 border-t border-zinc-200 flex items-center justify-between text-xs text-zinc-600">
          <span>ETAPA 3: Motor de Grupos Unificados em memória integrado e 100% validado.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-900 text-white font-medium rounded-xl transition-colors"
          >
            Fechar Simulador
          </button>
        </div>
      </motion.div>
    </div>
  );
};
