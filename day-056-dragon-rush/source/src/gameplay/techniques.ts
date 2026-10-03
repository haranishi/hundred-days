// OWNER: gameplay
// 怪獣ごとの技のうち、時間をかけて続くもの（純データ・three を読まない）：雷の跳ね、落雷の輪、溶岩の礫、地割れ。
// どれもゲーム内時刻で予約し、刻みごとに順に当てる。予約は（時刻, 積んだ順）で並べるので、1倍と4倍で同じ結果になる。
// 当たりの形は既にある輪（applyRing）と建物への問い合わせ（shapes.ts）を組み合わせる。壊れ方の関数（damage.ts）は呼ぶだけ。
// r06-balance：地割れの道筋は E の瞬間に決める（fissurePath）。照準のまわりで建物を最も多く崩せる向きへ走り、向けた先に
// 建物が足りなければ全周から向きを選び直す（体験の採点 r05：地割れの4回に2回が空振り）。落雷の輪の1本は近くのいちばん高い建物へ落ちる。
import type { CreatureId, FissureSpec, LavaSpec, LightningSpec, ThunderSpec } from '../config/creatures';
import type { DamageCause } from '../core/events';
import { hash01 } from '../core/rng';
import type { Building } from '../world/types';
import { rightOf } from './aim';
import { applyRing, type CombatWorld } from './ring';
import { DEG, clamp, forwardOf, tuple, vec3, type Vec3 } from './math';
import { footprintDistance, rayGround, raycastBuildings, sphereTouchesBuilding } from './shapes';

type Pending =
  | { kind: 'hop'; at: number; seq: number; hop: number; from: Vec3; chain: number[]; damage: number; glass: number; spec: LightningSpec; creature: CreatureId }
  | { kind: 'bolt'; at: number; seq: number; index: number; x: number; z: number; y: number; spec: ThunderSpec; cause: DamageCause; creature: CreatureId }
  | { kind: 'crack'; at: number; seq: number; index: number; x: number; z: number; y: number; fissure: number; spec: FissureSpec; origin: Vec3; creature: CreatureId };

/** 飛んでいる溶岩の礫（位置・速さ・飛んだ秒数・予定の飛ぶ秒数） */
export interface Bomb {
  id: number;
  pos: Vec3;
  vel: Vec3;
  age: number;
  flight: number;
  spec: LavaSpec;
  creature: CreatureId;
}

/** 3体の違いを数字で示すための数え（受け入れ条件4）。やり直しで 0 に戻る。 */
export interface TechniqueStats {
  lightningShots: number;
  /** 建物から建物へ跳ねた回数（最初の建物に落ちた分は数えない） */
  lightningHops: number;
  /** 1発でいちばん多く跳ねた回数 */
  lightningMaxChain: number;
  thunderBolts: number;
  lavaBombs: number;
  lavaImpacts: number;
  fissures: number;
  /** 地割れの最初の裂け目から最後の裂け目までの、いちばん長い距離（m） */
  fissureMaxLength: number;
}

const emptyStats = (): TechniqueStats => ({ lightningShots: 0, lightningHops: 0, lightningMaxChain: 0, thunderBolts: 0, lavaBombs: 0, lavaImpacts: 0, fissures: 0, fissureMaxLength: 0 });

/** 外形どうしの隙間（m）。重なっていれば 0。 */
function footprintGap(a: Building, b: Building): number {
  const dx = Math.max(0, a.footprint.x0 - b.footprint.x1, b.footprint.x0 - a.footprint.x1);
  const dz = Math.max(0, a.footprint.z0 - b.footprint.z1, b.footprint.z0 - a.footprint.z1);
  return Math.hypot(dx, dz);
}

/** 地割れの道筋が問い合わせる口（立っている建物を近くから引く・湾の水の上か・崩れるまでに残っている耐久）。 */
export interface FissureWorld {
  index: { buildingsNear(x: number, z: number, radius: number): Building[]; surfaceAt(x: number, z: number): string };
  isStanding(id: number): boolean;
  /** 崩れるまでに残っている耐久（耐久 − 受けた損傷。1 以上） */
  remaining(id: number): number;
}

