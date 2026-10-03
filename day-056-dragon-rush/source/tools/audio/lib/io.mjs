// OWNER: audio-tools
// 書き出しと読み込み：WAV（32bit 浮動小数か 16bit）、ffmpeg で OGG（Vorbis）へ変換、OGG を浮動小数の配列へ戻す。
// ffmpeg は /opt/homebrew/bin/ffmpeg を既定にし、環境変数 FFMPEG で差し替えられる。OGG は同じ入力なら同じバイト列になるよう bitexact で書く。
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export const FFMPEG = process.env.FFMPEG ?? '/opt/homebrew/bin/ffmpeg';

/** channels は Float32Array の配列（1〜2本）。bits は 16 か 32（浮動小数）。 */
export function wavBytes(channels, sampleRate, bits = 32) {
  const nch = channels.length;
  const n = channels[0].length;
  const bps = bits / 8;
  const dataBytes = n * nch * bps;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(bits === 32 ? 3 : 1, 20);
  buf.writeUInt16LE(nch, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * nch * bps, 28);
  buf.writeUInt16LE(nch * bps, 32);
  buf.writeUInt16LE(bits, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      const v = channels[c][i];
      if (bits === 32) buf.writeFloatLE(v, o);
      else buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), o);
      o += bps;
    }
  }
  return buf;
}

export function writeWav(file, channels, sampleRate, bits = 32) {
  writeFileSync(file, wavBytes(channels, sampleRate, bits));
}

function run(args, input) {
  const r = spawnSync(FFMPEG, args, { input, maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg が失敗しました（${args.join(' ')}）\n${r.stderr?.toString() ?? ''}`);
  return r;
}

/** WAV を OGG（Vorbis、quality は -q:a の値）へ変換する。 */
export function encodeOgg(wavFile, oggFile, quality = 4) {
  run(['-hide_banner', '-loglevel', 'error', '-y', '-i', wavFile, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-c:a', 'libvorbis', '-q:a', String(quality), oggFile]);
}

/** 音のファイルを 48kHz・2ch の浮動小数へ戻す（{ l, r }）。 */
export function decodeFile(file, sampleRate = 48000) {
  const r = run(['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', '2', '-ar', String(sampleRate), 'pipe:1']);
  const bytes = r.stdout;
  const n = Math.floor(bytes.length / 8);
  const l = new Float32Array(n);
  const rr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = bytes.readFloatLE(i * 8);
    rr[i] = bytes.readFloatLE(i * 8 + 4);
  }
  return { l, r: rr };
}

/** ffmpeg を任意の引数で呼び、標準エラーの文字列を返す（ebur128 や astats の結果を読む）。 */
export function ffmpegStderr(args) {
  const r = spawnSync(FFMPEG, args, { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg が失敗しました（${args.join(' ')}）\n${r.stderr?.toString() ?? ''}`);
  return r.stderr.toString();
}
