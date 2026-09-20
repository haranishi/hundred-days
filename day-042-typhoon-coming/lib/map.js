/* 台風の地図を canvas に直接描く。地図ライブラリもタイルも使わない
   （停電の前に開くことがあるので、外から読むものを増やさない）。
   描くのは気象庁 forecast.json の幾何そのままで、位置や半径は計算し直さない。 */
import { boundsOf, createProjection, padBounds } from './project.js';

const SEA = '#dfe9ef';
const LAND = '#e9e6dc';
const COAST = '#9a9c93';
const GRID = 'rgba(22,22,15,.12)';
const INK = '#16160f';
const TRACK = '#3d4a52';
const STORM = '#1c3f56';
const HOME = '#8a3a12';

const rad = (n) => (n * Math.PI) / 180;
/* 気象庁の角度は北を0度とした時計回り。canvas は東が0度なので90度ずらす */
const canvasAngle = (bearing) => rad(bearing - 90);

/** 描くものを全部囲む枠。選んだ街があればそれも含める */
export function frameFor(forecast, home) {
  const points = [];
  for (const step of forecast?.steps ?? []) {
    if (step.center) points.push(step.center);
    for (const at of [...step.track.preTyphoon, ...step.track.typhoon]) points.push(at);
    for (const arc of step.arcs) {
      const degrees = arc.radius / 111320;
      points.push({ lat: arc.center.lat + degrees, lng: arc.center.lng });
      points.push({ lat: arc.center.lat - degrees, lng: arc.center.lng });
      const wide = degrees / Math.cos(rad(arc.center.lat));
      points.push({ lat: arc.center.lat, lng: arc.center.lng + wide });
      points.push({ lat: arc.center.lat, lng: arc.center.lng - wide });
    }
    for (const [from, to] of step.lines) points.push(from, to);
  }
  if (home) points.push(home);
  const bounds = boundsOf(points);
  return bounds ? padBounds(bounds, 0.1) : null;
}

/** 点の集まりを囲む凸包（画面座標）。2つの円の和は、境界の点の凸包でちょうど覆える */
export function convexHull(points) {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list) => {
    const out = [];
    for (const at of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], at) <= 0) out.pop();
      out.push(at);
    }
    return out.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

const ringPoints = (projection, center, meters, steps = 48) => {
  const radius = projection.metersToPixels(meters, center.lat);
  const at = projection.toPixel(center.lat, center.lng);
  return Array.from({ length: steps }, (_, i) => {
    const angle = (i / steps) * Math.PI * 2;
    return { x: at.x + radius * Math.cos(angle), y: at.y + radius * Math.sin(angle) };
  });
};

function path(ctx, points) {
  points.forEach((at, i) => (i ? ctx.lineTo(at.x, at.y) : ctx.moveTo(at.x, at.y)));
}

