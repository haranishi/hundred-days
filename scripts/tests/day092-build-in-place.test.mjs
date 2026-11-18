import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/* Day092 の公開用コピー（tools/build-day092.mjs）は、出力先の古い物を消してから写す。
   出力先が自分の source/ を含む場合（<Day>/source から <Day> へ作り直す）に、自分の元のコードまで消していた。
   本物のビルドは使わず、一時フォルダの小さな木で、消す・残す・拒む、を確かめる。 */

const toolsDir = fileURLToPath(new URL('../../day-092-shuwa/source/tools/', import.meta.url));

/** 元のコードの木（tools/・src/・dist/index.html だけの最小の形）を作る。 */
function makeSourceTree(dir) {
  mkdirSync(join(dir, 'tools'), { recursive: true });
  for (const name of ['build-day092.mjs', 'day092-files.mjs']) cpSync(join(toolsDir, name), join(dir, 'tools', name));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src/main.ts'), 'export {};\n');
  writeFileSync(join(dir, 'package.json'), '{}\n');
  mkdirSync(join(dir, 'dist'), { recursive: true });
  writeFileSync(join(dir, 'dist/index.html'), '<!doctype html><title>built</title>\n');
}

const build = (cwd, target) =>
  spawnSync(process.execPath, ['tools/build-day092.mjs', target], { cwd, encoding: 'utf8' });

function withTempDir(fn) {
  const base = mkdtempSync(join(tmpdir(), 'd92-build-'));
  try { fn(base); } finally { rmSync(base, { recursive: true, force: true }); }
}

test('その場（<Day>/source から <Day> へ）の作り直しは、自分の source/ を消さない', () => {
  withTempDir((base) => {
    const day = join(base, 'day-092-test');
    mkdirSync(day, { recursive: true });
    writeFileSync(join(day, 'meta.json'), '{"day":92}\n');
    writeFileSync(join(day, 'LICENSE'), 'MIT License\n');
    makeSourceTree(join(day, 'source'));

    const r = build(join(day, 'source'), '..');

    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(day, 'source/src/main.ts')), 'source/ の元のコードが残っている');
    assert.ok(existsSync(join(day, 'source/tools/build-day092.mjs')), 'source/ の道具が残っている');
    assert.ok(existsSync(join(day, 'index.html')), 'dist が Day のフォルダへ写っている');
    assert.equal(readFileSync(join(day, 'meta.json'), 'utf8'), '{"day":92}\n', '100日側で管理する物が残っている');
    assert.equal(readFileSync(join(day, 'LICENSE'), 'utf8'), 'MIT License\n', '100日側で置く LICENSE が残っている');
  });
});

test('別の場所から作る通常の作り直しは、前回写した物を消し、source/ を写し直す', () => {
  withTempDir((base) => {
    const src = join(base, 'workspace');
    makeSourceTree(src);
    const day = join(base, 'hundred-days', 'day-092-test');
    mkdirSync(join(day, 'source'), { recursive: true });
    writeFileSync(join(day, 'meta.json'), '{"day":92}\n');
    writeFileSync(join(day, 'LICENSE'), 'MIT License\n');
    writeFileSync(join(day, 'stale.js'), 'old\n');
    writeFileSync(join(day, 'source/stale.txt'), 'old\n');

    const r = build(src, day);

    assert.equal(r.status, 0, r.stderr);
    assert.ok(!existsSync(join(day, 'stale.js')), '前回写した公開物は消える');
    assert.ok(!existsSync(join(day, 'source/stale.txt')), '前回写した source/ の中身は消える');
    assert.ok(existsSync(join(day, 'source/src/main.ts')), 'source/ は元のコードから写し直される');
    assert.ok(existsSync(join(day, 'index.html')));
    assert.equal(readFileSync(join(day, 'meta.json'), 'utf8'), '{"day":92}\n');
    assert.equal(readFileSync(join(day, 'LICENSE'), 'utf8'), 'MIT License\n', '100日側で置く LICENSE が残っている');
  });
});

test('出力先と元のコードが重なる（その場の形ではない）ときは、何も消さずに止まる', () => {
  withTempDir((base) => {
    const day = join(base, 'day-092-test');
    const src = join(day, 'nested', 'source');
    makeSourceTree(src);
    writeFileSync(join(day, 'keep.txt'), 'keep\n');

    const r = build(src, day);

    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /重なっています/, '別の理由で止まったのではなく、重なりを理由に止まる');
    assert.ok(existsSync(join(src, 'src/main.ts')), '元のコードは消えない');
    assert.ok(existsSync(join(day, 'keep.txt')), '出力先の物も消えない');
  });
});

test('元のコードを指すシンボリックリンクの下の、まだ無い出力先も、重なりとして拒む', () => {
  withTempDir((base) => {
    const src = join(base, 'workspace');
    makeSourceTree(src);
    const link = join(base, 'link');
    symlinkSync(src, link);

    const r = build(src, join(link, 'day-092-new'));

    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /重なっています/);
    assert.ok(!existsSync(join(src, 'day-092-new')), '元のコードの中に、出力先を作らない');
    assert.ok(existsSync(join(src, 'src/main.ts')), '元のコードは消えない');
  });
});

