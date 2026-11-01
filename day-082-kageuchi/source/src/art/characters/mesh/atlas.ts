// OWNER: chars-art
// 人物の紋と柄を、1枚の canvas（1024×1024）に手続きで描く。外の画像は使わない。
// 1枚にまとめるのは、全身を1つの材質（＝1回の描画命令）で描くため。区画の外周は地の色で埋め、
// 縮小（ミップマップ）で隣の区画の色がにじまないようにする。flipY は false に固定し、
// 「UV の v=0 が canvas の上端」と決める（CanvasTexture は既定で上下が反転するため明示する）。
import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace, type Texture } from 'three';
import { PLAYER_OUTFIT } from '../config';

const SIZE = 1024;
const CELL = 256;
const PAD = 10;

export type RegionName =
  | 'white'
  | 'face'
  | 'faceNobu'
  | 'facePlayer'
  | 'faceRan'
  | 'mokkoHat'
  | 'kikyoBack'
  | 'haoriMon'
  | 'paper'
  | 'flowers'
  | 'odoshi'
  | 'tsukaIto'
  | 'straw'
  | 'kikyoSmall';

const CELLS: Record<RegionName, [number, number]> = {
  white: [0, 0],
  face: [1, 0],
  faceNobu: [2, 0],
  facePlayer: [3, 0],
  mokkoHat: [0, 1],
  kikyoBack: [1, 1],
  haoriMon: [2, 1],
  paper: [3, 1],
  flowers: [0, 2],
  odoshi: [1, 2],
  faceRan: [2, 2],
  tsukaIto: [3, 2],
  straw: [0, 3],
  kikyoSmall: [1, 3],
};

