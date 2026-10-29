/**
 * Simulação isolada de Termos de Matrícula para homologação visual.
 * Nunca registra assinatura, vínculo, matrícula, cobrança ou token.
 */
export const TERM_MODELS = [
  { id: 'individual_instruments_vocal', label: 'Aulas Individuais — Instrumento e Técnica Vocal', description: 'Aulas individuais de instrumento ou técnica vocal.' },
  { id: 'raphael_individual', label: 'Atendimento Individual — Raphael Augusto', description: 'Modelo específico de atendimento individual.' },
  { id: 'institutional_group', label: 'Matrícula Institucional em Grupo', description: 'Atendimento de grupos e parcerias institucionais.' },
  { id: 'mev_group', label: 'Musicalização Espaço Vivo (MEV) — Grupo', description: 'Turmas de musicalização do programa MEV.' },
] as const;

export type TermModelId = (typeof TERM_MODELS)[number]['id'];
export type DemoStage = 'draft' | 'issued' | 'accepted' | 'reviewed';
export type DemoAction = 'issue' | 'accept' | 'review';

const next: Record<DemoStage, Partial<Record<DemoAction, DemoStage>>> = {
  draft: { issue: 'issued' },
  issued: { accept: 'accepted' },
  accepted: { review: 'reviewed' },
  reviewed: {},
};

export function nextDemoStage(stage: DemoStage, action: DemoAction): DemoStage {
  const result = next[stage][action];
  if (!result) throw new Error('Transição inválida na simulação de termo.');
  return result;
}

export function demoTermBody(modelId: TermModelId): string {
  const model = TERM_MODELS.find(m => m.id === modelId);
  if (!model) throw new Error('Modelo de termo inválido.');
  return [
    'DOCUMENTO DE TESTE — SEM VALIDADE CONTRATUAL',
    model.label,
    'Aluno: Aluno Exemplo (fictício)',
    'Responsável: Responsável Exemplo (fictício)',
    'Condições comerciais e cláusulas: pendentes de revisão e aprovação.',
    'Nenhum dado pessoal, aceite, assinatura, matrícula ou cobrança será registrado.',
  ].join('\n\n');
}
