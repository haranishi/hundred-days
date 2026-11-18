/**
 * 100日チャレンジへの組み込み：node tools/build-day092.mjs <hundred-days の Day のフォルダ>
 * 1) npm run build 済みの dist/ を Day のフォルダへ写す（前回写した物は消してから）
 * 2) 元のコード（tools/day092-files.mjs の一覧）を <Day>/source/ へ写す
 * Day のフォルダにある meta.json・README.md・LICENSE・screenshot.*・og.png・demo.mp4・tools/ は残す（100日側で管理する物）
 */
import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_FILES } from './day092-files.mjs';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const requested = process.argv[2] && resolve(process.argv[2]);
const target = requested && (existsSync(requested) ? realpathSync(requested) : requested);
if (!target || !/^day-092-[\w-]+$/.test(basename(target))) {
  console.error('使い方: node tools/build-day092.mjs <…/hundred-days/day-092-…>');
  process.exit(1);
}
const inPlace = join(target, 'source') === root;
if (!inPlace && (root === target || root.startsWith(target + sep) || target.startsWith(root + sep))) {
  throw new Error('出力先と元のコードが重なっています');
}
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist がありません。先に npm run build を流してください');
  process.exit(1);
}
// LICENSE は、リポジトリ直下のMITの写し（scripts/tests/day-license.test.mjs が見張る）。消すと、次の100日のCIが落ちる
const KEEP = new Set(['meta.json', 'README.md', 'LICENSE', 'screenshot.png', 'screenshot.webp', 'og.png', 'demo.mp4', 'tools']);
if (inPlace) KEEP.add('source');
mkdirSync(target, { recursive: true });
for (const name of readdirSync(target)) if (!KEEP.has(name)) rmSync(join(target, name), { recursive: true, force: true });
cpSync(dist, target, { recursive: true });
for (const rel of inPlace ? [] : await SOURCE_FILES(root)) {
  const to = join(target, 'source', rel);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(join(root, rel), to);
}
console.log(`写しました: ${target}（本体＋source/）`);
