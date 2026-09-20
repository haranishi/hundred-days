const DIRECTIONS = [
  ['N', 0], ['NNE', 22.5], ['NE', 45], ['ENE', 67.5],
  ['E', 90], ['ESE', 112.5], ['SE', 135], ['SSE', 157.5],
  ['S', 180], ['SSW', 202.5], ['SW', 225], ['WSW', 247.5],
  ['W', 270], ['WNW', 292.5], ['NW', 315], ['NNW', 337.5],
];

const LABELS = [
  '北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東',
  '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西',
];

export function parseDirection(value) {
  if (value === null || value === undefined) return null;
  const first = String(value).trim().split(';', 1)[0].trim().toUpperCase();
  const word = DIRECTIONS.find(([name]) => name === first);
  const numeric = first.match(/^[-+]?\d+(?:\.\d+)?/);
  const number = word ? word[1] : numeric ? Number(numeric[0]) : Number.NaN;
  if (!Number.isFinite(number)) return null;
  return ((Math.round(number) % 360) + 360) % 360;
}

export function compassLabel(deg) {
  if (!Number.isFinite(deg)) return null;
  const normalized = ((deg % 360) + 360) % 360;
  return LABELS[Math.floor((normalized + 11.25) / 22.5) % 16];
}
