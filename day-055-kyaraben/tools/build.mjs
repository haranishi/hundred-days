// 公開用の dist/ を作る。画面に要るファイルだけを写す（tests・tools・要件などは公開しない）
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist');
const FILES = ['index.html', 'privacy.html', 'app.js', 'app.css', 'favicon.svg', 'og.png', '_headers'];
const DIRS = ['lib', 'assets', 'shared'];

for (const name of FILES) {
  if (!existsSync(resolve(root, name))) throw new Error(`${name} がありません（og.png は npm run og で作る）`);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const name of FILES) cpSync(resolve(root, name), resolve(out, name));
for (const name of DIRS) cpSync(resolve(root, name), resolve(out, name), { recursive: true });
console.log(`build: ${out} に ${FILES.length} ファイルと ${DIRS.join('・')} を写しました`);
