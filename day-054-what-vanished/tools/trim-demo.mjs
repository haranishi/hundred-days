// demo.mp4 の頭と尻を切る。 node day-054-what-vanished/tools/trim-demo.mjs <開始秒> <終了秒>
// 開始秒は目分量で決めない。先に --sheet で0.5秒おきのコマを並べ、歩き出したコマを確かめてから切る。
//   node day-054-what-vanished/tools/trim-demo.mjs --sheet   → demo-sheet.jpg（0.5秒おき・秒数入り）
import { execFileSync } from 'node:child_process';
import { renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(appDir, 'demo.mp4');
const args = process.argv.slice(2);

if (args[0] === '--sheet') {
  const out = join(appDir, 'tools', 'demo-sheet.jpg');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-vf',
    "fps=2,scale=180:-1,drawtext=text='%{pts\\:hms}':x=6:y=6:fontsize=16:fontcolor=white:box=1:boxcolor=black@0.6,tile=8x6",
    '-frames:v', '1', out]);
  console.log('作成:', out);
  process.exit(0);
}

const [start, end] = args.map(Number);
if (!(start >= 0) || !(end > start)) {
  console.error('使い方: node trim-demo.mjs <開始秒> <終了秒>（15〜20秒に収める）');
  process.exit(1);
}
if (end - start < 15 || end - start > 20) console.warn(`⚠️ 長さ ${(end - start).toFixed(1)}秒（15〜20秒が目安）`);
const tmp = join(appDir, 'demo.trim.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', String(start), '-to', String(end), '-i', src, '-an',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-r', '25', '-movflags', '+faststart', tmp]);
renameSync(tmp, src);
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-frames:v', '1', join(appDir, 'tools', 'demo-first-frame.png')]);
console.log(`切りました: ${start}〜${end}秒。1コマ目は tools/demo-first-frame.png で目視すること`);
