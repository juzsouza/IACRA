import React, { useState, useMemo } from 'react';
import {
  ChoirCollaborator,
  ChoirRehearsal,
  parseAttendance
} from '../store';
import {
  Calendar,
  DollarSign,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  ChevronDown,
  ChevronUp,
  Info,
  ShieldCheck,
  Eye
} from 'lucide-react';

interface ChoirMonthlyClosingTabProps {
  collaborators: ChoirCollaborator[];
  rehearsals: ChoirRehearsal[];
  formatCurrency: (val: number) => string;
}

// Known canonical collaborators for July 2026
const JULY_2026_CANONICAL_COLLABORATOR_IDS = [
  '03dbe8ee-0535-4ea3-940e-d22cce28e06a', // Abigail Vieira Rodrigues
  'ea579d6f-7767-4495-89d5-353ab321edc7', // Rafaela Oliveira Cintra
  'f5e0dc8e-67b2-4633-9c7b-25f363c3b286', // Rodrigo Augusto Ferreira Nunes
  'bb38b71e-1801-4275-a1c6-c8310ff86083', // Daniele Pereira da Costa
  '095d231f-ee87-44e4-9a31-f6cda1566e1f', // Nicolle Zulli
  '74dd1b38-0805-4cf7-8df7-1e45312d6458', // Jonatas Roberto vaz
  '99569c0b-819c-4e9f-ac9d-6c9774403cc8'  // Camila Eugênia (Preparadora do coral)
];

// Deprecated / historical duplicates explicitly excluded
const DEPRECATED_DUPLICATE_IDS = [
  '93bbaa68-ceab-4023-b34b-ce9c2f50b8ff', // Camila / Regente / R$ 0,00
  '8a54827a-859e-4761-b16c-aa999c4ceca3'  // Camila Eugênia da Silva / Assistente / R$ 60,00
];

