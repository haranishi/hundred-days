import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORDS } from './fixtures/words-fixture.js';
import { WORDS as REAL } from '../data/words.js';
import { generatePuzzle, cluesClash } from '../lib/generator.js';
import { LEVELS, getLevel } from '../lib/levels.js';
import { kanjiNumeral, normalizeAnswer } from '../lib/kana.js';
import { hashSeed } from '../lib/rng.js';

const SEEDS = Array.from({ length: 300 }, (_, i) => (i * 7919 + 104729).toString(36));
const BY_READING = new Map(WORDS.map((w) => [w.r, w]));

// ---- v2：空きの検査（守ること 8〜10） ----

const cellsOf = (w) => Array.from({ length: w.length }, (_, i) => (w.dir === 'across' ? { x: w.x + i, y: w.y } : { x: w.x, y: w.y + i }));

function crossingCells(p) {
  const cover = p.grid.map((row) => row.map(() => 0));
  for (const w of p.words) for (const { x, y } of cellsOf(w)) cover[y][x] |= w.dir === 'across' ? 1 : 2;
  const list = [];
  cover.forEach((row, y) => row.forEach((c, x) => { if (c === 3) list.push({ x, y }); }));
  return list;
}

// 空きの選び方の点：[全部空きの言葉の数, 語ごとの空きの最大]
function blankScore(p, cells) {
  const set = new Set(cells.map(({ x, y }) => `${x},${y}`));
  let full = 0;
  let max = 0;
  for (const w of p.words) {
    const n = cellsOf(w).filter(({ x, y }) => set.has(`${x},${y}`)).length;
    if (n === w.length) full++;
    if (n > max) max = n;
  }
  return [full, max];
}

