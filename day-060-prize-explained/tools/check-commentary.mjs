import { readFile } from 'node:fs/promises';
import { checkCommentary } from '../lib/commentary-check.js';
const file = new URL('../data/commentary.json', import.meta.url);
const errors = [];
let data;
try {
  const content = await readFile(file);
  data = JSON.parse(content);
  errors.push(...checkCommentary(data, { bytes: content.length }));
} catch { errors.push('$: ファイルを読み込めないかJSONの形式が不正です'); }
if (process.argv.includes('--online') && !errors.length && data?.entries) {
  for (const [cat, entry] of Object.entries(data.entries)) {
    for (const [id, source] of Object.entries(entry.sources || {})) {
      const path = `entries.${cat}.sources.${id}.url`;
      try {
        const response = await fetch(source.url, { method: 'GET', signal: AbortSignal.timeout(10000) });
        console.log(`${path}: HTTP ${response.status}`);
        if (!response.ok) errors.push(`${path}: 出典の取得に失敗しました`);
        await response.body?.cancel();
      } catch { errors.push(`${path}: 出典に接続できませんでした`); }
    }
    try {
      const response = await fetch(`https://api.nobelprize.org/2.1/nobelPrizes?nobelPrizeYear=2026&nobelPrizeCategory=${encodeURIComponent(cat)}`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      const api = await response.json();
      const ids = api.nobelPrizes?.flatMap((p) => p.laureates || []).map((p) => String(p.id)) || [];
      console.log(`entries.${cat}.people: API ${ids.length}件`);
      for (const [i, person] of (entry.people || []).entries()) if (!ids.includes(person.id)) errors.push(`entries.${cat}.people[${i}].id: APIの受賞者番号と一致しません`);
      for (const id of ids) if (!entry.people?.some((p) => p.id === id)) errors.push(`entries.${cat}.people: APIの受賞者番号${id}がありません`);
    } catch { errors.push(`entries.${cat}.people: APIと照合できませんでした`); }
  }
}
for (const error of errors) console.error(error);
console.log(`検査: ${Object.keys(data?.entries || {}).length}件、エラー: ${errors.length}件`);
if (errors.length) process.exitCode = 1;
