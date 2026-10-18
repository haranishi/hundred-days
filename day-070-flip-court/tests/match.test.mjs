import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { WORLD } from '../lib/config.js';
import { applyLanding, getScores } from '../lib/rules.js';
import { createMatch, beginMatch, stepMatch, movePlayerTo, pauseMatch, resumeMatch } from '../lib/match.js';

const PADDLE_MIN = WORLD.gridX + WORLD.paddleWidth / 2;
const PADDLE_MAX = WORLD.gridX + WORLD.gridSize - WORLD.paddleWidth / 2;
const BALL_MIN = WORLD.gridX + WORLD.ballRadius;
const BALL_MAX = WORLD.gridX + WORLD.gridSize - WORLD.ballRadius;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

function startMatch(seed = 1) {
  const match = createMatch(seed);
  beginMatch(match);
  stepMatch(match, WORLD.countdownMs);
  assert.equal(match.phase, 'playing');
  assert.ok(match.ball, 'the first serve starts after the cue');
  return match;
}

function advanceUntil(match, predicate, limitMs = 6000) {
  for (let elapsed = 0; elapsed <= limitMs; elapsed += 1) {
    if (predicate()) return;
    stepMatch(match, 1);
  }
  assert.fail('the expected rally event did not occur');
}

function cellAt(x, y) {
  return Math.floor((y - WORLD.gridY) / WORLD.cellSize) * WORLD.rows
    + Math.floor((x - WORLD.gridX) / WORLD.cellSize);
}

function playerReturn(offset) {
  const match = startMatch();
  advanceUntil(match, () => match.ball?.owner === 2);
  const incomingId = match.ball.id;
  advanceUntil(match, () => {
    if (match.ball?.id !== incomingId) return true;
    movePlayerTo(match, match.ball.x - offset * WORLD.paddleWidth / 2);
    return false;
  });
  assert.ok(match.ball, 'the player catches the incoming shot');
  assert.equal(match.ball.owner, 1);
  return match;
}

test('a new match has isolated boards and the documented display fields', () => {
  const match = createMatch(7);
  const other = createMatch(7);
  assert.equal(match.phase, 'intro');
  assert.equal(match.resumePhase, null);
  assert.equal(match.elapsedMs, 0);
  assert.equal(match.countdownMs, WORLD.countdownMs);
  assert.equal(match.serveMs, 0);
  assert.equal(match.playerX, WORLD.width / 2);
  assert.equal(match.cpuX, WORLD.width / 2);
  for (const field of ['ball', 'lastLanding', 'lastEvent', 'result']) assert.equal(match[field], null);
  assert.deepEqual(match.scores, { player: 18, cpu: 18 });
  assert.notStrictEqual(match.board, other.board);
  assert.deepEqual(match, other);
});

test('the cue starts one serve and only playing time enters elapsedMs', () => {
  const match = createMatch();
  stepMatch(match, 1000);
  assert.equal(match.elapsedMs, 0);
  beginMatch(match);
  stepMatch(match, WORLD.countdownMs - 1);
  assert.equal(match.phase, 'countdown');
  assert.equal(match.countdownMs, 1);
  assert.equal(match.elapsedMs, 0);
  beginMatch(match);
  stepMatch(match, 51);
  assert.equal(match.phase, 'playing');
  assert.equal(match.countdownMs, 0);
  assert.equal(match.elapsedMs, 50);
  assert.equal(match.lastEvent.type, 'serve');
  assert.equal(match.lastEvent.atMs, 0);
  const ballId = match.ball.id;
  beginMatch(match);
  assert.equal(match.ball.id, ballId);
});