// cands から b 個を選ぶ組み合わせをすべて試し（fixed は先に空けておくマス）、いちばん良い点を返す
function bestScore(p, cross, b, fixed = []) {
  let best = null;
  const pick = [];
  const walk = (start) => {
    if (pick.length === b) {
      const sc = blankScore(p, [...fixed, ...pick]);
      if (!best || sc[0] < best[0] || (sc[0] === best[0] && sc[1] < best[1])) best = sc;
      return;
    }
    for (let i = start; i <= cross.length - (b - pick.length); i++) {
      pick.push(cross[i]);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return best;
}

// 空きが守ること 8〜10 を満たしているか。破れていた点を文で返す
function blankProblems(p, lv) {
  const bad = [];
  const cross = crossingCells(p);
  const isCross = new Set(cross.map(({ x, y }) => `${x},${y}`));
  const letters = p.grid.flat().filter(Boolean).length;
  if (p.blanks.length !== Math.min(lv.blanks, letters)) bad.push(`空きの数 ${p.blanks.length}`);
  const keys = p.blanks.map(({ x, y }) => `${x},${y}`);
  if (new Set(keys).size !== keys.length) bad.push('空きが重なる');
  if (p.blanks.some(({ x, y }) => !p.grid[y]?.[x])) bad.push('字の無いマスが空き');
  if (p.blanks.some((c, i) => i > 0 && (c.y < p.blanks[i - 1].y || (c.y === p.blanks[i - 1].y && c.x <= p.blanks[i - 1].x)))) bad.push('行優先でない');
  const allCross = p.blanks.every(({ x, y }) => isCross.has(`${x},${y}`));
  if (p.blanksAtCrossingsOnly !== allCross) bad.push('blanksAtCrossingsOnly');
  if (cross.length >= lv.blanks && !allCross) bad.push('辻が足りているのに辻以外が空き');
  if (cross.length <= lv.blanks && !cross.every(({ x, y }) => keys.includes(`${x},${y}`))) bad.push('辻がすべて空いていない');
  const got = blankScore(p, p.blanks);
  let want = null;
  if (lv.blanks < cross.length) want = bestScore(p, cross, lv.blanks);
  else if (lv.blanks > cross.length && lv.blanks < letters) {
    const plain = [];
    p.grid.forEach((row, y) => row.forEach((ch, x) => { if (ch && !isCross.has(`${x},${y}`)) plain.push({ x, y }); }));
    want = bestScore(p, plain, lv.blanks - cross.length, cross);
  }
  if (want && (got[0] !== want[0] || got[1] !== want[1])) bad.push(`空きの選び方が最善でない ${got}≠${want}`);
  return bad;
}

// 盤を横（dir='across'）か縦に走査して、2字以上続く並びを集める
function runs(p, dir) {
  const found = [];
  const outer = dir === 'across' ? p.height : p.width;
  const inner = dir === 'across' ? p.width : p.height;
  const at = (o, i) => (dir === 'across' ? p.grid[o][i] : p.grid[i][o]);
  for (let o = 0; o < outer; o++) {
    let i = 0;
    while (i < inner) {
      if (!at(o, i)) { i++; continue; }
      let j = i;
      let text = '';
      while (j < inner && at(o, j)) text += at(o, j++);
      if (text.length >= 2) found.push(dir === 'across' ? `${i},${o}:${text}` : `${o},${i}:${text}`);
      i = j;
    }
  }
  return found.sort();
}

// ENGINE.md「守ること」2〜7 を確かめ、破れていた点を文で返す
function problems(p, lv, seed) {
  const bad = [];
  if (p.version !== 2 || p.level !== lv.id || p.seed !== seed) bad.push('version/level/seed');
  // 2. 語数・重複・長さ・2字の数・難しさ
  if (p.words.length !== lv.words) bad.push(`語数 ${p.words.length}`);
  if (new Set(p.words.map((w) => w.answer)).size !== p.words.length) bad.push('同じ答え');
  for (const w of p.words) {
    if (w.length < lv.minLen || w.length > lv.maxLen || w.answer.length !== w.length) bad.push(`長さ ${w.answer}`);
    if (!lv.tiers.includes(w.tier)) bad.push(`tier ${w.answer}`);
    const src = BY_READING.get(w.reading);
    if (!src || normalizeAnswer(src.r) !== w.answer || src.k !== w.kanji || src.c !== w.clue || src.t !== w.tier) {
      bad.push(`単語帳と違う ${w.answer}`);
    }
  }
  if (p.words.filter((w) => w.length === 2).length > lv.maxTwoLetter) bad.push('2字が多い');
  // 同じ盤の中で、問が別の言葉の答えを言わない（fixture でも「花」「魚」は分類名として問に入っている）
  const src = p.words.map((w) => BY_READING.get(w.reading)).filter(Boolean);
  for (let i = 0; i < src.length; i++) {
    for (let j = i + 1; j < src.length; j++) if (cluesClash(src[i], src[j])) bad.push(`問が答えを言う ${src[i].r}・${src[j].r}`);
  }
  // 3. 外接矩形に切り詰め、maxW×maxH 以内
  if (p.width > lv.maxW || p.height > lv.maxH) bad.push(`盤 ${p.width}×${p.height}`);
  if (p.grid.length !== p.height || p.grid.some((row) => row.length !== p.width)) bad.push('grid の形');
  const hasLetter = (cells) => cells.some(Boolean);
  const col = (x) => p.grid.map((row) => row[x]);
  if (!hasLetter(p.grid[0]) || !hasLetter(p.grid[p.height - 1]) || !hasLetter(col(0)) || !hasLetter(col(p.width - 1))) {
    bad.push('切り詰めていない');
  }
  // 4. 横・縦の並びは置いた言葉とちょうど一致（前後のマスが空きであることも含む）
  for (const dir of ['across', 'down']) {
    const placed = p.words.filter((w) => w.dir === dir).map((w) => `${w.x},${w.y}:${w.answer}`).sort();
    if (JSON.stringify(runs(p, dir)) !== JSON.stringify(placed)) bad.push(`意図しない言葉（${dir}）`);
  }
  // 5. どの字もどれかの言葉に属し、全体が1つにつながる
  const cover = p.grid.map((row) => row.map(() => 0));
  for (const w of p.words) {
    for (let i = 0; i < w.length; i++) {
      const x = w.dir === 'across' ? w.x + i : w.x;
      const y = w.dir === 'across' ? w.y : w.y + i;
      if (p.grid[y]?.[x] !== w.answer[i]) bad.push(`字が違う ${w.answer}`);
      cover[y][x] |= w.dir === 'across' ? 1 : 2;
    }
  }
  const letters = [];
  p.grid.forEach((row, y) => row.forEach((ch, x) => { if (ch) letters.push([x, y]); }));
  if (letters.some(([x, y]) => cover[y][x] === 0)) bad.push('言葉に属さない字');
  const seen = new Set([`${letters[0][0]},${letters[0][1]}`]);
  const queue = [letters[0]];
  while (queue.length) {
    const [x, y] = queue.pop();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (p.grid[ny]?.[nx] && !seen.has(`${nx},${ny}`)) {
        seen.add(`${nx},${ny}`);
        queue.push([nx, ny]);
      }
    }
  }
  if (seen.size !== letters.length) bad.push('つながっていない');
  // 6. 辻の数
  const crossings = cover.flat().filter((c) => c === 3).length;
  if (crossings !== p.crossings) bad.push(`辻の数が合わない ${crossings}≠${p.crossings}`);
  if (p.crossingsExact !== (p.crossings === lv.crossings)) bad.push('crossingsExact');
  // 7. 番号は行優先で、言葉の始まりに振る
  const starts = new Set(p.words.map((w) => `${w.x},${w.y}`));
  let n = 0;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const want = starts.has(`${x},${y}`) ? ++n : 0;
      if (p.numbers[y][x] !== want) bad.push(`番号 ${x},${y}`);
    }
  }
  for (const w of p.words) {
    const label = `${w.dir === 'across' ? '横' : '縦'}の${kanjiNumeral(w.number)}`;
    if (w.number !== p.numbers[w.y][w.x] || w.label !== label || w.id !== `${w.dir === 'across' ? 'a' : 'd'}${w.number}`) {
      bad.push(`番号の札 ${w.id}`);
    }
  }
  const order = p.words.map((w) => w.number * 2 + (w.dir === 'across' ? 0 : 1));
  if (order.some((v, i) => i > 0 && v <= order[i - 1])) bad.push('words の並び');
  // 8〜10. 空き
  bad.push(...blankProblems(p, lv));
  return bad;
}

