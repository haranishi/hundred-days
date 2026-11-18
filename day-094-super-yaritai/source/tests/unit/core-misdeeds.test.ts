/**
 * 第2波の悪事6つ・ひみつ2つ・店員と客（Node で Rapier を回す）。
 */
import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/game/sim/Simulation';
import type { Clerk } from '../../src/game/sim/ai/clerk';
import { yawQuat } from '../../src/game/sim/physics';
import { EMPTY_INPUT, type InputState } from '../../src/shared/input';
import { BANANA, CLERK, MATCH, PA, SAMPLES } from '../../src/shared/rules/tuning';
import type { GameEvent } from '../../src/shared/view';

const H = 1 / 60;

async function sim2(seed = 3, npcs = false): Promise<Simulation> {
  const sim = await Simulation.create({
    seed,
    npcs,
    players: [
      { slot: 0, kind: 'human', name: 'あなた', character: 'ch/character-female-b' },
      { slot: 1, kind: 'human', name: 'あいて', character: 'ch/character-male-f' },
    ],
  });
  sim.runFor(MATCH.countdown + 0.05);
  return sim;
}

function feed(sim: Simulation, slot: number, input: Partial<InputState>, seconds: number, events?: GameEvent[]): void {
  for (let i = 0; i < Math.max(1, Math.round(seconds / H)); i++) {
    sim.setInput(slot, { ...EMPTY_INPUT, ...input });
    sim.step(H);
    if (events) events.push(...sim.view(slot).events);
  }
}

function press(sim: Simulation, slot = 0): void {
  feed(sim, slot, { action: true, actionPressed: true }, H);
  feed(sim, slot, {}, H);
}

describe('試食', () => {
  it('8本連打で食べ尽くすと、1本30点＋全部で+300＋達成。目立ち度は1本+8。20秒で補充', async () => {
    const sim = await sim2();
    const p = sim.layout.places.samples;
    sim.teleport(0, p.x, p.z);
    feed(sim, 0, {}, 0.1);
    expect(sim.avatars[0]!.offer?.prompt?.label).toBe('食べる');
    for (let i = 0; i < 12; i++) {
      press(sim);
      feed(sim, 0, {}, SAMPLES.biteInterval);
    }
    const b = sim.avatars[0]!.book;
    expect(b.breakdown.samples!.count).toBe(8);
    expect(b.achieved).toContain('samples');
    expect(b.score).toBe(8 * 30 + 300 + 300);
    expect(sim.view(0).stations.samples.left).toBe(0);
    feed(sim, 0, {}, SAMPLES.refillAfter + 0.2);
    expect(sim.view(0).stations.samples.left).toBe(8);
    sim.dispose();
  });
});

describe('放送', () => {
  it('2秒長押しで+500・達成・字幕。店員はブースへ向かい、客は止まる', async () => {
    const sim = await sim2(3, true);
    sim.runFor(MATCH.friendlyOpening);
    const p = sim.layout.places.pa;
    sim.teleport(0, p.x, p.z);
    const events: GameEvent[] = [];
    feed(sim, 0, { action: true }, PA.holdTime + 0.2, events);
    const b = sim.avatars[0]!.book;
    expect(b.achieved).toContain('pa');
    expect(b.breakdown.pa!.points).toBeGreaterThanOrEqual(500);
    const pa = events.find((e) => e.t === 'pa');
    expect(pa && pa.t === 'pa' && pa.text.length).toBeTruthy();
    const npcs = sim.view(0).npcs;
    expect(npcs.filter((n) => n.role === 'clerk').every((n) => n.state === 'investigate')).toBe(true);
    expect(npcs.filter((n) => n.role === 'shopper').every((n) => n.state === 'react')).toBe(true);
    sim.dispose();
  });
});

