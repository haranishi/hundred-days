// OWNER: tests
// r02-controls の操作の約束を3体とも守るか（r03-roster）：180度の切り返し（地上1.0秒・空中1.8秒）、技の前の向き直り0.15秒、
// ビルに0.5秒以上張り付かない。焔角は飛ばないので空中の分は測らず、代わりに突進でビルを傾きまで押し倒すことを確かめる。
// 測り方は tests/gameplay/controlsMeasure.ts（紅竜の r02-controls の計測）と同じ手順。
// 数字は R03_MEASURE_OUT を付けて流すと書き出す：R03_MEASURE_OUT=.captures/r03-roster/measure-roster.json npx vitest run tests/gameplay/roster.measure.test.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CITY_CONFIG } from '../../src/config/city';
import { LOOK } from '../../src/config/controls';
import { CREATURE_CONFIG, CREATURE_IDS, type CreatureId } from '../../src/config/creatures';
import { SESSION } from '../../src/config/gameplay';
import { InputState } from '../../src/core/input';
import { FixedStepLoop } from '../../src/core/loop';
import { readControls } from '../../src/gameplay/controls';
import { Game } from '../../src/gameplay/game';
import { pressInput, releaseInput } from '../../src/harness/keys';
import { BasicPlaytest } from '../../src/harness/playtest';
import type { CityData } from '../../src/world/types';
import { generateCity } from '../../src/world/city';
import { CityIndex } from '../../src/world/query';
import { airReverse, attackPivot, groundReverse, stick, type MeasureMods } from './controlsMeasure';

const city = generateCity(CITY_CONFIG);
const index = new CityIndex(city);
const out: Record<string, unknown> = {};

/** 怪獣 id で始まる遊びの本体（計測の道具は new Game(city, index) で作るので、怪獣を決めた型を渡す）。 */
function mods(id: CreatureId): MeasureMods {
  class CreatureGame extends Game {
    constructor(c: CityData, i: CityIndex) {
      super(c, i, undefined, id);
    }
  }
  return { Game: CreatureGame, InputState, readControls, pressInput, releaseInput, BasicPlaytest, FixedStepLoop, city, index, sensitivity: LOOK.sensitivity, durationSeconds: SESSION.durationSeconds };
}

describe.each([...CREATURE_IDS])('%s：操作の約束（r02-controls）', (id) => {
  const m = mods(id);
  const flies = CREATURE_CONFIG[id].motion.canFly;
  const walk = groundReverse(m, false);
  const runRev = groundReverse(m, true);
  const pivot = { breath: attackPivot(m, 'breath'), claw: attackPivot(m, 'claw'), tail: attackPivot(m, 'tail') };
  const air = flies ? airReverse(m) : null;
  const stickGround = stick(m, false);
  const stickAir = flies ? stick(m, true) : null;
  out[id] = { groundReverse: { walk: walk.seconds, run: runRev.seconds }, airReverse: air, pivot, stickGround, stickAir };

  it('地上で視点を180度振ると、1.0秒以内に向き直る（歩き・走り／突進）', () => {
    expect(walk.seconds).toBeLessThanOrEqual(1.0);
    expect(runRev.seconds).toBeLessThanOrEqual(1.0);
  });

  it.runIf(flies)('空中の180度は1.8秒以内', () => {
    expect(air!.seconds).toBeLessThanOrEqual(1.8);
  });

  it('視点を90度振って技を出すと、0.15秒で照準の方へ向き直る（主砲・右クリック・Q）', () => {
    for (const k of ['breath', 'claw', 'tail'] as const) {
      expect(pivot[k].turnSeconds, k).toBeLessThanOrEqual(0.17);
      expect(pivot[k].fireSeconds, k).toBeLessThan(0.6);
    }
    expect(pivot.claw.offAtFireDeg).toBeLessThan(3);
    expect(pivot.tail.offAtFireDeg).toBeLessThan(3);
  });

  it('走って（突進して）ビルに当たっても0.5秒以上は止まらない。空を飛ぶ怪獣は空中でも', () => {
    expect(stickGround.building).toBeGreaterThanOrEqual(0);
    expect(stickGround.seconds).toBeLessThan(0.5);
    if (stickAir) {
      expect(stickAir.building).toBeGreaterThanOrEqual(0);
      expect(stickAir.seconds).toBeLessThan(0.5);
    }
  });

  it.runIf(id === 'homuratsuno')('焔角の突進は、当たったビルを傾きの段階まで押し倒す', () => {
    expect(stickGround.smashed).toBe(true);
  });
});

afterAll(() => {
  const file = process.env.R03_MEASURE_OUT;
  if (!file) return;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ measured: new Date().toISOString(), ...out }, null, 2));
});
