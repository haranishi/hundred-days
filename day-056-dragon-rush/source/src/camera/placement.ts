// OWNER: camera
// カメラの置き方の規則（純データ・three を読まない）。照準の光線（gameplay/aim.ts の fixedCamera）と追うカメラ（followCam.ts）は
// どちらもこの関数で置く。値は怪獣ごと（config/camera.ts の CameraProfile）。追うカメラはばねで遅れるが、落ち着けば同じ所に来るので、
// 照準（画面の中央）と狙いの光線が一致する。
//   1. 回転の中心：体の中心の上 pivotHeight、速さの向きへ lookAhead 秒先、視点の右へ shoulder（肩越し）
//   2. 軌道：回転の中心から、視線より lookDownDeg だけ下を向いた向きの逆へ、距離（見上げるほど少し寄せる）。r06-camera2：見下ろしの足しは
//      深く見下ろすほど減らす（lookDownFade）。深く見下ろしたら紅竜と同じく視線どおりに回り、カメラも上がる
//   3. r06-camera2：ビルの裏に置かない（solveCamera）。視線（カメラ → 体の点・回転の中心）に立っている建物が入ったら、
//      ①画面の中央の線（照準の線）に沿って建物の怪獣の側まで寄せる ②寄せきれなければ寄せずに屋上を越えるまで上げる ③残りは網点
//      ④カメラが建物の箱の中なら必ず外へ。寄せは照準の線の上を動くだけなので照準は変わらない。上げる分は線ごと上げ、照準の光線も同じだけ上げる
//   4. 高さ：地面から minHeight より下げず（r02-controls）、瓦礫の山の上面＋余裕より下げず、視線が山を越えるまで上げる（r05-camera、camera/clearance.ts）
// カメラはいつも視線の向き（view）を向く。上げても寄せても、画面の中央は照準の光線と同じ直線の上にある。
import { CAMERA_CLEARANCE, CAMERA_PLACE as K, FOLLOW_CAMERA as C, type CameraProfile } from '../config/camera';
import { LOOK } from '../config/controls';
import { DEG, directionOf, type Vec3 } from '../gameplay/math';
import { raycastBuildings, rayMass } from '../gameplay/shapes';
import type { Building } from '../world/types';
import type { CameraClearance } from './clearance';

export interface CameraView {
  yaw: number;
  pitch: number;
}

/** 視点の右（水平の単位ベクトル）。前 = (sin yaw, 0, cos yaw) に対して右 = (-cos yaw, 0, sin yaw)。 */
export function rightOf(yaw: number): { x: number; z: number } {
  return { x: -Math.cos(yaw), z: Math.sin(yaw) };
}

/** 見上げるほど竜へ寄せる距離の倍率（0 度以下は 1、見上げの上限で 1 - lookUpPullIn）。 */
export function lookUpScale(pitch: number): number {
  const k = Math.min(1, Math.max(0, pitch / (LOOK.pitchMaxDeg * DEG)));
  return 1 - C.lookUpPullIn * k;
}

/**
 * 回転の中心（肩越しを含む）。追うカメラは肩越しを除いた所をばねで追い、肩越しは視点の向きから直接足す。
 * r06-camera2：shoulder を渡すと、その肩越しで置く（右の建物で縮めた値。遊びの側がばねを通した値を、照準の光線と追うカメラの両方に渡す）
 */
export function cameraPivot(p: CameraProfile, body: Vec3, vel: Vec3 | null, view: CameraView, out: Vec3, shoulder: number = p.shoulder): Vec3 {
  const r = rightOf(view.yaw);
  const vx = vel ? vel.x : 0;
  const vy = vel ? vel.y : 0;
  const vz = vel ? vel.z : 0;
  // 足す順は r04 までの fixedCamera と同じ（紅竜の照準を1桁も変えないため）
  out.x = body.x + vx * C.lookAhead + r.x * shoulder;
  out.y = body.y + p.pivotHeight + vy * C.lookAhead * 0.2;
  out.z = body.z + vz * C.lookAhead + r.z * shoulder;
  return out;
}

