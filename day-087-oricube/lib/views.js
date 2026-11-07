// Pure helpers for the screen (no DOM, no three.js), so they can be tested in Node.

export const VIEW_PRESETS = ['flat', 'iso', 'top', 'side'];

// The view a step recommends: the last `view` declared at or before step i. 'iso' when none is.
export function effectiveView(steps, i) {
  const list = Array.isArray(steps) ? steps : [];
  const end = Math.min(Math.trunc(Number(i) || 0), list.length - 1);
  for (let k = end; k >= 0; k--) {
    const v = list[k]?.view;
    if (VIEW_PRESETS.includes(v)) return v;
  }
  return 'iso';
}

// Japanese can break inside a word ("ネ／クタイ"). These words are kept on one line.
export const NOWRAP_WORDS = [
  '立方体の箱', '紙飛行機', '中割り折り', 'ふたのない', '細くとがった', '桜色の面', '白い面', '青い面', '緑の面', '生成りの面',
  '中心線', '折り筋', '折り目', '谷折り', '山折り', '折り込み', '折り返し', '立ち上げ', '裏返し', '裏返す', '向こうに', '手前に',
  '手前の', '向こう', '手前', '二つに', '二つ', '仕組み', '背骨', '先端', '左右の', '角のひれ', '紙の間', '胴の紙',
  'ネクタイ', '結び目', '折り上げます', '折り上げ', '折り下げる', '折り下げ', '右前', '左前', '小さく', '花弁折り',
  '正方基本形', '鳥の基本形', '青磁色', '空色', '若葉色', '山吹色', '藍色', '炭色', 'ヨット', 'もみの木', 'ポチ袋',
  'ハート', '着物', '白鳥', '鶴',
];

// Longest first: the regular expression tries the alternatives in order, not the longest match.
const SORTED = [...new Set(NOWRAP_WORDS)].sort((a, b) => b.length - a.length);
const escape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORD_RE = new RegExp(SORTED.map(escape).join('|'), 'g');

function splitWords(plain, out) {
  let at = 0;
  for (const m of plain.matchAll(WORD_RE)) {
    if (m.index > at) out.push({ text: plain.slice(at, m.index), nowrap: false });
    out.push({ text: m[0], nowrap: true });
    at = m.index + m[0].length;
  }
  if (at < plain.length) out.push({ text: plain.slice(at), nowrap: false });
}

// Splits text into pieces to render; pieces with nowrap must not break inside.
// The last few characters of each sentence stay together ("す。" never falls to a line alone):
// the last sentence keeps `tail` characters, earlier ones keep 4. A kept tail never starts inside a word.
export function wrapSegments(text, tail = 6) {
  const str = String(text || '');
  const sentences = str.match(/[^。！？]+[。！？]?|[。！？]/g) || [];
  const out = [];
  sentences.forEach((sentence, i) => {
    const k = i === sentences.length - 1 ? tail : 4;
    if (sentence.length <= k + 2) { splitWords(sentence, out); return; }
    let cut = sentence.length - k;
    for (const m of sentence.matchAll(WORD_RE)) {
      if (m.index < cut && m.index + m[0].length > cut) { cut = m.index; break; }
    }
    if (cut <= 0) { out.push({ text: sentence, nowrap: true }); return; }
    splitWords(sentence.slice(0, cut), out);
    out.push({ text: sentence.slice(cut), nowrap: true });
  });
  return out;
}
