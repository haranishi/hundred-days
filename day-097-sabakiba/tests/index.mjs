// さばき場の単体試験の入口（`node --test day-097-sabakiba/tests/`）。
// core・geometry・timeline・content・app の各フォルダの *.test.mjs を名前順にすべて読み込む。
// 新しい試験ファイルは、置くだけで走る（登録し忘れて一度も走らない事故を防ぐ）。core だけは必須。
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REQUIRED = new Set(['core']);
let total = 0;
for (const dir of ['core', 'geometry', 'timeline', 'content', 'app']) {
  const folder = new URL(`./${dir}/`, import.meta.url);
  const path = fileURLToPath(folder);
  const names = existsSync(path) ? readdirSync(path).filter((name) => name.endsWith('.test.mjs')).sort() : [];
  if (REQUIRED.has(dir) && names.length === 0) throw new Error(`tests/${dir}/ に *.test.mjs がありません`);
  for (const name of names) {
    await import(new URL(name, folder).href);
    total += 1;
  }
}
if (total === 0) throw new Error('試験ファイルが1つも読み込まれませんでした');