/** 地割れの裂け目1つの位置（横のぶれを足す前）と、その位置での進む向き。 */
export interface FissurePoint {
  x: number;
  z: number;
  yaw: number;
}

/** 裂けない地面（湾の水の上と街の外。techniques の crack と同じ判定） */
const unbreakable = (w: FissureWorld, x: number, z: number): boolean => {
  const s = w.index.surfaceAt(x, z);
  return s === 'water' || s === 'outside';
};

/** 向き yaw へまっすぐ走る道筋：裂けない地面に出たらそこで止まる（それより先の裂け目は置かない）。 */
function walkFissure(origin: { x: number; z: number }, yaw: number, spec: FissureSpec, w: FissureWorld): FissurePoint[] {
  const out: FissurePoint[] = [];
  const f = forwardOf(yaw);
  for (let k = 0; k < spec.segments; k++) {
    const along = spec.start + k * spec.spacing;
    const x = origin.x + f.x * along;
    const z = origin.z + f.z * along;
    if (unbreakable(w, x, z)) break;
    out.push({ x, z, yaw });
  }
  return out;
}

/**
 * 道筋の点：崩れると見込める体積（m³）。立っている建物ごとに、道筋の裂け目の輪から受ける損傷を applyRing と同じ (1 - (d/半径)^2) で足し、
 * 体積 × min(1, 損傷 ÷ 残りの耐久) を足し合わせる。かすめるだけの建物より、裂け目が真上を走って崩れる建物を重く見る
 */
function fissureScore(path: readonly FissurePoint[], spec: FissureSpec, w: FissureWorld): number {
  const R = spec.ring.radius;
  const taken = new Map<number, number>();
  const blds = new Map<number, Building>();
  for (const p of path) {
    for (const b of w.index.buildingsNear(p.x, p.z, R)) {
      if (!w.isStanding(b.id)) continue;
      const d = footprintDistance(b, p.x, p.z);
      if (d > R) continue;
      taken.set(b.id, (taken.get(b.id) ?? 0) + spec.ring.damage * (1 - (d / R) ** 2));
      blds.set(b.id, b);
    }
  }
  let sum = 0;
  for (const [id, dmg] of taken) sum += (blds.get(id) as Building).volume * Math.min(1, dmg / w.remaining(id));
  return sum;
}

/**
 * 地割れの道筋（r06-balance）：体の中心 origin から照準の向き yaw のまわりで走り出す向きを選び、最初の裂け目は start 先、以後 spacing ずつ。
 * 1. 照準の左右 seek.searchDeg 度を stepDeg 度ずつ試し、崩れると見込める体積（fissureScore）が最も大きい向き（照準に近いほど少し贔屓する）を選ぶ
 * 2. その向きで崩れると見込める体積が seek.fallbackVolume に届かなければ（向けた先に建物が無い・すぐ湾や街の外へ出る）、全周から選び直す
 * 道筋はまっすぐで、湾の水の上と街の外に出たら止まる。決まった街と壊れ方なら同じ道筋になる（乱数を使わない）。
 */
export function fissurePath(origin: { x: number; z: number }, yaw: number, spec: FissureSpec, w: FissureWorld): FissurePoint[] {
  const S = spec.seek;
  let best = walkFissure(origin, yaw, spec, w);
  let bestRaw = fissureScore(best, spec, w);
  if (S.stepDeg <= 0) return best;
  let bestScore = bestRaw;
  const tryDir = (offDeg: number, bias: number): void => {
    const path = walkFissure(origin, yaw + offDeg * DEG, spec, w);
    const raw = fissureScore(path, spec, w);
    const score = raw * (1 - bias);
    if (score > bestScore) {
      best = path;
      bestScore = score;
      bestRaw = raw;
    }
  };
  for (let k = 1; k * S.stepDeg <= S.searchDeg; k++) {
    for (const side of [1, -1]) tryDir(side * k * S.stepDeg, S.searchDeg > 0 ? (S.aimBias * k * S.stepDeg) / S.searchDeg : 0);
  }
  if (bestRaw >= S.fallbackVolume) return best;
  // 向けた先では裂ける建物が足りない：全周から選び直す（照準からのずれは問わない）
  bestScore = bestRaw;
  for (let k = Math.floor(S.searchDeg / S.stepDeg) + 1; k * S.stepDeg <= 180; k++) {
    for (const side of [1, -1]) tryDir(side * k * S.stepDeg, 0);
  }
  return best;
}