test('left, centre and right paddle contacts produce distinct landings and depth', () => {
  const shots = [-0.75, 0, 0.75].map((offset) => {
    const match = playerReturn(offset);
    const { id, targetX, targetY } = match.ball;
    advanceUntil(match, () => match.ball?.id === id && match.ball.landed);
    assert.equal(match.lastLanding.owner, 1);
    assert.equal(match.lastLanding.cell, cellAt(targetX, targetY));
    return { x: targetX, y: targetY, cell: match.lastLanding.cell };
  });
  assert.ok(shots[0].x < shots[2].x);
  assert.ok(shots[0].cell % WORLD.rows < shots[2].cell % WORLD.rows);
  assert.ok(shots[1].y < shots[0].y, 'a centre return lands deeper toward the CPU');
  assert.ok(shots[1].y < shots[2].y);
});

test('a paddle edge includes the ball radius and clamps the shallow contact depth', () => {
  const match = playerReturn(1.17);
  const progress = match.ball.landingMs / match.ball.durationMs;
  assert.ok(progress >= 0.16 && progress <= 0.84);
  close(progress, 0.16);
  const missed = startMatch();
  advanceUntil(missed, () => missed.ball?.owner === 2);
  const incomingId = missed.ball.id;
  advanceUntil(missed, () => {
    if (missed.ball?.id !== incomingId) return true;
    movePlayerTo(missed, missed.ball.x - WORLD.paddleWidth / 2 - WORLD.ballRadius - 2);
    return false;
  });
  assert.equal(missed.ball, null);
  assert.equal(missed.lastEvent.type, 'miss');
  assert.equal(missed.lastEvent.owner, 1);
});

for (const owner of [1, 2]) {
  test(`owner ${owner} paints and flips through the common immutable Rules result`, () => {
    const match = startMatch();
    if (owner === 2) advanceUntil(match, () => match.ball?.owner === 2);
    assert.equal(match.ball.owner, owner);
    const cell = cellAt(match.ball.targetX, match.ball.targetY);
    const direction = cell % WORLD.rows < WORLD.rows - 2 ? 1 : -1;
    const board = Array(WORLD.rows ** 2).fill(0);
    board[cell + direction] = 3 - owner;
    board[cell + 2 * direction] = owner;
    Object.freeze(board);
    match.board = board;
    match.scores = getScores(board);
    const expected = applyLanding(board, cell, owner);
    const previousLandingId = match.lastLanding?.id;
    advanceUntil(match, () => match.lastLanding?.id !== previousLandingId);
    assert.notStrictEqual(match.board, board);
    assert.deepEqual(match.board, expected.board);
    assert.deepEqual(match.scores, getScores(expected.board));
    assert.deepEqual(match.lastLanding.flipped, [cell + direction]);
    assert.deepEqual(match.lastLanding.changed, expected.changed);
    assert.equal(board[cell], 0);
    assert.equal(board[cell + direction], 3 - owner);
    assert.equal(match.lastLanding.owner, owner);
    assert.equal(match.lastLanding.cell, cell);
    assert.ok(match.lastLanding.atMs <= match.elapsedMs);
    assert.ok(match.lastLanding.id > (previousLandingId ?? 0));
  });
}

test('a shot emits exactly one landing even when the same contact is offered again', () => {
  const match = startMatch();
  const shot = match.ball;
  advanceUntil(match, () => shot.landed);
  const board = match.board;
  const scores = match.scores;
  const landing = match.lastLanding;
  stepMatch(match, 100);
  assert.strictEqual(match.ball, shot);
  assert.strictEqual(match.board, board);
  assert.strictEqual(match.scores, scores);
  assert.strictEqual(match.lastLanding, landing);
  // Re-offer this shot's contact rather than create a new shot ID.
  shot.landed = false;
  shot.elapsedMs = shot.landingMs - 1;
  stepMatch(match, 1);
  assert.equal(shot.landed, true);
  assert.strictEqual(match.board, board);
  assert.strictEqual(match.scores, scores);
  assert.strictEqual(match.lastLanding, landing);
});

