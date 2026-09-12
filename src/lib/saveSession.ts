import type { AnimalEdits } from './saveAnimals';
import type { MachineEdits } from './saveMachines';
import type { ProgressEdits } from './saveProgress';
import type { SlotEdits } from './saveItems';
import type { SaveSectionId } from './saveModel';

export const SESSION_KEY = 'village-save-editor:v2';
export interface SaveIdentity { name: string; size: number; sha256: string }
export interface SaveSession {
  version: 2;
  identity: SaveIdentity;
  drafts: Record<number, string>;
  slots: SlotEdits;
  progress?: ProgressEdits;
  machines?: MachineEdits;
  animals?: AnimalEdits;
  tab: SaveSectionId;
}

export async function identifySave(bytes: Uint8Array, name: string): Promise<SaveIdentity> {
  const hash = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return { name, size: bytes.length, sha256: Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('') };
}

export async function verifySessionBytes(identity: SaveIdentity, bytes: Uint8Array): Promise<void> {
  if (bytes.length !== identity.size || (await identifySave(bytes, identity.name)).sha256 !== identity.sha256) {
    throw new Error('暂存文件校验不一致，已停止恢复。请重新选择原始存档。');
  }
}

/** The session points to a content-addressed original; offsets can never drift to a different file. */
export function readSession(storage: Storage): SaveSession | null {
  const raw = storage.getItem(SESSION_KEY);
  if (!raw) return null;
  const value = JSON.parse(raw) as SaveSession;
  if (value.version !== 2 || !value.identity || typeof value.identity.name !== 'string'
    || !Number.isSafeInteger(value.identity.size) || !/^[a-f0-9]{64}$/.test(value.identity.sha256)
    || !value.drafts || !value.slots || !['basic', 'player', 'items', 'barn', 'npc', 'brand', 'progress', 'quests', 'raw'].includes(value.tab)
    || Object.entries(value.drafts).some(([offset, draft]) => !/^\d+$/.test(offset) || typeof draft !== 'string')
    || Object.entries(value.slots).some(([offset, slot]) => !/^\d+$/.test(offset) || (slot !== null &&
      (!slot || ['itemId', 'count', 'rank', 'quality'].some(key => typeof slot[key as keyof typeof slot] !== 'string'))))) {
    throw new Error('暂存草稿格式不兼容，请重新选择原始存档。');
  }
  if (value.progress && Object.entries(value.progress).some(([group, entries]) => !['encyclopedia', 'skills', 'flags', 'deliveries'].includes(group) || !entries || Object.entries(entries).some(([id, checked]) => group === 'deliveries' ? !/^\d+:[0-2]$/.test(id) || !Number.isSafeInteger(checked) || Number(checked) < 0 : !/^\d+$/.test(id) || typeof checked !== 'boolean'))) throw new Error('暂存的收集记录格式不兼容。');
  if (value.machines && Object.entries(value.machines).some(([key, edit]) => !/^gimmick-\d+\/[0-2]$/.test(key) || !edit || typeof edit.finish !== 'boolean' || (edit.recipeId !== undefined && !Number.isSafeInteger(edit.recipeId)))) throw new Error('暂存的加工记录格式不兼容。');
  if (value.animals && (Object.values(value.animals.moves ?? {}).some(id => !Number.isSafeInteger(id)) || Object.values(value.animals.added ?? {}).some(animal => !animal || !Number.isSafeInteger(animal.species) || typeof animal.name !== 'string' || (animal.variant !== undefined && (!Number.isInteger(animal.variant) || animal.variant < 0 || animal.variant > 2))))) throw new Error('暂存的动物记录格式不兼容。');
  return value;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('village-save-editor', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('originals');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('浏览器暂存数据库被其他页面占用。'));
  });
}

export async function storeOriginal(identity: SaveIdentity, bytes: Uint8Array): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('originals', 'readwrite');
      transaction.objectStore('originals').put(bytes, identity.sha256);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

export async function restoreOriginal(identity: SaveIdentity): Promise<Uint8Array> {
  const db = await openDatabase();
  try {
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      const request = db.transaction('originals', 'readonly').objectStore('originals').get(identity.sha256);
      request.onsuccess = () => request.result instanceof Uint8Array ? resolve(request.result) : reject(new Error('浏览器已清除暂存文件，请重新选择原始存档。'));
      request.onerror = () => reject(request.error);
    });
    await verifySessionBytes(identity, bytes);
    return bytes;
  } finally { db.close(); }
}
