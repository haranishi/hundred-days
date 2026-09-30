// 盤の生成。同じ (level, seed, words) からは必ず同じ盤を出す（果たし状で同じ盤を届けるため）。
// 時刻・経過時間・Math.random は使わず、打ち切りは試行回数だけで決める。
// v2：組んだ盤から「空き」（埋める字）を辻だけから選ぶ。空きの乱数は盤の組み立てと別の系列にし、盤は v1 と同じ seed で同じにする。
import { mulberry32, hashSeed, shuffle } from './rng.js';
import { normalizeAnswer, kanjiNumeral } from './kana.js';
import { getLevel } from './levels.js';

const ACROSS = 0;
const DOWN = 1;

// 置き場所の点（小さいほど良い）。
// 辻が足りないうちは盤を外へ広げる：詰めて置くと平行な言葉の間に空きの筋が残らず、2語に交わる手（輪）が作れない。
// 輪を閉じ終えたら小さくまとめる。外周だけで測ると細長く伸びるので、縦横の差にも罰点を付ける
const W_GROWTH_OPEN = -1;
const W_GROWTH_TIGHT = 1;
const W_ASPECT = 0.5;
const W_RANK = 3;
const W_JITTER = 1.5;
const W_TWO = 1.5; // 2字の言葉は埋め草になりやすいので少し控える
// 辻が足りないとき、置いた後に2語へ交わる置き場所がいくつ生まれるかを先読みする（候補の上限と重み）
const LOOKAHEAD = 200;
const W_POTENTIAL = 50;

const poolCache = new WeakMap();

// 腕前に合う言葉を正規化して並べ、字から（言葉, 位置）を引ける索引を作る。単語帳ごとに使い回す
function getPool(words, lv) {
  const key = `${lv.tiers.join(',')}|${lv.minLen}|${lv.maxLen}`;
  let byKey = poolCache.get(words);
  if (!byKey) {
    byKey = new Map();
    poolCache.set(words, byKey);
  }
  const hit = byKey.get(key);
  if (hit && hit.count === words.length) return hit;

  const seen = new Set();
  const pool = [];
  for (const src of words) {
    if (!src || !lv.tiers.includes(src.t)) continue;
    const answer = normalizeAnswer(src.r);
    if (!answer || answer.length < lv.minLen || answer.length > lv.maxLen) continue;
    if (seen.has(answer)) continue;
    seen.add(answer);
    const codes = new Uint16Array(answer.length);
    for (let i = 0; i < answer.length; i++) codes[i] = answer.charCodeAt(i);
    pool.push({ answer, codes, len: answer.length, tier: src.t, src });
  }
  const index = new Map();
  pool.forEach((w, pi) => {
    for (let i = 0; i < w.len; i++) {
      let list = index.get(w.codes[i]);
      if (!list) index.set(w.codes[i], (list = []));
      list.push(pi * 8 + i);
    }
  });
  // (前の字, 後の字, 間隔) → その並びを持つ（言葉, 前の字の位置）。2語に交わる置き場所を直接引く
  const pairs = new Map();
  pool.forEach((w, pi) => {
    for (let i = 0; i < w.len; i++) {
      for (let j = i + 2; j < w.len; j++) {
        const key = pairKey(w.codes[i], w.codes[j], j - i);
        let list = pairs.get(key);
        if (!list) pairs.set(key, (list = []));
        list.push(pi * 8 + i);
      }
    }
  });
  // 言葉ごとの「同じ盤に置けない言葉」の一覧。実際に置いた言葉の分だけ、使うときに作る
  const clashes = new Array(pool.length);
  const entry = { count: words.length, pool, index, pairs, clashes };
  byKey.set(key, entry);
  return entry;
}

/**
 * 2語を同じ盤に置くと、片方の問がもう片方の答えを言ってしまうか。
 * 問 c に相手の書き方 k が入る、または（3字以上の）読み r が入るなら true。2字の読みは偶然入りやすいので見ない
 */
