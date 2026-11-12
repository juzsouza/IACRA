import type { TermDraft, TermModelId } from './enrollmentTermModels';
import { RICH_TERM_PREFIX, isRichTerm } from './richTermMarkup';

export const isMevGroupName = (name: string): boolean => /^MEV\s+\d+(?:\b|$)/i.test(name.trim());

export function groupLabelForTerm(model: TermModelId, name: string): string {
  const label = name.trim();
  if (!label) return '';
  return model === 'mev_group' ? 'Turma de Musicalização Espaço Vivo (MEV): ' + label : 'Grupo: ' + label;
}

const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Create a permanent copy of the selected group name within the invitation's
 * original legal term. Existing issued invitations remain unchanged.
 * The user-authored text is preserved and never replaced by the template.
 */
export function termWithGroupSnapshot(term: TermDraft, model: TermModelId, groupName: string): TermDraft {
  const label = groupLabelForTerm(model, groupName);
  if (!label) return term;
  const escapedLabel = escapeHtml(label);
  const original = isRichTerm(term.body)
    ? term.body.slice(RICH_TERM_PREFIX.length)
    : escapeHtml(term.body).replace(/\r\n?|\n/g, '<br>');
  return {
    title: term.title,
    body: RICH_TERM_PREFIX + '<p><strong>' + escapedLabel + '</strong></p>' + original,
  };
}
