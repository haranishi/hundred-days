import assert from 'node:assert/strict';
import { chmodSync, readFileSync, rmSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { fixture } from './helpers.mjs';
import { AUDIT_EXCEPTIONS, auditResult, exceptionNotes } from '../lib/dependency-audit.mjs';

const script = fileURLToPath(new URL('../audit-dependencies.mjs', import.meta.url));
const report = (severity = '') => ({ auditReportVersion: 2,
  vulnerabilities: severity ? { fixture: { severity } } : {},
  metadata: { vulnerabilities: Object.fromEntries(['info', 'low', 'moderate', 'high', 'critical', 'total'].map(k => [k, severity && (k === severity || k === 'total') ? 1 : 0])) },
});
function environment(t) {
  const f = fixture(t), bin = join(f.cwd, '.fake-bin'), trace = join(f.cwd, 'calls.jsonl');
  f.write('.fake-bin/npm', `#!/usr/bin/env node\nimport fs from 'node:fs';\nfs.appendFileSync(process.env.AUDIT_TRACE, JSON.stringify({cwd:process.cwd(),args:process.argv.slice(2)})+'\\n');\nif(process.argv[2]==='ci'){process.stdout.write('{}');process.exit(Number(process.env.TREE_STATUS||0));}\nprocess.stdout.write(process.env.AUDIT_REPORT);\nprocess.exit(Number(process.env.AUDIT_STATUS||0));\n`);
  chmodSync(join(bin, 'npm'), 0o755);
  const project = directory => {
    const dependencies = { fixture: '1.0.0' };
    f.write(`${directory}/package.json`, JSON.stringify({ dependencies }));
    f.write(`${directory}/package-lock.json`, JSON.stringify({ lockfileVersion: 3, packages: { '': { dependencies }, 'node_modules/fixture': {version:'1.0.0'} } }));
  };
  const run = (data = report(), status = 0, treeStatus = 0) => spawnSync(process.execPath, [script], {
    cwd: f.cwd, encoding: 'utf8', env: { ...process.env, PATH: bin + delimiter + process.env.PATH,
      AUDIT_TRACE: trace, AUDIT_REPORT: typeof data === 'string' ? data : JSON.stringify(data), AUDIT_STATUS: String(status), TREE_STATUS: String(treeStatus) },
  });
  return { ...f, project, run, calls: () => readFileSync(trace, 'utf8').trim().split('\n').map(JSON.parse) };
}

test('root・新しいDayのsource・空白を含むtoolsも発見し、開発依存を省略せず監査する', t => {
  const f = environment(t);
  for (const p of ['.', 'day-099-new/source', 'day-099-new/tools/promo space']) f.project(p);
  f.git('add', 'package.json', 'package-lock.json');
  f.write('day-099-new/tests/package.json', '{"type":"module"}');
  f.project('ignored/cache');
  f.project('deleted'); f.git('add', 'deleted');
  for (const name of ['package.json', 'package-lock.json']) rmSync(join(f.cwd, 'deleted', name));
  const r = f.run(); assert.equal(r.status, 0, r.stderr);
  const all = f.calls(), calls = all.filter(c => c.args[0] === 'audit'); assert.equal(calls.length, 3);
  const validation = all.filter(c => c.args[0] === 'ci'); assert.equal(validation.length, 3);
  for (const c of validation) { assert.ok(c.args.includes('--dry-run')); assert.ok(c.args.includes('--ignore-scripts')); assert.ok(c.args.includes('--offline')); }
  assert.ok(calls.some(c => c.cwd.endsWith('tools/promo space')));
  for (const c of calls) { assert.equal(c.args[0], 'audit'); assert.ok(c.args.includes('--package-lock-only')); assert.ok(c.args.includes('--ignore-scripts')); assert.ok(c.args.includes('--include=dev')); assert.ok(!c.args.some(a => /omit|production/.test(a))); }
});
for (const severity of ['high', 'critical']) test(`${severity}が入れ子だけにあっても失敗する`, t => {
  const f = environment(t); f.project('new/source');
  const r = f.run(report(severity), 1); assert.equal(r.status, 1); assert.match(r.stdout, /FAIL.*new\/source/);
});
test('moderateをhighと混同せず件数を表示する', t => {
  const f = environment(t); f.project('.'); const r = f.run(report('moderate'), 1);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /moderate=1/);
});
test('通信失敗・不正JSON・不正件数・エラー応答を成功扱いにしない', t => {
  const f = environment(t); f.project('.');
  for (const [data, status] of [[{...report(),vulnerabilities:true},0],[{...report(),vulnerabilities:42},0],[report(), 2], ['not json', 0], [{}, 0], [{ ...report(), error: { code: 'ENETWORK' } }, 0], [{ ...report(), vulnerabilities: { hidden: { severity: 'high' } } }, 0], [report(), 1]]) {
    const r = f.run(data, status); assert.equal(r.status, 1, JSON.stringify(data));
  }
});
test('lock欠落・manifest欠落・不正JSONと依存の不一致を先に検出する', async t => {
  for (const variant of ['missing-lock', 'missing-manifest', 'invalid-json', 'drift']) await t.test(variant, t => {
    const f = environment(t); f.project('new/source');
    if (variant === 'missing-lock') rmSync(join(f.cwd, 'new/source/package-lock.json'));
    if (variant === 'missing-manifest') rmSync(join(f.cwd, 'new/source/package.json'));
    if (variant === 'invalid-json') f.write('new/source/package-lock.json', '{');
    if (variant === 'drift') f.write('new/source/package.json', '{"dependencies":{"fixture":"2.0.0"}}');
    assert.equal(f.run().status, 1);
  });
});

