import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  challengeHash, parseChallenge, formatDuration, resultShareText, appShareText, xIntentUrl, lineIntentUrl,
} from '../lib/share.js';

test('share：果たし状の hash を作って読み戻す', () => {
  assert.equal(challengeHash({ level: 2, seed: 'abc123' }), '#c-2-abc123');
  assert.equal(challengeHash({ level: 3, seed: 'k9x2q7', seconds: 192 }), '#c-3-k9x2q7-192');
  assert.equal(challengeHash({ level: 1, seed: 'abcd', seconds: 0 }), '#c-1-abcd'); // 秒が範囲外なら付けない
  assert.equal(challengeHash({ level: 1, seed: 'abcd', seconds: 86400 }), '#c-1-abcd');
  for (const args of [{ level: 1, seed: 'ABC123' }, { level: 1, seed: 'abc' }, { level: 4, seed: 'abc123' }, { level: 1, seed: 'ab-c12' }]) {
    assert.equal(challengeHash(args), null, JSON.stringify(args));
  }
  for (const [level, seed, seconds] of [[1, 'abcd', null], [2, 'z0z0z0z0', 1], [3, '0123456789ab', 86399]]) {
    const hash = challengeHash({ level, seed, seconds });
    assert.match(hash, /^#[0-9a-z-]+$/); // 英数字と - だけ
    assert.deepEqual(parseChallenge(hash), { level, seed, seconds });
  }
  assert.deepEqual(parseChallenge('c-2-abc123-45'), { level: 2, seed: 'abc123', seconds: 45 }); // # が無くても読む
});

test('share：不正な hash は null', () => {
  const bad = [
    '', '#', '#c-', '#c-1', '#c-0-abc123', '#c-4-abc123', '#c-1-ABC123', '#c-1-abc', '#c-1-abcdefghijklm',
    '#c-1-abc123-0', '#c-1-abc123-86400', '#c-1-abc123-012', '#c-1-abc123-12-3', '#c-1-abc_123', '#x-1-abc123',
    '#c-1-abc123-', '#c-01-abc123', ' #c-1-abc123',
  ];
  for (const h of bad) assert.equal(parseChallenge(h), null, h);
  assert.equal(parseChallenge(null), null);
  assert.equal(parseChallenge(12), null);
});

test('share：formatDuration', () => {
  const cases = [[192, '3分12秒'], [45, '45秒'], [0, '0秒'], [60, '1分0秒'], [59.9, '59秒'], [3723, '1時間2分3秒'], [-5, '0秒']];
  for (const [sec, want] of cases) assert.equal(formatDuration(sec), want, String(sec));
});

test('share（v2）：共有の文に埋める字の数が入る（docs/COPY.md「共有の文」の v2 行）', () => {
  assert.equal(
    resultShareText({ levelId: 2, seconds: 192, blanks: 7 }),
    '『ことば辻』一人前（埋める字7）を3分12秒で解いたでござる。そなたに解けるか？',
  );
  // blanks を渡さなければ腕前の埋める字
  assert.equal(resultShareText({ levelId: 1, seconds: 12 }), '『ことば辻』手習い（埋める字1）を12秒で解いたでござる。そなたに解けるか？');
  assert.equal(resultShareText({ levelId: 3, seconds: 400 }), '『ことば辻』免許皆伝（埋める字15）を6分40秒で解いたでござる。そなたに解けるか？');
  assert.equal(
    resultShareText({ levelId: 3, seconds: 50, blanks: 15, gaveUp: true }),
    '『ことば辻』免許皆伝の問に挑んだが、無念の降参。そなたの腕で仇を討ってくれぬか？',
  );
  assert.equal(appShareText(), '江戸のクロスワード『ことば辻』。空いた辻に一字を入れる、腕試しでござる。');
});

test('share：投稿画面の URL', () => {

  const x = new URL(xIntentUrl('辻 で腕試し', 'https://example.com/#c-1-abcd'));
  assert.equal(x.origin + x.pathname, 'https://x.com/intent/post');
  assert.equal(x.searchParams.get('text'), '辻 で腕試し');
  assert.equal(x.searchParams.get('url'), 'https://example.com/#c-1-abcd');
  assert.ok(!x.search.includes('+'));
  const line = new URL(lineIntentUrl('https://example.com/#c-1-abcd'));
  assert.equal(line.origin + line.pathname, 'https://social-plugins.line.me/lineit/share');
  assert.equal(line.searchParams.get('url'), 'https://example.com/#c-1-abcd');
});
