// levels.json を最初から計算し直し、V1〜V7 を全面について表で出す。1つでも不合格なら終了コード1。
// 使い方: node verify-levels.mjs   （配信物ではない。面やルールを直したら必ず実行し、出力の表をそのまま progress.md に貼る）
import { readFileSync } from 'node:fs';
import { loadLevel, replay, starsFor, DEAD_CHECK_LIMIT } from './sim.mjs';
import { analyze, judge, RULE } from './checks.mjs';

const levels = JSON.parse(readFileSync(new URL('../levels.json', import.meta.url), 'utf8'));
const t0 = Date.now();
const problems = [];
const results = levels.map((L) => {
  const a = analyze(L);
  const level = loadLevel(L);
  const r = replay(level, L.solution);
  if (a.normal.par !== L.par) problems.push(`${L.id}: par ${a.normal.par} ≠ levels.json ${L.par}`);
  if (!r.ok || r.state.status !== 'escaped' || r.state.steps !== L.par) problems.push(`${L.id}: 見本の解が par 手で出口に着かない`);
  if (r.ok && starsFor(L.par, r.state.steps) !== 3) problems.push(`${L.id}: 見本の解が★3にならない`);
  if (a.normal.count !== L.stats.solutions) problems.push(`${L.id}: 最短解の本数 ${a.normal.count} ≠ ${L.stats.solutions}`);
  if (a.normal.reachable !== L.stats.reachable) problems.push(`${L.id}: 届く状態 ${a.normal.reachable} ≠ ${L.stats.reachable}`);
  if (L.trap && !a.v5?.ok) problems.push(`${L.id}: 罠が成り立たない ${JSON.stringify(a.v5)}`);
  if (L.stats.dead >= DEAD_CHECK_LIMIT) problems.push(`${L.id}: 詰み状態 ${L.stats.dead} が上限 ${DEAD_CHECK_LIMIT} 以上（画面の詰み検出が取りこぼす）`);
  return a;
});
const j = judge(results);
const total = Date.now() - t0;

const f = (s) => (s.solvable ? String(s.par) : '解なし');
const pct = (s, par) => (s.solvable ? `${s.par}（${s.par >= par ? '+' : ''}${Math.round((s.par / par - 1) * 100)}%）` : '解なし');
const mark = (ok) => (ok ? '○' : '×');
console.log('| 面 | 名前 | 盤 | par | 最短解 | 状態数 | V2 押せない | V3 箱が光を通す | V4 箱が巡回に効かない | V5 罠 | V6 警備なし | V7 箱ごとの役 | 秒 |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
results.forEach((a, i) => {
  const L = levels[i];
  const cap = a.normal.countCapped ? '+' : '';
  const roles = a.perBox.map((b) => `箱${b.box + 1}:${[b.shade && '遮光', b.turn && '巡回', b.exit && '出口'].filter(Boolean).join('+') || '-'}`).join(' ');
  console.log(`| ${i + 1} | ${L.name} | ${a.w}×${a.h} | ${a.normal.par} | ${a.normal.count}${cap} | ${a.normal.explored}/${a.normal.reachable} | ${mark(!a.v2.solvable)} ${f(a.v2)} `
    + `| ${mark(j.v3ok(a))} ${pct(a.v3, a.normal.par)} | ${mark(j.v4ok(a))} ${pct(a.v4, a.normal.par)} | ${a.v5 ? `${mark(a.v5.ok)} ${L.trap.moves.length}手` : '-'} `
    + `| ${mark(j.v6ok(a))} ${pct(a.v6, a.normal.par)} | ${mark(j.v7ok(a))} ${roles} | ${(a.ms / 1000).toFixed(1)} |`);
});
console.log('');
console.log('| 検証 | 合否 | 数字 | 合格条件 |');
console.log('|---|---|---|---|');
const cond = {
  V1: `全面で最短解がある・最初の位置が光っていない・1面${RULE.msPerLevel / 1000}秒以内`,
  V2: '全面で解なし', V3: `解なしか par が${Math.round((RULE.v3Ratio - 1) * 100)}%以上増える面が${RULE.v3Levels}つ以上`,
  V4: `解なしか par が増える面が${RULE.v4Levels}つ以上（依頼の「par が変わる」より厳しく、箱が助けになる向きだけ数える）`,
  V5: `押し間違いの後が解なしになる面が${RULE.v5Levels}つ以上`, V6: `par が${Math.round((1 - RULE.v6Ratio) * 100)}%以上短くなる面が過半数`,
  V7: `後半の面で、同じ箱が二役以上（遮光・巡回・出口）を持つ面が${RULE.v7Levels}つ以上`,
};
for (const k of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7']) console.log(`| ${k} | ${j[k].pass ? '合格' : '不合格'} | ${j[k].detail} | ${cond[k]} |`);
console.log('');
console.log(`全体 ${(total / 1000).toFixed(1)} 秒（上限 180 秒）`);
if (total > 180_000) problems.push(`全体で ${total}ms（3分を超えた）`);
const failed = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7'].filter((k) => !j[k].pass);
if (problems.length || failed.length) {
  for (const p of problems) console.log(`NG: ${p}`);
  if (failed.length) console.log(`NG: 不合格 ${failed.join('・')}`);
  process.exit(1);
}
console.log('全面OK（V1〜V7 合格・levels.json と一致）');
