// 苗の骨格を2次元の線画にして確認する（開発用・配信されない）。?species=maple&seeds=1,11,42&style=moyogi&day=0
import { createTree } from '../lib/tree.js';
const q = new URLSearchParams(location.search);
const species = q.get('species') || 'maple';
const style = q.get('style') || 'moyogi';
const seeds = (q.get('seeds') || '1,11,42').split(',').map(Number);
const advance = Number(q.get('day') || 0);
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const cellW = canvas.width / seeds.length;
const scale = 95; // 1単位=10cm → 95px
ctx.fillStyle = '#f3eee3'; ctx.fillRect(0, 0, canvas.width, canvas.height);
seeds.forEach((seed, k) => {
  const tree = createTree({ species, style, seed });
  if (advance) tree.advance(advance);
  const s = tree.snapshot();
  const ox = cellW * k + cellW / 2;
  // 前から見た図（X右・Y上）
  const fy = 380;
  const toF = (x, y) => [ox + x * scale, fy - y * scale];
  ctx.strokeStyle = '#cfc6b4'; ctx.beginPath(); ctx.moveTo(cellW * k + 10, fy); ctx.lineTo(cellW * (k + 1) - 10, fy); ctx.stroke();
  for (let p = 0; p < s.pads.count; p += 1) {
    const [px, py] = toF(s.pads.center[3 * p], s.pads.center[3 * p + 1]);
    ctx.fillStyle = species === 'pine' ? 'rgba(60,110,60,.35)' : 'rgba(200,80,40,.30)';
    ctx.beginPath(); ctx.ellipse(px, py, s.pads.radius[p] * scale, s.pads.radius[p] * scale * 0.55, 0, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < s.count; i += 1) {
    const [x0, y0] = toF(s.start[3 * i], s.start[3 * i + 1]);
    const [x1, y1] = toF(s.end[3 * i], s.end[3 * i + 1]);
    ctx.strokeStyle = s.order[i] === 0 ? '#4a3a2c' : s.order[i] === 1 ? '#6b5442' : '#8a7560';
    ctx.lineWidth = Math.max(1, (s.r0[i] + s.r1[i]) * scale);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  // 真上から見た図（X右・Z下＝手前）
  const ty = 600;
  const toT = (x, z) => [ox + x * scale * 0.75, ty + z * scale * 0.75];
  ctx.strokeStyle = '#cfc6b4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(...toT(0, 0), 20, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < s.count; i += 1) {
    const [x0, y0] = toT(s.start[3 * i], s.start[3 * i + 2]);
    const [x1, y1] = toT(s.end[3 * i], s.end[3 * i + 2]);
    ctx.strokeStyle = s.order[i] === 0 ? '#4a3a2c' : '#7a6652'; ctx.lineWidth = Math.max(1, s.r1[i] * 60);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  for (let p = 0; p < s.pads.count; p += 1) {
    const [px, py] = toT(s.pads.center[3 * p], s.pads.center[3 * p + 2]);
    ctx.strokeStyle = 'rgba(60,110,60,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, py, s.pads.radius[p] * scale * 0.75, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.fillStyle = '#26221d'; ctx.font = '14px system-ui';
  const b = s.bounds;
  ctx.fillText(`${species}/${style} seed ${seed}  節${s.count} パッド${s.pads.count}  高${(b.max[1]).toFixed(2)}  幅${(b.max[0]-b.min[0]).toFixed(2)}×${(b.max[2]-b.min[2]).toFixed(2)}`, cellW * k + 12, 22);
  ctx.fillText('前から（正面=+Z・右=+X）', cellW * k + 12, 42);
  ctx.fillText('真上から（下=手前=+Z）', cellW * k + 12, 468);
});
window.__ready = true;
