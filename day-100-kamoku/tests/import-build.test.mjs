import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ImportError, importBuild, injectIndex } from '../tools/import-build.mjs';

const dayDir = fileURLToPath(new URL('..', import.meta.url));
const commit = 'a'.repeat(40);
const baseIndex = [
  '<!doctype html>', '<html lang="ja">', '<head>', '  <meta charset="utf-8">',
  '  <script type="module" src="web/shim.js"></script>', '</head>', '<body>',
  '  <div class="app" id="app">', '    <div class="main-col">', '      <div class="banners" id="banners"></div>', '    </div>', '  </div>', '</body>', '</html>', '',
].join('\n');
const scratch = [];
after(() => scratch.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function put(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

function fixture({ info = { commit }, extra = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'day100-'));
  scratch.push(root);
  const build = join(root, 'build');
  const repo = join(root, 'repo');
  const day = join(root, 'day');
  const files = {
    'index.html': baseIndex, 'favicon.svg': '<svg/>', 'build-info.json': `${JSON.stringify(info)}\n`,
    'THIRD_PARTY_LICENSES.txt': 'licenses', 'rust/pkg/kamoku_ui.js': 'export default 1;', 'rust/pkg/kamoku_ui_bg.wasm': 'wasm',
    'web/shim.js': '// shim', 'web/demo.css': '.a{}', 'web/pkg/kamoku_web.js': '// web', 'web/pkg/kamoku_web_bg.wasm': 'wasm',
    'css/base.css': 'body{}', ...extra,
  };
  for (const [path, text] of Object.entries(files)) put(build, path, text);
  put(repo, 'LICENSE-MIT', 'MIT License');
  put(repo, 'LICENSE-APACHE', 'Apache License');
  put(day, 'meta.json', JSON.stringify({ title: 'kamoku' }));
  put(day, 'day100/day100.css', '/* keep */');
  put(day, 'css/old.css', 'old');
  return { build, repo, day };
}

const run = ({ build, repo, day }, head = commit) => importBuild({ buildDir: build, repoDir: repo, dayDir: day, headOf: () => head, home: '/no/such/home' });
const rejects = (action, pattern) => assert.throws(action, (error) => error instanceof ImportError && pattern.test(error.message));

test('取り込むと、帯と共有の窓と共通の部品が1回ずつ入り、このDayの部品は残り、古い生成物は消える', () => {
  const dirs = fixture();
  run(dirs);
  const html = readFileSync(join(dirs.day, 'index.html'), 'utf8');
  for (const marker of ['class="d100-bar"', 'id="d100-share-dialog"', 'id="share"', './shared/share.js', './shared/share.css', './day100/share-open.js', 'name="share:text"']) {
    assert.equal(html.split(marker).length - 1, 1, marker);
  }
  assert.ok(html.indexOf('class="main-col"') < html.indexOf('class="d100-bar"'), '帯は本文の列の中');
  assert.ok(html.indexOf('class="d100-bar"') < html.indexOf('id="banners"'), '帯はお知らせより前');
  assert.ok(html.indexOf('./day100/share-open.js') < html.indexOf('./shared/share.js'));
  assert.match(html, /content="kamoku — /);
  assert.equal(readFileSync(join(dirs.day, 'day100/day100.css'), 'utf8'), '/* keep */');
  assert.equal(existsSync(join(dirs.day, 'css/old.css')), false);
  assert.equal(readFileSync(join(dirs.day, 'kamoku-LICENSE-APACHE.txt'), 'utf8'), 'Apache License');
});

test('同じ組み立て結果を2回取り込んでも、同じ中身になる', () => {
  const dirs = fixture();
  run(dirs);
  const first = readFileSync(join(dirs.day, 'index.html'), 'utf8');
  run(dirs);
  assert.equal(readFileSync(join(dirs.day, 'index.html'), 'utf8'), first);
  assert.deepEqual(readdirSync(dirs.day).filter((name) => name.startsWith('.import-')), []);
});

test('写している途中で失敗しても、前の生成物は残る', { skip: process.getuid?.() === 0 }, () => {
  const dirs = fixture();
  run(dirs);
  put(dirs.build, 'css/base.css', 'new');
  const wasm = join(dirs.build, 'web/pkg/kamoku_web_bg.wasm');
  try {
    // 組み立て結果を調べ終わった後に読めなくして、写す途中で失敗させる
    assert.throws(() => importBuild({
      buildDir: dirs.build, repoDir: dirs.repo, dayDir: dirs.day, home: '/no/such/home',
      headOf: () => { chmodSync(wasm, 0o000); return commit; },
    }), /EACCES|permission/i);
  } finally {
    chmodSync(wasm, 0o644);
  }
  assert.equal(readFileSync(join(dirs.day, 'css/base.css'), 'utf8'), 'body{}');
  assert.equal(existsSync(join(dirs.day, 'index.html')), true);
  assert.deepEqual(readdirSync(dirs.day).filter((name) => name.startsWith('.import-')), []);
});

test('知らないファイル・手元の絶対パス・秘密に見える行があれば、何も書かずに止まる', () => {
  for (const [extra, pattern] of [
    [{ 'web/extra.js': '1' }, /知らないファイル/],
    // 公開前チェックに当たる文字列は、つなげて作る（この試験のファイル自体は漏洩ではない）
    [{ 'web/shim.js': ['//', 'Users', 'someone', 'project'].join('/') }, /絶対パス/],
    [{ 'web/shim.js': `const to${'ken'} = "abcdefghijklmnop";` }, /秘密/],
  ]) {
    const dirs = fixture({ extra });
    rejects(() => run(dirs), pattern);
    assert.equal(existsSync(join(dirs.day, 'index.html')), false);
    assert.equal(existsSync(join(dirs.day, 'css/old.css')), true, '止まったときは古い生成物を消さない');
  }
});

test('commit していない変更を含む組み立て・コミットが違う組み立ては取り込まない', () => {
  rejects(() => run(fixture({ info: { commit, modified: true } })), /commit していない/);
  rejects(() => run(fixture(), 'b'.repeat(40)), /違います/);
  rejects(() => run(fixture({ info: {} })), /コミットがありません/);
});

test('目印が1か所でなければ止まり、二度目の差し込みも止まる', () => {
  rejects(() => injectIndex(baseIndex.replace('      <div class="banners" id="banners"></div>', ''), { title: 'kamoku' }), /目印/);
  rejects(() => injectIndex(injectIndex(baseIndex, { title: 'kamoku' }), { title: 'kamoku' }), /すでに/);
});

/* 置いてある実物。取り込み直しを忘れたり、手で直したりしたら、ここで分かる */
const placed = existsSync(join(dayDir, 'index.html'));
test('置いてある index.html は、インラインの script が無く、外部の読み込みが無い', { skip: !placed }, () => {
  const html = readFileSync(join(dayDir, 'index.html'), 'utf8');
  for (const tag of html.match(/<script\b[^>]*>/g) ?? []) assert.match(tag, /\ssrc="\.?\/?[^":]+"/, tag);
  assert.equal(/<script\b[^>]*>\s*[^<\s]/.test(html), false, 'script の中身がある');
  assert.equal(/\bstyle=/.test(html), false);
  assert.equal(/(?:src|href)="https?:\/\/(?!github\.com\/haranishi\/kamoku)/.test(html), false);
});

test('置いてある組み立て結果は、コミットが記録され、変更を含まない', { skip: !placed }, () => {
  const info = JSON.parse(readFileSync(join(dayDir, 'build-info.json'), 'utf8'));
  assert.match(info.commit, /^[0-9a-f]{40}$/);
  assert.equal(info.modified, undefined);
});
