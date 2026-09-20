import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPaper } from '../lib/paper.js';
import { PAPER, BODY } from '../lib/layout.js';

/* 紙面の描画を記録するだけの canvas。Node には canvas が無いので、
   ctx の呼び出しを控えて「何を描いたか」を検査する。
   drawImage と getImageData は、呼ばれたら落ちるようにしてある＝
   写真をPNGに焼く道が復活したら、このテストが落ちる。 */
function recorder() {
  const texts = [];
  let tx = 0;
  let ty = 0;
  const stack = [];
  const ctx = {
    setTransform() {},
    save() { stack.push([tx, ty]); },
    restore() { [tx, ty] = stack.pop() ?? [0, 0]; },
    translate(x, y) { tx += x; ty += y; },
    rotate() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    arc() { throw new Error('紙面に円を描く道が残っている（網点の残骸）'); },
    fill() { throw new Error('紙面に塗りを描く道が残っている（網点の残骸）'); },
    // 縦組みの文字は translate してから原点に打つ。横組み（題字・欄外）と区別できる
    fillText(text, x, y) { texts.push({ text, x: tx + x, y: ty + y, glyph: tx !== 0 || ty !== 0 }); },
    drawImage() { throw new Error('紙面に画像を描いてはいけない'); },
    getImageData() { throw new Error('紙面の画素を読んではいけない'); }
  };
  return { canvas: { width: 0, height: 0, getContext: () => ctx }, texts };
}

const article = (over = {}) => ({
  headline: '潮、いまどっち？',
  lead: 'いまの潮が満ちているか引いているかを1行で答える。地点を決めると次の満干も出る。',
  site: '一〇〇日',
  host: 'example.com',
  image: 'https://example.com/photo.png',
  publishedAt: '二〇二六年九月十日',
  url: 'https://example.com/tide',
  ...over
});

const model = (...list) => ({ articles: list, date: '二〇二六年九月十三日　日曜日', issue: '第三十五号' });
const body = (texts) => texts.map((item) => item.text).join('');
// 本体の帯に縦組みで流れた文字だけを見る（題字・欄外・横組みのキャプションは除く）
const inBody = (texts) => texts.filter((item) => item.glyph && item.y >= BODY.top && item.y <= BODY.bottom);

for (const count of [1, 2, 3]) {
  test(`保存する紙面に写真は入らない（記事${count}本）`, () => {
    const { canvas, texts } = recorder();
    const list = Array.from({ length: count }, (_, i) => article({ headline: `見出し${i + 1}` }));
    const sheet = renderPaper(canvas, model(...list), { photos: false });
    assert.deepEqual(sheet.photos, []); // 写真の枠を1つも空けない
    assert.ok(texts.length > 0); // 文字は組まれている
  });
}

test('画面の紙面は写真の枠を空けるが、写真そのものは描かない', () => {
  const { canvas, texts } = recorder();
  const sheet = renderPaper(canvas, model(article()));
  assert.equal(sheet.photos.length, 1);
  const [box] = sheet.photos;
  assert.equal(box.index, 0);
  assert.ok(box.left >= 0 && box.left + box.width <= PAPER.width);
  assert.ok(box.top >= 0 && box.top + box.height <= PAPER.height);
  assert.ok(texts.length > 0);
});

test('og:image が無い記事では枠を空けない', () => {
  const { canvas } = recorder();
  const sheet = renderPaper(canvas, model(article({ image: null })));
  assert.deepEqual(sheet.photos, []);
});

test('2〜3本のときに枠を空けるのは一番手だけ', () => {
  for (const count of [2, 3]) {
    const { canvas } = recorder();
    const list = Array.from({ length: count }, (_, i) => article({ headline: `見出し${i + 1}` }));
    const sheet = renderPaper(canvas, model(...list), { photos: true });
    assert.deepEqual(sheet.photos.map((box) => box.index), [0], `${count}本`);
  }
});

test('写真が無い紙面では、本文が紙面の左まで届く', () => {
  const withPhoto = recorder();
  renderPaper(withPhoto.canvas, model(article()), { photos: true });
  const withoutPhoto = recorder();
  renderPaper(withoutPhoto.canvas, model(article()), { photos: false });
  const leftmost = (texts) => Math.min(...inBody(texts).map((item) => item.x));
  // 写真の帯が消えたぶん、本文は左へ広がる（白く残らない）
  assert.ok(leftmost(withoutPhoto.texts) < leftmost(withPhoto.texts));
  assert.ok(leftmost(withoutPhoto.texts) < PAPER.margin + 120, '本文が左の端まで届いていない');
});

test('写真が無い紙面では、本文が紙面の下まで届く', () => {
  const { canvas, texts } = recorder();
  renderPaper(canvas, model(article()), { photos: false });
  const lowest = Math.max(...inBody(texts).map((item) => item.y));
  assert.ok(lowest > BODY.bottom - 120, '本文が下の帯まで流れていない');
});

test('写真を出さない紙面には、出所と公開日が本文に残る', () => {
  const { canvas, texts } = recorder();
  renderPaper(canvas, model(article()), { photos: false });
  const printed = body(texts);
  assert.match(printed, /全文は/);
  assert.match(printed, /example\.com/);
  assert.match(printed, /二〇二六年九月十日/);
});

test('記事が無くても紙面は組める', () => {
  const { canvas, texts } = recorder();
  const sheet = renderPaper(canvas, model(), { photos: false });
  assert.deepEqual(sheet.photos, []);
  assert.match(body(texts), /リンクを貼ると/);
});
