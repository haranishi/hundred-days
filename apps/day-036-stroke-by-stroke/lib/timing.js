/* 書く速さ。1画ずつの持ち時間と、画と画のあいだの間を決める。

   速さを途中で変えても、いま書いている画と進み具合を保ったまま組み直せるように、
   時間割は「配列を作る純関数」にしてある。 */

export const SPEEDS = {
  slow: { label: 'ゆっくり', base: 1000, gap: 200, cellGap: 520 },
  normal: { label: 'ふつう', base: 560, gap: 110, cellGap: 320 },
  fast: { label: 'はやい', base: 320, gap: 60, cellGap: 180 },
};

export const DEFAULT_SPEED = 'normal';

/* 長い画は少し長く、短い画は短く。道のりにそのまま比例させると、点（短い画）が
   一瞬で終わって目で追えなくなるので、平方根でならす。 */
export function durationFor(length, base) {
  const ratio = Math.sqrt(Math.max(1, length) / 55);
  return Math.round(base * Math.min(1.7, Math.max(0.55, ratio)));
}

export function buildTimeline(order, speedKey = DEFAULT_SPEED) {
  const speed = SPEEDS[speedKey] || SPEEDS[DEFAULT_SPEED];
  const items = [];
  let at = 0;
  order.forEach((entry, index) => {
    const duration = durationFor(entry.stroke.length, speed.base);
    items.push({ ...entry, index, start: at, duration });
    const next = order[index + 1];
    at += duration;
    if (next) at += next.cellIndex === entry.cellIndex ? speed.gap : speed.cellGap;
  });
  return { items, total: at };
}

/* 時刻から「いま何画目をどこまで書いたか」を出す。 */
export function stateAt(timeline, time) {
  const { items } = timeline;
  if (!items.length) return { index: -1, progress: 0, written: 0, done: true };
  if (time >= timeline.total) {
    return { index: items.length - 1, progress: 1, written: items.length, done: true };
  }
  let index = 0;
  for (let i = 0; i < items.length; i++) {
    if (time >= items[i].start) index = i;
    else break;
  }
  const item = items[index];
  const progress = Math.min(1, Math.max(0, (time - item.start) / item.duration));
  return { index, progress, written: progress >= 1 ? index + 1 : index, done: false };
}

/* 速さを変えたときに、同じ位置から続けるための時刻。 */
export function timeFor(timeline, index, progress) {
  const item = timeline.items[Math.max(0, Math.min(timeline.items.length - 1, index))];
  if (!item) return 0;
  return item.start + item.duration * Math.min(1, Math.max(0, progress));
}
