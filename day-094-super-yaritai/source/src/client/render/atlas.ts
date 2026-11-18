/**
 * 作り込みの文字の絵（アトラス）：のぼり旗・ポスター・看板の帯・時計・番号札などを1枚の canvas に詰めて描き、
 * 1つの材質で貼る（描画の回数を増やさない）。外部フォントは読まず、端末の日本語フォントを使う（signs.ts と同じ字）。
 * 地は白で塗っておく（縮小したときに絵の縁が透けて欠けないように）。切り抜きの絵（時計・バッジ）だけ透明にする。
 */
import * as THREE from 'three';
import { PALETTE } from './palette';

export const FONT = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "Meiryo", system-ui, sans-serif';

export interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Draw = (g: CanvasRenderingContext2D, c: Cell) => void;

export class DecalAtlas {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private cx = 0;
  private cy = 0;
  private rowH = 0;

  constructor(readonly size: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.g = this.canvas.getContext('2d')!;
    this.g.fillStyle = PALETTE.white;
    this.g.fillRect(0, 0, size, size);
  }

  /**
   * 左から詰めて場所を取り、draw で描く（背の高い絵から順に頼むと無駄が少ない）。
   * cutout は背景を透明にし、まわりに透明の余白を取る（遠くで縮小したとき、となりの白い地がにじんで四角い縁が出ないように）
   */
  cell(w: number, h: number, draw: Draw, cutout = false): Cell {
    const pad = cutout ? 24 : 0;
    const W = w + pad * 2;
    const H = h + pad * 2;
    if (this.cx + W > this.size) {
      this.cx = 0;
      this.cy += this.rowH + 4;
      this.rowH = 0;
    }
    if (this.cy + H > this.size) throw new Error(`decal atlas is full (${w}x${h})`);
    if (cutout) this.g.clearRect(this.cx, this.cy, W, H);
    const c = { x: this.cx + pad, y: this.cy + pad, w, h };
    this.cx += W + 4;
    this.rowH = Math.max(this.rowH, H);
    this.g.save();
    this.g.beginPath();
    this.g.rect(c.x, c.y, c.w, c.h);
    this.g.clip();
    draw(this.g, c);
    this.g.restore();
    return c;
  }

  /** 絵の一部を貼った四角（中心が原点・+z を向く） */
  decal(w: number, h: number, c: Cell): THREE.BufferGeometry {
    const g = new THREE.PlaneGeometry(w, h);
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      // canvas は上が y=0、テクスチャは下が v=0（flipY）
      uv.setXY(i, (c.x + u * c.w) / this.size, 1 - (c.y + (1 - v) * c.h) / this.size);
    }
    return g.toNonIndexed();
  }

  texture(): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(this.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
}

/** 幅に収まる大きさで1行の文字を書く（端末の字の幅は違うので、測ってから縮める） */
export function fitText(g: CanvasRenderingContext2D, s: string, maxW: number, size: number, x: number, y: number, color: string, weight = 900): void {
  g.font = `${weight} ${size}px ${FONT}`;
  const w = g.measureText(s).width;
  const fit = w > maxW ? Math.floor((size * maxW) / w) : size;
  g.font = `${weight} ${fit}px ${FONT}`;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(s, x, y);
}

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