export function cluesClash(a, b) {
  const has = (clue, s) => typeof clue === 'string' && typeof s === 'string' && s.length > 0 && clue.includes(s);
  const longReading = (w) => typeof w.r === 'string' && [...w.r].length >= 3;
  return has(a.c, b.k) || has(b.c, a.k) || (longReading(b) && has(a.c, b.r)) || (longReading(a) && has(b.c, a.r));
}

function clashesOf(ctx, pi) {
  let list = ctx.clashes[pi];
  if (!list) {
    list = [];
    const a = ctx.pool[pi].src;
    for (let pj = 0; pj < ctx.pool.length; pj++) if (pj !== pi && cluesClash(a, ctx.pool[pj].src)) list.push(pj);
    ctx.clashes[pi] = list;
  }
  return list;
}

// 盤に置ける字はすべて U+3041〜U+3093 に収まる
function pairKey(a, b, gap) {
  return ((a - 0x3040) * 128 + (b - 0x3040)) * 8 + gap;
}

function makeState(S, poolSize) {
  return {
    cells: new Uint16Array(S * S),
    acrossAt: new Int16Array(S * S),
    downAt: new Int16Array(S * S),
    used: new Uint8Array(poolSize),
    banned: new Uint8Array(poolSize), // 置いた言葉と問が答えを言い合う言葉
    placed: [],
    crossings: 0,
    twoCount: 0,
    minX: 0, maxX: 0, minY: 0, maxY: 0,
  };
}

function resetState(st) {
  st.cells.fill(0);
  st.acrossAt.fill(-1);
  st.downAt.fill(-1);
  st.used.fill(0);
  st.banned.fill(0);
  st.placed.length = 0;
  st.crossings = 0;
  st.twoCount = 0;
}

// 置けるなら交わる数を返し、置けなければ -1。
// 前後のマスが空き・新しく埋めるマスの両脇が空き、を守れば意図しない言葉はできない
function probe(ctx, st, w, dir, x, y, out) {
  const L = w.len;
  let { minX, maxX, minY, maxY } = st;
  const ex = dir === ACROSS ? x + L - 1 : x;
  const ey = dir === ACROSS ? y : y + L - 1;
  if (x < minX) minX = x;
  if (ex > maxX) maxX = ex;
  if (y < minY) minY = y;
  if (ey > maxY) maxY = ey;
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  // 先に外接矩形を確かめる。これで下のマスの読み出しが必ず盤面の内側に収まる
  if (bw > ctx.maxW || bh > ctx.maxH) return -1;
  const S = ctx.S;
  const step = dir === ACROSS ? 1 : S;
  const side = dir === ACROSS ? S : 1;
  const same = dir === ACROSS ? st.acrossAt : st.downAt;
  const cells = st.cells;
  let idx = y * S + x;
  if (cells[idx - step] !== 0 || cells[idx + L * step] !== 0) return -1;
  let xc = 0;
  let first = -1;
  for (let i = 0; i < L; i++, idx += step) {
    const c = cells[idx];
    if (c !== 0) {
      if (c !== w.codes[i] || same[idx] >= 0) return -1;
      if (first < 0) first = i;
      xc++;
    } else if (cells[idx - side] !== 0 || cells[idx + side] !== 0) {
      return -1;
    }
  }
  out.first = first;
  out.bw = bw;
  out.bh = bh;
  return xc;
}

function place(ctx, st, pi, dir, x, y, real = true) {
  const w = ctx.pool[pi];
  const S = ctx.S;
  const step = dir === ACROSS ? 1 : S;
  const own = dir === ACROSS ? st.acrossAt : st.downAt;
  const k = st.placed.length;
  let idx = y * S + x;
  for (let i = 0; i < w.len; i++, idx += step) {
    if (st.cells[idx] === 0) st.cells[idx] = w.codes[i];
    else st.crossings++;
    own[idx] = k;
  }
  const ex = dir === ACROSS ? x + w.len - 1 : x;
  const ey = dir === ACROSS ? y : y + w.len - 1;
  if (k === 0) {
    st.minX = x; st.maxX = ex; st.minY = y; st.maxY = ey;
  } else {
    if (x < st.minX) st.minX = x;
    if (ex > st.maxX) st.maxX = ex;
    if (y < st.minY) st.minY = y;
    if (ey > st.maxY) st.maxY = ey;
  }
  st.used[pi] = 1;
  if (w.len === 2) st.twoCount++;
  st.placed.push({ pi, dir, x, y });
  if (real) for (const pj of clashesOf(ctx, pi)) st.banned[pj] = 1;
}

