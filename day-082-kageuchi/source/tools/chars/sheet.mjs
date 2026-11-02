// OWNER: chars-art
// 何枚かの PNG を縮めて1枚の一覧にする（講評で読む量を減らすため）。
//   node tools/chars/sheet.mjs <出力.png> <列数> <縮める倍率> <入力1.png> <入力2.png> …
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const [out, colsArg, fArg, ...inputs] = process.argv.slice(2);
const cols = Number(colsArg);
const f = Number(fArg);
const imgs = await Promise.all(inputs.map(async (p) => PNG.sync.read(await readFile(p))));
const cw = Math.floor(imgs[0].width / f);
const ch = Math.floor(imgs[0].height / f);
const rows = Math.ceil(imgs.length / cols);
const sheet = new PNG({ width: cw * cols, height: ch * rows });
sheet.data.fill(0);
imgs.forEach((img, n) => {
  const ox = (n % cols) * cw;
  const oy = Math.floor(n / cols) * ch;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < f; j++) {
        for (let i = 0; i < f; i++) {
          const k = ((y * f + j) * img.width + (x * f + i)) * 4;
          r += img.data[k];
          g += img.data[k + 1];
          b += img.data[k + 2];
        }
      }
      const o = ((oy + y) * sheet.width + ox + x) * 4;
      sheet.data[o] = r / (f * f);
      sheet.data[o + 1] = g / (f * f);
      sheet.data[o + 2] = b / (f * f);
      sheet.data[o + 3] = 255;
    }
  }
});
await writeFile(out, PNG.sync.write(sheet));
console.log(`${out}: ${sheet.width}×${sheet.height}`);
