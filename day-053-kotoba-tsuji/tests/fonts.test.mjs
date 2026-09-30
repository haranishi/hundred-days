// 同梱の書体（fonts/）：画面に出る字がすべて字の一覧（chars.txt）に入っていること。
// 一覧に無い字は絞った書体に入っていないので、その字だけ端末の書体で出てしまう。
// 問や台詞を足して落ちたら `node day-053-kotoba-tsuji/tools/subset-fonts.mjs` で一覧と書体を作り直す
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { APP_DIR, CHARS_FILE, baseChars, sourceChars, sourceFiles } from '../tools/font-chars.mjs';

const listed = new Set(readFileSync(CHARS_FILE, 'utf8').replace(/\n$/, ''));
const fontsCss = readFileSync(join(APP_DIR, 'fonts', 'fonts.css'), 'utf8');
const faces = [...fontsCss.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => ({
  family: /font-family:\s*"([^"]+)"/.exec(body)?.[1],
  weight: Number(/font-weight:\s*(\d+)/.exec(body)?.[1]),
  file: /url\("\.\/([^"]+)"\)/.exec(body)?.[1],
}));

test('字の出どころのファイルがすべてある（共有欄の文・OGの画像のページも含む）', () => {
  const files = sourceFiles();
  assert.ok(files.some((f) => f.endsWith(join('data', 'words.js'))));
  assert.ok(files.some((f) => f.endsWith(join('shared', 'share.js'))), 'npm run shared:sync を先に');
  for (const f of files) assert.ok(existsSync(f), f);
});

test('画面に出る字（index.html・app.js・app.css・lib・単語帳・共有欄・OGのページ）がすべて一覧に入っている', () => {
  const missing = [...sourceChars()].filter((ch) => !listed.has(ch));
  assert.deepEqual(missing, [], `一覧に無い字: ${missing.join('')}`);
});

test('かな・英数・約物は出どころに無くても一覧に入っている', () => {
  const missing = [...baseChars()].filter((ch) => !listed.has(ch));
  assert.deepEqual(missing, []);
  for (const ch of 'あをんゃゐゑゔ゛゜アヲンヵヶー・、。「」『』（）！？…0aZ') assert.ok(listed.has(ch), ch);
});

test('fonts.css は明朝500・700・800とゴシック500・700の5つだけで、どれも同梱のファイルを指す', () => {
  assert.deepEqual(
    faces.map(({ family, weight }) => `${family} ${weight}`).sort(),
    ['Shippori Mincho B1 500', 'Shippori Mincho B1 700', 'Shippori Mincho B1 800', 'Zen Kaku Gothic New 500', 'Zen Kaku Gothic New 700'],
  );
  for (const { file } of faces) {
    assert.match(file, /\.woff2$/);
    const path = join(APP_DIR, 'fonts', file);
    assert.ok(existsSync(path), file);
    // woff2 の署名（wOF2）で始まり、絞ってあること（元の TTF は明朝で約15MB）
    assert.equal(readFileSync(path).subarray(0, 4).toString('latin1'), 'wOF2', file);
    assert.ok(statSync(path).size < 700 * 1024, `${file} が大きすぎる（絞れていない）`);
  }
});

test('画面で使う太さは同梱の太さにある（app.css・tools/og.html）', () => {
  for (const file of ['app.css', 'tools/og.html']) {
    const src = readFileSync(join(APP_DIR, file), 'utf8');
    const weights = new Set([...src.matchAll(/font-weight:\s*(\d+)/g)].map(([, w]) => Number(w)));
    for (const w of weights) assert.ok([500, 700, 800].includes(w), `${file} の太さ ${w} は同梱していない`);
  }
});

test('書体のライセンス（OFL）を woff2 の隣に置き、index.html と OGのページは同梱の fonts.css を読む', () => {
  for (const name of ['OFL-ShipporiMinchoB1.txt', 'OFL-ZenKakuGothicNew.txt']) {
    const text = readFileSync(join(APP_DIR, 'fonts', name), 'utf8');
    assert.match(text, /SIL OPEN FONT LICENSE Version 1\.1/);
    // Reserved Font Name の指定が無い（あれば絞った版の名前を変える必要がある）
    assert.doesNotMatch(text.split('\n').slice(0, 3).join('\n'), /Reserved Font Name/i);
  }
  assert.match(readFileSync(join(APP_DIR, 'index.html'), 'utf8'), /href="\.\/fonts\/fonts\.css"/);
  assert.match(readFileSync(join(APP_DIR, 'tools', 'og.html'), 'utf8'), /href="\.\.\/fonts\/fonts\.css"/);
});
