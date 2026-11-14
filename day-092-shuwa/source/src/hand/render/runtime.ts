/**
 * three.js を使う部分の入口（動的 import で遅れて読み込む）。表示1つぶんの制御と、小さな画像の描画。
 * 動いていない時は描き直さない: 再生中・軌跡が消えるまで・ループの待ちの間だけ requestAnimationFrame を回す。
 */
import type { Handedness, Perspective, SignSpec, ThumbnailOptions } from '../types';
import { faceAt } from '../core/face';
import { clampDrag, nonDominantResting, signBounds, thumbnailBounds, type Bounds } from '../core/framing';
import { clamp } from '../core/math';
import { thumbnailTime } from '../core/thumb-time';
import { compileSign, formationOf, sampleSign, type CompiledSign, type Frame } from '../core/timeline';
import { acquireRenderer, drawStage, onContextRestored, releaseRenderer, rendererAlive, webglSupported } from './shared';
import { Stage } from './stage';

export { rendererAlive, webglSupported };

export interface ViewSettings {
  perspective: Perspective;
  dominant: Handedness;
  autoplay: boolean;
  loop: boolean;
  reducedMotion: boolean;
}

/** ループの間の休み・空中の跡が消えるまでの時間（秒、実時間） */
const LOOP_PAUSE = 1.0;
const TRAIL_FADE = 1.2;
const TRAIL_OPACITY = 0.5;
/** 再生前の止まった表示では、動きの経路を薄く見せる */
const STILL_TRAIL_OPACITY = 0.36;

interface Anim {
  sign: CompiledSign;
  start: number;
  speed: number;
  endedAt: number | null;
}

/** 同時に再生する表示は2つまで（design.md）。3つ目が再生を始めたら、いちばん古い再生を最後の形で止める */
const MAX_PLAYING = 2;
const playing: HandViewController[] = [];
function markPlaying(c: HandViewController) {
  const i = playing.indexOf(c);
  if (i >= 0) playing.splice(i, 1);
  playing.push(c);
  while (playing.length > MAX_PLAYING) playing.shift()?.stopPlayback();
}
function unmarkPlaying(c: HandViewController) {
  const i = playing.indexOf(c);
  if (i >= 0) playing.splice(i, 1);
}

export class HandViewController {
  private readonly stage = new Stage();
  private compiled: CompiledSign;
  private bounds: Bounds;
  private spec: SignSpec;
  private settings: ViewSettings;
  private w = 0;
  private h = 0;
  private yaw = 0;
  private pitch = 0;
  private visible = true;
  private raf = 0;
  private disposed = false;
  private anim: Anim | null = null;
  private stillTrail = true;
  private resetAnim: { from: [number, number]; start: number } | null = null;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly offRestore: () => void;

