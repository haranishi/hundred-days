#!/usr/bin/env node
// 腕前ごとに盤を n 個の seed で組み、辻の一致率・空きの統計（v2）・生成時間・盤の大きさを表で出す。
// node tools/sim-levels.mjs [--words fixture|real] [--n 500]
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { LEVELS } from '../lib/levels.js';
import { generatePuzzle } from '../lib/generator.js';
import { hashSeed } from '../lib/rng.js';

function parseArgs(argv) {
  const opts = { words: 'fixture', n: 500 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [key, inline] = a.split('=');
    const value = inline ?? argv[i + 1];
    if (key === '--words') { opts.words = value; if (inline === undefined) i++; }
    else if (key === '--n') { opts.n = Number(value); if (inline === undefined) i++; }
    else if (key === '--help' || key === '-h') opts.help = true;
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help || !['fixture', 'real'].includes(opts.words) || !(opts.n > 0)) {
  console.log('使い方: node tools/sim-levels.mjs [--words fixture|real] [--n 500]');
  process.exit(opts.help ? 0 : 1);
}

const source = opts.words === 'real'
  ? new URL('../data/words.js', import.meta.url)
  : new URL('../tests/fixtures/words-fixture.js', import.meta.url);
if (!existsSync(fileURLToPath(source))) {
  console.log(`${fileURLToPath(source)} がまだ無いので終わります（単語帳ができてから --words ${opts.words} で試す）`);
  process.exit(1);
}
const { WORDS } = await import(source.href);

// seed は果たし状と同じ形（base36）。毎回同じ並びにして結果を比べられるようにする
const seeds = Array.from({ length: opts.n }, (_, i) => hashSeed(`sim-${i}`).toString(36));

const rows = [];
for (const lv of LEVELS) {
  // 初回は索引づくりと JIT の立ち上がりが入るので、測る前に数回まわしておく
  for (let i = 0; i < 5; i++) generatePuzzle({ level: lv, seed: `warm-${i}`, words: WORDS });
  let exact = 0, total = 0, max = 0, area = 0, w = 0, h = 0, two = 0, attempts = 0;
  let blankExact = 0, blankCross = 0, fullWord = 0, dropped = 0;
  for (const seed of seeds) {
    const stats = {};
    const t0 = performance.now();
    const p = generatePuzzle({ level: lv, seed, words: WORDS, stats });
    const ms = performance.now() - t0;
    total += ms;
    if (ms > max) max = ms;
    if (p.crossingsExact) exact++;
    // v2：空きの数が埋める字と一致したか・すべて辻か・全部空きの言葉があるか
    if (p.blanks.length === lv.blanks) blankExact++;
    if (p.blanksAtCrossingsOnly) blankCross++;
    const blank = new Set(p.blanks.map(({ x, y }) => `${x},${y}`));
    const isFull = (word) => Array.from({ length: word.length }, (_, i) => (word.dir === 'across' ? `${word.x + i},${word.y}` : `${word.x},${word.y + i}`)).every((k) => blank.has(k));
    if (p.words.some(isFull)) {
      fullWord++;
      // 埋める字が辻より少ないのに全部空きの言葉がある＝制約10を満たせず外した盤（選び方は全部空きの言葉の数を最優先で減らす）
      if (lv.blanks < p.crossings) dropped++;
    }
    area += p.width * p.height;
    w += p.width;
    h += p.height;
    two += p.words.filter((x) => x.length === 2).length;
    attempts += stats.attempts;
  }
  const n = seeds.length;
  rows.push({
    lv,
    rate: (exact / n) * 100,
    blankRate: (blankExact / n) * 100,
    crossRate: (blankCross / n) * 100,
    fullRate: (fullWord / n) * 100,
    dropped,
    avg: total / n,
    max,
    size: `${(w / n).toFixed(1)}×${(h / n).toFixed(1)}`,
    area: area / n,
    two: two / n,
    attempts: attempts / n,
  });
}

console.log(`単語帳: ${opts.words}（${WORDS.length}件）  seed: ${opts.n}個`);
console.log('| 腕前 | 語・辻・埋める字・盤 | 辻の一致率 | 空きの数の一致 | 空きがすべて辻 | 全部空きの言葉がある盤 | 制約10を外した盤 | 平均ms | 最大ms | 盤の平均 | 2字の平均 | 平均試行 |');
console.log('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const r of rows) {
  const { lv } = r;
  console.log(
    `| ${lv.name} | ${lv.words}語・${lv.crossings}辻・${lv.blanks}字・${lv.maxW}×${lv.maxH} | ${r.rate.toFixed(1)}% | ${r.blankRate.toFixed(1)}% | ${r.crossRate.toFixed(1)}% | ${r.fullRate.toFixed(1)}% | ${r.lv.blanks < r.lv.crossings ? `${r.dropped}盤` : '—'} | ${r.avg.toFixed(2)} | ${r.max.toFixed(1)} | ${r.size}（${r.area.toFixed(0)}マス） | ${r.two.toFixed(2)} | ${r.attempts.toFixed(2)} |`,
  );
}
const now = new Date(); // 記録は手元の日付で残す（toISOString だと UTC で前日になる）
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const summary = rows
  .map((r) => `${r.lv.name}（${r.lv.blanks}字） 辻${r.rate.toFixed(1)}%・空き一致${r.blankRate.toFixed(1)}%・すべて辻${r.crossRate.toFixed(1)}%・全部空きの言葉${r.fullRate.toFixed(1)}%${r.lv.blanks < r.lv.crossings ? `（制約10を外した盤 ${r.dropped}）` : ''}・${r.avg.toFixed(1)}ms`)
  .join('／');
console.log(`\n記録用: - ${today} ${opts.words} ${WORDS.length}件（n=${opts.n}）：${summary}`);
