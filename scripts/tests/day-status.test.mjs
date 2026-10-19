import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  effectiveStatus,
  isPublishCheckOverride,
  matchesDay,
  publishCheckTargets,
  unmatchedPublishCheckTargets,
} from '../lib/day-status.mjs';
import { parseHtml } from '../lib/publish-contract.mjs';

const DIR = 'day-071-kage-shogen';
const draft = { status: 'draft' };

test('環境変数が無ければ、meta.json の status をそのまま使う（未記入は published）', () => {
  assert.equal(effectiveStatus({}, DIR, {}), 'published');
  assert.equal(effectiveStatus({ status: 'published' }, DIR, {}), 'published');
  assert.equal(effectiveStatus(draft, DIR, {}), 'draft');
  assert.equal(effectiveStatus({ status: 'external' }, DIR, {}), 'external');
  assert.equal(effectiveStatus(draft, DIR, { PUBLISH_CHECK_DAY: '' }), 'draft');
  assert.equal(effectiveStatus(draft, DIR, { PUBLISH_CHECK_DAY: ' ,  ' }), 'draft');
});

test('番号・0埋めの番号・フォルダ名・カンマ区切りで、下書きだけを公開済みとして扱う', () => {
  for (const value of ['71', '071', DIR, ' 70 , 71 ', '7 1', `day-070-flip-court,${DIR}`]) {
    assert.equal(effectiveStatus(draft, DIR, { PUBLISH_CHECK_DAY: value }), 'published', value);
  }
  // 指していないDayの下書きは変えない
  assert.equal(effectiveStatus(draft, 'day-072-next', { PUBLISH_CHECK_DAY: '71' }), 'draft');
  assert.equal(effectiveStatus(draft, DIR, { PUBLISH_CHECK_DAY: 'day-071' }), 'draft');
});

test('下書き以外の状態は、指されても変えない', () => {
  const env = { PUBLISH_CHECK_DAY: '71' };
  assert.equal(effectiveStatus({ status: 'external' }, DIR, env), 'external');
  assert.equal(effectiveStatus({ status: 'published' }, DIR, env), 'published');
  assert.equal(effectiveStatus({}, DIR, env), 'published');
  assert.equal(isPublishCheckOverride({ status: 'external' }, DIR, env), false);
  assert.equal(isPublishCheckOverride(draft, DIR, env), true);
  assert.equal(isPublishCheckOverride(draft, DIR, {}), false);
});

test('GitHub Actions では、指定があれば例外で止める（本番のビルドで下書きを公開しない）', () => {
  const ci = { GITHUB_ACTIONS: 'true', PUBLISH_CHECK_DAY: '71' };
  assert.throws(() => effectiveStatus(draft, DIR, ci), /GitHub Actions/);
  assert.throws(() => effectiveStatus({ status: 'published' }, 'day-001-focus-timer', ci), /GitHub Actions/);
  assert.equal(effectiveStatus(draft, DIR, { GITHUB_ACTIONS: 'true' }), 'draft');
  assert.equal(effectiveStatus(draft, DIR, { GITHUB_ACTIONS: 'true', PUBLISH_CHECK_DAY: ' ' }), 'draft');
});

test('どのDayも指さない指定を拾う（番号の打ち間違いに気づくため）', () => {
  const dirs = ['day-070-flip-court', DIR];
  assert.deepEqual(publishCheckTargets({ PUBLISH_CHECK_DAY: ' 71, 999 ,' }), ['71', '999']);
  assert.deepEqual(unmatchedPublishCheckTargets(dirs, { PUBLISH_CHECK_DAY: '71,999,day-071' }), ['999', 'day-071']);
  assert.deepEqual(unmatchedPublishCheckTargets(dirs, { PUBLISH_CHECK_DAY: '070' }), []);
  assert.deepEqual(unmatchedPublishCheckTargets(dirs, {}), []);
  assert.equal(matchesDay('71', 'notes'), false);
});

/* build.mjs を小さな作業場へ写して流す。リポジトリの dist/ には触れない。
   下書きが公開済みとして扱われるのは環境変数があるときだけで、無いときの出力が変わらないことを確かめる */
