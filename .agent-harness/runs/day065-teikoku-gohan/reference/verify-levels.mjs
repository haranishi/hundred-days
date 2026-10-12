// levels.json を最初から計算し直して、par・見本の解・統計・「初期設定では失敗」を確かめる。
// 使い方: node verify-levels.mjs   （配信物ではない。面を直したら必ず実行）
import { readFileSync } from 'node:fs';
import { simulate, buildPath, starsOf } from './sim.mjs';
import { solve } from './solve.mjs';

const levels = JSON.parse(readFileSync(new URL('../levels.json', import.meta.url), 'utf8'));
let bad = 0;
const check = (ok, msg) => { if (!ok) { bad++; console.log('  NG:', msg); } };
for (const L of levels) {
  const s = solve(L);
  check(s.par === L.par, `par ${s.par} != ${L.par}`);
  check(s.clearing === L.stats.clearingPlans, `clearing ${s.clearing} != ${L.stats.clearingPlans}`);
  check(s.burntPlans === L.stats.burntPlans, `burnt ${s.burntPlans} != ${L.stats.burntPlans}`);
  const paths = Object.fromEntries(L.trains.map((t) => [t.id, buildPath(L, L.solution.choices[t.id])]));
  const r = simulate(L, { order: L.solution.order, paths });
  check(r.cleared && r.finish === L.par && starsOf(L, r) === 3, `見本の解が★★★にならない ${L.id}`);
  const dflt = simulate(L, { order: L.trains.map((t) => t.id), paths: Object.fromEntries(L.trains.map((t) => [t.id, buildPath(L, {})])) });
  check(!dflt.cleared, `初期設定でクリアできてしまう ${L.id}`);
  console.log(`${bad ? 'NG ' : 'OK '} ${L.id} ${L.title}: par=${L.par} 解${s.clearing} 焦げ${s.burntPlans}/${s.recipeCorrectPlans}`);
}
if (bad) { console.log(`\n${bad} 件の不整合`); process.exit(1); }
console.log('\n全面OK');
