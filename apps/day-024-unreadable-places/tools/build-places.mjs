/* 郵便番号データ → 出題データ（assets/places.json）を作る。ビルド時に1回だけ走る。
   外部パッケージは使わない。入力CSVはリポジトリに入れず、生成物だけを置く。

   使い方: node tools/build-places.mjs --csv /path/to/utf_ken_all.csv

   難読度の考え方は REQUIREMENTS.md ③構造層のとおり2段構え。
   第1段で「漢字1字あたりの期待かな長」を最小二乗で解き、
   第2段でその期待長を使って漢字とかなを対応づけ、読みの珍しさを数える。
   外部の漢字辞典は使わない（地名データだけで完結させるのがこのアプリの核）。 */

import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { isSupported } from '../lib/romaji.js';
import { BLOCKS } from '../lib/blocks.js';

/* このリポジトリは公開なので、非公開にしたい語句（.precheck-ng.txt）に当たる地名は出題しない。
   全国12万件もあると実在の地名が偶然その語と一致する。npm run precheck を通すために必要。
   NGリストはgitignoreされているため、手元に無い環境では素通しになる（そのときはprecheckが止める）。 */
function loadNgPatterns() {
  const file = resolve(process.cwd(), '.precheck-ng.txt');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => new RegExp(line, 'i'));
}

/* 地方の切り方は lib/blocks.js が正本。ここで作り直すと画面と食い違う */
const REGIONS = BLOCKS.filter((b) => b.prefs);
const PREF_BLOCK = new Map();
for (const b of REGIONS) {
  for (const pref of b.prefs) PREF_BLOCK.set(pref, b.id);
}

/* 町域名に出る注記。これを弾かないと出題が注記で埋まる */
const NOTE_PATTERNS = [
  '以下に掲載がない場合', 'その他', '次に番地がくる場合', '丁目', '地割', '無番地', '甲', '乙'
];

const KANJI = /^[一-鿿々〇〻豈-﫿]+$/;
const KATAKANA_ONLY = /^[ァ-ヶー]+$/;

/* 「町」「村」「島」で終わるのに読みがそれを含まない地名は捨てる。
   御幸町（みゆき）のように漢字が1字余ると、その字に無いはずの読みが割り当てられ、
   計算上いちばん読めない地名に化ける。実在の難読ではなく対応づけの失敗。 */
const SUFFIX_RULES = [
  { kanji: '町', kana: ['マチ', 'チョウ'] },
  { kanji: '村', kana: ['ムラ', 'ソン'] },
  { kanji: '島', kana: ['シマ', 'ジマ', 'トウ', 'ドウ'] }
];

function suffixMismatch(kanji, kana) {
  for (const rule of SUFFIX_RULES) {
    if (!kanji.endsWith(rule.kanji)) continue;
    if (!rule.kana.some((k) => kana.endsWith(k))) return true;
  }
  return false;
}

function katakanaToHiragana(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c >= 0x30a1 && c <= 0x30f6) out += String.fromCodePoint(c - 0x60);
    else out += ch;
  }
  return out;
}

/** ダブルクォート囲みに対応した1行ぶんのCSV分解 */
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i += 1; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** 括弧以降を落とす。「旭町（１〜５丁目）」→「旭町」 */
function stripParen(s) {
  const i = s.search(/[（(]/);
  return i === -1 ? s : s.slice(0, i);
}

function loadRows(csvPath) {
  const text = readFileSync(csvPath, 'utf8');
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const f = splitCsvLine(raw);
    if (f.length < 9) continue;
    rows.push({
      pref: f[6].trim(),
      city: f[7].trim(),
      townKana: stripParen(f[5].trim()),
      townKanji: stripParen(f[8].trim())
    });
  }
  return rows;
}

function isUsable(row) {
  const { townKanji, townKana, pref } = row;
  if (!PREF_BLOCK.has(pref)) return false;
  if (!townKanji || !townKana) return false;
  for (const n of NOTE_PATTERNS) if (townKanji.includes(n)) return false;
  if (townKanji.length < 2 || townKanji.length > 5) return false;
  if (!KANJI.test(townKanji)) return false;
  if (!KATAKANA_ONLY.test(townKana)) return false;
  if (townKana.includes('ー')) return false;   // 長音は漢字との対応が崩れる
  if (townKana.length < townKanji.length) return false;
  if (townKana.length > townKanji.length * 5) return false;
  if (townKanji.startsWith('大字')) return false;
  if (suffixMismatch(townKanji, townKana)) return false;
  if (!isSupported(katakanaToHiragana(townKana))) return false;   // 判定器が扱えない読み
  return true;
}

