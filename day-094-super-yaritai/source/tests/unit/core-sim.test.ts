import { describe, expect, it } from 'vitest';
import { Simulation, type SimPlayer } from '../../src/game/sim/Simulation';
import { CpuBrain } from '../../src/game/sim/ai/cpu';
import { standPoint } from '../../src/game/sim/ai/cpu';
import { yawQuat } from '../../src/game/sim/physics';
import { EMPTY_INPUT, type InputState } from '../../src/shared/input';
import { MATCH, PYRAMID } from '../../src/shared/rules/tuning';
import { streamRng } from '../../src/shared/rng';
import type { GameEvent } from '../../src/shared/view';

const H = 1 / 60;

async function solo(seed = 1, cpu = false): Promise<Simulation> {
  const players: SimPlayer[] = [{ slot: 0, kind: 'human', name: 'あなた', character: 'ch/character-female-b' }];
  if (cpu) players.push({ slot: 1, kind: 'cpu', name: 'CPU', character: 'ch/character-male-f' });
  const sim = await Simulation.create({ seed, players });
  // カウントダウンを抜ける
  sim.runFor(MATCH.countdown + 0.05);
  expect(sim.phase).toBe('playing');
  return sim;
}

function press(sim: Simulation, extra: Partial<InputState> = {}): void {
  sim.setInput(0, { ...EMPTY_INPUT, action: true, actionPressed: true, ...extra });
  sim.step(H);
  sim.setInput(0, { ...EMPTY_INPUT, ...extra, action: false, actionPressed: false, actionReleased: true });
  sim.step(H);
}

function hold(sim: Simulation, input: Partial<InputState>, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / H); i++) {
    sim.setInput(0, { ...EMPTY_INPUT, ...input });
    sim.step(H);
  }
}

function collect(sim: Simulation, seconds: number, input: Partial<InputState> = {}): GameEvent[] {
  const out: GameEvent[] = [];
  for (let i = 0; i < Math.round(seconds / H); i++) {
    sim.setInput(0, { ...EMPTY_INPUT, ...input });
    sim.step(H);
    out.push(...sim.view(0).events);
  }
  return out;
}

describe('シミュレーションの土台', () => {
  it('カウントダウンの間は動けず、始まると走れる（秒速5m）', async () => {
    const sim = await Simulation.create({ seed: 3, players: [{ slot: 0, kind: 'human', name: 'a', character: 'ch/character-female-b' }] });
    const x0 = sim.avatars[0]!.pos.x;
    hold(sim, { moveX: 1 }, 1);
    expect(sim.phase).toBe('countdown');
    expect(sim.avatars[0]!.pos.x).toBeCloseTo(x0, 1);
    hold(sim, {}, MATCH.countdown);
    expect(sim.phase).toBe('playing');
    sim.teleport(0, -2, 5);
    hold(sim, { moveX: 1 }, 1);
    const dx = sim.avatars[0]!.pos.x - -2;
    expect(dx).toBeGreaterThan(4.2);
    expect(dx).toBeLessThan(5.2);
    expect(sim.avatars[0]!.grounded).toBe(true);
    sim.dispose();
  });

  it('ダッシュは0.35秒だけ速くなり、ジャンプして着地する', async () => {
    const sim = await solo(4);
    sim.teleport(0, -12, 5);
    hold(sim, { moveX: 1 }, 0.3);
    const x1 = sim.avatars[0]!.pos.x;
    sim.setInput(0, { ...EMPTY_INPUT, moveX: 1, dash: true });
    sim.step(H);
    hold(sim, { moveX: 1 }, 0.34);
    expect(sim.avatars[0]!.pos.x - x1).toBeGreaterThan(2.6);
    sim.setInput(0, { ...EMPTY_INPUT, jump: true });
    sim.step(H);
    hold(sim, {}, 0.2);
    expect(sim.avatars[0]!.pos.y).toBeGreaterThan(0.5);
    hold(sim, {}, 1.2);
    expect(sim.avatars[0]!.pos.y).toBeLessThan(0.1);
    sim.dispose();
  });

  it('棚や壁はすり抜けない', async () => {
    const sim = await solo(5);
    sim.teleport(0, -6.5, -3.4); // お菓子の通路の真ん中
    hold(sim, { moveX: 1 }, 1.5);
    // 東の棚（x=−4、面は x≈−4.74）の手前で止まる
    expect(sim.avatars[0]!.pos.x).toBeLessThan(-4 - 0.73);
    sim.teleport(0, 0, 12);
    hold(sim, { moveZ: 1 }, 1.5);
    expect(sim.avatars[0]!.pos.z).toBeLessThan(14);
    sim.dispose();
  });
});

