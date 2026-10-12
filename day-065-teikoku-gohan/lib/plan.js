// プレイヤーが決めるもの（出発順と分岐の向き）を扱う。DOMに触らない純粋な関数だけを置く。
// plan = { order: [列車ID...], choices: { 列車ID: { 分岐ノードID: 次のノードID } } }
import { buildPath, sectionsOf } from './sim.js';

export function initialPlan(level) {
  return { order: level.trains.map((t) => t.id), choices: {} };
}

export function samplePlan(level) {
  return {
    order: [...level.solution.order],
    choices: Object.fromEntries(Object.entries(level.solution.choices).map(([id, c]) => [id, { ...c }])),
  };
}

export function outsOf(level, node) {
  return level.edges.filter((e) => e.from === node);
}

export function insOf(level, node) {
  return level.edges.filter((e) => e.to === node);
}

// 分岐＝出口が2本以上の junction
export function isBranch(level, node) {
  return level.nodes[node]?.kind === 'junction' && outsOf(level, node).length > 1;
}

export function branchNodes(level) {
  return Object.keys(level.nodes).filter((n) => isBranch(level, n));
}

export function pathOf(level, plan, trainId) {
  return buildPath(level, plan.choices[trainId] || {});
}

export function pathsOf(level, plan) {
  return Object.fromEntries(level.trains.map((t) => [t.id, pathOf(level, plan, t.id)]));
}

// 経路の上にある分岐（上流から順に）
export function branchesOnPath(level, path) {
  return path.slice(0, -1).filter((n) => isBranch(level, n));
}

// この経路で通る工程（駅の種類の並び）
export function stepsOfPath(level, path) {
  return sectionsOf(level, path).filter((s) => s.type === 'station').map((s) => s.kind);
}

// いま選ばれている出口（buildPath と同じ決め方：未指定や無効な指定は edges の先頭）
export function currentExit(level, plan, trainId, node) {
  const outs = outsOf(level, node);
  const want = plan.choices[trainId]?.[node];
  return outs.some((e) => e.to === want) ? want : outs[0].to;
}

// 出口を edges の順に1つ進める。新しい plan を返す（元は変えない）
export function cycleChoice(level, plan, trainId, node) {
  const outs = outsOf(level, node);
  if (outs.length < 2) return plan;
  const cur = currentExit(level, plan, trainId, node);
  const next = outs[(outs.findIndex((e) => e.to === cur) + 1) % outs.length].to;
  return { order: [...plan.order], choices: { ...plan.choices, [trainId]: { ...(plan.choices[trainId] || {}), [node]: next } } };
}

// 出発順を delta（-1＝前へ・+1＝後ろへ）だけ動かす。端なら変えない
export function moveTrain(plan, trainId, delta) {
  const i = plan.order.indexOf(trainId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= plan.order.length) return plan;
  const order = [...plan.order];
  [order[i], order[j]] = [order[j], order[i]];
  return { order, choices: plan.choices };
}

// 実際に走る中身（出発順と各列車の経路）が同じか。選択の書き方の違い（無効な指定・通らない分岐）は無視する
export function samePlan(level, a, b) {
  if (a.order.join() !== b.order.join()) return false;
  return level.trains.every((t) => pathOf(level, a, t.id).join() === pathOf(level, b, t.id).join());
}

// sim に渡す形
export function simInput(level, plan) {
  return { order: [...plan.order], paths: pathsOf(level, plan) };
}
