import { HEAT_MAX, clamp, laneAt, decayHeat, rememberPosition, heatOf, readLevel, predictedX, flinchProbability, outsmarted } from './lanes.js';
import { createFleet, alive, interval, march, invaded, shooters, enemyRect, waveConfig, ENEMY_BULLETS_MAX } from './fleet.js';
import { intersects } from './collision.js';
import { loadout, MAX_LEVEL } from './upgrades.js';
const HEAT_PER_SECOND = 4, BONUS_FLOAT_INTERVAL = 0.6, LEVEL_FLASH_SECONDS = 1.4;
const ITEM_CHANCE = 0.16, ITEM_LIMIT = 6, ITEM_SIZE = 20, ITEM_SPEED = 120, ITEM_BOTTOM = 660;
const SHOT_OFFSETS = { 1: [0], 2: [-11, 11], 3: [-20, 0, 20] };
const BULLET_TOP = 56;
function scoreFloat(s, x, y, points) {
  const existing = s.floats.find(f => f.kind === 'score' && Math.abs(f.x - x) < 28 && Math.abs(f.y - y) < 28);
  if (existing) {
    existing.points += points;
    existing.text = `+${existing.points}`;
    existing.life = 0.9;
  } else {
    s.floats.push({ x, y, life: 0.9, kind: 'score', points, text: `+${points}` });
  }
}
function levelUp(s) {
  if (s.level >= MAX_LEVEL) {
    s.score += 100;
    s.floats.push({ x: 240, y: 390, life: LEVEL_FLASH_SECONDS, text: '+100' });
    return;
  }
  s.level++; s.levelFlash = LEVEL_FLASH_SECONDS;
  s.floats = s.floats.filter(f => f.kind !== 'level');
  s.floats.push({ x: 240, y: 390, life: LEVEL_FLASH_SECONDS, kind: 'level', text: `LV${s.level} ${loadout(s.level).label}` }); s.events.push('levelup');
}
export function createGame(status = 'empty') {
  return { status, level: 1, levelFlash: 0, bonusFloatCooldown: 0, items: [], score: 0, lives: 3, wave: 1, time: 0, player: { x: 264, y: 592 }, fleet: createFleet(), bullets: [], enemyBullets: [], shotHeat: Array(12).fill(0), kills: 0, bonusKills: 0, waveTime: 0, waveTransition: 0, positions: [], sampleClock: 0, shotCooldown: 0, enemyClock: 0, invincible: 0, heat: Array(12).fill(0), readLevel: 0, predictedX: 264, events: [], floats: [], aimHintShown: false, reason: '' };
}
// 秒単位。入力状態は変更せず、次の状態と描画・音用イベントを返す。
export function step(previous, dt, input = {}, rng = Math.random, onEnemyShot) {
  if (previous.status !== 'playing') return previous;
  const s = structuredClone(previous);
  dt = clamp(dt, 0, 0.05);
  s.events = []; s.time += dt;
  s.levelFlash = Math.max(0, s.levelFlash - dt); s.bonusFloatCooldown = Math.max(0, s.bonusFloatCooldown - dt);
  s.floats = s.floats.map(f => ({ ...f, life: f.life - dt, y: f.y - 18 * dt })).filter(f => f.life > 0);
  s.shotCooldown = Math.max(0, s.shotCooldown - dt);
  if (s.shotCooldown < 1e-10) s.shotCooldown = 0;
  s.fleet.flinchCooldown = Math.max(0, s.fleet.flinchCooldown - dt);
  s.fleet.flinchTime = Math.max(0, s.fleet.flinchTime - dt);
  if (!s.fleet.flinchTime) s.fleet.offset = 0;
  const target = Number.isFinite(input.targetX) ? input.targetX : s.player.x + ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 320 * dt;
  s.player.x = clamp(s.player.x + clamp(target - s.player.x, -320 * dt, 320 * dt), 24, 456);
  s.sampleClock += dt;
  while (s.sampleClock + 1e-10 >= 0.2) { s.sampleClock -= 0.2; s.positions = rememberPosition(s.positions, s.player.x); }
  s.predictedX = predictedX(s.positions, s.player.x);
  s.shotHeat = decayHeat(s.shotHeat, dt);
  const lane = laneAt(s.player.x);
  s.shotHeat[lane] = Math.min(HEAT_MAX, s.shotHeat[lane] + dt * HEAT_PER_SECOND);
  s.heat = heatOf(s.shotHeat); s.readLevel = readLevel(s.shotHeat, s.positions);
  for (const item of s.items) item.y += item.vy * dt;
  s.items = s.items.filter(item => {
    if (item.y > ITEM_BOTTOM) return false;
    if (!intersects(item, { x: s.player.x - 20, y: 574, w: 40, h: 28 })) return true;
    s.events.push('pickup'); levelUp(s); return false;
  });
  if (s.waveTransition > 0) {
    s.waveTransition = Math.max(0, s.waveTransition - dt);
    if (s.waveTransition < 1e-10) {
      s.waveTransition = 0; s.fleet = createFleet(s.wave, s.level); s.waveTime = 0;
    }
    return s;
  }
  s.waveTime += dt;
  if (s.invincible > 0) { s.invincible = Math.max(0, s.invincible - dt); return s; }
  // ▽が何を指しているかは初回だけ言葉で教える。以降は記号だけで足りる。
  if (!s.aimHintShown && s.time >= 4 && Math.abs(s.predictedX - s.player.x) < 12) {
    s.aimHintShown = true;
    s.floats.push({ x: s.predictedX, y: 535, life: 1.5, text: '▽ ここを狙われている' });
  }
  const equipment = loadout(s.level);
  if (s.bullets.length + equipment.columns <= equipment.volleys * equipment.columns && s.shotCooldown <= 0) {
    const lane = laneAt(s.player.x), bonus = outsmarted(s.heat, lane);
    for (const offset of SHOT_OFFSETS[equipment.columns]) s.bullets.push({ x: s.player.x + offset - equipment.width / 2, y: 568, w: equipment.width, h: 16, bonus });
    if (!s.fleet.flinchCooldown && rng() < flinchProbability(s.heat[lane])) {
      s.fleet.flinchCount++;
      const distance = s.wave >= 3 && s.fleet.flinchCount % 2 === 0 ? 24 : 16;
      s.fleet.offset = s.player.x < 240 ? distance : -distance;
      s.fleet.flinchTime = 0.15; s.fleet.flinchCooldown = 0.7; s.events.push('flinch');
    }
    s.shotCooldown = equipment.cooldown; s.events.push('fire');
  }
  s.fleet.clock += dt;
  if (s.fleet.clock >= interval(alive(s.fleet).length, s.wave, s.level)) {
    s.fleet.clock = 0; s.fleet = march(s.fleet); s.events.push('march');
  }
  for (const b of s.bullets) {
    b.y -= 860 * dt;
    const e = alive(s.fleet).find(e => intersects(b, enemyRect(s.fleet, e)));
    if (e) {
      e.alive = false; b.y = -100; s.score += e.points * (b.bonus ? 2 : 1); s.kills++; if (b.bonus) s.bonusKills++; s.events.push('hit');
      if (!b.bonus || s.bonusFloatCooldown <= 0) {
        if (b.bonus) s.floats.push({ x: e.x + s.fleet.x, y: e.y + s.fleet.y, life: 0.9, text: '裏をかいた ×2' });
        else scoreFloat(s, e.x + s.fleet.x, e.y + s.fleet.y, e.points);
        if (b.bonus) s.bonusFloatCooldown = BONUS_FLOAT_INTERVAL;
      }
      if (s.items.length < ITEM_LIMIT && rng() < ITEM_CHANCE) s.items.push({ x: e.x + s.fleet.x + s.fleet.offset, y: e.y + s.fleet.y, w: ITEM_SIZE, h: ITEM_SIZE, vy: ITEM_SPEED });
    }
  }
  s.bullets = s.bullets.filter(b => b.y + b.h > BULLET_TOP);
  if (s.waveTime >= 3) s.enemyClock += dt;
  const pressure = waveConfig(s.wave, s.level);
  if (s.waveTime >= 3 && s.enemyClock + 1e-10 >= pressure.fireInterval) {
    s.enemyClock = 0;
    const candidates = shooters(s.fleet);
    const count = candidates.length ? pressure.burst : 0;
    let remaining = [...candidates];
    for (let i = 0; i < count; i++) {
      if (s.enemyBullets.length >= ENEMY_BULLETS_MAX) break;
      if (!remaining.length) remaining = [...candidates];
      const [e] = remaining.splice(Math.floor(rng() * remaining.length), 1);
      const r = enemyRect(s.fleet, e), x = r.x + r.w / 2, y = r.y + r.h;
      const spread = pressure.aimSpread;
      const dx = s.predictedX + (rng() * 2 - 1) * spread - x, dy = s.player.y - y, norm = Math.hypot(dx, dy);
      // 弾の先端が当たり判定に届くまでにも0.45秒を残す。
      if (dy <= 24) continue;
      const speed = Math.min(pressure.bulletSpeed, (dy - 24) / 0.45);
      const bullet = { x, y, w: 6, h: 12, vx: dx / norm * speed, vy: dy / norm * speed };
      s.enemyBullets.push(bullet);
      onEnemyShot?.(bullet, s.enemyBullets.length);
    }
  }
  for (const b of s.enemyBullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
  if (s.enemyBullets.some(b => intersects(b, { x: s.player.x - 15, y: 580, w: 30, h: 24 }))) {
    s.lives--; s.invincible = 1.2; s.enemyBullets = []; s.bullets = []; s.events.push('hurt');
  }
  s.enemyBullets = s.enemyBullets.filter(b => b.y < 660 && b.x > -20 && b.x < 500);
  if (!s.lives || invaded(s.fleet)) { s.status = 'over'; s.reason = s.lives ? '艦隊が防衛線に到達' : 'ライフがなくなった'; }
  else if (!alive(s.fleet).length) {
    const reward = 50 * s.wave;
    s.score += reward;
    // 報酬と強化が読めるよう旧ポップを消し、y=330のウェーブ表示とも高さを分ける。
    s.floats = [{ x: 240, y: 250, life: 1.5, text: `ウェーブ${s.wave} クリア +${reward}` }];
    s.wave++; s.waveTransition = 1.5; s.enemyBullets = []; s.bullets = []; s.enemyClock = 0; s.events.push('wave'); levelUp(s);
  }
  return s;
}
export function snapshot(s) {
  return structuredClone({ status: s.status, level: s.level, levelFlash: s.levelFlash, items: s.items, score: s.score, lives: s.lives, wave: s.wave, readLevel: s.readLevel, kills: s.kills, bonusKills: s.bonusKills, waveTime: s.waveTime, waveTransition: s.waveTransition, shotCooldown: s.shotCooldown, fleet: s.fleet, alive: alive(s.fleet).length, player: s.player, bullets: s.bullets, enemyBullets: s.enemyBullets, predictedX: s.predictedX, heat: s.heat });
}
export function autoInput(s) {
  // 見せたいのは「動いて読ませない」遊び方。落ちてくるアイテムを追うと真下で数秒止まって熱が振り切れるので、追わない。
  const threat = s.enemyBullets.find(b => b.y > 360 && Math.abs(b.x - s.player.x) < 54);
  if (threat) return { targetX: clamp(s.player.x + (threat.x < s.player.x ? 130 : -130), 24, 456) };
  const phase = (s.time % 4.4) / 2.2;
  return { targetX: 24 + 432 * (phase < 1 ? phase : 2 - phase) };
}
