import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildDemoFilter, computeBoardTopPad, computeLogoClip, createCalloutState,
  extractProjectionDiffRows, findTableColumns, formatTokyoMonth,
  isNegativeCurrency, normalizeNextActionValue, parseCliArgs,
} from '../../tools/promo/render-promo.mjs';
import { DEMO_RANGES, TOTAL_FRAMES } from '../../tools/promo/timeline.mjs';

test('parseCliArgs は引数と環境変数を読み、不正な範囲・オプションを拒む', () => {
  const fromEnv = parseCliArgs(['--selftest'], { MEIBO_BIN: './bin/meibo', MEIBO_DEMO_DB: './demo.db' });
  assert.equal(fromEnv.selftest, true);
  assert.ok(fromEnv.meiboBin.endsWith('bin/meibo'));
  assert.ok(fromEnv.dbPath.endsWith('demo.db'));
  assert.equal(fromEnv.partial, false);
  assert.equal(fromEnv.rangeFrom, 0);
  assert.equal(fromEnv.rangeTo, TOTAL_FRAMES - 1);
  assert.equal(fromEnv.aiAIn, 0);
  assert.equal(fromEnv.aiBIn, 0.5);

  const partial = parseCliArgs([
    '--out-dir', 'tmp-out', '--frames', '120-240', '--mux', 'a,b',
    '--ai-a-in', '1.5', '--ai-b-in', '0.5', '--no-encode',
  ], {});
  assert.equal(partial.partial, true);
  assert.equal(partial.rangeFrom, 120);
  assert.equal(partial.rangeTo, 240);
  assert.deepEqual(partial.mux, ['a', 'b']);
  assert.equal(partial.aiAIn, 1.5);
  assert.equal(partial.aiBIn, 0.5);
  assert.equal(partial.noEncode, true);

  assert.throws(() => parseCliArgs(['--frames', '240-120'], {}), /範囲が不正/);
  assert.throws(() => parseCliArgs(['--frames', '0-900'], {}), /範囲が不正/);
  assert.throws(() => parseCliArgs(['--mux', 'c'], {}), /a または b/);
  assert.throws(() => parseCliArgs(['--ai-a-in', '-1'], {}), /0 以上/);
});

test('buildDemoFilter は DEMO_RANGES の各区間をつないで 540x960 yuv420p にする', () => {
  const filter = buildDemoFilter(DEMO_RANGES);
  assert.match(filter, /trim=4\.4:9\.6/);
  assert.match(filter, /concat=n=3:v=1:a=0,scale=540:960:flags=lanczos,format=yuv420p\[v\]$/);
});

test('formatTokyoMonth は日本時間の YYYY-MM を返す', () => {
  // UTC 2026-10-31T15:30:00Z は日本時間 2026-11-01 00:30
  assert.equal(formatTokyoMonth(new Date('2026-10-31T15:30:00Z')), '2026-11');
  assert.equal(formatTokyoMonth(new Date('2026-11-24T00:00:00Z')), '2026-11');
});

test('findTableColumns と normalizeNextActionValue は取引先一覧の列番号と次回対応日時を正しく扱う', () => {
  const cols = findTableColumns(['', '取引先', '電話', '担当 ▲', '次回対応 ↓', '更新日時']);
  assert.deepEqual(cols, { companyIndex: 1, ownerIndex: 3, nextActionIndex: 4 });

  const missing = findTableColumns(['取引先名', '電話']);
  assert.equal(missing.companyIndex, 0);
  assert.equal(missing.ownerIndex, -1);
  assert.equal(missing.nextActionIndex, -1);

  assert.equal(normalizeNextActionValue(' 2026/11/25\n 09:00 '), '2026/11/25 09:00');
  assert.equal(normalizeNextActionValue('—'), null);
  assert.equal(normalizeNextActionValue(''), null);
  assert.equal(normalizeNextActionValue('未設定'), null);
});

