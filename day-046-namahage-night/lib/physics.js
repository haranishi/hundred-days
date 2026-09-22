import { getLevel, markers, tileAt } from './levels.js';
import { createEntities, updateEntities, overlap, isPlatform } from './entities.js';
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
  const s = {
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
    ability: null,
    abilityTicks: 0,
    pendingStage: null,
    collectedRice: 0,
    secretCollected: false,
    runHits: 0,
    runMisses: 0,
    attemptScore: 0,
    entryScore: options.score ?? 0,
    entryRice: options.rice ?? 0,
    entryLives: options.lives ?? 3,
    combo: 0,
    clearResult: null,
    telemetry: [],
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
  observeVisible(s);
  return s;
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
// 共通観測: type/tick/entityId/kind/cause。描画用のscore・座標などは互換用に併記する。
// ability.kind は acquire/refresh/replace/expired/hit/miss。collect.kind は米俵・餅・任意餅を区別する。
function emit(s, type, data = {}) {
  s.telemetry.push({ type, tick: s.tick, elapsedTicks: s.elapsedTicks, ...data });
}
// カメラの窓に初めて入った刻みを、開始時も含めて記録する。
function observeVisible(s) {
  for (const e of s.entities) {
    if (e.alive && 'CDRB'.includes(e.type) && !e.visible &&
        e.x + e.w > s.player.x - 110 && e.x < s.player.x + 210) {
      e.visible = true;
      emit(s, 'visible', { entityId: e.id, kind: e.type });
    }
  }
}
function award(s, points, source) {
  s.score += points;
  s.attemptScore += points;
  emit(s, 'score', { points, x: source.x, y: source.y });
}
function grow(s, stage) {
  const p = s.player;
  const candidate = { ...p, ...SIZES[stage], y: p.y + p.h - SIZES[stage].h };
  if (solids(s.level).some(b => b.type !== '=' && overlap(candidate, b))) {
    s.pendingStage = stage;
  } else {
    resize(s, stage);
    s.pendingStage = null;
  }
}
function loseAbility(s, reason) {
  if (s.ability) emit(s, 'ability', { kind: reason, ability: s.ability });
  s.ability = null;
  s.abilityTicks = 0;
}
function miss(s, cause = 'fall', entityId) {
  if (s.status !== 'playing') return;
  s.runMisses++;
  s.lives = s.entryLives - s.runMisses;
  s.score = s.entryScore;
  s.rice = s.entryRice;
  s.attemptScore = 0;
  s.collectedRice = 0;
  s.secretCollected = false;
  s.combo = 0;
  s.pendingStage = null;
  loseAbility(s, 'miss');
  s.status = 'dying';
  s.deathTicks = 96;
  s.events.push('hurt');
  emit(s, 'miss', { cause, ...(entityId === undefined ? {} : { entityId }), x: s.player.x, y: s.player.y });
}
const CAUSES = { D: 'ground', C: 'air', '^': 'icicle', B: 'boar', R: 'rabbit' };
function hurt(s, enemy) {
  if (s.status !== 'playing' || s.player.invincible > 0 || s.telemetry.some(e => e.type === 'hit')) return;
  s.runHits++;
  s.combo = 0;
  s.pendingStage = null;
  loseAbility(s, 'hit');
  emit(s, 'hit', { cause: CAUSES[enemy.type], entityId: enemy.id, x: s.player.x, y: s.player.y });
  if (s.stage === 0) {
    miss(s, CAUSES[enemy.type], enemy.id);
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
    telemetry: [],
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
              lives: s.entryLives,
              score: s.entryScore,
              rice: s.entryRice,
            }),
            lives: s.lives,
            runHits: s.runHits,
            runMisses: s.runMisses,
            elapsedTicks: s.elapsedTicks,
          };
    }
    return s;
  }
  const abilityAtStart = s.ability;
  const p = s.player,
    wasBottom = p.y + p.h;
  if (s.ability && s.abilityTicks === 0) loseAbility(s, 'expired');
  p.invincible = Math.max(0, p.invincible - DT);
  s.entities = updateEntities(s.entities, s.level, p, s.tick * DT, DT);
  for (const e of s.entities) {
    const previous = state.entities.find(old => old.id === e.id);
    if (previous.phase !== e.phase && ['warning', 'moving'].includes(e.phase)) {
      emit(s, e.phase, { entityId: e.id, kind: e.type });
    }
  }
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
    p.vx += move * (s.ability === 'S' ? 1000 : RULES.acceleration) * DT;
    p.facing = move;
  } else {
    const ice =
      p.grounded && tileAt(s.level, p.x + p.w / 2, p.y + p.h + 1) === '~';
    p.vx = approach(
      p.vx,
      (p.grounded ? (s.ability === 'S' ? 1200 : RULES.friction) * (ice ? 0.25 : 1) : RULES.airFriction) * DT,
    );
  }
  const speed = s.ability === 'S' ? 150 : RULES.speed;
  p.vx = Math.max(
    -speed,
    Math.min(speed, p.vx + s.level.wind * DT),
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
  const glide = s.ability === 'F' && !p.grounded && p.vy >= 0 && input.jump;
  p.vy = Math.min(glide ? 70 : RULES.fall, p.vy + (glide ? 240 : RULES.gravity) * DT);
  p.y += p.vy * DT;
  p.grounded = false;
  p.support = null;
  const platforms = s.entities.filter(isPlatform);
  for (const b of [...blocks, ...platforms]) {
    if (!overlap(p, b)) {
      continue;
    }
    const previousTop = b.y - (b.id === support?.id ? 0 : (b.dy ?? 0));
    if (
      (b.type === '=' || isPlatform(b)) &&
      (p.vy < 0 || bottom > previousTop + 0.01)
    ) {
      continue;
    }
    if (p.vy >= 0 && bottom <= previousTop + 0.01) {
      p.y = b.y - p.h;
      p.vy = 0;
      p.grounded = true;
      p.jumps = 0;
      p.support = isPlatform(b) ? b.id : null;
      s.combo = 0;
      if (b.type === '%' && !b.triggered) {
        b.triggered = true;
        b.phaseTicks = 0;
        emit(s, 'branch', { entityId: b.id });
      }
      if (b.type === 'J') {
        p.vy = -380;
        p.grounded = false;
        p.jumps = 1;
        p.coyote = 0;
        p.buffer = 0;
        p.support = null;
        s.events.push('jump');
        emit(s, 'snowpad', { entityId: b.id });
        break;
      }
    } else if (p.vy < 0 && b.type !== '=' && !isPlatform(b)) {
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
  if (s.pendingStage !== null) grow(s, s.pendingStage);
  // 収集を確定してから敵接触、最後に戸口を判定する。
  for (const e of s.entities) {
    if (!e.alive || !'o*FS'.includes(e.type) || !overlap(p, e)) continue;
    e.alive = false;
    const secret = s.level.secretMochi;
    const optional = e.type === 'o' && secret && e.x === secret.col * 16 && e.y === secret.row * 16;
    emit(s, 'collect', { entityId: e.id, kind: e.type === '*' ? 'rice' : e.type === 'o' ? (optional ? 'secret' : 'mochi') : e.type, x: e.x, y: e.y });
    if (e.type === 'o') {
      s.mochi++;
      s.secretCollected ||= !!optional;
      award(s, optional ? 300 : 100, e);
      grow(s, Math.min(2, (s.pendingStage ?? s.stage) + 1));
      s.events.push('mochi');
    } else if (e.type === '*') {
      award(s, 50, e);
      s.rice++;
      s.collectedRice++;
      if (s.rice % 20 === 0) s.lives++;
    } else {
      const kind = s.ability === e.type ? 'refresh' : s.ability ? 'replace' : 'acquire';
      s.ability = e.type;
      s.abilityTicks = e.type === 'F' ? 1440 : 960;
      emit(s, 'ability', { kind, entityId: e.id, ability: e.type, ticks: s.abilityTicks });
      s.events.push('mochi');
    }
  }
  for (const e of s.entities) {
    if (s.status !== 'playing' || !e.alive || !'CDRB^'.includes(e.type) || !overlap(p, e)) continue;
    const relativeDescent = p.y + p.h - wasBottom - e.dy;
    if (e.type !== '^' && p.vy > 0 && relativeDescent > 0 && wasBottom <= e.y - e.dy + 2) {
      e.alive = false;
      e.phase = 'retired';
      e.retireTicks = 24;
      s.combo++;
      const multiplier = Math.min(3, s.combo);
      award(s, (e.type === 'B' ? 150 : 100) * multiplier, e);
      emit(s, 'stomp', { entityId: e.id, kind: e.type, enemy: e.type, multiplier, x: e.x, y: e.y });
      p.y = e.y - p.h;
      p.vy = RULES.bounce;
      p.jumps = 0;
      p.grounded = false;
      p.support = null;
      s.events.push('stomp');
    } else {
      hurt(s, e);
    }
  }
  if (p.y > 208) miss(s);
  if (s.status === 'playing' && s.entities.some(e => e.type === 'G' && overlap(p, e))) {
    const par = s.level.parTicks ?? 2400;
    const fast = s.elapsedTicks <= par;
    const fortune = s.collectedRice === 6 && s.secretCollected;
    const unharmed = s.runHits === 0 && s.runMisses === 0;
    award(s, 500 + 10 * Math.floor(Math.max(0, par - s.elapsedTicks) / 120) +
      (fortune ? 300 : 0) + (unharmed ? 300 : 0), p);
    s.clearResult = {
      ticks: s.elapsedTicks,
      score: s.attemptScore,
      rice: s.collectedRice,
      secret: s.secretCollected,
      hits: s.runHits,
      misses: s.runMisses,
      seals: (fast ? 1 : 0) + (fortune ? 2 : 0) + (unharmed ? 4 : 0),
    };
    s.status = 'clear';
    s.events.push('door');
    emit(s, 'clear', { ...s.clearResult });
  }
  observeVisible(s);
  // 取得tickは減らさず、残り0の次の物理計算から通常値に戻す。
  if (s.ability && s.ability === abilityAtStart && !s.telemetry.some(e => e.type === 'ability')) {
    s.abilityTicks = Math.max(0, s.abilityTicks - 1);
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
