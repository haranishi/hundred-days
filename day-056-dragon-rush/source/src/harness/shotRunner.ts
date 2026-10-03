// OWNER: harness
// ?shot=名前：構図に竜とカメラを置き、時刻を固定し、影と AO が落ち着くまで回してから
// window.__shotReady と __shotInfo を立てる。breath・landing・aftermath は、遊びと同じ仕組みで破壊の場面を作ってから撮る。
// ?film=名前&frames=N：実時間を止め、1/60 秒刻みで1コマずつ進めて window.__filmFrame を更新する。
// ?film=pan は構図ではなく、カメラが街の上を横へ流れる連番（r01-city。窓のモアレと影の泳ぎを測る）。
import { Vector3 } from 'three';
import type { App } from '../app';
import { directionFromAngles, placeCamera } from '../camera/rig';
import { GRADE } from '../config/render';
import { COLLAPSE_FILM, PAN_FILM, isShotName } from '../config/shots';
import { parseSpecimenParams } from '../creatures/specimenParams';
import { animatedPose, forwardOffset } from '../dragon/animation';
import './globals';
import { buildCollapseScene, buildShotScene, collapseCamera } from './shotScenes';
import { resolveShot, type ResolvedShot } from './shotResolver';
import { runSpecimenFilm, runSpecimenShot } from './specimenRunner';

export const FILM_STEP = 1 / 60;

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function applyShot(app: App, shot: ResolvedShot): void {
  placeCamera(app.camera, shot.camera.position, shot.camera.target, shot.camera.fov);
  app.cameraChanged();
  app.dragon.setPose(shot.dragon.pose);
  app.dragon.place(shot.dragon.position, shot.dragon.yaw, shot.dragon.pitch, shot.dragon.roll);
  app.simTime = shot.spec.simTime;
  app.post.grade.exposure = GRADE.exposure * shot.spec.exposure;
}

function resolveByName(app: App, name: string): ResolvedShot {
  if (!isShotName(name)) throw new Error(`未知のショット名: ${name}`);
  return resolveShot(name, app.index, app.dragon);
}

export async function runShot(app: App, name: string): Promise<void> {
  // r02-roster：?specimen= があれば、怪獣の標本を撮る（src/harness/specimenRunner.ts）
  const specimen = parseSpecimenParams(window.location.search);
  if (specimen) return runSpecimenShot(app, name, specimen);
  const started = performance.now();
  const shot = resolveByName(app, name);
  applyShot(app, shot);
  const scene = buildShotScene(app, shot);
  app.post.setAccumulate(true);
  await app.renderer.compileAsync(app.scene, app.camera);
  for (let i = 0; i < shot.spec.settleFrames; i++) {
    app.renderFrame(0);
    await nextFrame();
  }
  const { width, height } = app.size;
  window.__shotInfo = {
    calls: app.lastCalls,
    triangles: app.lastTriangles,
    name,
    quality: app.settings.quality,
    gpu: app.gpu,
    readyMs: Math.round(performance.now() - started),
    width,
    height,
    ...(scene ? { fx: scene.stage.fx.stats() } : {}),
  };
  window.__bench = (frames) => bench(app, frames);
  window.__shotReady = true;
}

/** 今の構図を frames コマ、描画のたびに次のコマを待って描き、コマの間隔を測る（垂直同期を外して開くこと）。 */
async function bench(app: App, frames: number): Promise<{ p50: number; p95: number; mean: number }> {
  app.post.setAccumulate(false);
  const times: number[] = [];
  let last = -1;
  await new Promise<void>((resolve) => {
    const tick = (now: number): void => {
      if (last >= 0) times.push(now - last);
      last = now;
      app.renderFrame(1 / 60);
      if (times.length < frames) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  const sorted = [...times].sort((a, b) => a - b);
  const pick = (q: number): number => Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] * 100) / 100;
  return { p50: pick(0.5), p95: pick(0.95), mean: Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) / 100 };
}

function setFilmFrame(app: App, shot: ResolvedShot, frame: number): void {
  const t = frame * FILM_STEP;
  app.simTime = shot.spec.simTime + t;
  app.dragon.setPose(animatedPose(shot.dragon.pose, shot.spec.film, t));
  const [dx, dz] = forwardOffset(shot.dragon.yaw, shot.spec.film.speed, t);
  const p = shot.dragon.position.clone();
  p.x += dx;
  p.z += dz;
  app.dragon.place(p, shot.dragon.yaw, shot.dragon.pitch, shot.dragon.roll);
}

