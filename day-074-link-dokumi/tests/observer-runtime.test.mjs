/* 実行基盤（Cloudflare Workers）のfetchの制約を模した、観測全体の回帰試験（メインの持ち物）。
   Node上の単体テストは、偽のfetchを使うので、Workersが拒否する呼び方を見逃す。
   実例：DoHの `redirect: 'error'` は、Workersでは例外になり、本番で全診断が resolver_unavailable になるところだった。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runTrace, runAround } from '../lib/observe.js';
import { dohQuery } from '../lib/doh.js';
import { fetchRegistration } from '../lib/rdap.js';
import { validateTrace, validateAround } from '../lib/contract.js';

const calls = [];
const html = '<!doctype html><html lang="en"><head><title>Example Domain</title></head><body><h1>Example Domain</h1></body></html>';

/** Workersのfetchが受け付けない呼び方を、例外にする偽のインターネット */
function workersLikeFetch(url, init = {}) {
  calls.push({ url: String(url), init });
  if (init.redirect !== undefined && !['follow', 'manual'].includes(init.redirect)) {
    throw new TypeError('Invalid redirect value, must be one of "follow" or "manual"');
  }
  if (init.method && !['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'].includes(String(init.method).toUpperCase())) throw new TypeError('bad method');
  const u = new URL(url);
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (u.hostname === 'cloudflare-dns.com' || u.hostname === 'dns.google') {
    const name = u.searchParams.get('name'); const type = Number(u.searchParams.get('type')) || ({ A: 1, AAAA: 28, TXT: 16, CAA: 257, MX: 15 })[u.searchParams.get('type')];
    if (name === 'example.com' && type === 1) return json({ Status: 0, AD: true, Answer: [{ name, type: 1, TTL: 60, data: '93.184.216.34' }] });
    if (name === 'example.com' && type === 16) return json({ Status: 0, Answer: [{ name, type: 16, TTL: 60, data: '"v=spf1 -all"' }] });
    if (name === '_dmarc.example.com' && type === 16) return json({ Status: 0, Answer: [{ name, type: 16, TTL: 60, data: '"v=DMARC1; p=reject"' }] });
    return json({ Status: 0, Answer: [] });
  }
  if (u.hostname === 'rdap.verisign.com') return json({ events: [{ eventAction: 'registration', eventDate: '1995-08-14T04:00:00Z' }, { eventAction: 'expiration', eventDate: '2027-08-13T04:00:00Z' }] });
  if (u.hostname === 'example.com') {
    if (u.protocol === 'http:') return new Response(null, { status: 301, headers: { location: 'https://example.com/' } });
    if (u.pathname === '/.well-known/security.txt') return new Response('Contact: mailto:security@example.com\nExpires: 2099-01-01T00:00:00Z\n', { status: 200, headers: { 'content-type': 'text/plain' } });
    return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'strict-transport-security': 'max-age=31536000' } });
  }
  throw new TypeError('internal error; reference = test');
}

test('Workersが拒否する呼び方（redirect:error など）を、どのfetchにも使っていない', async () => {
  calls.length = 0;
  const trace = await runTrace('https://example.com/', { fetchImpl: workersLikeFetch, now: () => Date.now(), selfHosts: ['hundred-days.pages.dev'] });
  assert.equal(trace.ok, true, `診断が失敗した: ${JSON.stringify(trace.error)}`);
  assert.ok(validateTrace(trace).ok, validateTrace(trace).errors.join(' / '));
  assert.equal(trace.final.status, 200);
  assert.equal(trace.html.title, 'Example Domain');
  const around = await runAround({ host: 'example.com', scheme: 'https' }, { fetchImpl: workersLikeFetch, now: () => Date.now(), selfHosts: [] });
  assert.ok(validateAround(around).ok, validateAround(around).errors.join(' / '));
  assert.ok(around.dns.a?.length, `DNSが取れていない: ${JSON.stringify(around.dns)}`);
  assert.equal(around.httpProbe.tested, true);
  assert.equal(around.securityTxt.found, true);
  assert.ok(calls.length >= 6, `呼び出しが少なすぎる: ${calls.length}`);
  for (const call of calls) {
    if (call.init.redirect !== undefined) assert.ok(['follow', 'manual'].includes(call.init.redirect), `${call.url}: redirect=${call.init.redirect}`);
  }
});

test('DoHとRDAPの単体も、Workers相当のfetchで動く', async () => {
  const doh = await dohQuery('example.com', 'A', { fetchImpl: workersLikeFetch });
  assert.equal(doh.ok, true);
  assert.deepEqual(doh.answers.map((a) => a.data), ['93.184.216.34']);
  const rdap = await fetchRegistration('example.com', { fetchImpl: workersLikeFetch, now: () => Date.parse('2026-10-22T00:00:00Z') });
  assert.ok(rdap.registeredAt, JSON.stringify(rdap));
  assert.ok(rdap.ageDays > 10000);
});

test('DoHが3xxを返したら、転送は追わず次の窓口へ回す', async () => {
  const seen = [];
  const fetchImpl = (url, init) => {
    seen.push(String(url));
    if (new URL(url).hostname === 'cloudflare-dns.com') return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } });
    return workersLikeFetch(url, init);
  };
  const doh = await dohQuery('example.com', 'A', { fetchImpl });
  assert.equal(doh.ok, true, 'Googleの窓口に回って成功するはず');
  assert.ok(!seen.some((url) => url.includes('127.0.0.1')), '転送先へ行っている');
});
