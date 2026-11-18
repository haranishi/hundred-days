// 端末に覚える小さな設定（名前・キャラ・CPUの強さ）。
// localStorage が使えない端末（プライベートモード・容量切れ・アプリ内ブラウザ）があるので、
// 読み書きはすべて try/catch で包み、だめならこのタブの間だけ覚える。

const PREFIX = 'sy.';
const memory = new Map<string, string>();

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadString(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    const v = storage()?.getItem(PREFIX + key) ?? null;
    if (v !== null) memory.set(key, v);
    return v;
  } catch {
    return null;
  }
}

export function saveString(key: string, value: string): void {
  memory.set(key, value);
  try {
    storage()?.setItem(PREFIX + key, value);
  } catch {
    // 覚えられない端末では、このタブの間だけ覚える
  }
}

/** 決まった候補の中にあるときだけ使う（壊れた値や古い値を読まない） */
export function loadChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const v = loadString(key);
  return v !== null && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
