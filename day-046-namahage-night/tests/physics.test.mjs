import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../lib/levels.js';
import { createAutopilot } from '../lib/autopilot.js';
import { createState, step, advance, DT } from '../lib/physics.js';
import { fixture, run } from './helpers.mjs';
test('固定刻み・入力列の決定性と入力状態の非破壊', () => {
  const initial = fixture(),
    copy = structuredClone(initial);
  let a = initial,
    b = initial;
  for (let i = 0; i < 300; i++) {
    const input = { right: i < 150, jump: i % 60 < 35 };
    a = step(a, input);
    b = step(b, input);
  }
  assert.deepEqual(a, b);
  assert.deepEqual(initial, copy);
  const one = advance(initial, 1, { right: true });
  let chunks = { state: initial, remainder: 0 };
  for (let i = 0; i < 60; i++)
    chunks = advance(chunks.state, 1 / 60, { right: true }, chunks.remainder);
  assert.deepEqual(one.state, chunks.state);
  assert.equal(one.state.tick, 120);
});
test('=を下から抜け、下降時は上に着地', () => {
  let s = fixture([
    [5, 9, '='],
    [6, 9, '='],
  ]);
  Object.assign(s.player, { x: 82, y: 162 });
  let above = false,
    landed = false;
  for (let i = 0; i < 120; i++) {
    s = step(s, { jump: true });
    if (s.player.y + s.player.h <= 144) above = true;
    if (above && s.player.grounded && s.player.y + s.player.h === 144)
      landed = true;
  }
  assert.ok(above);
  assert.ok(landed);
});
test('氷の地上摩擦は1/4、空中は120', () => {
  const normal = fixture(),
    ice = fixture([[1, 11, '~']]);
  normal.player.vx = ice.player.vx = 80;
  assert.equal((80 - step(normal).player.vx) / (80 - step(ice).player.vx), 4);
  normal.player.grounded = false;
  normal.player.y = 60;
  assert.equal(step(normal).player.vx, 79);
});
test('ジャンプを離すと-120で打ち切る', () => {
  let s = step(fixture(), { jump: true });
  assert.equal(s.player.vy, -300 + 900 * DT);
  s = step(s, { jump: false });
  assert.equal(s.player.vy, -120 + 900 * DT);
});
test('なまはげの初速と荒鬼の二段ジャンプ', () => {
  let s = fixture([], { stage: 2 });
  s = step(s, { jump: true });
  assert.equal(s.player.vy, -330 + 900 * DT);
  s = step(s);
  s = step(s, { jump: true });
  assert.equal(s.player.jumps, 2);
  assert.equal(s.player.vy, -330 + 900 * DT);
  s = step(s);
  s = step(s, { jump: true });
  assert.equal(s.player.jumps, 2);
  assert.ok(s.player.vy > -120);
});
test('コヨーテ時間と着地前の先行入力', () => {
  let s = fixture();
  Object.assign(s.player, { y: 140, grounded: false, coyote: 0.04 });
  s = step(s, { jump: true });
  assert.ok(s.player.vy < 0);
  s = fixture();
  Object.assign(s.player, { y: 150, grounded: false, coyote: 0, vy: 150 });
  s = step(s, { jump: true });
  s = run(s, 8, { jump: true });
  assert.ok(s.player.vy < 0);
  assert.equal(s.player.jumps, 1);
});
test('敵を踏むと消え、反動は-220', () => {
  let s = fixture([[5, 10, 'D']]);
  Object.assign(s.player, {
    x: 82,
    y: 145,
    vy: 160,
    grounded: false,
    coyote: 0,
  });
  s = step(s);
  assert.equal(s.entities.find(e => e.type === 'D').alive, false);
  assert.equal(s.player.vy, -220);
  assert.ok(s.events.includes('stomp'));
});
test('被弾で段階低下・1.2秒無敵・ちびは残機減少', () => {
  for (const stage of [0, 1, 2]) {
    let s = fixture([[5, 10, 'D']], { stage });
    s.player.x = 80;
    s = step(s);
    if (stage) {
      assert.equal(s.stage, stage - 1);
      assert.equal(s.player.invincible, 1.2);
      assert.equal(step(s).stage, stage - 1);
    } else {
      assert.equal(s.lives, 2);
      assert.equal(s.status, 'dying');
      s = run(s, 95);
      assert.equal(s.status, 'dying');
      s = step(s);
      assert.equal(s.status, 'playing');
      assert.equal(s.player.x, 16);
    }
  }
});
test('落下は段階によらずミス、残機0で面選択用over', () => {
  let s = fixture([], { stage: 2, lives: 1 });
  s.player.y = 209;
  s = step(s);
  assert.equal(s.lives, 0);
  s = run(s, 96);
  assert.equal(s.status, 'over');
});
test('餅で進化、最大は得点、米俵20個で残機増', () => {
  for (const stage of [0, 1, 2]) {
    let s = fixture([[2, 10, 'o']], { stage });
    s.player.x = 32;
    s = step(s);
    assert.equal(s.stage, Math.min(2, stage + 1));
    assert.equal(s.mochi, 1);
    if (stage === 2) assert.equal(s.score, 100);
  }
  let s = fixture([[2, 10, '*']], { rice: 19 });
  s.player.x = 32;
  s = step(s);
  assert.equal(s.lives, 4);
  assert.equal(s.rice, 20);
});
test('戸口に触れるとclearになり更新が止まる', () => {
  let s = fixture();
  s.player.x = 352;
  s = step(s);
  assert.equal(s.status, 'clear');
  assert.equal(step(s), s);
});

