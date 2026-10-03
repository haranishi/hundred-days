// OWNER: gameplay
// 狙いの規則（純データ・three を読まない）。照準＝画面の中央は「決まった位置のカメラ」から視線の向きへ伸ばした光線で決める。
// 追うカメラ（camera/followCam.ts）も fixedCamera と同じ規則（camera/placement.ts）で置くので、ばねで遅れる分を除けば照準と画面の中央が一致する。
// 始まりの向き（spawnView）も同じ光線で、照準が「炎の届く高層ビル」に乗る向きを探す。
// r05-camera：カメラの値は怪獣ごと（config/creatures の camera。無ければ既定＝紅竜）。瓦礫の山の上へ逃がす規則（camera/clearance.ts）も
// 追うカメラと同じものを使う。
import type { CameraClearance } from '../camera/clearance';
import { lookUpScale, placeFixedCamera, rightOf, type CameraSolve } from '../camera/placement';
import { BREATH } from '../config/attacks';
import { DEFAULT_CAMERA_PROFILE, FOLLOW_CAMERA as C, type CameraProfile } from '../config/camera';
import { LOOK } from '../config/controls';
import { LOCOMOTION as L } from '../config/locomotion';
import type { CityIndex } from '../world/query';
import type { Building } from '../world/types';
import { DEG, directionOf, localToWorld, vec3, type Vec3 } from './math';
import { rayGround, rayMass, raycastBuildings } from './shapes';

export interface View {
  yaw: number;
  pitch: number;
}

export { lookUpScale, rightOf };

/**
 * 決まった位置のカメラ：回転の中心（体の中心の上 pivotHeight・速さの向きへ lookAhead 秒先・視点の右 shoulder）から、
 * 視線（より lookDownDeg だけ下の向き）の逆へ距離 distance（見上げるほど少し寄せる）。地面から minHeight より下へは下げず、高さだけを止める
 * （視線の向きはそのまま）。r05-camera：clearance を渡すと、瓦礫の山の上面より下げず、視線が山を越えるまで上げる（flying なら profile の
 * buildingLift までビルも越える）。追うカメラ（camera/followCam.ts）は、この回転の中心をばねで追う。profile を省くと既定（紅竜）。
 */
export function fixedCamera(
  body: Vec3,
  vel: Vec3 | null,
  groundY: number,
  distance: number,
  view: View,
  out: Vec3 = vec3(),
  profile: CameraProfile = DEFAULT_CAMERA_PROFILE,
  clearance: CameraClearance | null = null,
  flying = false,
  solve?: CameraSolve,
  shoulder?: number,
): Vec3 {
  return placeFixedCamera(profile, body, vel, groundY, distance, view, out, clearance, flying, solve, shoulder);
}

export interface AimHit {
  /** 狙いの点 */
  point: Vec3;
  /** 当たった建物（無ければ null。地面か空） */
  building: Building | null;
  /** 地面に当たったか */
  ground: boolean;
}

/**
 * r06-camera2：光線 o → d が、minT より先で初めて入る立っている建物（入る点が minT より手前の建物は飛ばす）。無ければ null。
 * 体験の採点 r05 の B2：カメラが壁に押されて寄せられたり、網点の窓越しに見ているとき、画面の中央にはその壁の奥の建物が写るのに、
 * 照準は手前の壁に当たって「建物なし」の暗い表示になった（48向きのうち紅竜17・雷翼6・焔角3）。竜より手前の建物は追うカメラが
 * 寄せて越えるか網点で透かす（camera/followCam.ts）ので、照準もそれを飛ばして奥を見る。
 */
export function raycastBeyond(index: CityIndex, o: Vec3, d: Vec3, minT: number, maxT: number, isStanding: (b: Building) => boolean): { building: Building; t: number } | null {
  const seen = new Set<number>();
  let best: { building: Building; t: number } | null = null;
  const step = 30;
  for (let s = 0; s <= maxT + step; s += step) {
    if (best && s > best.t + step) break;
    const t = Math.min(s, maxT);
    for (const b of index.buildingsNear(o.x + d.x * t, o.z + d.z * t, step)) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      if (!isStanding(b)) continue;
      let entry = Infinity;
      for (const m of b.masses) {
        const h = rayMass(m, o, d, maxT);
        if (h >= 0 && h < entry) entry = h;
      }
      if (entry <= minT || entry === Infinity) continue;
      if (!best || entry < best.t) best = { building: b, t: entry };
    }
  }
  return best;
}

/**
 * カメラの位置 o から視線 d を伸ばし、minT より先で最初に当たる建物か地面。どちらにも当たらなければ maxT の点。
 * throughNear（r06-camera2、遊びの照準）：minT より手前で入る建物は飛ばして奥を探す（画面の中央に写る物と同じ）。
 * 省くと今までどおり、光線の最初の建物が minT より手前なら「建物なし」（始まりの向きの探し方 spawnView は、手前の壁がある向きを選ばない）。
 */
export function castAim(index: CityIndex, o: Vec3, d: Vec3, groundY: number, minT: number, isStanding: (b: Building) => boolean, maxT = 700, throughNear = false): AimHit {
  const hit = throughNear ? raycastBeyond(index, o, d, minT, maxT, isStanding) : raycastBuildings(index, o, d, maxT, isStanding);
  const ground = rayGround(o, d, groundY, maxT);
  let t = maxT;
  let building: Building | null = null;
  let onGround = false;
  if (hit && hit.t > minT) {
    t = hit.t;
    building = hit.building;
  }
  if (ground > minT && ground < t) {
    t = ground;
    building = null;
    onGround = true;
  }
  return { point: vec3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t), building, ground: onGround };
}

