export const COUNT = 12;
export const HEAT_MAX = 6;
export const HEAT_DECAY_SECONDS = 3;
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const laneAt = x => clamp(Math.floor(x / 40), 0, 11);
export const rememberPosition = (history, x) => [...history, clamp(x, 0, 480)].slice(-50);
export const heatOf = shotHeat => Array.from({ length: COUNT }, (_, i) => Math.min(1, (shotHeat[i] || 0) / HEAT_MAX));
export const decayHeat = (shotHeat, dt) => shotHeat.map(v => v * Math.exp(-dt / HEAT_DECAY_SECONDS));
export function posConcentration(positions) {
  if (!positions.length) return 0;
  const mean = positions.reduce((a, b) => a + b, 0) / positions.length;
  const stddev = Math.sqrt(positions.reduce((sum, x) => sum + (x - mean) ** 2, 0) / positions.length);
  return clamp(1 - stddev / 150, 0, 1) * Math.min(1, positions.length / 15);
}
export const readLevel = (shotHeat, positions = []) => Math.round(100 * clamp(0.6 * Math.max(...heatOf(shotHeat)) + 0.4 * posConcentration(positions), 0, 1));
export function predictedX(history, fallback = 240) {
  let sum = 0, mass = 0;
  history.forEach((x, i) => { const w = 0.94 ** (history.length - 1 - i); sum += x * w; mass += w; });
  return mass ? sum / mass : fallback;
}
export const flinchProbability = heat => 0.15 + 0.6 * clamp(heat, 0, 1);
// 読まれ度の危険域。メーターと数値の色分けに使う。
export const readBand = level => level >= 90 ? 'critical' : level >= 70 ? 'hot' : level >= 40 ? 'warm' : 'calm';
export const outsmarted = (heat, lane) => heat[lane] < Math.max(...heat) / 2;
export const laneName = lane => lane < 2 ? '左端' : lane < 5 ? '左' : lane < 7 ? '中央' : lane < 10 ? '右' : '右端';
export function review(shotHeat, positions) {
  const max = Math.max(0, ...shotHeat);
  const shot = max ? `${laneName(shotHeat.indexOf(max))}から撃ちすぎ` : '撃ち癖はまだ薄い';
  const position = laneName(laneAt(predictedX(positions)));
  return `${shot}。居場所も${position}寄り${posConcentration(positions) > 0.6 ? 'で、動きが少ない' : ''}。`;
}
