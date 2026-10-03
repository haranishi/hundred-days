// OWNER: tests
// 3体の怪獣（r03-roster、docs/CHARACTERS.md）：3分の自動プレイの完走・決定性・最初の崩落・怪獣ごとの技の出来事と、
// 3体の違いを数字で示す規則（空中の最高速・焔角が飛ばないこと・雷の跳ね・地割れの長さ・突進の押し倒し）。描画なしで遊びの本体を回す。
// 数字は R03_ROSTER_OUT（JSON の保存先）を付けて流すと書き出す：R03_ROSTER_OUT=.captures/r03-roster/roster-sim.json npx vitest run tests/gameplay/roster.test.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CITY_CONFIG } from '../../src/config/city';
import { CREATURE_CONFIG, CREATURE_IDS, type CreatureId } from '../../src/config/creatures';
import { SESSION } from '../../src/config/gameplay';
import { LOCOMOTION } from '../../src/config/locomotion';
import { InputState } from '../../src/core/input';
import { CREATURE_EVENT_TYPES } from '../../src/core/events';
import { readControls } from '../../src/gameplay/controls';
import { Game } from '../../src/gameplay/game';
import { ScoreKeeper } from '../../src/gameplay/score';
import { vec3 } from '../../src/gameplay/math';
import { pressInput, releaseInput } from '../../src/harness/keys';
import { BasicPlaytest } from '../../src/harness/playtest';
import { generateCity } from '../../src/world/city';
import { CityIndex } from '../../src/world/query';
import type { Building } from '../../src/world/types';

const city = generateCity(CITY_CONFIG);
const index = new CityIndex(city);
const DT = 1 / 60;
const DEG = Math.PI / 180;
const report: Record<string, unknown> = {};

function playToEnd(id: CreatureId): Game {
  const game = new Game(city, index, undefined, id);
  const bot = new BasicPlaytest();
  const input = new InputState();
  game.start();
  for (let i = 0; i < Math.round((SESSION.durationSeconds + 30) / DT) && game.session.phase !== 'result'; i++) {
    bot.update(DT, game, input);
    game.step(DT, readControls(input));
  }
  return game;
}

/** 高い建物（踏みつぶせない高さ）から clearance m 以上離れた、湾の浅瀬に近い開けた点。 */
function openSpot(clearance: number): { x: number; z: number } {
  for (let r = 0; r < 700; r += 20) {
    for (const [x, z] of [
      [-600 + r, 0],
      [-600, r],
      [-600, -r],
    ]) {
      if (index.surfaceAt(x, z) === 'outside') continue;
      if (index.buildingsNear(x, z, clearance).every((b) => b.height < 14)) return { x, z };
    }
  }
  throw new Error('開けた場所が無い');
}

function placeAt(game: Game, x: number, z: number, yaw: number, air: number | null): void {
  const b = game.body;
  const ground = game.groundAt(x, z);
  b.groundY = ground;
  b.pos.x = x;
  b.pos.z = z;
  b.pos.y = ground + b.bodyHeight + (air ?? 0);
  b.vel.x = b.vel.y = b.vel.z = 0;
  b.mode = air === null ? 'ground' : 'air';
  b.speed = 0;
  b.yaw = yaw;
  game.view.yaw = yaw;
  game.view.pitch = -10 * DEG;
}

function run(game: Game, input: InputState, seconds: number, each?: () => void): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    game.step(DT, readControls(input));
    each?.();
  }
}

