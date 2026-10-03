// OWNER: tests
// 近い的にも主砲を出す（r05-play、体験の採点 r04 の B1・TOP1）。照準の先が約20m より近いと、紅竜の炎と雷翼の雷が「溜め」のまま出ず、
// 照準は「届く」の明るさのままだった。照準が明るいときに左を押したら、必ず出ることを確かめる。焔角の礫は今のまま（11m 先でも出る）。
// 数字は R05_CLOSE_OUT（JSON の保存先）を付けて流すと書き出す：R05_CLOSE_OUT=.captures/r05-play/close-aim.json npx vitest run tests/gameplay/closeAim.test.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CITY_CONFIG } from '../../src/config/city';
import { LOOK } from '../../src/config/controls';
import { CREATURE_IDS } from '../../src/config/creatures';
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
import { brightButSilent, closeAim, creatureMods, lavaInFront, type CloseAimResult } from './playFeelMeasure';

const city = generateCity(CITY_CONFIG);
const index = new CityIndex(city);
const base: MeasureMods = { Game, InputState, readControls, pressInput, releaseInput, BasicPlaytest, FixedStepLoop, city, index, sensitivity: LOOK.sensitivity, durationSeconds: SESSION.durationSeconds };
const DISTANCES = [15, 18, 20, 25];
const report: Record<string, unknown> = {};

describe.each(['kurenai', 'raiyoku'] as const)('%s：近い的に主砲が出る（B1）', (id) => {
  const m = creatureMods(base, id);
  const wall = DISTANCES.map((d) => closeAim(m, 'wall', d));
  const ground = DISTANCES.map((d) => closeAim(m, 'ground', d));
  report[id] = { wall, ground };

  it('ビルの前に立って壁を狙うと、照準の距離 15・18・20・25m のどれでも0.3秒以内に出て、照準のビルに当たる', () => {
    for (const r of wall) {
      expect(r, 'ビルの前に立つ場面が見つからない').not.toBeNull();
      const w = r as CloseAimResult;
      expect(w.reach, `${w.want}m`).toBe(true);
      expect(w.fireSeconds, `${w.want}m で出ない`).not.toBeNull();
      expect(w.fireSeconds!, `${w.want}m`).toBeLessThanOrEqual(0.3);
      expect(w.silentSeconds, `${w.want}m`).toBeLessThanOrEqual(0.3);
      expect(w.aimedBuildingHit, `${w.want}m`).toBe(true);
      // 口の前から照準の点へ当たる（雷は建物の高さの3〜9割に落ちるので、そのずれを含めて 8m 以内）
      expect(w.landMeters, `${w.want}m`).not.toBeNull();
      expect(w.landMeters!, `${w.want}m`).toBeLessThanOrEqual(8);
    }
    // この場面は口がビルの中に入り、照準の点が口より体の側になる（直す前は出なかった場面）
    expect(wall.some((r) => r?.behind)).toBe(true);
  });

  it('見下ろして地面を狙っても、照準の点が口の真下・後ろでも0.3秒以内に出る', () => {
    const found = ground.filter((r): r is CloseAimResult => r !== null);
    expect(found.length).toBeGreaterThan(0);
    expect(found.some((r) => r.behind)).toBe(true);
    for (const r of found) {
      expect(r.reach, `${r.want}m`).toBe(true);
      expect(r.fireSeconds, `${r.want}m で出ない`).not.toBeNull();
      expect(r.fireSeconds!, `${r.want}m`).toBeLessThanOrEqual(0.3);
      expect(r.landMeters!, `${r.want}m`).toBeLessThanOrEqual(8);
    }
  });
});

describe('明るい照準のまま無反応にしない', () => {
  it.each([...CREATURE_IDS])('%s：立ち位置と視点を変えて、照準が明るい所ではどこでも左を押して0.35秒以内に主砲が出る', (id) => {
    const r = brightButSilent(creatureMods(base, id));
    report[`${id}.bright`] = { samples: r.samples, bright: r.bright, silent: r.silent.length, worst: r.silent.slice(0, 5) };
    expect(r.bright).toBeGreaterThan(100);
    expect(r.silent).toEqual([]);
  });
});

describe('焔角の礫は今のまま', () => {
  it('口の11m 先のビルへも0.3秒以内に投げる', () => {
    const r = lavaInFront(creatureMods(base, 'homuratsuno'), 11);
    report.lavaInFront = r;
    expect(r).not.toBeNull();
    expect(r!.behind).toBe(false);
    expect(r!.fireSeconds).not.toBeNull();
    expect(r!.fireSeconds!).toBeLessThanOrEqual(0.3);
  });
});

afterAll(() => {
  const file = process.env.R05_CLOSE_OUT;
  if (!file) return;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ measured: new Date().toISOString(), ...report }, null, 2));
});
