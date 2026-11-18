/**
 * ネット担当に渡す口（第2波の段A）：参加者のキャラを外から動かす・参加者の端末の self・見え方から結果・定位置の高さ。
 */
import { describe, expect, it } from 'vitest';
import { Simulation, type AvatarPose } from '../../src/game/sim/Simulation';
import { standPoint } from '../../src/game/sim/ai/cpu';
import { EMPTY_INPUT } from '../../src/shared/input';
import { resultFromView } from '../../src/shared/rules/scoring';
import { AVATAR, CLERK, MATCH } from '../../src/shared/rules/tuning';

const H = 1 / 60;

async function host(): Promise<Simulation> {
  const sim = await Simulation.create({
    seed: 9,
    npcs: false,
    players: [
      { slot: 0, kind: 'human', name: '主', character: 'ch/character-female-b' },
      { slot: 1, kind: 'human', name: '参加者', character: 'ch/character-male-f' },
    ],
  });
  sim.runFor(MATCH.countdown + 0.05);
  return sim;
}

const pose = (x: number, z: number, extra: Partial<AvatarPose> = {}): AvatarPose => ({ pos: { x, y: 0.02, z }, vel: { x: 0, y: 0, z: 0 }, yaw: 0, anim: 'run', ridingCart: null, holding: null, ...extra });

describe('参加者のキャラを外から動かす（部屋の主の端末）', () => {
  it('届いた姿勢へ、速さの上限で丸めながら追いつく。壁は抜けない', async () => {
    const sim = await host();
    sim.teleport(1, 0, 5);
    sim.setPuppet(1, pose(10, 5));
    sim.step(H);
    const av = sim.avatarBySlot(1)!;
    expect(av.pos.x).toBeLessThanOrEqual(AVATAR.remoteMaxSpeed * H + 1e-6);
    sim.runFor(1.2);
    expect(av.pos.x).toBeCloseTo(10, 1);
    // 壁の向こうを指されても、店の外へは出ない
    sim.setPuppet(1, pose(10, 30));
    sim.runFor(3);
    expect(av.pos.z).toBeLessThan(14);
    sim.dispose();
  });

  it('写しが棚の向こうで引っかかったら、0.5秒あまりで届いた位置へ置き直される', async () => {
    const sim = await host();
    // お菓子の通路（A）にいる写しに、棚の列（x=−4）の向こうの飲料の通路（B）の位置が届く
    sim.teleport(1, -6.5, -3.4);
    sim.setPuppet(1, pose(-1.5, -3.4));
    sim.runFor(0.4);
    const av = sim.avatarBySlot(1)!;
    // まだ棚の手前で止まっている
    expect(av.pos.x).toBeLessThan(-4.5);
    sim.runFor(0.6);
    expect(Math.hypot(av.pos.x - -1.5, av.pos.z - -3.4)).toBeLessThan(0.05);
    // 置き直したあとも、ふつうに追いつく
    sim.setPuppet(1, pose(-1.5, -1.0));
    sim.runFor(0.4);
    expect(av.pos.z).toBeCloseTo(-1.0, 1);
    sim.dispose();
  });

  it('届いた位置が棚の中なら、置き直さない', async () => {
    const sim = await host();
    sim.teleport(1, -6.5, -3.4);
    // 棚の列（x=−4）の真ん中
    sim.setPuppet(1, pose(-4, -3.4));
    sim.runFor(1.5);
    const av = sim.avatarBySlot(1)!;
    expect(av.pos.x).toBeLessThan(-4.5);
    sim.dispose();
  });

  it('アクションは setInput で受け、追いついた位置で悪事を判定する（点は参加者の slot に入る）', async () => {
    const sim = await host();
    const face = sim.layout.faces.find((f) => f.aisle === 'canned' && f.nx === 1)!;
    const p = standPoint(face);
    sim.teleport(1, p.x, p.z);
    sim.setPuppet(1, pose(p.x, p.z, { yaw: Math.atan2(-face.nx, -face.nz), anim: 'idle' }));
    sim.runFor(0.2);
    expect(sim.avatarBySlot(1)!.offer?.system.id).toBe('sweep');
    sim.setInput(1, { ...EMPTY_INPUT, action: true, actionPressed: true });
    sim.step(H);
    sim.setInput(1, { ...EMPTY_INPUT });
    sim.runFor(3);
    expect(sim.avatarBySlot(1)!.book.breakdown.sweep?.count ?? 0).toBeGreaterThanOrEqual(3);
    expect(sim.avatarBySlot(0)!.book.score).toBe(0);
    sim.dispose();
  });

  it('姿勢の ridingCart で乗せ降ろしし、カートは姿勢を追いかけて距離と点が入る', async () => {
    const sim = await host();
    const cart = sim.carts[0]!;
    const ct = cart.body.translation();
    // カートの後ろ（北向きのカートなので南側）に立って乗る
    sim.teleport(1, ct.x, ct.z + 0.85);
    sim.setPuppet(1, pose(ct.x, ct.z + 0.85, { yaw: Math.PI, ridingCart: cart.id, anim: 'ride-cart' }));
    sim.step(H);
    expect(sim.avatarBySlot(1)!.ridingCart).toBe(cart.id);
    // 北へ西へ走る姿勢を送り続ける
    let x = ct.x;
    let z = ct.z + 0.85;
    for (let i = 0; i < 240; i++) {
      if (z > 9.9) z -= 0.12;
      else x -= 0.12;
      sim.setPuppet(1, pose(x, z, { yaw: z > 9.9 ? Math.PI : -Math.PI / 2, vel: { x: z > 9.9 ? 0 : -7, y: 0, z: z > 9.9 ? -7 : 0 }, ridingCart: cart.id, anim: 'ride-cart' }));
      sim.step(H);
    }
    const av = sim.avatarBySlot(1)!;
    expect(av.progress.cart ?? 0).toBeGreaterThan(15);
    expect(av.book.breakdown.cart?.points ?? 0).toBeGreaterThan(0);
    sim.setPuppet(1, pose(av.pos.x, av.pos.z, { ridingCart: null }));
    sim.step(H);
    expect(av.ridingCart).toBeNull();
    expect(cart.rider).toBeNull();
    sim.dispose();
  });
});