function miniSite(t) {
  const site = mkdtempSync(join(tmpdir(), 'hundred-days-status-'));
  t.after(() => rmSync(site, { recursive: true, force: true }));
  const write = (file, content) => {
    mkdirSync(dirname(join(site, file)), { recursive: true });
    writeFileSync(join(site, file), content);
  };
  for (const file of ['build.mjs', 'lib/day-status.mjs', 'lib/dist-files.mjs']) {
    mkdirSync(dirname(join(site, 'scripts', file)), { recursive: true });
    copyFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), join(site, 'scripts', file));
  }
  const page = (title) => `<!doctype html><html><head><title>${title}</title></head><body></body></html>`;
  write('day-001-alpha/index.html', page('アルファ'));
  write('day-001-alpha/meta.json', JSON.stringify({ day: 1, title: 'アルファ', status: 'published' }));
  write('day-002-beta/index.html', page('ベータ'));
  write('day-002-beta/meta.json', JSON.stringify({ day: 2, title: 'ベータ', status: 'draft' }));
  const env = { ...process.env };
  for (const name of ['PUBLISH_CHECK_DAY', 'HUNDRED_DAYS_BUILD_DIR', 'GITHUB_ACTIONS']) delete env[name];
  const build = (extra = {}) => {
    // 固まっても CI を止めないよう上限を付ける（小さな作業場のビルドは1秒もかからない）
    const run = spawnSync(process.execPath, [join(site, 'scripts', 'build.mjs')], { cwd: site, env: { ...env, ...extra }, encoding: 'utf8', timeout: 60_000 });
    return { status: run.status, output: run.stdout + run.stderr };
  };
  const read = (file) => readFileSync(join(site, 'dist', file), 'utf8');
  return { site, write, build, read };
}

test('ビルド：指定が無ければ下書きを出さず、指定したときだけ公開済みとして組み立てる', (t) => {
  const { site, build, read } = miniSite(t);

  const normal = build();
  assert.equal(normal.status, 0, normal.output);
  assert.ok(!existsSync(join(site, 'dist', 'day-002-beta')));
  assert.ok(!read('_headers').includes('/day-002-beta/*'));
  assert.ok(!normal.output.includes('（検査用）'));
  const normalIndex = read('index.html');

  const checked = build({ PUBLISH_CHECK_DAY: '2' });
  assert.equal(checked.status, 0, checked.output);
  assert.match(checked.output, /（検査用）公開済みとして扱う：day-002-beta/);
  assert.ok(existsSync(join(site, 'dist', 'day-002-beta', 'index.html')));
  assert.ok(read('_headers').includes('/day-002-beta/*'));
  assert.match(read('day-002-beta/index.html'), /<link rel="canonical" href="https:\/\/hundred-days\.pages\.dev\/day-002-beta\/">/);

  // 打ち間違いは警告し、下書きは出さない。出力は指定なしのときと同じ
  const typo = build({ PUBLISH_CHECK_DAY: '20' });
  assert.equal(typo.status, 0, typo.output);
  assert.match(typo.output, /PUBLISH_CHECK_DAY の 20 は、どのDayのフォルダも指していません/);
  assert.equal(read('index.html'), normalIndex);
  assert.ok(!existsSync(join(site, 'dist', 'day-002-beta')));
});

test('第3周2：題名に $& や $$ があっても、ビルドが足す og:title・twitter:title は題名どおり', (t) => {
  const { write, build, read } = miniSite(t);
  // 文字列の置換では $& が一致した文字列（</head>）に、$$ が $ に、$` と $' がその前後の文字列に化ける
  const title = "ねこ $& 時計 $$ 犬 $' 鳥 $` 魚";
  write('day-003-dollar/index.html', '<!doctype html><html><head><title>t</title></head><body></body></html>');
  write('day-003-dollar/meta.json', JSON.stringify({ day: 3, title, status: 'published' }));
  const run = build();
  assert.equal(run.status, 0, run.output);
  const { tags } = parseHtml(read('day-003-dollar/index.html'));
  const content = (attr, value) => tags.find((tag) => tag.attrs.get(attr) === value)?.attrs.get('content');
  assert.equal(content('property', 'og:title'), title);
  assert.equal(content('name', 'twitter:title'), title);
});

test('ビルド：GitHub Actions で指定されたら、dist/ を消す前に止まる', (t) => {
  const { site, build } = miniSite(t);
  assert.equal(build().status, 0);
  const ci = build({ PUBLISH_CHECK_DAY: '2', GITHUB_ACTIONS: 'true' });
  assert.notEqual(ci.status, 0);
  assert.match(ci.output, /GitHub Actions では使えません/);
  assert.ok(existsSync(join(site, 'dist', 'day-001-alpha', 'index.html')), '前のビルドが残っていること');
});
