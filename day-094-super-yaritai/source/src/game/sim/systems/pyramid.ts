/**
 * 缶ピラミッド：特売台に缶30個（下から8・7・6・5・4）。缶が定位置から動いたら1個15点（最後に触った人へ）。
 * 8割（24個）が動いたら「崩れた」：+500と達成。25秒後にふわっと積み直す（対戦で取り合いにならないように）。
 * ひみつ：カートに乗ったまま突っ込み、2秒以内に缶10個以上が動いたら +800。
 * 「蹴る」の案内が出ていれば、缶まで遠くても一歩踏み込んでから蹴る（案内と届く範囲をそろえる。round3 の C1）。
 */
import { FALL, KICK, PYRAMID } from '../../../shared/rules/tuning';
import { yawQuat } from '../physics';
import type { AvatarState, MisdeedSystem, Offer, PropState, SimContext } from '../types';
import { kick } from './kick';
import { MEMO_CART_STRIKE } from './cart';

interface PyramidMemo {
  cans: PropState[];
  counted: Set<number>;
  collapsed: boolean;
  collapsedAt: number;
  lastMoveAt: number;
  /** この組み上がりで、誰が何個崩したか（+500を誰に渡すか） */
  pointsBy: Map<number, number>;
  rebuild: { start: number; from: { x: number; y: number; z: number; q: { x: number; y: number; z: number; w: number } }[] } | null;
  strike: { slot: number; t: number; hits: number } | null;
  /** 踏み込み中の人と、蹴る時刻 */
  lunges: Map<number, number>;
}

function memo(ctx: SimContext): PyramidMemo {
  let m = ctx.memo.get('pyramid') as PyramidMemo | undefined;
  if (!m) {
    m = { cans: ctx.props.filter((p) => p.def.kind === 'can'), counted: new Set(), collapsed: false, collapsedAt: 0, lastMoveAt: 0, pointsBy: new Map(), rebuild: null, strike: null, lunges: new Map() };
    ctx.memo.set('pyramid', m);
  }
  return m;
}

export function pyramidStanding(ctx: SimContext): boolean {
  const m = memo(ctx);
  return !m.collapsed && m.rebuild === null;
}

const needed = (m: PyramidMemo): number => Math.ceil(m.cans.length * PYRAMID.collapseRatio);

export const pyramidSystem: MisdeedSystem = {
  id: 'pyramid',
  init(ctx) {
    memo(ctx);
  },
  offer(ctx, av): Offer | null {
    if (av.ridingCart !== null || av.holding !== null) return null;
    const p = ctx.layout.places.pyramid;
    if (Math.hypot(av.pos.x - p.x, av.pos.z - p.z) > PYRAMID.promptRange) return null;
    if (!pyramidStanding(ctx)) return null;
    return { system: pyramidSystem, priority: 15, prompt: { label: '蹴る', press: 'press', misdeed: 'pyramid' }, target: 0 };
  },
  act(ctx, av) {
    kickPyramid(ctx, av);
  },
  preStep(ctx) {
    // 踏み込み終わったら蹴る（途中で捕まった・置き直された人は取りやめ）
    const m = memo(ctx);
    for (const [slot, at] of m.lunges) {
      const av = ctx.avatarBySlot(slot);
      // 着地（弧が終わる）まで待つ
      if (av && (ctx.time < at || av.script) && av.stunned <= 0) continue;
      m.lunges.delete(slot);
      if (!av || av.stunned > 0 || !pyramidStanding(ctx)) continue;
      av.cooldowns.kick = -Infinity;
      kickCans(ctx, av);
    }
  },
  postStep(ctx) {
    const m = memo(ctx);
    if (m.rebuild) {
      animateRebuild(ctx, m);
      return;
    }
    const strikeInfo = ctx.memo.get(MEMO_CART_STRIKE) as { slot: number; t: number } | undefined;
    // 突っ込んだ最初の瞬間から2秒を数える（当たり続けている間に数え直さない）
    if (strikeInfo && (!m.strike || strikeInfo.slot !== m.strike.slot || strikeInfo.t - m.strike.t > 2)) m.strike = { slot: strikeInfo.slot, t: strikeInfo.t, hits: 0 };
    for (const can of m.cans) {
      if (m.counted.has(can.def.id) || !can.moved || can.locked) continue;
      m.counted.add(can.def.id);
      m.lastMoveAt = ctx.time;
      const pos = ctx.propCenter(can);
      ctx.emit({ t: 'sfx', name: 'can', pos });
      const owner = can.owner !== null && ctx.time - can.touchT <= FALL.ownerWindow ? can.owner : null;
      if (owner === null) continue;
      if (ctx.award(owner, 'pyramid', PYRAMID.canPoints, pos)) m.pointsBy.set(owner, (m.pointsBy.get(owner) ?? 0) + 1);
      if (m.strike && m.strike.slot === owner && ctx.time - m.strike.t <= 2) {
        m.strike.hits += 1;
        if (m.strike.hits >= 10) ctx.secret(owner, 'secret-cart-strike');
      }
    }
    if (!m.collapsed && m.counted.size >= needed(m)) {
      m.collapsed = true;
      m.collapsedAt = ctx.time;
      // いちばん多く崩した人に +500 と達成
      let best: number | null = null;
      let bestN = 0;
      for (const [slot, n] of m.pointsBy) if (n > bestN) [best, bestN] = [slot, n];
      if (best !== null) {
        const base = ctx.layout.pyramidBase;
        const pos = { x: base.x, y: base.y + 1, z: base.z };
        ctx.emit({ t: 'sfx', name: 'crash', pos, volume: 1 });
        ctx.award(best, 'pyramid', PYRAMID.collapseBonus, pos);
        ctx.achieve(best, 'pyramid');
      }
    }
    // 崩れてから25秒、または崩れかけのまま25秒だれも触らなければ積み直す
    const idle = m.counted.size > 0 && ctx.time - m.lastMoveAt >= PYRAMID.rebuildAfter;
    if ((m.collapsed && ctx.time - m.collapsedAt >= PYRAMID.rebuildAfter) || (!m.collapsed && idle)) startRebuild(ctx, m);
  },
  stations(ctx, out) {
    const m = memo(ctx);
    out.pyramid = {
      collapsed: m.collapsed || m.rebuild !== null,
      rebuildIn: m.collapsed ? Math.max(0, PYRAMID.rebuildAfter - (ctx.time - m.collapsedAt)) : 0,
    };
  },
};