test('F/Sは単一スロット、同種は規定時間へ戻り、取得tickには減らない', () => {
  let s = fixture([[2, 10, 'F'], [3, 10, 'S'], [4, 10, 'S']]);
  s.player.x = 32;
  s = step(s);
  assert.equal(s.ability, 'F');
  assert.equal(s.abilityTicks, 1440);
  assert.equal(s.stage, 0);
  assert.equal(s.score, 0);
  s = step(s);
  assert.equal(s.abilityTicks, 1439);
  s.player.x = 48;
  s = step(s);
  assert.equal(s.ability, 'S');
  assert.equal(s.abilityTicks, 960);
  s = run(s, 20);
  s.player.x = 64;
  s = step(s);
  assert.equal(s.abilityTicks, 960);
  assert.equal(s.entities.filter(e => 'FS'.includes(e.type) && e.alive).length, 0);
});

test('Fは保持中のみ下降48pxを0.3秒以上遅らせ、上昇や二段跳びを変えない', () => {
  const fallTime = (ability, jump) => {
    let s = fixture();
    s.ability = ability;
    s.abilityTicks = 1440;
    Object.assign(s.player, { y: 40, vy: 0, grounded: false, coyote: 0 });
    s.jumpHeld = true;
    let ticks = 0;
    while (s.player.y < 88 && ticks < 240) {
      s = step(s, { jump });
      ticks++;
    }
    return ticks;
  };
  const normal = fallTime(null, true);
  assert.ok(fallTime('F', true) - normal >= 36);
  assert.equal(fallTime('F', false), normal);
  let s = fixture([], { stage: 2 });
  s.ability = 'F';
  s.abilityTicks = 100;
  s = step(s, { jump: true });
  assert.equal(s.player.vy, -330 + 900 * DT);
  s = step(s);
  s = step(s, { jump: true });
  assert.equal(s.player.jumps, 2);
  assert.equal(s.player.vy, -330 + 900 * DT);
});

test('Sは同一1秒入力で30px以上遠く進み、摩擦と失効を切り替える', () => {
  const normal = fixture();
  let fast = fixture();
  fast.ability = 'S';
  fast.abilityTicks = 960;
  assert.ok(run(fast, 120, { right: true }).player.x - run(normal, 120, { right: true }).player.x >= 30);
  for (const ice of [false, true]) {
    let s = fixture(ice ? [[1, 11, '~']] : []);
    s.ability = 'S';
    s.abilityTicks = 1;
    s.player.vx = 150;
    s = step(s);
    assert.equal(s.player.vx, ice ? 147.5 : 140);
    assert.equal(s.abilityTicks, 0);
    s = step(s, { right: true });
    assert.equal(s.ability, null);
    assert.equal(s.player.vx, 110);
  }
});

