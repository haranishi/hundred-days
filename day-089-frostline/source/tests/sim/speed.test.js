import { it, expect } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { dragForce } from '../../src/sim/forces.js';
import { createParams } from '../../src/sim/params.js';
import { plane } from './terrains.js';
export function advance(r, seconds, controls = {}, hz = 120) { for (let i = 0; i < Math.round(seconds * hz); i++) r.step(controls, 1 / hz); }
for (const [degrees, cdA, tuck] of [[20, 0.6, 0], [30, 0.6, 0], [40, 0.6, 0], [30, 0.3, 1]]) {
  it(`R2 terminal ${degrees}° CdA=${cdA}`, () => {
    const theta = degrees * Math.PI / 180, r = createRide(plane(theta), { params: { cdA, cdATuck: cdA } });
    r.reset({ x: 0, z: 0, heading: 0, speed: 5 }); advance(r, 80, { tuck });
    const theory = Math.sqrt(2 * 80 * 9.81 * (Math.sin(theta) - 0.04 * Math.cos(theta)) / (1.1 * cdA));
    expect(r.state.speed / theory).toBeCloseTo(1, 2);
    console.log(`TARGET terminal ${degrees}° CdA=${cdA}: ${theory * 3.6} / ${r.state.speed * 3.6} km/h`);
  });
}
it('R2 #5 acceleration and normal force without air', () => {
  const r = createRide(plane(Math.PI / 6), { params: { cdA: 0, cdATuck: 0 } });
  r.reset({ x: 0, z: 0, heading: 0, speed: 10 }); r.step({}, 1 / 120);
  expect((r.state.speed - 10) * 120).toBeCloseTo(4.56517, 4);
  expect(r.state.load * 80 * 9.81).toBeCloseTo(679.6567, 3);
});
it('R2 #6 aerodynamic force scales quadratically', () => {
  const p = createParams({ cdA: 0.6 }); expect(dragForce(20, 0, p)).toBeCloseTo(132, 12); expect(dragForce(10, 0, p)).toBeCloseTo(33, 12);
});
// 2026-11-11：登りで失速した後の決まりを変えた。以前は、板の向きを保ったまま、後ろ向き（スイッチ）で下った。
// いまは、板の先を谷へ向け直して、前向きで下る（初めての人が、土手で失速して、後ろ向きのまま道を下るのを防ぐ）
it('flat friction stops; an uphill stall turns the nose downhill and rides forward', () => {
  for (const theta of [0, Math.PI / 9]) {
    const r = createRide(plane(theta)); r.reset({ x: 0, z: 0, heading: Math.PI, speed: 5 });
    let stopped = false;
    for (let i = 0; i < 2400; i++) { r.step({}, 1 / 120); if (r.state.speed < 0.25) { stopped = true; break; } }
    expect(stopped).toBe(true);
    if (!theta) { advance(r, 2); expect(r.state.speed).toBe(0); }
    else { advance(r, 5); expect(r.state.vel.z).toBeLessThan(0); expect(r.state.fwd.z).toBeLessThan(0); expect(r.state.switch).toBe(false); expect(r.state.speed).toBeGreaterThan(3); }
  }
});
// 2026-11-11：決まりを変えた。斜面で横向きに止まった板は、制動を押している間だけ、とどまる。
// 何も押さなければ、0.8 秒待って、板の先を谷へ向け直して滑り出す（ゆるい道で、止まったまま動けなくなるのを防ぐ）
it('a stationary cross-slope board holds while braking; released, it turns downhill and moves', () => {
  const r = createRide(plane(Math.PI / 6)); r.reset({ x: 0, z: 0, heading: Math.PI / 2, speed: 0 }); advance(r, 3, { brake: 1 });
  expect(r.state.speed).toBe(0); expect(r.state.pos.x).toBe(0); expect(r.state.pos.z).toBe(0);
  // 何も押さない：0.7 秒までは、その場にとどまる。3 秒後には、板の先を谷（北）へ向けて、前向きに滑っている
  r.reset({ x: 0, z: 0, heading: Math.PI / 2, speed: 0 }); advance(r, 0.7); expect(r.state.speed).toBe(0);
  advance(r, 2.3); expect(r.state.speed).toBeGreaterThan(2); expect(r.state.switch).toBe(false); expect(Math.abs(r.state.heading)).toBeLessThan(0.5);
  // ゆるい所（2°）では、向け直さない（平らな所は、蹴って進む）
  const flat = createRide(plane(2 * Math.PI / 180)); flat.reset({ x: 0, z: 0, heading: Math.PI / 2, speed: 0 }); advance(flat, 3);
  expect(flat.state.speed).toBe(0); expect(flat.state.heading).toBeCloseTo(Math.PI / 2, 6);
  r.reset({ x: 0, z: 0, heading: 0, speed: 0 }); advance(r, 2); expect(r.state.speed).toBeGreaterThan(4);
});
it('default tuck increases terminal speed', () => {
  const a = createRide(plane(Math.PI / 6)), b = createRide(plane(Math.PI / 6));
  advance(a, 60); advance(b, 60, { tuck: 1 }); expect(b.state.speed).toBeGreaterThan(a.state.speed * 1.15);
});
