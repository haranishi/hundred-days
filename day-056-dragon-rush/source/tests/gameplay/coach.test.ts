// OWNER: tests
// 最初の10秒（r02-controls）：始まりの照準が炎の届く高層ビルに乗っていること、案内が「動く → 炎 → 爪 → 飛ぶ → 満タンで E」の順に進むこと。
// r05-play（体験の採点 r04 の「案内の進み方」）：「飛ぶ」へ進むのは最初の崩落の後（爪で傾けたビルを離れて最初の崩落が遅れたため）。
// 主砲の段などを見せて COACH_PACE.skipSeconds たっても使わないとき、ほかの技でビルを崩せていれば次へ進む（焔角の礫の案内が2分残ったため）。
import { describe, expect, it } from 'vitest';
import { BREATH } from '../../src/config/attacks';
import { CITY_CONFIG } from '../../src/config/city';
import { COACH_PACE } from '../../src/config/controls';
import { LOCOMOTION } from '../../src/config/locomotion';
import { InputState } from '../../src/core/input';
import { COACH_ORDER, Coach, type CoachInput } from '../../src/gameplay/coach';
import { readControls } from '../../src/gameplay/controls';
import { Game } from '../../src/gameplay/game';
import { pressInput, releaseInput, type InputSink } from '../../src/harness/keys';
import { BasicPlaytest } from '../../src/harness/playtest';
import { generateCity } from '../../src/world/city';
import { CityIndex } from '../../src/world/query';

const city = generateCity(CITY_CONFIG);
const index = new CityIndex(city);
const DT = 1 / 60;

function run(game: Game, input: InputState, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.step(DT, readControls(input));
}

/** 照準の先の建物（無ければ、竜にいちばん近い高さ8m以上の建物）を、竜の攻撃で崩れるまで壊し、崩れきるまで進める。 */
function collapseOne(game: Game, input: InputState): number {
  const b = game.body.pos;
  const id =
    game.aim.building >= 0
      ? game.aim.building
      : [...city.buildings].filter((x) => x.height >= 8).sort((p, q) => Math.hypot(p.footprint.x0 - b.x, p.footprint.z0 - b.z) - Math.hypot(q.footprint.x0 - b.x, q.footprint.z0 - b.z))[0].id;
  game.damage.hit(id, game.damage.hp[id] * 1.5, { cause: 'claw', fromX: b.x, fromZ: b.z, y: 5, player: true });
  run(game, input, 2.0);
  return id;
}

const idle: CoachInput = { moving: false, breathing: false, clawed: false, climbing: false, rageFull: false, released: false, collapsed: false };

describe('始まりの位置と照準', () => {
  it('高さ70m前後から始まり、照準は炎の届く高層ビル（60m以上）に乗っている', () => {
    const game = new Game(city, index);
    expect(game.body.altitude).toBeGreaterThan(60);
    expect(game.body.altitude).toBeLessThan(80);
    expect(game.aim.building).toBeGreaterThanOrEqual(0);
    expect(city.buildings[game.aim.building].height).toBeGreaterThanOrEqual(LOCOMOTION.spawnAim.minHeight);
    expect(game.aim.distance).toBeLessThanOrEqual(BREATH.range);
    expect(game.aim.reach).toBe(true);
    // 竜は照準の方を向いて始まる
    expect(game.body.yaw).toBe(game.view.yaw);
  });

  it('始めてすぐ炎を吐けば、照準のビルが燃え始める', () => {
    const game = new Game(city, index);
    const input = new InputState();
    const target = game.aim.building;
    game.start();
    pressInput(input, 'left');
    run(game, input, 2.5);
    expect(game.combat.breathActive).toBe(true);
    expect(game.damage.damage[target]).toBeGreaterThan(0);
  });
});