export const ChoirMonthlyClosingTab: React.FC<ChoirMonthlyClosingTabProps> = ({
  collaborators,
  rehearsals,
  formatCurrency
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-07');
  const [expandedRehearsalId, setExpandedRehearsalId] = useState<string | null>(null);

  // Month options
  const monthOptions = [
    { value: '2026-07', label: 'Julho / 2026' },
    { value: '2026-08', label: 'Agosto / 2026' },
    { value: '2026-09', label: 'Setembro / 2026' }
  ];

  // Specific simulation logic for July 2026 and dynamic for other months
  const closingSimulation = useMemo(() => {
    // 1. Identify valid and cancelled rehearsals for the selected month
    const monthRehearsals = rehearsals.filter(r => r.date && r.date.startsWith(selectedMonth));
    
    // For July 2026: 02/07 and 16/07 are valid; 30/07 is cancelled
    let validRehearsals: ChoirRehearsal[] = [];
    let excludedRehearsals: Array<{ date: string; title: string; reason: string }> = [];

    if (selectedMonth === '2026-07') {
      validRehearsals = monthRehearsals
        .filter(r => r.date === '2026-07-02' || r.date === '2026-07-16')
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      excludedRehearsals = [
        {
          date: '2026-07-30',
          title: 'Ensaio Quinzenal do Coral #3',
          reason: 'CANCELADO — Não participou da apuração de presenças e repasses.'
        }
      ];
    } else {
      // Dynamic for other months
      validRehearsals = monthRehearsals
        .filter(r => (r.status as string) !== 'cancelled')
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      excludedRehearsals = monthRehearsals
        .filter(r => (r.status as string) === 'cancelled')
        .map(r => ({
          date: r.date,
          title: r.title,
          reason: 'CANCELADO'
        }));
    }

    // 2. Identify eligible collaborators
    let eligibleCollaborators: ChoirCollaborator[] = [];

    if (selectedMonth === '2026-07') {
      // Strictly 7 unique canonical collaborators
      eligibleCollaborators = collaborators.filter(c =>
        JULY_2026_CANONICAL_COLLABORATOR_IDS.includes(c.id)
      );
    } else {
      // For other months: filter out deprecated duplicates and ensure created_at is within or before selected month
      // Rule for Inactive Collaborators:
      // An inactive collaborator (active === false) is ONLY eligible if they had actual presence recorded in at least one valid rehearsal of that month.
      // If inactive and had 0 presences, they are excluded from the monthly payout table.
      eligibleCollaborators = collaborators.filter(c => {
        if (DEPRECATED_DUPLICATE_IDS.includes(c.id)) return false;
        if (c.created_at && c.created_at.substring(0, 7) > selectedMonth) return false;

        const isInactive = c.active === false;
        if (isInactive) {
          const hasPresenceInMonth = validRehearsals.some(reh => {
            const attList = parseAttendance(reh.attendance);
            const rec = attList.find(a => a.person_id === c.id && a.type === 'collaborator');
            return rec?.status === 'present';
          });
          if (!hasPresenceInMonth) return false;
        }

        return true;
      });
    }

    // Sort collaborators by name
    eligibleCollaborators.sort((a, b) => a.name.localeCompare(b.name));

    // 3. Compute attendance and payout per collaborator
    let totalPresentsCount = 0;
    let totalPayoutAmount = 0;

    const rows = eligibleCollaborators.map(collab => {
      const attendancePerDate: Record<string, { status: 'present' | 'absent'; isPresent: boolean }> = {};
      let presents = 0;

      validRehearsals.forEach(reh => {
        const attList = parseAttendance(reh.attendance);
        const record = attList.find(a => a.person_id === collab.id && a.type === 'collaborator');
        const isPresent = record?.status === 'present';
        attendancePerDate[reh.date] = {
          status: isPresent ? 'present' : 'absent',
          isPresent
        };
        if (isPresent) {
          presents++;
        }
      });

      const unitRate = collab.remuneration_value || 0;
      const totalCollabPayout = presents * unitRate;

      totalPresentsCount += presents;
      totalPayoutAmount += totalCollabPayout;

      return {
        collaborator: collab,
        unitRate,
        attendancePerDate,
        presentsCount: presents,
        totalPayout: totalCollabPayout
      };
    });

    return {
      validRehearsals,
      excludedRehearsals,
      eligibleCount: eligibleCollaborators.length,
      rows,
      totalPresentsCount,
      totalPayoutAmount
    };
  }, [collaborators, rehearsals, selectedMonth]);

  return (
    <div id="choir-monthly-closing-container" className="space-y-6">
      {/* Header card with month selection & Mode Badge */}
      <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-zinc-900">
              FECHAMENTO MENSAL — {selectedMonth === '2026-07' ? 'JULHO/2026' : selectedMonth}
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
              🟡 MODO CONFERÊNCIA / SIMULAÇÃO
            </span>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Este resultado é apenas para conferência. Nenhum dado foi alterado no banco de dados.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-zinc-600">Competência:</span>
          <select
            id="select-closing-month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3.5 py-2 border border-zinc-200 rounded-xl text-xs font-bold bg-zinc-50 text-zinc-800 focus:bg-white focus:ring-2 focus:ring-indigo-500"
          >
            {monthOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ensaios Considerados</p>
          <p className="text-2xl font-bold text-indigo-600 mt-2">{closingSimulation.validRehearsals.length}</p>
          <p className="text-[11px] text-zinc-400 mt-1">Ensaios válidos na competência</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Ensaios Cancelados</p>
          <p className="text-2xl font-bold text-amber-600 mt-2">{closingSimulation.excludedRehearsals.length}</p>
          <p className="text-[11px] text-zinc-400 mt-1">Excluídos da apuração</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Colaboradores Elegíveis</p>
          <p className="text-2xl font-bold text-zinc-900 mt-2">{closingSimulation.eligibleCount}</p>
          <p className="text-[11px] text-zinc-400 mt-1">Pessoas físicas únicas</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Total de Presenças</p>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{closingSimulation.totalPresentsCount}</p>
          <p className="text-[11px] text-zinc-400 mt-1">Presenças confirmadas</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm bg-gradient-to-br from-white to-emerald-50/40">
          <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">Total de Repasse</p>
          <p className="text-2xl font-bold text-emerald-700 mt-2">{formatCurrency(closingSimulation.totalPayoutAmount)}</p>
          <p className="text-[11px] text-emerald-600 font-medium mt-1">Apenas colaboradores únicos</p>
        </div>
      </div>

      {/* Main Closing Table */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div className="font-bold text-zinc-900 text-sm flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" />
            <span>Apuração Nominal de Colaboradores e Repasses</span>
          </div>
          <span className="text-xs text-zinc-500 font-medium">
            1 pessoa real = 1 linha no fechamento
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-zinc-200 text-xs">
            <thead className="bg-zinc-50">
              <tr>
                <th scope="col" className="px-5 py-3 text-left font-semibold text-zinc-600 uppercase tracking-wider">
                  COLABORADOR
                </th>
                <th scope="col" className="px-5 py-3 text-left font-semibold text-zinc-600 uppercase tracking-wider">
                  FUNÇÃO
                </th>
                <th scope="col" className="px-5 py-3 text-right font-semibold text-zinc-600 uppercase tracking-wider">
                  REMUNERAÇÃO
                </th>
                {closingSimulation.validRehearsals.map(reh => {
                  const dateFormatted = reh.date ? reh.date.split('-').reverse().slice(0, 2).join('/') : '';
                  return (
                    <th key={reh.id} scope="col" className="px-4 py-3 text-center font-semibold text-zinc-600 uppercase tracking-wider">
                      {dateFormatted}
                    </th>
                  );
                })}
                <th scope="col" className="px-5 py-3 text-center font-semibold text-zinc-600 uppercase tracking-wider">
                  PRESENÇAS
                </th>
                <th scope="col" className="px-5 py-3 text-right font-semibold text-zinc-600 uppercase tracking-wider">
                  TOTAL
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-zinc-200">
              {closingSimulation.rows.map((row) => (
                <tr key={row.collaborator.id} className="hover:bg-zinc-50/80 transition-colors">
                  <td className="px-5 py-3.5 whitespace-nowrap font-bold text-zinc-900">
                    {row.collaborator.name.trim()}
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-zinc-600 font-medium">
                    <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-700 text-[11px]">
                      {row.collaborator.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-right font-medium text-zinc-700">
                    {formatCurrency(row.unitRate)}
                  </td>
                  {closingSimulation.validRehearsals.map(reh => {
                    const att = row.attendancePerDate[reh.date];
                    const isPresent = att?.isPresent;
                    return (
                      <td key={reh.id} className="px-4 py-3.5 whitespace-nowrap text-center">
                        {isPresent ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Presente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800">
                            <XCircle className="w-3.5 h-3.5" />
                            Ausente
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-5 py-3.5 whitespace-nowrap text-center font-bold text-zinc-900">
                    <span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-extrabold text-xs">
                      {row.presentsCount}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 whitespace-nowrap text-right font-black text-emerald-700 text-sm">
                    {formatCurrency(row.totalPayout)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-zinc-50/90 font-bold border-t-2 border-zinc-200">
              <tr>
                <td colSpan={2} className="px-5 py-3.5 text-zinc-900 text-xs uppercase tracking-wider">
                  Total Geral Apurado
                </td>
                <td className="px-5 py-3.5 text-right text-zinc-500">—</td>
                {closingSimulation.validRehearsals.map(reh => (
                  <td key={reh.id} className="px-4 py-3.5 text-center text-zinc-500">—</td>
                ))}
                <td className="px-5 py-3.5 text-center text-indigo-950 font-extrabold text-xs">
                  {closingSimulation.totalPresentsCount} presenças
                </td>
                <td className="px-5 py-3.5 text-right font-black text-emerald-800 text-base">
                  {formatCurrency(closingSimulation.totalPayoutAmount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Rehearsals Detailed Breakdown (Expandable) */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 space-y-4">
        <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-indigo-600" />
          <span>Conferência Detalhada dos Ensaios da Competência</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {closingSimulation.validRehearsals.map(reh => {
            const dateFormatted = reh.date ? new Date(reh.date + 'T00:00:00').toLocaleDateString('pt-BR') : '';
            const attList = parseAttendance(reh.attendance);
            const isExpanded = expandedRehearsalId === reh.id;

            return (
              <div key={reh.id} className="border border-zinc-200 rounded-xl overflow-hidden bg-zinc-50/50">
                <div
                  onClick={() => setExpandedRehearsalId(isExpanded ? null : reh.id)}
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-100/70 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-zinc-900">{dateFormatted}</span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700">
                        {reh.title || 'Ensaio'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">Horário: {reh.time || '19:30'}</p>
                  </div>
                  <button className="text-zinc-400 hover:text-zinc-600 p-1">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {isExpanded && (
                  <div className="p-4 border-t border-zinc-200 bg-white space-y-2">
                    <p className="text-xs font-bold text-zinc-700 uppercase tracking-wider">
                      Presença dos Colaboradores Elegíveis:
                    </p>
                    <div className="space-y-1.5 pt-1">
                      {closingSimulation.rows.map(row => {
                        const rec = attList.find(a => a.person_id === row.collaborator.id && a.type === 'collaborator');
                        const isPresent = rec?.status === 'present';
                        return (
                          <div key={row.collaborator.id} className="flex items-center justify-between text-xs py-1 border-b border-zinc-100 last:border-0">
                            <span className="font-medium text-zinc-800">{row.collaborator.name.trim()}</span>
                            {isPresent ? (
                              <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">Presente</span>
                            ) : (
                              <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">Ausente</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Excluded Rehearsals Section */}
      {closingSimulation.excludedRehearsals.length > 0 && (
        <div className="bg-amber-50/50 rounded-2xl border border-amber-200/80 p-5 space-y-3">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Ensaios Excluídos da Competência</span>
          </div>
          <div className="space-y-2">
            {closingSimulation.excludedRehearsals.map((ex, idx) => {
              const dateFormatted = ex.date ? new Date(ex.date + 'T00:00:00').toLocaleDateString('pt-BR') : ex.date;
              return (
                <div key={idx} className="bg-white p-3 rounded-xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-900">{dateFormatted}</span>
                    <span className="text-zinc-600">— {ex.title}</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full font-bold bg-rose-100 text-rose-800">
                    {ex.reason}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
