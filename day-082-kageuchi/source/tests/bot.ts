// OWNER: core
// 道順の台本（tools/routes/*.json）を、sim 単体で流す。ブラウザの window.__input と同じ口（BotIO）を、sim の入力に読み替える。
import { CAMERA } from '../src/config/camera';
import { Autopilot, type Route } from '../src/game/autopilot';
import { buildState } from '../src/game/state';
import type { Sim } from '../src/sim/sim';
import type { SimInput } from '../src/sim/types';
import { makeSim, seconds } from './helpers';

export interface RouteRun {
  sim: Sim;
  bot: Autopilot;
  /** 遊び始めから討ち取るまで（秒）。 */
  time: number;
  trace: string[];
}

export function runRoute(route: Route, opts: { maxSeconds?: number; traceEvery?: number; seed?: number } = {}): RouteRun {
  const seed = opts.seed ?? route.seed ?? 1;
  const sim = makeSim({ seed });
  let camYaw = sim.player.yaw;
  const held = new Set<string>();
  const taps = new Set<string>();
  const io = {
    down: (c: string) => held.add(c),
    up: (c: string) => held.delete(c),
    tap: (c: string) => taps.add(c),
    look: (dx: number) => {
      camYaw += dx * CAMERA.lookSensitivity;
    },
  };
  const bot = new Autopilot(route, io, CAMERA.lookSensitivity);
  const trace: string[] = [];
  const max = seconds(opts.maxSeconds ?? 300);
  for (let i = 0; i < max; i++) {
    const st = buildState(sim, { screen: 'play', seed, camera: { yaw: (camYaw * 180) / Math.PI, pitch: 48, distance: 11, lookSens: CAMERA.lookSensitivity } });
    bot.update(st);
    if (bot.status !== 'running') break;
    const k = (c: string) => (held.has(c) ? 1 : 0);
    const input: SimInput = {
      moveX: k('KeyD') - k('KeyA'),
      moveY: k('KeyW') - k('KeyS'),
      camYaw,
      run: held.has('ShiftLeft') || held.has('ShiftRight'),
      crouchToggle: taps.has('KeyC'),
      interact: taps.has('KeyE'),
      attack: taps.has('KeyF'),
      aim: held.has('KeyQ'),
      aimPoint: null,
    };
    taps.clear();
    sim.step(input);
    for (const e of sim.drainEvents()) {
      if (e.type === 'discovered' || e.type === 'suspicious' || e.type === 'phase' || e.type === 'caught' || e.type === 'takedown' || e.type === 'assassinated' || e.type === 'heard') {
        trace.push(`${sim.t.toFixed(2)} ${e.type} ${'guardId' in e ? e.guardId : ''} ${e.type === 'phase' ? e.to : ''}${e.type === 'discovered' ? ` ${e.record.cause} ${e.record.lightTier} ${e.record.stance} ${e.record.distance.toFixed(1)}m` : ''}`);
      }
    }
    if (opts.traceEvery && i % seconds(opts.traceEvery) === 0) {
      trace.push(`${sim.t.toFixed(2)} p=(${sim.player.x.toFixed(1)},${sim.player.z.toFixed(1)}) ${sim.player.moveStance} L=${sim.player.light.toFixed(2)} step=${bot.stepIdx} ${sim.phase}`);
    }
    if (sim.outcome === 'caught') {
      bot.update(buildState(sim, { screen: 'gameover', seed, camera: { yaw: 0, pitch: 48, distance: 11, lookSens: CAMERA.lookSensitivity } }));
      break;
    }
  }
  return { sim, bot, time: sim.stats.endTime, trace };
}
