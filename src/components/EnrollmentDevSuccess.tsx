import React from 'react';
import { ArrowRight, BadgeCheck, CalendarDays, CheckCircle2, ClipboardCheck, GraduationCap, ShieldCheck, UserRound, Wallet } from 'lucide-react';
import type { RealDevRequest } from '../services/enrollmentDevReal';

type Destination = 'students' | 'enrollments';
type Props = {
  request: RealDevRequest;
  onNavigate: (view: Destination) => void;
};

const formatMoney = (amount: number) =>
  Number(amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDate = (date?: string | null) => {
  if (!date) return 'Não informada';
  const parts = date.slice(0, 10).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : date;
};

/** Comprovante visual baseado exclusivamente em aprovação confirmada pelo banco DEV. */
export function EnrollmentDevSuccess({ request, onNavigate }: Props): React.ReactElement | null {
  if (request.status !== 'approved' || !request.student_id || !request.enrollment_id) return null;

  const studentName = request.student?.name || 'Aluno cadastrado';

  return (
    <section aria-label="Confirmação da matrícula no banco DEV" className="rounded-2xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
      <div className="p-5 sm:p-7 bg-gradient-to-r from-indigo-50 via-white to-emerald-50 border-b border-indigo-100">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-indigo-100 text-indigo-700 p-3 shrink-0"><GraduationCap size={30} aria-hidden="true"/></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">IACRA • Banco DEV</p>
              <h2 className="text-2xl font-bold text-indigo-950 mt-1">Matrícula registrada!</h2>
              <p className="text-sm text-zinc-600 mt-2">A solicitação foi aprovada e os dois cadastros foram vinculados no ambiente de testes.</p>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-3 py-2 text-sm font-semibold self-start">
            <CheckCircle2 size={18} aria-hidden="true"/> Aprovada no DEV
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-7 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <article className="rounded-xl border border-indigo-100 bg-indigo-50/50 overflow-hidden">
            <div className="p-4 sm:p-5 flex gap-3 items-start">
              <div className="rounded-full bg-indigo-600 text-white w-9 h-9 font-bold flex items-center justify-center shrink-0">1</div>
              <div className="min-w-0">
                <h3 className="font-bold text-indigo-950">Solicitação aprovada</h3>
                <p className="text-sm text-zinc-600">Registro de aceite e aprovação confirmado.</p>
              </div>
            </div>
            <div className="bg-white border-t border-indigo-100 p-4 space-y-3 text-sm">
              <p className="flex items-center gap-2 text-emerald-800 font-semibold"><BadgeCheck size={18} aria-hidden="true"/> Situação: aprovada</p>
              <p className="text-zinc-700"><span className="text-zinc-500">Plano:</span> {request.plan_name}</p>
              <p className="text-zinc-700"><span className="text-zinc-500">Professor:</span> {request.teacher_name}</p>
              {request.group_name && <p className="text-zinc-700"><span className="text-zinc-500">Grupo:</span> {request.group_name}</p>}
              <p className="flex items-center gap-2 text-zinc-700"><Wallet size={16} aria-hidden="true"/> Mensalidade: <strong>{formatMoney(request.monthly_amount)}</strong></p>
            </div>
          </article>

          <article className="rounded-xl border border-indigo-100 bg-indigo-50/50 overflow-hidden">
            <div className="p-4 sm:p-5 flex gap-3 items-start">
              <div className="rounded-full bg-indigo-600 text-white w-9 h-9 font-bold flex items-center justify-center shrink-0">2</div>
              <div className="min-w-0">
                <h3 className="font-bold text-indigo-950">Aluno e matrícula gravados</h3>
                <p className="text-sm text-zinc-600">Dois registros criados e vinculados no DEV.</p>
              </div>
            </div>
            <div className="bg-white border-t border-indigo-100 p-4 space-y-3 text-sm">
              <p className="font-semibold text-zinc-900 flex gap-2 items-center"><UserRound size={17} aria-hidden="true"/> {studentName}</p>
              <p className="flex items-center gap-2 text-emerald-800 font-semibold"><CheckCircle2 size={17} aria-hidden="true"/> Aluno cadastrado</p>
              <p className="flex items-center gap-2 text-emerald-800 font-semibold"><CheckCircle2 size={17} aria-hidden="true"/> Matrícula vinculada</p>
              {request.start_date && <p className="flex items-center gap-2 text-zinc-700"><CalendarDays size={16} aria-hidden="true"/> Início: {formatDate(request.start_date)}</p>}
              <p className="text-xs text-zinc-500 break-all">Código da matrícula: {request.enrollment_id}</p>
            </div>
          </article>
        </div>

        <div role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 flex items-start gap-3">
          <ShieldCheck size={24} className="text-emerald-700 shrink-0" aria-hidden="true"/>
          <div>
            <p className="font-semibold text-emerald-900">Gravação confirmada no IACRA-DEV</p>
            <p className="text-sm text-emerald-900/80 mt-1">O aluno e a matrícula estão vinculados. Esta confirmação é somente de homologação e não é um certificado de assinatura digital.</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => onNavigate('students')} className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 text-white hover:bg-indigo-800 px-4 py-2.5 text-sm font-semibold">
            <UserRound size={16} aria-hidden="true"/> Ver alunos <ArrowRight size={16} aria-hidden="true"/>
          </button>
          <button type="button" onClick={() => onNavigate('enrollments')} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 text-indigo-800 hover:bg-indigo-50 px-4 py-2.5 text-sm font-semibold">
            <ClipboardCheck size={16} aria-hidden="true"/> Ver matrículas <ArrowRight size={16} aria-hidden="true"/>
          </button>
        </div>
      </div>
    </section>
  );
}
