/* demo.mp4 の頭とお尻を落とす。

   1コマ目がそのままXのサムネになるので、「結果が出たあとの静止画」ではなく
   「時間バーが伸びている途中」で始める。record-demo.mjs は頭から撮るため、
   振り付けの中で干し方を切り替えて描き直しを起こし、その瞬間をここで切り出す。

   実行: node tools/trim-demo.mjs   （apps/day-032-laundry-dry/ で） */
import { execFileSync } from 'node:child_process';
import { renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(appDir, 'demo.mp4');
const tmp = join(appDir, '.demo-trimmed.mp4');

/* 2.44秒＝「厚手」を押した直後、オレンジの棒が伸びている途中（実測で確認した位置）。
   20.0秒＝根拠を開いて読み終えたところ。最後の「上に戻る」は要らない。 */
const START = 2.44;
const END = 20.0;

execFileSync('ffmpeg', [
  '-y', '-ss', String(START), '-to', String(END), '-i', src,
  '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26',
  '-pix_fmt', 'yuv420p', '-r', '25', '-movflags', '+faststart',
  tmp
], { stdio: ['ignore', 'ignore', 'pipe'] });

renameSync(tmp, src);
console.log(`demo.mp4 を ${START}s〜${END}s で切り出しました（${(END - START).toFixed(2)}秒）`);
