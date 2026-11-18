/**
 * 操作の案内と判定範囲、カートの動き、店員の通知などの回帰試験。
 */
import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/game/sim/Simulation';
import { EMPTY_INPUT, type InputState } from '../../src/shared/input';
import { MATCH, PA, SAMPLES } from '../../src/shared/rules/tuning';
import type { GameEvent, StationsView } from '../../src/shared/view';
import type { Clerk } from '../../src/game/sim/ai/clerk';
import { bubbleY, edgeToward, misdeedPhrases, waitTexts } from '../../src/client/ui/hud/guide';
import { nearestTodo } from '../../src/client/ui/hud/index';
import { MISDEEDS } from '../../src/shared/rules/misdeeds';
import { storeLayout } from '../../src/shared/layout/store';
import * as THREE from 'three';
import { applyXray } from '../../src/client/render/xray';
import { aimBoxes, pinStanding } from '../../src/client/render/aim3d';
import { popHtml } from '../../src/client/ui/hud/index';
import { stickVector } from '../../src/client/input/touch';
import { FALL } from '../../src/shared/rules/tuning';

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

interface Approach {
  from: { x: number; z: number };
  dir: { x: number; z: number };
  /** 案内が出てから、さらに歩いてしまうコマ数（人の反応の遅れ・表示の遅れ） */
  late: number;
}

/**
 * from から dir へ歩き、案内 label が最初に出た所で（late コマ遅れて）手を離して押す。
 * 案内が出なければ null。出たら、押したあとの sim を返す（呼んだ側で確かめて dispose する）
 */
async function approachAndPress(a: Approach, label: string, press: 'press' | 'hold', holdSeconds = 0): Promise<{ sim: Simulation; at: { x: number; z: number } } | null> {
  const sim = await solo();
  sim.teleport(0, a.from.x, a.from.z);
  feed(sim, {}, H);
  const av = sim.avatars[0]!;
  const n = Math.hypot(a.dir.x, a.dir.z);
  const mv = { moveX: a.dir.x / n, moveZ: a.dir.z / n };
  let at: { x: number; z: number } | null = null;
  for (let i = 0; i < 6 * 60; i++) {
    feed(sim, mv, H);
    if (av.offer?.prompt?.label === label) {
      at = { x: av.pos.x, z: av.pos.z };
      break;
    }
  }
  if (!at) {
    sim.dispose();
    return null;
  }
  feed(sim, mv, a.late * H);
  feed(sim, { action: true, actionPressed: true }, H);
  if (press === 'hold') feed(sim, { action: true }, holdSeconds);
  else feed(sim, {}, H);
  return { sim, at };
}

