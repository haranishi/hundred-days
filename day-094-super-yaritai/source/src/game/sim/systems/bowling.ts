/**
 * スイカでボウリング：日用品の通路の手前にスイカのワゴン（6玉）、奥にトイレットペーパーのピン10本。
 * スイカを持ち、アクションで転がす。ピン1本50点、1投で全部倒せば+500。1投で5本以上倒したら達成。
 * 「1投」：転がしてから6秒のうちに、そのスイカ（から引き継いだ物）で倒れたピンを数える。
 * ピンは最後に倒れてから8秒で並び直し、ワゴンが空になって15秒でスイカを補充する。
 */
import { BOWLING, PICKUP_RANGE } from '../../../shared/rules/tuning';
import type { AvatarState, MisdeedSystem, Offer, PropState, SimContext } from '../types';

interface Throw {
  slot: number;
  t: number;
  pins: number;
}

interface BowlingMemo {
  pins: PropState[];
  melons: PropState[];
  down: Set<number>;
  lastDownAt: number;
  throws: Throw[];
  refillAt: number | null;
  /** 転がっているスイカと、その向き・まっすぐ保つ期限 */
  rolling: { prop: PropState; dx: number; dz: number; until: number }[];
}

function memo(ctx: SimContext): BowlingMemo {
  let m = ctx.memo.get('bowling') as BowlingMemo | undefined;
  if (!m) {
    m = {
      pins: ctx.props.filter((p) => p.def.kind === 'pin'),
      melons: ctx.props.filter((p) => p.def.kind === 'watermelon'),
      down: new Set(),
      lastDownAt: 0,
      throws: [],
      refillAt: null,
      rolling: [],
    };
    ctx.memo.set('bowling', m);
  }
  return m;
}

/** ワゴンの上に残っているスイカ */
function onWagon(ctx: SimContext, p: PropState): boolean {
  if (p.hidden || p.heldBy !== null) return false;
  const w = ctx.layout.fixtures.find((f) => f.kind === 'wagon')!;
  const c = ctx.propCenter(p);
  return Math.abs(c.x - w.pos.x) < w.size.x / 2 && Math.abs(c.z - w.pos.z) < w.size.z / 2 && c.y > w.size.y - 0.05;
}

export function melonsOnWagon(ctx: SimContext): number {
  return memo(ctx).melons.filter((p) => onWagon(ctx, p)).length;
}

