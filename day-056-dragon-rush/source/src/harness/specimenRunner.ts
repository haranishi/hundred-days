// OWNER: harness
// ?specimen=：怪獣の標本を街に置き、クリップの1コマ（?shot=）かコマ撮り（?film=）で撮る（r02-roster）。遊びの側には触らない。
// 構図は既存の撮影と同じ目印：street は大通りの交差点を目の高さから、closeup は頭の横の斜め前（頭の長さに合わせて離す）、
// overview は空中のクリップなら既存の overview と同じ空の位置、地上のクリップなら交差点を斜め上から見下ろす。
// profile は湾岸の遊歩道に北向きで置き、湾の上から横顔を撮る（動きの連番と、3体を並べる lineup の構図）。
// window.__specimen に、標本のクリップ・時刻・足の甲の位置を書く。コマ撮りでは window.__specimenShow(clip, t) で
// クリップと時刻を切り替えて1コマ描ける（tools/blender/specimens.mjs が連番の一覧と足の滑りの測定に使う）。
import { Color, InstancedMesh, MeshBasicMaterial, SkinnedMesh, Vector3 } from 'three';
import type { App } from '../app';
import { directionFromAngles, placeCamera } from '../camera/rig';
import { GRADE } from '../config/render';
import { SHOTS, SHOT_LAYOUT } from '../config/shots';
import { SPECIMEN_LAYOUT } from '../config/specimens';
import { publicBase } from '../core/publicBase';
import { CREATURES, type CreatureId } from '../creatures/roster';
import { Specimen, clipTime } from '../creatures/specimen';
import { isSpecimenShot, showcaseTime, type SpecimenParams, type SpecimenShot } from '../creatures/specimenParams';
import './globals';

export interface SpecimenInfo {
  target: string;
  shot: string;
  frame: number;
  specimens: {
    id: CreatureId;
    clip: string;
    time: number;
    position: [number, number, number];
    feet: { name: string; x: number; y: number; z: number; sole: number }[];
  }[];
}

declare global {
  interface Window {
    __specimen?: SpecimenInfo;
    /** コマ撮り（drive=ext）で、1体目の標本のクリップと時刻を切り替えて1コマ描く */
    __specimenShow?: (clip: string, t: number) => Promise<SpecimenInfo>;
  }
}

const ROAD_Y = 0;

/** 構図の数値（r03-roster で src/config/specimens.ts へ移した）。 */
const LAYOUT = SPECIMEN_LAYOUT;

const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

interface Placed {
  specimen: Specimen;
  clip: string;
  /** コマ撮りの 0 コマ目の時刻（秒） */
  t0: number;
  base: Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  /** 歩き・走りのコマ撮りで、足が地面に留まる速さ（m/s、歩幅 ÷ 周期）で前へ進める */
  speed: number;
  /** 空中のクリップは地面に置かず、高さ altitude（m）に浮かべる */
  air: boolean;
  altitude: number;
}

interface SpecimenScene {
  placed: Placed[];
  shot: SpecimenShot;
  simTime: number;
  settleFrames: number;
  /** 空中のクリップを浮かべる高さ（構図ごと） */
  airAltitude: number;
  /** コマ撮りの横顔で、標本を置き直すたびにカメラを付いて行かせる */
  follow?: () => void;
}

/** 遊歩道の中の、桟橋に遮られない場所：桟橋（湾へ突き出した街区）の南北の隙間でいちばん広い所の中ほど。 */
function clearShore(app: App): Vector3 {
  const pr = app.city.coast.promenade;
  const piers = app.city.blocks.filter((b) => b.isPier).map((b) => [b.curb.z0, b.curb.z1] as const).sort((a, b) => a[0] - b[0]);
  let best = { width: -1, z: (pr.z0 + pr.z1) / 2 };
  let from = pr.z0 + 50;
  for (const [z0, z1] of [...piers, [pr.z1 - 50, pr.z1 - 50] as const]) {
    if (z0 - from > best.width) best = { width: z0 - from, z: (from + z0) / 2 };
    from = Math.max(from, z1);
  }
  return new Vector3((pr.x0 + pr.x1) / 2, ROAD_Y, best.z);
}

