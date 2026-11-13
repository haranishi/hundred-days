/**
 * 丸ゴシック（Zen Maru Gothic・SIL OFL 1.1）を、このアプリで使う文字だけに絞って2ファイル（500・700）にする。
 * 理由：@fontsource の分割版は460ファイル・9.5MBになり、100日のサイトにもオフライン用の事前保存にも重い。
 * 元の書体は .cache/fonts/ に置く（取得：Google Fonts の github.com/google/fonts の ofl/zenmarugothic/）。
 * 使う文字は src/・index.html の文字列＋ひらがな・カタカナ全部＋記号。足りない文字は publish:check が見つける。
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const cache = join(root, '.cache/fonts');
const outDir = join(root, 'src/ui/fonts');
const SHA = {
  'ZenMaruGothic-Medium.ttf': '3cfdb98a13571ede17fcc769f5093a97c38b80a7b9b2ab754a26b4d822092b3b',
  'ZenMaruGothic-Bold.ttf': 'fe24426b9c8b5523a0146a8235c8674eccf0493af354a53ec895c3596d9eb745',
};

export function usedChars() {
  const set = new Set();
  const add = (text) => { for (const c of text) if (c.codePointAt(0) > 0x7e) set.add(c); };
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== 'fonts') walk(p); }
      else if (/\.(ts|tsx|css|html)$/.test(name)) add(readFileSync(p, 'utf8'));
    }
  };
  walk(join(root, 'src'));
  add(readFileSync(join(root, 'index.html'), 'utf8'));
  for (let c = 0x3041; c <= 0x3096; c++) set.add(String.fromCodePoint(c)); // ひらがな
  for (let c = 0x30a1; c <= 0x30fc; c++) set.add(String.fromCodePoint(c)); // カタカナ・長音
  for (const c of '、。・「」『』（）！？〜…ー：；０１２３４５６７８９％＋－×÷＝') set.add(c);
  // 絵文字・制御文字は書体に無いので外す（端末の書体に任せる）
  return [...set].filter((c) => !/\p{Extended_Pictographic}|[️‍]/u.test(c)).sort().join('');
}

if (process.argv[1] && process.argv[1].endsWith('subset-font.mjs')) {
  const chars = usedChars();
  const ascii = Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCharCode(0x20 + i)).join('');
  writeFileSync(join(outDir, 'chars.txt'), chars + '\n');
  for (const [file, weight] of [['ZenMaruGothic-Medium.ttf', 500], ['ZenMaruGothic-Bold.ttf', 700]]) {
    const src = join(cache, file);
    if (!existsSync(src)) throw new Error(`${src} がありません（google/fonts の ofl/zenmarugothic/ から取得）`);
    const sha = createHash('sha256').update(readFileSync(src)).digest('hex');
    if (sha !== SHA[file]) throw new Error(`${file} の SHA-256 が記録と違います: ${sha}`);
    const textFile = join(cache, 'subset-text.txt');
    writeFileSync(textFile, ascii + chars);
    execFileSync('pyftsubset', [src, `--text-file=${textFile}`, '--flavor=woff2', '--layout-features=*',
      `--output-file=${join(outDir, `zen-maru-gothic-${weight}.woff2`)}`], { stdio: 'inherit' });
  }
  copyFileSync(join(cache, 'OFL.txt'), join(outDir, 'OFL.txt'));
  console.log(`文字数 ${chars.length}（ASCII を除く）で2ファイルを作りました`);
}