/**
 * r06-camera2：回転の中心が右の建物に入らない肩越しのずれ（m、shoulderMin〜shoulder）。体の中心の上 pivotHeight から視点の右へ水平の光線を
 * shoulder ＋ shoulderMargin だけ引き、立っている建物に当たれば、その手前 shoulderMargin までに縮める。shoulderMin が shoulder と同じ怪獣
 * （紅竜・雷翼）は縮めない。
 */
export function shoulderFor(p: CameraProfile, body: Vec3, view: CameraView, world: CameraClearance | null): number {
  if (!world || p.shoulderMin >= p.shoulder) return p.shoulder;
  const r = rightOf(view.yaw);
  RIGHT.x = r.x;
  RIGHT.y = 0;
  RIGHT.z = r.z;
  PIV.x = body.x;
  PIV.y = body.y + p.pivotHeight;
  PIV.z = body.z;
  const hit = raycastBuildings(world.index, PIV, RIGHT, p.shoulder + K.shoulderMargin, (bb) => world.isStanding(bb.id));
  return hit ? Math.max(p.shoulderMin, Math.min(p.shoulder, hit.t - K.shoulderMargin)) : p.shoulder;
}
const RIGHT: Vec3 = { x: 0, y: 0, z: 0 };
const PIV: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * r06-camera2：見下ろしの足しの効き（0〜1）。視線が lookDownFadeFromDeg より上なら 1、lookDownFadeToDeg 以下で 0、間はなだらか。
 * 体験の採点 r05 の 4-3：焔角は見下ろしを深くしてもカメラが上限の角度で止まり、−62°で怪獣が画面の上から12%まで逃げた。
 */
export function lookDownShare(p: CameraProfile, pitch: number): number {
  const from = p.lookDownFadeFromDeg * DEG;
  const to = p.lookDownFadeToDeg * DEG;
  if (pitch >= from || from <= to) return 1;
  const k = Math.min(1, (from - pitch) / (from - to));
  return 1 - k * k * (3 - 2 * k);
}

/**
 * 軌道の向き（回転の中心からカメラへの向きの逆）：視線より lookDownDeg（深く見下ろすほど減る）だけ下。ただし、カメラが回転の中心より
 * maxOrbitDeg を超えて高い所へ回らないようにする（90 で上限なし）。
 */
export function orbitDirection(p: CameraProfile, view: CameraView): Vec3 {
  if (p.lookDownDeg === 0 && p.maxOrbitDeg >= 90) return directionOf(view.yaw, view.pitch);
  const down = p.lookDownDeg * lookDownShare(p, view.pitch);
  return directionOf(view.yaw, Math.max(view.pitch - down * DEG, -p.maxOrbitDeg * DEG));
}

/** 回転の中心から、距離 distance（見上げで寄せる前）のカメラの位置（高さを止める前）。 */
export function orbitCamera(p: CameraProfile, pivot: Vec3, view: CameraView, distance: number, out: Vec3): Vec3 {
  const o = orbitDirection(p, view);
  const dist = distance * lookUpScale(view.pitch);
  out.x = pivot.x - o.x * dist;
  out.y = pivot.y - o.y * dist;
  out.z = pivot.z - o.z * dist;
  return out;
}

/** 視線が越えるべき体の点（体の中心の上 sightHeight）。 */
export function sightPoint(p: CameraProfile, body: Vec3, out: Vec3): Vec3 {
  out.x = body.x;
  out.y = body.y + p.sightHeight;
  out.z = body.z;
  return out;
}

/** 画角 fovDeg（縦）・縦横比 aspect の画面の横 fill 倍に、幅 span（m）が収まる距離。 */
export function spanDistance(span: number, fovDeg: number, aspect: number, fill = CAMERA_CLEARANCE.spanFill): number {
  return span / 2 / (Math.tan((fovDeg * Math.PI) / 360) * aspect * fill);
}

/** 規則で使う画面の縦横比（照準の光線は画面の大きさを知らないので、追うカメラも同じ値で決める） */
const RULE_ASPECT = 16 / 9;

/**
 * r06-camera2：ビルの裏から寄せてよい最短の距離（m）：max(minDistance, 全長 × pullPerLength)。飛んでいる間は、広げた翼が画面の横に収まる距離も。
 */
