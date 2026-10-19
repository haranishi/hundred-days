/* 公開ゲート：下書きのDayを、公開したときと同じ条件で検査する（npm run publish:check -- --day <番号>）。
   共有・OGP・ヘッダーの横断の試験は published のDayしか見ないので、下書きの違反は、公開した瞬間にCIで初めて見つかっていた。
   meta.json は書き換えず、PUBLISH_CHECK_DAY でそのDayだけを公開済みとみなしてビルドする。
   検査用のビルドが dist/ に残ると、あとの通常のE2Eが下書きを含んで走る。だから、通常の終了・失敗・例外・SIGINT・SIGTERM・
   SIGHUP・出力先の切断では、サーバーを止めて通常のビルドに戻す。SIGKILL や電源断のようにその場で止まると後始末は走らず、
   検査用のビルドが残ることがある（そのときは npm run build を実行する）。 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { get as httpGet } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLISH_CHECK_ENV, matchesDay } from './lib/day-status.mjs';
import { checkDay, formatViolations, loadDay } from './lib/publish-contract.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));

export const USAGE = '使い方：npm run publish:check -- --day <番号> [--static-only]';
export const BROWSER_SPECS = [
  'tests/e2e/shared-share.spec.mjs',
  'tests/e2e/external-days.spec.mjs',
  'tests/e2e/security-headers.spec.mjs',
];

// ---------------------------------------------------------------- 純粋な部分

export function parseArgs(argv) {
  const options = { day: null, staticOnly: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--static-only') options.staticOnly = true;
    else if (arg === '--day' || arg.startsWith('--day=')) {
      const value = arg === '--day' ? argv[(index += 1)] : arg.slice('--day='.length);
      if (options.day !== null) return { error: '--day は1つだけ指定してください' };
      if (!value?.trim() || value.startsWith('--')) return { error: '--day のあとに、Dayの番号（例：71）を書いてください' };
      options.day = value.trim();
    } else {
      return { error: `知らないオプションです：${arg}` };
    }
  }
  if (!options.help && options.day === null) return { error: '--day で、検査するDayを指定してください' };
  return options;
}

/** entries は [{ dir, hasIndex }]。--day の値（71・071・day-071-kage-shogen）から、フォルダを1つに決める */
export function resolveDay(value, entries) {
  const target = String(value ?? '').trim();
  const label = /^\d+$/.test(target) ? `day-${target.padStart(3, '0')}-*` : target;
  const matches = entries.filter(({ dir }) => matchesDay(target, dir));
  if (!matches.length) return { error: `${label} のフォルダが見つかりません` };
  if (matches.length > 1) return { error: `${label} に当たるフォルダが複数あります：${matches.map(({ dir }) => dir).join(', ')}` };
  const [{ dir, hasIndex }] = matches;
  if (!hasIndex) return { error: `${dir} に index.html がありません（アプリ本体を持たないDayは、公開ゲートの対象外です）` };
  return { dir };
}

/** draft と published 以外（external など）は、このサイトで配信しないので、ビルドしても検査にならない */
export function statusError(status) {
  return ['draft', 'published'].includes(status) ? '' : `公開ゲートの対象は、draft と published のDayです。このDayは status が ${status} です`;
}

// 止まる合図として扱う信号。登録と解除は、この一覧で1か所にまとめる
export const STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/** 子へ送る信号。端末が閉じた（SIGHUP）ときは、serve-dist と Playwright が後始末をする SIGTERM で止める */
export const forwardedSignal = (signal) => (signal === 'SIGHUP' ? 'SIGTERM' : signal);

/** 子の出力はこちらで流すので、子は端末につながらない。こちらが端末につながっているときだけ、Playwright に色と行の上書きを使わせる */
export const ttyEnv = (isTTY) => (isTTY ? { FORCE_COLOR: '1', PLAYWRIGHT_FORCE_TTY: '1' } : {});

/* 出力先が先に閉じる（| head、端末を閉じた）と、書き込みは EPIPE・EIO で失敗し、受け手が無いとその場で落ちて dist/ を戻せない。
   出力の失敗は握りつぶし、検査と復元を最後まで続ける。子の出力を流す process.stdout.write もここで守られる */
