import { parseInput } from '../lib/url-input.js';
import { analyzeLexical } from '../lib/lexical.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { evaluate, RULE_CATALOG } from '../lib/rules.js';
import { validateResult, LIMITS } from '../lib/contract.js';
import { MESSAGES, BANNED_PHRASES, HEADLINES, ACTIONS, LIMITS_TEXT } from '../lib/messages.js';
import { buildReport, buildSummary } from '../lib/report.js';
import { CONSULT_LINKS, EXTERNAL_CHECKS } from '../lib/resources.js';
import { SAMPLES } from '../lib/samples.js';

const fixtureDir = new URL('./fixtures/', import.meta.url);
const fixture = name => JSON.parse(readFileSync(new URL(`${name}.json`, fixtureDir), 'utf8'));
const now = new Date('2026-10-22T00:00:00Z');
// 住所担当の実装を使わず、判定担当の入力契約を手書きで固定する。
const registered = host => host.split('.').slice(host.endsWith('.co.jp') ? -3 : -2).join('.');
const deps = {
  registrableDomain: host => ({ registrable: registered(host) }),
  findOfficialBrand: host => host === 'amazon.co.jp' || host.endsWith('.amazon.co.jp') ? { id: 'amazon', name: 'Amazon' } : null,
  brandKeywordsInText: text => /amazon/i.test(text) ? [{ id: 'amazon', name: 'Amazon', keyword: 'amazon' }] : []
};
const parsedOf = href => {
  const u = new URL(href);
  return { ok: true, original: href, raw: href, href, hostname: u.hostname, hostUnicode: u.hostname, registrable: registered(u.hostname), scheme: u.protocol.slice(0, -1) };
};
const lexicalOf = (parsed = parsedOf(SAMPLES[1].url), overrides = {}) => ({
  host: parsed.hostname, hostUnicode: parsed.hostUnicode, registrable: parsed.registrable, suffix: 'example', labels: parsed.hostname.split('.'), subdomainLabels: [],
  scheme: parsed.scheme, port: '', urlLength: parsed.href.length, hasUserinfo: false, userinfoLooksLikeHost: false, isIpHost: false,
  isPunycode: false, mixedScript: false, confusableChars: [], brand: { official: null, subdomain: [], typo: [], keyword: [] },
  sensitiveWords: [], shortener: null, freeHost: null, tld: 'example', tldRisky: false, hyphenCount: 0, digitCount: 0, labelOdd: false, subdomainDepth: 0,
  encodedCount: 0, doubleEncoded: false, hasNullByte: false, redirectParams: [], jpRestricted: null, ...overrides
});
const seen = new Set();
function run({ trace = fixture('trace-clean'), around = fixture('around-clean'), lexical = {}, parsed = parsedOf(trace?.requested ?? SAMPLES[1].url), ...rest } = {}) {
  const result = evaluate({ parsed, lexical: lexicalOf(parsed, lexical), trace, around, now, ...rest }, deps);
  const validation = validateResult(result); assert.equal(validation.ok, true, validation.errors.join('\n'));
  result.findings.forEach(f => seen.add(f.id));
  for (const text of [JSON.stringify(result), buildReport(result), buildSummary(result)]) for (const banned of BANNED_PHRASES) assert.equal(text.includes(banned), false, banned);
  return result;
}
const finding = (result, id) => result.findings.find(f => f.id === id);
const has = (result, id, points, status = 'bad') => {
  const f = finding(result, id); assert.ok(f, id); assert.equal(f.points, points, id); assert.equal(f.status, status, id); return f;
};
const no = (result, ...ids) => ids.forEach(id => assert.equal(finding(result, id), undefined, id));

const traces = readdirSync(fixtureDir).filter(n => n.startsWith('trace-')).map(n => n.slice(0, -5));
const arounds = readdirSync(fixtureDir).filter(n => n.startsWith('around-')).map(n => n.slice(0, -5));
for (const t of [...traces, null]) for (const a of [...arounds, null]) test(`Result契約と禁止語 ${t} × ${a}`, () => run({ trace: t && fixture(t), around: a && fixture(a) }));

