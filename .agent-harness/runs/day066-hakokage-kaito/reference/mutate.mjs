// 変異テスト：sim.mjs の1か所をわざと壊した写しを作り、rules-check.mjs と verify-levels.mjs が落ちるかを見る（開発用・配信しない）。
// 「試験が門番になっているか」を確かめる道具。実装者は同じ変異を lib/sim.js に当て、単体テストが全部落とすことを確かめる（03_gates.md）。
// 使い方: node mutate.mjs   （どれか1つでも生き残ったら終了コード1）
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const source = readFileSync(join(here, 'sim.mjs'), 'utf8');

// [番号, 何を壊すか, 置き換える前, 置き換えた後]（前の文字列は sim.mjs にちょうど1回だけ出ること）
export const MUTANTS = [
  ['M1', '判定A（動いた直後の判定）を消す', 'if (action !== WAIT) {\n    const hit', 'if (false) {\n    const hit'],
  ['M2', '判定B（警備員の後の判定）を消す', 'const hit = seenBy(beams(level, next, world), player);\n  if (hit) {\n    //', 'const hit = null;\n  if (hit) {\n    //'],
  ['M3', '箱が光を止めない', "if (b >= 0 && shades(world, b)) return { cells, stop: { kind: 'box'", "if (false) return { cells, stop: { kind: 'box'"],
  ['M4', '巡回が箱の前で引き返さない', 'if (b >= 0 && turnsGuard(world, b)) return', 'if (false) return'],
  ['M5', '道の端で向きを変えた手に、もう1歩戻る', 'if (j < 0 || j >= g.path.length) return { gs: { i: gs.i, d: -gs.d }', 'if (j < 0 || j >= g.path.length) return { gs: { i: gs.i - gs.d, d: -gs.d }'],
  ['M6', '予告が箱を見ない（箱の前で引き返すのに「進む」と出す）', 'const { guards, moves } = stepGuards(level, state, world);\n  return { moves', 'const { guards, moves } = stepGuards(level, { ...state, boxes: [] }, world);\n  return { moves'],
  ['M7', '2つ並んだ箱も押せる', '|| (!treasure && same(beyond, level.treasure)) || boxAt(boxes, beyond) >= 0', '|| (!treasure && same(beyond, level.treasure))'],
  ['M8', '出口が最初から開いている', "if (same(to, level.exit) && !treasure) return no('locked');", ''],
  ['M9', '光が宝で止まる', 'if (same(p, level.exit)) return', 'if (same(p, level.exit) || same(p, level.treasure)) return'],
  ['M10', '星★2のしきい値を1つずらす', 'if (steps <= Math.ceil(par * 1.5)) return 2;', 'if (steps < Math.ceil(par * 1.5)) return 2;'],
  ['M11', '詰み検出の上限を小さくする', 'export const DEAD_CHECK_LIMIT = 10000;', 'export const DEAD_CHECK_LIMIT = 500;'],
  ['M12', '見張りが回らない', 'const k = (gs.k + 1) % g.looks.length;', 'const k = gs.k;'],
  ['M13', '箱を押した手を「光の中へ入った」と記録する', "pushed ? 'uncovered' : 'walked-in'", "'walked-in'"],
];

const run = (file, cwd) => {
  const r = spawnSync(process.execPath, [file], { cwd, encoding: 'utf8', timeout: 120_000 });
  return { failed: r.status !== 0, timedOut: r.error?.code === 'ETIMEDOUT' };
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let alive = 0;
  console.log('| 変異 | 壊したこと | rules-check | verify-levels | 判定 |');
  console.log('|---|---|---|---|---|');
  for (const [id, what, from, to] of MUTANTS) {
    if (source.split(from).length !== 2) { console.log(`| ${id} | ${what} | 置き換え元が1回でない | - | 道具の誤り |`); alive++; continue; }
    const root = mkdtempSync(join(tmpdir(), 'hakokage-mutant-'));
    const ref = join(root, 'reference');
    mkdirSync(ref);
    for (const f of readdirSync(here)) if (f.endsWith('.mjs') && f !== 'sim.mjs') copyFileSync(join(here, f), join(ref, f));
    writeFileSync(join(ref, 'sim.mjs'), source.replace(from, to));
    copyFileSync(join(here, '..', 'levels.json'), join(root, 'levels.json'));
    const a = run(join(ref, 'rules-check.mjs'), ref);
    const b = run(join(ref, 'verify-levels.mjs'), ref);
    const killed = a.failed || b.failed;
    if (!killed) alive++;
    const show = (x) => (x.timedOut ? '時間切れ（落ちた扱い）' : x.failed ? '落ちた' : '通った');
    console.log(`| ${id} | ${what} | ${show(a)} | ${show(b)} | ${killed ? '捕まえた' : '生き残った'} |`);
    rmSync(root, { recursive: true, force: true });
  }
  if (alive) { console.log(`\n生き残った変異が ${alive} 個（試験が門番になっていない）`); process.exit(1); }
  console.log('\n全部の変異を捕まえた');
}