for (const lv of LEVELS) {
  test(`generator：${lv.name}を300 seed で組み、守ること2〜10を満たし、辻の一致率が99%以上`, () => {
    let exact = 0;
    for (const seed of SEEDS) {
      const p = generatePuzzle({ level: lv.id, seed, words: WORDS });
      assert.deepEqual(problems(p, lv, seed), [], `seed ${seed}`);
      if (p.crossingsExact) exact++;
    }
    assert.ok(exact / SEEDS.length >= 0.99, `一致率 ${exact}/${SEEDS.length}`);
  });
}

test('generator：同じ (level, seed, words) なら deepEqual（単語帳の写しや腕前の渡し方を変えても同じ）', () => {
  for (const lv of LEVELS) {
    for (const seed of SEEDS.slice(0, 20)) {
      const a = generatePuzzle({ level: lv.id, seed, words: WORDS });
      assert.deepEqual(generatePuzzle({ level: lv.id, seed, words: WORDS }), a);
      assert.deepEqual(generatePuzzle({ level: getLevel(lv.id), seed, words: [...WORDS] }), a);
    }
  }
});

// ---- v2：実際の単語帳での空き ----

const REAL_SEEDS = Array.from({ length: 500 }, (_, i) => hashSeed(`real-${i}`).toString(36));

for (const lv of LEVELS) {
  test(`generator（v2）：実際の単語帳で${lv.name}を500盤。空きはちょうど ${lv.blanks}・すべて辻・同じ seed なら盤も空きも同じ`, () => {
    let fullWordBoards = 0;
    for (const seed of REAL_SEEDS) {
      const p = generatePuzzle({ level: lv.id, seed, words: REAL });
      assert.equal(p.version, 2);
      assert.equal(p.blanks.length, lv.blanks, `${seed}：空きの数`);
      assert.equal(p.blanksAtCrossingsOnly, true, `${seed}：辻以外が空き`);
      assert.deepEqual(blankProblems(p, lv), [], `seed ${seed}`);
      const blank = new Set(p.blanks.map(({ x, y }) => `${x},${y}`));
      const fullWords = p.words.filter((w) => cellsOf(w).every(({ x, y }) => blank.has(`${x},${y}`)));
      if (lv.blanks < p.crossings) assert.deepEqual(fullWords.map((w) => w.id), [], `${seed}：全部空きの言葉`);
      if (fullWords.length) fullWordBoards++;
      assert.deepEqual(generatePuzzle({ level: lv.id, seed, words: REAL }), p, `${seed}：決定的でない`);
    }
    // 一人前はどの言葉にも空きでないマスがある（上で全盤を確かめた）。免許皆伝は辻をすべて空けるので全部空きの言葉もありうる
    if (lv.blanks < lv.crossings) assert.equal(fullWordBoards, 0);
  });
}

