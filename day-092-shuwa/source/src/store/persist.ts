import { createDefaultProgress } from './schema';
import type { Progress } from './schema';
import { validateProgress } from './transfer';

export const STORAGE_KEY = 'tekotoba:v1';
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface PersistenceStatus {
  progress: Progress;
  storageAvailable: boolean;
  recovered: boolean;
  backupKey?: string;
  reason?: string;
}
export type Migration = (value: unknown) => unknown;
export interface PersistenceOptions {
  storage?: StorageLike | null;
  now?: () => number;
  /** 旧版→v1へ変換する処理。初版はv1のみなので既定の移行処理は無い。 */
  migrations?: Readonly<Record<number, Migration>>;
}
function defaultStorage(): StorageLike | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
const clone = (progress: Progress): Progress => JSON.parse(JSON.stringify(progress)) as Progress;

/** DOMイベントは登録しない。呼び出し側がタブ非表示時にflushする。 */
export function createPersistence(options: PersistenceOptions = {}) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  let progress = createDefaultProgress();
  let available = storage !== null;
  let recovered = false;
  let backupKey: string | undefined;
  let reason: string | undefined;
  let loaded = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const status = (): PersistenceStatus => ({ progress: clone(progress), storageAvailable: available, recovered, backupKey, reason });
  const write = () => {
    if (available && storage) {
      try { storage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
      catch { available = false; }
    }
  };
  const load = (): PersistenceStatus => {
    if (loaded) return status();
    loaded = true;
    if (!storage) return status();
    let raw: string | null;
    try { raw = storage.getItem(STORAGE_KEY); }
    catch { available = false; return status(); }
    if (raw !== null) {
      try {
        let value: unknown = JSON.parse(raw);
        if (typeof value === 'object' && value !== null && 'version' in value && typeof value.version === 'number'
          && value.version !== 1) {
          const migrate = options.migrations?.[value.version];
          if (migrate) value = migrate(value);
        }
        const result = validateProgress(value);
        if (!result.ok) throw new Error(result.reason);
        progress = result.progress;
      } catch (error) {
        recovered = true;
        reason = error instanceof Error ? error.message : '記録を読み取れませんでした。';
        const key = `${STORAGE_KEY}:broken-${(options.now ?? Date.now)()}`;
        try {
          storage.setItem(key, raw);
          backupKey = key;
        } catch {
          // 退避できなかった元の記録を上書きしない。
          available = false;
          return status();
        }
      }
    }
    // 読めても書けない保存領域を、初回から検出する。
    write();
    return status();
  };
  const flush = (): PersistenceStatus => {
    load();
    if (timer !== undefined) { clearTimeout(timer); timer = undefined; }
    write();
    return status();
  };
  const set = (value: Progress) => {
    load();
    const result = validateProgress(value);
    if (!result.ok) throw new Error(result.reason);
    progress = result.progress;
  };
  return {
    load,
    getSnapshot: () => { load(); return status(); },
    save(value: Progress): PersistenceStatus {
      set(value);
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => { timer = undefined; write(); }, 300);
      return status();
    },
    saveNow(value: Progress): PersistenceStatus { set(value); return flush(); },
    flush,
    dispose(): void { flush(); },
  };
}
