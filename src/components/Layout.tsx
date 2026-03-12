import React, { useState } from "react";
import {
  Users,
  GraduationCap,
  CalendarDays,
  Wallet,
  LayoutDashboard,
  Menu,
  X,
  Music,
  LogOut,
  RefreshCcw,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { motion, AnimatePresence } from "motion/react";

type View = "dashboard" | "students" | "teachers" | "classes" | "finance" | "financial_plans" | "choir" | "enrollments" | "discount_rules" | "payments" | "groups" | "makeups";

interface LayoutProps {
  children: React.ReactNode;
  currentView: View;
  onViewChange: (view: View) => void;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  currentView,
  onViewChange,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "students", label: "Alunos", icon: Users },
    { id: "enrollments", label: "Matrículas", icon: GraduationCap },
    { id: "groups", label: "Grupos", icon: Users },
    { id: "payments", label: "Pagamentos", icon: Wallet },
    { id: "teachers", label: "Professores", icon: GraduationCap },
    { id: "classes", label: "Aulas", icon: CalendarDays },
    { id: "makeups", label: "Reposições", icon: RefreshCcw },
    { id: "finance", label: "Financeiro", icon: Wallet },
    { id: "financial_plans", label: "Planos", icon: Wallet },
    { id: "discount_rules", label: "Regras de Desconto", icon: Wallet },
    { id: "choir", label: "Coral", icon: Users },
  ] as const;

  return (
    <div className="min-h-screen bg-zinc-50 flex text-zinc-900 font-sans">
      {/* Mobile sidebar backdrop */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/20 z-40 lg:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-zinc-200 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-16 flex items-center px-6 border-b border-zinc-100">
          <Music className="w-6 h-6 text-indigo-600 mr-3" />
          <span className="font-semibold text-lg tracking-tight">
            MusicManager
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden text-zinc-400 hover:text-zinc-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onViewChange(item.id);
                  setSidebarOpen(false);
                }}
                className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-colors ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                }`}
              >
                <Icon
                  className={`w-5 h-5 mr-3 ${isActive ? "text-indigo-600" : "text-zinc-400"}`}
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zinc-100">
          <div className="flex items-center px-3 py-2 justify-between">
            <div className="flex items-center">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-sm">
                A
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-zinc-900">Admin</p>
                <p className="text-xs text-zinc-500">Escola de Música</p>
              </div>
            </div>
            <button
              onClick={() => supabase.auth.signOut()}
              className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
              title="Sair"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 bg-white border-b border-zinc-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 text-zinc-500 hover:text-zinc-700 rounded-lg hover:bg-zinc-100"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-4 ml-auto">
            <span className="text-sm text-zinc-500 font-medium">
              {new Date().toLocaleDateString("pt-BR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="max-w-7xl mx-auto"
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
};
