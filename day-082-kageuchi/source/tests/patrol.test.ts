// OWNER: core
// 見回りの道順（r03-fix-play 追加）：
// 裏門の提灯持ち（体験の採点 5 位「白砂の上を歩くので、背後を取る余地がない」）は、折り返しで長めに止まって先（外）を見る。
// 奥庭の提灯持ち（体験の採点 4 位「片道約 44m の見回りで 26〜30 秒待たされる」）は、下の describe。
import { describe, expect, it } from 'vitest';
import { idleInput, type SimInput } from '../src/sim/types';
import { Sim } from '../src/sim/sim';
import type { GuardDef } from '../src/stage/types';
import { HONNOJI, makeSim, seconds } from './helpers';

/**
 * 裏門の外（西の小路）でしゃがんで待ち、提灯持ちが門の前を lag m 過ぎて dir へ歩いていったら、門をくぐって背後をしゃがんで追う。
 * 当て身の案内が出たら E。気づかれたら失敗。
 */
function followUra(dir: 'north' | 'south', lag: number): { ok: boolean; why: string } {
  const sim: Sim = makeSim({ seed: 1 }, { ...HONNOJI, guards: HONNOJI.guards.filter((g) => g.id === 'ura-patrol') });
  const g = sim.byId.get('ura-patrol')!;
  sim.teleport(-37.6, 9.6, 0);
  sim.setCrouch(true);
  sim.drainEvents();
  const heading = dir === 'north' ? 270 : 90;
  for (let i = 0; i < seconds(120); i++) {
    const v = ((((g.yaw * 180) / Math.PI) % 360) + 360) % 360;
    const past = dir === 'north' ? g.z < 9.6 - lag : g.z > 9.6 + lag;
    if (past && Math.abs(v - heading) < 20 && g.speed > 0.5) break;
    sim.step(idleInput());
  }
  const t0 = sim.t;
  for (let k = 0; k < seconds(20); k++) {
    const p = sim.player;
    // 番兵の真後ろ 1.1m を目指す
    const bx = g.x - Math.cos(g.yaw) * 1.1;
    const bz = g.z - Math.sin(g.yaw) * 1.1;
    const inp: SimInput = { ...idleInput(Math.atan2(bz - p.z, bx - p.x)), moveY: Math.hypot(bx - p.x, bz - p.z) > 0.15 ? 1 : 0, interact: p.prompt?.kind === 'takedown' };
    sim.step(inp);
    for (const e of sim.drainEvents()) {
      if (e.type === 'heard' || e.type === 'suspicious' || e.type === 'discovered') return { ok: false, why: `${e.type}（${(sim.t - t0).toFixed(1)} 秒）` };
      if (e.type === 'takedown' && e.stage === 'start') return { ok: true, why: `当て身（${(sim.t - t0).toFixed(1)} 秒）` };
    }
  }
  return { ok: false, why: '届かない' };
}

