// 影の幾何：壁・灯り・道具の座標、投影、塗りつぶし、一致度。DOMに依存しない純関数だけを置く。
//
// 座標は壁の面（cm）。x は右へ、y は上へ増える（床が y=0）。描画側が上下を反転する。
// 灯りは壁から distance だけ手前にあり、壁面への真下の点 (x, y) で表す。
// 壁から z 手前にある平らな切り絵（道具）の影は、灯りを中心に k = distance / (distance - z) 倍に拡大した写し。
//   影の点 = 灯り + k × (道具の点 − 灯り)
// 灯りを動かすと、壁に近い影ほど動かず、灯りに近い影ほど大きく動く（視差）。この差が推理の手掛かりになる。

export const WALL = Object.freeze({ width: 240, height: 180 });
export const GRID = Object.freeze({ cell: 2, cols: 120, rows: 90 });

const SEGMENTS = 28;

function ring(cx, cy, rx, ry, rotationDeg = 0) {
  const turn = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const points = [];
  for (let i = 0; i < SEGMENTS; i += 1) {
    const angle = (i / SEGMENTS) * Math.PI * 2;
    const x = Math.cos(angle) * rx;
    const y = Math.sin(angle) * ry;
    points.push([cx + x * cos - y * sin, cy + x * sin + y * cos]);
  }
  return points;
}

// 形の定義（部品の配列）を多角形の配列へ展開する。部品は重なってよい（影は和集合として扱う）。
//   ['rect', cx, cy, w, h] / ['circle', cx, cy, r] / ['ellipse', cx, cy, rx, ry, 回転°]
//   ['trap', cx, cy, 上辺, 下辺, h] / ['poly', [[x, y], ...]]
//   ['arc', cx, cy, 外半径, 内半径, 始点°, 終点°]（輪の一部。始点から終点へ回る向きに帯を作る）
export function flattenShape(parts) {
  if (!Array.isArray(parts) || parts.length === 0) throw new TypeError('shape needs parts');
  return parts.map((part) => {
    const [kind, ...args] = part;
    if (kind === 'rect') {
      const [cx, cy, w, h] = args;
      return [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
    }
    if (kind === 'circle') return ring(args[0], args[1], args[2], args[2]);
    if (kind === 'ellipse') return ring(args[0], args[1], args[2], args[3], args[4] ?? 0);
    if (kind === 'trap') {
      const [cx, cy, top, bottom, h] = args;
      return [[cx - bottom / 2, cy - h / 2], [cx + bottom / 2, cy - h / 2], [cx + top / 2, cy + h / 2], [cx - top / 2, cy + h / 2]];
    }
    if (kind === 'poly') return args[0].map(([x, y]) => [x, y]);
    if (kind === 'arc') {
      const [cx, cy, outerR, innerR, from, to] = args;
      const steps = Math.max(6, Math.round(Math.abs(to - from) / 12));
      const outer = [];
      const inner = [];
      for (let i = 0; i <= steps; i += 1) {
        const angle = ((from + ((to - from) * i) / steps) * Math.PI) / 180;
        outer.push([cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR]);
        inner.push([cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR]);
      }
      return [...outer, ...inner.reverse()];
    }
    throw new TypeError(`unknown shape part: ${kind}`);
  });
}

// 形をその場の向き・大きさ・位置に置く（壁の面での道具の輪郭）。
export function placePolygons(polygons, { x = 0, y = 0, rot = 0, scale = 1 } = {}) {
  const turn = (rot * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return polygons.map((polygon) => polygon.map(([px, py]) => {
    const sx = px * scale;
    const sy = py * scale;
    return [x + sx * cos - sy * sin, y + sx * sin + sy * cos];
  }));
}

export function depthRatio(z, distance) {
  if (!Number.isFinite(z) || !Number.isFinite(distance)) throw new RangeError('depth must be finite');
  if (z < 0 || z > distance - 20) throw new RangeError('prop must stay between the wall and the lamp');
  return distance / (distance - z);
}

// 灯りを中心にした相似拡大。
export function project(polygons, lamp, ratio) {
  return polygons.map((polygon) => polygon.map(([px, py]) => [
    lamp.x + (px - lamp.x) * ratio,
    lamp.y + (py - lamp.y) * ratio,
  ]));
}

// 多角形の和集合をマスクへ塗る（偶奇規則・セル中心で判定）。範囲外は捨てる。
export function rasterize(polygons, grid = GRID, into = new Uint8Array(grid.cols * grid.rows)) {
  const { cell, cols, rows } = grid;
  const crossings = [];
  for (const polygon of polygons) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, py] of polygon) {
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    const firstRow = Math.max(0, Math.ceil(minY / cell - 0.5));
    const lastRow = Math.min(rows - 1, Math.floor(maxY / cell - 0.5));
    for (let row = firstRow; row <= lastRow; row += 1) {
      const y = (row + 0.5) * cell;
      crossings.length = 0;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const [x0, y0] = polygon[j];
        const [x1, y1] = polygon[i];
        if ((y0 <= y && y < y1) || (y1 <= y && y < y0)) crossings.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
      crossings.sort((a, b) => a - b);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const from = Math.max(0, Math.ceil(crossings[k] / cell - 0.5));
        const to = Math.min(cols, Math.ceil(crossings[k + 1] / cell - 0.5));
        for (let col = from; col < to; col += 1) into[row * cols + col] = 1;
      }
    }
  }
  return into;
}

export function maskArea(mask) {
  let count = 0;
  for (let i = 0; i < mask.length; i += 1) count += mask[i];
  return count;
}

// 重なり ÷ 合わせた広さ。どちらも空なら一致とみなす。
export function iou(a, b) {
  if (a.length !== b.length) throw new RangeError('mask sizes differ');
  let both = 0;
  let either = 0;
  for (let i = 0; i < a.length; i += 1) {
    both += a[i] & b[i];
    either += a[i] | b[i];
  }
  return either === 0 ? 1 : both / either;
}

// 道具1つの影（壁の面の多角形）。placement は壁の面での道具の位置 {x, y}。
export function propShadow(prop, placement, lamp, distance) {
  const outline = placePolygons(prop.polygons, { x: placement.x, y: placement.y, rot: prop.rot ?? 0, scale: prop.scale ?? 1 });
  return project(outline, lamp, depthRatio(prop.z, distance));
}

// 場面全体の影。props は {polygons, z, rot?, scale?, id}、placements は id → {x, y}。
export function castShadows(props, placements, lamp, distance) {
  return props.flatMap((prop) => propShadow(prop, placements[prop.id], lamp, distance));
}

export function shadowMask(props, placements, lamp, distance, grid = GRID) {
  return rasterize(castShadows(props, placements, lamp, distance), grid);
}
