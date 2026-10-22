import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsp, evaluateCsp, parseHsts, classifyCookies, isSessionLikeCookie, headerFindings } from '../lib/headers.js';
import { visitorLevel, gradeOf, ownerScore } from '../lib/score.js';
import { detectEol } from '../lib/eol.js';
import { detectLibs, compareVersions } from '../lib/libs.js';

const csp = value => evaluateCsp({ 'content-security-policy': value });
test('CSP: 空白・大文字小文字・最初の重複・prototype名', () => {
  const p = parseCsp(" SCRIPT-SRC  'self' ; script-src *; DEFAULT-SRC 'none'; constructor x ");
  assert.deepEqual(p['script-src'], ["'self'"]);
  assert.deepEqual(p.constructor, ['x']);
  assert.equal(Object.getPrototypeOf(p), null);
});
test('CSP: scriptのfallback、style/imgだけの広い許可を除外', () => {
  assert.deepEqual(csp("default-src 'unsafe-inline' https:; script-src 'self'; style-src 'unsafe-inline'; img-src data:").issues, []);
  assert.deepEqual(csp("default-src 'unsafe-inline' 'unsafe-eval' * https: http: data:").issues, ["'unsafe-inline'", "'unsafe-eval'", '*', 'https:', 'http:', 'data:']);
});
test('CSP: nonce/hash/strict-dynamicでinlineを無視、evalは残す', () => {
  for (const token of ["'nonce-YWJj'", "'sha256-YWJj='", "'strict-dynamic'"]) assert.deepEqual(csp(`script-src 'unsafe-inline' ${token} 'unsafe-eval'`).issues, ["'unsafe-eval'"]);
  assert.deepEqual(csp("script-src 'strict-dynamic' 'nonce-YWJj' https: * 'unsafe-inline'").issues, []);
});
test('CSP: Report-Only・metaではframe-ancestorsが効かない', () => {
  assert.equal(evaluateCsp({ 'content-security-policy-report-only': "frame-ancestors 'none'" }).present, false);
  const meta = evaluateCsp({}, { signals: { metaCsp: true } });
  assert.equal(meta.metaOnly, true); assert.equal(meta.hasFrameAncestors, false);
  assert.equal(csp("frame-ancestors 'none'").hasFrameAncestors, true);
  assert.equal(csp("default-src 'self', frame-ancestors 'none'").hasFrameAncestors, true);
});
test('CSP: script-src/default-srcがないポリシーをコード制限ありと判定しない', () => {
  assert.deepEqual(csp("frame-ancestors 'none'; img-src 'self'").issues, ['コードの読み込み元を制限する指定なし']);
  assert.deepEqual(csp('script-src').issues, []);
  assert.deepEqual(csp("default-src 'none'").issues, []);
});
test('CSP: すべてのサイトへ埋め込みを許す指定を防御ありと判定しない', () => {
  assert.equal(csp('frame-ancestors *').hasFrameAncestors, false);
  assert.equal(headerFindings({ scheme: 'https', headers: { 'content-security-policy': "default-src 'self'; frame-ancestors *" }, cookies: [] }).frame, false);
  assert.equal(headerFindings({ scheme: 'https', headers: { 'content-security-policy': "default-src 'self'; frame-ancestors *", 'x-frame-options': 'DENY' }, cookies: [] }).frame, false);
  assert.equal(csp("frame-ancestors *; frame-ancestors 'none'").hasFrameAncestors, false);
  assert.equal(csp("frame-ancestors *, frame-ancestors 'none'").hasFrameAncestors, true);
});
test('HSTS: 不正値・ゼロ・重複・大文字・境界', () => {
  for (const value of ['', 'max-age=0', 'max-age=-1', 'max-age=no', 'max-age=10; max-age=20', 'max-age=1.5', 'max-age="12', 'max-age=12"']) assert.equal(parseHsts(value).valid, false, value);
  assert.deepEqual(parseHsts('MAX-AGE="15552000"; includeSubDomains; preload'), { maxAge: 15552000, includeSubDomains: true, preload: true, valid: true });
});
test('Cookie: セッション名推定と除外、各属性とprefix条件', () => {
  for (const name of ['PHPSESSID', 'sid', 'Auth', 'login', 'JWT', 'csrfToken', 'xsrf']) assert.equal(isSessionLikeCookie(name), true);
  for (const name of ['_ga', '_gid', '_gcl_auth', '_fbp', '__cf_bm', 'cf_clearance', 'preferences']) assert.equal(isSessionLikeCookie(name), false);
  const cookie = { name: '__Host-session', secure: true, httpOnly: true, sameSite: 'none', path: '/', hasDomain: false };
  assert.deepEqual(classifyCookies([cookie], { https: true }), { secureMissing: [], httpOnlyMissing: [], sameSiteMissing: [], invalid: [] });
  for (const patch of [{ secure: false }, { path: '/app' }, { hasDomain: true }]) assert.deepEqual(classifyCookies([{ ...cookie, ...patch }], { https: true }).invalid, [cookie.name]);
  assert.deepEqual(classifyCookies([{ ...cookie, name: 'session', secure: false, httpOnly: false, sameSite: null }], { https: false }), { secureMissing: [], httpOnlyMissing: ['session'], sameSiteMissing: ['session'], invalid: [] });
});
test('ヘッダーの実効: XFO/XCTO/Referrer、metaとReport-Only', () => {
  for (const value of ['DENY', 'sameorigin']) assert.equal(headerFindings({ scheme: 'https', headers: { 'x-frame-options': value }, cookies: [] }).frame, true);
  assert.equal(headerFindings({ scheme: 'https', headers: { 'x-frame-options': 'ALLOW-FROM other' }, cookies: [] }).frame, false);
  const hf = headerFindings({ scheme: 'https', headers: { 'content-security-policy': "frame-ancestors 'none'", 'x-content-type-options': 'NOSNIFF', 'referrer-policy': 'unknown, no-referrer' }, cookies: [] });
  assert.equal(hf.frame, true); assert.equal(hf.xcto, true); assert.equal(hf.referrer, true);
  assert.equal(headerFindings({ scheme: 'https', headers: {}, cookies: [] }, { signals: { metaReferrer: 'strict-origin-when-cross-origin' } }).referrer, true);
  assert.equal(headerFindings({ scheme: 'https', headers: { 'referrer-policy': 'nonsense' }, cookies: [] }).referrer, false);
});
for (const [points, expected] of [[0, 'ok'], [2, 'ok'], [3, 'note'], [5, 'note'], [6, 'warn'], [9, 'warn'], [10, 'danger'], [100, 'danger']]) test(`訪問者の境界 ${points}`, () => assert.equal(visitorLevel(points, []), expected));
test('floorは合計点で下げない', () => { assert.equal(visitorLevel(0, ['warn']), 'warn'); assert.equal(visitorLevel(0, [null, 'danger']), 'danger'); });
for (const [score, grade] of [[null, null], [0, 'F'], [39, 'F'], [40, 'D'], [59, 'D'], [60, 'C'], [74, 'C'], [75, 'B'], [89, 'B'], [90, 'A'], [100, 'A']]) test(`運営者の評点境界 ${score}`, () => assert.equal(gradeOf(score), grade));
test('運営者の点数は訪問者と混ぜず0で止める', () => {
  assert.equal(ownerScore([{ axis: 'visitor', status: 'bad', points: 100 }, { axis: 'owner', status: 'bad', points: 15 }]), 85);
  assert.equal(ownerScore([{ axis: 'owner', status: 'bad', points: 150 }]), 0);
});
test('EOL: PHP/Apache/IIS、現行/版なし/nginxを除外、日付注入', () => {
  const headers = { server: 'Apache/2.2.15 Microsoft-IIS/7.5 nginx/1.0.0', 'x-powered-by': 'PHP/7.4.33' };
  assert.deepEqual(detectEol(headers, Date.UTC(2026, 9, 22)).map(e => [e.product, e.series, e.eolDate]), [['PHP', '7.4', '2022-11-28'], ['Apache', '2.2', '2017-12'], ['IIS', '7.5', '2024-01-09']]);
  assert.equal(detectEol({ server: 'Apache/2.4.1 Microsoft-IIS/10.0 nginx/1.0', 'x-powered-by': 'PHP/8.2.1' }, new Date('2026-10-22')).length, 0);
  assert.equal(detectEol({ 'x-powered-by': 'PHP/8.2.1' }, new Date('2027-01-01')).length, 1);
  assert.equal(detectEol({ server: 'Apache', 'x-powered-by': 'PHP' }, Date.now()).length, 0);
  assert.equal(detectEol({ server: 'Microsoft-IIS/8.5' }, new Date('2026-10-13')).length, 0);
  assert.equal(detectEol({ server: 'Microsoft-IIS/8.5' }, new Date('2026-10-14')).length, 1);
});
test('版の比較は数値', () => {
  assert.equal(compareVersions('1.12.4', '3.5.0'), -1); assert.equal(compareVersions('4.17.12', '4.9.99'), 1); assert.equal(compareVersions('3.5.0', '3.5.0'), 0);
});
const refs = paths => paths.map(src => ({ src }));
test('ライブラリ: 正式CDN/ローカルの完全版、jquery-uiを区別', () => {
  const urls = ['https://code.jquery.com/jquery-1.12.4.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jquery/1.12.4/jquery.min.js', 'https://cdn.jsdelivr.net/npm/jquery@1.12.4/dist/jquery.min.js', 'https://ajax.googleapis.com/ajax/libs/jquery/1.12.4/jquery.min.js', '/js/jquery-1.12.4.min.js'];
  for (const url of urls) assert.equal(detectLibs(refs([url]))[0]?.version, '1.12.4', url);
  const own = { src: 'https://shop.example/js/jquery-1.12.4.min.js' };
  assert.equal(detectLibs([own], { selfHost: 'shop.example' })[0].lib, 'jquery');
  assert.deepEqual(detectLibs([own]), []);
  const ui = detectLibs(refs(['https://code.jquery.com/ui/1.12.1/jquery-ui.min.js']))[0];
  assert.equal(ui.lib, 'jquery-ui'); assert.deepEqual(ui.advisories.map(a => a.id), ['CVE-2021-41184', 'CVE-2022-31160']);
});
test('ライブラリ: 偽CDN・query/fragment・版不明・範囲・別名を採用しない', () => {
  const urls = ['https://code.jquery.com.evil.example/jquery-1.12.4.min.js', 'https://evil.example/ajax/libs/jquery/1.12.4/jquery.min.js', 'https://code.jquery.com/jquery.min.js?v=1.12.4', 'https://code.jquery.com/jquery.min.js#jquery-1.12.4.min.js', 'https://cdn.jsdelivr.net/npm/jquery@latest/dist/jquery.js', 'https://cdn.jsdelivr.net/npm/jquery@3/dist/jquery.js', 'https://unpkg.com/jquery@^3.0.0', '/js/jquery-ui-other-1.12.4.min.js', 'https://unpkg.com/lodash-es@4.17.15/lodash.js'];
  for (const url of urls) assert.deepEqual(detectLibs(refs([url])), [], url);
});
for (const [lib, version, expected] of [
  ['jquery', '1.0.2', []], ['jquery', '1.0.3', ['CVE-2020-11023']], ['jquery', '1.1.4', ['CVE-2019-11358', 'CVE-2020-11023']], ['jquery', '3.4.0', ['CVE-2020-11023']], ['jquery', '3.5.0', []],
  ['jquery-ui', '1.13.0', ['CVE-2022-31160']], ['jquery-ui', '1.13.2', []],
  ['bootstrap', '2.9.9', []], ['bootstrap', '3.0.0', ['CVE-2019-8331']], ['bootstrap', '3.4.1', []], ['bootstrap', '4.0.0', ['CVE-2019-8331']], ['bootstrap', '4.3.1', []],
  ['lodash', '4.17.11', ['CVE-2019-10744']], ['lodash', '4.17.12', ['CVE-2020-8203']], ['lodash', '4.17.19', []],
  ['moment', '2.17.9', []], ['moment', '2.18.0', ['CVE-2022-31129']], ['moment', '2.29.4', []], ['angular', '1.8.3', ['AngularJS-EOL']], ['vue', '2.7.16', ['Vue2-EOL']], ['vue', '3.0.0', []]
]) test(`助言の境界 ${lib} ${version}`, () => {
  const urls = { src: `https://unpkg.com/${lib}@${version}/index.js` };
  const item = detectLibs([urls])[0]; assert.deepEqual(item.advisories.map(a => a.id), expected);
  if (lib === 'lodash' && version === '4.17.12') assert.equal(item.advisories[0].candidate, true);
});

