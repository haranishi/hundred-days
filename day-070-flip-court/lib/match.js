import { WORLD } from './config.js';
import { createBoard, getScores, applyLanding } from './rules.js';

const FLIGHT_MS = 1400;
const MAX_STEP_MS = 16;
const HALF_PADDLE = WORLD.paddleWidth / 2;
const PADDLE_MIN = WORLD.gridX + HALF_PADDLE;
const PADDLE_MAX = WORLD.gridX + WORLD.gridSize - HALF_PADDLE;
const BALL_MIN = WORLD.gridX + WORLD.ballRadius;
const BALL_MAX = WORLD.gridX + WORLD.gridSize - WORLD.ballRadius;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function reflectX(x) {
  const width = BALL_MAX - BALL_MIN;
  const period = width * 2;
  const distance = ((x - BALL_MIN) % period + period) % period;
  return BALL_MIN + (distance <= width ? distance : period - distance);
}

function random(match) {
  match.rngState = (Math.imul(match.rngState, 1664525) + 1013904223) >>> 0;
  return match.rngState / 4294967296;
}

function event(match, type, owner) {
  match.lastEvent = { id: match.nextId++, atMs: match.elapsedMs, type, owner };
}

function finish(match) {
  match.scores = getScores(match.board);
  const { player, cpu } = match.scores;
  const winner = player === cpu ? 0 : player > cpu ? 1 : 2;
  match.result = { winner, player, cpu };
  match.phase = 'result';
  event(match, 'finish', winner);
}

function trajectory(owner, x, offset) {
  const contact = clamp(offset, -1, 1);
  const landingProgress = clamp(0.84 - Math.abs(contact) * 0.68, 0.16, 0.84);
  const startY = owner === 1 ? WORLD.playerY : WORLD.cpuY;
  const endY = owner === 1 ? WORLD.cpuY : WORLD.playerY;
  // Keep edge contacts wide even though they touch down earlier in the flight.
  const travelX = contact * WORLD.gridSize * 0.58 / landingProgress;
  return {
    startY, endY, travelX,
    targetX: reflectX(x + travelX * landingProgress),
    targetY: startY + (endY - startY) * landingProgress,
    landingMs: FLIGHT_MS * landingProgress,
  };
}

function launchShot(match, owner, x, offset) {
  const flight = trajectory(owner, x, offset);
  match.ball = {
    id: match.nextId++, owner, x, y: flight.startY, z: 0,
    ...flight, landed: false, startX: x, elapsedMs: 0, durationMs: FLIGHT_MS,
  };
  match.cpuPlan = owner === 1
    ? { reactionMs: 180 + Math.floor(random(match) * 121), targetX: null }
    : null;
}

function landingCell(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)
    || x < WORLD.gridX || x >= WORLD.gridX + WORLD.gridSize
    || y < WORLD.gridY || y >= WORLD.gridY + WORLD.gridSize) return -1;
  return Math.floor((y - WORLD.gridY) / WORLD.cellSize) * WORLD.rows
    + Math.floor((x - WORLD.gridX) / WORLD.cellSize);
}

function advanceCpu(match, deltaMs) {
  const plan = match.cpuPlan;
  const ball = match.ball;
  if (!plan || ball.elapsedMs < plan.reactionMs) return;
  if (plan.targetX === null) {
    // The floor marker is earlier in the flight than the receiving paddle.
    const interceptX = reflectX(ball.startX + ball.travelX);
    const error = (random(match) - 0.5) * 36;
    let bestScore = -Infinity;
    for (const offset of [0, -0.75, 0.75]) {
      const targetX = clamp(interceptX - offset * HALF_PADDLE + error, PADDLE_MIN, PADDLE_MAX);
      const flight = trajectory(2, interceptX, (interceptX - targetX) / HALF_PADDLE);
      const candidate = applyLanding(match.board, landingCell(flight.targetX, flight.targetY), 2);
      const scores = getScores(candidate.board);
      const score = scores.cpu - scores.player;
      if (score > bestScore) {
        bestScore = score;
        plan.targetX = targetX;
      }
    }
  }
  const movement = WORLD.cpuSpeed * deltaMs / 1000;
  match.cpuX = clamp(match.cpuX + clamp(plan.targetX - match.cpuX, -movement, movement), PADDLE_MIN, PADDLE_MAX);
}

function serve(match) {
  const owner = match.serveOwner;
  const x = owner === 1 ? match.playerX : match.cpuX;
  launchShot(match, owner, x, (random(match) - 0.5) * 0.12);
  match.serveMs = 0;
  event(match, 'serve', owner);
}

function land(match, ball) {
  ball.landed = true;
  if (ball.id <= match.lastLandedBallId) return;
  match.lastLandedBallId = ball.id;
  const { targetX: x, targetY: y, owner } = ball;
  const cell = landingCell(x, y);
  if (cell < 0 || (owner !== 1 && owner !== 2)) return;
  const landing = applyLanding(match.board, cell, owner);
  match.board = landing.board;
  match.scores = getScores(landing.board);
  match.lastLanding = {
    id: match.nextId++, atMs: match.elapsedMs, owner, cell,
    flipped: landing.flipped, changed: landing.changed,
  };
}