export function pullMinDistance(p: CameraProfile, flying: boolean): number {
  const ground = Math.max(C.minDistance, p.bodyLength * K.pullPerLength);
  return flying ? Math.max(ground, spanDistance(p.wingSpan, p.fovBase, RULE_ASPECT)) : ground;
}

/** 置き方の結果。r は照準の線の要（anchor）からカメラまでの距離、rise は線ごと持ち上げる高さ（m）。 */
export interface CameraSolve {
  r: number;
  rise: number;
  /**
   * free：何もしない／pull：寄せた／lift：寄せずに上げた／pullLift：寄せて上げた／blocked：越えきれず網点に任せる（上げられる分は上げた）／
   * push：建物の箱の中から押し出した
   */
  mode: 'free' | 'pull' | 'lift' | 'pullLift' | 'blocked' | 'push';
  /** 上げた分のうち、建物を越えるための分（m。記録用） */
  liftB: number;
}

export const emptySolve = (): CameraSolve => ({ r: 0, rise: 0, mode: 'free', liftB: 0 });

const V = (): Vec3 => ({ x: 0, y: 0, z: 0 });
const D = V();
const O = V();
const RAW = V();
const ANCHOR = V();
const CAND = V();
const LIFTED = V();
const SIGHT = V();
const DIR = V();

/** 線分 a → b（b の手前 margin m を除く）が、立っている建物にふさがれるか（a が建物の箱の中でもふさがれる）。 */
function blocked(world: CameraClearance, a: Vec3, b: Vec3, margin: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz);
  if (len <= margin) return false;
  DIR.x = dx / len;
  DIR.y = dy / len;
  DIR.z = dz / len;
  return raycastBuildings(world.index, a, DIR, len - margin, (bb) => world.isStanding(bb.id)) !== null;
}

/** カメラの点 c から、体の点 S と回転の中心 P への視線が両方とも空いているか（テストも同じ判定を使う）。 */
export function sightClear(world: CameraClearance, c: Vec3, s: Vec3, pivot: Vec3): boolean {
  return !blocked(world, c, s, K.sightMargin) && !blocked(world, c, pivot, K.sightMargin);
}

/** 点 c の下の地面（minHeight）と瓦礫の山（上面＋余裕）より下げないための持ち上げ（m、0 以上）。 */
function floorRise(c: Vec3, groundY: number, world: CameraClearance | null): number {
  const base = Math.max(0, groundY + C.minHeight - c.y);
  if (!world) return base;
  const floor = world.floorAt(c.x, c.z);
  return Math.max(base, floor - c.y);
}

/**
 * 上げても体の点 s が画面の中央から縦の半分 × keepInFrame より下へ出ない、上げの上限（m）。d は視線の向き（照準）、fovDeg は縦の画角。
 * 体の点の縦の角度 atan2(v·u, v·d)（u は画面の上）が −θ を下回らない h：h ≤ (v·u + tanθ·v·d) / (cos p + tanθ·sin p)
 */
export function keepInFrameRise(c: Vec3, s: Vec3, d: Vec3, fovDeg: number): number {
  const theta = ((fovDeg * Math.PI) / 360) * K.keepInFrame;
  const t = Math.tan(theta);
  const horiz = Math.hypot(d.x, d.z);
  // 画面の上 u（視線に直交し、鉛直の側）
  const ux = horiz > 1e-6 ? (-d.x * d.y) / horiz : 0;
  const uy = horiz;
  const uz = horiz > 1e-6 ? (-d.z * d.y) / horiz : 0;
  const vx = s.x - c.x;
  const vy = s.y - c.y;
  const vz = s.z - c.z;
  const vu = vx * ux + vy * uy + vz * uz;
  const vd = vx * d.x + vy * d.y + vz * d.z;
  const den = uy + t * d.y;
  if (den <= 1e-6) return Infinity;
  return Math.max(0, (vu + t * vd) / den);
}

/**
 * r06-camera2：カメラを置く（ビルの裏に置かない）。pivot は回転の中心（肩越しを含む）、want は要までの距離（見上げで寄せた後）。
 * 結果のカメラは anchor − d·r ＋ 上·rise（anchor = 軌道のカメラ ＋ d·want。見下ろしの足しが 0 なら回転の中心）。照準の光線は
 * 軌道のカメラ ＋ 上·rise から d へ伸ばす（同じ直線）。world を省くと r04 までと同じ（地面から minHeight だけ）。
 */
