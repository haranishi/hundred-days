import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet, extractMeta, decodeEntities, attrsOf, charsetOf, decodeHtml, readCapped, MAX_BYTES } from '../../../functions/api/day-035/page.js';

const HTML = `<!DOCTYPE html><html><head>
<title>ページの題&amp;名</title>
<meta property="og:title" content="能登の被災地でいま起きていること｜NHKニュース">
<meta property="og:description" content='現地からの報告。取材班がまとめた。'>
<meta property="og:image" content="/assets/photo.jpg">
<meta property="og:site_name" content="NHKニュース">
<meta property="article:published_time" content="2026-09-11T09:00:00+09:00">
<link rel="canonical" href="https://www3.nhk.or.jp/news/article">
</head><body>本文はここにあるが取らない</body></html>`;

const request = (url) => ({ request: { url }, waitUntil: () => {} });
const ok = (body, headers = { 'content-type': 'text/html; charset=utf-8' }) => new Response(body, { status: 200, headers });

test('extractMeta: og を拾い、画像は絶対URLにする', () => {
  const meta = extractMeta(HTML, 'https://www3.nhk.or.jp/news/');
  assert.equal(meta.title, '能登の被災地でいま起きていること｜NHKニュース');
  assert.equal(meta.lead, '現地からの報告。取材班がまとめた。');
  assert.equal(meta.image, 'https://www3.nhk.or.jp/assets/photo.jpg');
  assert.equal(meta.site, 'NHKニュース');
  assert.equal(meta.canonical, 'https://www3.nhk.or.jp/news/article');
  assert.equal(meta.publishedAt, '2026-09-11T09:00:00+09:00');
});

test('extractMeta: og:title が無ければ title タグを使う', () => {
  const meta = extractMeta('<html><head><title>ページの題&amp;名</title></head></html>', 'https://example.com/');
  assert.equal(meta.title, 'ページの題&名');
});

test('extractMeta: 何も無ければ null', () => {
  const meta = extractMeta('<html><body>空</body></html>', 'https://example.com/');
  assert.equal(meta.title, null);
  assert.equal(meta.lead, null);
  assert.equal(meta.image, null);
});

test('extractMeta: javascript: の画像は拾わない', () => {
  const meta = extractMeta('<meta property="og:image" content="javascript:alert(1)">', 'https://example.com/');
  assert.equal(meta.image, null);
});

test('extractMeta: twitter: の値にも落ちる', () => {
  const meta = extractMeta('<meta name="twitter:title" content="Xの題"><meta name="twitter:image" content="https://example.com/x.png">', 'https://example.com/');
  assert.equal(meta.title, 'Xの題');
  assert.equal(meta.image, 'https://example.com/x.png');
});

test('attrsOf: 引用符の有無と種類を問わない', () => {
  assert.deepEqual(attrsOf('<meta property="og:title" content=\'値\' data-x=plain>'), {
    property: 'og:title', content: '値', 'data-x': 'plain'
  });
});

test('decodeEntities: 名前つきと番号の両方', () => {
  assert.equal(decodeEntities('A&amp;B &#39;q&#39; &#x3042; &unknown;'), "A&B 'q' あ &unknown;");
});

test('charsetOf: ヘッダを優先し、無ければ meta を見る', () => {
  assert.equal(charsetOf('text/html; charset=Shift_JIS'), 'shift_jis');
  assert.equal(charsetOf('text/html', '<meta charset="euc-jp">'), 'euc-jp');
  assert.equal(charsetOf('text/html', '<html>'), 'utf-8');
});

test('decodeHtml: UTF-8以外も読む', () => {
  const sjis = new Uint8Array([0x93, 0xfa, 0x96, 0x7b]); // 「日本」の Shift_JIS
  assert.equal(decodeHtml(sjis, 'text/html; charset=Shift_JIS'), '日本');
});

test('decodeHtml: 知らない文字コードは null', () => {
  assert.equal(decodeHtml(new Uint8Array([65]), 'text/html; charset=nonexistent-encoding'), null);
});

test('readCapped: 上限で打ち切る', async () => {
  const body = 'あ'.repeat(200_000);
  const bytes = await readCapped(new Response(body), 1024);
  assert.ok(bytes.length <= 1024);
  assert.ok(MAX_BYTES > 1024);
});

test('onRequestGet: 取れたら200で返す', async () => {
  const response = await onRequestGet(request('https://host/api/day-035/page?url=https%3A%2F%2Fwww3.nhk.or.jp%2Fnews%2F'), {
    fetchImpl: async () => ok(HTML)
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.host, 'nhk.or.jp');
  assert.equal(body.site, 'NHKニュース');
});

test('onRequestGet: URLが無い・危ないときは400', async () => {
  for (const query of ['', '?url=http://127.0.0.1/', '?url=javascript:alert(1)']) {
    const response = await onRequestGet(request(`https://host/api/day-035/page${query}`), { fetchImpl: async () => ok(HTML) });
    assert.equal(response.status, 400, query);
  }
});

test('onRequestGet: HTMLでなければ415', async () => {
  const response = await onRequestGet(request('https://host/api/day-035/page?url=https%3A%2F%2Fexample.com%2Fa.pdf'), {
    fetchImpl: async () => ok('%PDF', { 'content-type': 'application/pdf' })
  });
  assert.equal(response.status, 415);
});

test('onRequestGet: 見出しが無ければ422', async () => {
  const response = await onRequestGet(request('https://host/api/day-035/page?url=https%3A%2F%2Fexample.com%2F'), {
    fetchImpl: async () => ok('<html><body>空</body></html>')
  });
  assert.equal(response.status, 422);
  assert.equal((await response.json()).error, 'no_meta');
});

test('onRequestGet: 上流が落ちていたら502', async () => {
  const response = await onRequestGet(request('https://host/api/day-035/page?url=https%3A%2F%2Fexample.com%2F'), {
    fetchImpl: async () => new Response('no', { status: 500 })
  });
  assert.equal(response.status, 502);
});

test('onRequestGet: 時間切れは504', async () => {
  const response = await onRequestGet(request('https://host/api/day-035/page?url=https%3A%2F%2Fexample.com%2F'), {
    fetchImpl: async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error; }
  });
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error, 'timeout');
});

test('onRequestGet: 内部へ飛ばすリダイレクトは追わない', async () => {
  const response = await onRequestGet(request('https://host/api/day-035/page?url=https%3A%2F%2Fexample.com%2F'), {
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } })
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, 'blocked_redirect');
});