describe('案内の順番', () => {
  it('動く → 炎 → 爪 → 飛ぶ → 満タンで E の順に、操作をしたら次へ進む。「飛ぶ」へは最初の崩落の後に進む', () => {
    const game = new Game(city, index);
    const input = new InputState();
    game.start();
    const seen: string[] = [game.coach.step];
    const note = (): void => {
      if (seen[seen.length - 1] !== game.coach.step) seen.push(game.coach.step);
    };
    expect(game.coach.visible(false)).toBe('move');
    pressInput(input, 'w');
    run(game, input, 0.8);
    releaseInput(input, 'w');
    note();
    pressInput(input, 'left');
    run(game, input, 1.4);
    releaseInput(input, 'left');
    note();
    // 空中で爪（当たらなくても振れば数える）。ただし、まだ何も崩れていないので「飛ぶ」へは進まない
    pressInput(input, 'right');
    run(game, input, 0.05);
    releaseInput(input, 'right');
    run(game, input, 0.5);
    expect(game.firstCollapseAt).toBeNull();
    expect(game.coach.step).toBe('claw');
    collapseOne(game, input);
    expect(game.firstCollapseAt).not.toBeNull();
    note();
    pressInput(input, 'space');
    run(game, input, 0.7);
    releaseInput(input, 'space');
    note();
    // 満タンになるまで E の段は出さない
    expect(game.coach.step).toBe('rage');
    expect(game.coach.visible(game.score.rageFull)).toBeNull();
    game.score.rage = 100;
    game.score.rageFull = true;
    expect(game.coach.visible(true)).toBe('rage');
    pressInput(input, 'e');
    run(game, input, 0.1);
    releaseInput(input, 'e');
    note();
    expect(seen).toEqual(['move', 'breath', 'claw', 'fly', 'rage', 'done']);
    expect(game.coach.visible(game.score.rageFull)).toBeNull();
  });

  it('順番より先にした操作も済んだことにする（先に炎を吐いたら、動いた後は爪の案内へ）。やり直しで最初に戻る', () => {
    const c = new Coach();
    c.update(1.5, { ...idle, breathing: true });
    expect(c.step).toBe('move');
    c.update(1, { ...idle, moving: true });
    expect(c.step).toBe('claw');
    expect(COACH_ORDER.indexOf(c.step)).toBe(2);
    // 大技は満タンの段より前に出しても済ませない
    c.update(1 / 60, { ...idle, released: true });
    c.update(1 / 60, { ...idle, clawed: true, collapsed: true });
    c.update(1, { ...idle, climbing: true, collapsed: true });
    expect(c.step).toBe('rage');
    c.reset();
    expect(c.step).toBe('move');
  });

  it('爪を振っただけでは「飛ぶ」へ進まない。最初の崩落の後に進む（先に崩れていれば、爪を振った瞬間に進む）', () => {
    const c = new Coach();
    c.update(1, { ...idle, moving: true });
    c.update(1.2, { ...idle, breathing: true });
    expect(c.step).toBe('claw');
    // 爪が当たってビルが傾いた（まだ崩れていない）
    c.update(1 / 60, { ...idle, clawed: true });
    c.update(3, idle);
    expect(c.step).toBe('claw');
    // 爪で崩した瞬間に「飛ぶ」へ
    c.update(1 / 60, { ...idle, collapsed: true });
    expect(c.step).toBe('fly');
    // 先に（炎で）崩れていれば、爪を振った瞬間に進む
    const d = new Coach();
    d.update(1, { ...idle, moving: true });
    d.update(1.2, { ...idle, breathing: true, collapsed: true });
    expect(d.step).toBe('claw');
    d.update(1 / 60, { ...idle, clawed: true, collapsed: true });
    expect(d.step).toBe('fly');
  });

  it(`主砲の段を見せて ${COACH_PACE.skipSeconds} 秒たっても使わないとき、ほかの技でビルを崩せていれば次へ進む。崩せていなければ残す`, () => {
    const c = new Coach();
    c.update(1, { ...idle, moving: true });
    expect(c.step).toBe('breath');
    // 崩せていない間は、いくら待っても主砲の段のまま
    for (let t = 0; t < 30; t += 0.5) c.update(0.5, idle);
    expect(c.step).toBe('breath');
    // 崩せた：主砲の段を見せてから skipSeconds たっているので、すぐ次へ（爪はもう振っていたので「飛ぶ」まで）
    c.update(1 / 60, { ...idle, clawed: true, collapsed: true });
    expect(c.step).toBe('fly');
    // 崩せてから段が替わったばかりの所では、skipSeconds 待つ
    const d = new Coach();
    d.update(1, { ...idle, moving: true, collapsed: true });
    expect(d.step).toBe('breath');
    d.update(COACH_PACE.skipSeconds - 0.5, { ...idle, collapsed: true });
    expect(d.step).toBe('breath');
    d.update(0.6, { ...idle, collapsed: true });
    expect(d.step).toBe('claw');
  });

  it('焔角で礫を投げずに突進と角で壊していくと、礫の案内は最初の崩落から skipSeconds 余りで消える', () => {
    const game = new Game(city, index, undefined, 'homuratsuno');
    const input = new InputState();
    // 自動プレイの操作から、左クリック（礫）だけを抜く
    const sink: InputSink = {
      injectKeyDown: (c) => input.injectKeyDown(c),
      injectKeyUp: (c) => input.injectKeyUp(c),
      injectButtonDown: (b) => {
        if (b !== 0) input.injectButtonDown(b);
      },
      injectButtonUp: (b) => input.injectButtonUp(b),
      injectMotion: (dx, dy) => input.injectMotion(dx, dy),
    };
    const bot = new BasicPlaytest();
    game.start();
    let breathFrom: number | null = null;
    let breathTo: number | null = null;
    for (let i = 0; i < Math.round(90 / DT); i++) {
      bot.update(DT, game, sink);
      game.step(DT, readControls(input));
      if (game.coach.step === 'breath' && breathFrom === null) breathFrom = game.clock;
      if (breathFrom !== null && breathTo === null && game.coach.step !== 'breath') breathTo = game.clock;
    }
    expect(game.bus.count('lava.launch')).toBe(0);
    expect(game.firstCollapseAt).not.toBeNull();
    expect(breathFrom).not.toBeNull();
    expect(breathTo, '礫の案内が90秒たっても残っている').not.toBeNull();
    expect(breathTo!).toBeLessThanOrEqual(Math.max(breathFrom! + COACH_PACE.skipSeconds, game.firstCollapseAt!) + 0.1);
  });
});