export interface Region {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** 区画の UV の範囲（外周の余白を除いた内側）。 */
export function region(name: RegionName): Region {
  const [cx, cy] = CELLS[name];
  return {
    u0: (cx * CELL + PAD) / SIZE,
    v0: (cy * CELL + PAD) / SIZE,
    u1: ((cx + 1) * CELL - PAD) / SIZE,
    v1: ((cy + 1) * CELL - PAD) / SIZE,
  };
}

/** 区画の中の割合 (s, t)（t=0 が区画の上端）を、アトラスの UV にする。 */
export function regionUV(r: Region, s: number, t: number, out: [number, number]): [number, number] {
  const cs = s < 0 ? 0 : s > 1 ? 1 : s;
  const ct = t < 0 ? 0 : t > 1 ? 1 : t;
  out[0] = r.u0 + (r.u1 - r.u0) * cs;
  out[1] = r.v0 + (r.v1 - r.v0) * ct;
  return out;
}

let cached: Texture | null = null;

/** アトラスの貼り絵（全員で1枚を共有する）。 */
export function atlasTexture(): Texture {
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('chars-art: canvas 2d が使えない');
  paint(g);
  const tex = new CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}

type G = CanvasRenderingContext2D;

/** 区画を地の色で塗り（余白まで）、中身を描く関数に区画の内側の矩形を渡す。 */
function cell(g: G, name: RegionName, ground: string, draw: (x: number, y: number, w: number, h: number) => void): void {
  const [cx, cy] = CELLS[name];
  const x0 = cx * CELL;
  const y0 = cy * CELL;
  g.save();
  g.fillStyle = ground;
  g.fillRect(x0, y0, CELL, CELL);
  g.beginPath();
  g.rect(x0, y0, CELL, CELL);
  g.clip();
  draw(x0 + PAD, y0 + PAD, CELL - PAD * 2, CELL - PAD * 2);
  g.restore();
}

/** 種つきの乱数（柄の散らしを毎回同じにする）。 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 木瓜紋（織田木瓜を簡略にした形）：5つの丸い弁の外形、その内側に細い隙間の輪、中心に5弁の花。
 * 小さく見ても「丸い弁が5つ＋中心の花」と読めることを優先した。
 */
function mokko(g: G, cx: number, cy: number, R: number, fg: string, bg: string): void {
  const lobes = (scale: number, color: string) => {
    g.fillStyle = color;
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
      const lx = cx + Math.cos(a) * R * 0.44 * scale;
      const ly = cy + Math.sin(a) * R * 0.44 * scale;
      g.moveTo(lx + R * 0.52 * scale, ly);
      g.arc(lx, ly, R * 0.52 * scale, 0, Math.PI * 2);
    }
    g.fill();
  };
  lobes(1, fg);
  lobes(0.8, bg);
  lobes(0.7, fg);
  // 中心の花：5弁と芯
  g.fillStyle = bg;
  g.beginPath();
  g.arc(cx, cy, R * 0.36, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = fg;
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5 + Math.PI / 5;
    g.beginPath();
    g.arc(cx + Math.cos(a) * R * 0.2, cy + Math.sin(a) * R * 0.2, R * 0.12, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = bg;
  g.beginPath();
  g.arc(cx, cy, R * 0.07, 0, Math.PI * 2);
  g.fill();
}

/** 桔梗紋：先の尖った5枚の花弁と、花弁の筋と、中心の小さな星。 */
function kikyo(g: G, cx: number, cy: number, R: number, fg: string, bg: string): void {
  g.fillStyle = fg;
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // 花弁の外形（体の座標で：r＝中心からの距離、w＝横の広がり）
    const pts: [number, number][] = [
      [0.08, 0],
      [0.45, 0.33],
      [0.86, 0.3],
      [1.0, 0.0],
      [0.86, -0.3],
      [0.45, -0.33],
    ];
    g.beginPath();
    pts.forEach(([r, w], i) => {
      const x = cx + (ca * r - sa * w) * R;
      const y = cy + (sa * r + ca * w) * R;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.closePath();
    g.fill();
  }
  // 花弁の筋と、花弁の間の切れ目
  g.strokeStyle = bg;
  g.lineWidth = Math.max(1.5, R * 0.06);
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * R * 0.25, cy + Math.sin(a) * R * 0.25);
    g.lineTo(cx + Math.cos(a) * R * 0.78, cy + Math.sin(a) * R * 0.78);
    g.stroke();
  }
  g.fillStyle = bg;
  g.beginPath();
  g.arc(cx, cy, R * 0.16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = fg;
  g.beginPath();
  g.arc(cx, cy, R * 0.07, 0, Math.PI * 2);
  g.fill();
}

/** 顔（正面から投影する）。区画の中心が頭の中心、幅が頭の幅、高さが頭の高さに当たる。 */
function face(g: G, x: number, y: number, w: number, h: number, opts: { mustache?: boolean; young?: boolean }): void {
  const cx = x + w / 2;
  const eyeY = y + h * 0.5;
  // 頬の陰と、鼻の下の陰
  const grad = g.createRadialGradient(cx, y + h * 0.55, w * 0.1, cx, y + h * 0.55, w * 0.62);
  grad.addColorStop(0, 'rgba(255,220,190,0.18)');
  grad.addColorStop(1, 'rgba(60,30,20,0.25)');
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
  // 眉
  g.strokeStyle = '#1a1210';
  g.lineCap = 'round';
  g.lineWidth = w * (opts.young ? 0.022 : 0.03);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * w * 0.09, eyeY - h * 0.085);
    g.quadraticCurveTo(cx + s * w * 0.17, eyeY - h * (opts.young ? 0.1 : 0.11), cx + s * w * 0.26, eyeY - h * 0.08);
    g.stroke();
  }
  // 目（細い切れ長）
  g.fillStyle = '#130d0b';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(cx + s * w * 0.17, eyeY, w * 0.07, h * (opts.young ? 0.026 : 0.02), s * 0.08, 0, Math.PI * 2);
    g.fill();
  }
  // 鼻の陰
  g.fillStyle = 'rgba(70,35,25,0.35)';
  g.beginPath();
  g.ellipse(cx, eyeY + h * 0.13, w * 0.05, h * 0.03, 0, 0, Math.PI * 2);
  g.fill();
  // 口
  g.strokeStyle = 'rgba(90,40,35,0.9)';
  g.lineWidth = w * 0.018;
  g.beginPath();
  g.moveTo(cx - w * 0.08, eyeY + h * 0.245);
  g.quadraticCurveTo(cx, eyeY + h * 0.255, cx + w * 0.08, eyeY + h * 0.245);
  g.stroke();
  if (opts.mustache) {
    // 口ひげ（左右に細く垂れる）と、あごの短いひげ
    g.fillStyle = '#100c0b';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx, eyeY + h * 0.205);
      g.quadraticCurveTo(cx + s * w * 0.12, eyeY + h * 0.19, cx + s * w * 0.2, eyeY + h * 0.27);
      g.quadraticCurveTo(cx + s * w * 0.1, eyeY + h * 0.225, cx, eyeY + h * 0.225);
      g.fill();
    }
    g.beginPath();
    g.ellipse(cx, eyeY + h * 0.33, w * 0.035, h * 0.03, 0, 0, Math.PI * 2);
    g.fill();
  }
}

