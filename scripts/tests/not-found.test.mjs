import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { notFoundHtml } from '../lib/not-found.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const days = ['day-001-focus-timer', 'day-069-nenshu-kabe', 'day-047-cat-lightspeed'];
const html = notFoundHtml({ listUrl: 'https://rairakku.com/100days/', days });
const script = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';

// 案内ページの小さな script を、見えているパスごとに動かして、移動先を調べる
function destination(pathname) {
  const anchor = {};
  const seen = {};
  const context = {
    location: { pathname, replace: (url) => { seen.replaced = url; } },
    document: { getElementById: (id) => (id === 'go' ? anchor : null) },
    setTimeout: (fn) => fn(),
  };
  vm.runInNewContext(script, context);
  return { link: anchor.href, replaced: seen.replaced };
}

test('案内ページは、検索に出さず、外部の読み込みを持たず、一覧へのリンクを持つ', () => {
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<a id="go" href="https:\/\/rairakku\.com\/100days\/">/);
  assert.doesNotMatch(html, /<script[^>]*\ssrc=|<link\b|<img\b|url\(/i);
  assert.ok(script.includes('"day-069-nenshu-kabe"'));
});

test('ルート直下では、一覧（/）か、先頭が実在するDayへ移る', () => {
  assert.deepEqual(destination('/day-999-nope/'), { link: '/', replaced: '/' });
  assert.deepEqual(destination('/day-'), { link: '/', replaced: '/' });
  assert.deepEqual(destination('/day-046-cat-lightspeed-x/'), { link: '/', replaced: '/' });
  assert.equal(destination('/day-069-nenshu-kabe/）で次の点を確かめます。').replaced, '/day-069-nenshu-kabe/');
  assert.equal(destination('/day-001-focus-timer/zzz/yyy').replaced, '/day-001-focus-timer/');
});

test('/100days/ の下では、/100days/ の一覧か、その下のDayへ移る（接頭辞を落とさない）', () => {
  assert.deepEqual(destination('/100days/day-999-nope/'), { link: '/100days/', replaced: '/100days/' });
  assert.equal(destination('/100days/day-069-nenshu-kabe/junk').replaced, '/100days/day-069-nenshu-kabe/');
  assert.equal(destination('/100days/nothing-here').replaced, '/100days/');
  // 実在しないDay名（番号や綴りが違う）は、Dayへ移さず一覧へ
  assert.equal(destination('/100days/day-069-nenshu-kabe-typo/').replaced, '/100days/');
});

test('名前が変わったDayの古いURLは、実在する公開中のDayへ301で移り、輪にならない', () => {
  const lines = readFileSync(join(root, 'static/_redirects'), 'utf8').split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const moves = lines.map((line) => line.split(/\s+/)).filter((parts) => parts[2] === '301');
  assert.ok(moves.length >= 4, `転送が少なすぎる（${moves.length}件）`);
  const sources = new Set(moves.map(([from]) => from.replace(/\/$/, '')));
  for (const [from, to] of moves) {
    const dir = to.replace(/^\/|\/$/g, '');
    assert.ok(existsSync(join(root, dir, 'meta.json')), `${from} の転送先 ${to} が実在しない`);
    assert.equal(JSON.parse(readFileSync(join(root, dir, 'meta.json'), 'utf8')).status, 'published', `${to} が公開中でない`);
    assert.ok(!sources.has(to.replace(/\/$/, '')), `${from} → ${to} が、別の転送の元になっている（輪になりうる）`);
  }
  assert.ok(lines.includes('/google0bc49e21bba788f9.html  /google0bc49e21bba788f9  200'), 'Search Console の確認用の書き換えが消えている');
});
