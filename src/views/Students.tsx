import React, { useState } from "react";
import { useAppStore, Student } from "../store";
import { getSessionStudentIds, getGroupForSession } from "./Classes";
import { isGroupClass, isIndividualClass, doesClassBelongToGroup, getSessionGroupId } from "../utils/groupMatch";
import { Plus, Search, Edit2, Trash2, X, FileText, Calendar as CalendarIcon, Clock, AlertCircle, Ban, Phone, CheckCircle2, AlertTriangle, RefreshCw, Sparkles, Check, ShieldAlert, MessageCircle, User, Users } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { normalizePhoneNumber, getWhatsAppPhoneDetails } from "../utils/phone";

const formatCPF = (value: string) => {
  const digits = value.replace(/\D/g, "");
  const truncated = digits.slice(0, 11);
  if (truncated.length <= 3) return truncated;
  if (truncated.length <= 6) return `${truncated.slice(0, 3)}.${truncated.slice(3)}`;
  if (truncated.length <= 9) return `${truncated.slice(0, 3)}.${truncated.slice(3, 6)}.${truncated.slice(6)}`;
  return `${truncated.slice(0, 3)}.${truncated.slice(3, 6)}.${truncated.slice(6, 9)}-${truncated.slice(9)}`;
};

export const Students: React.FC = () => {
  const { state, addStudent, updateStudent, deleteStudent, normalizeAllStudentPhones, currentUserProfile } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);
  const [selectedStudentForReports, setSelectedStudentForReports] = useState<Student | null>(null);
  const [reportFilterTeacher, setReportFilterTeacher] = useState<string>("all");
  const [reportContextTab, setReportContextTab] = useState<string>("individual");

  // States for Phone Normalization & Report Modal
  const [isPhoneModalOpen, setIsPhoneModalOpen] = useState(false);
  const [phoneReportFilter, setPhoneReportFilter] = useState<"invalid" | "normalized" | "already_e164" | "all">("invalid");
  const [isRunningNormalization, setIsRunningNormalization] = useState(false);
  const [normalizationSuccessMsg, setNormalizationSuccessMsg] = useState<string | null>(null);
  const [editingInlinePhoneId, setEditingInlinePhoneId] = useState<string | null>(null);
  const [inlinePhoneText, setInlinePhoneText] = useState<string>("");

  const handleSaveInlinePhone = async (studentId: string, name: string) => {
    if (!inlinePhoneText.trim()) return;
    try {
      const res = normalizePhoneNumber(inlinePhoneText);
      const finalVal = res.normalized || inlinePhoneText.trim();
      await updateStudent(studentId, { phone: finalVal });
      setNormalizationSuccessMsg(`✓ Telefone de "${name}" atualizado para ${finalVal}`);
      setEditingInlinePhoneId(null);
      setInlinePhoneText("");
    } catch (e) {
      console.error(e);
    }
  };

  // States for student ineligibility justification modal
  const [isJustificationModalOpen, setIsJustificationModalOpen] = useState(false);
  const [justificationStudent, setJustificationStudent] = useState<Student | null>(null);
  const [justificationText, setJustificationText] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    cpf: "",
    instrument: "",
    status: "active" as "active" | "inactive",
    enrollment_date: new Date().toISOString().split("T")[0],
    birth_date: "",
    not_eligible: false,
    ineligibility_reason: "",
  });

  // Compute phone normalization report items for all students
  const phoneReportData = React.useMemo(() => {
    return state.students.map((student) => {
      const res = normalizePhoneNumber(student.phone);
      return {
        student,
        originalPhone: student.phone || "",
        normalizedPhone: res.normalized,
        status: res.status, // "already_e164" | "normalized" | "empty" | "invalid"
        error: res.error,
      };
    });
  }, [state.students]);

  const phoneStats = React.useMemo(() => {
    const total = phoneReportData.length;
    const alreadyE164 = phoneReportData.filter((r) => r.status === "already_e164").length;
    const normalizable = phoneReportData.filter((r) => r.status === "normalized").length;
    const invalidOrEmpty = phoneReportData.filter((r) => r.status === "invalid" || r.status === "empty").length;
    return { total, alreadyE164, normalizable, invalidOrEmpty };
  }, [phoneReportData]);

  const filteredPhoneReport = React.useMemo(() => {
    if (phoneReportFilter === "all") return phoneReportData;
    if (phoneReportFilter === "invalid") return phoneReportData.filter(r => r.status === "invalid" || r.status === "empty");
    if (phoneReportFilter === "normalized") return phoneReportData.filter(r => r.status === "normalized");
    if (phoneReportFilter === "already_e164") return phoneReportData.filter(r => r.status === "already_e164");
    return phoneReportData;
  }, [phoneReportData, phoneReportFilter]);

  const handleExecuteNormalization = async () => {
    setIsRunningNormalization(true);
    setNormalizationSuccessMsg(null);
    try {
      const res = await normalizeAllStudentPhones();
      setNormalizationSuccessMsg(`✓ Sucesso! ${res.updatedCount} telefones foram normalizados e salvos no padrão E.164 (+55...).`);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRunningNormalization(false);
    }
  };

  // Base list of students depending on the user's role
  const baseStudents = React.useMemo(() => {
    if (currentUserProfile?.role === "teacher" && currentUserProfile.teacher_id) {
      const teacherId = currentUserProfile.teacher_id;
      const enrolledStudentIds = state.enrollments
        .filter(e => e.teacher_id === teacherId)
        .map(e => e.student_id);

      const groupTeacherIds = state.groups
        .filter(g => g.teacher_id === teacherId)
        .map(g => g.id);
      const groupStudentIds = state.enrollments
        .filter(e => e.group_id && groupTeacherIds.includes(e.group_id))
        .map(e => e.student_id);

      const classStudentIds = state.classes
        .filter(c => c.teacher_id === teacherId)
        .flatMap(c => c.student_ids || []);

      const allMyStudentIds = new Set([
        ...enrolledStudentIds,
        ...groupStudentIds,
        ...classStudentIds
      ]);

      return state.students.filter(s => allMyStudentIds.has(s.id));
    }
    return state.students;
  }, [state.students, state.enrollments, state.classes, state.groups, currentUserProfile]);

  const filteredStudents = baseStudents.filter((s) => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    const digits = term.replace(/\D/g, "");

    const nameMatch = (s.name || "").toLowerCase().includes(term);
    const instrumentMatch = (s.instrument || "").toLowerCase().includes(term);
    const emailMatch = (s.email || "").toLowerCase().includes(term);
    const cpfMatch = digits.length > 0 && (s.cpf || "").replace(/\D/g, "").includes(digits);
    const phoneMatch = (s.phone || "").toLowerCase().includes(term) ||
      (digits.length > 0 && (s.phone || "").replace(/\D/g, "").includes(digits));

    return nameMatch || instrumentMatch || emailMatch || cpfMatch || phoneMatch;
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanCpf = formData.cpf.replace(/\D/g, "");
    if (cleanCpf) {
      const duplicate = state.students.find(s => 
        s.id !== editingStudent?.id && 
        (s.cpf || "").replace(/\D/g, "") === cleanCpf
      );
      if (duplicate) {
        setErrorMsg(`Este CPF já possui cadastro (Aluno: "${duplicate.name}").`);
        return;
      }
    }

    if (formData.not_eligible && !formData.ineligibility_reason.trim()) {
      setErrorMsg("Por favor, preencha a justificativa para marcar o aluno como não elegível.");
      return;
    }

    // Normalize phone before saving
    const phoneRes = normalizePhoneNumber(formData.phone);
    const finalPhone = phoneRes.normalized || formData.phone;
    const dataToSave = { ...formData, phone: finalPhone };

    if (editingStudent) {
      updateStudent(editingStudent.id, dataToSave);
    } else {
      addStudent(dataToSave);
    }
    closeModal();
  };

  const openModal = (student?: Student) => {
    setErrorMsg(null);
    if (student) {
      setEditingStudent(student);
      setFormData({
        name: student.name || "",
        email: student.email || "",
        phone: student.phone || "",
        cpf: student.cpf || "",
        instrument: student.instrument || "",
        status: student.status || "active",
        enrollment_date: student.enrollment_date || new Date().toISOString().split("T")[0],
        birth_date: student.birth_date || "",
        not_eligible: student.not_eligible || false,
        ineligibility_reason: student.ineligibility_reason || "",
      });
    } else {
      setEditingStudent(null);
      setFormData({
        name: "",
        email: "",
        phone: "",
        cpf: "",
        instrument: "",
        status: "active",
        enrollment_date: new Date().toISOString().split("T")[0],
        birth_date: "",
        not_eligible: false,
        ineligibility_reason: "",
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingStudent(null);
    setErrorMsg(null);
  };

  const openReportsModal = (student: Student) => {
    setSelectedStudentForReports(student);
    setReportFilterTeacher("all");

    // Automatically select default tab (individual vs group)
    const sId = student.id;
    const hasIndivEnrollment = state.enrollments.some(
      e => e.student_id === sId && (!e.group_id || e.group_id.trim() === '')
    );
    const hasIndivClasses = state.classes.some(
      c => isIndividualClass(c, state) && getSessionStudentIds(c, state).includes(sId)
    );

    if (hasIndivEnrollment || hasIndivClasses) {
      setReportContextTab("individual");
    } else {
      const firstGrpEnrollment = state.enrollments.find(
        e => e.student_id === sId && e.group_id && e.group_id.trim() !== ''
      );
      if (firstGrpEnrollment?.group_id) {
        setReportContextTab(`group_${firstGrpEnrollment.group_id}`);
      } else {
        const firstGrpClass = state.classes.find(
          c => isGroupClass(c, state) && getSessionStudentIds(c, state).includes(sId)
        );
        const gId = firstGrpClass ? getSessionGroupId(firstGrpClass, state) : null;
        if (gId) {
          setReportContextTab(`group_${gId}`);
        } else {
          setReportContextTab("individual");
        }
      }
    }

    setIsReportsModalOpen(true);
  };

  const closeReportsModal = () => {
    setIsReportsModalOpen(false);
    setSelectedStudentForReports(null);
    setReportFilterTeacher("all");
    setReportContextTab("individual");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Alunos
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Gerencie os alunos da escola.
          </p>
        </div>
        {currentUserProfile?.role === "super_admin" && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsPhoneModalOpen(true)}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
            >
              <Phone className="w-4 h-4 mr-2 text-indigo-600" />
              Normalização & Relatório de Telefones
              {phoneStats.normalizable > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-indigo-600 text-white rounded-full">
                  {phoneStats.normalizable}
                </span>
              )}
            </button>
            <button
              onClick={() => openModal()}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Aluno
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100">
          <div className="relative max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-zinc-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por nome, telefone, e-mail, instrumento..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl leading-5 bg-zinc-50 placeholder-zinc-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
            />
          </div>
        </div>

        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50 sticky top-0 z-10 shadow-sm">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Nome
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Contato
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Instrumento
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Status
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student) => (
                  <tr
                    key={student.id}
                    className="hover:bg-zinc-50 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                          {student.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-zinc-900 flex items-center flex-wrap gap-2">
                            <span>{student.name}</span>
                            {student.not_eligible && (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200 cursor-help"
                                title={`Não Elegível: ${student.ineligibility_reason || 'Sem justificativa preenchida'}`}
                              >
                                <Ban className="w-3 h-3 mr-1" />
                                Não Elegível
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-zinc-500">
                            Matriculado em{" "}
                            {new Date(
                              student.enrollment_date,
                            ).toLocaleDateString("pt-BR")}
                          </div>
                          {student.birth_date && (
                            <div className="text-xs text-zinc-400 mt-0.5">
                              Nasc.: {new Date(student.birth_date + "T00:00:00").toLocaleDateString("pt-BR")}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-zinc-900">
                        {student.email}
                      </div>
                      <div className="text-sm text-zinc-500 flex items-center space-x-1.5">
                        <span>{student.phone || "—"}</span>
                        {student.phone && (() => {
                          const details = getWhatsAppPhoneDetails(student.phone);
                          if (!details) return null;
                          return (
                            <a
                              href={details.primaryUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 p-1 rounded-md transition-colors"
                              title={`Abrir WhatsApp (${details.primaryFormatted})`}
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                          );
                        })()}
                      </div>
                      {student.cpf && (
                        <div className="text-xs text-zinc-400 mt-0.5">
                          CPF: {student.cpf}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full bg-zinc-100 text-zinc-800">
                        {student.instrument}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full ${
                          student.status === "active"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        }`}
                      >
                        {student.status === "active" ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {currentUserProfile?.role !== "teacher" && (
                        <button
                          onClick={() => {
                            if (student.not_eligible) {
                              if (confirm(`Tornar o aluno "${student.name}" elegível novamente?`)) {
                                updateStudent(student.id, { not_eligible: false, ineligibility_reason: "" });
                              }
                            } else {
                              setJustificationStudent(student);
                              setJustificationText("");
                              setIsJustificationModalOpen(true);
                            }
                          }}
                          className={`mr-4 transition-colors ${
                            student.not_eligible
                              ? "text-rose-600 hover:text-rose-900"
                              : "text-zinc-400 hover:text-rose-600"
                          }`}
                          title={student.not_eligible ? "Tornar Elegível" : "Definir como Não Elegível"}
                        >
                          <Ban className="w-4 h-4 inline" />
                        </button>
                      )}
                      <button
                        onClick={() => openReportsModal(student)}
                        className="text-emerald-600 hover:text-emerald-900 mr-4"
                        title="Ver Relatórios"
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                      {currentUserProfile?.role === "super_admin" && (
                        <>
                          <button
                            onClick={() => openModal(student)}
                            className="text-indigo-600 hover:text-indigo-900 mr-4"
                            title="Editar Aluno"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteStudent(student.id)}
                            className="text-rose-600 hover:text-rose-900"
                            title="Excluir Aluno"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-zinc-500 text-sm"
                  >
                    Nenhum aluno encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={closeModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative z-10"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-zinc-900">
                  {editingStudent ? "Editar Aluno" : "Novo Aluno"}
                </h3>
                <button
                  onClick={closeModal}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {errorMsg && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{errorMsg}</span>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Nome Completo
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Telefone (E.164)
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      placeholder="+55 18 99733-6187"
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                    />
                    <p className="text-[10px] text-zinc-400 mt-1">
                      Salvo em formato E.164 (+55...)
                    </p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Instrumento Principal
                  </label>
                  <input
                    type="text"
                    value={formData.instrument}
                    onChange={(e) =>
                      setFormData({ ...formData, instrument: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="Ex: Piano, Violão, Canto..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    CPF
                  </label>
                  <input
                    type="text"
                    value={formData.cpf}
                    onChange={(e) =>
                      setFormData({ ...formData, cpf: formatCPF(e.target.value) })
                    }
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Data de Nascimento
                  </label>
                  <input
                    type="date"
                    value={formData.birth_date}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        birth_date: e.target.value,
                      })
                    }
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Data de Matrícula
                    </label>
                    <input
                      type="date"
                      value={formData.enrollment_date}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          enrollment_date: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          status: e.target.value as "active" | "inactive",
                        })
                      }
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                    >
                      <option value="active">Ativo</option>
                      <option value="inactive">Inativo</option>
                    </select>
                  </div>
                </div>

                <div className="border-t border-zinc-100 pt-4 space-y-4">
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.not_eligible}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          not_eligible: e.target.checked,
                          // clear justification if unchecking
                          ineligibility_reason: e.target.checked ? formData.ineligibility_reason : "",
                        })
                      }
                      className="mt-1 w-4 h-4 rounded border-zinc-300 text-rose-600 focus:ring-rose-500"
                    />
                    <div>
                      <span className="text-sm font-semibold text-rose-700">Cliente não elegível</span>
                      <p className="text-xs text-zinc-500">Marcar este aluno como não elegível por qualquer razão impeditiva</p>
                    </div>
                  </label>

                  {formData.not_eligible && (
                    <div className="space-y-1">
                      <label className="block text-sm font-medium text-zinc-700">
                        Justificativa <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        required={formData.not_eligible}
                        rows={3}
                        placeholder="Insira o motivo / justificativa para este aluno não ser elegível..."
                        value={formData.ineligibility_reason}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            ineligibility_reason: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm bg-white"
                      />
                    </div>
                  )}
                </div>
                <div className="pt-4 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
                  >
                    Salvar
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reports Modal */}
      <AnimatePresence>
        {isReportsModalOpen && selectedStudentForReports && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={closeReportsModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 border-b border-zinc-100 bg-white shrink-0">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-900 flex items-center">
                      <FileText className="w-5 h-5 mr-2 text-emerald-600" />
                      Relatórios de Aulas por Modalidade
                    </h3>
                    <p className="text-sm text-zinc-500 mt-1">
                      Aluno: <span className="font-medium text-zinc-900">{selectedStudentForReports.name}</span>
                    </p>
                  </div>
                  <button
                    onClick={closeReportsModal}
                    className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Tabs de Contexto: Individual vs Grupo(s) para Isolamento Estrito */}
                {(() => {
                  const sId = selectedStudentForReports.id;
                  const isTeacherUser = currentUserProfile?.role === "teacher";
                  const currentTeacherId = isTeacherUser ? currentUserProfile?.teacher_id : null;

                  const hasIndivEnrollment = state.enrollments.some(
                    e => e.student_id === sId && (!e.group_id || e.group_id.trim() === '')
                  );
                  const hasIndivClasses = state.classes.some(
                    c => isIndividualClass(c, state) && getSessionStudentIds(c, state).includes(sId)
                  );
                  const hasIndividual = hasIndivEnrollment || hasIndivClasses;

                  const grpIds = new Set<string>();
                  state.enrollments.forEach(e => {
                    if (e.student_id === sId && e.group_id && e.group_id.trim() !== '') {
                      grpIds.add(e.group_id);
                    }
                  });
                  state.classes.forEach(c => {
                    if (getSessionStudentIds(c, state).includes(sId)) {
                      const gid = getSessionGroupId(c, state);
                      if (gid) grpIds.add(gid);
                    }
                  });

                  const studentGroups = Array.from(grpIds)
                    .map(gid => state.groups.find(g => g.id === gid))
                    .filter(Boolean) as any[];

                  const indivCount = state.classes.filter(c => {
                    if (!isIndividualClass(c, state)) return false;
                    if (!getSessionStudentIds(c, state).includes(sId)) return false;
                    const hasContent = (c.report && c.report.trim() !== "") || (c.vocal_routine && c.vocal_routine.trim() !== "");
                    if (!hasContent) return false;
                    if (isTeacherUser && currentTeacherId && c.teacher_id !== currentTeacherId) return false;
                    return true;
                  }).length;

                  const shouldShowTabs = hasIndividual && studentGroups.length > 0 || studentGroups.length > 1;

                  if (!shouldShowTabs) return null;

                  return (
                    <div className="flex items-center gap-2 border-b border-zinc-200 mt-4 pt-1 overflow-x-auto">
                      {hasIndividual && (
                        <button
                          type="button"
                          onClick={() => setReportContextTab("individual")}
                          className={`pb-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                            reportContextTab === "individual"
                              ? "border-emerald-600 text-emerald-700"
                              : "border-transparent text-zinc-500 hover:text-zinc-800"
                          }`}
                        >
                          <User className="w-3.5 h-3.5" />
                          <span>Relatório Individual</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 font-medium">
                            {indivCount}
                          </span>
                        </button>
                      )}
                      {studentGroups.map(grp => {
                        const isCurrent = reportContextTab === `group_${grp.id}`;
                        const grpCount = state.classes.filter(c => {
                          if (!doesClassBelongToGroup(c, grp.id, state)) return false;
                          if (!getSessionStudentIds(c, state).includes(sId)) return false;
                          const hasContent = (c.report && c.report.trim() !== "") || (c.vocal_routine && c.vocal_routine.trim() !== "");
                          if (!hasContent) return false;
                          if (isTeacherUser && currentTeacherId) {
                            const isClassTeacher = c.teacher_id === currentTeacherId;
                            const isGrpTeacher = grp.teacher_id === currentTeacherId;
                            if (!isClassTeacher && !isGrpTeacher) return false;
                          }
                          return true;
                        }).length;

                        return (
                          <button
                            key={grp.id}
                            type="button"
                            onClick={() => setReportContextTab(`group_${grp.id}`)}
                            className={`pb-2.5 px-3 text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                              isCurrent
                                ? "border-sky-600 text-sky-700"
                                : "border-transparent text-zinc-500 hover:text-zinc-800"
                            }`}
                          >
                            <Users className="w-3.5 h-3.5" />
                            <span>Grupo: {grp.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 text-zinc-600 font-medium">
                              {grpCount}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Filter Selector if Admin/SuperAdmin and multiple teachers exist in current context */}
                {(() => {
                  const isTeacherUser = currentUserProfile?.role === "teacher";
                  if (isTeacherUser) return null;

                  const sId = selectedStudentForReports.id;
                  const isIndividualTab = reportContextTab === "individual";
                  const targetGroupId = reportContextTab.startsWith("group_") ? reportContextTab.replace("group_", "") : null;

                  // Find classes for current tab
                  const contextClasses = state.classes.filter(c => {
                    const inClass = getSessionStudentIds(c, state).includes(sId);
                    if (!inClass) return false;
                    if (isIndividualTab && !isIndividualClass(c, state)) return false;
                    if (targetGroupId && !doesClassBelongToGroup(c, targetGroupId, state)) return false;
                    return (c.report && c.report.trim() !== "") || (c.vocal_routine && c.vocal_routine.trim() !== "");
                  });

                  const teacherMap = new Map<string, string>();
                  contextClasses.forEach(c => {
                    const t = state.teachers.find(tr => tr.id === c.teacher_id);
                    if (t) {
                      teacherMap.set(t.id, t.name);
                    }
                  });
                  const teachersList = Array.from(teacherMap.entries()).map(([id, name]) => ({ id, name }));

                  if (teachersList.length <= 1) return null;

                  return (
                    <div className="mt-3 pt-3 border-t border-zinc-100 flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-zinc-600">Filtrar por Professor:</span>
                      <select
                        value={reportFilterTeacher}
                        onChange={(e) => setReportFilterTeacher(e.target.value)}
                        className="text-xs bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-1.5 font-medium text-zinc-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="all">Todos os Professores ({contextClasses.length})</option>
                        {teachersList.map(t => (
                          <option key={t.id} value={t.id}>
                            Prof. {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })()}
              </div>
              
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-zinc-50/50">
                {(() => {
                  const sId = selectedStudentForReports.id;
                  const isTeacherUser = currentUserProfile?.role === "teacher";
                  const currentTeacherId = isTeacherUser ? currentUserProfile?.teacher_id : null;
                  const isIndividualTab = reportContextTab === "individual";
                  const targetGroupId = reportContextTab.startsWith("group_") ? reportContextTab.replace("group_", "") : null;
                  const targetGroup = targetGroupId ? state.groups.find(g => g.id === targetGroupId) : null;

                  // 1. Calculate Attendance Statistics STRICTLY for current context
                  const completedClassesInContext = state.classes.filter(c => {
                    if (c.status !== "completed") return false;
                    const inClass = getSessionStudentIds(c, state).includes(sId);
                    if (!inClass) return false;
                    if (isIndividualTab && !isIndividualClass(c, state)) return false;
                    if (targetGroupId && !doesClassBelongToGroup(c, targetGroupId, state)) return false;
                    return true;
                  });

                  const totalCompleted = completedClassesInContext.length;
                  const totalPresent = completedClassesInContext.filter(c => c.attendance?.[sId] === "present").length;
                  const totalAbsent = completedClassesInContext.filter(c => c.attendance?.[sId] === "absent").length;
                  const freqRate = totalCompleted > 0 ? Math.round((totalPresent / totalCompleted) * 100) : 100;

                  // 2. Filter classes with reports strictly for current context
                  const studentClassesWithReports = state.classes
                    .filter(c => {
                      const inClass = getSessionStudentIds(c, state).includes(sId);
                      if (!inClass) return false;

                      // Strict origin isolation:
                      if (isIndividualTab && !isIndividualClass(c, state)) return false;
                      if (targetGroupId && !doesClassBelongToGroup(c, targetGroupId, state)) return false;

                      const hasContent = (c.report && c.report.trim() !== "") || (c.vocal_routine && c.vocal_routine.trim() !== "");
                      if (!hasContent) return false;

                      // Strict separation for Teachers: show ONLY classes taught by this teacher
                      if (isTeacherUser && currentTeacherId) {
                        const isClassTeacher = c.teacher_id === currentTeacherId;
                        const isGroupTeacher = targetGroup && targetGroup.teacher_id === currentTeacherId;
                        if (!isClassTeacher && !isGroupTeacher) return false;
                      }

                      // Optional filter for Admin/SuperAdmin
                      if (!isTeacherUser && reportFilterTeacher !== "all") {
                        if (c.teacher_id !== reportFilterTeacher) return false;
                      }

                      return true;
                    })
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                  return (
                    <div className="space-y-4">
                      {/* Context Attendance & Origin Summary Card */}
                      <div className="bg-white p-4 rounded-xl border border-zinc-200/90 shadow-2xs">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-zinc-100">
                          <div className="flex items-center gap-2.5">
                            <div className={`p-2 rounded-lg ${isIndividualTab ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'}`}>
                              {isIndividualTab ? <User className="w-5 h-5" /> : <Users className="w-5 h-5" />}
                            </div>
                            <div>
                              <h4 className="text-sm font-bold text-zinc-900">
                                {isIndividualTab ? "Origem: Matrícula Individual" : `Origem: Grupo ${targetGroup?.name || ""}`}
                              </h4>
                              <p className="text-xs text-zinc-500">
                                {isIndividualTab
                                  ? "Histórico exclusivo das aulas individuais do aluno"
                                  : (targetGroup?.schedule ? `Horário: ${targetGroup.schedule}` : "Histórico exclusivo desta turma/grupo")}
                              </p>
                            </div>
                          </div>
                          <span className={`inline-flex self-start sm:self-center px-2.5 py-1 rounded-full text-xs font-bold border ${
                            isIndividualTab
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                              : "bg-sky-50 text-sky-700 border-sky-200"
                          }`}>
                            {isIndividualTab ? "Individual" : "Grupo"}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 text-center">
                          <div className="bg-zinc-50 p-2.5 rounded-lg border border-zinc-100">
                            <span className="text-[10px] uppercase font-bold text-zinc-400 block">Aulas Concluídas</span>
                            <span className="text-base font-bold text-zinc-900">{totalCompleted}</span>
                          </div>
                          <div className="bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-100">
                            <span className="text-[10px] uppercase font-bold text-emerald-700 block">Presenças</span>
                            <span className="text-base font-bold text-emerald-700">{totalPresent}</span>
                          </div>
                          <div className="bg-rose-50/60 p-2.5 rounded-lg border border-rose-100">
                            <span className="text-[10px] uppercase font-bold text-rose-700 block">Faltas</span>
                            <span className="text-base font-bold text-rose-700">{totalAbsent}</span>
                          </div>
                          <div className="bg-indigo-50/60 p-2.5 rounded-lg border border-indigo-100">
                            <span className="text-[10px] uppercase font-bold text-indigo-700 block">Frequência</span>
                            <span className="text-base font-bold text-indigo-700">{freqRate}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Class Reports List */}
                      {studentClassesWithReports.length === 0 ? (
                        <div className="text-center py-10 bg-white rounded-xl border border-zinc-200">
                          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 mb-3">
                            <FileText className="w-6 h-6 text-zinc-400" />
                          </div>
                          <h4 className="text-sm font-medium text-zinc-900 mb-1">Nenhum relatório encontrado</h4>
                          <p className="text-xs text-zinc-500">
                            {isTeacherUser 
                              ? "Nenhum relatório registrado por você nesta modalidade para este aluno."
                              : isIndividualTab 
                                ? "Este aluno não possui relatórios registrados em aulas individuais."
                                : `Este aluno não possui relatórios registrados no grupo ${targetGroup?.name || ""}.`}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {studentClassesWithReports.map(session => {
                            const teacher = state.teachers.find(t => t.id === session.teacher_id);
                            const attendanceVal = session.attendance ? session.attendance[sId] : null;

                            return (
                              <div key={session.id} className="bg-white p-5 rounded-xl border border-zinc-200 shadow-2xs">
                                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="font-bold text-zinc-900 text-sm">{session.title}</h4>
                                      {attendanceVal && (
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                          attendanceVal === "present"
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                            : "bg-rose-50 text-rose-700 border-rose-200"
                                        }`}>
                                          {attendanceVal === "present" ? "Presente" : "Falta"}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center text-xs text-zinc-500 mt-1 space-x-3">
                                      <span className="flex items-center">
                                        <CalendarIcon className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                                        {new Date(session.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                      </span>
                                      <span className="flex items-center">
                                        <Clock className="w-3.5 h-3.5 mr-1 text-zinc-400" />
                                        {session.start_time} - {session.end_time}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded-lg flex items-center">
                                    Prof. {teacher?.name || "Desconhecido"}
                                  </div>
                                </div>

                                {session.report && session.report.trim() !== "" && (
                                  <div className="mt-3 pt-3 border-t border-zinc-100">
                                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                                      {isIndividualTab ? "Relatório de Conteúdo & Evolução" : "Relatório da Aula do Grupo"}
                                    </span>
                                    <p className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed bg-zinc-50/50 p-3 rounded-xl border border-zinc-100">
                                      {session.report}
                                    </p>
                                  </div>
                                )}

                                {session.vocal_routine && session.vocal_routine.trim() !== "" && (
                                  <div className="mt-3 pt-3 border-t border-zinc-100">
                                    <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wider block mb-1">
                                      Treino / Exercícios Recomendados
                                    </span>
                                    <p className="text-sm text-zinc-800 bg-teal-50/50 p-3 rounded-xl border border-teal-100/60 whitespace-pre-wrap leading-relaxed">
                                      {session.vocal_routine}
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="px-6 py-4 border-t border-zinc-100 bg-white shrink-0 flex justify-end">
                <button
                  onClick={closeReportsModal}
                  className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-colors"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Student Ineligibility Justification Modal */}
      <AnimatePresence>
        {isJustificationModalOpen && justificationStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsJustificationModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden relative z-10 flex flex-col bg-white"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-white">
                <h3 className="text-lg font-semibold text-zinc-900 flex items-center">
                  <Ban className="w-5 h-5 mr-2 text-rose-600" />
                  Justificativa de Não Elegibilidade
                </h3>
                <button
                  onClick={() => setIsJustificationModalOpen(false)}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!justificationText.trim()) return;
                  updateStudent(justificationStudent.id, {
                    not_eligible: true,
                    ineligibility_reason: justificationText,
                  });
                  setIsJustificationModalOpen(false);
                  setJustificationStudent(null);
                  setJustificationText("");
                }}
                className="p-6 space-y-4 bg-white"
              >
                <p className="text-sm text-zinc-600">
                  Por favor, insira a justificativa para marcar o aluno <span className="font-semibold text-zinc-900">"{justificationStudent.name}"</span> como não elegível.
                </p>
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-zinc-700">
                    Justificativa <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Ex: Aluno inadimplente há mais de 3 meses / Pendência de documentos..."
                    value={justificationText}
                    onChange={(e) => setJustificationText(e.target.value)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none text-sm bg-white"
                  />
                </div>
                <div className="pt-2 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setIsJustificationModalOpen(false)}
                    className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 rounded-xl hover:bg-zinc-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-colors shadow-sm"
                  >
                    Confirmar Não Elegível
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Phone Normalization & Report Modal */}
      <AnimatePresence>
        {isPhoneModalOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border border-zinc-200"
            >
              {/* Header */}
              <div className="p-6 border-b border-zinc-200 flex items-center justify-between bg-zinc-50/80">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-zinc-900">
                      Normalização e Relatório de Telefones (E.164)
                    </h2>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Padronização de números para a norma internacional <code className="bg-zinc-200 px-1.5 py-0.5 rounded text-zinc-800 font-mono text-[11px]">+55 (DDD) Número</code>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPhoneModalOpen(false)}
                  className="p-2 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
                {normalizationSuccessMsg && (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl text-sm font-medium flex items-center justify-between shadow-sm">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span>{normalizationSuccessMsg}</span>
                    </div>
                    <button
                      onClick={() => setNormalizationSuccessMsg(null)}
                      className="text-xs text-emerald-700 hover:underline font-semibold"
                    >
                      Fechar
                    </button>
                  </div>
                )}

                {/* Summary Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200">
                    <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Total de Alunos
                    </div>
                    <div className="text-2xl font-bold text-zinc-900 mt-1">
                      {phoneStats.total}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200">
                    <div className="text-xs font-semibold text-emerald-800 uppercase tracking-wider flex items-center justify-between">
                      <span>Padrão E.164 OK</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="text-2xl font-bold text-emerald-800 mt-1">
                      {phoneStats.alreadyE164}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200">
                    <div className="text-xs font-semibold text-indigo-800 uppercase tracking-wider flex items-center justify-between">
                      <span>Pode Normalizar</span>
                      <RefreshCw className="w-4 h-4 text-indigo-600" />
                    </div>
                    <div className="text-2xl font-bold text-indigo-900 mt-1">
                      {phoneStats.normalizable}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200">
                    <div className="text-xs font-semibold text-amber-800 uppercase tracking-wider flex items-center justify-between">
                      <span>Revisão Manual</span>
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="text-2xl font-bold text-amber-900 mt-1">
                      {phoneStats.invalidOrEmpty}
                    </div>
                  </div>
                </div>

                {/* Batch Action Banner */}
                {phoneStats.normalizable > 0 && (
                  <div className="p-4 bg-indigo-600 text-white rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
                    <div>
                      <h4 className="font-bold text-base flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-amber-300" />
                        {phoneStats.normalizable} telefones prontos para conversão em lote
                      </h4>
                      <p className="text-xs text-indigo-100 mt-1">
                        Removerá caracteres não numéricos e adicionará o prefixo +55 onde aplicável.
                      </p>
                    </div>
                    <button
                      disabled={isRunningNormalization}
                      onClick={handleExecuteNormalization}
                      className="px-5 py-2.5 bg-white text-indigo-700 hover:bg-indigo-50 font-semibold rounded-xl text-sm transition-colors shrink-0 flex items-center space-x-2 shadow-sm disabled:opacity-50"
                    >
                      {isRunningNormalization ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Processando...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 text-indigo-700" />
                          <span>Executar Normalização (+55)</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Filter Tabs */}
                <div className="flex items-center justify-between border-b border-zinc-200 pb-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setPhoneReportFilter("invalid")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                        phoneReportFilter === "invalid"
                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      Inconformidades p/ Revisão ({phoneStats.invalidOrEmpty})
                    </button>

                    <button
                      onClick={() => setPhoneReportFilter("normalized")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                        phoneReportFilter === "normalized"
                          ? "bg-indigo-100 text-indigo-900 border border-indigo-300"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-indigo-600" />
                      Prontos p/ Normalizar ({phoneStats.normalizable})
                    </button>

                    <button
                      onClick={() => setPhoneReportFilter("already_e164")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                        phoneReportFilter === "already_e164"
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Padrão E.164 OK ({phoneStats.alreadyE164})
                    </button>

                    <button
                      onClick={() => setPhoneReportFilter("all")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                        phoneReportFilter === "all"
                          ? "bg-zinc-800 text-white"
                          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                      }`}
                    >
                      Todos ({phoneStats.total})
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead className="bg-zinc-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">Aluno</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">Telefone Cadastrado</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">Resultado E.164</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase">Diagnóstico</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500 uppercase">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                      {filteredPhoneReport.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-zinc-400 text-xs">
                            Nenhum aluno encontrado neste filtro.
                          </td>
                        </tr>
                      ) : (
                        filteredPhoneReport.map((row) => {
                          const isEditingThisRow = editingInlinePhoneId === row.student.id;
                          const rawDigitsInPhone = (row.originalPhone || "").replace(/\D/g, "");
                          // Extract potential 10 or 11 digit numbers if phone contained text/multiple numbers
                          const matches = (row.originalPhone || "").match(/\b\d{2}\s*9?\d{4}[-\s]?\d{4}\b/g) || [];
                          const candidatePhones = matches.map(m => {
                            const d = m.replace(/\D/g, "");
                            return d.length === 10 || d.length === 11 ? `+55${d}` : null;
                          }).filter(Boolean) as string[];

                          return (
                            <tr key={row.student.id} className="hover:bg-zinc-50 transition-colors">
                              <td className="px-4 py-3 font-medium text-zinc-900">
                                {row.student.name}
                              </td>
                              <td className="px-4 py-3 text-zinc-600 font-mono text-xs">
                                {isEditingThisRow ? (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center space-x-2">
                                      <input
                                        type="text"
                                        value={inlinePhoneText}
                                        onChange={(e) => setInlinePhoneText(e.target.value)}
                                        placeholder="+55 18 98106-6775"
                                        className="px-2.5 py-1 text-xs border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono w-52 bg-white"
                                        autoFocus
                                      />
                                      <button
                                        onClick={() => handleSaveInlinePhone(row.student.id, row.student.name)}
                                        className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center space-x-1"
                                      >
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Salvar</span>
                                      </button>
                                      <button
                                        onClick={() => setEditingInlinePhoneId(null)}
                                        className="px-2 py-1 bg-zinc-100 text-zinc-600 rounded-lg text-xs hover:bg-zinc-200"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                    {candidatePhones.length > 0 && (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10px] text-zinc-400">Sugestões:</span>
                                        {candidatePhones.map((cand, idx) => (
                                          <button
                                            key={idx}
                                            type="button"
                                            onClick={() => setInlinePhoneText(cand)}
                                            className="px-2 py-0.5 text-[11px] font-mono bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md hover:bg-indigo-100 font-semibold"
                                          >
                                            {cand}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  row.originalPhone || <span className="text-zinc-400 italic">Vazio</span>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs">
                                {row.normalizedPhone ? (
                                  <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                    {row.normalizedPhone}
                                  </span>
                                ) : (
                                  <span className="text-zinc-400 italic">-</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs">
                                {row.status === "already_e164" && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-800">
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                    E.164 OK
                                  </span>
                                )}
                                {row.status === "normalized" && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-800">
                                    <RefreshCw className="w-3 h-3 mr-1" />
                                    Pode Normalizar
                                  </span>
                                )}
                                {(row.status === "invalid" || row.status === "empty") && (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-full font-medium bg-amber-100 text-amber-900 text-[11px]" title={row.error}>
                                    <AlertTriangle className="w-3 h-3 mr-1 shrink-0 text-amber-600" />
                                    {row.error || "Incompleto"}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {!isEditingThisRow && (
                                  <div className="flex items-center justify-end space-x-2">
                                    <button
                                      onClick={() => {
                                        setEditingInlinePhoneId(row.student.id);
                                        // Pick candidate or clean phone
                                        const defaultVal = candidatePhones[0] || row.normalizedPhone || (row.originalPhone ? row.originalPhone.split(" ")[0] : "");
                                        setInlinePhoneText(defaultVal);
                                      }}
                                      className="px-2.5 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 border border-indigo-200 transition-colors"
                                    >
                                      Editar Telefone
                                    </button>
                                    <button
                                      onClick={() => {
                                        setIsPhoneModalOpen(false);
                                        openModal(row.student);
                                      }}
                                      className="text-xs text-zinc-500 hover:text-zinc-800 hover:underline"
                                    >
                                      Ficha
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-zinc-200 bg-zinc-50 flex justify-end">
                <button
                  onClick={() => setIsPhoneModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-100 transition-colors"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
