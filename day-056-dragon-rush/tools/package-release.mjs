// 確認したViteの出力を入口から読み込めるようにする。素材の指紋も記録する。
import { createHash } from 'node:crypto';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { basename, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../', import.meta.url));
const game = resolve(app, 'game');
const html = await readFile(resolve(game, 'index.html'), 'utf8');
const modulePath = html.match(/src="(?:\.\/|\/)?(assets\/index-[A-Za-z0-9_-]+\.js)"/)?.[1];
if (!modulePath) throw new Error('配信ビルドの入口が見つかりません');
// 素材を残すVite設定でも、差し替え済みの旧実行コードは配信に残さない。
for (const name of await readdir(resolve(game, 'assets'))) {
  if (/^index-[A-Za-z0-9_-]+\.js$/.test(name) && name !== basename(modulePath)) {
    await unlink(resolve(game, 'assets', name));
    console.log(`未使用の旧入口bundleを除外しました: ${name}`);
  }
}
await writeFile(resolve(game, 'entry.json'), JSON.stringify({ module: modulePath }, null, 2) + '\n');
const entries = [];
async function inspect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = resolve(dir, entry.name);
    if (entry.isDirectory()) await inspect(file);
    else if (!entry.isSymbolicLink()) {
      const bytes = await readFile(file);
      entries.push({ file: relative(game, file).replaceAll('\\', '/'), bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
}
await inspect(resolve(game, 'assets'));
entries.sort((a, b) => a.file.localeCompare(b.file));
await writeFile(resolve(game, 'asset-manifest.json'), JSON.stringify({ schema: 1,
  models: '同梱Blenderスクリプトによる生成', audio: '独自数値合成の既存OGGを維持',
  files: entries }, null, 2) + '\n');
console.log(`配信入口と${entries.length}ファイルのSHA-256を記録しました`);
