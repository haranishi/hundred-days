// 確認したViteの出力を入口から読み込めるようにする。素材の指紋も記録する。
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, unlink } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../', import.meta.url));
const game = resolve(app, 'game');
const html = await readFile(resolve(game, 'index.html'), 'utf8');
const modulePath = html.match(/src="(?:\.\/|\/)?(assets\/index-[A-Za-z0-9_-]+\.js)"/)?.[1];
if (!modulePath) throw new Error('配信ビルドの入口が見つかりません');
await writeFile(resolve(game, 'entry.json'), JSON.stringify({ module: modulePath }, null, 2) + '\n');
// 素材と同じ出力先なので全消去せず、今回の入口ではない生成済みbundleだけ除去する。
for (const entry of await readdir(resolve(game, 'assets'), { withFileTypes: true })) {
  if (entry.isFile() && /^index-[A-Za-z0-9_-]+\.js$/.test(entry.name) && `assets/${entry.name}` !== modulePath) {
    await unlink(resolve(game, 'assets', entry.name));
  }
}
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