/** 立っている缶のうち、水平にいちばん近いものと、その距離 */
function nearestCan(m: PyramidMemo, x: number, z: number): { c: PropState; d: number } | null {
  let best: { c: PropState; d: number } | null = null;
  for (const c of m.cans) {
    if (c.moved || c.locked) continue;
    const d = Math.hypot(c.def.home.pos.x - x, c.def.home.pos.z - z);
    if (!best || d < best.d) best = { c, d };
  }
  return best;
}

/**
 * 缶ピラミッドの前の「蹴る」。缶まで遠ければ、台の手前まで一歩（弧で）踏み込んでから蹴る。
 * ネットの参加者（puppet）は位置を本人の端末が決めるので踏み込まず、その場から届かせる
 */
export function kickPyramid(ctx: SimContext, av: AvatarState): void {
  const m = memo(ctx);
  if (!ctx.cooldownReady(av, 'kick') || m.lunges.has(av.slot)) return;
  const near = nearestCan(m, av.pos.x, av.pos.z);
  if (near && near.d > PYRAMID.kickReach && !av.puppet && !av.script) {
    const to = lungeTarget(ctx, av, near.c);
    if (to) {
      const dist = Math.hypot(to.x - av.pos.x, to.z - av.pos.z);
      const dur = Math.max(0.12, Math.min(0.3, dist / PYRAMID.lungeSpeed));
      av.script = { from: { ...av.pos }, to: { x: to.x, y: av.pos.y, z: to.z }, t0: ctx.time, dur, height: PYRAMID.lungeHeight };
      av.yaw = Math.atan2(near.c.def.home.pos.x - av.pos.x, near.c.def.home.pos.z - av.pos.z);
      av.vel = { x: 0, y: 0, z: 0 };
      ctx.setCooldown(av, 'kick', dur + KICK.cooldown);
      m.lunges.set(av.slot, ctx.time + dur);
      return;
    }
  }
  kickCans(ctx, av, av.puppet !== null);
}

/** 缶から kickReach より少し手前の、台に重ならない歩ける所 */
function lungeTarget(ctx: SimContext, av: AvatarState, can: PropState): { x: number; z: number } | null {
  const table = ctx.layout.fixtures.find((f) => f.kind === 'sale-table');
  const h = can.def.home.pos;
  const dx = av.pos.x - h.x;
  const dz = av.pos.z - h.z;
  const len = Math.max(0.01, Math.hypot(dx, dz));
  for (const back of [PYRAMID.kickReach - 0.25, PYRAMID.kickReach, PYRAMID.kickReach + 0.25]) {
    let x = h.x + (dx / len) * back;
    let z = h.z + (dz / len) * back;
    // 台の上には乗らない：台の外形＋キャラの半径の外へ出す
    if (table) {
      const hx = table.size.x / 2 + 0.36;
      const hz = table.size.z / 2 + 0.36;
      const rx = x - table.pos.x;
      const rz = z - table.pos.z;
      if (Math.abs(rx) < hx && Math.abs(rz) < hz) {
        if (hx - Math.abs(rx) < hz - Math.abs(rz)) x = table.pos.x + Math.sign(rx || dx) * hx;
        else z = table.pos.z + Math.sign(rz || dz) * hz;
      }
    }
    if (ctx.nav.isFree(x, z) && Math.hypot(x - av.pos.x, z - av.pos.z) < len) return { x, z };
  }
  return null;
}

