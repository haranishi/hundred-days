import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { phraseChunks, tokenRegex } from '../lib/phrase.js';

const real = JSON.parse(readFileSync(new URL('../data/commentary.json', import.meta.url)));
const sentences = [];
for (const entry of Object.values(real.entries)) {
  sentences.push(entry.headline);
  for (const key of ['what', 'changed', 'expected']) for (const row of entry[key] || []) sentences.push(row.text);
  for (const gap of entry.gap || []) sentences.push(gap.what, gap.label || '');
}
const kanji = /[㐀-鿿]/, katakana = /[ァ-ヺー]/, hiragana = /[ぁ-ゟ]/, latin = /[A-Za-z0-9]/;
test('つなぎ直すと元の文に戻り、空や null でも落ちない', () => {
  for (const text of sentences) assert.equal(phraseChunks(text).join(''), text);
  assert.deepEqual(phraseChunks(''), []);
  assert.deepEqual(phraseChunks(null), []);
});
test('句点・読点のあとで折れ、ひらがなから漢字・カタカナへ移る所で折れる', () => {
  assert.deepEqual(phraseChunks('光に反応するたんぱく質を使い、神経の細胞を光で操作する方法'),
    ['光に', '反応するたんぱく質を', '使い、', '神経の', '細胞を', '光で', '操作する', '方法']);
  assert.deepEqual(phraseChunks('見つかった、チャネルロドプシンです。'), ['見つかった、', 'チャネルロドプシンです。']);
});
test('単語の途中では折らない：見つかった・2002年・たんぱく質・カタカナの連なり・漢字の連なり', () => {
  const pieces = phraseChunks('このたんぱく質のもとは、2002年の論文で見つかった非線形効果です。');
  assert.ok(pieces.includes('このたんぱく質のもとは、'));
  assert.ok(pieces.some((piece) => piece.includes('2002年')));
  assert.ok(pieces.some((piece) => piece.includes('見つかった')));
  assert.ok(pieces.some((piece) => piece.includes('非線形効果')));
});
test('実際の解説の全文：折り位置は句読点・文字種の遷移・助詞・中黒・括弧の境目', () => {
  for (const text of sentences) {
    const pieces = phraseChunks(text);
    for (let i = 1; i < pieces.length; i += 1) {
      const left = [...pieces[i - 1]].at(-1), right = [...pieces[i]][0];
      const ok = left === '、' || left === '。' || (hiragana.test(left) && (kanji.test(right) || katakana.test(right) || latin.test(right))) || right === '（' || right === '「' || left === '・' || /[はがをにへでとものや）」]/.test(left)
        // 上限（14字）を超える複合語を、単語の境目で割った所
        || [...pieces[i - 1]].length + [...pieces[i]].length > 14;
      assert.ok(ok, `${text} の ${left}|${right}`);
    }
  }
});
test('実際の解説の全文：カタカナ・英数字・漢字の連なりと、数字と単位のあいだでは折らない', () => {
  for (const text of sentences) {
    const pieces = phraseChunks(text);
    for (let i = 1; i < pieces.length; i += 1) {
      const left = [...pieces[i - 1]].at(-1), right = [...pieces[i]][0];
      assert.ok(!(katakana.test(left) && katakana.test(right)), `${text} カタカナ ${left}|${right}`);
      assert.ok(!(kanji.test(left) && kanji.test(right)), `${text} 漢字 ${left}|${right}`);
      assert.ok(!(/[0-9]/.test(left) && !/[0-9]/.test(right) && kanji.test(right)), `${text} 数字と単位 ${left}|${right}`);
    }
  }
});
test('実際の解説の全文：塊の長さは、390px幅の1行（16字以内）に収まる', () => {
  let longest = 0;
  for (const text of sentences) for (const piece of phraseChunks(text)) {
    // 13字以上のカタカナの名前（アイスキューブ・ジェンツー）を含む塊は、幅の狭い画面で「・」のあとで折れるので、長くてよい
    if (/[ァ-ヶー]+(?:・[ァ-ヶー]+)+/.test(piece) && piece.match(/[ァ-ヶー]+(?:・[ァ-ヶー]+)+/)[0].length > 12) continue;
    longest = Math.max(longest, [...piece].length);
  }
  assert.ok(longest < 17, `最長 ${longest} 字`);
});

