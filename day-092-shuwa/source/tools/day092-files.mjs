/** 100日チャレンジへ `source/` として写す元のコードの一覧（作業記録・道具の下書き・依存は写さない） */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const INCLUDE = ['src', 'tests', 'scripts', 'tools', 'public', '.kiro/steering', '.kiro/specs', '.agent-harness/contracts', 'docs', 'dev-hands.html', '.gitignore',
  'index.html', 'package.json', 'package-lock.json', '.npmrc', 'tsconfig.json', 'vite.config.ts',
  'playwright.config.ts', 'README.md', 'LICENSE'];
const SKIP = [/(^|\/)node_modules\//, /(^|\/)\.DS_Store$/, /\.(mp4|task|wasm)$/];

export async function SOURCE_FILES(root) {
  const out = [];
  const visit = (p) => {
    const abs = join(root, p);
    let st;
    try { st = statSync(abs); } catch { return; }
    if (st.isDirectory()) for (const n of readdirSync(abs)) visit(join(p, n));
    else if (!SKIP.some((re) => re.test(p))) out.push(relative(root, abs));
  };
  INCLUDE.forEach(visit);
  return out;
}
