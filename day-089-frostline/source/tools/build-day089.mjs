// 100 日チャレンジ（hundred-days）の Day089 として配る静的ファイルを作る。
// 相対パス基準（--base=./）で組み立て、遊ぶページ・素材・山のデータ・このゲームについて・利用許諾を、出力先（Day のフォルダ）へ置く。
// 相対にするのは、/100days/day-089-frostline/ のようなサブパスに載せても読めるようにするため。
// 単独で配るとき用のファイル（_headers・404.html・robots.txt・og.jpg）は置かない（100 日のサイトが、ヘッダー・404・共有画像を受け持つ）。
// 使い方：node tools/build-day089.mjs <出力先の Day のフォルダ>（hundred-days では source/ の 1 つ上）
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const day = resolve(process.argv[2] ?? join(source, '..'));
const out = mkdtempSync(join(tmpdir(), 'frostline-day089-'));
const PLACED = ['index.html', 'assets', 'world', 'models', 'about', 'licenses', 'favicon.svg'];
try {
  if (!existsSync(join(source, 'public', 'world', 'world.json'))) throw new Error('山のデータが無い。先に npm run worldgen を流す');
  execFileSync(join(source, 'node_modules', '.bin', 'vite'), ['build', '--base=./', '--outDir', out, '--emptyOutDir'], { cwd: source, stdio: 'inherit' });
  for (const name of PLACED) if (!existsSync(join(out, name))) throw new Error(`組み立ての成果物 ${name} が見つからない`);
  for (const name of PLACED) { rmSync(join(day, name), { recursive: true, force: true }); cpSync(join(out, name), join(day, name), { recursive: true }); }
  console.log(`Day089 の ${PLACED.join('・')} を ${day} に置いた`);
} finally { rmSync(out, { recursive: true, force: true }); }
