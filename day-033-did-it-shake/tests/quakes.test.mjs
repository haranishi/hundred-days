import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupEvents, answer, todayCount, strip, lastAtYourTown, recentList, townText, postText, townIntensity, maxIntensity, intensityLabel } from '../lib/quakes.js';
const fixture = JSON.parse(readFileSync(new URL('./fixtures/jma-list-2026-09-08.json', import.meta.url)));
const { places } = JSON.parse(readFileSync(new URL('../data/places.json', import.meta.url)));
const at = (value) => Date.parse(`${value}:00+09:00`);
const place = (code) => places.find((item) => item.c === code);
const resultAt = (wall, code) => {
  const now = at(wall), events = groupEvents(fixture, now);
  return { now, events, result: answer({ events, now, place: place(code), places }) };
};
const row = (patch = {}) => ({ eid: 'one', ttl: '震源・震度情報', ift: '発表', rdt: '2026-09-08T23:43:00+09:00', at: '2026-09-08T23:40:00+09:00', maxi: '1', mag: '2.6', anm: '熊本県天草・芦北地方', int: [{ code: '43', maxi: '1', city: [{ code: '4321200', maxi: '1' }] }], ...patch });

test('実データは365件。場所なしでも10分前の答えときょう7回', () => {
  assert.equal(fixture.length, 365);
  const { result, now, events } = resultAt('2026-09-08T23:50');
  assert.equal(result.kind, 'recent');
  assert.equal(result.heading, '10分前、地震がありました');
  assert.match(result.sub, /熊本県天草・芦北地方 M2.6・最大震度1/);
  assert.deepEqual(result.subParts, ['熊本県天草・芦北地方', ' M2.6・', '最大震度1']);
  assert.equal(todayCount(events, now), 7);
});
test('上天草市は震度1', () => {
  const { result } = resultAt('2026-09-08T23:50', '43212');
  assert.equal(result.kind, 'shook'); assert.equal(result.heading, '揺れました');
  assert.equal(result.intensity, '1'); assert.match(result.sub, /10分前（23:40）に発生。震源 熊本県天草・芦北地方 M2.6・最大震度1/);
});
test('秋田市では観測なし。最後は8月27日04:21、震度1', () => {
  const { result, events } = resultAt('2026-09-08T23:50', '05201');
  assert.equal(result.kind, 'elsewhere'); assert.equal(result.heading, 'あなたの街では、観測されていません');
  const last = lastAtYourTown(events, place('05201'), places);
  assert.equal(last.event.at, at('2026-08-27T04:21')); assert.equal(last.intensity, '1');
  assert.match(townText(last), /8月27日 04:21（震度1・三陸沖 M6.1）/);
});
test('20時には未来の発表を除き、最後は3時間前の宮城県沖', () => {
  const { result, events } = resultAt('2026-09-08T20:00', '05201');
  assert.equal(result.kind, 'none'); assert.equal(result.heading, '15分以内の発表はありません');
  assert.match(result.sub, /発表は揺れてから1〜5分/);
  assert.match(result.note, /最後の地震：3時間前 宮城県沖 M3.6/);
  assert.deepEqual(result.headingParts, ['15分以内の', '発表はありません']);
  assert.equal(events[0].at, at('2026-09-08T16:19'));
});
test('02:05の水戸市は第一報。県の震度だけを返す', () => {
  const { result } = resultAt('2026-08-23T02:05', '08201');
  assert.equal(result.kind, 'shook-pref'); assert.equal(result.heading, '揺れました（第一報）');
  assert.match(result.sub, /茨城県.*震度5弱以上/); assert.match(result.sub, /市区町村ごとの発表を待っています/);
  assert.equal(result.intensity, null); assert.equal(result.event.provisional, true);
});
test('02:07の水戸市は震度4、最大震度5弱', () => {
  const { result } = resultAt('2026-08-23T02:07', '08201');
  assert.equal(result.kind, 'shook'); assert.equal(result.intensity, '4');
  assert.match(result.sub, /7分前（02:00）に発生/); assert.match(result.sub, /茨城県南部 M5.9・最大震度5弱/);
});
test('02:07の秋田市は市区町村の観測に無い', () => {
  assert.equal(resultAt('2026-08-23T02:07', '05201').result.kind, 'elsewhere');
});
test('同じeidは1件。詳細は第一報より優先し、詳細同士は最新を使う', () => {
  const rows = [row(), row({ rdt: '2026-09-08T23:44:00+09:00', maxi: '2' }), row({ ttl: '震度速報', rdt: '2026-09-08T23:45:00+09:00', maxi: '3', mag: '' })];
  const events = groupEvents(rows.reverse(), at('2026-09-08T23:50'));
  assert.equal(events.length, 1); assert.equal(events[0].maxi, '2'); assert.equal(events[0].provisional, false);
});
test('取消が1件でもあれば除く。ただし未来の取消はまだ効かない', () => {
  const rows = [row(), row({ ift: '取消', rdt: '2026-09-08T23:49:00+09:00' })];
  assert.equal(groupEvents(rows, at('2026-09-08T23:50')).length, 0);
  assert.equal(groupEvents(rows, at('2026-09-08T23:48')).length, 1);
});
test('国外・解説・更新・震源だけ・震度0を数えない', () => {
  const titles = ['遠地地震に関する情報', '南海トラフ地震関連解説情報', '顕著な地震の震源要素更新のお知らせ', '震源に関する情報'];
  assert.deepEqual(groupEvents(titles.map((ttl, i) => row({ ttl, eid: String(i) })).concat(row({ maxi: '0' })), at('2026-09-08T23:50')), []);
});
test('第一報の最新を使い、震源・Mは震源情報から補完する', () => {
  const rows = [row({ ttl: '震度速報', mag: '', anm: '', maxi: '3' }), row({ ttl: '震度速報', mag: '', anm: '', maxi: '4', rdt: '2026-09-08T23:44:00+09:00' }), row({ ttl: '震源に関する情報', mag: '5.2', anm: '補完した震源', rdt: '2026-09-08T23:45:00+09:00' })];
  const events = groupEvents(rows, at('2026-09-08T23:50'));
  assert.equal(events[0].maxi, '4'); assert.equal(events[0].mag, '5.2'); assert.equal(events[0].anm, '補完した震源');
  const result = answer({ events, now: at('2026-09-08T23:50'), place: place('05201'), places });
  assert.equal(result.kind, 'elsewhere'); assert.match(result.sub, /震度4以上の揺れを観測（第一報）/);
  assert.match(answer({ events, now: at('2026-09-08T23:50') }).sub, /第一報/);
});
test('15分ちょうどまで含め、1ms後は含めない。1分未満はいま', () => {
  const now = at('2026-09-08T23:55'), events = groupEvents([row()], now);
  assert.equal(answer({ events, now }).kind, 'recent');
  assert.equal(answer({ events, now: now + 1 }).kind, 'none');
  const early = groupEvents([row({ rdt: row().at })], at('2026-09-08T23:40'));
  assert.equal(answer({ events: early, now: at('2026-09-08T23:40') }).heading, 'いま、地震がありました');
});
test('複数あれば発生時刻が最新の1件とほかの件数', () => {
  const events = groupEvents([row(), row({ eid: 'two', at: '2026-09-08T23:42:00+09:00' })], at('2026-09-08T23:50'));
  const result = answer({ events, now: at('2026-09-08T23:50') });
  assert.equal(result.event.eid, 'two'); assert.equal(result.note, 'ほかに1件');
});
test('日本時間の日付をまたぐ回数と24コマ。右端はいまの時間帯', () => {
  const now = at('2026-09-09T00:05');
  const events = groupEvents([row(), row({ eid: 'two', at: '2026-09-09T00:00:00+09:00', rdt: '2026-09-09T00:03:00+09:00', maxi: '5-' })], now);
  assert.equal(todayCount(events, now), 1);
  const cells = strip(events, now);
  assert.equal(cells.length, 24); assert.equal(cells[0].hourStart, at('2026-09-08T01:00'));
  assert.deepEqual(cells.at(-1), { hourStart: at('2026-09-09T00:00'), count: 1, maxi: '5-' });
  assert.equal(cells.at(-2).count, 1); assert.equal(cells[0].maxi, null);
});
test('実データの帯は7回、21時台は震度2。最古は8月10日', () => {
  const { events, now } = resultAt('2026-09-08T23:50'); const cells = strip(events, now);
  assert.equal(cells.reduce((sum, cell) => sum + cell.count, 0), 7);
  assert.equal(cells.find((cell) => cell.hourStart === at('2026-09-08T21:00')).maxi, '2');
  const last = lastAtYourTown(events, { c: '99999' }, places);
  assert.equal(last.event, null); assert.equal(last.oldestAt, at('2026-08-10T00:48'));
  assert.equal(townText(last), '8月10日以降、震度1以上は観測されていません');
});
test('帯の左端は含み、左端より前は含まない。同じコマの最大は震度順', () => {
  const now = at('2026-09-09T00:05'), from = at('2026-09-08T01:00');
  const cells = strip([{ at: from - 1, maxi: '7' }, { at: from, maxi: '5+' }, { at: from + 1, maxi: '6-' }], now);
  assert.deepEqual(cells[0], { hourStart: from, count: 2, maxi: '6-' });
});
test('政令市の複数の区は、その市で最大の震度を返す', () => {
  const event = { provisional: false, int: [{ city: [{ code: '4310300', maxi: '1' }, { code: '4310400', maxi: '4' }] }] };
  assert.equal(townIntensity(event, place('43100'), places), '4');
});
test('答えに出ている地震は「最後に揺れた」から外し、その前の記録を出す', () => {
  const { result, events } = resultAt('2026-08-23T02:07', '08201');
  const last = lastAtYourTown(events, place('08201'), places, { skipEid: result.event.eid });
  assert.notEqual(last.event?.eid, result.event.eid);
  assert.match(townText(last), /^その前にあなたの街で揺れたのは /);
  const none = lastAtYourTown([events.find((event) => event.eid === result.event.eid)], place('08201'), places, { skipEid: result.event.eid });
  assert.equal(none.event, null); assert.match(townText(none), /以降では、この地震が最初の観測です$/);
});
test('直近は新しい順に10件、空でも答えを返す', () => {
  const { events } = resultAt('2026-09-08T23:50');
  const rows = recentList([...events].reverse()); assert.equal(rows.length, 10);
  assert.ok(rows.every((event, i) => !i || rows[i - 1].at >= event.at));
  assert.equal(answer({ events: [], now: Date.now() }).kind, 'none');
  assert.deepEqual(lastAtYourTown([], place('05201')), { event: null, intensity: null, oldestAt: null, before: false });
});
test('震度の順と表記、投稿文の回数と答え', () => {
  assert.equal(maxIntensity(['5+', '6-', '5-']), '6-');
  assert.deepEqual(['5-', '5+', '6-', '6+'].map(intensityLabel), ['5弱', '5強', '6弱', '6強']);
  const { result } = resultAt('2026-09-08T23:50', '43212');
  assert.equal(postText({ count: 7, result }), '『揺れた？』きょう日本で震度1以上の地震は7回。揺れました。あなたの街は震度1');
});
test('地点一覧を省いても、上天草市の観測を熊本市の観測にしない', () => {
  const now = at('2026-09-08T23:50'), events = groupEvents([row()], now);
  assert.equal(answer({ events, now, place: place('43100') }).kind, 'elsewhere');
  assert.equal(answer({ events, now, place: place('43212') }).kind, 'shook');
});
