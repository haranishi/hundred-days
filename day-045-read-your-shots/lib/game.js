import { clamp, laneAt, decayHeat, rememberPosition, heatOf, readLevel, predictedX, flinchProbability, outsmarted } from './lanes.js';
import { createFleet, alive, interval, march, invaded, shooters, enemyRect, waveConfig } from './fleet.js';
import { intersects } from './collision.js';
export function createGame(status = 'empty') {
  return { status, score: 0, lives: 3, wave: 1, time: 0, player: { x: 264, y: 592 }, fleet: createFleet(), bullets: [], enemyBullets: [], shotHeat: Array(12).fill(0), kills: 0, bonusKills: 0, waveTime: 0, waveTransition: 0, positions: [], sampleClock: 0, shotCooldown: 0, enemyClock: 0, invincible: 0, heat: Array(12).fill(0), readLevel: 0, predictedX: 264, events: [], floats: [], aimHintShown: false, reason: '' };
}
// 秒単位。入力状態は変更せず、次の状態と描画・音用イベントを返す。
export function step(previous, dt, input = {}, rng = Math.random) {
  if (previous.status !== 'playing') return previous;
  const s = structuredClone(previous);
  dt = clamp(dt, 0, 0.05);
  s.events = []; s.time += dt;
  s.floats = s.floats.map(f => ({ ...f, life: f.life - dt, y: f.y - 18 * dt })).filter(f => f.life > 0);
  s.shotCooldown = Math.max(0, s.shotCooldown - dt);
  s.fleet.flinchCooldown = Math.max(0, s.fleet.flinchCooldown - dt);
  s.fleet.flinchTime = Math.max(0, s.fleet.flinchTime - dt);
  if (!s.fleet.flinchTime) s.fleet.offset = 0;
  const target = Number.isFinite(input.targetX) ? input.targetX : s.player.x + ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 320 * dt;
  s.player.x = clamp(s.player.x + clamp(target - s.player.x, -320 * dt, 320 * dt), 24, 456);
  s.sampleClock += dt;
  while (s.sampleClock + 1e-10 >= 0.2) { s.sampleClock -= 0.2; s.positions = rememberPosition(s.positions, s.player.x); }
  s.predictedX = predictedX(s.positions, s.player.x);
  s.shotHeat = decayHeat(s.shotHeat, dt);
  s.heat = heatOf(s.shotHeat); s.readLevel = readLevel(s.shotHeat, s.positions);
  if (s.waveTransition > 0) {
    s.waveTransition = Math.max(0, s.waveTransition - dt);
    if (s.waveTransition < 1e-10) {
      s.waveTransition = 0; s.fleet = createFleet(s.wave); s.waveTime = 0;
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
  if (input.fire && s.bullets.length < 2 && s.shotCooldown <= 1e-10) {
    const lane = laneAt(s.player.x), bonus = outsmarted(s.heat, lane);
    s.bullets.push({ x: s.player.x - 2, y: 568, w: 4, h: 16, bonus });
    if (!s.fleet.flinchCooldown && rng() < flinchProbability(s.heat[lane])) {
      s.fleet.flinchCount++;
      const distance = s.wave >= 3 && s.fleet.flinchCount % 2 === 0 ? 24 : 16;
      s.fleet.offset = s.player.x < 240 ? distance : -distance;
      s.fleet.flinchTime = 0.15; s.fleet.flinchCooldown = 0.7; s.events.push('flinch');
    }
    s.shotHeat[lane]++; s.heat = heatOf(s.shotHeat); s.readLevel = readLevel(s.shotHeat, s.positions);
    s.shotCooldown = 0.25; s.events.push('fire');
  }
  s.fleet.clock += dt;
  if (s.fleet.clock >= interval(alive(s.fleet).length, s.wave)) {
    s.fleet.clock = 0; s.fleet = march(s.fleet); s.events.push('march');
  }
  for (const b of s.bullets) {
    b.y -= 860 * dt;
    const e = alive(s.fleet).find(e => intersects(b, enemyRect(s.fleet, e)));
    if (e) {
      e.alive = false; b.y = -100; s.score += e.points * (b.bonus ? 2 : 1); s.kills++; if (b.bonus) s.bonusKills++; s.events.push('hit');
      s.floats.push({ x: e.x + s.fleet.x, y: e.y + s.fleet.y, life: 0.9, text: b.bonus ? '裏をかいた ×2' : `+${e.points}` });
    }
  }
  s.bullets = s.bullets.filter(b => b.y > -20);
  if (s.waveTime >= 3) s.enemyClock += dt;
  if (s.waveTime >= 3 && s.enemyClock + 1e-10 >= waveConfig(s.wave).fireInterval) {
    s.enemyClock = 0;
    const candidates = shooters(s.fleet), e = candidates[Math.floor(rng() * candidates.length)];
    if (e) {
      const r = enemyRect(s.fleet, e), x = r.x + r.w / 2, y = r.y + r.h, speed = 170 + 18 * s.wave;
      const spread = Math.max(10, 70 - 20 * (s.wave - 1));
      const dx = s.predictedX + (rng() * 2 - 1) * spread - x, dy = s.player.y - y, norm = Math.hypot(dx, dy);
      s.enemyBullets.push({ x, y, w: 6, h: 12, vx: dx / norm * speed, vy: dy / norm * speed });
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
    // 残っている得点ポップを消してから1件だけ置く。y=330の「WAVE n」と重ねない。
    s.floats = [{ x: 240, y: 250, life: 1.5, text: `ウェーブ${s.wave} クリア +${reward}` }];
    s.wave++; s.waveTransition = 1.5; s.enemyBullets = []; s.bullets = []; s.enemyClock = 0; s.events.push('wave');
  }
  return s;
}
export function snapshot(s) {
  return structuredClone({ status: s.status, score: s.score, lives: s.lives, wave: s.wave, readLevel: s.readLevel, kills: s.kills, bonusKills: s.bonusKills, waveTime: s.waveTime, waveTransition: s.waveTransition, shotCooldown: s.shotCooldown, fleet: s.fleet, alive: alive(s.fleet).length, player: s.player, bullets: s.bullets, enemyBullets: s.enemyBullets, predictedX: s.predictedX, heat: s.heat });
}
export function autoInput(s) {
  const threat = s.enemyBullets.find(b => b.y > 380 && Math.abs(b.x - s.player.x) < 42);
  const targets = alive(s.fleet).sort((a, b) => b.row - a.row || Math.abs(a.x + s.fleet.x - s.player.x) - Math.abs(b.x + s.fleet.x - s.player.x));
  const e = targets[0];
  let targetX = e ? e.x + s.fleet.x + s.fleet.offset : 240;
  if (s.waveTime < 3) targetX = clamp(targetX, 192, 288);
  if (Math.floor(s.time) % 7 === 6) targetX += s.player.x < 240 ? 65 : -65;
  if (threat) targetX = s.player.x + (s.player.x < 240 ? 85 : -85);
  return { targetX: clamp(targetX, 24, 456), fire: true };
}