describe('参加者の端末の self（自分だけ動かす）', () => {
  it('商品の物理を持たず、入力で同じように走り、姿勢を出す。言いつけに従う', async () => {
    const sim = await Simulation.create({ seed: 9, mode: 'self', players: [{ slot: 2, kind: 'human', name: '参加者', character: 'ch/character-male-f' }] });
    expect(sim.props.length).toBe(0);
    sim.runFor(MATCH.countdown + 0.05);
    sim.teleport(2, -2, 5);
    for (let i = 0; i < 60; i++) {
      sim.setInput(2, { ...EMPTY_INPUT, moveX: 1 });
      sim.step(H);
    }
    const p = sim.pose(2)!;
    expect(p.pos.x - -2).toBeGreaterThan(4.2);
    expect(p.anim).toBe('run');
    // 捕まった：0.6秒その場でつかまれ、それからサービスカウンターへ戻されて動けない
    const at = sim.pose(2)!.pos;
    sim.applyOrder(2, { kind: 'caught' });
    for (let i = 0; i < Math.round((CLERK.grabTime - 0.1) / H); i++) {
      sim.setInput(2, { ...EMPTY_INPUT, moveX: 1 });
      sim.step(H);
    }
    expect(sim.pose(2)!.pos.x).toBeCloseTo(at.x, 3);
    expect(sim.pose(2)!.anim).toBe('caught');
    sim.runFor(0.15);
    const s = sim.layout.places.service;
    expect(sim.pose(2)!.pos.x).toBeCloseTo(s.x, 3);
    for (let i = 0; i < 30; i++) {
      sim.setInput(2, { ...EMPTY_INPUT, moveX: 1 });
      sim.step(H);
    }
    expect(sim.pose(2)!.pos.x).toBeCloseTo(s.x, 3);
    expect(sim.pose(2)!.anim).toBe('caught');
    sim.runFor(CLERK.caughtStun);
    // 滑った・止まれ
    sim.applyOrder(2, { kind: 'slip', seconds: 1.5 });
    sim.step(H);
    expect(sim.pose(2)!.anim).toBe('slip');
    sim.dispose();
  });

  it('カートに手元で乗って運転でき、部屋の主の見え方のカートの位置に合わせられる', async () => {
    const sim = await Simulation.create({ seed: 9, mode: 'self', players: [{ slot: 1, kind: 'human', name: '参加者', character: 'ch/character-male-f' }] });
    sim.runFor(MATCH.countdown + 0.05);
    // 主の見え方：カート0は広場にある
    sim.syncCarts([{ id: 0, pos: { x: 0, y: 0, z: 5 }, yaw: -Math.PI / 2, riderSlot: null, speed: 0 }], 1);
    sim.step(H);
    expect(sim.carts[0]!.body.translation().x).toBeCloseTo(0, 3);
    sim.teleport(1, 0.85, 5);
    sim.step(H);
    expect(sim.avatarBySlot(1)!.offer?.system.id).toBe('cart');
    sim.setInput(1, { ...EMPTY_INPUT, action: true, actionPressed: true });
    sim.step(H);
    expect(sim.pose(1)!.ridingCart).toBe(0);
    for (let i = 0; i < 90; i++) {
      sim.setInput(1, { ...EMPTY_INPUT, moveX: -1 });
      sim.step(H);
    }
    expect(sim.pose(1)!.pos.x).toBeLessThan(-3);
    // ほかの人が乗っているカートには乗れない
    sim.applyOrder(1, { kind: 'dismount' });
    sim.syncCarts([{ id: 1, pos: { x: sim.pose(1)!.pos.x, y: 0, z: 6.2 }, yaw: 0, riderSlot: 3, speed: 0 }], 1);
    sim.step(H);
    expect(sim.avatarBySlot(1)!.offer?.target === 1).toBe(false);
    sim.dispose();
  });
});

