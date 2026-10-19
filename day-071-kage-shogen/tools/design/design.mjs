// 最終のデータ形式（stage）を作り、score.js で許容幅・一意性を測る設計ツール。
import { writeFileSync } from 'node:fs';
import { SHAPES } from '../../lib/shapes.js';
import { WALL, GRID, placePolygons, castShadows, iou } from '../../lib/geometry.js';
import { buildTarget, evaluate, pieceMasks, unionOf, solutionArrangement, DEFAULT_THRESHOLD } from '../../lib/score.js';

const RANGE = [8, 232];
export function makeStage(spec) {
  const { distance = 260, lampX, ly } = spec;
  const props = spec.props.map((p) => {
    const z = Math.round(distance * (1 - 1 / p.k) * 2) / 2;
    const k = distance / (distance - z);
    const scale = Math.round((p.ss / k) * 1000) / 1000;
    const decoy = Boolean(p.decoy);
    const y = decoy ? p.y : Math.round((ly + (p.target.y - ly) / k) * 2) / 2;
    const solution = decoy ? p.park : Math.round((lampX + (p.target.x - lampX) / k) * 2) / 2;
    const movable = p.movable ?? decoy;
    return { id: p.id, shape: p.shape, polygons: SHAPES[p.shape], scale, z, y, rot: p.rot ?? 0, decoy,
      x: movable ? { min: RANGE[0], max: RANGE[1], start: p.startX, solution } : { min: solution, max: solution, start: solution, solution } };
  });
  return { id: spec.id, name: spec.name, distance, lamp: { x: lampX, min: spec.lampRange?.[0] ?? 30, max: spec.lampRange?.[1] ?? 165, start: spec.lampStart, solution: ly }, props, threshold: spec.threshold ?? DEFAULT_THRESHOLD };
}
export const startOf = (stage) => ({ ly: stage.lamp.start, xs: Object.fromEntries(stage.props.map((p) => [p.id, p.x.start])) });
const withLy = (a, ly) => ({ ly, xs: { ...a.xs } });
const withX = (a, id, x) => ({ ly: a.ly, xs: { ...a.xs, [id]: x } });

export function calibrate(stage) {
  const target = buildTarget(stage); const sol = solutionArrangement(stage);
  const ev = (a) => evaluate(stage, target, a);
  const out = { solutionOk: ev(sol).success, start: (() => { const e = ev(startOf(stage)); return { iou: +e.iou.toFixed(2), success: e.success }; })() };
  const firstFail = (make, sign) => { for (let d = 0.5; d <= 60; d += 0.5) { if (!ev(make(sign * d)).success) return d; } return Infinity; };
  out.lamp = { up: firstFail((d) => withLy(sol, sol.ly + d), 1), down: firstFail((d) => withLy(sol, sol.ly + d), -1) };
  out.props = {};
  for (const p of stage.props) {
    if (p.x.min === p.x.max) continue;
    out.props[p.id] = p.decoy ? { unparkedOnWall: ev(withX(sol, p.id, p.x.start)).success }
      : { right: firstFail((d) => withX(sol, p.id, p.x.solution + d), 1), left: firstFail((d) => withX(sol, p.id, p.x.solution + d), -1) };
  }
  return { out, target };
}

// 全域の一意性：灯りの高さごとに、動かせる道具の横位置を貪欲に最適化し、それでも合格になる高さがあるかを調べる
export function uniqueness(stage, target, step = 2) {
  const movable = stage.props.filter((p) => p.x.min !== p.x.max && !p.decoy);
  const passes = [];
  for (let ly = stage.lamp.min; ly <= stage.lamp.max; ly += step) {
    const a = { ly, xs: Object.fromEntries(stage.props.map((p) => [p.id, p.x.solution])) };
    for (let sweep = 0; sweep < 2; sweep += 1) {
      for (const p of movable) {
        let best = -1; let bx = a.xs[p.id];
        for (let x = RANGE[0]; x <= RANGE[1]; x += 2) { const v = evaluate(stage, target, { ly, xs: { ...a.xs, [p.id]: x } }).iou; if (v > best) { best = v; bx = x; } }
        a.xs[p.id] = bx;
      }
    }
    const e = evaluate(stage, target, a);
    passes.push({ ly, iou: e.iou, success: e.success });
  }
  return passes;
}