describe('なぎ払い', () => {
  it('棚の前でアクションすると5個以上が床に落ち、kind=sweep で点が入る', async () => {
    const sim = await solo(11);
    const face = sim.layout.faces.find((f) => f.aisle === 'drink' && f.nx === 1)!;
    const p = standPoint(face);
    sim.teleport(0, p.x, p.z);
    sim.face(0, Math.atan2(-face.nx, -face.nz));
    hold(sim, {}, 0.1);
    expect(sim.avatars[0]!.offer?.system.id).toBe('sweep');
    expect(sim.view(0).avatars[0]!.prompt?.label).toBe('なぎ払う');
    press(sim);
    const events = collect(sim, 3);
    const swept = events.filter((e) => e.t === 'score' && e.kind === 'sweep');
    expect(swept.length).toBeGreaterThanOrEqual(5);
    const book = sim.avatars[0]!.book;
    expect(book.breakdown.sweep!.count).toBe(swept.length);
    expect(book.score).toBeGreaterThanOrEqual(swept.length * 10);
    expect(sim.view(0).damage).toBeGreaterThan(0);
    sim.dispose();
  });

  it('なぎ払いで合計20個落とすと達成', async () => {
    const sim = await solo(12);
    const faces = sim.layout.faces.filter((f) => f.nx !== 0 && (f.aisle === 'canned' || f.aisle === 'daily'));
    for (const face of faces) {
      if (sim.avatars[0]!.book.achieved.includes('sweep')) break;
      const p = standPoint(face);
      sim.teleport(0, p.x, p.z);
      sim.face(0, Math.atan2(-face.nx, -face.nz));
      hold(sim, {}, 0.05);
      press(sim);
      hold(sim, {}, 2.5);
    }
    expect(sim.avatars[0]!.progress.sweep ?? 0).toBeGreaterThanOrEqual(20);
    expect(sim.avatars[0]!.book.achieved).toContain('sweep');
    sim.dispose();
  });
});

describe('缶ピラミッド', () => {
  it('蹴って体当たりすると8割崩れて +500 と達成。25秒後に積み直す', async () => {
    const sim = await solo(21);
    const place = sim.layout.places.pyramid;
    sim.teleport(0, place.x, place.z - 0.4);
    sim.face(0, Math.PI);
    hold(sim, {}, 0.05);
    expect(sim.avatars[0]!.offer?.system.id).toBe('pyramid');
    press(sim);
    hold(sim, {}, 0.6);
    press(sim);
    // 台に向かって押し込む
    hold(sim, { moveZ: -1 }, 1.5);
    hold(sim, {}, 2.5);
    const book = sim.avatars[0]!.book;
    expect(book.achieved).toContain('pyramid');
    expect(book.breakdown.pyramid!.points).toBeGreaterThanOrEqual(PYRAMID.collapseBonus + PYRAMID.canPoints * 5);
    const st = sim.view(0).stations.pyramid;
    expect(st.collapsed).toBe(true);
    // 25秒たつと積み直される
    sim.teleport(0, -12, 5);
    hold(sim, {}, PYRAMID.rebuildAfter + PYRAMID.rebuildTime + 0.5);
    expect(sim.view(0).stations.pyramid.collapsed).toBe(false);
    const cans = sim.props.filter((p) => p.def.kind === 'can');
    const home = cans.filter((c) => {
      const t = c.body.translation();
      return Math.hypot(t.x - c.def.home.pos.x, t.y - c.def.home.pos.y, t.z - c.def.home.pos.z) < 0.05;
    });
    expect(home.length).toBe(cans.length);
    sim.dispose();
  });
});

