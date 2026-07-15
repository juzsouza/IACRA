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
import { ClassReports } from "./views/ClassReports";
import { Finance } from "./views/Finance";
import { FinancialPlans } from "./views/FinancialPlans";
import { Choir } from "./views/Choir";
import { Enrollments } from "./views/Enrollments";
import { DiscountRules } from "./views/DiscountRules";
import { Payments } from "./views/Payments";
import { Groups } from "./views/Groups";
import { Makeups } from "./views/Makeups";
import { Prospects } from "./views/Prospects";
import { Profiles } from "./views/Profiles";
import { Login } from "./views/Login";
import { NotEligible } from "./views/NotEligible";
import { supabase } from "./lib/supabase";

import { X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

type View =
  | "dashboard"
  | "students"
  | "teachers"
  | "classes"
  | "class_reports"
  | "finance"
  | "financial_plans"
  | "choir"
  | "enrollments"
  | "discount_rules"
  | "payments"
  | "groups"
  | "makeups"
  | "prospects"
  | "profiles"
  | "not_eligible";

function AppContent() {
  const { state, deleteFinancialPlan, setGlobalError, currentUserProfile } = useAppStore();
  const [currentView, setCurrentView] = useState<View>("students");

  useEffect(() => {
    if (currentUserProfile) {
      if (currentUserProfile.role === "teacher") {
        setCurrentView("students");
      } else {
        setCurrentView("dashboard");
      }
    }
  }, [currentUserProfile?.role]);

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
      case "class_reports":
        return <ClassReports />;
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
      case "prospects":
        return <Prospects />;
      case "profiles":
        return <Profiles />;
      case "not_eligible":
        return <NotEligible />;
      default:
        return <Students />;
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
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error getting session, possibly due to network failure:", err);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, []);

  // 5 minutes inactivity and storage/cookie clear checks
  useEffect(() => {
    if (!session) return;

    let timeoutId: any;

    const handleLogout = () => {
      supabase.auth.signOut().catch((err) => {
        console.error("Erro ao realizar saída automática:", err);
      });
    };

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout();
      }, 5 * 60 * 1000); // 5 minutes in milliseconds
    };

    // Listen to user interactions to reset timer
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    // Start inactivity timer initially
    resetTimer();

    // Periodically verify if session storage was cleared (logout/cleared cookies)
    const checkSessionInterval = setInterval(() => {
      const keys = Object.keys(sessionStorage);
      const hasAuthKey = keys.some(key => key.startsWith('sb-') && key.endsWith('-auth-token'));
      if (!hasAuthKey) {
        handleLogout();
      }
    }, 2000);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      clearInterval(checkSessionInterval);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [session]);

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
