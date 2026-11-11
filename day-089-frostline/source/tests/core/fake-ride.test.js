import { it, expect } from 'vitest';
import { createFakeRide, createState, copyState } from '../../src/dev/fake-ride.js';
const command = { steer: .2, tuck: 1, brake: 0, jump: false, grab: 0 };
it('仮の滑走は固定形の状態と独立した控えを持つ', () => {
  const r = createFakeRide(), before = createState(); copyState(r.state, before);
  r.step(command, 1 / 120); expect(r.state.speed).toBeGreaterThan(0); expect(before.speed).toBe(0);
  expect(r.state.pos).not.toBe(before.pos); expect(Object.keys(r.state)).toContain('tele');
});
it('ジャンプ押下は一度だけ、出来事は刻みで空になる', () => {
  const r = createFakeRide(); r.step({ ...command, jump: true }, 1 / 120); expect(r.events[0].type).toBe('takeoff');
  r.step({ ...command, jump: true }, 1 / 120); expect(r.events).toHaveLength(0);
  const types = []; for (let i = 0; i < 120; i++) { r.step({ ...command, jump: true }, 1 / 120); types.push(...r.events.map(e => e.type)); }
  expect(types).toEqual(['land']);
});
it('復元後に同じ操作を与えると同じ状態・復帰で停止', () => {
  const r = createFakeRide(); for (let i = 0; i < 20; i++) r.step(command, 1 / 120);
  const s = r.snapshot(); for (let i = 0; i < 30; i++) r.step(command, 1 / 120); const expected = r.snapshot();
  r.restore(s); for (let i = 0; i < 30; i++) r.step(command, 1 / 120); expect(r.snapshot()).toEqual(expected);
  r.respawn('safe'); expect(r.state.speed).toBe(0); expect(r.events[0].type).toBe('recover');
});