describe('表示と届く範囲をそろえる（C1）', () => {
  it('缶ピラミッド：「蹴る」が出た最初の位置で押すと、10回中10回、缶が動く', async () => {
    const approaches: Approach[] = [
      { from: { x: 2.3, z: 9 }, dir: { x: 0, z: -1 }, late: 0 },
      { from: { x: 2.9, z: 9 }, dir: { x: 0, z: -1 }, late: 1 },
      { from: { x: 3.5, z: 9 }, dir: { x: 0, z: -1 }, late: 2 },
      { from: { x: 4.1, z: 9 }, dir: { x: 0, z: -1 }, late: 0 },
      { from: { x: 4.7, z: 9 }, dir: { x: 0, z: -1 }, late: 1 },
      { from: { x: 0.2, z: 8.5 }, dir: { x: 1, z: -1 }, late: 2 },
      { from: { x: 6.8, z: 6.8 }, dir: { x: -1, z: -0.7 }, late: 0 },
      { from: { x: 6.8, z: 5.2 }, dir: { x: -1, z: 0 }, late: 1 },
      { from: { x: 0.2, z: 5.2 }, dir: { x: 1, z: 0 }, late: 2 },
      { from: { x: 3.5, z: 11.5 }, dir: { x: 0, z: -1 }, late: 0 },
    ];
    let ok = 0;
    const misses: string[] = [];
    for (const a of approaches) {
      const r = await approachAndPress(a, '蹴る', 'press');
      if (!r) {
        misses.push(`no prompt ${JSON.stringify(a.from)}`);
        continue;
      }
      feed(r.sim, {}, 1.2);
      const moved = r.sim.props.filter((p) => p.def.kind === 'can' && p.moved).length;
      if (moved > 0) ok++;
      else misses.push(`${JSON.stringify(a.from)} at ${r.at.x.toFixed(2)},${r.at.z.toFixed(2)}`);
      r.sim.dispose();
    }
    expect(misses).toEqual([]);
    expect(ok).toBe(10);
  });

  it('冷凍ケース：「入る」が出た最初の位置で押すと、左右・角・正面のどこから来ても10回中10回入れる', async () => {
    const approaches: Approach[] = [
      { from: { x: -6, z: -11.6 }, dir: { x: 1, z: 0 }, late: 0 },
      { from: { x: -6, z: -10.4 }, dir: { x: 1, z: 0 }, late: 2 },
      { from: { x: -5.5, z: -9 }, dir: { x: 1, z: -0.8 }, late: 1 },
      { from: { x: -3.7, z: -9 }, dir: { x: 0, z: -1 }, late: 2 },
      { from: { x: 8, z: -11.6 }, dir: { x: -1, z: 0 }, late: 0 },
      { from: { x: 7, z: -9 }, dir: { x: -1, z: -0.8 }, late: 2 },
      { from: { x: 6.5, z: -10.4 }, dir: { x: -1, z: 0 }, late: 1 },
      { from: { x: 0, z: -8 }, dir: { x: 0, z: -1 }, late: 0 },
      { from: { x: -1.76, z: -8 }, dir: { x: 0, z: -1 }, late: 2 },
      { from: { x: 3.76, z: -8 }, dir: { x: 0.3, z: -1 }, late: 1 },
    ];
    const misses: string[] = [];
    for (const a of approaches) {
      const r = await approachAndPress(a, '入る', 'press');
      if (!r) {
        misses.push(`no prompt ${JSON.stringify(a.from)}`);
        continue;
      }
      feed(r.sim, {}, 0.8);
      if (!r.sim.view(0).stations.freezerSlots.includes(0)) misses.push(`${JSON.stringify(a.from)} at ${r.at.x.toFixed(2)},${r.at.z.toFixed(2)}`);
      r.sim.dispose();
    }
    expect(misses).toEqual([]);
  });

  it('放送：「放送する」が出た最初の位置で止まって長押しすると、かすめて通った時も10回中10回放送できる', async () => {
    const c = { x: -16.4, z: -12.5 };
    const r = 1.2;
    const approaches: Approach[] = [
      // ブースの入口から中心へ
      { from: { x: -13, z: -10 }, dir: { x: -1, z: -0.8 }, late: 0 },
      { from: { x: -12.5, z: -11.4 }, dir: { x: -1, z: -0.2 }, late: 2 },
      { from: { x: -13.5, z: -9.5 }, dir: { x: -0.6, z: -1 }, late: 1 },
      { from: { x: -14.7, z: -9.6 }, dir: { x: -0.5, z: -1 }, late: 3 },
      // 円のふちをかすめて通る（止まりぎわに滑って範囲を出る）
      { from: { x: -14.6, z: c.z + r - 0.02 }, dir: { x: -1, z: 0 }, late: 3 },
      { from: { x: -14.6, z: c.z + r - 0.05 }, dir: { x: -1, z: 0 }, late: 3 },
      { from: { x: -14.6, z: c.z + r - 0.1 }, dir: { x: -1, z: 0 }, late: 2 },
      { from: { x: c.x + r - 0.02, z: -10.9 }, dir: { x: 0, z: -1 }, late: 3 },
      { from: { x: c.x + r - 0.05, z: -10.9 }, dir: { x: 0, z: -1 }, late: 3 },
      { from: { x: c.x + r - 0.1, z: -10.9 }, dir: { x: 0, z: -1 }, late: 2 },
    ];
    const misses: string[] = [];
    for (const a of approaches) {
      const res = await approachAndPress(a, '放送する', 'hold', PA.holdTime + 0.4);
      if (!res) {
        misses.push(`no prompt ${JSON.stringify(a.from)}`);
        continue;
      }
      if ((res.sim.avatars[0]!.progress.pa ?? 0) < 1) misses.push(`${JSON.stringify(a.from)} at ${res.at.x.toFixed(2)},${res.at.z.toFixed(2)}`);
      res.sim.dispose();
    }
    expect(misses).toEqual([]);
  });

  it('長押し・連打の案内は、範囲を出ても0.4秒は残り「蹴る」に化けない。離れきったら消える', async () => {
    const sim = await solo();
    const b = sim.layout.places.bell;
    sim.teleport(0, b.x, b.z);
    feed(sim, {}, 0.1);
    const av = sim.avatars[0]!;
    expect(av.offer?.prompt?.label).toBe('鳴らす');
    // 範囲のふちから、外へ少しだけ出す（滑って出たのと同じ）
    sim.teleport(0, b.x + 1.5, b.z);
    feed(sim, {}, H);
    expect(av.offer?.prompt?.label).toBe('鳴らす');
    sim.teleport(0, b.x + 1.8, b.z);
    feed(sim, {}, 0.1);
    expect(av.offer?.prompt?.label).toBe('鳴らす');
    const score = av.book.score;
    feed(sim, { action: true, actionPressed: true }, H);
    expect(av.book.score).toBeGreaterThan(score);
    // 0.4秒たてば消える
    feed(sim, {}, 0.5);
    expect(av.offer?.prompt?.label ?? '蹴る').not.toBe('鳴らす');
    sim.dispose();
  });
});

