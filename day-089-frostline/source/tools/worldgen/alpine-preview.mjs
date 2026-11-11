// 山の形の下見：設計の面と、浸食で刻んだ面を、陰影図（真上から・太陽は南東）で書き出す。
// node tools/worldgen/alpine-preview.mjs [--grid 512] [--iterations 120] [--K 0.012] [--restore 0.08] [--m 0.4] [--out DIR] [--seed ginrei-1]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { encodePNG } from './lib/png.js';
import { designAlpine, carveAlpine, refineGrid, lakeInside, softenEdges, coverSnow } from './lib/alpine.js';

const { values } = parseArgs({ options: {
  grid: { type: 'string', default: '512' }, iterations: { type: 'string', default: '120' }, K: { type: 'string', default: '0.012' },
  restore: { type: 'string', default: '0.08' }, m: { type: 'string', default: '0.4' }, out: { type: 'string', default: '.agent-harness/runs/worldgen/alpine' },
  seed: { type: 'string', default: 'ginrei-1' }, fine: { type: 'string', default: '0' }, name: { type: 'string', default: 'carved' },
} });
const SIZE = 4096;

/** 陰影図：太陽は南東・高さ 30°。急な面は岩の色、ゆるい面は雪、湖は青 */
export function hillshade(h, n, size, cover = null) {
  const cell = size / n, out = new Uint8Array(n * n * 4), sun = [0.61, 0.5, 0.61], len = Math.hypot(...sun);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i, x = (i + 0.5) * cell - size / 2, z = (j + 0.5) * cell - size / 2;
    const hx = (h[j * n + Math.min(n - 1, i + 1)] - h[j * n + Math.max(0, i - 1)]) / (2 * cell), hz = (h[Math.min(n - 1, j + 1) * n + i] - h[Math.max(0, j - 1) * n + i]) / (2 * cell);
    const nl = Math.hypot(hx, 1, hz), light = Math.max(0, (-hx * sun[0] + sun[1] - hz * sun[2]) / (nl * len));
    const slope = Math.atan(Math.hypot(hx, hz)) * 180 / Math.PI;
    // 岩：雪を積んだ面があれば「雪の厚みが薄い所」、無ければ「急な面」
    const rock = cover ? Math.min(1, Math.max(0, (0.4 - cover.depth[k]) / 0.3)) : Math.min(1, Math.max(0, (slope - 40) / 9));
    let r = 235, g = 240, b = 250;
    r = r * (1 - rock) + 122 * rock; g = g * (1 - rock) + 104 * rock; b = b * (1 - rock) + 92 * rock;
    if (cover && cover.ice[k] > 0) { const q = cover.ice[k]; r = r * (1 - q) + 120 * q; g = g * (1 - q) + 190 * q; b = b * (1 - q) + 225 * q; }
    const shade = 0.32 + 0.95 * light;
    if (lakeInside(x, z)) { r = 40; g = 120; b = 135; }
    out[k * 4] = Math.min(255, r * shade); out[k * 4 + 1] = Math.min(255, g * shade); out[k * 4 + 2] = Math.min(255, b * (shade * 0.92 + 0.08)); out[k * 4 + 3] = 255;
  }
  return out;
}
function stats(h, n, size) {
  const cell = size / n; let min = Infinity, max = -Infinity; const bins = [0, 0, 0, 0, 0, 0];
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const k = j * n + i, v = h[k]; if (v < min) min = v; if (v > max) max = v;
    const s = Math.atan(Math.hypot((h[k + 1] - h[k - 1]) / (2 * cell), (h[k + n] - h[k - n]) / (2 * cell))) * 180 / Math.PI;
    bins[s < 10 ? 0 : s < 20 ? 1 : s < 30 ? 2 : s < 40 ? 3 : s < 50 ? 4 : 5]++;
  }
  const total = bins.reduce((a, b) => a + b, 0);
  return { min: Math.round(min), max: Math.round(max), slope: bins.map(b => Math.round(b / total * 100)) };
}

const n = Number(values.grid), c = { grid: n, cell: SIZE / n, size: SIZE };
mkdirSync(values.out, { recursive: true });
let t0 = performance.now();
const design = designAlpine(c, values.seed);
console.log('設計の面', Math.round(performance.now() - t0), 'ms', JSON.stringify(stats(design.target, n, SIZE)));
writeFileSync(resolve(values.out, 'design.png'), encodePNG(n, n, hillshade(design.target, n, SIZE)));
t0 = performance.now();
let h = carveAlpine(design, c, { iterations: Number(values.iterations), K: Number(values.K), restore: Number(values.restore), m: Number(values.m) });
console.log('浸食', Math.round(performance.now() - t0), 'ms', JSON.stringify(stats(h, n, SIZE)));
let size = n;
if (Number(values.fine) > 0) {
  // 細かい格子で続ける：細い沢と尾根を足す
  const n2 = n * 2, c2 = { grid: n2, cell: SIZE / n2, size: SIZE };
  t0 = performance.now();
  const d2 = designAlpine(c2, values.seed);
  h = carveAlpine(d2, c2, { iterations: Number(values.fine), K: Number(values.K), restore: Number(values.restore), m: Number(values.m), start: refineGrid(h, n, n2), seed: 2 });
  size = n2;
  console.log('細かい浸食', Math.round(performance.now() - t0), 'ms', JSON.stringify(stats(h, n2, SIZE)));
}
writeFileSync(resolve(values.out, `${values.name}.png`), encodePNG(size, size, hillshade(h, size, SIZE)));
// 縁をならし、雪と氷を積んだ面（滑る面）。岩は「雪の厚みが 15 cm 未満」の所
t0 = performance.now();
const cf = { grid: size, cell: SIZE / size, size: SIZE }, df = size === n ? design : designAlpine(cf, values.seed);
softenEdges(h, cf);
const snow = coverSnow(h, cf, df, values.seed);
console.log('雪と氷', Math.round(performance.now() - t0), 'ms', JSON.stringify(stats(snow.surface, size, SIZE)));
writeFileSync(resolve(values.out, `${values.name}-snow.png`), encodePNG(size, size, hillshade(snow.surface, size, SIZE, snow)));
console.log('書き出し', resolve(values.out, `${values.name}.png`), `${values.name}-snow.png`);
