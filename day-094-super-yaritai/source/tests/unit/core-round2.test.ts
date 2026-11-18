/**
 * カート、確保、スイカの狙い、コンボなどの回帰試験。
 */
import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/game/sim/Simulation';
import { yawQuat } from '../../src/game/sim/physics';
import { EMPTY_INPUT, type InputState } from '../../src/shared/input';
import { CART, CLERK, FREEZER, MATCH, PA, SCORE, TANTRUM } from '../../src/shared/rules/tuning';
import type { Clerk } from '../../src/game/sim/ai/clerk';
import { aimBoxes, aimPath } from '../../src/client/render/aim3d';
import { ThrowJudge, nearestTodo } from '../../src/client/ui/hud/index';
import { MISDEEDS } from '../../src/shared/rules/misdeeds';
import { storeLayout } from '../../src/shared/layout/store';
import * as THREE from 'three';
import { FollowCamera } from '../../src/client/render/camera';
import { CpuBrain } from '../../src/game/sim/ai/cpu';
import { streamRng } from '../../src/shared/rng';
import type { GameEvent } from '../../src/shared/view';

const H = 1 / 60;

async function solo(seed = 3, npcs = false): Promise<Simulation> {
  const sim = await Simulation.create({ seed, npcs, players: [{ slot: 0, kind: 'human', name: 'あなた', character: 'ch/character-female-b' }] });
  sim.runFor(MATCH.countdown + 0.05);
  return sim;
}

function feed(sim: Simulation, input: Partial<InputState>, seconds: number, events?: GameEvent[]): void {
  for (let i = 0; i < Math.max(1, Math.round(seconds / H)); i++) {
    sim.setInput(0, { ...EMPTY_INPUT, ...input });
    sim.step(H);
    if (events) events.push(...sim.view(0).events);
  }
}

function press(sim: Simulation): void {
  feed(sim, { action: true, actionPressed: true }, H);
  feed(sim, {}, H);
}

/** 矢印キーだけ：行きたい向きを8方向に丸める（人が矢印を2つ同時に押すのと同じ） */
function arrows(dx: number, dz: number): Partial<InputState> {
  const a = Math.round(Math.atan2(dx, dz) / (Math.PI / 4)) * (Math.PI / 4);
  return { moveX: Math.round(Math.sin(a) * 1000) / 1000, moveZ: Math.round(Math.cos(a) * 1000) / 1000 };
}

