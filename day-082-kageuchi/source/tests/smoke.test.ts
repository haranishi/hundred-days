// OWNER: core
// sim が長く回しても壊れない（例外・NaN・当たりへのめり込み）ことを確かめる。
import { describe, expect, it } from 'vitest';
import { makeSim, seconds, stepN, walkInput } from './helpers';

describe('sim の煙試験', () => {
  it('何もしないで3分回しても、番兵の位置が有限で、当たりにめり込まない', { timeout: 60_000 }, () => {
    const sim = makeSim();
    stepN(sim, seconds(180));
    for (const g of sim.guards) {
      expect(Number.isFinite(g.x) && Number.isFinite(g.z)).toBe(true);
      if (g.base !== 'seated') expect(sim.q.overlaps(g.x, g.z, 0.3, false)).toBe(false);
    }
    expect(sim.phase).toBe('normal');
    expect(sim.stats.discoveries).toBe(0);
  });

  it('写しが契約の形を満たす（扇は先頭が目の位置）', () => {
    const sim = makeSim();
    stepN(sim, 30, walkInput(0));
    const snap = sim.snapshot(0.5);
    expect(snap.characters.length).toBe(1 + sim.guards.length);
    expect(snap.cones.length).toBeGreaterThan(0);
    for (const c of snap.cones) {
      const g = sim.byId.get(c.id)!;
      expect(c.poly.length).toBe(2 * 41);
      expect(c.poly[0]).toBeCloseTo(g.x, 5);
      expect(c.poly[1]).toBeCloseTo(g.z, 5);
    }
    expect(snap.lights.length).toBe(3);
  });
});