describe('裏門の提灯持ち', () => {
  it('折り返しで、歩いてきた向きのまま 3 秒以上止まって先を見る（背後が空く）', () => {
    const g = HONNOJI.guards.find((x) => x.id === 'ura-patrol')!;
    for (const wp of g.route!) {
      const looks = wp.looks!;
      const per = wp.wait / looks.length;
      // 最初に見る向きを続けて見ている長さ
      let n = 0;
      while (n < looks.length && looks[n] === looks[0]) n++;
      expect(per * n, `(${wp.pos.x}, ${wp.pos.z})`).toBeGreaterThanOrEqual(3);
    }
  });

  it('白砂の上でも、門を過ぎて 4m 遅れてからしゃがんで追えば、折り返しの間に気づかれずに当て身が届く（北の端・南の端）', { timeout: 60_000 }, () => {
    for (const dir of ['north', 'south'] as const) {
      const r = followUra(dir, 4);
      process.stdout.write(`裏門の提灯持ち（${dir}）：${r.why}\n`);
      expect(r.ok, `${dir}: ${r.why}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------- 奥庭の提灯持ち

/** r02 までの奥庭の提灯持ち（池の南の通り道を西の端と東の端で往復）。比べるために残す。 */
const GARDEN_R02: GuardDef = {
  ...HONNOJI.guards.find((g) => g.id === 'garden-patrol')!,
  routeMode: 'pingpong',
  route: [
    { pos: { x: -25, z: -15.8 }, wait: 2, looks: [270, 180] },
    { pos: { x: -11, z: -15 }, wait: 0 },
    { pos: { x: 8, z: -15 }, wait: 0 },
    { pos: { x: 21, z: -16 }, wait: 2, looks: [0, 270] },
  ],
};
const GARDEN_GUARDS = ['garden-patrol', 'chumon', 'ranmaru', 'nobunaga'];
type Pt = { x: number; z: number; crouch?: boolean };
/** 西の切れ目（竹林）から中門の西の暗がりへ歩いてしゃがむ。裏門の道で、奥庭へ入るところ */
const WEST_ENTRY: Pt[] = [{ x: -32.5, z: -13.6 }, { x: -20, z: -14.4 }, { x: -8, z: -13.8, crouch: true }];
/** 蔵の陰から書院の東の茂み・信長の東の茂みへ。水抜き穴の道で、奥庭へ入るところ */
const EAST_ENTRY: Pt[] = [{ x: 32, z: -22 }, { x: 31.2, z: -20.2 }, { x: 22, z: -20.2 }, { x: 14.5, z: -21, crouch: true }, { x: 11, z: -19.4, crouch: true }];

function gardenStage(def: GuardDef) {
  return { ...HONNOJI, guards: HONNOJI.guards.filter((g) => GARDEN_GUARDS.includes(g.id)).map((g) => (g.id === 'garden-patrol' ? def : g)) };
}

/** 平常のまま回した sim の、いまの時刻の写し（番兵の状態を写す。プレイヤーは初めの位置）。 */
function fork(base: Sim): Sim {
  const s = new Sim(base.stage, { seed: 1 });
  s.t = base.t;
  s.tick = base.tick;
  for (let i = 0; i < base.guards.length; i++) {
    const { def, ...rest } = base.guards[i];
    Object.assign(s.guards[i], structuredClone(rest), { def });
  }
  s.movingLights = base.movingLights.map((l) => ({ ...l }));
  return s;
}

/** path を歩いて終点でしゃがみ、stay 秒とどまる。その間に誰にも気づかれなければ true。 */
function entrySafe(sim: Sim, path: Pt[], stay: number): boolean {
  sim.teleport(path[0].x, path[0].z);
  sim.setCrouch(!!path[0].crouch);
  sim.drainEvents();
  let wp = 1;
  let left = stay;
  for (let i = 0; i < seconds(40); i++) {
    const p = sim.player;
    let inp: SimInput;
    if (wp < path.length) {
      const t = path[wp];
      if (Math.hypot(t.x - p.x, t.z - p.z) < 0.3) {
        wp++;
        continue;
      }
      inp = { ...idleInput(Math.atan2(t.z - p.z, t.x - p.x)), moveY: 1, crouchToggle: !!t.crouch !== p.crouch };
    } else {
      inp = { ...idleInput(), crouchToggle: !p.crouch };
      left -= 1 / 60;
      if (left <= 0) return true;
    }
    sim.step(inp);
    for (const e of sim.drainEvents()) if (e.type === 'suspicious' || e.type === 'discovered' || e.type === 'heard') return false;
  }
  return false;
}

/**
 * 着いた時刻ごとに「次に、気づかれずに入れる出発まで何秒待つか」を 1 秒刻みで総当たりし、最長と平均を返す。
 * 出発の時刻ごとに、平常のまま回した sim を写して歩かせる（初めから回し直さない）。
 */
function entryWaits(def: GuardDef, path: Pt[], period: number): { max: number; mean: number } {
  const base = new Sim(gardenStage(def), { seed: 1 });
  base.teleport(-14, 37.5);
  const safe: boolean[] = [];
  for (let k = 0; k < period + 50; k++) {
    for (let i = 0; i < seconds(1); i++) base.step(idleInput());
    safe.push(entrySafe(fork(base), path, 8));
  }
  const ws: number[] = [];
  for (let a = 0; a < period; a++) {
    let k = a;
    while (k < safe.length && !safe[k]) k++;
    ws.push(k < safe.length ? k - a : Infinity);
  }
  return { max: Math.max(...ws), mean: ws.reduce((s, x) => s + x, 0) / period };
}

/** 一巡の長さ（秒）：道のりを速さで割り、待ちを足す。 */
function period(def: GuardDef): number {
  const r = def.route!;
  const pts = def.routeMode === 'loop' ? [...r, r[0]] : [...r, ...r.slice(0, -1).reverse()];
  let len = 0;
  for (let i = 0; i + 1 < pts.length; i++) len += Math.hypot(pts[i + 1].pos.x - pts[i].pos.x, pts[i + 1].pos.z - pts[i].pos.z);
  // 往復では両端の待ちが一巡に一度ずつ、輪では各点が一度ずつ（途中の点の待ちは 0）
  const waits = r.reduce((s, w) => s + w.wait, 0);
  return Math.ceil(len / (def.speed ?? 1.2) + waits);
}

/** spot から r m 以内に提灯持ちがいる時間の割合と、いない間の最長（秒）。100 秒回してから 200 秒測る。 */
function presence(def: GuardDef, spot: { x: number; z: number }, r: number): { share: number; longestAway: number } {
  const sim = new Sim(gardenStage(def), { seed: 1 });
  sim.teleport(-14, 37.5);
  const g = sim.byId.get('garden-patrol')!;
  let near = 0;
  let total = 0;
  let run = 0;
  let longest = 0;
  for (let i = 0; i < seconds(300); i++) {
    sim.step(idleInput());
    if (i < seconds(100)) continue;
    total++;
    if (Math.hypot(g.x - spot.x, g.z - spot.z) <= r) {
      near++;
      run = 0;
    } else longest = Math.max(longest, ++run);
  }
  return { share: near / total, longestAway: longest / 60 };
}

describe('奥庭の提灯持ち', () => {
  const now = HONNOJI.guards.find((g) => g.id === 'garden-patrol')!;

  it('西の切れ目（竹林）から奥庭へ入るのに待つ長さは、最長 15 秒以内（r02 の往復は最長 43 秒）', { timeout: 600_000 }, () => {
    const w = entryWaits(now, WEST_ENTRY, period(now));
    process.stdout.write(`西の切れ目で待つ長さ：最長 ${w.max} 秒・平均 ${w.mean.toFixed(1)} 秒\n`);
    expect(w.max).toBeLessThanOrEqual(15);
  });

  it('蔵の陰（水抜き穴の道）から入るのに待つ長さは、r02 と同じく最長 8 秒以内', { timeout: 600_000 }, () => {
    const w = entryWaits(now, EAST_ENTRY, period(now));
    process.stdout.write(`蔵の陰で待つ長さ：最長 ${w.max} 秒・平均 ${w.mean.toFixed(1)} 秒\n`);
    expect(w.max).toBeLessThanOrEqual(8);
  });

  it('中門の背後・信長・蘭丸のまわりに提灯持ちがいる時間と、いない間の最長は、r02 の往復と大きく変わらない', { timeout: 120_000 }, () => {
    const spots = { 中門の背後: { x: -0.6, z: -15 }, 信長: { x: 1.6, z: -18.8 }, 蘭丸: { x: 6.4, z: -17.2 } };
    for (const [name, spot] of Object.entries(spots)) {
      for (const r of [5, 8]) {
        const a = presence(GARDEN_R02, spot, r);
        const b = presence(now, spot, r);
        process.stdout.write(`${name} ${r}m：いる時間 ${(a.share * 100).toFixed(0)}→${(b.share * 100).toFixed(0)}%・いない間の最長 ${a.longestAway.toFixed(0)}→${b.longestAway.toFixed(0)} 秒\n`);
        expect(Math.abs(b.share - a.share), `${name} ${r}m のいる時間`).toBeLessThanOrEqual(0.1);
        expect(b.longestAway / a.longestAway, `${name} ${r}m のいない間`).toBeGreaterThanOrEqual(0.8);
        expect(b.longestAway / a.longestAway, `${name} ${r}m のいない間`).toBeLessThanOrEqual(1.3);
      }
    }
  });
});
