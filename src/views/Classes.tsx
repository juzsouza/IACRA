import React, { useState } from "react";
import { useAppStore, ClassSession } from "../store";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  Calendar as CalendarIcon,
  Clock,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  FileText,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export const Classes: React.FC = () => {
  const { state, addClass, updateClass, deleteClass } = useAppStore();
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<'list' | 'grid' | 'calendar'>('calendar');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassSession | null>(null);
  const [recurrence, setRecurrence] = useState<'none' | 'semanal' | 'quinzenal' | 'mensal'>('none');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().split("T")[0];
  });
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const [formData, setFormData] = useState({
    title: "",
    teacher_id: "",
    student_ids: [] as string[],
    date: new Date().toISOString().split("T")[0],
    start_time: "09:00",
    end_time: "10:00",
    status: "scheduled" as "scheduled" | "completed" | "cancelled",
    allow_makeup: false,
    report: "",
  });

  const [showReport, setShowReport] = useState(false);

  const filteredClasses = state.classes
    .filter(
      (c) =>
        c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        state.teachers
          .find((t) => t.id === c.teacher_id)
          ?.name.toLowerCase()
          .includes(searchTerm.toLowerCase()),
    )
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const groupedClasses = filteredClasses.reduce((acc, session) => {
    const date = session.date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(session);
    return acc;
  }, {} as Record<string, ClassSession[]>);

  const sortedDates = Object.keys(groupedClasses).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    
    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingClass) {
      updateClass(editingClass.id, formData);
    } else {
      if (recurrence === 'none') {
        addClass(formData);
      } else {
        let currentDate = new Date(formData.date + 'T12:00:00');
        const end = new Date(recurrenceEndDate + 'T12:00:00');
        
        while (currentDate <= end) {
          addClass({
            ...formData,
            date: currentDate.toISOString().split("T")[0]
          });
          
          if (recurrence === 'semanal') {
            currentDate.setDate(currentDate.getDate() + 7);
          } else if (recurrence === 'quinzenal') {
            currentDate.setDate(currentDate.getDate() + 14);
          } else if (recurrence === 'mensal') {
            currentDate.setMonth(currentDate.getMonth() + 1);
          } else {
            break;
          }
        }
      }
    }
    closeModal();
  };

  const openModal = (session?: ClassSession) => {
    if (session) {
      setEditingClass(session);
      setFormData({
        ...session,
        student_ids: session.student_ids || [],
        allow_makeup: session.allow_makeup || false,
        report: session.report || "",
      });
      setShowReport(false);
    } else {
      setEditingClass(null);
      setRecurrence('none');
      setShowReport(false);
      const d = new Date();
      d.setMonth(d.getMonth() + 6);
      setRecurrenceEndDate(d.toISOString().split("T")[0]);
      setFormData({
        title: "",
        teacher_id: state.teachers[0]?.id || "",
        student_ids: [],
        date: new Date().toISOString().split("T")[0],
        start_time: "09:00",
        end_time: "10:00",
        status: "scheduled",
        allow_makeup: false,
        report: "",
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingClass(null);
  };

  const handleStudentToggle = (studentId: string) => {
    const isAdding = !formData.student_ids.includes(studentId);
    
    if (isAdding && !editingClass && recurrence === 'none') {
      const enrollment = state.enrollments.find(e => e.student_id === studentId && e.status === 'active');
      if (enrollment) {
        const plan = state.financialPlans.find(p => p.id === enrollment.plan_id);
        if (plan && ['semanal', 'quinzenal', 'mensal'].includes(plan.modality)) {
          setRecurrence(plan.modality as any);
        }
      }
    }

    setFormData((prev) => ({
      ...prev,
      student_ids: isAdding
        ? [...prev.student_ids, studentId]
        : prev.student_ids.filter((id) => id !== studentId),
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Aulas
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Agende e gerencie as aulas da escola.
          </p>
        </div>
        <button
          onClick={() => openModal()}
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Aula
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full max-w-md">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-zinc-400" />
            </div>
            <input
              type="text"
              placeholder="Buscar por título ou professor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-zinc-200 rounded-xl leading-5 bg-zinc-50 placeholder-zinc-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
            />
          </div>
          
          <div className="flex bg-zinc-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('calendar')}
              className={`p-2 rounded-md flex items-center transition-colors ${
                viewMode === 'calendar' 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
              title="Visualização em Calendário"
            >
              <CalendarIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md flex items-center transition-colors ${
                viewMode === 'grid' 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
              title="Visualização em Grade"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md flex items-center transition-colors ${
                viewMode === 'list' 
                  ? 'bg-white text-indigo-600 shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
              title="Visualização em Lista"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {viewMode === 'calendar' ? (
          <div className="p-6 bg-zinc-50/50">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-zinc-900">
                {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </h2>
              <div className="flex space-x-2">
                <button
                  onClick={prevMonth}
                  className="p-2 rounded-lg border border-zinc-200 hover:bg-zinc-100 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-zinc-600" />
                </button>
                <button
                  onClick={nextMonth}
                  className="p-2 rounded-lg border border-zinc-200 hover:bg-zinc-100 transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-zinc-600" />
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-7 gap-px bg-zinc-200 rounded-xl overflow-hidden border border-zinc-200">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                <div key={day} className="bg-zinc-50 py-2 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                  {day}
                </div>
              ))}
              
              {getDaysInMonth(currentMonth).map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} className="bg-zinc-50/50 min-h-[120px]" />;
                }
                
                const dateStr = date.toISOString().split('T')[0];
                const dayClasses = groupedClasses[dateStr] || [];
                const isToday = new Date().toISOString().split('T')[0] === dateStr;
                
                return (
                  <div key={dateStr} className={`bg-white min-h-[120px] p-2 ${isToday ? 'ring-2 ring-indigo-500 ring-inset' : ''}`}>
                    <div className="flex justify-between items-start mb-2">
                      <span className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white' : 'text-zinc-700'}`}>
                        {date.getDate()}
                      </span>
                      {dayClasses.length > 0 && (
                        <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded-md">
                          {dayClasses.length}
                        </span>
                      )}
                    </div>
                    
                    <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1 custom-scrollbar">
                      {dayClasses.map(session => {
                        const students = state.students.filter(s => (session.student_ids || []).includes(s.id));
                        const studentNames = students.map(s => s.name.split(' ')[0]).join(', ') || 'Sem alunos';
                        
                        return (
                        <div 
                          key={session.id} 
                          onClick={() => openModal(session)}
                          className={`text-xs p-1.5 rounded border cursor-pointer hover:shadow-sm transition-shadow ${
                            session.status === 'scheduled' ? 'bg-amber-50 border-amber-200 text-amber-800 hover:border-amber-300' :
                            session.status === 'completed' ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:border-emerald-300' :
                            'bg-rose-50 border-rose-200 text-rose-800 hover:border-rose-300'
                          }`}
                        >
                          <div className="font-semibold truncate flex items-center justify-between">
                            <span className="truncate">{session.start_time}</span>
                            <div className="flex items-center">
                              {session.report && <FileText className="w-3 h-3 ml-1 shrink-0 opacity-70" title="Possui relatório" />}
                              {session.allow_makeup && <RefreshCcw className="w-3 h-3 ml-1 shrink-0" title="Permite reposição" />}
                            </div>
                          </div>
                          <div className="truncate opacity-90" title={studentNames}>{studentNames}</div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : viewMode === 'list' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Aula
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Data e Hora
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Professor
                </th>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider"
                >
                  Alunos
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
              {filteredClasses.length > 0 ? (
                filteredClasses.map((session) => {
                  const teacher = state.teachers.find(
                    (t) => t.id === session.teacher_id,
                  );
                  const students = state.students.filter((s) =>
                    (session.student_ids || []).includes(s.id),
                  );

                  return (
                    <tr
                      key={session.id}
                      className="hover:bg-zinc-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-zinc-900">
                          {session.title}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-zinc-900">
                          <CalendarIcon className="w-4 h-4 mr-2 text-zinc-400" />
                          {new Date(session.date).toLocaleDateString("pt-BR")}
                        </div>
                        <div className="flex items-center text-sm text-zinc-500 mt-1">
                          <Clock className="w-4 h-4 mr-2 text-zinc-400" />
                          {session.start_time} - {session.end_time}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-zinc-900">
                          {teacher?.name || "Não atribuído"}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {students.map((student) => (
                            <div
                              key={student.id}
                              className="flex items-center text-sm text-zinc-900"
                            >
                              <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs mr-2">
                                {student.name.charAt(0).toUpperCase()}
                              </div>
                              {student.name}
                            </div>
                          ))}
                          {students.length === 0 && (
                            <span className="text-sm text-zinc-500">
                              Nenhum
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-2">
                          <span
                            className={`px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded-full w-fit ${
                              session.status === "scheduled"
                                ? "bg-amber-100 text-amber-800"
                                : session.status === "completed"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {session.status === "scheduled"
                              ? "Agendada"
                              : session.status === "completed"
                                ? "Concluída"
                                : "Cancelada"}
                          </span>
                          {session.allow_makeup && (
                            <span className="inline-flex items-center text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md w-fit mt-2">
                              <RefreshCcw className="w-3 h-3 mr-1" />
                              Reposição
                            </span>
                          )}
                          {session.report && (
                            <span className="inline-flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md w-fit mt-2">
                              <FileText className="w-3 h-3 mr-1" />
                              Relatório
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => openModal(session)}
                          className="text-indigo-600 hover:text-indigo-900 mr-4"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteClass(session.id)}
                          className="text-rose-600 hover:text-rose-900"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-zinc-500 text-sm"
                  >
                    Nenhuma aula encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        ) : (
          <div className="p-6 space-y-8 bg-zinc-50/50">
            {sortedDates.length > 0 ? (
              sortedDates.map(date => {
                const dateObj = new Date(date + 'T12:00:00');
                const dayName = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
                const formattedDate = dateObj.toLocaleDateString('pt-BR');
                
                return (
                  <div key={date} className="space-y-4">
                    <h3 className="text-lg font-semibold text-zinc-900 capitalize flex items-center">
                      <CalendarIcon className="w-5 h-5 mr-2 text-indigo-600" />
                      {dayName}, {formattedDate}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {groupedClasses[date].map(session => {
                        const teacher = state.teachers.find(t => t.id === session.teacher_id);
                        const students = state.students.filter(s => (session.student_ids || []).includes(s.id));
                        
                        return (
                          <div key={session.id} className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm hover:shadow-md transition-all relative group flex flex-col h-full">
                            <div className="flex justify-between items-start mb-4">
                              <div>
                                <h4 className="font-semibold text-zinc-900">{session.title}</h4>
                                <div className="flex items-center text-xs text-zinc-500 mt-1.5">
                                  <Clock className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
                                  {session.start_time} - {session.end_time}
                                </div>
                              </div>
                              <span className={`px-2.5 py-1 text-[10px] font-medium rounded-full whitespace-nowrap ml-2 ${
                                session.status === "scheduled" ? "bg-amber-100 text-amber-800" : 
                                session.status === "completed" ? "bg-emerald-100 text-emerald-800" : 
                                "bg-rose-100 text-rose-800"
                              }`}>
                                {session.status === "scheduled" ? "Agendada" : session.status === "completed" ? "Concluída" : "Cancelada"}
                              </span>
                            </div>
                            
                            {session.allow_makeup && (
                              <div className="mb-3 flex items-center text-xs font-medium text-indigo-600 bg-indigo-50 w-fit px-2 py-1 rounded-md">
                                <RefreshCcw className="w-3.5 h-3.5 mr-1.5" />
                                Permite Reposição
                              </div>
                            )}
                            {session.report && (
                              <div className="mb-3 flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 w-fit px-2 py-1 rounded-md">
                                <FileText className="w-3.5 h-3.5 mr-1.5" />
                                Possui Relatório
                              </div>
                            )}

                            <div className="mb-4">
                              <div className="text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wider">Professor</div>
                              <div className="text-sm text-zinc-900 flex items-center">
                                <div className="h-6 w-6 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-600 font-bold text-xs mr-2">
                                  {teacher?.name.charAt(0).toUpperCase() || "?"}
                                </div>
                                {teacher?.name || "Não atribuído"}
                              </div>
                            </div>
                            
                            <div className="flex-1">
                              <div className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Alunos ({students.length})</div>
                              <div className="flex flex-col gap-2">
                                {students.map(student => (
                                  <div key={student.id} className="flex items-center text-sm text-zinc-700 bg-zinc-50 p-1.5 rounded-lg">
                                    <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs mr-2 shrink-0">
                                      {student.name.charAt(0).toUpperCase()}
                                    </div>
                                    <span className="truncate">{student.name}</span>
                                  </div>
                                ))}
                                {students.length === 0 && <span className="text-sm text-zinc-400 italic">Nenhum aluno matriculado</span>}
                              </div>
                            </div>
                            
                            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1 bg-white/90 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-zinc-100">
                              <button onClick={() => openModal(session)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors" title="Editar Aula">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => deleteClass(session.id)} className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition-colors" title="Excluir Aula">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12">
                <p className="text-zinc-500">Nenhuma aula encontrada.</p>
              </div>
            )}
          </div>
        )}
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
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden relative z-10 max-h-[90vh] flex flex-col"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center shrink-0">
                <h3 className="text-lg font-semibold text-zinc-900">
                  {editingClass ? "Editar Aula" : "Nova Aula"}
                </h3>
                <button
                  onClick={closeModal}
                  className="text-zinc-400 hover:text-zinc-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form
                onSubmit={handleSubmit}
                className="p-6 space-y-4 overflow-y-auto"
              >
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1">
                    Título da Aula
                  </label>
                  <input
                    required
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="Ex: Aula de Piano Iniciante"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Professor
                    </label>
                    <select
                      required
                      value={formData.teacher_id}
                      onChange={(e) =>
                        setFormData({ ...formData, teacher_id: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                    >
                      <option value="" disabled>
                        Selecione um professor
                      </option>
                      {state.teachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
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
                          status: e.target.value as any,
                        })
                      }
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                    >
                      <option value="scheduled">Agendada</option>
                      <option value="completed">Concluída</option>
                      <option value="cancelled">Cancelada</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Data
                    </label>
                    <input
                      required
                      type="date"
                      value={formData.date}
                      onChange={(e) =>
                        setFormData({ ...formData, date: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Início
                    </label>
                    <input
                      required
                      type="time"
                      value={formData.start_time}
                      onChange={(e) =>
                        setFormData({ ...formData, start_time: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-1">
                      Fim
                    </label>
                    <input
                      required
                      type="time"
                      value={formData.end_time}
                      onChange={(e) =>
                        setFormData({ ...formData, end_time: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    Alunos
                  </label>
                  <div className="border border-zinc-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-zinc-100">
                    {state.students.filter((s) => s.status === "active")
                      .length > 0 ? (
                      state.students
                        .filter((s) => s.status === "active")
                        .map((student) => (
                          <label
                            key={student.id}
                            className="flex items-center px-3 py-2 hover:bg-zinc-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={formData.student_ids.includes(student.id)}
                              onChange={() => handleStudentToggle(student.id)}
                              className="rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="ml-3 text-sm text-zinc-900">
                              {student.name}
                            </span>
                            <span className="ml-auto text-xs text-zinc-500">
                              {student.instrument}
                            </span>
                          </label>
                        ))
                    ) : (
                      <div className="p-3 text-sm text-zinc-500 text-center">
                        Nenhum aluno ativo encontrado.
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center pt-2">
                  <input
                    type="checkbox"
                    id="allow_makeup"
                    checked={formData.allow_makeup}
                    onChange={(e) => setFormData({ ...formData, allow_makeup: e.target.checked })}
                    className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="allow_makeup" className="ml-2 block text-sm text-zinc-900">
                    Permite reposição
                  </label>
                </div>

                {editingClass && (
                  <div className="pt-2 border-t border-zinc-100">
                    <button
                      type="button"
                      onClick={() => setShowReport(!showReport)}
                      className="flex items-center text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      {showReport ? "Ocultar Relatório" : "Adicionar/Ver Relatório da Aula"}
                    </button>
                    
                    <AnimatePresence>
                      {showReport && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden mt-3"
                        >
                          <label className="block text-sm font-medium text-zinc-700 mb-1">
                            Relatório / Anotações
                          </label>
                          <textarea
                            value={formData.report}
                            onChange={(e) => setFormData({ ...formData, report: e.target.value })}
                            placeholder="Anote o que foi feito na aula, desempenho do aluno, tarefas de casa, etc..."
                            className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none min-h-[120px] resize-y"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {!editingClass && (
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-100">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-1">
                        Recorrência
                      </label>
                      <select
                        value={recurrence}
                        onChange={(e) => setRecurrence(e.target.value as any)}
                        className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                      >
                        <option value="none">Não repetir (Avulsa)</option>
                        <option value="semanal">Semanal</option>
                        <option value="quinzenal">Quinzenal</option>
                        <option value="mensal">Mensal</option>
                      </select>
                    </div>
                    {recurrence !== 'none' && (
                      <div>
                        <label className="block text-sm font-medium text-zinc-700 mb-1">
                          Repetir até
                        </label>
                        <input
                          type="date"
                          required
                          value={recurrenceEndDate}
                          onChange={(e) => setRecurrenceEndDate(e.target.value)}
                          className="w-full px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-4 flex justify-end space-x-3 shrink-0">
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
    </div>
  );
};
