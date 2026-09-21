const WAVE_SPEED_GAIN = 0.22, LEVEL_SPEED_GAIN = 0.05, MARCH_SPEED_MAX = 4, BURST_MAX = 6;
const FIRE_INTERVAL_MIN = 0.22, FIRE_INTERVAL_BASE = 5, FIRE_INTERVAL_FACTOR = 0.6;
const FIRE_INTERVAL_LEVEL_FACTOR = 0.9, ENEMY_SPEED_PER_LEVEL = 4;
export const ENEMY_BULLET_SPEED_MAX = 620;
export const ENEMY_BULLETS_MAX = 30;
const ENEMY_COUNTS = [28, 35, 35, 42];
// 行進・斉射数・同時敵弾数を制限し、狙い撃ちを読んで避けられる余地を残す。
// 弾速は620以下。近距離の到達時間はgame側でも保護する。
// 開始行は5波目で頭打ちにして、最下行を防衛線から離しておく。
export function waveConfig(wave, level = 1) {
  return {
    burst: Math.min(BURST_MAX, 1 + Math.floor((wave - 1) / 3) + Math.floor(level / 5)),
    startY: 72 + 24 * Math.min(wave - 1, 4),
    speed: Math.min(MARCH_SPEED_MAX, 1 + WAVE_SPEED_GAIN * (wave - 1) + LEVEL_SPEED_GAIN * Math.max(0, level - 10)),
    fireInterval: Math.max(FIRE_INTERVAL_MIN, FIRE_INTERVAL_BASE * FIRE_INTERVAL_FACTOR ** (wave - 1) * FIRE_INTERVAL_LEVEL_FACTOR ** (level - 1)),
    bulletSpeed: Math.min(ENEMY_BULLET_SPEED_MAX, 170 + 22 * wave + ENEMY_SPEED_PER_LEVEL * level),
    aimSpread: Math.max(8, 70 - 20 * (wave - 1)),
  };
}
export function createFleet(wave = 1, level = 1) {
  const { startY } = waveConfig(wave);
  return { x: 0, y: 0, direction: 1, clock: 0, offset: 0, flinchTime: 0, flinchCooldown: 0, flinchCount: 0,
    enemies: Array.from({ length: ENEMY_COUNTS[Math.min(wave, ENEMY_COUNTS.length) - 1] }, (_, i) => {
      const row = Math.floor(i / 7), type = row === 0 ? 'c' : row < 3 ? 'b' : 'a';
      const [w, h] = type === 'c' ? [30, 22] : type === 'b' ? [36, 26] : [40, 28];
      return { id: i, row, col: i % 7, x: 96 + i % 7 * 46, y: startY + row * 40, w, h, type, points: row === 0 ? 30 : row < 3 ? 20 : 10, alive: true };
    }) };
}
export const alive = fleet => fleet.enemies.filter(e => e.alive);
export const interval = (count, wave = 1, level = 1) => (0.10 + 0.72 * count / 35) / waveConfig(wave, level).speed;
export const enemyRect = (fleet, e) => ({ x: e.x + fleet.x + fleet.offset - e.w / 2, y: e.y + fleet.y - e.h / 2, w: e.w, h: e.h });
export const invaded = fleet => alive(fleet).some(e => e.y + fleet.y >= 560);
export function shooters(fleet) {
  return Array.from({ length: 7 }, (_, col) => alive(fleet).filter(e => e.col === col).sort((a, b) => b.row - a.row)[0]).filter(Boolean);
}
export function march(fleet) {
  const es = alive(fleet);
  if (!es.length) return fleet;
  const next = fleet.x + fleet.direction * 12;
  const edge = es.some(e => e.x + next - e.w / 2 < 20 || e.x + next + e.w / 2 > 460);
  return { ...fleet, x: edge ? fleet.x : next, y: fleet.y + (edge ? 24 : 0), direction: edge ? -fleet.direction : fleet.direction };
}
