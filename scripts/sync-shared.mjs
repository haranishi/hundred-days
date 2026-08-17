// shared/ の共通部品を、各アプリの shared/ へ複製する。
// アプリは1フォルダで完結させたい（file:// でも自分のフォルダを配信しても動く）ので、
// 参照を1か所にまとめる代わりに「正本を1つ持って複製する」方式にしている。
//
//   node scripts/sync-shared.mjs          … 複製する
//   node scripts/sync-shared.mjs --check  … ずれていたら失敗する（build から呼ぶ）

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sourceDir = join(root, 'shared');
const appsDir = join(root, 'apps');
const check = process.argv.includes('--check');

const files = readdirSync(sourceDir).filter((name) => /\.(js|css)$/.test(name));
const apps = readdirSync(appsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith('day-'))
  .map((entry) => entry.name)
  .sort();

const stale = [];
let copied = 0;

for (const app of apps) {
  // 共通部品を読み込んでいないアプリは対象外（同期の必要が無い）
  const html = join(appsDir, app, 'index.html');
  if (!existsSync(html) || !readFileSync(html, 'utf8').includes('shared/share.js')) continue;

  const targetDir = join(appsDir, app, 'shared');
  for (const name of files) {
    const from = join(sourceDir, name);
    const to = join(targetDir, name);
    const same = existsSync(to) && readFileSync(to, 'utf8') === readFileSync(from, 'utf8');
    if (same) continue;
    if (check) {
      stale.push(`${app}/shared/${name}`);
      continue;
    }
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(from, to);
    copied += 1;
  }
}

if (check && stale.length) {
  console.error('✖ 共通部品が shared/ とずれています。`npm run shared:sync` を実行してください:');
  for (const name of stale) console.error(`  - ${name}`);
  process.exit(1);
}

console.log(check ? `shared: ${apps.length}個のアプリを確認しました` : `shared: ${copied}ファイルを複製しました`);