test('an out-of-board landing is consumed without painting or notifying', () => {
  for (const [x, y] of [
    [WORLD.gridX - 1, WORLD.gridY],
    [WORLD.gridX + WORLD.gridSize, WORLD.gridY],
    [WORLD.gridX, WORLD.gridY - 1],
    [WORLD.gridX, WORLD.gridY + WORLD.gridSize],
    [NaN, WORLD.gridY],
  ]) {
    const match = startMatch();
    const board = match.board;
    const scores = match.scores;
    match.ball.targetX = x;
    match.ball.targetY = y;
    advanceUntil(match, () => match.ball.landed);
    assert.strictEqual(match.board, board);
    assert.strictEqual(match.scores, scores);
    assert.equal(match.lastLanding, null);
  }
});

test('the ball travels forward with a visible arc and reflects inside the court', () => {
  const match = playerReturn(-0.75);
  const shot = match.ball;
  assert.equal(shot.y, WORLD.playerY);
  assert.equal(shot.z, 0);
  assert.ok(shot.targetX >= BALL_MIN && shot.targetX <= BALL_MAX);
  assert.ok(shot.targetY >= WORLD.gridY && shot.targetY < WORLD.gridY + WORLD.gridSize);
  let previousY = shot.y;
  let previousX = shot.x;
  let previousDirection = 0;
  let reflected = false;
  let beforeArc = false;
  let afterArc = false;
  while (match.ball === shot) {
    stepMatch(match, 1);
    if (match.ball !== shot) break;
    assert.ok(shot.y <= previousY);
    assert.ok(shot.x >= BALL_MIN && shot.x <= BALL_MAX);
    assert.ok(shot.z >= 0 && Number.isFinite(shot.z));
    const direction = Math.sign(shot.x - previousX);
    if (direction && previousDirection && direction !== previousDirection) reflected = true;
    if (direction) previousDirection = direction;
    if (shot.z > 0) {
      if (shot.landed) afterArc = true;
      else beforeArc = true;
    }
    previousY = shot.y;
    previousX = shot.x;
  }
  assert.equal(reflected, true);
  assert.equal(beforeArc, true);
  assert.equal(afterArc, true);
  close(shot.elapsedMs, 1400);
  close(shot.y, WORLD.cpuY);
});

for (const missedOwner of [1, 2]) {
  test(`owner ${missedOwner} misses, keeps territory, then serves automatically after 620ms`, () => {
    const match = missedOwner === 1 ? startMatch() : playerReturn(-0.75);
    if (missedOwner === 1) {
      advanceUntil(match, () => match.ball?.owner === 2);
      movePlayerTo(match, PADDLE_MAX);
    } else {
      // Isolate the common miss rule from the CPU's choice of a receiving position.
      const shot = match.ball;
      stepMatch(match, shot.durationMs - shot.elapsedMs - 1);
      match.cpuX = shot.x > WORLD.width / 2 ? PADDLE_MIN : PADDLE_MAX;
    }
    advanceUntil(match, () => match.lastEvent?.type === 'miss');
    assert.equal(match.lastEvent.owner, missedOwner);
    assert.equal(match.ball, null);
    assert.equal(match.serveMs, WORLD.serveDelayMs);
    const board = match.board;
    const scores = match.scores;
    const miss = match.lastEvent;
    const atMs = match.elapsedMs;
    stepMatch(match, WORLD.serveDelayMs - 1);
    assert.equal(match.ball, null);
    assert.equal(match.serveMs, 1);
    assert.strictEqual(match.lastEvent, miss);
    assert.strictEqual(match.board, board);
    assert.strictEqual(match.scores, scores);
    stepMatch(match, 1);
    assert.ok(match.ball);
    assert.equal(match.ball.owner, missedOwner);
    assert.equal(match.serveMs, 0);
    assert.equal(match.lastEvent.type, 'serve');
    assert.equal(match.lastEvent.owner, missedOwner);
    assert.ok(match.lastEvent.id > miss.id);
    close(match.lastEvent.atMs, atMs + WORLD.serveDelayMs);
    close(match.elapsedMs, atMs + WORLD.serveDelayMs);
    assert.strictEqual(match.board, board);
    assert.strictEqual(match.scores, scores);
  });
}

