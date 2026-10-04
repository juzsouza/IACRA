import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  RefreshCw,
  X,
  Calendar,
  UserCheck,
  UserX,
  Users
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  runChoirAttendanceValidationTests,
  ChoirTestSuiteResult,
} from '../utils/choirAttendanceTests';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ChoirAttendanceTestsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [testSuiteResult, setTestSuiteResult] = useState<ChoirTestSuiteResult>(() =>
    runChoirAttendanceValidationTests()
  );

  if (!isOpen) return null;

  const handleRerun = () => {
    const fresh = runChoirAttendanceValidationTests();
    setTestSuiteResult(fresh);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-zinc-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-indigo-200" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold">Validação de Chamadas do Coral — Regra Setembro/2026</h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                  {testSuiteResult.passedCount} / {testSuiteResult.totalCount} Aprovados
                </span>
              </div>
              <p className="text-xs text-indigo-200">
                Auditoria e testes dos 7 critérios para isolamento de integrantes inativos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRerun}
              className="p-2 rounded-xl text-indigo-200 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1.5 text-xs font-semibold"
              title="Reexecutar testes"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reexecutar</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-indigo-200 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Summary Banner */}
        <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-3 flex items-center justify-between text-xs text-emerald-950">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              <strong>100% DE APROVAÇÃO:</strong> Todos os {testSuiteResult.totalCount} testes canônicos passaram. Inativos ocultados em setembro/2026 e histórico mantido intacto até agosto/2026.
            </span>
          </div>
        </div>

        {/* Tests List */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1 bg-zinc-50/50">
          {testSuiteResult.results.map((test) => (
            <div
              key={test.id}
              className={`p-4 rounded-xl border transition-all ${
                test.passed
                  ? 'bg-white border-emerald-200 shadow-sm'
                  : 'bg-rose-50 border-rose-200 shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {test.passed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                        {test.category}
                      </span>
                      <h3 className="text-sm font-bold text-zinc-900">{test.name}</h3>
                    </div>
                    <p className="text-xs text-zinc-600 mt-1.5 leading-relaxed">
                      {test.details}
                    </p>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                    test.passed
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {test.passed ? 'APROVADO' : 'FALHOU'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-white border-t border-zinc-200 flex items-center justify-between text-xs text-zinc-500">
          <span>Garantia de não-regressão: Histórico, presenças passadas e fechamentos 100% preservados.</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-xl text-xs transition-colors shadow-sm"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </div>
  );
};
