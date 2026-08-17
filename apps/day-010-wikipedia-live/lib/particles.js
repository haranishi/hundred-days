/* 粒が落ちて水面で波紋になる、という動きだけを担当する。
   描画もランダムもここには入れない（乱数は呼び出し側から座標と速度として渡す）ので、
   同じ入力なら必ず同じ結果になり、そのままテストできる。 */

export const RIPPLE_MS = 900;
export const RIPPLE_MS_JA = 2600; // 日本語版は5〜6秒に1件しか来ないので、余韻を長く残して画面から消さない
export const SINK_MS = 1500;
export const MAX_RADIUS = 13;

/** バイト増減 → 粒の大きさ。対数で効かせつつ、大きな加筆でも画面を占領しないよう頭を止める。 */
export function radiusFor(delta) {
  const size = Math.abs(Number.isFinite(delta) ? delta : 0);
  return Number(Math.min(MAX_RADIUS, 2.2 + 3.4 * Math.log10(size + 1)).toFixed(3));
}

export function createDrop({ id = '', x = 0, delta = 0, isJa = false, title = '', speed = 260 } = {}) {
  return { id, x, y: -16, vy: speed, r: radiusFor(delta), delta, isJa, title };
}

/** 落下を dtMs ぶん進める。水面に届いた粒は drops から外して landed で返す。 */
export function stepDrops(drops, dtMs, waterY) {
  const seconds = Math.max(0, dtMs) / 1000;
  const next = [];
  const landed = [];
  for (const drop of drops) {
    const y = drop.y + drop.vy * seconds;
    if (y >= waterY) landed.push({ ...drop, y: waterY });
    else next.push({ ...drop, y });
  }
  return { drops: next, landed };
}

export function createRipple(drop) {
  const life = drop.isJa ? RIPPLE_MS_JA : RIPPLE_MS;
  return {
    id: drop.id,
    x: drop.x,
    y: drop.y,
    r: drop.r,
    rMax: drop.r * (drop.isJa ? 9 : 5),
    isJa: drop.isJa,
    title: drop.title,
    delta: drop.delta,
    age: 0,
    life,
  };
}

/** 着水した粒は、そのまま水中へゆっくり沈んで消える（水面下を空白にしないため）。 */
export function createSink(drop) {
  return { x: drop.x, y0: drop.y, y: drop.y, r: drop.r, isJa: drop.isJa, age: 0, life: SINK_MS };
}

export function stepSinks(sinks, dtMs) {
  const step = Math.max(0, dtMs);
  const next = [];
  for (const sink of sinks) {
    const age = sink.age + step;
    if (age >= sink.life) continue;
    const progress = age / sink.life;
    next.push({
      ...sink,
      age,
      // 位置は必ず着水点(y0)から計算する。前回の値に足すと、コマ落ちのたびに沈み方が変わる
      y: sink.y0 + progress * 52,
      radius: sink.r * (1 - progress * 0.5),
      alpha: Number(((1 - progress) * 0.5).toFixed(4)),
    });
  }
  return next;
}

/** 波紋を dtMs ぶん広げる。寿命が尽きたものは返り値から消える。 */
export function stepRipples(ripples, dtMs) {
  const step = Math.max(0, dtMs);
  const next = [];
  for (const ripple of ripples) {
    const age = ripple.age + step;
    if (age >= ripple.life) continue;
    const progress = age / ripple.life;
    // 立ち上がりを速く、広がりきる手前でゆるめる
    const eased = 1 - (1 - progress) ** 3;
    next.push({
      ...ripple,
      age,
      radius: ripple.r + (ripple.rMax - ripple.r) * eased,
      alpha: Number((1 - progress).toFixed(4)),
    });
  }
  return next;
}
