import { TERM_MODELS, demoTermBody, type TermModelId } from './enrollmentTermsDemo';

export type TermDraft = { title: string; body: string };
export const TERM_DRAFT_STORAGE_PREFIX = 'iacra_dev_only_enrollment_terms_draft_v1_';
export const TERM_TITLE_MAX_LENGTH = 160;
export const TERM_BODY_MAX_LENGTH = 20000;

export function originalTermDraft(modelId: TermModelId): TermDraft {
  const model = TERM_MODELS.find(item => item.id === modelId);
  if (!model) throw new Error('Modelo de termo DEV desconhecido.');
  return { title: model.label, body: demoTermBody(modelId) };
}

export function validateTermDraft(input: TermDraft): boolean {
  return input.title.trim().length > 0 &&
    input.title.length <= TERM_TITLE_MAX_LENGTH &&
    input.body.trim().length > 0 &&
    input.body.length <= TERM_BODY_MAX_LENGTH;
}

export function readSavedTermDraft(raw: string | null): TermDraft | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const fields = value as Record<string, unknown>;
    if (typeof fields.title !== 'string' || typeof fields.body !== 'string') return null;
    const draft = { title: fields.title, body: fields.body };
    return validateTermDraft(draft) ? draft : null;
  } catch {
    return null;
  }
}

export function termDraftStorageKey(modelId: TermModelId): string {
  if (!TERM_MODELS.some(item => item.id === modelId)) {
    throw new Error('Modelo DEV desconhecido.');
  }
  return TERM_DRAFT_STORAGE_PREFIX + modelId;
}
