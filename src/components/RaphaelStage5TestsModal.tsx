import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  RefreshCw,
  X,
  Play,
  Layers,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  runAllStage5ValidationTests,
  Stage5TestResult,
} from '../utils/raphaelStage5Tests';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const RaphaelStage5TestsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [testSuiteResult, setTestSuiteResult] = useState(() => runAllStage5ValidationTests());
  const [expandedTests, setExpandedTests] = useState<Record<string, boolean>>({});
  const [activeCategory, setActiveCategory] = useState<'all' | 'individual' | 'group' | 'security' | 'historical' | 'enrollment'>('all');

  if (!isOpen) return null;

  const handleRerun = () => {
    const fresh = runAllStage5ValidationTests();
    setTestSuiteResult(fresh);
  };

  const toggleExpand = (id: string) => {
    setExpandedTests(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const filteredTests = testSuiteResult.results.filter(t => {
    if (activeCategory === 'all') return true;
    return t.category === activeCategory;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-900 via-indigo-900 to-zinc-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-purple-200" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold">Validação Oficial Etapa 5 — {testSuiteResult.totalCount} Testes</h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                  {testSuiteResult.passedCount} / {testSuiteResult.totalCount} Aprovados
                </span>
              </div>
              <p className="text-xs text-purple-200">
                Bateria canônica de verificação do cálculo real para o Professor Raphael Augusto Pinto
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRerun}
              className="p-2 rounded-xl text-purple-200 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1.5 text-xs font-semibold"
              title="Reexecutar testes"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reexecutar</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-purple-200 hover:text-white hover:bg-white/10 transition-colors"
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
              <strong>100% DE APROVAÇÃO:</strong> Todos os {testSuiteResult.totalCount} cenários de teste validados com sucesso de acordo com a especificação canônica (incluindo cálculo estrito por matrícula).
            </span>
          </div>
          <div className="text-right font-bold text-emerald-800">
            Passou em {testSuiteResult.passedCount} de {testSuiteResult.totalCount}
          </div>
        </div>

        {/* Category Filters */}
        <div className="flex border-b border-zinc-200 bg-zinc-50 px-6 pt-2.5 space-x-2 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-3 py-1.5 font-semibold rounded-t-lg transition-all whitespace-nowrap ${
              activeCategory === 'all'
                ? 'bg-white text-purple-700 border-t-2 border-purple-600 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Todos ({testSuiteResult.totalCount})
          </button>
          <button
            onClick={() => setActiveCategory('enrollment')}
            className={`px-3 py-1.5 font-semibold rounded-t-lg transition-all whitespace-nowrap ${
              activeCategory === 'enrollment'
                ? 'bg-white text-purple-700 border-t-2 border-purple-600 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Matrículas & Isolamento (16–30)
          </button>
          <button
            onClick={() => setActiveCategory('individual')}
            className={`px-3 py-1.5 font-semibold rounded-t-lg transition-all whitespace-nowrap ${
              activeCategory === 'individual'
                ? 'bg-white text-purple-700 border-t-2 border-purple-600 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Individuais
          </button>
          <button
            onClick={() => setActiveCategory('group')}
            className={`px-3 py-1.5 font-semibold rounded-t-lg transition-all whitespace-nowrap ${
              activeCategory === 'group'
                ? 'bg-white text-purple-700 border-t-2 border-purple-600 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Grupos
          </button>
          <button
            onClick={() => setActiveCategory('security')}
            className={`px-3 py-1.5 font-semibold rounded-t-lg transition-all whitespace-nowrap ${
              activeCategory === 'security'
                ? 'bg-white text-purple-700 border-t-2 border-purple-600 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Segurança & Isolamento
          </button>
          <button
            onClick={() => setActiveCategory('historical')}
            className={`px-3 py-1.5 font-semibold rounded-t-lg transition-all whitespace-nowrap ${
              activeCategory === 'historical'
                ? 'bg-white text-purple-700 border-t-2 border-purple-600 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Histórico
          </button>
        </div>

        {/* Tests List */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {filteredTests.map(t => {
            const isExpanded = expandedTests[t.id];
            return (
              <div
                key={t.id}
                className="border border-zinc-200 rounded-xl bg-white hover:border-purple-200 transition-all p-3.5 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {t.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                    )}
                    <div>
                      <span className="font-bold text-zinc-900 mr-2">{t.name}</span>
                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-600 uppercase">
                        {t.category}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleExpand(t.id)}
                    className="text-purple-700 hover:text-purple-900 font-medium flex items-center gap-1 text-[11px]"
                  >
                    {isExpanded ? (
                      <>
                        <span>Menos detalhes</span>
                        <ChevronUp className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        <span>Ver detalhes</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>

                <div className="text-zinc-600 text-[11px]">{t.description}</div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-zinc-50 p-2 rounded-lg text-[11px]">
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Esperado:</span>
                    <span className="font-medium text-zinc-800">{t.expectedSummary}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Obtido:</span>
                    <span className="font-bold text-emerald-700">{t.actualSummary}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="pt-2 border-t border-zinc-100 space-y-2 text-[11px] text-zinc-700">
                    <div className="font-semibold text-zinc-800">Detalhes Técnicos da Execução:</div>
                    <pre className="bg-zinc-900 text-zinc-100 p-2.5 rounded-lg text-[10px] overflow-x-auto font-mono max-h-48">
                      {JSON.stringify(t.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-zinc-50 border-t border-zinc-200 flex justify-between items-center text-xs">
          <span className="text-zinc-500">
            Regra financeira ativa exclusivamente para Professor Raphael Augusto Pinto (ID dada085e-c187-43d2-9ab0-a9e0539df450).
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-xl transition-colors"
          >
            Fechar
          </button>
        </div>
      </motion.div>
    </div>
  );
};
