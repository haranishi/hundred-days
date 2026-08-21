import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/* dist/_headers は scripts/build.mjs の生成物。Cloudflare Pages がこれを読んでヘッダを足す。

   ここで見ているのは「公開する全アプリにCSPが付いているか」。Dayを増やすときに
   生成の仕組みを壊しても、ヘッダは付かなくなるだけでページは普通に表示される＝画面では気付けない。
   ヘッダが実際に適用されるかは Cloudflare の実装（wrangler pages dev）でしか確かめられないので、
   CIでは生成物の中身を検査する。 */

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const headers = readFileSync(join(dist, '_headers'), 'utf8');

/** _headers を「パス → そのパスに付くヘッダ行」へ分解する */
const parse = (text) => {
  const rules = new Map();
  let current = null;
  for (const raw of text.split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!raw.startsWith(' ')) {
      current = raw.trim();
      rules.set(current, []);
    } else if (current) {
      rules.get(current).push(raw.trim());
    }
  }
  return rules;
};

const rules = parse(headers);
const publishedApps = readdirSync(dist, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^day-\d{3}-/.test(entry.name))
  .map((entry) => entry.name)
  .filter((name) => existsSync(join(dist, name, 'index.html')));

test('全ページに枠内表示の禁止と端末機能の制限が付く', () => {
  const global = rules.get('/*');
  expect(global, '/* の指定が無い').toBeTruthy();
  expect(global.join('\n')).toContain('X-Frame-Options: DENY');
  expect(global.join('\n')).toContain('Permissions-Policy:');
  expect(global.join('\n')).toContain('X-Content-Type-Options: nosniff');
});

test('公開する全アプリにCSPが付く', () => {
  expect(publishedApps.length, '公開アプリが1つも見つからない').toBeGreaterThan(0);
  for (const dir of publishedApps) {
    const csp = (rules.get(`/${dir}/*`) || []).find((line) => line.startsWith('Content-Security-Policy:'));
    expect(csp, `${dir} にCSPが付いていない`).toBeTruthy();
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  }
});

/* CSPへの足し忘れは画面に何も出ない。ローカルのテストは上流を差し替えて動かすので気付けず、
   本番だけが黙って止まる（Day 014で実際に起きた）。コードに書いてある接続先と、そのDayのCSPが
   食い違っていないかを機械で突き合わせる。

   見るのは「変数に入れたURL」と「fetch等に直接渡したURL」だけ。プレースホルダや説明のリンク、
   href に入れるだけのURLは接続ではないので数えない。組み立ててから渡す書き方（`https://${host}/…`）は
   拾えないので、これは足し忘れの多くを捕まえる網であって、完全な保証ではない。 */
const CONNECT_PATTERNS = [
  /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*[`'"]https:\/\/([a-z0-9.-]+)/gi,
  /(?:fetch|EventSource|WebSocket)\(\s*[`'"]https:\/\/([a-z0-9.-]+)/gi,
];

const connectSources = (dir) => {
  const csp = (rules.get(`/${dir}/*`) || []).find((line) => line.startsWith('Content-Security-Policy:')) ?? '';
  const found = csp.split(';').find((part) => part.trim().startsWith('connect-src'));
  return (found ?? '').trim().split(/\s+/).slice(1);
};

const allows = (sources, host) =>
  sources.some((source) => {
    const pattern = source.replace(/^https:\/\//, '');
    if (pattern === host) return true;
    return pattern.startsWith('*.') && host.endsWith(pattern.slice(1));
  });

const codeFiles = (directory) => {
  const skip = new Set(['tests', 'tools', 'shared']);
  const walk = (place) =>
    readdirSync(place, { withFileTypes: true }).flatMap((entry) => {
      if (entry.isDirectory()) return skip.has(entry.name) ? [] : walk(join(place, entry.name));
      return entry.name.endsWith('.js') && entry.name !== 'demo-scenario.mjs' ? [join(place, entry.name)] : [];
    });
  return walk(directory);
};

test('コードに書いてある接続先が、そのDayのCSPで許されている', () => {
  const appsDir = fileURLToPath(new URL('../../apps/', import.meta.url));
  let checked = 0;
  for (const dir of publishedApps) {
    const sources = connectSources(dir);
    for (const file of codeFiles(join(appsDir, dir))) {
      const code = readFileSync(file, 'utf8');
      for (const pattern of CONNECT_PATTERNS) {
        for (const [, host] of code.matchAll(pattern)) {
          checked += 1;
          expect(allows(sources, host), `${dir} は ${host} に繋ぐのに connect-src が許していない`).toBe(true);
        }
      }
    }
  }
  // 網そのものが壊れて0件検査になっていないかを確かめる（外部に繋ぐDayは実在する）
  expect(checked, '接続先が1件も見つからない＝検査が空回りしている').toBeGreaterThan(0);
});

test('外部への接続を許すのは、それが必要なDayだけ', () => {
  const day010 = (rules.get('/day-010-wikipedia-live/*') || []).join('\n');
  expect(day010, 'ウィキメディアへ繋げないと座標が引けない').toContain('https://*.wikipedia.org');

  // ほかのアプリに外部接続の許可を配らない（day-001は同一オリジンだけで完結している）
  const day001 = (rules.get('/day-001-focus-timer/*') || []).join('\n');
  expect(day001).toContain("connect-src 'self';");
  expect(day001).not.toContain('wikipedia.org');
});

test('一覧ページにCSPを付けていないことを、意図として固定する', () => {
  // インラインscriptとGA4があるためハッシュ化が必要で、まだ付けていない。
  // 付けたらこのテストを消す（枠内表示の禁止は /* の X-Frame-Options で掛かっている）
  const top = (rules.get('/') || []).join('\n');
  expect(top).not.toContain('Content-Security-Policy');
});
