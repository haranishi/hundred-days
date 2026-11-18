/**
 * バナナの皮を仕掛ける：青果のバナナを持ち、アクションで食べて皮を足元（少し後ろ）に置く。1人2枚まで・40秒で消える。
 * 誰かが踏んだら滑って転ぶ（プレイヤー1.5秒・店員3秒）。自分以外が滑ったら200点（店員・店長なら400点）、自分以外を1回で達成。
 * 店員か店長が滑ったら、ひみつ「店員さんをバナナで滑らせる」+800。自分で踏んでも転ぶが点はない。客は皮を避けて歩く。
 * 台のバナナがなくなったら20秒で補充する。
 */
import { BANANA, PICKUP_RANGE } from '../../../shared/rules/tuning';
import type { PeelView } from '../../../shared/view';
import type { AvatarState, MisdeedSystem, Offer, PropState, SimContext } from '../types';

export interface Peel {
  id: number;
  owner: number;
  x: number;
  z: number;
  expiresAt: number;
  armedAt: number;
}

interface BananaMemo {
  peels: Peel[];
  nextId: number;
  refillAt: number | null;
}

function memo(ctx: SimContext): BananaMemo {
  let m = ctx.memo.get('banana') as BananaMemo | undefined;
  if (!m) {
    m = { peels: [], nextId: 0, refillAt: null };
    ctx.memo.set('banana', m);
  }
  return m;
}

export function activePeels(ctx: SimContext): readonly Peel[] {
  return memo(ctx).peels;
}

/** 拾えるバナナ（台の上か床の、だれも持っていない物） */
function bananaNear(ctx: SimContext, x: number, z: number): PropState | null {
  let best: PropState | null = null;
  let bestD = PICKUP_RANGE;
  for (const p of ctx.props) {
    if (p.def.kind !== 'banana' || p.hidden || p.heldBy !== null) continue;
    const c = ctx.propCenter(p);
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function holdingBanana(ctx: SimContext, av: AvatarState): boolean {
  return av.holding !== null && ctx.props[av.holding]?.def.kind === 'banana';
}

export const bananaSystem: MisdeedSystem = {
  id: 'banana',
  offer(ctx, av): Offer | null {
    if (av.ridingCart !== null) return null;
    if (holdingBanana(ctx, av)) {
      const mine = memo(ctx).peels.filter((p) => p.owner === av.slot).length;
      return { system: bananaSystem, priority: 60, prompt: { label: mine >= BANANA.maxPeels ? '皮を置く（古い皮は消える）' : `皮を置く（あと${BANANA.maxPeels - mine}枚）`, press: 'press', misdeed: 'banana' }, target: -1 };
    }
    if (av.holding !== null || !av.grounded) return null;
    const b = bananaNear(ctx, av.pos.x, av.pos.z);
    if (!b) return null;
    return { system: bananaSystem, priority: 38, prompt: { label: 'バナナを持つ', press: 'press', misdeed: 'banana' }, target: b.def.id };
  },
  act(ctx, av, offer) {
    if (offer.target < 0) dropPeel(ctx, av);
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
    m.peels = m.peels.filter((p) => p.expiresAt > ctx.time);
    if (ctx.phase === 'playing') {
      for (const peel of [...m.peels]) {
        if (ctx.time < peel.armedAt) continue;
        if (slipCheck(ctx, peel)) m.peels = m.peels.filter((p) => p !== peel);
      }
    }
    // 台のバナナが全部なくなったら補充
    const left = ctx.props.filter((p) => p.def.kind === 'banana' && !p.hidden).length;
    if (left === 0 && m.refillAt === null) m.refillAt = ctx.time + BANANA.refillAfter;
    if (m.refillAt !== null && ctx.time >= m.refillAt) {
      m.refillAt = null;
      for (const p of ctx.props) if (p.def.kind === 'banana' && p.heldBy === null) ctx.resetProp(p);
    }
  },
  peels(ctx, out: PeelView[]) {
    for (const p of memo(ctx).peels) out.push({ id: p.id, owner: p.owner, pos: { x: p.x, y: 0.01, z: p.z } });
  },
};

/** 持っているバナナを食べて、皮を後ろに置く */
export function dropPeel(ctx: SimContext, av: AvatarState): boolean {
  if (!holdingBanana(ctx, av)) return false;
  const m = memo(ctx);
  const banana = ctx.release(av)!;
  banana.hidden = true;
  banana.body.setEnabled(false);
  const mine = m.peels.filter((p) => p.owner === av.slot);
  if (mine.length >= BANANA.maxPeels) m.peels = m.peels.filter((p) => p !== mine[0]);
  const x = av.pos.x - Math.sin(av.yaw) * BANANA.dropBehind;
  const z = av.pos.z - Math.cos(av.yaw) * BANANA.dropBehind;
  m.peels.push({ id: m.nextId++, owner: av.slot, x, z, expiresAt: ctx.time + BANANA.peelLife, armedAt: ctx.time + BANANA.armDelay });
  ctx.playAction(av, 'eat', 0.4);
  ctx.emit({ t: 'sfx', name: 'eat', pos: { ...av.pos } });
  return true;
}

/** 皮の上に誰かいたら滑らせる。滑ったら true（皮はなくなる） */
function slipCheck(ctx: SimContext, peel: Peel): boolean {
  const pos = { x: peel.x, y: 0.2, z: peel.z };
  for (const av of ctx.avatars) {
    if (av.ridingCart !== null || av.stunned > 0 || av.script || !av.grounded || !av.connected) continue;
    if (Math.hypot(av.pos.x - peel.x, av.pos.z - peel.z) > BANANA.slipRadius) continue;
    ctx.stun(av, BANANA.playerSlip, 'slip');
    if (av.holding !== null) ctx.release(av);
    ctx.emit({ t: 'slip', slot: av.slot, npc: null, by: peel.owner, pos });
    ctx.emit({ t: 'sfx', name: 'slip', pos });
    if (av.slot !== peel.owner) {
      ctx.award(peel.owner, 'banana', BANANA.slipPoints, pos);
      ctx.progress(peel.owner, 'banana', 1);
    }
    return true;
  }
  for (const n of ctx.npcs) {
    if (!n.slip || Math.hypot(n.pos.x - peel.x, n.pos.z - peel.z) > BANANA.slipRadius) continue;
    if (!n.slip(ctx, peel.owner)) continue;
    ctx.emit({ t: 'slip', slot: null, npc: n.id, by: peel.owner, pos });
    ctx.emit({ t: 'sfx', name: 'slip', pos });
    ctx.award(peel.owner, 'banana', BANANA.slipClerkPoints, pos);
    ctx.progress(peel.owner, 'banana', 1);
    ctx.secret(peel.owner, 'secret-staff-slip');
    return true;
  }
  return false;
}

