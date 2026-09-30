// 同梱する2書体を、画面に出る字だけに絞って woff2 にする（fonts/*.woff2）。
// 外の書体配信（Google Fonts）を読まないのは、アプリ配下のCSP（font-src 'self'・style-src 'self'）で止まるのと、
// 「外への通信なし」の方針に合わせるため。
//
//   1. 元の TTF を tools/cache/ に置く（リポジトリには入れていない。入手先は下の SOURCES）
//   2. node day-053-kotoba-tsuji/tools/subset-fonts.mjs
//
// pyftsubset（fonttools・brotli）が要る。字の一覧は tools/font-chars.mjs が作る。
// どちらの書体も OFL.txt に Reserved Font Name の指定が無い（2026-09-30 確認）ので、絞った版も元の名前のまま置いている。
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_DIR, CHARS_FILE, collectChars } from './font-chars.mjs';

// google/fonts の ofl/shipporiminchob1/・ofl/zenkakugothicnew/（2026-09-30 取得・コミット 23e54b51ddff）
const SOURCES = [
  { ttf: 'ShipporiMinchoB1-Medium.ttf', out: 'ShipporiMinchoB1-Medium-subset.woff2' },
  { ttf: 'ShipporiMinchoB1-Bold.ttf', out: 'ShipporiMinchoB1-Bold-subset.woff2' },
  { ttf: 'ShipporiMinchoB1-ExtraBold.ttf', out: 'ShipporiMinchoB1-ExtraBold-subset.woff2' },
  { ttf: 'ZenKakuGothicNew-Medium.ttf', out: 'ZenKakuGothicNew-Medium-subset.woff2' },
  { ttf: 'ZenKakuGothicNew-Bold.ttf', out: 'ZenKakuGothicNew-Bold-subset.woff2' },
];

const cache = join(APP_DIR, 'tools', 'cache');
const fonts = join(APP_DIR, 'fonts');

const missing = SOURCES.filter(({ ttf }) => !existsSync(join(cache, ttf)));
if (missing.length) {
  console.error(`tools/cache/ に元の書体がありません: ${missing.map(({ ttf }) => ttf).join(', ')}`);
  process.exit(1);
}

const chars = collectChars();
writeFileSync(CHARS_FILE, `${chars}\n`);
console.log(`fonts/chars.txt: ${[...chars].length}字`);

for (const { ttf, out } of SOURCES) {
  const target = join(fonts, out);
  execFileSync('pyftsubset', [
    join(cache, ttf),
    `--text-file=${CHARS_FILE}`,
    // 字形の機能は pyftsubset の既定のまま（ブラウザが既定で使う ccmp・liga・kern・mark と、縦書きの vert・vrt2・vpal）。
    // 縦書きは題字・朱印・番付で使う。'*' で全部残すと異体字（aalt・jp78・jp83 など）まで入って約6%重くなる
    // 著作権とライセンスの記載（name の 0・13・14）を残す
    '--name-IDs=*',
    '--flavor=woff2',
    `--output-file=${target}`,
  ], { stdio: 'inherit' });
  console.log(`fonts/${out}: ${Math.round(statSync(target).size / 1024)}KB`);
}