describe('冷凍ケース', () => {
  it('近くで押すと飛び込み、3秒続けて入ると300点と達成。出るで外へ', async () => {
    const sim = await sim2();
    const f = sim.layout.fixtures.find((x) => x.kind === 'freezer')!;
    sim.teleport(0, f.pos.x, f.pos.z + f.size.z / 2 + 0.6);
    feed(sim, 0, {}, 0.1);
    expect(sim.avatars[0]!.offer?.prompt?.label).toBe('入る');
    press(sim);
    feed(sim, 0, {}, 3.6);
    const b = sim.avatars[0]!.book;
    // 3秒で300点＋初達成の300点
    expect(b.breakdown.freezer!.points).toBe(300 + 300);
    expect(b.achieved).toContain('freezer');
    expect(sim.view(0).stations.freezerSlots).toContain(0);
    expect(sim.avatars[0]!.offer?.prompt?.label).toBe('出る');
    press(sim);
    feed(sim, 0, {}, 0.8);
    expect(sim.view(0).stations.freezerSlots).not.toContain(0);
    expect(sim.avatars[0]!.pos.y).toBeLessThan(0.1);
    sim.dispose();
  });
});

describe('バナナ', () => {
  it('持って食べ、皮を置く。相手が踏むと滑り200点と達成。自分で踏んでも点はない', async () => {
    const sim = await sim2();
    const p = sim.layout.places.banana;
    sim.teleport(0, p.x, p.z);
    feed(sim, 0, {}, 0.1);
    expect(sim.avatars[0]!.offer?.prompt?.label).toBe('バナナを持つ');
    press(sim);
    expect(sim.avatars[0]!.holding).not.toBeNull();
    sim.teleport(0, 0, 5);
    sim.face(0, 0);
    feed(sim, 0, {}, 0.1);
    press(sim);
    const peels = sim.view(0).peels;
    expect(peels.length).toBe(1);
    // 相手を皮の上へ
    const peel = peels[0]!;
    feed(sim, 0, {}, BANANA.armDelay + 0.1);
    sim.teleport(1, peel.pos.x, peel.pos.z);
    const events: GameEvent[] = [];
    feed(sim, 0, {}, 0.2, events);
    expect(events.some((e) => e.t === 'slip' && e.slot === 1)).toBe(true);
    expect(sim.avatars[1]!.stunned).toBeGreaterThan(0);
    expect(sim.avatars[0]!.book.achieved).toContain('banana');
    // 滑らせた200点＋初達成の300点（内訳の行に入る）
    expect(sim.avatars[0]!.book.breakdown.banana!.points).toBe(200 + 300);
    expect(sim.view(0).peels.length).toBe(0);
    sim.dispose();
  });

  it('店員がバナナで3秒転ぶと400点と、ひみつ「店員さんをバナナで滑らせる」', async () => {
    const sim = await sim2(3, true);
    const clerk = sim.npcs.find((n) => n.role === 'clerk') as Clerk;
    const m = sim.memo.get('banana') as { peels: { id: number; owner: number; x: number; z: number; expiresAt: number; armedAt: number }[] };
    m.peels.push({ id: 99, owner: 0, x: clerk.pos.x, z: clerk.pos.z, expiresAt: sim.time + 40, armedAt: sim.time });
    feed(sim, 0, {}, 0.1);
    expect(clerk.view().state).toBe('slipped');
    const b = sim.avatars[0]!.book;
    expect(b.secrets).toContain('secret-staff-slip');
    expect(b.breakdown.banana!.points).toBe(400 + 300);
    expect(b.extras.map((e) => e.points)).toContain(800);
    feed(sim, 0, {}, CLERK.slipStun + 0.2);
    expect(clerk.view().state).not.toBe('slipped');
    sim.dispose();
  });

  it('客は皮を避けて歩き、転ばない', async () => {
    const sim = await sim2(3, true);
    const shoppers = sim.npcs.filter((n) => n.role === 'shopper');
    const m = sim.memo.get('banana') as { peels: { id: number; owner: number; x: number; z: number; expiresAt: number; armedAt: number }[] };
    for (const s of shoppers) m.peels.push({ id: 100 + s.id, owner: 0, x: s.pos.x, z: s.pos.z, expiresAt: sim.time + 40, armedAt: sim.time });
    for (let i = 0; i < 8 * 60; i++) {
      sim.step(H);
      for (const s of shoppers) expect(s.view().state).not.toBe('slipped');
    }
    sim.dispose();
  });
});

