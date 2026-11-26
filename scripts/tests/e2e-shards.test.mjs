// scripts/e2e-shards.mjs の単体テスト。依存パッケージは要らない（CIの checks ジョブは npm ci の前に流す）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ROOT,
  TEST_DIR,
  buildDurations,
  fileSeconds,
  importedSpecs,
  listEntryFiles,
  plan,
  toFilter,
  loadDurations,
  validateDurations,
} from '../e2e-shards.mjs';

const BASE = Date.parse('2026-01-01T00:00:00Z');
const result = (file, startMs, durationMs) => ({ file, startMs, durationMs });
function report(rows) {
  const specs = rows.map((r) => ({
    file: r.file,
    title: 't',
    tests: [{ results: [{ startTime: new Date(BASE + r.startMs).toISOString(), duration: r.durationMs, status: 'passed' }] }],
  }));
  return { suites: [{ file: 'x', specs }] };
}

test('listEntryFiles: tests/e2e の spec を全部返し、Day64（testIgnore）は除く', () => {
  const entries = listEntryFiles();
  const onDisk = fs.readdirSync(TEST_DIR).filter((n) => /\.spec\.mjs$/.test(n) && n !== 'day-064.spec.mjs').sort();
  assert.deepEqual(entries, onDisk);
  assert.ok(entries.includes('day-068.spec.mjs'));
  assert.ok(!entries.includes('day-064.spec.mjs'));
  assert.ok(entries.length > 80);
});

test('listEntryFiles: 除外の名前は playwright.config.mjs の testIgnore と同じ', () => {
  const config = fs.readFileSync(path.join(ROOT, 'playwright.config.mjs'), 'utf8');
  assert.equal(/testIgnore:\s*'([^']+)'/.exec(config)?.[1], 'day-064.spec.mjs');
});

test('importedSpecs: Day68の入口が読み込む別のspecを見つける。ほかの入口は空', () => {
  assert.deepEqual(importedSpecs('day-068.spec.mjs'), ['../../day-068-timetable-alibi/tests/complete-story.spec.mjs']);
  assert.deepEqual(importedSpecs('day-007-web-piano.spec.mjs'), []);
});

test('fileSeconds: 2つ目以降は、直前のファイルの終わりから測る（待ち時間も、後ろのファイルに入る）', () => {
  const r = report([
    result('a.spec.mjs', 0, 1000),
    result('a.spec.mjs', 1500, 500), // aは 0〜2000ms
    result('b.spec.mjs', 2600, 400), // bは 2000〜3000ms（600msの待ちを含む）
  ]);
  const sec = fileSeconds(r);
  assert.equal(sec.get('a.spec.mjs'), 2);
  assert.equal(sec.get('b.spec.mjs'), 1);
});

test('fileSeconds: 時間が読めないレポートは失敗する', () => {
  const bad = { suites: [{ specs: [{ file: 'a', tests: [{ results: [{ startTime: 'x', duration: 5 }] }] }] }] };
  assert.throws(() => fileSeconds(bad), /時間が読めない/);
});