describe('カート', () => {
  it('乗って30m走ると達成し、秒速4m以上で点が入る。降りると転がる', async () => {
    const sim = await solo(31);
    const cart = sim.carts[0]!;
    // 広場の東の端に置き直して、西向きに乗る
    cart.body.setTranslation({ x: 14, y: 0, z: 5.2 }, true);
    cart.body.setRotation(yawQuat(-Math.PI / 2), true);
    sim.teleport(0, 14.9, 5.2);
    sim.face(0, -Math.PI / 2);
    hold(sim, {}, 0.1);
    expect(sim.avatars[0]!.offer?.system.id).toBe('cart');
    press(sim);
    expect(sim.avatars[0]!.ridingCart).toBe(cart.id);
    const route = [
      { x: -13, z: 5.2 },
      { x: 13, z: 5.2 },
      { x: -13, z: 5.2 },
    ];
    let wi = 0;
    for (let i = 0; i < 60 * 16 && !sim.avatars[0]!.book.achieved.includes('cart'); i++) {
      const t = cart.body.translation();
      const wp = route[wi]!;
      if (Math.hypot(wp.x - t.x, wp.z - t.z) < 2 && wi < route.length - 1) wi++;
      const dx = wp.x - t.x;
      const dz = wp.z - t.z;
      const len = Math.hypot(dx, dz);
      sim.setInput(0, { ...EMPTY_INPUT, moveX: dx / len, moveZ: dz / len });
      sim.step(H);
    }
    const book = sim.avatars[0]!.book;
    expect(sim.avatars[0]!.progress.cart ?? 0).toBeGreaterThanOrEqual(30);
    expect(book.achieved).toContain('cart');
    expect(book.breakdown.cart!.points).toBeGreaterThan(0);
    // 広場の真ん中へ向かって走ってから降りる（折り返しの後退中や壁ぎわで降りると、転がる向きが塞がっていることがある）
    for (let i = 0; i < 90; i++) {
      const t = cart.body.translation();
      const dx = 0 - t.x;
      const dz = 5.2 - t.z;
      const len = Math.hypot(dx, dz) || 1;
      sim.setInput(0, { ...EMPTY_INPUT, moveX: dx / len, moveZ: dz / len });
      sim.step(H);
    }
    expect(Math.abs(cart.speed)).toBeGreaterThan(2);
    press(sim); // 降りる
    expect(sim.avatars[0]!.ridingCart).toBeNull();
    hold(sim, {}, 0.1);
    const v = cart.body.linvel();
    expect(Math.hypot(v.x, v.z)).toBeGreaterThan(1);
    sim.dispose();
  });
});

describe('ベル', () => {
  it('20回鳴らすと達成。0.12秒より速い連打は数えない', async () => {
    const sim = await solo(41);
    const place = sim.layout.places.bell;
    sim.teleport(0, place.x, place.z);
    hold(sim, {}, 0.05);
    expect(sim.avatars[0]!.offer?.system.id).toBe('bell');
    expect(sim.view(0).avatars[0]!.prompt?.press).toBe('mash');
    // 速すぎる連打（2刻み＝0.033秒ごと）を10回 → 数えるのは数回だけ
    for (let i = 0; i < 10; i++) press(sim);
    const fast = sim.avatars[0]!.progress.bell ?? 0;
    expect(fast).toBeLessThan(5);
    hold(sim, {}, 0.2);
    for (let i = 0; i < 25 && !sim.avatars[0]!.book.achieved.includes('bell'); i++) {
      press(sim);
      hold(sim, {}, 0.12);
    }
    const book = sim.avatars[0]!.book;
    expect(book.achieved).toContain('bell');
    expect(book.breakdown.bell!.count).toBe(20);
    expect(book.score).toBe(20 * 20 + 300);
    sim.dispose();
  });
});

describe('誰が落としたか', () => {
  it('自分が蹴った缶にぶつかって崩れた缶も、自分の点になる（引き継ぎ）', async () => {
    const sim = await solo(51);
    const cans = sim.props.filter((p) => p.def.kind === 'can');
    // 下から2段目の真ん中の缶を2つだけ奥へ飛ばす（ほかの缶には直接触らない）
    const ys = [...new Set(cans.map((c) => Math.round(c.def.home.pos.y * 100)))].sort((a, b) => a - b);
    const second = cans.filter((c) => Math.round(c.def.home.pos.y * 100) === ys[1]).sort((a, b) => a.def.home.pos.x - b.def.home.pos.x);
    const hit = [second[2]!, second[3]!];
    for (const c of hit) sim.launch(c, { x: 0, y: 1.5, z: -6 }, { x: 5, y: 0, z: 0 }, 0);
    hold(sim, {}, 3);
    const counted = sim.avatars[0]!.book.breakdown.pyramid?.count ?? 0;
    // 直接飛ばしたのは2個。上の段がつられて崩れた分（引き継いだ缶）も自分の点になる
    expect(counted).toBeGreaterThan(hit.length);
    const inherited = cans.filter((c) => !hit.includes(c) && c.owner === 0);
    expect(inherited.length).toBeGreaterThan(2);
    sim.dispose();
  });

  it('誰も触っていない商品が落ちても点は入らない', async () => {
    const sim = await solo(52);
    const face = sim.layout.faces.find((f) => f.aisle === 'snack' && f.nx === 1)!;
    const prop = sim.props.find((p) => p.face === face && p.def.home.pos.y > 1)!;
    prop.body.setLinvel({ x: 3, y: 1, z: 0 }, true);
    hold(sim, {}, 2);
    expect(prop.scored).toBe(true);
    expect(sim.avatars[0]!.book.score).toBe(0);
    sim.dispose();
  });
});
