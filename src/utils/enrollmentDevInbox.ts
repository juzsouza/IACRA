import { TERM_MODELS, type TermModelId } from './enrollmentTermsDemo';

/** Caixa de entrada exclusivamente visual: não persiste dados pessoais. */
export const DEV_INBOX_KEY = 'iacra_dev_visual_matricula_pendencias_v1';
export type DemoRequestStatus = 'pending' | 'approved' | 'changes_requested';
export type DemoRequest = {
  id: string;
  modelId: TermModelId;
  createdAt: string;
  status: DemoRequestStatus;
};

export const isValidModel = (value: unknown): value is TermModelId =>
  typeof value === 'string' && TERM_MODELS.some(item => item.id === value);

export function readDemoRequests(raw: string | null): DemoRequest[] {
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((item): item is DemoRequest => {
      if (!item || typeof item !== 'object') return false;
      const obj = item as Record<string, unknown>;
      return typeof obj.id === 'string' && /^[a-f0-9-]{20,64}$/i.test(obj.id) &&
        isValidModel(obj.modelId) && typeof obj.createdAt === 'string' &&
        typeof obj.status === 'string' &&
        ['pending', 'approved', 'changes_requested'].includes(obj.status) &&
        Object.keys(obj).every(key => ['id', 'modelId', 'createdAt', 'status'].includes(key));
    }).slice(0, 25);
  } catch {
    return [];
  }
}

export function demoLink(origin: string, modelId: TermModelId): string {
  if (!isValidModel(modelId)) throw new Error('Modelo de teste desconhecido.');
  const url = new URL('/matricula-teste', origin);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Origem inválida.');
  url.searchParams.set('modelo', modelId);
  return url.href;
}

export function saveDemoRequest(storage: Pick<Storage, 'getItem' | 'setItem'>, modelId: TermModelId): DemoRequest {
  if (!isValidModel(modelId)) throw new Error('Modelo de teste desconhecido.');
  const current = readDemoRequests(storage.getItem(DEV_INBOX_KEY));
  const record: DemoRequest = {
    id: crypto.randomUUID(),
    modelId,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  storage.setItem(DEV_INBOX_KEY, JSON.stringify([record, ...current].slice(0, 25)));
  return record;
}

export function changeDemoRequestStatus(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  id: string,
  status: Exclude<DemoRequestStatus, 'pending'>,
): DemoRequest[] {
  if (!['approved', 'changes_requested'].includes(status)) throw new Error('Situação inválida.');
  const current = readDemoRequests(storage.getItem(DEV_INBOX_KEY));
  const result = current.map(item => item.id === id ? { ...item, status } : item);
  storage.setItem(DEV_INBOX_KEY, JSON.stringify(result));
  return result;
}
