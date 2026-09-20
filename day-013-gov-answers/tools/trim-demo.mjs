// demo.mp4 の頭を切り落とす。
//
// Playwright の録画はページを作った瞬間から止められないので、入力欄が空のまま
// 国会会議録APIの応答を待っている数秒が必ず頭に入る。1コマ目がそのままXのサムネに
// なるため、**年別のグラフが出ている状態**から始まるように末尾から一定秒だけ残す。
//
//   node tools/trim-demo.mjs [残す秒数]
//
// 残した動画の1コマ目は必ず目視すること（CLAUDE.md 公開前チェック②）。

import { execFileSync } from 'node:child_process';
import { renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(appDir, 'demo.mp4');
const tmp = join(appDir, '.demo-trimmed.mp4');
const keep = Number(process.argv[2] ?? 18);

const duration = Number(execFileSync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src,
], { encoding: 'utf8' }).trim());

const start = Math.max(0, duration - keep);
if (start === 0) {
  console.log(`元が${duration.toFixed(1)}秒しかないので切らずに終了`);
  process.exit(0);
}

// 切り出し位置にキーフレームが無いと先頭が壊れるので、再エンコードする
execFileSync('ffmpeg', [
  '-v', 'error', '-ss', start.toFixed(3), '-i', src,
  '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '23',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', tmp, '-y',
]);
renameSync(tmp, src);

const after = execFileSync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src,
], { encoding: 'utf8' }).trim();
console.log(`頭 ${start.toFixed(1)}秒を切り落としました: ${duration.toFixed(1)}秒 → ${Number(after).toFixed(1)}秒`);
