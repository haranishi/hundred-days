// 公開URLの決まり（AGENTS.md）。公開済みで一覧にマウントされるDayの meta.json の publicUrl は、
// https://rairakku.com/100days/<フォルダ名>/ にそろえる。旧住所（hundred-days.pages.dev）のままだと、Xの返信リンクと
// README の一覧が、検索の評価を rairakku.com に集めない。決まりの例外は meta.json で見分ける：
// mount: false のDay（Day064・076）は旧住所のまま、外部で公開するDay（status: external）は外部の公開先、下書きは対象外。
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { effectiveStatus } from '../lib/day-status.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MOUNTED = (dir) => `https://rairakku.com/100days/${dir}/`;
const DIRECT = (dir) => `https://hundred-days.pages.dev/${dir}/`;

/** そのDayの meta.json から、決まりどおりの publicUrl を返す。下書きは null（対象外）。 */
export function expectedPublicUrl(meta, dir, env = {}) {
  const status = effectiveStatus(meta, dir, env);
  if (status === 'draft') return null;
  if (status === 'external') return meta.externalUrl ?? null;
  return meta.mount === false ? DIRECT(dir) : MOUNTED(dir);
}

test('公開URLの決まり：公開済みのDayは、mount: false を除いて、rairakku.com の /100days/ の住所にそろっている', () => {
  const dirs = readdirSync(ROOT).filter((name) => /^day-\d{3}-/.test(name) && existsSync(`${ROOT}${name}/meta.json`));
  assert.ok(dirs.length > 50, `Dayのフォルダが見つかる（${dirs.length}件）`);
  const mismatches = [];
  for (const dir of dirs) {
    const meta = JSON.parse(readFileSync(`${ROOT}${dir}/meta.json`, 'utf8'));
    const expected = expectedPublicUrl(meta, dir);
    if (expected !== null && meta.publicUrl !== expected) mismatches.push(`${dir}: ${meta.publicUrl ?? '(なし)'} ではなく ${expected}`);
  }
  assert.deepEqual(mismatches, [], `publicUrl が決まりと違うDay（AGENTS.md の公開URLの決まり）:\n${mismatches.join('\n')}`);
});

test('公開URLの決まり：判定そのものの例（公開済み・mount: false・外部・下書き）', () => {
  assert.equal(expectedPublicUrl({}, 'day-100-x'), MOUNTED('day-100-x'));
  assert.equal(expectedPublicUrl({ status: 'published' }, 'day-100-x'), MOUNTED('day-100-x'));
  assert.equal(expectedPublicUrl({ mount: false }, 'day-064-breach-atlas'), DIRECT('day-064-breach-atlas'));
  assert.equal(expectedPublicUrl({ status: 'external', externalUrl: 'https://example.com/a' }, 'day-081-y'), 'https://example.com/a');
  assert.equal(expectedPublicUrl({ status: 'draft' }, 'day-082-z'), null);
});