/** ?film=pan：竜を隠し、カメラだけを一定の速さで横へ流す（窓のモアレと影の泳ぎを見る連番）。 */
async function runPanFilm(app: App, frames: number, externalDrive: boolean): Promise<void> {
  const P = PAN_FILM;
  const from = new Vector3(...P.from);
  const velocity = new Vector3(...P.velocity);
  const look = directionFromAngles(P.azimuthDeg, P.pitchDeg).multiplyScalar(400);
  const position = new Vector3();
  const place = (frame: number): void => {
    const t = frame * FILM_STEP;
    position.copy(from).addScaledVector(velocity, t);
    placeCamera(app.camera, position, position.clone().add(look), P.fov);
    app.cameraChanged();
    app.simTime = P.simTime + t;
  };
  app.dragon.root.visible = false;
  app.post.grade.exposure = GRADE.exposure * P.exposure;
  app.post.setAccumulate(false);
  place(0);
  await app.renderer.compileAsync(app.scene, app.camera);
  for (let i = 0; i < 20; i++) {
    app.renderFrame(FILM_STEP);
    await nextFrame();
  }
  let next = 0;
  const step = async (): Promise<number> => {
    if (next >= frames) return -1;
    const frame = next++;
    place(frame);
    app.renderFrame(FILM_STEP);
    await nextFrame();
    window.__filmFrame = frame;
    return frame;
  };
  window.__filmFrame = -1;
  window.__filmReady = true;
  if (externalDrive) {
    window.__filmStep = step;
    return;
  }
  while ((await step()) >= 0) {
    // 自動で最後のコマまで進める
  }
}

export async function runFilm(app: App, name: string, frames: number, externalDrive: boolean): Promise<void> {
  const specimen = parseSpecimenParams(window.location.search);
  if (specimen) return runSpecimenFilm(app, name, specimen, frames, externalDrive);
  if (name === 'pan') return runPanFilm(app, frames, externalDrive);
  // r03-fx：?film=collapse は breath と同じビルを崩す連番（カメラは引いた所に置き直す）。?stride=N で1コマに N 刻み進める
  const collapse = name === 'collapse';
  const stride = filmStride(collapse ? COLLAPSE_FILM.stride : 1);
  const shot = resolveByName(app, collapse ? 'breath' : name);
  applyShot(app, shot);
  const cam = collapse ? collapseCamera(app, shot) : null;
  if (cam) {
    placeCamera(app.camera, cam.position, cam.target, cam.fov);
    app.cameraChanged();
  }
  // 破壊の出てくる構図は、場面を作ってからコマごとに続きを進める（炎・煙・崩れの動きを連番で見る）
  const scene = collapse ? buildCollapseScene(app, shot) : buildShotScene(app, shot);
  app.post.setAccumulate(false);
  setFilmFrame(app, shot, 0);
  await app.renderer.compileAsync(app.scene, app.camera);
  for (let i = 0; i < 20; i++) {
    app.renderFrame(FILM_STEP);
    await nextFrame();
  }
  let next = 0;
  const step = async (): Promise<number> => {
    if (next >= frames) return -1;
    const frame = next++;
    setFilmFrame(app, shot, frame * stride);
    for (let k = 0; k < stride; k++) scene?.advance(FILM_STEP);
    app.renderFrame(FILM_STEP * stride);
    await nextFrame();
    window.__filmFrame = frame;
    // r03-fx：効果の数（破片の種類と大きさ、詳しい形で描いている崩れる建物の数）を連番の記録に残す
    if (scene) window.__filmFx = { ...scene.stage.fx.stats(), collapseDetail: app.cityView.collapse.count };
    return frame;
  };
  window.__filmFrame = -1;
  window.__filmReady = true;
  if (externalDrive) {
    window.__filmStep = step;
    return;
  }
  while ((await step()) >= 0) {
    // 自動で最後のコマまで進める（撮影ツールが無いとき）
  }
}

/** ?stride=N（r03-fx）：1コマで進める 1/60 秒の刻みの数（1〜12）。長い動きを90コマに収めるため。 */
function filmStride(fallback: number): number {
  const raw = new URLSearchParams(window.location.search).get('stride');
  const v = raw === null ? fallback : Number.parseInt(raw, 10);
  return Number.isFinite(v) ? Math.min(12, Math.max(1, v)) : fallback;
}