function avenueCrossing(app: App): Vector3 {
  const ix = app.index.intersectionNear(-150, 0, (_ix, ns, ew) => ns.cls === 'avenue' && ew.cls === 'avenue');
  const lines = app.city.roadLines;
  return new Vector3(lines[ix.nsLineId].pos, ROAD_Y, lines[ix.ewLineId].pos);
}

/** 局所の点（+x 左・+y 上・+z 前）をワールドへ。 */
function localToWorld(origin: Vector3, yawDeg: number, local: [number, number, number]): Vector3 {
  const a = (yawDeg * Math.PI) / 180;
  const [x, y, z] = local;
  return new Vector3(origin.x + x * Math.cos(a) + z * Math.sin(a), origin.y + y, origin.z - x * Math.sin(a) + z * Math.cos(a));
}

/** 喉の光：息のクリップでは溜め（最初の 0.3 秒）から光り、吐いている間は光ったまま。 */
function throatFor(clip: string, t: number): number {
  return clip === 'breath' ? Math.min(1, t / 0.3) : 0;
}

/**
 * 標本をクリップの時刻 t の姿勢にして置く。地上のクリップは、休みの姿勢の足の裏が道の高さに来る高さで固定する
 * （クリップの中の跳び上がり・沈み込み・脚の畳みがそのまま見える。接地している足は IK でこの高さに置いてある）。
 * 空中のクリップは高さ p.altitude に浮かべる。
 */
function stand(p: Placed, t: number, app: App): void {
  const time = p.specimen.pose(p.clip, t);
  const a = (p.yaw * Math.PI) / 180;
  const at = p.base.clone().add(new Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(p.speed * (t - p.t0)));
  at.y = p.air ? p.altitude : ROAD_Y - p.specimen.meta.ground;
  p.specimen.place(at, p.yaw, p.pitch, p.roll, ROAD_Y);
  p.specimen.setGlow(app.simTime, throatFor(p.clip, time));
}

/** クリップを切り替える：空中かどうか・前へ進む速さ（歩き・走りのコマ撮りだけ）を決め直す。 */
function useClip(p: Placed, clip: string, t0: number, film: boolean, airAltitude: number): void {
  const spec = p.specimen.spec;
  if (!p.specimen.hasClip(clip)) throw new Error(`${spec.name}にクリップ ${clip} が無い（${Object.keys(p.specimen.meta.clips).join('・')}）`);
  const c = p.specimen.meta.clips[clip];
  p.clip = clip;
  p.t0 = t0;
  p.air = spec.airClips.includes(clip);
  p.altitude = airAltitude;
  p.speed = film && c.stride ? c.stride / c.duration : 0;
}

async function loadSpecimens(app: App, ids: CreatureId[]): Promise<Specimen[]> {
  const out = await Promise.all(ids.map((id) => Specimen.load(CREATURES[id], app.kit, publicBase)));
  for (const s of out) app.scene.add(s.root);
  return out;
}

function setCamera(app: App, position: Vector3, target: Vector3, fov: number, exposure: number): void {
  placeCamera(app.camera, position, target, fov);
  app.cameraChanged();
  app.post.grade.exposure = GRADE.exposure * exposure;
}

function placed(specimen: Specimen, base: Vector3, yaw: number): Placed {
  return { specimen, clip: 'idle', t0: 0, base, yaw, pitch: 0, roll: 0, speed: 0, air: false, altitude: 0 };
}