describe('カート（round2 の1）', () => {
  it('置き場の6台どれに乗っても、矢印の入力だけで10秒以内に30m走れる', async () => {
    for (let ci = 0; ci < CART.count; ci++) {
      const sim = await solo();
      const cart = sim.carts[ci]!;
      const t = cart.body.translation();
      // 手前（南）から近づいて乗る
      const p = sim.nav.nearestFree(t.x, t.z + 1.0)!;
      sim.teleport(0, p.x, p.z);
      feed(sim, {}, H);
      press(sim);
      const riding = sim.avatars[0]!.ridingCart;
      expect(riding, `cart ${ci}`).not.toBeNull();
      const route = [
        { x: 5.0, z: 10.2 },
        { x: 4.0, z: 6.0 },
        { x: -12, z: 5.3 },
        { x: 12, z: 5.3 },
      ];
      let wi = 0;
      let reachedAt = -1;
      const start = sim.avatars[0]!.progress.cart ?? 0;
      for (let i = 0; i < 10 * 60; i++) {
        const c = sim.carts[riding!]!.body.translation();
        const wp = route[wi]!;
        if (Math.hypot(wp.x - c.x, wp.z - c.z) < 1.6 && wi < route.length - 1) wi++;
        feed(sim, arrows(wp.x - c.x, wp.z - c.z), H);
        if ((sim.avatars[0]!.progress.cart ?? 0) - start >= 30) {
          reachedAt = i * H;
          break;
        }
      }
      expect(reachedAt, `cart ${ci}: ${((sim.avatars[0]!.progress.cart ?? 0) - start).toFixed(1)}m`).toBeGreaterThan(0);
      sim.dispose();
    }
  });

  it('壁に押し付けても、固まらずに壁に沿って抜けられる（round3 で、押し付けて0.3秒で壁に沿って走るように変えた）', async () => {
    const sim = await solo();
    const cart = sim.carts[0]!;
    // 南の壁ぎわで、南を向いて乗る
    cart.body.setTranslation({ x: -13, y: 0, z: 12.9 }, true);
    cart.body.setRotation(yawQuat(0), true);
    sim.teleport(0, -13, 12.05);
    sim.face(0, 0);
    feed(sim, {}, 0.1);
    press(sim);
    expect(sim.avatars[0]!.ridingCart).toBe(cart.id);
    // 壁へ押し付け続ける：0.3秒で壁に沿って向きを変え、そのまま走る（固まらない）
    const a = { ...cart.body.translation() };
    feed(sim, { moveZ: 1 }, 1.5);
    const b = cart.body.translation();
    expect(Math.abs(b.x - a.x)).toBeGreaterThan(1);
    // 北へも出られる
    const c0 = { ...cart.body.translation() };
    feed(sim, { moveZ: -1 }, 0.8);
    const c1 = cart.body.translation();
    expect(c0.z - c1.z).toBeGreaterThan(0.5);
    sim.dispose();
  });

  it('置き場から北のレジに突っ込んで固まっても、左右の矢印で抜け出せる（round1 で再現した不具合）', async () => {
    const sim = await solo();
    const cart = sim.carts[3]!;
    const t = cart.body.translation();
    // 置き場の東の列の後ろ（東）から乗る（round3 で置き場は西向きの2列×3段になった）
    const p = sim.nav.nearestFree(t.x + 0.9, t.z)!;
    sim.teleport(0, p.x, p.z);
    feed(sim, {}, H);
    press(sim);
    expect(sim.avatars[0]!.ridingCart).toBe(cart.id);
    feed(sim, { moveZ: -1 }, 2.5);
    const a = { ...cart.body.translation() };
    feed(sim, { moveX: -1 }, 1.5);
    const b = cart.body.translation();
    expect(a.x - b.x).toBeGreaterThan(1.0);
    sim.dispose();
  });

  it('真後ろの入力で、ブレーキ→止まって→後退する', async () => {
    const sim = await solo();
    const cart = sim.carts[0]!;
    cart.body.setTranslation({ x: 10, y: 0, z: 5.3 }, true);
    cart.body.setRotation(yawQuat(-Math.PI / 2), true);
    sim.teleport(0, 10.85, 5.3);
    sim.face(0, -Math.PI / 2);
    feed(sim, {}, 0.1);
    press(sim);
    feed(sim, { moveX: -1 }, 1.5);
    expect(cart.speed).toBeGreaterThan(6);
    const yaw = cart.yaw;
    const x0 = cart.body.translation().x;
    // 真後ろ（東）を押す：まず止まり、そのあと東へ下がる（向きは西のまま）
    let stoppedAt = -1;
    for (let i = 0; i < 150; i++) {
      feed(sim, { moveX: 1 }, H);
      if (stoppedAt < 0 && cart.speed <= 0.05) stoppedAt = i * H;
    }
    expect(stoppedAt).toBeGreaterThan(0);
    expect(stoppedAt).toBeLessThan(1.2);
    expect(cart.speed).toBeLessThan(-1);
    expect(Math.abs(cart.yaw - yaw)).toBeLessThan(0.05);
    const x1 = cart.body.translation().x;
    // 西へ流れた分より、東へ下がった分が上回り始めている
    feed(sim, { moveX: 1 }, 1);
    expect(cart.body.translation().x).toBeGreaterThan(x1 + 1.5);
    void x0;
    sim.dispose();
  });
});

