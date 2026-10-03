// OWNER: tests
// r06-camera2：カメラをビルの裏に置かない規則（camera/placement.ts の solveCamera）と、照準・網点の決まり。
// 見た目の採点 r05 の2位・体験の採点 r05 の TOP4・B2・B3：視線に建物が入ったら、まず画面の中央の線に沿って建物の怪獣の側まで寄せ
// （怪獣の大きさから決めた最短の距離まで）、出られなければ屋上を越えるまで上げ、残る分だけ網点。カメラが建物の箱の中なら必ず外へ。
// 照準は竜より手前で入る建物を飛ばして奥を見る（寄せたカメラ・網点の窓越しでも画面の中央と一致）。網点は怪獣より手前の建物だけ。
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CameraClearance } from '../../src/camera/clearance';
import { FollowCamera } from '../../src/camera/followCam';
import {
  emptySolve,
  insideBuilding,
  keepInFrameRise,
  lookUpScale,
  orbitDirection,
  placeFixedCamera,
  pullMinDistance,
  rightOf,
  shoulderFor,
  sightClear,
  sightPoint,
  solveCamera,
} from '../../src/camera/placement';
import { CITY_CONFIG } from '../../src/config/city';
import { CAMERA_PLACE as K, DEFAULT_CAMERA_PROFILE, FOLLOW_CAMERA as C, cameraProfileOf, type CameraProfile } from '../../src/config/camera';
import { CREATURE_CONFIG } from '../../src/config/creatures';
import { EventBus } from '../../src/core/events';
import { createIntent } from '../../src/dragon/intent';
import { castAim, raycastBeyond } from '../../src/gameplay/aim';
import { directionOf, vec3, type Vec3 } from '../../src/gameplay/math';
import { rayMass, raycastBuildings } from '../../src/gameplay/shapes';
import { generateCity } from '../../src/world/city';
import { CityIndex } from '../../src/world/query';
import type { Building } from '../../src/world/types';

const city = generateCity(CITY_CONFIG);
const index = new CityIndex(city);
const groundAt = (): number => city.groundLevel;
const clearance = new CameraClearance(city.buildings, index, groundAt);
const DEG = Math.PI / 180;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** 建物 b の外形の外、ある向きへ gap m 離れた地上の点（体の中心の高さ）。 */
function besideBuilding(b: Building, axis: number, gap: number, bodyHeight: number): Vec3 {
  const f = b.footprint;
  const cx = (f.x0 + f.x1) / 2;
  const cz = (f.z0 + f.z1) / 2;
  const y = city.groundLevel + bodyHeight;
  if (axis === 0) return vec3(f.x1 + gap, y, cz);
  if (axis === 1) return vec3(f.x0 - gap, y, cz);
  if (axis === 2) return vec3(cx, y, f.z1 + gap);
  return vec3(cx, y, f.z0 - gap);
}

interface Pose {
  p: CameraProfile;
  body: Vec3;
  view: { yaw: number; pitch: number };
  pivot: Vec3;
  want: number;
}

/** 建物の近くの地上に体を置き、向きをばらして、カメラの答えを集める。 */
function poses(p: CameraProfile, n: number, seed: number): Pose[] {
  const rand = rng(seed);
  const tall = city.buildings.filter((b) => b.height > 18);
  const out: Pose[] = [];
  for (let i = 0; i < n; i++) {
    const b = tall[Math.floor(rand() * tall.length)];
    const body = besideBuilding(b, Math.floor(rand() * 4), 4 + rand() * 50, 12.5);
    if (index.buildingAt(body.x, body.z)) continue;
    const view = { yaw: rand() * 2 * Math.PI, pitch: (-35 + rand() * 40) * DEG };
    const r = rightOf(view.yaw);
    const pivot = vec3(body.x + r.x * p.shoulder, body.y + p.pivotHeight, body.z + r.z * p.shoulder);
    out.push({ p, body, view, pivot, want: p.distanceGround * lookUpScale(view.pitch) });
  }
  return out;
}

/** 答えのカメラの位置（要 − 視線 × r ＋ 上 × rise）。 */
function cameraOf(s: { r: number; rise: number }, q: Pose): Vec3 {
  const d = directionOf(q.view.yaw, q.view.pitch);
  const o = orbitDirection(q.p, q.view);
  const ax = q.pivot.x - o.x * q.want + d.x * q.want;
  const ay = q.pivot.y - o.y * q.want + d.y * q.want;
  const az = q.pivot.z - o.z * q.want + d.z * q.want;
  return vec3(ax - d.x * s.r, ay - d.y * s.r + s.rise, az - d.z * s.r);
}

