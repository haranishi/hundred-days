// ポインターが何をつかんだかの判定。灯り（玉とレール）とすべれる道具だけが対象。画面の px で判定する。
import { placePolygons } from './geometry.js';

export const HIT = Object.freeze({ lampRadius: 24, railHalf: 22, propPad: 6, propMin: 44 });

// 道具を (x, y) に置いたときの外接矩形（世界座標）。
export function propBounds(prop, x) {
  const outline = placePolygons(prop.polygons, { x, y: prop.y, rot: prop.rot ?? 0, scale: prop.scale });
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const polygon of outline) {
    for (const [px, py] of polygon) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
  }
  return { minX, maxX, minY, maxY };
}

// 画面上の矩形（最小の大きさ以上に広げたもの）。
export function propScreenRect(transform, prop, x) {
  const b = propBounds(prop, x);
  const a = transform.toScreen(b.minX, b.maxY);
  const c = transform.toScreen(b.maxX, b.minY);
  const width = Math.max(HIT.propMin, c.x - a.x + HIT.propPad * 2);
  const height = Math.max(HIT.propMin, c.y - a.y + HIT.propPad * 2);
  const cx = (a.x + c.x) / 2;
  const cy = (a.y + c.y) / 2;
  return { left: cx - width / 2, right: cx + width / 2, top: cy - height / 2, bottom: cy + height / 2, cx, cy };
}

// 'lamp'・すべれる道具のid・null のどれか。灯りの玉に近いときは灯りを優先し、そうでなければ道具、最後にレール。
export function hitTest(transform, stage, arrangement, px, py) {
  const lamp = transform.toScreen(stage.lamp.x, arrangement.ly);
  if (Math.hypot(px - lamp.x, py - lamp.y) <= HIT.lampRadius * 0.7) return 'lamp';
  let best = null;
  let bestDistance = Infinity;
  for (const prop of stage.props) {
    if (prop.x.min >= prop.x.max) continue;
    const rect = propScreenRect(transform, prop, arrangement.xs[prop.id] ?? prop.x.solution);
    if (px < rect.left || px > rect.right || py < rect.top || py > rect.bottom) continue;
    const distance = Math.hypot(px - rect.cx, py - rect.cy);
    if (distance < bestDistance) { best = prop.id; bestDistance = distance; }
  }
  if (best) return best;
  if (Math.hypot(px - lamp.x, py - lamp.y) <= HIT.lampRadius) return 'lamp';
  const top = transform.toScreen(stage.lamp.x, stage.lamp.max).y - HIT.lampRadius;
  const bottom = transform.toScreen(stage.lamp.x, stage.lamp.min).y + HIT.lampRadius;
  if (Math.abs(px - lamp.x) <= HIT.railHalf && py >= top && py <= bottom) return 'lamp';
  return null;
}
