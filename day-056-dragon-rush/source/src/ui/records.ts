// OWNER: ui
// 自己ベストの記録（r02-controls）：被害総額・破壊率・最大連鎖の最高と前回を、怪獣ごとにブラウザへ覚える。
// 指摘「結果に自己ベストが無く、次はもっと壊そうと思う手がかりが無い」（体験の採点 X2）。
// 鍵は怪獣の名前（r03-roster から config/creatures/ の recordKey：紅竜 'kurenairyu'・雷翼 'raiyoku'・焔角 'homuratsuno'）。同じ保存の中に怪獣ごとの欄が並ぶ。
// 読めない・書けない環境（プライベートモードなど）では、その回の比べだけをして、保存しない。

const KEY = 'dragon-rampage.records';

export interface RunStats {
  yen: number;
  destruction: number;
  maxCombo: number;
}

export type StatName = keyof RunStats;
export const STAT_NAMES: readonly StatName[] = ['yen', 'destruction', 'maxCombo'];

export interface MonsterRecord {
  /** 項目ごとの最高（別々の回の最高でよい） */
  best: RunStats | null;
  /** 前回の回 */
  last: RunStats | null;
  plays: number;
}

export interface RecordFile {
  version: 1;
  monsters: Record<string, MonsterRecord>;
}

/** 結果の画面に出す比べ：前の最高・前回・差・更新したか。 */
export interface RunComparison {
  run: RunStats;
  bestBefore: RunStats | null;
  lastBefore: RunStats | null;
  /** 前回との差（前回が無ければ null） */
  diffLast: RunStats | null;
  /** 項目ごとに自己ベストを更新したか（初回は更新とみなさない） */
  newBest: Record<StatName, boolean>;
  plays: number;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const emptyFile = (): RecordFile => ({ version: 1, monsters: {} });

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function parseStats(v: unknown): RunStats | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const yen = num(o.yen);
  const destruction = num(o.destruction);
  const maxCombo = num(o.maxCombo);
  if (yen === null || destruction === null || maxCombo === null) return null;
  return { yen, destruction, maxCombo };
}

/** 保存の中身を読む（壊れていれば空）。 */
export function parseRecords(raw: string | null): RecordFile {
  if (!raw) return emptyFile();
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; monsters?: Record<string, unknown> };
    if (parsed.version !== 1 || !parsed.monsters || typeof parsed.monsters !== 'object') return emptyFile();
    const out = emptyFile();
    for (const [id, rec] of Object.entries(parsed.monsters)) {
      const r = rec as Record<string, unknown>;
      out.monsters[id] = { best: parseStats(r.best), last: parseStats(r.last), plays: num(r.plays) ?? 0 };
    }
    return out;
  } catch {
    return emptyFile();
  }
}

/** 1回の結果を記録に入れる（元の記録は変えず、新しい記録と比べを返す）。 */
export function submitRun(file: RecordFile, monster: string, run: RunStats): { file: RecordFile; comparison: RunComparison } {
  const prev = file.monsters[monster] ?? { best: null, last: null, plays: 0 };
  const best: RunStats = prev.best
    ? { yen: Math.max(prev.best.yen, run.yen), destruction: Math.max(prev.best.destruction, run.destruction), maxCombo: Math.max(prev.best.maxCombo, run.maxCombo) }
    : { ...run };
  const newBest = Object.fromEntries(STAT_NAMES.map((k) => [k, prev.best !== null && run[k] > prev.best[k]])) as Record<StatName, boolean>;
  const diffLast = prev.last ? { yen: run.yen - prev.last.yen, destruction: run.destruction - prev.last.destruction, maxCombo: run.maxCombo - prev.last.maxCombo } : null;
  const next: RecordFile = { version: 1, monsters: { ...file.monsters, [monster]: { best, last: { ...run }, plays: prev.plays + 1 } } };
  return { file: next, comparison: { run, bestBefore: prev.best, lastBefore: prev.last, diffLast, newBest, plays: prev.plays + 1 } };
}

function defaultStore(): KeyValueStore | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** 記録を読む。 */
export function loadRecords(store: KeyValueStore | null = defaultStore()): RecordFile {
  try {
    return parseRecords(store ? store.getItem(KEY) : null);
  } catch {
    return emptyFile();
  }
}

/** 結果を記録して保存し、結果の画面に出す比べを返す。 */
export function recordRun(monster: string, run: RunStats, store: KeyValueStore | null = defaultStore()): RunComparison {
  const { file, comparison } = submitRun(loadRecords(store), monster, run);
  try {
    store?.setItem(KEY, JSON.stringify(file));
  } catch {
    // 保存できなくても、この回の比べは出す
  }
  return comparison;
}