describe('駄々', () => {
  it('お菓子の通路で止まって長押しすると、毎秒100点（3秒まで）と達成', async () => {
    const sim = await sim2();
    sim.teleport(0, -6.5, -3.4);
    feed(sim, 0, {}, 0.1);
    feed(sim, 0, { action: true, actionPressed: true }, H);
    feed(sim, 0, { action: true }, 3.6);
    const b = sim.avatars[0]!.book;
    expect(b.breakdown.tantrum!.points).toBe(300 + 300);
    expect(b.achieved).toContain('tantrum');
    expect(sim.avatars[0]!.anim).toBe('tantrum');
    sim.dispose();
  });
});

describe('ボウリング', () => {
  it('スイカを持って通路の奥へ転がすと、ピンが倒れて点が入り、1投で5本以上なら達成。ピンは8秒で並び直す', async () => {
    const sim = await sim2();
    const wagon = sim.layout.places.wagon;
    sim.teleport(0, wagon.x, wagon.z);
    feed(sim, 0, {}, 0.1);
    expect(sim.avatars[0]!.offer?.prompt?.label).toBe('スイカを持つ');
    press(sim);
    expect(sim.avatars[0]!.holding).not.toBeNull();
    const lane = sim.layout.places.lane;
    sim.teleport(0, lane.x, lane.z);
    sim.face(0, Math.PI);
    feed(sim, 0, {}, 0.1);
    // レーンの中では「←→で向き」を添える（round4 の F4）
    expect(sim.avatars[0]!.offer?.prompt?.label).toBe('転がす（←→で向き）');
    press(sim);
    feed(sim, 0, {}, 3);
    const b = sim.avatars[0]!.book;
    const pins = b.breakdown.bowling?.count ?? 0;
    expect(pins).toBeGreaterThanOrEqual(5);
    expect(b.achieved).toContain('bowling');
    expect(sim.view(0).stations.bowling.pinsDown).toBeGreaterThanOrEqual(5);
    feed(sim, 0, {}, 8.5);
    expect(sim.view(0).stations.bowling.pinsDown).toBe(0);
    sim.dispose();
  });
});

describe('カートで缶ピラミッドに突っ込む', () => {
  /** カートを置き直し、後ろに立って乗る */
  async function rideFrom(x: number, z: number, yaw: number): Promise<Simulation> {
    const sim = await sim2();
    const cart = sim.carts[0]!;
    cart.body.setTranslation({ x, y: 0, z }, true);
    cart.body.setRotation(yawQuat(yaw), true);
    sim.teleport(0, x - Math.sin(yaw) * 0.85, z - Math.cos(yaw) * 0.85);
    sim.face(0, yaw);
    feed(sim, 0, {}, 0.1);
    press(sim);
    expect(sim.avatars[0]!.ridingCart).toBe(cart.id);
    return sim;
  }

  /** 走り出してから、缶が10個以上動くまでの秒（最初にぶつかってから数える） */
  function runInto(sim: Simulation, input: Partial<InputState>, seconds: number): { first: number; tenth: number } {
    let first = -1;
    let tenth = -1;
    for (let i = 0; i < Math.round(seconds / H); i++) {
      sim.setInput(0, { ...EMPTY_INPUT, ...input });
      sim.step(H);
      const moved = sim.props.filter((p) => p.def.kind === 'can' && p.moved).length;
      if (moved > 0 && first < 0) first = sim.time;
      if (moved >= 10 && tenth < 0) tenth = sim.time;
    }
    return { first, tenth };
  }

  it('南から全速で突っ込むと、2秒以内に10個以上落ち、ひみつ+800', async () => {
    const t = (await sim2()).layout.pyramidBase;
    const sim = await rideFrom(t.x, 11.5, Math.PI);
    const r = runInto(sim, { moveZ: -1 }, 3);
    expect(r.first).toBeGreaterThan(0);
    expect(r.tenth - r.first).toBeLessThan(2);
    expect(sim.avatars[0]!.book.secrets).toContain('secret-cart-strike');
    sim.dispose();
  });

  it('西からでも、ゆっくり（秒速3m台）でも崩れる', async () => {
    const t = (await sim2()).layout.pyramidBase;
    const west = await rideFrom(-4, t.z, Math.PI / 2);
    const r1 = runInto(west, { moveX: 1 }, 3);
    expect(r1.tenth).toBeGreaterThan(0);
    expect(r1.tenth - r1.first).toBeLessThan(2);
    west.dispose();
    const slow = await rideFrom(t.x, 6.2, Math.PI);
    const r2 = runInto(slow, { moveZ: -0.4 }, 4);
    expect(r2.tenth).toBeGreaterThan(0);
    slow.dispose();
  });
});

