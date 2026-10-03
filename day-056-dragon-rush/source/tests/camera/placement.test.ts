// OWNER: tests
// r05-camera：怪獣ごとのカメラの値の引き方と既定、照準の光線（fixedCamera）と追うカメラの一致。
// 照準＝画面の中央なので、追うカメラが落ち着いたとき、画面の中央の光線（カメラの位置から視線の向き）が照準の光線と同じ直線に乗ること。
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CameraClearance } from '../../src/camera/clearance';
import { FollowCamera, segmentDistance, spanDistance } from '../../src/camera/followCam';
import { lookUpScale, rightOf } from '../../src/camera/placement';
import { CITY_CONFIG } from '../../src/config/city';
import { DEFAULT_CAMERA_PROFILE, FOLLOW_CAMERA, cameraProfileOf, type CameraProfile } from '../../src/config/camera';
import { CREATURE_CONFIG, CREATURE_IDS } from '../../src/config/creatures';
import { EventBus } from '../../src/core/events';
import { createIntent } from '../../src/dragon/intent';
import { fixedCamera } from '../../src/gameplay/aim';
import { Game } from '../../src/gameplay/game';
import { directionOf, vec3, type Vec3 } from '../../src/gameplay/math';
import { generateCity } from '../../src/world/city';
import { CityIndex } from '../../src/world/query';

const city = generateCity(CITY_CONFIG);
const index = new CityIndex(city);
const groundAt = (): number => city.groundLevel;

/** r04 までの fixedCamera（書き換える前の式そのまま）。紅竜の照準が1桁も変わらないことの物差し */
function fixedCameraR04(body: Vec3, vel: Vec3 | null, groundY: number, distance: number, view: { yaw: number; pitch: number }): Vec3 {
  const C = FOLLOW_CAMERA;
  const d = directionOf(view.yaw, view.pitch);
  const dist = distance * lookUpScale(view.pitch);
  const r = rightOf(view.yaw);
  const vx = vel ? vel.x : 0;
  const vy = vel ? vel.y : 0;
  const vz = vel ? vel.z : 0;
  return {
    x: body.x + vx * C.lookAhead + r.x * C.shoulder - d.x * dist,
    y: Math.max(body.y + C.pivotHeight + vy * C.lookAhead * 0.2 - d.y * dist, groundY + C.minHeight),
    z: body.z + vz * C.lookAhead + r.z * C.shoulder - d.z * dist,
  };
}

/** 決まった乱数の列（テストを毎回同じにする） */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

