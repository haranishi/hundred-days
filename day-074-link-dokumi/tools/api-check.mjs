#!/usr/bin/env node
/* 観測API（/api/day-074/trace・around）を、実在の無害な試験サイトと、拒否されるべき宛先で確かめる。
   ローカル（wrangler pages dev＝workerd）と本番の両方で同じ期待値を使う。配信しない（tools/はビルドに入らない）。

   使い方：
     node day-074-link-dokumi/tools/api-check.mjs --base http://127.0.0.1:8799
     node day-074-link-dokumi/tools/api-check.mjs --base https://hundred-days.pages.dev --ratelimit
   試験先は example.com・github.com・httpforever.com・badssl.com（TLS試験のために作られた公開サイト）・nip.io（任意のIPを返す公開DNS）など、
   単発のGETを受けても迷惑にならないもの。診断の頻度は1分12回の制限に合わせて自分で間隔を空ける。 */

import { validateTrace, validateAround, LIMITS } from '../lib/contract.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
};
const base = (opt('--base', 'http://127.0.0.1:8799') || '').replace(/\/$/, '');
const only = (opt('--only', '') || '').split(',').filter(Boolean);
const withRate = args.includes('--ratelimit');
const fast = args.includes('--no-pace'); // 制限を上げたローカル用
const verbose = args.includes('--verbose');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stamps = { trace: [], around: [] };

async function pace(scope) {
  if (fast) return;
  const limit = LIMITS.RATE_PER_MINUTE - 2; // 余裕を見る
  for (;;) {
    const now = Date.now();
    stamps[scope] = stamps[scope].filter((at) => now - at < 62_000);
    if (stamps[scope].length < limit) break;
    await sleep(Math.max(500, 62_000 - (now - stamps[scope][0])));
  }
  stamps[scope].push(Date.now());
}

async function call(scope, query, init = {}) {
  await pace(scope);
  const url = `${base}/api/day-074/${scope}?${query}`;
  const started = Date.now();
  const response = await fetch(url, { redirect: 'manual', ...init });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 本文がJSONでない */ }
  return { status: response.status, headers: response.headers, text, json, ms: Date.now() - started };
}
const trace = (target, init) => call('trace', `url=${encodeURIComponent(target)}`, init);
const around = (host, scheme = 'https', init) => call('around', `host=${encodeURIComponent(host)}&scheme=${scheme}`, init);

const failIf = (list, condition, message) => { if (condition) list.push(message); };
const expectTrace = (r, list) => {
  failIf(list, r.status !== 200, `HTTP ${r.status}`);
  if (!r.json) return failIf(list, true, '本文がJSONでない');
  const check = validateTrace(r.json);
  failIf(list, !check.ok, `契約に合わない: ${check.errors.slice(0, 2).join(' / ')}`);
  failIf(list, /set-cookie/i.test(r.text), 'set-cookieの文字がJSONに入っている');
  failIf(list, r.text.length > LIMITS.MAX_RESPONSE_BYTES, `応答が大きすぎる(${r.text.length})`);
  failIf(list, (r.headers.get('content-type') || '').indexOf('application/json') < 0, 'content-typeがJSONでない');
  failIf(list, r.headers.get('x-content-type-options') !== 'nosniff', 'nosniffがない');
  failIf(list, !!r.headers.get('access-control-allow-origin'), 'CORSヘッダーが付いている');
};
const blocked = (r, list, codes = ['blocked_target', 'invalid_url']) => {
  expectTrace(r, list);
  failIf(list, r.json?.ok !== false, 'ok:falseでない（接続した可能性）');
  failIf(list, !codes.includes(r.json?.error?.code), `error.code=${r.json?.error?.code}（${codes.join('|')}のはず）`);
  failIf(list, r.json?.final != null, 'finalがある（接続した）');
};

