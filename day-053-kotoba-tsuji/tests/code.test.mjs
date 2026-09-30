// コードの決まり：alert( confirm( prompt( を使わない（札は画面の中で出す）。外へは何も読みに行かない。
// localStorage は lib/storage.js の中でだけ触る。ブラウザを使わずにソースを読んで確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function files(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return files(p);
    return /\.(m?js|html|css)$/.test(d.name) ? [p] : [];
  });
}

const APP_FILES = ['index.html', 'app.js', 'app.css', 'fonts/fonts.css', ...files('lib')];
const PUBLIC_URL = 'https://hundred-days.pages.dev/day-053-kotoba-tsuji/';

test('alert( confirm( prompt( を使っていない', () => {
  for (const f of APP_FILES) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /\b(alert|confirm|prompt)\s*\(/, f);
  }
});

test('外へは何も読みに行かない（書体も同梱。URLは公開URLのメタ情報だけ）', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const urls = [...html.matchAll(/(?:src|href|content)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(urls.length > 0, 'canonical と og のURLがある');
  for (const u of urls) assert.ok(u.startsWith(PUBLIC_URL), `公開URL以外を指している: ${u}`);
  assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
  assert.doesNotMatch(html, /<script[^>]+src="https?:/);
  for (const f of ['app.css', 'fonts/fonts.css', 'tools/og.html']) {
    assert.doesNotMatch(readFileSync(join(ROOT, f), 'utf8'), /https?:\/\/fonts\.|@import\s+url\(\s*["']?https?:/, f);
  }
  for (const f of APP_FILES.filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|import\(['"]https?:/, f);
  }
});

test('単体で作った版の仮の公開先（kotoba-tsuji.pages.dev）が残っていない', () => {
  for (const f of [...APP_FILES, 'tools/og.html', ...files('docs'), 'README.md']) {
    assert.doesNotMatch(readFileSync(join(ROOT, f), 'utf8'), /kotoba-tsuji\.pages\.dev/, f);
  }
});

test('localStorage は lib/storage.js の中でだけ触る', () => {
  for (const f of APP_FILES.filter((x) => x.endsWith('.js') && !x.endsWith('storage.js'))) {
    assert.doesNotMatch(readFileSync(join(ROOT, f), 'utf8'), /localStorage/, f);
  }
});

test('tests/index.mjs はすべての *.test.mjs を読む（足し忘れると node --test day-*/tests/ で流れない）', () => {
  const index = readFileSync(join(ROOT, 'tests', 'index.mjs'), 'utf8');
  for (const name of readdirSync(join(ROOT, 'tests')).filter((n) => n.endsWith('.test.mjs'))) {
    assert.ok(index.includes(`'./${name}'`), `${name} が tests/index.mjs に無い`);
  }
});