describe('カートに乗っている人の当たり', () => {
  it('棚に向かって曲がっても、乗っている人が棚や壁に重ならない', async () => {
    const sim = await sim2();
    const cart = sim.carts[0]!;
    // 飲料の通路（B）を北へ。途中から東の棚へ向かってハンドルを切り続ける
    cart.body.setTranslation({ x: -1.5, y: 0, z: 0.5 }, true);
    cart.body.setRotation(yawQuat(Math.PI), true);
    sim.teleport(0, -1.5, 1.35);
    sim.face(0, Math.PI);
    feed(sim, 0, {}, 0.1);
    press(sim);
    expect(sim.avatars[0]!.ridingCart).toBe(cart.id);
    const boxes = sim.layout.fixtures.flatMap((f) => f.colliders).filter((c) => c.min.y < 1.5 && c.max.y > 0.1);
    const gap = (x: number, z: number): number => Math.min(...boxes.map((c) => Math.hypot(Math.max(c.min.x - x, 0, x - c.max.x), Math.max(c.min.z - z, 0, z - c.max.z))));
    let worst = Infinity;
    for (let i = 0; i < 240; i++) {
      const input = i < 50 ? { moveZ: -1 } : i < 150 ? { moveX: 1, moveZ: -0.2 } : { moveX: -1 };
      feed(sim, 0, input, H);
      const av = sim.avatars[0]!;
      worst = Math.min(worst, gap(av.pos.x, av.pos.z));
    }
    // カプセルの半径0.3（すき間の計算の誤差を少し許す）
    expect(worst).toBeGreaterThan(0.24);
    sim.dispose();
  });
});

describe('ひみつ：カートで缶ピラミッドに突っ込む', () => {
  it('乗ったまま特売台に速くぶつかると、缶が崩れて+800', async () => {
    const sim = await sim2();
    const cart = sim.carts[0]!;
    const table = sim.layout.pyramidBase;
    cart.body.setTranslation({ x: table.x, y: 0, z: 11.5 }, true);
    cart.body.setRotation(yawQuat(Math.PI), true);
    sim.teleport(0, table.x, 12.35);
    sim.face(0, Math.PI);
    feed(sim, 0, {}, 0.1);
    press(sim);
    expect(sim.avatars[0]!.ridingCart).toBe(cart.id);
    feed(sim, 0, { moveZ: -1 }, 2.5);
    const b = sim.avatars[0]!.book;
    expect(b.secrets).toContain('secret-cart-strike');
    expect(b.breakdown.pyramid?.count ?? 0).toBeGreaterThanOrEqual(10);
    sim.dispose();
  });
});

