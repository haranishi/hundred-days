/* 決定的な乱数。?seed= を渡せば同じ出題が再現でき、E2Eとデモの録画もぶれない。
   Math.random を使わないのは、テストと録画で「同じ10問」を出したいのが理由。 */

/** mulberry32。32bitの種から 0以上1未満 を返す関数を作る */
export function mulberry32(seed) {
  let state = Number(seed) >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0以上 max 未満の整数 */
export function randomInt(rng, max) {
  return Math.floor(rng() * max);
}

/** 元の配列を壊さずに並べ替える（Fisher-Yates） */
export function shuffle(rng, items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 重複なく count 件取り出す。在庫が足りなければあるだけ返す */
export function sample(rng, items, count) {
  return shuffle(rng, items).slice(0, Math.max(0, Math.min(count, items.length)));
}

/** 1件だけ取り出す。空配列なら null */
export function pickOne(rng, items) {
  return items.length ? items[randomInt(rng, items.length)] : null;
}

/** ?seed= が無いときの種。crypto が無い環境でも動くようにしてある */
export function randomSeed() {
  const values = globalThis.crypto?.getRandomValues;
  if (typeof values === 'function') {
    const buffer = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buffer);
    return buffer[0] >>> 0;
  }
  return Math.floor(Math.random() * 4294967296) >>> 0;
}

/** ?seed= の文字列を種に直す。整数でなければ null */
export function parseSeed(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  if (!/^\d+$/.test(String(raw).trim())) return null;
  const value = Number(String(raw).trim());
  return Number.isSafeInteger(value) ? value >>> 0 : null;
}