describe('案内を残すのは悪事の最中だけ（C1 の副作用の確かめ）', () => {
  it('カートを降りた直後に「降りる」の案内は残らない（押すとまた乗ってしまわない）', async () => {
    const sim = await solo();
    const cart = sim.carts[0]!;
    const t = cart.body.translation();
    const p = sim.nav.nearestFree(t.x - 0.9, t.z)!;
    sim.teleport(0, p.x, p.z);
    feed(sim, {}, H);
    feed(sim, { action: true, actionPressed: true }, H);
    feed(sim, {}, H);
    const av = sim.avatars[0]!;
    expect(av.ridingCart).toBe(0);
    feed(sim, { moveX: -1 }, 0.6);
    feed(sim, { action: true, actionPressed: true }, H);
    feed(sim, {}, H);
    expect(av.ridingCart).toBeNull();
    expect(av.offer?.prompt?.label ?? '蹴る').not.toBe('降りる');
    sim.dispose();
  });
});

describe('カート置き場（C2）', () => {
  it('置き場のどのカートでも、乗って↑だけを1秒押すと2m以上進む', async () => {
    const results: string[] = [];
    for (let ci = 0; ci < 6; ci++) {
      const sim = await solo();
      const cart = sim.carts[ci]!;
      const t = cart.body.translation();
      // 西の列は前（西）から、東の列は後ろ（東）から近づく（そのカートがいちばん近くなる所）
      const p = sim.nav.nearestFree(t.x + (t.x < 8.75 ? -0.9 : 0.9), t.z)!;
      sim.teleport(0, p.x, p.z);
      feed(sim, {}, H);
      feed(sim, { action: true, actionPressed: true }, H);
      feed(sim, {}, H);
      const av = sim.avatars[0]!;
      expect(av.ridingCart, `cart ${ci}`).toBe(ci);
      const s = cart.body.translation();
      const start = { x: s.x, z: s.z };
      feed(sim, { moveZ: -1 }, 1);
      const e = cart.body.translation();
      const d = Math.hypot(e.x - start.x, e.z - start.z);
      results.push(`${ci}:${d.toFixed(2)}`);
      expect(d, `cart ${ci} ${results.join(' ')}`).toBeGreaterThanOrEqual(2);
      sim.dispose();
    }
  });

  it('置き場のカートは西（入口の広場）を向いて、重ならずに並ぶ', async () => {
    const sim = await solo();
    for (const c of sim.carts) {
      const q = c.body.rotation();
      const yaw = 2 * Math.atan2(q.y, q.w);
      expect(Math.sin(yaw)).toBeLessThan(-0.99);
    }
    sim.dispose();
  });

  it('壁に正面から押し付けると、0.3秒で壁に沿って向きを変えて走り出す', async () => {
    const sim = await solo();
    const cart = sim.carts[0]!;
    // 南の壁ぎわで南を向け、南へ押し付ける
    cart.body.setTranslation({ x: -13, y: 0, z: 12.9 }, true);
    cart.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    sim.teleport(0, -13, 12.0);
    sim.face(0, 0);
    feed(sim, {}, 0.1);
    feed(sim, { action: true, actionPressed: true }, H);
    feed(sim, {}, H);
    expect(sim.avatars[0]!.ridingCart).toBe(0);
    const s = cart.body.translation();
    feed(sim, { moveZ: 1 }, 1.2);
    const e = cart.body.translation();
    // 南へは進めないが、壁に沿って東か西へ1m以上走っている
    expect(Math.abs(e.x - s.x)).toBeGreaterThan(1);
    sim.dispose();
  });
});