test('数字とか・全角コロン・日付・数と単位を分離しない', () => {
  for (const text of ['14か国','3か月','2か所','確認日：2026年10月7日','2012年5月','約450人','約8倍','TXS 0506+056']) {
    assert.ok(phraseChunks(`研究は${text}で行った。`).some(c => c.includes(text)), text);
  }
  assert.ok(phraseChunks('確かめて：次に進む。').length > 1);
});
test('修飾語だけで折らず、通常の述語は折れる', () => {
  for (const prefix of ['この','その','あの','どの','ある','ほかの','別の','同じ','2つの','3個の','4本の','5人の','6種の','7枚の','8回の','狙った']) {
    assert.ok(phraseChunks(`${prefix}触媒種が働く。`)[0].startsWith(`${prefix}触媒種が`), prefix);
  }
  assert.deepEqual(phraseChunks('調べた触媒種が働く。'), ['調べた','触媒種が','働く。']);
});
test('カタカナの中黒を保ち、それ以外の中黒のあとで折れる', () => {
  for (const name of ['アンリ・カガン','アイスキューブ・ジェンツー']) assert.deepEqual(phraseChunks(name), [name]);
  assert.deepEqual(phraseChunks('約450人・58機関・14か国'), ['約450人・','58機関・','14か国']);
});
test('長い文は単語境界の助詞で14字以内に分け、分割不能の名前は保つ', () => {
  const text='研究機関の実験装置の測定結果の確認方法';
  assert.ok(phraseChunks(text).every(c => c.length <= 14));
  assert.equal(phraseChunks(text).join(''),text);
  const name='ABCDEFGHIJKLMNOPQRSTUVXYZ';
  assert.deepEqual(phraseChunks(name),[name]);
  assert.ok(phraseChunks('2つの触媒種が働く。').some(c=>c.includes('2つの触媒種が')));
});

test('全解説の折り位置はIntl.Segmenterの語の途中ではない', () => {
  const segmenter = new Intl.Segmenter('ja', { granularity:'word' });
  for (const text of sentences) {
    const bounds = new Set([...segmenter.segment(text)].map(p=>p.index));
    let offset=0;
    for (const chunk of phraseChunks(text).slice(0,-1)) { offset+=chunk.length; assert.ok(bounds.has(offset), `${text} の ${offset}`); }
  }
});
test('描画：日付・数と単位・カタカナの名前・欧文の識別子は、nowrap の span で包まれる（ブラウザ自身の折りも止める）', async () => {
  const { phrase } = await import('../lib/render.js');
  const html = phrase('2026年9月9日に、約450人・58機関・14か国のアンリ・カガンさんらが、TXS 0506+056を見た。確認日：2026年10月7日');
  for (const token of ['2026年9月9日', '約450人', '58機関', '14か国', 'アンリ・カガン', 'TXS 0506+056', '確認日：2026年10月7日']) {
    assert.ok(html.includes(`<span class="nw">${token}</span>`), token);
  }
  assert.doesNotMatch(phrase('光を当てて、活動を変える。'), /class="nw"/);
});
test('実際の解説の全文：表記（日付・数と単位・名前・識別子）は、すべて nowrap の span に入っている', async () => {
  const { phrase } = await import('../lib/render.js');
  let checked = 0;
  for (const text of sentences) {
    const html = phrase(text);
    for (const match of text.matchAll(tokenRegex())) {
      if (match[0].length > 24 || (/^[ァ-ヶー]+(?:・[ァ-ヶー]+)+$/.test(match[0]) && match[0].length > 12)) continue; // render.js と同じ除外（長い名前は包まない）
      const escaped = match[0].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      assert.ok(html.includes(`<span class="nw">${escaped}</span>`), `${text} の ${match[0]}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 20, `表記が少なすぎる（${checked}件）`);
});
test('上限（14字）を超える複合語は、単語の境目で割る（幅の狭い画面で語の途中の折りを避ける）', () => {
  const pieces = phraseChunks('ゲッティンゲン大学医療センターの研究ページには、人工内耳の計画が載っています。');
  assert.equal(pieces.join(''), 'ゲッティンゲン大学医療センターの研究ページには、人工内耳の計画が載っています。');
  assert.ok(pieces.every((piece) => [...piece].length <= 14), pieces.join(' | '));
  assert.ok(pieces.includes('センターの'), pieces.join(' | '));
});
test('描画：短いカタカナの名前は包み、長い名前（13字以上）は包まない', async () => {
  const { phrase } = await import('../lib/render.js');
  assert.ok(phrase('アンリ・カガンさんらが').includes('<span class="nw">アンリ・カガン</span>'));
  // 長い名前そのものは包まない（括弧と助詞だけが包まれる）。幅の狭い画面で、名前の「・」のあとで折れる
  assert.doesNotMatch(phrase('後継計画（アイスキューブ・ジェンツー）では、'), /<span class="nw">[^<]*アイスキューブ/);
});
test('閉じ括弧とそのあとの助詞は離さない（行頭に助詞が来ない）：塊の境目にも、折らない表記の包みにも', async () => {
  const { phrase } = await import('../lib/render.js');
  const html = phrase('2029年の人での臨床試験（第I・II相）と、2036年の欧州での販売承認が目標で、（2018年）や、動物では確かめた。');
  for (const token of ['）と、', '）や、']) assert.ok(html.includes(`<span class="nw">${token}</span>`), token);
  for (const text of sentences) {
    const pieces = phraseChunks(text);
    for (let i = 1; i < pieces.length; i += 1) {
      assert.doesNotMatch(`${pieces[i - 1]}|${pieces[i]}`, /[）」』】〕〉》]\|[はがをにへでとものや]/, text);
    }
  }
});
test('臨床試験の段階（第I・II相）は途中で折らない', async () => {
  const { phrase } = await import('../lib/render.js');
  assert.ok(phrase('2029年の人での臨床試験（第I・II相）と、2036年の欧州での販売承認です。').includes('<span class="nw">第I・II相</span>'));
});

