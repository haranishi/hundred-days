// OWNER: harness
// ?perf=1：固定の飛行経路を実時間で飛び、フレーム時間の分布・描画命令数・三角形数・JS ヒープを測る。
import { Vector3 } from 'three';
import type { App } from '../app';
import { FlightPath } from '../camera/flightPath';
import { DRAGON_POSES } from '../config/dragon';
import { PERF } from '../config/perf';
import { animatedPose } from '../dragon/animation';
import './globals';
import type { PerfResult } from './globals';

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}

/** 遊びの画面に映る竜の代わり：街の上を旋回させる（計測と開発表示で使う）。 */
export function circleDragon(app: App, t: number): void {
  const center = new Vector3(-150, 190, 20);
  const radius = 320;
  const w = 30 / radius;
  const a = t * w;
  const p = new Vector3(center.x + Math.cos(a) * radius, center.y + 12 * Math.sin(t * 0.4), center.z + Math.sin(a) * radius);
  // 円の接線の向き（+z を 0 とする yaw）
  const yaw = (Math.atan2(-Math.sin(a), Math.cos(a)) * 180) / Math.PI;
  app.dragon.setPose(animatedPose(DRAGON_POSES.glide, { speed: 30, flapAmplitude: 20, flapHz: 0.55 }, t));
  app.dragon.place(p, yaw, -3, 16); // 右回りの旋回なので右へ傾ける（左翼が上）
}

function heapMB(): number | null {
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return mem ? Math.round((mem.usedJSHeapSize / (1024 * 1024)) * 10) / 10 : null;
}

export function runPerf(app: App, seconds: number): Promise<PerfResult> {
  const path = new FlightPath();
  const target = new Vector3();
  app.post.setAccumulate(false);
  app.camera.fov = PERF.fov;
  app.cameraChanged();
  const frameMs: number[] = [];
  let callsSum = 0;
  let trianglesSum = 0;
  let measured = 0;
  const start = performance.now();
  let last = start;
  return new Promise((resolve) => {
    const tick = (now: number): void => {
      const t = (now - start) / 1000;
      path.at(t, app.camera.position, target);
      app.camera.lookAt(target);
      app.simTime = t;
      circleDragon(app, t);
      app.renderFrame((now - last) / 1000);
      if (t > PERF.warmupSeconds) {
        frameMs.push(now - last);
        callsSum += app.lastCalls;
        trianglesSum += app.lastTriangles;
        measured++;
      }
      last = now;
      if (t < PERF.warmupSeconds + seconds) {
        requestAnimationFrame(tick);
        return;
      }
      const sorted = [...frameMs].sort((a, b) => a - b);
      const total = frameMs.reduce((s, x) => s + x, 0);
      const { width, height } = app.size;
      const result: PerfResult = {
        seconds,
        frames: measured,
        frameMsP50: Math.round(percentile(sorted, 50) * 100) / 100,
        frameMsP95: Math.round(percentile(sorted, 95) * 100) / 100,
        frameMsMax: Math.round((sorted[sorted.length - 1] ?? 0) * 100) / 100,
        fpsMean: Math.round((measured / (total / 1000)) * 10) / 10,
        calls: Math.round(callsSum / Math.max(1, measured)),
        triangles: Math.round(trianglesSum / Math.max(1, measured)),
        jsHeapMB: heapMB(),
        firstFrameMs: Math.round(window.__firstFrameMs ?? -1),
        quality: app.settings.quality,
        gpu: app.gpu,
        width,
        height,
      };
      window.__perfResult = result;
      resolve(result);
    };
    requestAnimationFrame(tick);
  });
}
