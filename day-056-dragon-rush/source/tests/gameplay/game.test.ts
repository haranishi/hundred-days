// OWNER: tests
// 遊びの本体を描画なしで回す：自動プレイ（basic）で3分を通し、崩落・出来事・時間切れ・やり直しを確かめる。
// 描画の速さに関係なく、同じ入力の列なら同じ結果になること（決定性）も確かめる。
import { describe, expect, it } from 'vitest';
import { CITY_CONFIG } from '../../src/config/city';
import { SESSION } from '../../src/config/gameplay';
import { LOCOMOTION } from '../../src/config/locomotion';
import { InputState } from '../../src/core/input';
import { GAME_EVENT_TYPES } from '../../src/core/events';
import { readControls } from '../../src/gameplay/controls';
import { Game } from '../../src/gameplay/game';
import { BasicPlaytest, ScriptPlaytest, type Playtest } from '../../src/harness/playtest';
import { generateCity } from '../../src/world/city';
import { CityIndex } from '../../src/world/query';

const city = generateCity(CITY_CONFIG);
const index = new CityIndex(city);
const DT = 1 / 60;

function play(bot: Playtest, seconds: number, game = new Game(city, index)): Game {
  const input = new InputState();
  game.start();
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    bot.update(DT, game, input);
    game.step(DT, readControls(input));
  }
  return game;
}

/** 結果が出るまで回す（r02-controls：3分はゲーム内時刻で数えるので、ヒットストップの分だけ実時間の刻みが多く要る）。 */
function playToEnd(bot: Playtest, game = new Game(city, index)): Game {
  const input = new InputState();
  game.start();
  for (let i = 0; i < Math.round((SESSION.durationSeconds + 30) / DT) && game.session.phase !== 'result'; i++) {
    bot.update(DT, game, input);
    game.step(DT, readControls(input));
  }
  for (let i = 0; i < 60; i++) game.step(DT, readControls(input));
  return game;
}

describe('自動プレイ（描画なし）', () => {
  const game = playToEnd(new BasicPlaytest());

  it('3分で結果の段階へ移り、session.end が1回出る', () => {
    expect(game.session.phase).toBe('result');
    expect(game.bus.count('session.end')).toBe(1);
    expect(game.session.timeLeft).toBe(0);
  });

  it('結果はゲーム内時刻の180.0秒で出る（残り時間とゲーム内時刻が同じ時計。バグ B2）', () => {
    expect(game.endedAt).not.toBeNull();
    expect(Math.abs(game.endedAt! - SESSION.durationSeconds)).toBeLessThan(0.02);
    const end = game.bus.recent.find((e) => e.type === 'session.end');
    if (end) expect(Math.abs(end.t - SESSION.durationSeconds)).toBeLessThan(0.02);
  });

  it('建物が1棟以上崩れ、最初の崩落は40秒以内', () => {
    expect(game.bus.count('building.collapse')).toBeGreaterThan(0);
    expect(game.firstCollapseAt).not.toBeNull();
    expect(game.firstCollapseAt!).toBeLessThan(40);
    expect(game.score.yen).toBeGreaterThan(0);
    expect(game.score.destruction).toBeGreaterThan(0.005);
    expect(game.score.maxCombo).toBeGreaterThan(3);
  });

  it('ブリーフの表の出来事が、UI 以外すべて出ている', () => {
    const missing = GAME_EVENT_TYPES.filter((t) => t !== 'ui.click' && game.bus.count(t) === 0);
    expect(missing).toEqual([]);
    for (const e of game.bus.recent) expect(Number.isFinite(e.t)).toBe(true);
  });

  it('同じ操作の列なら、同じ結果になる', () => {
    const again = playToEnd(new BasicPlaytest());
    expect(again.score.yen).toBe(game.score.yen);
    expect(again.firstCollapseAt).toBe(game.firstCollapseAt);
    expect(again.bus.counts()).toEqual(game.bus.counts());
  });
});

describe('やり直し', () => {
  it('R で街・点数・竜・時間が最初に戻り、すぐ遊べる', () => {
    const game = play(new BasicPlaytest(), 40);
    expect(game.damage.tally().intact).toBeLessThan(city.buildings.length);
    game.restart();
    expect(game.session.phase).toBe('playing');
    expect(game.session.elapsed).toBe(0);
    expect(game.clock).toBe(0);
    expect(game.score.yen).toBe(0);
    expect(game.score.combo).toBe(0);
    expect(game.score.rage).toBe(0);
    expect(game.damage.tally().intact).toBe(city.buildings.length);
    expect(game.fire.burning.size).toBe(0);
    expect(game.body.pos).toEqual({ x: LOCOMOTION.spawn.x, y: LOCOMOTION.spawn.y, z: LOCOMOTION.spawn.z });
    expect(game.body.yaw).toBe(game.spawn.yaw);
    expect(game.view).toEqual(game.spawnView);
    expect(game.coach.step).toBe('move');
    expect(game.endedAt).toBeNull();
    expect(game.bus.count('session.start')).toBe(1);
  });
});

describe('一時停止', () => {
  it('一時停止の間は時間も街も進まない', () => {
    const game = play(new BasicPlaytest(), 12);
    game.pause();
    const t = game.clock;
    const elapsed = game.session.elapsed;
    const input = new InputState();
    for (let i = 0; i < 300; i++) game.step(DT, readControls(input));
    expect(game.clock).toBe(t);
    expect(game.session.elapsed).toBe(elapsed);
    game.resume();
    game.step(DT, readControls(input));
    expect(game.clock).toBeGreaterThan(t);
  });
});

describe('操作と竜の動き', () => {
  it('地上では瞬間に最高速にならず、加速して歩く', () => {
    const game = new Game(city, index);
    const input = new InputState();
    // 着地してから W で歩く
    const script = new ScriptPlaytest([
      { at: 0, do: 'press', key: 'shift' },
      { at: 4, do: 'release', key: 'shift' },
      { at: 6, do: 'press', key: 'w' },
    ]);
    game.start();
    const speeds: number[] = [];
    for (let i = 0; i < 60 * 9; i++) {
      script.update(DT, game, input);
      game.step(DT, readControls(input));
      if (i >= 60 * 6) speeds.push(game.body.speed);
    }
    expect(game.body.grounded).toBe(true);
    expect(speeds[3]).toBeLessThan(LOCOMOTION.ground.walkSpeed * 0.2);
    expect(speeds[speeds.length - 1]).toBeCloseTo(LOCOMOTION.ground.walkSpeed, 1);
    expect(game.bus.count('dragon.step')).toBeGreaterThan(4);
  });

  it('急降下で着地すると、ふつうの着地より衝撃が大きい', () => {
    const glide = play(new ScriptPlaytest([]), 40);
    const dive = play(new ScriptPlaytest([{ at: 0, do: 'press', key: 'shift' }]), 6);
    const land = (g: Game) => g.bus.recent.find((e) => e.type === 'dragon.land') as { impact: number; dive: boolean } | undefined;
    expect(land(glide)).toBeDefined();
    expect(land(dive)).toBeDefined();
    expect(land(dive)!.dive).toBe(true);
    expect(land(dive)!.impact).toBeGreaterThan(land(glide)!.impact * 3);
  });
});