/** 口の位置（体の中心と向きから。炎の当たり判定の起点）。local は怪獣ごとの口の局所座標（既定は紅竜）。 */
export function mouthOf(body: Vec3, yaw: number, local: readonly [number, number, number] = BREATH.mouthLocal): Vec3 {
  return localToWorld(body, yaw, local[0], local[1], local[2]);
}

/** 狙いの点が炎の届く所か（口からの距離が range 以内。既定は紅竜の炎の BREATH.range）。 */
export function breathReaches(mouth: Vec3, point: Vec3, range: number = BREATH.range): boolean {
  return Math.hypot(point.x - mouth.x, point.y - mouth.y, point.z - mouth.z) <= range;
}

export interface SpawnView {
  view: View;
  /** 照準が乗った建物（見つからなければ null で、既定の向きと見下ろし） */
  target: Building | null;
}

/** 始まりの照準を探す条件（r03-roster：怪獣ごとの体の位置・カメラの距離・口・主砲の届く距離）。既定は紅竜の空中の始まり。 */
export interface SpawnAimOptions {
  body: Vec3;
  distance: number;
  mouthLocal: readonly [number, number, number];
  /** 口から照準の点までの距離の範囲（m） */
  reachMin: number;
  reachMax: number;
  /** 口のまわりこの半径（m）に建物がある向きは選ばない（地上から始める怪獣：口がビルに埋まって礫がすぐ弾けないように）。0 で見ない */
  mouthClearance?: number;
  /** r05-camera：その怪獣のカメラの値（無ければ既定） */
  camera?: CameraProfile;
  /**
   * r05-camera：カメラから体の点と回転の中心への視線が、建物にふさがれない向きを選ぶ（見つからなければ、ふさがれていても最初に見つけた向き）。
   * 焔角の高く遠いカメラでは、始まりの向きでカメラがビルの真後ろに来て、画面の右の6割が壁になった
   */
  clearSight?: boolean;
}

/**
 * 始まりの向き（r02-controls）：既定の向きから左右へ交互に stepDeg ずつ広げ、見下ろしも既定から上下へ広げて、
 * 照準（空中のカメラ距離）が minHeight 以上の建物に当たり、口からの距離が reachMin〜reachMax に入る最初の向きを選ぶ。
 * 同じ街なら必ず同じ向きになる（乱数を使わない）。
 */
export function spawnView(index: CityIndex, groundAt: (x: number, z: number) => number, opts?: SpawnAimOptions): SpawnView {
  const S = L.spawnAim;
  const body = opts ? vec3(opts.body.x, opts.body.y, opts.body.z) : vec3(L.spawn.x, L.spawn.y, L.spawn.z);
  const distance = opts?.distance ?? C.distanceAir;
  const mouthLocal = opts?.mouthLocal ?? BREATH.mouthLocal;
  const reachMin = opts?.reachMin ?? S.reachMin;
  const reachMax = opts?.reachMax ?? S.reachMax;
  const groundY = groundAt(body.x, body.z);
  const heading = L.spawn.headingDeg * DEG;
  const pitch0 = LOOK.pitchStartDeg;
  const pitches: number[] = [];
  for (let k = 0; k <= 60; k++) {
    for (const s of k === 0 ? [0] : [-k, k]) {
      const p = pitch0 + s * S.pitchStepDeg;
      if (p >= S.pitchMinDeg && p <= S.pitchMaxDeg) pitches.push(p);
    }
  }
  const standing = (): boolean => true;
  const cam = vec3();
  let fallback: SpawnView | null = null;
  const sightHeight = opts?.camera?.sightHeight ?? 4;
  /** カメラ cam から点 (x, y, z) までの線分（端の margin m を除く）が、建物にふさがれていないか */
  const clearTo = (x: number, y: number, z: number, margin: number): boolean => {
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    const len = Math.hypot(dx, dy, dz);
    if (len <= margin) return true;
    return raycastBuildings(index, cam, vec3(dx / len, dy / len, dz / len), len - margin, standing) === null;
  };
  for (let k = 0; k * S.stepDeg <= S.searchDeg; k++) {
    for (const s of k === 0 ? [0] : [1, -1]) {
      const yaw = heading + s * k * S.stepDeg * DEG;
      const mouth = mouthOf(body, yaw, mouthLocal);
      const clear = opts?.mouthClearance ?? 0;
      if (clear > 0 && index.buildingsNear(mouth.x, mouth.z, clear).some((b) => b.height > groundY + 4)) continue;
      for (const p of pitches) {
        const view = { yaw, pitch: p * DEG };
        fixedCamera(body, null, groundY, distance, view, cam, opts?.camera);
        const hit = castAim(index, cam, directionOf(view.yaw, view.pitch), groundY, distance - 4, standing);
        if (!hit.building || hit.building.height < S.minHeight) continue;
        const reach = Math.hypot(hit.point.x - mouth.x, hit.point.y - mouth.y, hit.point.z - mouth.z);
        if (reach < reachMin || reach > reachMax) continue;
        const found = { view, target: hit.building };
        if (!opts?.clearSight) return found;
        const d = directionOf(view.yaw, view.pitch);
        if (clearTo(body.x, body.y + sightHeight, body.z, 8) && clearTo(cam.x + d.x * distance, cam.y + d.y * distance, cam.z + d.z * distance, 8)) return found;
        fallback ??= found;
      }
    }
  }
  return fallback ?? { view: { yaw: heading, pitch: pitch0 * DEG }, target: null };
}
