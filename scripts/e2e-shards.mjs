#!/usr/bin/env node
// ブラウザテストの分割を、テストの件数ではなく、CIで測った所要時間で決める。
// 仕様: .kiro/specs/ci-e2e-shard-balance/
//
//   node scripts/e2e-shards.mjs plan <番号>/<総数>        担当のテストファイルを、1行1つ、Playwrightの位置引数（正規表現）で出す
//   node scripts/e2e-shards.mjs report <総数>             全分割の担当と、見積もりの時間を表で出す
//   node scripts/e2e-shards.mjs update <フォルダ> [--source 文] [--mounted-seconds N] [--out ファイル]
//                                                         CIのartifact（e2e-timing-*.json）から、時間の記録を作り直す
//
// 割り方：時間の長いファイルから順に、そのときいちばん軽い分割へ入れる（LPT法）。同じ重さは名前順で決めるので、結果は決定的。
// ファイル内の実行順と1 workerは変えない（playwright.config.mjs の fullyParallel: false のまま）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const TEST_DIR = path.join(ROOT, 'tests', 'e2e');
export const DURATIONS_FILE = path.join(here, 'e2e-shard-durations.json');
const SPEC_NAME = /\.(spec|test)\.(c|m)?[jt]sx?$/;
// playwright.config.mjs の testIgnore と同じもの（Day64は、専用のビルドとサーバーで流す）。
const IGNORED = new Set(['day-064.spec.mjs']);

const posix = (p) => p.split(path.sep).join('/');

/** 入口になるテストファイル（tests/e2e の直下）。Playwrightが探すものと同じ。 */
export function listEntryFiles(testDir = TEST_DIR) {
  return fs
    .readdirSync(testDir, { withFileTypes: true })
    .filter((e) => e.isFile() && SPEC_NAME.test(e.name) && !IGNORED.has(e.name))
    .map((e) => e.name)
    .sort();
}

/** 入口のファイルが、副作用だけのimportで読み込む別のspec。Playwrightは、テストを宣言したファイルの名前で時間を報告する。 */
export function importedSpecs(entry, testDir = TEST_DIR) {
  const text = fs.readFileSync(path.join(testDir, entry), 'utf8');
  const keys = [];
  for (const m of text.matchAll(/^\s*import\s+['"](\.{1,2}\/[^'"]+\.(?:spec|test)\.(?:c|m)?[jt]sx?)['"]/gm)) {
    keys.push(posix(path.relative(testDir, path.resolve(testDir, path.dirname(entry), m[1]))));
  }
  return keys;
}

/** Playwrightのjsonレポートから、テストを宣言したファイルごとの所要時間（秒）を出す。
 *  1つ目のファイルは、最初のテストの開始から最後のテストの終了まで。
 *  2つ目以降は、直前のファイルの最後のテストの終了から、そのファイルの最後のテストの終了まで（beforeAllなどの待ちも含む）。 */
export function fileSeconds(report) {
  const rows = [];
  const walk = (suite) => {
    for (const child of suite.suites ?? []) walk(child);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        for (const r of test.results ?? []) {
          const start = Date.parse(r.startTime);
          if (!Number.isFinite(start) || !Number.isFinite(r.duration)) throw new Error(`時間が読めないテストがある: ${spec.file}`);
          rows.push({ file: spec.file, start, end: start + r.duration });
        }
      }
    }
  };
  for (const s of report.suites ?? []) walk(s);
  rows.sort((a, b) => a.start - b.start || a.end - b.end);
  const out = new Map();
  const lastEnd = new Map();
  const firstStart = new Map();
  const order = [];
  for (const r of rows) {
    if (!firstStart.has(r.file)) {
      firstStart.set(r.file, r.start);
      order.push(r.file);
    }
    lastEnd.set(r.file, Math.max(lastEnd.get(r.file) ?? 0, r.end));
  }
  let prevEnd = null;
  for (const file of order) {
    const end = lastEnd.get(file);
    const begin = prevEnd === null ? firstStart.get(file) : prevEnd;
    out.set(file, Math.max(0, end - begin) / 1000);
    prevEnd = Math.max(prevEnd ?? 0, end);
  }
  return out;
}

/** 宣言したファイルの時間を、入口のファイルへ集める（入口が読み込む別のspecの分も、入口に足す）。 */
export function buildDurations(reports, { testDir = TEST_DIR, mountedSeconds = 0, source = '' } = {}) {
  const entries = listEntryFiles(testDir);
  const owner = new Map();
  for (const e of entries) {
    owner.set(e, e);
    for (const k of importedSpecs(e, testDir)) owner.set(k, e);
  }
  const perDeclared = new Map();
  for (const report of reports) {
    for (const [file, sec] of fileSeconds(report)) {
      const list = perDeclared.get(file) ?? [];
      list.push(sec);
      perDeclared.set(file, list);
    }
  }
  const files = {};
  const unknown = [];
  for (const [declared, list] of perDeclared) {
    const entry = owner.get(declared);
    if (!entry) {
      unknown.push(declared);
      continue;
    }
    const mean = list.reduce((a, b) => a + b, 0) / list.length;
    files[entry] = (files[entry] ?? 0) + mean;
  }
  if (unknown.length) throw new Error(`入口に結びつかないテストファイルがある: ${unknown.join(', ')}`);
  const rounded = {};
  for (const e of entries) if (e in files) rounded[e] = Math.round(files[e] * 10) / 10;
  return { generatedAt: new Date().toISOString(), source, mountedSeconds, files: rounded };
}

