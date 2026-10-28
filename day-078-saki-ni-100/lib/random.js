export function createRandom(search, fallback = Math.random) {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^-?\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) return fallback;
  let seed = Number(raw) >>> 0;
  return () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