describe('見え方から結果を作る', () => {
  it('点・達成・ひみつから順位と称号を作り、内訳＋extras＝点', async () => {
    const sim = await host();
    const a = sim.avatarBySlot(0)!;
    a.book.award('bell', 20, sim.time, false);
    a.book.achieve('bell');
    a.book.secret('secret-cart-strike');
    const view = sim.view(0);
    const r = resultFromView(view, sim.statics);
    expect(r.aborted).toBe(true);
    expect(r.winnerSlots).toEqual([0]);
    const me = r.players.find((p) => p.slot === 0)!;
    expect(me.score).toBe(20 + 300 + 800);
    expect(me.achieved).toEqual(['bell']);
    const sum = Object.values(me.breakdown).reduce((n, x) => n + (x?.points ?? 0), 0) + (me.extras ?? []).reduce((n, e) => n + e.points, 0);
    expect(sum).toBe(me.score);
    expect(r.players.find((p) => p.slot === 1)!.rank).toBe(2);
    sim.dispose();
  });
});

describe('定位置の高さ', () => {
  it('置いた商品は、触られるまで1mmも動かず、眠ったまま', async () => {
    const sim = await Simulation.create({ seed: 1, npcs: false, players: [] });
    sim.runFor(5);
    let max = 0;
    for (const p of sim.props) {
      const t = p.body.translation();
      const h = p.def.home.pos;
      max = Math.max(max, Math.hypot(t.x - h.x, t.y - h.y, t.z - h.z));
    }
    expect(max).toBeLessThan(0.001);
    expect(sim.props.filter((p) => !p.body.isSleeping()).length).toBe(0);
    sim.dispose();
  });
});
