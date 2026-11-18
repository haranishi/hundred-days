// ネット対戦の E2E を、こちらで起こした wrangler dev（--local）に対して回す。
// 画面（vite build の結果）は一時フォルダに作り、wrangler.jsonc を写した一時の設定でそこを配る。
// プロジェクトの dist/client はほかの担当の E2E も作り直すので、並行で回しても食い合わないようにするため。
//
//   node tools/net-e2e.mjs [playwright の引数…]
//
// - ポートは 8798（E2E_PORT で変えられる）。状態も一時フォルダに置き、Cloudflare にはつながない（--local）
// - NET_NO_BUILD=1 なら画面を作らず、public/ の写しだけを配る（画面を使わない試験だけを速く回すとき）
// - 画面ロック中は Chromium が起動しないので、SY_BROWSER を指定しなければ WebKit を使う
// - 最後に wrangler dev を止める（Bash の & で裏に起こさない＝共通ルール）

import { spawn } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** OS に空いているポートを1つ選ばせる */
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

const root = resolve(import.meta.dirname, '..')
const port = Number(process.env.E2E_PORT || 8798)
// 調べ用（inspector）のポートは空いているものを借りる（ほかの wrangler dev と重なって起動に失敗しないように）
const inspector = Number(process.env.NET_INSPECTOR_PORT) || (await freePort())
const scratch = resolve(process.env.NET_SCRATCH || join(tmpdir(), `sy-net-${process.pid}`))
mkdirSync(scratch, { recursive: true })

/** 画面を一時フォルダに作り（NET_NO_BUILD=1 なら public/ の写しだけ）、そこを配る一時の設定を書いて、その場所を返す */
async function configPath() {
  const assets = join(scratch, 'client')
  if (process.env.NET_NO_BUILD === '1') {
    cpSync(join(root, 'public'), assets, { recursive: true })
    console.log('[net-e2e] 画面は作らず、public/ の写しを配る')
  } else {
    console.log('[net-e2e] 画面を一時フォルダに作る（vite build）…')
    const code = await new Promise((resolveExit) => {
      const b = spawn('npx', ['vite', 'build', '--outDir', assets, '--emptyOutDir', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit', env: process.env })
      b.on('exit', (c) => resolveExit(c ?? 1))
    })
    if (code !== 0) throw new Error('vite build に失敗した')
  }
  // wrangler.jsonc は行ごとのコメントだけを使っている
  const text = readFileSync(join(root, 'wrangler.jsonc'), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
  const config = JSON.parse(text)
  delete config.$schema
  config.main = join(root, config.main)
  config.assets = { ...config.assets, directory: assets }
  const path = join(scratch, 'wrangler.json')
  writeFileSync(path, JSON.stringify(config, null, 2))
  return path
}

const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_UPDATE_NOTIFIER: '1', FORCE_COLOR: '0' }
const config = await configPath()
const wrangler = spawn(
  'npx',
  [
    'wrangler',
    'dev',
    '--config',
    config,
    '--local',
    '--port',
    String(port),
    '--inspector-port',
    String(inspector),
    '--persist-to',
    join(scratch, 'state'),
    '--log-level',
    'warn',
  ],
  { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
)
let out = ''
wrangler.stdout.on('data', (d) => (out += d))
wrangler.stderr.on('data', (d) => (out += d))

function stop() {
  try {
    process.kill(-wrangler.pid, 'SIGTERM')
  } catch {
    // すでに止まっている
  }
}
process.on('SIGINT', () => {
  stop()
  process.exit(130)
})

async function waitReady() {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (wrangler.exitCode !== null) throw new Error(`wrangler dev が止まった:\n${out}`)
    try {
      const res = await fetch(`http://localhost:${port}/api/nothing`)
      if (res.status === 404) return
    } catch {
      // まだ起きていない
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`wrangler dev が起きなかった:\n${out}`)
}

let code = 1
try {
  await waitReady()
  console.log(`[net-e2e] wrangler dev が http://localhost:${port} で起きた`)
  const args = ['playwright', 'test', ...process.argv.slice(2)]
  code = await new Promise((resolveExit) => {
    const pw = spawn('npx', args, {
      cwd: root,
      stdio: 'inherit',
      env: { ...env, E2E_ONLINE: '1', E2E_PORT: String(port), SY_BROWSER: process.env.SY_BROWSER || 'webkit' },
    })
    pw.on('exit', (c) => resolveExit(c ?? 1))
  })
} catch (err) {
  console.error(String(err))
} finally {
  stop()
}
if (code !== 0) console.error(`[net-e2e] wrangler dev の出力（最後の2000字）:\n${out.slice(-2000)}`)
process.exit(code)