export function validateDurations(d) {
  if (!d || typeof d !== 'object' || typeof d.files !== 'object' || d.files === null) throw new Error('時間の記録の形が正しくない（files が無い）');
  const mounted = d.mountedSeconds ?? 0;
  if (!Number.isFinite(mounted) || mounted < 0) throw new Error('mountedSeconds が正の数でない');
  for (const [k, v] of Object.entries(d.files)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`時間が正の数でない: ${k}`);
  }
  return d;
}

function median(values) {
  if (!values.length) return 1;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 担当を決める。戻り値は、分割ごとの { files, load }（番号1が先頭）と、記録に無かったファイル。 */
export function plan(entries, durations, total) {
  validateDurations(durations);
  if (!Number.isInteger(total) || total < 1) throw new Error(`分割数が正しくない: ${total}`);
  if (total > entries.length) throw new Error(`分割数（${total}）がファイル数（${entries.length}）より多い`);
  const known = entries.filter((e) => e in durations.files).map((e) => durations.files[e]);
  const fallback = median(known);
  const missing = entries.filter((e) => !(e in durations.files));
  const weight = (e) => (e in durations.files ? durations.files[e] : fallback);
  const shards = Array.from({ length: total }, () => ({ files: [], load: 0 }));
  shards[0].load = durations.mountedSeconds ?? 0; // 番号1は、Day080の mounted の確認も流す
  const sorted = [...entries].sort((a, b) => weight(b) - weight(a) || (a < b ? -1 : a > b ? 1 : 0));
  for (const e of sorted) {
    let best = 0;
    for (let i = 1; i < total; i++) if (shards[i].load < shards[best].load) best = i;
    shards[best].files.push(e);
    shards[best].load += weight(e);
  }
  for (const s of shards) s.files.sort();
  return { shards, missing, fallback };
}

export function loadDurations(file = DURATIONS_FILE) {
  return validateDurations(JSON.parse(fs.readFileSync(file, 'utf8')));
}

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Playwrightの位置引数は正規表現。入口の名前に厳密に合わせる。 */
export const toFilter = (entry) => `tests/e2e/${escapeRegex(entry)}$`;

function readReports(dir) {
  const found = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/^e2e-timing-.*\.json$/.test(e.name)) found.push(p);
    }
  };
  walk(dir);
  if (!found.length) throw new Error(`e2e-timing-*.json が見つからない: ${dir}`);
  return found.sort().map((p) => JSON.parse(fs.readFileSync(p, 'utf8')));
}

function main(argv) {
  const [cmd, arg, ...rest] = argv;
  const opt = (name, fallback) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : fallback;
  };
  if (cmd === 'plan') {
    const m = /^(\d+)\/(\d+)$/.exec(arg ?? '');
    if (!m) throw new Error('使い方: plan <番号>/<総数>');
    const index = Number(m[1]);
    const total = Number(m[2]);
    if (index < 1 || index > total) throw new Error(`番号が範囲外: ${arg}`);
    const result = plan(listEntryFiles(), loadDurations(), total);
    if (result.missing.length) {
      console.error(`::warning::時間の記録に無いテストファイル（記録の中央値 ${result.fallback.toFixed(1)} 秒として割り当て）: ${result.missing.join(', ')}`);
    }
    for (const f of result.shards[index - 1].files) console.log(toFilter(f));
    return;
  }
  if (cmd === 'report') {
    const total = Number(arg);
    const durations = loadDurations();
    const { shards, missing } = plan(listEntryFiles(), durations, total);
    const sum = shards.reduce((a, s) => a + s.load, 0);
    shards.forEach((s, i) => console.log(`${i + 1}/${total}  ${s.files.length}ファイル  見積もり ${(s.load / 60).toFixed(1)}分`));
    console.log(`合計 ${(sum / 60).toFixed(1)}分 / 理想の1本あたり ${(sum / total / 60).toFixed(1)}分 / 最長 ${(Math.max(...shards.map((s) => s.load)) / 60).toFixed(1)}分`);
    if (missing.length) console.log(`記録に無い: ${missing.join(', ')}`);
    return;
  }
  if (cmd === 'update') {
    if (!arg) throw new Error('使い方: update <フォルダ> [--source 文] [--mounted-seconds N] [--out ファイル]');
    const reports = readReports(path.resolve(arg));
    const built = buildDurations(reports, {
      mountedSeconds: Number(opt('--mounted-seconds', 0)),
      source: opt('--source', ''),
    });
    validateDurations(built);
    const out = path.resolve(opt('--out', DURATIONS_FILE));
    fs.writeFileSync(out, `${JSON.stringify(built, null, 2)}\n`);
    console.log(`${Object.keys(built.files).length}ファイルの時間を書いた: ${posix(path.relative(ROOT, out))}`);
    return;
  }
  throw new Error('使い方: plan <番号>/<総数> | report <総数> | update <フォルダ>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(`e2e-shards: ${e.message}`);
    process.exit(1);
  }
}
