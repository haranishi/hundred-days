import { it, expect } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { circular, heightfield } from './terrains.js';
import { ride } from './feel-helpers.js';

// 体験の採点（谷と湖のマップ）1 周目：「低い姿勢で段に入ると、全く浮かない」
// 平らな助走の先で、雪面が半径 12.5 m の弧で 1 m 落ち、その先は 22° の斜面になる段。秒速 15 m（時速 54 km）で入る
const K = 0.08, L = 5;
const step = () => heightfield((x, z, out) => {
  if (x <= 0) { out.h = 0; out.hx = 0; out.hxx = 0; }
  else if (x < L) { out.h = -K * x * x / 2; out.hx = -K * x; out.hxx = -K; }
  else { out.h = -K * L * L / 2 - K * L * (x - L); out.hx = -K * L; out.hxx = 0; }
  out.hz = out.hxz = out.hzz = 0;
});
/** 縁の手前 lead m から操作を入れて、いちばん長い滞空（秒）を返す */
function longestAir(controls, lead) {
  const r = createRide(step()); r.reset({ x: -14, z: 0, speed: 15, heading: Math.PI / 2 });
  let best = 0;
  for (let i = 0; i < 240 * 4; i++) {
    r.step(r.state.pos.x > -lead ? controls : {}, 1 / 240);
    for (const e of r.events) if (e.type === 'land') best = Math.max(best, e.air);
  }
  return best;
}
it('T20: 低い姿勢のまま段へ入っても、立ち姿勢と同じくらい飛ぶ（縁を吸収しきって貼りつかない）', () => {
  const stand = longestAir({}, 0);
  expect(stand).toBeGreaterThan(0.6);
  // 低い姿勢を、縁の 14 m 手前（約 1 秒前）から保つ・構え（ジャンプを押したまま）を 14 m 手前から、の 2 通り
  for (const [controls, lead] of [[{ tuck: 1 }, 14], [{ jump: true }, 14]]) {
    expect(longestAir(controls, lead), JSON.stringify([controls, lead])).toBeGreaterThanOrEqual(stand * 0.8);
  }
});
it('T21: 平らな所で沈み込んだだけでは、浮かない（これまでどおり）', () => {
  for (const controls of [{ tuck: 1 }, { jump: true }]) {
    const r = ride(circular(0), 10);
    for (let i = 0; i < 240; i++) { r.step(controls, 1 / 240); expect(r.state.mode).not.toBe('air'); }
  }
});
it('T23: 遅いとき（秒速 1〜4 m）も、舵 0.5 を 1 秒入れると 20〜45° 回る（効かない速さの谷間が無い）', () => {
  for (const degrees of [6, 12]) for (const speed of [1, 2, 2.5, 3, 4]) {
    const r = createRide(heightfield((x, z, out) => { const k = Math.tan(degrees * Math.PI / 180); out.h = k * z; out.hx = 0; out.hz = k; out.hxx = out.hxz = out.hzz = 0; },
      { snow: { powder: 0.05, packed: 0.93, ice: 0.02 } }));
    r.reset({ x: 0, z: 0, speed, heading: 0 });
    const before = Math.atan2(r.state.fwd.x, -r.state.fwd.z);
    for (let i = 0; i < 120; i++) r.step({ steer: 0.5 }, 1 / 120);
    const turned = (Math.atan2(r.state.fwd.x, -r.state.fwd.z) - before) * 180 / Math.PI;
    expect(turned, JSON.stringify({ degrees, speed })).toBeGreaterThanOrEqual(20); expect(turned).toBeLessThanOrEqual(45);
  }
});

