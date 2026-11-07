// Writes assets/thumb-<id>.svg for every model, drawn from the engine's final pose.
//   node day-087-oricube/tools/make-thumbs.mjs
// The picture is a fixed orthographic view of model.finalFrame(): triangles are painted
// far-to-near (painter's order), coloured by the side that faces the camera and the
// engine's shade, with the paper's own edge as a thin line. Re-run after changing a model;
// tests/thumbs.test.mjs fails while a committed picture is stale or missing.
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { buildModel } from '../lib/model.js';
import { MODELS } from '../lib/models/index.js';

const here = dirname(fileURLToPath(import.meta.url));
export const ASSETS = join(here, '../assets');
export const thumbPath = (id) => join(ASSETS, `thumb-${id}.svg`);

const SIZE = 100;
const PAD = 7;
const INK = '#2b2623';
const LIGHT = norm([0.35, 1, 0.45]);

function norm(v) { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
const r1 = (x) => { const v = Math.round(x * 10) / 10; return Object.is(v, -0) ? 0 : v; };

// Same spherical convention as the viewer: phi 0 = straight down from above, theta 0 = from the front (+z).
function camera(phi, theta) {
  const dir = [Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)];
  const right = norm(cross([0, 1, 0], dir));
  const up = cross(dir, right);
  return { dir, right, up };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
}
function rgbToHex(rgb) {
  return `#${rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;
}

function triangles(frame) {
  const out = [];
  for (let j = 0; j < frame.triCount; j++) {
    const p = [0, 1, 2].map((k) => Array.from(frame.positions.subarray(j * 9 + k * 3, j * 9 + k * 3 + 3)));
    out.push({ p, n: Array.from(frame.normals.subarray(j * 9, j * 9 + 3)), shade: frame.shade ? frame.shade[j * 9] : 1 });
  }
  return out;
}

function segments(frame) {
  const out = [];
  const s = frame.outlineSegments || [];
  for (let j = 0; j + 5 < s.length; j += 6) out.push([[s[j], s[j + 1], s[j + 2]], [s[j + 3], s[j + 4], s[j + 5]]]);
  return out;
}

function projectedArea(points, cam) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of points) {
    const x = dot(p, cam.right), y = dot(p, cam.up);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return (x1 - x0) * (y1 - y0);
}

// Clip convex polygon a by convex polygon b (Sutherland-Hodgman); both in screen space.
function clip(a, b) {
  const sgn = Math.sign(area2(b)) || 1;
  let out = a;
  for (let i = 0; i < b.length && out.length; i++) {
    const p = b[i], q = b[(i + 1) % b.length];
    const side = (v) => sgn * ((q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0]));
    const next = [];
    for (let k = 0; k < out.length; k++) {
      const u = out[k], v = out[(k + 1) % out.length], su = side(u), sv = side(v);
      if (su >= 0) next.push(u);
      if ((su >= 0) !== (sv >= 0)) { const t = su / (su - sv); next.push([u[0] + (v[0] - u[0]) * t, u[1] + (v[1] - u[1]) * t]); }
    }
    out = next;
  }
  return out;
}
function area2(poly) { let a = 0; for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; } return a; }
function depthAt(t, pt) {
  const [a, b, c] = t.xy;
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(d) < 1e-12) return t.depth;
  const w0 = ((b[1] - c[1]) * (pt[0] - c[0]) + (c[0] - b[0]) * (pt[1] - c[1])) / d;
  const w1 = ((c[1] - a[1]) * (pt[0] - c[0]) + (a[0] - c[0]) * (pt[1] - c[1])) / d;
  return w0 * t.z[0] + w1 * t.z[1] + (1 - w0 - w1) * t.z[2];
}

// Far-to-near order. Wherever two triangles overlap on screen, the one that is nearer at a
// point inside the overlap is painted later (a topological sort). Centroid depth breaks ties
// and cycles, which thin, long triangles would otherwise get wrong.
function paintOrder(tris) {
  const n = tris.length, after = tris.map(() => []), indeg = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const poly = clip(tris[i].xy, tris[j].xy);
    if (poly.length < 3 || Math.abs(area2(poly)) < 0.02) continue;
    const c = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]);
    const di = depthAt(tris[i], c), dj = depthAt(tris[j], c);
    if (Math.abs(di - dj) < 1e-7) continue;
    const [far, near] = di < dj ? [i, j] : [j, i];
    after[far].push(near); indeg[near]++;
  }
  const done = new Array(n).fill(false), order = [];
  while (order.length < n) {
    let pick = -1;
    for (let i = 0; i < n; i++) if (!done[i] && indeg[i] === 0 && (pick < 0 || tris[i].depth < tris[pick].depth)) pick = i;
    if (pick < 0) for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || tris[i].depth < tris[pick].depth)) pick = i;
    done[pick] = true; order.push(pick);
    for (const k of after[pick]) indeg[k]--;
  }
  return order;
}

// True when pt is inside the screen triangle and at least margin away from its edges.
function insideBy(xy, pt, margin) {
  const sgn = Math.sign(area2(xy)) || 1;
  for (let i = 0; i < 3; i++) {
    const p = xy[i], q = xy[(i + 1) % 3], len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    if (sgn * ((q[0] - p[0]) * (pt[1] - p[1]) - (q[1] - p[1]) * (pt[0] - p[0])) / len < margin) return false;
  }
  return true;
}

// Flat results are seen from straight above. Standing ones from an oblique angle, turned to
// whichever of eight bearings shows the widest silhouette (a swan seen edge-on is a line).
export function chooseView(model, frame) {
  const b = frame.bounds;
  const size = b.max.map((v, i) => v - b.min[i]);
  if (size[1] < 0.05 * Math.max(size[0], size[2])) return { phi: 0.0001, theta: 0 };
  const last = [...model.steps].reverse().find((s) => s.view)?.view;
  const phi = last === 'side' ? 1.2 : 0.8;
  const points = triangles(frame).flatMap((t) => t.p);
  // A model that ends with a side view (swan, crane) is shown in profile: the bearing with the
  // widest horizontal extent, so the neck, head and tail show instead of a wing-spread front.
  const score = (cam) => {
    if (last !== 'side') return projectedArea(points, cam);
    const xs = points.map((p) => dot(p, cam.right));
    return Math.max(...xs) - Math.min(...xs);
  };
  let best = null;
  for (let k = 0; k < 8; k++) {
    const theta = 0.52 + (k * Math.PI) / 4;
    const area = score(camera(phi, theta));
    if (!best || area > best.area * 1.02) best = { phi, theta, area };
  }
  return { phi: best.phi, theta: best.theta };
}

export function thumbSvg(model) {
  const frame = model.finalFrame();
  const view = chooseView(model, frame);
  const cam = camera(view.phi, view.theta);
  const front = hexToRgb(model.paper.front);
  const back = hexToRgb(model.paper.back);
  const tris = triangles(frame);
  const segs = segments(frame);
  const all = tris.flatMap((t) => t.p);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of all) {
    const x = dot(p, cam.right), y = -dot(p, cam.up);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const scale = (SIZE - PAD * 2) / Math.max(x1 - x0, y1 - y0);
  const ox = (SIZE - (x1 - x0) * scale) / 2, oy = (SIZE - (y1 - y0) * scale) / 2;
  const to2d = (p) => [r1((dot(p, cam.right) - x0) * scale + ox), r1((-dot(p, cam.up) - y0) * scale + oy)];
  const tri2d = tris.map((t) => {
    const facing = dot(t.n, cam.dir) >= 0;
    const n = facing ? t.n : t.n.map((c) => -c);
    const light = 0.84 + 0.16 * Math.max(0, dot(n, LIGHT));
    const base = facing ? front : back;
    return {
      fill: rgbToHex(base.map((c) => c * light * t.shade)),
      xy: t.p.map((p) => [(dot(p, cam.right) - x0) * scale + ox, (-dot(p, cam.up) - y0) * scale + oy]),
      z: t.p.map((p) => dot(p, cam.dir)),
      depth: t.p.reduce((s, p) => s + dot(p, cam.dir), 0) / 3,
    };
  });
  const order = paintOrder(tri2d);
  // Heavily layered models (the crane) have many triangles that are completely hidden behind nearer
  // ones. Walk front to back on a fine sample grid and keep only triangles that show at least one sample.
  const GRID = SIZE * 4, claimed = new Uint8Array(GRID * GRID), shown = new Set();
  for (let k = order.length - 1; k >= 0; k--) {
    const j = order[k], [a, b, c] = tri2d[j].xy;
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]) * 4)), maxX = Math.min(GRID - 1, Math.ceil(Math.max(a[0], b[0], c[0]) * 4));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]) * 4)), maxY = Math.min(GRID - 1, Math.ceil(Math.max(a[1], b[1], c[1]) * 4));
    const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    let visible = Math.abs(den) < 1e-9; // a degenerate sliver is kept: it can only be a thin outline
    for (let y = minY; y <= maxY && !visible; y++) for (let x = minX; x <= maxX; x++) {
      const px = (x + 0.5) / 4, py = (y + 0.5) / 4;
      const u = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den;
      const v = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den;
      if (u < 0 || v < 0 || u + v > 1 || claimed[y * GRID + x]) continue;
      visible = true;
    }
    if (!visible) continue;
    shown.add(j);
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = (x + 0.5) / 4, py = (y + 0.5) / 4;
      const u = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / den;
      const v = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / den;
      if (u >= 0 && v >= 0 && u + v <= 1) claimed[y * GRID + x] = 1;
    }
  }
  // Paper edges go on top, except where a nearer triangle clearly covers the edge's middle.
  const items = order.filter((j) => shown.has(j)).map((j) => ({ kind: 'tri', fill: tri2d[j].fill, d: tris[j].p.map(to2d) }));
  for (const s of segs) {
    const mid3 = s[0].map((v, i) => (v + s[1][i]) / 2);
    const mid = [(dot(mid3, cam.right) - x0) * scale + ox, (-dot(mid3, cam.up) - y0) * scale + oy];
    const z = dot(mid3, cam.dir);
    const hidden = tri2d.some((t) => insideBy(t.xy, mid, 0.8) && depthAt(t, mid) > z + 1e-4);
    if (!hidden) items.push({ kind: 'edge', d: s.map(to2d) });
  }

  // Neighbouring items of one kind and colour share a path; the paint order is kept.
  const parts = [];
  for (const it of items) {
    const key = it.kind === 'tri' ? `t${it.fill}` : 'e';
    const sub = it.kind === 'tri'
      ? `M${it.d[0].join(' ')}L${it.d[1].join(' ')}L${it.d[2].join(' ')}Z`
      : `M${it.d[0].join(' ')}L${it.d[1].join(' ')}`;
    const lastPart = parts.at(-1);
    if (lastPart && lastPart.key === key) lastPart.d += sub;
    else parts.push({ key, fill: it.fill, d: sub });
  }
  // The whole silhouette, stroked under the fills, so the outer shape always has a thin border
  // even where it is a fold rather than a cut edge of the paper.
  const silhouette = `<path d="${items.filter((it) => it.kind === 'tri').map((it) => `M${it.d[0].join(' ')}L${it.d[1].join(' ')}L${it.d[2].join(' ')}Z`).join('')}" fill="${INK}" stroke="${INK}" stroke-opacity=".72" stroke-width="2.2" stroke-linejoin="round"/>`;
  const body = silhouette + '\n' + parts.map((p) => (p.key === 'e'
    ? `<path d="${p.d}" fill="none" stroke="${INK}" stroke-opacity=".72" stroke-width="1.1" stroke-linecap="round"/>`
    : `<path d="${p.d}" fill="${p.fill}" stroke="${p.fill}" stroke-width=".5" stroke-linejoin="round"/>`)).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">\n` +
    `<!-- Generated by tools/make-thumbs.mjs from the final pose of "${model.id}". Do not edit by hand. -->\n${body}\n</svg>\n`;
}

export function allThumbs() {
  return MODELS.map((def) => { const model = buildModel(def); return { id: model.id, svg: thumbSvg(model) }; });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const { id, svg } of allThumbs()) {
    writeFileSync(thumbPath(id), svg);
    console.log('wrote', `assets/thumb-${id}.svg`, `${svg.length} bytes`);
  }
}
