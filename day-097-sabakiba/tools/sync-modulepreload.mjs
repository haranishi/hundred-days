// index.html の modulepreload の一覧を、app.js から辿れる ES モジュールの import から作り直す（開発用。tools/ は配信しない）。
// 使い方: node day-097-sabakiba/tools/sync-modulepreload.mjs   （--check で、ずれていたら終了コード1）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const IMPORT = /(?:import|export)\s+(?:[^'"()]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+\.js)['"]|import\(\s*['"](\.{1,2}\/[^'"]+\.js)['"]\s*\)/g;
const seen = new Set();
function visit(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(IMPORT)) visit(resolve(dirname(file), m[1] || m[2]));
}
visit(join(root, 'app.js'));
const list = [...seen].filter((f) => f !== join(root, 'app.js')).map((f) => './' + relative(root, f)).sort();
const block = ['  <!-- modulepreload:start（tools/sync-modulepreload.mjs が作る。手で直さない） -->', ...list.map((u) => `  <link rel="modulepreload" href="${u}">`), '  <!-- modulepreload:end -->'].join('\n');

const htmlPath = join(root, 'index.html');
const html = readFileSync(htmlPath, 'utf8');
const re = /  <!-- modulepreload:start[\s\S]*?<!-- modulepreload:end -->/;
const next = re.test(html) ? html.replace(re, block) : html.replace('  <link rel="stylesheet" href="./shared/share.css">\n', `  <link rel="stylesheet" href="./shared/share.css">\n${block}\n`);
if (process.argv.includes('--check')) { if (next !== html) { console.error('index.html の modulepreload が古い'); process.exit(1); } console.log('modulepreload 一致', list.length); }
else { writeFileSync(htmlPath, next); console.log('modulepreload', list.length, '件'); }
