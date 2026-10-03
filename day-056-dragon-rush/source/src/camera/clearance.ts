// OWNER: camera
// r05-camera：カメラを瓦礫の山の中へ入れず、山とビルに視線（カメラ → 体）をふさがせない規則。純データ（three を読まない）で、
// 照準の光線（gameplay/aim.ts の fixedCamera）と追うカメラ（followCam.ts）の両方が同じ答えを使う。
// 体験の採点の B2「瓦礫の山の脇や上で、カメラが山の多角形の中に入り、画面の上半分が暗い面で埋まる」への対処。
// 山の形は fx/rubble.ts と同じ決め方：崩れ方の規則（city/collapsePose.ts）の高さ（moundHeight）と盛り上がり（moundProgress）、
// 広がりは外形の RUBBLE.spread 倍 + pad。凸凹（heapHeight の bump）は上限の倍率（heapBumpMax）で包む。
import { CollapseShapes, collapsePose, moundHeight, moundProgress, poseZero, type CollapseShape } from '../city/collapsePose';
import { CAMERA_CLEARANCE as K } from '../config/camera';
import { RUBBLE } from '../config/fx';
import type { CityIndex } from '../world/query';
import type { Building } from '../world/types';

/** 崩落・瓦礫の段階（gameplay/damage.ts の STAGE.collapse。ここから先は立っていない） */
const STAGE_COLLAPSE = 4;

/** 壊れ方のうち、瓦礫の山を決めるのに要る値（gameplay の DamageState がこの形を満たす）。 */
export interface RubbleSource {
  stage: ArrayLike<number>;
  collapse: ArrayLike<number>;
  splitY: ArrayLike<number>;
  dirX: ArrayLike<number>;
  dirZ: ArrayLike<number>;
  /** r06-camera2：傾き（崩れている途中の見た目の姿勢に使う。無ければ 0） */
  tilt?: ArrayLike<number>;
}

/** r06-camera2：崩れている途中の建物の見た目を、根元の中心から上の塊の先までの棒とみなしたもの（網点の対象を調べる）。 */
export interface CollapsingStick {
  id: number;
  foot: { x: number; y: number; z: number };
  top: { x: number; y: number; z: number };
  /** 棒の太さ（m、外形の幅の半分ほど） */
  r: number;
}

/** 崩落の進みがこれより先の建物は、棒ではなく瓦礫の山として扱う（上の塊が山の上に落ち着いた後） */
const COLLAPSING_UNTIL = 0.85;

/** 山の台形の部分（fx/rubble.ts の heapHeight の凸凹を除いた形。u, v は -0.5〜0.5、縁で 0、上はほぼ平ら）。 */
export function heapBase(u: number, v: number): number {
  const e = Math.max(Math.abs(u), Math.abs(v)) * 2;
  const q = 0.85 * e + 0.15 * Math.hypot(u, v) * 2;
  return Math.pow(Math.max(0, 1 - Math.pow(q, 3)), 0.55);
}

/** 山の表面の上限（凸凹を含めて、どの向きに置いた山もこれより低い。高さ 1 の山の値）。 */
export function heapEnvelope(u: number, v: number): number {
  if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) return 0;
  return K.heapBumpMax * heapBase(u, v);
}

interface Heap {
  id: number;
  cx: number;
  cz: number;
  /** 盛り上がりきったときの、世界の軸に沿った全幅（m） */
  w: number;
  d: number;
  ground: number;
  shape: CollapseShape;
  /** いまの高さ（m）と根元の広がり（盛り上がりきって 1） */
  height: number;
  spread: number;
  /** r06-camera2：崩落の進み（0〜1）と傾き（崩れている途中の見た目の棒に使う） */
  collapse: number;
  tilt: number;
  split: number;
}

const POSE = poseZero();

export class CameraClearance {
  private readonly shapes: CollapseShapes;
  private readonly byId = new Map<number, Heap>();
  private heaps: Heap[] = [];
  private readonly near: Heap[] = [];
  private readonly nearB: Building[] = [];

