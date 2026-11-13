import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPersistence, STORAGE_KEY } from '../../src/store/persist';
import type { StorageLike } from '../../src/store/persist';
import { createDefaultProgress } from '../../src/store/schema';
import { exportFilename, exportProgress, importProgress, validateProgress } from '../../src/store/transfer';
import { learnedProgress } from './engine-fixtures';
function memoryStorage() {
  const data = new Map<string, string>();
  const storage: StorageLike = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
  };
  return { storage, data };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('保存と復旧', () => {
  it('初期値は独立し、初回と再読み込みで同じ状態を返す', () => {
    const { storage } = memoryStorage();
    expect(createDefaultProgress()).toMatchObject({ version: 1, settings: { camera: true } });
    const first = createPersistence({ storage });
    expect(first.load()).toMatchObject({ storageAvailable: true, recovered: false, progress: createDefaultProgress() });
    const progress = learnedProgress(['kana-a']);
    progress.settings.dominant = 'left';
    first.saveNow(progress);
    expect(createPersistence({ storage }).load().progress).toEqual(progress);
    expect(createDefaultProgress().settings.dominant).toBe('right');
    first.getSnapshot().progress.settings.dominant = 'right';
    expect(first.getSnapshot().progress.settings.dominant).toBe('left');
  });
  it.each(['{broken', '{"version":1}', '{"version":99}'])('壊れた元の値%sを退避して初期化する', raw => {
    const { storage, data } = memoryStorage();
    data.set(STORAGE_KEY, raw);
    const result = createPersistence({ storage, now: () => 123456 }).load();
    expect(result).toMatchObject({ recovered: true, storageAvailable: true, backupKey: `${STORAGE_KEY}:broken-123456`, progress: createDefaultProgress() });
    expect(result.reason).toBeTruthy();
    expect(data.get(`${STORAGE_KEY}:broken-123456`)).toBe(raw);
    expect(JSON.parse(data.get(STORAGE_KEY)!)).toEqual(createDefaultProgress());
  });
  it('保存領域が無い環境でもメモリで継続する', () => {
    const store = createPersistence({ storage: null });
    expect(store.load().storageAvailable).toBe(false);
    const progress = learnedProgress(['kana-a']);
    expect(store.saveNow(progress)).toMatchObject({ storageAvailable: false, progress });
    expect(store.getSnapshot().progress).toEqual(progress);
  });
  it('既定のlocalStorageを使い、取得時の例外にも耐える', () => {
    const { storage, data } = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    expect(createPersistence().load().storageAvailable).toBe(true);
    expect(data.has(STORAGE_KEY)).toBe(true);
    vi.stubGlobal('localStorage', { getItem() { throw new Error('拒否'); }, setItem() { throw new Error('拒否'); } });
    expect(createPersistence().load().storageAvailable).toBe(false);
  });
  it('読み出し時の例外を外へ漏らさない', () => {
    const store = createPersistence({ storage: { getItem() { throw new Error('拒否'); }, setItem() { throw new Error('拒否'); } } });
    expect(store.load()).toMatchObject({ storageAvailable: false, progress: createDefaultProgress() });
    expect(store.saveNow(learnedProgress(['kana-a'])).progress.items['kana-a']).toBeDefined();
  });
  it('読み込みはできても書けない場合を初回から検出する', () => {
    const progress = learnedProgress(['kana-a']);
    const store = createPersistence({ storage: { getItem: () => JSON.stringify(progress), setItem() { throw new Error('容量不足'); } } });
    expect(store.load()).toMatchObject({ storageAvailable: false, progress });
  });
  it('途中で保存できなくなっても最新の学習記録をメモリに残す', () => {
    const { storage } = memoryStorage();
    const store = createPersistence({ storage });
    expect(store.load().storageAvailable).toBe(true);
    storage.setItem = () => { throw new Error('容量不足'); };
    const progress = learnedProgress(['kana-a']);
    expect(store.saveNow(progress)).toMatchObject({ storageAvailable: false, progress });
    expect(store.getSnapshot().progress).toEqual(progress);
  });
  it('退避できなければ壊れた元データを上書きしない', () => {
    const { storage, data } = memoryStorage();
    data.set(STORAGE_KEY, '{壊れた記録');
    const writes: string[] = [];
    storage.setItem = key => { writes.push(key); throw new Error('容量不足'); };
    const store = createPersistence({ storage, now: () => 1 });
    expect(store.load()).toMatchObject({ recovered: true, storageAvailable: false });
    store.saveNow(learnedProgress(['kana-a']));
    expect(writes).toEqual([`${STORAGE_KEY}:broken-1`]);
    expect(data.get(STORAGE_KEY)).toBe('{壊れた記録');
  });
  it('変更を300msまとめ、最新の値を一度だけ保存する', () => {
    vi.useFakeTimers();
    const { storage, data } = memoryStorage();
    const write = vi.spyOn(storage, 'setItem');
    const store = createPersistence({ storage });
    store.load();
    write.mockClear();
    store.save(learnedProgress(['kana-a']));
    vi.advanceTimersByTime(200);
    const latest = learnedProgress(['kana-a', 'kana-i']);
    store.save(latest);
    latest.settings.dominant = 'left';
    vi.advanceTimersByTime(299);
    expect(write).not.toHaveBeenCalled();
    expect(store.getSnapshot().progress.items['kana-i']).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(data.get(STORAGE_KEY)!).settings.dominant).toBe('right');
  });
  it('即時保存・flush・disposeは待たずに保存し、遅延処理を残さない', () => {
    vi.useFakeTimers();
    const { storage } = memoryStorage();
    const store = createPersistence({ storage });
    store.load();
    const write = vi.spyOn(storage, 'setItem');
    store.save(learnedProgress(['kana-a']));
    store.flush();
    expect(write).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
    expect(write).toHaveBeenCalledTimes(1);
    store.save(createDefaultProgress());
    store.saveNow(learnedProgress(['kana-i']));
    expect(store.getSnapshot().progress.items['kana-i']).toBeDefined();
    expect(vi.getTimerCount()).toBe(0);
    store.save(createDefaultProgress());
    store.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('渡された旧版の移行処理を実行してからv1を検査する', () => {
    const { storage, data } = memoryStorage();
    data.set(STORAGE_KEY, JSON.stringify({ version: 0, xp: 20 }));
    const migration = vi.fn(() => ({ ...createDefaultProgress(), xpByDay: { '2026-11-13': 20 } }));
    const result = createPersistence({ storage, migrations: { 0: migration } }).load();
    expect(migration).toHaveBeenCalledWith({ version: 0, xp: 20 });
    expect(result).toMatchObject({ recovered: false, storageAvailable: true, progress: { version: 1, xpByDay: { '2026-11-13': 20 } } });
  });
  it('不正な移行結果は元のデータを退避する', () => {
    const { storage, data } = memoryStorage();
    const raw = '{"version":0}';
    data.set(STORAGE_KEY, raw);
    const result = createPersistence({ storage, now: () => 2, migrations: { 0: () => null } }).load();
    expect(result.recovered).toBe(true);
    expect(data.get(`${STORAGE_KEY}:broken-2`)).toBe(raw);
  });
});
describe('書き出しと読み込みの検査', () => {
  it('全フィールドを書き出して読み戻せる', () => {
    const progress = learnedProgress(['kana-a', 'kana-i']);
    progress.settings = { dominant: 'left', dailyGoal: 50, sound: false, vibration: false, camera: true, reduceMotion: true, onboarded: true, startCourse: 'word' };
    progress.lessons = { demo: 2 };
    progress.xpByDay = { '2026-11-13': 25 };
    progress.streak = { current: 3, longest: 7, lastDate: '2026-11-13' };
    progress.achievements = { 'first-lesson': '2026-11-13' };
    expect(importProgress(exportProgress(progress))).toEqual({ ok: true, progress });
    expect(exportFilename('2026-11-13')).toBe('tekotoba-progress-20261113.json');
    expect(() => exportFilename('2026-02-30')).toThrow();
  });
  it.each([
    ['{', 'JSON'], ['null', 'オブジェクト'], ['[]', 'オブジェクト'], ['{}', '版'], ['{"version":2}', '版'],
  ])('不正な入力%sの理由を日本語で返す', (value, reason) => {
    expect(importProgress(value)).toEqual({ ok: false, reason: expect.stringContaining(reason) });
  });
  it.each([
    ['settings', { ...createDefaultProgress().settings, dailyGoal: '20' }, '設定'],
    ['settings', { ...createDefaultProgress().settings, camera: 1 }, '設定'],
    ['settings', { ...createDefaultProgress().settings, dominant: 'none' }, '設定'],
    ['settings', { ...createDefaultProgress().settings, startCourse: 'none' }, '設定'],
    ['items', { a: { box: 6, due: '2026-11-13', introducedAt: '2026-11-13', correct: 0, wrong: 0 } }, '項目'],
    ['items', { a: { box: 0, due: '2026-02-30', introducedAt: '2026-11-13', correct: 0, wrong: 0 } }, '項目'],
    ['items', { a: { box: 0, due: '2026-11-13', introducedAt: '2026-11-13', correct: -1, wrong: 0 } }, '項目'],
    ['items', [], '項目'], ['lessons', { demo: 1.5 }, '完了回数'],
    ['xpByDay', { '2026-02-30': 10 }, '経験値'], ['xpByDay', { '2026-11-13': -1 }, '経験値'],
    ['streak', { current: 7, longest: 3, lastDate: '2026-11-13' }, '連続記録'],
    ['streak', { current: 1, longest: 3, lastDate: null }, '連続記録'],
    ['achievements', { first: '昨日' }, '実績'],
  ])('%sの不正な値を拒否する', (key, value, reason) => {
    expect(validateProgress({ ...createDefaultProgress(), [key]: value })).toEqual({ ok: false, reason: expect.stringContaining(reason) });
  });
  it('危険な辞書キーと不正な保存値を拒否し、未知のルートフィールドは除く', () => {
    const bad = JSON.parse('{"__proto__":1}') as unknown;
    expect(validateProgress({ ...createDefaultProgress(), lessons: bad }).ok).toBe(false);
    const result = validateProgress({ ...createDefaultProgress(), unused: 'extra' });
    if (result.ok) expect(result.progress).not.toHaveProperty('unused');
    expect(() => exportProgress({ ...createDefaultProgress(), version: 2 } as never)).toThrow();
  });
});

it('利き手と開始コースは文字列型だけを受け入れる', () => {
  const settings = createDefaultProgress().settings;
  expect(validateProgress({ ...createDefaultProgress(), settings: { ...settings, dominant: ['right'] } }).ok).toBe(false);
  expect(validateProgress({ ...createDefaultProgress(), settings: { ...settings, startCourse: ['kana'] } }).ok).toBe(false);
});