// 最後に置いた言葉を取り除く（先読みの仮置きを戻す）
function unplace(ctx, st, saved) {
  const p = st.placed.pop();
  const w = ctx.pool[p.pi];
  const S = ctx.S;
  const step = p.dir === ACROSS ? 1 : S;
  const own = p.dir === ACROSS ? st.acrossAt : st.downAt;
  const other = p.dir === ACROSS ? st.downAt : st.acrossAt;
  let idx = p.y * S + p.x;
  for (let i = 0; i < w.len; i++, idx += step) {
    own[idx] = -1;
    if (other[idx] < 0) st.cells[idx] = 0;
    else st.crossings--;
  }
  st.used[p.pi] = 0;
  if (w.len === 2) st.twoCount--;
  st.minX = saved.minX; st.maxX = saved.maxX; st.minY = saved.minY; st.maxY = saved.maxY;
}

// いま置いた言葉のマスを通り、ほかの言葉にも交わる置き場所（2辻以上）がいくつあるか（limit で打ち切る）
function followUps(ctx, st, limit, out) {
  const p = st.placed[st.placed.length - 1];
  const w = ctx.pool[p.pi];
  const S = ctx.S;
  const dir2 = p.dir === ACROSS ? DOWN : ACROSS;
  const sameAsW2 = dir2 === ACROSS ? st.acrossAt : st.downAt;
  let count = 0;
  for (let i = 0; i < w.len; i++) {
    const cx = p.dir === ACROSS ? p.x + i : p.x;
    const cy = p.dir === ACROSS ? p.y : p.y + i;
    const idx = cy * S + cx;
    if (st.acrossAt[idx] >= 0 && st.downAt[idx] >= 0) continue;
    for (let gap = 2; gap < ctx.maxLen; gap++) {
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        const jx = dir2 === ACROSS ? cx + sgn * gap : cx;
        const jy = dir2 === ACROSS ? cy : cy + sgn * gap;
        if (jx < 1 || jy < 1 || jx >= S - 1 || jy >= S - 1) continue;
        const j = jy * S + jx;
        if (st.cells[j] === 0 || sameAsW2[j] >= 0) continue;
        const headIdx = sgn < 0 ? j : idx; // 並びの前（左か上）のマス
        const list = ctx.pairs.get(pairKey(st.cells[headIdx], st.cells[sgn < 0 ? idx : j], gap));
        if (!list) continue;
        const hx = sgn < 0 ? jx : cx;
        const hy = sgn < 0 ? jy : cy;
        for (let q = 0; q < list.length; q++) {
          const pi = list[q] >> 3;
          if (st.used[pi] || st.banned[pi]) continue;
          const pos = list[q] & 7;
          const x2 = dir2 === ACROSS ? hx - pos : hx;
          const y2 = dir2 === ACROSS ? hy : hy - pos;
          if (probe(ctx, st, ctx.pool[pi], dir2, x2, y2, out) < 2) continue;
          // 仮置きの言葉との組は一覧に載せていないので、ここで直接確かめる
          if (cluesClash(w.src, ctx.pool[pi].src)) continue;
          if (++count >= limit) return count;
        }
      }
    }
  }
  return count;
}

