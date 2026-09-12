/* demo.mp4の頭とお尻を切る。切ったあとも先頭のコマを確認する。 */
import { execFileSync } from 'node:child_process';
import { renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(appDir, 'demo.mp4');
const tmp = join(appDir, '.demo-trimmed.mp4');

/* 頭に「読み込み中」の空の盤面が0.08秒だけ映るので切る。1コマ目は筆が
   盤面に降りて動いているところにする。
   実行: node tools/trim-demo.mjs <開始秒> <終了秒> */
const START = Number(process.argv[2]);
const END = Number(process.argv[3]);
if (!Number.isFinite(START) || !Number.isFinite(END) || START < 0 || END <= START || END - START < 15 || END - START > 20) {
  throw new Error('映像を確認して、開始秒と終了秒を指定してください（長さ15〜20秒）');
}

execFileSync('ffmpeg', [
  '-y', '-ss', String(START), '-to', String(END), '-i', src,
  '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26',
  '-pix_fmt', 'yuv420p', '-r', '25', '-movflags', '+faststart',
  tmp
], { stdio: ['ignore', 'ignore', 'pipe'] });

renameSync(tmp, src);
console.log(`demo.mp4 を ${START}s〜${END}s で切り出しました（${(END - START).toFixed(2)}秒）`);
