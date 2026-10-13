// 折り返しの決まり（lib/wrap.js）の検査。体験評価で、語の途中の改行（「引き｜返す」「通り｜道」「ひとつ｜戻す」「左から4・｜上から2」）が見つかった。
// 全部の画面の文（tests/corpus.mjs）について、保護語の中に折り返し候補（<wbr>）が入らないこと、index.html に手で書いた文が同じ決まりで作った文と同じことを確かめる。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { wrapTokens, wrapHtml, breakPositions, canBreak, protectedRanges, PROTECTED_WORDS } from '../lib/wrap.js';
import { KEY_HELP_LETTERS } from '../lib/phrase.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dynamicTexts, staticParagraphs, SHARED_TEXTS } from './corpus.mjs';

const show = (text) => wrapTokens(text).map((t) => (t.type === 'wbr' ? '|' : t.type === 'nb' ? `[${t.s}]` : t.s)).join('');
const texts = dynamicTexts();
const statics = staticParagraphs();

describe('折り返し候補の入れ方', () => {
  it('文は変わらない：字をつなぐと元の文（textContent が変わらない）', () => {
    for (const text of [...texts, ...statics.map((p) => p.text)]) {
      assert.equal(wrapTokens(text).map((t) => t.s ?? '').join(''), text);
    }
  });

  it('保護語の中に折り返し候補が入らない。保護語は <span class="nb"> 1つに包まれる（全部の画面の文）', () => {
    for (const text of [...texts, ...statics.map((p) => p.text)]) {
      const ranges = protectedRanges(text);
      for (const i of breakPositions(text)) {
        assert.equal(ranges.some(([a, b]) => i > a && i < b), false, `${text} の ${i} 文字目の手前（${show(text)}）`);
      }
      const nb = wrapTokens(text).filter((t) => t.type === 'nb').map((t) => t.s);
      assert.deepEqual(nb, ranges.map(([a, b]) => text.slice(a, b)), text);
    }
  });

  it('折り返し候補は、読点・句点の後ろ、助詞で終わるひらがなの並びの後ろ、開き括弧の手前だけ。行頭に閉じ括弧・句読点が来ない', () => {
    for (const text of texts) {
      for (const i of breakPositions(text)) {
        assert.equal(canBreak(text, i), true, text);
        assert.equal(/[、。，．」』）！？\s]/.test(text[i]), false, `${text} の行頭に ${text[i]}`);
      }
    }
  });

  it('評価で見つかった例：引き返す・通り道・ひとつ戻す・お手本・座標・「その」の直後は割らない', () => {
    assert.equal(show('警備員は道を行き来する。どこで引き返せば、通れるだろう。'), '[警備員]は|道を|[行き来]する。|どこで|[引き返]せば、|通れるだろう。');
    assert.equal(show('12手目、警備員が箱の前で引き返して、光が届いた。'), '12手目、|[警備員]が|箱の|前で|[引き返]して、|光が|届いた。');
    assert.equal(show('太い二重の枠が、その光の通り道。'), '太い二重の|枠が、|その光の|[通り道]。');
    assert.equal(show('最初に戻した。「ひとつ戻す」で取り消せる'), '最初に|戻した。|「[ひとつ戻]す」で|[取り消]せる');
    assert.equal(show('お手本はここまで。最初から自分でやってみよう'), '[お手本]はここまで。|最初から|自分でやってみよう');
    assert.equal(show('光っているマス：左から2・上から3、左から3・上から3'), '[光っている]マス：[左から2・上から3]、|[左から3・上から3]');
    assert.equal(show('警備員はその手前で引き返す。'), '[警備員]はその手前で|[引き返]す。');
    assert.equal(show('あと4手短くできれば星3つ'), '[あと4手]短くできれば|星3つ');
    assert.equal(show('面6 通り道をふさがない'), '[面6 通り道をふさがない]');
  });

  it('共通の部品（shared/）の説明文：「直接」「リンク」「コピー」を割らない。文の中に、折り返しの候補がある', () => {
    assert.equal(show(SHARED_TEXTS[0]), '[Instagram]と|[YouTube]は|[Web]から|[直接投稿]できない仕組みなので、|「[共有…]」か|[コピー]した[リンク]から|貼ってください。');
    assert.equal(show(SHARED_TEXTS[1]), '[Instagram]と|[YouTube]は|[Web]から|[直接投稿]できない仕組みなので、|[リンク]を|[コピー]して|貼ってください。');
    assert.equal(show(SHARED_TEXTS[2]), '[コピー]しました');
    for (const text of SHARED_TEXTS.slice(0, 2)) assert.ok(wrapTokens(text).filter((t) => t.type === 'wbr').length > 3, text); // 長い説明文には、折り返し候補が複数ある
  });

  it('スイッチの文言は「文字のキー」と「（WASD・Z・R）を使う」の間でだけ折る（「を使う」だけが2行目に落ちない）', () => {
    assert.equal(show('文字のキー（WASD・Z・R）を使う'), '[文字のキー]|[（WASD・Z・R）を使う]');
  });

  it('保護語の表：使われない語を溜めない（今の画面の文に出てこないのは、これから出る「見つけ」だけ）', () => {
    const all = [...texts, ...statics.map((p) => p.text)].join('\n');
    const unused = PROTECTED_WORDS.filter((w) => !all.includes(w));
    assert.deepEqual(unused, ['見つけ']);
  });
});

describe('共通の部品の文は、検査に使う文と同じ', () => {
  it('shared/share.js の文（説明・コピーの合図）が、corpus.mjs の SHARED_TEXTS と一字一句同じ（部品の文が変わったら、ここが落ちる）', () => {
    const source = readFileSync(fileURLToPath(new URL('../shared/share.js', import.meta.url)), 'utf8');
    for (const text of SHARED_TEXTS) assert.ok(source.includes(text), `shared/share.js に無い文：${text}`);
  });
});

describe('index.html に手で書いた文は、同じ決まりで作った文と同じ', () => {
  const keyHelp = (text) => text.split('・').join('・<wbr>');

  it('文を作り直しても変わらない（変わるなら、wrap.js の決まりを直したあとに index.html の文を作り直していない）', () => {
    assert.ok(statics.length >= 8, `${statics.length} 個`);
    for (const p of statics) {
      const want = p.text === KEY_HELP_LETTERS ? keyHelp(p.text) : wrapHtml(p.text);
      assert.equal(p.html, want, p.text);
    }
  });

  it('保護語の中に <wbr> が入っていない（タグを外した文で数える）', () => {
    for (const p of statics) {
      const plain = p.html.replace(/<span class="nb">|<\/span>/g, '');
      const ranges = protectedRanges(plain.replace(/<wbr>/g, ''));
      let pos = 0;
      for (const piece of plain.split('<wbr>').slice(0, -1)) {
        pos += piece.length;
        assert.equal(ranges.some(([a, b]) => pos > a && pos < b), false, `${p.text} の ${pos} 文字目`);
      }
    }
  });
});