function melonNear(ctx: SimContext, x: number, z: number): PropState | null {
  let best: PropState | null = null;
  let bestD = PICKUP_RANGE + 0.3;
  for (const p of memo(ctx).melons) {
    if (p.hidden || p.heldBy !== null) continue;
    const c = ctx.propCenter(p);
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function holdingMelon(ctx: SimContext, av: AvatarState): boolean {
  return av.holding !== null && ctx.props[av.holding]?.def.kind === 'watermelon';
}

export const bowlingSystem: MisdeedSystem = {
  id: 'bowling',
  offer(ctx, av): Offer | null {
    if (av.ridingCart !== null) return null;
    if (holdingMelon(ctx, av)) {
      // レーンの中では←→で向きを合わせられる（Simulation.aimingMelon と同じ範囲）ので、案内に添える
      const lane = ctx.layout.places.lane;
      const pins = ctx.layout.places.pins;
      const inLane = Math.abs(av.pos.x - lane.x) <= BOWLING.laneHalfWidth && av.pos.z <= lane.z + 2.5 && av.pos.z >= pins.z + 1.0;
      return { system: bowlingSystem, priority: 60, prompt: { label: inLane ? '転がす（←→で向き）' : '転がす', press: 'press', misdeed: 'bowling' }, target: -1 };
    }
    if (av.holding !== null || !av.grounded) return null;
    const p = melonNear(ctx, av.pos.x, av.pos.z);
    if (!p) return null;
    return { system: bowlingSystem, priority: 38, prompt: { label: 'スイカを持つ', press: 'press', misdeed: 'bowling' }, target: p.def.id };
  },
  act(ctx, av, offer) {
    if (offer.target < 0) roll(ctx, av);
    else {
      const p = ctx.props[offer.target];
      if (p && p.heldBy === null && !p.hidden) {
        ctx.hold(av, p);
        ctx.playAction(av, 'pick-up', 0.3);
        ctx.emit({ t: 'sfx', name: 'pick-up', pos: { ...av.pos } });
      }
    }
  },
  postStep(ctx) {
    const m = memo(ctx);
    keepStraight(ctx, m);
    m.throws = m.throws.filter((t) => ctx.time - t.t <= BOWLING.throwWindow);
    for (const pin of m.pins) {
      if (m.down.has(pin.def.id) || pin.locked || !pin.moved) continue;
      m.down.add(pin.def.id);
      m.lastDownAt = ctx.time;
      const c = ctx.propCenter(pin);
      ctx.emit({ t: 'sfx', name: 'pin', pos: c });
      // 倒した人の、いちばん新しい1投に数える
      const thr = [...m.throws].reverse().find((t) => t.slot === pin.owner);
      if (!thr || ctx.phase !== 'playing') continue;
      thr.pins++;
      ctx.award(thr.slot, 'bowling', BOWLING.pinPoints, { x: c.x, y: c.y + 0.8, z: c.z });
      ctx.progressMax(thr.slot, 'bowling', thr.pins);
      if (thr.pins === m.pins.length) ctx.award(thr.slot, 'bowling', BOWLING.strikeBonus, { x: c.x, y: c.y + 1.2, z: c.z }, 0);
    }
    // ピンは最後に倒れてから8秒で並び直す
    if (m.down.size > 0 && ctx.time - m.lastDownAt >= BOWLING.pinsResetAfter) {
      for (const pin of m.pins) ctx.resetProp(pin);
      m.down.clear();
      ctx.emit({ t: 'reset', station: 'bowling' });
    }
    // ワゴンが空になったら15秒でスイカを補充（持っている物はそのまま）
    const left = m.melons.filter((p) => onWagon(ctx, p)).length;
    if (left === 0 && m.refillAt === null) m.refillAt = ctx.time + BOWLING.refillAfter;
    if (left > 0) m.refillAt = null;
    if (m.refillAt !== null && ctx.time >= m.refillAt) {
      m.refillAt = null;
      for (const p of m.melons) if (p.heldBy === null) ctx.resetProp(p);
      ctx.emit({ t: 'reset', station: 'watermelons' });
    }
  },
  stations(ctx, out) {
    const m = memo(ctx);
    out.bowling = { pinsDown: m.down.size, resetIn: m.down.size > 0 ? Math.max(0, BOWLING.pinsResetAfter - (ctx.time - m.lastDownAt)) : 0 };
    out.watermelons = { left: m.melons.filter((p) => onWagon(ctx, p)).length, refillIn: m.refillAt === null ? 0 : Math.max(0, m.refillAt - ctx.time) };
  },
};

/**
 * 転がしたスイカは、ピンに当たっても横へそれにくい（点線のとおりに押し通る）。
 * 横の速さを毎刻み減らし、ピンを抜けるまでは前への速さを minRollSpeed より落とさない
 */
function keepStraight(ctx: SimContext, m: BowlingMemo): void {
  if (m.rolling.length === 0) return;
  const pins = ctx.layout.places.pins;
  m.rolling = m.rolling.filter((r) => {
    const p = r.prop;
    if (ctx.time > r.until || p.hidden || p.heldBy !== null) return false;
    const v = p.body.linvel();
    const along = v.x * r.dx + v.z * r.dz;
    if (along < 0.3) return false;
    const c = ctx.propCenter(p);
    // ピンの並びの向こう（奥）へ抜けたら、もう速さは足さない
    const beyond = (c.x - pins.x) * r.dx + (c.z - pins.z) * r.dz > 1.2;
    const keep = beyond ? along : Math.max(along, BOWLING.minRollSpeed);
    const sx = v.x - r.dx * along;
    const sz = v.z - r.dz * along;
    p.body.setLinvel({ x: r.dx * keep + sx * BOWLING.sideKeep, y: v.y, z: r.dz * keep + sz * BOWLING.sideKeep }, true);
    return true;
  });
}

/** 持っているスイカを前へ転がす */
export function roll(ctx: SimContext, av: AvatarState): boolean {
  if (!holdingMelon(ctx, av)) return false;
  const p = ctx.release(av)!;
  const fx = Math.sin(av.yaw);
  const fz = Math.cos(av.yaw);
  const r = p.def.size.x / 2;
  // 足元の少し前に置き直してから、転がる向きの回転をつけて押し出す
  p.body.setTranslation({ x: av.pos.x + fx * 0.75, y: av.pos.y + 0.03, z: av.pos.z + fz * 0.75 }, true);
  ctx.launch(p, { x: fx * BOWLING.rollSpeed, y: 0, z: fz * BOWLING.rollSpeed }, { x: (fz * BOWLING.rollSpeed) / r, y: 0, z: (-fx * BOWLING.rollSpeed) / r }, av.slot);
  memo(ctx).throws.push({ slot: av.slot, t: ctx.time, pins: 0 });
  // レーンから転がしたものだけ、ピンの間をまっすぐ押し通す（ほかの所で転がしたスイカはふつうに転がる）
  const lane = ctx.layout.places.lane;
  if (Math.abs(av.pos.x - lane.x) <= BOWLING.laneHalfWidth && Math.abs(fz) > 0.5) memo(ctx).rolling.push({ prop: p, dx: fx, dz: fz, until: ctx.time + BOWLING.straightTime });
  ctx.playAction(av, 'throw', 0.4);
  ctx.emit({ t: 'sfx', name: 'roll', pos: { ...av.pos } });
  return true;
}
