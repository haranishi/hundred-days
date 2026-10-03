// OWNER: tools
// コードの計量と規約の検査。
// ・ファイルごとの行数（全行と空行・コメントを除いた行）、大きいファイルの上位
// ・src/world と src/gameplay（遊びの規則）が three を import していないか（そこから相対 import でたどれる全ファイルを見る）
// ・src などの各ファイルの1行目が「// OWNER: <領域>」か
//   npm run metrics                 画面に表示し、.captures/metrics.json に書く
//   npm run metrics -- --round r00a .captures/r00a/metrics.json に書く
// 規約違反があれば終了コード 1。
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, parseArgs } from './lib/harness.mjs';

const SCAN_DIRS = ['src', 'tests', 'e2e', 'tools'];
const CODE_EXT = new Set(['.ts', '.mjs', '.js']);
const OWNER_RE = /^\/\/ OWNER: \S/;
const THREE_RE = /(?:from\s+|import\s*\(\s*|import\s+)['"](three(?:\/[^'"]*)?)['"]/g;
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;

async function walk(dir) {
  const out = [];
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full)));
    else if (CODE_EXT.has(path.extname(e.name))) out.push(full);
  }
  return out;
}

function countLines(text) {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  let code = 0;
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (inBlock) {
      if (line.includes('*/')) inBlock = false;
      continue;
    }
    if (line === '' || line.startsWith('//')) continue;
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlock = true;
      continue;
    }
    code++;
  }
  return { lines: lines.length, code };
}

async function resolveImport(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
    try {
      const s = await readFile(candidate, 'utf8');
      return { file: candidate, text: s };
    } catch {
      // 次の候補
    }
  }
  return null;
}

/** src/world の各ファイルから相対 import をたどり、three を import するファイルを探す。 */
async function worldThreeViolations(worldFiles) {
  const seen = new Map();
  const queue = worldFiles.map((f) => ({ file: f, via: [path.relative(ROOT, f)] }));
  const violations = [];
  while (queue.length > 0) {
    const { file, via } = queue.shift();
    if (seen.has(file)) continue;
    const text = await readFile(file, 'utf8');
    seen.set(file, true);
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of code.matchAll(THREE_RE)) {
      violations.push({ file: path.relative(ROOT, file), imports: m[1], chain: via });
    }
    for (const m of code.matchAll(IMPORT_RE)) {
      const resolved = await resolveImport(file, m[1]);
      if (resolved && !seen.has(resolved.file)) queue.push({ file: resolved.file, via: [...via, path.relative(ROOT, resolved.file)] });
    }
  }
  return { violations, reachable: [...seen.keys()].map((f) => path.relative(ROOT, f)).sort() };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = [];
  for (const d of SCAN_DIRS) files.push(...(await walk(path.join(ROOT, d))));
  files.push(path.join(ROOT, 'vite.config.ts'), path.join(ROOT, 'playwright.config.ts'));

  const rows = [];
  const missingOwner = [];
  for (const f of files) {
    let text;
    try {
      text = await readFile(f, 'utf8');
    } catch {
      continue;
    }
    const { lines, code } = countLines(text);
    const first = text.split('\n')[0] ?? '';
    const owner = OWNER_RE.test(first) ? first.replace('// OWNER:', '').trim() : null;
    if (!owner) missingOwner.push(path.relative(ROOT, f));
    rows.push({ path: path.relative(ROOT, f), lines, code, owner });
  }
  rows.sort((a, b) => b.lines - a.lines);

  const worldFiles = (await walk(path.join(ROOT, 'src', 'world'))).filter((f) => f.endsWith('.ts'));
  const world = await worldThreeViolations(worldFiles);
  const gameplayFiles = (await walk(path.join(ROOT, 'src', 'gameplay'))).filter((f) => f.endsWith('.ts'));
  const gameplay = await worldThreeViolations(gameplayFiles);

  const byDir = {};
  for (const r of rows) {
    const key = r.path.split(path.sep).slice(0, 2).join('/');
    byDir[key] = (byDir[key] ?? 0) + r.lines;
  }
  const report = {
    date: new Date().toISOString(),
    fileCount: rows.length,
    totalLines: rows.reduce((s, r) => s + r.lines, 0),
    totalCodeLines: rows.reduce((s, r) => s + r.code, 0),
    linesByDir: byDir,
    largest: rows.slice(0, 10),
    checks: {
      worldImportsThree: world.violations,
      worldReachableFiles: world.reachable,
      gameplayImportsThree: gameplay.violations,
      gameplayReachableFiles: gameplay.reachable,
      missingOwner,
    },
    files: rows,
  };

  const outFile = args.round ? path.join(ROOT, '.captures', String(args.round), 'metrics.json') : path.join(ROOT, '.captures', 'metrics.json');
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(report, null, 2));

  console.log(`ファイル ${report.fileCount} 本 / ${report.totalLines} 行（空行・コメントを除くと ${report.totalCodeLines} 行）`);
  console.log('大きいファイル（上位10）:');
  for (const r of report.largest) console.log(`  ${String(r.lines).padStart(5)}  ${r.path}`);
  console.log(`src/world からたどれるファイル ${world.reachable.length} 本のうち three を import しているもの: ${world.violations.length} 本`);
  for (const v of world.violations) console.log(`  ✗ ${v.file} が ${v.imports} を import（経路: ${v.chain.join(' → ')}）`);
  console.log(`src/gameplay からたどれるファイル ${gameplay.reachable.length} 本のうち three を import しているもの: ${gameplay.violations.length} 本`);
  for (const v of gameplay.violations) console.log(`  ✗ ${v.file} が ${v.imports} を import（経路: ${v.chain.join(' → ')}）`);
  console.log(`1行目に OWNER が無いファイル: ${missingOwner.length} 本`);
  for (const f of missingOwner) console.log(`  ✗ ${f}`);
  console.log(`書き出し: ${path.relative(ROOT, outFile)}`);
  if (world.violations.length > 0 || gameplay.violations.length > 0 || missingOwner.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