/** 蹴って、近い下の段の缶を跳ばす（anyRange：遠くても届かせる＝参加者用） */
function kickCans(ctx: SimContext, av: AvatarState, anyRange = false): void {
  const m = memo(ctx);
  const base = ctx.layout.pyramidBase;
  av.yaw = Math.atan2(base.x - av.pos.x, base.z - av.pos.z);
  if (kick(ctx, av) < 0) return;
  const standing = m.cans.filter((c) => !c.moved && !c.locked);
  if (standing.length === 0) return;
  // 当たる所：缶の並び（台の上に東西1列）の真ん中寄り。斜めや横から来ても、真ん中の下を抜けば全体が崩れる
  const xs = standing.map((c) => c.def.home.pos.x);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  const hitX = mid + (Math.max(Math.min(...xs), Math.min(Math.max(...xs), av.pos.x)) - mid) * PYRAMID.kickAim;
  // 残っている缶の下の2段から、当たる所に近い順に kickCans 個。下を抜けば上の段はつられて崩れる（1回で8割に届く）
  const ys = [...new Set(standing.map((c) => Math.round(c.def.home.pos.y * 100) / 100))].sort((a, b) => a - b);
  const topOfLow = (ys[1] ?? ys[0]!) + 0.01;
  const targets = standing
    .filter((c) => c.def.home.pos.y <= topOfLow)
    .filter((c) => anyRange || Math.hypot(c.def.home.pos.x - av.pos.x, c.def.home.pos.z - av.pos.z) < PYRAMID.promptRange + 0.6)
    .sort((a, b) => Math.abs(a.def.home.pos.x - hitX) - Math.abs(b.def.home.pos.x - hitX))
    .slice(0, PYRAMID.kickCans);
  for (const c of targets) {
    const dx = c.def.home.pos.x - av.pos.x;
    const dz = c.def.home.pos.z - av.pos.z;
    const len = Math.max(0.01, Math.hypot(dx, dz));
    const speed = ctx.fx.range(KICK.forwardSpeed[0], KICK.forwardSpeed[1]);
    // 列に沿って押すだけだと隣の缶に押し返されて崩れないので、列の外（南北）へも跳ばす
    const along = Math.abs(dz / len) > 0.35;
    const vz = along ? (dz / len) * speed : (ctx.fx.chance(0.5) ? 1 : -1) * ctx.fx.range(2.5, 4);
    const vx = (dx / len) * speed * (along ? 1 : 0.7) + ctx.fx.range(-0.8, 0.8);
    ctx.launch(c, { x: vx, y: ctx.fx.range(1.5, 2.6), z: vz }, { x: ctx.fx.range(-8, 8), y: 0, z: ctx.fx.range(-8, 8) }, av.slot);
  }
}

function startRebuild(ctx: SimContext, m: PyramidMemo): void {
  m.rebuild = {
    start: ctx.time,
    from: m.cans.map((c) => {
      const t = c.body.translation();
      const q = c.body.rotation();
      return { x: t.x, y: t.y, z: t.z, q: { x: q.x, y: q.y, z: q.z, w: q.w } };
    }),
  };
  for (const c of m.cans) {
    c.locked = true;
    c.body.setBodyType(ctx.R.RigidBodyType.KinematicPositionBased, true);
  }
}

function animateRebuild(ctx: SimContext, m: PyramidMemo): void {
  const r = m.rebuild!;
  const k = Math.min(1, (ctx.time - r.start) / PYRAMID.rebuildTime);
  const e = 1 - (1 - k) ** 3;
  m.cans.forEach((c, i) => {
    const f = r.from[i]!;
    const h = c.def.home;
    const hq = yawQuat(h.yaw);
    c.body.setNextKinematicTranslation({ x: f.x + (h.pos.x - f.x) * e, y: f.y + (h.pos.y - f.y) * e + Math.sin(Math.PI * k) * 0.8, z: f.z + (h.pos.z - f.z) * e });
    c.body.setNextKinematicRotation(nlerp(f.q, hq, e));
  });
  if (k < 1) return;
  for (const c of m.cans) {
    const h = c.def.home;
    c.body.setBodyType(ctx.R.RigidBodyType.Dynamic, false);
    c.body.setTranslation(h.pos, false);
    c.body.setRotation(yawQuat(h.yaw), false);
    c.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
    c.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
    c.body.sleep();
    c.locked = false;
    c.moved = false;
    c.scored = false;
    c.owner = null;
  }
  m.rebuild = null;
  m.counted.clear();
  m.pointsBy.clear();
  m.collapsed = false;
  m.strike = null;
  ctx.emit({ t: 'reset', station: 'pyramid' });
}

function nlerp(a: { x: number; y: number; z: number; w: number }, b: { x: number; y: number; z: number; w: number }, t: number): { x: number; y: number; z: number; w: number } {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const s = dot < 0 ? -1 : 1;
  const x = a.x + (b.x * s - a.x) * t;
  const y = a.y + (b.y * s - a.y) * t;
  const z = a.z + (b.z * s - a.z) * t;
  const w = a.w + (b.w * s - a.w) * t;
  const len = Math.hypot(x, y, z, w) || 1;
  return { x: x / len, y: y / len, z: z / len, w: w / len };
}