/** 建物 b の外形の上で、点 p にいちばん近い点（高さは建物の3〜9割に収める）。雷が落ちる点。 */
function strikePoint(b: Building, p: Vec3): Vec3 {
  const f = b.footprint;
  return vec3(clamp(p.x, f.x0, f.x1), clamp(p.y, b.height * 0.3, b.height * 0.9), clamp(p.z, f.z0, f.z1));
}

export class Techniques {
  readonly bombs: Bomb[] = [];
  stats: TechniqueStats = emptyStats();
  private pending: Pending[] = [];
  private seq = 0;
  private nextBomb = 0;
  private nextFissure = 0;
  /** 地割れごとの最初の裂け目（長さを測る）と、止まった地割れ */
  private readonly fissureStart = new Map<number, Vec3>();
  private readonly stopped = new Set<number>();

  reset(): void {
    this.bombs.length = 0;
    this.pending = [];
    this.seq = 0;
    this.nextBomb = 0;
    this.nextFissure = 0;
    this.fissureStart.clear();
    this.stopped.clear();
    this.stats = emptyStats();
  }

  /** 予約して、まだ当てていないものがあるか（撮影の場面作りとテストが待つ）。 */
  get busy(): boolean {
    return this.pending.length > 0 || this.bombs.length > 0;
  }

  private push(p: Pending): void {
    // 時刻の順（同じ時刻なら積んだ順）に差し込む
    let i = this.pending.length;
    while (i > 0 && this.pending[i - 1].at > p.at) i--;
    this.pending.splice(i, 0, p);
  }

  /**
   * 雷を撃つ：口 m から向き d へ芯を伸ばし、最初に当たった建物に落とす（外れたら地面か、届く距離の先）。
   * 建物に当たったら、その建物から近いビルへの跳ねを hopDelay 秒後に予約する。戻り値は当たったもの。
   */
  fireLightning(t: number, m: Vec3, d: Vec3, groundY: number, spec: LightningSpec, from: { x: number; z: number }, w: CombatWorld, creature: CreatureId): 'building' | 'ground' | null {
    this.stats.lightningShots++;
    const hit = raycastBuildings(w.index, m, d, spec.range, (b) => w.damage.isStanding(b.id));
    const ground = rayGround(m, d, groundY, spec.range);
    if (hit && (ground < 0 || hit.t <= ground)) {
      const b = hit.building;
      const p = strikePoint(b, vec3(m.x + d.x * hit.t, m.y + d.y * hit.t, m.z + d.z * hit.t));
      this.strike(t, 0, m, b, p, spec.damage, spec.glass, from, w, creature);
      if (spec.hops > 0) this.push({ kind: 'hop', at: t + spec.hopDelay, seq: this.seq++, hop: 1, from: p, chain: [b.id], damage: spec.damage * spec.falloff, glass: spec.glass * spec.falloff, spec, creature });
      w.impact(spec.hitStop, spec.shake);
      w.cue('hit');
      return 'building';
    }
    const reach = ground >= 0 ? ground : spec.range;
    const to = vec3(m.x + d.x * reach, ground >= 0 ? groundY : m.y + d.y * reach, m.z + d.z * reach);
    w.bus.emit('lightning.hop', { t, creature, hop: 0, from: tuple(m), to: tuple(to), id: -1, damage: 0 });
    w.cue('miss');
    return ground >= 0 ? 'ground' : null;
  }