export function ignoreOutputErrors(streams = [process.stdout, process.stderr]) {
  const ignore = () => {};
  for (const stream of streams) stream.on('error', ignore);
  return () => {
    for (const stream of streams) stream.off('error', ignore);
  };
}

const without = (env, names) => Object.fromEntries(Object.entries(env).filter(([name]) => !names.includes(name)));

/** 通常のビルド。検査用の指定と、出力先の差し替え（HUNDRED_DAYS_BUILD_DIR）を外し、dist/ に作る */
export function normalEnv(base) {
  return without(base, [PUBLISH_CHECK_ENV, 'HUNDRED_DAYS_BUILD_DIR']);
}

/** 検査用のビルド。対象のDayだけを公開済みとみなす */
export function gateEnv(base, dir) {
  return { ...normalEnv(base), [PUBLISH_CHECK_ENV]: String(Number(dir.slice(4, 7))) };
}

/* Playwright は、公開ゲートが空きポートに立てたサーバーを使い回す（playwright.config.mjs の reuseExistingServer）。
   親の環境に CI があると使い回しが切れ、同じポートに自分のサーバーを立てようとして失敗するので外す */
export function browserEnv(base, dir, port) {
  return { ...without(gateEnv(base, dir), ['CI']), PLAYWRIGHT_PORT: String(port) };
}

// 成果物は一時ディレクトリへ。既定の test-results/ を上書きしない
export function playwrightArgs(output) {
  return ['test', ...BROWSER_SPECS, '--reporter=line', `--output=${output}`];
}

export function newResult(dir, staticOnly = false) {
  return {
    dir,
    staticOnly,
    violations: [],
    build: 'skipped',
    buildNote: '',
    browser: 'skipped',
    browserNote: '',
    restore: 'skipped',
    interrupted: null,
    error: null,
    output: null,
    metaChanged: false,
  };
}

export function passed(result) {
  if (result.violations.length) return false;
  if (result.staticOnly) return true;
  return (
    result.build === 'passed' &&
    result.browser === 'passed' &&
    result.restore === 'passed' &&
    !result.interrupted &&
    !result.error
  );
}

export const exitCodeOf = (result) => (passed(result) ? 0 : 1);

const LABEL = { passed: '合格', failed: '不合格', skipped: '実行していない', interrupted: '中断' };

export const RESTORE_FAILED = [
  '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
  '!! dist/ を通常のビルドに戻せませんでした。',
  '!! dist/ には、下書きを公開済みとして扱った検査用のビルドが残っている可能性があります。',
  '!! ビルドが始まる前に失敗した場合（ほかのDayの meta.json が壊れているなど）は、dist/ は変わっていません。',
  '!! どちらの場合も、npm run build を実行すると通常のビルドに戻ります（失敗の理由は、その出力に出ます）。',
  '!! 戻すまでは、E2E を流したり、dist/ を配ったりしないでください。',
  '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
].join('\n');

export function formatSummary(result) {
  const lines = ['', `── 公開ゲートの結果：${result.dir}`];
  lines.push(`静的な契約：${result.violations.length ? `違反 ${result.violations.length}件` : '合格'}`);
  if (result.staticOnly) {
    lines.push('ビルド：実行していない（--static-only）', 'ブラウザ：実行していない（--static-only）');
  } else {
    lines.push(`ビルド：${LABEL[result.build]}${result.buildNote ? `（${result.buildNote}）` : ''}`);
    lines.push(`ブラウザ：${LABEL[result.browser]}${result.browserNote ? `（${result.browserNote}）` : ''}`);
    lines.push(`dist/ の復元：${result.restore === 'passed' ? '通常のビルドに戻した' : LABEL[result.restore]}`);
  }
  if (result.interrupted) lines.push(`中断：${result.interrupted} を受けて止めた`);
  if (result.error) lines.push(`例外：${result.error}`);
  if (result.violations.length) lines.push('', formatViolations(result.violations));
  if (result.output) lines.push('', `ブラウザの試験の資料（スクリーンショット・トレース）：${result.output}`);
  if (result.restore === 'failed') lines.push('', RESTORE_FAILED);
  if (result.metaChanged) {
    lines.push('', `⚠ ${result.dir}/meta.json が、検査の途中で変わりました。このコマンドは書き換えません。ほかの作業が書き換えていないか確かめてください。`);
  }
  const verdict = passed(result)
    ? `公開ゲート：合格${result.staticOnly ? '（静的な検査だけ。ブラウザの検査はまだ）' : ''}`
    : '公開ゲート：不合格';
  lines.push('', verdict);
  return lines.join('\n');
}

