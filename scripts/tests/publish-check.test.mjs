import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkDay, listAppDirs, loadDay } from '../lib/publish-contract.mjs';
import * as gate from '../publish-check.mjs';
import {
  BROWSER_SPECS,
  RESTORE_FAILED,
  browserEnv,
  exitCodeOf,
  formatSummary,
  gateEnv,
  newResult,
  normalEnv,
  parseArgs,
  playwrightArgs,
  portFromServeLog,
  probeOnce,
  resolveDay,
  serverGone,
  stopProcess,
  waitUntilReady,
} from '../publish-check.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const script = fileURLToPath(new URL('../publish-check.mjs', import.meta.url));
const serveDist = fileURLToPath(new URL('../serve-dist.mjs', import.meta.url));
const DIR = 'day-071-kage-shogen';
const env = { ...process.env };
delete env.PUBLISH_CHECK_DAY;

test('引数：--day と --static-only を読み、誤りは理由を返す', () => {
  assert.deepEqual(parseArgs(['--day', '71']), { day: '71', staticOnly: false, help: false });
  assert.deepEqual(parseArgs(['--static-only', '--day=071']), { day: '071', staticOnly: true, help: false });
  assert.equal(parseArgs(['--help']).help, true);
  for (const argv of [[], ['--day'], ['--day', '--static-only'], ['--day', ' '], ['--day', '71', '--day', '72'], ['--day', '71', '--fast'], ['71']]) {
    assert.ok(parseArgs(argv).error, JSON.stringify(argv));
  }
});

const ENTRIES = [
  { dir: 'day-019-sonomama-code', hasIndex: false },
  { dir: 'day-070-flip-court', hasIndex: true },
  { dir: DIR, hasIndex: true },
  { dir: 'day-080-alpha', hasIndex: true },
  { dir: 'day-080-beta', hasIndex: true },
];

test('Dayの決め方：番号・0埋め・フォルダ名で1つに決め、無い・複数・index.html が無いときは理由を返す', () => {
  for (const value of ['71', '071', DIR]) assert.deepEqual(resolveDay(value, ENTRIES), { dir: DIR });
  assert.match(resolveDay('999', ENTRIES).error, /day-999-\* のフォルダが見つかりません/);
  assert.match(resolveDay('80', ENTRIES).error, /複数あります：day-080-alpha, day-080-beta/);
  assert.match(resolveDay('19', ENTRIES).error, /day-019-sonomama-code に index\.html がありません/);
  assert.match(resolveDay('day-071', ENTRIES).error, /見つかりません/);
});

test('環境変数：検査用は対象のDayだけを指し、通常のビルドでは検査用の指定と出力先の差し替えを外す', () => {
  const base = { PATH: '/bin', PUBLISH_CHECK_DAY: '5', HUNDRED_DAYS_BUILD_DIR: 'elsewhere', KEEP: '1' };
  assert.deepEqual(normalEnv(base), { PATH: '/bin', KEEP: '1' });
  assert.deepEqual(gateEnv(base, DIR), { PATH: '/bin', KEEP: '1', PUBLISH_CHECK_DAY: '71' });
  assert.deepEqual(browserEnv(base, 'day-007-web-piano', 43210), {
    PATH: '/bin',
    KEEP: '1',
    PUBLISH_CHECK_DAY: '7',
    PLAYWRIGHT_PORT: '43210',
  });
  // CI があると Playwright が自分のサーバーを立てようとする。公開ゲートが立てたサーバーを使い回させるため外す
  assert.equal('CI' in browserEnv({ ...base, CI: 'true' }, DIR, 43210), false);
  assert.equal(base.PUBLISH_CHECK_DAY, '5', '元の環境は変えない');
});

test('ブラウザの試験：横断の3本だけを、一時ディレクトリへ成果物を出して流す', () => {
  assert.deepEqual(BROWSER_SPECS, ['tests/e2e/shared-share.spec.mjs', 'tests/e2e/external-days.spec.mjs', 'tests/e2e/security-headers.spec.mjs']);
  const args = playwrightArgs('tmp-output');
  assert.deepEqual(args.slice(0, 4), ['test', ...BROWSER_SPECS]);
  assert.ok(args.includes('--reporter=line'));
  assert.ok(args.includes('--output=tmp-output'));
});