export function solveCamera(
  p: CameraProfile,
  pivot: Vec3,
  body: Vec3,
  groundY: number,
  want: number,
  view: CameraView,
  world: CameraClearance | null,
  flying: boolean,
  out: CameraSolve,
): CameraSolve {
  const d = directionOf(view.yaw, view.pitch);
  D.x = d.x;
  D.y = d.y;
  D.z = d.z;
  const o = orbitDirection(p, view);
  O.x = o.x;
  O.y = o.y;
  O.z = o.z;
  RAW.x = pivot.x - o.x * want;
  RAW.y = pivot.y - o.y * want;
  RAW.z = pivot.z - o.z * want;
  ANCHOR.x = RAW.x + d.x * want;
  ANCHOR.y = RAW.y + d.y * want;
  ANCHOR.z = RAW.z + d.z * want;
  out.r = want;
  out.liftB = 0;
  out.mode = 'free';
  if (!world) {
    out.rise = Math.max(0, groundY + C.minHeight - RAW.y);
    return out;
  }
  sightPoint(p, body, SIGHT);
  const at = (r: number): Vec3 => {
    CAND.x = ANCHOR.x - d.x * r;
    CAND.y = ANCHOR.y - d.y * r;
    CAND.z = ANCHOR.z - d.z * r;
    return CAND;
  };
  // 1. 決まった距離（寄せない）
  let c = at(want);
  let rise = floorRise(c, groundY, world);
  c.y += rise;
  if (!sightClear(world, c, SIGHT, pivot)) {
    out.mode = 'blocked';
    // 2. 画面の中央の線に沿って、視線が空く所まで寄せる（寄せてよい最短の距離まで）。最短の距離でも空かなければ寄せない。
    //    空くなら、空く所とふさがれる所の間を二分して、空くいちばん遠い所（刻み pullStep まで）を探す
    const minR = Math.min(want, pullMinDistance(p, flying));
    const clearAt = (r: number): number => {
      c = at(r);
      const fr = floorRise(c, groundY, world);
      c.y += fr;
      return sightClear(world, c, SIGHT, pivot) ? fr : -1;
    };
    let lo = minR;
    let loRise = minR < want ? clearAt(minR) : -1;
    if (loRise >= 0) {
      let hi = want;
      while (hi - lo > K.pullStep) {
        const mid = (lo + hi) / 2;
        const fr = clearAt(mid);
        if (fr >= 0) {
          lo = mid;
          loRise = fr;
        } else hi = mid;
      }
      out.r = lo;
      rise = loRise;
      out.mode = 'pull';
    }
    if (out.mode === 'blocked') {
      // 3. 寄せきれない：寄せずに（それでも足りなければ最短まで寄せて）屋上を越えるまで上げる。上限は距離の liftShare 倍と、体が画面に残る高さ
      // 画角は規則の上ではふだんの値（照準の光線は走り・急降下の画角を知らない。追うカメラも同じ値で決める）
      const fov = p.fovBase;
      let best: { r: number; base: number; need: number; cap: number } | null = null;
      for (const r of minR < want ? [want, minR] : [want]) {
        c = at(r);
        const base = floorRise(c, groundY, world);
        c.y += base;
        const need = Math.max(world.buildingNeed(c, SIGHT, K.liftMargin, K.sightMargin), world.buildingNeed(c, pivot, K.liftMargin, K.sightMargin));
        const cap = Math.min(Math.max(want * K.liftShare, flying ? p.buildingLift : 0), keepInFrameRise(c, SIGHT, d, fov));
        const cand = { r, base, need, cap };
        // 上げた所で視線が本当に空くか（高さで見た屋上と箱の当たりの食い違いで、上げても空かないことがある）
        if (need > 0 && need <= cap) {
          LIFTED.x = c.x;
          LIFTED.y = c.y + need;
          LIFTED.z = c.z;
          if (sightClear(world, LIFTED, SIGHT, pivot)) {
            best = cand;
            break;
          }
        }
        // 越えきれないなら、決まった距離で上げられる分だけ上げる（体のまわりの網点を減らす）
        if (!best) best = cand;
      }
      if (best && best.need > 0 && best.need <= best.cap) {
        out.r = best.r;
        out.liftB = best.need;
        rise = best.base + out.liftB;
        out.mode = best.r < want ? 'pullLift' : 'lift';
      }
    }
  }
  // 4. 瓦礫の山を越える視線（r05-camera の規則。上限は距離の sightLiftShare 倍）。飛んでいる間は、視線が屋上の近く（外形の外 buildingSoft まで）
  //    を通るだけでも buildingLift まで上げる（r05-camera の雷翼の規則。ふさがれる前に上げておく）
  c = at(out.r);
  c.y += rise;
  rise += world.sightLift(c, SIGHT, want * CAMERA_CLEARANCE.sightLiftShare, flying ? Math.max(0, p.buildingLift - out.liftB) : 0);
  // 5. カメラが立っている建物の箱の中なら、必ず外へ（怪獣の側の面の手前まで寄せるか、屋上の上へ。動きの少ない方。寄せは pushMin まで）
  for (let k = 0; k < 2; k++) {
    c = at(out.r);
    c.y += rise;
    const inside = insideBuilding(world, c);
    if (!inside) break;
    // 要から後ろへ光線を引き、この建物の要の側の面までの距離を求める
    DIR.x = -d.x;
    DIR.y = -d.y;
    DIR.z = -d.z;
    let pullTo = -1;
    let face = Infinity;
    for (const m of inside.b.masses) {
      const t = rayMass(m, { x: ANCHOR.x, y: ANCHOR.y + rise, z: ANCHOR.z }, DIR, out.r);
      if (t >= 0) face = Math.min(face, t);
    }
    if (face < Infinity) pullTo = face - K.pushClear;
    const upTo = inside.top + K.pushClear - c.y;
    const pullCost = pullTo >= K.pushMin ? out.r - pullTo : Infinity;
    if (pullCost <= upTo) out.r = pullTo;
    else rise += upTo;
    out.mode = 'push';
  }
  out.rise = rise;
  return out;
}