test('Fの失効は次tickから通常重力、被弾無敵中は能力を失わない', () => {
  let s = fixture();
  s.ability = 'F';
  s.abilityTicks = 1;
  s.jumpHeld = true;
  Object.assign(s.player, { y: 40, vy: 20, grounded: false, coyote: 0 });
  s = step(s, { jump: true });
  assert.equal(s.player.vy, 22);
  s = step(s, { jump: true });
  assert.equal(s.player.vy, 29.5);
  for (const invincible of [0, 1]) {
    s = fixture([[5, 10, 'D']], { stage: 1 });
    Object.assign(s.player, { x: 80, invincible });
    s.ability = 'S';
    s.abilityTicks = 30;
    s = step(s);
    assert.equal(s.ability, invincible ? 'S' : null);
    assert.equal(s.runHits, invincible ? 0 : 1);
  }
});

test('雪台は先行入力より優先し、保持と解放で到達高さが変わる', () => {
  let s = fixture([[5, 9, 'J']]);
  Object.assign(s.player, { x: 82, y: 129, vy: 150, grounded: false, coyote: 0 });
  s = step(s, { jump: true });
  assert.equal(s.player.vy, -380);
  assert.equal(s.player.jumps, 1);
  assert.equal(s.player.buffer, 0);
  const minimum = jump => {
    let a = s;
    let top = a.player.y;
    for (let i = 0; i < 55; i++) {
      a = step(a, { jump });
      top = Math.min(top, a.player.y);
    }
    return top;
  };
  assert.ok(minimum(false) - minimum(true) > 60);
});

test('天井下の成長を2段階まで保留し、空間が空くと足元固定で適用する', () => {
  let s = fixture([[2, 10, 'o'], [3, 10, 'o'], [2, 9, '#'], [3, 9, '#']]);
  s.player.x = 32;
  s = step(s);
  assert.equal(s.stage, 0);
  assert.equal(s.pendingStage, 1);
  s.player.x = 48;
  s = step(s);
  assert.equal(s.pendingStage, 2);
  s.player.x = 80;
  s = step(s);
  assert.equal(s.stage, 2);
  assert.equal(s.pendingStage, null);
  assert.equal(s.player.y + s.player.h, 176);
  assert.equal(s.score, 200);
});

test('任意餅と米俵の加点、1UP、ミス巻戻し、累積時間と入口残機', () => {
  let s = fixture([[2, 10, '*'], [3, 10, 'o']], {
    rice: 19, score: 500, secretMochi: { col: 3, row: 10 },
  });
  for (const x of [32, 48]) {
    s.player.x = x;
    s = step(s);
  }
  assert.equal(s.attemptScore, 350);
  assert.equal(s.secretCollected, true);
  assert.equal(s.lives, 4);
  s.player.y = 209;
  s = step(s);
  const elapsed = s.elapsedTicks;
  assert.equal(s.lives, 2);
  assert.equal(s.score, 500);
  assert.equal(s.rice, 19);
  assert.equal(s.attemptScore, 0);
  s = run(s, 96);
  assert.equal(s.status, 'playing');
  assert.equal(s.elapsedTicks, elapsed + 96);
  assert.equal(s.stage, 0);
  assert.equal(s.runMisses, 1);
  assert.equal(s.entryLives, 3);
  assert.equal(s.entities.filter(e => 'o*'.includes(e.type) && e.alive).length, 2);
  s.player.y = 209;
  s = run(step(s), 96);
  assert.equal(s.lives, 1);
  assert.equal(s.runMisses, 2);
});

