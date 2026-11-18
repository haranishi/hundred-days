/**
 * 呼び出しベル：サービスカウンターの前でアクションを連打。1回20点。
 * 0.12秒より速い連打は数えない。点になるのは10秒のうちに20回まで（ずっと押し続けて稼げないように）。
 */
import { BELL } from '../../../shared/rules/tuning';
import type { AvatarState, MisdeedSystem, Offer, SimContext } from '../types';

interface BellMemo {
  last: Map<number, number>;
  rings: Map<number, number[]>;
}

function memo(ctx: SimContext): BellMemo {
  let m = ctx.memo.get('bell') as BellMemo | undefined;
  if (!m) {
    m = { last: new Map(), rings: new Map() };
    ctx.memo.set('bell', m);
  }
  return m;
}

export function bellPos(ctx: SimContext): { x: number; y: number; z: number } {
  const bell = ctx.layout.fixtures.find((f) => f.kind === 'bell')!;
  return { x: bell.pos.x, y: bell.pos.y + 0.15, z: bell.pos.z };
}

export const bellSystem: MisdeedSystem = {
  id: 'bell',
  offer(ctx, av): Offer | null {
    if (av.ridingCart !== null) return null;
    const p = ctx.layout.places.bell;
    if (Math.hypot(av.pos.x - p.x, av.pos.z - p.z) > BELL.range) return null;
    return { system: bellSystem, priority: 40, prompt: { label: '鳴らす', press: 'mash', misdeed: 'bell' }, target: 0 };
  },
  act(ctx, av) {
    ring(ctx, av);
  },
};

/** 1回鳴らす。点が入れば true */
export function ring(ctx: SimContext, av: AvatarState): boolean {
  const m = memo(ctx);
  const now = ctx.time;
  const last = m.last.get(av.slot) ?? -Infinity;
  if (now - last < BELL.minInterval) return false;
  m.last.set(av.slot, now);
  const pos = bellPos(ctx);
  av.yaw = Math.atan2(pos.x - av.pos.x, pos.z - av.pos.z);
  ctx.playAction(av, 'bell', 0.2);
  ctx.emit({ t: 'sfx', name: 'bell', pos });
  const recent = (m.rings.get(av.slot) ?? []).filter((t) => now - t < BELL.window);
  if (recent.length >= BELL.maxInWindow) {
    m.rings.set(av.slot, recent);
    return false;
  }
  recent.push(now);
  m.rings.set(av.slot, recent);
  // 数に入る1回だけ、悪事の最中（コンボの猶予を止める）。上限を超えた空打ちでは止めない
  ctx.engage(av);
  if (!ctx.award(av.slot, 'bell', BELL.points, pos)) return false;
  ctx.progress(av.slot, 'bell', 1);
  return true;
}

/** この人がいま鳴らして点になる回数の残り（10秒の枠の中） */
export function bellRingsLeft(ctx: SimContext, slot: number): number {
  const recent = (memo(ctx).rings.get(slot) ?? []).filter((t) => ctx.time - t < BELL.window);
  return BELL.maxInWindow - recent.length;
}