for (const [product, header, series] of [
  ['PHP', 'PHP', '4.4'], ['PHP', 'PHP', '5.0'], ['PHP', 'PHP', '5.3'], ['PHP', 'PHP', '5.5'],
  ['Apache', 'Apache', '1.3'], ['Apache', 'Apache', '2.0'],
  ['IIS', 'Microsoft-IIS', '4.0'], ['IIS', 'Microsoft-IIS', '5.0'], ['IIS', 'Microsoft-IIS', '5.1']
]) test(`表の最古より古い系統 ${product}/${series}`, () => {
  for (const now of ['2000-01-01', '2026-10-22', 'invalid']) {
    const found = detectEol({ server: `${header}/${series}` }, new Date(now));
    assert.equal(found.length, 1); assert.equal(found[0].product, product); assert.equal(found[0].series, series);
    assert.equal(found[0].eolDate, null); assert.match(found[0].detail, /上流の保守が終了済みの古い系統/);
    assert.match(found[0].detail, /配布元の延長保守・修正の適用はこの診断では確認できません/);
  }
});

test('同じライブラリと版の配信元をまとめ、同じホストを重ねない', () => {
  const sources = ['https://code.jquery.com/jquery-3.4.1.min.js', 'https://ajax.googleapis.com/ajax/libs/jquery/3.4.1/jquery.min.js', 'https://code.jquery.com/jquery-3.4.1.slim.min.js'];
  const libraries = detectLibs(refs(sources));
  assert.equal(libraries.length, 1);
  assert.deepEqual(libraries[0].hosts, ['code.jquery.com', 'ajax.googleapis.com']);
  assert.equal(libraries[0].host, 'code.jquery.com');
  assert.deepEqual(libraries[0].advisories.map(a => a.id), ['CVE-2020-11023']);
});
test('別の版・別のライブラリは配信元が同じでもまとめない', () => {
  const sources = ['https://unpkg.com/jquery@3.4.1/index.js', 'https://unpkg.com/jquery@3.4.0/index.js', 'https://unpkg.com/jquery-ui@1.12.1/index.js'];
  const libraries = detectLibs(refs(sources));
  assert.equal(libraries.length, 3);
  assert.deepEqual(libraries.map(l => [l.lib, l.version]), [['jquery', '3.4.1'], ['jquery', '3.4.0'], ['jquery-ui', '1.12.1']]);
});
