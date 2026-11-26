import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { parseCliArgs } from '../../tools/promo/render-promo.mjs';
import { TOTAL_FRAMES } from '../../tools/promo/timeline.mjs';

const OUT = process.env.PROMO_OUT || join(tmpdir(), 'day100-kamoku-promo');

test('撮影の引数は、出力先・範囲・書き出しの有無を読む', () => {
  const full = parseCliArgs([]);
  assert.equal(full.outDir, OUT);
  assert.equal(full.selftest, false);
  assert.equal(full.noEncode, false);
  assert.equal(full.partial, false);
  assert.deepEqual(full.mux, ['a', 'b']);
  assert.equal(full.rangeFrom, 0);
  assert.equal(full.rangeTo, TOTAL_FRAMES - 1);

  const preview = parseCliArgs(['--frames', '0-90', '--no-encode', '--out-dir', '/tmp/kamoku-preview']);
  assert.equal(preview.partial, true);
  assert.equal(preview.noEncode, true);
  assert.equal(preview.rangeFrom, 0);
  assert.equal(preview.rangeTo, 90);
  assert.equal(parseCliArgs(['--selftest']).selftest, true);
  assert.throws(() => parseCliArgs(['--frames', '3']), /a-b/);
  assert.throws(() => parseCliArgs(['--mux', 'c']), /a または b/);
});

test('撮影・音の道具は、先頭で第三者パッケージを静的に読み込まない', () => {
  const dir = new URL('../../tools/promo/', import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith('.mjs'));
  assert.ok(files.length >= 4);
  const bad = [];
  for (const name of files) {
    const source = readFileSync(new URL(name, dir), 'utf8');
    for (const match of source.matchAll(/^\s*import\s+(?:[^;'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
      const spec = match[1];
      if (!spec.startsWith('node:') && !spec.startsWith('.') && !spec.startsWith('/')) bad.push(`${name}: ${spec}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('その検査は、実際に先頭の静的 import を見つけられる', () => {
  const sample = "import { chromium } from '@playwright/test';\nimport 'left-pad';\nimport { a } from './x.mjs';\nconst c = await import('@playwright/test');\n";
  const found = [...sample.matchAll(/^\s*import\s+(?:[^;'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)].map((match) => match[1]);
  assert.deepEqual(found, ['@playwright/test', 'left-pad', './x.mjs']);
});

test('README は100行以内で、字幕は透明にせず断り書きは16px', () => {
  const readme = readFileSync(new URL('../../tools/promo/README.md', import.meta.url), 'utf8');
  assert.ok(readme.trim().split('\n').length <= 100, 'README が100行を超えている');
  assert.match(readme, /帳簿、また後回し？/);
  assert.match(readme, /本物の帳簿は、自分のPCの中だけ。/);
  const css = readFileSync(new URL('../../tools/promo/stage.css', import.meta.url), 'utf8');
  assert.match(css, /#cap\s*\{[^}]*opacity:\s*1/s);
  assert.match(css, /#end-disclaimer\s*\{[^}]*font-size:\s*16px/s);
  const note = Number((css.match(/#cap-note\s*\{[^}]*font-size:\s*(\d+)px/s) || [])[1]);
  assert.ok(note >= 16, `ソース版の注記が ${note}px`);
});

test('4–12秒は、ぼかしの区間を除いてアプリの全幅（横を切らない）で映す', async () => {
  const { cameraAt } = await import('../../tools/promo/render-promo.mjs');
  const T = await import('../../tools/promo/timeline.mjs');
  for (let frame = 4 * T.FPS; frame < 12 * T.FPS; frame++) {
    if (T.backdropAt(frame / T.FPS).blur > 0.05) continue;
    const cam = cameraAt(frame);
    assert.equal(cam.tx, 0, `frame ${frame}`);
    assert.ok(Math.abs(cam.scale - T.APP_SCALE) < 1e-9, `frame ${frame}`);
  }
  // 0–1.5秒は背景をぼかし、問いと件数だけを中央に出す。
  assert.ok(T.backdropAt(0).blur > 0 && T.captionAt(0).top > 250);
  assert.equal(T.captionAt(2.5).top, 88);
  // 締めは紺一色（幕が 1）。
  assert.equal(T.backdropAt(28).scrim, 1);
});
