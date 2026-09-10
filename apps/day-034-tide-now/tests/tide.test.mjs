import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as t from '../lib/tide.js';
import { curvePoints, smoothPath, curveLabel, curveSvg, scaleFor } from '../lib/curve.js';
const fixture = (name) => readFileSync(new URL(`./fixtures/${name}.txt`, import.meta.url), 'utf8');
const years = new Map([2025, 2026, 2027].flatMap((year) => [...t.parseYear(fixture(`TK-${year}`), 'TK')]));
const now = Date.parse('2026-09-10T15:00:00+09:00');
const day = years.get('2026-09-10');
test('実物3年を解析、空白詰め日時と24個の毎時値', () => {
  assert.equal(years.size, 1095);
  assert.deepEqual(day.highs, [{ time: '03:53', cm: 200 }, { time: '16:57', cm: 201 }]);
  assert.deepEqual(day.lows, [{ time: '10:30', cm: 30 }, { time: '22:53', cm: 81 }]);
  assert.equal(day.hourly.length, 24); assert.equal(day.hourly[15], 166);
  assert.equal(years.get('2026-01-01').highs[0].time, '04:08');
  assert.ok([...years.values()].some((d) => d.hourly.some((cm) => cm < 0)));
});
test('136桁・地点・数値・日付・時刻・重複を検証', () => {
  const line = fixture('TK-2026').split('\n')[0];
  for (const bad of [line.slice(1), line + ' ', 'abc' + line.slice(3), line.slice(0, 74) + '13' + line.slice(76), line.slice(0, 80) + '2460' + line.slice(84)]) assert.throws(() => t.parseLine(bad), t.ShapeError);
  assert.throws(() => t.parseYear(line, 'S1'), t.ShapeError);
  assert.throws(() => t.parseYear(`${line}\n${line}`, 'TK'), t.ShapeError);
  const none = t.parseLine(' -2' + line.slice(3, 80) + '9999999'.repeat(8));
  assert.equal(none.hourly[0], -2); assert.deepEqual(none.highs, []); assert.deepEqual(none.lows, []);
  const missingCm = t.parseLine(line.slice(0, 80) + ' 1 0999' + '9999999'.repeat(7));
  assert.deepEqual(missingCm.highs, []);
});
for (const [wall, kind, sub, remaining] of [
  ['2026-09-10T15:00', 'rising', '次の満潮は 16:57（201cm）', 'あと1時間57分'],
  ['2026-09-10T10:45', 'slack-low', '10:30 が干潮（30cm）', 'このあと満ち潮に'],
  ['2026-09-10T23:30', 'rising', '次の満潮は あす 04:35（209cm）', 'あと5時間5分'],
  ['2026-12-31T23:45', 'falling', '次の干潮は あす 04:21（95cm）', 'あと4時間36分'],
  ['2026-01-01T00:30', 'rising', '次の満潮は 04:08（169cm）', 'あと3時間38分']
]) test(`固定時計 ${wall}`, () => {
  const at = Date.parse(`${wall}:00+09:00`), result = { ...t.eventsAround(years, at), now: at };
  assert.equal(t.stateOf(result), kind); assert.equal(t.answerSub(result), sub); assert.equal(t.remainingText(result), remaining);
  if (wall.startsWith('2026-01')) { assert.equal(result.prev.date, '2025-12-31'); assert.equal(result.prev.time, '20:43'); assert.equal(result.prev.cm, 15); }
});
test('秋田の実物と片方だけの日', () => {
  const days = t.parseYear(fixture('S1-2026'), 'S1'), result = { ...t.eventsAround(days, now), now };
  assert.equal(t.stateOf(result), 'falling'); assert.equal(t.answerSub(result), '次の干潮は 21:20（14cm）');
  assert.equal(t.remainingText(result), 'あと6時間20分');
  assert.equal(t.dailyRange(days.get('2026-09-10')), 27);
  for (const side of ['highs', 'lows']) {
    const found = [...days.values()].find((d) => !d[side].length);
    assert.ok(found); assert.ok(Number.isFinite(t.dailyRange(found)));
  }
});
for (const type of ['high', 'low']) for (const offset of [-31, -30, 0, 30, 31]) test(`${type}の${offset}分境界`, () => {
  const event = { type, at: now, cm: 100 }, at = now + offset * 60000;
  const result = { prev: offset >= 0 ? event : null, next: offset < 0 ? event : null, now: at };
  const expected = Math.abs(offset) <= 30 ? `slack-${type}` : offset < 0 ? (type === 'high' ? 'rising' : 'falling') : (type === 'high' ? 'falling' : 'rising');
  assert.equal(t.stateOf(result), expected);
});
test('同時刻はprev、近い満干を優先、双方なしはunknown', () => {
  const at = Date.parse('2026-09-10T10:30:00+09:00');
  assert.equal(t.eventsAround(years, at).prev.time, '10:30');
  assert.equal(t.stateOf({ prev: { at: now - 20 * 60000, type: 'high' }, next: { at: now + 10 * 60000, type: 'low' }, now }), 'slack-low');
  assert.equal(t.stateOf({ now }), 'unknown');
  const none = { ...day, highs: [], lows: [] };
  assert.deepEqual(t.eventsAround([none], now), { events: [], prev: null, next: null });
  assert.equal(t.dailyRange(none), 168);
});
test('余弦補間は端点・中点を通り、実物15時は165cm', () => {
  const prev = { at: now, cm: 30 }, next = { at: now + 3600000, cm: 200 };
  for (const [offset, expected] of [[0, 30], [1800000, 115], [3600000, 200]]) assert.ok(Math.abs(t.levelNow({ prev, next, now: now + offset }) - expected) < 1e-9);
  assert.equal(Math.round(t.levelNow({ ...t.eventsAround(years, now), now, hourly: day.hourly })), 165);
});
test('隣年欠落は毎時値の線形補間、23時台はあす0時を使う', () => {
  const at = Date.parse('2026-01-01T00:30:00+09:00'), days = t.parseYear(fixture('TK-2026'), 'TK');
  const around = t.eventsAround(days, at), d = days.get('2026-01-01');
  assert.equal(around.prev, null); assert.equal(t.stateOf({ ...around, now: at }), 'rising');
  assert.equal(t.levelNow({ ...around, hourly: d.hourly, now: at }), (d.hourly[0] + d.hourly[1]) / 2);
  assert.equal(t.levelNow({ hourly: [...Array(24).fill(100), 200], now: Date.parse('2026-09-10T23:30:00+09:00') }), 150);
  assert.equal(t.levelNow({ hourly: Array(24).fill(100), now }), 100);
});
test('干満差171・年内順位と同値の中間順位', () => {
  assert.equal(t.dailyRange(day), 171); assert.equal(t.rangeRank(years, day.date), '大きい方');
  const synthetic = [10, 20, 30].map((cm, i) => ({ date: `2026-01-0${i + 1}`, hourly: [0, cm], highs: [], lows: [] }));
  assert.deepEqual(synthetic.map((d) => t.rangeRank(synthetic, d.date)), ['小さい方', 'ふつう', '大きい方']);
  assert.equal(t.rangeRank([day], day.date), 'ふつう');
});
const boundaries = [[0,'大潮'],[36,'中潮'],[72,'小潮'],[108,'長潮'],[120,'若潮'],[132,'中潮'],[168,'大潮'],[216,'中潮'],[252,'小潮'],[288,'長潮'],[300,'若潮'],[312,'中潮'],[348,'大潮']];
for (let i = 0; i < boundaries.length; i++) test(`黄経差の境界 ${boundaries[i][0]}°`, () => {
  const [d, name] = boundaries[i]; assert.equal(t.nameFromElongation(d), name);
  assert.equal(t.nameFromElongation(d + .001), name);
  assert.equal(t.nameFromElongation(d - .001), boundaries[(i + boundaries.length - 1) % boundaries.length][1]);
});
for (const [wall, degrees, name] of [
  ['2026-09-10T15:00',348.51,'大潮'],['2026-09-10T14:00',347.97,'中潮'],['2026-09-18T12:00',81.94,'小潮'],['2026-09-21T12:00',114.69,'長潮'],['2026-09-22T12:00',125.79,'若潮'],['2026-09-25T12:00',160.59,'中潮'],['2026-12-31T23:45',279.78,'小潮'],['2026-01-01T00:30',141.21,'中潮']
]) test(`黄経差の実測 ${wall}`, () => {
  const at = Date.parse(`${wall}:00+09:00`); assert.ok(Math.abs(t.elongation(at) - degrees) < .01); assert.equal(t.tideName(at), name);
});
test('次の満干が無ければ副文はその旨だけ、残り時間は空', () => {
  for (const around of [{}, { prev: { at: now - 7200000, type: 'low', cm: 30, date: '2026-09-10' }, next: null }]) {
    const result = { ...around, now };
    assert.equal(t.answerSub(result), '次の満干が潮位表にありません');
    assert.equal(t.remainingText(result), '');
  }
  assert.equal(t.stateOf({ prev: { at: now - 7200000, type: 'low' }, now }), 'rising');
});
test('潮止まりの残り時間は次に向かう向き', () => {
  const at = now + 10 * 60000;
  assert.equal(t.remainingText({ next: { at, type: 'high', cm: 201, date: '2026-09-10' }, now }), 'このあと引き潮に');
  assert.equal(t.answerSub({ next: { at, type: 'high', cm: 201, date: '2026-09-10' }, now }), '15:10 が満潮（201cm）');
  assert.equal(t.remainingText({ prev: { at: now - 60000, type: 'low', cm: 30, date: '2026-09-10' }, now }), 'このあと満ち潮に');
});
test('投稿文に名前・地点・状態・次の満干・潮名', () => {
  assert.equal(t.postText({ station: { name: '東京' }, ...t.eventsAround(years, now), now }), '『潮、いまどっち？』東京：いま、満ち潮。次の満潮は 16:57・201cm（大潮）');
});
test('カーブは毎時24点・満干点・あす0時、アクセシブルな説明と現在線', () => {
  const tomorrow = years.get('2026-09-11'), points = curvePoints(day, tomorrow);
  assert.equal(points.length, 29); assert.deepEqual(points.find(([m]) => m === 233), [233, 200]);
  assert.deepEqual(points.at(-1), [1440, tomorrow.hourly[0]]);
  assert.match(smoothPath(points), /^M/); assert.match(smoothPath(points), /C/);
  const svg = curveSvg(day, tomorrow, now, 165); assert.ok(!/NaN|Infinity/.test(svg)); assert.match(svg, /now-line/);
  assert.match(svg, /class="now-level-label"[^>]*>165cm</);
  // 単位はいちばん上の目盛りだけに付け、軸の左に単独の「cm」は置かない
  assert.match(svg, /<text x="36" y="[\d.]+" text-anchor="end">200cm<\/text>/);
  assert.match(svg, /<text x="36" y="[\d.]+" text-anchor="end">100<\/text>/);
  assert.ok(!/>cm</.test(svg), '単独の「cm」ラベルは置かない');
  // プロットは y=40〜186 に収め、時刻の軸はその下に離す
  for (const line of svg.matchAll(/y1="([\d.]+)" y2="[\d.]+" class="grid-line"/g)) {
    assert.ok(Number(line[1]) >= 40 && Number(line[1]) <= 186, `目盛り ${line[1]} が枠の外`);
  }
  assert.match(svg, /<text x="[\d.]+" y="228" text-anchor="middle">0時<\/text>/);
  assert.match(curveLabel(day, now, 'いま、満ち潮'), /03:53 200cm、16:57 201cm/);
});
test('縦軸はきりのよい刻みで3〜5本、東京は0・100・200、秋田は10刻み', () => {
  const tokyo = curvePoints(day, years.get('2026-09-11')).map(([, cm]) => cm).concat([165.2489]);
  assert.deepEqual(scaleFor(tokyo).ticks, [0, 100, 200]);
  const akita = t.parseYear(fixture('S1-2026'), 'S1');
  const akitaDay = akita.get('2026-09-10');
  assert.deepEqual(scaleFor(curvePoints(akitaDay, akita.get('2026-09-11')).map(([, cm]) => cm)).ticks, [10, 20, 30, 40]);
  for (const days of [years, akita]) for (const d of days.values()) {
    const { min, max, step, ticks } = scaleFor(curvePoints(d, null).map(([, cm]) => cm));
    assert.ok(ticks.length >= 3 && ticks.length <= 5, `${d.date} の目盛りが ${ticks.length} 本`);
    assert.ok([10, 20, 50, 100, 200, 500].includes(step));
    assert.ok(ticks.every((cm) => cm % step === 0 && cm >= min && cm <= max));
    const values = curvePoints(d, null).map(([, cm]) => cm);
    assert.ok(min <= Math.min(...values) && max >= Math.max(...values));
  }
  assert.deepEqual(scaleFor([0, 600]).ticks, [0, 200, 400, 600]);
  assert.deepEqual(scaleFor([100, 100]).ticks, [100, 110, 120]);
});
test('干潮のラベルは常に点の下、いまの縦線に近いラベルは離す', () => {
  const low = { date: '2026-09-10', hourly: Array(24).fill(100), highs: [], lows: [{ time: '12:00', cm: 100 }] };
  // 下端の干潮でもラベルは点の下（y が点より大きい）。下端を上げたぶんで枠に収まる。
  const at = Date.parse('2026-09-10T12:00:00+09:00');
  const svg = curveSvg({ ...low, hourly: [...Array(12).fill(160), 100, ...Array(11).fill(160)] }, null, at, 100, 656);
  const dot = Number(svg.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="4"/)[2]);
  const label = Number(svg.match(/<text x="([\d.]+)" y="([\d.]+)" text-anchor="middle">12:00</)[2]);
  assert.equal(label - dot, 20, `ラベル ${label} は点 ${dot} の20px下`);
  assert.ok(label < 228, `ラベル ${label} が時刻の軸に重なる`);
  const labelX = Number(svg.match(/<text x="([\d.]+)" y="[\d.]+" text-anchor="middle">12:00</)[1]);
  const nowX = Number(svg.match(/<line x1="([\d.]+)" x2="[\d.]+" y1="34"/)[1]);
  assert.ok(Math.abs(labelX - nowX) >= 36, `ラベル ${labelX} と縦線 ${nowX} が近すぎる`);
});
