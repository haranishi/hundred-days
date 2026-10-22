import test from 'node:test';
import assert from 'node:assert/strict';
import { registrableDomain } from '../lib/psl.js';
import { FREE_HOSTS, SHORTENERS, RESTRICTED_JP, RISKY_TLDS } from '../lib/lists.js';

const vectors = [
  ['www.amazon.co.jp', 'amazon.co.jp', 'co.jp', ['www']],
  ['www.example.com', 'example.com', 'com', ['www']],
  ['x.y.company.co.uk', 'company.co.uk', 'co.uk', ['x', 'y']],
  ['tenant.pages.dev', 'tenant.pages.dev', 'pages.dev', []],
  ['www.evil.github.io', 'evil.github.io', 'github.io', ['www']],
  ['sites.google.com', 'google.com', 'com', ['sites']],
  ['LOCALHOST', 'localhost', 'localhost', []],
  ['127.0.0.1', '127.0.0.1', '127.0.0.1', []],
  ['0x7f000001', '0x7f000001', '0x7f000001', []],
  ['127.1', '127.1', '127.1', []],
  ['[::1]', '[::1]', '[::1]', []],
  ['WWW.EXAMPLE.COM.', 'example.com', 'com', ['www']],
  ['co.jp', 'co.jp', 'co.jp', []], ['', '', '', []]
];
for (const [host, registrable, suffix, subdomainLabels] of vectors) test(`登録境界: ${host}`, () => {
  const result = registrableDomain(host);
  assert.equal(result.registrable, registrable);
  assert.equal(result.suffix, suffix);
  assert.deepEqual(result.subdomainLabels, subdomainLabels);
});
test('指定された2階層サフィックスをすべて保持する', () => {
  const suffixes = [...RESTRICTED_JP, 'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.kr', 'or.kr', 'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'com.tw', 'com.hk', 'com.sg', 'com.my', 'co.in', 'co.id', 'co.th', 'com.br', 'com.mx', 'com.tr', 'co.za', 'com.ar'];
  for (const suffix of suffixes) assert.equal(registrableDomain('www.tenant.' + suffix).registrable, 'tenant.' + suffix);
});
test('第三者公開先18件は登録境界の表と一致する', () => {
  assert.equal(Object.keys(FREE_HOSTS).length, 18);
  for (const suffix of Object.keys(FREE_HOSTS)) assert.deepEqual(registrableDomain('sub.tenant.' + suffix).subdomainLabels, ['weebly.com', 'weeblysite.com', 'canva.site'].includes(suffix) ? ['sub', 'tenant'] : ['sub']);
});
test('短縮URL24件・TLD3件の構成は指定どおり', () => {
  assert.equal(SHORTENERS.thirdParty.length, 16);
  assert.equal(Object.keys(SHORTENERS.official).length, 8);
  assert.deepEqual(RISKY_TLDS, ['xin', 'icu', 'cfd']);
  assert.equal(new Set([...SHORTENERS.thirdParty, ...Object.keys(SHORTENERS.official)]).size, 24);
});
