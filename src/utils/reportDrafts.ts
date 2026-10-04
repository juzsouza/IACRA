/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ReportDraft {
  classId: string;
  report: string;
  vocal_routine?: string;
  attendance?: Record<string, "present" | "absent">;
  updatedAt: number;
}

const DRAFT_PREFIX = 'eavra_draft_report_';
const ACTIVE_DRAFT_KEY = 'eavra_active_draft_class_id';
const ACTIVE_DRAFT_VIEW_KEY = 'eavra_active_draft_view';
const DRAFT_REGISTRY_KEY = 'eavra_all_draft_class_ids';

function getDraftRegistry(): string[] {
  try {
    const raw = localStorage.getItem(DRAFT_REGISTRY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setDraftRegistry(ids: string[]): void {
  try {
    const unique = Array.from(new Set(ids));
    localStorage.setItem(DRAFT_REGISTRY_KEY, JSON.stringify(unique));
  } catch (e) {
    console.warn('[ReportDrafts] Erro ao salvar registro de rascunhos:', e);
  }
}

/**
 * Salva automaticamente o rascunho de relatório de uma aula em localStorage.
 */
export function saveReportDraft(
  classId: string,
  data: {
    report: string;
    vocal_routine?: string;
    attendance?: Record<string, "present" | "absent">;
  }
): void {
  if (!classId) return;
  try {
    const draft: ReportDraft = {
      classId,
      report: data.report || '',
      vocal_routine: data.vocal_routine || '',
      attendance: data.attendance || {},
      updatedAt: Date.now(),
    };
    localStorage.setItem(`${DRAFT_PREFIX}${classId}`, JSON.stringify(draft));

    // Atualiza registro de rascunhos ativos
    const registry = getDraftRegistry();
    if (!registry.includes(classId)) {
      setDraftRegistry([...registry, classId]);
    }
  } catch (e) {
    console.warn(`[ReportDrafts] Erro ao salvar rascunho da aula ${classId}:`, e);
  }
}

/**
 * Recupera o rascunho salvo de uma aula.
 */
export function getReportDraft(classId: string): ReportDraft | null {
  if (!classId) return null;
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${classId}`);
    if (!raw) return null;
    const parsed: ReportDraft = JSON.parse(raw);
    return parsed;
  } catch (e) {
    console.warn(`[ReportDrafts] Erro ao ler rascunho da aula ${classId}:`, e);
    return null;
  }
}

/**
 * Verifica se existe rascunho com conteúdo para a aula informada.
 */
export function hasReportDraft(classId: string): boolean {
  const draft = getReportDraft(classId);
  if (!draft) return false;
  const hasRep = !!draft.report && draft.report.trim().length > 0;
  const hasVoc = !!draft.vocal_routine && draft.vocal_routine.trim().length > 0;
  const hasAtt = !!draft.attendance && Object.keys(draft.attendance).length > 0;
  return hasRep || hasVoc || hasAtt;
}

/**
 * Limpa o rascunho de uma aula específica após salvar ou descartar.
 */
export function clearReportDraft(classId: string): void {
  if (!classId) return;
  try {
    localStorage.removeItem(`${DRAFT_PREFIX}${classId}`);
    const registry = getDraftRegistry().filter((id) => id !== classId);
    setDraftRegistry(registry);

    // Se a aula que foi salva for a ativa, limpa a referência ativa
    if (getActiveDraftClassId() === classId) {
      clearActiveDraftClassId();
    }
  } catch (e) {
    console.warn(`[ReportDrafts] Erro ao limpar rascunho da aula ${classId}:`, e);
  }
}

/**
 * Registra qual aula estava com o modal de relatório aberto para restaurar automaticamente ao voltar.
 */
export function setActiveDraftClassId(classId: string | null, view?: 'classes' | 'class_reports'): void {
  try {
    if (classId) {
      localStorage.setItem(ACTIVE_DRAFT_KEY, classId);
      if (view) {
        localStorage.setItem(ACTIVE_DRAFT_VIEW_KEY, view);
      }
    } else {
      localStorage.removeItem(ACTIVE_DRAFT_KEY);
      localStorage.removeItem(ACTIVE_DRAFT_VIEW_KEY);
    }
  } catch {
    // no-op
  }
}

/**
 * Retorna o ID da aula cujo relatório estava sendo editado.
 */
export function getActiveDraftClassId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_DRAFT_KEY);
  } catch {
    return null;
  }
}

/**
 * Retorna a tela ('classes' | 'class_reports') onde o rascunho estava sendo editado.
 */
export function getActiveDraftView(): 'classes' | 'class_reports' | null {
  try {
    return (localStorage.getItem(ACTIVE_DRAFT_VIEW_KEY) as 'classes' | 'class_reports' | null) || null;
  } catch {
    return null;
  }
}

/**
 * Remove a marcação de aula ativa em edição.
 */
export function clearActiveDraftClassId(): void {
  try {
    localStorage.removeItem(ACTIVE_DRAFT_KEY);
    localStorage.removeItem(ACTIVE_DRAFT_VIEW_KEY);
  } catch {
    // no-op
  }
}

/**
 * Retorna lista de IDs de todas as aulas com rascunho ativo.
 */
export function getAllDraftClassIds(): string[] {
  return getDraftRegistry();
}
