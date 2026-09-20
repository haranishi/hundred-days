import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bearingDeg, directionName, distanceM, formatDistance, inJapan } from '../lib/geo.js';
import { radiusLabel } from '../lib/query.js';
import { candidateStem, notFoundText, rankCandidates, readAddressResults } from '../lib/address.js';
import {
  TRAFFIC_CAVEAT, answerSubText, answerText, hourCellLabel, hoursTitle, peakText,
  pinLabel, sourceYears, spotBreakdown, spotPlaceText, spotText, spotsTitle,
  unknownHourText, zeroSubText, zeroText,
} from '../lib/ui.js';

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url)));
const spot = (extra) => ({ count: 1, distance: 0, bearing: 0, crossing: false, walker: 0, bike: 0, death: 0, ...extra });

test('答えの1行目は、半径と年数と件数を並べるだけ', () => {
  assert.equal(answerText(500, 6, 'all', 23), '半径500mで、6年間に23件。');
  assert.equal(answerText(300, 6, 'all', 0), '半径300mで、6年間に0件。');
  assert.equal(answerText(1000, 6, 'all', 1730), '半径1kmで、6年間に1730件。');
  assert.equal(radiusLabel(300), '300m');
  assert.equal(radiusLabel(1000), '1km');
});

test('1件のときは「1件」と出す', () => {
  assert.equal(answerText(300, 6, 'all', 1), '半径300mで、6年間に1件。');
  assert.equal(answerText(300, 6, 'walker', 1), '半径300mで、6年間に歩行者が関わった事故が1件。');
});

test('絞り込むと、誰の事故を数えたのかが答えの文に入る', () => {
  assert.equal(answerText(500, 6, 'walker', 5), '半径500mで、6年間に歩行者が関わった事故が5件。');
  assert.equal(answerText(500, 6, 'bike', 9), '半径500mで、6年間に自転車が関わった事故が9件。');
  assert.equal(answerText(1000, 6, 'elder', 117), '半径1kmで、6年間に65歳以上が関わった事故が117件。');
});

test('2行目の内訳は、絞り込んだ項目を繰り返さない', () => {
  const summary = { total: 23, walker: 5, bike: 9, elder: 7, death: 0 };
  assert.equal(answerSubText('all', summary), 'うち歩行者5件・自転車9件・死亡事故0件');
  assert.equal(answerSubText('elder', summary), 'うち歩行者5件・自転車9件・死亡事故0件');
  assert.equal(answerSubText('walker', summary), 'うち65歳以上7件・死亡事故0件');
  assert.equal(answerSubText('bike', summary), 'うち65歳以上7件・死亡事故0件');
});

test('0件でも空白にせず、答えとして出す', () => {
  assert.equal(zeroText('all'), 'この半径では、記録がありません。');
  assert.equal(zeroText('walker'), 'この半径では、歩行者が関わった事故の記録がありません。');
  assert.equal(zeroText('elder'), 'この半径では、65歳以上が関わった事故の記録がありません。');
  assert.match(zeroSubText(), /届け出のない事故は、このデータに入っていません/);
});

test('危ない・安全といった判断を書かない', () => {
  const texts = [
    answerText(500, 6, 'all', 23), answerSubText('all', { walker: 1, bike: 2, elder: 3, death: 4 }),
    zeroText('all'), zeroSubText(), spotText(spot({ count: 6, distance: 180, bearing: 45 })),
  ];
  for (const text of texts) {
    assert.doesNotMatch(text, /危険|危ない|安全|気をつけ|避けて/);
  }
  // 「多い＝危ない」ではない、という但し書きは画面に常時出す文としてここに持つ
  assert.match(TRAFFIC_CAVEAT, /交通量で割っていません/);
});

test('8方位の境目。22.5度ちょうどは北東、337.5度ちょうどは真北', () => {
  assert.equal(directionName(0), '真北');
  assert.equal(directionName(22.4), '真北');
  assert.equal(directionName(22.5), '北東');
  assert.equal(directionName(67.4), '北東');
  assert.equal(directionName(67.5), '真東');
  assert.equal(directionName(180), '真南');
  assert.equal(directionName(247.5), '真西');
  assert.equal(directionName(270), '真西');
  assert.equal(directionName(292.4), '真西');
  assert.equal(directionName(292.5), '北西');
  assert.equal(directionName(337.5), '真北');
  assert.equal(directionName(359.9), '真北');
  assert.equal(directionName(-90), '真西');
  assert.equal(directionName(450), '真東');
});

