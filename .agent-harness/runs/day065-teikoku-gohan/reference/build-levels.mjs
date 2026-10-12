// 面データを組み立て、ソルバーで par・見本の解・統計を計算して ../levels.json に書く（開発用・配信しない）。
import { writeFileSync } from 'node:fs';
import { simulate, buildPath, starsOf } from './sim.mjs';
import { allPlans, choicesOf } from './solve.mjs';

const N = (kind, pos, time) => ({ kind, pos, ...(time ? { time } : {}) });
const E = (id, from, to, len, via) => ({ id, from, to, len, ...(via ? { via } : {}) });
const T = (id, ingredient, order) => ({ id, ingredient, order });
const O = (id, ingredient, steps, due) => ({ id, ingredient, steps, due });

const MAP_A = {
  nodes: { Y: N('yard', [24, 120]), J1: N('junction', [84, 120]), C: N('cut', [144, 60]), J2: N('junction', [204, 120]), G: N('grill', [264, 120]), S: N('serve', [336, 120]) },
  edges: [E('e1', 'Y', 'J1', 1), E('e2', 'J1', 'C', 1), E('e3', 'J1', 'J2', 1), E('e4', 'C', 'J2', 1), E('e5', 'J2', 'G', 1), E('e6', 'G', 'S', 1)],
};
const BASE = [
  { id: 'L1', title: 'はじめの一皿', hint: '地図の分岐ボタンをタップして行き先を選び、「発車」。焼きにんじんは「焼く」だけ。', ...MAP_A,
    trains: [T('t1', 'carrot', 'o1')], orders: [O('o1', 'carrot', ['grill'], 9)] },
  { id: 'L2', title: 'ならんで待つ', hint: '同じ焼き場に並ぶと、あとの列車は待たされる。どちらを先に出そう？', ...MAP_A,
    trains: [T('t1', 'carrot', 'o1'), T('t2', 'beef', 'o2')], orders: [O('o1', 'carrot', ['grill'], 11), O('o2', 'beef', ['grill'], 8)] },
  { id: 'L3', title: 'ふたつの焼き場', hint: '焼き場は2つ。遠いほうは線路が長い。お刺身は切るだけで配膳へ行ける。',
    nodes: { Y: N('yard', [22, 120]), J1: N('junction', [76, 120]), C: N('cut', [110, 62]), J2: N('junction', [144, 120]), J3: N('junction', [204, 120]),
      G1: N('grill', [246, 64]), G2: N('grill', [246, 176]), J4: N('junction', [296, 120]), S: N('serve', [338, 120]) },
    edges: [E('e1', 'Y', 'J1', 1), E('e2', 'J1', 'C', 1), E('e3', 'C', 'J2', 1), E('e4', 'J1', 'J2', 1), E('e5', 'J2', 'J3', 1), E('e6', 'J3', 'G1', 1), E('e7', 'G1', 'J4', 1),
      E('e8', 'J3', 'G2', 2), E('e9', 'G2', 'J4', 2), E('e10', 'J4', 'S', 1), E('e11', 'J2', 'S', 2, [[150, 222], [338, 222]])],
    trains: [T('t1', 'fish', 'o1'), T('t2', 'beef', 'o2'), T('t3', 'beef', 'o3'), T('t4', 'carrot', 'o4')],
    orders: [O('o1', 'fish', ['cut'], 11), O('o2', 'beef', ['grill'], 10), O('o3', 'beef', ['cut', 'grill'], 13), O('o4', 'carrot', ['grill'], 16)] },
  { id: 'L4', title: '火の番', hint: '🔥🍲は、仕上がってから1分以内に出ないと焦げる。出口の線路がふさがっていないか見よう。',
    nodes: { Y: N('yard', [22, 120]), J1: N('junction', [70, 120]), G1: N('grill', [150, 50], 3), G2: N('grill', [150, 120], 4), M: N('simmer', [150, 190], 4), J2: N('junction', [236, 120]), S: N('serve', [330, 120]) },
    edges: [E('e1', 'Y', 'J1', 1), E('e2', 'J1', 'G1', 1), E('e3', 'J1', 'G2', 1), E('e4', 'J1', 'M', 1), E('e5', 'G1', 'J2', 1), E('e6', 'G2', 'J2', 1), E('e7', 'M', 'J2', 1), E('e8', 'J2', 'S', 4)],
    trains: [T('t1', 'beef', 'o1'), T('t2', 'fish', 'o2'), T('t3', 'egg', 'o3'), T('t4', 'carrot', 'o4')],
    orders: [O('o1', 'beef', ['grill'], 14), O('o2', 'fish', ['grill'], 24), O('o3', 'egg', ['simmer'], 24), O('o4', 'carrot', ['simmer'], 24)] },
  { id: 'L5', title: '順番がちがう', hint: '「切ってから焼く」と「焼いてから切る」は別の料理。通る順番がレシピになる。',
    nodes: { Y: N('yard', [22, 120]), J1: N('junction', [70, 120]), C1: N('cut', [112, 48]), J2: N('junction', [170, 64]), G1: N('grill', [232, 64]), J5: N('junction', [300, 120]),
      G2: N('grill', [120, 184]), J6: N('junction', [176, 184]), C2: N('cut', [232, 184]), S: N('serve', [342, 120]) },
    edges: [E('e1', 'Y', 'J1', 1), E('e2', 'J1', 'C1', 1), E('e3', 'C1', 'J2', 1), E('e11', 'J1', 'J2', 1), E('e4', 'J2', 'G1', 1), E('e5', 'G1', 'J5', 1), E('e6', 'J2', 'J5', 2, [[170, 20], [300, 20]]),
      E('e7', 'J1', 'G2', 2), E('e8', 'G2', 'J6', 1), E('e9', 'J6', 'C2', 1), E('e12', 'C2', 'J5', 1), E('e13', 'J6', 'J5', 2, [[176, 226], [300, 226]]), E('e10', 'J5', 'S', 1)],
    trains: [T('t1', 'fish', 'o1'), T('t2', 'beef', 'o2'), T('t3', 'beef', 'o3'), T('t4', 'beef', 'o4')],
    orders: [O('o1', 'fish', ['cut'], 12), O('o2', 'beef', ['grill'], 10), O('o3', 'beef', ['cut', 'grill'], 15), O('o4', 'beef', ['grill', 'cut'], 12)] },
  { id: 'L6', title: 'ランチタイム', hint: 'お昼のラッシュ！ 切る・焼く・煮るを総動員して、5つの注文をさばこう。',
    nodes: { Y: N('yard', [22, 120]), J1: N('junction', [72, 120]), C: N('cut', [114, 60]), J2: N('junction', [150, 120]), G: N('grill', [212, 36]), M: N('simmer', [212, 120]),
      G2: N('grill', [212, 206], 3), J3: N('junction', [282, 120]), S: N('serve', [338, 120]) },
    edges: [E('e1', 'Y', 'J1', 1), E('e2', 'J1', 'C', 1), E('e3', 'C', 'J2', 1), E('e4', 'J1', 'J2', 1), E('e5', 'J2', 'G', 1), E('e6', 'G', 'J3', 1), E('e7', 'J2', 'M', 1), E('e8', 'M', 'J3', 1),
      E('e9', 'J2', 'J3', 1, [[212, 164]]), E('e11', 'J2', 'G2', 2), E('e12', 'G2', 'J3', 2), E('e10', 'J3', 'S', 3)],
    trains: [T('t1', 'fish', 'o1'), T('t2', 'beef', 'o2'), T('t3', 'beef', 'o3'), T('t4', 'egg', 'o4'), T('t5', 'carrot', 'o5')],
    orders: [O('o1', 'fish', ['cut'], 11), O('o2', 'beef', ['cut', 'grill'], 17), O('o3', 'beef', ['cut', 'simmer'], 19), O('o4', 'egg', ['simmer'], 20), O('o5', 'carrot', ['grill'], 23)] },
];

