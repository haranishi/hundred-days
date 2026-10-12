// 全探索ソルバー（開発・検証用。配信しない）。
// 各列車の経路は「正しい料理になるもの」だけを候補にし、出発順の全順列と組み合わせる。
import { simulate, allPaths, buildPath } from './sim.mjs';

export function* permutations(a) {
  if (a.length <= 1) { yield a; return; }
  for (let i = 0; i < a.length; i++) for (const p of permutations([...a.slice(0, i), ...a.slice(i + 1)])) yield [a[i], ...p];
}

export function recipePaths(level, train) {
  const order = level.orders.find((o) => o.id === train.order);
  const loose = { ...level, trains: [train], orders: [{ ...order, due: 9999 }] };
  return allPaths(level).filter((p) => simulate(loose, { order: [train.id], paths: { [train.id]: p } }).results[0].stepsOk);
}

export function* allPlans(level) {
  const ids = level.trains.map((t) => t.id);
  const cands = level.trains.map((t) => recipePaths(level, t));
  const rec = function* (i, cur) {
    if (i === ids.length) { yield { ...cur }; return; }
    for (const p of cands[i]) { cur[ids[i]] = p; yield* rec(i + 1, cur); }
  };
  for (const paths of rec(0, {})) for (const order of permutations(ids)) yield { order, paths };
}

// 戻り値: { par, clearing, best, finishDistribution, burntPlans, recipeCorrectPlans }
export function solve(level) {
  let clearing = 0, burnt = 0, total = 0, best = null;
  const dist = {};
  for (const plan of allPlans(level)) {
    total++;
    const r = simulate(level, plan);
    if (r.results.some((x) => x.burnt)) burnt++;
    if (!r.cleared) continue;
    clearing++;
    dist[r.finish] = (dist[r.finish] || 0) + 1;
    if (!best || r.finish < best.finish) best = { finish: r.finish, plan };
  }
  return { par: best?.finish ?? null, clearing, best, finishDistribution: dist, burntPlans: burnt, recipeCorrectPlans: total };
}

// 分岐ごとの選択に直す（UIの状態と同じ形）
export function choicesOf(level, path) {
  const out = {};
  for (let i = 1; i < path.length - 1; i++) {
    const outs = level.edges.filter((e) => e.from === path[i]);
    if (outs.length > 1) out[path[i]] = path[i + 1];
  }
  return out;
}
export { buildPath };