test('ポートの読み取り：serve-dist の起動の1行から、実際に開いたポートを読む', () => {
  assert.equal(portFromServeLog('Serving dist at http://127.0.0.1:53830\n'), 53830);
  assert.equal(portFromServeLog('前の行\nServing dist at http://127.0.0.1:4173\n'), 4173);
  assert.equal(portFromServeLog('Serving dist at http://127.0.0.1:0\n'), null, '0 は実際のポートではない');
  assert.equal(portFromServeLog('Serving dist at http://127.0.0.1:'), null, 'まだ書き終わっていない');
  assert.equal(portFromServeLog(''), null);
});

test('レビューA：分割して届いた出力は、改行で終わった完全な行だけから読む', () => {
  const line = 'Serving dist at http://127.0.0.1:64737\n';
  // どこで2つに分かれて届いても、1つ目だけでは決めず、2つそろってから 64737 を読む
  for (let cut = 1; cut < line.length; cut += 1) {
    const first = line.slice(0, cut);
    assert.equal(portFromServeLog(first), null, JSON.stringify(first));
    assert.equal(portFromServeLog(first + line.slice(cut)), 64737, JSON.stringify(first));
  }
  assert.equal(portFromServeLog(line), 64737);
  // 行の全体が一致したときだけ読む
  assert.equal(portFromServeLog('Serving dist at http://127.0.0.1:64737 (extra)\n'), null);
  assert.equal(portFromServeLog('> Serving dist at http://127.0.0.1:64737\n'), null);
});

test('準備待ち：200 が返るまで繰り返し、サーバーが先に終わった・時間切れなら理由を返す', async () => {
  const instant = async () => {};
  let calls = 0;
  assert.deepEqual(await waitUntilReady({ probe: async () => ++calls >= 3, wait: instant }), { ready: true, reason: '' });
  assert.equal(calls, 3);

  let checks = 0;
  const gone = await waitUntilReady({
    probe: async () => false,
    stopped: () => (++checks > 2 ? 'サーバーが先に終了した（終了コード 1）' : ''),
    wait: instant,
  });
  assert.deepEqual(gone, { ready: false, reason: 'サーバーが先に終了した（終了コード 1）' });

  let clock = 0;
  const late = await waitUntilReady({
    probe: async () => false,
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
  });
  assert.equal(late.ready, false);
  assert.match(late.reason, /10秒待っても 200 が返らなかった/);
  assert.equal(clock, 10_000, '既定は100ミリ秒ごとに、10秒まで');

  const unread = await waitUntilReady({ probe: async () => false, timeout: 0, late: '起動の1行からポートを読めなかった', wait: instant });
  assert.deepEqual(unread, { ready: false, reason: '起動の1行からポートを読めなかった' });
});

test('終了の理由：動いていれば空、終わっていれば終了コードか信号', () => {
  assert.equal(serverGone({ exitCode: null, signalCode: null }), '');
  assert.equal(serverGone({ exitCode: 1, signalCode: null }), 'サーバーが先に終了した（終了コード 1）');
  assert.equal(serverGone({ exitCode: null, signalCode: 'SIGKILL' }), 'サーバーが先に終了した（SIGKILL）');
});

function fakeChild({ stopsOn = ['SIGTERM', 'SIGKILL'], exitCode = null } = {}) {
  const child = Object.assign(new EventEmitter(), { pid: 4242, exitCode, signalCode: null, signals: [] });
  child.kill = (signal) => {
    child.signals.push(signal);
    if (stopsOn.includes(signal)) {
      setImmediate(() => {
        child.signalCode = signal;
        child.emit('exit', null, signal);
      });
    }
    return true;
  };
  return child;
}