const lexicalCases = [
  ['V-USERINFO', { hasUserinfo: true, userinfoLooksLikeHost: true }, 9, 'danger'],
  ['V-IP-HOST', { isIpHost: true }, 8, 'warn'],
  ['V-HOMOGRAPH', { mixedScript: true }, 8, 'warn'],
  ['V-PUNYCODE', { isPunycode: true }, 1, null],
  ['V-BRAND-SUBDOMAIN', { brand: { official: null, subdomain: [{ id: 'amazon', domain: 'amazon.co.jp' }], typo: [], keyword: [] } }, 9, 'danger'],
  ['V-BRAND-TYPO', { brand: { official: null, subdomain: [], typo: [{ id: 'amazon', label: 'amaz0n', brandLabel: 'amazon' }], keyword: [] } }, 8, 'warn'],
  ['V-BRAND-KEYWORD', { brand: { official: null, subdomain: [], typo: [], keyword: [{ id: 'amazon', keyword: 'amazon', where: 'registrable' }] } }, 4, null],
  ['V-SENSITIVE-WORDS', { sensitiveWords: ['login', 'verify'] }, 2, null],
  ['V-SHORTENER', { shortener: 'third-party' }, 1, null],
  ['V-TLD-RISKY', { tldRisky: true, tld: 'icu' }, 1, null],
  ['V-LABEL-ODD', { labelOdd: true }, 2, null],
  ['V-DEEP-SUBDOMAIN', { subdomainDepth: 4 }, 2, null],
  ['V-LONG-URL', { urlLength: 121 }, 1, null],
  ['V-ENCODED', { encodedCount: 6 }, 2, null],
  ['V-REDIRECT-PARAM', { redirectParams: [{ name: 'next', host: 'other.example' }] }, 3, null]
];
for (const [id, lexical, points, floor] of lexicalCases) test(`目視ルール ${id}`, () => assert.equal(has(run({ lexical, trace: null, around: null }), id, points).floor, floor));
test('目視ルールの抑制と境界、ブランドの加点', () => {
  const r = run({ lexical: { hasUserinfo: true, isPunycode: true, confusableChars: ['а'], shortener: 'official', urlLength: 120, subdomainDepth: 3, encodedCount: 5, sensitiveWords: ['login'] } });
  no(r, 'V-USERINFO', 'V-PUNYCODE', 'V-SHORTENER', 'V-LONG-URL', 'V-DEEP-SUBDOMAIN', 'V-ENCODED', 'V-SENSITIVE-WORDS');
  has(r, 'V-HOMOGRAPH', 8);
  const kw = lexicalCases.find(([id]) => id === 'V-BRAND-KEYWORD')[1];
  has(run({ lexical: { ...kw, sensitiveWords: ['login'] } }), 'V-BRAND-KEYWORD', 7);
  has(run({ lexical: { ...kw, brand: { ...kw.brand, keyword: [{ id: 'amazon', where: 'path' }] } } }), 'V-BRAND-KEYWORD', 2);
  has(run({ lexical: { urlLength: 201 } }), 'V-LONG-URL', 2);
  for (const key of ['doubleEncoded', 'hasNullByte']) has(run({ lexical: { [key]: true } }), 'V-ENCODED', 2);
});
test('公式ドメイン・資格のあるJP・長期登録はgood、公式ブランドの重複を抑制', () => {
  const r = run({ lexical: { brand: { official: { id: 'amazon', name: 'Amazon' }, subdomain: [{}], typo: [{}], keyword: [{}] }, jpRestricted: 'co.jp' } });
  has(r, 'V-OFFICIAL-DOMAIN', 0, 'good'); has(r, 'V-JP-RESTRICTED', 0, 'good'); has(r, 'V-OLD-DOMAIN', 0, 'good');
  no(r, 'V-BRAND-SUBDOMAIN', 'V-BRAND-TYPO', 'V-BRAND-KEYWORD');
});
test('通信失敗: O-UNKNOWNだけ・点数なし・目視のfloor維持・RDAP不採用', () => {
  const r = run({ trace: fixture('trace-dns-failed'), around: fixture('around-lookalike'), lexical: { isIpHost: true } });
  assert.deepEqual(r.findings.filter(f => f.axis === 'owner').map(f => f.id), ['O-UNKNOWN']);
  assert.equal(r.owner.score, null); assert.equal(r.owner.grade, null); assert.equal(r.visitor.level, 'warn'); assert.equal(r.partial.trace, false);
  has(r, 'V-UNREACHABLE', 0, 'unknown'); no(r, 'V-NEW-DOMAIN');
  has(run({ trace: fixture('trace-challenge') }), 'V-BLOCKED-FETCH', 0, 'unknown');
  has(run({ trace: fixture('trace-tls-failed') }), 'V-TLS-FAIL', 0, 'unknown');
});
test('HTML以外の応答: APK/実行形式/圧縮、運営者のHTML規則なし', () => {
  has(run({ trace: fixture('trace-apk') }), 'V-DOWNLOAD-APK', 10);
  for (const [ext, reason, id, points] of [['exe', 'executable', 'V-DOWNLOAD-EXEC', 7], ['zip', 'archive', 'V-DOWNLOAD-ARCHIVE', 2]]) {
    const trace = fixture('trace-apk'); trace.final.download = { ext, reason, filename: `app.${ext}` }; trace.final.contentType = 'application/octet-stream'; trace.final.url = trace.final.url.replace(/\.apk$/, `.${ext}`);
    const r = run({ trace }); has(r, id, points); assert.equal(r.findings.some(f => f.axis === 'owner'), false); assert.equal(r.owner.score, null);
  }
});
test('ブランドの本文: ニュースは除外、検索窓だけ2点、複数項目のフォーム5点、入力欄9点、公式は除外', () => {
  const trace = fixture('trace-clean'); trace.html.title = 'Amazonの新サービスを紹介';
  no(run({ trace }), 'V-BRAND-CONTENT');
  // clean見本の検索窓(1項目)だけでは「入力を求める画面」にならない
  trace.html.h1 = 'Sign in'; has(run({ trace }), 'V-BRAND-CONTENT', 2);
  trace.html.forms = [];
  has(run({ trace }), 'V-BRAND-CONTENT', 2);
  trace.html.forms = [{ method: 'post', action: '/apply', actionHost: null, hasPassword: false, hasEmail: false, hasCardLike: false, hasFileUpload: false, fieldCount: 4, hidden: false }];
  has(run({ trace }), 'V-BRAND-CONTENT', 5);
  trace.html.forms[0].fieldCount = 2; has(run({ trace }), 'V-BRAND-CONTENT', 2);
  trace.html.passwordFields = 1; assert.equal(has(run({ trace }), 'V-BRAND-CONTENT', 9).floor, 'warn');
  Object.assign(trace.final, { host: 'www.amazon.co.jp', url: 'https://www.amazon.co.jp/' });
  no(run({ trace }), 'V-BRAND-CONTENT');
});
test('HTMLの訪問者ルールと難読化点上限', () => {
  const trace = fixture('trace-lookalike'); trace.html.metaRefresh = { delay: 0, url: 'https://elsewhere.example/' }; trace.html.signals.obfuscation = ['eval-atob', 'hex-array', 'long-base64'];
  const r = run({ trace }); has(r, 'V-CROSS-FORM', 8); has(r, 'V-META-REFRESH', 3); has(r, 'V-HIDDEN-IFRAME', 3); has(r, 'V-OBFUSCATION', 4);
  trace.html.forms[0].actionHost = 'sub.account-check.example'; trace.html.iframes[0].host = 'sub.account-check.example'; Object.assign(trace.html.metaRefresh, { url: 'https://sub.account-check.example/' });
  no(run({ trace }), 'V-CROSS-FORM', 'V-META-REFRESH', 'V-HIDDEN-IFRAME');
});
for (const [age, expected, floor] of [[0, 8, 'warn'], [13, 8, 'warn'], [14, 6, 'warn'], [29, 6, 'warn'], [30, 3, null], [89, 3, null], [90, 1, null], [364, 1, null], [365, null, null]]) test(`登録日の境界 ${age}`, () => {
  const around = fixture('around-clean'); around.rdap.ageDays = age;
  const r = run({ around, now: new Date('2040-01-01') });
  if (expected === null) no(r, 'V-NEW-DOMAIN'); else assert.equal(has(r, 'V-NEW-DOMAIN', expected).floor, floor);
});
test('転送の経路: 入力・redirect・final、登録ドメイン数とHTTPS降格', () => {
  const trace = fixture('trace-clean'); Object.assign(trace, { requested: 'https://one.example/' });
  trace.hops = [
    { url: 'https://one.example/', host: 'one.example', status: 301, location: 'http://two.example/', ms: 1 },
    { url: 'http://two.example/', host: 'two.example', status: 302, location: trace.final.url, ms: 1 }
  ];
  let r = run({ trace }); has(r, 'V-REDIRECT-CROSS', 3); has(r, 'V-HTTPS-DOWNGRADE', 4);
  assert.deepEqual(r.target.chain.map(h => h.role), ['input', 'redirect', 'final']);
  trace.hops.push({ url: 'https://three.example/', host: 'three.example', status: 301, location: 'https://four.example/', ms: 1 }, { url: 'https://four.example/', host: 'four.example', status: 301, location: trace.final.url, ms: 1 });
  has(run({ trace }), 'V-REDIRECT-CROSS', 5);
  assert.deepEqual(run().target.chain.map(h => h.role), ['final']);
});
test('運営者: HTTPS前提の重複を抑制し、HTTP入力を両軸で示す', () => {
  const r = run({ trace: fixture('trace-legacy'), around: fixture('around-legacy') });
  has(r, 'V-HTTP', 6); has(r, 'O-NO-HTTPS', 40); has(r, 'O-PASSWORD-HTTP', 25); has(r, 'O-EOL-SOFTWARE', 10); has(r, 'O-VERSION-DISCLOSURE', 2); has(r, 'O-ERROR-DISCLOSURE', 8);
  no(r, 'O-HSTS-MISSING', 'O-HSTS-WEAK', 'O-MIXED-ACTIVE', 'O-MIXED-PASSIVE', 'O-FORM-HTTP', 'O-COOKIE-SECURE');
});
test('運営者: HTTPSは使えるが転送なし、HTTPProbe不明なら減点しない', () => {
  const around = fixture('around-clean'); around.httpProbe.upgradesToHttps = false;
  has(run({ around }), 'O-NO-UPGRADE', 15);
  around.httpProbe = { tested: false, reason: 'timeout' };
  const r = run({ around }); no(r, 'O-NO-UPGRADE'); assert.match(r.limits.join(' '), /時間内に応えませんでした/);
  assert.match(r.visitor.summary, /一部/);
});
test('運営者: HSTS/CSPはmissingかweakかgoodの1つだけ', () => {
  const trace = fixture('trace-clean'); trace.final.headers['strict-transport-security'] = 'max-age=15551999';
  let r = run({ trace }); has(r, 'O-HSTS-WEAK', 5); no(r, 'O-HSTS-MISSING', 'O-HSTS-OK');
  trace.final.headers['strict-transport-security'] = 'max-age=15552000'; has(run({ trace }), 'O-HSTS-OK', 0, 'good');
  delete trace.final.headers['content-security-policy']; trace.final.headers['content-security-policy-report-only'] = "default-src 'self'";
  r = run({ trace }); has(r, 'O-CSP-MISSING', 15); no(r, 'O-CSP-WEAK', 'O-CSP-OK');
  trace.html.signals.metaCsp = true; r = run({ trace }); has(r, 'O-CSP-WEAK', 8); no(r, 'O-CSP-MISSING', 'O-CSP-OK');
  trace.final.headers['content-security-policy'] = "script-src 'unsafe-eval'"; has(run({ trace }), 'O-CSP-WEAK', 8);
});
test('運営者: cleanの良い所見と未設定時の不足所見', () => {
  const r = run();
  for (const id of ['O-HTTPS-OK', 'O-HSTS-OK', 'O-CSP-OK', 'O-FRAME-OK', 'O-XCTO-OK', 'O-REFERRER-OK', 'O-COOKIE-OK', 'O-SECURITY-TXT']) has(r, id, 0, 'good');
  assert.equal(r.owner.score, 100); assert.equal(r.visitor.level, 'ok');
  const weak = run({ trace: fixture('trace-lookalike'), around: fixture('around-lookalike') });
  for (const [id, points] of [['O-HSTS-MISSING', 15], ['O-CSP-MISSING', 15], ['O-FRAME-MISSING', 8], ['O-XCTO-MISSING', 5], ['O-REFERRER-MISSING', 3], ['O-COOKIE-SECURE', 10], ['O-COOKIE-HTTPONLY', 6], ['O-COOKIE-SAMESITE', 2]]) has(weak, id, points);
});
test('運営者: mixed/SRI/フォーム/エラー/一覧/初期画面/CORS/非推奨', () => {
  const trace = fixture('trace-clean');
  trace.html.scripts.external = [{ src: 'http://external.example/a.js', host: 'external.example', scheme: 'http', sri: false }];
  trace.html.images.http = 1; trace.html.forms = [{ action: 'http://external.example/post', actionHost: 'external.example', hasPassword: false, hasCardLike: false }];
  Object.assign(trace.html.signals, { directoryListing: true, errorDisclosure: 'sql', defaultPage: 'nginx' });
  Object.assign(trace.final.headers, { 'access-control-allow-origin': '*', 'access-control-allow-credentials': 'true', 'x-xss-protection': '1; mode=block' });
  const r = run({ trace });
  for (const [id, points] of [['O-MIXED-ACTIVE', 15], ['O-MIXED-PASSIVE', 3], ['O-SRI-MISSING', 3], ['O-FORM-HTTP', 10], ['O-DIR-LISTING', 10], ['O-ERROR-DISCLOSURE', 8], ['O-DEFAULT-PAGE', 2], ['O-CORS-WILDCARD-CREDS', 3]]) has(r, id, points);
  has(r, 'O-DEPRECATED-HEADER', 0, 'info');
  trace.final.headers['x-xss-protection'] = '0'; no(run({ trace }), 'O-DEPRECATED-HEADER');
});
test('運営者: ライブラリの脆弱性は合計15点まで、EOLは別', () => {
  const trace = fixture('trace-clean');
  trace.html.scripts.external = [
    { src: 'https://unpkg.com/jquery@1.12.4/index.js', host: 'unpkg.com', scheme: 'https', sri: true },
    { src: 'https://unpkg.com/moment@2.18.0/index.js', host: 'unpkg.com', scheme: 'https', sri: true },
    { src: 'https://unpkg.com/angular@1.8.3/index.js', host: 'unpkg.com', scheme: 'https', sri: true }
  ];
  const r = run({ trace }); has(r, 'O-VULN-LIB', 15); has(r, 'O-EOL-LIB', 4);
});
test('運営者: DNSの未取得を欠落扱いにしない、メール設定とsecurity.txt', () => {
  const r = run({ around: fixture('around-unavailable') });
  no(r, 'O-DMARC-MISSING', 'O-SPF-MISSING', 'O-DMARC-WEAK', 'O-SECURITY-TXT');
  assert.match(r.limits.join(' '), /名前を調べるサービスに接続できませんでした/); assert.match(r.limits.join(' '), /登録日.*時間切れ/);
  const around = fixture('around-clean'); around.dns.dmarc.present = false; around.dns.spf.present = false; around.securityTxt.found = false;
  const missing = run({ around }); has(missing, 'O-DMARC-MISSING', 2); has(missing, 'O-SPF-MISSING', 1); has(missing, 'O-SECURITY-TXT', 0, 'info');
  around.dns.dmarc.present = true; around.dns.dmarc.policy = 'none'; has(run({ around }), 'O-DMARC-WEAK', 1);
  around.dns.dmarc.policy = 'reject'; around.dns.spf.present = true; around.dns.spf.all = '+all'; has(run({ around }), 'O-DMARC-WEAK', 1);
});
test('順序・理由上位3・改善上位3・summaryの部分取得注記・日時', () => {
  const trace = fixture('trace-lookalike'); trace.final.truncated = true;
  const r = run({ trace, around: fixture('around-lookalike'), lexical: { isIpHost: true } });
  const statusOrder = { bad: 0, unknown: 1, info: 2, good: 3 }, sevOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const tuples = r.findings.map(f => [f.axis === 'visitor' ? 0 : 1, statusOrder[f.status], sevOrder[f.severity], -f.points]);
  const sorted = [...tuples].sort((a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; });
  assert.deepEqual(tuples, sorted);
  assert.deepEqual(r.visitor.reasons, r.findings.filter(f => f.axis === 'visitor' && f.status === 'bad').sort((a, b) => b.points - a.points).slice(0, 3).map(f => f.title));
  assert.equal(r.owner.topFixes.length, 3); assert.ok(r.owner.topFixes.every((f, i, list) => i === 0 || list[i - 1].gain >= f.gain));
  // ページが大きくて先頭の一部だけ読んだことは「見ていないこと」で言う（大きなサイトのたびに「一部だけで判定」とは言わない）。周辺の情報が取れないときは、判定の一文で言う
  assert.ok(r.limits.some((line) => /先頭の一部（64KiB）/.test(line))); assert.ok(!/一部/.test(r.visitor.summary));
  assert.match(run({ trace: fixture('trace-lookalike'), around: null }).visitor.summary, /一部/);
  assert.match(r.owner.note, /点数が低くても、危険なサイトという意味ではありません/); assert.equal(r.evaluatedAt, now.toISOString());
});
test('文面と設定例: 禁止語なし・値とサーバー構文・調整注記', () => {
  for (const text of [MESSAGES, HEADLINES, ACTIONS, LIMITS_TEXT]) for (const banned of BANNED_PHRASES) assert.equal(JSON.stringify(text).includes(banned), false, banned);
  const cases = [
    ['O-HSTS-MISSING', 'Strict-Transport-Security', 'max-age=63072000'],
    ['O-CSP-MISSING', 'Content-Security-Policy', "default-src 'self'; form-action 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'"],
    ['O-FRAME-MISSING', 'X-Frame-Options', 'DENY'], ['O-XCTO-MISSING', 'X-Content-Type-Options', 'nosniff'], ['O-REFERRER-MISSING', 'Referrer-Policy', 'strict-origin-when-cross-origin']
  ];
  for (const [id, name, value] of cases) {
    const s = MESSAGES[id].snippet; assert.equal(s.headers, `${name}: ${value}`); assert.equal(s.nginx, `add_header ${name} "${value}" always;`); assert.equal(s.apache, `Header always set ${name} "${value}"`);
  }
  assert.match(MESSAGES['O-CSP-MISSING'].fix, /アプリごと.*調整/);
});
test('レポート: 対象はhref・日時・2軸・限界・要約9行まで', () => {
  const r = run({ trace: fixture('trace-lookalike'), around: fixture('around-lookalike') });
  const report = buildReport(r, { now });
  // 日時は画面と同じ日本時間で書く（UTCのISO形式をそのまま出さない）
  for (const text of [r.target.href, '2026年10月22日 09:00（日本時間）', '転送の経路', '訪問者向け', '運営者向け', '直し方', '見ていないこと', 'add_header']) assert.ok(report.includes(text), text);
  assert.ok(!report.includes('T00:00:00'));
  assert.ok(buildSummary(r).split('\n').length <= 9);
  assert.match(buildReport(run({ trace: null, around: null })), /採点なし/);
});
test('レポート・要約: ?以降と#以降は写しに残さず、パスワードは伏せ、理由には見えた値を添える', () => {
  const parsed = parseInput('https://www.amazon.co.jp.account-check.example/signin?token=SECRETVALUE123#frag');
  const trace = fixture('trace-lookalike');
  trace.hops = [{ url: 'https://bit.ly/x?sig=HOPSECRET456', host: 'bit.ly', status: 301, location: trace.final.url, ms: 1 }];
  const r = evaluate({ parsed, lexical: analyzeLexical(parsed), trace, around: fixture('around-lookalike'), now: now.getTime() });
  for (const text of [buildReport(r, { now }), buildSummary(r)]) {
    for (const secret of ['SECRETVALUE123', 'HOPSECRET456', '#frag']) assert.ok(!text.includes(secret), secret);
    assert.match(text, /（\?・#以降は省略）|（\?以降は省略）/);
  }
  const summary = buildSummary(r);
  assert.match(summary, /^調べたリンク：/m);
  assert.match(summary, /理由：公式のアドレスに見える名前を、別の持ち主のアドレスの手前に付けています（amazon\.co\.jp）/);
  // 認証情報つきの偽装は左側を証拠として残し、パスワードの部分は伏せる
  const tricky = parseInput('https://amazon.co.jp:hunter2@evil.example/');
  const trickyResult = evaluate({ parsed: tricky, lexical: analyzeLexical(tricky), trace: null, around: null, now: now.getTime() });
  assert.ok(!buildReport(trickyResult, { now }).includes('hunter2'));
  assert.match(buildReport(trickyResult, { now }), /amazon\.co\.jp:…@evil\.example/);
  // 何も見つからなかった/調べきれなかったときだけ「保証ではない」を足し、注意以上では足さない
  assert.match(buildSummary(run({ trace: fixture('trace-clean'), around: fixture('around-clean') })), /安全の保証ではありません/);
  assert.ok(!buildSummary(r).includes('安全の保証ではありません'));
  assert.ok(!r.visitor.summary.includes('安全の保証ではありません'));
});
test('N2/N3: 写しには、取得した値の中のURLの「?」「#」以降も、行区切り・制御文字による偽の行も残さない', () => {
  const LS = String.fromCodePoint(0x2028), NEL = String.fromCodePoint(0x85), RLO = String.fromCodePoint(0x202e);
  const actions = [
    ['HTTPS://other.example/pay?token=SECRET_UPPER#hash', 'SECRET_UPPER'],
    ['//other.example/pay?token=SECRET_REL#hash', 'SECRET_REL'],
    ['https://other.example/pay ?token=SECRET_SPACE', 'SECRET_SPACE'],
    [`https://other.example/pay${LS}偽の診断：合格?token=SECRET_LINE`, 'SECRET_LINE'],
    [`https://other.example/pay${NEL}FAKE?token=SECRET_NEL`, 'SECRET_NEL'],
    ['https://user:PASSWORD_IN_URL@other.example/pay', 'PASSWORD_IN_URL']
  ];
  for (const [action, secret] of actions) {
    const trace = fixture('trace-lookalike');
    trace.html.forms = [{ method: 'post', action, actionHost: 'other.example', hasPassword: true, hasEmail: false, hasCardLike: false, hasFileUpload: false, fieldCount: 2, hidden: false }];
    trace.html.passwordFields = 1;
    trace.final.headers.server = `Example/1.2${LS}偽の見出し${RLO}`;
    const r = run({ trace, around: fixture('around-lookalike') });
    for (const text of [buildReport(r, { now }), buildSummary(r)]) {
      assert.ok(!text.includes(secret), `${secret}が写しに残っている`);
      assert.ok(!text.includes(LS) && !text.includes(NEL) && !text.includes(RLO), '行区切り・制御文字が写しに残っている');
    }
    // 取得した値に行区切りを混ぜても、報告書の行が増えない（「根拠：」の行が1つの値ぶんのまま）
    const report = buildReport(r, { now });
    assert.ok(!report.split('\n').some((line) => line.startsWith('偽の')), '偽の行が作れてしまう');
  }
});
test('N2: 文章の途中に混じったURLの「?」「#」以降も、写しに残さない', () => {
  const r = run({ trace: fixture('trace-lookalike'), around: fixture('around-lookalike') });
  r.limits.push('取得先 HTTPS://x.example/a?SECRET_LIMIT#frag に断られました');
  r.findings[0].what = `転送先は //y.example/b?SECRET_WHAT と http://z.example/c#SECRET_FRAG です。`;
  const report = buildReport(r, { now });
  for (const secret of ['SECRET_LIMIT', 'SECRET_WHAT', 'SECRET_FRAG']) assert.ok(!report.includes(secret), secret);
  assert.match(report, /取得先 HTTPS:\/\/x\.example\/a（\?・#以降は省略） に断られました/);
});
test('体験評価の指摘：要約は押せない形・暫定の点数・CSPの注記の置き場所・参考の項目を先に直す一覧に入れない', () => {
  // 家族へ送る要約：ok以外ではリンクを押せない形にして、「開かないで」の一文を添える。okでは普通のリンク
  const risky = run({ trace: fixture('trace-lookalike'), around: fixture('around-lookalike') });
  const summary = buildSummary(risky);
  assert.ok(!/https?:\/\//.test(summary), '押せるリンクが残っている');
  assert.match(summary, /調べたリンク：www\[\.\]amazon\[\.\]co\[\.\]jp\[\.\]account-check\[\.\]example\/signin/);
  assert.match(summary, /このリンクは開かないでください/);
  const clean = run({ trace: fixture('trace-clean'), around: fixture('around-clean') });
  assert.match(buildSummary(clean), /調べたリンク：https:\/\//);
  assert.ok(!/開かないでください/.test(buildSummary(clean)));
  // 周辺の情報が取れていない（上限・失敗）ときは、守りの点数に「暫定」と添える。完全に取れたときは付けない
  const partial = run({ trace: fixture('trace-clean'), around: null });
  assert.notEqual(partial.owner.score, null);
  assert.match(partial.owner.note, /この点数は暫定です/);
  assert.ok(!/暫定/.test(clean.owner.note), '完全に取れたのに暫定と書いている');
  // CSPの簡易評価の注記は、守りの点数の欄に置き、訪問者向けの「見ていないこと」には混ぜない
  assert.match(clean.owner.note, /script-src/);
  assert.ok(!clean.limits.some((line) => /script-src|default-src/.test(line)));
  // 「先に付けると点が戻るもの」に、参考（info）の項目は入れない
  for (const r of [risky, clean, run({ trace: fixture('trace-legacy'), around: fixture('around-legacy') })]) {
    for (const fix of r.owner.topFixes) assert.notEqual(r.findings.find((f) => f.id === fix.id).severity, 'info', fix.id);
  }
});
test('暫定の注記：点数に効く周辺の事実が欠けたときだけ付ける（登録日が取れない・見本には付けない）', () => {
  // 見本（通信しない固定データ）や、ccTLDで登録日が取れないだけのとき（RDAP非対応）は、暫定と言わない
  const legacy = run({ trace: fixture('trace-legacy'), around: fixture('around-legacy') });
  assert.notEqual(legacy.owner.score, null);
  assert.ok(!/暫定/.test(legacy.owner.note), '見本に暫定と書いている');
  // 診断先に断られたあと（HTTPからの転送を確かめていない）は、暫定
  const around = fixture('around-clean'); around.httpProbe = { tested: false, reason: 'skipped' }; around.securityTxt = { unavailable: 'skipped' };
  const refused = run({ trace: fixture('trace-clean'), around });
  assert.match(refused.owner.note, /この点数は暫定です/);
  assert.ok(refused.limits.some((line) => /取得できませんでした：.*追加のアクセスはしていません/.test(line)), refused.limits.join(' | '));
  // 取得処理の制限は、何の制限かを言う（先頭の一部だけ読んだことは別の1行）
  const trace = fixture('trace-clean'); trace.notes = ['trimmed', 'body_truncated']; trace.final.truncated = true;
  const limited = run({ trace, around: fixture('around-clean') });
  assert.ok(limited.limits.some((line) => /数が多いため、フォーム・読み込むファイル・Cookieなどの一部を省いて/.test(line)));
  assert.ok(!limited.limits.some((line) => /取得処理の一部に制限/.test(line)));
  // 「見つからなかったことは安全の保証ではありません」は、判定の一文ではなく別の項目（見ていないこと）で言う
  assert.ok(!run({ trace: fixture('trace-clean'), around: fixture('around-clean') }).visitor.summary.includes('安全の保証'));
});
test('写し：見本の結果は見本と書く・要約はアプリ名と時刻から始める・兆候ありの段階では「見つからなかったことは」と言わない', () => {
  const r = run({ trace: fixture('trace-lookalike'), around: fixture('around-lookalike') });
  const summary = buildSummary(r, { now });
  assert.match(summary, /^リンクの毒見で調べた結果（2026年10月22日 09:00（日本時間））\n/);
  assert.ok(!/安全の保証ではありません/.test(summary));
  assert.ok(!buildSummary(r, { now }).includes('【見本】'));
  for (const text of [buildSummary(r, { now, sample: true }), buildReport(r, { now, sample: true })]) assert.match(text, /^【見本】これは、実在しないサイトと作りものの観測データでの結果です。実際の診断ではありません。/);
  // 気になる（note）でも言わない。見つからない（ok）と不明では言う
  const note = run({ trace: fixture('trace-clean'), around: fixture('around-clean'), lexical: { tldRisky: true, sensitiveWords: ['login', 'verify'], hyphenCount: 3, labelOdd: true } });
  assert.equal(note.visitor.level, 'note');
  assert.ok(!/安全の保証ではありません/.test(buildSummary(note, { now })));
  assert.match(buildSummary(run({ trace: fixture('trace-clean'), around: fixture('around-clean') }), { now }), /安全の保証ではありません/);
});
test('こちら側の失敗（回数の上限など）は、相手のサイトの問題として書かない', () => {
  for (const kind of ['rate_limited', 'server_error', 'network']) {
    const r = run({ trace: null, around: null, failure: kind });
    assert.equal(r.visitor.level, 'unknown'); assert.equal(r.owner.score, null); assert.equal(r.owner.provisional, false);
    assert.equal(r.visitor.actions.length, 1);
    const f = r.findings.find((x) => x.id === 'V-UNREACHABLE');
    assert.equal(f.title, 'このアプリ側の都合で、調べられませんでした');
    assert.ok(!/転送先|つながりませんでした|時間をおいて試すか、公式のアプリから開き直して/.test(`${f.what}${f.why}${r.visitor.summary}${r.visitor.reasons.join('')}`), kind);
  }
  assert.match(run({ trace: null, around: null, failure: 'rate_limited' }).visitor.actions[0], /1分ほど待って/);
  // 失敗の種類が分からない・未指定なら、これまでどおり（相手に届かなかった）
  assert.match(run({ trace: null, around: null }).visitor.summary, /つながらなかった/);
});
test('provisional：周辺の事実が欠けた守りの点数だけ true', () => {
  assert.equal(run({ trace: fixture('trace-clean'), around: fixture('around-clean') }).owner.provisional, false);
  const partial = run({ trace: fixture('trace-clean'), around: null });
  assert.equal(partial.owner.provisional, true);
  assert.match(partial.owner.note, /実際はこれより低いことがあります/);
  assert.equal(run({ trace: fixture('trace-legacy'), around: fixture('around-legacy') }).owner.provisional, false);
});
test('見本はfixtureそのもの、予約TLD・見本表記', () => {
  assert.equal(SAMPLES.length, 3);
  for (const s of SAMPLES) { assert.deepEqual(s.trace, fixture(`trace-${s.id}`)); assert.deepEqual(s.around, fixture(`around-${s.id}`)); assert.ok(new URL(s.url).hostname.endsWith('.example')); assert.match(s.label, /見本.*実在しない/); }
});
test('外部リンク: 確認済みだけ表示可能、URLとホスト名を正しくエンコード', () => {
  const target = { href: 'https://demo.example/a?x=1&secret=2' };
  assert.deepEqual(EXTERNAL_CHECKS.filter(s => s.verified).map(s => s.id), ['securityheaders', 'ssllabs', 'urlscan']);
  const headers = new URL(EXTERNAL_CHECKS[0].build(target)); assert.equal(headers.searchParams.get('q'), target.href);
  const ssl = new URL(EXTERNAL_CHECKS[1].build(target)); assert.equal(ssl.searchParams.get('d'), 'demo.example');
  const scan = new URL(EXTERNAL_CHECKS[2].build(target)); assert.equal(decodeURIComponent(scan.hash.slice(1)), 'task.domain:demo.example');
  assert.ok(EXTERNAL_CHECKS.every(s => s.note && ['URL', 'ホスト名'].includes(s.sends)));
  assert.equal(CONSULT_LINKS.find(s => s.id === 'ipa').phone, '03-5978-7509');
  assert.ok(CONSULT_LINKS.every(s => new URL(s.url).protocol === 'https:'));
});

for (const reason of ['userinfo', 'numeric_host', 'reserved_name', 'port', 'self', 'scheme', 'too_long']) test(`接続を見送った理由 ${reason}`, () => {
  const parsed = { ...parsedOf('https://demo.example/'), fetch: { allowed: false, reason, href: null } };
  const r = run({ parsed, trace: null, around: null });
  const f = has(r, 'V-NOT-FETCHED', 0, 'unknown');
  assert.match(f.what, /^このアドレスは、つなぎに行きませんでした。理由：/);
  if (reason === 'reserved_name') assert.match(f.what, /見本用の予約された名前なので/);
  has(r, 'O-UNKNOWN', 0, 'unknown'); no(r, 'V-UNREACHABLE');
  assert.match(r.visitor.summary, /つなぎに行かず、アドレスの見た目だけで判断しました/);
  assert.equal(r.owner.score, null);
});
test('予約された内部名と、実際の通信失敗を混同しない', () => {
  const parsed = { ...parsedOf('https://demo.invalid/'), fetch: { allowed: false, reason: 'reserved_name', href: null } };
  assert.match(has(run({ parsed, trace: null }), 'V-NOT-FETCHED', 0, 'unknown').what, /内部向け、または予約された名前/);
  no(run({ parsed }), 'V-NOT-FETCHED');
  has(run({ parsed, trace: fixture('trace-dns-failed') }), 'V-UNREACHABLE', 0, 'unknown');
});
for (const lexical of [{ freeHost: { provider: '見本サービス', domain: 'demo.example' } }, { userContentHost: true }]) test(`第三者公開サービスはinfo・0点 ${JSON.stringify(lexical)}`, () => {
  const f = has(run({ lexical }), 'V-SHARED-HOST', 0, 'info');
  assert.equal(f.what, '誰でもページを置けるサービスのアドレスです。このページの作成者は、サービスの運営会社とは限りません。');
  assert.equal(f.what.includes('無料'), false);
});
test('userContentHostだけを公式ドメイン所見の抑制に使い、未定義はfalseとして扱う', () => {
  const brand = { official: { id: 'amazon', name: 'Amazon' }, subdomain: [], typo: [], keyword: [] };
  const r = run({ lexical: { brand, userContentHost: true } });
  has(r, 'V-SHARED-HOST', 0, 'info'); no(r, 'V-OFFICIAL-DOMAIN');
  const f = has(run({ lexical: { brand } }), 'V-OFFICIAL-DOMAIN', 0, 'good');
  assert.equal(f.what, 'ホストはAmazonの公式ドメインの一覧にあります。ただし、このドメインの中の個々のページを誰が作ったかは、ドメインからは分かりません。');
});
for (const where of ['registrable', 'subdomain', 'path']) for (const sensitive of [false, true]) test(`ブランド名の場所と敏感語 ${where}/${sensitive}`, () => {
  const lexical = { brand: { official: null, subdomain: [], typo: [], keyword: [{ id: 'amazon', keyword: 'amazon', where }] }, sensitiveWords: sensitive ? ['login'] : [] };
  has(run({ lexical }), 'V-BRAND-KEYWORD', (where === 'path' ? 2 : 4) + (sensitive ? 3 : 0));
});
test('ブランド名がパスと名前の両方にあっても1回だけ加点する', () => {
  const r = run({ lexical: { brand: { official: null, subdomain: [], typo: [], keyword: [{ keyword: 'amazon', where: 'path' }, { keyword: 'amazon', where: 'registrable' }] } } });
  has(r, 'V-BRAND-KEYWORD', 4);
  assert.equal(r.findings.filter(f => f.id === 'V-BRAND-KEYWORD').length, 1);
});
for (const status of [399, 400, 404, 429, 500]) test(`エラー応答の注記 ${status}`, () => {
  const trace = fixture('trace-clean'); trace.final.status = status;
  const r = run({ trace });
  if (status < 400) no(r, 'O-STATUS-NOTE');
  else {
    assert.match(has(r, 'O-STATUS-NOTE', 0, 'info').what, new RegExp(`${status}（エラーの状態）`));
    assert.match(finding(r, 'O-STATUS-NOTE').what, /通常のページと設定が違う/);
  }
  assert.equal(r.owner.score, 100);
});
for (const part of ['final', 'html']) test(`本文の切り詰めはLIMITSの容量を表示 ${part}`, () => {
  const trace = fixture('trace-clean'); trace[part].truncated = true;
  assert.ok(run({ trace }).limits.includes(`ページが大きいため、先頭の一部（${LIMITS.BODY_CAP_BYTES / 1024}KiB）だけを見ました。`));
});
for (const [reason, text] of [['unsupported', 'このドメインの登録日は公開情報から取れませんでした（.jpなど）'], ['timeout', '時間切れ'], ['error', '通信や応答のエラー'], ['not_found', '登録日は見つかりませんでした']]) test(`登録日を取れない理由 ${reason}`, () => {
  const around = fixture('around-clean'); around.rdap = { unavailable: reason }; around.dns = { unavailable: 'resolver_unavailable' };
  const r = run({ around });
  assert.ok(r.limits.some(l => l.includes(text)));
  assert.ok(r.limits.some(l => l.includes('DNSの確認ができませんでした')));
  no(r, 'V-NEW-DOMAIN', 'O-DMARC-MISSING', 'O-SPF-MISSING'); assert.equal(r.owner.score, 100);
});
test('点数表は仕様の全idと追加3idを含み、各所見の値と一致する', () => {
  const spec = readFileSync(new URL('../../.kiro/specs/day-074-link-dokumi/rules.md', import.meta.url), 'utf8');
  const rows = spec.split('\n').filter(line => /^\| [VO]-/.test(line));
  const specIds = rows.flatMap(row => row.split('|')[1].match(/[VO]-[A-Z]+(?:-[A-Z]+)*/g));
  const expected = [...new Set([...specIds, 'V-NOT-FETCHED', 'V-SHARED-HOST', 'O-STATUS-NOTE'])];
  assert.equal(specIds.length, new Set(specIds).size);
  assert.equal(RULE_CATALOG.length, expected.length);
  assert.deepEqual(RULE_CATALOG.map(r => r.id).sort(), expected.sort());
  assert.deepEqual(RULE_CATALOG.map(r => r.id).sort(), Object.keys(MESSAGES).sort());
  for (const rule of RULE_CATALOG) {
    assert.equal(rule.title, MESSAGES[rule.id].title); assert.ok(rule.note);
    assert.equal(rule.axis, rule.id.startsWith('V-') ? 'visitor' : 'owner');
    for (const banned of BANNED_PHRASES) assert.equal(JSON.stringify(rule).includes(banned), false, `${rule.id}: ${banned}`);
  }
  for (const trace of [fixture('trace-clean'), fixture('trace-lookalike'), fixture('trace-legacy')]) {
    for (const f of run({ trace }).findings) {
      const rule = RULE_CATALOG.find(r => r.id === f.id);
      if (typeof rule.points === 'number') { assert.equal(f.points, rule.points); assert.equal(f.severity, rule.severity); assert.equal(f.floor, rule.floor); }
      else if (Array.isArray(rule.points)) assert.ok(rule.points.includes(f.points));
    }
  }
  assert.deepEqual(RULE_CATALOG.find(r => r.id === 'V-NEW-DOMAIN').points, [8, 6, 3, 1]);
  assert.deepEqual(RULE_CATALOG.find(r => r.id === 'V-BRAND-KEYWORD').points, [4, 7, 2, 5]);
});
test('全idの文面は文字数・文数の上限内で、内部の言葉を利用者へ出さない', () => {
  for (const [id, m] of Object.entries(MESSAGES)) {
    assert.ok(m.title.length <= LIMITS.STR_SHORT, id);
    assert.ok(m.why.length <= LIMITS.STR_LONG * 2, id);
    assert.ok(m.why.split('。').filter(Boolean).length <= 2, id);
    if (m.fix) { assert.ok(m.fix.length <= LIMITS.STR_LONG * 2, id); assert.ok(m.fix.split('。').filter(Boolean).length <= 3, id); }
  }
  const result = run({ trace: fixture('trace-legacy'), lexical: Object.assign({}, ...lexicalCases.map(([, l]) => l)) });
  for (const f of result.findings) {
    assert.ok(f.what.length <= LIMITS.STR_MID * 2, f.id);
    assert.ok(f.what.split('。').filter(Boolean).length <= 2, f.id);
  }
  const copy = JSON.stringify([MESSAGES, result.findings.map(f => f.what)]);
  for (const word of ['省略のないURL', '登録ラベル', '符号化=', '統計上の弱い目安の表に一致', '絶対URL']) assert.equal(copy.includes(word), false, word);
  assert.match(buildReport(result), /重大度：/);
  assert.equal(/\[(bad|good|info|unknown) \//.test(buildReport(result)), false);
});

test('全rule idに文面と実装・試験の到達がある', () => {
  const rules = readFileSync(new URL('../../.kiro/specs/day-074-link-dokumi/rules.md', import.meta.url), 'utf8');
  const ids = [...new Set(rules.match(/\b[VO]-[A-Z]+(?:-[A-Z]+)*/g))].filter(id => !id.endsWith('-') && !['O-CSP', 'O-FRAME', 'O-REFERRER', 'O-SRI', 'V-BRAND'].includes(id));
  assert.deepEqual(Object.keys(MESSAGES).sort(), [...new Set([...ids, 'V-NOT-FETCHED', 'V-SHARED-HOST', 'O-STATUS-NOTE'])].sort());
  assert.deepEqual([...seen].sort(), Object.keys(MESSAGES).sort());
});

// 実サイトの観測で報告された特徴だけを、手書きの観測データへ再構成する。
for (const host of ['www.asahi.com', 'www.u-tokyo.ac.jp', 'www.yahoo.co.jp']) test(`実サイト観測の再構成: 広告・計測iframe ${host}`, () => {
  const trace = fixture('trace-clean');
  Object.assign(trace.final, { host, url: `https://${host}/` });
  trace.html.iframes = [{ src: 'https://metrics.example/frame', host: 'metrics.example', scheme: 'https', hidden: true, sandbox: false }];
  const r = run({ trace });
  assert.equal(r.visitor.level, 'ok'); assert.equal(has(r, 'V-HIDDEN-IFRAME', 1).severity, 'low');
  trace.html.passwordFields = 1;
  const login = run({ trace }); assert.equal(login.visitor.level, 'note'); assert.equal(has(login, 'V-HIDDEN-IFRAME', 3).severity, 'medium');
});
for (const name of ['trace-dns-failed', 'trace-tls-failed', 'trace-challenge', 'trace-blocked-target']) test(`応答未取得はunknown ${name}`, () => {
  const r = run({ trace: fixture(name) });
  assert.equal(r.visitor.level, 'unknown'); assert.equal(r.visitor.points, 0);
  assert.equal(r.visitor.headline, HEADLINES.unknown); assert.deepEqual(r.visitor.actions, ACTIONS.unknown);
  assert.ok(r.visitor.reasons.length > 0); assert.equal(r.partial.trace, false);
  assert.equal(r.owner.score, null);
});
test('応答なしでも強いアドレスの兆候を維持し、見た目だけと説明する', () => {
  const parsed = parsedOf('https://amazon.co.jp.account-check.example/');
  const lexical = { brand: { official: null, subdomain: [{ id: 'amazon', domain: 'amazon.co.jp' }], typo: [], keyword: [] } };
  const r = run({ parsed, lexical, trace: null, around: null });
  assert.equal(r.visitor.level, 'danger'); assert.match(r.visitor.summary, /つながらなかったので、アドレスの見た目だけで判断しました/);
});
for (const [lexical, level] of [[{}, 'unknown'], [{ shortener: 'third-party' }, 'unknown'], [{ urlLength: 201 }, 'unknown'], [{ redirectParams: [{ name: 'next', host: 'elsewhere.example' }] }, 'note']]) test(`応答なしの点の境界 ${level}/${JSON.stringify(lexical)}`, () => {
  const r = run({ trace: null, around: null, lexical }); assert.equal(r.visitor.level, level);
});
for (const passwordFields of [0, 1]) test(`別登録ドメインへのmeta refresh ${passwordFields}`, () => {
  const trace = fixture('trace-clean'); trace.html.passwordFields = passwordFields;
  trace.html.metaRefresh = { delay: 0, url: 'https://elsewhere.example/' };
  const r = run({ trace }); assert.equal(has(r, 'V-META-REFRESH', passwordFields ? 3 : 2).severity, passwordFields ? 'medium' : 'low');
  trace.html.metaRefresh.url = `https://sub.${trace.final.host}/`; no(run({ trace }), 'V-META-REFRESH');
});
const errorTexts = {
  timeout: '時間内に応えませんでした', dns_failed: '名前が見つかりませんでした', connect_failed: 'つながりませんでした',
  tls_failed: 'HTTPSで安全につなぐことができませんでした', blocked_by_challenge: 'ボット対策の確認画面',
  blocked_redirect: '診断できない宛先', too_many_redirects: '転送が多すぎて', resolver_unavailable: '名前を調べるサービス',
  blocked_target: 'つなぎに行きませんでした', invalid_url: 'つなぎに行きませんでした', upstream_error: 'エラーの応答'
};
const internalCode = /[a-z]+_[a-z_]+/;
for (const [code, text] of Object.entries(errorTexts)) test(`通信失敗を平易に説明 ${code}`, () => {
  const trace = fixture('trace-dns-failed'); trace.error.code = code; trace.error.detail = 'http_responds';
  const r = run({ trace, around: fixture('around-unavailable') });
  assert.match(r.visitor.reasons[0], new RegExp(text));
  for (const f of r.findings.filter(f => f.status === 'unknown')) assert.match(f.why, /試して|開き直して|時間をお/);
  assert.equal(internalCode.test(JSON.stringify([r.limits, r.visitor.reasons, r.findings.flatMap(f => [f.what, ...f.evidence])])), false);
  if (code === 'tls_failed') assert.match(finding(r, 'V-TLS-FAIL').what, /HTTP では応答がありました/);
});
for (const t of traces) test(`fixtureの表示に内部コードを出さない ${t}`, () => {
  const r = run({ trace: fixture(t), around: fixture('around-unavailable') });
  assert.equal(internalCode.test(JSON.stringify([r.limits, r.visitor.reasons, r.findings.map(f => f.what)])), false);
});
for (const status of [403, 429, 500, 503]) test(`取得制限とエラー画面を区別 ${status}`, () => {
  const trace = fixture('trace-clean'); trace.final.status = status;
  let r = run({ trace }); has(r, 'O-STATUS-NOTE', 0, 'info');
  if (status < 500) has(r, 'V-BLOCKED-FETCH', 0, 'unknown'); else no(r, 'V-BLOCKED-FETCH');
  trace.html.title = 'Access denied - challenge'; r = run({ trace }); has(r, 'V-BLOCKED-FETCH', 0, 'unknown');
  assert.equal(r.partial.trace, true); assert.equal(r.visitor.level, 'ok');
});
test('ダウンロードは採点しない理由を運営者の注記に出す', () => {
  const r = run({ trace: fixture('trace-apk') });
  assert.equal(r.owner.score, null); assert.equal(r.owner.grade, null);
  assert.match(r.owner.note, /ダウンロードされるファイルなので、サイトの守りの点数は付けていません/);
});
test('実サイト観測の再構成: GoogleのHSTSなしにはプリロードの未確認を添える', () => {
  const trace = fixture('trace-clean'); Object.assign(trace.final, { host: 'www.google.com', url: 'https://www.google.com/' });
  delete trace.final.headers['strict-transport-security'];
  const around = fixture('around-clean'); around.httpProbe.upgradesToHttps = false;
  const r = run({ trace, around });
  for (const id of ['O-HSTS-MISSING', 'O-NO-UPGRADE']) {
    const f = has(r, id, 15); assert.match(f.why, /HSTSプリロード一覧/); assert.match(f.why, /掲載は確認していません/); assert.equal(f.fix, MESSAGES[id].fix);
  }
});

// 各URLは合成観測に使うだけで、接続しない。
const redirectCases = {
  spoof: 'https://amazon.co.jp.account-check.xyz/signin',
  clean: 'https://ordinary.org/',
  entries: ['https://bit.ly/test', 'https://t.co/test', 'https://www.google.com/url?url=https%3A%2F%2Fordinary.org%2F'],
  sameBrand: ['https://www.amazon.co.jp/', 'https://www.aboutamazon.jp/']
};
function redirectTrace(entry, finalUrl, middle = []) {
  const trace = fixture('trace-clean');
  const urls = [entry, ...middle];
  trace.requested = entry;
  trace.hops = urls.map((url, i) => ({ url, host: new URL(url).hostname, status: 302, location: urls[i + 1] ?? finalUrl, ms: 1 }));
  Object.assign(trace.final, { url: finalUrl, host: new URL(finalUrl).hostname, scheme: new URL(finalUrl).protocol.slice(0, -1) });
  return trace;
}
function actualRun(url, trace, lexicalOverrides = {}, injected = {}) {
  const parsed = parseInput(url);
  assert.equal(parsed.ok, true);
  const result = evaluate({ parsed, lexical: { ...analyzeLexical(parsed), ...lexicalOverrides }, trace, now }, injected);
  const validation = validateResult(result);
  assert.equal(validation.ok, true, validation.errors.join('\n'));
  for (const banned of BANNED_PHRASES) assert.equal(buildReport(result).includes(banned), false, banned);
  return result;
}
for (const entry of redirectCases.entries) test(`転送先のブランド偽装を検出 ${new URL(entry).host}`, () => {
  const result = actualRun(entry, redirectTrace(entry, redirectCases.spoof));
  const direct = actualRun(redirectCases.spoof, redirectTrace(redirectCases.spoof, redirectCases.spoof));
  assert.equal(result.visitor.level, 'danger');
  for (const f of direct.findings.filter(f => f.status === 'bad')) {
    assert.equal(has(result, f.id, f.points).floor, f.floor);
    assert.match(finding(result, f.id).evidence[0], /最終ページ/);
  }
  assert.equal(result.findings.filter(f => f.id === 'V-BRAND-SUBDOMAIN').length, 1);
  if (new URL(entry).host.includes('google')) {
    assert.match(has(result, 'V-OFFICIAL-DOMAIN', 0, 'info').what, /入口は公式.*転送先は別/);
  }
});
test('途中の偽装ドメインを最終ページが通常でも示す', () => {
  const entry = redirectCases.entries[0];
  const result = actualRun(entry, redirectTrace(entry, redirectCases.clean, [redirectCases.spoof]));
  assert.equal(result.visitor.level, 'danger');
  assert.match(has(result, 'V-BRAND-SUBDOMAIN', 9).evidence[0], /転送の途中/);
});
test('入力と転送先で同じ所見を二重加点せず、高い点の根拠とfloorを採る', () => {
  const entry = redirectCases.spoof;
  const finalUrl = entry.replace('account-check', 'account-check-other');
  const trace = redirectTrace(entry, finalUrl, [finalUrl]);
  const result = actualRun(entry, trace);
  const direct = actualRun(entry, redirectTrace(entry, entry));
  assert.equal(result.visitor.points, direct.visitor.points);
  assert.equal(new Set(result.findings.map(f => f.id)).size, result.findings.length);
  assert.match(has(result, 'V-BRAND-SUBDOMAIN', 9).evidence[0], /入力/);
  const low = actualRun(entry, trace, { brand: { official: null, subdomain: [], typo: [], keyword: [{ where: 'path', keyword: 'amazon' }] }, sensitiveWords: [] });
  assert.equal(has(low, 'V-BRAND-KEYWORD', 7).floor, null);
  assert.match(finding(low, 'V-BRAND-KEYWORD').evidence[0], /転送の途中/);
  assert.equal(low.visitor.level, 'danger');
});
test('同じホストへの転送では入力の字面の所見を維持する', () => {
  const entry = redirectCases.spoof;
  const result = actualRun(entry, redirectTrace(entry, entry + '/more'));
  assert.match(has(result, 'V-BRAND-SUBDOMAIN', 9).evidence[0], /入力/);
});
test('公式入口から同じブランドの別の公式ドメインならgoodを維持する', () => {
  const [entry, finalUrl] = redirectCases.sameBrand;
  has(actualRun(entry, redirectTrace(entry, finalUrl)), 'V-OFFICIAL-DOMAIN', 0, 'good');
});
test('公式入口でも途中に別ブランドの登録ドメインがあればinfoにする', () => {
  const [entry, finalUrl] = redirectCases.sameBrand;
  has(actualRun(entry, redirectTrace(entry, finalUrl, [redirectCases.clean])), 'V-OFFICIAL-DOMAIN', 0, 'info');
});
for (const id of ['V-HOMOGRAPH', 'V-BRAND-TYPO', 'V-SENSITIVE-WORDS', 'V-TLD-RISKY', 'V-LABEL-ODD', 'V-DEEP-SUBDOMAIN']) test(`転送先で見た目ルールを評価 ${id}`, () => {
  const entry = redirectCases.entries[0];
  const overrides = lexicalCases.find(([key]) => key === id)[1];
  const result = actualRun(entry, redirectTrace(entry, redirectCases.clean), {}, {
    parseInput: url => parsedOf(url),
    analyzeLexical: parsed => lexicalOf(parsed, overrides)
  });
  const [, , points, floor] = lexicalCases.find(([key]) => key === id);
  assert.equal(has(result, id, points).floor, floor);
  assert.match(finding(result, id).evidence[0], /最終ページ/);
});
test('入力固有の所見は転送先に適用しない', () => {
  const entry = redirectCases.entries[0];
  const all = Object.assign({}, ...lexicalCases.map(([, overrides]) => overrides));
  const result = actualRun(entry, redirectTrace(entry, redirectCases.clean), {}, { analyzeLexical: parsed => lexicalOf(parsed, all) });
  no(result, 'V-USERINFO', 'V-IP-HOST', 'V-LONG-URL', 'V-ENCODED', 'V-REDIRECT-PARAM', 'V-PUNYCODE');
  assert.equal(has(result, 'V-SHORTENER', 1).evidence[0], 'bit.ly');
});
test('最終応答が取得できなくても途中の偽装を根拠にする', () => {
  const entry = redirectCases.entries[0], trace = redirectTrace(entry, redirectCases.clean, [redirectCases.spoof]);
  Object.assign(trace, { ok: false, final: null, html: null, error: { code: 'timeout', stage: 'timeout', host: 'ordinary.org', detail: null } });
  const result = actualRun(entry, trace);
  assert.equal(result.visitor.level, 'danger');
  assert.match(has(result, 'V-BRAND-SUBDOMAIN', 9).evidence[0], /転送の途中/);
});
test('解説記事のブランド確認文脈は入力欄もフォームもなければlow/2点', () => {
  const trace = fixture('trace-clean');
  Object.assign(trace.html, { title: 'Amazonのログイン方法を確認する', h1: null, siteName: null, forms: [], passwordFields: 0 });
  const result = run({ trace });
  const f = has(result, 'V-BRAND-CONTENT', 2);
  assert.equal(f.severity, 'low'); assert.equal(f.floor, null);
  assert.equal(result.visitor.level, 'ok'); assert.equal(result.visitor.points, 2);
  assert.match(f.what, /入力欄は見つかりませんでした.*解説記事/);
});
for (const field of ['hasPassword', 'hasCardLike', 'hasEmail']) test(`ブランド内容の入力欄は9点 ${field}`, () => {
  const trace = fixture('trace-clean');
  trace.html.title = 'Amazon'; trace.html.h1 = null; trace.html.siteName = null;
  trace.html.forms[0][field] = true;
  const result = run({ trace });
  assert.equal(has(result, 'V-BRAND-CONTENT', 9).floor, 'warn');
  assert.equal(result.visitor.level, 'warn'); assert.equal(result.visitor.points, 9);
});
test('userContentHostでは公式ブランドの本文免除を使わない', () => {
  const trace = fixture('trace-clean'); trace.html.title = 'Amazon アカウント確認'; trace.html.passwordFields = 1;
  const parsed = parsedOf(trace.final.url);
  const result = evaluate({ parsed, lexical: lexicalOf(parsed, { userContentHost: true, brand: { official: { id: 'amazon', name: 'Amazon' }, subdomain: [], typo: [], keyword: [] } }), trace, now }, { ...deps, findOfficialBrand: () => ({ id: 'amazon', name: 'Amazon' }) });
  has(result, 'V-BRAND-CONTENT', 9); no(result, 'V-OFFICIAL-DOMAIN');
});
test('一覧未掲載のブランド所見は別サービスの余地を残す', () => {
  for (const id of ['V-BRAND-SUBDOMAIN', 'V-BRAND-TYPO', 'V-BRAND-KEYWORD']) {
    const overrides = lexicalCases.find(([key]) => key === id)[1];
    const f = finding(run({ lexical: overrides, trace: null }), id);
    assert.match(f.what, /この診断の公式ドメイン一覧にはありません/);
    assert.match(f.why, /届いたリンクではなく、公式のアプリや、自分で開いたブックマークから確かめて/);
    assert.doesNotMatch(f.what + f.why, /公式とは別|公式ドメインとは別|偽/);
    if (id === 'V-BRAND-SUBDOMAIN') assert.match(f.what, /見分けにくい並び/);
    else assert.match(f.why, /提携会社・地域の団体/);
  }
});
test('同じjQueryの版とCVEはCDNが複数でも6点だけ減点する', () => {
  const trace = fixture('trace-clean');
  const sources = ['https://code.jquery.com/jquery-3.4.1.min.js', 'https://ajax.googleapis.com/ajax/libs/jquery/3.4.1/jquery.min.js'];
  trace.html.scripts.external = sources.map(src => ({ src, host: new URL(src).host, scheme: 'https', sri: true, async: false, defer: false, module: false }));
  const result = run({ trace });
  assert.equal(result.owner.score, 94);
  const f = has(result, 'O-VULN-LIB', 6);
  assert.equal(f.evidence.length, 1);
  assert.match(f.evidence[0], /複数の配信元から読み込み.*code.jquery.com.*ajax.googleapis.com/);
  assert.equal(result.owner.topFixes.find(f => f.id === 'O-VULN-LIB').gain, 6);
});
test('HSTS解除とヘッダーなしを区別し、どちらも15点とする', () => {
  const trace = fixture('trace-clean');
  trace.final.headers['strict-transport-security'] = 'max-age=0';
  let result = run({ trace });
  assert.equal(result.owner.score, 85);
  assert.match(has(result, 'O-HSTS-MISSING', 15).evidence.join(' '), /max-age=0（保護の解除）/);
  assert.match(buildReport(result), /保護を解除/);
  delete trace.final.headers['strict-transport-security'];
  result = run({ trace });
  assert.deepEqual(has(result, 'O-HSTS-MISSING', 15).evidence, ['ヘッダーなし']);
});
test('security.txtの窓口と画像の説明が報告書でも一致する', () => {
  const trace = fixture('trace-clean'); trace.html.images.http = 1;
  const result = run({ trace });
  const f = has(result, 'O-SECURITY-TXT', 0, 'good');
  assert.match(f.why, /問題を見つけた人が、運営者へ連絡するための窓口/);
  assert.ok(buildReport(result).includes(f.why));
  assert.match(has(result, 'O-MIXED-PASSIVE', 3).what, /画像/);
  assert.doesNotMatch(JSON.stringify(finding(result, 'O-MIXED-PASSIVE')), /メディア/);
});
test('転送パラメータは別登録ドメインの文面と判定にそろえる', () => {
  const urls = ['https://example.com/?next=https://sub.example.com/', 'https://example.com/?next=https://ordinary.org/'];
  no(actualRun(urls[0], null), 'V-REDIRECT-PARAM');
  const f = has(actualRun(urls[1], null), 'V-REDIRECT-PARAM', 3);
  assert.match(f.what, /別のドメイン/); assert.match(f.why, /別のドメイン/);
});
