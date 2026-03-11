import React, { useState } from "react";
import { useAppStore } from "../store";
import {
  TrendingUp,
  TrendingDown,
  Users,
  GraduationCap,
  Wallet,
  Building2
} from "lucide-react";
import { motion } from "motion/react";

export const Finance: React.FC = () => {
  const { state } = useAppStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'teachers' | 'secretary'>('overview');
  const [reportType, setReportType] = useState<'projected' | 'actual'>('projected');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  // Calculate financials based on active enrollments or actual transactions
  const calculateFinancials = () => {
    let totalRevenue = 0;
    let totalTeacherPayout = 0;
    let totalSecretaryPayout = 0;
    let totalSchoolShare = 0;
    let totalMargin = 0;

    const teacherPayouts: Record<string, number> = {};
    let secretaryPayout = 0;

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
        }
        
        secretaryPayout += secShare;
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
              }
              secretaryPayout += secShare;
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
      secretaryPayout
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
            <div>
              <table className="min-w-full divide-y divide-zinc-200">
                <thead className="bg-zinc-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Professor</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total a Receber</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-zinc-200">
                  {Object.entries(financials.teacherPayouts).map(([teacherId, amount]) => {
                    const teacher = state.teachers.find(t => t.id === teacherId);
                    return (
                      <tr key={teacherId}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-zinc-900">
                          {teacher?.name || 'Professor Desconhecido'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-indigo-600">
                          {formatCurrency(amount)}
                        </td>
                      </tr>
                    );
                  })}
                  {Object.keys(financials.teacherPayouts).length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-6 py-8 text-center text-sm text-zinc-500">
                        Nenhum repasse de professor calculado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'secretary' && (
            <div className="max-w-md mx-auto mt-8">
              <div className="bg-amber-50 rounded-2xl p-8 text-center border border-amber-100">
                <Users className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-zinc-900 mb-2">Repasse Total da Secretária</h3>
                <p className="text-4xl font-bold text-amber-600">{formatCurrency(financials.secretaryPayout)}</p>
                <p className="text-sm text-amber-700/70 mt-4">
                  Calculado com base nas taxas configuradas em cada plano ativo.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
