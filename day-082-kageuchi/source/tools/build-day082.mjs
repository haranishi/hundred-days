// OWNER: build
// 100日チャレンジ（hundred-days）の Day082 として配る静的ファイルを作る。
// 型を確かめてから、遊ぶページ（index）だけを相対パス基準（--base=./）でビルドし、
// 一時フォルダの成果物を1段上（day-082-kageuchi/）の index.html と assets/ に置き換える。
// 相対パスにするのは、/100days/day-082-kageuchi/ のようなサブパスに載せても素材が読めるようにするため。
// 出力先を dist という名前にしないのは、hundred-days の .gitignore に当たって成果物が追跡されないため。
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const day = resolve(source, '..');
const bin = (name) => join(source, 'node_modules', '.bin', name);
const out = mkdtempSync(join(tmpdir(), 'kageuchi-day082-'));

try {
  execFileSync(bin('tsc'), ['--noEmit', '-p', 'tsconfig.json'], { cwd: source, stdio: 'inherit' });
  execFileSync(bin('vite'), ['build', '--base=./', '--outDir', out, '--emptyOutDir'], {
    cwd: source,
    stdio: 'inherit',
    env: { ...process.env, KAGE_PAGES: 'index' },
  });
  if (!existsSync(join(out, 'index.html')) || !existsSync(join(out, 'assets'))) {
    throw new Error('ビルドの成果物（index.html と assets/）が見つからない');
  }
  rmSync(join(day, 'assets'), { recursive: true, force: true });
  cpSync(join(out, 'assets'), join(day, 'assets'), { recursive: true });
  cpSync(join(out, 'index.html'), join(day, 'index.html'));
  console.log(`Day082 の index.html と assets/ を ${day} に置いた`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