test('pointer and axis movement use world limits and player speed', () => {
  const match = startMatch();
  movePlayerTo(match, -10000);
  assert.equal(match.playerX, PADDLE_MIN);
  movePlayerTo(match, 10000);
  assert.equal(match.playerX, PADDLE_MAX);
  stepMatch(match, 100, -1);
  close(match.playerX, PADDLE_MAX - WORLD.playerSpeed / 10);
  stepMatch(match, 100, 20);
  close(match.playerX, PADDLE_MAX);
  stepMatch(match, 1000, -20);
  assert.equal(match.playerX, PADDLE_MIN);
  assert.ok(match.cpuX >= PADDLE_MIN && match.cpuX <= PADDLE_MAX);
});

test('invalid deltas, axes and pointer values cannot corrupt or advance the model', () => {
  const intro = createMatch();
  movePlayerTo(intro, PADDLE_MIN);
  assert.equal(intro.playerX, WORLD.width / 2);
  const match = startMatch();
  const before = structuredClone(match);
  for (const delta of [NaN, Infinity, -Infinity, 0, -1, '16', null, undefined, {}, 1n]) {
    stepMatch(match, delta);
    assert.deepEqual(match, before);
  }
  for (const axis of [NaN, Infinity, -Infinity, '1', null, {}, 1n]) {
    stepMatch(match, 16, axis);
    assert.deepEqual(match, before);
  }
  for (const x of [NaN, Infinity, -Infinity, '300', null, undefined, {}, 1n]) {
    movePlayerTo(match, x);
    assert.deepEqual(match, before);
  }
});

test('seeded serves and the same input sequence reproduce actual rallies', () => {
  const first = startMatch(7);
  const second = startMatch(7);
  const different = startMatch(8);
  assert.notEqual(first.ball.targetX, different.ball.targetX);
  for (let index = 0; index < 1000; index += 1) {
    const axis = index % 3 - 1;
    stepMatch(first, 8, axis);
    stepMatch(second, 8, axis);
  }
  assert.deepEqual(first, second);
  assert.ok(first.lastLanding);
  assert.ok(first.lastEvent.id > 1);
});

test('a large delta retains the landings and misses seen in short steps', () => {
  const large = startMatch(17);
  const small = startMatch(17);
  const duration = 8000;
  stepMatch(large, duration);
  for (let elapsed = 0; elapsed < duration; elapsed += 8) stepMatch(small, 8);
  assert.deepEqual(large.board, small.board);
  assert.deepEqual(large.scores, small.scores);
  assert.deepEqual(large.lastLanding, small.lastLanding);
  assert.deepEqual(large.lastEvent, small.lastEvent);
  assert.equal(large.ball?.id, small.ball?.id);
  assert.equal(large.ball?.owner, small.ball?.owner);
  close(large.elapsedMs, duration);
  close(large.serveMs, small.serveMs);
  if (large.ball) {
    for (const field of ['x', 'y', 'z', 'elapsedMs']) close(large.ball[field], small.ball[field]);
  }
  assert.ok(large.lastLanding.id > 3, 'multiple shot landings were processed');
});


test('the CPU waits, then moves within its speed and court limits', () => {
  for (const initialX of [PADDLE_MIN, PADDLE_MAX]) {
    const match = startMatch(7);
    match.cpuX = initialX;
    stepMatch(match, 100);
    close(match.cpuX, initialX);
    let moved = false;
    for (let elapsed = 100; elapsed < 1400; elapsed += 10) {
      const previousX = match.cpuX;
      stepMatch(match, 10);
      assert.ok(Math.abs(match.cpuX - previousX) <= WORLD.cpuSpeed / 100 + 1e-7);
      assert.ok(match.cpuX >= PADDLE_MIN && match.cpuX <= PADDLE_MAX);
      if (Math.abs(match.cpuX - previousX) > 1e-7) moved = true;
    }
    assert.equal(moved, true, 'an incoming shot eventually makes the CPU react');
  }
});

test('each new player return starts a positive CPU reaction wait', () => {
  const match = playerReturn(0);
  match.cpuX = PADDLE_MIN;
  stepMatch(match, 100);
  close(match.cpuX, PADDLE_MIN);
  stepMatch(match, 260);
  assert.ok(match.cpuX > PADDLE_MIN);
});

