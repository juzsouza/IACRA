import React, { useState } from 'react';
import {
  ShieldCheck,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Calendar,
  Layers,
  AlertTriangle,
  Info,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';
import { RaphaelBillingMemory } from '../utils/raphaelRealBilling';

interface Props {
  memory: RaphaelBillingMemory;
  customAmount: string;
  customDiscount: string;
  onAmountChange: (value: string) => void;
  onDiscountChange: (value: string) => void;
  itemKey: string;
}

export const RaphaelPaymentConfirmationCard: React.FC<Props> = ({
  memory,
  customAmount,
  customDiscount,
  onAmountChange,
  onDiscountChange,
  itemKey,
}) => {
  const [showMemory, setShowMemory] = useState(false);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val);
  };

  return (
    <div className="border-2 border-purple-300 bg-purple-50/40 rounded-2xl p-4 space-y-3.5 shadow-sm">
      {/* Top Banner with Teacher and Stage 5 Identification */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-purple-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center shadow-sm">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-purple-950 uppercase tracking-wide">
                Conferência do Pagamento — Professor Raphael
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-purple-600 text-white">
                ETAPA 5 ATIVA
              </span>
            </div>
            <div className="text-[11px] text-purple-700 font-medium">
              Professor Raphael Augusto Pinto • Competência: {memory.monthLabel}
            </div>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] font-semibold text-zinc-500 block uppercase">
            {memory.targetType === 'group' ? 'Grupo Unificado' : 'Matrícula Individual'}
          </span>
          <span className="text-xs font-bold text-zinc-900">{memory.targetName || 'Aluno'}</span>
        </div>
      </div>

      {/* Contract & Frequency Highlights */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white/90 p-2.5 rounded-xl border border-purple-100 text-xs">
        <div>
          <span className="text-[10px] text-zinc-500 font-medium block">Frequência / Aulas-base</span>
          <span className="font-semibold text-zinc-900 capitalize">
            {memory.frequency === 'quinzenal' ? 'Quinzenal (2 aulas)' : 'Semanal (4 aulas)'}
          </span>
        </div>
        <div>
          <span className="text-[10px] text-zinc-500 font-medium block">Valor Contratado</span>
          <span className="font-semibold text-zinc-900">{formatCurrency(memory.monthlyBasePrice)}</span>
        </div>
        <div>
          <span className="text-[10px] text-zinc-500 font-medium block">Valor por Aula</span>
          <span className="font-semibold text-purple-700">{formatCurrency(memory.pricePerLesson)}</span>
        </div>
        <div>
          <span className="text-[10px] text-zinc-500 font-medium block">Aulas no Mês</span>
          <span className="font-semibold text-zinc-900">
            {memory.regularLessons} normais {memory.extraLessons > 0 ? `(${memory.extraLessons} extra)` : ''}
          </span>
        </div>
      </div>

      {/* Credit & Calculations Breakdown */}
      <div className="bg-white/90 p-3 rounded-xl border border-purple-100 space-y-2 text-xs">
        <div className="flex justify-between items-center text-zinc-700">
          <span className="flex items-center gap-1">
            <span>Aulas Normais ({memory.regularLessons} × {formatCurrency(memory.pricePerLesson)})</span>
          </span>
          <span className="font-semibold">{formatCurrency(memory.regularLessons * memory.pricePerLesson)}</span>
        </div>

        {memory.extraLessons > 0 && (
          <div className="flex justify-between items-center text-emerald-700 font-medium">
            <span>+ Aulas Extras ({memory.extraLessons} aula{memory.extraLessons > 1 ? 's' : ''})</span>
            <span>+ {formatCurrency(memory.extraLessons * memory.pricePerLesson)}</span>
          </div>
        )}

        {memory.creditsAvailableCount > 0 && (
          <div className="flex justify-between items-center text-indigo-700 font-medium">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              {memory.targetType === "group" ? "Créditos Elegíveis para este Grupo" : "Créditos Elegíveis para esta Matrícula"} ({memory.creditsAvailableCount} aula{memory.creditsAvailableCount > 1 ? 's' : ''})
            </span>
            <span>{formatCurrency(memory.creditsAvailableAmount)}</span>
          </div>
        )}

        {memory.creditDiscountAmount > 0 ? (
          <div className="flex justify-between items-center text-emerald-700 font-bold bg-emerald-50/80 px-2 py-1 rounded-lg border border-emerald-200">
            <span>- Crédito Aplicado nesta competência</span>
            <span>- {formatCurrency(memory.creditDiscountAmount)}</span>
          </div>
        ) : (
          <div className="flex justify-between items-center text-zinc-500 text-[11px]">
            <span>Crédito Aplicado</span>
            <span>R$ 0,00</span>
          </div>
        )}

        {/* Final Amount Callout */}
        <div className="flex justify-between items-center pt-2 border-t border-purple-100">
          <div>
            <span className="text-xs font-bold text-purple-950 uppercase tracking-wide block">
              Valor Calculado pelo Motor Raphael:
            </span>
            <span className="text-[10px] text-zinc-500">
              {memory.creditDiscountAmount > 0
                ? `Bruto: ${formatCurrency(memory.grossAmount)} com abatimento de crédito`
                : memory.extraLessons > 0
                ? `Bruto com aula extra: ${formatCurrency(memory.grossAmount)}`
                : `Valor padrão do contrato mantido`}
            </span>
          </div>
          <div className="text-right">
            <span className="text-lg font-black text-purple-900 block">
              {formatCurrency(memory.finalAmount)}
            </span>
          </div>
        </div>
      </div>

      {/* Toggle Memory Button */}
      <div className="pt-0.5">
        <button
          type="button"
          onClick={() => setShowMemory(!showMemory)}
          className="w-full flex items-center justify-center gap-1 text-xs font-semibold text-purple-800 hover:text-purple-950 bg-purple-100/70 hover:bg-purple-200/80 py-1.5 rounded-xl transition-colors"
        >
          {showMemory ? (
            <>
              <span>Ocultar Memória de Cálculo Detalhada</span>
              <ChevronUp className="w-3.5 h-3.5" />
            </>
          ) : (
            <>
              <span>Ver Memória de Cálculo Detalhada (13 Itens)</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </div>

      {/* Expanded Memory Section */}
      {showMemory && (
        <div className="p-3 bg-white rounded-xl border border-purple-200 space-y-3 text-[11px]">
          <div className="font-bold text-zinc-900 flex items-center gap-1 text-xs pb-1 border-b border-zinc-100">
            <Info className="w-3.5 h-3.5 text-purple-600" />
            <span>Memória de Cálculo Oficial — Seção 21</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-zinc-700">
            <div className="flex justify-between border-b border-zinc-50 py-0.5">
              <span className="text-zinc-500">1. Frequência:</span>
              <span className="font-semibold capitalize">{memory.frequency}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-50 py-0.5">
              <span className="text-zinc-500">2. Aulas-base no mês:</span>
              <span className="font-semibold">{memory.baseLessons}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-50 py-0.5">
              <span className="text-zinc-500">3. Valor contratado mensal:</span>
              <span className="font-semibold">{formatCurrency(memory.monthlyBasePrice)}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-50 py-0.5">
              <span className="text-zinc-500">4. Valor unitário por aula:</span>
              <span className="font-semibold">{formatCurrency(memory.pricePerLesson)}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-50 py-0.5">
              <span className="text-zinc-500">5. Aulas normais realizadas:</span>
              <span className="font-semibold">{memory.regularLessons}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-50 py-0.5">
              <span className="text-zinc-500">6. Aulas extras no mês:</span>
              <span className="font-semibold">{memory.extraLessons}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-50 py-0.5">
              <span className="text-zinc-500">7. Canceladas pelo professor:</span>
              <span className="font-semibold">{memory.cancelledLessons}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-50 py-0.5">
              <span className="text-zinc-500">8. Créditos gerados no mês:</span>
              <span className="font-semibold text-emerald-700">
                +{memory.creditsGeneratedCount} ({formatCurrency(memory.creditsGeneratedAmount)})
              </span>
            </div>
            <div className="flex justify-between border-b border-zinc-50 py-0.5">
              <span className="text-zinc-500">
                {memory.targetType === "group"
                  ? "9. Créditos elegíveis para este grupo:"
                  : "9. Créditos elegíveis para esta matrícula:"}
              </span>
              <span className="font-semibold text-indigo-700">
                {memory.creditsAvailableCount} ({formatCurrency(memory.creditsAvailableAmount)})
              </span>
            </div>
            <div className="flex justify-between border-b border-zinc-50 py-0.5">
              <span className="text-zinc-500">10. Créditos consumidos:</span>
              <span className="font-semibold text-purple-700">
                {memory.creditsConsumedCount} ({formatCurrency(memory.creditsConsumedAmount)})
              </span>
            </div>
            <div className="flex justify-between border-b border-zinc-50 py-0.5">
              <span className="text-zinc-500">11. Aulas de reposição realizadas:</span>
              <span className="font-semibold">{memory.makeupLessons}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-50 py-0.5">
              <span className="text-zinc-500">12. Valor bruto apurado:</span>
              <span className="font-semibold">{formatCurrency(memory.grossAmount)}</span>
            </div>
            <div className="flex justify-between sm:col-span-2 bg-purple-50 p-1.5 rounded font-bold text-purple-900">
              <span>13. Valor final com créditos aplicados:</span>
              <span>{formatCurrency(memory.finalAmount)}</span>
            </div>

            {memory.eligibleCreditsDetails && memory.eligibleCreditsDetails.length > 0 && (
              <div className="sm:col-span-2 space-y-1.5 bg-indigo-50/70 p-2.5 rounded-lg border border-indigo-100 text-[11px] mt-1">
                <div className="font-bold text-indigo-950 uppercase tracking-wide flex items-center justify-between">
                  <span>
                    {memory.targetType === "group"
                      ? "Créditos Elegíveis para este Grupo"
                      : "Créditos Elegíveis para esta Matrícula"} ({memory.eligibleCreditsDetails.length}):
                  </span>
                  <span className="text-indigo-700 font-semibold">{formatCurrency(memory.creditsAvailableAmount)}</span>
                </div>
                {memory.eligibleCreditsDetails.map((cd, i) => (
                  <div key={cd.id || i} className="border-t border-indigo-100/60 pt-1 text-zinc-700 space-y-0.5">
                    <div className="flex justify-between font-medium">
                      <span>Origem: {cd.originName}</span>
                      <span className="font-bold text-indigo-800">{formatCurrency(cd.amount)}</span>
                    </div>
                    <div className="text-[10px] text-zinc-500 flex items-center gap-1.5">
                      <span>Aula cancelada pelo Raphael</span>
                      {cd.sourceDate && <span>• Data: {cd.sourceDate}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Detailed classes list */}
          {memory.classifiedClasses.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="font-semibold text-zinc-800 text-[10px] uppercase tracking-wider">
                Aulas Identificadas no Mês ({memory.classifiedClasses.length}):
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                {memory.classifiedClasses.map((c, idx) => (
                  <div
                    key={c.id || idx}
                    className="p-1.5 bg-zinc-50 border border-zinc-100 rounded text-[10px] flex items-center justify-between"
                  >
                    <div>
                      <span className="font-medium text-zinc-900">{c.date}</span>
                      <span className="text-zinc-500 ml-1">({c.title})</span>
                      <span className="text-zinc-400 ml-1">• {c.notes}</span>
                    </div>
                    <span
                      className={`px-1.5 py-0.2 rounded font-semibold text-[9px] ${
                        c.type === 'regular'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : c.type === 'makeup'
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : c.type === 'cancelled_teacher'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : 'bg-zinc-100 text-zinc-600'
                      }`}
                    >
                      {c.type === 'regular'
                        ? 'Normal'
                        : c.type === 'makeup'
                        ? 'Reposição'
                        : c.type === 'cancelled_teacher'
                        ? 'Canc. Professor (Crédito)'
                        : 'Cancelada'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Editable confirmation inputs (prefilled with real calculation) */}
      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-purple-100">
        <div>
          <label className="block text-[11px] font-medium text-zinc-600 mb-1">
            Desconto / Abatimento (R$)
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-zinc-400 text-xs font-medium">
              R$
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={customDiscount}
              onChange={(e) => onDiscountChange(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white text-xs font-semibold text-emerald-700"
              placeholder="0,00"
            />
          </div>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-zinc-600 mb-1">
            Valor Final a Cobrar (R$)
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-zinc-400 text-xs font-medium">
              R$
            </span>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              value={customAmount}
              onChange={(e) => onAmountChange(e.target.value)}
              className="w-full pl-8 pr-2 py-1.5 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none bg-white text-xs font-bold text-purple-950"
              placeholder="0,00"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