// 1回の試行。N語置けたら { placed, crossings }、行き詰まれば null
function attempt(ctx, st, rand) {
  const { pool, index, N, C, S } = ctx;
  resetState(st);
  const n = pool.length;

  // 重み付きの並べ替え（重みの大きい tier ほど前に来やすい）
  const keys = new Float64Array(n);
  for (let i = 0; i < n; i++) keys[i] = -Math.log(1 - rand()) / ctx.weightOf(pool[i].tier);
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => keys[a] - keys[b] || a - b);
  const rankScore = new Float64Array(n);
  order.forEach((pi, r) => { rankScore[pi] = r / n; });

  let firstPi = order.find((pi) => pool[pi].len >= ctx.firstMin && pool[pi].len <= ctx.firstMax);
  if (firstPi === undefined) firstPi = order[0];
  place(ctx, st, firstPi, ACROSS, ctx.center - (pool[firstPi].len >> 1), ctx.center);

  const out = { first: 0, bw: 0, bh: 0 };
  const cands = [];
  while (st.placed.length < N) {
    const r = N - st.placed.length; // これを含めた残りの語数
    const d = C - st.crossings; // まだ要る辻
    // 残りの言葉も最低1つずつ交わるので、この言葉で使える辻は d-(r-1) まで。最後の1語はちょうど d
    const lo = r === 1 ? d : 1;
    const hi = d - (r - 1);
    const extra = d - r; // 1語1辻を超えて要る分
    const perim0 = st.maxX - st.minX + st.maxY - st.minY + 2;
    cands.length = 0;
    let maxXc = 0;
    const placedCount = st.placed.length;
    for (let k = 0; k < placedCount; k++) {
      const p = st.placed[k];
      const plen = pool[p.pi].len;
      const newDir = p.dir === ACROSS ? DOWN : ACROSS;
      for (let i = 0; i < plen; i++) {
        const cx = p.dir === ACROSS ? p.x + i : p.x;
        const cy = p.dir === ACROSS ? p.y : p.y + i;
        const idx = cy * S + cx;
        if (st.acrossAt[idx] >= 0 && st.downAt[idx] >= 0) continue;
        const list = index.get(st.cells[idx]);
        if (!list) continue;
        for (let j = 0; j < list.length; j++) {
          const pi = list[j] >> 3;
          if (st.used[pi] || st.banned[pi]) continue;
          const pos = list[j] & 7;
          const w = pool[pi];
          if (w.len === 2 && st.twoCount >= ctx.maxTwo) continue;
          const sx = newDir === ACROSS ? cx - pos : cx;
          const sy = newDir === ACROSS ? cy : cy - pos;
          const xc = probe(ctx, st, w, newDir, sx, sy, out);
          // 2語に交わる置き場所は最初に交わるマスからだけ数え、重ねて数えない
          if (xc < 1 || out.first !== pos) continue;
          const score = (out.bw + out.bh - perim0) * (extra > 0 ? W_GROWTH_OPEN : W_GROWTH_TIGHT)
            + Math.abs(out.bw - out.bh) * W_ASPECT + rankScore[pi] * W_RANK
            + (w.len === 2 ? W_TWO : 0) + rand() * W_JITTER;
          cands.push({ pi, dir: newDir, x: sx, y: sy, xc, score });
          if (xc <= hi && xc > maxXc) maxXc = xc;
        }
      }
    }
    if (cands.length === 0) return null;

    let pick = null;
    if (r === 1) {
      for (const c of cands) if (c.xc === d && (!pick || c.score < pick.score)) pick = c;
    } else if (extra > 0) {
      // 辻が足りないうちは交わりの多い置き場所から取る。無ければ1辻の置き場所から選ぶ。
      // どちらも「置いた後に2語へ交わる置き場所がいくつ生まれるか」を先読みし、輪を続けて閉じられる手を選ぶ
      const want = maxXc >= 2 ? maxXc : 1;
      const pool2 = cands.filter((c) => c.xc === want).sort((a, b) => a.score - b.score);
      // 残りの辻がこの手で尽きるなら先読みは要らない
      const need = extra - (want - 1) > 0 && r > 2;
      const saved = { minX: st.minX, maxX: st.maxX, minY: st.minY, maxY: st.maxY };
      let bestVal = Infinity;
      for (let q = 0; q < pool2.length && q < LOOKAHEAD; q++) {
        const c = pool2[q];
        let pot = 0;
        if (need || want === 1) {
          place(ctx, st, c.pi, c.dir, c.x, c.y, false);
          pot = followUps(ctx, st, 3, out);
          unplace(ctx, st, saved);
        }
        const val = c.score - W_POTENTIAL * pot;
        if (val < bestVal) { bestVal = val; pick = c; }
      }
    } else {
      for (const c of cands) if (c.xc === 1 && (!pick || c.score < pick.score)) pick = c;
    }
    if (!pick) {
      // 範囲に収まる置き場所が無い：辻の差が最小になる案で埋め切る（crossingsExact:false の候補）
      for (const c of cands) {
        const dev = c.xc < lo ? lo - c.xc : c.xc > hi ? c.xc - hi : 0;
        const val = dev * 1000 + c.score;
        if (!pick || val < pick.val) pick = { ...c, val };
      }
    }
    place(ctx, st, pick.pi, pick.dir, pick.x, pick.y);
  }
  return { placed: st.placed.slice(), crossings: st.crossings };
}

