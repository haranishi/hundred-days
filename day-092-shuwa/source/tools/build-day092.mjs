/**
 * 100日チャレンジへの組み込み：node tools/build-day092.mjs <hundred-days の Day のフォルダ>
 * 1) npm run build 済みの dist/ を Day のフォルダへ写す（前回写した物は消してから）
 * 2) 元のコード（tools/day092-files.mjs の一覧）を <Day>/source/ へ写す
 * Day のフォルダにある meta.json・README.md・screenshot.*・og.png・demo.mp4・tools/ は残す（100日側で管理する物）
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { SOURCE_FILES } from './day092-files.mjs';

const root = resolve(new URL('..', import.meta.url).pathname);
const target = process.argv[2] && resolve(process.argv[2]);
if (!target || !/day-092-/.test(target)) {
  console.error('使い方: node tools/build-day092.mjs <…/hundred-days/day-092-…>');
  process.exit(1);
}
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist がありません。先に npm run build を流してください');
  process.exit(1);
}
const KEEP = new Set(['meta.json', 'README.md', 'screenshot.png', 'screenshot.webp', 'og.png', 'demo.mp4', 'tools']);
mkdirSync(target, { recursive: true });
for (const name of readdirSync(target)) if (!KEEP.has(name)) rmSync(join(target, name), { recursive: true, force: true });
cpSync(dist, target, { recursive: true });
for (const rel of await SOURCE_FILES(root)) {
  const to = join(target, 'source', rel);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(join(root, rel), to);
}
console.log(`写しました: ${target}（本体＋source/）`);
