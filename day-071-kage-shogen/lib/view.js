// 描画。壁・証言のスケッチ・現場図をCanvas 2Dへ描く。モデルは変更せず、判定も持たない。
// 色は app.css の :root のトークンを読む（読めないときの既定は下の DEFAULT_COLORS。トークンと同じ値に保つ）。
import { VIEW } from './config.js';
import { WALL, castShadows, placePolygons, rasterize } from './geometry.js';
import { createTransform } from './transform.js';
import { propBounds } from './hit.js';

const DEFAULT_COLORS = {
  stage: '#12102a', panel: '#1b1840', wall: '#efe6cf', wallEdge: '#cdbf9d', ruler: '#6b4f2a', shadow: '#1d1a3a',
  prop: '#e8d2a2', propLine: '#6b4f2a', lamp: '#ffb84d', stamp: '#d6402f', text: '#f1ecff', muted: '#b9b2d8', focus: '#ffd36e',
};
const CSS_NAMES = {
  stage: '--stage', panel: '--panel', wall: '--wall', wallEdge: '--wall-edge', ruler: '--ruler', shadow: '--shadow',
  prop: '--prop', propLine: '--prop-line', lamp: '--lamp', stamp: '--stamp', text: '--text', muted: '--muted', focus: '--focus',
};
const FONT = 'system-ui, -apple-system, "Hiragino Sans", "Yu Gothic", sans-serif';
// 身長計の数字の大きさ（px）。紙の上で読める大きさ（画面評価：12px以上）。
export const RULER_FONT_PX = 12;

function readColors(canvas) {
  if (typeof getComputedStyle !== 'function') return { ...DEFAULT_COLORS };
  let style;
  try { style = getComputedStyle(canvas); } catch { return { ...DEFAULT_COLORS }; }
  return Object.fromEntries(Object.entries(CSS_NAMES).map(([key, name]) => [key, style.getPropertyValue(name).trim() || DEFAULT_COLORS[key]]));
}