  constructor(
    private readonly buildings: readonly Building[],
    readonly index: CityIndex,
    private readonly groundAt: (x: number, z: number) => number,
  ) {
    this.shapes = new CollapseShapes(buildings);
  }

  /**
   * r06-camera2：建物が立っているか（refresh で渡した壊れ方の段階が崩落より前。遊びの DamageState.isStanding と同じ答え）。
   * 置き方の規則（camera/placement.ts の solveCamera）が、視線をふさぐ建物を選ぶのに使う
   */
  isStanding(id: number): boolean {
    return !this.byId.has(id);
  }

  /** 崩れ始めた建物の山を足し、盛り上がりを今の崩落の進みに合わせる（やり直しで立ち直った建物の山は消す）。 */
  refresh(d: RubbleSource): void {
    let changed = false;
    for (let id = 0; id < this.buildings.length; id++) {
      const down = d.stage[id] >= STAGE_COLLAPSE;
      const h = this.byId.get(id);
      if (!down) {
        if (h) {
          this.byId.delete(id);
          changed = true;
        }
        continue;
      }
      if (!h) {
        const b = this.buildings[id];
        const f = b.footprint;
        const split = d.splitY[id];
        // fx/fxDirector.ts の山と同じ寸法（割れる高さの無い建物は外形の中ほどで割ったものとする）
        const shape = this.shapes.get(b, split > 0 ? split : (b.masses[0].y0 + b.height) / 2, d.dirX[id], d.dirZ[id]);
        const cx = (f.x0 + f.x1) / 2;
        const cz = (f.z0 + f.z1) / 2;
        this.byId.set(id, {
          id,
          cx,
          cz,
          w: (f.x1 - f.x0) * RUBBLE.spread + RUBBLE.pad,
          d: (f.z1 - f.z0) * RUBBLE.spread + RUBBLE.pad,
          ground: this.groundAt(cx, cz),
          shape,
          height: 0,
          spread: 0.82,
          collapse: 0,
          tilt: 0,
          split: split > 0 ? split : (b.masses[0].y0 + b.height) / 2,
        });
        changed = true;
      }
    }
    if (changed) this.heaps = [...this.byId.values()];
    for (const h of this.heaps) {
      const t = Math.min(1, Math.max(0, moundProgress(h.shape, d.collapse[h.id])));
      h.height = moundHeight(h.shape) * t;
      h.spread = 0.82 + 0.18 * t;
      h.collapse = d.collapse[h.id];
      h.tilt = d.tilt ? d.tilt[h.id] : 0;
    }
  }

  /**
   * r06-camera2：崩れている途中（崩落の進み COLLAPSING_UNTIL まで）の建物の見た目の棒を out に入れる。遊びの上ではもう立っていないが、
   * 上の塊はしばらく高く残る（体験の採点の標本：雷翼が着地で崩した高層の陰に、怪獣が網点なしで隠れた）。上の塊の先は、崩れ方の規則
   * （city/collapsePose.ts）の姿勢から：潰れた階の上端 ＋ 上の塊の長さ × cos(傾き) − 沈み、横へ 長さ × sin(傾き) だけ倒れる向きへ
   */
  collapsing(out: CollapsingStick[]): number {
    let n = 0;
    for (const h of this.heaps) {
      if (h.collapse >= COLLAPSING_UNTIL) continue;
      const b = this.buildings[h.id];
      const f = b.footprint;
      collapsePose(h.tilt, h.collapse, h.shape, POSE);
      const L = Math.max(0, b.height - h.split);
      const s = Math.sin(POSE.angle);
      const c = Math.cos(POSE.angle);
      const e = out[n] ?? (out[n] = { id: 0, foot: { x: 0, y: 0, z: 0 }, top: { x: 0, y: 0, z: 0 }, r: 0 });
      e.id = h.id;
      e.foot.x = h.cx;
      e.foot.y = h.ground;
      e.foot.z = h.cz;
      e.top.x = h.cx + h.shape.dirX * L * s;
      e.top.y = POSE.stackTop + L * c - POSE.sink;
      e.top.z = h.cz + h.shape.dirZ * L * s;
      e.r = 0.25 * (f.x1 - f.x0 + (f.z1 - f.z0));
      n++;
    }
    out.length = n;
    return n;
  }

