// Day099 meibo 宣伝動画ツールの単体試験の入口（`node --test day-099-meibo/tests/`）。
// promo/ フォルダにある *.test.mjs を名前順にすべて読み込む。
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REQUIRED = new Set(['promo']);
let total = 0;
for (const dir of ['promo']) {
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
