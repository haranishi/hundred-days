import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, getLevel, levelId } from '../lib/levels.js';
import { LEVELS as HANDMADE_LEVELS } from '../lib/level-data.js';
import { walkToDoor } from './helpers.mjs';
test('20面の順序・空・風・記号と開始/戸口の一意性', () => {
  assert.equal(LEVELS, HANDMADE_LEVELS);
  assert.equal(LEVELS.length, 20);
  LEVELS.forEach((l, i) => {
    assert.equal(getLevel(levelId(i)), l);
    assert.equal(l.rows.length, 12);
    assert.equal(l.world, Math.floor(i / 5) + 1);
    assert.equal(l.sky, l.world);
    assert.equal(l.wind, l.world === 3 ? 120 : 0);
    assert.ok(
      l.rows.every(
        r => r.length === l.rows[0].length && /^[.#=~^o*CDMPG]+$/.test(r),
      ),
    );
    for (const c of ['P', 'G'])
      assert.equal([...l.rows.join('')].filter(t => t === c).length, 1);
  });
  assert.throws(() => getLevel('5-1'));
  assert.throws(() => getLevel('1-0'));
});
for (let i = 0; i < 20; i++)
  test(`${levelId(i)}: 敵・つららを除いた地形を自動操作して戸口へ到達`, () => {
    const result = walkToDoor(levelId(i));
    assert.equal(
      result.status,
      'clear',
      `${levelId(i)} x=${result.player.x} y=${result.player.y}`,
    );
    assert.equal(result.lives, 3, 'ミスせず到達');
  });