/** serve-dist の起動の1行（Serving dist at http://127.0.0.1:<ポート>）から、実際に開いたポートを読む。
    出力は途中で分かれて届く（…:64 と 737 のように）。改行で終わった完全な行だけを見て、書きかけの尾は次を待つ */
export function portFromServeLog(text) {
  const lines = String(text).split('\n');
  lines.pop();
  for (const line of lines) {
    const port = Number(/^Serving dist at http:\/\/127\.0\.0\.1:(\d+)$/.exec(line)?.[1]);
    if (Number.isInteger(port) && port > 0 && port < 65536) return port;
  }
  return null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** probe が真を返すまで繰り返す。stopped が理由を返したとき（サーバーが先に終わった・中断）と、時間切れのときは、その理由を返す */
export async function waitUntilReady({
  probe,
  stopped = () => '',
  timeout = 10_000,
  interval = 100,
  late = `${Math.round(timeout / 1000)}秒待っても 200 が返らなかった`,
  now = Date.now,
  wait = sleep,
}) {
  const deadline = now() + timeout;
  for (;;) {
    const reason = stopped();
    if (reason) return { ready: false, reason };
    if (await probe()) return { ready: true, reason: '' };
    if (now() >= deadline) return { ready: false, reason: stopped() || late };
    await wait(interval);
  }
}

/** 1回だけ GET して、200 が返ったか。つながらない・時間切れは false。接続は使い回さない（止めるときに残らないように） */
export function probeOnce(url, timeout = 1000) {
  return new Promise((resolve) => {
    const request = httpGet(url, { agent: false, timeout }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('timeout', () => request.destroy());
    request.on('error', () => resolve(false));
  });
}

/** 子プロセスが終わっていれば、その理由。動いていれば空 */
export function serverGone(child) {
  if (child.exitCode !== null && child.exitCode !== undefined) return `サーバーが先に終了した（終了コード ${child.exitCode}）`;
  if (child.signalCode) return `サーバーが先に終了した（${child.signalCode}）`;
  return '';
}

/** SIGTERM を送り、grace ミリ秒のうちに終わらなければ SIGKILL で止める。止め方（not-started・exited・terminated・killed）を返す */
export async function stopProcess(child, { grace = 3000 } = {}) {
  if (child.pid === undefined) return 'not-started';
  if (child.exitCode !== null || child.signalCode !== null) return 'exited';
  const exited = new Promise((resolve) => child.once('exit', () => resolve(true)));
  const within = async (ms) => {
    let timer;
    const late = new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), ms);
    });
    const done = await Promise.race([exited, late]);
    clearTimeout(timer);
    return done;
  };
  child.kill('SIGTERM');
  if (await within(grace)) return 'terminated';
  child.kill('SIGKILL');
  await within(grace);
  return 'killed';
}

// ---------------------------------------------------------------- 実行

function listDayFolders() {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^day-\d{3}-/.test(entry.name))
    .map((entry) => ({ dir: entry.name, hasIndex: existsSync(join(root, entry.name, 'index.html')) }))
    .sort((a, b) => a.dir.localeCompare(b.dir));
}

const readText = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);

const statusNote = (status) =>
  status === 'draft' ? 'status：draft（ビルドとブラウザの検査のあいだだけ、公開済みとして扱う）' : `status：${status}`;