test('止め方：SIGTERM で止まればそこで終わり、止まらなければ待ってから SIGKILL', async () => {
  const polite = fakeChild();
  assert.equal(await stopProcess(polite), 'terminated');
  assert.deepEqual(polite.signals, ['SIGTERM']);
  const stubborn = fakeChild({ stopsOn: ['SIGKILL'] });
  assert.equal(await stopProcess(stubborn, { grace: 20 }), 'killed');
  assert.deepEqual(stubborn.signals, ['SIGTERM', 'SIGKILL']);
  const done = fakeChild({ exitCode: 0 });
  assert.equal(await stopProcess(done), 'exited');
  assert.deepEqual(done.signals, []);
  const never = Object.assign(fakeChild(), { pid: undefined });
  assert.equal(await stopProcess(never), 'not-started');
  assert.deepEqual(never.signals, []);
});

// 実際のプロセスを起こす試験は、失敗しても t.after で必ず止める（ps に残さない）。
// 固まっても CI を止めないよう上限を付け、遅い環境（CPUの負荷）でも落ちないよう、待ちの上限は長めに取る
const alive = (child) => child.exitCode === null && child.signalCode === null;
const REAL_PROCESS = { timeout: 60_000 };
const GRACE = { grace: 10_000 };

test('止め方：SIGTERM を無視する実際のプロセスも、SIGKILL で止める', REAL_PROCESS, async (t) => {
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); console.log('ready'); setInterval(() => {}, 1000);"], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  t.after(() => {
    if (alive(child)) child.kill('SIGKILL');
  });
  await new Promise((resolve) => child.stdout.once('data', resolve));
  assert.equal(await stopProcess(child, { grace: 200 }), 'killed');
  // stopProcess は SIGKILL のあと grace だけ待って返る。遅い環境ではまだ終わっていないことがあるので、終わるのを待ってから見る
  await exitOf(child, 30_000);
  assert.equal(child.signalCode, 'SIGKILL');
});

