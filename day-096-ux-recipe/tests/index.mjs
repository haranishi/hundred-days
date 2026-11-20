// UXレシピの単体試験の入口（`node --test day-096-ux-recipe/tests/`）。
// core・render・ui の各フォルダにある *.test.mjs を、名前順にすべて読み込む。
// 新しい試験ファイルは、置くだけで走る（登録し忘れて一度も走らない事故を防ぐ）。
// core だけは必須（契約の試験が親の担当で置いてある）。
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REQUIRED = new Set(['core']);
let total = 0;
for (const dir of ['core', 'render', 'ui']) {
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
