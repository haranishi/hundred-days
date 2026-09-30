// 同梱する書体を絞るための字を集める。書き出した一覧（fonts/chars.txt）を tools/subset-fonts.mjs が使い、
// tests/fonts.test.mjs が「画面に出る字がすべて一覧に入っている」ことを確かめる。
//
//   node day-053-kotoba-tsuji/tools/font-chars.mjs          … fonts/chars.txt を書き直す
//
// 注釈（コメント）の字も数に入れている。外すと字は約7%減るが、文字列の中の // を注釈と取り違えて
// 画面に出る字を落とすおそれがあるので、割に合わない（2026-09-30 に数えた：1,627字→1,520字）。
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const APP_DIR = fileURLToPath(new URL('..', import.meta.url));
export const CHARS_FILE = join(APP_DIR, 'fonts', 'chars.txt');

// 画面に出る字の出どころ。フォルダは中の .js をすべて読む。
// shared/share.js は共有欄の文（npm run shared:sync で複製される）、tools/og.html はリンクのカードの画像
export const SOURCES = ['index.html', 'app.js', 'app.css', 'lib', 'data/words.js', 'shared/share.js', 'tools/og.html'];

// 出どころに無くても、あとから足されやすい字はまとめて入れておく（かな・英数・約物）
const RANGES = [
  [0x0020, 0x007e], // 英数と半角の約物
  [0x3000, 0x303f], // 和文の約物（、。「」『』〜〇 など）
  [0x3041, 0x3096], // ひらがな
  [0x3099, 0x309f], // 濁点・半濁点（゛゜）と ゝゞ
  [0x30a0, 0x30ff], // カタカナ・中黒・長音
  [0xff01, 0xff5e], // 全角の英数と約物
];
const EXTRA = '…‥—―‐‘’“”×・→←↑↓⇄';

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

export function sourceFiles(appDir = APP_DIR) {
  return SOURCES.flatMap((name) => {
    const path = join(appDir, name);
    return name.includes('.') ? [path] : listFiles(path);
  });
}

// 改行・タブなどの制御文字は書体に要らないので除く
const drawable = (ch) => ch.codePointAt(0) >= 0x20 && ch !== '\u007f';

export function sourceChars(appDir = APP_DIR) {
  const set = new Set();
  for (const file of sourceFiles(appDir)) {
    for (const ch of readFileSync(file, 'utf8')) if (drawable(ch)) set.add(ch);
  }
  return set;
}

export function baseChars() {
  const set = new Set(EXTRA);
  for (const [from, to] of RANGES) {
    for (let code = from; code <= to; code++) set.add(String.fromCodePoint(code));
  }
  return set;
}

export function collectChars(appDir = APP_DIR) {
  const set = new Set([...baseChars(), ...sourceChars(appDir)]);
  return [...set].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const chars = collectChars();
  // 1行に1字ではなく、そのまま1行に並べる（pyftsubset の --text-file がそのまま読める）
  writeFileSync(CHARS_FILE, `${chars}\n`);
  console.log(`${relative(process.cwd(), CHARS_FILE)}: ${[...chars].length}字`);
}