/** 子が終わるのを待つ。固まらないよう、上限を過ぎたら失敗にする */
function exitOf(child, limit) {
  if (!alive(child)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${limit}ミリ秒たっても終わらない`)), limit);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

test('第3周3：draft と published 以外の status は、公開ゲートの対象にしない', () => {
  assert.equal(gate.statusError?.('draft'), '');
  assert.equal(gate.statusError?.('published'), '');
  assert.equal(gate.statusError?.('external'), '公開ゲートの対象は、draft と published のDayです。このDayは status が external です');
});

test('第3周1：止まる合図は SIGINT・SIGTERM・SIGHUP。端末が閉じた SIGHUP は、子には SIGTERM で伝える', () => {
  assert.deepEqual(gate.STOP_SIGNALS, ['SIGINT', 'SIGTERM', 'SIGHUP']);
  assert.equal(gate.forwardedSignal?.('SIGHUP'), 'SIGTERM');
  assert.equal(gate.forwardedSignal?.('SIGINT'), 'SIGINT');
  assert.equal(gate.forwardedSignal?.('SIGTERM'), 'SIGTERM');
  // 子の出力はこちらで流すので、端末につながっているときだけ Playwright に色と行の上書きを使わせる
  assert.deepEqual(gate.ttyEnv?.(true), { FORCE_COLOR: '1', PLAYWRIGHT_FORCE_TTY: '1' });
  assert.deepEqual(gate.ttyEnv?.(false), {});
});

/* 出力先が閉じたあとに process.stdout.write すると EPIPE で失敗し、受け手が無いとその場で落ちる（子の出力を流す経路）。
   console.* は自分で握りつぶすので、--static-only の試験だけでは、この落ち方を再現できない */
function writeAfterClosed(t, code) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => {
    if (alive(child)) child.kill('SIGKILL');
  });
  child.stdout.destroy();
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  return new Promise((resolve) => child.once('close', (exitCode) => resolve({ exitCode, stderr })));
}

test('第3周1：出力の失敗の受け皿があれば、出力先が閉じたあとの process.stdout.write でも落ちない', REAL_PROCESS, async (t) => {
  const writes = "for (let i = 0; i < 20; i += 1) process.stdout.write('x'.repeat(1000) + '\\n'); setTimeout(() => { process.stdout.write('late\\n'); setTimeout(() => process.exit(7), 100); }, 100);";
  // 対照：受け皿が無いと、EPIPE で落ちる（この環境で、守るべき落ち方が本当に起きること）
  const unguarded = await writeAfterClosed(t, writes);
  assert.notEqual(unguarded.exitCode, 7);
  assert.match(unguarded.stderr, /EPIPE/);
  // 公開ゲートの受け皿を付けると、最後まで走って自分の終了コードで終わる
  const guarded = await writeAfterClosed(t, `import { ignoreOutputErrors } from ${JSON.stringify(pathToFileURL(script).href)}; ignoreOutputErrors(); ${writes}`);
  assert.equal(guarded.exitCode, 7, guarded.stderr);
  assert.doesNotMatch(guarded.stderr, /EPIPE/);
});

function siteWithDist(t) {
  const site = mkdtempSync(join(tmpdir(), 'hundred-days-serve-'));
  t.after(() => rmSync(site, { recursive: true, force: true }));
  mkdirSync(join(site, 'dist'));
  writeFileSync(join(site, 'dist', 'index.html'), '<!doctype html><title>ok</title>');
  return site;
}

function startServeDist(t, port) {
  const server = spawn(process.execPath, [serveDist], { cwd: siteWithDist(t), env: { ...env, PLAYWRIGHT_PORT: String(port) }, stdio: 'ignore' });
  t.after(() => {
    if (alive(server)) server.kill('SIGKILL');
  });
  return server;
}

// 起動の1行（Serving dist at …）を読みながら serve-dist を立てる
function serveDistWithLine(t, port) {
  const server = spawn(process.execPath, [serveDist], {
    cwd: siteWithDist(t),
    env: { ...env, PLAYWRIGHT_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  t.after(() => {
    if (alive(server)) server.kill('SIGKILL');
  });
  const line = new Promise((resolve, reject) => {
    let text = '';
    server.stdout.on('data', (chunk) => {
      text += chunk;
      if (text.includes('\n')) resolve(text.slice(0, text.indexOf('\n')));
    });
    server.once('exit', (code) => reject(new Error(`serve-dist が先に終了した（${code}）`)));
  });
  return { server, line };
}

// 試験だけで使う空きポート（試験の中の競合は問題にしない）
const openPort = () =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });

test('レビュー1：serve-dist は PLAYWRIGHT_PORT=0 なら、実際に開いたポートを起動の1行に出す', REAL_PROCESS, async (t) => {
  const { server, line } = serveDistWithLine(t, 0);
  const first = await line;
  const port = Number(/^Serving dist at http:\/\/127\.0\.0\.1:(\d+)$/.exec(first)?.[1]);
  assert.ok(port > 0, first);
  assert.equal(await probeOnce(`http://127.0.0.1:${port}/`), true);
  assert.equal(await stopProcess(server, GRACE), 'terminated');
});

test('レビュー1：0以外のポートを指定したときの起動の1行は、変更前と同じ', REAL_PROCESS, async (t) => {
  // 空きポートを調べてから立てるので、その間に別のプロセスが取ると serve-dist は EADDRINUSE で落ちる。そのときは別のポートでやり直す
  for (let attempt = 1; ; attempt += 1) {
    const port = await openPort();
    const { server, line } = serveDistWithLine(t, port);
    const first = await line.catch(() => null);
    if (first === null && attempt < 5) continue;
    // 変更前の serve-dist は `Serving dist at http://${host}:${port}` を、指定したポートのまま出していた
    assert.equal(first, `Serving dist at http://127.0.0.1:${port}`);
    assert.equal(await stopProcess(server, GRACE), 'terminated');
    return;
  }
});

test('検査用のサーバー：ポート0で立て、1行から読んだポートで 200 を待ち、SIGTERM で止める（公開ゲートと同じ流れ）', REAL_PROCESS, async (t) => {
  const { server, line } = serveDistWithLine(t, 0);
  // serveDistWithLine は改行を除いた1行を返す。公開ゲートは改行で終わった行だけを読むので、改行を戻して渡す
  const port = portFromServeLog(`${await line}\n`);
  assert.ok(port, '起動の1行からポートを読めること');
  const url = `http://127.0.0.1:${port}/`;
  assert.deepEqual(await waitUntilReady({ probe: () => probeOnce(url), stopped: () => serverGone(server), timeout: 20_000 }), { ready: true, reason: '' });
  assert.equal(serverGone(server), '', '200 を待った直後も、自分のサーバーが生きている');
  assert.equal(await stopProcess(server, GRACE), 'terminated');
  assert.equal(server.exitCode, 0);
  assert.equal(await probeOnce(url), false, '止めたあとは応答しない');
});

