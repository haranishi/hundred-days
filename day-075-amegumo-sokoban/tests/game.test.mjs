import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, move } from '../lib/game.js';
import { LEVELS, SOLUTIONS } from '../lib/levels.js';
import {solveLevel} from '../tools/solve-levels.mjs';

const fixture = (overrides = {}) => ({
  id: 'fixture',
  grid: ['######', '#....#', '#....#', '#....#', '#....#', '######'],
  player: { x: 1, y: 2 },
  clouds: [{ x: 2, y: 2, drops: 3 }],
  plots: [{ x: 3, y: 2, need: 1 }, { x: 1, y: 1, need: 1 }],
  ...overrides,
});
function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}
function replay(level, directions) {
  let state = createState(level);
  let result;
  for (const direction of directions) {
    result = move(level, state, direction);
    assert.equal(result.moved, true, `Blocked step: ${direction}`);
    state = result.state;
  }
  return result;
}
function shortestLength(level) {
  const result=solveLevel(level);
  assert.equal(result.status,'solved',level.id+': '+result.status);
  return result.solution.length;
}

test('all authored gardens have reproducible shortest solutions and conserve rain', async (t) => {
  assert.equal(LEVELS.length, 20);
  assert.equal(new Set(LEVELS.map((level) => level.id)).size, 20);
  for (const original of LEVELS) {
    await t.test(original.id, () => {
      const level = freezeDeep(structuredClone(original));
      let state = createState(level);
      const totalRain = level.clouds.reduce((sum, cloud) => sum + cloud.drops, 0) + (level.dew?.length||0);
      for (const direction of SOLUTIONS[level.id]) {
        const previous = freezeDeep(state);
        const result = move(level, previous, direction);
        assert.equal(result.moved, true);
        state = result.state;
        assert.equal(state.moves, previous.moves + 1);
        assert.equal(state.clouds.reduce((sum, cloud) => sum + cloud.drops, 0) +
          state.water.reduce((sum, water) => sum + water, 0) + state.collected.filter(used=>!used).length, totalRain);
        assert.ok(state.water.every((water, index) => water <= level.plots[index].need));
        assert.ok(state.clouds.every((cloud) => cloud.drops >= 0 && level.grid[cloud.y][cloud.x] === '.'));
        assert.ok(!state.clouds.some((cloud) => cloud.x === state.player.x && cloud.y === state.player.y));
      }
      assert.equal(state.won, true);
      assert.deepEqual(state.water, level.plots.map((plot) => plot.need));
      assert.equal(state.moves, level.par);
      assert.equal(shortestLength(level), level.par);
    });
  }
});

test('initial state is detached from level data and does not rain automatically', () => {
  const level = fixture({ clouds: [{ x: 3, y: 2, drops: 2 }] });
  const state = createState(level);
  assert.deepEqual(state.water, [0, 0]);
  assert.equal(state.won, false);
  state.player.x = 4;
  state.clouds[0].drops = 0;
  assert.equal(level.player.x, 1);
  assert.equal(level.clouds[0].drops, 2);
});

test('walking and pushing on paths consume no rain and count one step', () => {
  const level = fixture({ plots: [{ x: 4, y: 4, need: 1 }] });
  const initial = freezeDeep(createState(level));
  const walking = move(level, initial, 'down');
  assert.equal(walking.moved, true);
  assert.equal(walking.pushed, false);
  assert.equal(walking.rained, false);
  assert.equal(walking.state.moves, 1);
  const pushing = move(level, initial, 'right');
  assert.equal(pushing.pushed, true);
  assert.equal(pushing.rained, false);
  assert.equal(pushing.reason, null);
  assert.equal(pushing.state.clouds[0].drops, 3);
  assert.deepEqual(initial, createState(level));
});

test('only a cloud entering a plot gives exactly one drop', () => {
  const level = fixture();
  const first = move(level, freezeDeep(createState(level)), 'right');
  assert.equal(first.rained, true);
  assert.deepEqual(first.state.water, [1, 0]);
  assert.equal(first.state.clouds[0].drops, 2);
  assert.equal(first.state.won, false);
  const leaving = replay(level, ['right', 'up', 'right', 'down']);
  assert.equal(leaving.rained, false);
  assert.deepEqual(leaving.state.water, [1, 0]);
  assert.equal(leaving.state.clouds[0].drops, 2);
});

