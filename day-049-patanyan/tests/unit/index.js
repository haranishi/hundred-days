// Node 24 の `node --test tests/unit/` はフォルダを1つのモジュールとして読む（中を探しに行かない）。
// 設計書どおりのコマンドで全部が走るよう、ここから同じフォルダの *.test.mjs をすべて読み込む
import { readdirSync } from 'node:fs';

const dir = new URL('./', import.meta.url);
for (const name of readdirSync(dir).filter((n) => n.endsWith('.test.mjs')).sort()) {
  await import(new URL(name, dir));
}