test('検査用のサーバー：起動に失敗して先に終わったら、時間切れを待たずに理由を返す', REAL_PROCESS, async (t) => {
  // 同じポートを先に使っておき、serve-dist を EADDRINUSE で落とす
  const blocker = createServer((request, response) => {
    response.statusCode = 503;
    response.end();
  });
  await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
  t.after(() => blocker.close());
  const { port } = blocker.address();
  const server = startServeDist(t, port);
  // 時間切れなら理由は「20秒待っても…」になる。終了の理由が返れば、時間切れを待たずに止まったことになる（実時間には頼らない）
  const ready = await waitUntilReady({ probe: () => probeOnce(`http://127.0.0.1:${port}/`), stopped: () => serverGone(server), timeout: 20_000 });
  assert.deepEqual(ready, { ready: false, reason: 'サーバーが先に終了した（終了コード 1）' });
});

const violation = {
  dir: DIR,
  id: 'share-text-title',
  title: '共有文に meta.json の題名がそのまま入る',
  source: 'tests/e2e/shared-share.spec.mjs',
  expected: '「影証言」をそのまま含む',
  actual: '影',
};
const finished = (overrides = {}) => ({ ...newResult(DIR), build: 'passed', browser: 'passed', restore: 'passed', ...overrides });

test('要約：すべて通れば合格（終了コード0）', () => {
  const text = formatSummary(finished());
  assert.equal(exitCodeOf(finished()), 0);
  for (const line of ['静的な契約：合格', 'ビルド：合格', 'ブラウザ：合格', 'dist/ の復元：通常のビルドに戻した']) assert.ok(text.includes(line), line);
  assert.match(text, /公開ゲート：合格$/);
});

test('要約：静的な違反があれば、ブラウザが通っても不合格にし、違反の一覧を出す', () => {
  const text = formatSummary(finished({ violations: [violation] }));
  assert.equal(exitCodeOf(finished({ violations: [violation] })), 1);
  assert.match(text, /静的な契約：違反 1件/);
  assert.match(text, /day-071-kage-shogen：共有文に meta\.json の題名がそのまま入る（share-text-title）/);
  assert.match(text, /公開ゲート：不合格$/);
});

test('要約：--static-only は静的な検査だけで判定し、ブラウザの検査をしていないと書く', () => {
  const result = newResult(DIR, true);
  assert.equal(exitCodeOf(result), 0);
  assert.match(formatSummary(result), /ブラウザ：実行していない（--static-only）/);
  assert.match(formatSummary(result), /公開ゲート：合格（静的な検査だけ。ブラウザの検査はまだ）$/);
  assert.equal(exitCodeOf({ ...result, violations: [violation] }), 1);
});

test('要約：ビルド・ブラウザの失敗、中断、例外は不合格', () => {
  const failures = [
    { build: 'failed', browser: 'skipped' },
    { browser: 'failed' },
    { browser: 'interrupted', interrupted: 'SIGINT' },
    { error: 'Playwright が見つかりません' },
  ];
  for (const overrides of failures) assert.equal(exitCodeOf(finished(overrides)), 1, JSON.stringify(overrides));
  assert.match(formatSummary(finished({ browser: 'interrupted', interrupted: 'SIGTERM' })), /中断：SIGTERM を受けて止めた/);
  assert.match(formatSummary(finished({ build: 'failed', buildNote: 'dist/x/index.html ができていない' })), /ビルド：不合格（dist\/x\/index\.html ができていない）/);
  assert.match(formatSummary(finished({ browser: 'failed', output: 'tmp-output' })), /資料（スクリーンショット・トレース）：tmp-output/);
  const notReady = finished({ browser: 'failed', browserNote: '検査用のサーバーが準備できなかった：サーバーが先に終了した（終了コード 1）' });
  assert.match(formatSummary(notReady), /ブラウザ：不合格（検査用のサーバーが準備できなかった：サーバーが先に終了した（終了コード 1））/);
});

