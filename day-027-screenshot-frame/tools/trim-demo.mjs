/* demo.mp4 の頭を切り落とす。
   1コマ目をサンプル画像が着地している途中にし、空の置き場の静止画から始まらないようにする。

   使い方: node tools/trim-demo.mjs [切り落とす秒数]
   既定は1.4秒（サンプル読み込みのクリックが約1.2秒後）。振り付けを変えたら、切る位置も測り直すこと。 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renameSync, rmSync } from 'node:fs';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(appDir, 'demo.mp4');
const work = join(appDir, '.demo-trimmed.mp4');
const head = Number(process.argv[2] ?? 1.4);

if (!Number.isFinite(head) || head <= 0) {
  console.error('切り落とす秒数は正の数で指定してください');
  process.exit(1);
}

// -ss を -i の前に置くとキーフレーム単位になるので、後ろに置いて再エンコードする。
// 尺が20秒未満なので、精度を取って作り直す方が確実。
execFileSync('ffmpeg', [
  '-y', '-i', source,
  '-ss', String(head),
  '-an',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '26',
  '-pix_fmt', 'yuv420p', '-r', '25',
  '-movflags', '+faststart',
  work
], { stdio: ['ignore', 'ignore', 'pipe'] });

renameSync(work, source);
rmSync(work, { force: true });

const duration = execFileSync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', source
]).toString().trim();

console.log(`頭 ${head} 秒を切り落としました: demo.mp4（${Number(duration).toFixed(1)}秒）`);
console.log('1コマ目を必ず目視すること: ffmpeg -i demo.mp4 -frames:v 1 thumb.png');