describe('捕まる瞬間（round2 の2）', () => {
  /** 開店の猶予を過ぎるまで、目立たない所で待つ */
  async function opened(seed: number): Promise<{ sim: Simulation; clerk: Clerk }> {
    const sim = await solo(seed, true);
    const clerk = sim.npcs.find((n) => n.role === 'clerk') as Clerk;
    sim.teleport(0, 16.5, 12.5);
    sim.runFor(MATCH.friendlyOpening + 0.5);
    return { sim, clerk };
  }

  /** 店員から見える、近くの歩ける所 */
  function besideClerk(sim: Simulation, clerk: Clerk, d: number): { x: number; z: number } {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const p = { x: clerk.pos.x + Math.sin(ang) * d, z: clerk.pos.z + Math.cos(ang) * d };
      if (sim.nav.isFree(p.x, p.z) && sim.nav.lineOfSight(clerk.pos, p)) return p;
    }
    throw new Error('no spot');
  }

  it('捕まるまで「！」から1秒以上。つかまれて0.6秒その場で止まり、それからカウンターで3秒休む', async () => {
    for (const seed of [5, 11]) {
      const { sim, clerk } = await opened(seed);
      const av = sim.avatars[0]!;
      av.book.raiseHeat(80);
      av.book.lastScoreAt = sim.time + 100;
      const p = besideClerk(sim, clerk, 0.7);
      sim.teleport(0, p.x, p.z);
      let noticeAt = -1;
      let caughtAt = -1;
      let caughtPos = { x: 0, z: 0 };
      for (let i = 0; i < 4 * 60 && caughtAt < 0; i++) {
        feed(sim, {}, H);
        for (const e of sim.view(0).events) {
          if (e.t === 'notice' && e.target === 0 && noticeAt < 0) noticeAt = sim.time;
          if (e.t === 'caught' && e.slot === 0) {
            caughtAt = sim.time;
            caughtPos = { x: av.pos.x, z: av.pos.z };
          }
        }
      }
      expect(noticeAt, `seed ${seed}`).toBeGreaterThan(0);
      expect(caughtAt, `seed ${seed}`).toBeGreaterThan(0);
      expect(caughtAt - noticeAt).toBeGreaterThanOrEqual(CLERK.catchDelay - 1e-6);
      // つかまれている間：その場から動かず、店員は「つかむ」動き
      feed(sim, { moveX: 1, dash: true }, CLERK.grabTime - 0.1);
      expect(Math.hypot(av.pos.x - caughtPos.x, av.pos.z - caughtPos.z)).toBeLessThan(0.05);
      expect(clerk.view().state).toBe('carry');
      expect(clerk.view().anim).toBe('hold');
      expect(sim.view(0).avatars[0]!.anim).toBe('caught');
      // それからサービスカウンターへ。残りのお休みは3秒
      feed(sim, {}, 0.15);
      const s = sim.layout.places.service;
      expect(Math.hypot(av.pos.x - s.x, av.pos.z - s.z)).toBeLessThan(0.5);
      expect(av.stunned).toBeGreaterThan(CLERK.caughtStun - 0.1);
      expect(av.stunned).toBeLessThanOrEqual(CLERK.caughtStun + 1e-6);
      sim.dispose();
    }
  });

  it('「！」を見てすぐダッシュで離れれば、手の届く距離からでも逃げられる', async () => {
    const { sim, clerk } = await opened(5);
    const av = sim.avatars[0]!;
    av.book.raiseHeat(80);
    av.book.lastScoreAt = sim.time + 100;
    const p = besideClerk(sim, clerk, 0.7);
    sim.teleport(0, p.x, p.z);
    const events: GameEvent[] = [];
    for (let i = 0; i < 60 && !events.some((e) => e.t === 'notice'); i++) feed(sim, {}, H, events);
    expect(events.some((e) => e.t === 'notice')).toBe(true);
    // 「！」が出てから0.3秒で気づいて、店員と反対へダッシュ
    feed(sim, {}, 0.3, events);
    const away = { x: av.pos.x - clerk.pos.x, z: av.pos.z - clerk.pos.z };
    const n = Math.hypot(away.x, away.z) || 1;
    const dir = sim.nav.isFree(av.pos.x + (away.x / n) * 2, av.pos.z + (away.z / n) * 2) ? { x: away.x / n, z: away.z / n } : { x: -away.z / n, z: away.x / n };
    feed(sim, { moveX: dir.x, moveZ: dir.z, dash: true }, 0.7, events);
    expect(events.some((e) => e.t === 'caught')).toBe(false);
    expect(Math.hypot(av.pos.x - clerk.pos.x, av.pos.z - clerk.pos.z)).toBeGreaterThan(CLERK.catchRange);
    sim.dispose();
  });
});

