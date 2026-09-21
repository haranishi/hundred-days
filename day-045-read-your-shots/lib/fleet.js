// 波ごとの圧。開始行は5波目で頭打ちにして、最下行を防衛線から離しておく。
export function waveConfig(wave) {
  return {
    startY: 72 + 24 * Math.min(wave - 1, 4),
    speed: 1 + 0.18 * (wave - 1),
    fireInterval: Math.max(0.45, 1.7 * 0.85 ** (wave - 1)),
  };
}
export function createFleet(wave = 1) {
  const { startY } = waveConfig(wave);
  return { x: 0, y: 0, direction: 1, clock: 0, offset: 0, flinchTime: 0, flinchCooldown: 0, flinchCount: 0,
    enemies: Array.from({ length: wave === 1 ? 28 : 35 }, (_, i) => {
      const row = Math.floor(i / 7), type = row === 0 ? 'c' : row < 3 ? 'b' : 'a';
      const [w, h] = type === 'c' ? [30, 22] : type === 'b' ? [36, 26] : [40, 28];
      return { id: i, row, col: i % 7, x: 96 + i % 7 * 46, y: startY + row * 40, w, h, type, points: row === 0 ? 30 : row < 3 ? 20 : 10, alive: true };
    }) };
}
export const alive = fleet => fleet.enemies.filter(e => e.alive);
export const interval = (count, wave = 1) => (0.10 + 0.72 * count / 35) / waveConfig(wave).speed;
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
