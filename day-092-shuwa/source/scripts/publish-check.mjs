/**
 * こちら側の公開ゲート（100日の `npm run publish:check -- --day 92` とは別に、組み込む前に流す）。
 * 1) dist の HTML/CSS/JS に `/` で始まるサイト内参照が無い（/100days/day-092-…/ の下で壊れないため）
 * 2) dist に THIRD_PARTY_NOTICES.txt がある
 * 3) 100日へ写す元のコード（tools/day092-files.mjs の一覧）に、ローカルの絶対パス・メールアドレスが無い（個人の言葉の検査は100日の npm run precheck が行う）
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const problems = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

if (!existsSync(dist)) problems.push('dist がありません。先に npm run build を流してください');
else {
  for (const file of walk(dist)) {
    if (!/\.(html|css|js|webmanifest)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    const rel = relative(dist, file);
    // src="/..." href="/..." url(/...) のようなルート直下の参照（// で始まる外部は除く）
    const hit = text.match(/(?:src|href)=["']\/(?!\/)[^"']*["']|url\(\s*["']?\/(?!\/)[^)"']*/);
    if (hit) problems.push(`${rel}: ルート直下の参照 ${hit[0].slice(0, 80)}`);
  }
  if (!existsSync(join(dist, 'THIRD_PARTY_NOTICES.txt'))) problems.push('dist/THIRD_PARTY_NOTICES.txt がありません（npm run notices）');
}

const { SOURCE_FILES } = await import('../tools/day092-files.mjs').catch(() => ({ SOURCE_FILES: null }));
if (SOURCE_FILES) {
  const forbidden = [/\/Users\/[a-z]/i, /~\/Projects\//, /\.codex-(work|personal)/, /[A-Za-z0-9._%+-]+@gmail\.com/];
  for (const rel of await SOURCE_FILES(root)) {
    const text = readFileSync(join(root, rel), 'utf8');
    for (const re of forbidden) if (re.test(text)) problems.push(`${rel}: 写してはいけない文字列 ${re}`);
  }
}

// 4) 使っている文字が、絞った書体に全部入っているか（入っていなければ npm run fonts を流す）
const { usedChars } = await import('./subset-font.mjs');
const have = new Set(readFileSync(join(root, 'src/ui/fonts/chars.txt'), 'utf8'));
const missing = [...usedChars()].filter((c) => !have.has(c));
if (missing.length) problems.push(`書体に無い文字 ${missing.length} 個（npm run fonts で作り直す）: ${missing.slice(0, 30).join('')}`);

if (problems.length) {
  console.error(`公開ゲート: ${problems.length} 件の問題\n- ` + problems.join('\n- '));
  process.exit(1);
}
console.log('公開ゲート: 問題なし');
