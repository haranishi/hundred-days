// READMEのDay一覧を各フォルダーのmeta.jsonから更新する。
// --check はファイルを書き換えず、更新漏れがあれば失敗させる。
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const readme = join(root, 'README.md');
const start = '<!-- day-index:start -->';
const end = '<!-- day-index:end -->';
const text = readFileSync(readme, 'utf8');
const from = text.indexOf(start);
const to = text.indexOf(end);
if (from < 0 || to < from) throw new Error('READMEにDay一覧のマーカーがありません');

const cell = value => String(value).replaceAll('|', '&#124;').replace(/[\r\n]+/g, ' ');
const seen = new Set();
const rows = readdirSync(root, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && /^day-\d{3}-/.test(entry.name))
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(({ name: dir }) => {
    const meta = JSON.parse(readFileSync(join(root, dir, 'meta.json'), 'utf8'));
    const day = Number(dir.slice(4, 7));
    if (meta.day !== day || seen.has(day)) throw new Error(`Day番号の不一致または重複: ${dir}`);
    seen.add(day);
    if (!existsSync(join(root, dir, 'README.md'))) throw new Error(`READMEがありません: ${dir}`);
    const hasCode = existsSync(join(root, dir, 'index.html'));
    const url = meta.status === 'draft' ? '' : (meta.externalUrl || meta.publicUrl || '');
    if (url && !/^https:\/\//.test(url)) throw new Error(`公開URLを確認してください: ${dir}`);
    const code = hasCode ? `[${dir}/](${dir}/)` : `[制作記録のみ](${dir}/)`;
    const live = url ? `[${meta.externalUrl ? '紹介ページ' : 'アプリを開く'}](${url})` : '未公開';
    return `| ${String(day).padStart(3, '0')} | ${cell(meta.title)} | ${code} | ${live} |`;
  });

const table = ['| Day | アプリ | コード | 公開ページ |', '|---|---|---|---|', ...rows].join('\n');
const updated = text.slice(0, from + start.length) + '\n' + table + '\n' + text.slice(to);
if (process.argv.includes('--check')) {
  if (updated !== text) {
    console.error('READMEのDay一覧が古くなっています。npm run index:sync を実行してください。');
    process.exitCode = 1;
  } else console.log(`day-index: ${rows.length}件の対応を確認しました`);
} else {
  if (updated !== text) writeFileSync(readme, updated);
  console.log(`day-index: ${rows.length}件の一覧を更新しました`);
}