/** 第1段: 漢字1字あたりの期待かな長を最小二乗で解く（Jacobi反復） */
function solveLengths(items, rounds = 40) {
  const w = new Map();
  for (const it of items) for (const ch of it.kanji) if (!w.has(ch)) w.set(ch, 1.8);

  for (let r = 0; r < rounds; r += 1) {
    const num = new Map();
    const den = new Map();
    for (const it of items) {
      let sum = 0;
      for (const ch of it.kanji) sum += w.get(ch);
      const share = (it.kana.length - sum) / it.kanji.length;
      for (const ch of it.kanji) {
        num.set(ch, (num.get(ch) ?? 0) + share);
        den.set(ch, (den.get(ch) ?? 0) + 1);
      }
    }
    for (const ch of w.keys()) {
      const next = w.get(ch) + (num.get(ch) ?? 0) / (den.get(ch) ?? 1);
      w.set(ch, Math.min(6, Math.max(0.5, next)));
    }
  }
  return w;
}

/** 期待長からのずれが最小になる切り方を動的計画法で選ぶ。cost(ch, reading) を渡せば併用する */
function align(kanji, kana, w, cost) {
  const n = kanji.length;
  const L = kana.length;
  const INF = Infinity;
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(L + 1).fill(INF));
  const back = Array.from({ length: n + 1 }, () => new Int32Array(L + 1).fill(-1));
  dp[0][0] = 0;

  for (let i = 0; i < n; i += 1) {
    const ch = kanji[i];
    const expect = w.get(ch) ?? 1.8;
    for (let p = 0; p <= L; p += 1) {
      if (dp[i][p] === INF) continue;
      const maxTake = Math.min(5, L - p - (n - i - 1));
      for (let take = 1; take <= maxTake; take += 1) {
        const reading = kana.slice(p, p + take);
        let c = (take - expect) ** 2;
        if (cost) c += cost(ch, reading);
        const v = dp[i][p] + c;
        if (v < dp[i + 1][p + take]) {
          dp[i + 1][p + take] = v;
          back[i + 1][p + take] = take;
        }
      }
    }
  }
  if (dp[n][L] === INF) return null;

  const parts = [];
  let p = L;
  for (let i = n; i > 0; i -= 1) {
    const take = back[i][p];
    if (take <= 0) return null;
    parts.unshift({ ch: kanji[i - 1], reading: kana.slice(p - take, p) });
    p -= take;
  }
  return parts;
}

/** 第2段: 対応づけ → 読みの頻度表。cost を入れて2周だけEM的に回す */
function buildReadingTable(items, w) {
  let table = null;
  for (let pass = 0; pass < 2; pass += 1) {
    const counts = new Map();
    const cost = pass === 0 ? null : (ch, reading) => {
      const m = table.get(ch);
      if (!m) return 0;
      const total = m.total;
      const c = m.readings.get(reading) ?? 0;
      return -Math.log((c + 0.5) / (total + 5)) * 0.5;
    };
    for (const it of items) {
      const parts = align(it.kanji, it.kana, w, cost);
      if (!parts) continue;
      it.parts = parts;
      for (const { ch, reading } of parts) {
        if (!counts.has(ch)) counts.set(ch, { total: 0, readings: new Map() });
        const e = counts.get(ch);
        e.total += 1;
        e.readings.set(reading, (e.readings.get(reading) ?? 0) + 1);
      }
    }
    table = counts;
  }
  return table;
}

/** 難読度 = 読みの珍しさの平均 ＋ かな長の意外さ。字数で正規化して1字地名に偏らせない */
function score(item, table, w) {
  if (!item.parts) return null;
  let rarity = 0;
  const why = [];
  for (const { ch, reading } of item.parts) {
    const e = table.get(ch);
    const total = e?.total ?? 0;
    const c = e?.readings.get(reading) ?? 0;
    rarity += -Math.log((c + 0.5) / (total + 5));
    why.push({ ch, reading, count: c });
  }
  rarity /= item.parts.length;

  let expect = 0;
  for (const ch of item.kanji) expect += w.get(ch) ?? 1.8;
  const surprise = Math.abs(item.kana.length - expect) / item.kanji.length;

  return { value: rarity + surprise, why };
}

