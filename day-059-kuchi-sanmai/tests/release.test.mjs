// 公開物（index.html・assets/・sample/・legal/）が、100日チャレンジ版の約束どおりに組まれているかを確かめる。
// 口パクの判定・音声・録画のテストは source/ の vitest が受け持つ。公開ページの動きは tests/e2e/day-059.spec.mjs が見る。
// .precheck-ng.txt（非公開のNG語）が無い環境でも動くよう、具体的な名前は書かず「形」で確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (name) => readFileSync(join(root, name), 'utf8');
const meta = JSON.parse(read('meta.json'));
const html = read('index.html');
const appName = read('source/src/appName.ts').match(/export const APP_NAME = '([^']+)'/)?.[1];
const bundles = readdirSync(join(root, 'assets')).filter((name) => name.endsWith('.js'));
const bundleText = bundles.map((name) => read(`assets/${name}`)).join('\n');

/** フォルダの中のテキストを全部たどる（node_modules と dist は除く） */
const walk = (dir) =>
  readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isSymbolicLink() || ['node_modules', 'dist'].includes(entry.name)) return [];
    if (entry.isDirectory()) return walk(path);
    return /\.(?:ts|tsx|mjs|js|css|html|json|md|txt)$/.test(entry.name) ? [path] : [];
  });

test('meta.json と、画面の名前・題名がそろっている', () => {
  assert.equal(meta.day, 59);
  assert.equal(meta.name, 'day-059-kuchi-sanmai');
  assert.equal(meta.status, 'published');
  assert.equal(meta.publicUrl, 'https://hundred-days.pages.dev/day-059-kuchi-sanmai/');
  assert.ok(appName, 'source/src/appName.ts に APP_NAME がない');
  assert.equal(meta.title, appName);
  assert.match(html, new RegExp(`<title>${appName}</title>`));
  assert.match(read('source/index.html'), new RegExp(`<title>${appName}</title>`));
  assert.ok(bundleText.includes(appName), 'ビルド結果に APP_NAME が入っていない');
  // 制作時間は計っていない。0 のままにして、推測の数字を入れない
  assert.equal(meta.actualMinutes, 0);
  for (const key of ['screenshot', 'demo']) {
    if (meta[key]) assert.ok(existsSync(join(root, meta[key])), `${meta[key]} がない`);
  }
});

