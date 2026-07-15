import React, { useState } from "react";
import { useAppStore } from "../store";
import {
  TrendingUp,
  TrendingDown,
  Users,
  GraduationCap,
  Wallet,
  Building2,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { motion } from "motion/react";

export const Finance: React.FC = () => {
  const { state } = useAppStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'teachers' | 'secretary'>('overview');
  const [reportType, setReportType] = useState<'projected' | 'actual'>('projected');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expandedTeachers, setExpandedTeachers] = useState<Record<string, boolean>>({});

  const toggleTeacher = (id: string) => {
    setExpandedTeachers(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Calculate financials based on active enrollments or actual transactions
  const calculateFinancials = () => {
    let totalRevenue = 0;
    let totalTeacherPayout = 0;
    let totalSecretaryPayout = 0;
    let totalSchoolShare = 0;
    let totalMargin = 0;

    const teacherPayouts: Record<string, number> = {};
    let secretaryPayout = 0;
    const teacherBreakdowns: Record<string, Array<{
      studentName: string,
      planName: string,
      totalPrice: number,
      teacherShare: number,
      status: string
    }>> = {};

    const secretaryBreakdown: Array<{
      studentName: string,
      planName: string,
      totalPrice: number,
      secretaryShare: number,
      status: string
    }> = [];

    if (reportType === 'projected') {
      // Process regular enrollments
      state.enrollments.filter(e => e.status === 'active').forEach(enrollment => {
        const plan = state.financialPlans.find(p => p.id === enrollment.plan_id);
        if (!plan) return;

        let basePrice = enrollment.custom_price !== undefined ? enrollment.custom_price : plan.base_price;
        let schoolShare = plan.school_fee_value;
        let teacherShare = plan.teacher_fee_type === 'percentage' ? (basePrice * plan.teacher_fee_value / 100) : plan.teacher_fee_value;
        let secShare = plan.secretary_fee_value;
        
        let totalDiscount = 0;
        let schoolDiscount = 0;

        // Cross discounts
        const studentEnrollments = state.enrollments.filter(e => e.student_id === enrollment.student_id && e.status === 'active' && e.id !== enrollment.id);
        const activePlanIds = studentEnrollments.map(e => e.plan_id);

        const applicableRules = state.discountRules.filter(r => 
          activePlanIds.includes(r.trigger_plan_id) && 
          r.target_plan_id === plan.id
        );

        applicableRules.forEach(rule => {
          if (rule.applies_to === 'total_price') {
            totalDiscount += rule.discount_value;
          } else if (rule.applies_to === 'school_share') {
            schoolDiscount += rule.discount_value;
            totalDiscount += rule.discount_value;
          }
        });

        const finalPrice = basePrice - totalDiscount;
        const finalSchoolShare = schoolShare - schoolDiscount;
        const margin = plan.margin_value;

        totalRevenue += finalPrice;
        totalTeacherPayout += teacherShare;
        totalSecretaryPayout += secShare;
        totalSchoolShare += finalSchoolShare;
        totalMargin += margin;

        // Aggregate teacher payouts
        const effectiveTeacherId = plan.exclusive_teacher_id || enrollment.teacher_id;
        if (effectiveTeacherId) {
          teacherPayouts[effectiveTeacherId] = (teacherPayouts[effectiveTeacherId] || 0) + teacherShare;
          
          if (!teacherBreakdowns[effectiveTeacherId]) {
            teacherBreakdowns[effectiveTeacherId] = [];
          }
          const student = state.students.find(s => s.id === enrollment.student_id);
          teacherBreakdowns[effectiveTeacherId].push({
            studentName: student?.name || 'Desconhecido',
            planName: plan.name,
            totalPrice: finalPrice,
            teacherShare: teacherShare,
            status: 'Ativo (Projetado)'
          });
        }
        
        secretaryPayout += secShare;

        const student = state.students.find(s => s.id === enrollment.student_id);
        secretaryBreakdown.push({
          studentName: student?.name || 'Desconhecido',
          planName: plan.name,
          totalPrice: finalPrice,
          secretaryShare: secShare,
          status: 'Ativo (Projetado)'
        });
      });

      // Process choir registrations
      state.choirRegistrations.filter(r => r.status === 'approved').forEach(reg => {
        totalRevenue += reg.monthly_fee;
        totalSchoolShare += reg.monthly_fee; // Assuming choir revenue goes to school for now, minus specific teacher payments
        totalMargin += reg.monthly_fee;
      });
    } else {
      // Process actual transactions for the selected month/year
      const monthStr = selectedMonth.toString().padStart(2, '0');
      const targetPattern = `${monthStr}/${selectedYear}`;
      
      state.transactions.filter(t => t.type === 'income' && t.status === 'completed' && t.description.includes(targetPattern)).forEach(t => {
        totalRevenue += t.amount;
        
        // Try to find if it's an enrollment payment
        const match = t.description.match(/Mensalidade \| (.*?) \|/);
        if (match && match[1]) {
          const enrollmentId = match[1].trim();
          const enrollment = state.enrollments.find(e => e.id === enrollmentId);
          if (enrollment) {
            const plan = state.financialPlans.find(p => p.id === enrollment.plan_id);
            if (plan) {
              let basePrice = enrollment.custom_price !== undefined ? enrollment.custom_price : plan.base_price;
              let teacherShare = plan.teacher_fee_type === 'percentage' ? (basePrice * plan.teacher_fee_value / 100) : plan.teacher_fee_value;
              let secShare = plan.secretary_fee_value;
              
              totalTeacherPayout += teacherShare;
              totalSecretaryPayout += secShare;
              
              // The rest goes to the school
              const remaining = t.amount - teacherShare - secShare;
              totalSchoolShare += remaining;
              totalMargin += remaining; // Simplification for actuals
              
              const effectiveTeacherId = plan.exclusive_teacher_id || enrollment.teacher_id;
              if (effectiveTeacherId) {
                teacherPayouts[effectiveTeacherId] = (teacherPayouts[effectiveTeacherId] || 0) + teacherShare;
                
                if (!teacherBreakdowns[effectiveTeacherId]) {
                  teacherBreakdowns[effectiveTeacherId] = [];
                }
                const student = state.students.find(s => s.id === enrollment.student_id);
                teacherBreakdowns[effectiveTeacherId].push({
                  studentName: student?.name || 'Desconhecido',
                  planName: plan.name,
                  totalPrice: t.amount,
                  teacherShare: teacherShare,
                  status: 'Pago (Confirmado)'
                });
              }
              secretaryPayout += secShare;

              const student = state.students.find(s => s.id === enrollment.student_id);
              secretaryBreakdown.push({
                studentName: student?.name || 'Desconhecido',
                planName: plan.name,
                totalPrice: t.amount,
                secretaryShare: secShare,
                status: 'Pago (Confirmado)'
              });
            }
          }
        } else {
          // Generic income
          totalSchoolShare += t.amount;
          totalMargin += t.amount;
        }
      });
    }

    return {
      totalRevenue,
      totalTeacherPayout,
      totalSecretaryPayout,
      totalSchoolShare,
      totalMargin,
      teacherPayouts,
      secretaryPayout,
      teacherBreakdowns,
      secretaryBreakdown
    };
  };

  const financials = calculateFinancials();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
            Dashboard Financeiro
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {reportType === 'projected' ? 'Projeção mensal baseada nas matrículas e planos ativos.' : 'Relatório baseado nos pagamentos realizados no mês selecionado.'}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          {reportType === 'actual' && (
            <div className="flex gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                className="px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString('pt-BR', { month: 'long' })}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="px-3 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-sm"
              >
                {[selectedYear - 1, selectedYear, selectedYear + 1].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex bg-zinc-100 p-1 rounded-xl">
            <button
              onClick={() => setReportType('projected')}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                reportType === 'projected'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              Projetado
            </button>
            <button
              onClick={() => setReportType('actual')}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                reportType === 'actual'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              Realizado
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-emerald-100 text-emerald-600">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">Receita Bruta (Alunos)</p>
            <p className="text-2xl font-bold text-zinc-900">
              {formatCurrency(financials.totalRevenue)}
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-indigo-100 text-indigo-600">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">Repasses (Professores)</p>
            <p className="text-2xl font-bold text-zinc-900">
              {formatCurrency(financials.totalTeacherPayout)}
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-amber-100 text-amber-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">Repasses (Secretária)</p>
            <p className="text-2xl font-bold text-zinc-900">
              {formatCurrency(financials.totalSecretaryPayout)}
            </p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-blue-100 text-blue-600">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">Lucro Líquido (Escola)</p>
            <p className="text-2xl font-bold text-zinc-900">
              {formatCurrency(financials.totalSchoolShare + financials.totalMargin)}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="border-b border-zinc-200">
          <nav className="flex -mb-px" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('overview')}
              className={`w-1/3 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              }`}
            >
              Visão Geral
            </button>
            <button
              onClick={() => setActiveTab('teachers')}
              className={`w-1/3 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                activeTab === 'teachers'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              }`}
            >
              Extrato Professores
            </button>
            <button
              onClick={() => setActiveTab('secretary')}
              className={`w-1/3 py-4 px-1 text-center border-b-2 font-medium text-sm ${
                activeTab === 'secretary'
                  ? 'border-indigo-500 text-indigo-600'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              }`}
            >
              Extrato Secretária
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium text-zinc-900">Resumo de Matrículas Ativas</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                  <p className="text-sm text-zinc-500">Matrículas em Planos</p>
                  <p className="text-2xl font-semibold text-zinc-900">{state.enrollments.filter(e => e.status === 'active').length}</p>
                </div>
                <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                  <p className="text-sm text-zinc-500">Inscrições no Coral</p>
                  <p className="text-2xl font-semibold text-zinc-900">{state.choirRegistrations.filter(r => r.status === 'approved').length}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'teachers' && (
            <div className="space-y-4">
              <div className="text-sm text-zinc-500 mb-2">
                Selecione um professor para visualizar o extrato detalhado de seus alunos e os respectivos repasses.
              </div>
              <div className="divide-y divide-zinc-200 border border-zinc-200 rounded-2xl overflow-hidden bg-white">
                {Object.entries(financials.teacherPayouts).map(([teacherId, amount]) => {
                  const teacher = state.teachers.find(t => t.id === teacherId);
                  const isExpanded = !!expandedTeachers[teacherId];
                  const breakdown = financials.teacherBreakdowns[teacherId] || [];

                  return (
                    <div key={teacherId} className="transition-colors">
                      <button
                        onClick={() => toggleTeacher(teacherId)}
                        className="w-full flex items-center justify-between p-5 text-left hover:bg-zinc-50 focus:outline-none transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                            <GraduationCap className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-sm font-bold text-zinc-900 block">
                              {teacher?.name || 'Professor Desconhecido'}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {breakdown.length} {breakdown.length === 1 ? 'aluno vinculado' : 'alunos vinculados'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <span className="text-sm font-bold text-indigo-600">
                            {formatCurrency(amount)}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-zinc-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-zinc-400" />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="bg-zinc-50/50 px-5 pb-5 pt-2 border-t border-zinc-100">
                          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white mt-2">
                            <table className="min-w-full divide-y divide-zinc-200 text-sm">
                              <thead className="bg-zinc-50">
                                <tr>
                                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Aluno</th>
                                  <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Plano</th>
                                  <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Valor do Aluno</th>
                                  <th scope="col" className="px-4 py-2.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Repasse Professor</th>
                                  <th scope="col" className="px-4 py-2.5 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-100">
                                {breakdown.map((item, idx) => (
                                  <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                                    <td className="px-4 py-3 whitespace-nowrap font-medium text-zinc-900">
                                      {item.studentName}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-zinc-600">
                                      {item.planName}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right text-zinc-950 font-medium">
                                      {formatCurrency(item.totalPrice)}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-right text-indigo-600 font-semibold">
                                      {formatCurrency(item.teacherShare)}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-center">
                                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                                        item.status.includes('Pago') 
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                          : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                                      }`}>
                                        {item.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                                {breakdown.length === 0 && (
                                  <tr>
                                    <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                                      Nenhuma informação detalhada para este professor.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {Object.keys(financials.teacherPayouts).length === 0 && (
                  <div className="p-8 text-center text-sm text-zinc-500">
                    Nenhum repasse de professor calculado.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'secretary' && (
            <div className="space-y-6">
              <div className="bg-amber-50/60 rounded-2xl p-6 border border-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-amber-100 rounded-xl text-amber-600">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-900">Extrato Consolidado da Secretária</h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {reportType === 'projected' 
                        ? 'Baseado em matrículas ativas projetadas para este mês.' 
                        : 'Baseado em pagamentos reais recebidos no mês selecionado.'}
                    </p>
                  </div>
                </div>
                <div className="text-left md:text-right bg-white px-5 py-3 rounded-xl border border-zinc-150 shadow-sm md:self-stretch flex flex-col justify-center">
                  <span className="text-xs text-zinc-400 font-medium uppercase">Repasse Total do Período</span>
                  <span className="text-2xl font-black text-amber-600">
                    {formatCurrency(financials.secretaryPayout)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-zinc-800">Detalhamento por Aluno e Plano</h4>
                <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead className="bg-zinc-50">
                      <tr>
                        <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Aluno</th>
                        <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Plano</th>
                        <th scope="col" className="px-6 py-3.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Valor do Aluno</th>
                        <th scope="col" className="px-6 py-3.5 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Taxa Secretária</th>
                        <th scope="col" className="px-6 py-3.5 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {financials.secretaryBreakdown.map((item, idx) => (
                        <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap font-medium text-zinc-900">
                            {item.studentName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-zinc-600">
                            {item.planName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-zinc-950 font-medium">
                            {formatCurrency(item.totalPrice)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-amber-600 font-bold">
                            {formatCurrency(item.secretaryShare)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                              item.status.includes('Pago') 
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {financials.secretaryBreakdown.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-zinc-400">
                            Nenhum repasse de secretaria encontrado para este período.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
