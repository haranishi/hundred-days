// Usage: node day-045-read-your-shots/tools/tune.mjs
// Optional: append exactly five integer seeds (defaults: 1 2 3 4 5).
// Runs the real game at 60 Hz. Shuttle starts toward the left edge; the first
// bullet in array order with y > 300 and |dx| < 60 overrides the target by
// 150 px away from that bullet (ties use shuttle direction). Only reaching
// an edge changes shuttle direction. No item chasing or state manipulation.
// Arrival is measured at emission, before movement/hit/wave cleanup, as
// (592 - spawnY) / vy, including shots later cleared or leaving sideways.
// Peak count includes the instant of emission before same-frame cleanup.
// readAverage includes every playing frame, including transitions/invincibility.
// A 600 s watchdog reports a censored run and exits unsuccessfully; it is not a death.
import { createGame, step } from '../lib/game.js';
import { waveConfig } from '../lib/fleet.js';
import { mulberry32 } from '../lib/rng.js';

const seeds = process.argv.length > 2 ? process.argv.slice(2).map(Number) : [1, 2, 3, 4, 5];
if (seeds.length !== 5 || seeds.some(n => !Number.isInteger(n) || n < 0 || n > 0xffffffff)) {
  throw new Error('Supply exactly five unsigned 32-bit integer seeds.');
}
const results = seeds.map(seed => {
  const rng = mulberry32(seed);
  let s = createGame('playing'), direction = -1, frames = 0, readSum = 0, firstHit = null;
  let minArrivalSeconds = Infinity, maxEnemyBullets = 0, maxMarchSpeed = 0, level30Seconds = null;
  while (s.status !== 'over') {
    if (frames >= 600 * 60) break;
    if (s.player.x <= 24) direction = 1;
    if (s.player.x >= 456) direction = -1;
    let targetX = direction < 0 ? 24 : 456;
    const threat = s.enemyBullets.find(b => b.y > 300 && Math.abs(b.x - s.player.x) < 60);
    if (threat) targetX = s.player.x + (Math.sign(s.player.x - threat.x) || direction) * 150;
    maxMarchSpeed = Math.max(maxMarchSpeed, waveConfig(s.wave, s.level).speed);
    const previousLives = s.lives, previousWave = s.wave;
    s = step(s, 1 / 60, { targetX }, rng, (bullet, count) => {
      minArrivalSeconds = Math.min(minArrivalSeconds, (592 - bullet.y) / bullet.vy);
      maxEnemyBullets = Math.max(maxEnemyBullets, count);
    });
    frames++; readSum += s.readLevel;
    maxMarchSpeed = Math.max(maxMarchSpeed, waveConfig(s.wave, s.level).speed);
    if (s.level === 30 && level30Seconds === null) level30Seconds = s.time;
    if (s.lives < previousLives && firstHit === null) firstHit = { seconds: s.time, wave: previousWave };
  }
  return { seed, status: s.status, seconds: s.time, wave: s.wave, level: s.level, score: s.score,
    minArrivalSeconds, maxEnemyBullets, maxMarchSpeed, level30Seconds, kills: s.kills, bonusKills: s.bonusKills, readAverage: readSum / frames,
    firstHitSeconds: firstHit?.seconds ?? null, firstHitWave: firstHit?.wave ?? null, reason: s.reason };
});
const keys = ['seconds', 'wave', 'level', 'score', 'kills', 'bonusKills', 'readAverage', 'minArrivalSeconds', 'maxEnemyBullets'];
const median = Object.fromEntries(keys.map(key => [key, results.map(r => r[key]).sort((a, b) => a - b)[2]]));
const round = (_, value) => typeof value === 'number' ? Math.round(value * 10000) / 10000 : value;
const completed = results.every(r => r.status === 'over');
console.log(JSON.stringify({ results, median: completed ? median : null, level30SecondsMedian: results.every(r => r.level30Seconds !== null)
    ? results.map(r => r.level30Seconds).sort((a, b) => a - b)[2] : null,
  maxMarchSpeed: Math.max(...results.map(r => r.maxMarchSpeed)),
  minArrivalSeconds: Math.min(...results.map(r => r.minArrivalSeconds)),
  maxEnemyBullets: Math.max(...results.map(r => r.maxEnemyBullets)),
  fairnessMet: results.every(r => r.minArrivalSeconds >= .45 && r.maxEnemyBullets <= 30 && r.maxMarchSpeed <= 4),
  openingSafe: results.every(r => r.firstHitWave === null || r.firstHitWave >= 3) }, round, 2));

if (!completed) process.exitCode = 1;