describe.each([...CREATURE_IDS])('%s：3分の自動プレイ（描画なし）', (id) => {
  const game = playToEnd(id);
  report[`${id}.autoplay`] = {
    endedAt: game.endedAt,
    firstCollapseAt: game.firstCollapseAt,
    yen: Math.round(game.score.yen),
    destruction: game.score.destruction,
    maxCombo: game.score.maxCombo,
    collapsed: game.damage.tally().collapsed,
    stats: game.stats,
  };

  it('結果はゲーム内時刻の180.0秒で出て、最初の崩落は10秒以内', () => {
    expect(game.session.phase).toBe('result');
    expect(game.bus.count('session.end')).toBe(1);
    expect(Math.abs(game.endedAt! - SESSION.durationSeconds)).toBeLessThan(0.02);
    expect(game.firstCollapseAt).not.toBeNull();
    expect(game.firstCollapseAt!).toBeLessThan(10);
    expect(game.score.destruction).toBeGreaterThan(0.05);
  });

  it('その怪獣の技の出来事がすべて出て、どれにも怪獣の名前が載っている', () => {
    const missing = CREATURE_EVENT_TYPES[id].filter((t) => game.bus.count(t) === 0);
    expect(missing).toEqual([]);
    const tagged = game.bus.recent.filter((e) => 'creature' in e);
    expect(tagged.every((e) => (e as { creature?: string }).creature === id)).toBe(true);
  });

  it('同じ操作の列なら、同じ結果になる', () => {
    const again = playToEnd(id);
    expect(again.score.yen).toBe(game.score.yen);
    expect(again.firstCollapseAt).toBe(game.firstCollapseAt);
    expect(again.bus.counts()).toEqual(game.bus.counts());
    expect(again.stats).toEqual(game.stats);
  });
});

