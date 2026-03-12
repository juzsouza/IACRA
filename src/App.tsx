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

type View = "dashboard" | "students" | "teachers" | "classes" | "finance" | "financial_plans" | "choir" | "enrollments" | "discount_rules" | "payments" | "groups" | "makeups";

function AppContent() {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const { state, deleteFinancialPlan } = useAppStore();

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