function advanceBall(match, deltaMs) {
  const ball = match.ball;
  ball.elapsedMs = Math.min(ball.durationMs, ball.elapsedMs + deltaMs);
  const progress = ball.elapsedMs / ball.durationMs;
  const bounce = ball.landingMs / ball.durationMs;
  ball.x = reflectX(ball.startX + ball.travelX * progress);
  ball.y = ball.startY + (ball.endY - ball.startY) * progress;
  const beforeBounce = progress <= bounce;
  const arcProgress = beforeBounce ? progress / bounce : (progress - bounce) / (1 - bounce);
  ball.z = Math.max(0, Math.sin(Math.PI * arcProgress)) * (beforeBounce ? 88 : 64);
  // Finish takes precedence over landings and arrivals at the deadline.
  if (match.elapsedMs >= WORLD.matchMs) return;
  if (!ball.landed && ball.elapsedMs >= ball.landingMs) land(match, ball);
  if (ball.elapsedMs < ball.durationMs) return;
  const receiver = 3 - ball.owner;
  const paddleX = receiver === 1 ? match.playerX : match.cpuX;
  if (Math.abs(ball.x - paddleX) <= HALF_PADDLE + WORLD.ballRadius) {
    launchShot(match, receiver, ball.x, (ball.x - paddleX) / HALF_PADDLE);
  } else {
    match.ball = null;
    match.cpuPlan = null;
    match.serveOwner = receiver;
    match.serveMs = WORLD.serveDelayMs;
    event(match, 'miss', receiver);
  }
}

function nextStep(match, remainingMs) {
  let deltaMs = Math.min(MAX_STEP_MS, remainingMs);
  if (match.phase === 'countdown') return Math.min(deltaMs, match.countdownMs);
  deltaMs = Math.min(deltaMs, WORLD.matchMs - match.elapsedMs);
  if (!match.ball) return Math.min(deltaMs, match.serveMs);
  const ball = match.ball;
  deltaMs = Math.min(deltaMs, ball.durationMs - ball.elapsedMs);
  if (match.cpuPlan && ball.elapsedMs < match.cpuPlan.reactionMs) {
    deltaMs = Math.min(deltaMs, match.cpuPlan.reactionMs - ball.elapsedMs);
  }
  if (!ball.landed && ball.elapsedMs < ball.landingMs) {
    deltaMs = Math.min(deltaMs, ball.landingMs - ball.elapsedMs);
  }
  return deltaMs;
}

export function createMatch(seed = 1) {
  const board = createBoard();
  return {
    phase: 'intro', resumePhase: null, board, scores: getScores(board),
    elapsedMs: 0, countdownMs: WORLD.countdownMs, serveMs: 0,
    playerX: WORLD.width / 2, cpuX: WORLD.width / 2,
    ball: null, lastLanding: null, lastEvent: null, result: null,
    rngState: Number.isFinite(seed) ? seed >>> 0 : 1,
    nextId: 1, lastLandedBallId: 0, serveOwner: 1, cpuPlan: null,
  };
}

export function beginMatch(match) {
  if (match.phase === 'intro') match.phase = 'countdown';
}

export function stepMatch(match, deltaMs, axis = 0) {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0 || !Number.isFinite(axis)) return;
  const direction = clamp(axis, -1, 1);
  const availableMs = WORLD.matchMs - match.elapsedMs
    + (match.phase === 'countdown' ? match.countdownMs : 0);
  const finishRequested = deltaMs >= availableMs;
  let remainingMs = Math.min(deltaMs, availableMs);
  while (match.phase === 'countdown' || match.phase === 'playing') {
    // A full-match request consumes any clock remainder after the local budget.
    const budgetMs = remainingMs > 0 ? remainingMs
      : finishRequested && match.phase === 'playing' ? WORLD.matchMs - match.elapsedMs : 0;
    if (budgetMs <= 0) break;
    const stepMs = nextStep(match, budgetMs);
    remainingMs = Math.max(0, remainingMs - stepMs);
    if (match.phase === 'countdown') {
      match.countdownMs -= stepMs;
      if (match.countdownMs === 0) {
        match.phase = 'playing';
        serve(match);
      }
    } else {
      match.elapsedMs += stepMs;
      movePlayerTo(match, match.playerX + direction * WORLD.playerSpeed * stepMs / 1000);
      if (match.ball) {
        advanceCpu(match, stepMs);
        advanceBall(match, stepMs);
      } else {
        match.serveMs -= stepMs;
        if (match.serveMs === 0 && match.elapsedMs < WORLD.matchMs) serve(match);
      }
      if (match.elapsedMs === WORLD.matchMs) finish(match);
    }
  }
}

export function movePlayerTo(match, x) {
  if (match.phase !== 'playing' || !Number.isFinite(x)) return;
  match.playerX = clamp(x, PADDLE_MIN, PADDLE_MAX);
}

export function pauseMatch(match) {
  if (match.phase !== 'countdown' && match.phase !== 'playing') return;
  match.resumePhase = match.phase;
  match.phase = 'paused';
}

export function resumeMatch(match) {
  if (match.phase !== 'paused') return;
  match.phase = match.resumePhase;
  match.resumePhase = null;
}