function run(args, env, { children = null, detached = false } = {}) {
  return new Promise((resolve) => {
    /* 子の出力は、端末へ直接書かせず、こちらで読んで流す。出力先が先に閉じても子は書き込みで落ちず、
       失敗はこちらの受け皿（ignoreOutputErrors）で握りつぶせる。別のプロセスグループの子が端末に書くと止まる設定もある */
    const child = spawn(process.execPath, args, { cwd: root, env, detached, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    children?.add(child);
    const done = (code) => {
      children?.delete(child);
      resolve(code);
    };
    // 'error' は起動の失敗のほか、kill の失敗でも来る。once だと2回目で落ちる
    child.on('error', (error) => {
      console.error(`✖ ${error.message}`);
      done(1);
    });
    child.once('close', (code) => done(code ?? 1));
  });
}

/* 検査用のサーバーは自分で立てて、自分で止める。Playwright に立てさせていたときは、起動の途中で中断されると
   後始末が間に合わず、serve-dist が残った（SIGTERM を約3秒後に送ると再現した）。
   出力は読んで流す。起動の1行に、実際に開いたポートが出る */
function startServer(env, children) {
  const server = spawn(process.execPath, ['scripts/serve-dist.mjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.spawnError = null;
  server.log = '';
  server.stdout.on('data', (chunk) => {
    server.log += chunk;
    process.stdout.write(chunk);
  });
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));
  server.on('error', (error) => {
    server.spawnError ??= error;
  });
  children.add(server);
  server.once('exit', () => children.delete(server));
  return server;
}

async function runBrowserStages(result, env) {
  const children = new Set();
  let restoring = false;
  let server = null;
  const onSignal = (signal) => {
    if (restoring) {
      console.error(`\n${signal} を受けました。検査用のサーバーを止めて、dist/ を戻し終えるまで待ちます。`);
      return;
    }
    if (result.interrupted) return;
    result.interrupted = signal;
    console.error(`\n${signal} を受けました。検査を止めて、dist/ を通常のビルドに戻します。`);
    for (const child of children) child.kill(forwardedSignal(signal));
  };
  for (const signal of STOP_SIGNALS) process.on(signal, onSignal);
  try {
    console.log(`\n2/3 ${PUBLISH_CHECK_ENV} を付けたビルド`);
    const built = await run(['scripts/build.mjs'], gateEnv(env, result.dir), { children });
    if (result.interrupted) {
      result.build = 'interrupted';
      return;
    }
    if (built !== 0) {
      result.build = 'failed';
      return;
    }
    if (!existsSync(join(root, 'dist', result.dir, 'index.html'))) {
      result.build = 'failed';
      result.buildNote = `dist/${result.dir}/index.html ができていない`;
      return;
    }
    result.build = 'passed';

    console.log('\n3/3 横断のブラウザ試験');
    let cli;
    try {
      cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
    } catch {
      throw new Error('Playwright が見つかりません。npm ci を実行してください');
    }
    // ポートは serve-dist に選ばせる（PLAYWRIGHT_PORT=0）。空きポートを調べてから立てると、その間に別のプロセスがそのポートを取れて、
    // 別のサーバーの 200 で合格してしまう
    server = startServer(browserEnv(env, result.dir, 0), children);
    const stopped = () => {
      if (result.interrupted) return `${result.interrupted} を受けた`;
      if (server.spawnError) return `サーバーを起動できない（${server.spawnError.message}）`;
      return serverGone(server);
    };
    const notReady = (reason) => {
      result.browser = result.interrupted ? 'interrupted' : 'failed';
      if (!result.interrupted) result.browserNote = `検査用のサーバーが準備できなかった：${reason}`;
    };
    const listening = await waitUntilReady({
      probe: async () => portFromServeLog(server.log) !== null,
      stopped,
      interval: 50,
      late: '10秒待っても、起動の1行からポートを読めなかった',
    });
    if (!listening.ready || result.interrupted) return notReady(listening.reason);
    const port = portFromServeLog(server.log);
    const ready = await waitUntilReady({ probe: () => probeOnce(`http://127.0.0.1:${port}/`), stopped });
    if (!ready.ready || result.interrupted) return notReady(ready.reason);
    // 200 を返したのが自分のサーバーであることを、まだ生きているかで確かめる（落ちたあとのポートは、別のプロセスが取れる）
    if (serverGone(server)) return notReady(serverGone(server));
    const output = mkdtempSync(join(tmpdir(), 'hundred-days-publish-check-'));
    if (serverGone(server) || result.interrupted) {
      rmSync(output, { recursive: true, force: true });
      return notReady(serverGone(server));
    }
    result.output = output;
    // Playwright は、このポートで動いている自分のサーバーを使い回す（reuseExistingServer）
    const testEnv = { ...browserEnv(env, result.dir, port), ...ttyEnv(Boolean(process.stdout.isTTY)) };
    const tested = await run([cli, ...playwrightArgs(result.output)], testEnv, { children });
    result.browser = result.interrupted ? 'interrupted' : tested === 0 ? 'passed' : 'failed';
    // 合格のときだけ消す。失敗と中断は、場所を表示して残す（止めた Playwright のワーカーは、中断のあとも少し書き続けるので、中断の直後に消しても、あとから作り直される）
    if (result.browser === 'passed') {
      rmSync(result.output, { recursive: true, force: true });
      result.output = null;
    }
  } catch (error) {
    result.error = error.message;
  } finally {
    restoring = true;
    // 復元の最中に、古い dist/ を配り続けないよう、先にサーバーを止める
    if (server) {
      console.log('\n検査用のサーバーを止める');
      try {
        if ((await stopProcess(server)) === 'killed') console.error('⚠ 検査用のサーバーが SIGTERM で止まらなかったので、SIGKILL で止めました');
      } catch (error) {
        console.error(`✖ 検査用のサーバーを止められませんでした：${error.message}`);
      }
    }
    console.log('\ndist/ を通常のビルドに戻す');
    // 別のプロセスグループで走らせ、もう一度 Ctrl+C を押されても、戻す作業は最後まで続ける
    const restored = await run(['scripts/build.mjs'], normalEnv(env), { detached: true });
    result.restore = restored === 0 ? 'passed' : 'failed';
    for (const signal of STOP_SIGNALS) process.off(signal, onSignal);
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  // 受け皿は外さない。終わる間際の書き込みが失敗しても、終了コードを変えないため
  ignoreOutputErrors();
  const options = parseArgs(argv);
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (options.error) {
    console.error(`✖ ${options.error}\n${USAGE}`);
    return 2;
  }
  const target = resolveDay(options.day, listDayFolders());
  if (target.error) {
    console.error(`✖ ${target.error}`);
    return 2;
  }

  const { dir } = target;
  const metaPath = join(root, dir, 'meta.json');
  const metaBefore = readText(metaPath);
  let status = 'published';
  try {
    status = JSON.parse(metaBefore ?? '{}').status || 'published';
  } catch {
    // 読めない meta.json は、静的な検査が理由を出す
  }
  const wrongStatus = statusError(status);
  if (wrongStatus) {
    console.error(`✖ ${wrongStatus}`);
    return 2;
  }
  const result = newResult(dir, options.staticOnly);

  console.log(`公開ゲート：${dir}\n\n1/3 静的な契約`);
  try {
    const day = loadDay(root, dir);
    console.log(statusNote(day.meta.status || 'published'));
    result.violations = checkDay(day);
  } catch (error) {
    result.violations = [
      { dir, id: 'load', title: 'meta.json と index.html を読む', source: 'scripts/lib/publish-contract.mjs', expected: '読める', actual: error.message },
    ];
  }
  console.log(formatViolations(result.violations));

  if (!options.staticOnly) await runBrowserStages(result, env);

  result.metaChanged = readText(metaPath) !== metaBefore;
  console.log(formatSummary(result));
  return exitCodeOf(result);
}

const executedDirectly = () => {
  try {
    return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (executedDirectly()) {
  main().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error);
      process.exitCode = 1;
    }
  );
}
