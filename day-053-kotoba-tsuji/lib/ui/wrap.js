// 語の途中で折り返さないための、文節の切れ目の目安。
// word-break: auto-phrase が効かないブラウザ（Safari など）向けに、切れ目へ <wbr> を入れる。
// CSS の word-break: keep-all（切れ目以外では折り返さない）と overflow-wrap: anywhere（収まらない時だけ割る）と組み合わせる。
// 切れ目は2種類だけにする（v2-r3。見た目評価で「言い｜伝え」「たたき｜上げ」「書き｜入れる」が割れていたため）。
//  1. 句読点・閉じかっこの後と、開きかっこの前。ただし閉じかっこの後にひらがなが続くときは切らない（「吟味」で）
//  2. 助詞の後に漢字・カタカナが続く所。送り仮名と漢字の間では切らない。
//     「て」は前が漢字のとき（捨て身・当て字）は送り仮名とみなして切らない
// 助詞の後で切った結果、次のかたまりが2字以下になるときは前へつなげる（「…マス）の｜数。」のように短く残さない）

const HIRA = /[ぁ-ゟ]/; // ぁ〜ゟ
const KANJI = /[㐀-䶿一-鿿々〆]/;
const KANJI_KATA = /[㐀-䶿一-鿿々〆ァ-ヺーㇰ-ㇿ]/; // 漢字・々〆・カタカナ・ー
const AFTER = new Set([...'、。，．！？!?」』）)】…・']);
const CLOSE = new Set([...'」』）)】']);
const BEFORE = new Set([...'「『（(【']);
// 後ろで切ってよい助詞（1字）。テストでも同じ組を使う
export const PARTICLES = new Set([...'のにをはがでとへもやかねよぞなて']);

export function phraseSegments(text) {
  const chars = [...String(text ?? '')];
  const segs = [];
  const kinds = []; // そのかたまりの前の切れ目の種類（'punct' | 'particle' | null）
  let cur = '';
  let kind = null;
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const next = chars[i + 1];
    cur += c;
    if (next === undefined) break;
    const punct = (AFTER.has(c) && !AFTER.has(next) && !(CLOSE.has(c) && HIRA.test(next))) || (BEFORE.has(next) && !BEFORE.has(c));
    const particle = !punct && PARTICLES.has(c) && KANJI_KATA.test(next) && !(c === 'て' && i > 0 && KANJI.test(chars[i - 1]));
    if (punct || particle) {
      segs.push(cur);
      kinds.push(kind);
      cur = '';
      kind = punct ? 'punct' : 'particle';
    }
  }
  if (cur) {
    segs.push(cur);
    kinds.push(kind);
  }
  const out = [];
  segs.forEach((s, i) => {
    if (i > 0 && kinds[i] === 'particle' && [...s].length <= 2) out[out.length - 1] += s;
    else out.push(s);
  });
  return out;
}

// 文節ごとに <wbr> を挟んだ断片を返す（textContent は元の文と同じ）。
// 全角の「！」は明朝では寝た線（／）に見えるので、直立した字形のゴシック（.bang）で出す
export function phrased(text) {
  const frag = document.createDocumentFragment();
  phraseSegments(text).forEach((seg, i) => {
    if (i > 0) frag.append(document.createElement('wbr'));
    seg.split('！').forEach((part, k) => {
      if (k > 0) {
        const bang = document.createElement('span');
        bang.className = 'bang';
        bang.textContent = '！';
        frag.append(bang);
      }
      if (part) frag.append(part);
    });
  });
  return frag;
}