/** 点 c を含む、立っている建物の塊（とその上面の高さ）。無ければ null。 */
export function insideBuilding(world: CameraClearance, c: Vec3): { b: Building; top: number } | null {
  for (const b of world.index.buildingsNear(c.x, c.z, 1)) {
    if (!world.isStanding(b.id)) continue;
    let top = -Infinity;
    for (const m of b.masses) {
      if (c.x > m.rect.x0 && c.x < m.rect.x1 && c.z > m.rect.z0 && c.z < m.rect.z1 && c.y > m.y0 - 0.5 && c.y < m.y1 + 0.5) top = Math.max(top, b.height);
    }
    if (top > -Infinity) return { b, top };
  }
  return null;
}

const PIVOT: Vec3 = { x: 0, y: 0, z: 0 };
const SOLVE = emptySolve();

/**
 * 決まった位置のカメラ（ばねを通さない）。照準の光線はここから視線の向きへ伸ばす。
 * clearance を渡さなければ r04 までと同じ規則（地面から minHeight だけ）。渡すと solveCamera の上げる分（建物・瓦礫の山・地面）も足す
 * （寄せは照準の線の上を動くだけなので、光線の出どころは軌道のカメラのまま）。
 */
export function placeFixedCamera(
  p: CameraProfile,
  body: Vec3,
  vel: Vec3 | null,
  groundY: number,
  distance: number,
  view: CameraView,
  out: Vec3,
  clearance: CameraClearance | null = null,
  flying = false,
  solve: CameraSolve = SOLVE,
  shoulder: number = p.shoulder,
): Vec3 {
  cameraPivot(p, body, vel, view, PIVOT, shoulder);
  orbitCamera(p, PIVOT, view, distance, out);
  if (!clearance) {
    // r04 までの式そのまま（紅竜の照準を1桁も変えないため、足し算の形を変えない）
    out.y = Math.max(out.y, groundY + C.minHeight);
    return out;
  }
  solveCamera(p, PIVOT, body, groundY, distance * lookUpScale(view.pitch), view, clearance, flying, solve);
  out.y += solve.rise;
  return out;
}