// ---- 体験の採点 2 周目（2026-11-11）の直し ----
const DEG = Math.PI / 180, mixed = { powder: 0.3, packed: 0.7, ice: 0 };
const slopeAt = (degrees, heading = 0) => heightfield((x, z, out) => {
  const k = Math.tan(degrees * DEG); out.h = k * z; out.hx = 0; out.hz = k; out.hxx = out.hxz = out.hzz = 0;
}, { snow: mixed });
const travel = (s) => Math.atan2(s.vel.x, -s.vel.z) / DEG;
it('T24: 舵を入れない制動は、進む線を変えない。離すと、板は進む向きへ戻る', () => {
  for (const brake of [0.5, 1]) {
    const turned = (params) => {
      const r = createRide(slopeAt(20), { params }); r.reset({ x: 0, z: 0, speed: 15, heading: 30 * DEG });
      for (let i = 0; i < 60; i++) r.step({}, 1 / 120);
      const before = travel(r.state);
      for (let i = 0; i < 120; i++) r.step({ brake }, 1 / 120);
      const during = travel(r.state) - before;
      for (let i = 0; i < 180; i++) r.step({}, 1 / 120);
      return { during, after: travel(r.state) - before, board: Math.atan2(r.state.fwd.x, -r.state.fwd.z) / DEG - travel(r.state), mode: r.state.mode };
    };
    const kept = turned({}), free = turned({ skidLineHold: 0 });
    // 打ち消さないと、制動の間に、板の向く側へ 10° 以上それる。打ち消すと、谷の向き（0°）へ少し寄るだけ
    expect(free.during).toBeGreaterThan(8); expect(kept.during).toBeLessThan(2); expect(kept.during).toBeGreaterThan(-9);
    expect(kept.mode).toBe('carve'); expect(Math.abs(kept.board)).toBeLessThan(5);
  }
});
it('T25: 制動の途中の小さな浮きでは、「横向きの着地」で転ばない', () => {
  const run = (params) => {
    const reasons = [];
    for (let n = 0; n < 24; n++) {
      const k = 2 * Math.PI / (9 + n), amplitude = 0.35 + (n % 3) * 0.1, tilt = Math.tan((30 + (n % 4) * 3) * DEG);
      const terrain = heightfield((x, z, out) => {
        out.h = amplitude * Math.cos(k * x) * Math.cos(k * z) + tilt * z;
        out.hx = -amplitude * k * Math.sin(k * x) * Math.cos(k * z); out.hz = -amplitude * k * Math.cos(k * x) * Math.sin(k * z) + tilt;
        out.hxx = out.hzz = -amplitude * k * k * Math.cos(k * x) * Math.cos(k * z); out.hxz = amplitude * k * k * Math.sin(k * x) * Math.sin(k * z);
      }, { snow: mixed });
      const r = createRide(terrain, { params }); r.reset({ x: n * 1.7, z: 0, speed: 20, heading: 0 });
      for (let i = 0; i < 120 * 6; i++) { r.step({ brake: 1 }, 1 / 120); const crash = r.events.find(e => e.type === 'crash'); if (crash) { reasons.push(crash.reason); break; } }
    }
    return reasons;
  };
  expect(run({})).not.toContain('landing-sideways');
  expect(run({ skidHopTime: 0 })).toContain('landing-sideways'); // 直す前の決まりでは、転ぶ
});
it('T26: 構えたまま縁を越えると、その場で踏み切る。構えながらの舵は、板をそらさず、回転になる', () => {
  const over = (controls, params) => {
    const r = createRide(step(), { params }); r.reset({ x: -16, z: 0, speed: 15, heading: Math.PI / 2 });
    let air = 0, pop = false, spin = 0, drift = 0;
    for (let i = 0; i < 240 * 4; i++) {
      r.step(controls(r.state.pos.x), 1 / 240); if (r.state.pos.x < 0) drift = Math.abs(r.state.pos.z);
      for (const e of r.events) if (e.type === 'land' && e.air > air) { air = e.air; pop = e.pop; spin = Math.abs(e.spin) / DEG; }
    }
    return { air, pop, spin, drift };
  };
  const none = over(() => ({})), held = over(x => ({ jump: x > -12 })), released = over(x => ({ jump: x > -12 && x < -2 }));
  expect(held.pop).toBe(true); expect(held.air).toBeGreaterThan(none.air * 1.8); expect(held.air).toBeGreaterThan(released.air * 0.9);
  const steered = over(x => ({ jump: x > -12, steer: x > -12 ? 1 : 0 })), veered = over(x => ({ jump: x > -12, steer: x > -12 ? 1 : 0 }), { chargeSteer: 1 });
  expect(steered.drift).toBeLessThan(2); expect(veered.drift).toBeGreaterThan(steered.drift * 2); // 弱めないと、助走でそれる
  expect(steered.spin).toBeGreaterThan(300);
});
it('T27: 制動で下っている間も、戻り先を覚える', () => {
  const r = createRide(slopeAt(40)); r.reset({ x: 0, z: 0, speed: 12, heading: 0 });
  for (let i = 0; i < 120 * 8; i++) r.step({ brake: 0.5 }, 1 / 120);
  const safe = r.snapshot().safe;
  expect(r.state.pos.z).toBeLessThan(-60); expect(safe.z).toBeLessThan(-30); expect(Math.abs(safe.heading)).toBeLessThan(15 * DEG);
});
it('T28: こぶのある急な斜面を、制動で下っている間も、戻り先を覚える（荷重がときどき抜けても、数え直さない）', () => {
  const k = 2 * Math.PI / 10, tilt = Math.tan(40 * DEG);
  const terrain = heightfield((x, z, out) => {
    out.h = 0.18 * Math.cos(k * z) + tilt * z; out.hx = 0; out.hz = -0.18 * k * Math.sin(k * z) + tilt;
    out.hxx = out.hxz = 0; out.hzz = -0.18 * k * k * Math.cos(k * z);
  }, { snow: mixed });
  const r = createRide(terrain); r.reset({ x: 0, z: 0, speed: 16, heading: 0 });
  let light = 0, longest = 0, streak = 0;
  for (let i = 0; i < 120 * 12; i++) {
    r.step({ brake: 0.6 }, 1 / 120);
    const steady = r.state.mode === 'skid' && r.state.load > 0.5; if (!steady) light++;
    streak = steady ? streak + 1 : 0; longest = Math.max(longest, streak);
  }
  const safe = r.snapshot().safe;
  // 場面の確かめ：荷重が何度も抜け、条件を 3 秒続けて満たす区間が無い（以前の決まりでは、戻り先が出発地点のままになる場面）
  expect(r.state.mode).not.toBe('crash'); expect(light).toBeGreaterThan(30); expect(longest / 120).toBeLessThan(3);
  expect(r.state.pos.z).toBeLessThan(-90); expect(safe.z).toBeLessThan(r.state.pos.z * 0.4);
});
it('T29: 構えと舵を押したまま縁を越えると、つかみの種類が、舵の向きで決まる（左＝2・右＝3・なし＝1）', () => {
  for (const [steer, kind] of [[-1, 2], [1, 3], [0, 1]]) for (const hz of [60, 120, 240]) {
    const r = createRide(step()); r.reset({ x: -16, z: 0, speed: 15, heading: Math.PI / 2 });
    let reach = 0, drift = 0;
    for (let i = 0; i < hz * 3 && !reach; i++) {
      r.step({ jump: r.state.pos.x > -12, steer: r.state.pos.x > -12 ? steer : 0 }, 1 / hz);
      if (r.state.pos.x < 0) drift = Math.abs(r.state.pos.z);
      if (r.state.mode === 'air' && r.state.air.reach) reach = r.state.air.reach;
    }
    expect(reach, JSON.stringify({ steer, hz })).toBe(kind);
    expect(drift).toBeLessThan(0.05); // 地上で構えている間は、舵で曲がらない
  }
});
