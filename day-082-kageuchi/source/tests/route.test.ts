// OWNER: core
// 一面を通して遊べる：道順の台本（tools/routes/*.json）を sim 単体で流し、捕まらずに信長を討てること（?god=1 なし）。
// 同じ台本を、ブラウザでは tools/play.mjs が window.__input から流す。
import { describe, expect, it } from 'vitest';
import type { Route } from '../src/game/autopilot';
import mizunuki from '../tools/routes/mizunuki.json';
import ura from '../tools/routes/ura.json';
import { runRoute } from './bot';

describe('一面を通して遊ぶ（sim 単体）', () => {
  for (const route of [ura, mizunuki] as Route[]) {
    it(`${route.name} の道で、捕まらずに信長を討てる`, { timeout: 120_000 }, () => {
      const run = runRoute(route, { traceEvery: 5 });
      const msg = [run.bot.failReason ?? '', ...run.bot.log.map((l) => `${l.t.toFixed(1)} [${l.step}] ${l.text}`), ...run.trace].join('\n');
      expect(run.bot.status, msg).toBe('done');
      expect(run.sim.outcome, msg).toBe('win');
      process.stdout.write(`${route.name}: ${run.time.toFixed(1)} 秒・発見 ${run.sim.stats.discoveries}・当て身 ${run.sim.stats.takedowns}\n`);
    });
  }
});
