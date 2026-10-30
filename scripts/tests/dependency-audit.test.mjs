import assert from 'node:assert/strict';
import { chmodSync, readFileSync, rmSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { fixture } from './helpers.mjs';

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
