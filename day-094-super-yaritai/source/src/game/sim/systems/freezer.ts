/**
 * 冷凍ケースで涼む：奥の平台の冷凍ケース（中に入れる形）。ジャンプして中に入ると、毎秒100点（1回3秒まで）。
 * 3秒続けて入ったら達成。3秒涼んだら、次に点が入るまで5秒あける。
 * ジャンプでも入れるが、近くでアクションを押すと決まった弧で飛び込む（スマホでも確実に入れるように）。
 * 出るときは「出る」のボタンか、移動キーを0.3秒押し続ける（その向きへ飛び出す）。
 * 飛び込みは自分の動きなので、参加者の端末（self）でも回す。点は部屋の主（full）だけが数える。
 */
import type { Fixture } from '../../../shared/layout/store';
import { FREEZER } from '../../../shared/rules/tuning';
import type { AvatarState, MisdeedSystem, Offer, SimContext } from '../types';

interface Session {
  secs: number;
  awarded: number;
}

interface FreezerMemo {
  boxes: Fixture[];
  sessions: Map<number, Session>;
  cooldownUntil: Map<number, number>;
  inside: Set<number>;
  /** 中で移動キーを押し続けている秒 */
  exitHeld: Map<number, number>;
}

function memo(ctx: SimContext): FreezerMemo {
  let m = ctx.memo.get('freezer') as FreezerMemo | undefined;
  if (!m) {
    m = { boxes: ctx.layout.fixtures.filter((f) => f.kind === 'freezer'), sessions: new Map(), cooldownUntil: new Map(), inside: new Set(), exitHeld: new Map() };
    ctx.memo.set('freezer', m);
  }
  return m;
}

/** 中の床の高さと、中の広さ（壁の内側） */
const WALL = 0.23;

/** この位置は冷凍ケースの中か（中の床の上） */
export function freezerAt(ctx: SimContext, x: number, y: number, z: number): Fixture | null {
  for (const f of memo(ctx).boxes) {
    if (Math.abs(x - f.pos.x) < f.size.x / 2 - WALL + 0.05 && Math.abs(z - f.pos.z) < f.size.z / 2 - WALL + 0.05 && y < f.size.y - 0.15) return f;
  }
  return null;
}

/** 冷凍ケースの外側までの距離 */
function boxDistance(f: Fixture, x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x - f.pos.x) - f.size.x / 2);
  const dz = Math.max(0, Math.abs(z - f.pos.z) - f.size.z / 2);
  return Math.hypot(dx, dz);
}

/**
 * 「入る」の行き先：いちばん近い、ほかの人が入っていない冷凍ケース（全部ふさがっていれば、いちばん近いもの）。
 * d は、いちばん近い冷凍ケースまでの距離（案内を出すかどうかに使う）。どの向きから来ても入れる
 */
function pickFreezer(ctx: SimContext, av: AvatarState): { f: Fixture; d: number } | null {
  const boxes = memo(ctx).boxes;
  if (boxes.length === 0) return null;
  const busy = new Set<Fixture>();
  for (const o of ctx.avatars) {
    if (o === av) continue;
    const f = freezerAt(ctx, o.pos.x, o.pos.y, o.pos.z);
    if (f) busy.add(f);
  }
  const sorted = [...boxes].sort((a, b) => boxDistance(a, av.pos.x, av.pos.z) - boxDistance(b, av.pos.x, av.pos.z));
  const d = boxDistance(sorted[0]!, av.pos.x, av.pos.z);
  const f = sorted.find((b) => !busy.has(b) && boxDistance(b, av.pos.x, av.pos.z) <= d + 2.5) ?? sorted[0]!;
  return { f, d };
}

