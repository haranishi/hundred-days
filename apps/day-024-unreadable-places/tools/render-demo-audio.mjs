/* デモ動画に音を付ける。

   Playwrightは音を録らないので、動画は無音で上がる。そこで**アプリが実際に鳴らした音**
   （録画中に ?sound=log で控えた .demo-sound.json）を、lib/sound.js と同じ波形・同じ
   包絡線でWAVに組み立て直し、ffmpegで重ねる。day-007/008/010/012と同じ手。
   別の効果音を被せているのではなく、アプリの音を再現している。

   使い方（record-demo.mjs → trim-demo.mjs のあとに走らせる）:
     node tools/render-demo-audio.mjs

   位置合わせは動画の末尾から逆算する。録画は振り付けが返った直後に止まるので、
   「盤面が始まってから振り付けが終わるまで（sinceStartMs）」だけ末尾から戻った点が音のt=0。
   頭を切っても末尾は動かないので、trim-demo のあとでも合う。 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const logPath = join(appDir, '.demo-sound.json');
const video = join(appDir, 'demo.mp4');
const out = join(appDir, 'demo-with-audio.mp4');
const SAMPLE_RATE = 48000;
/* ログの gain は「その音の頂点」。ブラウザ側のマスター音量（lib/sound.js の 0.22）は
   ここでは掛けない——掛けると -50 LUFS まで落ちて、Xでは何も聞こえなくなる。
   day-012 も同じで、音符の gain をそのまま頂点として書き出している。

   そのうえで全体を1つの係数で TARGET_PEAK まで持ち上げる。係数は1つだけなので、
   音どうしの大小の関係（開示は小さく、弾ける音は大きい）はアプリと変わらない。
   既存の音付きDayは -19.5〜-22.2 LUFS なので、その辺りに着地させる。 */
const TARGET_PEAK = 0.7;

if (!existsSync(logPath)) {
  console.error(`✖ ${logPath} が無い。先に record-demo.mjs を（?sound=log の振り付けで）走らせること`);
  process.exit(1);
}
if (!existsSync(video)) {
  console.error(`✖ ${video} が無い`);
  process.exit(1);
}

const { sinceStartMs, events } = JSON.parse(readFileSync(logPath, 'utf8'));
if (!Array.isArray(events) || events.length === 0) {
  console.error('✖ 音のログが空。振り付けが ?sound=log で開いているか確認すること');
  process.exit(1);
}

const duration = Number(execFileSync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video
]).toString().trim());

/** 音のt=0が動画の何秒目にあたるか。末尾から逆算する */
const originSec = duration - sinceStartMs / 1000;

const frames = Math.ceil(duration * SAMPLE_RATE);
const buf = new Float32Array(frames);

/* --- lib/sound.js の tone() と同じ組み立て ---
   立ち上がり6msで gain まで、そこから dur で 0.0001 まで指数で落とす。
   glideTo があれば周波数を指数で滑らせる。cutoff は1次のローパスで近似する
   （BiquadFilter そのものではないが、耳で分かる差にはならない帯域）。 */
function renderTone(startSec, { freq, dur, gain, type, glideTo, cutoff }) {
  const start = Math.round(startSec * SAMPLE_RATE);
  const len = Math.round((dur / 1000) * SAMPLE_RATE);
  if (start + len <= 0 || start >= frames) return;

  const attack = Math.max(1, Math.round(0.006 * SAMPLE_RATE));
  const rc = cutoff ? 1 / (2 * Math.PI * cutoff) : 0;
  const alpha = cutoff ? (1 / SAMPLE_RATE) / (rc + 1 / SAMPLE_RATE) : 1;
  let lp = 0;
  let phase = 0;

  for (let i = 0; i < len; i += 1) {
    const idx = start + i;
    if (idx < 0 || idx >= frames) continue;
    const t = i / SAMPLE_RATE;
    const ratio = i / len;

    const f = glideTo ? freq * (glideTo / freq) ** ratio : freq;
    phase += (2 * Math.PI * f) / SAMPLE_RATE;

    let s;
    if (type === 'sine') s = Math.sin(phase);
    else if (type === 'square') s = Math.sin(phase) >= 0 ? 1 : -1;
    else {
      // triangle
      const p = (phase / (2 * Math.PI)) % 1;
      s = 4 * Math.abs(p - 0.5) - 1;
    }

    // 包絡線：6msで立ち上げ、そこから指数で落とす
    const env = i < attack
      ? 0.0001 * (gain / 0.0001) ** (i / attack)
      : gain * (0.0001 / gain) ** ((t - attack / SAMPLE_RATE) / (dur / 1000 - attack / SAMPLE_RATE));

    let v = s * env;
    if (cutoff) { lp += alpha * (v - lp); v = lp; }
    buf[idx] += v;
  }
}

/** lib/sound.js の noise() と同じ。白色ノイズをローパスして指数で落とす */
function renderNoise(startSec, { dur, gain, cutoff }) {
  const start = Math.round(startSec * SAMPLE_RATE);
  const len = Math.round((dur / 1000) * SAMPLE_RATE);
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = (1 / SAMPLE_RATE) / (rc + 1 / SAMPLE_RATE);
  let lp = 0;
  for (let i = 0; i < len; i += 1) {
    const idx = start + i;
    if (idx < 0 || idx >= frames) continue;
    const t = i / SAMPLE_RATE;
    const env = gain * (0.0001 / gain) ** (t / (dur / 1000));
    lp += alpha * ((Math.random() * 2 - 1) - lp);
    buf[idx] += lp * env;
  }
}

let placed = 0;
for (const e of events) {
  const at = originSec + e.at;
  if (at < -1 || at > duration) continue;
  if (e.kind === 'noise') renderNoise(at, e);
  else renderTone(at, e);
  placed += 1;
}

// 全体を1つの係数で TARGET_PEAK に合わせる（音どうしの大小の関係は変わらない）
let peak = 0;
for (let i = 0; i < frames; i += 1) peak = Math.max(peak, Math.abs(buf[i]));
const scale = peak > 0 ? TARGET_PEAK / peak : 1;

const pcm = Buffer.alloc(frames * 2);
for (let i = 0; i < frames; i += 1) {
  const v = Math.max(-1, Math.min(1, buf[i] * scale));
  pcm.writeInt16LE(Math.round(v * 32767), i * 2);
}

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVE', 8);
header.write('fmt ', 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22);
header.writeUInt32LE(SAMPLE_RATE, 24);
header.writeUInt32LE(SAMPLE_RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

const wav = join(tmpdir(), `day024-demo-${process.pid}.wav`);
writeFileSync(wav, Buffer.concat([header, pcm]));

execFileSync('ffmpeg', [
  '-y', '-i', video, '-i', wav,
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
  '-shortest', '-movflags', '+faststart',
  out
], { stdio: ['ignore', 'ignore', 'pipe'] });
rmSync(wav, { force: true });

console.log(`音を重ねました: ${out}`);
console.log(`  動画 ${duration.toFixed(2)}秒 / 音の起点 ${originSec.toFixed(2)}秒 / 鳴らした音 ${placed}件（ログ ${events.length}件）`);
console.log(`  ピーク ${peak.toFixed(3)} → ${(peak * scale).toFixed(3)}（×${scale.toFixed(2)}・音どうしの比は不変）`);
console.log('  meta.json の demo を demo-with-audio.mp4 に向けること。音は必ず聞いて確かめる');