function paint(g: G): void {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, SIZE, SIZE);

  cell(g, 'white', '#ffffff', () => {});

  // 顔（肌の色は頂点色ではなく、ここに焼き込む。頭の頂点色は白にする）
  const skin = '#c89a78';
  cell(g, 'face', skin, (x, y, w, h) => face(g, x, y, w, h, {}));
  cell(g, 'faceNobu', skin, (x, y, w, h) => face(g, x, y, w, h, { mustache: true }));
  cell(g, 'faceRan', '#d2a585', (x, y, w, h) => face(g, x, y, w, h, { young: true }));
  // 覆面：墨の布に、目のところだけ細い帯で肌が見える
  cell(g, 'facePlayer', '#1c1e24', (x, y, w, h) => {
    const eye = PLAYER_OUTFIT.eyes;
    const eyeY = y + h * 0.5;
    g.fillStyle = skin;
    g.beginPath();
    g.ellipse(x + w / 2, eyeY, w * eye.openingW, h * eye.openingH, 0, 0, Math.PI * 2);
    g.fill();
    // r07-chars: 丸い黒点では覆面が人形に見える。細い瞼と虹彩で前を見る目にする。
    for (const s of [-1, 1]) {
      const ex = x + w / 2 + s * w * eye.space;
      g.save();
      g.beginPath();
      g.ellipse(ex, eyeY, w * eye.halfW, h * eye.halfH, 0, 0, Math.PI * 2);
      g.fillStyle = '#b5aa99';
      g.fill();
      g.clip();
      g.fillStyle = '#3b2d25';
      g.beginPath(); g.arc(ex, eyeY, w * eye.irisR, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#130d0b';
      g.beginPath(); g.arc(ex, eyeY, w * eye.pupilR, 0, Math.PI * 2); g.fill();
      g.restore();
      g.strokeStyle = '#38231b';
      g.lineWidth = w * eye.lidW;
      g.beginPath();
      g.moveTo(ex - w * eye.halfW, eyeY);
      g.quadraticCurveTo(ex, eyeY - h * eye.halfH * 2, ex + w * eye.halfW, eyeY);
      g.stroke();
    }
    // 布のたるみの筋
    g.strokeStyle = 'rgba(255,255,255,0.05)';
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(x + w * 0.2, eyeY + h * (0.12 + i * 0.05));
      g.quadraticCurveTo(x + w / 2, eyeY + h * (0.16 + i * 0.05), x + w * 0.8, eyeY + h * (0.12 + i * 0.05));
      g.stroke();
    }
  });

  // 陣笠を真上から見た円：黒漆に金の木瓜紋（前＝区画の下側。笠の UV は上から投影する）
  cell(g, 'mokkoHat', '#0f0e0d', (x, y, w, h) => {
    const cx = x + w / 2;
    const cy = y + h / 2;
    // 漆の艶のむら（同心円の薄い筋）
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.025 + (i % 2) * 0.015})`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(cx, cy, w * (0.08 + i * 0.05), 0, Math.PI * 2);
      g.stroke();
    }
    mokko(g, cx, cy + h * 0.27, w * 0.13, '#c9a75b', '#0f0e0d');
  });

  // 光秀の背の桔梗紋（水色桔梗）。墨の地に、区画の中央に置く
  cell(g, 'kikyoBack', '#1c1e24', (x, y, w, h) => kikyo(g, x + w / 2, y + h / 2, w * 0.4, '#74bde6', '#1c1e24'));
  cell(g, 'kikyoSmall', '#1c1e24', (x, y, w, h) => kikyo(g, x + w / 2, y + h / 2, w * 0.42, '#74bde6', '#1c1e24'));

  // 羽織の背紋：黒地に白の木瓜
  cell(g, 'haoriMon', '#141415', (x, y, w, h) => mokko(g, x + w / 2, y + h / 2, w * 0.36, '#e9e4d6', '#141415'));

  // 提灯の紙：骨の横筋と、前と後ろに黒の木瓜紋（u は胴を一周、v は上→下）
  cell(g, 'paper', '#f6e2b8', (x, y, w, h) => {
    const grad = g.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, '#d9b884');
    grad.addColorStop(0.18, '#f8e6bf');
    grad.addColorStop(0.82, '#f8e6bf');
    grad.addColorStop(1, '#d9b884');
    g.fillStyle = grad;
    g.fillRect(x - PAD, y - PAD, w + PAD * 2, h + PAD * 2);
    g.strokeStyle = 'rgba(120,80,40,0.35)';
    g.lineWidth = 2;
    for (let i = 1; i < 12; i++) {
      g.beginPath();
      g.moveTo(x - PAD, y + (h * i) / 12);
      g.lineTo(x + w + PAD, y + (h * i) / 12);
      g.stroke();
    }
    for (const fu of [0.25, 0.75]) mokko(g, x + w * fu, y + h * 0.5, h * 0.2, '#14100c', '#f8e6bf');
  });

  // 蘭丸の小袖：紫の地に白い小花を散らす（区画が布の 1m 四方に当たる）
  cell(g, 'flowers', '#5d2f86', (x, y, w, h) => {
    const r = seeded(7);
    // 流水の淡い筋
    g.strokeStyle = 'rgba(190,160,230,0.16)';
    g.lineWidth = 3;
    for (let i = 0; i < 7; i++) {
      const yy = y + (i + 0.5) * (h / 7);
      g.beginPath();
      g.moveTo(x - PAD, yy);
      for (let k = 0; k <= 8; k++) g.quadraticCurveTo(x + (k - 0.5) * (w / 8), yy + (k % 2 ? 6 : -6), x + k * (w / 8), yy);
      g.stroke();
    }
    for (let i = 0; i < 70; i++) {
      const fx = x + r() * w;
      const fy = y + r() * h;
      const fr = 3.2 + r() * 3.4;
      const tint = r() < 0.2 ? '#e8c9f0' : '#f1ebdf';
      g.fillStyle = tint;
      for (let k = 0; k < 5; k++) {
        const a = (k * 2 * Math.PI) / 5 + r() * 0.3;
        g.beginPath();
        g.arc(fx + Math.cos(a) * fr * 0.6, fy + Math.sin(a) * fr * 0.6, fr * 0.55, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#c9a75b';
      g.beginPath();
      g.arc(fx, fy, fr * 0.25, 0, Math.PI * 2);
      g.fill();
    }
  });

  // 威（おどし）：横の列ごとに、漆の板の縁（黒）と、縦に並んだ糸（明るい灰。頂点色で紺や緋に染める）
  cell(g, 'odoshi', '#d4d4d4', (x, y, w, h) => {
    const rows = 14;
    const rh = (h + PAD * 2) / rows;
    for (let i = 0; i < rows; i++) {
      const yy = y - PAD + i * rh;
      g.fillStyle = '#0d0d0d';
      g.fillRect(x - PAD, yy, w + PAD * 2, rh * 0.22);
      g.strokeStyle = 'rgba(0,0,0,0.38)';
      g.lineWidth = 1;
      for (let k = 0; k < 64; k++) {
        const xx = x - PAD + (k * (w + PAD * 2)) / 64;
        g.beginPath();
        g.moveTo(xx, yy + rh * 0.22);
        g.lineTo(xx, yy + rh);
        g.stroke();
      }
      // 菱縫い（最下段の飾り）は省き、板の小さな鋲の点だけ
      g.fillStyle = 'rgba(220,200,150,0.55)';
      for (let k = 0; k < 10; k++) g.fillRect(x + (k + 0.5) * (w / 10) - 1, yy + rh * 0.08, 2, 2);
    }
  });

  // 柄巻き（菱形の糸の目）：黒い糸の間から白い鮫皮が菱形にのぞく
  cell(g, 'tsukaIto', '#16161c', (x, y, w, h) => {
    g.fillStyle = '#d9d2c2';
    const n = 8;
    for (let i = 0; i < n; i++) {
      const cy = y + (i + 0.5) * (h / n);
      g.beginPath();
      g.moveTo(x + w / 2, cy - h / n / 2.6);
      g.lineTo(x + w * 0.75, cy);
      g.lineTo(x + w / 2, cy + h / n / 2.6);
      g.lineTo(x + w * 0.25, cy);
      g.closePath();
      g.fill();
    }
  });

  // 藁（草鞋と陣笠の内側）：細かい縦横の筋
  cell(g, 'straw', '#8f7d57', (x, y, w, h) => {
    const r = seeded(3);
    for (let i = 0; i < 120; i++) {
      g.strokeStyle = r() < 0.5 ? 'rgba(60,45,25,0.35)' : 'rgba(230,210,160,0.25)';
      g.lineWidth = 1 + r() * 1.5;
      const xx = x + r() * w;
      g.beginPath();
      g.moveTo(xx, y - PAD);
      g.lineTo(xx + (r() - 0.5) * 6, y + h + PAD);
      g.stroke();
    }
  });
}
