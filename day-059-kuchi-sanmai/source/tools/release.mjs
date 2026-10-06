// vite build の出力（dist/）を、公開されるフォルダ day-059-kuchi-sanmai/ へ写す。
// 写すのは index.html・assets/・sample/・legal/・favicon.svg だけ。meta.json・README・shared/・tests/ など手で持つものには触らない。
// 公開物は相対パスで読む（公開URLは /day-059-kuchi-sanmai/）。根元（/）を指すパスが残っていたら止める。

import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('..', import.meta.url))
const dist = join(source, 'dist')
const day = join(source, '..')

if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/index.html がない。先に npm run build を実行する')

const html = readFileSync(join(dist, 'index.html'), 'utf8')
const rooted = [...html.matchAll(/\b(?:src|href)="(\/[^"]*)"/g)].map((match) => match[1])
if (rooted.length) throw new Error(`根元を指すパスが残っている: ${rooted.join(', ')}`)
for (const needed of ['<script src="shared/share.js" defer></script>', '<link rel="stylesheet" href="shared/share.css"', 'id="share-dialog"', '<div id="share"></div>']) {
  if (!html.includes(needed)) throw new Error(`index.html に ${needed} がない`)
}
// CSP はサイトの _headers（scripts/build.mjs）が付ける。開発サーバー用の ws: も公開物に持ち込まない
if (/http-equiv="Content-Security-Policy"|ws:\/\//.test(html)) throw new Error('index.html に meta の CSP か開発用の ws: が残っている')

// JS と CSS の中にも、根元から読むURL（"/assets/…" "/sample/…" "/legal/…" "/favicon.svg"）が残っていないか
const assets = readdirSync(join(dist, 'assets'))
for (const name of assets.filter((file) => /\.(?:js|css)$/.test(file))) {
  const code = readFileSync(join(dist, 'assets', name), 'utf8')
  const found = code.match(/["'`(]\/(?:(?:assets|sample|legal)\/|favicon\.svg)[^"'`)]*/)
  if (found) throw new Error(`${name} が根元を指している: ${found[0]}`)
}

// 配る物の確認：ライセンス表示は1本だけ（認証版の SERVER 版は配らない）、見本は4枚とテスト音と来歴
const legal = readdirSync(join(dist, 'legal'))
if (legal.join() !== 'THIRD_PARTY_NOTICES.txt') throw new Error(`legal/ の中身が想定と違う: ${legal.join(', ')}`)
const samples = readdirSync(join(dist, 'sample')).sort()
const expected = ['README.md', 'blink.png', 'demo-tone.wav', 'mouth-closed.png', 'mouth-open.png', 'mouth-small.png']
if (samples.join() !== expected.join()) throw new Error(`sample/ の中身が想定と違う: ${samples.join(', ')}`)

for (const dir of ['assets', 'sample', 'legal']) {
  rmSync(join(day, dir), { recursive: true, force: true })
  cpSync(join(dist, dir), join(day, dir), { recursive: true })
}
cpSync(join(dist, 'favicon.svg'), join(day, 'favicon.svg'))
writeFileSync(join(day, 'index.html'), html)

// vite は ./assets/… の形で書く。./ の有無のどちらでも拾い、アプリ本体のJSが少なくとも1本あることも確かめる
const referenced = [...html.matchAll(/\b(?:src|href)="(?:\.\/)?((?:assets\/[^"]+)|favicon\.svg)"/g)].map((match) => match[1])
if (!referenced.some((file) => file.endsWith('.js'))) throw new Error('index.html がアプリ本体のJSを読んでいない')
for (const file of referenced) {
  if (!existsSync(join(day, file))) throw new Error(`index.html が指す ${file} が写されていない`)
}
console.log(`release: index.html・favicon.svg と assets/ ${assets.length}・sample/ ${samples.length}・legal/ ${legal.length} ファイルを写した`)