describe('スイカの狙い（round2 の3）', () => {
  /** 足型（レーン中央）に立ち、yaw を向いてスイカを持つ。線の予想と、転がした結果の倒れた本数 */
  async function rollFromLane(yaw: number, dx = 0): Promise<{ aim: ReturnType<typeof aimPath>; down: number }> {
    const sim = await solo();
    const melon = sim.props.find((p) => p.def.kind === 'watermelon')!;
    const lane = sim.layout.places.lane;
    sim.teleport(0, lane.x + dx, lane.z);
    sim.face(0, yaw);
    feed(sim, {}, H);
    // ワゴンから持ってくる手間は省いて、手に持たせる
    (sim as unknown as { hold(av: unknown, p: unknown): void }).hold(sim.avatars[0], melon);
    feed(sim, {}, 0.2);
    const av = sim.avatars[0]!;
    const pin = sim.props.find((p) => p.def.kind === 'pin')!;
    const pins = sim.props.filter((p) => p.def.kind === 'pin').map((p) => ({ x: p.body.translation().x, z: p.body.translation().z }));
    const aim = aimPath({
      from: { x: av.pos.x + Math.sin(av.yaw) * 0.75, z: av.pos.z + Math.cos(av.yaw) * 0.75 },
      yaw: av.yaw,
      boxes: aimBoxes(sim.layout),
      pins,
      hitRadius: melon.def.size.x / 2 + pin.def.size.x / 2,
      maxLen: 11,
    });
    press(sim);
    feed(sim, {}, 3);
    const down = sim.props.filter((p) => p.def.kind === 'pin' && p.moved).length;
    sim.dispose();
    return { aim, down };
  }

  it('線の色（ピンに当たるか）と、実際に転がした結果が合う', async () => {
    for (const [off, dx] of [
      [0, 0],
      [-0.04, 0],
      [0.07, 0.4],
      [-0.2, 0],
      [0.2, 0],
      [0.3, 0.4],
    ] as const) {
      const r = await rollFromLane(Math.PI + off, dx);
      expect(r.aim.pins > 0, `off ${off} dx ${dx}`).toBe(r.down > 0);
    }
    // 足型から真北へ：当たる線で、ピンが5本以上倒れる（達成できる）
    const center = await rollFromLane(Math.PI);
    expect(center.aim.pins).toBeGreaterThan(0);
    expect(center.down).toBeGreaterThanOrEqual(5);
  });

  it('線は棚で止まり、その先のピンには当たらない', async () => {
    const sim = await solo();
    const lane = sim.layout.places.lane;
    // 西の棚へ向ける
    const r = aimPath({ from: { x: lane.x - 0.75, z: lane.z }, yaw: -Math.PI / 2, boxes: aimBoxes(sim.layout), pins: [{ x: 2, z: lane.z }], hitRadius: 0.37, maxLen: 11 });
    expect(r.len).toBeLessThan(lane.x - 0.75 - 2);
    expect(r.pins).toBe(0);
    sim.dispose();
  });

  it('外れたら「ガター！」、1〜2本なら「おしい！」。3本以上やレーンの外は何も出さない', () => {
    const lane = { x: 8.5, y: 0, z: 0.5 };
    const j = new ThrowJudge();
    j.roll(0, lane, lane);
    expect(j.tick(1)).toBeNull();
    expect(j.tick(2.3)).toBe('gutter');
    expect(j.tick(2.4)).toBeNull();
    j.roll(10, lane, lane);
    j.pin(10.8);
    j.pin(10.9);
    expect(j.tick(11.5)).toBeNull();
    expect(j.tick(12.3)).toBe('close');
    j.roll(20, lane, lane);
    for (let i = 0; i < 6; i++) j.pin(20.8 + i * 0.05);
    expect(j.tick(23)).toBeNull();
    expect(j.tick(30)).toBeNull();
    // レーンの外（入口の広場）で転がしたものは数えない
    const plaza = { x: 0, y: 0, z: 6 };
    j.roll(40, plaza, plaza);
    expect(j.tick(43)).toBeNull();
    // 他の人が転がした音（自分の足元ではない）も数えない
    j.roll(50, lane, { x: 8.5, y: 0, z: 3.5 });
    expect(j.tick(53)).toBeNull();
  });
});

