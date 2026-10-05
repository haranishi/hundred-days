// vite build の出力（dist/）を、公開されるフォルダ day-058-meisho-kumitate/ へ写す。
// 写すのは index.html・assets/・アイコン2つだけ。meta.json・README・shared/・tests/ など手で持つものには触らない。
// 公開物は相対パスで読む（公開URLは /day-058-meisho-kumitate/）。根元（/）を指すパスが残っていたら止める。

import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('..', import.meta.url))
const dist = join(source, 'dist')
const day = join(source, '..')

if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/index.html がない。先に vite build を実行する')

const html = readFileSync(join(dist, 'index.html'), 'utf8')
const rooted = [...html.matchAll(/\b(?:src|href)="(\/[^"]*)"/g)].map((match) => match[1])
if (rooted.length) throw new Error(`根元を指すパスが残っている: ${rooted.join(', ')}`)
for (const needed of ['shared/share.js', 'shared/share.css', 'id="share-dialog"']) {
  if (!html.includes(needed)) throw new Error(`index.html に ${needed} がない`)
}

rmSync(join(day, 'assets'), { recursive: true, force: true })
cpSync(join(dist, 'assets'), join(day, 'assets'), { recursive: true })
for (const icon of ['favicon.svg', 'apple-touch-icon.png']) cpSync(join(dist, icon), join(day, icon))
writeFileSync(join(day, 'index.html'), html)

// vite は ./assets/… の形で書く。./ の有無のどちらでも拾い、ゲーム本体のJSが少なくとも1本あることも確かめる
const referenced = [...html.matchAll(/\b(?:src|href)="(?:\.\/)?(assets\/[^"]+)"/g)].map((match) => match[1])
if (!referenced.some((file) => file.endsWith('.js'))) throw new Error('index.html がゲーム本体のJSを読んでいない')
for (const file of referenced) {
  if (!existsSync(join(day, file))) throw new Error(`index.html が指す ${file} が写されていない`)
}
console.log(`release: index.html と assets/ の ${readdirSync(join(day, 'assets')).length} ファイルを写した`)
