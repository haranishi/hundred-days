import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, getLevel, levelId } from '../lib/levels.js';
import { LEVELS as HANDMADE_LEVELS } from '../lib/level-data.js';
import { walkToDoor, fixture } from './helpers.mjs';
import { createAutopilot } from '../lib/autopilot.js';
import { createState, step } from '../lib/physics.js';
test('20面の順序・空・風・記号と開始/戸口の一意性', () => {
  assert.deepEqual(LEVELS.map(l => l.rows), HANDMADE_LEVELS.map(l => l.rows));
  assert.equal(LEVELS.length, 20);
  LEVELS.forEach((l, i) => {
    assert.equal(getLevel(levelId(i)), l);
    assert.equal(l.rows.length, 12);
    assert.equal(l.world, Math.floor(i / 5) + 1);
    assert.equal(l.sky, l.world);
    assert.equal(l.wind, l.world === 3 ? 120 : 0);
    assert.ok(
      l.rows.every(
        r => r.length === l.rows[0].length && /^[.#=~^o*CDMPGRBFSJ%]+$/.test(r),
      ),
    );
    for (const c of ['P', 'G'])
      assert.equal([...l.rows.join('')].filter(t => t === c).length, 1);
  });
  assert.throws(() => getLevel('5-1'));
  assert.throws(() => getLevel('1-0'));
});
for (let i = 0; i < 20; i++)
  test(`${levelId(i)}: 敵・つらら込みの実データを自動操作して戸口へ到達`, () => {
    const result = walkToDoor(levelId(i));
    assert.equal(
      result.status,
      'clear',
      `${levelId(i)} x=${result.player.x} y=${result.player.y} cause=${JSON.stringify(result.telemetry)}`,
    );
    assert.equal(result.lives, 3, 'ミスせず到達');
  });

test('新メタデータの既定値と元の面データを分離する', () => {
  for (const [i, level] of LEVELS.entries()) {
    const original = HANDMADE_LEVELS[i];
    assert.equal(level.parTicks, original.parTicks ?? 2400);
    assert.deepEqual(level.secretMochi, original.secretMochi ?? null);
    assert.deepEqual(level.entityOptions, original.entityOptions ?? {});
    assert.ok(Array.isArray(level.routes.safe));
    assert.ok(Array.isArray(level.routes.reward));
  }
});

for (const type of ['R', 'B', 'J', '%']) {
  test(`safeは${type}を残した主路をちび・能力なしで通る`, () => {
    let s = fixture([[6, 10, type], [14, 10, type]]);
    const decide = createAutopilot(s.level, { mode: 'safe' });
    for (let tick = 0; tick < 1800 && s.status === 'playing'; tick++) {
      const before = structuredClone(s);
      const input = decide(s);
      assert.deepEqual(s, before);
      s = step(s, input);
      assert.equal(s.ability, null);
      assert.equal(s.stage, 0);
    }
    assert.equal(s.status, 'clear');
    assert.equal(s.runHits, 0);
  });
}

test('collectは上段の米俵へ跳び、safeと入力・収集結果が変わる', () => {
  const result = mode => {
    let s = fixture([[3, 9, '*']]);
    const decide = createAutopilot(s.level, { mode });
    const inputs = [];
    for (let tick = 0; tick < 1200 && s.status === 'playing'; tick++) {
      const input = decide(s);
      inputs.push(input);
      s = step(s, input);
    }
    return { s, inputs };
  };
  const safe = result('safe');
  const collect = result('collect');
  assert.equal(safe.s.status, 'clear');
  assert.equal(collect.s.status, 'clear');
  assert.equal(safe.s.collectedRice, 0);
  assert.equal(collect.s.collectedRice, 1);
  assert.notDeepEqual(safe.inputs, collect.inputs);
});

for (const original of LEVELS) {
  test(`${original.id}: F/Sを空白に置換した主路をsafeがミスなしで到達`, () => {
    const level = { ...original, rows: original.rows.map(row => row.replace(/[FS]/g, '.')) };
    let s = createState(level.id, { level });
    const decide = createAutopilot(level);
    for (let tick = 0; tick < 10800 && s.status === 'playing'; tick++) {
      s = step(s, decide(s));
      assert.equal(s.ability, null);
    }
    assert.equal(s.status, 'clear');
    assert.equal(s.runMisses, 0);
  });
}

for (const level of LEVELS) {
  test(`${level.id}: collectの実入力で報酬を狙い戸口へ到達`, t => {
    const result = walkToDoor(level.id, { mode: 'collect' });
    t.diagnostic(`${level.id}: 米俵${result.collectedRice}/6 任意餅${Number(result.secretCollected)}/1 到達=${result.status} tick=${result.tick}`);
    assert.equal(result.status, 'clear');
    assert.equal(result.clearResult.rice, result.collectedRice);
    assert.equal(result.clearResult.secret, result.secretCollected);
  });
}
