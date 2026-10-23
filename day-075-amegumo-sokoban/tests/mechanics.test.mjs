import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, move } from '../lib/game.js';

const fixture = (overrides = {}) => ({
  id: 'mechanics',
  grid: ['######', '#....#', '#....#', '#....#', '#....#', '######'],
  player: { x: 1, y: 2 },
  clouds: [{ x: 2, y: 2, drops: 0 }],
  plots: [{ x: 4, y: 4, need: 1 }],
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
  for (const direction of directions) {
    const result = move(level, freezeDeep(state), direction);
    assert.equal(result.moved, true, `Blocked ${direction}: ${result.reason}`);
    assert.equal(result.state.moves, state.moves + 1);
    state = result.state;
  }
  return state;
}
function expectBlocked(level, direction, reason) {
  const state = freezeDeep(createState(freezeDeep(level)));
  assert.deepEqual(move(level, state, direction), {
    state, moved: false, pushed: false, rained: false, reason,
  });
  assert.equal(move(level, state, direction).state, state);
}

test('optional mechanics preserve ordinary movement and detach collection state', () => {
  const level = freezeDeep(fixture());
  const state = freezeDeep(createState(level));
  assert.deepEqual(state.collected, []);
  const result = move(level, state, 'down');
  assert.equal(result.moved, true);
  assert.deepEqual(result.state.collected, []);
  assert.notEqual(result.state.collected, state.collected);
});

test('ledges permit forward cloud pushes and reject only reverse pushes', () => {
  const ledges = [{ from: { x: 2, y: 2 }, to: { x: 3, y: 2 } }];
  const forward = replay(fixture({ ledges }), ['right']);
  assert.deepEqual(forward.clouds[0], { x: 3, y: 2, drops: 0 });
  expectBlocked(fixture({ ledges, player: { x: 4, y: 2 },
    clouds: [{ x: 3, y: 2, drops: 0 }] }), 'left', 'ledge');
  for (const [player, direction, expected] of [
    [{ x: 2, y: 2 }, 'right', { x: 3, y: 2 }],
    [{ x: 3, y: 2 }, 'left', { x: 2, y: 2 }],
  ]) {
    const walking = replay(fixture({ ledges, player, clouds: [{ x: 4, y: 3, drops: 0 }] }), [direction]);
    assert.deepEqual(walking.player, expected);
  }
  const ordinary = replay(fixture({ ledges }), ['down', 'right', 'up']);
  assert.deepEqual(ordinary.clouds[0], { x: 2, y: 1, drops: 0 });
});

test('a portal moves only the pushed cloud once and charges one step', () => {
  const level = freezeDeep(fixture({ portals: [{ x: 3, y: 2 }, { x: 1, y: 4, label: 'B', drops: 99 }] }));
  const before = freezeDeep(createState(level));
  const result = move(level, before, 'right');
  assert.equal(result.moved, true);
  assert.equal(result.pushed, true);
  assert.equal(result.rained, false);
  assert.equal(result.state.moves, 1);
  assert.deepEqual(result.state.player, { x: 2, y: 2 });
  assert.deepEqual(result.state.clouds[0], { x: 1, y: 4, drops: 0 });
  assert.notEqual(result.state.clouds[0], level.portals[1]);
  assert.deepEqual(before, createState(level));
});

test('gardeners cross portals and dew as ordinary floor without collecting', () => {
  const level = fixture({ player: { x: 2, y: 2 }, clouds: [{ x: 4, y: 3, drops: 0 }],
    portals: [{ x: 3, y: 2 }, { x: 1, y: 4 }], dew: [{ x: 3, y: 3 }] });
  const state = replay(level, ['right', 'down']);
  assert.deepEqual(state.player, { x: 3, y: 3 });
  assert.deepEqual(state.collected, [false]);
  assert.equal(state.clouds[0].drops, 0);
});

test('portal exit collisions cancel the entire push without changing state', () => {
  expectBlocked(fixture({ portals: [{ x: 3, y: 2 }, { x: 1, y: 4 }],
    clouds: [{ x: 2, y: 2, drops: 0 }, { x: 1, y: 4, drops: 1 }] }), 'right', 'portal-blocked');
  expectBlocked(fixture({ portals: [{ x: 3, y: 2 }, { x: 2, y: 2 }] }), 'right', 'portal-blocked');
  expectBlocked(fixture({ portals: [{ x: 3, y: 2 }, { x: 1, y: 4 }],
    clouds: [{ x: 2, y: 2, drops: 0 }, { x: 3, y: 2, drops: 1 }] }), 'right', 'cloud');
});

test('a portal may use the vacated gardener tile and ledges check the entry edge', () => {
  const state = replay(fixture({ portals: [{ x: 3, y: 2 }, { x: 1, y: 2 }] }), ['right']);
  assert.deepEqual(state.clouds[0], { x: 1, y: 2, drops: 0 });
  expectBlocked(fixture({ portals: [{ x: 3, y: 2 }, { x: 1, y: 4 }],
    ledges: [{ from: { x: 3, y: 2 }, to: { x: 2, y: 2 } }] }), 'right', 'ledge');
});

test('initial portal placement does not teleport and a cloud can leave normally', () => {
  const level = fixture({ portals: [{ x: 2, y: 2 }, { x: 1, y: 4 }] });
  const initial = createState(level);
  assert.deepEqual(initial.clouds[0], level.clouds[0]);
  const after = replay(level, ['right']);
  assert.deepEqual(after.clouds[0], { x: 3, y: 2, drops: 0 });
});

test('dew replenishes an empty cloud once across re-entry and is conserved as rain', () => {
  const level = freezeDeep(fixture({ dew: [{ x: 3, y: 2 }], plots: [{ x: 4, y: 2, need: 1 }] }));
  let state = createState(level);
  assert.deepEqual(state.collected, [false]);
  const directions = ['right', 'up', 'right', 'right', 'down', 'left', 'up', 'left', 'left', 'down', 'right', 'right'];
  for (const direction of directions) {
    const before = freezeDeep(state);
    const result = move(level, before, direction);
    assert.equal(result.moved, true);
    state = result.state;
    assert.notEqual(state.collected, before.collected);
    assert.equal(state.clouds.reduce((sum, cloud) => sum + cloud.drops, 0) +
      state.water.reduce((sum, water) => sum + water, 0), state.collected.filter(Boolean).length);
  }
  assert.deepEqual(state.collected, [true]);
  assert.equal(state.clouds[0].drops, 0);
  assert.deepEqual(state.water, [1]);
  assert.equal(state.won, true);
});

test('dew belongs to its tile and cannot be collected again by another cloud', () => {
  const level = fixture({ dew: [{ x: 3, y: 2 }],
    clouds: [{ x: 2, y: 2, drops: 0 }, { x: 3, y: 3, drops: 0 }] });
  const state = replay(level, ['right', 'right', 'left', 'down', 'down', 'right', 'up']);
  assert.deepEqual(state.collected, [true]);
  assert.deepEqual(state.clouds, [{ x: 4, y: 2, drops: 1 }, { x: 3, y: 2, drops: 0 }]);
});

test('history restores every field across ledges, portals, dew, rain, and completion', () => {
  const cases = [
    [fixture({ ledges: [{ from: { x: 2, y: 2 }, to: { x: 3, y: 2 } }],
      dew: [{ x: 3, y: 2 }], plots: [{ x: 4, y: 2, need: 1 }] }), ['right', 'right']],
    [fixture({ portals: [{ x: 3, y: 2 }, { x: 3, y: 3 }],
      plots: [{ x: 4, y: 3, need: 1 }], clouds: [{ x: 2, y: 2, drops: 1 }] }),
      ['right', 'down', 'right']],
  ];
  for (const [level, directions] of cases) {
    const initial = createState(level);
    let state = initial;
    const history = [];
    const snapshots = [];
    for (const direction of directions) {
      snapshots.push(structuredClone(state));
      history.push(freezeDeep(state));
      const result = move(level, state, direction);
      assert.equal(result.moved, true);
      state = result.state;
    }
    assert.equal(state.won, true);
    while (history.length) {
      state = history.pop();
      assert.deepEqual(state, snapshots.pop());
    }
    assert.deepEqual(state, initial);
    assert.deepEqual(createState(level), initial);
  }
});

test('malformed mechanics and overlapping special floors are rejected', async (t) => {
  const edge = { from: { x: 2, y: 2 }, to: { x: 3, y: 2 } };
  const cases = [
    ['null ledges', { ledges: null }],
    ['nonarray dew', { dew: {} }],
    ['null portals', { portals: null }],
    ['unpaired portal', { portals: [{ x: 3, y: 2 }] }],
    ['three portals', { portals: [{ x: 3, y: 2 }, { x: 1, y: 4 }, { x: 1, y: 1 }] }],
    ['duplicate portals', { portals: [{ x: 3, y: 2 }, { x: 3, y: 2 }] }],
    ['portal on rock', { portals: [{ x: 0, y: 0 }, { x: 1, y: 4 }] }],
    ['portal on plot', { portals: [{ x: 3, y: 2 }, { x: 4, y: 4 }] }],
    ['portal on dew', { portals: [{ x: 3, y: 2 }, { x: 1, y: 4 }], dew: [{ x: 3, y: 2 }] }],
    ['dew on plot', { dew: [{ x: 4, y: 4 }] }],
    ['dew on cloud', { dew: [{ x: 2, y: 2 }] }],
    ['dew outside', { dew: [{ x: 6, y: 1 }] }],
    ['fractional dew', { dew: [{ x: 2.5, y: 1 }] }],
    ['duplicate dew', { dew: [{ x: 3, y: 2 }, { x: 3, y: 2 }] }],
    ['missing edge endpoint', { ledges: [{ from: { x: 2, y: 2 } }] }],
    ['same edge endpoint', { ledges: [{ from: { x: 2, y: 2 }, to: { x: 2, y: 2 } }] }],
    ['diagonal edge', { ledges: [{ from: { x: 2, y: 2 }, to: { x: 3, y: 3 } }] }],
    ['distant edge', { ledges: [{ from: { x: 2, y: 2 }, to: { x: 4, y: 2 } }] }],
    ['edge into rock', { ledges: [{ from: { x: 1, y: 1 }, to: { x: 0, y: 1 } }] }],
    ['duplicate ledge', { ledges: [edge, edge] }],
    ['reverse ledge', { ledges: [edge, { from: edge.to, to: edge.from }] }],
    ['unsafe replenishment', { dew: [{ x: 3, y: 2 }], clouds: [{ x: 2, y: 2, drops: Number.MAX_SAFE_INTEGER }] }],
  ];
  for (const [name, overrides] of cases) {
    await t.test(name, () => assert.throws(() => createState(fixture(overrides)), TypeError));
  }
  for (const field of ['ledges', 'dew', 'portals']) {
    const value = field === 'portals' ? Array(2) : Array(1);
    await t.test(`sparse ${field}`, () => assert.throws(() => createState(fixture({ [field]: value })), TypeError));
  }
});

test('ledge endpoints may share special floors and dew may begin under the gardener', () => {
  assert.doesNotThrow(() => createState(fixture({
    dew: [{ x: 1, y: 2 }], portals: [{ x: 3, y: 2 }, { x: 1, y: 4 }],
    ledges: [{ from: { x: 3, y: 2 }, to: { x: 4, y: 2 } },
      { from: { x: 1, y: 2 }, to: { x: 1, y: 3 } },
      { from: { x: 3, y: 4 }, to: { x: 4, y: 4 } }],
  })));
});