describe('ビルの裏に置かない：寄せる → 上げる → 網点、箱の中なら必ず外へ', () => {
  const profiles: [string, CameraProfile][] = [
    ['紅竜', DEFAULT_CAMERA_PROFILE],
    ['焔角', cameraProfileOf(CREATURE_CONFIG.homuratsuno.camera)],
  ];
  for (const [name, p] of profiles) {
    it(`${name}：視線が空いていれば何もしない。ふさがれたら、まず最短の距離までの間で、視線が空くいちばん遠い所へ寄せる`, () => {
      const counts: Record<string, number> = {};
      const minR = pullMinDistance(p, false);
      for (const q of poses(p, 260, name === '紅竜' ? 11 : 12)) {
        const s = solveCamera(p, q.pivot, q.body, city.groundLevel, q.want, q.view, clearance, false, emptySolve());
        counts[s.mode] = (counts[s.mode] ?? 0) + 1;
        const cam = cameraOf(s, q);
        const sight = sightPoint(p, q.body, vec3());
        if (s.mode === 'free') {
          expect(s.r).toBe(q.want);
          expect(sightClear(clearance, cam, sight, q.pivot)).toBe(true);
        }
        if (s.mode === 'pull') {
          expect(s.r).toBeLessThan(q.want);
          expect(s.r).toBeGreaterThanOrEqual(Math.min(q.want, minR) - 1e-9);
          expect(sightClear(clearance, cam, sight, q.pivot)).toBe(true);
          // 寄せる刻み1つぶん遠い所では、まだふさがれていた（いちばん遠い空いた所を選んだ）
          if (s.r + K.pullStep < q.want - 1e-6) {
            const farther = cameraOf({ r: s.r + K.pullStep, rise: s.rise }, q);
            expect(sightClear(clearance, farther, sight, q.pivot)).toBe(false);
          }
        }
        if (s.mode === 'lift' || s.mode === 'pullLift') {
          expect(s.liftB).toBeGreaterThan(0);
          expect(sightClear(clearance, cam, sight, q.pivot)).toBe(true);
          // 上げた分は、上限（要までの距離の liftShare 倍）を超えない
          expect(s.liftB).toBeLessThanOrEqual(q.want * K.liftShare + 1e-9);
        }
        // どの答えでも、カメラは立っている建物の箱の中に無い
        expect(insideBuilding(clearance, cam), `${name} ${s.mode}`).toBeNull();
      }
      expect(counts.free ?? 0).toBeGreaterThan(20);
      expect(counts.pull ?? 0).toBeGreaterThan(5);
    });
  }

  it('寄せきれないときだけ上げる（寄せられる所があれば上げない）。上げた視線は、上げなかった視線より建物を越える', () => {
    const p = DEFAULT_CAMERA_PROFILE;
    let lifted = 0;
    for (const q of poses(p, 400, 21)) {
      const s = solveCamera(p, q.pivot, q.body, city.groundLevel, q.want, q.view, clearance, false, emptySolve());
      if (s.mode !== 'lift') continue;
      lifted++;
      const minR = pullMinDistance(p, false);
      const sight = sightPoint(p, q.body, vec3());
      // 寄せの候補（決まった距離から最短まで）はどれも視線がふさがれていた
      for (let r = q.want - K.pullStep; r >= minR - 1e-6; r -= K.pullStep) {
        const c = cameraOf({ r, rise: Math.max(0, city.groundLevel + C.minHeight - cameraOf({ r, rise: 0 }, q).y) }, q);
        expect(sightClear(clearance, c, sight, q.pivot)).toBe(false);
      }
      expect(sightClear(clearance, cameraOf(s, q), sight, q.pivot)).toBe(true);
    }
    expect(lifted).toBeGreaterThan(0);
  });

  it('上げても体の点が画面の縦の keepInFrame 倍より下へ出ない上限', () => {
    const d = directionOf(0.3, -10 * DEG);
    const s = vec3(0, 20, 0);
    const c = vec3(-d.x * 74, 20 - d.y * 74 + 10, -d.z * 74);
    const h = keepInFrameRise(c, s, d, 58);
    expect(h).toBeGreaterThan(0);
    // ちょうど h 上げたとき、体の点は縦に (画角の半分 × keepInFrame) の角度だけ中央より下
    const v = new Vector3(s.x - c.x, s.y - (c.y + h), s.z - c.z);
    const fwd = new Vector3(d.x, d.y, d.z);
    const up = new Vector3(0, 1, 0).sub(fwd.clone().multiplyScalar(d.y)).normalize();
    const ang = Math.atan2(v.dot(up), v.dot(fwd));
    expect(ang).toBeCloseTo(-29 * K.keepInFrame * DEG, 6);
  });

  it('カメラが建物の箱の中に入る向き（建物の脇で、軌道のカメラが壁の中）でも、必ず外へ押し出す', () => {
    const p = DEFAULT_CAMERA_PROFILE;
    let inside = 0;
    for (const q of poses(p, 400, 31)) {
      const raw = cameraOf({ r: q.want, rise: 0 }, q);
      if (!insideBuilding(clearance, raw)) continue;
      inside++;
      const s = solveCamera(p, q.pivot, q.body, city.groundLevel, q.want, q.view, clearance, false, emptySolve());
      expect(insideBuilding(clearance, cameraOf(s, q))).toBeNull();
    }
    expect(inside).toBeGreaterThan(5);
  });

  it('照準の光線（fixedCamera）は、寄せても上げても画面の中央と同じ直線の上（上げた分だけ一緒に上がる）', () => {
    const p = DEFAULT_CAMERA_PROFILE;
    for (const q of poses(p, 120, 41)) {
      const solve = emptySolve();
      const o = placeFixedCamera(p, q.body, null, city.groundLevel, p.distanceGround, q.view, vec3(), clearance, false, solve);
      const cam = cameraOf(solve, q);
      const d = directionOf(q.view.yaw, q.view.pitch);
      const v = new Vector3(cam.x - o.x, cam.y - o.y, cam.z - o.z);
      expect(v.cross(new Vector3(d.x, d.y, d.z)).length()).toBeLessThan(1e-6);
    }
  });
});