test('連続踏みは倍率3で頭打ち、退場は24tickだけ、着地で解除', () => {
  let s = fixture([[5, 10, 'D'], [8, 10, 'R'], [11, 10, 'B'], [14, 10, 'D']]);
  let expected = 0;
  for (const [index, id] of s.entities.filter(e => 'DRB'.includes(e.type)).map(e => e.id).entries()) {
    const e = s.entities.find(e => e.id === id);
    Object.assign(s.player, { x: e.x + 2, y: e.y - s.player.h - 1, vy: 160, grounded: false, coyote: 0 });
    s = step(s);
    expected += (e.type === 'B' ? 150 : 100) * Math.min(index + 1, 3);
    assert.equal(s.score, expected);
    assert.equal(s.entities.find(e => e.id === id).retireTicks, 24);
  }
  s.player.x = 20;
  s = run(s, 100);
  assert.equal(s.combo, 0);
  assert.ok(s.entities.filter(e => !e.alive).every(e => e.retireTicks === 0));
});

test('収集→被弾→戸口の順で処理し、死亡tickはclearにならない', () => {
  let s = fixture([[21, 10, 'R'], [20, 10, 'F']]);
  const r = s.entities.find(e => e.type === 'R');
  r.x = 352;
  s.player.x = 352;
  s = step(s);
  assert.equal(s.status, 'dying');
  assert.equal(s.clearResult, null);
  assert.equal(s.runHits, 1);
});

test('結果は面内得点と3お札を一度だけ確定する', () => {
  let s = fixture([], { score: 1000 });
  s.collectedRice = 6;
  s.secretCollected = true;
  s.player.x = 352;
  s = step(s);
  assert.deepEqual(s.clearResult, {
    ticks: 1, score: 1290, rice: 6, secret: true, hits: 0, misses: 0, seals: 7,
  });
  assert.equal(s.score, 2290);
  assert.equal(step(s), s);
});

test('新機構を含む同一入力列で敵位相・取得済み・タイマーの全状態が一致', () => {
  const initial = fixture([[3, 10, 'F'], [6, 10, 'R'], [9, 9, '%'], [12, 10, 'B'], [15, 10, 'S'], [18, 10, 'J']]);
  let a = initial;
  let b = structuredClone(initial);
  for (let tick = 0; tick < 1800; tick++) {
    const input = { right: tick % 240 < 180, jump: tick % 80 < 50 };
    a = step(a, input);
    b = step(b, input);
    assert.deepEqual(a, b);
  }
});

test('敵より下降量が小さい接触は踏みにならず、上昇中の接触も被弾する', () => {
  let s = fixture([[5, 8, 'R']], { stage: 1 });
  const r = s.entities.find(e => e.type === 'R');
  Object.assign(r, { activated: true, phase: 'moving', vy: 100, originY: 160 });
  Object.assign(s.player, { x: 82, y: 109, vy: 1, grounded: false, coyote: 0 });
  s = step(s);
  assert.equal(s.entities.find(e => e.type === 'R').alive, true);
  assert.equal(s.runHits, 1);
  assert.equal(s.combo, 0);
  s = fixture([[5, 8, 'R']], { stage: 1 });
  Object.assign(s.player, { x: 82, y: 140, vy: -100, grounded: false, coyote: 0 });
  s = step(s, { jump: true });
  assert.equal(s.runHits, 1);
});

test('同tickの複数接触でも被弾は1回、保留成長は被弾で破棄', () => {
  let s = fixture([[5, 10, 'D'], [6, 10, 'B'], [5, 9, '#']], { stage: 1 });
  for (const e of s.entities.filter(e => 'DB'.includes(e.type))) e.x = 80;
  Object.assign(s.player, { x: 80, y: 160, h: 14 });
  s.pendingStage = 2;
  s = step(s);
  assert.equal(s.runHits, 1);
  assert.equal(s.pendingStage, null);
});