function drawLand(ctx, projection, land) {
  ctx.fillStyle = LAND;
  ctx.strokeStyle = COAST;
  ctx.lineWidth = 1;
  for (const ring of land?.polygons ?? []) {
    ctx.beginPath();
    path(ctx, ring.map(([lng, lat]) => projection.toPixel(lat, lng)));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function drawGrid(ctx, projection) {
  const view = projection.bounds();
  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let lng = Math.ceil(view.west / 10) * 10; lng <= view.east; lng += 10) {
    const top = projection.toPixel(view.north, lng);
    const bottom = projection.toPixel(view.south, lng);
    ctx.moveTo(top.x, top.y); ctx.lineTo(bottom.x, bottom.y);
  }
  for (let lat = Math.ceil(view.south / 10) * 10; lat <= view.north; lat += 10) {
    const left = projection.toPixel(lat, view.west);
    const right = projection.toPixel(lat, view.east);
    ctx.moveTo(left.x, left.y); ctx.lineTo(right.x, right.y);
  }
  ctx.stroke();
}

function drawTrack(ctx, projection, step) {
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  for (const [name, dashed] of [['preTyphoon', true], ['typhoon', false]]) {
    const line = step.track[name];
    if (line.length < 2) continue;
    ctx.setLineDash(dashed ? [4, 4] : []);
    ctx.strokeStyle = TRACK;
    ctx.beginPath();
    path(ctx, line.map((at) => projection.toPixel(at.lat, at.lng)));
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

/* 暴風警戒域は「これから暴風域に入るおそれのある範囲」。いちばん先の予報に
   それまでの全部が入っているので、最後の1つだけ描けば全体が出る。
   塗りは弧が示す円の和で作る（隣り合う円の凸包＝その2円を包む形） */
function drawStormArea(ctx, projection, step) {
  const circles = [];
  for (const arc of step.arcs) {
    const last = circles[circles.length - 1];
    if (!last || last.center.lat !== arc.center.lat || last.center.lng !== arc.center.lng || last.radius !== arc.radius) {
      circles.push({ center: arc.center, radius: arc.radius });
    }
  }
  ctx.fillStyle = 'rgba(28,63,86,.13)';
  for (let i = 0; i < circles.length; i += 1) {
    const here = ringPoints(projection, circles[i].center, circles[i].radius);
    const next = circles[i + 1] ? ringPoints(projection, circles[i + 1].center, circles[i + 1].radius) : [];
    ctx.beginPath();
    path(ctx, convexHull([...here, ...next]));
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(28,63,86,.55)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (const arc of step.arcs) {
    const at = projection.toPixel(arc.center.lat, arc.center.lng);
    const radius = projection.metersToPixels(arc.radius, arc.center.lat);
    ctx.moveTo(at.x + radius * Math.cos(canvasAngle(arc.from)), at.y + radius * Math.sin(canvasAngle(arc.from)));
    ctx.arc(at.x, at.y, radius, canvasAngle(arc.from), canvasAngle(arc.to));
  }
  for (const [from, to] of step.lines) {
    const a = projection.toPixel(from.lat, from.lng);
    const b = projection.toPixel(to.lat, to.lng);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
}

/* ---------------------------------------------------------------- ラベルの置き場所

   狭い画面では、予報円が重なって時刻のラベルどうし・選んだ場所のラベルとぶつかる
   （390px で「千代田区」が「21日15時」を覆っていた）。
   置いた矩形を覚えておき、次のラベルは重ならない候補へ逃がす。 */

/** ベースライン (x, y) に align で書いた文字の矩形 */
function labelBox(at, size) {
  const left = at.align === 'center' ? at.x - at.w / 2 : at.align === 'right' ? at.x - at.w : at.x;
  /* フチ（白い縁取り）のぶん、上下左右に少し広げて当たりを見る */
  return { x: left - 2, y: at.y - size, w: at.w + 4, h: size + 6 };
}

const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** 画面からはみ出したぶん。外に出たら読めないので、重なりと同じ扱いで数える */
const outside = (box, view) =>
  (Math.max(0, -box.x) + Math.max(0, box.x + box.w - view.width)) * box.h
  + (Math.max(0, -box.y) + Math.max(0, box.y + box.h - view.height)) * box.w;

/** 候補を順に見て、既に置いたラベルと重ならない最初のものを返す。全部だめなら重なりが最小のもの */
function place(candidates, placed, view, size) {
  let best = null;
  for (const candidate of candidates) {
    const box = labelBox(candidate, size);
    const cost = placed.reduce((sum, other) => sum + overlap(box, other), 0) + outside(box, view);
    if (!best || cost < best.cost) best = { ...candidate, box, cost };
    if (cost === 0) break;
  }
  return best;
}

/** 白いフチ＋本文。フチは文字の下に敷くので、線や塗りの上でも読める */
function drawLabel(ctx, text, at, color) {
  ctx.textAlign = at.align;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.strokeText(text, at.x, at.y);
  ctx.fillStyle = color;
  ctx.fillText(text, at.x, at.y);
}

function drawForecastCircles(ctx, projection, steps, labelOf, placed, view) {
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = STORM;
  const labels = [];
  for (const step of steps) {
    if (!step.circle?.center || !step.circle.radius) continue;
    const at = projection.toPixel(step.circle.center.lat, step.circle.center.lng);
    const radius = projection.metersToPixels(step.circle.radius, step.circle.center.lat);
    ctx.beginPath();
    ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    const label = labelOf(step);
    if (label) labels.push({ label, at, radius });
  }
  ctx.setLineDash([]);

  ctx.font = '600 12px -apple-system, "Hiragino Kaku Gothic ProN", sans-serif';
  ctx.textBaseline = 'alphabetic';
  labels.forEach(({ label, at, radius }, i) => {
    const w = ctx.measureText(label).width;
    const above = { x: at.x, y: at.y - radius - 6, align: 'center', w };
    const below = { x: at.x, y: at.y + radius + 18, align: 'center', w };
    const right = { x: at.x + radius + 6, y: at.y + 4, align: 'left', w };
    const left = { x: at.x - radius - 6, y: at.y + 4, align: 'right', w };
    /* まず円の上。ぶつかるときは左右交互へ寄せ、それでもだめなら円の下へ出す */
    const order = i % 2 ? [above, right, left, below] : [above, left, right, below];
    const chosen = place(order, placed, view, 12);
    drawLabel(ctx, label, chosen, INK);
    placed.push(chosen.box);
  });
}

function drawNow(ctx, projection, analysis) {
  if (!analysis?.center) return;
  const at = projection.toPixel(analysis.center.lat, analysis.center.lng);
  if (analysis.galeArea?.center && analysis.galeArea.radius) {
    ctx.fillStyle = 'rgba(28,63,86,.10)';
    ctx.beginPath();
    path(ctx, ringPoints(projection, analysis.galeArea.center, analysis.galeArea.radius, 72));
    ctx.closePath();
    ctx.fill();
  }
  for (const arc of analysis.arcs) {
    ctx.fillStyle = 'rgba(28,63,86,.30)';
    ctx.beginPath();
    path(ctx, ringPoints(projection, arc.center, arc.radius, 72));
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(at.x - 9, at.y - 9); ctx.lineTo(at.x + 9, at.y + 9);
  ctx.moveTo(at.x + 9, at.y - 9); ctx.lineTo(at.x - 9, at.y + 9);
  ctx.stroke();
}

function drawHome(ctx, projection, home, label, placed, view) {
  if (!home) return;
  const at = projection.toPixel(home.lat, home.lng);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = HOME;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.rect(at.x - 7, at.y - 7, 14, 14);
  ctx.fill();
  ctx.stroke();
  if (!label) return;

  ctx.font = '700 13px -apple-system, "Hiragino Kaku Gothic ProN", sans-serif';
  ctx.textBaseline = 'alphabetic';
  const w = ctx.measureText(label).width;
  /* 印の上下左右。予報時刻のラベルは先に置いてあるので、ぶつからない側へ逃げる。
     lead は印からラベルへの短い引き出し線（離して置いたときだけ引く） */
  const candidates = [
    { x: at.x, y: at.y - 14, align: 'center', w, lead: null },
    { x: at.x, y: at.y + 27, align: 'center', w, lead: [at.x, at.y + 8, at.x, at.y + 16] },
    { x: at.x + 17, y: at.y + 5, align: 'left', w, lead: [at.x + 8, at.y, at.x + 16, at.y] },
    { x: at.x - 17, y: at.y + 5, align: 'right', w, lead: [at.x - 8, at.y, at.x - 16, at.y] },
  ];
  const chosen = place(candidates, placed.filter((box) => box.own !== 'home'), view, 13);
  if (chosen.lead) {
    ctx.strokeStyle = HOME;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(chosen.lead[0], chosen.lead[1]);
    ctx.lineTo(chosen.lead[2], chosen.lead[3]);
    ctx.stroke();
  }
  drawLabel(ctx, label, chosen, HOME);
  placed.push(chosen.box);
}

/**
 * 1枚描く。canvas が使えなければ false を返し、呼び側が「地図を表示できません」に落とす。
 * labelOf は予報円に添える時刻の文（lib/time.js に置いてある文言を渡す）。
 */
export function drawMap(canvas, { forecast, land, home, homeName, labelOf = () => '', ratio = 1 }) {
  const ctx = canvas.getContext?.('2d');
  if (!ctx || !forecast) return false;
  const width = canvas.clientWidth || canvas.width || 320;
  const height = Math.round(Math.min(width * 0.75, 560));
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.height = `${height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const frame = frameFor(forecast, home);
  if (!frame) return false;
  const projection = createProjection(frame, width, height);

  ctx.fillStyle = SEA;
  ctx.fillRect(0, 0, width, height);
  drawLand(ctx, projection, land);
  drawGrid(ctx, projection);

  const steps = forecast.steps;
  const analysis = steps.find((step) => step.part === '実況') ?? steps[0];
  const last = [...steps].reverse().find((step) => step.arcs.length > 1);
  drawTrack(ctx, projection, analysis);
  if (last) drawStormArea(ctx, projection, last);
  /* 置いたラベルの矩形を持ち回して、あとから描くラベルを逃がす。
     選んだ場所は最後＝いちばん自由に動かせる。
     印そのものも場所を取る物として数える（文字が印に重なると両方読めない）。
     ただし選んだ場所のラベルは、自分の印のすぐ横に添えてよい＝own で外す */
  const placed = [];
  const view = { width, height };
  const markerBox = (point, half, own) => ({ x: point.x - half, y: point.y - half, w: half * 2, h: half * 2, own });
  if (analysis?.center) placed.push(markerBox(projection.toPixel(analysis.center.lat, analysis.center.lng), 12));
  if (home) placed.push(markerBox(projection.toPixel(home.lat, home.lng), 10, 'home'));
  drawForecastCircles(ctx, projection, steps, labelOf, placed, view);
  drawNow(ctx, projection, analysis);
  drawHome(ctx, projection, home, homeName, placed, view);
  return true;
}