test('要約：dist/ を戻せなかったら、目立つ文で直し方を出し、不合格にする', () => {
  const text = formatSummary(finished({ restore: 'failed' }));
  assert.ok(text.includes(RESTORE_FAILED));
  assert.match(RESTORE_FAILED, /npm run build/);
  assert.equal(exitCodeOf(finished({ restore: 'failed' })), 1);
});

test('第3周4：復元に失敗した警告は断定しない（ビルドが始まる前に失敗したなら、dist/ は変わっていない）', () => {
  assert.match(RESTORE_FAILED, /検査用のビルドが残っている可能性があります/);
  assert.match(RESTORE_FAILED, /ビルドが始まる前に失敗した場合（ほかのDayの meta\.json が壊れているなど）は、dist\/ は変わっていません/);
  assert.doesNotMatch(RESTORE_FAILED, /検査用のビルドが残っています。/);
});

test('要約：meta.json が途中で変わったら警告する', () => {
  assert.match(formatSummary(finished({ metaChanged: true })), /meta\.json が、検査の途中で変わりました/);
});

const runCli = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: root, env, encoding: 'utf8', timeout: 60_000 });

test('実行：使い方の誤りと、Dayが決まらないときは、ビルドの前に終了コード2で止まる', () => {
  for (const args of [[], ['--day', '999'], ['--day', '71', '--bogus']]) {
    const run = runCli(...args);
    assert.equal(run.status, 2, run.stdout + run.stderr);
    assert.ok(!run.stdout.includes('1/3'), 'Dayを決める前に止まっている');
  }
  assert.match(runCli('--day', '999').stderr, /day-999-\* のフォルダが見つかりません/);
  assert.equal(runCli('--help').status, 0);
});

test('実行：--static-only は静的な契約だけを見て、ビルドに進まない', () => {
  const dir = listAppDirs(root).at(-1);
  const run = runCli('--day', dir, '--static-only');
  assert.equal(run.status, checkDay(loadDay(root, dir)).length ? 1 : 0, run.stdout + run.stderr);
  assert.match(run.stdout, /1\/3 静的な契約/);
  assert.ok(!run.stdout.includes('2/3'), 'ビルドに進んでいない');
});

// 出力先が先に閉じる（| head -n 3 など）と、書き込みは EPIPE で失敗する。それで落ちずに、最後まで続けること
function runWithClosedOutput(t, closeWhen) {
  const dir = listAppDirs(root).at(-1);
  const child = spawn(process.execPath, [script, '--day', dir, '--static-only'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => {
    if (alive(child)) child.kill('SIGKILL');
  });
  if (closeWhen === 'before-any-output') child.stdout.destroy();
  else child.stdout.once('data', () => child.stdout.destroy());
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const expected = checkDay(loadDay(root, dir)).length ? 1 : 0;
  return new Promise((resolve) => child.once('close', (code) => resolve({ code, stderr, expected })));
}

test('第3周1：出力先が先に閉じても、EPIPE で落ちずに、静的な検査の終了コードを返す', REAL_PROCESS, async (t) => {
  // 何も読まないうちに閉じると、子の最初の書き込みから必ず EPIPE になる（再現が実時間に左右されない）
  const closed = await runWithClosedOutput(t, 'before-any-output');
  assert.doesNotMatch(closed.stderr, /EPIPE/);
  assert.equal(closed.code, closed.expected, closed.stderr);
  // 最初のデータを受けてから閉じる形（| head と同じ）。こちらは、子がもう全部書き終えていれば EPIPE は起きない
  const afterFirst = await runWithClosedOutput(t, 'after-first-data');
  assert.doesNotMatch(afterFirst.stderr, /EPIPE/);
  assert.equal(afterFirst.code, afterFirst.expected, afterFirst.stderr);
});