test('the CPU intercepts a reflected shot at the receiving paddle, beyond its landing marker', () => {
  const match = playerReturn(-0.75);
  const incoming = match.ball;
  match.cpuX = WORLD.width / 2;
  stepMatch(match, incoming.durationMs);
  assert.ok(Math.abs(incoming.x - incoming.targetX) > WORLD.paddleWidth);
  assert.ok(Math.abs(match.cpuX - incoming.x) <= WORLD.paddleWidth / 2 + WORLD.ballRadius);
  assert.ok(match.ball, 'the CPU can catch the reflected end of the flight');
  assert.equal(match.ball.owner, 2);
});

test('a distant incoming serve can outrun the delayed CPU and use the same miss rule', () => {
  const match = createMatch(1000);
  // A valid, wide receiving fixture leaves too little time to cross the court.
  match.playerX = PADDLE_MAX;
  match.cpuX = PADDLE_MIN;
  beginMatch(match);
  stepMatch(match, WORLD.countdownMs);
  stepMatch(match, match.ball.durationMs);
  assert.equal(match.ball, null);
  assert.equal(match.lastEvent.type, 'miss');
  assert.equal(match.lastEvent.owner, 2);
  assert.equal(match.serveMs, WORLD.serveDelayMs);
  assert.ok(match.cpuX < PADDLE_MAX);
});

test('seeded CPU aim is imperfect and the same inputs reproduce its movement and return', () => {
  const first = startMatch(7);
  const second = startMatch(7);
  const different = startMatch(8);
  for (const duration of [100, 133, 201, 401, 565]) {
    stepMatch(first, duration);
    stepMatch(second, duration);
    stepMatch(different, duration);
    assert.deepEqual(first, second);
  }
  assert.equal(first.ball.owner, 2);
  const actualOffset = (first.ball.startX - first.cpuX) / (WORLD.paddleWidth / 2);
  const nearestCandidate = Math.min(...[-0.75, 0, 0.75].map((offset) => Math.abs(actualOffset - offset)));
  assert.ok(nearestCandidate > 0.001, 'seeded aiming error changes the actual paddle contact');
  assert.notEqual(first.cpuX, different.cpuX);
  assert.notEqual(first.ball.targetX, different.ball.targetX);
});

test('CPU candidate selection and actual landings use the same territory Rules', () => {
  for (const [cell, direction, enemies] of [[6, 1, 3], [11, -1, 3], [32, 1, 2]]) {
    const match = startMatch();
    const board = Array(WORLD.rows ** 2).fill(0);
    for (let distance = 1; distance <= enemies; distance += 1) board[cell + distance * direction] = 1;
    board[cell + (enemies + 1) * direction] = 2;
    match.board = Object.freeze(board);
    match.scores = getScores(board);
    const candidateScore = (candidate) => {
      const scores = getScores(applyLanding(board, candidate, 2).board);
      return scores.cpu - scores.player;
    };
    for (const alternative of [6, 11, 32].filter((candidate) => candidate !== cell)) {
      assert.ok(candidateScore(cell) > candidateScore(alternative));
    }
    stepMatch(match, match.ball.durationMs);
    assert.ok(match.ball, 'the chosen return still requires a real paddle hit');
    assert.equal(match.ball.owner, 2);
    assert.equal(cellAt(match.ball.targetX, match.ball.targetY), cell);
    const before = match.board;
    const expected = applyLanding(before, cell, 2);
    stepMatch(match, match.ball.landingMs);
    assert.deepEqual(match.board, expected.board);
    assert.deepEqual(match.scores, getScores(expected.board));
    assert.equal(match.lastLanding.owner, 2);
    assert.equal(match.lastLanding.cell, cell);
    assert.deepEqual(match.lastLanding.flipped, expected.flipped);
    assert.deepEqual(match.lastLanding.changed, expected.changed);
    assert.equal(expected.flipped.length, enemies);
    assert.equal(board[cell], 0);
  }
});