// ---- 描画 ----
const S = 2.1; const M = 10;
function front(stage, a, { target, guide, label }) {
  const W = WALL.width; const H = WALL.height;
  const place = Object.fromEntries(stage.props.map((p) => [p.id, { x: a.xs[p.id], y: p.y }]));
  const lamp = { x: stage.lamp.x, y: a.ly };
  const P = (poly, attrs) => `<polygon points="${poly.map(([x, y]) => `${x.toFixed(1)},${(H - y).toFixed(1)}`).join(' ')}" ${attrs}/>`;
  let b = `<rect width="${W}" height="${H}" fill="#efe3c6"/><rect x="${stage.lamp.x - 1}" y="0" width="2" height="${H}" fill="#b08d57" fill-opacity=".45"/>`;
  if (guide) { const c = []; for (let r = 0; r < GRID.rows; r += 1) for (let q = 0; q < GRID.cols; q += 1) if (target.union[r * GRID.cols + q]) c.push(`<rect x="${q * GRID.cell}" y="${H - (r + 1) * GRID.cell}" width="${GRID.cell}" height="${GRID.cell}" fill="#d6402f" fill-opacity=".26"/>`); b += c.join(''); }
  for (const p of stage.props) b += `<line x1="0" x2="${W}" y1="${H - p.y}" y2="${H - p.y}" stroke="#8a6d3b" stroke-opacity=".3" stroke-dasharray="3 3"/>`;
  b += castShadows(stage.props, place, lamp, stage.distance).map((s) => P(s, 'fill="#1b1a38" fill-opacity=".88"')).join('');
  for (const p of stage.props) b += placePolygons(p.polygons, { x: place[p.id].x, y: p.y, rot: p.rot, scale: p.scale }).map((s) => P(s, `fill="${p.decoy ? '#d9c3c3' : '#e9d3a1'}" fill-opacity=".9" stroke="#7a5c33" stroke-width=".6"`)).join('');
  b += `<circle cx="${lamp.x}" cy="${H - lamp.y}" r="6" fill="#ffb84d" stroke="#fff" stroke-width="1"/>`;
  const e = evaluate(stage, target, a);
  return { w: W * S + M * 2, h: H * S + M * 2 + 22, svg: `<g transform="translate(${M},${M}) scale(${S})"><clipPath id="w"><rect width="${W}" height="${H}"/></clipPath><g clip-path="url(#w)">${b}</g><rect width="${W}" height="${H}" fill="none" stroke="#fff3"/></g><text x="${M}" y="${H * S + M + 16}" fill="#ddd" font-size="13" font-family="sans-serif">${label} ly=${a.ly.toFixed(0)} IoU ${e.iou.toFixed(2)} ${e.success ? '✔成功' : ''}</text>` };
}
function side(stage, ly) {
  const W = stage.distance + 40; const H = WALL.height + 10; const sc = 1.1;
  const X = (z) => stage.distance + 20 - z; const Y = (y) => H - y;
  let b = `<rect width="${W}" height="${H}" fill="#1a1830"/><line x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}" stroke="#6a5f99"/><rect x="${X(0)}" y="${Y(WALL.height)}" width="6" height="${WALL.height}" fill="#efe3c6"/>`;
  for (const p of stage.props) {
    const o = placePolygons(p.polygons, { x: 0, y: p.y, rot: p.rot, scale: p.scale }); const ys = o.flat().map(([, y]) => y); const lo = Math.min(...ys); const hi = Math.max(...ys);
    const k = stage.distance / (stage.distance - p.z);
    if (!p.decoy) for (const yy of [lo, hi]) b += `<line x1="${X(stage.distance)}" y1="${Y(ly)}" x2="${X(0)}" y2="${Y(ly + k * (yy - ly))}" stroke="#ffb84d" stroke-opacity=".3"/>`;
    b += `<rect x="${X(p.z) - 2}" y="${Y(hi)}" width="4" height="${hi - lo}" fill="${p.decoy ? '#d9c3c3' : '#e9d3a1'}"/><text x="${X(p.z)}" y="${Y(lo) + 11}" fill="#cfc6ff" font-size="9" text-anchor="middle" font-family="sans-serif">${p.id}</text>`;
  }
  b += `<circle cx="${X(stage.distance)}" cy="${Y(ly)}" r="6" fill="#ffb84d"/>`;
  return { w: W * sc, h: H * sc + 22, svg: `<g transform="scale(${sc})">${b}</g><text x="4" y="${H * sc + 16}" fill="#ddd" font-size="13" font-family="sans-serif">横から（灯り ${ly}cm）</text>` };
}
export function sheet(stage, target, file) {
  const sol = solutionArrangement(stage); const st = startOf(stage);
  const aligned = (ly) => ({ ly, xs: { ...sol.xs } });
  const panels = [
    front(stage, sol, { target, guide: true, label: '正解' }),
    front(stage, st, { target, guide: false, label: '開始' }),
    front(stage, aligned(sol.ly - 14), { target, guide: false, label: '低め(横は正解)' }),
    front(stage, aligned(sol.ly + 14), { target, guide: false, label: '高め(横は正解)' }),
    side(stage, sol.ly),
  ];
  let x = 0; let y = 0; let rowH = 0; let body = ''; let maxW = 0;
  panels.forEach((p, i) => { if (i % 3 === 0 && i > 0) { y += rowH; x = 0; rowH = 0; } body += `<g transform="translate(${x},${y})">${p.svg}</g>`; x += p.w; rowH = Math.max(rowH, p.h); maxW = Math.max(maxW, x); });
  const total = y + rowH;
  writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" width="${maxW}" height="${total}" viewBox="0 0 ${maxW} ${total}"><rect width="${maxW}" height="${total}" fill="#14122a"/>${body}</svg>`);
}
