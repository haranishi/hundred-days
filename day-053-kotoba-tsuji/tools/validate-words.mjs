// 単語帳（data/words.js）が docs/WORDS.md の決まりを守っているかを機械で確かめる。
// 使い方: node tools/validate-words.mjs [単語帳のパス]
//   内訳の表（難しさ・盤での字数・分類・文末）を出し、違反があれば一覧を出して exit 1。
// 正規化は docs/ENGINE.md の normalizeAnswer と同じ規則で、ここに自前で持つ（lib/kana.js には依存しない）。

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const GENRES = [
  '動物', '鳥・魚・虫', '草木・花', '食べ物', '菓子・飲み物', '暮らしの道具', '着る物', '体',
  '天気・季節', '自然・地形', '町・建物', '仕事・人', '遊び・行事', '芸能', '江戸の言葉', 'その他',
];

export const LIMITS = {
  total: 520,
  tiers: { 1: 230, 2: 170, 3: 110 },
  lengths: { 2: [50, 90], 3: [170, Infinity], 4: [150, Infinity], 5: [80, Infinity], 6: [35, Infinity], 7: [15, Infinity] },
  t1Short: 230, // 手習いは t1 の2〜5字しか使わない
  genreMaxRatio: 0.15,
  gozaruMaxRatio: 0.4,
  clue: [12, 38],
  tailWarn: 10, // 同じ文末の言い回し（末尾6字）がこれを超えたら注意を出す
};

const SEION = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
const DAKUON = 'がぎぐげござじずぜぞだぢづでどばびぶべぼ';
const HANDAKUON = 'ぱぴぷぺぽ';
export const ALLOWED = new Set([...SEION, ...DAKUON, ...HANDAKUON]); // 清音46・濁音20・半濁音5
const SMALL = { ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お', っ: 'つ', ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', ゎ: 'わ' };

const kataToHira = (s) => s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
const hiraToKata = (s) => s.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
const len = (s) => [...s].length;

// カタカナ→ひらがな、小さい字→大きい字。ALLOWED 外の字が残れば null
export function normalizeAnswer(str) {
  if (typeof str !== 'string' || str === '') return null;
  let out = '';
  for (const ch of kataToHira(str)) {
    const c = SMALL[ch] ?? ch;
    if (!ALLOWED.has(c)) return null;
    out += c;
  }
  return out;
}

// 取りこぼし防止の見張り。身分に関わる語・酒たばこ・死や暴力に関わる語を読みと字の両方で止める
const NG_READINGS = new Set([
  'さむらい', 'ぶし', 'ちょうにん', 'ひゃくしょう', 'のうみん', 'だいみょう', 'とのさま', 'しょうぐん', 'ろうにん',
  'くげ', 'えた', 'ひにん', 'おいらん', 'ゆうじょ', 'げいしゃ', 'きせる', 'たばこ', 'とっくり', 'さかずき',
]);
// 「刀」は秋刀魚のような無害な語にも入るので、刀そのものを指す語で止める
const NG_CHARS = ['酒', '煙草', '煙管', '死', '殺', '葬', '墓', '日本刀', '太刀', '刀剣', '木刀', '剣', '槍', '銃', '砲', '賭', '毒',
  '侍', '武士', '町人', '百姓', '大名', '殿様', '浪人', '将軍', '女郎', '花魁', '遊女'];

// 文末の種類。「ござる」系は末尾5字に「ござ」があれば数える（ござるよ・ござらぬ も含めて厳しめに）
export function endingOf(c) {
  const t = String(c).trim();
  const s = t.replace(/[。．、，！？!?…\s]+$/u, '');
  if (/ござ/.test(s.slice(-5))) return 'ござる';
  if (/(であろう|じゃろう|だろう)$/.test(s)) return 'であろう';
  if (/じゃ(な|よ|て|わい)?$/.test(s)) return 'じゃ';
  if (/とな$/.test(s)) return 'とな';
  if (/なり$/.test(s)) return 'なり';
  if (/[？?]$/.test(t) || /(かの|かな)$/.test(s)) return 'かの？';
  if (/ぞ$/.test(s)) return 'ぞ';
  if (/のう$/.test(s)) return 'のう';
  if (/わい$/.test(s)) return 'わい';
  if (/よ$/.test(s)) return 'よ';
  if (/(さね|さ|でい|ぜ|ねえ|だ)$/.test(s)) return '町人ことば';
  return 'その他';
}
const tailOf = (c) => [...String(c).trim().replace(/[。．、，！？!?…\s]+$/u, '')].slice(-6).join('');