/**
 * 盤を組み立てる。stats（任意）を渡すと、試行回数 attempts・行き詰まり deadEnds・辻の不一致 misses を書く
 */
export function generatePuzzle({ level, seed, words, maxAttempts = 400, stats } = {}) {
  const lv = getLevel(level);
  if (!lv) throw new Error(`腕前が見つからない: ${level}`);
  if (!Array.isArray(words)) throw new Error('words（単語帳）を渡してください');
  const seedStr = String(seed ?? '');
  const { pool, index, pairs, clashes } = getPool(words, lv);
  const M = Math.max(lv.maxW, lv.maxH);
  const weights = lv.tierWeights ?? {};
  const ctx = {
    pool, index, pairs, clashes,
    maxLen: lv.maxLen,
    S: 2 * M + 5,
    center: M + 2,
    maxW: lv.maxW, maxH: lv.maxH,
    N: lv.words, C: lv.crossings, maxTwo: lv.maxTwoLetter,
    firstMin: Math.max(4, lv.minLen),
    firstMax: Math.min(6, lv.maxLen, lv.maxW),
    weightOf: (t) => (weights[t] > 0 ? weights[t] : 1),
  };
  const st = makeState(ctx.S, pool.length);
  const base = hashSeed(seedStr);
  let best = null;
  let used = 0;
  for (let a = 0; a < maxAttempts; a++) {
    used = a + 1;
    const rand = mulberry32((base ^ Math.imul(a + 1, 0x9e3779b1)) >>> 0);
    const res = attempt(ctx, st, rand);
    if (!res) {
      if (stats) stats.deadEnds = (stats.deadEnds ?? 0) + 1;
      continue;
    }
    const diff = Math.abs(res.crossings - ctx.C);
    if (stats && diff > 0) stats.misses = (stats.misses ?? 0) + 1;
    if (!best || diff < best.diff) best = { ...res, diff };
    if (diff === 0) break;
  }
  if (stats) stats.attempts = used;
  if (!best) throw new Error(`盤を組めなかった（腕前${lv.id}に使える言葉が足りない）`);
  return buildPuzzle({
    level: lv,
    seed: seedStr,
    placements: best.placed.map((p) => {
      const w = pool[p.pi];
      return {
        dir: p.dir === ACROSS ? 'across' : 'down',
        x: p.x, y: p.y,
        answer: w.answer,
        reading: w.src.r, kanji: w.src.k, clue: w.src.c, tier: w.src.t,
      };
    }),
  });
}

/**
 * 置いた言葉（任意の座標）から Puzzle を作る：外接矩形に切り詰め、辻を数え、行優先で番号を振り、空きを選ぶ。
 * placements: [{ dir:'across'|'down', x, y, answer, reading, kanji, clue, tier }]
 * blanks（任意・テスト用）：空きを切り詰めた後の座標 {x,y}[] で指定する。無ければ seed から選ぶ（selectBlanks）
 */
