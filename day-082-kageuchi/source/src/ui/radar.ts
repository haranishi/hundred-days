// OWNER: core
// 右上のレーダー：周りの番兵と視界の扇。上がカメラの向き。canvas に毎コマ描く。
// r02-fix-play: 体験の採点 1 位「信長の方角も北も画面に出ない」を直した。
//   円の外の縁（枠）に「北」、円の内側の縁に信長の方角の朱の三角（範囲の外でも縁に張り付く）を常に出す。
//   開始地点では信長がほぼ真北にあるので、二つを同じ半径に置くと重なる。北は枠、信長は円の中と、半径を分けた。
// r03-fix-play: 水抜き穴に RADAR.holeRange（12m）まで近づくと、穴の位置に水色の輪と「穴」の字を出す（体験の採点 3 位）。
//   出ている印の種類は canvas の data-marks に書く（E2E が読む）。
import { RADAR } from '../config/view';
import type { SimSnapshot } from '../contract/snapshot';
import type { StageDef } from '../stage/types';

/** 近くにある水抜き穴（しゃがんで通る塀の切れ目）の真ん中。プレイヤーから within（m）以内のものだけ。 */
export function nearHoles(stage: StageDef, px: number, pz: number, within: number = RADAR.holeRange): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  for (const w of stage.walls) {
    if (!w.crawl) continue;
    const x = (w.a.x + w.b.x) / 2;
    const z = (w.a.z + w.b.z) / 2;
    if (Math.hypot(x - px, z - pz) <= within) out.push({ x, z });
  }
  return out;
}

/** 円の中に入れる範囲（m）。 */
const RANGE = 24;
/** 円の外の枠の幅（px）。北の字を置く。 */
const BEZEL = 13;
const COLORS = { calm: 'rgba(239,230,210,', suspicious: 'rgba(224,168,58,', alert: 'rgba(200,64,44,' } as const;
const MINCHO = "'Hiragino Mincho ProN', 'Yu Mincho', 'YuMincho', serif";

export class Radar {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly size: number;

