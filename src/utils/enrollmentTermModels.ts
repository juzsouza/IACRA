/** Modelos de matrícula. O texto jurídico é preenchido e revisado pela secretaria. */
export const TERM_MODELS = [
  { id: 'individual_instruments_vocal', label: 'Aulas Individuais — Instrumento e Técnica Vocal' },
  { id: 'raphael_individual', label: 'Atendimento Individual — Raphael Augusto' },
  { id: 'institutional_group', label: 'Matrícula Institucional em Grupo' },
  { id: 'mev_group', label: 'Musicalização Espaço Vivo (MEV) — Grupo' },
] as const;

export type TermModelId = (typeof TERM_MODELS)[number]['id'];
export type TermDraft = { title:string; body:string };
export const isGroupModel = (id: TermModelId) => id === 'institutional_group' || id === 'mev_group';
export const validTermForIssue = (term: TermDraft) => {
  const title = term.title.trim();
  const body = term.body.trim();
  return title.length >= 3 && title.length <= 160 &&
    body.length >= 10 && body.length <= 20000 &&
    !/(DOCUMENTO DE TESTE|SEM VALIDADE CONTRATUAL|DADOS FICTÍCIOS)/i.test(body);
};
