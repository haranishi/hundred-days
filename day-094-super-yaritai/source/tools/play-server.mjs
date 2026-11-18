// 手元で遊ぶためのサーバー。画面を一時ディレクトリにビルドし、wrangler dev（--local）で
// 画面とネット対戦を同じ URL で配る。
//
// 1) README と同じディレクトリにあるスクリプトから使う
//      import { startPlayServer } from './tools/play-server.mjs'
//      const server = await startPlayServer({ port: 8790 })   // → { url, stop }
//      … server.url を Playwright で開いて遊ぶ …
//      await server.stop()
// 2) 手で動かす：node tools/play-server.mjs [port]   （Ctrl+C で止まる）
//
// 土台は tools/net-e2e.mjsと同じ起こし方。Cloudflare にはつながない（--local）。

import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')

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

/**
 * @param {{ port?: number, build?: boolean, log?: (s: string) => void }} [options]
 * @returns {Promise<{ url: string, stop: () => Promise<void> }>}
 */
export async function startPlayServer(options = {}) {
  const port = options.port ?? 8790
  const log = options.log ?? ((s) => console.log(`[play-server] ${s}`))
  const scratch = join(tmpdir(), `sy-play-${port}-${process.pid}`)
  const assets = join(scratch, 'client')
  mkdirSync(scratch, { recursive: true })

  if (options.build !== false) {
    log('画面を一時フォルダに作る（vite build）…')
    const code = await run('npx', ['vite', 'build', '--outDir', assets, '--emptyOutDir', '--logLevel', 'warn'], {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
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
  const configPath = join(scratch, 'wrangler.json')
  writeFileSync(configPath, JSON.stringify(config, null, 2))

  const env = { ...process.env, WRANGLER_SEND_METRICS: 'false', NO_UPDATE_NOTIFIER: '1', FORCE_COLOR: '0' }
  const wrangler = spawn(
    'npx',
    ['wrangler', 'dev', '--config', configPath, '--local', '--port', String(port), '--inspector-port', String(await freePort()), '--persist-to', join(scratch, 'state'), '--log-level', 'warn'],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true },
  )
  let out = ''
  wrangler.stdout.on('data', (d) => (out += d))
  wrangler.stderr.on('data', (d) => (out += d))

  const stop = async () => {
    try {
      process.kill(-wrangler.pid, 'SIGTERM')
    } catch {
      // すでに止まっている
    }
    await new Promise((r) => setTimeout(r, 300))
  }

  const deadline = Date.now() + 90_000
  for (;;) {
    if (wrangler.exitCode !== null) throw new Error(`wrangler dev が止まった:\n${out.slice(-2000)}`)
    try {
      const res = await fetch(`http://localhost:${port}/`)
      if (res.ok) break
    } catch {
      // まだ起きていない
    }
    if (Date.now() > deadline) {
      await stop()
      throw new Error(`wrangler dev が起きなかった:\n${out.slice(-2000)}`)
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  const url = `http://localhost:${port}/`
  log(`${url} で起きた（ひとりで・ネット対戦の両方）`)
  return { url, stop }
}

// 手で動かしたとき
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const server = await startPlayServer({ port: Number(process.argv[2] || 8790) })
  const shutdown = async () => {
    await server.stop()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
