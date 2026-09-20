import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { candidateStem, notFoundText, rankCandidates, readAddressResults } from '../lib/address.js';
import {
  answerSubText, answerText, issuedText, noSitesSubText, noSitesParts,
  unusableMoreText, unusableNoneText, unusableTitleParts, usablePinLabel,
  usableTitleParts, unusablePinLabel,
} from '../lib/ui.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));

test('答えの2行は要件どおりの文字列になる', () => {
  const place = { name: '中央市民サービスセンター', distance: 174 };
  assert.equal(answerText(1, place),
    '洪水のとき、いちばん近い指定緊急避難場所は「中央市民サービスセンター」。170m、徒歩およそ3分。');
  assert.equal(answerSubText(1, 0), 'いちばん近い場所が、そのまま洪水で使えます。');
  assert.equal(answerSubText(1, 17), 'それより近くに17か所ありますが、洪水では使えません。');
  assert.equal(answerText(5, { name: '八橋運動公園', distance: 1234 }),
    '津波のとき、いちばん近い指定緊急避難場所は「八橋運動公園」。1.2km、徒歩およそ16分。');
  // 避難の判断はしない
  for (const text of [answerText(1, place), answerSubText(1, 3), answerSubText(1, 0)]) {
    assert.doesNotMatch(text, /逃げてください|安全です|避難してください/);
  }
});

test('見出しと案内文は災害の種類を差し替えるだけ', () => {
  assert.equal(noSitesParts(5).join(''), 'この区画には、津波の指定緊急避難場所が登録されていません');
  assert.equal(noSitesSubText(5),
    '津波の危険がない地域では指定されないことがあります。ほかの災害の種類に切り替えるか、お住まいの市町村の情報を確かめてください。');
  assert.equal(usableTitleParts(1, 5).join(''), '洪水で使える、近い順5か所');
  assert.equal(unusableTitleParts(1).join(''), '近いのに、洪水では使えない場所');
  assert.equal(unusableNoneText(1, 5), '近い5か所の範囲に、洪水で使えない場所はありません。');
  assert.equal(unusableMoreText(3), 'ほか3か所');
  assert.equal(issuedText('2026-09-14'), '（2026-09-14 配信）');
  assert.equal(issuedText(''), '');
});

test('ピンのラベルは順位・名前・距離・使える使えないを文字で持つ', () => {
  assert.equal(usablePinLabel(1, { name: '中央市民サービスセンター', distance: 174 }, 1),
    '1 中央市民サービスセンター 170m 洪水で使える');
  assert.equal(unusablePinLabel({ name: '山王第一街区公園', distance: 217 }, 1),
    '山王第一街区公園 220m 洪水では使えない');
});

test('住所検索は1件なら自動、複数なら候補、0件なら見つからない', () => {
  const one = readAddressResults(fixture('address-akita-sanno'));
  assert.equal(one.kind, 'one');
  assert.equal(one.items[0].title, '秋田県秋田市山王');
  assert.ok(Math.abs(one.items[0].lng - 140.102722) < 1e-6);

  const many = readAddressResults(fixture('address-akita-eki'));
  assert.equal(many.kind, 'many');
  // 応答は11件だが最大10件まで。先頭は北海道＝掴んだ場所の名前を必ず見せる必要がある
  assert.equal(many.items.length, 10);
  assert.equal(many.items[0].title, '北海道中頓別町秋田');

  assert.equal(readAddressResults(fixture('address-none')).kind, 'none');
  assert.equal(readAddressResults(null).kind, 'none');
  assert.equal(readAddressResults([{ properties: { title: '座標なし' } }]).kind, 'none');
  assert.equal(notFoundText('あああ'), '「あああ」に当たる場所が見つかりませんでした。住所や町名で試してください。');
});

/* 文字と背景は4.5:1、押せるものの枠線は3:1。app.css の値をそのまま読んで固定する
   （Day 038で枠線が1.42:1のまま公開されかけた） */
const luminance = (hex) => hex.slice(1).match(/../g).map((c) => parseInt(c, 16) / 255)
  .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => {
  const x = luminance(a), y = luminance(b);
  return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100;
};

test('app.css の色は文字4.5:1・枠線3:1を満たす', () => {
  const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
  const token = (name) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`))[1];
  const [ink, muted, paper, line, card, usable, unusable] =
    ['ink', 'muted', 'paper', 'line', 'card', 'usable', 'unusable'].map(token);
  for (const background of [paper, card, '#e7e4da', '#eeebe1']) {
    assert.ok(ratio(ink, background) >= 4.5, `ink/${background}`);
    assert.ok(ratio(muted, background) >= 4.5, `muted/${background}`);
    assert.ok(ratio(line, background) >= 3, `line/${background}`);
  }
  assert.ok(ratio('#ffffff', usable) >= 4.5, 'ピンの数字');
  assert.ok(ratio(unusable, card) >= 3, '白抜きピンの枠');
  assert.ok(ratio(unusable, paper) >= 3, '白抜きピンの枠（地の上）');
});

test('住所候補は目印の語が早く出るものを前に並べ、順位が同じなら元の順', () => {
  assert.equal(candidateStem('秋田駅'), '秋田');
  assert.equal(candidateStem('秋田市山王'), '秋田市山王');
  const many = readAddressResults(fixture('address-akita-eki'));
  const ranked = rankCandidates(many.items, '秋田駅');
  assert.equal(ranked[0].title, '秋田県秋田市');
  assert.equal(ranked.length, many.items.length);
  // 目印が無い問い合わせでは並びを変えない
  assert.deepEqual(rankCandidates(many.items, '').map((i) => i.title), many.items.map((i) => i.title));
});
