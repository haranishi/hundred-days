/**
 * 店内放送をジャックする：奥の放送ブースのマイクの前で、アクションを2秒長押し。
 * +500（目立ち度+40）・1回で達成。店員は全員ブースへ向かい10秒は誰も追わない。客は3秒止まる。
 * 字幕は {t:'pa', text}。文言はいくつかの中から選ぶ（オリジナル。実在の店の放送は使わない）。
 */
import { PA } from '../../../shared/rules/tuning';
import type { AvatarState, MisdeedSystem, Offer, SimContext } from '../types';

export const PA_TEXTS: readonly string[] = [
  '本日はきちんと堂にご来店いただき、ありがとうございません！',
  'ただいまより、店内の商品はすべて床に置いてあります。',
  '迷子のお知らせです。きちんとさを見失ったお客様がいらっしゃいます。',
  '本日の特売は、この放送そのものです。',
  '店長、店長、至急レジまで……いえ、やっぱり来ないでください。',
  'お客様にお願いいたします。もっと好き勝手にお買い物ください。',
];

interface PaMemo {
  holding: Map<number, number>;
  activeSlot: number | null;
  cooldownUntil: number;
  /** 店員がブースに引きつけられている間 */
  lureUntil: number;
}

function memo(ctx: SimContext): PaMemo {
  let m = ctx.memo.get('pa') as PaMemo | undefined;
  if (!m) {
    m = { holding: new Map(), activeSlot: null, cooldownUntil: -Infinity, lureUntil: -Infinity };
    ctx.memo.set('pa', m);
  }
  return m;
}

/** 放送で店員がブースに引きつけられている間か */
export function paLureActive(ctx: SimContext): boolean {
  return ctx.time < memo(ctx).lureUntil;
}

export function paReady(ctx: SimContext): boolean {
  return ctx.time >= memo(ctx).cooldownUntil;
}

export const paSystem: MisdeedSystem = {
  id: 'pa',
  offer(ctx, av): Offer | null {
    if (av.ridingCart !== null || av.holding !== null) return null;
    const p = ctx.layout.places.pa;
    if (Math.hypot(av.pos.x - p.x, av.pos.z - p.z) > p.r) return null;
    const m = memo(ctx);
    if (!paReady(ctx)) return { system: paSystem, priority: 45, prompt: { label: `放送はあと${Math.ceil(m.cooldownUntil - ctx.time)}秒`, press: 'hold', progress: 0, misdeed: 'pa' }, target: -1 };
    return { system: paSystem, priority: 45, prompt: { label: '放送する', press: 'hold', progress: (m.holding.get(av.slot) ?? 0) / PA.holdTime, misdeed: 'pa' }, target: 0 };
  },
  hold(ctx, av, offer, dt) {
    if (offer.target < 0) return;
    holdMic(ctx, av, dt);
  },
  postStep(ctx) {
    const m = memo(ctx);
    // 離したら最初から（長押しは続けて押している間だけ進む）
    for (const [slot] of m.holding) {
      const av = ctx.avatarBySlot(slot);
      if (!av || !av.input.action || av.offer?.system !== paSystem) m.holding.delete(slot);
    }
    if (m.activeSlot !== null && !m.holding.has(m.activeSlot)) m.activeSlot = null;
  },
  stations(ctx, out) {
    const m = memo(ctx);
    const prog = m.activeSlot !== null ? (m.holding.get(m.activeSlot) ?? 0) / PA.holdTime : 0;
    out.pa = { activeSlot: m.activeSlot, holdProgress: Math.min(1, prog), cooldown: Math.max(0, m.cooldownUntil - ctx.time) };
  },
};

/** マイクを持って長押しする。放送できたら true */
export function holdMic(ctx: SimContext, av: AvatarState, dt: number): boolean {
  const m = memo(ctx);
  if (!paReady(ctx)) return false;
  const mic = ctx.layout.fixtures.find((f) => f.kind === 'mic')!;
  av.yaw = Math.atan2(mic.pos.x - av.pos.x, mic.pos.z - av.pos.z);
  ctx.playAction(av, 'pa', 0.2);
  ctx.engage(av);
  const t = (m.holding.get(av.slot) ?? 0) + dt;
  m.holding.set(av.slot, t);
  m.activeSlot = av.slot;
  if (t < PA.holdTime) return false;
  m.holding.clear();
  m.activeSlot = null;
  m.cooldownUntil = ctx.time + PA.cooldown;
  m.lureUntil = ctx.time + PA.lureTime;
  const pos = { x: mic.pos.x, y: 1.6, z: mic.pos.z };
  ctx.emit({ t: 'sfx', name: 'pa-chime', pos, volume: 1 });
  ctx.emit({ t: 'pa', slot: av.slot, text: ctx.fx.pick(PA_TEXTS) });
  ctx.award(av.slot, 'pa', PA.points, pos, 1, PA.heat);
  ctx.progress(av.slot, 'pa', 1);
  for (const n of ctx.npcs) n.onPa?.(ctx, av.slot);
  return true;
}