const totalWait = (r) => Object.values(r.timeline).flat().reduce((a, s) => a + s.waited, 0);
const out = BASE.map((L, i) => {
  const level = { ...L, no: i + 1, headway: 1, burnGrace: 1 };
  let best = null, clearing = 0, burnt = 0, total = 0; const dist = {};
  for (const plan of allPlans(level)) {
    total++;
    const r = simulate(level, plan);
    if (r.results.some((x) => x.burnt)) burnt++;
    if (!r.cleared) continue;
    clearing++; dist[r.finish] = (dist[r.finish] || 0) + 1;
    const w = totalWait(r);
    if (!best || r.finish < best.finish || (r.finish === best.finish && w < best.wait)) best = { finish: r.finish, wait: w, plan };
  }
  level.par = best.finish;
  level.solution = { order: best.plan.order, choices: Object.fromEntries(level.trains.map((t) => [t.id, choicesOf(level, best.plan.paths[t.id])])) };
  level.stats = { recipeCorrectPlans: total, burntPlans: burnt, clearingPlans: clearing, finishDistribution: dist };
  return level;
});
writeFileSync(new URL('../levels.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
for (const L of out) console.log(`${L.id} ${L.title} par=${L.par} 解${L.stats.clearingPlans}/${L.stats.recipeCorrectPlans} 焦げ${L.stats.burntPlans} 内訳${JSON.stringify(L.stats.finishDistribution)} 見本の順=${L.solution.order.join(',')}`);