describe('スマホの「次にやること」（round2 の4）', () => {
  const layout = storeLayout();
  const all = MISDEEDS.map((m) => m.id);
  const except = (id: string): string[] => all.filter((x) => x !== id);

  it('まだの悪事のうち、いちばん近い1件を出す。全部済んだら出さない', () => {
    const spawn = layout.spawns[0]!;
    const h = nearestTodo(spawn, []);
    expect(h).not.toBeNull();
    // ほかのどの悪事の場所より近い
    const bell = layout.places.bell;
    expect(h!.dist).toBeLessThanOrEqual(Math.hypot(bell.x - spawn.x, bell.z - spawn.z) + 1e-6);
    // 済んだものは出さない
    const h2 = nearestTodo(spawn, [h!.id]);
    expect(h2!.id).not.toBe(h!.id);
    expect(nearestTodo(spawn, all)).toBeNull();
  });

  it('向きの矢印は画面の向き（上＝北）。着いたら「ここ！」', () => {
    const py = layout.places.pyramid;
    expect(nearestTodo({ x: py.x, z: py.z + 4 }, except('pyramid'))!.arrow).toBe('↑');
    expect(nearestTodo({ x: py.x - 4, z: py.z }, except('pyramid'))!.arrow).toBe('→');
    expect(nearestTodo({ x: py.x + 3, z: py.z + 3 }, except('pyramid'))!.arrow).toBe('↖');
    expect(nearestTodo({ x: py.x, z: py.z }, except('pyramid'))!.arrow).toBe('ここ！');
    expect(nearestTodo({ x: py.x, z: py.z }, except('pyramid'))!.name).toBe('缶ピラミッドを崩す');
  });

  it('スイカは、持っていなければワゴンへ、持っていればレーンの足型へ案内する', () => {
    const w = layout.places.wagon;
    expect(nearestTodo({ x: w.x, z: w.z }, except('bowling'), false)!.arrow).toBe('ここ！');
    expect(nearestTodo({ x: w.x, z: w.z }, except('bowling'), true)!.arrow).toBe('↑');
  });
});

describe('コンボ（round2 の5）', () => {
  const remaining = (sim: Simulation): number => sim.avatars[0]!.book.comboView(sim.time).remaining;

  it('猶予は5秒', async () => {
    const sim = await solo();
    sim.award(0, 'knock', 10, sim.avatars[0]!.pos);
    expect(SCORE.comboWindow).toBe(5);
    expect(remaining(sim)).toBeCloseTo(5, 3);
    sim.dispose();
  });

  it('長押しの最中（放送・駄々・冷凍ケース）は猶予が減らず、離すと減りはじめる', async () => {
    // 放送：2秒の長押しのうち1.5秒
    {
      const sim = await solo();
      const pa = sim.layout.places.pa;
      sim.teleport(0, pa.x, pa.z);
      feed(sim, {}, 0.1);
      sim.award(0, 'knock', 10, sim.avatars[0]!.pos);
      const r0 = remaining(sim);
      feed(sim, { action: true, actionPressed: true }, H);
      feed(sim, { action: true }, PA.holdTime - 0.5);
      expect(remaining(sim)).toBeGreaterThan(r0 - 0.1);
      // 離したら（連打の間あけの0.6秒のあと）減りはじめる
      feed(sim, {}, SCORE.engageGrace + 1);
      expect(remaining(sim)).toBeLessThan(r0 - 0.9);
      sim.dispose();
    }
    // 駄々：お菓子の通路で止まって長押し。最初の点（押して0.3秒＋1秒）の前まで
    {
      const sim = await solo();
      const t = sim.layout.places.tantrum;
      const p = sim.nav.nearestFree(t.x, t.z)!;
      sim.teleport(0, p.x, p.z);
      feed(sim, {}, 0.3);
      sim.award(0, 'knock', 10, sim.avatars[0]!.pos);
      const r0 = remaining(sim);
      feed(sim, { action: true, actionPressed: true }, H);
      feed(sim, { action: true }, TANTRUM.holdDelay + 0.9);
      expect(sim.view(0).avatars[0]!.anim).toBe('tantrum');
      expect(remaining(sim)).toBeGreaterThan(r0 - 0.1);
      sim.dispose();
    }
    // 冷凍ケース：飛び込んでから最初の点（1秒）の前まで
    {
      const sim = await solo();
      const f = sim.layout.places.freezer;
      const p = sim.nav.nearestFree(f.x, f.z + 1.6)!;
      sim.teleport(0, p.x, p.z);
      feed(sim, {}, 0.2);
      expect(sim.avatars[0]!.offer?.system.id).toBe('freezer');
      sim.award(0, 'knock', 10, sim.avatars[0]!.pos);
      const r0 = remaining(sim);
      press(sim);
      feed(sim, {}, FREEZER.hopTime + 0.8);
      expect(sim.view(0).stations.freezerSlots).toContain(0);
      expect(remaining(sim)).toBeGreaterThan(r0 - 0.1);
      sim.dispose();
    }
  });

  it('連打の最中（ベル）は猶予が減らない', async () => {
    const sim = await solo();
    const b = sim.layout.places.bell;
    sim.teleport(0, b.x, b.z);
    feed(sim, {}, 0.1);
    sim.award(0, 'knock', 10, sim.avatars[0]!.pos);
    let low = Infinity;
    for (let i = 0; i < 8; i++) {
      press(sim);
      feed(sim, {}, 0.4);
      low = Math.min(low, remaining(sim));
    }
    expect(low).toBeGreaterThan(SCORE.comboWindow - 0.1);
    sim.dispose();
  });
});

