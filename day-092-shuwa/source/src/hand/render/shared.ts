/**
 * 共有の描画器（WebGLRenderer は1つだけ）。各表示と小さな画像は、これで描いてから自分の 2D キャンバスへ写す。
 * WebGL の文脈がいくつも開くとスマホでは古いものから失われるため、文脈を1つに保つ（design.md「同時に動く3D表示は2つまで」の上限に当たらない）。
 * 使う人がいなくなったら、少し待って（表示の付け替えで作り直しが続かないように）破棄し、文脈も手放す。
 */
import { WebGLRenderer } from 'three';
import type { Stage } from './stage';

const GRACE_MS = 800;

let renderer: WebGLRenderer | null = null;
let failed = false;
let lost = false;
let users = 0;
let bufW = 0;
let bufH = 0;
let idle: ReturnType<typeof setTimeout> | null = null;
const restored = new Set<() => void>();

let supported: boolean | null = null;

/** WebGL が使えるか（1回だけ確かめて覚える。確かめに使った文脈はすぐ手放す） */
export function webglSupported(): boolean {
  if (failed) return false;
  if (supported !== null) return supported;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    supported = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    supported = false;
  }
  return supported;
}

export function acquireRenderer(): WebGLRenderer | null {
  if (failed) return null;
  if (idle) {
    clearTimeout(idle);
    idle = null;
  }
  if (!renderer) {
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'low-power' });
    } catch {
      failed = true;
      return null;
    }
    renderer.setPixelRatio(1);
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    bufW = 0;
    bufH = 0;
    lost = false;
    const el = renderer.domElement;
    el.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      lost = true;
    });
    el.addEventListener('webglcontextrestored', () => {
      lost = false;
      for (const f of restored) f();
    });
  }
  users++;
  return renderer;
}

export function releaseRenderer() {
  users = Math.max(0, users - 1);
  if (users > 0 || idle) return;
  idle = setTimeout(() => {
    idle = null;
    if (users > 0 || !renderer) return;
    renderer.dispose();
    renderer.forceContextLoss();
    renderer = null;
  }, GRACE_MS);
}

/** いま描画器が生きているか（開発用・試験用） */
export function rendererAlive(): boolean {
  return renderer !== null;
}

export function onContextRestored(f: () => void): () => void {
  restored.add(f);
  return () => restored.delete(f);
}

/** 場面を w×h（実ピクセル）で描いて target へ写す。描けなければ false */
export function drawStage(stage: Stage, target: HTMLCanvasElement, w: number, h: number): boolean {
  const r = renderer;
  if (!r || lost || w <= 0 || h <= 0) return false;
  const t0 = import.meta.env.DEV ? performance.now() : 0;
  if (w > bufW || h > bufH) {
    bufW = Math.max(bufW, w);
    bufH = Math.max(bufH, h);
    r.setSize(bufW, bufH, false);
  }
  r.setScissorTest(true);
  r.setViewport(0, 0, w, h);
  r.setScissor(0, 0, w, h);
  r.clear(true, true, true);
  stage.setOutlineFor(h);
  stage.setEdgeFadeFor(w, h);
  stage.render(r);
  if (target.width !== w) target.width = w;
  if (target.height !== h) target.height = h;
  const ctx = target.getContext('2d');
  if (!ctx) return false;
  ctx.clearRect(0, 0, w, h);
  // WebGL の原点は左下。描いた範囲は描画面の下端にある
  ctx.drawImage(r.domElement, 0, bufH - h, w, h, 0, 0, w, h);
  if (import.meta.env.DEV) {
    // 開発時だけ: 描画1回の時間（ミリ秒）を残す（性能の確認用。本番のビルドでは消える）
    const g = globalThis as { __handDrawMs?: number[] };
    (g.__handDrawMs ??= []).push(performance.now() - t0);
  }
  return true;
}