  /** 描けない環境（WebGL なし）では null */
  static create(canvas: HTMLCanvasElement, spec: SignSpec, settings: ViewSettings): HandViewController | null {
    if (!webglSupported()) return null;
    const r = acquireRenderer();
    if (!r) return null;
    return new HandViewController(canvas, spec, settings);
  }

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    spec: SignSpec,
    settings: ViewSettings,
  ) {
    this.settings = settings;
    this.spec = spec;
    this.compiled = compileSign(spec);
    this.bounds = signBounds(this.compiled, settings.dominant, !!spec.body);
    this.stage.setDominant(settings.dominant);
    this.applyConfig();
    this.offRestore = onContextRestored(() => this.requestFrame());
    if (settings.autoplay && !settings.reducedMotion && !this.compiled.isStatic) this.play(1);
  }

  get warnings(): string[] {
    return this.compiled.warnings;
  }

  private applyConfig() {
    this.stage.configure({ twoHands: !!this.compiled.nonDominant, body: !!this.spec.body });
  }

  setSpec(spec: SignSpec) {
    this.spec = spec;
    this.compiled = compileSign(spec);
    this.recomputeBounds();
    this.applyConfig();
    this.anim = null;
    unmarkPlaying(this);
    this.clearLoop();
    this.stillTrail = true;
    if (this.settings.autoplay && !this.settings.reducedMotion && !this.compiled.isStatic) this.play(1);
    else this.requestFrame();
  }

  private recomputeBounds() {
    this.bounds = signBounds(this.compiled, this.settings.dominant, !!this.spec.body);
  }

  update(settings: Partial<ViewSettings>) {
    const prev = this.settings;
    this.settings = { ...prev, ...settings };
    if (settings.dominant && settings.dominant !== prev.dominant) {
      this.stage.setDominant(settings.dominant);
      this.recomputeBounds();
    }
    if (settings.perspective && settings.perspective !== prev.perspective) {
      this.yaw = 0;
      this.pitch = 0;
      this.resetAnim = null;
    }
    if (settings.loop === false && this.anim && this.anim.endedAt !== null) {
      this.anim = null;
      this.clearLoop();
    }
    this.requestFrame();
  }

  setSize(cssW: number, cssH: number, dpr: number) {
    const k = Math.min(Math.max(dpr, 1), 2);
    const w = Math.max(1, Math.round(cssW * k)), h = Math.max(1, Math.round(cssH * k));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.requestFrame();
  }

  /** 最初から再生する（動きのない形は、力を抜いた手から形を作る動き） */
  play(speed: number) {
    this.clearLoop();
    const sign = this.compiled.isStatic ? formationOf(this.compiled) : this.compiled;
    this.anim = { sign, start: performance.now(), speed, endedAt: null };
    this.stillTrail = false;
    markPlaying(this);
    this.requestFrame();
  }

  /** 再生をやめて最後の形を見せる（ほかの表示が再生を始めた時） */
  stopPlayback() {
    unmarkPlaying(this);
    if (!this.anim) return;
    this.anim = null;
    this.clearLoop();
    this.requestFrame();
  }

  /** ドラッグで足した角度（度）。範囲は左右 ±180・上下 ±60 */
  setRotation(yaw: number, pitch: number) {
    const c = clampDrag(yaw, pitch);
    this.yaw = c.yaw;
    this.pitch = c.pitch;
    this.resetAnim = null;
    this.requestFrame();
  }

  getRotation(): { yaw: number; pitch: number } {
    return { yaw: this.yaw, pitch: this.pitch };
  }

  resetRotation(animate: boolean) {
    if (!animate) {
      this.yaw = 0;
      this.pitch = 0;
      this.resetAnim = null;
    } else {
      this.resetAnim = { from: [this.yaw, this.pitch], start: performance.now() };
    }
    this.requestFrame();
  }

  setVisible(v: boolean) {
    if (v === this.visible) return;
    this.visible = v;
    if (!v && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    if (v) this.requestFrame();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    unmarkPlaying(this);
    this.clearLoop();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.offRestore();
    releaseRenderer();
  }

  /** ループの休み: 同じ絵を描き続けないよう、休みの間は requestAnimationFrame を止めてタイマーで待つ */
  private scheduleLoop(sec: number) {
    if (this.loopTimer) return;
    this.loopTimer = setTimeout(() => {
      this.loopTimer = null;
      if (this.disposed || !this.anim) return;
      this.anim.start = performance.now();
      this.anim.endedAt = null;
      this.requestFrame();
    }, sec * 1000);
  }

  private clearLoop() {
    if (this.loopTimer) clearTimeout(this.loopTimer);
    this.loopTimer = null;
  }

  private requestFrame() {
    if (this.disposed || !this.visible || this.raf) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  /** 次のコマを待たずに、いま描く（作り直した直後に空の表示を見せないため。HandView がレイアウトの直後に呼ぶ） */
  renderNow() {
    if (this.disposed) return;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.tick(performance.now());
  }

  private readonly tick = (now: number) => {
    this.raf = 0;
    if (this.disposed || !this.visible) return;
    let again = false;
    let frame: Frame;
    let trail = { progress: 1, opacity: this.stillTrail && this.compiled.trace ? STILL_TRAIL_OPACITY : 0 };
    let t = this.compiled.duration;
    const a = this.anim;
    if (a) {
      const signT = ((now - a.start) / 1000) * a.speed;
      if (signT < a.sign.duration) {
        t = signT;
        frame = sampleSign(a.sign, t);
        trail = { progress: frame.trace?.progress ?? 0, opacity: TRAIL_OPACITY };
        again = true;
      } else {
        if (a.endedAt === null) a.endedAt = now;
        const since = (now - a.endedAt) / 1000;
        t = a.sign.duration;
        frame = sampleSign(a.sign, t);
        const fade = a.sign.trace ? clamp(1 - since / TRAIL_FADE, 0, 1) : 0;
        trail = { progress: 1, opacity: TRAIL_OPACITY * fade };
        if (fade > 0) again = true; // 跡が消えるまでは描き続ける
        else if (this.settings.loop) this.scheduleLoop(Math.max(0, LOOP_PAUSE - since));
        else {
          this.anim = null;
          unmarkPlaying(this);
        }
      }
    } else {
      frame = sampleSign(this.compiled, this.compiled.duration);
    }
    if (this.resetAnim) {
      const k = clamp((now - this.resetAnim.start) / 280, 0, 1);
      const e = 1 - (1 - k) ** 3;
      this.yaw = this.resetAnim.from[0] * (1 - e);
      this.pitch = this.resetAnim.from[1] * (1 - e);
      if (k < 1) again = true;
      else this.resetAnim = null;
    }
    this.draw(frame, trail, t);
    if (again) this.raf = requestAnimationFrame(this.tick);
  };

  private draw(frame: Frame, trail: { progress: number; opacity: number }, t: number) {
    if (this.w <= 0 || this.h <= 0) return;
    this.stage.setFrame(frame, trail, faceAt(this.spec, t));
    this.stage.aim(this.bounds, this.settings.perspective, this.yaw, this.pitch, this.w / this.h, this.compiled);
    drawStage(this.stage, this.canvas, this.w, this.h);
  }
}

/* ───────── 小さな画像 ───────── */

/**
 * 小さな画像で、袖・腕・胴・空中の跡を画像の縁からぼかして消す幅（画像の一辺に対する割合）。
 * 0.2 は図鑑の札（表示 96px）で約20px。hand-r3 で、枠を合わせるだけ（縁で直線に切れたまま）と、ぼかす幅 0.12・0.2・0.3 を
 * 撮って見比べて決めた（0.12 は切れ目がぼやけた直線に見え、0.3 は袖が手首の近くから薄くなった。.agent-harness/runs/hand-r3/notes.md）
 */
const THUMB_EDGE_FADE = 0.2;

let thumbStage: Stage | null = null;

/** 小さな画像を描いて URL を返す。描けなければ null（呼び出し側が代わりの画像を返す） */
export async function renderThumbnailImage(spec: SignSpec, opts: ThumbnailOptions): Promise<string | null> {
  if (!webglSupported()) return null;
  const r = acquireRenderer();
  if (!r) return null;
  try {
    const size = Math.max(16, Math.round(opts.size ?? 256));
    const dominant = opts.dominant ?? 'right';
    const perspective = opts.perspective ?? 'viewer';
    const c = compileSign(spec);
    // 時点を省いた時は、上半身つきの単語は最初の止まる区間の真ん中、それ以外は最後の形（core/thumb-time.ts）
    const t = thumbnailTime(spec, c, opts.at);
    const frame = sampleSign(c, t);
    const stage = (thumbStage ??= new Stage());
    // 開発時だけ: ぼかす幅を一覧ページから変えて見比べられる（dev-hands.html?set=cards&fade=0.12。本番のビルドでは消える）
    const devFade = import.meta.env.DEV ? (globalThis as { __handThumbEdgeFade?: number }).__handThumbEdgeFade : undefined;
    stage.edgeFade = devFade ?? THUMB_EDGE_FADE;
    stage.setDominant(dominant);
    stage.configure({ twoHands: !!c.nonDominant, body: !!spec.body });
    stage.setNonDominantResting(nonDominantResting(c, t));
    const progress = c.trace ? frame.trace?.progress ?? 0 : 0;
    // 小さな画像は形を見せる静止画なので、うなずきの途中（頭が少し傾いた絵）は描かない
    stage.setFrame(frame, { progress, opacity: c.trace ? 0.42 : 0 }, { ...faceAt(spec, t), nod: 0 });
    // 枠は描く時点の手だけを収める（動く形も、ほかの札と同じ大きさで真ん中に。core/framing.ts の thumbnailBounds）
    stage.aim(thumbnailBounds(c, t, dominant, !!spec.body, perspective), perspective, 0, 0, 1, c);
    const canvas = document.createElement('canvas');
    if (!drawStage(stage, canvas, size, size)) return null;
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    return blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png');
  } finally {
    releaseRenderer();
  }
}