  /** 1本の雷を建物 b の点 p に当てる（燃やさず、窓を割る）。 */
  private strike(t: number, hop: number, from: Vec3, b: Building, p: Vec3, damage: number, glass: number, attacker: { x: number; z: number }, w: CombatWorld, creature: CreatureId): void {
    w.damage.hit(b.id, damage, { cause: 'lightning', fromX: attacker.x, fromZ: attacker.z, y: p.y, player: true });
    const panes = w.damage.breakGlass(b.id, Math.min(1, w.damage.glass[b.id] + glass));
    if (panes > 0) w.bus.emit('glass.shatter', { t, id: b.id, pos: tuple(p), count: panes });
    w.bus.emit('lightning.hop', { t, creature, hop, from: tuple(from), to: tuple(p), id: b.id, damage });
  }

  /** 跳ね：前の建物から外形の隙間 hopRadius 以内の、まだこの雷が当たっていない立っている建物のうち、いちばん近いもの。 */
  private hop(t: number, p: Extract<Pending, { kind: 'hop' }>, w: CombatWorld): void {
    const prev = w.city.buildings[p.chain[p.chain.length - 1]];
    const f = prev.footprint;
    const cx = (f.x0 + f.x1) / 2;
    const cz = (f.z0 + f.z1) / 2;
    const reach = Math.hypot(f.x1 - f.x0, f.z1 - f.z0) / 2 + p.spec.hopRadius;
    let best: Building | null = null;
    let bestGap = Infinity;
    for (const b of w.index.buildingsNear(cx, cz, reach)) {
      if (!w.damage.isStanding(b.id) || p.chain.includes(b.id)) continue;
      const gap = footprintGap(prev, b);
      if (gap > p.spec.hopRadius) continue;
      if (gap < bestGap || (gap === bestGap && best && b.id < best.id)) {
        best = b;
        bestGap = gap;
      }
    }
    if (!best) return;
    const to = strikePoint(best, p.from);
    // 倒れる向きは、前の建物から跳ねてきた向き
    this.strike(t, p.hop, p.from, best, to, p.damage, p.glass, { x: cx, z: cz }, w, p.creature);
    this.stats.lightningHops++;
    this.stats.lightningMaxChain = Math.max(this.stats.lightningMaxChain, p.hop);
    if (p.hop < p.spec.hops) {
      this.push({ ...p, at: p.at + p.spec.hopDelay, seq: this.seq++, hop: p.hop + 1, from: to, chain: [...p.chain, best.id], damage: p.damage * p.spec.falloff, glass: p.glass * p.spec.falloff });
    }
  }

  /** 落雷の輪：中心 (cx, cz) から ringRadius の輪の上に count 本を delay 秒ずつ遅らせて予約する。 */
  thunderRing(t: number, cx: number, cz: number, groundY: number, spec: ThunderSpec, cause: DamageCause, creature: CreatureId): void {
    for (let k = 0; k < spec.count; k++) {
      const a = (k / spec.count) * Math.PI * 2 + 0.35;
      this.push({ kind: 'bolt', at: t + k * spec.delay, seq: this.seq++, index: k, x: cx + Math.cos(a) * spec.ringRadius, z: cz + Math.sin(a) * spec.ringRadius, y: groundY, spec, cause, creature });
    }
  }

