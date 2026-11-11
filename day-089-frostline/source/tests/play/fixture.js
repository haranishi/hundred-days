export function mountain() {
  const kinds = ['practice','park','bigair','open','plateau','forest','ridge','gully','steep','chute','spine'];
  return { size: 2000, drops: Array.from({ length: 16 }, (_, i) => ({ id: `d${i}`, name: `地点${i}`, x: i * 90, y: 500, z: 0, heading: 0, level: i >= 13 ? 4 : i % 3 + 1, kind: kinds[i % kinds.length], hidden: i >= 9 && i <= 12, finish: 'base', about: '雪の斜面を滑ります' })),
    meta: { map: { file: 'map.png', size: 1024 }, stations: [{ id: 'base', name: 'ふもとの駅', x: 0, z: 500, radius: 25, base: true }, { id: 'mid', name: '中腹の駅', x: 100, z: 300, radius: 20, base: false }], features: [{ id: 'jump', name: '小さい台', kind: 'kicker', x: 50, z: 50, width: 12, length: 20, approach: { x: 50, z: 90, heading: 0, speed: 12 } }] } };
}
export const rider = (changes = {}) => ({ mode: 'carve', speed: 10, pos: { x: 0, y: 500, z: 0 }, air: { time: 0 }, ...changes });
export const storage = () => { const data = new Map(); return { getItem: k => data.get(k), setItem: (k,v) => data.set(k,v) }; };
