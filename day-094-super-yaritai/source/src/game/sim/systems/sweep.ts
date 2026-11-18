/**
 * なぎ払い：棚の面から1.4m以内で棚を向いてアクション。目の前の幅2.2mの商品に、外向き＋上向きの速さと回転を与える。
 * 印を付けた商品が床に落ちたら kind='sweep' で数える（数えるのは Simulation の「落ちた判定」）。
 */
import type { ShelfFace } from '../../../shared/layout/store';
import { SWEEP } from '../../../shared/rules/tuning';
import type { AvatarState, MisdeedSystem, Offer, PropState, SimContext } from '../types';

const MEMO_PLANES = 'sweep:planes';

/** 同じ面の上（同じ列の同じ側）の商品をまとめておく。棚の台の継ぎ目をまたいでも一緒になぎ払えるように */
function planeKey(face: ShelfFace): string {
  return face.nx !== 0 ? `x${face.nx}:${face.x.toFixed(2)}` : `z${face.nz}:${face.z.toFixed(2)}`;
}

function planes(ctx: SimContext): Map<string, PropState[]> {
  let m = ctx.memo.get(MEMO_PLANES) as Map<string, PropState[]> | undefined;
  if (!m) {
    m = new Map();
    for (const p of ctx.props) {
      if (!p.face || p.def.kind !== 'product') continue;
      const k = planeKey(p.face);
      const list = m.get(k) ?? [];
      list.push(p);
      m.set(k, list);
    }
    ctx.memo.set(MEMO_PLANES, m);
  }
  return m;
}

/** 面に沿った位置（面の中心からの距離） */
function alongOf(face: ShelfFace, x: number, z: number): number {
  // 面に沿う向き t＝(−nz, nx)
  return (x - face.x) * -face.nz + (z - face.z) * face.nx;
}

/** 目の前の、まだ置かれたままの商品 */
export function sweepTargets(ctx: SimContext, face: ShelfFace, x: number, z: number): PropState[] {
  const list = planes(ctx).get(planeKey(face)) ?? [];
  const me = alongOf(face, x, z);
  return list.filter((p) => !p.hidden && !p.locked && !p.moved && Math.abs(alongOf(face, p.def.home.pos.x, p.def.home.pos.z) - me) <= SWEEP.width / 2);
}

/** 届く棚の面（いちばん近いもの） */
export function reachableFace(ctx: SimContext, x: number, z: number, yaw: number): ShelfFace | null {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  let best: ShelfFace | null = null;
  let bestD = Infinity;
  for (const face of ctx.layout.faces) {
    const d = (x - face.x) * face.nx + (z - face.z) * face.nz;
    if (d < -0.25 || d > SWEEP.reach) continue;
    if (Math.abs(alongOf(face, x, z)) > face.halfLen + 0.5) continue;
    // 棚に背を向けているときは使わない（向かいの棚と取り違えないため）
    if (fx * -face.nx + fz * -face.nz < -0.35) continue;
    if (d < bestD) {
      bestD = d;
      best = face;
    }
  }
  return best;
}

export const sweepSystem: MisdeedSystem = {
  id: 'sweep',
  offer(ctx, av): Offer | null {
    if (av.ridingCart !== null || av.holding !== null || !av.grounded) return null;
    const face = reachableFace(ctx, av.pos.x, av.pos.z, av.yaw);
    if (!face || sweepTargets(ctx, face, av.pos.x, av.pos.z).length === 0) return null;
    return { system: sweepSystem, priority: 20, prompt: { label: 'なぎ払う', press: 'press', misdeed: 'sweep' }, target: face.id };
  },
  act(ctx, av, offer) {
    const face = ctx.layout.faces[offer.target];
    if (!face) return;
    sweep(ctx, av, face);
  },
};

/** なぎ払う。飛ばした商品の数を返す（冷めている間は -1） */
export function sweep(ctx: SimContext, av: AvatarState, face: ShelfFace): number {
  if (!ctx.cooldownReady(av, 'sweep')) return -1;
  ctx.setCooldown(av, 'sweep', SWEEP.cooldown);
  // 棚の方を向く
  av.yaw = Math.atan2(-face.nx, -face.nz);
  ctx.playAction(av, 'sweep');
  const targets = sweepTargets(ctx, face, av.pos.x, av.pos.z);
  const swing = ctx.fx.chance(0.5) ? 1 : -1;
  const tx = -face.nz;
  const tz = face.nx;
  for (const p of targets) {
    const out = ctx.fx.range(SWEEP.outSpeed[0], SWEEP.outSpeed[1]);
    const along = swing * Math.abs(ctx.fx.range(SWEEP.alongSpeed[0], SWEEP.alongSpeed[1]));
    ctx.launch(
      p,
      { x: face.nx * out + tx * along, y: ctx.fx.range(SWEEP.upSpeed[0], SWEEP.upSpeed[1]), z: face.nz * out + tz * along },
      { x: ctx.fx.range(-SWEEP.spin, SWEEP.spin), y: ctx.fx.range(-SWEEP.spin, SWEEP.spin), z: ctx.fx.range(-SWEEP.spin, SWEEP.spin) },
      av.slot,
    );
    p.sweepSlot = av.slot;
    p.sweepT = ctx.time;
  }
  if (targets.length > 0) ctx.emit({ t: 'sfx', name: 'crash', pos: { x: face.x, y: 1, z: face.z }, volume: Math.min(1, 0.4 + targets.length * 0.1) });
  return targets.length;
}