describe('見つかった瞬間（C3）', () => {
  it('知らせを出す画面の端は、店員がいる側（カメラの後ろなら反対）', () => {
    const me = { x: 400, y: 300 };
    expect(edgeToward(me, { x: 100, y: 320, visible: true }, 800, 600)).toBe('left');
    expect(edgeToward(me, { x: 760, y: 280, visible: true }, 800, 600)).toBe('right');
    expect(edgeToward(me, { x: 420, y: 40, visible: true }, 800, 600)).toBe('top');
    expect(edgeToward(me, { x: 380, y: 590, visible: true }, 800, 600)).toBe('bottom');
    // カメラの後ろ（画面に写らない）なら向きを反対に
    expect(edgeToward(me, { x: 420, y: 40, visible: false }, 800, 600)).toBe('bottom');
  });

  it('店員は追っている間ずっと、頭に「！」を出し続ける', async () => {
    const sim = await solo(5, true);
    const clerk = sim.npcs.find((n) => n.role === 'clerk') as Clerk;
    sim.teleport(0, 16.5, 12.5);
    sim.runFor(MATCH.friendlyOpening + 0.5);
    const av = sim.avatars[0]!;
    av.book.raiseHeat(90);
    av.book.lastScoreAt = sim.time + 100;
    // 店員から見える6mほどの所
    let spot: { x: number; z: number } | null = null;
    for (let a = 0; a < 16 && !spot; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const p = { x: clerk.pos.x + Math.sin(ang) * 6, z: clerk.pos.z + Math.cos(ang) * 6 };
      if (sim.nav.isFree(p.x, p.z) && sim.nav.lineOfSight(clerk.pos, p)) spot = p;
    }
    sim.teleport(0, spot!.x, spot!.z);
    let chaseSteps = 0;
    let bubbleSteps = 0;
    const events: GameEvent[] = [];
    for (let i = 0; i < 4 * 60; i++) {
      feed(sim, {}, H, events);
      const v = clerk.view();
      if (v.state === 'chase') {
        chaseSteps++;
        if (v.bubble === '!') bubbleSteps++;
      }
      if (events.some((e) => e.t === 'caught')) break;
    }
    expect(events.some((e) => e.t === 'notice' && e.target === 0)).toBe(true);
    expect(chaseSteps).toBeGreaterThan(20);
    expect(bubbleSteps).toBe(chaseSteps);
    sim.dispose();
  });
});

describe('補充待ちの見える化（C4）', () => {
  const base: StationsView = {
    pyramid: { collapsed: false, rebuildIn: 0 },
    bowling: { pinsDown: 0, resetIn: 0 },
    samples: { left: 8, refillIn: 0 },
    watermelons: { left: 6, refillIn: 0 },
    pa: { activeSlot: null, holdProgress: 0, cooldown: 0 },
    freezerSlots: [],
  };

  it('空の試食台・崩れた缶ピラミッド・倒れたピン・空のワゴンは「〜まで◯秒」を出す', () => {
    expect(waitTexts(base)).toEqual({});
    const w = waitTexts({ ...base, samples: { left: 0, refillIn: 13.2 }, pyramid: { collapsed: true, rebuildIn: 7.6 }, bowling: { pinsDown: 4, resetIn: 4.1 } });
    expect(w.samples).toBe('補充まで14秒');
    expect(w.pyramid).toBe('積み直しまで8秒');
    expect(w.bowling).toBe('並び直しまで5秒');
    expect(waitTexts({ ...base, watermelons: { left: 0, refillIn: 11.5 } }).bowling).toBe('スイカ補充まで12秒');
  });

  it('スマホの「近く：」は、補充を待っている悪事を候補から外す', () => {
    const layout = storeLayout();
    const sp = layout.places.samples;
    const others = MISDEEDS.map((m) => m.id).filter((id) => id !== 'samples' && id !== 'freezer');
    // 試食台の前：試食が残っていれば「試食を食べ尽くす」、空なら別の悪事
    expect(nearestTodo({ x: sp.x, z: sp.z }, others, false, layout, base)!.id).toBe('samples');
    const empty = { ...base, samples: { left: 0, refillIn: 10 } };
    expect(nearestTodo({ x: sp.x, z: sp.z }, others, false, layout, empty)!.id).not.toBe('samples');
  });

  it('試食を食べ尽くすと、台の補充までの秒が見え方に出る', async () => {
    const sim = await solo();
    const sp = sim.layout.places.samples;
    sim.teleport(0, sp.x, sp.z);
    feed(sim, {}, 0.1);
    for (let i = 0; i < SAMPLES.count; i++) {
      feed(sim, { action: true, actionPressed: true }, H);
      feed(sim, {}, SAMPLES.biteInterval + 0.05);
    }
    const st = sim.view(0).stations;
    expect(st.samples.left).toBe(0);
    expect(waitTexts(st).samples).toMatch(/^補充まで\d+秒$/);
    sim.dispose();
  });
});