export function buildPuzzle({ level, seed, placements, blanks: fixedBlanks }) {
  const lv = getLevel(level);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const items = placements.map((p) => {
    const chars = [...p.answer];
    const across = p.dir === 'across';
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, across ? p.x + chars.length - 1 : p.x);
    maxY = Math.max(maxY, across ? p.y : p.y + chars.length - 1);
    return { ...p, chars, across };
  });
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const grid = Array.from({ length: height }, () => Array(width).fill(''));
  const cover = Array.from({ length: height }, () => Array(width).fill(0));
  for (const it of items) {
    it.x -= minX;
    it.y -= minY;
    it.chars.forEach((ch, i) => {
      const x = it.across ? it.x + i : it.x;
      const y = it.across ? it.y : it.y + i;
      grid[y][x] = ch;
      cover[y][x] |= it.across ? 1 : 2;
    });
  }
  let crossings = 0;
  for (const row of cover) for (const c of row) if (c === 3) crossings++;

  const starts = new Set(items.map((it) => it.y * width + it.x));
  const numbers = Array.from({ length: height }, () => Array(width).fill(0));
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) if (starts.has(y * width + x)) numbers[y][x] = ++n;
  }

  const words = items.map((it) => {
    const number = numbers[it.y][it.x];
    return {
      id: `${it.across ? 'a' : 'd'}${number}`,
      dir: it.across ? 'across' : 'down',
      x: it.x,
      y: it.y,
      length: it.chars.length,
      answer: it.answer,
      reading: it.reading,
      kanji: it.kanji,
      clue: it.clue,
      tier: it.tier,
      number,
      label: `${it.across ? '横' : '縦'}の${kanjiNumeral(number)}`,
    };
  });
  words.sort((a, b) => a.number - b.number || (a.dir === 'across' ? 0 : 1) - (b.dir === 'across' ? 0 : 1));

  let blanks;
  if (fixedBlanks) {
    const seen = new Set();
    blanks = [];
    for (const c of fixedBlanks) {
      if (!Number.isInteger(c?.x) || !Number.isInteger(c?.y) || !grid[c.y]?.[c.x]) throw new Error(`空きが字のマスでない: ${JSON.stringify(c)}`);
      if (!seen.has(c.y * width + c.x)) blanks.push({ x: c.x, y: c.y });
      seen.add(c.y * width + c.x);
    }
    blanks.sort(rowMajor);
  } else {
    const want = Number.isInteger(lv.blanks) && lv.blanks > 0 ? lv.blanks : 0;
    blanks = selectBlanks({ grid, cover, words, want, rand: mulberry32(hashSeed(`${seed}:blanks`)) });
  }

  return {
    version: 2,
    level: lv.id,
    seed: String(seed),
    width,
    height,
    crossings,
    crossingsExact: crossings === lv.crossings,
    blanks,
    blanksAtCrossingsOnly: blanks.every(({ x, y }) => cover[y][x] === 3),
    grid,
    numbers,
    words,
  };
}

// ---- v2：空き（埋める字）を選ぶ ----

const rowMajor = (a, b) => a.y - b.y || a.x - b.x;
// 組み合わせがこの数以下なら全部試して最善を選ぶ（いまの腕前は多くて126通り）。超えたら順を変えた貪欲を何度か試す
const BLANK_ENUM_LIMIT = 20000;
const BLANK_RESTARTS = 48;

function binom(n, k) {
  if (k < 0 || k > n) return 0;
  const m = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= m; i++) {
    r = (r * (n - m + i)) / i;
    if (r > BLANK_ENUM_LIMIT) return Infinity;
  }
  return Math.round(r);
}

// 選び方の点（小さいほど良い）：全部空きになった言葉の数を最優先で減らし、次に語ごとの空きの数の最大を小さくする
function blankScore(cnt, lens) {
  let full = 0;
  let max = 0;
  for (let w = 0; w < cnt.length; w++) {
    if (cnt[w] >= lens[w]) full++;
    if (cnt[w] > max) max = cnt[w];
  }
  return full * 64 + max;
}