test('依存グラフのdry-runが失敗したら、脆弱性0の照会結果へ進まない', t => {
  const f = environment(t); f.project('new/source'); const r = f.run(report(), 0, 1);
  assert.equal(r.status, 1); assert.ok(!f.calls().some(c => c.args[0] === 'audit'));
});
test('peerDependenciesだけの新しいプロジェクトでもlockが必要', t => {
  const f = environment(t);f.project('.');f.write('new/source/package.json','{"peerDependencies":{"glob":"10.3.3"}}');
  assert.equal(f.run().status, 1);
});
test('実npmのcold cacheでも、空の依存グラフを成功扱いにしない', t => {
  const f=environment(t); f.project('.');
  f.write('package.json','{"dependencies":{"glob":"10.3.3"}}');
  f.write('package-lock.json','{"lockfileVersion":3,"packages":{"":{"dependencies":{"glob":"10.3.3"}}}}');
  const r=spawnSync(process.execPath,[script],{cwd:f.cwd,encoding:'utf8',env:{...process.env,npm_config_cache:join(f.cwd,'ignored/npm-cache'),npm_config_offline:'true'}});
  assert.equal(r.status,1);assert.match(r.stderr,/依存グラフ/);
});

// 修正版がまだ無い勧告を、期限つきで合格にする例外（.kiro/specs/dependency-audit-ci/followup-2026-11-18.md）
const GHSA = 'GHSA-fc5q-39xc-vjpf', OTHER = 'GHSA-aaaa-bbbb-cccc';
const exception = { id: GHSA, expires: '2026-12-18', reason: '試験用の例外' };
const advisory = (id, severity = 'high', url = `https://github.com/advisories/${id}`) => ({ source: 1, name: 'picomatch', severity, url, range: '<=4.0.7' });
const entry = (severity, via) => ({ name: 'x', severity, isDirect: false, via, effects: [], range: '*', nodes: [], fixAvailable: false });
const auditOf = vulnerabilities => {
  const metadata = Object.fromEntries(['info', 'low', 'moderate', 'high', 'critical'].map(k => [k, Object.values(vulnerabilities).filter(v => v.severity === k).length]));
  metadata.total = Object.keys(vulnerabilities).length;
  return { status: 1, stdout: JSON.stringify({ auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: metadata } }) };
};
const judge = (vulnerabilities, today = '2026-11-18') => auditResult(auditOf(vulnerabilities), { exceptions: [exception], today });
const chain = () => ({ picomatch: entry('high', [advisory(GHSA)]), fdir: entry('high', ['picomatch']), vite: entry('high', ['fdir', 'picomatch']) });