function main() {
  const argv = process.argv.slice(2);
  const csvIdx = argv.indexOf('--csv');
  if (csvIdx === -1 || !argv[csvIdx + 1]) {
    console.error('使い方: node tools/build-places.mjs --csv <utf_ken_all.csv>');
    process.exit(1);
  }
  const csvPath = resolve(argv[csvIdx + 1]);
  const outPath = resolve(argv[argv.indexOf('--out') + 1] ?? 'assets/places.json');

  const rows = loadRows(csvPath);
  console.log(`読み込み: ${rows.length}行`);

  const ng = loadNgPatterns();
  const hitsNg = (row) => ng.some((re) => re.test(row.townKanji) || re.test(row.city) || re.test(row.pref));

  const seen = new Set();
  const items = [];
  let ngDropped = 0;
  for (const row of rows) {
    if (!isUsable(row)) continue;
    if (hitsNg(row)) { ngDropped += 1; continue; }
    const key = `${row.pref}/${row.city}/${row.townKanji}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      kanji: row.townKanji,
      kana: katakanaToHiragana(row.townKana),
      pref: row.pref,
      city: row.city,
      block: PREF_BLOCK.get(row.pref)
    });
  }
  console.log(`採用: ${items.length}件（重複と注記を除去${ng.length ? `／非公開語に当たる${ngDropped}件も除外` : ''}）`);

  const w = solveLengths(items);
  console.log(`漢字の種類: ${w.size}`);

  const table = buildReadingTable(items, w);

  const scored = [];
  for (const it of items) {
    const s = score(it, table, w);
    if (!s) continue;
    scored.push({ ...it, score: s.value, why: s.why });
  }
  scored.sort((a, b) => b.score - a.score);
  console.log(`採点: ${scored.length}件`);
  console.log('難読 上位20件:');
  for (const it of scored.slice(0, 20)) {
    console.log(`  ${it.score.toFixed(2)}  ${it.kanji}（${it.kana}）${it.pref}${it.city}`);
  }

  /* 難易度は生の点ではなく全国での順位（パーセンタイル）にする。
     点の絶対値は式を変えると動くが、順位なら「上位何%か」として画面にも出せる */
  const n = scored.length;
  scored.forEach((it, i) => { it.difficulty = n > 1 ? 1 - i / (n - 1) : 1; });

  const byBlock = {};
  for (const b of REGIONS) byBlock[b.id] = [];
  for (const it of scored) byBlock[it.block].push(it);

  /* 地方の比較は「上位200件の平均」だと母数の大きい地方が有利になる。
     母数に対する割合（上位1%）と中央値で見る */
  const stats = {};
  for (const b of REGIONS) {
    const list = byBlock[b.id];
    const cut = Math.max(1, Math.round(list.length * 0.01));
    const top = list.slice(0, cut);
    stats[b.id] = {
      label: b.label,
      count: list.length,
      top1pct: top.reduce((a, x) => a + x.score, 0) / top.length,
      median: list.length ? list[Math.floor(list.length / 2)].score : 0
    };
  }

  console.log('\n地方別（上位1%の平均／中央値。母数で割った割合で比べる）:');
  for (const [id, st] of Object.entries(stats).sort((a, c) => c[1].top1pct - a[1].top1pct)) {
    console.log(`  ${st.label.padEnd(6, '　')} 上位1% ${st.top1pct.toFixed(2)}  中央 ${st.median.toFixed(2)}  (母数 ${st.count})`);
  }

  /* 出題の在庫。難易度の坂を実測して決めた（机上で決めない）。
     全件から等間隔に採ると1問目が「盛田＝もりた」級になって退屈だったので、
     全国順位で上位25%（difficulty >= 0.75）だけを母集団にし、その中で坂を作る。
     いちばん易しい側でも「南境＝みなみざかい」のように一手ひねってある。 */
  const POOL = 400;
  const FLOOR = 0.80;
  /* 難読度は「読みの珍しさ」と「かな長の意外さ」の和なので、
     読みが素直でも長さだけで点が付く（太郎＝たろう が上位に来ていた）。
     出題には「少なくとも1文字は珍しい当て方をしている」ことを別に要求する。 */
  const RARE_AT_MOST = 100;
  const rarest = (x) => Math.min(...x.why.map((w) => w.count));
  const pool = {};
  for (const b of REGIONS) {
    const list = byBlock[b.id]
      .filter((x) => x.difficulty >= FLOOR && rarest(x) <= RARE_AT_MOST);
    const picked = new Map();
    for (let j = 0; j < POOL; j += 1) {
      const idx = Math.min(list.length - 1, Math.floor((j / POOL) ** 1.6 * list.length));
      if (!picked.has(idx)) picked.set(idx, list[idx]);
    }
    pool[b.id] = [...picked.values()]
      .sort((a, c) => a.difficulty - c.difficulty)
      .map((it) => ({
        k: it.kanji,
        r: it.kana,
        p: it.pref,
        c: it.city,
        d: Number(it.difficulty.toFixed(3)),
        w: it.why.map((x) => [x.ch, x.reading, x.count])
      }));
    console.log(`  在庫 ${b.label}: ${pool[b.id].length}件`);
  }

  const payload = {
    source: '郵便番号データ（日本郵便）を加工して作成',
    dataUpdatedAt: statSync(csvPath).mtime.toISOString().slice(0, 10),
    note: '読みは郵便局の表記で、地元の読みと違うことがあります',
    stats,
    places: pool
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload));
  const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(0);
  console.log(`\n出力: ${outPath}（${kb}KB）`);
}

main();