// '#rrggbb' に透明度を付ける。それ以外の書式はそのまま返す。
function rgba(color, alpha) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const n = parseInt(match[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// 2D contextとサイズの管理。取れなければ null（描画不可）。
function setup(canvas) {
  let context = null;
  try { context = canvas.getContext('2d'); } catch { return null; }
  if (!context) return null;
  const state = { width: 1, height: 1, dpr: 1, colors: { ...DEFAULT_COLORS } };
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    Object.assign(state, { width, height, dpr, colors: readColors(canvas) });
  }
  resize();
  return { ctx: context, state, resize };
}

// 非表示のパネルにあるcanvasは大きさが0になる。小さすぎるときは描かない（半径が負になって例外になるため）。
const drawable = ({ width, height }) => width >= 80 && height >= 60;
// スケッチは塗りと枠だけ（半径を使わない）なので、狭くて低い画面の証言ストリップ（72×54）でも描く。
const sketchDrawable = ({ width, height }) => width >= 40 && height >= 30;

const worldSpace = (ctx, t, dpr) => ctx.setTransform(t.scale * dpr, 0, 0, -t.scale * dpr, (t.offsetX - VIEW.minX * t.scale) * dpr, (t.offsetY + VIEW.maxY * t.scale) * dpr);
const screenSpace = (ctx, dpr) => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

function tracePolygon(ctx, polygon) {
  ctx.moveTo(polygon[0][0], polygon[0][1]);
  for (let i = 1; i < polygon.length; i += 1) ctx.lineTo(polygon[i][0], polygon[i][1]);
  ctx.closePath();
}

// ガイドとスケッチは、ねらいの影を0.5cmの細かい格子で塗り直して輪郭をなめらかにする（判定の格子は2cm）。
const FINE = Object.freeze({ cell: 0.5, cols: 480, rows: 360 });

// マスクの横一列の連なり（描画用の長方形）と、境界の線分を、マスクごとに1回だけ作る。
const maskCache = new WeakMap();
function maskShapes(mask, grid) {
  let cached = maskCache.get(mask);
  if (cached) return cached;
  const { cols, rows, cell } = grid;
  const runs = [];
  const edges = [];
  const filled = (c, r) => c >= 0 && c < cols && r >= 0 && r < rows && mask[r * cols + c] === 1;
  for (let r = 0; r < rows; r += 1) {
    let start = -1;
    for (let c = 0; c <= cols; c += 1) {
      const on = filled(c, r);
      if (on && start < 0) start = c;
      if (!on && start >= 0) { runs.push([start * cell, r * cell, (c - start) * cell, cell]); start = -1; }
      if (!on) continue;
      const x0 = c * cell;
      const y0 = r * cell;
      if (!filled(c, r - 1)) edges.push([x0, y0, x0 + cell, y0]);
      if (!filled(c, r + 1)) edges.push([x0, y0 + cell, x0 + cell, y0 + cell]);
      if (!filled(c - 1, r)) edges.push([x0, y0, x0, y0 + cell]);
      if (!filled(c + 1, r)) edges.push([x0 + cell, y0, x0 + cell, y0 + cell]);
    }
  }
  cached = { runs, edges };
  maskCache.set(mask, cached);
  return cached;
}

// 正解の配置で落ちる影（ねらい）の、細かい格子の形。場面ごとに1回だけ作る。
const guideCache = new WeakMap();
function guideShapes(stage) {
  let cached = guideCache.get(stage);
  if (cached) return cached;
  const placements = Object.fromEntries(stage.props.map((prop) => [prop.id, { x: prop.x.solution, y: prop.y }]));
  const mask = rasterize(castShadows(stage.props, placements, { x: stage.lamp.x, y: stage.lamp.solution }, stage.distance), FINE);
  cached = maskShapes(mask, FINE);
  guideCache.set(stage, cached);
  return cached;
}

// 画面と同じ解像度のオフスクリーン層。作れない環境（テストなど）では null。
function makeLayer(width, height, dpr) {
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  let canvas = null;
  try {
    if (typeof OffscreenCanvas === 'function') canvas = new OffscreenCanvas(pixelWidth, pixelHeight);
    else if (typeof document !== 'undefined') { canvas = document.createElement('canvas'); canvas.width = pixelWidth; canvas.height = pixelHeight; }
  } catch { return null; }
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  return ctx ? { canvas, ctx } : null;
}

// ガイドを、多角形から直接（面と外周の線）オフスクリーンへ描く。外周は、太い線で縁取ってから内側を抜く方法で、部品の境目の線は残らない。
function buildGuideLayers(stage, t, state) {
  const { width, height, dpr, colors } = state;
  const fill = makeLayer(width, height, dpr);
  const ring = makeLayer(width, height, dpr);
  if (!fill || !ring) return null;
  const placements = Object.fromEntries(stage.props.map((prop) => [prop.id, { x: prop.x.solution, y: prop.y }]));
  const polygons = castShadows(stage.props, placements, { x: stage.lamp.x, y: stage.lamp.solution }, stage.distance);
  for (const layer of [fill, ring]) {
    worldSpace(layer.ctx, t, dpr);
    layer.ctx.beginPath();
    layer.ctx.rect(0, 0, WALL.width, WALL.height);
    layer.ctx.clip();
  }
  fill.ctx.fillStyle = colors.stamp;
  for (const polygon of polygons) { fill.ctx.beginPath(); tracePolygon(fill.ctx, polygon); fill.ctx.fill(); }
  const c = ring.ctx;
  c.lineJoin = 'round';
  c.lineWidth = 3.6 / t.scale;
  c.strokeStyle = colors.stamp;
  for (const polygon of polygons) { c.beginPath(); tracePolygon(c, polygon); c.stroke(); }
  c.globalCompositeOperation = 'destination-out';
  for (const polygon of polygons) { c.beginPath(); tracePolygon(c, polygon); c.fill(); }
  return { fill: fill.canvas, ring: ring.canvas };
}

function fillRuns(ctx, shapes) {
  ctx.beginPath();
  for (const [x, y, w, h] of shapes.runs) ctx.rect(x, y, w, h);
  ctx.fill();
}

function strokeEdges(ctx, shapes) {
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of shapes.edges) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); }
  ctx.stroke();
}

const PILL = Object.freeze({ height: 22, pad: 7 });

function pillWidth(ctx, text, font = `600 12px ${FONT}`) {
  ctx.font = font;
  return ctx.measureText(text).width + PILL.pad * 2;
}

// 角の丸い札。left は左端、y は縦の中心。
function pill(ctx, text, left, y, colors, { accent = colors.text, font = `600 12px ${FONT}` } = {}) {
  const width = pillWidth(ctx, text, font);
  ctx.fillStyle = rgba(colors.panel, 0.9);
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(left, y - PILL.height / 2, width, PILL.height, PILL.height / 2) : ctx.rect(left, y - PILL.height / 2, width, PILL.height);
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + PILL.pad, y + 0.5);
  return { left, right: left + width, top: y - PILL.height / 2, bottom: y + PILL.height / 2 };
}