  reset(): void {
    this.byId.clear();
    this.heaps = [];
  }

  /** いま山になっている建物の数（記録用）。 */
  get count(): number {
    return this.heaps.length;
  }

  /** r06-camera2：崩れた建物 id の瓦礫の山のいまの高さ（m、凸凹の上限を含む。山でなければ 0）。 */
  heapHeight(id: number): number {
    const h = this.byId.get(id);
    return h ? h.height * K.heapBumpMax : 0;
  }

  /** (x, z) での山の表面の上限の高さ（m）。山が無ければ -Infinity。list を渡すとその山だけを見る。 */
  heapTopAt(x: number, z: number, list: readonly Heap[] = this.heaps): number {
    let best = -Infinity;
    for (const h of list) {
      if (h.height <= 0.01) continue;
      const w = h.w * h.spread;
      const dd = h.d * h.spread;
      const u = (x - h.cx) / w;
      const v = (z - h.cz) / dd;
      if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) continue;
      best = Math.max(best, h.ground + heapEnvelope(u, v) * h.height);
    }
    return best;
  }

  /** カメラを置いてよい高さの下限（山の上面＋余裕）。山が無ければ -Infinity。 */
  floorAt(x: number, z: number): number {
    return this.heapTopAt(x, z) + K.rubbleClear;
  }

  /**
   * カメラ cam から体の点 target への視線が、山（と buildingCap > 0 ならビル）の上を越えるまでカメラを上げる高さ（m）。
   * 上げると視線の高さは cam の側ほど大きく持ち上がる（target は動かない）ので、点ごとの不足を (1 − s) で割る。
   * 体のまわり（sightSkip）は調べない（体が埋まっている山は、カメラを上げても見えないため）。山は heapCap、ビルは buildingCap まで。
   */
  sightLift(cam: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, heapCap: number, buildingCap: number): number {
    const dx = target.x - cam.x;
    const dy = target.y - cam.y;
    const dz = target.z - cam.z;
    const L = Math.hypot(dx, dz);
    if (L < K.sightSkip + K.sightStep) return 0;
    const sMax = 1 - K.sightSkip / L;
    // 線分の外接矩形にかかる山とビルだけを調べる
    const x0 = Math.min(cam.x, target.x);
    const x1 = Math.max(cam.x, target.x);
    const z0 = Math.min(cam.z, target.z);
    const z1 = Math.max(cam.z, target.z);
    this.near.length = 0;
    if (heapCap > 0) {
      for (const h of this.heaps) {
        if (h.height <= 0.01) continue;
        const hw = (h.w * h.spread) / 2;
        const hd = (h.d * h.spread) / 2;
        if (h.cx + hw < x0 || h.cx - hw > x1 || h.cz + hd < z0 || h.cz - hd > z1) continue;
        this.near.push(h);
      }
    }
    this.nearB.length = 0;
    if (buildingCap > 0) this.collectBuildings(cam, target, L);
    if (this.near.length === 0 && this.nearB.length === 0) return 0;
    let needH = 0;
    let needB = 0;
    const n = Math.floor((sMax * L) / K.sightStep);
    for (let i = 1; i <= n; i++) {
      const s = (i * K.sightStep) / L;
      const px = cam.x + dx * s;
      const pz = cam.z + dz * s;
      const py = cam.y + dy * s;
      const k = 1 - s;
      if (this.near.length > 0) {
        const top = this.heapTopAt(px, pz, this.near);
        if (top > -Infinity) needH = Math.max(needH, (top + K.sightMargin - py) / k);
      }
      if (this.nearB.length > 0) {
        const top = this.buildingTopAt(px, pz);
        if (top > -Infinity) needB = Math.max(needB, (top + K.sightMargin - py) / k);
      }
    }
    return Math.max(Math.min(needH, heapCap), Math.min(needB, buildingCap), 0);
  }

  /**
   * r06-camera2：カメラ cam から点 target への視線が、立っているビルの屋上（＋余裕 margin）の上を越えるまでに、カメラを上げる高さ（m、上限なし）。
   * sightLift のビルの分と同じ測り方（外形の外 buildingSoft までなだらか）で、余裕 margin と、点の手前で見ない長さ skip（m）を変えられる
   */
  buildingNeed(cam: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }, margin: number = K.sightMargin, skip: number = K.sightSkip): number {
    const dx = target.x - cam.x;
    const dy = target.y - cam.y;
    const dz = target.z - cam.z;
    const L = Math.hypot(dx, dz);
    if (L < skip + K.sightStep) return 0;
    this.nearB.length = 0;
    this.collectBuildings(cam, target, L);
    if (this.nearB.length === 0) return 0;
    const sMax = 1 - skip / L;
    const n = Math.floor((sMax * L) / K.sightStep);
    let need = 0;
    for (let i = 1; i <= n; i++) {
      const s = (i * K.sightStep) / L;
      const top = this.buildingTopAt(cam.x + dx * s, cam.z + dz * s);
      if (top > -Infinity) need = Math.max(need, (top + margin - (cam.y + dy * s)) / (1 - s));
    }
    return need;
  }

  /**
   * 線分 a → b（b の手前 endMargin m まで）が山の上面（凸凹の上限で包んだ形）より下を通るなら、その山の建物番号を out に足す。
   * 追うカメラが、カメラと竜の間の山を網点で透かすのに使う（体が埋まっている山は、カメラを上げても見えないため）。
   * r06-camera2：maxS（0〜1）より先（線分の割合）で初めて山に入るものは足さない（怪獣より奥の山。追うカメラが体の中心の奥行きから決める）
   */
  heapsBlocking(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, out: Set<number>, endMargin = 0, maxS = 1): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1) return;
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    const z0 = Math.min(a.z, b.z);
    const z1 = Math.max(a.z, b.z);
    const n = Math.max(1, Math.ceil((len - endMargin) / 2.5));
    const sEnd = Math.min(Math.max(0, 1 - endMargin / len), Math.max(0, maxS));
    for (const h of this.heaps) {
      if (h.height <= 0.01 || out.has(h.id)) continue;
      const w = h.w * h.spread;
      const d = h.d * h.spread;
      if (h.cx + w / 2 < x0 || h.cx - w / 2 > x1 || h.cz + d / 2 < z0 || h.cz - d / 2 > z1) continue;
      for (let i = 0; i <= n; i++) {
        const s = (i / n) * sEnd;
        const u = (a.x + dx * s - h.cx) / w;
        const v = (a.z + dz * s - h.cz) / d;
        if (Math.abs(u) > 0.5 || Math.abs(v) > 0.5) continue;
        if (a.y + dy * s < h.ground + heapEnvelope(u, v) * h.height) {
          out.add(h.id);
          break;
        }
      }
    }
  }

  /** 視線の下に入りうる立っているビル（外形を buildingSoft だけ広げて見る）。 */
  private collectBuildings(cam: { x: number; z: number }, target: { x: number; z: number }, L: number): void {
    const seen = new Set<number>();
    const steps = Math.max(1, Math.ceil(L / 40));
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      for (const b of this.index.buildingsNear(cam.x + (target.x - cam.x) * s, cam.z + (target.z - cam.z) * s, 40 + K.buildingSoft)) {
        if (seen.has(b.id)) continue;
        seen.add(b.id);
        if (this.byId.has(b.id)) continue;
        this.nearB.push(b);
      }
    }
  }

  /** (x, z) での立っているビルの高さ（外形の外 buildingSoft までは、離れるほど低くなだらかに）。無ければ -Infinity。 */
  private buildingTopAt(x: number, z: number): number {
    let best = -Infinity;
    for (const b of this.nearB) {
      const f = b.footprint;
      const ox = Math.max(f.x0 - x, 0, x - f.x1);
      const oz = Math.max(f.z0 - z, 0, z - f.z1);
      const out = Math.hypot(ox, oz);
      if (out >= K.buildingSoft) continue;
      const k = 1 - out / K.buildingSoft;
      const base = b.masses[0].y0;
      best = Math.max(best, base + (b.height - base) * k * k * (3 - 2 * k));
    }
    return best;
  }
}
