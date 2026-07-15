import React, { useState } from "react";
import { useAppStore, Student } from "../store";
import { Plus, Search, Edit2, Trash2, X, FileText, Calendar as CalendarIcon, Clock, AlertCircle, Ban } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const formatCPF = (value: string) => {
  const digits = value.replace(/\D/g, "");
  const truncated = digits.slice(0, 11);
  if (truncated.length <= 3) return truncated;
  if (truncated.length <= 6) return `${truncated.slice(0, 3)}.${truncated.slice(3)}`;
  if (truncated.length <= 9) return `${truncated.slice(0, 3)}.${truncated.slice(3, 6)}.${truncated.slice(6)}`;
  return `${truncated.slice(0, 3)}.${truncated.slice(3, 6)}.${truncated.slice(6, 9)}-${truncated.slice(9)}`;
};

export const Students: React.FC = () => {
  const { state, addStudent, updateStudent, deleteStudent, currentUserProfile } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isReportsModalOpen, setIsReportsModalOpen] = useState(false);
  const [selectedStudentForReports, setSelectedStudentForReports] = useState<Student | null>(null);

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

  // Base list of students depending on the user's role
  const baseStudents = React.useMemo(() => {
    if (currentUserProfile?.role === "teacher" && currentUserProfile.teacher_id) {
      const teacherId = currentUserProfile.teacher_id;
      // Get student IDs from enrollments with this teacher
      const enrolledStudentIds = state.enrollments
        .filter(e => e.teacher_id === teacherId)
        .map(e => e.student_id);

      // Get student IDs from group enrollments with groups taught by this teacher
      const groupTeacherIds = state.groups
        .filter(g => g.teacher_id === teacherId)
        .map(g => g.id);
      const groupStudentIds = state.enrollments
        .filter(e => e.group_id && groupTeacherIds.includes(e.group_id))
        .map(e => e.student_id);

      // Get student IDs from classes taught by this teacher
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
    const nameMatch = (s.name || "").toLowerCase().includes(searchTerm.toLowerCase());
    const instrumentMatch = (s.instrument || "").toLowerCase().includes(searchTerm.toLowerCase());
    const cleanSearchCpf = searchTerm.replace(/\D/g, "");
    const cleanStudentCpf = (s.cpf || "").replace(/\D/g, "");
    const cpfMatch = cleanSearchCpf ? cleanStudentCpf.includes(cleanSearchCpf) : false;
    return nameMatch || instrumentMatch || cpfMatch;
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

    if (editingStudent) {
      updateStudent(editingStudent.id, formData);
    } else {
      addStudent(formData);
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
    setIsReportsModalOpen(true);
  };

  const closeReportsModal = () => {
    setIsReportsModalOpen(false);
    setSelectedStudentForReports(null);
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
          <button
            onClick={() => openModal()}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo Aluno
          </button>
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
              placeholder="Buscar por nome ou instrumento..."
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
                      <div className="text-sm text-zinc-500">
                        {student.phone}
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
                      required
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
                      Telefone
                    </label>
                    <input
                      required
                      type="tel"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Instrumento Principal
                  </label>
                  <input
                    required
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
                      required
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
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center bg-white shrink-0">
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900 flex items-center">
                    <FileText className="w-5 h-5 mr-2 text-emerald-600" />
                    Relatórios de Aulas
                  </h3>
                  <p className="text-sm text-zinc-500 mt-1">
                    Aluno: <span className="font-medium text-zinc-900">{selectedStudentForReports.name}</span>
                  </p>
                </div>
                <button
                  onClick={closeReportsModal}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-zinc-50/50">
                {(() => {
                  const studentClassesWithReports = state.classes
                    .filter(c => (c.student_ids || []).includes(selectedStudentForReports.id) && c.report && c.report.trim() !== "")
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                  if (studentClassesWithReports.length === 0) {
                    return (
                      <div className="text-center py-12 bg-white rounded-xl border border-zinc-200">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 mb-3">
                          <FileText className="w-6 h-6 text-zinc-400" />
                        </div>
                        <h4 className="text-sm font-medium text-zinc-900 mb-1">Nenhum relatório encontrado</h4>
                        <p className="text-xs text-zinc-500">
                          Este aluno ainda não possui relatórios de aulas registrados.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      {studentClassesWithReports.map(session => {
                        const teacher = state.teachers.find(t => t.id === session.teacher_id);
                        return (
                          <div key={session.id} className="bg-white p-5 rounded-xl border border-zinc-200 shadow-sm">
                            <div className="flex justify-between items-start mb-3">
                              <div>
                                <h4 className="font-medium text-zinc-900">{session.title}</h4>
                                <div className="flex items-center text-xs text-zinc-500 mt-1 space-x-3">
                                  <span className="flex items-center">
                                    <CalendarIcon className="w-3.5 h-3.5 mr-1" />
                                    {new Date(session.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                                  </span>
                                  <span className="flex items-center">
                                    <Clock className="w-3.5 h-3.5 mr-1" />
                                    {session.start_time} - {session.end_time}
                                  </span>
                                </div>
                              </div>
                              <div className="text-xs font-medium bg-zinc-100 text-zinc-700 px-2 py-1 rounded-md flex items-center">
                                Prof. {teacher?.name.split(' ')[0] || "Desconhecido"}
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t border-zinc-100">
                              <p className="text-sm text-zinc-700 whitespace-pre-wrap leading-relaxed">
                                {session.report}
                              </p>
                            </div>
                          </div>
                        );
                      })}
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
    </div>
  );
};
