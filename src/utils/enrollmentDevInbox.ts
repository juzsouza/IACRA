import { TERM_MODELS, type TermModelId } from './enrollmentTermsDemo';
import { validateTermDraft, type TermDraft } from './enrollmentTermsDraft';

/** Apenas homologação visual, sem dados de alunos ou persistência no Supabase. */
export const DEV_INBOX_KEY = 'iacra_dev_visual_matricula_pendencias_v1';
export const DEV_OFFERS_KEY = 'iacra_dev_visual_matricula_convites_v2';
export type DemoRequestStatus = 'pending' | 'approved' | 'changes_requested';
export type DemoStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type DemoOfferInput = {
  modelId: TermModelId;
  teacherName: string;
  teacherId?: string;
  planName: string;
  planId?: string;
  groupName: string;
  groupId?: string;
  startDate: string;
  enrollmentDate: string;
  monthlyAmount: number;
  dueDay: number;
  term: TermDraft;
};
export type DemoOffer = DemoOfferInput & { id: string; createdAt: string };
export type DemoRequest = {
  id: string;
  modelId: TermModelId;
  offerId?: string; // Convites anteriores continuam legíveis.
  createdAt: string;
  status: DemoRequestStatus;
};

export const isValidModel = (value: unknown): value is TermModelId =>
  typeof value === 'string' && TERM_MODELS.some(item => item.id === value);
export const isGroupModel = (id: TermModelId): boolean => id === 'institutional_group' || id === 'mev_group';
const isId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9-]{20,64}$/i.test(id);
const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const clean = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 1 && s.length <= 120;

export function validateDemoOffer(input: DemoOfferInput): string | null {
  if (!isValidModel(input.modelId)) return 'Selecione um modelo válido.';
  if (!clean(input.teacherName)) return 'Informe o professor fictício.';
  if (!clean(input.planName)) return 'Informe o plano financeiro fictício.';
  if (isGroupModel(input.modelId) && !clean(input.groupName)) return 'Informe o grupo ou turma fictícia.';
  if (typeof input.groupName !== 'string' || input.groupName.length > 120) return 'Grupo inválido.';
  if (!isDate(input.startDate)) return 'Informe uma data válida de início das aulas.';
  if (!isDate(input.enrollmentDate)) return 'Informe uma data válida de matrícula.';
  if (typeof input.monthlyAmount !== 'number' || !Number.isFinite(input.monthlyAmount) ||
      input.monthlyAmount <= 0 || input.monthlyAmount > 100000) return 'Informe um valor de mensalidade válido.';
  if (!Number.isInteger(input.dueDay) || input.dueDay < 1 || input.dueDay > 31) return 'Informe o dia de vencimento (1 a 31).';
  if (!validateTermDraft(input.term)) return 'O termo selecionado precisa ter título e conteúdo válidos.';
  return null;
}

export function readDemoOffers(raw: string | null): DemoOffer[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is DemoOffer => {
      if (!value || typeof value !== 'object') return false;
      const obj = value as DemoOffer;
      return isId(obj.id) && typeof obj.createdAt === 'string' && !validateDemoOffer(obj);
    }).slice(0, 25);
  } catch { return []; }
}

export function createDemoOffer(storage: DemoStorage, input: DemoOfferInput): DemoOffer {
  const error = validateDemoOffer(input);
  if (error) throw new Error(error);
  const offer: DemoOffer = {
    ...input,
    teacherName: input.teacherName.trim(),
    planName: input.planName.trim(),
    groupName: input.groupName.trim(),
    term: { ...input.term },
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  storage.setItem(DEV_OFFERS_KEY, JSON.stringify([offer, ...readDemoOffers(storage.getItem(DEV_OFFERS_KEY))].slice(0,25)));
  return offer;
}
export function getDemoOffer(storage: DemoStorage, id: string | null): DemoOffer | null {
  if (!isId(id)) return null;
  return readDemoOffers(storage.getItem(DEV_OFFERS_KEY)).find(offer => offer.id === id) ?? null;
}
export function demoLink(origin: string, offerId: string): string {
  if (!isId(offerId)) throw new Error('Convite fictício inválido.');
  const url = new URL('/matricula-teste', origin);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Origem inválida.');
  url.searchParams.set('convite', offerId);
  return url.href;
}

export function readDemoRequests(raw: string | null): DemoRequest[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is DemoRequest => {
      if (!value || typeof value !== 'object') return false;
      const obj = value as DemoRequest;
      return isId(obj.id) && isValidModel(obj.modelId) &&
        (obj.offerId === undefined || isId(obj.offerId)) &&
        typeof obj.createdAt === 'string' && ['pending','approved','changes_requested'].includes(obj.status) &&
        Object.keys(obj).every(key => ['id','modelId','offerId','createdAt','status'].includes(key));
    }).slice(0,25);
  } catch { return []; }
}
export function saveDemoRequest(storage: DemoStorage, offerId: string): DemoRequest {
  const offer = getDemoOffer(storage, offerId);
  if (!offer) throw new Error('Convite fictício não encontrado neste navegador.');
  const current = readDemoRequests(storage.getItem(DEV_INBOX_KEY));
  const record: DemoRequest = {
    id: crypto.randomUUID(), modelId: offer.modelId, offerId,
    createdAt: new Date().toISOString(), status: 'pending',
  };
  storage.setItem(DEV_INBOX_KEY, JSON.stringify([record,...current].slice(0,25)));
  return record;
}
export function changeDemoRequestStatus(
  storage: DemoStorage, id: string, status: Exclude<DemoRequestStatus,'pending'>,
): DemoRequest[] {
  if (!['approved','changes_requested'].includes(status)) throw new Error('Situação inválida.');
  const current = readDemoRequests(storage.getItem(DEV_INBOX_KEY));
  const result = current.map(item => item.id === id && item.status === 'pending' ? { ...item, status } : item);
  storage.setItem(DEV_INBOX_KEY, JSON.stringify(result));
  return result;
}
