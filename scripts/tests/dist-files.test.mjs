import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SOURCE_DIRS_BY_APP, isServedPath } from '../lib/dist-files.mjs';

test('全Day共通で外す：tests/・node_modules/・tools/cache/（どの深さでも。名前が似ているだけのものは外さない）', () => {
  const dir = 'day-035-front-page';
  for (const path of ['tests', 'tests/fixtures/photo.png', 'lib/tests/a.js', 'node_modules/x/index.js', 'tools/cache/data.zip', 'a/tools/cache']) {
    assert.equal(isServedPath(dir, path), false, path);
  }
  for (const path of ['', 'index.html', 'testsuite/a.js', 'assets/tools/cacheX/a.png', 'assets/tools/promo/og.png', 'assets/tests.png']) {
    assert.equal(isServedPath(dir, path), true, path);
  }
});

test('全Day共通で外す：ドット始まり・package*.json・_headers・直下の tools/ と scripts/', () => {
  for (const dir of ['day-001-focus-timer', 'day-047-ie-no-omote', 'day-054-me-to-mimi', 'day-073-offbeat']) {
    for (const path of [
      '.DS_Store', '.env', '.gitkeep', 'assets/.hidden', '.venv/bin/python',
      'package.json', 'src/package.json', 'package-lock.json', 'source/package-lock.json',
      '_headers', 'sub/_headers', 'tools', 'tools/a.js', 'scripts', 'scripts/audit.mjs',
    ]) {
      assert.equal(isServedPath(dir, path), false, `${dir}/${path}`);
    }
  }
});

test('Dayごとに外す：SOURCE_DIRS_BY_APP と正の制御（配信が必要な静的資産）', () => {
  assert.equal(isServedPath('day-070-flip-court', 'tools/promo/og.png'), false);
  assert.equal(isServedPath('day-056-dragon-rush', 'source/main.ts'), false);
  assert.equal(isServedPath('day-070-flip-court', 'assets/tools/og.png'), true, '直下でなければ外さない');
  assert.equal(isServedPath('day-073-offbeat', 'src/app.js'), true);
  assert.equal(isServedPath('day-073-offbeat', 'src/styles.css'), true);
  assert.equal(isServedPath('day-073-offbeat', 'src/package.json'), false);
  assert.equal(isServedPath('day-084-airpresenter', 'airpresenter-local.zip'), true);
});

test('Day44 の特例：tools で始まる名前を、深さを問わず外す', () => {
  for (const path of ['tools/a.js', 'tools-shot.png', 'lib/tools-helper.js']) assert.equal(isServedPath('day-044-train-here', path), false, path);
  assert.equal(isServedPath('day-044-train-here', 'lib/game.js'), true);
  assert.equal(isServedPath('day-044-train-here', 'lib/toolbox.js'), true, '/tools で始まらない名前は外さない');
  assert.equal(isServedPath('day-045-read-your-shots', 'tools-shot.png'), true);
});

test('Dayのフォルダ直下の LICENSE は配信しない。深い場所の第三者の LICENSE は、同梱が義務なので配信する', () => {
  for (const dir of ['day-001-focus-timer', 'day-076-henkan-desk', 'day-094-super-yaritai']) {
    assert.equal(isServedPath(dir, 'LICENSE'), false, `${dir}/LICENSE`);
  }
  for (const path of ['pdf-assets/cmaps/LICENSE', 'vendor/LICENSE', 'vendor/LICENSE-three.txt', 'assets/models/License.txt', 'LICENSE.txt', 'LICENSES/a.txt', 'LICENSE/a.txt']) {
    assert.equal(isServedPath('day-076-henkan-desk', path), true, path);
  }
});

/* 以前の build.mjs 判定に、セキュリティ境界（ドット始まり・マニフェスト・直下 tools/scripts・直下 LICENSE）を足した仕様との一致を見る */
const expectedServed = (dir, relativePath) => {
  const segments = relativePath.split('/').filter(Boolean);
  if (segments.some((seg) => seg.startsWith('.'))) return false;
  if (['package.json', 'package-lock.json', '_headers'].includes(segments.at(-1))) return false;
  if (relativePath === 'LICENSE') return false;
  const source = `/repo/hundred-days/${dir}${relativePath ? `/${relativePath}` : ''}`;
  const excluded = ['tools/cache', 'tests', 'node_modules'].some((name) => source.endsWith(`/${name}`) || source.includes(`/${name}/`));
  const day44 = dir === 'day-044-train-here' && source.includes('/tools');
  const [top] = relativePath.split('/');
  if (top === 'tools' || top === 'scripts') return false;
  return !excluded && !day44 && !(SOURCE_DIRS_BY_APP[dir] ?? []).includes(top);
};

test('代表的なパスと外す表のあるDay・無いDayで期待どおりの判定になる', () => {
  const dirs = ['day-001-focus-timer', 'day-044-train-here', 'day-056-dragon-rush', 'day-070-flip-court', 'day-073-offbeat', 'day-084-airpresenter', ...Object.keys(SOURCE_DIRS_BY_APP)];
  const paths = [
    '', 'index.html', 'og.png', '.DS_Store', '.env', 'assets/.keep',
    'package.json', 'src/package.json', 'package-lock.json', '_headers', 'nested/_headers',
    'tests', 'tests/fixtures/photo.png', 'lib/tests/a.js', 'testsuite/a.js', 'node_modules/x.js',
    'tools', 'tools/cache', 'tools/cache/a.zip', 'tools/cacheX/a', 'tools/promo/og.png', 'toolset.js',
    'scripts', 'scripts/audit.mjs', 'source', 'source/main.ts', 'src/app.js', 'src/styles.css',
    'sources/a.js', 'assets/tools/og.png', 'vendor/three.module.js', 'airpresenter-local.zip',
    'LICENSE', 'LICENSE.txt', 'vendor/LICENSE', 'vendor/LICENSE-three.txt', 'pdf-assets/cmaps/LICENSE',
  ];
  for (const dir of dirs) for (const path of paths) assert.equal(isServedPath(dir, path), expectedServed(dir, path), `${dir}/${path}`);
});
