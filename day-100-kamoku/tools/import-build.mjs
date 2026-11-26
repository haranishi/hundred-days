/* kamoku の「ブラウザだけで動くお試し版」の組み立て結果を、このDayのフォルダへ取り込む。
   使い方: node day-100-kamoku/tools/import-build.mjs <組み立て結果> <組み立てた kamoku の作業フォルダ>
   組み立て結果は手で直さず、直すときは kamoku 側を直して組み立て直し、この道具で入れ替える。 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MAX_BYTES = 25 * 1024 * 1024; // 配信先（Cloudflare Pages）の1ファイルの上限
const REQUIRED = [
  'index.html', 'favicon.svg', 'build-info.json', 'THIRD_PARTY_LICENSES.txt',
  'rust/pkg/kamoku_ui.js', 'rust/pkg/kamoku_ui_bg.wasm',
  'web/shim.js', 'web/demo.css', 'web/pkg/kamoku_web.js', 'web/pkg/kamoku_web_bg.wasm',
];
const CSS = /^css\/[A-Za-z0-9_-]+\.css$/;
/* 前の取り込みで置いた物。取り込みのたびに消してから写す。ここに無い物（day100/・meta.json など）には触らない */
const GENERATED = [
  'index.html', 'favicon.svg', 'build-info.json', 'THIRD_PARTY_LICENSES.txt',
  'css', 'rust', 'web', 'kamoku-LICENSE-MIT.txt', 'kamoku-LICENSE-APACHE.txt',
];
const LICENSES = [['LICENSE-MIT', 'kamoku-LICENSE-MIT.txt'], ['LICENSE-APACHE', 'kamoku-LICENSE-APACHE.txt']];
/* このリポジトリの公開前チェック（scripts/precheck.mjs）が止める行と同じ式。取り込む時点で止める */
const SECRET_LINE = /(api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{8,}["']/i;
const TEXT = /\.(html|js|css|json|txt|svg)$/;
/* 手元の絶対パス（利用者名を含む）。WASM にも残りうるので、全ファイルをバイトのまま調べる */
const LOCAL_PATH = /\/(?:Users|home|Volumes)\//;

export class ImportError extends Error {}

const escapeAttr = (value) => String(value)
  .replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function walk(root, rel = '') {
  const files = [];
  for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new ImportError(`シンボリックリンクは取り込みません: ${path}`);
    if (entry.isDirectory()) files.push(...walk(root, path));
    else files.push(path);
  }
  return files.sort();
}

/** 組み立て結果を調べ、取り込むファイルの一覧を返す。問題があれば ImportError。 */
export function inspectBuild(buildDir, { home = homedir() } = {}) {
  if (!existsSync(buildDir) || !lstatSync(buildDir).isDirectory()) throw new ImportError(`組み立て結果がありません: ${buildDir}`);
  const files = walk(buildDir);
  const missing = REQUIRED.filter((path) => !files.includes(path));
  if (missing.length) throw new ImportError(`組み立て結果に足りないファイルがあります: ${missing.join(', ')}`);
  const unknown = files.filter((path) => !REQUIRED.includes(path) && !CSS.test(path));
  if (unknown.length) throw new ImportError(`知らないファイルがあります。取り込む範囲を確かめてください: ${unknown.join(', ')}`);
  for (const path of files) {
    const data = readFileSync(join(buildDir, path));
    if (data.length > MAX_BYTES) throw new ImportError(`${path} が25MiBを超えています`);
    const found = data.toString('latin1').match(LOCAL_PATH)?.[0] ?? (home && home.length > 3 && data.includes(home) ? home : null);
    if (found) throw new ImportError(`${path} に手元の絶対パスが入っています（${found}）`);
    if (TEXT.test(path) && data.toString('utf8').split('\n').some((line) => SECRET_LINE.test(line))) {
      throw new ImportError(`${path} に、秘密の値を書いたように見える行があります`);
    }
  }
  return files;
}

/** 組み立てた index.html に、このDayの帯・共有の窓・共有の部品を足す。目印がちょうど1か所に無ければ止める。 */
export function injectIndex(html, meta) {
  if (html.includes('d100-')) throw new ImportError('index.html に、すでにこのDayの部品が入っています');
  const title = String(meta.title ?? '').trim();
  if (!title) throw new ImportError('meta.json の title がありません');
  const head = [
    `  <meta name="description" content="${escapeAttr(`日本の個人事業主向けの会計ソフト ${title} を、架空の帳簿でブラウザだけで試せます。入力はそのブラウザの中だけで、再読み込みで元に戻ります。`)}">`,
    `  <meta name="share:text" content="${escapeAttr(`${title} — 日本の個人事業主向けの会計ソフトを、ブラウザで試せます。`)}">`,
    '  <link rel="stylesheet" href="./shared/share.css">',
    '  <link rel="stylesheet" href="./day100/day100.css">',
  ].join('\n');
  /* 帯は本文の列（.main-col）の先頭に、普通の流れで置く。画面全体の前に置くと、高さ100vhの左の列が
     帯の分だけ下へはみ出し、固定表示にすると画面下の固定バーに重なる */
  const bar = [
    '      <div class="d100-bar">',
    '        <a href="../">100日チャレンジ</a>',
    '        <span class="d100-day">Day 100</span>',
    '        <button type="button" class="d100-share" id="d100-share-open" aria-haspopup="dialog" aria-label="このアプリを共有する">共有</button>',
    '      </div>',
  ].join('\n');
  const tail = [
    '  <dialog id="d100-share-dialog" class="d100-dialog" aria-labelledby="share-label">',
    '    <form method="dialog" class="d100-dialog-head"><button type="submit" class="d100-close">閉じる</button></form>',
    '    <div id="share"></div>',
    '  </dialog>',
    '  <script src="./day100/share-open.js" defer></script>',
    '  <script src="./shared/share.js" defer></script>',
  ].join('\n');
  const edits = [
    ['</head>', `${head}\n</head>`],
    ['      <div class="banners" id="banners"></div>', `${bar}\n      <div class="banners" id="banners"></div>`],
    ['</body>', `${tail}\n</body>`],
  ];
  let out = html;
  for (const [marker, replacement] of edits) {
    const count = out.split(marker).length - 1;
    if (count !== 1) throw new ImportError(`index.html の目印「${marker.trim()}」が ${count} か所です（1か所である必要があります）`);
    out = out.replace(marker, () => replacement);
  }
  return out;
}

const gitHead = (repoDir) => execFileSync('git', ['-C', repoDir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

/** 組み立て結果を dayDir に取り込む。調べ終わるまで、dayDir には何も書かない。 */
export function importBuild({ buildDir, repoDir, dayDir, headOf = gitHead, home }) {
  const files = inspectBuild(buildDir, home === undefined ? {} : { home });
  const info = JSON.parse(readFileSync(join(buildDir, 'build-info.json'), 'utf8'));
  if (!/^[0-9a-f]{40}$/.test(info.commit ?? '')) throw new ImportError('build-info.json にコミットがありません');
  if (info.modified) throw new ImportError('commit していない変更を含む組み立てです。変更の無い作業フォルダで組み立て直してください');
  const head = headOf(repoDir);
  if (head !== info.commit) throw new ImportError(`組み立てたコミット（${info.commit}）と、作業フォルダのHEAD（${head}）が違います`);
  const licenses = LICENSES.map(([from, to]) => {
    const path = join(repoDir, from);
    if (!existsSync(path)) throw new ImportError(`kamoku の ${from} がありません`);
    return [to, readFileSync(path)];
  });
  const meta = JSON.parse(readFileSync(join(dayDir, 'meta.json'), 'utf8'));
  const html = injectIndex(readFileSync(join(buildDir, 'index.html'), 'utf8'), meta);
  /* 先に別の場所へ全部書き、そろってから前の生成物と入れ替える。途中で失敗しても、前の生成物は残る */
  const staging = mkdtempSync(join(dayDir, '.import-'));
  try {
    for (const path of files) {
      if (path === 'index.html') continue;
      mkdirSync(dirname(join(staging, path)), { recursive: true });
      cpSync(join(buildDir, path), join(staging, path));
    }
    writeFileSync(join(staging, 'index.html'), html);
    for (const [name, data] of licenses) writeFileSync(join(staging, name), data);
    for (const name of GENERATED) {
      rmSync(join(dayDir, name), { recursive: true, force: true });
      if (existsSync(join(staging, name))) renameSync(join(staging, name), join(dayDir, name));
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  return { commit: info.commit, files: files.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [buildDir, repoDir] = process.argv.slice(2);
  if (!buildDir || !repoDir) {
    console.error('使い方: node day-100-kamoku/tools/import-build.mjs <組み立て結果> <組み立てた kamoku の作業フォルダ>');
    process.exit(2);
  }
  try {
    const dayDir = fileURLToPath(new URL('..', import.meta.url));
    const result = importBuild({ buildDir: resolve(buildDir), repoDir: resolve(repoDir), dayDir });
    console.log(`取り込みました: ${result.files} ファイル（kamoku ${result.commit.slice(0, 12)}）`);
    console.log('続けて npm run shared:sync と npm run build を実行してください');
  } catch (error) {
    if (!(error instanceof ImportError)) throw error;
    console.error(`✖ ${error.message}`);
    process.exit(1);
  }
}