test('generator（v2）：空きの数を変えても、盤の組み方（語・位置・番号）は同じ。空きの乱数は盤と別の系列', () => {
  for (const lv of LEVELS) {
    for (const seed of SEEDS.slice(0, 40)) {
      const a = generatePuzzle({ level: lv.id, seed, words: WORDS });
      for (const blanks of [1, 2, lv.crossings]) {
        const b = generatePuzzle({ level: { ...lv, blanks }, seed, words: WORDS });
        assert.deepEqual([b.grid, b.numbers, b.words, b.crossings], [a.grid, a.numbers, a.words, a.crossings], `${lv.name} ${seed} blanks=${blanks}`);
        assert.equal(b.blanks.length, Math.min(blanks, a.grid.flat().filter(Boolean).length));
      }
    }
  }
});

test('generator（v2）：辻より埋める字が多い腕前では、辻をすべて空けて辻以外で補い blanksAtCrossingsOnly:false', () => {
  for (const lv of LEVELS) {
    for (const seed of SEEDS.slice(0, 40)) {
      const want = lv.crossings + 3;
      const p = generatePuzzle({ level: { ...lv, blanks: want }, seed, words: WORDS });
      assert.equal(p.blanks.length, want);
      assert.equal(p.blanksAtCrossingsOnly, false);
      // 補うマスも同じ規則（全部空きの言葉をできるだけ作らず、語ごとの最大を小さく）で最善を選ぶ（blankProblems が総当たりと比べる）
      assert.deepEqual(blankProblems(p, { ...lv, blanks: want }), [], `${lv.name} ${seed}`);
    }
  }
});

test('generator（v2）：組み合わせが多すぎるとき（貪欲で選ぶ道）も、数・辻・決定性を守る', () => {
  const lv = getLevel(3);
  for (const seed of SEEDS.slice(0, 20)) {
    const want = lv.crossings + 8; // 辻以外のマスから8つ：組み合わせは2万を超える
    const a = generatePuzzle({ level: { ...lv, blanks: want }, seed, words: WORDS });
    assert.equal(a.blanks.length, want);
    assert.equal(a.blanksAtCrossingsOnly, false);
    const keys = new Set(a.blanks.map(({ x, y }) => `${x},${y}`));
    assert.ok(crossingCells(a).every(({ x, y }) => keys.has(`${x},${y}`)), `${seed}：辻がすべて空いていない`);
    assert.deepEqual(generatePuzzle({ level: { ...lv, blanks: want }, seed, words: WORDS }), a);
  }
});

test('generator（v2）：同じ seed の盤と空きは版を重ねても変わらない（果たし状のリンクを古い版と新しい版で共有できる）', () => {
  const golden = {
    1: { rows: ['じやんけん', '.か...', 'せんせい.', 'な....', 'かぶとむし'], blanks: '0,2' },
    // 一人前の空きは埋める字を 5→7 に変えたとき（体験評価 v2-r1）に変わった。盤（rows）は変わっていない
    2: { rows: ['...と.....', 'おしようがつ...', '.い.も..か..', '.た.ろうそく..', 'たけのこ..れ..', 'ま..しやぼんだま', 'ご.....ぼ..'], blanks: '1,1 3,3 6,3 0,4 1,4 3,5 6,5' },
    3: {
      rows: ['ひばち.....', '..よ..せ.ま', '.ゆうびんきよく', '..ち..し.ら', 'ぶぎようしよ..', '.ゆ..よ.し.', '.う.ゆうえんち', '.に..が.か.', '.ゆきがつせん.', '.う..こ.せ.', '....うどん.'],
      blanks: '2,0 2,2 5,2 7,2 1,4 2,4 4,4 5,4 4,6 6,6 1,8 4,8 6,8 4,10 6,10',
    },
  };
  for (const lv of LEVELS) {
    const p = generatePuzzle({ level: lv.id, seed: 'k9x2q7', words: WORDS });
    assert.deepEqual(p.grid.map((r) => r.map((c) => c || '.').join('')), golden[lv.id].rows, lv.name);
    assert.equal(p.blanks.map(({ x, y }) => `${x},${y}`).join(' '), golden[lv.id].blanks, lv.name);
  }
});

