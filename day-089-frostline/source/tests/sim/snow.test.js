import { describe, it, expect } from 'vitest';
import { createParams, SNOW } from '../../src/sim/params.js';
import { mixSnow, snowSupport, updateSink } from '../../src/sim/snow.js';
describe('snow coefficients', () => {
  for (const kind of ['packed', 'powder', 'ice', 'rock']) it(`pure ${kind} matches the model table`, () => {
    const snow = { packed: 0, powder: 0, ice: 0, rock: 0, [kind]: 1 };
    const out = {}; mixSnow(snow, SNOW, out);
    for (const key of ['mu', 'lambda', 'kz', 'q']) expect(out[key]).toBe(SNOW[kind][key]);
  });
  it('normalizes proportions then overlays rock', () => {
    const out = {}; mixSnow({ packed: 2, powder: 2, ice: 0, rock: 0.5 }, SNOW, out);
    expect(out.mu).toBeCloseTo(0.05, 12); // I7: exposure 0.5 is still snow-covered.
    mixSnow({ packed: 2, powder: 2, ice: 0, rock: 0.75 }, SNOW, out);
    expect(out.mu).toBeCloseTo(0.275, 12);
  });
});
it('R2 #20 powder support is 320 + 450 = 770N with reference kz=8000', () => {
  const p = createParams(); expect(snowSupport(0.1, 0, 8000, p)).toBeCloseTo(320, 12);
  expect(snowSupport(0.1, 10, 8000, p)).toBeCloseTo(770, 12);
});
it('sink solves both support branches, is depth-limited, and decreases with speed', () => {
  const p = createParams({ snow: { powder: { kz: 8000 } } }), mat = {};
  mixSnow({ packed: 0, powder: 1, ice: 0, rock: 0 }, p.snow, mat);
  const state = { speed: 0, sink: 0, snow: { depth: 1 } };
  updateSink(state, 770, mat, p); const slow = state.sink;
  expect(snowSupport(state.sink, 0, 8000, p)).toBeCloseTo(770, 9);
  state.speed = 10; updateSink(state, 770, mat, p); expect(state.sink).toBeCloseTo(0.1, 10); expect(state.sink).toBeLessThan(slow);
  state.speed = 20; updateSink(state, 770, mat, p); expect(state.sink).toBeLessThan(0.1);
  expect(snowSupport(state.sink, 20, 8000, p)).toBeCloseTo(770, 9);
  state.snow.depth = 0.01; updateSink(state, 770, mat, p); expect(state.sink).toBe(0.01);
});
