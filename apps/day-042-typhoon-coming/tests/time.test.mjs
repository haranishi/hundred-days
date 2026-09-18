/* 時刻。気象庁の validtime は3時間区間の「終わり」なので、区間で書けているかを固定する。
   端末のタイムゾーンが変わっても同じ文になることも見る（TZ を動かして確かめる）。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clockText, currentIndex, dayLabel, intervalShort, intervalText, issueText, jst, jstNow, startsDay, stampText,
} from '../lib/time.js';

test('区間の終わりの時刻を、3時間の区間として書く', () => {
  assert.equal(intervalText('2026-09-21T12:00:00+09:00'), '21日（月）9時〜12時');
  assert.equal(intervalText('2026-09-21T03:00:00+09:00'), '21日（月）0時〜3時');
  assert.equal(intervalText('2026-09-18T18:00:00+09:00'), '18日（金）15時〜18時');
  assert.equal(intervalShort('2026-09-21T12:00:00+09:00'), '21日9時〜12時');
});

test('日をまたぐ区間は、始まりの日で 21時〜24時 と書く', () => {
  assert.equal(intervalText('2026-09-22T00:00:00+09:00'), '21日（月）21時〜24時');
  assert.equal(intervalShort('2026-09-22T00:00:00+09:00'), '21日21時〜24時');
});

test('端末のタイムゾーンが変わっても同じ文になる', () => {
  const original = process.env.TZ;
  const results = [];
  for (const zone of ['UTC', 'America/Los_Angeles', 'Australia/Sydney', 'Asia/Tokyo']) {
    process.env.TZ = zone;
    results.push([intervalText('2026-09-21T12:00:00+09:00'), issueText('2026-09-18T15:00:00+09:00'), dayLabel('2026-09-21T12:00:00+09:00')].join('|'));
  }
  process.env.TZ = original;
  assert.equal(new Set(results).size, 1, results.join(' / '));
});

test('発表時刻の書き方', () => {
  assert.equal(issueText('2026-09-18T15:00:00+09:00'), '9月18日 15時');
  assert.equal(clockText('2026-09-18T18:45:00+09:00'), '18日 18時45分');
  assert.equal(clockText('2026-09-18T18:05:00+09:00'), '18日 18時05分');
  assert.equal(stampText(jstNow(Date.parse('2026-09-18T21:00:00+09:00'))), '9月18日 21時00分');
});

test('読めない時刻は空文字で返し、例外にしない', () => {
  assert.equal(jst('こわれた'), null);
  assert.equal(intervalText(undefined), '');
  assert.equal(issueText(null), '');
  assert.equal(dayLabel(''), '');
});

/* 文字列をそのまま日本時間として読むので、オフセットが変わったら読んではいけない。
   Z（UTC）を素通しすると「18時」と出しながら中身は27時＝9時間ずれた文になる */
test('+09:00 以外のオフセットは読まない（9時間ずれた文を出さない）', () => {
  assert.equal(jst('2026-09-18T18:00:00Z'), null, 'UTC');
  assert.equal(jst('2026-09-18T18:00:00+00:00'), null);
  assert.equal(jst('2026-09-18T18:00:00-05:00'), null);
  assert.equal(jst('2026-09-18T18:00:00'), null, 'オフセットが無い');
  assert.equal(issueText('2026-09-18T15:00:00Z'), '');
  assert.equal(intervalText('2026-09-21T12:00:00Z'), '');
  assert.deepEqual(jst('2026-09-18T18:00:00+09:00'), {
    year: 2026, month: 9, day: 18, hour: 18, minute: 0, at: Date.parse('2026-09-18T18:00:00+09:00'),
  });
});

test('0時始まりの区間だけ、日付の区切りになる', () => {
  assert.equal(startsDay('2026-09-21T03:00:00+09:00'), true);
  assert.equal(startsDay('2026-09-21T06:00:00+09:00'), false);
  assert.equal(startsDay('2026-09-21T00:00:00+09:00'), false);
});

test('「いま」は区間の終わりを含み、始まりは含まない（印は必ず1つ）', () => {
  /* 実データと同じ形（+09:00 付き・3時間おき40本）を組み立てる */
  const validtime = Array.from({ length: 40 }, (_, i) => {
    const at = new Date(Date.parse('2026-09-18T18:00:00+09:00') + i * 3 * 3600_000 + 9 * 3600_000);
    return `${at.toISOString().slice(0, 19)}+09:00`;
  });
  assert.equal(validtime[0], '2026-09-18T18:00:00+09:00');
  assert.equal(validtime[39], '2026-09-23T15:00:00+09:00');
  assert.equal(currentIndex(validtime, Date.parse('2026-09-18T21:00:00+09:00')), 1);
  assert.equal(currentIndex(validtime, Date.parse('2026-09-18T20:59:00+09:00')), 1);
  assert.equal(currentIndex(validtime, Date.parse('2026-09-18T18:00:00+09:00')), 0);
  assert.equal(currentIndex(validtime, Date.parse('2026-09-18T14:00:00+09:00')), -1, '発表より前は印を出さない');
  assert.equal(currentIndex(validtime, Date.parse('2026-09-25T00:00:00+09:00')), -1, '5日より先も印を出さない');
  /* 5日ぶんのどの時刻でも、当たる区間はちょうど1つ */
  for (let minutes = 1; minutes <= 40 * 180; minutes += 37) {
    const now = Date.parse('2026-09-18T15:00:00+09:00') + minutes * 60_000;
    const hits = validtime.filter((_, i) => currentIndex(validtime.slice(i, i + 1), now) === 0);
    assert.equal(hits.length, 1, `${new Date(now).toISOString()} で ${hits.length} 区間`);
  }
});
