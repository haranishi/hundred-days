/* メインが実在サイトの点検で見つけた観測側の不具合の回帰試験（メインの持ち物） */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runAround } from '../lib/observe.js';
import { validateAround } from '../lib/contract.js';

const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
function fakeNet(httpLocation) {
  return async (url) => {
    const u = new URL(url);
    if (u.hostname === 'cloudflare-dns.com' || u.hostname === 'dns.google') {
      const type = Number(u.searchParams.get('type')) || ({ A: 1, AAAA: 28, TXT: 16, CAA: 257, MX: 15 })[u.searchParams.get('type')];
      return type === 1 ? json({ Status: 0, Answer: [{ name: u.searchParams.get('name'), type: 1, TTL: 60, data: '93.184.216.34' }] }) : json({ Status: 0, Answer: [] });
    }
    if (u.hostname.includes('rdap')) return json({ events: [{ eventAction: 'registration', eventDate: '2001-01-01T00:00:00Z' }] });
    if (u.protocol === 'http:' && u.pathname === '/') return new Response(null, { status: 301, headers: { location: httpLocation } });
    return new Response('', { status: 404 });
  };
}

test('http→https の転送は、同じ登録ドメインの中（apex→www）でも「HTTPSへ転送する」と数える', async () => {
  const around = await runAround({ host: 'example.com', scheme: 'https' }, { fetchImpl: fakeNet('https://www.example.com/'), now: () => Date.now(), selfHosts: [] });
  assert.ok(validateAround(around).ok, validateAround(around).errors.join(' / '));
  assert.equal(around.httpProbe.upgradesToHttps, true);
});

test('別の登録ドメインのHTTPSへの転送は、数えない', async () => {
  const around = await runAround({ host: 'example.com', scheme: 'https' }, { fetchImpl: fakeNet('https://example.net/'), now: () => Date.now(), selfHosts: [] });
  assert.equal(around.httpProbe.upgradesToHttps, false);
});

test('HTTPのままの転送は、数えない', async () => {
  const around = await runAround({ host: 'example.com', scheme: 'https' }, { fetchImpl: fakeNet('http://www.example.com/'), now: () => Date.now(), selfHosts: [] });
  assert.equal(around.httpProbe.upgradesToHttps, false);
});

/* 2回目のセキュリティレビュー（N1・N3・N4）の回帰試験 */
import { registrableDomain } from '../lib/psl.js';
import { clip } from '../lib/sanitize.js';
import { extractHtmlFacts } from '../lib/html-facts.js';
import { handleAround } from '../lib/handlers.js';

test('N1: ラベルが数千ある長大なホスト名でも、登録ドメインの計算は一定時間で終わる', () => {
  const started = performance.now();
  for (const count of [512, 2048, 4096]) {
    const result = registrableDomain(`${'a.'.repeat(count)}com`);
    assert.equal(result.isPublicSuffix, false);
  }
  // 以前は4096ラベルだけで約176ms（ラベル数の二乗）。上限をかけた今は、3つ合わせても数msに収まる
  assert.ok(performance.now() - started < 25, `${(performance.now() - started).toFixed(1)}ms`);
  // 規則の最大ラベル数より多い名前でも、末尾の規則は正しく引ける
  assert.equal(registrableDomain(`${'x.'.repeat(60)}www.city.kawasaki.jp`).registrable, 'city.kawasaki.jp');
  assert.equal(registrableDomain(`${'x.'.repeat(60)}user.github.io`).registrable, 'user.github.io');
});

test('N1: Locationが長大なホスト名でも、aroundは例外なく契約どおりに返り、HTTPSへの転送とは数えない', async () => {
  const location = `https://${'a.'.repeat(4096)}com/`;
  const around = await runAround({ host: 'example.com', scheme: 'https' }, { fetchImpl: fakeNet(location), now: () => Date.now(), selfHosts: [] });
  assert.ok(validateAround(around).ok, validateAround(around).errors.join(' / '));
  assert.equal(around.httpProbe.upgradesToHttps, false);
});

test('N3: C1制御（U+0085など）とUnicodeの行・段落区切りは、取得した文字列に残さない', () => {
  assert.equal(clip('a\u2028b\u2029c\u0085d\u009fe\u007ff', 50), 'a b cdef');
  assert.equal(clip('x‮y‏z', 50), 'xyz');
  const facts = extractHtmlFacts('<title>Invoice\u2028合格\u0085FAKE</title><h1>H\u2029one</h1>', 'https://attacker.example/');
  assert.equal(facts.title, 'Invoice 合格FAKE');
  assert.equal(facts.h1, 'H one');
});

test('N4: 診断先に断られたあと（skipSite）は、診断先へのhttp側・security.txtを取りに行かず、DNSと登録日だけ続ける', async () => {
  const seen = [];
  const net = fakeNet('https://www.example.com/');
  const fetchImpl = async (url, init) => { seen.push(new URL(url).hostname + new URL(url).pathname); return net(url, init); };
  const around = await runAround({ host: 'example.com', scheme: 'https' }, { fetchImpl, now: () => Date.now(), selfHosts: [], skipSite: true });
  assert.ok(validateAround(around).ok, validateAround(around).errors.join(' / '));
  assert.deepEqual(around.httpProbe, { tested: false, reason: 'skipped' });
  assert.deepEqual(around.securityTxt, { unavailable: 'skipped' });
  assert.ok(!seen.some((entry) => entry === 'example.com/' || entry.includes('security.txt')), seen.join(' , '));
  assert.ok(seen.some((entry) => entry.includes('rdap') || entry.includes('dns')), 'DNSと登録日の問い合わせは続ける');
  assert.equal('unavailable' in around.rdap, false, '登録日は取れている');
  // HTTPで入力されたときも、HTTPS側への確認を省く
  const http = await runAround({ host: 'example.com', scheme: 'http' }, { fetchImpl, now: () => Date.now(), selfHosts: [], skipSite: true });
  assert.deepEqual(http.httpsProbe, { tested: false });
});

test('N4: around の入口は site=0 のときだけ省略する（ほかの値・欠落は通常どおり）', async () => {
  for (const [value, expectSkipped] of [['0', true], ['1', false], ['', false], [undefined, false]]) {
    const seen = [];
    const net = fakeNet('https://www.example.com/');
    const ctx = { env: {}, fetchImpl: async (url, init) => { seen.push(new URL(url).hostname + new URL(url).pathname); return net(url, init); }, resolve: async () => ({ ok: true, addresses: ['93.184.216.34'], ad: false }) };
    const url = new URL('https://app.example/api/day-074/around');
    url.searchParams.set('host', 'example.com'); url.searchParams.set('scheme', 'https');
    if (value !== undefined) url.searchParams.set('site', value);
    const response = await handleAround(new Request(url, { headers: { 'cf-connecting-ip': '8.8.4.4' } }), ctx);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.httpProbe.tested === false && body.httpProbe.reason === 'skipped', expectSkipped, `site=${value}`);
    assert.equal(seen.some((entry) => entry.includes('security.txt')), !expectSkipped, `site=${value}`);
  }
});
