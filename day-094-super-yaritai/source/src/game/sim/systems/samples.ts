/**
 * 試食を食べ尽くす：パン売り場の横の試食台（ウインナー8本）。台の前でアクションを連打。
 * 1本30点（目立ち度は1本+8）、皿を空にした人に+300。8本食べたら達成。空になって20秒で補充する。
 * 試食は物理の商品ではなく、台の上の本数（見え方の stations.samples.left）だけで表す。
 */
import { SAMPLES } from '../../../shared/rules/tuning';
import type { AvatarState, MisdeedSystem, Offer, SimContext } from '../types';

interface SamplesMemo {
  left: number;
  refillAt: number | null;
  lastBite: Map<number, number>;
}

function memo(ctx: SimContext): SamplesMemo {
  let m = ctx.memo.get('samples') as SamplesMemo | undefined;
  if (!m) {
    m = { left: SAMPLES.count, refillAt: null, lastBite: new Map() };
    ctx.memo.set('samples', m);
  }
  return m;
}

export function samplesLeft(ctx: SimContext): number {
  return memo(ctx).left;
}

export const samplesSystem: MisdeedSystem = {
  id: 'samples',
  offer(ctx, av): Offer | null {
    if (av.ridingCart !== null || av.holding !== null) return null;
    const p = ctx.layout.places.samples;
    if (Math.hypot(av.pos.x - p.x, av.pos.z - p.z) > p.r) return null;
    if (memo(ctx).left <= 0) return null;
    return { system: samplesSystem, priority: 40, prompt: { label: '食べる', press: 'mash', misdeed: 'samples' }, target: 0 };
  },
  act(ctx, av) {
    bite(ctx, av);
  },
  postStep(ctx) {
    const m = memo(ctx);
    if (m.left <= 0 && m.refillAt !== null && ctx.time >= m.refillAt) {
      m.left = SAMPLES.count;
      m.refillAt = null;
      ctx.emit({ t: 'reset', station: 'samples' });
    }
  },
  stations(ctx, out) {
    const m = memo(ctx);
    out.samples = { left: m.left, refillIn: m.refillAt === null ? 0 : Math.max(0, m.refillAt - ctx.time) };
  },
};

/** 1本食べる。食べたら true */
export function bite(ctx: SimContext, av: AvatarState): boolean {
  const m = memo(ctx);
  if (m.left <= 0) return false;
  const last = m.lastBite.get(av.slot) ?? -Infinity;
  if (ctx.time - last < SAMPLES.biteInterval) return false;
  m.lastBite.set(av.slot, ctx.time);
  ctx.engage(av);
  const table = ctx.layout.fixtures.find((f) => f.kind === 'sample-table')!;
  av.yaw = Math.atan2(table.pos.x - av.pos.x, table.pos.z - av.pos.z);
  ctx.playAction(av, 'eat', 0.3);
  m.left -= 1;
  const pos = { x: table.pos.x, y: table.size.y + 0.3, z: table.pos.z };
  ctx.emit({ t: 'sfx', name: 'eat', pos });
  ctx.award(av.slot, 'samples', SAMPLES.points, pos, 1, SAMPLES.heat);
  ctx.progress(av.slot, 'samples', 1);
  if (m.left === 0) {
    ctx.award(av.slot, 'samples', SAMPLES.allBonus, pos, 0);
    m.refillAt = ctx.time + SAMPLES.refillAfter;
  }
  return true;
}