test('ビルド結果の index.html は相対パスだけを使い、指している実物がある', () => {
  const rooted = [...html.matchAll(/\b(?:src|href)="(\/[^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(rooted, []);
  const local = [...html.matchAll(/\b(?:src|href)="\.\/([^"]+)"/g)].map((match) => match[1]);
  assert.ok(local.some((file) => /^assets\/.+\.js$/.test(file)), 'アプリ本体のJSを読んでいない');
  assert.ok(local.includes('favicon.svg'));
  for (const file of local) assert.ok(existsSync(join(root, file)), `${file} がない`);
  // JSからも根元を指さない（見本とライセンス表示は ./sample/ と ./legal/ で読む）
  assert.doesNotMatch(bundleText, /["'`]\/(?:(?:assets|sample|legal)\/|favicon\.svg)/);
  assert.match(bundleText, /["'`]\.\/legal\/THIRD_PARTY_NOTICES\.txt["'`]/);
  assert.match(bundleText, /fetch\(["'`]\.\/sample\//);
  // CSP はサイトの _headers が付ける。開発サーバー用の ws: も持ち込まない
  assert.doesNotMatch(html, /http-equiv="Content-Security-Policy"|ws:\/\//);
});

test('共通の共有部品を読み、共有の窓を持つ', () => {
  assert.match(html, /<script src="shared\/share\.js" defer><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="shared\/share\.css" \/>/);
  assert.match(html, /<dialog id="share-dialog"[^>]*>[\s\S]*<div id="share"><\/div>[\s\S]*<\/dialog>/);
  assert.ok(existsSync(join(root, 'shared/share.js')));
  assert.ok(bundleText.includes('100 DAYS / 059'), '一覧へ戻る帯がない');
});

test('ライセンス表示を同梱し、認証版の SERVER 版は配らない', () => {
  assert.deepEqual(readdirSync(join(root, 'legal')), ['THIRD_PARTY_NOTICES.txt']);
  assert.ok(!existsSync(join(root, 'source/public/legal/SERVER_THIRD_PARTY_NOTICES.txt')));
  const notices = read('legal/THIRD_PARTY_NOTICES.txt');
  assert.equal(notices.split('\n')[0], `${appName} — Third-Party Software Notices`);
  const listed = [...notices.matchAll(/^- (\S+) (\S+) \((\S+)\)$/gm)].map(([, name, , license]) => `${name}:${license}`);
  assert.deepEqual(listed.sort(), [
    'fix-webm-duration:MIT', 'react-dom:MIT', 'react:MIT', 'rolldown:MIT', 'scheduler:MIT', 'tailwindcss:MIT', 'vite:MIT', 'zustand:MIT',
  ]);
  assert.equal(notices, read('source/public/legal/THIRD_PARTY_NOTICES.txt'), 'ソースの表示とビルド結果がずれている');
  assert.doesNotMatch(notices, /better-auth|wrangler|miniflare/i);
});

test('見本は自作のロボット4枚とテスト音（と来歴の説明）だけ', () => {
  assert.deepEqual(readdirSync(join(root, 'sample')).sort(), [
    'README.md', 'blink.png', 'demo-tone.wav', 'mouth-closed.png', 'mouth-open.png', 'mouth-small.png',
  ]);
  for (const name of ['blink.png', 'mouth-closed.png', 'mouth-open.png', 'mouth-small.png']) {
    const png = readFileSync(join(root, 'sample', name));
    // IHDR の幅・高さ。4枚とも同じ大きさなので、口の切り替えでずれない
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [512, 640], name);
  }
  const wav = readFileSync(join(root, 'sample/demo-tone.wav'));
  assert.equal(wav.toString('latin1', 0, 4), 'RIFF');
  assert.deepEqual([wav.readUInt16LE(22), wav.readUInt32LE(24), wav.readUInt16LE(34)], [1, 48_000, 16]);
  assert.equal(wav.readUInt32LE(40) / (48_000 * 2), 14, 'テスト音は14秒');
  assert.match(read('sample/README.md'), /第三者の素材は含みません/);
});

test('ビルド結果とソースに、個人の表記（メールアドレス・手元の絶対パス）が無い', () => {
  // 第三者ライセンスの全文は原文のまま残す決まりなので、この検査からは外す
  const published = ['index.html', 'README.md', 'meta.json', 'sample/README.md', ...readdirSync(join(root, 'assets')).map((name) => `assets/${name}`)];
  const source = walk('source').filter((path) => !path.endsWith('package-lock.json') && !path.startsWith('source/public/legal/'));
  assert.ok(source.length > 40, 'ソースを数え損ねている');
  for (const file of [...published, ...source]) {
    const text = read(file);
    assert.doesNotMatch(text, /[\w.+-]+@[\w-]+\.[a-z]{2,}/i, `${file} にメールアドレスの形の文字列がある`);
    assert.doesNotMatch(text, /\/Users\/|\/home\/[a-z]/, `${file} に手元の絶対パスがある`);
  }
  // 運営者の表記は 100 DAYS / 100 APPS のもの。お問い合わせは X と GitHub の Issue
  const policies = read('source/src/legal/policies.ts');
  assert.match(policies, /name: '100 DAYS \/ 100 APPS（haranishi）'/);
  for (const text of [policies, bundleText]) {
    assert.ok(text.includes('https://x.com/haranishi_ikki'));
    assert.ok(text.includes('https://github.com/haranishi/hundred-days/issues'));
    assert.ok(text.includes('https://hundred-days.pages.dev/privacy.html'));
  }
});

test('同意画面・認証版・端末への保存を持ち込んでいない', () => {
  for (const gone of ['source/src/auth', 'source/src/components/Auth', 'source/src/lib/consent.ts', 'source/src/components/Legal/ConsentBoundary.tsx', 'source/worker', 'source/src/assets']) {
    assert.ok(!existsSync(join(root, gone)), `${gone} が残っている`);
  }
  const pkg = JSON.parse(read('source/package.json'));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  assert.deepEqual(deps.filter((name) => /better-auth|wrangler|miniflare|esbuild/.test(name)), []);
  assert.deepEqual(Object.keys(pkg.scripts).filter((name) => /auth|staging|worker|harness/.test(name)), []);
  assert.doesNotMatch(bundleText, /consent-gate|同意してスタジオを開く|\/api\/auth|better-auth/);
  // 規約の文の中に「localStorage」という語は出てくるが、呼び出しは無い
  assert.doesNotMatch(bundleText, /localStorage\.|sessionStorage\.|indexedDB\.|\.setItem\(|document\.cookie/);
});

test('自前の canonical・og: を書かない（共通ビルドが meta.json から差し込む）', () => {
  assert.doesNotMatch(html, /rel="canonical"|property="og:|name="twitter:/);
  assert.ok(statSync(join(root, 'favicon.svg')).size > 0);
});