test('intro does not accept progress, movement, pause or resume', () => {
  const match = createMatch(7);
  const before = structuredClone(match);
  stepMatch(match, 300000, 1);
  movePlayerTo(match, PADDLE_MIN);
  pauseMatch(match);
  resumeMatch(match);
  assert.deepEqual(match, before);
});

for (const landingAtMs of [59999, WORLD.matchMs - 0.000001, 60000, 60001]) {
  test(`a first bounce at ${landingAtMs}ms is compared with the exact deadline`, () => {
    const match = startMatch();
    const board = Object.freeze(Array(WORLD.rows ** 2).fill(0));
    match.board = board;
    match.scores = getScores(board);
    // Keep a real flying shot, but place its first bounce around the deadline.
    match.ball.landingMs = 100;
    match.elapsedMs = landingAtMs - match.ball.landingMs;
    const cell = cellAt(match.ball.targetX, match.ball.targetY);
    stepMatch(match, 1000);
    assert.equal(match.phase, 'result');
    assert.equal(match.elapsedMs, WORLD.matchMs);
    assert.deepEqual(match.result, {
      winner: landingAtMs < WORLD.matchMs ? 1 : 0,
      player: landingAtMs < WORLD.matchMs ? 1 : 0,
      cpu: 0,
    });
    assert.equal(match.lastEvent.type, 'finish');
    assert.equal(match.lastEvent.atMs, WORLD.matchMs);
    if (landingAtMs < WORLD.matchMs) {
      assert.equal(match.board[cell], 1);
      assert.equal(match.lastLanding.atMs, landingAtMs);
      assert.equal(match.lastLanding.cell, cell);
    } else {
      assert.strictEqual(match.board, board);
      assert.equal(match.lastLanding, null);
      assert.equal(match.lastLandedBallId, 0);
    }
  });
}

for (const [winner, player, cpu] of [[0, 18, 18], [1, 23, 13], [2, 13, 23]]) {
  test(`the final territory determines winner ${winner} and one finish event`, () => {
    const match = startMatch();
    match.board = Array(player).fill(1).concat(Array(cpu).fill(2));
    match.scores = getScores(match.board);
    match.elapsedMs = WORLD.matchMs - 1;
    const nextId = match.nextId;
    stepMatch(match, 1);
    assert.equal(match.elapsedMs, WORLD.matchMs);
    assert.equal(match.phase, 'result');
    assert.deepEqual(match.result, { winner, player, cpu });
    assert.deepEqual(match.scores, { player, cpu });
    assert.equal(match.lastEvent.type, 'finish');
    assert.equal(match.lastEvent.atMs, WORLD.matchMs);
    assert.equal(match.lastEvent.id, nextId);
    assert.equal(match.nextId, nextId + 1);
    const finish = match.lastEvent;
    stepMatch(match, 60001);
    assert.strictEqual(match.lastEvent, finish);
    assert.equal(match.nextId, nextId + 1);
  });
}

test('all public operations leave a finished model and its result unchanged', () => {
  const match = startMatch(7);
  stepMatch(match, WORLD.matchMs);
  assert.equal(match.phase, 'result');
  const before = structuredClone(match);
  const result = match.result;
  const board = match.board;
  Object.freeze(match);
  for (const operation of [
    () => beginMatch(match),
    () => stepMatch(match, 300000, 1),
    () => stepMatch(match, 16, -1),
    () => movePlayerTo(match, PADDLE_MIN),
    () => pauseMatch(match),
    () => resumeMatch(match),
  ]) {
    assert.doesNotThrow(operation);
    assert.deepEqual(match, before);
    assert.strictEqual(match.result, result);
    assert.strictEqual(match.board, board);
  }
});