  constructor(private readonly stage: StageDef, size = 196) {
    this.size = size;
    this.canvas = document.createElement('canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.className = 'kg-radar';
    this.canvas.dataset.testid = 'radar';
    this.g = this.canvas.getContext('2d')!;
    this.g.scale(dpr, dpr);
  }

  /** camYaw はカメラの向き（ラジアン）。 */
  draw(snap: SimSnapshot, camYaw: number): void {
    const g = this.g;
    const s = this.size;
    const c = s / 2;
    const R = c - BEZEL;
    const k = (R - 4) / RANGE;
    const p = snap.characters.find((x) => x.kind === 'player');
    g.clearRect(0, 0, s, s);
    g.save();
    g.beginPath();
    g.arc(c, c, R, 0, Math.PI * 2);
    g.fillStyle = 'rgba(14,12,11,0.72)';
    g.fill();
    g.clip();
    if (!p) {
      g.restore();
      return;
    }
    const fx = Math.cos(camYaw);
    const fz = Math.sin(camYaw);
    // 地図の (x, z) → レーダー：カメラの前が上、右が右
    const tx = (x: number, z: number): [number, number] => {
      const dx = x - p.x;
      const dz = z - p.z;
      const right = -dx * fz + dz * fx;
      const fwd = dx * fx + dz * fz;
      return [c + right * k, c - fwd * k];
    };
    // 壁と建物（向きをつかむための薄い線）
    g.strokeStyle = 'rgba(239,230,210,0.22)';
    g.lineWidth = 1.5;
    for (const w of this.stage.walls) {
      if (w.kind === 'town') continue;
      const [ax, ay] = tx(w.a.x, w.a.z);
      const [bx, by] = tx(w.b.x, w.b.z);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
    }
    g.fillStyle = 'rgba(239,230,210,0.08)';
    for (const b of this.stage.buildings) {
      if (b.open) continue;
      const f = b.footprint;
      const pts = [tx(f.x0, f.z0), tx(f.x1, f.z0), tx(f.x1, f.z1), tx(f.x0, f.z1)];
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (const q of pts.slice(1)) g.lineTo(q[0], q[1]);
      g.closePath();
      g.fill();
    }
    // 扇
    for (const cone of snap.cones) {
      const col = COLORS[cone.awareness];
      g.fillStyle = `${col}${cone.awareness === 'calm' ? 0.16 : 0.32})`;
      g.beginPath();
      for (let i = 0; i < cone.poly.length / 2; i++) {
        const [x, y] = tx(cone.poly[i * 2], cone.poly[i * 2 + 1]);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fill();
      // 暗い隙間の向こうの灯りの島
      for (let b = 0; b < cone.bands.length / 8; b++) {
        g.beginPath();
        for (let j = 0; j < 4; j++) {
          const [x, y] = tx(cone.bands[b * 8 + j * 2], cone.bands[b * 8 + j * 2 + 1]);
          if (j === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.fill();
      }
    }
    // 番兵
    for (const ch of snap.characters) {
      if (ch.kind === 'player') continue;
      const [x, y] = tx(ch.x, ch.z);
      const down = ch.pose.stance === 'down';
      g.fillStyle = down ? 'rgba(239,230,210,0.3)' : `${COLORS[ch.pose.awareness]}0.95)`;
      g.beginPath();
      g.arc(x, y, ch.kind === 'nobunaga' ? 4.5 : 3.4, 0, Math.PI * 2);
      g.fill();
      if (ch.kind === 'nobunaga') {
        g.strokeStyle = '#c9a75b';
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(x, y, 7, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // 水抜き穴：近づいたら、穴の位置に水色の輪（中は暗い口）と「穴」の字
    const holes = nearHoles(this.stage, p.x, p.z);
    for (const h of holes) {
      const [x, y] = tx(h.x, h.z);
      g.fillStyle = 'rgba(8,16,22,0.95)';
      g.strokeStyle = 'rgba(150,206,226,0.95)';
      g.lineWidth = 1.8;
      g.beginPath();
      g.arc(x, y, 5.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(170,220,236,0.95)';
      g.font = `600 11px ${MINCHO}`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText('穴', x + 8, y + 0.5);
    }
    const marks = holes.length > 0 ? 'hole' : '';
    if (this.canvas.dataset.marks !== marks) this.canvas.dataset.marks = marks;
    // 縁の印：地図の向き (dx, dz) を、レーダーの上（カメラの前）からの向き（単位の長さ）へ直す
    const rim = (dx: number, dz: number): [number, number] => {
      const right = -dx * fz + dz * fx;
      const fwd = dx * fx + dz * fz;
      const l = Math.hypot(right, fwd) || 1;
      return [right / l, -fwd / l];
    };
    // 信長の方角：円の内側の縁に朱の三角（先が外を向く）。範囲の中でも外でも出す
    const nb = snap.characters.find((x) => x.kind === 'nobunaga');
    if (nb && Math.hypot(nb.x - p.x, nb.z - p.z) > 0.5) {
      const [ux, uy] = rim(nb.x - p.x, nb.z - p.z);
      const tip = R - 1.5;
      const base = R - 13;
      const qx = -uy;
      const qy = ux;
      g.fillStyle = '#c8402c';
      g.strokeStyle = '#e8c77a';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(c + ux * tip, c + uy * tip);
      g.lineTo(c + ux * base + qx * 6, c + uy * base + qy * 6);
      g.lineTo(c + ux * base - qx * 6, c + uy * base - qy * 6);
      g.closePath();
      g.fill();
      g.stroke();
    }
    // プレイヤー（向きの三角）。上がカメラの前、角は右回り（地図の Yaw と同じ向き）
    const rel = p.yaw - camYaw;
    g.translate(c, c);
    g.rotate(rel);
    g.fillStyle = '#efe6d2';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4.5, 5);
    g.lineTo(-4.5, 5);
    g.closePath();
    g.fill();
    g.restore();
    g.strokeStyle = 'rgba(201,167,91,0.6)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(c, c, R, 0, Math.PI * 2);
    g.stroke();
    // 北（地図の −Z）：円の外の枠に字を置く
    const [nx, ny] = rim(0, -1);
    const nr = R + BEZEL / 2;
    g.fillStyle = 'rgba(14,12,11,0.85)';
    g.beginPath();
    g.arc(c + nx * nr, c + ny * nr, 7.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8c77a';
    g.font = `600 11px ${MINCHO}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('北', c + nx * nr, c + ny * nr + 0.5);
  }

  /** 信長までの距離（m）。レーダーの下の添え書きに使う。信長かプレイヤーがいなければ null。 */
  static distanceToTarget(snap: SimSnapshot): number | null {
    const p = snap.characters.find((x) => x.kind === 'player');
    const nb = snap.characters.find((x) => x.kind === 'nobunaga');
    return p && nb ? Math.hypot(nb.x - p.x, nb.z - p.z) : null;
  }
}
