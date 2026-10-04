import React from "react";
import { useAppStore } from "../store";
import {
  Users,
  GraduationCap,
  CalendarDays,
} from "lucide-react";
import { SchoolGrowthChart } from "../components/SchoolGrowthChart";

export const Dashboard: React.FC = () => {
  const { state, currentUserProfile } = useAppStore();

  const isSuperAdmin = currentUserProfile?.role === "super_admin";

  const activeStudents = state.students.filter(
    (s) => s.status === "active" && !s.not_eligible,
  ).length;
  const activeTeachers = state.teachers.filter(t => t.status === 'active').length;
  const upcomingClasses = state.classes.filter((c) => {
    if (c.status !== "scheduled") return false;
    if (c.student_ids && c.student_ids.length > 0) {
      const activeDirectStudents = c.student_ids.filter((sId) => {
        const s = state.students.find((st) => st.id === sId);
        return s && s.status === "active" && !s.not_eligible;
      });
      return activeDirectStudents.length > 0;
    }
    return true;
  }).length;

  const stats = [
    {
      label: "Alunos Ativos",
      value: activeStudents,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-100",
    },
    {
      label: "Professores Ativos",
      value: activeTeachers,
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

      {/* School Growth & Enrollment Chart Section - Exclusively for Super Admin */}
      {isSuperAdmin && <SchoolGrowthChart />}
    </div>
  );
};
