// 画面と Worker を別ポートで起こし、別の origin の画面からネット対戦を通す公開ゲート（docs/05_ネット対戦.md）。
//
//   node tools/split-e2e.mjs [playwright の引数…]      （npm run e2e:split）
//
// - 画面は一時フォルダに vite build し、Worker の静的配信（Workers Static Assets）で配る。本番の Pages と同じく
//   public/_headers と 404.html を読むので、配信ヘッダーと404の様子が本番に近い。
//   🔴 `wrangler pages dev` は使えない：wrangler はプロジェクトの根（node_modules の親）の wrangler.jsonc を読み、
//      Worker の Durable Objects を Pages の設定と取り違えて落ちる（cwd・--cwd を変えても同じ）。実物の Pages は公開後の確認で見る。
// - Worker は tools/net-e2e.mjs と同じく一時の設定で `wrangler dev --local`
// - 一時フォルダの _headers の CSP の connect-src に、手元の Worker のポート（http・ws）だけを足す。本番の2つの住所は残す。
//   手元の Worker の住所は本番の許可リストに無いので、足さないと CSP が通信を止める。
//   本番の CSP の中身は tests/unit/worker/entry.test.ts が見張り、本番の住所での実動作は公開後に SPLIT_LIVE=1 で確かめる。
// - 最後に2つとも止める（Bash の & で裏に起こさない＝共通ルール）

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const workerPort = Number(process.env.SPLIT_WORKER_PORT || 8798)
const appPort = Number(process.env.SPLIT_APP_PORT || 4196)
const scratch = resolve(process.env.SPLIT_SCRATCH || join(tmpdir(), `sy-split-${process.pid}`))
mkdirSync(scratch, { recursive: true })
const assets = join(scratch, 'client')

/** OS に空いているポートを1つ選ばせる（wrangler の調べ用ポートがほかとぶつからないように） */
function freePort() {
  return new Promise((resolvePort, reject) => {
    const srv = createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      srv.close(() => resolvePort(typeof addr === 'object' && addr ? addr.port : 0))
    })
  })
}

function run(cmd, args, opts) {
  return new Promise((resolveExit) => {
    const p = spawn(cmd, args, opts)
    p.on('exit', (c) => resolveExit(c ?? 1))
  })
}

console.log('[split-e2e] 画面を一時フォルダに作る（vite build）…')
if ((await run('npx', ['vite', 'build', '--outDir', assets, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit', env: process.env })) !== 0) {
  throw new Error('vite build に失敗した')
}

// 一時フォルダの _headers にだけ、手元の Worker を足す（public/_headers は変えない）
const headersFile = join(assets, '_headers')
const original = readFileSync(headersFile, 'utf8')
// 🔴 コメントの行にも「connect-src」の語がある。CSP の行（Content-Security-Policy: …）の connect-src だけを狙う
const patched = original.replace(/(Content-Security-Policy:[^\n]*?connect-src [^;\n]*)/, `$1 http://localhost:${workerPort} ws://localhost:${workerPort}`)
if (patched === original) throw new Error('_headers の CSP の connect-src が見つからない')
writeFileSync(headersFile, patched)

// Worker の設定（wrangler.jsonc は行ごとのコメントだけを使っている）
const text = readFileSync(join(root, 'wrangler.jsonc'), 'utf8')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n')
const config = JSON.parse(text)
delete config.$schema
config.main = join(root, config.main)
config.assets = { ...config.assets, directory: assets }
const workerDir = join(scratch, 'worker')
const appDir = join(scratch, 'app')
mkdirSync(workerDir, { recursive: true })
mkdirSync(appDir, { recursive: true })
const configPath = join(workerDir, 'wrangler.json')
writeFileSync(configPath, JSON.stringify(config, null, 2))
// 画面だけを配る設定（Worker のコードは持たない）。404.html を返す決まりは本番の Worker と同じ
const appConfigPath = join(appDir, 'wrangler.json')
writeFileSync(appConfigPath, JSON.stringify({ name: 'sy-split-app', compatibility_date: config.compatibility_date, assets: { directory: assets, not_found_handling: '404-page' } }, null, 2))

const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_UPDATE_NOTIFIER: '1', FORCE_COLOR: '0' }
let out = ''
const servers = [
  spawn(
    'npx',
    ['wrangler', 'dev', '--config', configPath, '--local', '--port', String(workerPort), '--inspector-port', String(await freePort()), '--persist-to', join(scratch, 'state'), '--log-level', 'warn'],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  ),
  spawn(
    'npx',
    ['wrangler', 'dev', '--config', appConfigPath, '--local', '--port', String(appPort), '--inspector-port', String(await freePort()), '--persist-to', join(scratch, 'app-state'), '--log-level', 'warn'],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  ),
]
for (const s of servers) {
  s.stdout.on('data', (d) => (out += d))
  s.stderr.on('data', (d) => (out += d))
}

function stop() {
  for (const s of servers) {
    try {
      process.kill(-s.pid, 'SIGTERM')
    } catch {
      // すでに止まっている
    }
  }
}
process.on('SIGINT', () => {
  stop()
  process.exit(130)
})

async function waitFor(label, url, ok) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (servers.some((s) => s.exitCode !== null)) throw new Error(`wrangler が止まった:\n${out}`)
    try {
      if (ok((await fetch(url)).status)) return
    } catch {
      // まだ起きていない
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`${label} が起きなかった:\n${out}`)
}

let code = 1
try {
  await waitFor('Worker', `http://localhost:${workerPort}/api/nothing`, (s) => s === 404)
  await waitFor('画面の静的配信', `http://localhost:${appPort}/`, (s) => s === 200)
  console.log(`[split-e2e] 画面 http://localhost:${appPort}（静的配信）・Worker http://localhost:${workerPort} が起きた`)
  code = await run('npx', ['playwright', 'test', ...process.argv.slice(2)], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...env,
      E2E_SPLIT: '1',
      SPLIT_APP_URL: `http://localhost:${appPort}`,
      SPLIT_API_URL: `http://localhost:${workerPort}`,
      SY_BROWSER: process.env.SY_BROWSER || 'webkit',
    },
  })
} catch (err) {
  console.error(String(err))
} finally {
  stop()
}
if (code !== 0) console.error(`[split-e2e] wrangler の出力（最後の2000字）:\n${out.slice(-2000)}`)
process.exit(code)