export const freezerSystem: MisdeedSystem = {
  id: 'freezer',
  local: true,
  offer(ctx, av): Offer | null {
    if (av.ridingCart !== null || av.holding !== null || av.script) return null;
    const m = memo(ctx);
    if (m.inside.has(av.slot)) {
      // 秒を数えている間だけ「1.5/3秒」を出す（数え終わった後・休みの間に 0.0 へ戻って見えないように）
      const s = m.sessions.get(av.slot);
      const counting = s && s.secs > 0 && s.awarded < FREEZER.maxSeconds;
      return { system: freezerSystem, priority: 90, prompt: { label: '出る', press: 'press', misdeed: 'freezer', ...(counting ? { progress: Math.min(1, s.secs / FREEZER.maxSeconds) } : {}) }, target: -1 };
    }
    if (!av.grounded) return null;
    const n = pickFreezer(ctx, av);
    if (!n || n.d > FREEZER.hopRange) return null;
    return { system: freezerSystem, priority: 35, prompt: { label: '入る', press: 'press', misdeed: 'freezer' }, target: m.boxes.indexOf(n.f) };
  },
  act(ctx, av, offer) {
    if (offer.target < 0) hopOut(ctx, av);
    else {
      const f = memo(ctx).boxes[offer.target];
      if (f) hopIn(ctx, av, f);
    }
  },
  postStep(ctx, dt) {
    const m = memo(ctx);
    m.inside.clear();
    for (const av of ctx.avatars) {
      const f = av.script ? null : freezerAt(ctx, av.pos.x, av.pos.y, av.pos.z);
      if (!f) {
        // 出たら数え直し（「3秒続けて」なので）
        m.sessions.delete(av.slot);
        m.exitHeld.delete(av.slot);
        continue;
      }
      m.inside.add(av.slot);
      ctx.playAction(av, 'chill', 0.1);
      // 移動キーを押し続けたら、その向きへ飛び出す（参加者のキャラは本人の端末が動かす）
      if (!av.puppet && av.stunned <= 0) {
        const mx = av.input.moveX;
        const mz = av.input.moveZ;
        if (Math.hypot(mx, mz) > 0.5) {
          const held = (m.exitHeld.get(av.slot) ?? 0) + dt;
          m.exitHeld.set(av.slot, held);
          if (held >= FREEZER.exitHold) {
            m.exitHeld.delete(av.slot);
            hopOut(ctx, av, { x: mx, z: mz });
            continue;
          }
        } else m.exitHeld.delete(av.slot);
      }
      if (ctx.phase !== 'playing' || ctx.time < (m.cooldownUntil.get(av.slot) ?? -Infinity)) continue;
      const s = m.sessions.get(av.slot) ?? { secs: 0, awarded: 0 };
      m.sessions.set(av.slot, s);
      if (s.awarded >= FREEZER.maxSeconds) continue;
      ctx.engage(av);
      s.secs += dt;
      while (s.awarded < Math.min(FREEZER.maxSeconds, Math.floor(s.secs + 1e-6))) {
        s.awarded++;
        ctx.award(av.slot, 'freezer', FREEZER.pointsPerSecond, { x: av.pos.x, y: av.pos.y + 1.6, z: av.pos.z });
        ctx.emit({ t: 'sfx', name: 'freezer', pos: { ...av.pos } });
      }
      // 3秒まで数えきったら、端数の誤差があっても3秒とみなす
      ctx.progressMax(av.slot, 'freezer', s.awarded >= FREEZER.maxSeconds ? FREEZER.maxSeconds : Math.min(FREEZER.maxSeconds, s.secs));
      if (s.awarded >= FREEZER.maxSeconds) {
        m.cooldownUntil.set(av.slot, ctx.time + FREEZER.cooldown);
        m.sessions.delete(av.slot);
      }
    }
  },
  stations(ctx, out) {
    out.freezerSlots = [...memo(ctx).inside];
  },
};

function startHop(ctx: SimContext, av: AvatarState, to: { x: number; y: number; z: number }): void {
  av.script = { from: { ...av.pos }, to, t0: ctx.time, dur: FREEZER.hopTime, height: 1.05 };
  av.yaw = Math.atan2(to.x - av.pos.x, to.z - av.pos.z);
  av.vel = { x: 0, y: 0, z: 0 };
  ctx.emit({ t: 'sfx', name: 'jump', pos: { ...av.pos } });
}

export function hopIn(ctx: SimContext, av: AvatarState, f: Fixture): void {
  // 中の床（壁の高さの内側）の、いちばん近い所へ
  const hx = f.size.x / 2 - WALL - 0.32;
  const hz = f.size.z / 2 - WALL - 0.3;
  const x = Math.max(f.pos.x - hx, Math.min(f.pos.x + hx, av.pos.x));
  const z = Math.max(f.pos.z - hz, Math.min(f.pos.z + hz, av.pos.z));
  startHop(ctx, av, { x, y: WALL + 0.02, z });
  // 飛び込んでいる間も、悪事の最中（コンボの猶予を止める）
  ctx.engage(av);
}

/** 外へ飛び出す。dir（移動キーの向き）があれば、その向きのいちばん近い辺から */
export function hopOut(ctx: SimContext, av: AvatarState, dir?: { x: number; z: number }): void {
  const f = freezerAt(ctx, av.pos.x, av.pos.y, av.pos.z);
  if (!f) return;
  if (dir) {
    const hx = f.size.x / 2;
    const hz = f.size.z / 2;
    const cx = Math.max(f.pos.x - hx + 0.3, Math.min(f.pos.x + hx - 0.3, av.pos.x));
    const cz = Math.max(f.pos.z - hz + 0.3, Math.min(f.pos.z + hz - 0.3, av.pos.z));
    const sides = [
      { nx: 0, nz: 1, x: cx, z: f.pos.z + hz + 0.75 },
      { nx: 0, nz: -1, x: cx, z: f.pos.z - hz - 0.75 },
      { nx: 1, nz: 0, x: f.pos.x + hx + 0.75, z: cz },
      { nx: -1, nz: 0, x: f.pos.x - hx - 0.75, z: cz },
    ]
      .map((s) => ({ ...s, dot: s.nx * dir.x + s.nz * dir.z }))
      .filter((s) => s.dot > 0.2 && ctx.nav.isFree(s.x, s.z))
      .sort((a, b) => b.dot - a.dot);
    const best = sides[0];
    if (best) {
      startHop(ctx, av, { x: best.x, y: 0.02, z: best.z });
      return;
    }
  }
  // 前後（長い辺）のうち、歩ける方へ飛び出す
  const out = [f.pos.z + f.size.z / 2 + 0.75, f.pos.z - f.size.z / 2 - 0.75]
    .map((z) => ({ x: av.pos.x, z }))
    .filter((p) => ctx.nav.isFree(p.x, p.z));
  const to = out[0] ?? ctx.nav.nearestFree(av.pos.x, f.pos.z + f.size.z / 2 + 0.75) ?? { x: av.pos.x, z: f.pos.z + f.size.z / 2 + 0.9 };
  startHop(ctx, av, { x: to.x, y: 0.02, z: to.z });
}
