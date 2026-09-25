import { PHYS, WORLD } from './physics.js';

// 「次のすき間の中心より少し下を割ったら羽ばたく」だけの操縦。
// 人より下手な単純規則で全コースを抜けられれば、コースが物理的に届く証拠になる
export function autopilotWants(g, bias = 0.18) {
  if (g.phase === 'ready') return true;
  if (g.phase !== 'flying') return false;
  const c = g.cat;
  const wx = WORLD.catX + g.dist;
  const poles = g.course.poles;
  let next = null;
  for (let i = g.first; i < poles.length; i += 1) {
    if (poles[i].x + poles[i].w + PHYS.catR > wx) {
      next = poles[i];
      break;
    }
  }
  if (!next) return c.y > WORLD.bandH / 2 && c.vy >= 0;
  const target = next.center + next.gap * bias;
  return c.y > target && c.vy >= 0;
}
