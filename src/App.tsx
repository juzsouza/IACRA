/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { AppProvider, useAppStore } from "./store";
import { Layout } from "./components/Layout";
import { Dashboard } from "./views/Dashboard";
import { Students } from "./views/Students";
import { Teachers } from "./views/Teachers";
import { Classes } from "./views/Classes";
import { Finance } from "./views/Finance";
import { FinancialPlans } from "./views/FinancialPlans";
import { Choir } from "./views/Choir";
import { Enrollments } from "./views/Enrollments";
import { DiscountRules } from "./views/DiscountRules";
import { Payments } from "./views/Payments";
import { Groups } from "./views/Groups";
import { Makeups } from "./views/Makeups";
import { Login } from "./views/Login";
import { supabase } from "./lib/supabase";

import { X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

type View = "dashboard" | "students" | "teachers" | "classes" | "finance" | "financial_plans" | "choir" | "enrollments" | "discount_rules" | "payments" | "groups" | "makeups";

function AppContent() {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const { state, deleteFinancialPlan, setGlobalError } = useAppStore();

  useEffect(() => {
    // Cleanup Acordo Especial plans
    const plansToRemove = state.financialPlans.filter(p => p.name.startsWith('Acordo Especial -'));
    plansToRemove.forEach(plan => {
      deleteFinancialPlan(plan.id);
    });
  }, [state.financialPlans.length]);

  const renderView = () => {
    switch (currentView) {
      case "dashboard":
        return <Dashboard />;
      case "students":
        return <Students />;
      case "teachers":
        return <Teachers />;
      case "classes":
        return <Classes />;
      case "finance":
        return <Finance />;
      case "financial_plans":
        return <FinancialPlans />;
      case "choir":
        return <Choir />;
      case "enrollments":
        return <Enrollments />;
      case "discount_rules":
        return <DiscountRules />;
      case "payments":
        return <Payments />;
      case "groups":
        return <Groups />;
      case "makeups":
        return <Makeups />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout currentView={currentView} onViewChange={setCurrentView}>
      <AnimatePresence>
        {state.globalError && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 right-4 z-50 max-w-md bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-xl shadow-lg flex items-start justify-between"
          >
            <span className="text-sm font-medium mr-4">{state.globalError}</span>
            <button
              onClick={() => setGlobalError(null)}
              className="p-1 hover:bg-rose-100 rounded-lg transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {renderView()}
    </Layout>
  );
}

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-50">Carregando...</div>;
  }

  if (!session) {
    return <Login />;
  }

  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
