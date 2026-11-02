// OWNER: core
// ?debug=1 の、上から見た2Dの図：明るさの濃淡・A* の格子（通れない升）・壁と当たり・扇・番兵の状態・プレイヤー・物音。
import type { SimSnapshot } from '../contract/snapshot';
import type { Sim } from '../sim/sim';

const PPM = 6;

export class DebugMap {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly base: HTMLCanvasElement;

  constructor(sim: Sim) {
    const bd = sim.stage.bounds;
    const w = Math.round((bd.x1 - bd.x0) * PPM);
    const h = Math.round((bd.z1 - bd.z0) * PPM);
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.className = 'kg-debug';
    this.canvas.dataset.testid = 'debug-map';
    this.g = this.canvas.getContext('2d')!;
    this.base = document.createElement('canvas');
    this.base.width = w;
    this.base.height = h;
    this.drawBase(sim);
  }

  private tx(sim: Sim, x: number, z: number): [number, number] {
    const bd = sim.stage.bounds;
    return [(x - bd.x0) * PPM, (z - bd.z0) * PPM];
  }

  private drawBase(sim: Sim): void {
    const g = this.base.getContext('2d')!;
    const w = this.base.width;
    const h = this.base.height;
    const bd = sim.stage.bounds;
    const img = g.createImageData(w, h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const L = sim.q.brightnessAt(bd.x0 + (i + 0.5) / PPM, bd.z0 + (j + 0.5) / PPM);
        const k = (j * w + i) * 4;
        // 闇は藍、灯りは橙へ
        img.data[k] = Math.round(20 + 225 * Math.pow(L, 0.8));
        img.data[k + 1] = Math.round(24 + 140 * Math.pow(L, 1.1));
        img.data[k + 2] = Math.round(48 + 30 * (1 - L));
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // A* の格子：通れない升
    const nav = sim.nav;
    g.fillStyle = 'rgba(160, 30, 30, 0.35)';
    const cpx = nav.cell * PPM;
    for (let j = 0; j < nav.h; j++) for (let i = 0; i < nav.w; i++) if (!nav.free[j * nav.w + i]) g.fillRect(i * cpx, j * cpx, cpx, cpx);
    // 当たり：壁・建物（白）、円（灰）、池（青）
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 1;
    for (const b of sim.q.boxes) {
      const corners = [
        [-b.hl, -b.ht],
        [b.hl, -b.ht],
        [b.hl, b.ht],
        [-b.hl, b.ht],
      ].map(([u, v]) => this.tx(sim, b.cx + u * b.ux - v * b.uz, b.cz + u * b.uz + v * b.ux));
      g.beginPath();
      corners.forEach(([x, y], k) => (k === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.closePath();
      g.setLineDash(b.crawl ? [3, 3] : []);
      g.stroke();
    }
    g.setLineDash([]);
    g.strokeStyle = 'rgba(200,200,200,0.8)';
    for (const c of sim.q.circles) {
      const [x, y] = this.tx(sim, c.x, c.z);
      g.beginPath();
      g.arc(x, y, c.r * PPM, 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeStyle = 'rgba(90,150,255,0.9)';
    for (const e of sim.q.ellipses) {
      const [x, y] = this.tx(sim, e.cx, e.cz);
      g.beginPath();
      g.ellipse(x, y, e.rx * PPM, e.rz * PPM, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.strokeStyle = 'rgba(80,200,90,0.9)';
    for (const hz of sim.stage.hides) {
      const [x, y] = this.tx(sim, hz.center.x, hz.center.z);
      g.beginPath();
      g.arc(x, y, hz.radius * PPM, 0, Math.PI * 2);
      g.stroke();
    }
  }

  draw(sim: Sim, snap: SimSnapshot): void {
    const g = this.g;
    g.drawImage(this.base, 0, 0);
    for (const c of snap.cones) {
      g.fillStyle = c.awareness === 'alert' ? 'rgba(255,40,30,0.3)' : c.awareness === 'suspicious' ? 'rgba(255,170,40,0.3)' : 'rgba(230,235,255,0.18)';
      g.beginPath();
      for (let i = 0; i < c.poly.length / 2; i++) {
        const [x, y] = this.tx(sim, c.poly[i * 2], c.poly[i * 2 + 1]);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fill();
      for (let b = 0; b < c.bands.length / 8; b++) {
        g.beginPath();
        for (let k = 0; k < 4; k++) {
          const [x, y] = this.tx(sim, c.bands[b * 8 + k * 2], c.bands[b * 8 + k * 2 + 1]);
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.fill();
      }
    }
    g.strokeStyle = 'rgba(255,240,200,0.7)';
    for (const n of snap.noises) {
      const [x, y] = this.tx(sim, n.x, n.z);
      g.globalAlpha = 1 - n.age;
      g.beginPath();
      g.arc(x, y, n.radius * PPM, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.font = '10px "Hiragino Sans", sans-serif';
    for (const gd of sim.guards) {
      const [x, y] = this.tx(sim, gd.x, gd.z);
      if (gd.path && gd.pathIdx < gd.path.length) {
        g.strokeStyle = 'rgba(120,200,255,0.8)';
        g.beginPath();
        g.moveTo(x, y);
        for (let k = gd.pathIdx; k < gd.path.length; k++) {
          const [px, py] = this.tx(sim, gd.path[k].x, gd.path[k].z);
          g.lineTo(px, py);
        }
        g.stroke();
      }
      g.fillStyle = gd.down ? '#777' : gd.mode === 'chase' ? '#ff4030' : gd.s > 0 ? '#ffb030' : '#e8e8f0';
      g.beginPath();
      g.arc(x, y, 3.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#000';
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(gd.yaw + gd.headYaw) * 9, y + Math.sin(gd.yaw + gd.headYaw) * 9);
      g.stroke();
      g.fillStyle = '#fff';
      g.fillText(`${gd.mode === 'base' ? gd.base : gd.mode}${gd.s > 0 ? ` s${gd.s.toFixed(2)}` : ''}`, x + 5, y - 5);
    }
    const p = sim.player;
    if (!sim.hidePlayer) {
      const [x, y] = this.tx(sim, p.x, p.z);
      g.fillStyle = '#c9a75b';
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      g.fill();
      g.fillText(`L${p.light.toFixed(2)} ${p.moveStance}`, x + 6, y + 12);
    }
    if (sim.lastSeen) {
      const [x, y] = this.tx(sim, sim.lastSeen.x, sim.lastSeen.z);
      g.strokeStyle = '#ff4030';
      g.strokeRect(x - 4, y - 4, 8, 8);
    }
    g.fillStyle = '#fff';
    g.font = '12px "Hiragino Sans", sans-serif';
    g.fillText(`t=${sim.t.toFixed(1)} ${sim.phase} ${sim.phase !== 'normal' ? sim.phaseLeft.toFixed(1) : ''}`, 6, 14);
  }
}
