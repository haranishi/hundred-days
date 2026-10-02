// PNG の書き出し（node:zlib だけ）。テスト用の画像とサンプルの減色に使う
import { deflateSync } from 'node:zlib';

const CRC = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c;
}
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function ihdr(w, h, colorType) {
  const b = Buffer.alloc(13);
  b.writeUInt32BE(w, 0);
  b.writeUInt32BE(h, 4);
  b[8] = 8;
  b[9] = colorType;
  return b;
}
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// rgba: 長さ w*h*4。alpha を使わないなら RGB（色の型2）で書く
export function encodeRgba(w, h, rgba, { alpha = true } = {}) {
  const ch = alpha ? 4 : 3;
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * ch + 1)] = 0;
    for (let x = 0; x < w; x++) for (let c = 0; c < ch; c++) raw[y * (w * ch + 1) + 1 + x * ch + c] = rgba[(y * w + x) * 4 + c];
  }
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr(w, h, alpha ? 6 : 2)), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// パレット（最大256色）の PNG。塗りの面が多い絵は、これでぐっと小さくなる
export function encodeIndexed(w, h, indices, palette) {
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w + 1)] = 0;
    for (let x = 0; x < w; x++) raw[y * (w + 1) + 1 + x] = indices[y * w + x];
  }
  const plte = Buffer.from(palette.flatMap((c) => c.slice(0, 3)));
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr(w, h, 3)), chunk('PLTE', plte), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
