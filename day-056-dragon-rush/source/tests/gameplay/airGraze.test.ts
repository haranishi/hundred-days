// OWNER: tests
// 空中で塔をかすめても横へ跳ばない（r05-play、体験の採点 r04 の B3）。高さ44m・36m/s で塔の角に触れると、1コマで約6m 横へ押し出されていた。
// 滑空で沈むうちに足が屋上より下がった瞬間、すでに外形に重なっていた分を1刻みで押し出していたため。押し出しを数コマに分け、
// 張り付かないこと（止まるのは0.1秒未満、速さは今と同じくらい残す）は保つ。
// 数字は R05_GRAZE_OUT（JSON の保存先）を付けて流すと書き出す：R05_GRAZE_OUT=.captures/r05-play/air-graze.json npx vitest run tests/gameplay/airGraze.test.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CITY_CONFIG } from '../../src/config/city';
import { LOOK } from '../../src/config/controls';
import { SESSION } from '../../src/config/gameplay';
import { InputState } from '../../src/core/input';
import { FixedStepLoop } from '../../src/core/loop';
import { readControls } from '../../src/gameplay/controls';
import { Game } from '../../src/gameplay/game';
import { pressInput, releaseInput } from '../../src/harness/keys';
import { BasicPlaytest } from '../../src/harness/playtest';
import { generateCity } from '../../src/world/city';
import { CityIndex } from '../../src/world/query';
import type { MeasureMods } from './controlsMeasure';
import { B3_RECORD, airGraze, creatureMods, type GrazeResult } from './playFeelMeasure';

const city = generateCity(CITY_CONFIG);
const index = new CityIndex(city);
const base: MeasureMods = { Game, InputState, readControls, pressInput, releaseInput, BasicPlaytest, FixedStepLoop, city, index, sensitivity: LOOK.sensitivity, durationSeconds: SESSION.durationSeconds };
const report: Record<string, unknown> = {};

/** 1コマで動いてよい量：その怪獣の巡航の1コマ分に、押し出しの1コマ分（1m 未満）を足したもの */
function expectSmooth(r: GrazeResult | null, cruise: number): void {
  expect(r, '場面が見つからない').not.toBeNull();
  const g = r as GrazeResult;
  expect(g.touched, 'かすめていない').toBe(true);
  expect(g.maxSide, '1コマの横のずれ').toBeLessThanOrEqual(1.0);
  expect(g.maxStep, '1コマの動き').toBeLessThanOrEqual(cruise / 60 + 1.0);
  expect(g.stuckSeconds, '張り付き').toBeLessThan(0.1);
  expect(g.speedKeep, '残す速さ').toBeGreaterThanOrEqual(0.6);
  expect(g.overlapEnd, '終わりに重なったまま').toBe(0);
}

describe('空中で塔をかすめても横へ跳ばない（B3）', () => {
  it('体験の採点の記録の場面（紅竜・高さ45m・36m/s で建物259の角）：1コマの横のずれは1m 以下、張り付かず、速さを6割以上残す', () => {
    const r = airGraze(creatureMods(base, 'kurenai'), 'b3-record', B3_RECORD);
    report.record = r;
    expectSmooth(r, 36);
  });

  it.each([
    ['kurenai', 36],
    ['raiyoku', 50],
  ] as const)('%s：屋上の高さで外形の辺に沿って飛び、足が屋上より下がっても、重なりは数コマで押し出す', (id, cruise) => {
    const r = airGraze(creatureMods(base, id), `edge-${id}`);
    report[id] = r;
    expectSmooth(r, cruise);
  });
});

afterAll(() => {
  const file = process.env.R05_GRAZE_OUT;
  if (!file) return;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ measured: new Date().toISOString(), ...report }, null, 2));
});