async function buildScene(app: App, shotName: string, params: SpecimenParams, film: boolean): Promise<SpecimenScene> {
  if (!isSpecimenShot(shotName)) throw new Error(`標本の構図は street・closeup・overview・profile のどれか（${shotName}）`);
  const shot: SpecimenShot = params.target === 'lineup' ? 'profile' : shotName;
  app.dragon.root.visible = false;
  app.simTime = SHOTS.street.simTime;
  const settleFrames = SHOTS.street.settleFrames;
  const shore = clearShore(app);
  const P = LAYOUT.profile;
  if (params.target === 'lineup') {
    const L = LAYOUT.lineup;
    const specimens = await loadSpecimens(app, L.order);
    const list = specimens.map((s, i) => placed(s, new Vector3(shore.x, 0, shore.z + (1 - i) * L.spacing), P.headingDeg));
    for (const p of list) useClip(p, 'idle', showcaseTime(p.specimen.spec.id, 'idle'), film, P.airAltitude);
    setCamera(app, new Vector3(shore.x - L.back, L.up, shore.z), new Vector3(shore.x, L.lookUp, shore.z), L.fov, P.exposure);
    return { placed: list, shot, simTime: app.simTime, settleFrames, airAltitude: P.airAltitude };
  }
  const id = params.target;
  const [specimen] = await loadSpecimens(app, [id]);
  const crossing = avenueCrossing(app);
  const p = placed(specimen, crossing.clone(), LAYOUT.street.headingDeg);
  const t0 = params.time ?? showcaseTime(id, params.clip);
  let airAltitude: number = LAYOUT.street.airAltitude;
  useClip(p, params.clip, t0, film, airAltitude);
  if (shot === 'profile') {
    // 大きさに合わせて離す（紅竜の全長 60m を基準）
    const s = Math.max(0.8, specimen.spec.length / 60);
    p.base = shore.clone();
    p.yaw = P.headingDeg;
    airAltitude = P.airAltitude;
    p.altitude = airAltitude;
    if (film) {
      const F = LAYOUT.filmProfile;
      app.cityView.props.group.visible = false;
      const follow = (): void => {
        const at = specimen.root.position;
        const lookY = p.air ? at.y : F.lookUp * s;
        setCamera(app, new Vector3(at.x - F.back * s, lookY - (F.lookUp - F.up) * s, at.z), new Vector3(at.x, lookY, at.z), F.fov, P.exposure);
      };
      stand(p, t0, app);
      follow();
      return { placed: [p], shot, simTime: app.simTime, settleFrames, airAltitude, follow };
    }
    setCamera(app, new Vector3(shore.x - P.back * s, P.up, shore.z), new Vector3(shore.x, P.lookUp * s + (p.air ? airAltitude * 0.8 : 0), shore.z), P.fov, P.exposure);
  } else if (shot === 'overview' && p.air) {
    const L = SHOT_LAYOUT.overview;
    p.base = new Vector3(L.dragon.at[0], 0, L.dragon.at[2]);
    p.yaw = L.dragon.headingDeg;
    p.pitch = L.dragon.pitchDeg;
    p.roll = L.dragon.rollDeg;
    airAltitude = L.dragon.at[1];
    p.altitude = airAltitude;
    const from = new Vector3(...L.camera.from);
    setCamera(app, from, from.clone().add(directionFromAngles(L.camera.azimuthDeg, L.camera.pitchDeg).multiplyScalar(500)), SHOTS.overview.fov, SHOTS.overview.exposure);
  } else if (shot === 'overview') {
    const L = LAYOUT.overviewGround;
    p.yaw = L.headingDeg;
    setCamera(app, crossing.clone().add(new Vector3(...L.camera)), crossing.clone().add(new Vector3(...L.look)), L.fov, L.exposure);
  } else if (shot === 'closeup') {
    const L = LAYOUT.closeup;
    p.yaw = L.headingDeg;
    airAltitude = L.airAltitude;
    p.altitude = airAltitude;
    stand(p, t0, app);
    const m = specimen.measure();
    const k = m.headLength / L.refHeadLength;
    const head = m.headBase.clone().addScaledVector(m.headForward, L.lookForward * k);
    const origin = specimen.root.position;
    const [lx, ly, lz] = L.fromHeadLocal;
    setCamera(app, localToWorld(origin, p.yaw, [head.x + lx * k, head.y + ly * k, head.z + lz * k]), localToWorld(origin, p.yaw, head.toArray() as [number, number, number]), SHOTS.closeup.fov, SHOTS.closeup.exposure);
  } else {
    const L = SHOT_LAYOUT.street;
    const target = crossing.clone().add(new Vector3(...L.camera.lookOffset));
    if (p.air) target.y = airAltitude * 0.8;
    setCamera(app, crossing.clone().add(new Vector3(...L.camera.offset)), target, SHOTS.street.fov, SHOTS.street.exposure);
  }
  return { placed: [p], shot, simTime: app.simTime, settleFrames, airAltitude };
}

