import { splitBoldSegments } from './termBoldMarkup.ts';
import type { RealDevRequest, RealDevTermAudit } from '../services/enrollmentDevReal';

const safe = (value: unknown): string =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Não registrado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Não registrado' :
    date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}
function formatDate(value: string | null | undefined): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}/.test(value)) return 'Não registrada';
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}
function formatMoney(amount: number): string {
  return Number.isFinite(Number(amount)) ?
    Number(amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) :
    'Não informado';
}
const field = (label: string, value: unknown) =>
  `<div class="field"><div class="label">${safe(label)}</div><div class="value">${safe(value)}</div></div>`;

/** Montagem local, sem transmissão de dados a serviços de PDF.
 * Todo valor do banco é tratado como texto puro, jamais HTML.
 */
export function buildDevEnrollmentReceiptHtml(request: RealDevRequest, audit: RealDevTermAudit): string {
  if (request.status !== 'approved' || audit.status !== 'approved' ||
      !request.enrollment_id || !audit.enrollment_id ||
      request.enrollment_id !== audit.enrollment_id ||
      !request.student_id || request.student_id !== audit.student_id) {
    throw new Error('Comprovante disponível somente para matrícula aprovada e vinculada no DEV.');
  }
  const termHtml = splitBoldSegments(audit.term_body || '').map(segment =>
    segment.bold ? `<strong>${safe(segment.text)}</strong>` : safe(segment.text)
  ).join('');
  const enrollmentCode = request.enrollment_id;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Comprovante DEV - ${safe(enrollmentCode)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #20283e; margin: 0; line-height: 1.45; font-size: 11pt; }
  .controls { padding: 14px; background: #f1f3fc; display: flex; gap: 12px; align-items: center; justify-content: center; }
  button { padding: 10px 16px; border: 0; border-radius: 8px; background: #4438bb; color: white; font: bold 14px Arial; cursor: pointer; }
  .controls span { color: #3d4160; font-size: 13px; }
  .sheet { max-width: 210mm; margin: 0 auto; padding: 18mm 16mm; }
  .dev { color: #4338ca; font-weight: 700; font-size: 10pt; letter-spacing: 1px; }
  h1 { font-size: 21pt; margin: 6px 0; }
  h2 { font-size: 13pt; margin: 22px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #cfd3e3; }
  .sub { color: #666d82; }
  .warning { border: 1px solid #d8b955; color: #7d5900; background: #fff9df; border-radius: 8px; padding: 12px; margin: 20px 0; font-weight: 600; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 18px; }
  .field { break-inside: avoid; overflow-wrap: anywhere; }
  .label { font-size: 9pt; color: #656e80; }
  .value { margin-top: 3px; font-weight: 600; }
  .term { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 10pt; line-height: 1.55; }
  .footer { margin-top: 30px; border-top: 1px solid #d4d8e5; padding-top: 12px; font-size: 9pt; color: #61687a; }
  @media print { .controls { display: none; } .sheet { margin: 0; padding: 0; max-width: unset; } .warning { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style></head><body>
<div class="controls"><button type="button" onclick="window.print()">Imprimir / Salvar em PDF</button><span>Na impressão, escolha “Salvar como PDF”.</span></div>
<main class="sheet">
  <div class="dev">IACRA · AMBIENTE DE TESTES</div>
  <h1>Comprovante de matrícula</h1>
  <div class="sub">Registro de homologação — não é documento oficial nem certificado de assinatura digital.</div>
  <div class="warning">SIMULAÇÃO — IACRA-DEV · Dados fictícios · Sem validade para matrícula real.</div>
  <h2>Dados da matrícula</h2>
  <div class="fields">
    ${field('Aluno', request.student?.name || 'Não informado')}
    ${field('Situação', 'Aprovada no DEV')}
    ${field('Plano', request.plan_name)}
    ${field('Professor', request.teacher_name)}
    ${field('Grupo', request.group_name || 'Não vinculado')}
    ${field('Mensalidade acordada no convite', formatMoney(request.monthly_amount))}
    ${field('Data da matrícula', formatDate(request.enrollment_date))}
    ${field('Início das aulas', formatDate(request.start_date))}
    ${field('Vencimento', request.due_day ? 'Dia ' + request.due_day : 'Não informado')}
    ${field('Identificador da matrícula', enrollmentCode)}
  </div>
  <h2>Histórico de aceite e aprovação</h2>
  <div class="fields">
    ${field('Aceite registrado em', formatTimestamp(audit.accepted_at))}
    ${field('Aprovação registrada em', formatTimestamp(audit.reviewed_at))}
    ${field('Identificador do responsável', audit.reviewed_by || 'Não registrado')}
    ${field('Código da solicitação', request.id)}
  </div>
  <p class="sub" style="font-size: 9pt">Mensalidade referente ao convite original de teste. Alterações posteriores no financeiro não são refletidas neste comprovante.</p>
  <h2>Texto do termo aceito (cópia de teste)</h2>
  <h3 style="font-size: 12pt">${safe(audit.term_title)}</h3>
  <div class="term">${termHtml}</div>
  <div class="footer">Este comprovante reproduz registros do IACRA-DEV exclusivamente para homologação. Não comprova identidade nem substitui uma assinatura eletrônica validada.</div>
</main></body></html>`;
}

export function openDevEnrollmentReceipt(request: RealDevRequest, audit: RealDevTermAudit): void {
  const html = buildDevEnrollmentReceiptHtml(request, audit);
  const page = window.open('', '_blank');
  if (!page) throw new Error('O navegador bloqueou a janela do comprovante. Permita pop-ups para o Codespaces e tente novamente.');
  page.opener = null;
  page.document.open();
  page.document.write(html);
  page.document.close();
  page.focus();
}