describe('一覧の項目は文節で折る（C7）', () => {
  it('10個の名前を文節に分け、つなげると元の名前に戻る', () => {
    for (const m of MISDEEDS) {
      const p = misdeedPhrases(m.id, m.name);
      expect(p.join('')).toBe(m.name);
      expect(p.length).toBeGreaterThanOrEqual(2);
      // 1文字だけの区切りを作らない
      for (const part of p) expect(part.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('スマホのスティック（C5）', () => {
  it('不感帯は小さく、指を少し動かしただけで速く動き出す（半径の55%で全速）', () => {
    expect(stickVector(2, 0)).toEqual({ x: 0, z: 0 });
    // 指を毎秒300画素で動かして50ミリ秒（15画素）：もう3割以上の速さで動く（以前は2割未満）
    expect(Math.hypot(stickVector(0, -15).x, stickVector(0, -15).z)).toBeGreaterThan(0.3);
    expect(stickVector(0, -15).z).toBeLessThan(0);
    // 半径の55%（約31画素）で全速
    const full = stickVector(31, 0);
    expect(full.x).toBeCloseTo(1, 2);
    // 向きは指の向きのまま
    const d = stickVector(20, 20);
    expect(d.x).toBeCloseTo(d.z, 6);
  });
});

describe('点の「ポン」と透かし（C9）', () => {
  it('点の「ポン」に、その人の形（●▲■◆）が付く', () => {
    expect(popHtml(0, 60)).toContain('●');
    expect(popHtml(1, 60)).toContain('▲');
    expect(popHtml(2, 15)).toContain('■');
    expect(popHtml(3, 15)).toContain('◆');
    expect(popHtml(1, 60)).toContain('+60');
  });

  it('透かしは網点で抜かず、半透明で薄くする', () => {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    applyXray(m);
    expect(m.transparent).toBe(true);
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main() {\n#include <project_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main() {\n#include <opaque_fragment>\n}',
    };
    m.onBeforeCompile(shader as never, {} as never);
    expect(shader.fragmentShader).toContain('gl_FragColor.a *= xrayAlpha');
    expect(shader.fragmentShader).not.toContain('discard');
  });
});

describe('スイカの点線（C10）', () => {
  it('線を止めるのは棚と壁だけ（ワゴン・台・札では切らない）', () => {
    const layout = storeLayout();
    const boxes = aimBoxes(layout);
    const wagon = layout.fixtures.find((f) => f.kind === 'wagon')!;
    const c = wagon.colliders[0]!;
    expect(boxes.some((b) => Math.abs(b.x0 - c.min.x) < 1e-6 && Math.abs(b.z0 - c.min.z) < 1e-6)).toBe(false);
    const table = layout.fixtures.find((f) => f.kind === 'sale-table')!;
    for (const tc of table.colliders) expect(boxes.some((b) => Math.abs(b.x0 - tc.min.x) < 1e-6 && Math.abs(b.z1 - tc.max.z) < 1e-6)).toBe(false);
    // 棚は入っている
    const shelf = layout.fixtures.find((f) => f.kind === 'shelf' && f.colliders.some((q) => q.min.y <= 0.45))!;
    const sc = shelf.colliders.find((q) => q.min.y <= 0.45)!;
    expect(boxes.some((b) => Math.abs(b.x0 - sc.min.x) < 1e-6 && Math.abs(b.z0 - sc.min.z) < 1e-6)).toBe(true);
  });

  it('ピンが立っているかは、シミュレーションの「動いた（倒れた）」と同じ決まりで見る', () => {
    const home = { x: 8.5, y: 0.2, z: -6.4 };
    const at = (x: number, y: number, z: number, q: [number, number, number, number]): number[] => [x, y, z, ...q];
    expect(pinStanding(at(8.5, 0.2, -6.4, [0, 0, 0, 1]), 0, home)).toBe(true);
    // 押されて少しずれただけなら、まだ立っている
    expect(pinStanding(at(8.5 + FALL.moveDistance * 0.5, 0.2, -6.4, [0, 0, 0, 1]), 0, home)).toBe(true);
    // 定位置から moveDistance 以上動いた・大きく傾いたものは、立っていない（当たっても点にならない）
    expect(pinStanding(at(8.5 + FALL.moveDistance + 0.05, 0.2, -6.4, [0, 0, 0, 1]), 0, home)).toBe(false);
    const tilt = (60 * Math.PI) / 180;
    expect(pinStanding(at(8.5, 0.2, -6.4, [Math.sin(tilt / 2), 0, 0, Math.cos(tilt / 2)]), 0, home)).toBe(false);
  });
});

describe('缶ピラミッドは「蹴る」が出た最初の位置から1回で崩れる（round4 の F2）', () => {
  it('どの方向から来ても、最初に「蹴る」が出た位置で1回押すだけで8割が崩れる（10方向）', async () => {
    const approaches: Approach[] = [
      { from: { x: 2.3, z: 9 }, dir: { x: 0, z: -1 }, late: 0 },
      { from: { x: 2.9, z: 9 }, dir: { x: 0, z: -1 }, late: 1 },
      { from: { x: 3.5, z: 9 }, dir: { x: 0, z: -1 }, late: 0 },
      { from: { x: 4.1, z: 9 }, dir: { x: 0, z: -1 }, late: 2 },
      { from: { x: 4.7, z: 9 }, dir: { x: 0, z: -1 }, late: 1 },
      { from: { x: 0.2, z: 8.5 }, dir: { x: 1, z: -1 }, late: 0 },
      { from: { x: 6.8, z: 6.8 }, dir: { x: -1, z: -0.7 }, late: 2 },
      { from: { x: 6.8, z: 5.2 }, dir: { x: -1, z: 0 }, late: 0 },
      { from: { x: 0.2, z: 5.2 }, dir: { x: 1, z: 0 }, late: 1 },
      { from: { x: 3.5, z: 11.5 }, dir: { x: 0, z: -1 }, late: 0 },
    ];
    const misses: string[] = [];
    for (const a of approaches) {
      const r = await approachAndPress(a, '蹴る', 'press');
      if (!r) {
        misses.push(`no prompt ${JSON.stringify(a.from)}`);
        continue;
      }
      feed(r.sim, {}, 2.5);
      const moved = r.sim.props.filter((p) => p.def.kind === 'can' && p.moved).length;
      if (!r.sim.avatars[0]!.book.achieved.includes('pyramid')) misses.push(`${JSON.stringify(a.from)} at ${r.at.x.toFixed(2)},${r.at.z.toFixed(2)} moved ${moved}`);
      r.sim.dispose();
    }
    expect(misses).toEqual([]);
  });
});

describe('連打と長押しの受け付け（round4 の F3）', () => {
  it('ベルは約8回/秒（7コマごと）でも、12回/秒（5コマごと）でも、押した分だけ数える', async () => {
    for (const frames of [7, 5]) {
      const sim = await solo();
      const b = sim.layout.places.bell;
      sim.teleport(0, b.x, b.z);
      feed(sim, {}, 0.1);
      for (let i = 0; i < 15; i++) {
        feed(sim, { action: true, actionPressed: true }, H);
        feed(sim, {}, (frames - 1) * H);
      }
      expect(sim.avatars[0]!.progress.bell, `${frames}コマごと`).toBe(15);
      sim.dispose();
    }
  });

  it('駄々は看板の真下から0.8m以内なら、棚のそばでも「駄々をこねる」が出て、長押しでこねられる', async () => {
    const sim = await solo();
    const t = sim.layout.places.tantrum;
    // 看板の真下から西の棚の方へ0.7m（以前は棚の「なぎ払う」に負けて案内が出なかった所）
    sim.teleport(0, t.x - 0.7, t.z);
    feed(sim, {}, 0.3);
    const av = sim.avatars[0]!;
    expect(av.offer?.prompt?.label).toBe('駄々をこねる');
    feed(sim, { action: true, actionPressed: true }, H);
    feed(sim, { action: true }, 3.5);
    expect(av.book.achieved).toContain('tantrum');
    sim.dispose();
  });
});

describe('スイカ（round4 の F4）', () => {
  it('ピンが立っているとき、通路から北を向いて転がすと10回中7回以上で5本以上倒れる', async () => {
    const results: number[] = [];
    for (let i = 0; i < 10; i++) {
      const sim = await solo(3 + i);
      const melon = sim.props.find((p) => p.def.kind === 'watermelon')!;
      sim.teleport(0, 8.0 + i * 0.1, i % 2 === 0 ? -0.8 : 0.6);
      sim.face(0, Math.PI);
      feed(sim, {}, H);
      (sim as unknown as { hold(av: unknown, p: unknown): void }).hold(sim.avatars[0], melon);
      feed(sim, {}, 0.2);
      feed(sim, { action: true, actionPressed: true }, H);
      feed(sim, {}, 3);
      results.push(sim.props.filter((p) => p.def.kind === 'pin' && p.moved).length);
      sim.dispose();
    }
    expect(results.filter((n) => n >= 5).length, results.join(',')).toBeGreaterThanOrEqual(7);
  });

  it('スイカを持ってレーンにいる間、←→はその場で向きだけ変える（↑↓は前後に動くだけ）', async () => {
    const sim = await solo();
    const melon = sim.props.find((p) => p.def.kind === 'watermelon')!;
    const lane = sim.layout.places.lane;
    sim.teleport(0, lane.x, lane.z);
    sim.face(0, Math.PI);
    feed(sim, {}, H);
    (sim as unknown as { hold(av: unknown, p: unknown): void }).hold(sim.avatars[0], melon);
    feed(sim, {}, 0.2);
    const av = sim.avatars[0]!;
    expect(sim.aimingMelon(av)).toBe(true);
    const p0 = { ...av.pos };
    const y0 = av.yaw;
    feed(sim, { moveX: 1 }, 0.3);
    expect(Math.hypot(av.pos.x - p0.x, av.pos.z - p0.z)).toBeLessThan(0.05);
    // →で東（yaw が π/2 の方）へ回る
    const turned = Math.abs(Math.atan2(Math.sin(av.yaw - y0), Math.cos(av.yaw - y0)));
    expect(turned).toBeGreaterThan(0.25);
    expect(turned).toBeLessThan(0.45);
    const y1 = av.yaw;
    feed(sim, { moveZ: -1 }, 0.3);
    expect(av.pos.z).toBeLessThan(p0.z - 0.8);
    expect(av.yaw).toBeCloseTo(y1, 6);
    // レーンの外では、ふつうに歩く
    sim.teleport(0, lane.x, lane.z + 4);
    feed(sim, {}, H);
    expect(sim.aimingMelon(av)).toBe(false);
    sim.dispose();
  });
});

describe('スマホの重なり（round4 の F5）', () => {
  it('店員の吹き出しが HUD の札に入るときだけ、その札のすぐ下へずらす', () => {
    const top = { left: 100, top: 8, right: 500, bottom: 70 };
    const list = { left: 8, top: 72, right: 188, bottom: 160 };
    // 札の外：そのまま
    expect(bubbleY(300, 300, 60, 24, [top, list])).toBe(300);
    // 上の帯に重なる：帯の下（吹き出しの上端が帯の下端より下）へ
    const y = bubbleY(300, 50, 60, 24, [top, list]);
    expect(y - 24).toBeGreaterThanOrEqual(70);
    // ずらした先がさらに一覧に重なれば、一覧の下まで
    const y2 = bubbleY(150, 60, 60, 24, [top, list]);
    expect(y2 - 24).toBeGreaterThanOrEqual(160);
  });
});
