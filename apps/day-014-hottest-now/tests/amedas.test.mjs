import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildStations, coldestBelow, distanceKm, extremes, formatClock, histogram,
  aliasOf, nearestStation, normalizeQuery, observesTemperature, prefectureOf, rankByTemperature,
  rankSummary, readTemperature, searchStations, shiftStamp, stampFromIso, toDegrees,
} from '../lib/amedas.js';
import { HOUR_AGO, OBSERVATIONS, TABLE } from './fixtures/amedas.mjs';

const stations = buildStations(TABLE, OBSERVATIONS);
const ranked = rankByTemperature(stations);
const byName = (name) => stations.find((station) => station.name === name);

describe('配信データの読み方', () => {
  it('緯度経度は度と分で来るので度に直す', () => {
    assert.equal(Math.round(toDegrees([39, 43.0]) * 1e4) / 1e4, 39.7167);
    assert.ok(Number.isNaN(toDegrees([39])));
  });

  it('地点番号の上2桁から都道府県が引ける', () => {
    assert.equal(prefectureOf('32402'), '秋田県');
    assert.equal(prefectureOf('86491'), '熊本県');
    assert.equal(prefectureOf('99999'), '');
  });

  it('elems の1桁目で、そもそも気温を測っている地点かが分かる', () => {
    assert.equal(observesTemperature(TABLE['32402']), true);
    assert.equal(observesTemperature(TABLE['12011']), false);
    assert.equal(observesTemperature({}), false);
  });

  it('品質フラグが0以外の値は採らない（故障や欠測をそのまま順位に入れない）', () => {
    assert.equal(readTemperature({ temp: [25.5, 0] }), 25.5);
    assert.equal(readTemperature({ temp: [99.9, 1] }), null);
    assert.equal(readTemperature({}), null);
  });

  it('気温が無い地点も一覧には残す（探した人に理由を返すため）', () => {
    assert.equal(stations.length, Object.keys(TABLE).length);
    assert.equal(byName('小車').temperature, null);
    assert.equal(byName('小車').hasThermometer, false);
    assert.equal(byName('故障中').temperature, null);
    assert.equal(byName('故障中').hasThermometer, true);
  });
});

describe('順位', () => {
  it('気温が読めた地点だけを暑い順に並べる', () => {
    assert.deepEqual(ranked.map((station) => station.name), ['牛深', '秋田', '横手', '雄和', '金山', '金山', '美深', '富士山']);
  });

  it('同じ気温は同じ順位になり、その次は人数分だけ飛ぶ', () => {
    const akita = rankSummary(ranked, '32402');
    const yokote = rankSummary(ranked, '32056');
    assert.equal(akita.rank, 2);
    assert.equal(yokote.rank, 2);
    assert.equal(akita.tied, 2);
    assert.equal(ranked.find((station) => station.id === '52041').rank, 5);
  });

  it('母数は気温が読めた地点の数（測っていない地点は含めない）', () => {
    assert.equal(rankSummary(ranked, '32402').total, 8);
    assert.equal(rankSummary(ranked, '12011'), null);
  });

  it('いちばん暑い場所と寒い場所、その差を出す', () => {
    const summary = extremes(ranked);
    assert.equal(summary.hottest.name, '牛深');
    assert.equal(summary.coldest.name, '富士山');
    assert.equal(summary.gap, 25.3);
    assert.equal(extremes([]), null);
  });

  it('標高で区切ると、山の上とは別のいちばん寒い場所が出る', () => {
    assert.equal(coldestBelow(ranked, 1000).name, '美深');
    assert.equal(coldestBelow(ranked, 1), null);
  });
});

describe('地点を探す', () => {
  it('平仮名で打っても片仮名の読みに当たる', () => {
    assert.equal(normalizeQuery(' あきた '), 'アキタ');
    assert.deepEqual(searchStations(stations, 'あきた').map((station) => station.name), ['秋田']);
  });

  it('同じ名前の観測所は都道府県で見分けられるように全部返す', () => {
    const hits = searchStations(stations, '金山');
    assert.equal(hits.length, 2);
    assert.deepEqual(hits.map((station) => station.prefecture).sort(), ['北海道', '岐阜県']);
  });

  it('県名でもあり、別の地点の別名でもある地点名は、その地点だけを返す', () => {
    // 「秋田」は県名でもあり、雄和の読み「ユウワ：秋田空港」にも含まれる。
    // どちらも並ぶと、自分の街を探しに来た人が選べない
    assert.deepEqual(searchStations(stations, '秋田').map((station) => station.name), ['秋田']);
  });

  it('読みの欄に入っている別名でも探せる', () => {
    assert.deepEqual(searchStations(stations, '秋田空港').map((station) => station.name), ['雄和']);
    assert.equal(aliasOf(byName('雄和')), '秋田空港');
    assert.equal(aliasOf(byName('秋田')), '');
  });

  it('県名だけを打ったときは、その県の地点が並ぶ', () => {
    const hits = searchStations(stations, '秋田県').map((station) => station.name);
    assert.deepEqual(hits.sort(), ['故障中', '横手', '秋田', '雄和']);
  });

  it('見つからない言葉と空文字は0件（呼び出し側で言い分けるため）', () => {
    assert.equal(searchStations(stations, 'ぬるぽ').length, 0);
    assert.equal(searchStations(stations, '   ').length, 0);
  });

  it('現在地からいちばん近い観測所を返し、気温のある地点だけに絞ることもできる', () => {
    const point = { latitude: 44.5, longitude: 142.5 };
    assert.equal(nearestStation(stations, point).station.name, '小車');
    assert.equal(nearestStation(stations, point, { requireTemperature: true }).station.name, '美深');
    assert.ok(distanceKm(point, { latitude: 44.5, longitude: 142.5 }) < 0.001);
  });

  it('距離はおおよそ実際のキロメートルになる', () => {
    const akita = byName('秋田');
    const ushibuka = byName('牛深');
    const km = distanceKm(akita, ushibuka);
    assert.ok(km > 1200 && km < 1400, `${km}km`);
  });
});

describe('散らばりと時刻', () => {
  it('1℃刻みの本数に数え、全部の地点がどこかの本に入る', () => {
    const bins = histogram(ranked.map((station) => station.temperature), 1);
    assert.equal(bins.reduce((total, bin) => total + bin.count, 0), ranked.length);
    assert.equal(bins[0].from, 5);
    assert.equal(bins[bins.length - 1].to, 31);
    assert.deepEqual(histogram([], 1), []);
  });

  it('配信ファイル名は日本時間の壁時計をそのまま使う', () => {
    assert.equal(stampFromIso('2026-08-21T21:30:00+09:00'), '20260821213000');
    assert.equal(shiftStamp('20260821213000', -60), '20260821203000');
    assert.equal(shiftStamp('20260821003000', -60), '20260820233000');
    assert.equal(shiftStamp('こわれた', -60), '');
    assert.equal(formatClock('20260821213000'), '8月21日 21:30');
  });

  it('1時間前の値と突き合わせて増減が出せる', () => {
    const before = HOUR_AGO['86491'].temp[0];
    const now = ranked[0].temperature;
    assert.equal(Math.round((now - before) * 10) / 10, -0.7);
  });
});
