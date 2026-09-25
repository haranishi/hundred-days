import { PHYS, WORLD, integrate, applyFlap, stepIndexFor } from './physics.js';
import { circleCircle, hitPole, hitGround, clampCeiling } from './collision.js';
import { createCourse, COURSE } from './course.js';

const DT = PHYS.dt;
const R = PHYS.catR;
// 天井で止める位置は、耳の先が画面に残る高さ。当たり判定の半径9で止めると耳が画面の外に切れた（fix-v1 の残り）
export const CEIL_PAD = 24;

export const CRASH = Object.freeze({
  freeze: 0.25,
  hopVy: -150,
  groundHopVy: -190,
  knockVx: -48,
  spin: 11,
  bounceVy: -110,
  sitOffset: 19.5,
  resultAfterLand: 0.3,
  resultMax: 1.2,
});

// skyTop：猫が止まる天井の高さ（帯の座標）。画面の上端を渡す。省略時は帯の上端0
export function createGame({ seed, idleBob = 4, skyTop = 0 } = {}) {
  const mid = WORLD.bandH / 2;
  const game = {
    seed,
    skyTop,
    phase: 'ready',
    steps: 0,
    dist: 0,
    prevDist: 0,
    idleBob,
    cat: { x: WORLD.catX, prevX: WORLD.catX, y: mid, prevY: mid, vy: 0, vx: 0, spin: 0, prevSpin: 0, lastFlapT: -10 },
    course: createCourse(seed),
    first: 0,
    score: 0,
    fish: 0,
    flaps: 0,
    pending: [],
    events: [],
    hit: null,
    crashT: 0,
    landedT: 0,
    tumbling: false,
    bounced: false,
    startT: 0,
  };
  game.course.ensureUntil(WORLD.catX + WORLD.width + 200);
  return game;
}

export function gameTime(g) {
  return g.steps * DT;
}

export function queueFlap(g, t) {
  g.pending.push(t);
}

export function drainEvents(g) {
  return g.events.splice(0);
}

// target まで固定刻みで進める。刻みの境目ごとに、その境目までに起きた入力を先に反映する。
// 最後の境目は target 以上になるので、描画の直前までの入力は必ずこの呼び出しの中で効く
export function advanceTo(g, target) {
  for (;;) {
    applyPending(g);
    if (g.steps * DT >= target - 1e-9) return;
    step(g);
  }
}

export function stepOnce(g) {
  applyPending(g);
  step(g);
  applyPending(g);
}

function applyPending(g) {
  if (!g.pending.length) return;
  if (g.pending.length > 1) g.pending.sort((a, b) => a - b);
  while (g.pending.length && stepIndexFor(g.pending[0]) <= g.steps) {
    g.pending.shift();
    doFlap(g);
  }
}

function doFlap(g) {
  if (g.phase === 'ready') {
    g.phase = 'flying';
    g.startT = gameTime(g);
    g.events.push({ type: 'start' });
  }
  if (g.phase !== 'flying') return;
  applyFlap(g.cat);
  g.cat.lastFlapT = gameTime(g);
  g.flaps += 1;
  g.events.push({ type: 'flap' });
}

function step(g) {
  const c = g.cat;
  c.prevY = c.y;
  c.prevX = c.x;
  c.prevSpin = c.spin;
  g.prevDist = g.dist;
  if (g.phase === 'ready') stepReady(g);
  else if (g.phase === 'flying') stepFlying(g);
  else if (g.phase === 'crashing') stepCrashing(g);
  g.steps += 1;
}

function stepReady(g) {
  const t = (g.steps + 1) * DT;
  g.cat.y = WORLD.bandH / 2 + Math.sin(t * 3.2) * g.idleBob;
}