describe('不具合（round2 の6）', () => {
  /** 冷凍ケースの前（南）から「入る」。x を渡せば、その前の冷凍ケースへ */
  async function inFreezer(x?: number): Promise<Simulation> {
    const sim = await solo();
    const f = sim.layout.places.freezer;
    const p = sim.nav.nearestFree(x ?? f.x, f.z + 1.6)!;
    sim.teleport(0, p.x, p.z);
    feed(sim, {}, 0.2);
    press(sim);
    feed(sim, {}, FREEZER.hopTime + 0.3);
    expect(sim.view(0).stations.freezerSlots).toContain(0);
    return sim;
  }

  it('冷凍ケースから移動で出られる：移動キーを0.3秒押し続けると、その向きへ飛び出す。ちょっと押しただけでは出ない', async () => {
    // 4台は東西に並んでいるので、東へは東の端の1台から
    const east = Math.max(...storeLayout().fixtures.filter((x) => x.kind === 'freezer').map((x) => x.pos.x));
    for (const [dx, dz, at] of [
      [0, 1, undefined],
      [0, -1, undefined],
      [1, 0, east],
    ] as const) {
      const sim = await inFreezer(at);
      const fx = sim.layout.fixtures.find((x) => x.kind === 'freezer' && Math.abs(sim.avatars[0]!.pos.x - x.pos.x) < x.size.x / 2 && Math.abs(sim.avatars[0]!.pos.z - x.pos.z) < x.size.z / 2)!;
      // ちょっと押しただけ（0.2秒）では出ない
      feed(sim, { moveX: dx, moveZ: dz }, 0.2);
      feed(sim, {}, 0.3);
      expect(sim.view(0).stations.freezerSlots).toContain(0);
      // 押し続けると出る
      feed(sim, { moveX: dx, moveZ: dz }, FREEZER.exitHold + 0.05);
      feed(sim, {}, FREEZER.hopTime + 0.3);
      const av = sim.avatars[0]!;
      expect(sim.view(0).stations.freezerSlots, `dir ${dx},${dz}`).not.toContain(0);
      // 押した向きの外にいる
      const ox = (av.pos.x - fx.pos.x) * dx;
      const oz = (av.pos.z - fx.pos.z) * dz;
      expect(Math.max(ox, oz), `dir ${dx},${dz}`).toBeGreaterThan(Math.min(fx.size.x, fx.size.z) / 2);
      expect(sim.nav.isFree(av.pos.x, av.pos.z)).toBe(true);
      sim.dispose();
    }
  });

  it('数え終わった冷凍ケース・駄々の案内は「0.0/3秒」に戻らない', async () => {
    const sim = await inFreezer();
    feed(sim, {}, 1.2);
    expect(sim.avatars[0]!.offer?.prompt?.progress).toBeGreaterThan(0.2);
    feed(sim, {}, FREEZER.maxSeconds);
    expect(sim.avatars[0]!.book.achieved).toContain('freezer');
    expect(sim.avatars[0]!.offer?.prompt?.label).toBe('出る');
    expect(sim.avatars[0]!.offer?.prompt?.progress).toBeUndefined();
    sim.dispose();

    const s2 = await solo();
    const t = s2.layout.places.tantrum;
    const p = s2.nav.nearestFree(t.x, t.z)!;
    s2.teleport(0, p.x, p.z);
    feed(s2, {}, 0.3);
    feed(s2, { action: true, actionPressed: true }, H);
    feed(s2, { action: true }, TANTRUM.holdDelay + TANTRUM.maxSeconds + 0.2);
    expect(s2.avatars[0]!.book.achieved).toContain('tantrum');
    // 押している間は 3.0/3秒 のまま
    expect(s2.avatars[0]!.offer?.prompt?.progress).toBeCloseTo(1, 3);
    // 離したら秒は出さない（休みの間にもう一度押しても 0.0 は出さない）
    feed(s2, {}, 0.2);
    expect(s2.avatars[0]!.offer?.prompt?.progress).toBeUndefined();
    feed(s2, { action: true, actionPressed: true }, H);
    feed(s2, { action: true }, 1);
    expect(s2.avatars[0]!.offer?.prompt?.progress).toBeUndefined();
    s2.dispose();
  });
});

