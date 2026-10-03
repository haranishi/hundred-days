// OWNER: tests
// r03-fx：破片の配り方。同じ乱数の系列なら同じ破片、種類は外壁の材質の割合、大きさは大・中・小の割合で配られ、
// 大きい塊ほど初速・回転・跳ね返りが小さい。
// r04-fx2：指摘「破片は加速せずに漂う」。重力は大きさによらず 9.8 m/s²（倍率 1）。小さく軽い破片ほど空気の抵抗が大きい。
// 落ちる破片の動き（DebrisField）で、大きい塊が本物の重力の加速で落ちることを確かめる。
import { describe, expect, it } from 'vitest';
import { CITY_CONFIG } from '../../src/config/city';
import { DEBRIS } from '../../src/config/fx';
import { BUILDING_RULES } from '../../src/config/gameplay';
import { stream } from '../../src/core/rng';
import { DEBRIS_KINDS, DEBRIS_SIZES, planDebris, type DebrisSource } from '../../src/fx/debrisPlan';
import { DebrisField } from '../../src/fx/debris';
import type { MaterialKit } from '../../src/render/materials';
import { Color } from 'three';
import { generateCity } from '../../src/world/city';

const city = generateCity(CITY_CONFIG);
const src: DebrisSource = { x: 10, y: 20, z: -5, nx: 1, nz: 0, spread: 4, out: [3, 9], up: [0, 4] };
const glassTower = city.buildings.find((b) => b.kind === 'glassTower')!;
const house = city.buildings.find((b) => b.kind === 'house')!;

describe('破片の配り方', () => {
  it('同じ系列なら同じ破片、系列が違えば違う破片', () => {
    const a = planDebris(glassTower, src, 40, stream(7, 'debris', glassTower.id));
    const b = planDebris(glassTower, src, 40, stream(7, 'debris', glassTower.id));
    const c = planDebris(glassTower, src, 40, stream(8, 'debris', glassTower.id));
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it('種類は外壁の材質の割合、大きさは大・中・小の割合で配られる', () => {
    for (const b of [glassTower, house]) {
      const n = 6000;
      const list = planDebris(b, src, n, stream(1, 'debris', b.id));
      const mix = DEBRIS.kindMix[BUILDING_RULES[b.kind].material];
      DEBRIS_KINDS.forEach((k, i) => expect(list.filter((p) => p.kind === k).length / n).toBeCloseTo(mix[i], 1));
      DEBRIS_SIZES.forEach((s, i) => expect(list.filter((p) => p.size === s).length / n).toBeCloseTo(DEBRIS.sizeMix[i], 1));
    }
  });

  it('重力は大きさによらず同じ。大きい塊ほど初速・回転・跳ね返り・空気の抵抗が小さい', () => {
    const list = planDebris(glassTower, src, 3000, stream(3, 'debris', 1));
    const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
    const of = (s: 'L' | 'M' | 'S'): { g: number; drag: number; v: number; spin: number; bounce: number; len: number } => {
      const ps = list.filter((p) => p.size === s && p.kind !== 'glass');
      return {
        g: mean(ps.map((p) => p.gravity)),
        drag: mean(ps.map((p) => p.drag)),
        v: mean(ps.map((p) => Math.hypot(p.vx, p.vy, p.vz))),
        spin: mean(ps.map((p) => p.spin)),
        bounce: mean(ps.map((p) => p.bounce)),
        len: mean(ps.map((p) => Math.max(p.sx, p.sy, p.sz))),
      };
    };
    const [L, M, S] = [of('L'), of('M'), of('S')];
    expect(L.len).toBeGreaterThan(M.len);
    expect(M.len).toBeGreaterThan(S.len);
    for (const p of list) expect(p.gravity).toBe(1);
    for (const key of ['drag', 'v', 'spin', 'bounce'] as const) {
      expect(L[key]).toBeLessThan(M[key]);
      expect(M[key]).toBeLessThan(S[key]);
    }
    // ガラス片は薄い板なので、同じ大きさのコンクリより抵抗が大きい
    const glass = list.filter((p) => p.kind === 'glass');
    expect(Math.min(...glass.map((p) => p.drag))).toBeGreaterThan(S.drag);
  });

  it('落ちる破片は重さに合う加速で落ちる：大きい塊は 9.8 m/s²、小さく軽い破片は空気の抵抗で落ちる速さが頭打ちになる', () => {
    const kit = { patch: <T>(m: T): T => m } as unknown as MaterialKit;
    const field = new DebrisField(kit, 64, 64);
    const rng = stream(4, 'debris-fall');
    const base = { x: 0, z: 0, vx: 0, vy: 0, vz: 0, color: new Color(0.2, 0.2, 0.2), gravity: 1 };
    field.spawn({ ...base, y: 400, size: 3, drag: DEBRIS.drag.L }, rng);
    field.spawn({ ...base, x: 5, y: 400, size: 0.4, drag: DEBRIS.drag.S }, rng);
    field.spawn({ ...base, x: 10, y: 400, size: 0.4, drag: DEBRIS.glassDrag }, rng);
    const ground = (): number => 0;
    const accel: { L: number; S: number }[] = [];
    for (let k = 0; k < 180; k++) {
      field.update(1 / 60, ground);
      accel.push({ L: field.fallAccel().L, S: field.fallAccel().S });
    }
    // 最初の 0.1 秒と 3 秒後：大きい塊は 9.8 のまま、小さい破片は抵抗で加速が落ちる
    expect(accel[5].L).toBeCloseTo(9.8, 1);
    expect(accel[179].L).toBeCloseTo(9.8, 1);
    expect(accel[179].S).toBeLessThan(accel[5].S * 0.6);
    // 3 秒で落ちた距離：大きい塊は自由落下の ½gt² に近い（44m）
    const y = (field as unknown as { p: Float32Array }).p;
    expect(400 - y[1]).toBeGreaterThan(42);
    expect(400 - y[1]).toBeLessThan(46);
    // ガラス片は小さなコンクリ片よりゆっくり落ちる
    expect(400 - y[7]).toBeLessThan(400 - y[4]);
  });

  it('形は種類で違う：コンクリは塊、外壁は板、ガラスは薄い板', () => {
    const list = planDebris(glassTower, src, 600, stream(5, 'debris', 2));
    const flat = (k: string): number => {
      const ps = list.filter((p) => p.kind === k);
      return ps.reduce((s, p) => s + p.sy / Math.max(p.sx, p.sz), 0) / ps.length;
    };
    expect(flat('glass')).toBeLessThan(flat('facade'));
    expect(flat('facade')).toBeLessThan(flat('concrete'));
  });
});