describe('3体の違い（受け入れ条件4）', () => {
  it('空中の最高速：雷翼が紅竜より速い（W を5秒押し続けた最高の水平の速さ）', () => {
    const top = (id: CreatureId): number => {
      const game = new Game(city, index, undefined, id);
      const input = new InputState();
      game.start();
      const s = openSpot(60);
      placeAt(game, s.x, s.z, 90 * DEG, 180);
      pressInput(input, 'w');
      let max = 0;
      run(game, input, 5, () => (max = Math.max(max, game.body.mode === 'air' ? game.body.speed : 0)));
      return max;
    };
    const kurenai = top('kurenai');
    const raiyoku = top('raiyoku');
    report.airTopSpeed = { kurenai, raiyoku };
    expect(kurenai).toBeCloseTo(LOCOMOTION.air.cruiseSpeed, 0);
    expect(raiyoku).toBeCloseTo(CREATURE_CONFIG.raiyoku.motion.air.cruiseSpeed, 0);
    expect(raiyoku).toBeGreaterThan(kurenai * 1.3);
  });

  it('焔角は Space で飛ばない：0.5秒ごとに押しても跳んで戻るだけで、空中（air）にならず、20m より高く上がらない', () => {
    const game = new Game(city, index, undefined, 'homuratsuno');
    const input = new InputState();
    game.start();
    const modes = new Set<string>();
    let maxAltitude = 0;
    for (let k = 0; k < 12; k++) {
      pressInput(input, 'space');
      run(game, input, 0.1, () => modes.add(game.body.mode));
      releaseInput(input, 'space');
      run(game, input, 0.4, () => {
        modes.add(game.body.mode);
        if (!game.body.grounded) maxAltitude = Math.max(maxAltitude, game.body.altitude);
      });
    }
    run(game, input, 2.5, () => modes.add(game.body.mode));
    report.homuratsunoSpace = { modes: [...modes].sort(), maxAltitude, jumps: game.stats.jumps, landedAtEnd: game.body.grounded };
    expect(modes.has('jump')).toBe(true);
    expect(modes.has('air')).toBe(false);
    expect(modes.has('dive')).toBe(false);
    expect(maxAltitude).toBeGreaterThan(8);
    expect(maxAltitude).toBeLessThan(20);
    expect(game.body.grounded).toBe(true);
    // 着地は、のしかかりの地響き（dragon.land の slam）
    expect(game.bus.recent.some((e) => e.type === 'dragon.land' && e.slam === true)).toBe(true);
  });

  it('雷は照準のビルに落ち、近くのビルへ最大4回跳ね、跳ぶたびに弱まる。燃やさない', () => {
    const spec = CREATURE_CONFIG.raiyoku.moves.primary.spec as { hops: number; falloff: number; damage: number };
    let best: { hops: { hop: number; id: number; damage: number }[]; target: Building } | null = null;
    for (const b of [...city.buildings].sort((p, q) => p.id - q.id)) {
      if (b.height < 25) continue;
      const game = new Game(city, index, undefined, 'raiyoku');
      const f = b.footprint;
      const to = vec3(f.x0, b.height * 0.5, (f.z0 + f.z1) / 2);
      game.fireAt(vec3(f.x0 - 3, b.height * 0.5, (f.z0 + f.z1) / 2), to);
      for (let i = 0; i < 60; i++) game.advanceWorld(DT);
      const hops = game.bus.recent.filter((e) => e.type === 'lightning.hop').map((e) => ({ hop: e.hop, id: e.id, damage: e.damage }));
      if (hops[0]?.id === b.id && hops.length === spec.hops + 1) {
        best = { hops, target: b };
        expect(game.bus.count('fire.ignite')).toBe(0);
        break;
      }
    }
    expect(best).not.toBeNull();
    const hops = best!.hops;
    report.lightningChain = { target: best!.target.id, hops };
    expect(hops.map((h) => h.hop)).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(hops.map((h) => h.id)).size).toBe(5);
    for (let k = 1; k < hops.length; k++) expect(hops[k].damage).toBeCloseTo(hops[k - 1].damage * spec.falloff, 6);
    expect(hops[0].damage).toBe(spec.damage);
  });

  it('地割れは前へ195m 走る（裂け目14個）。湾の水の上に出たら、そこで止まる', () => {
    // r06-balance：地割れは照準のまわりで建物を多く裂く向きを選ぶ（tests/gameplay/balance.test.ts）。ここでは向きを選ばない設定で、
    // 走る長さと湾で止まることだけを確かめる
    const fissure = (x: number, z: number, yawDeg: number): Game => {
      const game = new Game(city, index, undefined, 'homuratsuno');
      const spec = CREATURE_CONFIG.homuratsuno.moves.special.ground;
      if (spec.kind !== 'fissure') throw new Error('焔角の E は地割れ');
      const straight = { ...spec.spec, seek: { ...spec.spec.seek, stepDeg: 0 } };
      game.combat.techniques.fissure(game.clock, vec3(x, game.groundAt(x, z), z), yawDeg * DEG, straight, game.world, 'homuratsuno');
      for (let i = 0; i < 120; i++) game.advanceWorld(DT);
      return game;
    };
    const land = fissure(-150, -20, 90);
    const toSea = fissure(city.coast.coastX + 60, -20, -90);
    report.fissure = { landCracks: land.bus.count('fissure.crack'), landLength: land.stats.fissureMaxLength, seaCracks: toSea.bus.count('fissure.crack'), seaLength: toSea.stats.fissureMaxLength };
    expect(land.bus.count('fissure.crack')).toBe(14);
    expect(land.stats.fissureMaxLength).toBeGreaterThan(194);
    expect(land.stats.fissureMaxLength).toBeLessThan(197);
    expect(toSea.bus.count('fissure.crack')).toBeLessThan(14);
    expect(toSea.bus.count('fissure.crack')).toBeGreaterThan(0);
  });

  it('大技（地割れ・落雷・咆哮・怒りの急降下）で壊した分は怒りがたまらない', () => {
    const score = new ScoreKeeper(city);
    for (const cause of ['fissure', 'roar', 'rageDive'] as const) score.onStage(10, 3, true, cause);
    expect(score.rage).toBe(0);
    score.onStage(10, 3, true, 'lightning');
    expect(score.rage).toBeGreaterThan(0);
  });

  it('紅竜の動きと技の表は、この周より前の表そのもの（見た目と動きを変えない）', () => {
    const k = CREATURE_CONFIG.kurenai;
    expect(k.motion.ground).toBe(LOCOMOTION.ground);
    expect(k.motion.air).toBe(LOCOMOTION.air);
    expect(k.motion.dive).toBe(LOCOMOTION.dive);
    expect(k.motion.landing).toBe(LOCOMOTION.landing);
    expect(k.body.bodyHeight).toBe(LOCOMOTION.bodyHeight);
    expect(k.moves.primary.kind).toBe('flame');
    expect(k.recordKey).toBe('kurenairyu');
  });
});

afterAll(() => {
  const out = process.env.R03_ROSTER_OUT;
  if (!out) return;
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ measured: new Date().toISOString(), ...report }, null, 2));
});