function info(scene: SpecimenScene, params: SpecimenParams, frame: number, times: number[]): SpecimenInfo {
  const r = (v: number): number => Math.round(v * 1e3) / 1e3;
  return {
    target: params.target,
    shot: scene.shot,
    frame,
    specimens: scene.placed.map((p, i) => ({
      id: p.specimen.spec.id,
      clip: p.clip,
      time: Math.round(clipTime(p.specimen.meta, p.clip, times[i]) * 1e4) / 1e4,
      position: p.specimen.root.position.toArray().map(r) as [number, number, number],
      feet: p.specimen.footPositions().map((f) => ({ ...f, x: r(f.x), y: r(f.y), z: r(f.z) })),
    })),
  };
}

/** コマ frame の姿勢と置き場所（時刻は t0 + frame × step）。 */
function setFrame(app: App, scene: SpecimenScene, params: SpecimenParams, frame: number): number[] {
  app.simTime = scene.simTime + frame * params.step;
  const times = scene.placed.map((p) => {
    const t = p.t0 + frame * params.step;
    stand(p, t, app);
    return t;
  });
  scene.follow?.();
  return times;
}

/**
 * 影絵（?matte=1、r03-roster）：街・空・水・接地の影を消し、怪獣を白一色で黒の上に描く。札の影絵（public/assets/ui/card-*.png）の元。
 * tools/silhouettes.mjs がこの絵の明るさを型抜きの濃さにする。
 */
function applyMatte(app: App, scene: SpecimenScene): void {
  const keep = new Set(scene.placed.map((p) => p.specimen.root));
  for (const o of app.scene.children) if (!keep.has(o as never) && o !== app.camera) o.visible = false;
  const white = new MeshBasicMaterial({ color: new Color(1, 1, 1), fog: false });
  for (const p of scene.placed) {
    p.specimen.root.traverse((o) => {
      if ((o as SkinnedMesh).isSkinnedMesh) (o as SkinnedMesh).material = white;
      else if ((o as InstancedMesh).isInstancedMesh) o.visible = false;
    });
  }
  app.scene.environment = null;
}

export async function runSpecimenShot(app: App, shotName: string, params: SpecimenParams): Promise<void> {
  const started = performance.now();
  const scene = await buildScene(app, shotName, params, false);
  if (params.matte) applyMatte(app, scene);
  const times = setFrame(app, scene, params, 0);
  app.post.setAccumulate(true);
  await app.renderer.compileAsync(app.scene, app.camera);
  for (let i = 0; i < scene.settleFrames; i++) {
    app.renderFrame(0);
    await nextFrame();
  }
  const { width, height } = app.size;
  window.__specimen = info(scene, params, 0, times);
  window.__shotInfo = {
    calls: app.lastCalls,
    triangles: app.lastTriangles,
    name: `specimen-${params.target}-${params.clip}-${scene.shot}`,
    quality: app.settings.quality,
    gpu: app.gpu,
    readyMs: Math.round(performance.now() - started),
    width,
    height,
  };
  window.__shotReady = true;
}

export async function runSpecimenFilm(app: App, shotName: string, params: SpecimenParams, frames: number, externalDrive: boolean): Promise<void> {
  const scene = await buildScene(app, shotName, params, true);
  app.post.setAccumulate(false);
  setFrame(app, scene, params, 0);
  await app.renderer.compileAsync(app.scene, app.camera);
  for (let i = 0; i < 20; i++) {
    app.renderFrame(params.step);
    await nextFrame();
  }
  let next = 0;
  const step = async (): Promise<number> => {
    if (next >= frames) return -1;
    const frame = next++;
    const times = setFrame(app, scene, params, frame);
    app.renderFrame(params.step);
    await nextFrame();
    window.__specimen = info(scene, params, frame, times);
    window.__filmFrame = frame;
    return frame;
  };
  // 1体目のクリップと時刻を直接決めて1コマ描く（撮影の道具が、1回の読み込みで全部のクリップを撮るため）
  window.__specimenShow = async (clip: string, t: number): Promise<SpecimenInfo> => {
    const p = scene.placed[0];
    if (p.clip !== clip) useClip(p, clip, 0, true, scene.airAltitude);
    app.simTime = scene.simTime + t;
    stand(p, t, app);
    scene.follow?.();
    app.renderFrame(params.step);
    await nextFrame();
    return info(scene, params, -1, [t]);
  };
  window.__filmFrame = -1;
  window.__filmReady = true;
  if (externalDrive) {
    window.__filmStep = step;
    return;
  }
  while ((await step()) >= 0) {
    // 自動で最後のコマまで進める（撮影の道具が無いとき）
  }
}
