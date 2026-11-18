import { describe, expect, it, vi } from 'vitest';
import { Simulation } from '../../src/game/sim/Simulation';
import { CpuBrain } from '../../src/game/sim/ai/cpu';
import type { P2 } from '../../src/game/sim/nav/grid';
import { activePeels } from '../../src/game/sim/systems/banana';
import { EMPTY_INPUT, type InputState } from '../../src/shared/input';
import { ACTION, BANANA, BELL, CLERK, CPU_PLAN, MATCH, PICKUP_RANGE } from '../../src/shared/rules/tuning';
import { streamRng } from '../../src/shared/rng';
import type { AvatarState } from '../../src/game/sim/types';

type Go = { k: 'go'; to: P2 | (() => P2 | null); arrive: number };
interface TaskProbe {
  kind: string; i: number; steps: Array<Go | { k: string }>;
  pathTo: P2 | null;
}
// Inspect planner decisions while the integration tests still use ordinary CPU inputs.
interface BrainProbe {
  task: TaskProbe | null;
  choose(sim: Simulation, av: AvatarState): TaskProbe;
  makeTask(kind: string, key: string, steps: Go[]): TaskProbe;
  run(sim: Simulation, av: AvatarState, task: TaskProbe, out: InputState): void;
  peelSpot(sim: Simulation, av: AvatarState): P2 | null;
}
const probe = (brain: CpuBrain): BrainProbe => brain as unknown as BrainProbe;
const H = 1 / 60;
const grace = (): number => (CPU_PLAN as typeof CPU_PLAN & { openingPyramidGrace: number }).openingPyramidGrace;
async function game(seed = 1): Promise<Simulation> {
  const sim = await Simulation.create({ seed, npcs: false, players: [
    { slot: 0, kind: 'human', name: 'human', character: 'ch/character-female-b' },
    { slot: 1, kind: 'cpu', name: 'CPU', character: 'ch/character-male-f' },
  ] });
  sim.runFor(MATCH.countdown + H);
  return sim;
}