test('pausing a cue freezes all state and resumes its remaining duration once', () => {
  const match = createMatch(7);
  beginMatch(match);
  stepMatch(match, 333);
  resumeMatch(match);
  const before = structuredClone(match);
  pauseMatch(match);
  assert.equal(match.phase, 'paused');
  assert.equal(match.resumePhase, 'countdown');
  const paused = structuredClone(match);
  pauseMatch(match);
  beginMatch(match);
  movePlayerTo(match, PADDLE_MIN);
  stepMatch(match, 300000, 1);
  assert.deepEqual(match, paused);
  resumeMatch(match);
  assert.deepEqual(match, before);
  resumeMatch(match);
  stepMatch(match, WORLD.countdownMs - 333);
  assert.equal(match.phase, 'playing');
  assert.equal(match.elapsedMs, 0);
  assert.ok(match.ball);
  assert.equal(match.lastEvent.type, 'serve');
  assert.equal(match.lastEvent.atMs, 0);
});

for (const elapsedMs of [100, 400]) {
  test(`pausing at ${elapsedMs}ms freezes ball, CPU reaction, territory and RNG`, () => {
    const match = startMatch(7);
    match.cpuX = PADDLE_MIN;
    stepMatch(match, elapsedMs);
    resumeMatch(match);
    const control = structuredClone(match);
    pauseMatch(match);
    assert.equal(match.phase, 'paused');
    assert.equal(match.resumePhase, 'playing');
    const paused = structuredClone(match);
    stepMatch(match, 300000, -1);
    pauseMatch(match);
    beginMatch(match);
    movePlayerTo(match, PADDLE_MAX);
    assert.deepEqual(match, paused);
    resumeMatch(match);
    assert.deepEqual(match, control);
    stepMatch(match, 700, -1);
    stepMatch(control, 700, -1);
    assert.deepEqual(match, control);
    assert.ok(match.cpuX > PADDLE_MIN, 'the saved CPU reaction continues after resume');
  });
}

test('pause preserves a pending serve, whose wait still counts as active time on resume', () => {
  const match = startMatch();
  advanceUntil(match, () => match.ball?.owner === 2);
  movePlayerTo(match, PADDLE_MAX);
  advanceUntil(match, () => match.lastEvent?.type === 'miss');
  assert.equal(match.ball, null);
  const atMs = match.elapsedMs;
  const board = match.board;
  pauseMatch(match);
  assert.equal(match.phase, 'paused');
  const paused = structuredClone(match);
  stepMatch(match, 2000, 1);
  assert.deepEqual(match, paused);
  resumeMatch(match);
  stepMatch(match, WORLD.serveDelayMs - 1);
  assert.equal(match.ball, null);
  assert.equal(match.serveMs, 1);
  stepMatch(match, 1);
  assert.ok(match.ball);
  assert.equal(match.lastEvent.type, 'serve');
  assert.equal(match.elapsedMs, atMs + WORLD.serveDelayMs);
  assert.strictEqual(match.board, board);
});

for (const pending of ['arrival', 'serve']) {
  test(`${pending} at the deadline cannot create another rally event`, () => {
    const match = startMatch();
    if (pending === 'arrival') {
      stepMatch(match, match.ball.durationMs - 1);
    } else {
      advanceUntil(match, () => match.ball?.owner === 2);
      movePlayerTo(match, PADDLE_MAX);
      advanceUntil(match, () => match.lastEvent?.type === 'miss');
      match.serveMs = 1;
    }
    match.elapsedMs = WORLD.matchMs - 1;
    const nextId = match.nextId;
    const rngState = match.rngState;
    const ball = match.ball;
    const board = match.board;
    const lastLanding = match.lastLanding;
    stepMatch(match, 1000);
    assert.equal(match.phase, 'result');
    assert.equal(match.elapsedMs, WORLD.matchMs);
    assert.equal(match.nextId, nextId + 1);
    assert.equal(match.lastEvent.type, 'finish');
    assert.equal(match.lastEvent.atMs, WORLD.matchMs);
    assert.equal(match.rngState, rngState);
    assert.strictEqual(match.ball, ball);
    assert.strictEqual(match.board, board);
    assert.strictEqual(match.lastLanding, lastLanding);
  });
}