  /** 落雷の輪の1本：落ちる点のまわり seekRadius の中でいちばん高い立っている建物の真上に落ちる（無ければ輪の上の点）。 */
  private bolt(t: number, p: Extract<Pending, { kind: 'bolt' }>, w: CombatWorld): void {
    let x = p.x;
    let y = p.y;
    let z = p.z;
    const R = p.spec.seekRadius;
    if (R > 0) {
      let best: Building | null = null;
      for (const b of w.index.buildingsNear(p.x, p.z, R)) {
        if (!w.damage.isStanding(b.id) || footprintDistance(b, p.x, p.z) > R) continue;
        if (!best || b.height > best.height || (b.height === best.height && b.id < best.id)) best = b;
      }
      if (best) {
        x = (best.footprint.x0 + best.footprint.x1) / 2;
        z = (best.footprint.z0 + best.footprint.z1) / 2;
        y = best.height;
      }
    }
    const hits = applyRing(w, t, x, z, p.spec.strike, p.cause);
    this.stats.thunderBolts++;
    w.bus.emit('lightning.bolt', { t, creature: p.creature, pos: [x, y, z], index: p.index, hits });
    w.impact(hits > 0 ? p.spec.strike.hitStop : null, p.spec.strike.shake * (p.index === 0 ? 1 : 0.35));
    if (hits > 0) w.cue('hit');
  }

  /** 溶岩の礫を投げる：from から target へ、距離で決めた秒数で放物線に届く速さで。届く距離の外なら range の所へ投げる。 */
  launchLava(t: number, from: Vec3, target: Vec3, spec: LavaSpec, w: CombatWorld, creature: CreatureId): Bomb {
    let tx = target.x - from.x;
    let ty = target.y - from.y;
    let tz = target.z - from.z;
    const d3 = Math.hypot(tx, ty, tz);
    if (d3 > spec.range) {
      const k = spec.range / d3;
      tx *= k;
      ty *= k;
      tz *= k;
    }
    const dist = Math.hypot(tx, tz);
    const T = clamp(spec.flight.base + spec.flight.perMeter * dist, spec.flight.min, spec.flight.max);
    const vel = vec3(tx / T, (ty + 0.5 * spec.gravity * T * T) / T, tz / T);
    const bomb: Bomb = { id: this.nextBomb++, pos: vec3(from.x, from.y, from.z), vel, age: 0, flight: T, spec, creature };
    this.bombs.push(bomb);
    this.stats.lavaBombs++;
    w.bus.emit('lava.launch', { t, creature, id: bomb.id, pos: tuple(from), vel: tuple(vel), flight: T });
    return bomb;
  }

  private moveBombs(dt: number, t: number, w: CombatWorld): void {
    for (let i = 0; i < this.bombs.length; ) {
      const b = this.bombs[i];
      const s = b.spec;
      b.age += dt;
      b.vel.y -= s.gravity * dt;
      b.pos.x += b.vel.x * dt;
      b.pos.y += b.vel.y * dt;
      b.pos.z += b.vel.z * dt;
      const gy = w.groundAt(b.pos.x, b.pos.z);
      let at: Vec3 | null = null;
      if (b.pos.y <= gy + s.bombRadius * 0.5) at = vec3(b.pos.x, gy, b.pos.z);
      else {
        const near = w.index.buildingsNear(b.pos.x, b.pos.z, s.bombRadius).sort((p, q) => p.id - q.id);
        if (near.some((o) => w.damage.isStanding(o.id) && sphereTouchesBuilding(o, b.pos.x, b.pos.y, b.pos.z, s.bombRadius))) at = vec3(b.pos.x, b.pos.y, b.pos.z);
      }
      if (!at && b.age > b.flight + 2) at = vec3(b.pos.x, Math.max(gy, b.pos.y), b.pos.z);
      if (!at) {
        i++;
        continue;
      }
      this.bombs.splice(i, 1);
      this.explode(t, b, at, w);
    }
  }

  /** 礫が弾けた：輪の当たり（当たった高さで）と、まわりの建物への着火。 */
  private explode(t: number, b: Bomb, at: Vec3, w: CombatWorld): void {
    const s = b.spec;
    const hits = applyRing(w, t, at.x, at.z, s.ring, 'lava', at.y);
    for (const o of w.index.buildingsNear(at.x, at.z, s.igniteRadius).sort((p, q) => p.id - q.id)) {
      if (!w.damage.isStanding(o.id)) continue;
      w.fire.addHeat(o.id, s.heat, Math.max(at.y, o.masses[0].y0 + 2), w.damage, w.ignitions);
    }
    this.stats.lavaImpacts++;
    w.bus.emit('lava.impact', { t, creature: b.creature, id: b.id, pos: tuple(at), hits });
    w.impact(hits > 0 ? s.ring.hitStop : null, s.ring.shake);
    if (hits > 0) w.cue('hit');
  }