// cands から m 個を選ぶ。base は先に決まった空きによる語ごとの数。最善が並んだら乱数で等しい確からしさで選ぶ
function pickBlanks(cands, m, base, lens, rand) {
  const k = cands.length;
  if (m <= 0) return [];
  if (m >= k) return cands.slice();
  const cnt = new Int16Array(base.length);
  if (binom(k, m) <= BLANK_ENUM_LIMIT) {
    const idx = Array.from({ length: m }, (_, i) => i);
    let best = null;
    let bestScore = Infinity;
    let ties = 0;
    for (;;) {
      cnt.set(base);
      for (const i of idx) for (const w of cands[i].ws) cnt[w]++;
      const sc = blankScore(cnt, lens);
      if (sc < bestScore) {
        bestScore = sc;
        best = idx.slice();
        ties = 1;
      } else if (sc === bestScore && rand() * ++ties < 1) {
        best = idx.slice();
      }
      let i = m - 1;
      while (i >= 0 && idx[i] === k - m + i) i--;
      if (i < 0) break;
      idx[i]++;
      for (let j = i + 1; j < m; j++) idx[j] = idx[j - 1] + 1;
    }
    return best.map((i) => cands[i]);
  }
  // 組み合わせが多すぎるとき（いまの腕前では起きない）：順を変えた貪欲を繰り返し、いちばん良い案を取る
  let best = null;
  let bestScore = Infinity;
  for (let r = 0; r < BLANK_RESTARTS; r++) {
    const order = shuffle(cands, rand);
    const taken = new Uint8Array(k);
    const chosen = [];
    cnt.set(base);
    for (let step = 0; step < m; step++) {
      let pick = -1;
      let pickScore = Infinity;
      for (let i = 0; i < k; i++) {
        if (taken[i]) continue;
        let full = 0;
        let mx = 0;
        let sum = 0;
        for (const w of order[i].ws) {
          const c = cnt[w] + 1;
          if (c >= lens[w]) full++;
          if (c > mx) mx = c;
          sum += c;
        }
        const sc = full * 4096 + mx * 64 + sum;
        if (sc < pickScore) {
          pickScore = sc;
          pick = i;
        }
      }
      taken[pick] = 1;
      chosen.push(order[pick]);
      for (const w of order[pick].ws) cnt[w]++;
    }
    const sc = blankScore(cnt, lens);
    if (sc < bestScore) {
      bestScore = sc;
      best = chosen;
    }
  }
  return best;
}

/**
 * 空きを選ぶ（行優先に並べて返す）。空きは辻から選ぶ。
 * want < 辻の数：全部空きの言葉を作らず、語ごとの空きの最大を小さくする（満たせない盤だけ、全部空きの言葉が最も少ない案）。
 * want ＝ 辻の数：辻をすべて空ける。want > 辻の数（まれ）：辻をすべて空け、残りを辻以外のマスから同じ規則で補う。
 */
export function selectBlanks({ grid, cover, words, want, rand }) {
  const height = grid.length;
  const width = height ? grid[0].length : 0;
  const lens = words.map((w) => w.length);
  const cellWords = new Map();
  words.forEach((w, wi) => {
    for (let i = 0; i < w.length; i++) {
      const key = w.dir === 'across' ? w.y * width + w.x + i : (w.y + i) * width + w.x;
      let list = cellWords.get(key);
      if (!list) cellWords.set(key, (list = []));
      list.push(wi);
    }
  });
  const cross = [];
  const plain = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!grid[y][x]) continue;
      const c = { x, y, ws: cellWords.get(y * width + x) ?? [] };
      (cover[y][x] === 3 ? cross : plain).push(c);
    }
  }
  const b = Math.max(0, Math.min(want, cross.length + plain.length));
  const zero = new Int16Array(words.length);
  let chosen;
  if (b <= cross.length) {
    chosen = pickBlanks(cross, b, zero, lens, rand);
  } else {
    const base = new Int16Array(words.length);
    for (const c of cross) for (const w of c.ws) base[w]++;
    chosen = cross.concat(pickBlanks(plain, b - cross.length, base, lens, rand));
  }
  return chosen.map(({ x, y }) => ({ x, y })).sort(rowMajor);
}