describe('怪獣ごとのカメラの値の引き方と既定', () => {
  it('設定に無い値は既定（紅竜は全部既定＝r04 までの FOLLOW_CAMERA と同じ値）', () => {
    expect(CREATURE_CONFIG.kurenai.camera).toBeUndefined();
    const k = cameraProfileOf(CREATURE_CONFIG.kurenai.camera);
    expect(k).toEqual(DEFAULT_CAMERA_PROFILE);
    expect(k.pivotHeight).toBe(FOLLOW_CAMERA.pivotHeight);
    expect(k.shoulder).toBe(FOLLOW_CAMERA.shoulder);
    expect([k.distanceGround, k.distanceAir, k.distanceDive]).toEqual([FOLLOW_CAMERA.distanceGround, FOLLOW_CAMERA.distanceAir, FOLLOW_CAMERA.distanceDive]);
    expect([k.fovBase, k.fovRun, k.fovDive]).toEqual([FOLLOW_CAMERA.fovBase, FOLLOW_CAMERA.fovRun, FOLLOW_CAMERA.fovDive]);
    expect(k.lookDownDeg).toBe(0);
    expect(k.buildingLift).toBe(0);
  });

  it('焔角は肩越しを広げて寄せ、雷翼は遠め。書いた値だけ替わり、ほかは既定のまま', () => {
    const h = cameraProfileOf(CREATURE_CONFIG.homuratsuno.camera);
    const r = cameraProfileOf(CREATURE_CONFIG.raiyoku.camera);
    const d = DEFAULT_CAMERA_PROFILE;
    // r06-camera2：焔角は回転の中心を高く（22m）、肩越しを広く（30m）、紅竜より近く（70m）、見下ろしの足しは深く見下ろすと消える
    expect(h.pivotHeight).toBeGreaterThan(d.pivotHeight);
    expect(h.shoulder).toBeGreaterThan(3 * d.shoulder);
    expect(h.distanceGround).toBeLessThan(d.distanceGround);
    expect(h.lookDownDeg).toBeGreaterThan(0);
    expect(h.lookDownFadeToDeg).toBeLessThan(h.lookDownFadeFromDeg);
    expect(h.maxOrbitDeg).toBe(90);
    expect(r.distanceAir).toBeGreaterThan(d.distanceAir);
    expect(r.distanceGround).toBeGreaterThan(d.distanceGround);
    expect(r.buildingLift).toBeGreaterThan(0);
    // 雷翼は高さ・見下ろし・画角を書いていないので既定
    expect(r.pivotHeight).toBe(d.pivotHeight);
    expect(r.lookDownDeg).toBe(0);
    expect(r.fovBase).toBe(d.fovBase);
    for (const id of CREATURE_IDS) {
      const p = cameraProfileOf(CREATURE_CONFIG[id].camera);
      for (const v of Object.values(p)) expect(Number.isFinite(v)).toBe(true);
      expect(p.bodyLength).toBe(CREATURE_CONFIG[id].view.length);
    }
  });

  it('焔角の写る大きさは r05 の値の2倍以上（3〜4%の見込み）、体は照準の下の中央3分の1の左へ寄る', () => {
    // 体をおおよその箱（全長53m・幅14m・高さ15m、体の中心の上下）とみなし、立った姿勢（見下ろし −16°）で画面に写した外接矩形
    const r05: CameraProfile = { ...cameraProfileOf(CREATURE_CONFIG.homuratsuno.camera), pivotHeight: 22, shoulder: 8, distanceGround: 100, lookDownDeg: 8, maxOrbitDeg: 26, fovBase: 64, lookDownFadeFromDeg: -90, lookDownFadeToDeg: -90 };
    const now = cameraProfileOf(CREATURE_CONFIG.homuratsuno.camera);
    const body = vec3(0, 12.5, 0);
    const shot = (p: CameraProfile, pitchDeg: number): { area: number; cx: number; cy: number } => {
      const view = { yaw: 0, pitch: pitchDeg * (Math.PI / 180) };
      const pos = fixedCamera(body, null, -1000, p.distanceGround, view, vec3(), p);
      const cam = new PerspectiveCamera(p.fovBase, 16 / 9, 0.5, 32000);
      cam.position.set(pos.x, pos.y, pos.z);
      const d = directionOf(view.yaw, view.pitch);
      cam.lookAt(pos.x + d.x, pos.y + d.y, pos.z + d.z);
      cam.updateMatrixWorld(true);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (let k = 0; k < 8; k++) {
        const v = new Vector3(k & 1 ? 7 : -7, body.y + (k & 2 ? 7.5 : -7.5), k & 4 ? 26.5 : -26.5).project(cam);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
      const w = Math.min(1, x1) - Math.max(-1, x0);
      const h = Math.min(1, y1) - Math.max(-1, y0);
      return { area: (w * h) / 4, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    };
    const a = shot(r05, -16);
    const b = shot(now, -16);
    expect(b.area / a.area).toBeGreaterThan(2);
    // 照準の下の中央3分の1（NDC の x が −1/3〜1/3）より、体の中心が左
    expect(b.cx).toBeLessThan(-1 / 3);
    // 深く見下ろしても（−60°）体は画面の中ほどより下（r05 の値では上の端へ逃げた）
    expect(shot(now, -60).cy).toBeLessThan(0);
    expect(shot(r05, -60).cy).toBeGreaterThan(0.4);
  });

  it('遊びの本体は怪獣を替えるとカメラの値も替える', () => {
    const game = new Game(city, index);
    expect(game.cameraProfile).toEqual(DEFAULT_CAMERA_PROFILE);
    game.setCreature('homuratsuno');
    expect(game.cameraProfile).toEqual(cameraProfileOf(CREATURE_CONFIG.homuratsuno.camera));
    game.setCreature('kurenai');
    expect(game.cameraProfile).toEqual(DEFAULT_CAMERA_PROFILE);
  });
});

describe('照準の光線（fixedCamera）', () => {
  it('既定（紅竜）は r04 までの式と1桁も違わない（瓦礫の規則を渡さなければ）', () => {
    const rand = rng(7);
    for (let i = 0; i < 400; i++) {
      const body = vec3(-600 + rand() * 1200, rand() * 120, -600 + rand() * 1200);
      const vel = rand() < 0.3 ? null : vec3(rand() * 60 - 30, rand() * 40 - 20, rand() * 60 - 30);
      const view = { yaw: rand() * 6.3 - 3.15, pitch: (-62 + rand() * 90) * (Math.PI / 180) };
      const gy = rand() < 0.2 ? -2 : 0;
      const dist = [74, 96, 84][i % 3];
      const a = fixedCamera(body, vel, gy, dist, view);
      const b = fixedCameraR04(body, vel, gy, dist, view);
      expect(a.x).toBe(b.x);
      expect(a.y).toBe(b.y);
      expect(a.z).toBe(b.z);
    }
  });

  it('見下ろしの足しは、カメラを高く置くだけで、ずらす前と同じ回転の中心のまわり', () => {
    const body = vec3(0, 30, 0);
    const view = { yaw: 0.4, pitch: -8 * (Math.PI / 180) };
    const base: CameraProfile = { ...DEFAULT_CAMERA_PROFILE };
    const down: CameraProfile = { ...DEFAULT_CAMERA_PROFILE, lookDownDeg: 7 };
    const a = fixedCamera(body, null, -1000, 90, view, vec3(), base);
    const b = fixedCamera(body, null, -1000, 90, view, vec3(), down);
    expect(b.y).toBeGreaterThan(a.y + 8);
    // どちらも回転の中心から同じ距離
    const pivot = vec3(body.x + rightOf(view.yaw).x * base.shoulder, body.y + base.pivotHeight, body.z + rightOf(view.yaw).z * base.shoulder);
    const da = Math.hypot(a.x - pivot.x, a.y - pivot.y, a.z - pivot.z);
    const db = Math.hypot(b.x - pivot.x, b.y - pivot.y, b.z - pivot.z);
    expect(db).toBeCloseTo(da, 9);
  });
});

describe('カメラが高く回りすぎない上限（maxOrbitDeg）', () => {
  it('見下ろすほどカメラは上がるが、回転の中心より上限の角度を超えない（超えた分は視線だけが下がる）', () => {
    const p: CameraProfile = { ...DEFAULT_CAMERA_PROFILE, lookDownDeg: 8, maxOrbitDeg: 26, pivotHeight: 22 };
    const body = vec3(0, 12.5, 0);
    let last = -Infinity;
    for (let deg = 0; deg >= -60; deg -= 5) {
      const view = { yaw: 0.7, pitch: deg * (Math.PI / 180) };
      const cam = fixedCamera(body, null, -1000, 92, view, vec3(), p);
      const r = rightOf(view.yaw);
      const pivot = vec3(body.x + r.x * p.shoulder, body.y + p.pivotHeight, body.z + r.z * p.shoulder);
      const elev = (Math.atan2(cam.y - pivot.y, Math.hypot(cam.x - pivot.x, cam.z - pivot.z)) * 180) / Math.PI;
      expect(elev).toBeLessThanOrEqual(26 + 1e-9);
      expect(elev).toBeCloseTo(Math.min(-deg + 8, 26), 6);
      expect(cam.y).toBeGreaterThanOrEqual(last - 1e-9);
      last = cam.y;
    }
  });
});

/** 追うカメラを、動かない体で落ち着くまで回す。 */
function settle(profile: CameraProfile, intentInit: (it: ReturnType<typeof createIntent>) => void, view: { yaw: number; pitch: number }, clearance: CameraClearance): { cam: PerspectiveCamera; follow: FollowCamera } {
  const cam = new PerspectiveCamera(58, 16 / 9, 0.5, 32000);
  const n = city.buildings.length;
  const source = { bus: new EventBus(), clock: 0, cameraProfile: profile, cameraClearance: clearance, damage: { isStanding: (): boolean => true, tilt: new Float32Array(n), dirX: new Float32Array(n), dirZ: new Float32Array(n) } };
  const follow = new FollowCamera(cam, index, source);
  const intent = createIntent();
  intentInit(intent);
  for (let i = 0; i < 900; i++) follow.update(1 / 60, intent, view, []);
  return { cam, follow };
}

/** 点 p が、o から向き d への直線の上にあるか（直線からの距離 m）。 */
function offLine(p: Vector3, o: Vec3, d: Vec3): number {
  const v = new Vector3(p.x - o.x, p.y - o.y, p.z - o.z);
  return v.cross(new Vector3(d.x, d.y, d.z)).length();
}

describe('追うカメラと照準の光線の一致（画面の中央＝照準）', () => {
  const clearance = new CameraClearance(city.buildings, index, groundAt);
  for (const id of CREATURE_IDS) {
    it(`${id}：空の上で落ち着いたカメラは、照準の光線と同じ位置・同じ向き`, () => {
      const p = cameraProfileOf(CREATURE_CONFIG[id].camera);
      const view = { yaw: 1.2, pitch: -14 * (Math.PI / 180) };
      const body = vec3(-900, 160, -20);
      const { cam } = settle(p, (it) => {
        it.position = [body.x, body.y, body.z];
        it.grounded = false;
        it.mode = 'air';
        it.groundY = -6;
      }, view, clearance);
      const want = fixedCamera(body, null, -6, p.distanceAir, view, vec3(), p, clearance, true);
      expect(cam.position.distanceTo(new Vector3(want.x, want.y, want.z))).toBeLessThan(1e-3);
      const fwd = cam.getWorldDirection(new Vector3());
      const d = directionOf(view.yaw, view.pitch);
      expect(fwd.angleTo(new Vector3(d.x, d.y, d.z))).toBeLessThan(1e-6);
    });
  }

  it('焔角が地上の街の中にいても、画面の中央の光線は照準の光線と同じ直線（建物で寄せても視線の上を動くだけ）', () => {
    const p = cameraProfileOf(CREATURE_CONFIG.homuratsuno.camera);
    const ix = city.intersections[Math.floor(city.intersections.length / 2)];
    const x = city.roadLines[ix.nsLineId].pos;
    const z = city.roadLines[ix.ewLineId].pos;
    const body = vec3(x, city.groundLevel + CREATURE_CONFIG.homuratsuno.body.bodyHeight, z);
    for (const yawDeg of [0, 70, 160, 250]) {
      const view = { yaw: (yawDeg * Math.PI) / 180, pitch: -8 * (Math.PI / 180) };
      const { cam } = settle(p, (it) => {
        it.position = [body.x, body.y, body.z];
        it.grounded = true;
        it.mode = 'ground';
        it.groundY = city.groundLevel;
      }, view, clearance);
      const o = fixedCamera(body, null, city.groundLevel, p.distanceGround, view, vec3(), p, clearance, false);
      const d = directionOf(view.yaw, view.pitch);
      expect(offLine(cam.position, o, d)).toBeLessThan(1e-3);
      expect(cam.getWorldDirection(new Vector3()).angleTo(new Vector3(d.x, d.y, d.z))).toBeLessThan(1e-6);
    }
  });

  it('離陸の間は、翼の幅が画面に収まる距離より寄せない（紅竜の80m は画角58°・16:9 で約48m）', () => {
    expect(spanDistance(80, 58, 16 / 9)).toBeGreaterThan(45);
    expect(spanDistance(80, 58, 16 / 9)).toBeLessThan(52);
    expect(spanDistance(95, 58, 16 / 9)).toBeGreaterThan(spanDistance(80, 58, 16 / 9));
  });
});

describe('傾いた建物も網点の対象（当たりの形は立ったままなので別に調べる）', () => {
  it('線分どうしの距離', () => {
    expect(segmentDistance(vec3(0, 0, 0), vec3(10, 0, 0), vec3(5, 3, -5), vec3(5, 3, 5))).toBeCloseTo(3, 9);
    expect(segmentDistance(vec3(0, 0, 0), vec3(10, 0, 0), vec3(12, 0, 0), vec3(20, 0, 0))).toBeCloseTo(2, 9);
    expect(segmentDistance(vec3(0, 0, 0), vec3(0, 0, 0), vec3(0, 4, 0), vec3(0, 4, 0))).toBeCloseTo(4, 9);
  });

  it('視線へ倒れかかった高層は、立ったままの形では外れても、傾いた形で視線に掛かれば集める', () => {
    const tall = city.buildings.find((b) => b.height - b.masses[0].y0 > 80)!;
    const f = tall.footprint;
    const cx = (f.x0 + f.x1) / 2;
    const cz = (f.z0 + f.z1) / 2;
    const h = tall.height - tall.masses[0].y0;
    const n = city.buildings.length;
    const tilt = new Float32Array(n);
    const dirX = new Float32Array(n);
    const dirZ = new Float32Array(n);
    // 外形の東 40m を南北に通る視線（地面から高さ h×0.6）。立ったままの形には掛からない
    const lineX = f.x1 + 40;
    const y = tall.masses[0].y0 + h * 0.6;
    const cam = new PerspectiveCamera(58, 16 / 9, 0.5, 32000);
    const run = (): Set<number> => {
      const profile = DEFAULT_CAMERA_PROFILE;
      const clearance = new CameraClearance(city.buildings, index, groundAt);
      const source = { bus: new EventBus(), clock: 0, cameraProfile: profile, cameraClearance: clearance, damage: { isStanding: (): boolean => true, tilt, dirX, dirZ } };
      const follow = new FollowCamera(cam, index, source) as unknown as { occluders: Set<number>; addTilted(o: Vec3, body: Vec3, t: Vec3[]): void };
      follow.occluders.clear();
      const o = vec3(lineX, y, cz - 120);
      const body = vec3(lineX, y, cz + 120);
      follow.addTilted(o, body, [body]);
      return follow.occluders;
    };
    expect(run().has(tall.id)).toBe(false);
    // 東へ倒れかかる（傾き 0.6 rad）：屋上の中心は東へ h×sin(0.6) だけ動き、視線に掛かる
    tilt[tall.id] = 0.6;
    dirX[tall.id] = 1;
    dirZ[tall.id] = 0;
    expect(h * Math.sin(0.6) + (f.x1 - cx)).toBeGreaterThan(40);
    expect(run().has(tall.id)).toBe(true);
  });
});