const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// 札（幅 width・高さ PILL.height）の置き場を選ぶ。候補は、枠の上の中央 → 下の中央 → 右横 → 左横（枠の縦の中央）
// → 重なる物の左右へずらした位置。ずらすのは、札が枠の横幅の範囲に少しでもかかる所まで（離れた所へ飛ばさない）。
// 画面の外へは出さない。どれも重なるなら、重なりのいちばん少ない候補にする。
export function placeTag({ width, frame, bounds, avoid, prefer = 'above' }) {
  const half = PILL.height / 2;
  const centerX = (frame.left + frame.right) / 2;
  const order = [frame.top - 7 - half, frame.bottom + 7 + half];
  if (prefer === 'below') order.reverse();
  const rows = order.filter((y) => y - half >= bounds.top && y + half <= bounds.bottom);
  if (rows.length === 0) rows.push(Math.max(bounds.top + half, frame.top - 7 - half));
  const clampLeft = (left) => Math.max(bounds.left, Math.min(bounds.right - width, left));
  const rectAt = (left, y) => ({ left, right: left + width, top: y - half, bottom: y + half });
  const near = (rect) => rect.right > frame.left && rect.left < frame.right;
  const candidates = rows.map((y) => rectAt(clampLeft(centerX - width / 2), y));
  // 横：枠の左右にある選択の矢印（9px）の外側。画面に収まるときだけ。
  const middle = Math.max(bounds.top + half, Math.min(bounds.bottom - half, (frame.top + frame.bottom) / 2));
  for (const left of [frame.right + 12, frame.left - 12 - width]) {
    if (left >= bounds.left && left + width <= bounds.right) candidates.push(rectAt(left, middle));
  }
  for (const y of rows) {
    for (const item of avoid) {
      for (const left of [item.right + 4, item.left - 4 - width]) {
        const rect = rectAt(clampLeft(left), y);
        if (near(rect)) candidates.push(rect);
      }
    }
  }
  const area = (rect) => avoid.reduce((sum, item) => sum + (overlaps(rect, item)
    ? (Math.min(rect.right, item.right) - Math.max(rect.left, item.left)) * (Math.min(rect.bottom, item.bottom) - Math.max(rect.top, item.top)) : 0), 0);
  const clear = candidates.find((rect) => area(rect) === 0);
  if (clear) return clear;
  return candidates.reduce((best, rect) => (area(rect) < area(best) ? rect : best));
}

