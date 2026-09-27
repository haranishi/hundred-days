export const ROUND_COUNT = 5;
export const REVEAL = [0.22, 0.40, 0.66, 1];
export const POINTS = [1000, 750, 500, 250];

export function hash(text) {
  let value = 2166136261;
  for (const character of String(text)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}

export function random(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let n = Math.imul(value ^ value >>> 15, 1 | value);
    n ^= n + Math.imul(n ^ n >>> 7, 61 | n);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

export function shuffled(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function dayStamp(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function createGame(works, seed) {
  if (works.length < 5 || new Set(works.map(w => w.id)).size !== works.length) throw new Error('At least 5 unique artworks are required.');
  const rng = random(hash(seed));
  const rounds = shuffled(works, rng).slice(0, ROUND_COUNT).map(work => ({
    id: work.id,
    options: shuffled([work.id, ...shuffled(works.filter(w => w.id !== work.id), rng).slice(0, 3).map(w => w.id)], rng),
  }));
  return { rounds, index: 0, step: 0, answers: [], phase: 'question', seed };
}

export function revealMore(game) {
  if (game.phase !== 'question' || game.step >= REVEAL.length - 1) return game;
  return { ...game, step: game.step + 1 };
}

export function answer(game, id) {
  if (game.phase !== 'question') return game;
  const round = game.rounds[game.index];
  if (id !== null && !round.options.includes(id)) return game;
  const correct = round.id === id;
  return { ...game, phase: 'answer', answers: [...game.answers, { id: round.id, selected: id, correct, step: game.step, points: correct ? POINTS[game.step] : 0 }] };
}

export function next(game) {
  if (game.phase !== 'answer') return game;
  return game.index + 1 === game.rounds.length ? { ...game, phase: 'result' } : { ...game, phase: 'question', index: game.index + 1, step: 0 };
}

export function score(game) { return game.answers.reduce((total, result) => total + result.points, 0); }

export function cropAt(focus, fraction) {
  const f = Math.max(0.01, Math.min(1, fraction));
  return { x: Math.min(1 - f, Math.max(0, focus[0] - f / 2)), y: Math.min(1 - f, Math.max(0, focus[1] - f / 2)), size: f };
}

export function readProgress(storage) {
  try {
    const parsed = JSON.parse(storage.getItem('art-uncovered-v1') || '{}');
    return { seen: [...new Set((Array.isArray(parsed.seen) ? parsed.seen : []).filter(Number.isInteger))], best: Number.isInteger(parsed.best) ? Math.min(5000, Math.max(0, parsed.best)) : 0 };
  } catch { return { seen: [], best: 0 }; }
}

export function saveProgress(storage, progress) {
  try { storage.setItem('art-uncovered-v1', JSON.stringify(progress)); return true; } catch { return false; }
}