test('a second entry can overwater a plot and never counts as completion', () => {
  const result = replay(fixture(), SOLUTIONS['return-rain']);
  assert.equal(result.rained, true);
  assert.equal(result.reason, 'overwatered');
  assert.deepEqual(result.state.water, [2, 0]);
  assert.equal(result.state.clouds[0].drops, 1);
  assert.equal(result.state.won, false);
});

test('empty clouds can enter plots without adding water', () => {
  const level = fixture({ clouds: [{ x: 2, y: 2, drops: 0 }] });
  const result = move(level, createState(level), 'right');
  assert.equal(result.moved, true);
  assert.equal(result.pushed, true);
  assert.equal(result.rained, false);
  assert.deepEqual(result.state.clouds[0], { x: 3, y: 2, drops: 0 });
  assert.deepEqual(result.state.water, [0, 0]);
  assert.equal(result.state.won, false);
});

test('walls, the edge, and another cloud reject moves without changing state', async (t) => {
  const cases = [
    ['walk into a wall', fixture({ player: { x: 1, y: 1 } }), 'up', 'wall'],
    ['push into a wall', fixture({ player: { x: 2, y: 1 }, clouds: [{ x: 1, y: 1, drops: 1 }] }), 'left', 'wall'],
    ['push two clouds', fixture({ clouds: [{ x: 2, y: 2, drops: 2 }, { x: 3, y: 2, drops: 1 }] }), 'right', 'cloud'],
    ['walk outside an open edge', fixture({ grid: Array(6).fill('......'), player: { x: 0, y: 0 } }), 'left', 'wall'],
    ['push outside an open edge', fixture({ grid: Array(6).fill('......'), player: { x: 1, y: 2 }, clouds: [{ x: 0, y: 2, drops: 1 }] }), 'left', 'wall'],
  ];
  for (const [name, level, direction, reason] of cases) {
    await t.test(name, () => {
      const state = freezeDeep(createState(level));
      assert.deepEqual(move(level, state, direction), {
        state, moved: false, pushed: false, rained: false, reason,
      });
      assert.equal(move(level, state, direction).state, state);
    });
  }
});

test('invalid directions including prototype property names are harmless', () => {
  const level = fixture();
  const state = freezeDeep(createState(level));
  for (const direction of ['north', 'constructor', '__proto__', undefined, null, ['right']]) {
    const result = move(level, state, direction);
    assert.equal(result.reason, 'invalid-direction');
    assert.equal(result.state, state);
    assert.equal(result.moved, false);
  }
});

test('completion requires every plot exactly and prevents further movement', () => {
  const level = LEVELS[0];
  const result = replay(level, SOLUTIONS[level.id]);
  const won = freezeDeep(result.state);
  assert.equal(won.won, true);
  assert.deepEqual(move(level, won, 'down'), {
    state: won, moved: false, pushed: false, rained: false, reason: 'won',
  });
  assert.throws(() => move(LEVELS[1], won, 'up'), TypeError);
});

test('malformed grids, collisions, and invalid rain quantities are rejected', async (t) => {
  const cases = [
    ['missing id', (level) => { level.id = ''; }],
    ['short grid', (level) => { level.grid.pop(); }],
    ['short row', (level) => { level.grid[1] = '#...#'; }],
    ['unknown tile', (level) => { level.grid[1] = '#..?.#'; }],
    ['sparse grid', (level) => { delete level.grid[4]; }],
    ['player on rock', (level) => { level.player = { x: 0, y: 0 }; }],
    ['fractional player', (level) => { level.player.x = 1.5; }],
    ['cloud on player', (level) => { level.clouds[0].x = 1; }],
    ['colliding clouds', (level) => { level.clouds.push({ ...level.clouds[0] }); }],
    ['cloud outside', (level) => { level.clouds[0].x = 6; }],
    ['no clouds', (level) => { level.clouds = []; }],
    ['no plots', (level) => { level.plots = []; }],
    ['plot on rock', (level) => { level.plots[0].x = 0; }],
    ['colliding plots', (level) => { level.plots.push({ ...level.plots[0] }); }],
  ];
  for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    cases.push([`invalid drops ${String(value)}`, (level) => { level.clouds[0].drops = value; }]);
    cases.push([`invalid need ${String(value)}`, (level) => { level.plots[0].need = value; }]);
  }
  cases.push(['zero need', (level) => { level.plots[0].need = 0; }]);
  for (const [name, change] of cases) {
    await t.test(name, () => {
      const level = fixture();
      change(level);
      assert.throws(() => createState(level), TypeError);
    });
  }
});