// ---- 壁 ----
export function createWallRenderer(canvas) {
  const base = setup(canvas);
  if (!base) return null;
  const { ctx, state } = base;
  let guideCacheEntry = { key: '', layers: null };

  // 大きさ・解像度・色・場面が同じ間は、ガイドの層を使い回す。
  function guideLayers(stage, t) {
    const key = `${stage.id}|${state.width}x${state.height}@${state.dpr}|${state.colors.stamp}`;
    if (guideCacheEntry.key !== key) guideCacheEntry = { key, layers: buildGuideLayers(stage, t, state) };
    return guideCacheEntry.layers;
  }

  function render({ stage, arrangement, selected = 'lamp', guideOn = false, flash = 0 }) {
    const { width, height, dpr, colors } = state;
    if (!drawable(state)) return;
    const t = createTransform(width, height);
    const lamp = { x: stage.lamp.x, y: arrangement.ly };
    screenSpace(ctx, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = colors.stage;
    ctx.fillRect(0, 0, width, height);

    // 壁と、灯りが当たる明るい円。
    worldSpace(ctx, t, dpr);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WALL.width, WALL.height);
    ctx.clip();
    ctx.fillStyle = colors.wall;
    ctx.fillRect(0, 0, WALL.width, WALL.height);
    ctx.fillStyle = rgba(colors.wallEdge, 0.2);
    for (let stripe = 6; stripe < WALL.width; stripe += 12) ctx.fillRect(stripe, 0, 2.4, WALL.height);
    const light = ctx.createRadialGradient(lamp.x, lamp.y, 4, lamp.x, lamp.y, 190);
    light.addColorStop(0, 'rgba(255, 246, 214, 0.75)');
    light.addColorStop(0.5, 'rgba(255, 236, 190, 0.22)');
    light.addColorStop(1, 'rgba(255, 236, 190, 0)');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, WALL.width, WALL.height);
    ctx.fillStyle = rgba(colors.wallEdge, 0.9);
    ctx.fillRect(0, 0, WALL.width, 4);
    // ガイド（ねらいの面）。
    const layers = guideOn || flash > 0 ? guideLayers(stage, t) : null;
    if (guideOn) {
      if (layers) {
        screenSpace(ctx, dpr);
        ctx.globalAlpha = 0.22;
        ctx.drawImage(layers.fill, 0, 0, width, height);
        ctx.globalAlpha = 1;
        worldSpace(ctx, t, dpr);
      } else {
        ctx.fillStyle = rgba(colors.stamp, 0.22);
        fillRuns(ctx, guideShapes(stage));
      }
    }
    // 影。道具ごとに塗る（巻き方向が混ざっても穴が空かない）。
    const placements = Object.fromEntries(stage.props.map((prop) => [prop.id, { x: arrangement.xs[prop.id] ?? prop.x.solution, y: prop.y }]));
    ctx.fillStyle = colors.shadow;
    for (const polygon of castShadows(stage.props, placements, lamp, stage.distance)) {
      ctx.beginPath();
      tracePolygon(ctx, polygon);
      ctx.fill();
    }
    // ガイドの輪郭（影の上にも見える）。成功の瞬間は flash で強める。
    if (guideOn || flash > 0) {
      if (layers) {
        screenSpace(ctx, dpr);
        ctx.globalAlpha = 0.95;
        if (flash > 0) { ctx.shadowColor = colors.stamp; ctx.shadowBlur = 14 * flash * dpr; }
        ctx.drawImage(layers.ring, 0, 0, width, height);
        if (flash > 0) ctx.drawImage(layers.ring, 0, 0, width, height);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        worldSpace(ctx, t, dpr);
      } else {
        ctx.strokeStyle = rgba(colors.stamp, Math.min(1, 0.75 + flash * 0.25));
        ctx.lineWidth = (1.8 + flash * 2.4) / t.scale;
        ctx.lineJoin = 'round';
        strokeEdges(ctx, guideShapes(stage));
      }
    }
    ctx.restore();

    // 光の筋：灯り・道具の中心・影の中心は一直線に並ぶ。選んだ道具は濃く。
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WALL.width, WALL.height);
    ctx.clip();
    ctx.lineWidth = 1.2 / t.scale;
    ctx.setLineDash([2 / t.scale, 6 / t.scale]);
    for (const prop of stage.props) {
      const k = stage.distance / (stage.distance - prop.z);
      const at = placements[prop.id];
      const end = { x: lamp.x + (at.x - lamp.x) * k, y: lamp.y + (at.y - lamp.y) * k };
      ctx.strokeStyle = rgba(colors.lamp, prop.id === selected ? 0.75 : 0.28);
      ctx.beginPath();
      ctx.moveTo(lamp.x, lamp.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();

    // 棚（すべれる道具の高さ）。
    ctx.lineWidth = 1 / t.scale;
    ctx.setLineDash([4 / t.scale, 4 / t.scale]);
    ctx.strokeStyle = rgba(colors.propLine, 0.38);
    for (const prop of stage.props) {
      if (prop.x.min >= prop.x.max) continue;
      ctx.beginPath();
      ctx.moveTo(0, prop.y);
      ctx.lineTo(WALL.width, prop.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // 道具（灯りに遠い順）。縁を先にまとめて描き、中を塗る（部品の境目の線を消す）。
    const byDepth = [...stage.props].sort((a, b) => a.z - b.z);
    for (const prop of byDepth) {
      const outline = placePolygons(prop.polygons, { x: placements[prop.id].x, y: prop.y, rot: prop.rot ?? 0, scale: prop.scale });
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2 / t.scale;
      ctx.strokeStyle = colors.propLine;
      for (const polygon of outline) { ctx.beginPath(); tracePolygon(ctx, polygon); ctx.stroke(); }
      ctx.fillStyle = colors.prop;
      for (const polygon of outline) { ctx.beginPath(); tracePolygon(ctx, polygon); ctx.fill(); }
    }

    // 灯りのレールと玉。
    ctx.lineWidth = 1.5 / t.scale;
    ctx.setLineDash([2 / t.scale, 5 / t.scale]);
    ctx.strokeStyle = rgba(colors.lamp, 0.7);
    ctx.beginPath();
    ctx.moveTo(lamp.x, stage.lamp.min);
    ctx.lineTo(lamp.x, stage.lamp.max);
    ctx.stroke();
    ctx.setLineDash([]);

    screenSpace(ctx, dpr);
    // 選択中の道具の枠（名前の札は最後に描く）。枠は身長計より先に描き、左端の道具の枠が数字を消さないようにする。
    const chosen = stage.props.find((prop) => prop.id === selected && prop.x.min < prop.x.max);
    let frame = null;
    if (chosen) {
      const b = propBounds(chosen, placements[chosen.id].x);
      const a = t.toScreen(b.minX, b.maxY);
      const c = t.toScreen(b.maxX, b.minY);
      frame = { left: a.x - 5, right: c.x + 5, top: a.y - 5, bottom: c.y + 5 };
      ctx.lineWidth = 3;
      ctx.strokeStyle = colors.focus;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(frame.left, frame.top, frame.right - frame.left, frame.bottom - frame.top, 8) : ctx.rect(frame.left, frame.top, frame.right - frame.left, frame.bottom - frame.top);
      ctx.stroke();
      ctx.fillStyle = colors.focus;
      const midY = (frame.top + frame.bottom) / 2;
      for (const dir of [-1, 1]) {
        const edge = dir < 0 ? frame.left : frame.right;
        ctx.beginPath();
        ctx.moveTo(edge + dir * 9, midY);
        ctx.lineTo(edge + dir * 2, midY - 6);
        ctx.lineTo(edge + dir * 2, midY + 6);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 身長計（左端）。数字は紙に対して4.5:1以上の濃い色（--ruler）・12px・太さ600。壁の色で縁取り、影や枠の上でも読めるようにする。
    // 数字の位置は、札が覆わないように覚えておく（字の大きさに合わせた矩形）。
    ctx.strokeStyle = colors.ruler;
    ctx.fillStyle = colors.ruler;
    ctx.lineWidth = 1;
    ctx.font = `600 ${RULER_FONT_PX}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const wallLeft = t.toScreen(0, 0).x;
    const rulerNumbers = [];
    for (let cm = 10; cm <= 170; cm += 10) {
      const y = t.toScreen(0, cm).y;
      const long = cm % 50 === 0;
      ctx.beginPath();
      ctx.moveTo(wallLeft, y);
      ctx.lineTo(wallLeft + (long ? 9 : 5), y);
      ctx.stroke();
      if (!long) continue;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = rgba(colors.wall, 0.9);
      ctx.strokeText(String(cm), wallLeft + 12, y);
      ctx.fillText(String(cm), wallLeft + 12, y);
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.ruler;
      const half = RULER_FONT_PX * 0.75;
      rulerNumbers.push({ left: wallLeft + 9, right: wallLeft + 15 + ctx.measureText(String(cm)).width, top: y - half, bottom: y + half });
    }
    // 灯りの高さの目印：身長計の左の余白に琥珀の三角、目盛りの上に短い線（数値は壁の下の読み出しにある。文字は描かない）。
    const markY = t.toScreen(0, lamp.y).y;
    ctx.fillStyle = colors.lamp;
    ctx.beginPath();
    ctx.moveTo(wallLeft - 1, markY);
    ctx.lineTo(wallLeft - 8, markY - 5);
    ctx.lineTo(wallLeft - 8, markY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = colors.lamp;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wallLeft, markY);
    ctx.lineTo(wallLeft + 9, markY);
    ctx.stroke();
    // 灯り：光の輪・玉・つかむ輪。
    const orb = t.toScreen(lamp.x, lamp.y);
    const halo = ctx.createRadialGradient(orb.x, orb.y, 3, orb.x, orb.y, 38);
    halo.addColorStop(0, rgba(colors.lamp, 0.8));
    halo.addColorStop(1, rgba(colors.lamp, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.lamp;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(orb.x - 3, orb.y - 3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = selected === 'lamp' ? 3 : 1.5;
    ctx.strokeStyle = selected === 'lamp' ? colors.focus : rgba(colors.lamp, 0.85);
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, 16, 0, Math.PI * 2);
    ctx.stroke();
    if (selected === 'lamp') {
      ctx.fillStyle = colors.focus;
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(orb.x, orb.y + dir * 27);
        ctx.lineTo(orb.x - 6, orb.y + dir * 19);
        ctx.lineTo(orb.x + 6, orb.y + dir * 19);
        ctx.closePath();
        ctx.fill();
      }
    }
    // 選択中の道具の名前の札。身長計の数字と灯りの玉を避けて、枠の上（入らなければ下・横）に置く。
    if (chosen) {
      const orbBox = { left: orb.x - 20, right: orb.x + 20, top: orb.y - 20, bottom: orb.y + 20 };
      const tag = placeTag({
        width: pillWidth(ctx, chosen.label),
        frame,
        bounds: { left: 2, right: width - 2, top: 2, bottom: height - 2 },
        avoid: [...rulerNumbers, orbBox],
      });
      pill(ctx, chosen.label, tag.left, (tag.top + tag.bottom) / 2, colors, { accent: colors.focus });
    }
  }

  return { resize: base.resize, render };
}

// ---- 証言のスケッチ ----
export function createSketchRenderer(canvas) {
  const base = setup(canvas);
  if (!base) return null;
  const { ctx, state } = base;

  function render(stage) {
    const { width, height, dpr, colors } = state;
    if (!sketchDrawable(state)) return;
    const scale = Math.min(width / WALL.width, height / WALL.height);
    const ox = (width - WALL.width * scale) / 2;
    const oy = (height - WALL.height * scale) / 2;
    screenSpace(ctx, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = colors.wall;
    ctx.fillRect(0, 0, width, height);
    ctx.setTransform(scale * dpr, 0, 0, -scale * dpr, ox * dpr, (oy + WALL.height * scale) * dpr);
    ctx.fillStyle = colors.shadow;
    fillRuns(ctx, guideShapes(stage));
    screenSpace(ctx, dpr);
    ctx.strokeStyle = colors.wallEdge;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);
  }

  return { resize: base.resize, render };
}

// ---- 現場図（横から見た図） ----
// 右が壁。左端に灯りの高さの寸法線、床の下に壁から足跡までの距離を描く。
export function createSideRenderer(canvas) {
  const base = setup(canvas);
  if (!base) return null;
  const { ctx, state } = base;

  function render({ stage, caseDef, arrangement }) {
    const { width, height, dpr, colors } = state;
    if (!drawable(state)) return;
    const distance = stage.distance;
    const lampY = arrangement.ly;
    const stool = caseDef.stool ?? 0;
    const padLeft = 40;
    const padRight = 14;
    const padTop = 16;
    const padBottom = 50;
    const s = Math.min((width - padLeft - padRight) / (distance + 16), (height - padTop - padBottom) / 192);
    const sx = (z) => width - padRight - (z + 8) * s; // 壁（z=0）が右
    const sy = (y) => padTop + (190 - y) * s;
    screenSpace(ctx, dpr);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = colors.panel;
    ctx.fillRect(0, 0, width, height);
    ctx.lineCap = 'round';

    // 床と壁。
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padLeft - 6, sy(0));
    ctx.lineTo(width - padRight + 6, sy(0));
    ctx.stroke();
    ctx.fillStyle = colors.wall;
    ctx.fillRect(sx(0), sy(WALL.height), 8 * s, WALL.height * s);

    // 影が落ちる壁の範囲。
    const placed = stage.props.filter((prop) => !prop.decoy).map((prop) => {
      const b = propBounds(prop, arrangement.xs[prop.id] ?? prop.x.solution);
      const k = distance / (distance - prop.z);
      return { prop, b, lo: lampY + k * (b.minY - lampY), hi: lampY + k * (b.maxY - lampY) };
    });
    ctx.fillStyle = colors.shadow;
    for (const item of placed) {
      const lo = Math.max(0, item.lo);
      const hi = Math.min(WALL.height, item.hi);
      if (hi > lo) ctx.fillRect(sx(0) - 6, sy(hi), 6, (hi - lo) * s);
    }
    ctx.strokeStyle = rgba(colors.text, 0.35);
    ctx.lineWidth = 1;
    for (const item of placed) {
      const lo = Math.max(0, item.lo);
      const hi = Math.min(WALL.height, item.hi);
      if (hi > lo) ctx.strokeRect(sx(0) - 6, sy(hi), 6, (hi - lo) * s);
    }

    // 光の筋。
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = rgba(colors.lamp, 0.5);
    for (const item of placed) {
      for (const wallY of [item.lo, item.hi]) {
        ctx.beginPath();
        ctx.moveTo(sx(distance), sy(lampY));
        ctx.lineTo(sx(0), sy(wallY));
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // 道具（側面の高さの範囲）。名前の札は、線をすべて描いたあとに重ねる（破線が文字を横切らない）。
    placed.forEach((item) => {
      const x = sx(item.prop.z);
      ctx.fillStyle = colors.prop;
      ctx.strokeStyle = colors.propLine;
      ctx.beginPath();
      ctx.rect(x - 3, sy(item.b.maxY), 6, (item.b.maxY - item.b.minY) * s);
      ctx.fill();
      ctx.stroke();
    });

    // 足跡と踏み台。
    const footX = sx(distance);
    if (stool > 0) {
      ctx.fillStyle = colors.prop;
      ctx.strokeStyle = colors.propLine;
      ctx.beginPath();
      ctx.rect(footX - 20 * s, sy(stool), 40 * s, stool * s);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = colors.muted;
    for (const dx of [-8, 8]) {
      ctx.beginPath();
      ctx.ellipse(footX + dx * s, sy(stool), 5 * s, 2.5 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `600 11px ${FONT}`;
    ctx.fillText(stool > 0 ? `足跡（踏み台${stool}cm）` : '足跡', Math.max(footX, padLeft + 34), sy(0) + 6);

    // 壁から足跡までの距離。
    const dimY = sy(0) + 30;
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx(0), dimY);
    ctx.lineTo(footX, dimY);
    for (const x of [sx(0), footX]) { ctx.moveTo(x, dimY - 4); ctx.lineTo(x, dimY + 4); }
    ctx.stroke();
    ctx.textBaseline = 'top';
    ctx.fillText(`壁から ${distance}cm`, (sx(0) + footX) / 2, dimY + 4);

    // 灯りの高さ：左端の寸法線と、灯りからの引き出し線。数値は、灯りの玉の上に横書きの札で出す。
    const dimX = 16;
    ctx.strokeStyle = colors.lamp;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(dimX, sy(0));
    ctx.lineTo(dimX, sy(lampY));
    for (const y of [sy(0), sy(lampY)]) { ctx.moveTo(dimX - 4, y); ctx.lineTo(dimX + 4, y); }
    ctx.stroke();
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(dimX, sy(lampY));
    ctx.lineTo(footX, sy(lampY));
    ctx.stroke();
    ctx.setLineDash([]);
    const halo = ctx.createRadialGradient(footX, sy(lampY), 2, footX, sy(lampY), 26);
    halo.addColorStop(0, rgba(colors.lamp, 0.8));
    halo.addColorStop(1, rgba(colors.lamp, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(footX, sy(lampY), 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colors.lamp;
    ctx.beginPath();
    ctx.arc(footX, sy(lampY), 7, 0, Math.PI * 2);
    ctx.fill();

    // 札（最後に描く）：灯りの高さと、道具の名前。互いに重ならないよう、道具の札は上下を交互にし、重なれば反対側へ。
    // 札は床より上に置く（床の下には「足跡」と「壁から」の文字がある）。
    const bounds = { left: 2, right: width - 2, top: 2, bottom: sy(0) - 2 };
    const lampText = `灯り ${Math.round(lampY)}cm`;
    const lampFont = `700 12px ${FONT}`;
    const lampTag = placeTag({
      width: pillWidth(ctx, lampText, lampFont),
      frame: { left: footX - 10, right: footX + 10, top: sy(lampY) - 12, bottom: sy(lampY) + 12 },
      bounds, avoid: [],
    });
    pill(ctx, lampText, lampTag.left, (lampTag.top + lampTag.bottom) / 2, colors, { accent: colors.lamp, font: lampFont });
    const taken = [lampTag, { left: footX - 12, right: footX + 12, top: sy(lampY) - 12, bottom: sy(lampY) + 12 }];
    const labelFont = `600 11px ${FONT}`;
    placed.forEach((item, index) => {
      const x = sx(item.prop.z);
      const tag = placeTag({
        width: pillWidth(ctx, item.prop.label, labelFont),
        frame: { left: x - 4, right: x + 4, top: sy(item.b.maxY), bottom: sy(item.b.minY) },
        bounds, avoid: taken, prefer: index % 2 === 0 ? 'above' : 'below',
      });
      pill(ctx, item.prop.label, tag.left, (tag.top + tag.bottom) / 2, colors, { font: labelFont });
      taken.push(tag);
    });
  }

  return { resize: base.resize, render };
}
