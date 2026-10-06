/* 受賞した歳のひろがり（15〜100歳・1歳1本）。
   viewBox を画面の幅そのものにして描く。viewBox を固定して伸縮させると、図の文字まで画面幅で大きさが変わる
   （UI採点1周目：スマホ13px→PC16〜21px）。文字の大きさは CSS の px のまま、位置だけを幅に合わせる */
const FIRST = 15;
const LAST = 100;
const SLOTS = LAST - FIRST + 1;

export function bandSvg(summary, age = null, width = 740) {
  const w = Math.max(280, Math.round(width));
  const left = 6, right = 6, top = 40, base = 166;          // 棒は最大126px
  const step = (w - left - right) / SLOTS;
  const x = (value) => left + (value - FIRST) * step;
  const barWidth = Math.max(2, step * 0.62);
  const max = Math.max(1, ...summary.histogram.values());
  const bars = Array.from({ length: SLOTS }, (_, i) => {
    const value = i + FIRST, count = summary.histogram.get(value) || 0, height = count / max * (base - top);
    return `<rect x="${x(value).toFixed(1)}" y="${(base - height).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${height.toFixed(1)}" class="${value === age ? 'selected-bar' : 'bar'}"/>`;
  }).join('');
  const inside = age !== null && age >= FIRST && age <= LAST;
  const markerX = x(Math.max(FIRST, Math.min(LAST, age ?? FIRST))) + barWidth / 2;
  const anchor = markerX > w * 0.72 ? 'end' : markerX < w * 0.28 ? 'start' : 'middle';
  const count = age === null ? 0 : summary.histogram.get(age) || 0;
  const marker = age === null ? '' : `<path d="M${markerX.toFixed(1)} 30V${base + 2}" class="marker"/><text x="${markerX.toFixed(1)}" y="20" text-anchor="${anchor}" class="marker-label">あなた ${age}歳：${count}人${inside ? '' : '（図の外）'}</text>`;
  const ticks = [20, 40, 60, 80, 100].map((value) => `<text x="${(x(value) + barWidth / 2).toFixed(1)}" y="${base + 20}" text-anchor="middle">${value}</text>`).join('');
  const endpoints = summary.youngest
    ? `<text x="${left}" y="${base + 46}" class="endpoint">最年少 ${summary.youngest.age}歳</text><text x="${w - right}" y="${base + 46}" text-anchor="end" class="endpoint">最年長 ${summary.oldest.age}歳</text>`
    : '';
  const label = `15〜100歳の受賞回数。${summary.youngest ? `最年少${summary.youngest.age}歳、最年長${summary.oldest.age}歳。` : ''}${age === null ? '' : `あなたは${age}歳、${count}回。`}`;
  return `<svg viewBox="0 0 ${w} ${base + 58}" width="${w}" height="${base + 58}" role="img" aria-label="${label}">${bars}${marker}<path d="M${left} ${base + 0.5}H${w - right}" class="axis"/>${ticks}${endpoints}</svg>`;
}