const FAST = 400; // この時間未満で返る＝接続に行っていない目安（ms）
const cases = [
  { id: 'example', note: '最小の健全なHTTPSサイト', run: async (l) => {
    const r = await trace('https://example.com/'); expectTrace(r, l);
    failIf(l, r.json?.ok !== true, `ok=${r.json?.ok} error=${r.json?.error?.code}`);
    failIf(l, r.json?.final?.status !== 200, `status=${r.json?.final?.status}`);
    failIf(l, !/example domain/i.test(r.json?.html?.title || ''), `title=${r.json?.html?.title}`);
    return r; } },
  { id: 'github', note: 'HSTS・Cookieあり。Cookieの値を返さない', run: async (l) => {
    const r = await trace('https://github.com/'); expectTrace(r, l);
    failIf(l, r.json?.ok !== true, `ok=${r.json?.ok} error=${r.json?.error?.code}`);
    failIf(l, !r.json?.final?.headers?.['strict-transport-security'], 'HSTSが取れていない');
    failIf(l, !(r.json?.final?.cookies || []).length, 'Cookieの名前が取れていない');
    failIf(l, /_gh_sess=|logged_in=/.test(r.text), 'Cookieの「名前=値」が応答に入っている');
    return r; } },
  { id: 'http-only', note: 'HTTPだけのサイト（試験用）', run: async (l) => {
    const r = await trace('http://httpforever.com/'); expectTrace(r, l);
    failIf(l, r.json?.ok !== true, `ok=${r.json?.ok} error=${r.json?.error?.code}`);
    failIf(l, r.json?.final?.scheme !== 'http', `scheme=${r.json?.final?.scheme}`);
    return r; } },
  { id: 'tls-expired', note: '証明書の期限切れ（badssl）', run: async (l) => {
    const r = await trace('https://expired.badssl.com/'); expectTrace(r, l);
    failIf(l, r.json?.ok !== false, 'ok:falseでない');
    failIf(l, !['tls_failed', 'connect_failed'].includes(r.json?.error?.code), `code=${r.json?.error?.code}`);
    return r; } },
  { id: 'tls-selfsigned', note: '自己署名（badssl）', run: async (l) => {
    const r = await trace('https://self-signed.badssl.com/'); expectTrace(r, l);
    failIf(l, r.json?.ok !== false, 'ok:falseでない');
    failIf(l, !['tls_failed', 'connect_failed'].includes(r.json?.error?.code), `code=${r.json?.error?.code}`);
    return r; } },
  { id: 'tls-wronghost', note: 'ホスト名の不一致（badssl）', run: async (l) => {
    const r = await trace('https://wrong.host.badssl.com/'); expectTrace(r, l);
    failIf(l, r.json?.ok !== false, 'ok:falseでない');
    failIf(l, !['tls_failed', 'connect_failed'].includes(r.json?.error?.code), `code=${r.json?.error?.code}`);
    return r; } },
  { id: 'nxdomain', note: '存在しない名前（DoHで決まる）', run: async (l) => {
    const r = await trace('https://this-domain-should-not-exist-98765.com/'); expectTrace(r, l);
    failIf(l, r.json?.ok !== false || r.json?.error?.code !== 'dns_failed', `ok=${r.json?.ok} code=${r.json?.error?.code}`);
    return r; } },
  { id: 'reserved-example', note: '予約済みTLD（.example）は接続しない', run: async (l) => {
    const r = await trace('https://www.amazon.co.jp.account-check.example/signin'); blocked(r, l);
    failIf(l, r.ms > FAST * 4, `遅い(${r.ms}ms)`); return r; } },
  ...[
    ['loopback', 'http://127.0.0.1/'], ['loopback-short', 'http://127.1/'], ['hex', 'http://0x7f.0.0.1/'], ['decimal', 'http://2130706433/'],
    ['octal', 'http://017700000001/'], ['zero', 'http://0/'], ['ipv6-loop', 'http://[::1]/'], ['ipv6-mapped', 'http://[::ffff:127.0.0.1]/'],
    ['metadata', 'http://169.254.169.254/latest/meta-data/'], ['localhost', 'http://localhost/'], ['localhost-dot', 'http://localhost./'],
    ['private-10', 'http://10.0.0.1/'], ['private-192', 'http://192.168.0.1/'], ['internal-name', 'http://metadata.google.internal/'],
    ['credentials', 'https://amazon.co.jp@evil.example/'], ['port', 'http://example.com:8080/'], ['file', 'file:///etc/passwd'], ['js', 'javascript:alert(1)'],
    ['self', 'https://hundred-days.pages.dev/api/day-074/trace?url=https%3A%2F%2Fexample.com%2F']
  ].map(([id, target]) => ({ id: `block-${id}`, note: `${target} は接続しない`, run: async (l) => {
    const r = await trace(target); blocked(r, l); failIf(l, r.ms > 2000, `遅い(${r.ms}ms)＝接続に行った疑い`); return r; } })),
  ...[
    ['dns-localtest', 'http://localtest.me/', 'DNSが127.0.0.1を指す名前'],
    ['dns-nip-loop', 'http://127.0.0.1.nip.io/', 'DNSが127.0.0.1を指す名前（nip.io）'],
    ['dns-nip-meta', 'http://169.254.169.254.nip.io/', 'DNSがメタデータIPを指す名前'],
    ['dns-nip-10', 'http://10.0.0.5.nip.io/', 'DNSが10.0.0.5を指す名前']
  ].map(([id, target, note]) => ({ id: `block-${id}`, note, run: async (l) => {
    const r = await trace(target); blocked(r, l, ['blocked_target']); failIf(l, r.ms > 4000, `遅い(${r.ms}ms)`); return r; } })),
  { id: 'redirect-private', note: '転送先が内部アドレス（httpbin）', optional: true, run: async (l) => {
    const r = await trace('https://httpbin.org/redirect-to?url=http%3A%2F%2F169.254.169.254%2F&status_code=302'); expectTrace(r, l);
    if (r.json?.error?.code === 'connect_failed' || r.json?.error?.code === 'timeout') return Object.assign(r, { skip: 'httpbinに届かない' });
    failIf(l, r.json?.ok !== false || r.json?.error?.code !== 'blocked_redirect', `ok=${r.json?.ok} code=${r.json?.error?.code}`);
    return r; } },
  { id: 'around-example', note: 'DNS・登録日・http転送・security.txt', run: async (l) => {
    const r = await around('example.com'); failIf(l, r.status !== 200, `HTTP ${r.status}`);
    const check = r.json ? validateAround(r.json) : { ok: false, errors: ['JSONでない'] };
    failIf(l, !check.ok, `契約に合わない: ${check.errors.slice(0, 2).join(' / ')}`);
    failIf(l, !r.json?.dns?.a?.length, 'Aレコードが取れていない');
    failIf(l, !r.json?.rdap?.registeredAt, `登録日: ${JSON.stringify(r.json?.rdap)}`);
    failIf(l, r.json?.httpProbe?.tested !== true, 'http転送を試していない');
    return r; } },
  { id: 'around-cloudflare', note: 'security.txtがあるサイト', run: async (l) => {
    const r = await around('www.cloudflare.com'); failIf(l, r.status !== 200, `HTTP ${r.status}`);
    const check = r.json ? validateAround(r.json) : { ok: false, errors: ['JSONでない'] };
    failIf(l, !check.ok, `契約に合わない: ${check.errors.slice(0, 2).join(' / ')}`);
    failIf(l, r.json?.securityTxt?.found !== true, `security.txt: ${JSON.stringify(r.json?.securityTxt)}`);
    return r; } },
  { id: 'around-jp', note: '.jpは登録日が取れない（unavailable）', run: async (l) => {
    const r = await around('www.yahoo.co.jp'); failIf(l, r.status !== 200, `HTTP ${r.status}`);
    const check = r.json ? validateAround(r.json) : { ok: false, errors: ['JSONでない'] };
    failIf(l, !check.ok, `契約に合わない: ${check.errors.slice(0, 2).join(' / ')}`);
    failIf(l, !r.json?.rdap?.unavailable, `rdap: ${JSON.stringify(r.json?.rdap)}`);
    return r; } },
  { id: 'around-private', note: 'aroundも内部アドレスへ行かない', run: async (l) => {
    const r = await around('127.0.0.1'); failIf(l, ![200, 400].includes(r.status), `HTTP ${r.status}`);
    failIf(l, !!r.json?.dns?.a?.length, 'DNS結果が返っている'); failIf(l, r.ms > 2000, `遅い(${r.ms}ms)`); return r; } },
  { id: 'cross-site', note: 'Sec-Fetch-Site: cross-site は断る', run: async (l) => {
    const r = await trace('https://example.com/', { headers: { 'Sec-Fetch-Site': 'cross-site' } });
    failIf(l, r.status !== 403, `HTTP ${r.status}（403のはず）`); return r; } },
  { id: 'method', note: 'POSTは断る', run: async (l) => {
    await pace('trace');
    const r = await fetch(`${base}/api/day-074/trace?url=${encodeURIComponent('https://example.com/')}`, { method: 'POST' });
    failIf(l, ![404, 405].includes(r.status), `HTTP ${r.status}（405のはず）`); return { status: r.status, ms: 0, text: '' }; } },
  { id: 'missing-param', note: 'urlが無ければ400', run: async (l) => {
    const r = await call('trace', ''); failIf(l, r.status !== 400, `HTTP ${r.status}`); return r; } },
  { id: 'long-url', note: '2049字は接続しない', run: async (l) => {
    const r = await trace(`https://example.com/${'a'.repeat(2040)}`); failIf(l, ![200, 400].includes(r.status), `HTTP ${r.status}`);
    if (r.status === 200) blocked(r, l); return r; } }
];