test('generator：Math.random と時刻を使わない', () => {
  const realRandom = Math.random;
  const realNow = Date.now;
  const realPerf = performance.now;
  const trap = () => { throw new Error('生成器が乱数か時刻を使った'); };
  try {
    Math.random = trap;
    Date.now = trap;
    performance.now = trap;
    for (const lv of LEVELS) generatePuzzle({ level: lv.id, seed: 'trap1', words: [...WORDS] });
  } finally {
    Math.random = realRandom;
    Date.now = realNow;
    performance.now = realPerf;
  }
});

test('generator：別の seed では盤が変わる', () => {
  for (const lv of LEVELS) {
    const grids = SEEDS.slice(0, 30).map((seed) => JSON.stringify(generatePuzzle({ level: lv.id, seed, words: WORDS }).grid));
    assert.ok(new Set(grids).size >= 29, `${lv.name}：30 seed で ${new Set(grids).size} 種類`);
    const a = generatePuzzle({ level: lv.id, seed: 'abcd12', words: WORDS });
    const b = generatePuzzle({ level: lv.id, seed: 'abcd13', words: WORDS });
    assert.notDeepEqual(a.grid, b.grid);
  }
});

test('generator：言葉が足りない単語帳ではエラーを投げる', () => {
  assert.throws(() => generatePuzzle({ level: 1, seed: 'x', words: WORDS.slice(0, 3) }));
  assert.throws(() => generatePuzzle({ level: 9, seed: 'x', words: WORDS }));
});

test('検査の自己確認：平行に隣り合う言葉や離れた言葉を見逃さない', async () => {
  const { buildPuzzle } = await import('../lib/generator.js');
  const lv = getLevel(1);
  const mk = (dir, x, y, answer) => ({ dir, x, y, answer, reading: answer, kanji: answer, clue: '', tier: 1 });
  // ねこ と いぬ を上下に並べると、縦に「ねい」「こぬ」ができる
  const stacked = buildPuzzle({ level: lv, seed: 's', placements: [mk('across', 0, 0, 'ねこ'), mk('across', 0, 1, 'いぬ')] });
  assert.ok(problems(stacked, lv, 's').some((m) => m.startsWith('意図しない言葉')));
  // 交わらない2語は、つながっていない
  const apart = buildPuzzle({ level: lv, seed: 's', placements: [mk('across', 0, 0, 'ねこ'), mk('across', 0, 2, 'いぬ')] });
  assert.ok(problems(apart, lv, 's').includes('つながっていない'));
});

test('cluesClash：問に相手の書き方か3字以上の読みが入る組を見分ける', () => {
  const saru = { r: 'さる', k: '猿', c: '温泉に浸かる山の住人' };
  const onsen = { r: 'おんせん', k: '温泉', c: 'さるも浸かる湯' };
  assert.equal(cluesClash(saru, onsen), true);
  assert.equal(cluesClash(onsen, saru), true);
  assert.equal(cluesClash({ ...saru, c: '山の住人' }, onsen), false); // 2字の読み「さる」は見ない
  assert.equal(cluesClash({ r: 'ねこ', k: '猫', c: 'おんせんが好き' }, { ...onsen, c: '湯' }), true); // 3字以上の読み
  assert.equal(cluesClash({ r: 'ねこ', k: '猫', c: '鼠を捕る' }, { r: 'いぬ', k: '犬', c: '番をする' }), false);
});

test('generator：問が答えを言い合う組を多く仕込んだ単語帳でも、盤にその組は載らず一致率も保つ', () => {
  const n = WORDS.length;
  const tangled = WORDS.map((w, i) => ({ ...w, c: `仮の問：${WORDS[(i + 1) % n].k}や${WORDS[(i + 5) % n].r}に似た${w.g}` }));
  const byR = new Map(tangled.map((w) => [w.r, w]));
  let pairs = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (cluesClash(tangled[i], tangled[j])) pairs++;
  assert.ok(pairs > n, `仕込んだ組 ${pairs}`);
  for (const lv of LEVELS) {
    let exact = 0;
    for (const seed of SEEDS.slice(0, 200)) {
      const p = generatePuzzle({ level: lv.id, seed, words: tangled });
      const src = p.words.map((w) => byR.get(w.reading));
      for (let i = 0; i < src.length; i++) {
        for (let j = i + 1; j < src.length; j++) assert.equal(cluesClash(src[i], src[j]), false, `${lv.name} ${seed}: ${src[i].r}・${src[j].r}`);
      }
      if (p.crossingsExact) exact++;
    }
    assert.ok(exact / 200 >= 0.99, `${lv.name} 一致率 ${exact}/200`);
  }
});
