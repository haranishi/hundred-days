// OWNER: core
// 明るさの計算：L ＝ 空の明るさ ＋ Σ（灯りの強さ × max(0, 1−u²)²）を 0〜1 に切り詰めたもの。
import { describe, expect, it } from 'vitest';
import { LIGHT, SIGHT } from '../src/config/rules';
import { SightField, sightDistance } from '../src/sim/perception';
import { falloff, lightTier, StageQuery } from '../src/sim/query';
import { HONNOJI, makeSim } from './helpers';

describe('明るさ', () => {
  const q = new StageQuery(HONNOJI);

  it('減衰は max(0, 1−u²)²（u は距離÷半径）', () => {
    expect(falloff(0)).toBe(1);
    expect(falloff(1)).toBe(0);
    expect(falloff(2)).toBe(0);
    expect(falloff(0.25)).toBeCloseTo(0.5625, 10);
  });

  it('表門の外 (0, 33)：南の通りの空 0.09 と、篝火2つの減衰の和', () => {
    // 篝火 (±3.6, 27.2)、半径 8、強さ 1.0。距離² ＝ 3.6² + 5.8²
    const u2 = (3.6 * 3.6 + 5.8 * 5.8) / 64;
    const want = 0.09 + 2 * (1 - u2) ** 2;
    expect(q.brightnessAt(0, 33)).toBeCloseTo(want, 10);
    expect(want).toBeGreaterThan(0.2);
    expect(want).toBeLessThan(0.25);
  });

  it('灯りのすぐそばでは 1 に切り詰める', () => {
    expect(q.brightnessAt(-3.6, 27.2)).toBe(1);
  });

  it('暗い場所が重なるときは小さい方の空の明るさを使う', () => {
    const stage = {
      ...HONNOJI,
      lights: [],
      darkZones: [
        { id: 'a', name: 'a', rect: { x0: 0, z0: 0, x1: 10, z1: 10 }, ambient: 0.08 },
        { id: 'b', name: 'b', rect: { x0: 5, z0: 5, x1: 15, z1: 15 }, ambient: 0.03 },
      ],
    };
    const q2 = new StageQuery(stage);
    expect(q2.brightnessAt(2, 2)).toBeCloseTo(0.08, 10);
    expect(q2.brightnessAt(7, 7)).toBeCloseTo(0.03, 10);
    expect(q2.brightnessAt(12, 12)).toBeCloseTo(0.03, 10);
    expect(q2.brightnessAt(-5, -5)).toBeCloseTo(HONNOJI.baseAmbient, 10);
  });

  it('手提灯（動く灯り）も足す。灯りは壁で遮らない', () => {
    const lantern = [{ id: 'l', x: -20, y: 0.9, z: -10, radius: LIGHT.lanternRadius, intensity: LIGHT.lanternIntensity }];
    // 板塀（z=−12）の向こう側 2.5m でも届く
    const at = q.brightnessAt(-20, -12.5, lantern);
    const want = q.brightnessAt(-20, -12.5) + LIGHT.lanternIntensity * (1 - (2.5 * 2.5) / 25) ** 2;
    expect(at).toBeCloseTo(Math.min(1, want), 10);
    expect(at).toBeGreaterThan(q.brightnessAt(-20, -12.5));
  });

  it('目盛り：0.25 未満が闇、0.55 未満が薄明、それ以上が灯り', () => {
    expect(lightTier(0.249)).toBe('dark');
    expect(lightTier(0.25)).toBe('dim');
    expect(lightTier(0.549)).toBe('dim');
    expect(lightTier(0.55)).toBe('lit');
  });

  it('視界の場の明るさ（扇と判定が使う）は、brightnessAt と同じ値になる（目から届く範囲の内）', () => {
    // r01-integrate: 扇は前の格子の近似をやめ、判定と同じ足し方で測る。食い違いが 0 であることを確かめる
    const field = new SightField();
    const moving = [{ id: 'm', x: -10, z: 5, y: 0.9, radius: 5, intensity: 0.75 }];
    let worst = 0;
    for (let i = 0; i < 400; i++) {
      const ex = -34 + ((i * 37) % 68) + 0.37;
      const ez = -30 + ((i * 53) % 58) + 0.21;
      field.prepare(q, ex, ez, 1, 1, 1, true, moving, false);
      const a = (i * 2.399) % (Math.PI * 2);
      const d = (i % 17) + 0.3;
      const x = ex + Math.cos(a) * d;
      const z = ez + Math.sin(a) * d;
      worst = Math.max(worst, Math.abs(field.lightAt(x, z) - q.brightnessAt(x, z, moving)));
      const bush = q.inBush(x, z) ? SIGHT.bushCrouch : 1;
      worst = Math.max(worst, Math.abs(field.dAt(x, z) - sightDistance(q.brightnessAt(x, z, moving), 1, 1, 1, bush)));
    }
    expect(worst).toBe(0);
  });

  it('プレイヤーの足元の明るさが、毎刻み測り直される', () => {
    const sim = makeSim();
    expect(sim.player.light).toBeCloseTo(q.brightnessAt(sim.player.x, sim.player.z, sim.movingLights), 10);
    sim.teleport(0, 31);
    expect(sim.player.tier).toBe('lit');
  });
});
