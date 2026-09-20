import { clockOf } from './time.js';
/* 隣接区間の傾きが反転する点では接線を水平にする単調三次補間。
   毎時値と公表された満干点を通し、区間の外へ膨らませない。 */
export function curvePoints(day, tomorrow) {
  const points = new Map(day.hourly.map((cm, hour) => [hour * 60, cm]));
  if (Number.isFinite(tomorrow?.hourly[0])) points.set(1440, tomorrow.hourly[0]);
  for (const event of [...day.highs, ...day.lows]) {
    const [hour, minute] = event.time.split(':').map(Number);
    points.set(hour * 60 + minute, event.cm);
  }
  return [...points].filter(([, cm]) => Number.isFinite(cm)).sort((a, b) => a[0] - b[0]);
}
export function smoothPath(points) {
  if (!points.length) return '';
  const slopes = points.slice(1).map((p, i) => (p[1] - points[i][1]) / (p[0] - points[i][0]));
  const tangents = points.map((_, i) => {
    if (!i) return slopes[0] ?? 0;
    if (i === points.length - 1) return slopes.at(-1);
    const a = slopes[i - 1], b = slopes[i];
    return a * b <= 0 ? 0 : 2 * a * b / (a + b);
  });
  return `M${points[0].join(',')}` + points.slice(1).map((p, i) => {
    const a = points[i], dx = (p[0] - a[0]) / 3;
    return ` C${a[0] + dx},${a[1] + tangents[i] * dx} ${p[0] - dx},${p[1] - tangents[i + 1] * dx} ${p[0]},${p[1]}`;
  }).join('');
}
/* 縦軸はきりのよい刻みで3〜5本。刻みは10・20・50・100（巨大な干満差の地点向けに200・500まで）から
   「本数が4本に近いもの」を選び、同じ近さなら目盛りの幅が狭い方＝線が大きく描ける方を採る。
   下端は刻みの倍数まで下げ、上端はデータの上に余白を足すだけにして、線が天井に張り付かないようにする。 */
const STEPS = [10, 20, 50, 100, 200, 500];
export function scaleFor(values) {
  const low = Math.min(...values), high = Math.max(...values);
  const pad = Math.max(6, (high - low) / 10);
  const plans = STEPS.map((step) => {
    const min = Math.floor(low / step) * step;
    const max = Math.max(high + pad, min + step * 2);
    const ticks = [];
    for (let cm = min; cm <= max; cm += step) ticks.push(cm);
    return { min, max, step, ticks };
  });
  plans.sort((a, b) => Math.abs(a.ticks.length - 4) - Math.abs(b.ticks.length - 4)
    || (a.max - a.min) - (b.max - b.min) || a.ticks.length - b.ticks.length || a.step - b.step);
  return plans[0];
}
export function curveSvg(day, tomorrow, now, level, width = 656) {
  const points = curvePoints(day, tomorrow);
  if (!points.length) return '';
  const all = points.map((p) => p[1]).concat(Number.isFinite(level) ? [level] : []);
  const { min, max, ticks: tickValues } = scaleFor(all);
  const x = (minute) => 44 + minute / 1440 * (width - 76);
  const y = (cm) => 186 - (cm - min) / (max - min) * 146;
  const plotted = points.map(([minute, cm]) => [x(minute), y(cm)]);
  const path = smoothPath(plotted);
  const clock = clockOf(now), [hour, minute] = clock.split(':').map(Number);
  const nowX = x(hour * 60 + minute);
  // 「いま」の縦線と時刻ラベルが重ならないよう、近すぎるラベルは線から離す方向へ36pxずらす。
  const away = (value) => {
    if (Math.abs(value - nowX) >= 36) return value;
    return value + 36 * (value === nowX ? (nowX > width / 2 ? -1 : 1) : Math.sign(value - nowX));
  };
  const top = tickValues.at(-1);
  const ticks = tickValues.map((cm) => `<line x1="44" x2="${width - 32}" y1="${y(cm)}" y2="${y(cm)}" class="grid-line"/><text x="36" y="${y(cm) + 4}" text-anchor="end">${cm}${cm === top ? 'cm' : ''}</text>`).join('');
  const events = [['high', day.highs], ['low', day.lows]].flatMap(([type, rows]) => rows.map((event) => {
    const [h, m] = event.time.split(':').map(Number), cx = x(h * 60 + m), cy = y(event.cm);
    return `<circle cx="${cx}" cy="${cy}" r="4" class="event-dot"/><text x="${Math.max(68, Math.min(width - 56, away(cx)))}" y="${cy + (type === 'low' ? 20 : -12)}" text-anchor="middle">${event.time}</text>`;
  })).join('');
  const side = nowX > width / 2 ? -1 : 1;
  const nowLevel = Number.isFinite(level)
    ? `<circle cx="${nowX}" cy="${y(level)}" r="5" class="now-dot"/><text x="${nowX + side * 13}" y="${y(level) + 5}" text-anchor="${side < 0 ? 'end' : 'start'}" class="now-level-label">${Math.round(level)}cm</text>`
    : '';
  return `<defs><linearGradient id="water-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#9cc3d9" stop-opacity=".65"/><stop offset="1" stop-color="#9cc3d9" stop-opacity="0"/></linearGradient></defs>
    ${ticks}
    <path d="${path} L${plotted.at(-1)[0]},186 L${plotted[0][0]},186 Z" fill="url(#water-fill)"/>
    <path d="${path}" class="water-line"/>${events}
    <line x1="${nowX}" x2="${nowX}" y1="34" y2="186" class="now-line"/>
    ${nowLevel}
    <text x="${Math.max(62, Math.min(width - 49, nowX))}" y="22" text-anchor="middle" class="now-label">いま</text>
    ${[0, 6, 12, 18, 24].map((h) => `<text x="${x(h * 60)}" y="228" text-anchor="middle">${h}時</text>`).join('')}`;
}
export function curveLabel(day, now, heading) {
  const list = (rows) => rows.length ? rows.map((event) => `${event.time} ${event.cm}cm`).join('、') : '予測なし';
  return `0時から24時の潮位。満潮 ${list(day.highs)}。干潮 ${list(day.lows)}。いまは${clockOf(now)}、${heading.replace('いま、', '')}`;
}