test('例外の勧告だけが理由のhighは、その部品を経由する親も含めて合格になる', () => {
  const r = judge(chain());
  assert.deepEqual([r.high, r.excepted, r.passed], [3, 3, true]);
});
test('例外は期限の当日まで有効で、翌日から失敗に戻る', () => {
  assert.equal(judge(chain(), '2026-12-18').passed, true);
  const r = judge(chain(), '2026-12-19');
  assert.deepEqual([r.excepted, r.passed], [0, false]);
});
test('別の勧告が混ざった部品は、例外の勧告があっても合格にならない', () => {
  const other = judge({ picomatch: entry('high', [advisory(GHSA)]), foo: entry('high', [advisory(OTHER)]) });
  assert.deepEqual([other.excepted, other.passed], [1, false]);
  assert.equal(judge({ picomatch: entry('high', [advisory(GHSA), advisory(OTHER)]) }).passed, false);
  const parent = judge({ picomatch: entry('high', [advisory(GHSA)]), vite: entry('high', ['picomatch', advisory(OTHER)]) });
  assert.deepEqual([parent.excepted, parent.passed], [1, false]);
});
test('criticalは例外にできない', () => {
  assert.equal(judge({ picomatch: entry('critical', [advisory(GHSA, 'critical')]) }).passed, false);
  assert.equal(judge({ picomatch: entry('high', [advisory(GHSA, 'critical')]) }).passed, false);
  assert.equal(judge({ lib: entry('critical', [advisory(OTHER, 'critical')]), vite: entry('high', ['lib']) }).passed, false);
  // 部品の重要度がcriticalなら、原因が例外の勧告でも除かない（除いた件数にも数えない）
  const odd = judge({ picomatch: entry('critical', [advisory(GHSA)]) });
  assert.deepEqual([odd.excepted, odd.passed], [0, false]);
});
test('勧告は住所が https://github.com/advisories/<ID> と完全一致するものだけを例外とみなす', () => {
  const base = `https://github.com/advisories/${GHSA}`;
  for (const url of [`${base}-x`, `https://github.com/advisories/x${GHSA}`, `${base}/`, `http://github.com/advisories/${GHSA}`,
    `https://example.com/${GHSA}`, `https://example.com/advisories/${GHSA}`, GHSA, 'https://example.com/other', '', undefined, null, 42]) {
    assert.equal(judge({ picomatch: entry('high', [{ ...advisory(GHSA), url }]) }).passed, false, String(url));
  }
  assert.equal(judge({ picomatch: entry('high', [{ ...advisory(GHSA), url: base }]) }).passed, true);
});
test('原因が空・不正・存在しない部品だけのhighは合格にしない', () => {
  for (const via of [[], undefined, [null], ['missing-package']]) assert.equal(judge({ x: entry('high', via) }).passed, false, JSON.stringify(via));
});
test('循環があっても、悪い原因が混ざればすべて落ち、混ざらなければすべて合格になる', () => {
  const good = judge({ a: entry('high', ['b', advisory(GHSA)]), b: entry('high', ['a']) });
  assert.deepEqual([good.excepted, good.passed], [2, true]);
  const bad = judge({ a: entry('high', ['b', advisory(GHSA)]), b: entry('high', ['a', advisory(OTHER)]) });
  assert.deepEqual([bad.excepted, bad.passed], [0, false]);
});
test('例外の勧告にたどり着かない部品（互いや自分だけを参照する循環）は合格にしない', () => {
  const ring = judge({ a: entry('high', ['b']), b: entry('high', ['a']) });
  assert.deepEqual([ring.excepted, ring.passed], [0, false]);
  assert.equal(judge({ a: entry('high', ['a']) }).passed, false);
  // 根拠のない循環を経由する親も、根拠のある部品と一緒でも、落ちる（根拠のある部品だけが残る）
  const mixed = judge({ picomatch: entry('high', [advisory(GHSA)]), a: entry('high', ['b']), b: entry('high', ['a']), c: entry('high', ['a', 'picomatch']) });
  assert.deepEqual([mixed.excepted, mixed.passed], [1, false]);
  // 例外の一覧が空なら、根拠のある形でも通らない
  assert.equal(auditResult(auditOf(chain()), { exceptions: [], today: '2026-11-18' }).passed, false);
});
test('moderate以下の勧告や部品は、例外の判定に影響しない', () => {
  const r = judge({ picomatch: entry('high', [advisory(GHSA)]), mod: entry('moderate', [advisory(OTHER, 'moderate')]), vite: entry('high', ['picomatch', 'mod']) });
  assert.deepEqual([r.high, r.moderate, r.excepted, r.passed], [2, 1, 2, true]);
});
test('例外の一覧は、IDの形式・期限の日付・理由を守り、重複しない', () => {
  for (const item of AUDIT_EXCEPTIONS) {
    assert.match(item.id, /^GHSA(-[a-z0-9]{4}){3}$/);
    assert.match(item.expires, /^\d{4}-\d{2}-\d{2}$/); assert.ok(!Number.isNaN(Date.parse(item.expires)));
    assert.ok(item.reason.length >= 20, `${item.id}: 理由が短い`);
  }
  assert.equal(new Set(AUDIT_EXCEPTIONS.map(item => item.id)).size, AUDIT_EXCEPTIONS.length);
});
test('例外の状態を、有効なら残り日数、切れていれば無効と書く', () => {
  assert.match(exceptionNotes([exception], '2026-11-18')[0], new RegExp(`${GHSA}.*残り30日`));
  assert.match(exceptionNotes([exception], '2026-12-19')[0], /期限切れ.*無効/);
  assert.deepEqual(exceptionNotes([], '2026-11-18'), []);
});
// 実際の一覧に対する通し（期限が切れたら、監査が失敗に戻るのが正しいので、この試験は飛ばす）
const live = AUDIT_EXCEPTIONS.find(item => item.id === GHSA);
test('実際の例外の一覧で、picomatch由来のhighだけのプロジェクトが合格し、例外の状態をログに出す', { skip: !live || live.expires < new Date().toISOString().slice(0, 10) }, t => {
  const f = environment(t); f.project('new/source');
  const report = auditOf({ picomatch: entry('high', [advisory(GHSA)]), vite: entry('high', ['picomatch']) });
  const r = f.run(JSON.parse(report.stdout), 1);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /OK.*new\/source.*high=2.*例外2件/); assert.match(r.stdout, new RegExp(`例外 ${GHSA}.*残り`));
});
test('実際の一覧に無い勧告のhighは、例外つきの監査でも終了コード1のまま', t => {
  const f = environment(t); f.project('new/source');
  const r = f.run(JSON.parse(auditOf({ foo: entry('high', [advisory(OTHER)]) }).stdout), 1);
  assert.equal(r.status, 1); assert.match(r.stdout, /FAIL.*new\/source/);
});