test('createCalloutState は次回対応・着地予測・担当別2行札で共用でき、空値なら null を返す', () => {
  const next = createCalloutState(7.5, { label: '次回対応', value: '2026/11/25 09:00', sub: '合成サンプル株式会社', hold: 3.0 });
  assert.deepEqual(next, { t0: 7.5, hold: 3.0, label: '次回対応', value: '2026/11/25 09:00', sub: '合成サンプル株式会社' });

  const landing = createCalloutState(19.0, { label: '着地予測', value: '¥1,090,000', hold: 0.9 });
  assert.deepEqual(landing, { t0: 19.0, hold: 0.9, label: '着地予測', value: '¥1,090,000', sub: '' });

  const diff = createCalloutState(20.3, {
    label: '目標との差',
    rows: [
      { name: '担当 1', value: '￥520,000', negative: false },
      { name: '担当 2', value: '-￥30,000', negative: true },
    ],
    hold: 2.5,
  });
  assert.deepEqual(diff, {
    t0: 20.3,
    hold: 2.5,
    label: '目標との差',
    value: '',
    sub: '',
    rows: [
      { name: '担当 1', value: '￥520,000', negative: false },
      { name: '担当 2', value: '-￥30,000', negative: true },
    ],
  });

  assert.equal(createCalloutState(20.3, { label: '目標との差', rows: [], hold: 2.5 }), null);
  assert.equal(createCalloutState(7.5, { label: '次回対応', value: '', hold: 3.0 }), null);
  assert.equal(createCalloutState(7.5, { label: '', value: '2026/11/25 09:00', hold: 3.0 }), null);
});

test('extractProjectionDiffRows と isNegativeCurrency は担当別の目標との差を読み取り正負を判定する', () => {
  assert.equal(isNegativeCurrency('-￥30,000'), true);
  assert.equal(isNegativeCurrency('−¥30,000'), true);
  assert.equal(isNegativeCurrency('¥-30,000'), true);
  assert.equal(isNegativeCurrency('￥520,000'), false);
  assert.equal(isNegativeCurrency('¥0'), false);

  const rows = extractProjectionDiffRows([
    {
      owner: '担当 1',
      cells: [
        { label: '着地予測', value: '￥720,000' },
        { label: '月間目標', value: '￥200,000' },
        { label: '目標との差', value: '￥520,000' },
      ],
    },
    {
      owner: '担当 2',
      cells: [
        { label: '着地予測', value: '￥370,000' },
        { label: '月間目標', value: '￥400,000' },
        { label: '目標との差', value: '-￥30,000' },
      ],
    },
  ]);
  assert.deepEqual(rows, [
    { name: '担当 1', value: '￥520,000', negative: false },
    { name: '担当 2', value: '-￥30,000', negative: true },
  ]);
  assert.deepEqual(extractProjectionDiffRows([{ owner: '担当 1', cells: [{ label: '目標との差', value: '—' }] }]), []);
});

test('computeLogoClip と computeBoardTopPad は外接矩形＋2px余白とボード上端余白（8〜12px）を計算する', () => {
  const clip = computeLogoClip(
    [
      { x: 20, y: 12, width: 28, height: 28 },
      { x: 56, y: 16, width: 64, height: 20 },
    ],
    { width: 1280, height: 2200 },
    2,
  );
  assert.deepEqual(clip, { x: 18, y: 10, width: 104, height: 32 });
  assert.equal(computeLogoClip([], { width: 1280, height: 2200 }, 2), null);

  assert.equal(computeBoardTopPad(240, null), 10);
  assert.equal(computeBoardTopPad(240, 224), 10);
  assert.equal(computeBoardTopPad(240, 228), 8);
  assert.ok(computeBoardTopPad(240, 233) <= 6);
});

// CI は `npm ci` より先に単体試験を走らせる（依存が無い状態）。道具の先頭で第三者パッケージ（例 @playwright/test）を
// 静的に読むと、試験が純粋な関数を読み込むだけで「パッケージが無い」と落ちる（PR241で実際に落ちた）。
// 撮影の中など、実行時にだけ要るものは `await import()` で読む。
test('撮影・音の道具は、先頭で第三者パッケージを静的に読み込まない（CI は依存の導入前に試験を走らせる）', () => {
  const dir = new URL('../../tools/promo/', import.meta.url);
  const files = readdirSync(dir).filter((name) => name.endsWith('.mjs'));
  assert.ok(files.length >= 4, `道具のファイルが見つからない: ${files.join(',')}`);
  const bad = [];
  for (const name of files) {
    const source = readFileSync(new URL(name, dir), 'utf8');
    for (const m of source.matchAll(/^\s*import\s+(?:[^;'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      if (!spec.startsWith('node:') && !spec.startsWith('.') && !spec.startsWith('/')) bad.push(`${name}: ${spec}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('その検査は、実際に先頭の静的 import を見つけられる（見逃しの確認）', () => {
  const sample = "import { chromium } from '@playwright/test';\nimport 'left-pad';\nimport { a } from './x.mjs';\nconst c = await import('@playwright/test');\n";
  const found = [...sample.matchAll(/^\s*import\s+(?:[^;'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(found, ['@playwright/test', 'left-pad', './x.mjs']);
});
