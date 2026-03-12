import React from "react";
import { useAppStore } from "../store";
import {
  Users,
  GraduationCap,
  CalendarDays,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

export const Dashboard: React.FC = () => {
  const { state } = useAppStore();

  const activeStudents = state.students.filter(
    (s) => s.status === "active",
  ).length;
  const totalTeachers = state.teachers.length;
  const upcomingClasses = state.classes.filter(
    (c) => c.status === "scheduled",
  ).length;

  const totalIncome = state.transactions
    .filter((t) => t.type === "income" && t.status === "completed")
    .reduce((acc, curr) => acc + curr.amount, 0);

  const totalExpense = state.transactions
    .filter((t) => t.type === "expense" && t.status === "completed")
    .reduce((acc, curr) => acc + curr.amount, 0);

  const balance = totalIncome - totalExpense;

  const stats = [
    {
      label: "Alunos Ativos",
      value: activeStudents,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-100",
    },
    {
      label: "Professores",
      value: totalTeachers,
      icon: GraduationCap,
      color: "text-emerald-600",
      bg: "bg-emerald-100",
    },
    {
      label: "Aulas Agendadas",
      value: upcomingClasses,
      icon: CalendarDays,
      color: "text-amber-600",
      bg: "bg-amber-100",
    },
    {
      label: "Saldo Mensal",
      value: new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(balance),
      icon: balance >= 0 ? TrendingUp : TrendingDown,
      color: balance >= 0 ? "text-indigo-600" : "text-rose-600",
      bg: balance >= 0 ? "bg-indigo-100" : "bg-rose-100",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">
          Visão Geral
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Acompanhe os principais indicadores da sua escola.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={i}
              className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center space-x-4"
            >
              <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-500">
                  {stat.label}
                </p>
                <p className="text-2xl font-bold text-zinc-900">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Classes */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-zinc-100">
            <h3 className="text-base font-semibold text-zinc-900">
              Próximas Aulas
            </h3>
          </div>
          <div className="divide-y divide-zinc-100">
            {state.classes.filter((c) => c.status === "scheduled").slice(0, 5)
              .length > 0 ? (
              state.classes
                .filter((c) => c.status === "scheduled")
                .slice(0, 5)
                .map((c) => {
                  const teacher = state.teachers.find(
                    (t) => t.id === c.teacher_id,
                  );
                  return (
                    <div
                      key={c.id}
                      className="px-6 py-4 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-900">
                          {c.title}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Prof. {teacher?.name || "Desconhecido"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-zinc-900">
                          {new Date(c.date).toLocaleDateString("pt-BR")}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {c.start_time} - {c.end_time}
                        </p>
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="px-6 py-8 text-center text-sm text-zinc-500">
                Nenhuma aula agendada.
              </div>
            )}
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-zinc-100">
            <h3 className="text-base font-semibold text-zinc-900">
              Últimas Transações
            </h3>
          </div>
          <div className="divide-y divide-zinc-100">
            {state.transactions.slice(-5).reverse().length > 0 ? (
              state.transactions
                .slice(-5)
                .reverse()
                .map((t) => {
                  let displayDescription = t.description;
                  if (displayDescription.startsWith('Mensalidade |')) {
                    const parts = displayDescription.split(' | ');
                    if (parts.length >= 4) {
                      // Remove the ID part (index 1)
                      parts.splice(1, 1);
                      displayDescription = parts.join(' | ');
                    }
                  }

                  return (
                    <div
                      key={t.id}
                      className="px-6 py-4 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-zinc-900">
                          {displayDescription}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {new Date(t.date).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div
                        className={`text-sm font-semibold ${t.type === "income" ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {t.type === "income" ? "+" : "-"}
                        {new Intl.NumberFormat("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        }).format(t.amount)}
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="px-6 py-8 text-center text-sm text-zinc-500">
                Nenhuma transação recente.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