test('rematch creates fresh progress, territory and RNG without changing the old round', () => {
  const old = startMatch(7);
  stepMatch(old, WORLD.matchMs, 1);
  assert.equal(old.phase, 'result');
  const oldState = structuredClone(old);
  const match = createMatch(7);
  assert.notStrictEqual(match.board, old.board);
  assert.equal(match.phase, 'intro');
  assert.deepEqual(match.scores, { player: 18, cpu: 18 });
  assert.equal(match.elapsedMs, 0);
  assert.equal(match.countdownMs, WORLD.countdownMs);
  assert.equal(match.serveMs, 0);
  assert.equal(match.playerX, WORLD.width / 2);
  assert.equal(match.cpuX, WORLD.width / 2);
  assert.equal(match.rngState, 7);
  assert.equal(match.nextId, 1);
  for (const field of ['ball', 'lastLanding', 'lastEvent', 'result', 'cpuPlan', 'resumePhase']) {
    assert.equal(match[field], null);
  }
  beginMatch(match);
  assert.equal(match.phase, 'countdown');
  stepMatch(match, WORLD.countdownMs);
  assert.deepEqual(match, startMatch(7));
  stepMatch(match, 2000, -1);
  assert.deepEqual(old, oldState);
});

test('a large elapsed delta stops at the same result as normal bounded progress', () => {
  const large = createMatch(17);
  const bounded = createMatch(17);
  const small = createMatch(17);
  for (const match of [large, bounded, small]) beginMatch(match);
  const duration = WORLD.countdownMs + WORLD.matchMs;
  stepMatch(large, 300000);
  stepMatch(bounded, duration);
  for (let elapsed = 0; elapsed < duration; elapsed += 8) {
    stepMatch(small, Math.min(8, duration - elapsed));
  }
  assert.equal(large.phase, 'result');
  assert.equal(large.elapsedMs, WORLD.matchMs);
  assert.deepEqual(large, bounded);
  for (const field of ['phase', 'result', 'board', 'scores', 'lastLanding', 'lastEvent', 'rngState', 'nextId']) {
    assert.deepEqual(large[field], small[field]);
  }
  close(large.cpuX, small.cpuX);
  close(large.serveMs, small.serveMs);
  assert.equal(large.ball?.id, small.ball?.id);
  if (large.ball) {
    for (const field of ['x', 'y', 'z', 'elapsedMs']) close(large.ball[field], small.ball[field]);
  }
});


test('even the largest finite delta stops after one match without unbounded work', () => {
  const modelUrl = new URL('../lib/match.js', import.meta.url).href;
  const output = execFileSync(process.execPath, ['--input-type=module', '--eval', `
    import { createMatch, beginMatch, stepMatch } from ${JSON.stringify(modelUrl)};
    const match = createMatch(17);
    beginMatch(match);
    stepMatch(match, Number.MAX_VALUE);
    process.stdout.write(JSON.stringify(match));
  `], { encoding: 'utf8', timeout: 5000 });
  const bounded = createMatch(17);
  beginMatch(bounded);
  stepMatch(bounded, WORLD.countdownMs + WORLD.matchMs);
  assert.equal(bounded.phase, 'result');
  assert.deepEqual(JSON.parse(output), bounded);
});


test('seed 94 finishes at exactly 60000ms when the full cue and match advance together', () => {
  const match = createMatch(94);
  beginMatch(match);
  stepMatch(match, WORLD.countdownMs + WORLD.matchMs);
  assert.equal(match.elapsedMs, WORLD.matchMs);
  assert.equal(match.phase, 'result');
  const { player, cpu } = getScores(match.board);
  assert.deepEqual(match.result, {
    winner: player === cpu ? 0 : player > cpu ? 1 : 2,
    player, cpu,
  });
  assert.equal(match.lastEvent.type, 'finish');
  assert.equal(match.lastEvent.atMs, WORLD.matchMs);
  const finish = match.lastEvent;
  const nextId = match.nextId;
  stepMatch(match, 1);
  assert.strictEqual(match.lastEvent, finish);
  assert.equal(match.nextId, nextId);
});
