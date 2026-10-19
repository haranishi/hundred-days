import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SOURCE_DIRS_BY_APP, isServedPath } from '../lib/dist-files.mjs';

test('全Day共通で外す：tests/・node_modules/・tools/cache/（どの深さでも。名前が似ているだけのものは外さない）', () => {
  const dir = 'day-035-front-page';
  for (const path of ['tests', 'tests/fixtures/photo.png', 'lib/tests/a.js', 'node_modules/x/index.js', 'tools/cache/data.zip', 'a/tools/cache']) {
    assert.equal(isServedPath(dir, path), false, path);
  }
  for (const path of ['', 'index.html', 'testsuite/a.js', 'tools/cacheX/a.png', 'tools/promo/og.png', 'assets/tests.png']) {
    assert.equal(isServedPath(dir, path), true, path);
  }
});

test('Dayごとに外す：SOURCE_DIRS_BY_APP の tools・source は、Dayのフォルダ直下の名前だけを見る', () => {
  assert.equal(isServedPath('day-070-flip-court', 'tools/promo/og.png'), false);
  assert.equal(isServedPath('day-056-dragon-rush', 'source/main.ts'), false);
  assert.equal(isServedPath('day-070-flip-court', 'assets/tools/og.png'), true, '直下でなければ外さない');
  assert.equal(isServedPath('day-001-focus-timer', 'tools/a.js'), true, '表に無いDayの tools は配信する');
});

test('Day44 の特例：tools で始まる名前を、深さを問わず外す', () => {
  for (const path of ['tools/a.js', 'tools-shot.png', 'lib/tools-helper.js']) assert.equal(isServedPath('day-044-train-here', path), false, path);
  assert.equal(isServedPath('day-044-train-here', 'lib/game.js'), true);
  assert.equal(isServedPath('day-044-train-here', 'lib/toolbox.js'), true, '/tools で始まらない名前は外さない');
  assert.equal(isServedPath('day-045-read-your-shots', 'tools-shot.png'), true);
});

/* 置き換える前の build.mjs の判定。絶対パスに対して名前を探していた。リポジトリを置いた場所の名前に
   tests などが入っていなければ、Dayのフォルダからの相対パスで見る今の判定と同じ結果になる */
const beforeChange = (dir, relativePath) => {
  const source = `/repo/hundred-days/${dir}${relativePath ? `/${relativePath}` : ''}`;
  const excluded = ['tools/cache', 'tests', 'node_modules'].some((name) => source.endsWith(`/${name}`) || source.includes(`/${name}/`));
  const day44 = dir === 'day-044-train-here' && source.includes('/tools');
  const [top] = relativePath.split('/');
  return !excluded && !day44 && !(SOURCE_DIRS_BY_APP[dir] ?? []).includes(top);
};

test('置き換える前の build.mjs と同じ結果になる（代表的なパスと、外す表のあるDay・無いDay）', () => {
  const dirs = ['day-001-focus-timer', 'day-044-train-here', 'day-056-dragon-rush', 'day-070-flip-court', ...Object.keys(SOURCE_DIRS_BY_APP)];
  const paths = [
    '', 'index.html', 'og.png', 'tests', 'tests/fixtures/photo.png', 'lib/tests/a.js', 'testsuite/a.js', 'node_modules/x.js',
    'tools', 'tools/cache', 'tools/cache/a.zip', 'tools/cacheX/a', 'tools/promo/og.png', 'toolset.js', 'source', 'source/main.ts',
    'sources/a.js', 'assets/tools/og.png', 'vendor/three.module.js',
  ];
  for (const dir of dirs) for (const path of paths) assert.equal(isServedPath(dir, path), beforeChange(dir, path), `${dir}/${path}`);
});