describe('quality upgrade Task 1.1', () => {
  for (const level of ['normal', 'hard'] as const) {
    it(`${level}: no pyramid decisions or deliberate collapse during opening ticks, seeds 1..10`, async () => {
      for (let seed = 1; seed <= 10; seed++) {
        const sim = await game(seed);
        try {
          const brain = new CpuBrain(level, streamRng(seed, 'cpu'));
          const av = sim.avatars[1]!;
          // Include decisions made near the pyramid, where its utility otherwise wins.
          const p = sim.layout.places.pyramid;
          sim.teleport(1, p.x, p.z + 1);
          sim.setController(1, brain);
          while (sim.elapsed + H < (grace() ?? 5)) {
            expect(probe(brain).choose(sim, av).kind, `seed ${seed}, elapsed ${sim.elapsed}`).not.toBe('pyramid');
            sim.step(H);
            expect(probe(brain).task?.kind).not.toBe('pyramid');
            expect(sim.view(0).stations.pyramid.collapsed).toBe(false);
            expect(av.progress.pyramid ?? 0).toBe(0);
          }
        } finally { sim.dispose(); }
      }
      expect(grace()).toBe(5);
    }, 120_000);
  }

  it('caught recovery uses a walkable service point outside even sticky bell range', async () => {
    const sim = await game();
    try {
      const av = sim.avatars[0]!;
      sim.catchAvatar(0, 0);
      sim.runFor(CLERK.grabTime + CLERK.caughtStun + 0.1);
      const { service, bell } = sim.layout.places;
      expect(av.stunned).toBe(0);
      expect(av.pos.x).toBeCloseTo(service.x);
      expect(av.pos.z).toBeCloseTo(service.z);
      expect(sim.nav.isFree(service.x, service.z)).toBe(true);
      expect(Math.hypot(service.x - bell.x, service.z - bell.z)).toBeGreaterThan(BELL.range + ACTION.stickyRange);
      expect(av.offer?.system.id).not.toBe('bell');
      sim.view(0);
      sim.setInput(0, { ...EMPTY_INPUT, action: true, actionPressed: true });
      sim.step(H);
      expect(sim.view(0).events.some(e => (e.t === 'sfx' && e.name === 'bell') || (e.t === 'score' && e.kind === 'bell'))).toBe(false);
      expect(av.progress.bell ?? 0).toBe(0);
    } finally { sim.dispose(); }
  });

  it('freezes each function-valued go target once, even after path invalidation, then resets for the next step', async () => {
    const sim = await game();
    try {
      const brain = new CpuBrain('hard', streamRng(1, 'cpu'));
      const b = probe(brain), av = sim.avatars[1]!;
      sim.teleport(1, -10, 5);
      const moving = { x: 0, z: 5 };
      const target = vi.fn(() => ({ ...moving }));
      const task = b.makeTask('banana', 'banana', [
        { k: 'go', to: target, arrive: 0.6 }, { k: 'go', to: target, arrive: 0.6 },
      ]);
      b.run(sim, av, task, { ...EMPTY_INPUT });
      const original = { ...task.pathTo! };
      for (const dx of [0.2, 0.6, 2, 4]) {
        moving.x = dx;
        task.pathTo = null; // Stuck recovery must rebuild a path to the same frozen destination.
        b.run(sim, av, task, { ...EMPTY_INPUT });
        expect(task.pathTo).toEqual(original);
      }
      expect(target).toHaveBeenCalledTimes(1);
      sim.teleport(1, original.x, original.z);
      b.run(sim, av, task, { ...EMPTY_INPUT });
      expect(task.i).toBe(1);
      b.run(sim, av, task, { ...EMPTY_INPUT });
      expect(target).toHaveBeenCalledTimes(2);
      expect(task.pathTo).toEqual(moving);
    } finally { sim.dispose(); }
  });

  it('hard peel prediction prefers a connected human and compensates for dropBehind', async () => {
    const sim = await game();
    try {
      const brain = new CpuBrain('hard', streamRng(1, 'cpu'));
      const human = sim.avatars[0]!, av = sim.avatars[1]!;
      // A connected CPU appears first in the roster; it must not win over the human.
      sim.avatars.unshift({ ...av, slot: 2, pos: { x: 12, y: 0, z: 5 } });
      sim.teleport(0, -10, 5);
      human.vel = { x: 1, y: 0, z: 0 };
      av.yaw = Math.PI / 2;
      const spot = probe(brain).peelSpot(sim, av)!;
      expect(spot.x - Math.sin(av.yaw) * BANANA.dropBehind).toBeCloseTo(human.pos.x + human.vel.x * 1.2);
      expect(spot.z - Math.cos(av.yaw) * BANANA.dropBehind).toBeCloseTo(human.pos.z + human.vel.z * 1.2);
    } finally { sim.dispose(); }
  });

  it('approaches a live banana prop center inside pickup range and picks and drops against a reachable opponent', async () => {
    for (const seed of [1, 2, 3]) {
      const sim = await game(seed);
      try {
        const brain = new CpuBrain('hard', streamRng(seed, 'cpu'));
        const av = sim.avatars[1]!;
        // Leave one available banana, away from the table's nominal place.
        const bananas = sim.props.filter(p => p.def.kind === 'banana');
        for (const p of bananas.slice(1)) { p.hidden = true; p.body.setEnabled(false); }
        const banana = bananas[0]!;
        banana.body.setTranslation({ x: -10, y: 0.1, z: 5 }, true);
        sim.teleport(1, -12, 5);
        sim.teleport(0, -6, 5);
        // Restrict task kinds through the brain's own tuning, without changing global CPU settings.
        Object.assign(brain, { tune: { ...((brain as unknown as { tune: object }).tune), kinds: ['banana'] } });
        const chosen = probe(brain).choose(sim, av);
        const first = chosen.steps[0] as Go;
        const goal = typeof first.to === 'function' ? first.to()! : first.to;
        const center = sim.propCenter(banana);
        expect(Math.hypot(goal.x - center.x, goal.z - center.z) + first.arrive).toBeLessThan(PICKUP_RANGE);
        sim.setController(1, brain);
        let picked = false, dropped = false;
        for (let i = 0; i < 20 * 60; i++) {
          // Human keeps moving, so a recomputed drop target would keep receding.
          sim.setInput(0, { ...EMPTY_INPUT, moveX: 0.2 });
          sim.step(H);
          picked ||= av.holding === banana.def.id;
          dropped ||= activePeels(sim).some(p => p.owner === av.slot);
          if (dropped) break;
        }
        expect(picked, `seed ${seed}: picked`).toBe(true);
        expect(dropped, `seed ${seed}: dropped`).toBe(true);
      } finally { sim.dispose(); }
    }
  }, 120_000);
});
