import { it, expect } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { GEAR, PARAMS } from '../../src/sim/params.js';
import { heightfield } from './terrains.js';

// スキーの滑りの採点 1 周目（2026-11-11）の直し。採点役が測ったのと同じ形の場面を、解析的な斜面で確かめる
const DEG = Math.PI / 180, packed = { powder: 0.05, packed: 0.93, ice: 0.02 };
const slope = (degrees, bump = 0, wave = 9) => heightfield((x, z, out) => {
  const k = 2 * Math.PI / wave, tilt = Math.tan(degrees * DEG);
  out.h = bump * Math.cos(k * z) + tilt * z; out.hx = 0; out.hz = -bump * k * Math.sin(k * z) + tilt;
  out.hxx = out.hxz = 0; out.hzz = -bump * k * k * Math.cos(k * z);
}, { snow: packed });
const travel = s => Math.atan2(s.vel.x, -s.vel.z);
function turnIn(gear, speed, seconds = 1) {
  const r = createRide(slope(12), { gear }); r.reset({ x: 0, z: 0, speed, heading: 0 });
  let turned = 0, previous = travel(r.state);
  for (let i = 0; i < 120 * seconds; i++) { r.step({ steer: 1 }, 1 / 120); const h = travel(r.state); turned += Math.atan2(Math.sin(h - previous), Math.cos(h - previous)); previous = h; }
  return { turned: Math.abs(turned) / DEG, edge: Math.abs(r.state.edge) / DEG };
}
it('遅いとき（時速 27 km）も、スキーは、スノーボードの 1.3〜1.9 倍の大きさで曲がる（2.6 倍では「曲がらない」と感じた）', () => {
  for (const speed of [6, 7.5, 9]) {
    const board = turnIn('board', speed), ski = turnIn('ski', speed);
    expect(board.turned / ski.turned, `speed ${speed}`).toBeGreaterThan(1.3); expect(board.turned / ski.turned).toBeLessThan(1.9);
    expect(ski.edge).toBeGreaterThan(33); // 遅くても、板がはっきり傾く（27° では、まっすぐ滑る姿勢と見分けられなかった）
  }
});
function coast(gear, tuckSeconds, total = 6) {
  const r = createRide(slope(15), { gear }); r.reset({ x: 0, z: 0, speed: 8, heading: 0 });
  for (let i = 0; i < 120 * total; i++) r.step({ tuck: i >= 120 * (total - tuckSeconds) ? 1 : 0 }, 1 / 120);
  return r.state.speed;
}
it('スキーは、立つ姿勢ではスノーボードと同じ速さ。低い姿勢の 4 秒で、秒速 1.2 m（時速 4.3 km）以上速くなる', () => {
  const boardUp = coast('board', 0), skiUp = coast('ski', 0), boardTuck = coast('board', 4), skiTuck = coast('ski', 4);
  expect(Math.abs(skiUp - boardUp)).toBeLessThan(0.05);
  expect(skiTuck - skiUp).toBeGreaterThan(1.2);
  expect(skiTuck - skiUp).toBeGreaterThan((boardTuck - boardUp) * 2); // スノーボードの低い姿勢より、はっきり効く
  expect(PARAMS.tuckGlide).toBe(1); expect(GEAR.ski.tuckGlide).toBeLessThan(1);
});
it('小さなこぶの続く面で舵を入れても、スキーは、エッジが外れにくい（スノーボードと同じ値では、荷重が抜けるたびに外れる）', () => {
  // こぶは小さい（高さ 4.5〜6 cm・間隔 10〜14 m）。秒速 18〜24 m では、それでも荷重が 0.7 g ぶん上下し、0.1〜0.2 秒ずつ軽くなる
  const breaks = (params) => {
    let count = 0;
    for (const bump of [0.045, 0.06]) for (const wave of [10, 14]) for (const speed of [18, 21, 24]) for (const steer of [0.6, 0.85]) {
      const r = createRide(slope(20, bump, wave), { gear: 'ski', params }); r.reset({ x: 0, z: 0, speed, heading: 0 });
      for (let i = 0; i < 240; i++) { r.step({ steer }, 1 / 120); count += r.events.filter(e => e.type === 'carveBreak' && e.cause === 'unloaded').length; }
    }
    return count;
  };
  const now = breaks({}), boardValues = breaks({ breakTime: PARAMS.breakTime, breakRatio: PARAMS.breakRatio });
  expect(boardValues).toBeGreaterThanOrEqual(10); expect(now).toBeLessThanOrEqual(1);
});
