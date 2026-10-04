import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  saveReportDraft,
  getReportDraft,
  hasReportDraft,
  clearReportDraft,
  setActiveDraftClassId,
  getActiveDraftClassId,
  getActiveDraftView,
  clearActiveDraftClassId,
  getAllDraftClassIds,
} from '../utils/reportDrafts.js';

// Polyfill localStorage in node test environment if not present
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] || null,
    get length() { return store.size; },
  } as Storage;
}

describe('Report Drafts Lifecycle — AutoSave and Recovery', () => {
  it('1. Professor começa relatório -> digita -> rascunho salvo automaticamente', () => {
    const classId = 'session-jean-001';
    clearReportDraft(classId);
    clearActiveDraftClassId();

    assert.strictEqual(hasReportDraft(classId), false);
    assert.strictEqual(getReportDraft(classId), null);

    // Professor começa a digitar
    const reportText = 'Aluno realizou exercícios de afinação e sustentação vocal.';
    const vocalRoutine = 'Vocalise 1-3-5-3-1 em [u] e [a] com semitrompete.';
    const attendance = { 'student-kemlly': 'present' as const };

    saveReportDraft(classId, {
      report: reportText,
      vocal_routine: vocalRoutine,
      attendance,
    });
    setActiveDraftClassId(classId, 'classes');

    // Rascunho salvo com sucesso
    assert.strictEqual(hasReportDraft(classId), true);
    const draft = getReportDraft(classId);
    assert.ok(draft !== null);
    assert.strictEqual(draft.classId, classId);
    assert.strictEqual(draft.report, reportText);
    assert.strictEqual(draft.vocal_routine, vocalRoutine);
    assert.deepStrictEqual(draft.attendance, attendance);
    assert.strictEqual(getActiveDraftClassId(), classId);
    assert.strictEqual(getActiveDraftView(), 'classes');
  });

  it('2. Professor vai para outra tela -> volta -> rascunho recuperado', () => {
    const classId = 'session-jean-001';

    // Simula navegação para outra tela (ex: Alunos ou Dashboard)
    // O componente original é desmontado, mas localStorage preserva o rascunho e a aula ativa
    const activeClassId = getActiveDraftClassId();
    const activeView = getActiveDraftView();
    assert.strictEqual(activeClassId, classId);
    assert.strictEqual(activeView, 'classes');

    // Professor volta para a tela de Aulas (ou Relatórios)
    // O componente monta e busca o rascunho ativo
    const recoveredDraft = getReportDraft(activeClassId!);
    assert.ok(recoveredDraft !== null);
    assert.strictEqual(recoveredDraft.report, 'Aluno realizou exercícios de afinação e sustentação vocal.');
    assert.strictEqual(recoveredDraft.vocal_routine, 'Vocalise 1-3-5-3-1 em [u] e [a] com semitrompete.');
    assert.strictEqual(recoveredDraft.attendance?.['student-kemlly'], 'present');
  });

  it('3. Suporte para visualização em Relatórios de Aulas (class_reports)', () => {
    const classId = 'session-jean-002';
    clearReportDraft(classId);

    saveReportDraft(classId, {
      report: 'Treino de respiração costo-diafragmática.',
      vocal_routine: 'Sons fricativos e humming.',
    });
    setActiveDraftClassId(classId, 'class_reports');

    assert.strictEqual(getActiveDraftClassId(), classId);
    assert.strictEqual(getActiveDraftView(), 'class_reports');

    const draft = getReportDraft(classId);
    assert.ok(draft !== null);
    assert.strictEqual(draft.report, 'Treino de respiração costo-diafragmática.');
  });

  it('4. Ao salvar ou descartar relatório -> rascunho limpo do dispositivo', () => {
    const classId = 'session-jean-001';
    assert.strictEqual(hasReportDraft(classId), true);

    // Professor clica em Salvar (ou Descartar rascunho)
    clearReportDraft(classId);
    clearActiveDraftClassId();

    assert.strictEqual(hasReportDraft(classId), false);
    assert.strictEqual(getReportDraft(classId), null);
    assert.strictEqual(getActiveDraftClassId(), null);
    assert.strictEqual(getActiveDraftView(), null);
  });
});
