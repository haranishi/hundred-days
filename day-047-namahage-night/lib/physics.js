import { getLevel, markers, tileAt } from './levels.js';
import { createEntities, updateEntities, overlap } from './entities.js';
export const DT = 1 / 120;
export const SIZES = [
  { w: 10, h: 14 },
  { w: 12, h: 20 },
  { w: 12, h: 24 },
];
// プレイヤーの移動・ジャンプ・被弾の調整値。
export const RULES = Object.freeze({
  gravity: 900,
  acceleration: 700,
  speed: 110,
  friction: 900,
  airFriction: 120,
  fall: 420,
  jump: -300,
  strongJump: -330,
  cut: -120,
  coyote: 0.08,
  buffer: 0.1,
  bounce: -220,
  invincible: 1.2,
});
export function createState(id = '1-1', options = {}) {
  const level = options.level ?? getLevel(id),
    start = markers(level, 'P')[0],
    stage = options.stage ?? 0;
  return {
    id,
    level,
    tick: 0,
    elapsedTicks: 0,
    status: 'playing',
    lives: options.lives ?? 3,
    stage,
    score: options.score ?? 0,
    rice: options.rice ?? 0,
    mochi: 0,
    deathTicks: 0,
    jumpHeld: false,
    events: [],
    entities: createEntities(level, id),
    player: {
      x: start.x,
      y: start.y + 16 - SIZES[stage].h,
      ...SIZES[stage],
      vx: 0,
      vy: 0,
      grounded: true,
      coyote: RULES.coyote,
      buffer: 0,
      jumps: 0,
      invincible: 0,
      support: null,
      facing: 1,
    },
  };
}
// 固定地形は面ごとに一度だけ展開する。
const terrainCache = new WeakMap();
function solids(level) {
  if (!terrainCache.has(level)) {
    terrainCache.set(
      level,
      markers(level, '#~=').map(e => ({ ...e, w: 16, h: 16 })),
    );
  }
  return terrainCache.get(level);
}
const approach = (n, d) => Math.sign(n) * Math.max(0, Math.abs(n) - d);
function resize(s, stage) {
  const bottom = s.player.y + s.player.h;
  s.stage = stage;
  Object.assign(s.player, SIZES[stage]);
  s.player.y = bottom - s.player.h;
}
function miss(s) {
  if (s.status !== 'playing') {
    return;
  }
  s.lives--;
  s.status = 'dying';
  s.deathTicks = 96;
  s.events.push('hurt');
}
function hurt(s) {
  if (s.player.invincible > 0) {
    return;
  }
  if (s.stage === 0) {
    miss(s);
  } else {
    resize(s, s.stage - 1);
    s.player.invincible = RULES.invincible;
    s.events.push('hurt');
  }
}
// 固定刻みで入力を消費し、元の状態を変えずに進める。
export function step(state, input = {}) {
  if (state.status === 'clear' || state.status === 'over') {
    return state;
  }
  const s = {
    ...state,
    player: { ...state.player },
    entities: state.entities.map(e => ({ ...e })),
    events: [],
  };
  s.elapsedTicks++;
  s.tick++;
  if (s.status === 'dying') {
    if (--s.deathTicks <= 0) {
      return s.lives <= 0
        ? { ...s, status: 'over' }
        : {
            ...createState(s.id, {
              level: s.level,
              lives: s.lives,
              score: s.score,
              rice: s.rice,
            }),
            elapsedTicks: s.elapsedTicks,
          };
    }
    return s;
  }
  const p = s.player,
    wasBottom = p.y + p.h;
  p.invincible = Math.max(0, p.invincible - DT);
  s.entities = updateEntities(s.entities, s.level, p, s.tick * DT, DT);
  const support = s.entities.find(
    e => e.id === p.support && e.alive && e.type === 'M',
  );
  if (support && p.grounded) {
    p.x += support.dx;
    p.y += support.dy;
  }
  const pressed = !!input.jump && !s.jumpHeld;
  s.jumpHeld = !!input.jump;
  p.buffer = pressed ? RULES.buffer : Math.max(0, p.buffer - DT);
  p.coyote = p.grounded ? RULES.coyote : Math.max(0, p.coyote - DT);
  if (
    p.buffer > 0 &&
    (p.coyote > 0 || (s.stage === 2 && p.jumps < 2 && pressed))
  ) {
    p.vy = s.stage === 0 ? RULES.jump : RULES.strongJump;
    p.grounded = false;
    p.coyote = 0;
    p.buffer = 0;
    p.jumps++;
    p.support = null;
    s.events.push('jump');
  }
  if (!input.jump && p.vy < RULES.cut) {
    p.vy = RULES.cut;
  }
  const move = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (move) {
    p.vx += move * RULES.acceleration * DT;
    p.facing = move;
  } else {
    const ice =
      p.grounded && tileAt(s.level, p.x + p.w / 2, p.y + p.h + 1) === '~';
    p.vx = approach(
      p.vx,
      (p.grounded ? RULES.friction * (ice ? 0.25 : 1) : RULES.airFriction) * DT,
    );
  }
  p.vx = Math.max(
    -RULES.speed,
    Math.min(RULES.speed, p.vx + s.level.wind * DT),
  );
  const blocks = solids(s.level);
  p.x += p.vx * DT;
  for (const b of blocks) {
    if (b.type !== '=' && overlap(p, b)) {
      p.x = p.vx > 0 ? b.x - p.w : b.x + b.w;
      p.vx = 0;
    }
  }
  p.x = Math.max(0, Math.min(s.level.rows[0].length * 16 - p.w, p.x));
  const bottom = p.y + p.h;
  p.vy = Math.min(RULES.fall, p.vy + RULES.gravity * DT);
  p.y += p.vy * DT;
  p.grounded = false;
  p.support = null;
  const platforms = s.entities.filter(e => e.type === 'M' && e.alive);
  for (const b of [...blocks, ...platforms]) {
    if (!overlap(p, b)) {
      continue;
    }
    const previousTop = b.y - (b.id === support?.id ? 0 : (b.dy ?? 0));
    if (
      (b.type === '=' || b.type === 'M') &&
      (p.vy < 0 || bottom > previousTop + 0.01)
    ) {
      continue;
    }
    if (p.vy >= 0 && bottom <= previousTop + 0.01) {
      p.y = b.y - p.h;
      p.vy = 0;
      p.grounded = true;
      p.jumps = 0;
      p.support = b.type === 'M' ? b.id : null;
    } else if (p.vy < 0 && b.type !== '=' && b.type !== 'M') {
      p.y = b.y + b.h;
      p.vy = 0;
    }
  }
  // 先行入力は着地した同じ刻みに消費する。
  if (p.grounded && p.buffer > 0) {
    p.vy = s.stage === 0 ? RULES.jump : RULES.strongJump;
    p.grounded = false;
    p.jumps = 1;
    p.buffer = 0;
    p.coyote = 0;
    s.events.push('jump');
  }
  for (const e of s.entities) {
    if (!e.alive || !overlap(p, e)) {
      continue;
    }
    if (e.type === 'o') {
      e.alive = false;
      s.mochi++;
      if (s.stage < 2) {
        resize(s, s.stage + 1);
      } else {
        s.score += 100;
      }
      s.events.push('mochi');
    }
    if (e.type === '*') {
      e.alive = false;
      s.score += 50;
      s.rice++;
      if (s.rice % 20 === 0) {
        s.lives++;
      }
    }
    if (e.type === 'C' || e.type === 'D') {
      if (p.vy > 0 && wasBottom <= e.y - (e.dy ?? 0) + 2) {
        e.alive = false;
        p.y = e.y - p.h;
        p.vy = RULES.bounce;
        p.jumps = 0;
        s.events.push('stomp');
      } else {
        hurt(s);
      }
    }
    if (e.type === '^') {
      hurt(s);
    }
    if (e.type === 'G' && s.status === 'playing') {
      s.status = 'clear';
      s.events.push('door');
    }
  }
  if (p.y > 208) {
    miss(s);
  }
  return s;
}
export function advance(state, seconds, input = {}, remainder = 0) {
  let remaining = remainder + seconds,
    s = state;
  while (remaining + 1e-10 >= DT) {
    s = step(s, input);
    remaining -= DT;
  }
  return { state: s, remainder: Math.max(0, remaining) };
}
