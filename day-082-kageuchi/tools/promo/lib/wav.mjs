// WAV（PCM 24bit・ステレオ）を書く・読む小さな道具。外の依存なし。
import { readFileSync, writeFileSync } from 'node:fs';

/** L・R（Float32Array、-1〜1）を 24bit の WAV に書く。範囲外は切り詰める（呼ぶ側で切り詰めが起きないよう音量を決める）。 */
export function writeWav(file, L, R, sr) {
  const n = L.length;
  const bytes = 3;
  const data = Buffer.alloc(n * 2 * bytes);
  let clipped = 0;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 2; c++) {
      let v = (c ? R : L)[i];
      if (v > 1 || v < -1) clipped++;
      v = Math.max(-1, Math.min(1, v));
      const x = Math.round(v * 8388607);
      data.writeIntLE(x, (i * 2 + c) * bytes, 3);
    }
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(sr, 24);
  h.writeUInt32LE(sr * 2 * bytes, 28);
  h.writeUInt16LE(2 * bytes, 32);
  h.writeUInt16LE(bytes * 8, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([h, data]));
  return { clipped };
}

/** writeWav が書いた形（24bit・ステレオ）だけを読む。 */
export function readWav(file) {
  const b = readFileSync(file);
  const sr = b.readUInt32LE(24);
  const bits = b.readUInt16LE(34);
  if (bits !== 24) throw new Error('24bit だけ読める');
  let off = 12;
  while (b.toString('ascii', off, off + 4) !== 'data') off += 8 + b.readUInt32LE(off + 4);
  const len = b.readUInt32LE(off + 4);
  const n = len / 6;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = b.readIntLE(off + 8 + i * 6, 3) / 8388607;
    R[i] = b.readIntLE(off + 8 + i * 6 + 3, 3) / 8388607;
  }
  return { L, R, sr };
}
