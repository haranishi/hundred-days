/**
 * お菓子売り場で駄々をこねる：お菓子の通路の中で止まって、アクションを長押し。床で手足をばたばた。
 * 毎秒100点（1回3秒まで）。3秒こねたら達成。3秒こねたら、次に点が入るまで5秒あける。
 * 押してすぐの「なぎ払う」と取り合わないよう、0.3秒押し続けてから始まる（案内より先に、押している長さで決める）。
 */
import { TANTRUM } from '../../../shared/rules/tuning';
import type { AvatarState, MisdeedSystem, Offer, SimContext } from '../types';

interface TantrumMemo {
  held: Map<number, number>;
  secs: Map<number, number>;
  awarded: Map<number, number>;
  cooldownUntil: Map<number, number>;
}

function memo(ctx: SimContext): TantrumMemo {
  let m = ctx.memo.get('tantrum') as TantrumMemo | undefined;
  if (!m) {
    m = { held: new Map(), secs: new Map(), awarded: new Map(), cooldownUntil: new Map() };
    ctx.memo.set('tantrum', m);
  }
  return m;
}

export function inSnackAisle(ctx: SimContext, x: number, z: number): boolean {
  const r = ctx.layout.zones.snackAisle;
  return x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
}

function canTantrum(ctx: SimContext, av: AvatarState): boolean {
  if (av.ridingCart !== null || av.holding !== null || av.stunned > 0 || av.script || !av.grounded) return false;
  if (!inSnackAisle(ctx, av.pos.x, av.pos.z)) return false;
  return Math.hypot(av.input.moveX, av.input.moveZ) < 0.2 && Math.hypot(av.vel.x, av.vel.z) < TANTRUM.stillSpeed;
}

/** いま駄々をこねている秒（HUD の案内用） */
export function tantrumSeconds(ctx: SimContext, slot: number): number {
  return memo(ctx).secs.get(slot) ?? 0;
}

export const tantrumSystem: MisdeedSystem = {
  id: 'tantrum',
  offer(ctx, av): Offer | null {
    if (!canTantrum(ctx, av)) return null;
    const m = memo(ctx);
    const secs = m.secs.get(av.slot) ?? 0;
    // こねている間だけ「1.5/3秒」を出す（離した後・休みの間に 0.0 へ戻って見えないように）
    const counting = secs > 0;
    // 看板の真下（床の黄色い輪の中）では、棚の「なぎ払う」より先に出す。そのほかは、通路の真ん中でほかに何もないときの案内
    const p = ctx.layout.places.tantrum;
    const underSign = Math.hypot(av.pos.x - p.x, av.pos.z - p.z) <= TANTRUM.promptRange;
    return { system: tantrumSystem, priority: underSign ? 25 : 5, prompt: { label: '駄々をこねる', press: 'hold', ...(counting ? { progress: Math.min(1, secs / TANTRUM.maxSeconds) } : {}), misdeed: 'tantrum' }, target: 0 };
  },
  postStep(ctx, dt) {
    if (ctx.phase !== 'playing') return;
    const m = memo(ctx);
    for (const av of ctx.avatars) {
      const ok = av.input.action && canTantrum(ctx, av);
      if (!ok) {
        m.held.delete(av.slot);
        m.secs.delete(av.slot);
        m.awarded.delete(av.slot);
        continue;
      }
      const held = (m.held.get(av.slot) ?? 0) + dt;
      m.held.set(av.slot, held);
      const cooling = ctx.time < (m.cooldownUntil.get(av.slot) ?? -Infinity);
      // 押し始め（0.3秒）から、点が入る間は悪事の最中（コンボの猶予を止める）
      if (!cooling && (m.awarded.get(av.slot) ?? 0) < TANTRUM.maxSeconds) ctx.engage(av);
      if (held < TANTRUM.holdDelay) continue;
      ctx.playAction(av, 'tantrum', 0.15);
      if (cooling) continue;
      const awarded = m.awarded.get(av.slot) ?? 0;
      if (awarded >= TANTRUM.maxSeconds) continue;
      const secs = (m.secs.get(av.slot) ?? 0) + dt;
      m.secs.set(av.slot, secs);
      let a = awarded;
      while (a < Math.min(TANTRUM.maxSeconds, Math.floor(secs + 1e-6))) {
        a++;
        ctx.award(av.slot, 'tantrum', TANTRUM.pointsPerSecond, { x: av.pos.x, y: av.pos.y + 1.2, z: av.pos.z });
        ctx.emit({ t: 'sfx', name: 'tantrum', pos: { ...av.pos } });
      }
      m.awarded.set(av.slot, a);
      ctx.progressMax(av.slot, 'tantrum', a >= TANTRUM.maxSeconds ? TANTRUM.maxSeconds : Math.min(TANTRUM.maxSeconds, secs));
      if (a >= TANTRUM.maxSeconds) m.cooldownUntil.set(av.slot, ctx.time + TANTRUM.cooldown);
    }
  },
};