// 操作を再計算せず、走行1で記録した入力だけを走行2へ渡す。
for (const level of LEVELS) {
  test(`${level.id}: 固定入力再生の全tick・telemetryを含む全状態が一致`, () => {
    let first = createState(level.id);
    const decide = createAutopilot(level);
    const recording = [];
    for (let tick = 0; tick < 10800 && first.status === 'playing'; tick++) {
      const input = { ...decide(first) };
      first = step(first, input);
      recording.push({ input, state: JSON.stringify(first) });
    }
    assert.equal(first.status, 'clear');
    let replay = createState(level.id);
    for (const [tick, frame] of recording.entries()) {
      replay = step(replay, frame.input);
      assert.equal(JSON.stringify(replay), frame.state, `tick=${tick + 1}`);
    }
    assert.equal(replay.runMisses, 0);
  });
}

test('1-1のsafeは最初のうさぎを10秒以内に踏み、餅・米俵・到達も成立', () => {
  let s = createState('1-1');
  const rabbit = s.entities.find(e => e.type === 'R');
  const decide = createAutopilot(s.level);
  const events = [];
  for (let tick = 0; tick < 2400 && s.status === 'playing'; tick++) {
    s = step(s, decide(s));
    events.push(...s.telemetry);
  }
  const stomp = events.find(e => e.type === 'stomp' && e.entityId === rabbit.id);
  assert.ok(stomp && stomp.tick <= 1200);
  for (const kind of ['rice', 'mochi']) {
    assert.ok(events.some(e => e.type === 'collect' && e.kind === kind && e.tick <= 1200));
  }
  assert.equal(s.status, 'clear');
  assert.equal(s.runMisses, 0);
});

for (const [type, cause] of [['D', 'ground'], ['C', 'air'], ['^', 'icicle'], ['R', 'rabbit'], ['B', 'boar']]) {
  test(`${cause}: hitとmissの原因・IDを記録し96tick後に復帰`, () => {
    for (let repeat = 0; repeat < 3; repeat++) {
      let s = fixture([[5, 10, type]]);
      s.player.x = 80;
      s = step(s);
      for (const event of ['hit', 'miss']) {
        const logged = s.telemetry.find(e => e.type === event);
        assert.equal(logged.cause, cause);
        assert.equal(logged.entityId, s.entities.find(e => e.type === type).id);
        assert.equal(logged.tick, 1);
      }
      assert.equal(run(s, 95).status, 'dying');
      const revived = run(s, 96);
      assert.equal(revived.status, 'playing');
      assert.equal(revived.elapsedTicks, 97);
      assert.equal(revived.lives, 2);
    }
  });
}

test('fallの3ミスは原因と巻戻し・96tick復帰を記録する', () => {
  for (let repeat = 0; repeat < 3; repeat++) {
    let s = fixture([[2, 10, '*'], [3, 10, 'F']]);
    s.player.x = 32;
    s = step(s);
    s.player.x = 48;
    s = step(s);
    s.player.y = 209;
    s = step(s);
    assert.equal(s.telemetry.find(e => e.type === 'miss').cause, 'fall');
    const elapsed = s.elapsedTicks;
    s = run(s, 96);
    assert.equal(s.status, 'playing');
    assert.equal(s.elapsedTicks, elapsed + 96);
    assert.equal(s.ability, null);
    assert.equal(s.attemptScore, 0);
    assert.equal(s.collectedRice, 0);
    assert.equal(s.lives, 2);
  }
});

test('能力の取得・更新・置換・失効・被弾消失をkindで区別する', () => {
  let s = fixture([[2, 10, 'F'], [3, 10, 'F'], [4, 10, 'S'], [6, 10, 'D']], { stage: 1 });
  for (const [x, kind] of [[32, 'acquire'], [48, 'refresh'], [64, 'replace']]) {
    s.player.x = x;
    s = step(s);
    assert.equal(s.telemetry.find(e => e.type === 'ability').kind, kind);
  }
  let expired = { ...s, abilityTicks: 0 };
  expired = step(expired);
  assert.equal(expired.telemetry.find(e => e.type === 'ability').kind, 'expired');
  s.player.x = 96;
  s = step(s);
  assert.equal(s.telemetry.find(e => e.type === 'ability').kind, 'hit');
});