describe('店員', () => {
  async function chaseSetup(): Promise<{ sim: Simulation; clerk: Clerk }> {
    const sim = await sim2(5, true);
    const clerk = sim.npcs.find((n) => n.role === 'clerk') as Clerk;
    // 開店20秒は、目立っていても追わない
    sim.avatars[0]!.book.raiseHeat(80);
    sim.avatars[0]!.book.lastScoreAt = sim.time + 100;
    sim.teleport(0, clerk.pos.x + 2, clerk.pos.z + 1.5);
    feed(sim, 0, {}, 2);
    expect(clerk.view().state).not.toBe('chase');
    // 待つ間は目立たない所へ（相手も遠くへ）
    sim.avatars[0]!.book.heat = 0;
    sim.teleport(0, 16.5, 12.5);
    sim.teleport(1, 16.5, 11.5);
    sim.runFor(MATCH.friendlyOpening);
    return { sim, clerk };
  }

  /** 店員から見える近くの歩ける所 */
  function near(sim: Simulation, clerk: Clerk, d: number): { x: number; z: number } {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const p = { x: clerk.pos.x + Math.sin(ang) * d, z: clerk.pos.z + Math.cos(ang) * d };
      if (sim.nav.isFree(p.x, p.z) && sim.nav.lineOfSight(clerk.pos, p)) return p;
    }
    throw new Error('no spot');
  }

  it('目立つ人が見えると「！」で追いかけ、1m以内で確保：サービスカウンターへ戻され3秒動けず、目立ち度とコンボが0', async () => {
    const { sim, clerk } = await chaseSetup();
    sim.avatars[0]!.book.raiseHeat(80);
    sim.avatars[0]!.book.lastScoreAt = sim.time + 100;
    const p = near(sim, clerk, 3);
    sim.teleport(0, p.x, p.z);
    const events: GameEvent[] = [];
    feed(sim, 0, {}, 3, events);
    expect(events.some((e) => e.t === 'notice')).toBe(true);
    expect(events.some((e) => e.t === 'caught' && e.slot === 0)).toBe(true);
    const av = sim.avatars[0]!;
    const s = sim.layout.places.service;
    expect(Math.hypot(av.pos.x - s.x, av.pos.z - s.z)).toBeLessThan(0.5);
    expect(av.book.caught).toBe(1);
    expect(av.book.heat).toBe(0);
    expect(av.stunned).toBeGreaterThan(0);
    expect(clerk.view().state).toBe('rest');
    sim.dispose();
  });

  it('4秒見失うと、あきらめて逃げ切り+100', async () => {
    const { sim, clerk } = await chaseSetup();
    sim.avatars[0]!.book.raiseHeat(80);
    sim.avatars[0]!.book.lastScoreAt = sim.time + 100;
    const p = near(sim, clerk, 6);
    sim.teleport(0, p.x, p.z);
    const events: GameEvent[] = [];
    feed(sim, 0, {}, 0.7, events);
    expect(clerk.view().state).toBe('chase');
    // 見えない遠くへ（壁の向こうの角）
    const far = clerk.pos.x < 0 ? { x: 16.5, z: 12.5 } : { x: -16.5, z: 12.5 };
    sim.teleport(0, far.x, far.z);
    feed(sim, 0, {}, CLERK.giveUpAfter + 1, events);
    expect(events.some((e) => e.t === 'escape' && e.slot === 0)).toBe(true);
    expect(sim.avatars[0]!.book.breakdown.escape?.points).toBe(100);
    sim.dispose();
  });

  it('店長は残り60秒で出てくる', async () => {
    const sim = await Simulation.create({ seed: 2, duration: 70, players: [{ slot: 0, kind: 'human', name: 'a', character: 'ch/character-female-b' }] });
    sim.runFor(MATCH.countdown + 5);
    expect(sim.view(0).npcs.some((n) => n.role === 'manager')).toBe(false);
    const events: GameEvent[] = [];
    for (let i = 0; i < 8 * 60; i++) {
      sim.step(H);
      events.push(...sim.view(0).events);
    }
    expect(events.some((e) => e.t === 'manager')).toBe(true);
    expect(sim.view(0).npcs.some((n) => n.role === 'manager')).toBe(true);
    sim.dispose();
  });
});