describe('カメラとCPU（round2 の7）', () => {
  /** キャラの足元が画面のどこに映るか（-1＝下の端、+1＝上の端）と、カメラの向き */
  function view(w: number, h: number): { y: number; dir: THREE.Vector3 } {
    const cam = new FollowCamera();
    cam.resize(w, h);
    const me = { x: 3.6, y: 0, z: 11.8 };
    cam.update(1 / 60, me);
    cam.camera.updateMatrixWorld();
    const v = new THREE.Vector3(me.x, 0.9, me.z).project(cam.camera);
    return { y: v.y, dir: cam.camera.getWorldDirection(new THREE.Vector3()) };
  }

  it('スマホ縦だけ、自分を画面の下寄りに置く（向きは北のまま）', () => {
    const tall = view(390, 844);
    const wide = view(1440, 900);
    // 縦：画面の下寄り（中心より下、下から3分の1あたり）
    expect(tall.y).toBeLessThan(-0.2);
    expect(tall.y).toBeGreaterThan(-0.6);
    // 横：これまでどおりほぼ真ん中
    expect(Math.abs(wide.y)).toBeLessThan(0.15);
    // 向きは変えない（北＝-z を向いたまま、東西には振らない）
    for (const d of [tall.dir, wide.dir]) {
      expect(Math.abs(d.x)).toBeLessThan(1e-6);
      expect(d.z).toBeLessThan(0);
    }
  });

  it('CPU の最初の行き先は毎回同じではなく、序盤保護中の缶ピラミッド選択はゼロ', async () => {
    const firsts: string[] = [];
    for (const level of ['normal', 'hard'] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        const sim = await Simulation.create({
          seed: seed * 7 + 1,
          npcs: false,
          players: [
            { slot: 0, kind: 'human', name: 'あなた', character: 'ch/character-female-b' },
            { slot: 1, kind: 'cpu', name: 'CPU', character: 'ch/character-male-f', speedScale: 1 },
          ],
        });
        const brain = new CpuBrain(level, streamRng(seed * 7 + 1, 'cpu'));
        sim.setController(1, brain);
        sim.runFor(MATCH.countdown + 0.3);
        firsts.push((brain as unknown as { task: { kind: string } | null }).task?.kind ?? 'none');
        sim.dispose();
      }
    }
    expect(new Set(firsts).size).toBeGreaterThanOrEqual(3);
    expect(firsts.filter((k) => k === 'pyramid')).toHaveLength(0);
  });
});
