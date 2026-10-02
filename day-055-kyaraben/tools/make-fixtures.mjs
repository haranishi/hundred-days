// E2E で setInputFiles に渡すテスト用 PNG を作る。ブラウザを使わず node:zlib だけで書く
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodeRgba } from './png.mjs';

const out = resolve(import.meta.dirname, '../tests/fixtures');
mkdirSync(out, { recursive: true });

function canvas(w, h, bg) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(bg, i * 4);
  const circle = (cx, cy, r, color) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) data.set(color, (y * w + x) * 4);
  };
  const rect = (x0, y0, x1, y1, color) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data.set(color, (y * w + x) * 4);
  };
  return { data, circle, rect };
}

// 白い紙のひよこ（黄色い体・オレンジのくちばし・黒い目・ピンクのほっぺ）
const chick = canvas(240, 200, [255, 255, 255, 255]);
chick.circle(120, 110, 70, [255, 216, 61, 255]);
chick.rect(182, 96, 206, 112, [255, 154, 46, 255]);
chick.circle(146, 88, 8, [20, 20, 20, 255]);
chick.circle(132, 130, 11, [244, 143, 177, 255]);
writeFileSync(resolve(out, 'hiyoko.png'), encodeRgba(240, 200, chick.data, { alpha: false }));

// 背景が透明な赤い丸（透過PNGの読み取り）
const clear = canvas(160, 160, [0, 0, 0, 0]);
clear.circle(80, 80, 50, [229, 57, 53, 255]);
clear.circle(80, 80, 18, [20, 20, 20, 255]);
writeFileSync(resolve(out, 'toumei.png'), encodeRgba(160, 160, clear.data));

console.log(`make-fixtures: ${out} に hiyoko.png と toumei.png を書きました`);