function stepFlying(g) {
  const c = g.cat;
  integrate(c, DT);
  clampCeiling(c, CEIL_PAD, g.skyTop);
  g.dist += PHYS.speed * DT;
  const wx = WORLD.catX + g.dist;
  const poles = g.course.poles;
  g.course.ensureUntil(wx + WORLD.width + 200);
  while (g.first < poles.length && poles[g.first].x + poles[g.first].w < wx - 60) g.first += 1;
  for (let i = g.first; i < poles.length; i += 1) {
    const p = poles[i];
    if (p.x > wx + R + 20) break;
    if (p.fish && !p.fish.taken && circleCircle(wx, c.y, R, p.fish.x, p.fish.y, COURSE.fishR)) {
      p.fish.taken = true;
      p.fish.takenAt = gameTime(g);
      g.fish += 1;
      g.events.push({ type: 'fish', pole: p.n });
    }
    if (!p.passed && wx > p.x + p.w) {
      p.passed = true;
      g.score += 1;
      g.events.push({ type: 'pass', score: g.score, t: gameTime(g) });
    }
    const contact = hitPole(wx, c.y, R, p);
    if (contact) {
      crash(g, { x: contact.x, y: contact.y, kind: 'pole', pole: p.n, ...normal(contact.x - wx, contact.y - c.y) });
      return;
    }
  }
  if (hitGround(c.y, R)) {
    c.y = WORLD.bandH - R;
    crash(g, { x: wx, y: WORLD.bandH, kind: 'ground', pole: 0, nx: 0, ny: 1 });
  }
}

// 猫の中心から当たった点への向き（長さ1）。はじけを猫の顔と反対側へ開くのに使う
function normal(dx, dy) {
  const len = Math.hypot(dx, dy);
  return len > 1e-9 ? { nx: dx / len, ny: dy / len } : { nx: 1, ny: 0 };
}

function crash(g, hit) {
  g.phase = 'crashing';
  g.crashT = gameTime(g);
  g.hit = { ...hit, t: g.crashT };
  g.tumbling = false;
  g.bounced = false;
  g.events.push({ type: 'hit', kind: hit.kind });
}

// 着地面：ポールの真上にいればクッションの上に座る。ポールを突き抜けて落ちる絵にしない
export function surfaceUnder(g, wx, y) {
  const poles = g.course.poles;
  for (let i = Math.max(0, g.first - 1); i < poles.length; i += 1) {
    const p = poles[i];
    if (p.x > wx + 2) break;
    if (wx >= p.x - 2 && wx <= p.x + p.w + 2 && y <= p.bottom + 1) return p.bottom;
  }
  return WORLD.bandH;
}

function stepCrashing(g) {
  const c = g.cat;
  const since = gameTime(g) - g.crashT;
  if (since < CRASH.freeze) return;
  if (!g.tumbling) {
    g.tumbling = true;
    c.vy = g.hit.kind === 'ground' ? CRASH.groundHopVy : CRASH.hopVy;
    c.vx = CRASH.knockVx;
  }
  integrate(c, DT);
  c.x += c.vx * DT;
  c.vx *= 0.985;
  clampCeiling(c, CEIL_PAD, g.skyTop);
  if (!g.bounced) c.spin += CRASH.spin * DT;
  const wx = c.x + g.dist;
  const surface = surfaceUnder(g, wx, c.prevY + R);
  if (c.y + CRASH.sitOffset >= surface) {
    c.y = surface - CRASH.sitOffset;
    c.spin = 0;
    c.prevSpin = 0;
    if (!g.bounced) {
      g.bounced = true;
      c.vy = CRASH.bounceVy;
      g.events.push({ type: 'bump' });
    } else {
      c.vy = 0;
      c.vx = 0;
      g.phase = 'landed';
      g.landedT = gameTime(g);
      g.events.push({ type: 'land' });
    }
  }
}

// 画面に出すための状態。テスト用フックとE2Eの自動操縦がこれを読む
export function snapshot(g) {
  const wx = WORLD.catX + g.dist;
  return {
    phase: g.phase,
    t: gameTime(g),
    score: g.score,
    fish: g.fish,
    flaps: g.flaps,
    dist: g.dist,
    skyTop: g.skyTop,
    cat: { x: g.cat.x, y: g.cat.y, vy: g.cat.vy, r: R, worldX: wx },
    poles: g.course.poles
      .filter((p) => p.x + p.w > wx - 80 && p.x < wx + WORLD.width)
      .map((p) => ({ n: p.n, x: p.x - g.dist, w: p.w, top: p.top, bottom: p.bottom, center: p.center, gap: p.gap, passed: p.passed, fish: p.fish ? { x: p.fish.x - g.dist, y: p.fish.y, taken: p.fish.taken } : null })),
    hit: g.hit,
  };
}