describe('照準：竜より手前で入る建物は飛ばし、奥の最初の建物を狙う（体験の採点 B2）', () => {
  it('手前の建物を飛ばした答えは、minT より先で入るいちばん近い建物（すべての建物と比べる）', () => {
    const rand = rng(51);
    let checked = 0;
    for (let i = 0; i < 300 && checked < 60; i++) {
      const o = vec3(-700 + rand() * 1200, 20 + rand() * 60, -700 + rand() * 1200);
      const d = directionOf(rand() * 2 * Math.PI, (-25 + rand() * 25) * DEG);
      const first = raycastBuildings(index, o, d, 700, () => true);
      if (!first) continue;
      const minT = first.t + 5;
      const hit = raycastBeyond(index, o, d, minT, 700, () => true);
      let best = Infinity;
      for (const b of city.buildings) {
        let entry = Infinity;
        for (const m of b.masses) {
          const t = rayMass(m, o, d, 700);
          if (t >= 0) entry = Math.min(entry, t);
        }
        if (entry > minT && entry < best) best = entry;
      }
      if (best === Infinity) expect(hit).toBeNull();
      else expect(hit!.t).toBeCloseTo(best, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('遊びの照準（throughNear）は奥の建物、始まりの向きの探し方（省略）は今までどおり「建物なし」', () => {
    const rand = rng(61);
    let found = 0;
    for (let i = 0; i < 400 && found < 10; i++) {
      const o = vec3(-600 + rand() * 1000, 25 + rand() * 30, -600 + rand() * 1000);
      const d = directionOf(rand() * 2 * Math.PI, -6 * DEG);
      const first = raycastBuildings(index, o, d, 700, () => true);
      if (!first || first.t > 60) continue;
      const minT = first.t + 10;
      const through = castAim(index, o, d, city.groundLevel, minT, () => true, 700, true);
      const old = castAim(index, o, d, city.groundLevel, minT, () => true);
      expect(old.building).toBeNull();
      if (through.building) {
        expect(through.building.id).not.toBe(first.building.id);
        found++;
      }
    }
    expect(found).toBeGreaterThan(3);
  });
});

describe('網点は怪獣より手前の建物だけ（体験の採点 B3：奥の的のビルに窓を開けない）', () => {
  /** 追うカメラを、動かない体で落ち着くまで回して、網点の対象を返す。 */
  function occludersFor(p: CameraProfile, body: Vec3, yaw: number, view: { yaw: number; pitch: number }): Set<number> {
    const cam = new PerspectiveCamera(58, 16 / 9, 0.5, 32000);
    const n = city.buildings.length;
    const source = { bus: new EventBus(), clock: 0, cameraProfile: p, cameraClearance: clearance, damage: { isStanding: (): boolean => true, tilt: new Float32Array(n), dirX: new Float32Array(n), dirZ: new Float32Array(n) } };
    const follow = new FollowCamera(cam, index, source);
    const intent = createIntent();
    intent.position = [body.x, body.y, body.z];
    intent.yaw = yaw;
    intent.grounded = true;
    intent.mode = 'ground';
    intent.groundY = city.groundLevel;
    for (let i = 0; i < 240; i++) follow.update(1 / 60, intent, view, []);
    return follow.occluders;
  }

  it('頭の先が的のビルに入っていても、体の中心より奥のビルは網点の対象にしない', () => {
    const p = DEFAULT_CAMERA_PROFILE;
    let tested = 0;
    for (const t of city.buildings.filter((b) => b.height > 40).slice(0, 40)) {
      // 的のビルの面の 12m 手前に、ビルの方を向いて立つ（頭の目安の点は体の 20m 前＝ビルの中）。カメラはビルと反対側（視線もビルへ）
      for (const axis of [0, 1, 2, 3]) {
        const body = besideBuilding(t, axis, 12, 12.5);
        if (index.buildingAt(body.x, body.z)) continue;
        const f = t.footprint;
        const tx = (f.x0 + f.x1) / 2 - body.x;
        const tz = (f.z0 + f.z1) / 2 - body.z;
        const yaw = Math.atan2(tx, tz);
        const occ = occludersFor(p, body, yaw, { yaw, pitch: -8 * DEG });
        expect(occ.has(t.id)).toBe(false);
        tested++;
      }
      if (tested > 20) break;
    }
    expect(tested).toBeGreaterThan(10);
  });
});

describe('肩越しのずれ：回転の中心を右の建物に入れない（焔角だけ縮める）', () => {
  it('焔角は、右の建物の面から shoulderMargin 手前まで縮める（下限 shoulderMin）。紅竜・雷翼は縮めない', () => {
    const h = cameraProfileOf(CREATURE_CONFIG.homuratsuno.camera);
    expect(h.shoulderMin).toBeLessThan(h.shoulder);
    expect(cameraProfileOf(CREATURE_CONFIG.raiyoku.camera).shoulderMin).toBe(cameraProfileOf(CREATURE_CONFIG.raiyoku.camera).shoulder);
    expect(DEFAULT_CAMERA_PROFILE.shoulderMin).toBe(DEFAULT_CAMERA_PROFILE.shoulder);
    let shrunk = 0;
    const rand = rng(71);
    const tall = city.buildings.filter((b) => b.height > 45);
    for (let i = 0; i < 200; i++) {
      const b = tall[Math.floor(rand() * tall.length)];
      // 建物の西の面の 12m 西に立ち、北を向く（視点の右＝東＝建物の側）
      const body = vec3(b.footprint.x0 - 12, city.groundLevel + 12.5, (b.footprint.z0 + b.footprint.z1) / 2);
      if (index.buildingAt(body.x, body.z)) continue;
      const view = { yaw: Math.PI, pitch: -10 * DEG };
      const r = rightOf(view.yaw);
      expect(r.x).toBeCloseTo(1, 9);
      const s = shoulderFor(h, body, view, clearance);
      expect(s).toBeGreaterThanOrEqual(h.shoulderMin - 1e-9);
      expect(s).toBeLessThanOrEqual(h.shoulder + 1e-9);
      if (s < h.shoulder) {
        shrunk++;
        // 回転の中心（肩越し s）は、同じ高さで右に引いた光線が当たる建物の面から shoulderMargin 以上離れている（下限で止まったときを除く）
        const base = vec3(body.x, body.y + h.pivotHeight, body.z);
        const hit = raycastBuildings(index, base, vec3(1, 0, 0), h.shoulder + 2 * K.shoulderMargin, () => true);
        expect(hit).not.toBeNull();
        if (s > h.shoulderMin) expect(hit!.t - s).toBeGreaterThanOrEqual(K.shoulderMargin - 1e-6);
      }
      expect(shoulderFor(DEFAULT_CAMERA_PROFILE, body, view, clearance)).toBe(DEFAULT_CAMERA_PROFILE.shoulder);
    }
    expect(shrunk).toBeGreaterThan(10);
  });
});