export function validateWords(WORDS) {
  const errors = [];
  const stats = {
    total: 0, byTier: { 1: 0, 2: 0, 3: 0 }, byLen: {}, byGenre: {}, byEnding: {}, tierByLen: { 1: {}, 2: {}, 3: {} },
    genreByTier: {}, t1Short: 0, gozaru: 0, gozaruRatio: 0, tails: [], warnings: [],
  };
  if (!Array.isArray(WORDS)) return { errors: ['WORDS が配列ではない'], stats };
  stats.total = WORDS.length;
  for (const g of GENRES) { stats.byGenre[g] = 0; stats.genreByTier[g] = { 1: 0, 2: 0, 3: 0 }; }
  for (let n = 2; n <= 7; n++) stats.byLen[n] = 0;

  const seenForm = new Map();
  const seenClue = new Map();
  const tails = new Map();

  WORDS.forEach((w, i) => {
    const at = `#${i}${w && typeof w.r === 'string' ? `「${w.r}」` : ''}`;
    if (!w || typeof w !== 'object') { errors.push(`${at}: 項目がオブジェクトではない`); return; }
    const { r, k, t, g, c } = w;
    for (const key of Object.keys(w)) if (!['r', 'k', 't', 'g', 'c'].includes(key)) errors.push(`${at}: 知らない項目 ${key}`);

    // r 読み
    let form = null;
    if (typeof r !== 'string' || !/^[ぁ-ゖ]+$/u.test(r)) errors.push(`${at}: r はひらがなだけで書く`);
    else {
      form = normalizeAnswer(r);
      if (form === null) errors.push(`${at}: 盤に置けない字がある（使えるのは清音46・濁音20・半濁音5）`);
      else if (len(form) < 2 || len(form) > 7) errors.push(`${at}: 盤での長さ ${len(form)} 字（2〜7字だけ）`);
      if (NG_READINGS.has(r)) errors.push(`${at}: 採らない言葉`);
    }
    // k ふだんの書き方
    if (typeof k !== 'string' || k.trim() === '') errors.push(`${at}: k が空`);
    else {
      if (!/[\p{Script=Han}ァ-ヺ]/u.test(k)) errors.push(`${at}: k は漢字かカタカナで書く（${k}）`);
      if (k.includes('ー')) errors.push(`${at}: 「ー」を含む言葉は採らない（${k}）`);
    }
    // t 難しさ・g 分類
    if (![1, 2, 3].includes(t)) errors.push(`${at}: t は 1・2・3 のどれか（${t}）`);
    if (!GENRES.includes(g)) errors.push(`${at}: 分類 g が決まりにない（${g}）`);
    // c 問
    if (typeof c !== 'string') errors.push(`${at}: c が文字列ではない`);
    else {
      const n = len(c);
      if (n < LIMITS.clue[0] || n > LIMITS.clue[1]) errors.push(`${at}: 問の長さ ${n} 字（${LIMITS.clue[0]}〜${LIMITS.clue[1]}字）`);
      if (typeof r === 'string' && typeof k === 'string') {
        const forms = new Set([r, hiraToKata(r), form, form && hiraToKata(form), k, kataToHira(k)].filter(Boolean));
        for (const f of forms) if (c.includes(f)) errors.push(`${at}: 問に答えそのもの「${f}」が入っている`);
        for (const ch of new Set(k)) {
          if (ch !== '々' && /\p{Script=Han}/u.test(ch) && c.includes(ch)) errors.push(`${at}: 問に答えの漢字「${ch}」が入っている`);
        }
      }
      if (seenClue.has(c)) errors.push(`${at}: 問が #${seenClue.get(c)} と同じ`);
      else seenClue.set(c, i);
      const e = endingOf(c);
      stats.byEnding[e] = (stats.byEnding[e] ?? 0) + 1;
      const tail = tailOf(c);
      tails.set(tail, (tails.get(tail) ?? 0) + 1);
    }
    for (const bad of NG_CHARS) {
      if ((typeof k === 'string' && k.includes(bad)) || (typeof c === 'string' && c.includes(bad))) errors.push(`${at}: 採らない字「${bad}」がある`);
    }

    // 盤での形の重複
    if (form) {
      if (seenForm.has(form)) errors.push(`${at}: 盤での形「${form}」が #${seenForm.get(form)} と重複`);
      else seenForm.set(form, i);
    }

    // 集計
    const L = form ? len(form) : 0;
    if (L >= 2 && L <= 7) stats.byLen[L] += 1;
    if ([1, 2, 3].includes(t)) {
      stats.byTier[t] += 1;
      if (L) stats.tierByLen[t][L] = (stats.tierByLen[t][L] ?? 0) + 1;
      if (t === 1 && L >= 2 && L <= 5) stats.t1Short += 1;
    }
    if (GENRES.includes(g)) {
      stats.byGenre[g] += 1;
      if ([1, 2, 3].includes(t)) stats.genreByTier[g][t] += 1;
    }
  });

  // 全体の配分
  const T = stats.total;
  if (T < LIMITS.total) errors.push(`合計 ${T} 件（${LIMITS.total}件以上が要る）`);
  for (const [tier, min] of Object.entries(LIMITS.tiers)) {
    if (stats.byTier[tier] < min) errors.push(`t${tier} が ${stats.byTier[tier]} 件（${min}件以上が要る）`);
  }
  for (const [L, [min, max]] of Object.entries(LIMITS.lengths)) {
    const n = stats.byLen[L] ?? 0;
    if (n < min || n > max) errors.push(`${L}字が ${n} 件（${max === Infinity ? `${min}件以上` : `${min}〜${max}件`}）`);
  }
  if (stats.t1Short < LIMITS.t1Short) errors.push(`t1 の2〜5字が ${stats.t1Short} 件（${LIMITS.t1Short}件以上が要る）`);
  for (const g of GENRES) {
    if (T && stats.byGenre[g] / T > LIMITS.genreMaxRatio) errors.push(`分類「${g}」が ${stats.byGenre[g]} 件で全体の15%を超える`);
  }
  stats.gozaru = stats.byEnding['ござる'] ?? 0;
  stats.gozaruRatio = T ? stats.gozaru / T : 0;
  if (stats.gozaruRatio > LIMITS.gozaruMaxRatio) errors.push(`「ござる」終わりが ${(stats.gozaruRatio * 100).toFixed(1)}%（40%以下）`);

  stats.tails = [...tails.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  for (const [tail, n] of stats.tails) if (n > LIMITS.tailWarn) stats.warnings.push(`文末「…${tail}」が ${n} 回（言い回しを散らす）`);
  return { errors, stats };
}

// ---- 表の出力（CLI） ----
const width = (s) => [...String(s)].reduce((a, ch) => a + (/[ᄀ-ᅟ⺀-鿿가-힣豈-﫿︰-﹏＀-｠￠-￦]/u.test(ch) ? 2 : 1), 0);
const pad = (s, w) => String(s) + ' '.repeat(Math.max(0, w - width(s)));
function table(headers, rows) {
  const ws = headers.map((h, i) => Math.max(width(h), ...rows.map((r) => width(r[i]))));
  const line = (cells) => '| ' + cells.map((c, i) => pad(c, ws[i])).join(' | ') + ' |';
  return [line(headers), '|' + ws.map((w) => '-'.repeat(w + 2)).join('|') + '|', ...rows.map(line)].join('\n');
}
const pct = (n, T) => (T ? `${((n / T) * 100).toFixed(1)}%` : '-');

export function report({ errors, stats }) {
  const T = stats.total;
  const out = [];
  out.push(`単語帳の内訳（合計 ${T} 件）`, '');
  out.push(table(['難しさ', '件数', '目安', '2〜5字', '2字', '3字', '4字', '5字', '6字', '7字'],
    [1, 2, 3].map((t) => [`t${t}`, stats.byTier[t], `≥${LIMITS.tiers[t]}`, t === 1 ? stats.t1Short : '-',
      ...[2, 3, 4, 5, 6, 7].map((L) => stats.tierByLen[t][L] ?? 0)])), '');
  out.push(table(['盤での字数', '件数', '目安'], Object.entries(LIMITS.lengths).map(([L, [min, max]]) =>
    [`${L}字`, stats.byLen[L] ?? 0, max === Infinity ? `≥${min}` : `${min}〜${max}`])), '');
  out.push(table(['分類', '件数', '割合', 't1', 't2', 't3'], GENRES.map((g) =>
    [g, stats.byGenre[g], pct(stats.byGenre[g], T), stats.genreByTier[g][1], stats.genreByTier[g][2], stats.genreByTier[g][3]])), '');
  out.push(table(['文末', '件数', '割合'], Object.entries(stats.byEnding).sort((a, b) => b[1] - a[1]).map(([e, n]) => [e, n, pct(n, T)])));
  out.push(`「ござる」終わり: ${stats.gozaru} 件（${pct(stats.gozaru, T)}・上限40%）`, '');
  out.push('よく出る文末（末尾6字）: ' + stats.tails.map(([t, n]) => `…${t}×${n}`).join('　'));
  for (const w of stats.warnings) out.push(`注意: ${w}`);
  out.push('');
  if (errors.length) out.push(`違反 ${errors.length} 件:`, ...errors.map((e) => `  - ${e}`));
  else out.push('違反なし');
  return out.join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'data', 'words.js');
  const { WORDS } = await import(pathToFileURL(file).href);
  const result = validateWords(WORDS);
  console.log(report(result));
  process.exitCode = result.errors.length ? 1 : 0;
}