  /**
   * 地割れ：体の中心 origin から照準の向き yaw のまわりへ、道筋（fissurePath）に沿って裂け目の輪の当たりを delay 秒ずつ遅らせて予約する。
   * 出来事 fissure.start の pos は最初の裂け目、dir は走る向き、length と segments は湾や街の外で止まるまでの長さと数。
   */
  fissure(t: number, origin: Vec3, yaw: number, spec: FissureSpec, w: CombatWorld, creature: CreatureId): void {
    const id = this.nextFissure++;
    this.stats.fissures++;
    const D = w.damage;
    const path = fissurePath(origin, yaw, spec, { index: w.index, isStanding: (b) => D.isStanding(b), remaining: (b) => Math.max(1, D.hp[b] - D.damage[b]) });
    // 足もとから先がすぐ湾なら、最初の1つだけ置いて止める（crack が水の上で地割れを止める。前と同じ振る舞い）
    if (path.length === 0) {
      const f = forwardOf(yaw);
      path.push({ x: origin.x + f.x * spec.start, z: origin.z + f.z * spec.start, yaw });
    }
    const f0 = forwardOf(path[0].yaw);
    const start = vec3(path[0].x, origin.y, path[0].z);
    w.bus.emit('fissure.start', { t, creature, id, pos: tuple(start), dir: [f0.x, 0, f0.z], length: (path.length - 1) * spec.spacing, segments: path.length });
    for (let k = 0; k < path.length; k++) {
      const p = path[k];
      const r = rightOf(p.yaw);
      const side = k === 0 ? 0 : (k % 2 === 0 ? 1 : -1) * spec.wobble * (0.5 + 0.5 * hash01(id, k, 911));
      this.push({ kind: 'crack', at: t + k * spec.delay, seq: this.seq++, index: k, x: p.x + r.x * side, z: p.z + r.z * side, y: origin.y, fissure: id, spec, origin: start, creature });
    }
  }

  private crack(t: number, p: Extract<Pending, { kind: 'crack' }>, w: CombatWorld): void {
    if (this.stopped.has(p.fissure)) return;
    const surface = w.index.surfaceAt(p.x, p.z);
    // 湾の水の上と街の外では裂けない（そこで地割れが止まる）
    if (surface === 'water' || surface === 'outside') {
      this.stopped.add(p.fissure);
      return;
    }
    const y = w.groundAt(p.x, p.z);
    const hits = applyRing(w, t, p.x, p.z, p.spec.ring, 'fissure');
    if (p.index === 0) this.fissureStart.set(p.fissure, vec3(p.x, y, p.z));
    const first = this.fissureStart.get(p.fissure);
    if (first) this.stats.fissureMaxLength = Math.max(this.stats.fissureMaxLength, Math.hypot(p.x - first.x, p.z - first.z));
    w.bus.emit('fissure.crack', { t, creature: p.creature, id: p.fissure, pos: [p.x, y, p.z], index: p.index, hits });
    w.impact(hits > 0 ? p.spec.ring.hitStop : null, p.spec.ring.shake * (1 - (0.6 * p.index) / p.spec.segments));
    if (hits > 0) w.cue('hit');
  }

  /** 1刻み：時刻 t までの予約を順に当て、飛んでいる礫を進める。 */
  update(dt: number, t: number, w: CombatWorld): void {
    while (this.pending.length > 0 && this.pending[0].at <= t + 1e-9) {
      const p = this.pending.shift() as Pending;
      if (p.kind === 'hop') this.hop(t, p, w);
      else if (p.kind === 'bolt') this.bolt(t, p, w);
      else this.crack(t, p, w);
    }
    this.moveBombs(dt, t, w);
  }
}
