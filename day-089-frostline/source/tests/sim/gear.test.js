import { it, expect, vi } from 'vitest';
import { createRide } from '../../src/sim/index.js';
import { GEAR, PARAMS } from '../../src/sim/params.js';
import { createState, copyState } from '../../src/sim/state.js';
import { plane, wave, heightfield } from './terrains.js';
import { advance, hash } from './helpers.js';
import { radius, reversal, terminal, push, spin } from './gear-measure.mjs';

// Observe the actual object consumed by both ground and air forces without exposing ctx publicly.
const observed = vi.hoisted(() => ({ params: null }));
vi.mock('../../src/sim/aero.js', async importOriginal => {
  const original = await importOriginal();
  return { dragForce: (speed, crouch, p) => { observed.params = p; return original.dragForce(speed, crouch, p); } };
});
const DEG = Math.PI / 180;
const make = (gear = 'ski', options = {}) => {
  const r = createRide(plane(), { gear, ...options }); r.reset({ x: 0, z: 0, speed: 15, heading: 0 }); return r;
};
it('2.2: ski carving radius at 15 m/s and full steer is at least 1.5 times board', () => {
  expect(radius('ski', 15, 1) / radius('board', 15, 1)).toBeGreaterThanOrEqual(1.5);
});
it('2.2: opposite edge and half-force reversal take at most 70% of board time', () => {
  const board = reversal('board'), ski = reversal('ski');
  expect(ski.zero).toBeGreaterThan(0); expect(ski.zero / board.zero).toBeLessThanOrEqual(0.7);
  expect(ski.half / board.half).toBeLessThanOrEqual(0.7);
});
it('2.2: tuck terminal speed at 25 degrees is at least 10% faster and has converged', () => {
  const board = terminal('board', 25), ski = terminal('ski', 25);
  expect(ski.speed / board.speed).toBeGreaterThanOrEqual(1.1);
  expect(board.change).toBeLessThan(0.001); expect(ski.change).toBeLessThan(0.001);
});
it('2.2: sustained flat push reaches 4.5 m/s; board stays at 3.2 m/s', () => {
  expect(push('ski')).toBeCloseTo(4.5, 10); expect(push('board')).toBeCloseTo(3.2, 10);
});
it('setGear preserves the consumed parameter object, motion, state references, and custom overrides', () => {
  const custom = { sidecut: 21, cdATuck: 0.25, snow: { packed: { mu: 0.06 } } };
  const r = make('board', { params: custom, stance: -1 }); advance(r, 0.6, { steer: 0.5 });
  const p = observed.params, state = r.state, pos = state.pos, before = r.snapshot();
  r.setGear('ski'); expect(observed.params).toBe(p);
  const expectedState = { ...before.state, gear: 'ski' };
  expect(hash(r.state)).toBe(hash(expectedState));
  expect(r.state).toBe(state); expect(r.state.pos).toBe(pos); expect(r.state.stance).toBe(-1);
  r.step({}, 1 / 240); expect(observed.params).toBe(p);
  const values = JSON.stringify(p);
  const fresh = make('ski', { params: custom }); fresh.step({}, 1 / 240);
  expect(JSON.stringify(observed.params)).toBe(values);
  expect(p.sidecut).toBe(21); expect(p.cdATuck).toBe(0.25); expect(p.snow.packed.mu).toBe(0.06);
  r.setGear('board'); r.step({}, 1 / 240);
  expect(observed.params).toBe(p); expect(p.edgeMax).toBe(PARAMS.edgeMax); expect(p.lateralOmega).toBe(PARAMS.lateralOmega);
  expect(p.sidecut).toBe(21); expect(p.snow.packed.mu).toBe(0.06);
});
it('switching at rest then stepping matches a fresh ski ride bit for bit', () => {
  const r = make('board'), fresh = make('ski'); r.setGear('ski');
  advance(r, 2, { steer: 0.7, tuck: 0.4 }); advance(fresh, 2, { steer: 0.7, tuck: 0.4 });
  expect(hash(r.snapshot())).toBe(hash(fresh.snapshot()));
});
it('gear survives copyState, reset, respawn, JSON snapshots and restore across gear changes', () => {
  const r = make(); advance(r, 0.6, { jump: true, steer: 1 }); advance(r, 0.1, { steer: 1 });
  const snap = JSON.parse(JSON.stringify(r.snapshot())), out = createState();
  expect(copyState(r.state, out).gear).toBe('ski');
  advance(r, 0.2, { jump: true, steer: 1 }); const result = hash(r.snapshot());
  r.setGear('board'); r.restore(snap); advance(r, 0.2, { jump: true, steer: 1 });
  expect(hash(r.snapshot())).toBe(result);
  r.respawn(); expect(r.state.gear).toBe('ski');
  r.reset({ x: 2, z: 3, speed: 4, heading: 0 }); expect(r.state.gear).toBe('ski');
});
it('old snapshots and copied states without gear select board and restore board physics', () => {
  const board = make('board'); advance(board, 1, { steer: 0.6 });
  const old = board.snapshot(); delete old.state.gear;
  const r = make(); r.restore(old); expect(r.state.gear).toBe('board');
  const out = createState(); out.gear = 'ski'; copyState(old.state, out); expect(out.gear).toBe('board');
  advance(board, 1, { steer: -0.6 }); advance(r, 1, { steer: -0.6 });
  expect(hash(r.snapshot())).toBe(hash(board.snapshot()));
});
it('invalid gear is rejected without changing motion or parameters', () => {
  const r = make(), before = hash(r.snapshot());
  expect(() => r.setGear('sled')).toThrow('gear'); expect(hash(r.snapshot())).toBe(before);
  expect(() => createRide(plane(), { gear: 'sled' })).toThrow('gear');
});
it('2.3: ski neutral braking preserves the travel line and realigns after release (T24)', () => {
  for (const brake of [0.5, 1]) {
    const turned = params => {
      const terrain = heightfield((x, z, out) => {
        out.h = Math.tan(20 * DEG) * z; out.hx = 0; out.hz = Math.tan(20 * DEG); out.hxx = out.hxz = out.hzz = 0;
      }, { snow: { powder: 0.3, packed: 0.7, ice: 0 } });
      const r = createRide(terrain, { gear: 'ski', params }); r.reset({ x: 0, z: 0, speed: 15, heading: 30 * DEG });
      const travel = () => Math.atan2(r.state.vel.x, -r.state.vel.z) / DEG;
      advance(r, 0.5); const before = travel(); advance(r, 1, { brake }); const during = travel() - before;
      advance(r, 1.5); return { during, mode: r.state.mode, board: r.state.heading / DEG - travel() };
    };
    const kept = turned({}), free = turned({ skidLineHold: 0 });
    expect(free.during).toBeGreaterThan(8); expect(kept.during).toBeLessThan(2); expect(kept.during).toBeGreaterThan(-9);
    expect(kept.mode).toBe('carve'); expect(Math.abs(kept.board)).toBeLessThan(5);
  }
});
function fall(gear, { efh = 0.3, heading = 0 } = {}) {
  const r = make(gear, { params: { cdA: 0, cdATuck: 0 } }), snap = r.snapshot(), s = snap.state;
  s.mode = 'air'; s.pos.y = 0.001; s.leg = 0.8; s.com.y = 0.801; s.air.time = 0.2;
  s.vel.x = 0; s.vel.z = -10; s.vel.y = -Math.sqrt(2 * 9.81 * efh);
  s.fwd.x = Math.sin(heading); s.fwd.z = -Math.cos(heading); s.heading = heading;
  snap.memory.takeoffSent = true; r.restore(snap); r.step({}, 1 / 120); return r;
}
it('2.4: skis land backwards and keep switch steering', () => {
  const r = fall('ski', { heading: Math.PI });
  expect(r.state.switch).toBe(true); expect(r.state.vel.z).toBeLessThan(0); expect(r.state.fwd.z).toBeGreaterThan(0);
  advance(r, 0.5, { steer: 1 }); expect(r.state.vel.x).toBeGreaterThan(0); expect(r.state.switch).toBe(true);
});
it('2.4: ski landing qualities and crash reasons follow the same boundaries as board', () => {
  for (const [efh, heading, quality, reason] of [[0.3, 0, 'clean', ''], [0.9, 0, 'heavy', ''], [1.2, 0, 'sketchy', ''], [1.6, 0, 'sketchy', 'landing-hard'], [0.3, Math.PI / 2, 'sketchy', 'landing-sideways']]) {
    for (const gear of ['board', 'ski']) {
      const r = fall(gear, { efh, heading });
      expect(r.events.find(e => e.type === 'land')?.quality).toBe(quality);
      expect(r.events.find(e => e.type === 'crash')?.reason ?? '').toBe(reason);
    }
  }
});
it('2.4: ski recovery timing and safe/drop respawn follow board rules', () => {
  const results = [];
  for (const gear of ['board', 'ski']) {
    const r = make(gear, { params: { cdA: 0, cdATuck: 0 } });
    const snap = r.snapshot(); snap.state.mode = 'crash'; snap.state.vel.z = -5; r.restore(snap);
    let stopped = null, recovered = null;
    for (let i = 1; i <= 600; i++) {
      r.step({}, 1 / 120); if (stopped === null && r.state.speed < 0.5) stopped = i / 120;
      if (r.events.some(e => e.type === 'recover')) { recovered = i / 120; break; }
    }
    expect(recovered).toBeGreaterThan(stopped); expect(recovered - stopped).toBeLessThanOrEqual(1.5);
    expect(r.state.gear).toBe(gear); results.push({ stopped, recovered });
    r.reset({ x: 4, z: 8, speed: 10, heading: 0.2 }); advance(r, 4); const safe = r.snapshot().safe;
    expect(safe.z).not.toBe(8); r.respawn('drop'); expect(r.state.pos.x).toBe(4); expect(r.state.pos.z).toBe(8); expect(r.state.speed).toBe(0);
    r.respawn('safe'); expect(r.state.pos.x).toBe(safe.x); expect(r.state.pos.z).toBe(safe.z); expect(r.state.speed).toBe(0); expect(r.state.gear).toBe(gear);
  }
  expect(results[1]).toEqual(results[0]);
});
it('2.1: ski air spin rate uses the same trick controls as board', () => {
  expect(spin('ski')).toBeCloseTo(spin('board'), 10); expect(spin('ski')).toBeGreaterThan(410);
});
it('board numeric states, hidden memory and events retain pre-change hashes at every tick', () => {
  // Captured before I18a: 1440 frames each. Only the newly added gear field is omitted.
  const cases = [['flat', plane(), 1755009885, 2300614807, 667280816], ['slope25', plane(25 * DEG), 2963852117, 3417872776, 3554273234], ['wave', wave(), 1201412066, 3531399844, 3980180211]];
  for (const [name, terrain, framesHash, eventsHash, finalHash] of cases) {
    const r = createRide(terrain), states = [], events = [];
    r.reset({ x: 1, z: 2, heading: 0.2, speed: 15 });
    const legacy = () => { const snap = r.snapshot(); delete snap.state.gear; return snap; };
    for (let i = 0; i < 120 * 12; i++) {
      r.step({ steer: i < 240 ? 0.5 : i < 480 ? -0.7 : 0, brake: i >= 600 && i < 720 ? 0.6 : 0, tuck: i >= 840 ? 1 : 0, jump: i >= 480 && i < 576 }, 1 / 120);
      states.push(hash(legacy())); events.push(hash(r.events));
    }
    expect(hash(states), name).toBe(framesHash); expect(hash(events), name).toBe(eventsHash); expect(hash(legacy()), name).toBe(finalHash);
  }
  expect(GEAR.board).toEqual({});
});