test('buildDurations: 入口が読み込む別のspecの時間は、入口に足す。複数のレポートを合わせる', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-shards-'));
  try {
    const testDir = path.join(dir, 'tests', 'e2e');
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(path.join(dir, 'extra'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'a.spec.mjs'), "import '../../extra/b.spec.mjs';\n");
    fs.writeFileSync(path.join(testDir, 'c.spec.mjs'), 'export {};\n');
    const shard1 = report([result('a.spec.mjs', 0, 1000), result('../../extra/b.spec.mjs', 1000, 4000)]);
    const shard2 = report([result('c.spec.mjs', 0, 2000)]);
    const d = buildDurations([shard1, shard2], { testDir, mountedSeconds: 90, source: 'test' });
    assert.deepEqual(d.files, { 'a.spec.mjs': 5, 'c.spec.mjs': 2 });
    assert.equal(d.mountedSeconds, 90);
    // 入口に結びつかないファイルは、時間を黙って捨てず、失敗にする
    assert.throws(() => buildDurations([report([result('zzz.spec.mjs', 0, 1000)])], { testDir }), /入口に結びつかない/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// 重さがばらつく合成データ（決定的）
function synthetic(count) {
  const entries = Array.from({ length: count }, (_, i) => `d-${String(i).padStart(3, '0')}.spec.mjs`);
  const files = {};
  entries.forEach((e, i) => {
    files[e] = 20 + ((i * 37) % 41) ** 1.6; // 20〜約600秒
  });
  return { entries, durations: { mountedSeconds: 0, files } };
}

test('plan: 取りこぼしも重複も無く、全ファイルがちょうど1つの分割に入る（1〜12分割）', () => {
  const { entries, durations } = synthetic(88);
  for (let total = 1; total <= 12; total++) {
    const { shards } = plan(entries, durations, total);
    const all = shards.flatMap((s) => s.files);
    assert.equal(all.length, entries.length, `${total}分割`);
    assert.deepEqual([...all].sort(), [...entries].sort(), `${total}分割`);
    assert.ok(shards.every((s) => s.files.length > 0), `${total}分割で、空の分割がある`);
  }
});

test('plan: 同じ入力から、同じ結果になる。分割の中は名前順', () => {
  const { entries, durations } = synthetic(60);
  const a = plan(entries, durations, 6);
  const b = plan([...entries].reverse(), durations, 6);
  assert.deepEqual(a.shards, b.shards);
  for (const s of a.shards) assert.deepEqual(s.files, [...s.files].sort());
});

test('plan: 最長の分割は、LPT法の上限（下限の4/3倍）に収まる', () => {
  const { entries, durations } = synthetic(88);
  const sum = Object.values(durations.files).reduce((a, b) => a + b, 0);
  const heaviest = Math.max(...Object.values(durations.files));
  for (const total of [4, 6, 8]) {
    const { shards } = plan(entries, durations, total);
    const lower = Math.max(sum / total, heaviest);
    const max = Math.max(...shards.map((s) => s.load));
    assert.ok(max <= (4 / 3) * lower + 1e-9, `${total}分割: 最長 ${max.toFixed(0)} > ${((4 / 3) * lower).toFixed(0)}`);
  }
});

test('plan: 時間の記録に無いファイルは、記録の中央値として入れる（落とさない）', () => {
  const entries = ['a.spec.mjs', 'b.spec.mjs', 'c.spec.mjs', 'new.spec.mjs'];
  const durations = { mountedSeconds: 0, files: { 'a.spec.mjs': 10, 'b.spec.mjs': 30, 'c.spec.mjs': 20 } };
  const r = plan(entries, durations, 2);
  assert.deepEqual(r.missing, ['new.spec.mjs']);
  assert.equal(r.fallback, 20);
  assert.equal(r.shards.flatMap((s) => s.files).length, 4);
});

test('plan: 番号1は mounted の確認の時間を先に持つ', () => {
  const entries = ['a.spec.mjs', 'b.spec.mjs', 'c.spec.mjs'];
  const durations = { mountedSeconds: 500, files: { 'a.spec.mjs': 100, 'b.spec.mjs': 100, 'c.spec.mjs': 100 } };
  const { shards } = plan(entries, durations, 2);
  assert.deepEqual(shards[0].files, []);
  assert.equal(shards[1].files.length, 3);
});

test('plan: 分割数が正しくなければ失敗する', () => {
  const { entries, durations } = synthetic(5);
  assert.throws(() => plan(entries, durations, 0), /分割数/);
  assert.throws(() => plan(entries, durations, 2.5), /分割数/);
  assert.throws(() => plan(entries, durations, 6), /ファイル数/);
});

test('validateDurations: 壊れた記録は、黙って均等割りに戻さず、失敗する', () => {
  assert.throws(() => validateDurations(null), /形が正しくない/);
  assert.throws(() => validateDurations({}), /files が無い/);
  assert.throws(() => validateDurations({ files: { 'a.spec.mjs': -1 } }), /正の数/);
  assert.throws(() => validateDurations({ files: { 'a.spec.mjs': Number.NaN } }), /正の数/);
  assert.throws(() => validateDurations({ files: { 'a.spec.mjs': '3' } }), /正の数/);
  assert.throws(() => validateDurations({ files: {}, mountedSeconds: -5 }), /mountedSeconds/);
  assert.doesNotThrow(() => validateDurations({ files: { 'a.spec.mjs': 0 }, mountedSeconds: 0 }));
});

test('toFilter: 位置引数（正規表現）は、そのファイルだけに合う', () => {
  const re = new RegExp(toFilter('day-066.spec.mjs'));
  assert.ok(re.test('/work/tests/e2e/day-066.spec.mjs'));
  assert.ok(!re.test('/work/tests/e2e/day-066.spec.mjs.bak'));
  assert.ok(!re.test('/work/tests/e2e/day-0666.spec.mjs'));
  assert.ok(!re.test('/work/tests/e2e/day-066Xspec.mjs')); // . が任意の1文字になっていない
  assert.ok(!re.test('/work/tests/e2e/xday-066.spec.mjs'));
});

test('ワークフロー：ジョブ名・matrix・E2E_SHARDS の分割数がそろい、担当が空のときは止まる', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci-deploy.yml'), 'utf8');
  const total = Number(/E2E_SHARDS:\s*(\d+)/.exec(yml)?.[1]);
  const name = Number(/name: Browser tests \(\$\{\{ matrix\.shard \}\}\/(\d+)\)/.exec(yml)?.[1]);
  const matrix = /shard:\s*\[([0-9,\s]+)\]/.exec(yml)?.[1].split(',').map((x) => Number(x.trim()));
  assert.ok(total >= 1, 'E2E_SHARDS が読めない');
  assert.equal(name, total, 'ジョブ名の分割数が E2E_SHARDS と違う');
  assert.deepEqual(matrix, Array.from({ length: total }, (_, i) => i + 1), 'matrix.shard が 1〜E2E_SHARDS になっていない');
  assert.match(yml, /e2e-shards\.mjs plan "\$\{\{ matrix\.shard \}\}\/\$\{E2E_SHARDS\}"/);
  // 担当の一覧が空だと、位置引数なしの npm run test:e2e が全テストを流してしまう。件数を確かめてから実行する。
  assert.match(yml, /test "\$\{#files\[@\]\}" -gt 0/);
});

test('コミット済みの時間の記録：壊れておらず、実在する入口のほぼ全部を含む', () => {
  const durations = loadDurations();
  const entries = listEntryFiles();
  const covered = entries.filter((e) => e in durations.files).length;
  assert.ok(covered / entries.length >= 0.9, `記録が古い: ${covered}/${entries.length}ファイル。scripts/e2e-shards.mjs update で作り直す（docs/ci.md）`);
  assert.ok(durations.mountedSeconds >= 0);
});

test('コミット済みの時間の記録で、4〜8分割の最長は、全体÷分割数の1.2倍以内（受け入れ条件7）', () => {
  const durations = loadDurations();
  const entries = listEntryFiles();
  for (let total = 4; total <= 8; total++) {
    const { shards } = plan(entries, durations, total);
    const sum = shards.reduce((a, s) => a + s.load, 0);
    const max = Math.max(...shards.map((s) => s.load));
    assert.ok(max <= (sum / total) * 1.2, `${total}分割: 最長 ${(max / 60).toFixed(1)}分 > 理想 ${(sum / total / 60).toFixed(1)}分の1.2倍`);
  }
});
