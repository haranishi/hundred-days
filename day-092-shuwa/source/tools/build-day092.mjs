/**
 * 100日チャレンジへの組み込み：node tools/build-day092.mjs <hundred-days の Day のフォルダ>
 * 1) npm run build 済みの dist/ を Day のフォルダへ写す（前回写した物は消してから）
 * 2) 元のコード（tools/day092-files.mjs の一覧）を <Day>/source/ へ写す
 * Day のフォルダにある meta.json・README.md・LICENSE・screenshot.*・og.png・demo.mp4・tools/ は残す（100日側で管理する物）
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_FILES } from './day092-files.mjs';

/* 場所の比べ方。入力の綴りでなく、OS が持つ本当の綴りに直してから比べる。
   既定の realpathSync は大文字小文字を入力のまま返すので、macOS で同じフォルダを別の綴りで渡されると、
   「別の場所」と判定して、自分の source/ を消していた。realpathSync.native は、OS が持つ綴りに直して返す。 */
const real = (path) => realpathSync.native(path);

/* まだ無い出力先は、いちばん近い既存の親だけを正規化し、残りをそのままつなぐ。
   元のコードを指すシンボリックリンクの下の未作成フォルダも、重なりの判定に載る。
   先に resolve() で文字列として畳む（「存在しない/..」などは、ここで畳まれてから、実在の物として OS に解決される） */
function realAllowMissing(path) {
  const rest = [];
  let current = resolve(path);
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    rest.unshift(basename(current));
    current = parent;
  }
  return join(real(current), ...rest);
}

/* 出力先の指定に、途中の「..」（名前のあとの ..）があるか。
   「リンク/..」や「存在しない要素/..」は、文字列で畳んだ先と、OS がたどる先が食い違い得て、どの Day を更新するのか曖昧になる
   （最後の名前がまだ無い指定は、OS に解決させても見抜けない）。判定の細部に頼らず、断る。
   先頭の「..」（<Day>/source から「..」を渡す、ふだんの使い方）は、作業場所が実際の場所なので曖昧にならず、通す */
function hasInteriorDotDot(path) {
  const parts = path.split(/[\\/]+/).filter((part) => part && part !== '.');
  const firstName = parts.findIndex((part) => part !== '..');
  return firstName >= 0 && parts.slice(firstName).includes('..');
}

/* 同じ物か（デバイスと inode）。使うのは「拒否を増やす」側（重なり・名前の衝突）だけ。
   「その場の作り直し」の判定には使わない。広げると、source がリンクのときなどに、元のコードを含む親まで消す */
function sameEntry(a, b) {
  try {
    const x = statSync(a);
    const y = statSync(b);
    return x.dev === y.dev && x.ino === y.ino;
  } catch {
    return false;
  }
}

const root = real(fileURLToPath(new URL('..', import.meta.url)));
if (process.argv[2] && hasInteriorDotDot(process.argv[2])) {
  console.error('出力先の指定に、途中の .. があり、どの Day か曖昧になり得ます。.. は先頭にだけ使うか、.. を含まない形で渡してください');
  process.exit(1);
}
const target = process.argv[2] ? realAllowMissing(process.argv[2]) : undefined;
if (!target || !/^day-092-[\w-]+$/.test(basename(target))) {
  console.error('使い方: node tools/build-day092.mjs <…/hundred-days/day-092-…>');
  process.exit(1);
}
const inPlace = join(target, 'source') === root;
if (!inPlace && (sameEntry(root, target) || root.startsWith(target + sep) || target.startsWith(root + sep))) {
  throw new Error('出力先と元のコードが重なっています');
}
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist がありません。先に npm run build を流してください');
  process.exit(1);
}
// dist がリンクだと、前回の公開物を消したあとで、コピーが失敗する
if (!lstatSync(dist).isDirectory()) {
  console.error('dist がシンボリックリンクです。実際のフォルダにしてから、もう一度流してください');
  process.exit(1);
}
// LICENSE は、リポジトリ直下のMITの写し（scripts/tests/day-license.test.mjs が見張る）。消すと、次の100日のCIが落ちる
const KEEP = new Set(['meta.json', 'README.md', 'LICENSE', 'screenshot.png', 'screenshot.webp', 'og.png', 'demo.mp4', 'tools']);
/* 残す物は、消さないだけでは守れない。dist/ に同じ名前があると、あとの cpSync が上書きする（LICENSE・meta.json・source/ など）。
   名前の大文字小文字の違い（license）に加え、出力先で実際に同じ物を指す綴り（macOS の licenſe など）も、何かを消す前に止める */
const protectedNames = [...KEEP, 'source'];
const reserved = new Set(protectedNames.map((name) => name.toLowerCase()));
const clash = readdirSync(dist).filter(
  (name) => reserved.has(name.toLowerCase()) || protectedNames.some((keep) => sameEntry(join(target, name), join(target, keep))),
);
if (clash.length) {
  console.error(`dist/ に、Day のフォルダで残す名前（${clash.join('・')}）があります。コピーで上書きされるので、先に dist/ から外してください`);
  process.exit(1);
}
if (inPlace) KEEP.add('source');
mkdirSync(target, { recursive: true });
for (const name of readdirSync(target)) if (!KEEP.has(name)) rmSync(join(target, name), { recursive: true, force: true });
cpSync(dist, target, { recursive: true });
for (const rel of inPlace ? [] : await SOURCE_FILES(root)) {
  const to = join(target, 'source', rel);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(join(root, rel), to);
}
console.log(`写しました: ${target}（本体＋source/）`);