test('方位は実際の座標からも同じ向きになる', () => {
  const here = { lat: 35.681236, lng: 139.767125 };
  assert.equal(directionName(bearingDeg(here, { lat: here.lat + 0.01, lng: here.lng })), '真北');
  assert.equal(directionName(bearingDeg(here, { lat: here.lat, lng: here.lng - 0.01 })), '真西');
  assert.equal(directionName(bearingDeg(here, { lat: here.lat - 0.01, lng: here.lng })), '真南');
  // 北へ100m・東へ100mなら北東
  assert.equal(directionName(bearingDeg(here, {
    lat: here.lat + 100 / 111320, lng: here.lng + 100 / (111320 * Math.cos(here.lat * Math.PI / 180)),
  })), '北東');
});

test('距離は1km未満が10m単位、1km以上は小数1桁のkm', () => {
  assert.equal(formatDistance(174), '170m');
  assert.equal(formatDistance(176), '180m');
  assert.equal(formatDistance(4), '0m');
  assert.equal(formatDistance(1234), '1.2km');
  // 四捨五入で1000mに届いたらkmへ繰り上げる（「1000m」と出さない）
  assert.equal(formatDistance(996), '1.0km');
  assert.equal(formatDistance(994), '990m');
});

test('地点の文は、方角と距離で名指しする', () => {
  assert.equal(spotText(spot({ count: 6, distance: 180, bearing: 45, crossing: true, walker: 2 })),
    '北東へ180m・交差点 — 6件（歩行者2）');
  assert.equal(spotText(spot({ count: 3, distance: 512, bearing: 265 })), '真西へ510m — 3件');
  assert.equal(spotText(spot({ count: 2, distance: 40, bearing: 0, bike: 1, death: 1 })),
    '真北へ40m — 2件（自転車1・死亡1）');
  // 選んだ場所とほぼ同じ地点は、方角を言っても意味がない
  assert.equal(spotPlaceText(spot({ distance: 3 })), 'ほぼこの地点');
  assert.equal(spotText(spot({ distance: 3, count: 4 })), 'ほぼこの地点 — 4件');
  assert.equal(spotBreakdown(spot({})), '');
  assert.equal(spotsTitle(5), '事故が集まっている地点 上位5か所');
  assert.equal(pinLabel(spot({ count: 6, distance: 180, bearing: 45 })), '北東へ180m 6件');
});

test('時刻の帯に添える文', () => {
  assert.equal(hoursTitle(23), '何時に起きているか（23件）');
  assert.equal(hourCellLabel(8, 5), '8時台 5件');
  const band = { hours: new Array(24).fill(0), unknown: 0, max: 5, peak: 8, known: 5 };
  band.hours[8] = 5;
  assert.equal(peakText(band), 'いちばん多いのは8時台で、5件です。');
  assert.equal(peakText({ ...band, peak: -1 }), '');
  assert.equal(unknownHourText({ ...band, unknown: 0 }), '');
  assert.equal(unknownHourText({ ...band, unknown: 2 }), '時刻が記録されていない2件は、この帯に入れていません。');
});

test('出典に出す年の範囲は索引から取る', () => {
  assert.equal(sourceYears({ years: [2019, 2024] }), '2019〜2024年');
  assert.equal(sourceYears({}), '');
});

test('日本の範囲は境界を含み、外側と非数値を弾く', () => {
  assert.equal(inJapan({ lat: 20, lng: 122 }), true);
  assert.equal(inJapan({ lat: 46.5, lng: 154 }), true);
  for (const p of [{ lat: 19.9, lng: 139 }, { lat: 46.6, lng: 139 }, { lat: 48.85, lng: 2.35 },
    { lat: null, lng: 139 }, { lat: 35, lng: 'あ' }, null]) {
    assert.equal(inJapan(p), false);
  }
  assert.equal(distanceM({ lat: 35, lng: 139 }, { lat: 35, lng: 139 }), 0);
});

test('住所検索は1件なら自動、複数なら選ばせ、0件は案内文', () => {
  assert.equal(readAddressResults(fixture('address-akita-sanno')).kind, 'one');
  assert.equal(readAddressResults(fixture('address-none')).kind, 'none');
  const many = readAddressResults(fixture('address-akita-eki'));
  assert.equal(many.kind, 'many');
  assert.equal(many.items.length, 10);
  // 「秋田駅」の目印は「秋田」。題名の早い位置に出る候補を前に並べる
  assert.equal(candidateStem('秋田駅'), '秋田');
  assert.equal(rankCandidates(many.items, '秋田駅')[0].title, '秋田県秋田市');
  assert.match(notFoundText('ぬるぽ'), /「ぬるぽ」に当たる場所が見つかりませんでした/);
});