if (withRate) {
  cases.push({ id: 'ratelimit', note: `1分${LIMITS.RATE_PER_MINUTE}回を超えると429`, rate: true, run: async (l) => {
    const wait = 61_000 - (Date.now() % 60_000); // 新しい窓まで待つ
    console.log(`  （レート制限の試験のため ${Math.ceil(wait / 1000)} 秒待つ）`);
    await sleep(wait);
    const statuses = [];
    for (let i = 0; i < LIMITS.RATE_PER_MINUTE + 2; i += 1) {
      const response = await fetch(`${base}/api/day-074/trace?url=${encodeURIComponent('https://example.com/')}`);
      statuses.push(response.status);
      await response.arrayBuffer();
    }
    failIf(l, statuses.slice(0, LIMITS.RATE_PER_MINUTE).includes(429), `上限の手前で429: ${statuses.join(',')}`);
    failIf(l, !statuses.slice(LIMITS.RATE_PER_MINUTE).includes(429), `上限を超えても429にならない: ${statuses.join(',')}`);
    return { status: statuses.at(-1), ms: 0, text: '' }; } });
}

let failed = 0;
let skipped = 0;
console.log(`観測APIの確認: ${base}`);
for (const item of cases) {
  if (only.length && !only.includes(item.id)) continue;
  const problems = [];
  let result;
  try { result = await item.run(problems); } catch (error) { problems.push(`例外: ${error?.message || error}`); }
  if (result?.skip) { skipped += 1; console.log(`- SKIP ${item.id}（${result.skip}）`); continue; }
  const mark = problems.length ? 'NG  ' : 'OK  ';
  if (problems.length) failed += 1;
  console.log(`${mark}${item.id.padEnd(22)} ${String(result?.ms ?? '').padStart(5)}ms  ${item.note}`);
  for (const problem of problems) console.log(`      ↳ ${problem}`);
  if (verbose && result?.json) console.log(`      ${JSON.stringify(result.json).slice(0, 400)}`);
}
console.log(failed ? `\n${failed}件が期待と違う` : `\nすべて期待どおり${skipped ? `（${skipped}件は届かずスキップ）` : ''}`);
process.exit(failed ? 1 : 0);