test('dist/ に、Day のフォルダで残す名前（LICENSE など）があるときは、何も消さず・上書きせずに止まる', () => {
  withTempDir((base) => {
    const day = join(base, 'day-092-test');
    mkdirSync(day, { recursive: true });
    writeFileSync(join(day, 'LICENSE'), 'MIT License\n');
    writeFileSync(join(day, 'old.js'), 'old\n');
    const src = join(day, 'source');
    makeSourceTree(src);
    writeFileSync(join(src, 'dist/LICENSE'), 'ほかの内容\n');

    const r = build(src, '..');

    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /LICENSE/, '衝突した名前を伝える');
    assert.equal(readFileSync(join(day, 'LICENSE'), 'utf8'), 'MIT License\n', 'LICENSE は上書きされない');
    assert.ok(existsSync(join(day, 'old.js')), '何も消さずに止まる');
    assert.ok(existsSync(join(src, 'src/main.ts')), '元のコードも消えない');
  });
});

test('大文字小文字を区別しないファイルシステムで、同じフォルダを別の綴りで渡されても、自分の source/ を消さない', (t) => {
  withTempDir((base) => {
    const day = join(base, 'day-092-test');
    mkdirSync(day, { recursive: true });
    // 区別するファイルシステム（Linux の CI）では、別の綴りは別のフォルダになるので、この試験の対象外。macOS では実行される
    if (!existsSync(join(base, 'day-092-TEST'))) {
      t.skip('大文字小文字を区別するファイルシステムでは確かめられない');
      return;
    }
    writeFileSync(join(day, 'meta.json'), '{"day":92}\n');
    makeSourceTree(join(day, 'source'));

    const r = build(join(day, 'source'), join(base, 'day-092-TEST'));

    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(day, 'source/src/main.ts')), '別の綴りで渡されても、source/ の元のコードが残っている');
    assert.ok(existsSync(join(day, 'index.html')), 'dist が Day のフォルダへ写っている');
  });
});

test('dist/ の名前の衝突は、綴りの違い（license など）も同じ物として止める（macOS は大文字小文字を区別しない）', () => {
  withTempDir((base) => {
    const day = join(base, 'day-092-test');
    mkdirSync(day, { recursive: true });
    writeFileSync(join(day, 'LICENSE'), 'MIT License\n');
    writeFileSync(join(day, 'old.js'), 'old\n');
    const src = join(day, 'source');
    makeSourceTree(src);
    writeFileSync(join(src, 'dist/license'), 'ほかの内容\n');

    const r = build(src, '..');

    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /license/);
    assert.equal(readFileSync(join(day, 'LICENSE'), 'utf8'), 'MIT License\n', 'LICENSE は上書きされない');
    assert.ok(existsSync(join(day, 'old.js')), '何も消さずに止まる');
  });
});

test('dist がシンボリックリンクのときは、前回の公開物を消す前に止まる', () => {
  withTempDir((base) => {
    const day = join(base, 'day-092-test');
    mkdirSync(day, { recursive: true });
    writeFileSync(join(day, 'old.js'), 'old\n');
    const src = join(day, 'source');
    makeSourceTree(src);
    const realDist = join(base, 'dist-real');
    mkdirSync(realDist);
    writeFileSync(join(realDist, 'index.html'), '<!doctype html><title>built</title>\n');
    rmSync(join(src, 'dist'), { recursive: true, force: true });
    symlinkSync(realDist, join(src, 'dist'));

    const r = build(src, '..');

    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /シンボリックリンク/);
    assert.ok(existsSync(join(day, 'old.js')), '前回の公開物を消す前に止まる');
    assert.ok(existsSync(join(src, 'src/main.ts')), '元のコードは消えない');
  });
});

test('「リンク/..」は、文字列で畳まず、OS がリンクをたどった先で解釈する', () => {
  withTempDir((base) => {
    const wrong = join(base, 'day-092-test'); // 文字列で「link/..」を畳むと、こちらになる
    const right = join(base, 'sub', 'day-092-test'); // リンクをたどった先の親にある、こちらが本来の出力先
    mkdirSync(wrong, { recursive: true });
    mkdirSync(right, { recursive: true });
    mkdirSync(join(base, 'sub', 'child'), { recursive: true });
    symlinkSync(join(base, 'sub', 'child'), join(base, 'link'));
    const src = join(base, 'workspace');
    makeSourceTree(src);

    // join() は「link/..」を畳んでしまうので、文字列のまま渡す
    const r = build(src, `${base}/link/../day-092-test`);

    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(join(right, 'index.html')), 'リンクをたどった先の Day に写る');
    assert.ok(!existsSync(join(wrong, 'index.html')), '文字列で畳んだ先の Day には写らない');
  });
});

test('Day の source がシンボリックリンクのときは、「その場の作り直し」とみなさず、重なりとして拒む（元のコードを含む親を消さない）', () => {
  withTempDir((base) => {
    const day = join(base, 'day-092-test');
    const real = join(day, 'nested', 'workspace');
    makeSourceTree(real);
    symlinkSync(real, join(day, 'source'));
    writeFileSync(join(day, 'keep.txt'), 'keep\n');

    const r = build(real, day);

    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /重なっています/);
    assert.ok(existsSync(join(real, 'src/main.ts')), '元のコードを含む nested/ は消えない');
    assert.ok(existsSync(join(day, 'keep.txt')), '出力先の物も消えない');
  });
});

test('元のコードのフォルダの実名が source でない（SOURCE など）ときは、「その場の作り直し」とみなさず、何も消さずに止まる', () => {
  withTempDir((base) => {
    const day = join(base, 'day-092-test');
    const upper = join(day, 'SOURCE');
    makeSourceTree(upper);
    writeFileSync(join(day, 'keep.txt'), 'keep\n');

    const r = build(upper, day);

    assert.notEqual(r.status, 0);
    assert.ok(existsSync(join(upper, 'src/main.ts')), '元のコードは消えない');
    assert.ok(existsSync(join(day, 'keep.txt')), '出力先の物も消えない');
  });
});
