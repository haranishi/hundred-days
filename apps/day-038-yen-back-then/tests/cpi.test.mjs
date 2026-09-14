import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseSeries, indexOf, firstYear, latestYear, convert, convertBack, ratio,
  flatYears, commonLatestYear, parseAmount, clampAmount, coinDiameter, formatYen,
  AMOUNT_DEFAULT, AMOUNT_MAX
} from '../lib/cpi.js';

const payload = JSON.parse(
  readFileSync(new URL('./fixtures/worldbank-cpi.json', import.meta.url), 'utf8')
);
const series = parseSeries(payload);
const jp = series.JPN;
const us = series.USA;

/* 指数の並びを作る小さな道具。年と指数だけ渡してテストを読みやすくする */
const make = (pairs) => pairs.map(([year, index]) => ({ year, index }));

test('parseSeries: 国ごとに分けて、昇順に並べる', () => {
  assert.ok(jp.length > 10);
  assert.ok(us.length > 10);
  for (let i = 1; i < jp.length; i += 1) assert.ok(jp[i].year > jp[i - 1].year);
  assert.equal(firstYear(jp), 1960);
  assert.equal(latestYear(jp), 2025);
});

test('parseSeries: value が null の年は落とす', () => {
  // フィクスチャには 1959年の null が1件入れてある
  assert.ok(payload[1].some((r) => r.date === '1959' && r.value === null));
  assert.equal(indexOf(jp, 1959), null);
});

test('parseSeries: 形が違う入力は例外にする（NaN を静かに広げない）', () => {
  assert.throws(() => parseSeries(null));
  assert.throws(() => parseSeries({}));
  assert.throws(() => parseSeries([{ page: 1 }]));
});

test('convert: 指数の比で換算し、最後に1回だけ四捨五入する', () => {
  const s = make([[2000, 100], [2025, 125]]);
  assert.equal(convert(1000, 2000, 2025, s), 1250);
  assert.equal(convert(1, 2000, 2025, s), 1); // 1.25 → 1
  assert.equal(convert(2, 2000, 2025, s), 3); // 2.5 → 3（半分は上へ）
});

test('convert: 同じ年なら金額は変わらない', () => {
  assert.equal(convert(7777, 1990, 1990, jp), 7777);
});

test('convert: 指数の無い年は null を返す（0や NaN を出さない）', () => {
  assert.equal(convert(1000, 1900, 2025, jp), null);
  assert.equal(convert(1000, 2000, 2100, jp), null);
});

test('convertBack: 逆向き。往復しても大きくずれない', () => {
  const now = convert(10000, 1995, 2025, jp);
  const back = convertBack(now, 1995, 2025, jp);
  assert.ok(Math.abs(back - 10000) <= 1, `往復のずれ ${Math.abs(back - 10000)}`);
});

test('convertBack: いまの1,000円は、昔なら小さい（物価が上がっている区間で）', () => {
  const back = convertBack(1000, 1960, 2025, jp);
  assert.ok(back < 1000);
  assert.ok(back > 0);
});

test('ratio: 何倍になったか', () => {
  const s = make([[2000, 80], [2025, 120]]);
  assert.equal(ratio(2000, 2025, s), 1.5);
  assert.equal(ratio(2025, 2000, s), 80 / 120);
  assert.equal(ratio(1999, 2025, s), null);
});

test('flatYears: ±0.5%未満だけを数える', () => {
  const s = make([
    [2000, 100],
    [2001, 100.4], // +0.40% → 数える
    [2002, 105],   // +4.58% → 数えない
    [2003, 105.2], // +0.19% → 数える
    [2004, 110]    // +4.56% → 数えない
  ]);
  assert.equal(flatYears(s, 2000, 2004), 2);
});

test('flatYears: ちょうど0.5%は、上がっても下がっても数えない', () => {
  // 丸めずに比べると 100→100.5 だけが誤差で「未満」に入ってしまう
  assert.equal(flatYears(make([[2000, 100], [2001, 100.5]]), 2000, 2001), 0);
  assert.equal(flatYears(make([[2000, 100], [2001, 99.5]]), 2000, 2001), 0);
  // 0.499% は数える
  assert.equal(flatYears(make([[2000, 100], [2001, 100.499]]), 2000, 2001), 1);
});

test('flatYears: 起点の年そのものは数えない（前年比は次の年から）', () => {
  const s = make([[2000, 100], [2001, 100.1]]);
  assert.equal(flatYears(s, 2001, 2001), 0);
  assert.equal(flatYears(s, 2000, 2001), 1);
});

test('flatYears: 前の年の指数が無い年は飛ばす', () => {
  const s = make([[2000, 100], [2005, 100.1]]); // 2005の前年(2004)が無い
  assert.equal(flatYears(s, 2000, 2005), 0);
});

test('commonLatestYear: 2国そろう最新の年を返す', () => {
  const a = make([[2000, 1], [2001, 1], [2002, 1]]);
  const b = make([[2000, 1], [2001, 1]]);
  assert.equal(commonLatestYear(a, b), 2001);
  assert.equal(commonLatestYear(a, []), null);
  // 実データ：日本は2025年まで、米国は2024年までしか無い
  assert.equal(commonLatestYear(jp, us), 2024);
});

test('parseAmount: 全角・カンマ・円記号を受け取る', () => {
  assert.equal(parseAmount('１０，０００'), 10000);
  assert.equal(parseAmount('1,000円'), 1000);
  assert.equal(parseAmount(' 5000 '), 5000);
  assert.equal(parseAmount('￥3000'), 3000);
});

test('parseAmount: 読めないもの・0・負は既定値に戻す', () => {
  assert.equal(parseAmount(''), AMOUNT_DEFAULT);
  assert.equal(parseAmount('abc'), AMOUNT_DEFAULT);
  assert.equal(parseAmount('0'), AMOUNT_DEFAULT);
  assert.equal(parseAmount('-500'), AMOUNT_DEFAULT);
  assert.equal(parseAmount(null), AMOUNT_DEFAULT);
});

test('parseAmount: 上限で止める', () => {
  assert.equal(parseAmount('999999999999'), AMOUNT_MAX);
  assert.equal(clampAmount(Infinity), AMOUNT_DEFAULT);
});

test('coinDiameter: 面積が価値に比例する＝直径は平方根に比例する', () => {
  // 4倍の価値なら、直径は2倍
  assert.equal(coinDiameter(400, 400, 100), 100);
  assert.equal(coinDiameter(100, 400, 100), 50);
  assert.equal(coinDiameter(25, 400, 100), 25);
});

test('coinDiameter: 下限を下回らない（画面から消えない）', () => {
  assert.equal(coinDiameter(1, 1000000, 128, 26), 26);
  assert.equal(coinDiameter(0, 1000, 128, 26), 26);
});

test('formatYen: 3桁区切り。数でないものは —', () => {
  assert.equal(formatYen(1234567), '1,234,567');
  assert.equal(formatYen(null), '—');
  assert.equal(formatYen(NaN), '—');
});

test('実データ：1960年の1,000円は、いまの6,000円台にあたる', () => {
  const now = convert(1000, 1960, 2025, jp);
  assert.ok(now > 6000 && now < 6500, `実際は ${now}`);
});

test('実データ：1995年からの日本は米国よりゆっくり上がっている', () => {
  const common = commonLatestYear(jp, us);
  assert.ok(ratio(1995, common, jp) < ratio(1995, common, us));
});
