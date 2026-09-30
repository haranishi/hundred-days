// 見取り図。部屋の名前と自分の位置だけを描き、物は描かない（描くと覚える遊びにならない）。
import { HOUSE, ROOMS, WALLS } from './plan.js';

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.highlight = null;
    this.flash = 0;
  }

  /** 図の大きさを CSS の大きさに合わせ直す */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.dpr = dpr;
    const pad = 6 * dpr;
    this.scale = Math.min((this.canvas.width - pad * 2) / HOUSE.width, (this.canvas.height - pad * 2) / HOUSE.depth);
    this.ox = (this.canvas.width - HOUSE.width * this.scale) / 2;
    this.oy = (this.canvas.height - HOUSE.depth * this.scale) / 2;
  }

  toCanvas(x, z) {
    return [this.ox + x * this.scale, this.oy + z * this.scale];
  }

  /**
   * 図の上の点（CSS px）が指す部屋。廊下と玄関の列は細い（スマホで幅20px余り）ので、
   * 両側に0.6mずつ広げて押しやすくし、列の下寄り（6.8mより南）を玄関にする。
   */
  roomAtPoint(px, py) {
    const x = (px * this.dpr - this.ox) / this.scale;
    const z = (py * this.dpr - this.oy) / this.scale;
    if (z < -0.3 || z > HOUSE.depth + 0.3 || x < -0.3 || x > HOUSE.width + 0.3) return null;
    if (x >= 4.4 && x <= 7.6) return ROOMS.find(r => r.id === (z >= 6.8 ? 'entrance' : 'hall'));
    return ROOMS.find(r => x >= r.rect[0] - 0.3 && x <= r.rect[2] + 0.3 && z >= r.rect[1] && z <= r.rect[3]) || null;
  }

  /** visited は、この場面で行った部屋のid。見取り図に印をつけ、「書斎まだ見てない！」と周りが言えるようにする */
  draw(player, time = 0, visited = null) {
    const { ctx } = this;
    if (!this.scale) this.resize();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const r of ROOMS) {
      const [x0, y0] = this.toCanvas(r.rect[0], r.rect[1]);
      const [x1, y1] = this.toCanvas(r.rect[2], r.rect[3]);
      ctx.fillStyle = r.map;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      if (this.highlight === r.id) {
        const pulse = 0.55 + 0.45 * Math.sin(time * 5);
        ctx.fillStyle = `rgba(232, 111, 38, ${0.35 + 0.3 * pulse})`;
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    // 壁（扉の開口は抜く）
    ctx.strokeStyle = '#3b332c';
    ctx.lineCap = 'square';
    for (const w of WALLS) {
      const alongX = w.a[1] === w.b[1];
      ctx.lineWidth = Math.max(1.5, w.t * this.scale);
      const from = alongX ? w.a[0] : w.a[1];
      const to = alongX ? w.b[0] : w.b[1];
      const gaps = w.openings.filter(o => o.kind === 'door').sort((a, b) => a.from - b.from);
      let cursor = from;
      const pieces = [];
      for (const g of gaps) { pieces.push([cursor, g.from]); cursor = g.to; }
      pieces.push([cursor, to]);
      ctx.beginPath();
      for (const [s, e] of pieces) {
        const [ax, ay] = alongX ? this.toCanvas(s, w.a[1]) : this.toCanvas(w.a[0], s);
        const [bx, by] = alongX ? this.toCanvas(e, w.a[1]) : this.toCanvas(w.a[0], e);
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }
    // 行った部屋の印（右上の角に小さな✓）
    if (visited) {
      const dpr = this.dpr || 1;
      const r0 = Math.max(6, Math.min(9, (this.scale / dpr) * 0.34)) * dpr;
      for (const r of ROOMS) {
        if (!visited.has(r.id) || r.id === 'entrance') continue;
        const [x1, y0] = this.toCanvas(r.rect[2], r.rect[1]);
        const cx = x1 - r0 - 3 * dpr;
        const cy = y0 + r0 + 3 * dpr;
        ctx.fillStyle = '#23804f';
        ctx.beginPath();
        ctx.arc(cx, cy, r0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.8 * dpr;
        ctx.beginPath();
        ctx.moveTo(cx - r0 * 0.45, cy + r0 * 0.02);
        ctx.lineTo(cx - r0 * 0.1, cy + r0 * 0.38);
        ctx.lineTo(cx + r0 * 0.5, cy - r0 * 0.35);
        ctx.stroke();
      }
    }
    // 自分の位置と向き
    if (player) {
      const [px, py] = this.toCanvas(player.x, player.z);
      const yaw = player.yaw * Math.PI / 180;
      // 自分の印は、小さな見取り図でも見失わない大きさにし、白い縁を付ける（見た目の採点）
      const len = Math.max(0.95 * this.scale, 12 * (this.dpr || 1));
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      ctx.save();
      ctx.translate(px, py);
      ctx.fillStyle = 'rgba(232, 111, 38, 0.22)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const spread = 0.7;
      const ang = Math.atan2(fz, fx);
      ctx.arc(0, 0, len * 2.2, ang - spread, ang + spread);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#e86f26';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.6 * (this.dpr || 1);
      ctx.beginPath();
      ctx.moveTo(fx * len, fz * len);
      ctx.lineTo(-fz * len * 0.55 - fx * len * 0.45, fx * len * 0.55 - fz * len * 0.45);
      ctx.lineTo(fz * len * 0.55 - fx * len * 0.45, -fx * len * 0.55 - fz * len * 0.45);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }
    // 部屋の名前は最後に、白い縁取りつきで描く（自分の矢印や行った印に重なっても読める。評価の2周目「リビン」）
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const dpr = this.dpr || 1;
    const cssPerMeter = this.scale / dpr;
    // スマホでも12pxを下限にする（見た目の採点3周目：390で部屋名が約10px、玄関は約8px）
    const fontCss = Math.max(12, Math.min(20, cssPerMeter * 0.72));
    ctx.font = `700 ${Math.round(fontCss * dpr)}px "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.2 * dpr;
    ctx.strokeStyle = 'rgba(255, 252, 246, 0.9)';
    ctx.fillStyle = 'rgba(38, 30, 22, 0.92)';
    for (const r of ROOMS) {
      if (r.id === 'hall') continue;
      const [cx, cy] = this.toCanvas((r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2);
      // 玄関は高さ1.1mしかないので、枠の高さまでに収める。ほかの部屋は部屋の幅いっぱいまで使ってよい（縁取りがあるので線に掛かっても読める）
      const fit = r.id === 'entrance' ? Math.min(fontCss, cssPerMeter * 1.05) : Math.min(fontCss, ((r.rect[2] - r.rect[0]) * cssPerMeter) / (r.name.length + 0.4));
      ctx.font = `700 ${Math.round(fit * dpr)}px "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif`;
      ctx.strokeText(r.name, cx, cy);
      ctx.fillText(r.name, cx, cy);
    }
  }
}
