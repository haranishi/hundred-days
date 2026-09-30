import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPuzzle, generatePuzzle } from '../lib/generator.js';
import { Game } from '../lib/game.js';
import { ALLOWED, toggleDakuten, toggleHandakuten } from '../lib/kana.js';
import { LEVELS } from '../lib/levels.js';
import { WORDS as REAL } from '../data/words.js';

// 手で組んだ盤（番号：横の一 かがみ／縦の二 みかん／横の三 ぱんだ／縦の四 だんご）。辻は み・ん・だ の3つ
//   か が み ・
//   ・ ・ か ・
//   ・ ぱ ん だ
//   ・ ・ ・ ん
//   ・ ・ ・ ご
const mk = (dir, x, y, answer) => ({ dir, x, y, answer, reading: answer, kanji: answer, clue: `${answer}の問`, tier: 1 });
const PLACEMENTS = [mk('across', 0, 0, 'かがみ'), mk('down', 2, 0, 'みかん'), mk('across', 1, 2, 'ぱんだ'), mk('down', 3, 2, 'だんご')];
const board = (blanks) => buildPuzzle({ level: 1, seed: 'test', placements: PLACEMENTS, blanks });
const MI = { x: 2, y: 0 };
const N = { x: 2, y: 2 };
const DA = { x: 3, y: 2 };
// 手習いの形：空きは だ の1つ（横の三と縦の四の辻）。横の一・縦の二は空きの無い言葉
const ONE = board([DA]);
// 辻を2つ空ける：どちらの空きも、1字で縦横2語が解ける
const TWO = board([MI, DA]);
// 免許皆伝の形：辻をすべて空ける。縦の二と横の三は空きが2つ
const ALL = board([MI, N, DA]);

const types = (events) => events.map((e) => e.type);
const at = (g) => [g.cursor.x, g.cursor.y, g.dir];
const givens = (p) => p.grid.flatMap((row, y) => row.map((ch, x) => ({ x, y, ch }))).filter((c) => c.ch && !p.blanks.some((b) => b.x === c.x && b.y === c.y));
// 空きでないマスが最初の答えのまま locked か
const givensIntact = (g, p) => givens(p).every(({ x, y, ch }) => g.entries[y][x] === ch && g.locked[y][x] && !g.wrong[y][x] && !g.revealed[y][x]);
// 濁る字を「清音＋゛」（ぱ行は「は行＋゜」）に分ける。濁らない字は null
function splitMark(ch) {
  for (const b of ALLOWED) if (toggleDakuten(b) === ch && b !== ch && toggleDakuten(ch) === b) return { base: b, mark: 'dakuten' };
  for (const b of ALLOWED) if (toggleHandakuten(b) === ch && b !== ch) return { base: b, mark: 'handakuten' };
  return null;
}

test('buildPuzzle：v2 の形。blanks は行優先、辻以外を空けた盤は blanksAtCrossingsOnly:false', () => {
  assert.equal(ALL.version, 2);
  assert.deepEqual(ALL.blanks, [MI, N, DA]);
  assert.equal(ALL.blanksAtCrossingsOnly, true);
  assert.deepEqual(board([DA, MI, DA]).blanks, [MI, DA]); // 並べ替えて重なりを除く
  assert.equal(board([{ x: 0, y: 0 }]).blanksAtCrossingsOnly, false);
  assert.throws(() => board([{ x: 0, y: 1 }])); // 字の無いマスは空きにできない
  assert.deepEqual(ONE.grid[2], ['', 'ぱ', 'ん', 'だ']); // grid は空きのマスも答えの字を持つ
});

test('始め：空きでないマスに答えが入って locked、isGiven が真。空きは空、hintsLetters 0、カーソルは最初の空き', () => {
  const g = new Game(ALL);
  assert.ok(givensIntact(g, ALL));
  for (const { x, y } of givens(ALL)) assert.equal(g.isGiven(x, y), true);
  for (const { x, y } of ALL.blanks) {
    assert.deepEqual([g.isGiven(x, y), g.isBlank(x, y), g.entries[y][x], g.locked[y][x]], [false, true, '', false]);
  }
  assert.deepEqual([g.isGiven(0, 1), g.isBlank(0, 1), g.isGiven(-1, 0), g.isGiven(9, 9)], [false, false, false, false]);
  assert.equal(g.hintsLetters, 0);
  assert.deepEqual(at(g), [2, 0, 'across']);
  assert.deepEqual(g.progress(), { solved: 0, total: 4, blanks: 3, left: 3 });
  assert.deepEqual(g.blanksOf('d2'), [MI, N]);
  // 空きが縦の言葉にしかないときは、始まりの向きは縦
  const down = new Game(board([{ x: 2, y: 1 }]));
  assert.deepEqual(at(down), [2, 1, 'down']);
  // 空きの無い言葉は total に数えない
  const one = new Game(ONE);
  assert.deepEqual(one.progress(), { solved: 0, total: 2, blanks: 1, left: 1 });
  assert.deepEqual([one.blanksOf('a1'), one.blanksOf('zz')], [[], []]);
  assert.deepEqual(at(one), [3, 2, 'across']);
});

test('手習いの形：正しい字を1回書けば、縦横2語が解けて crossSolved が1つ、そして complete', () => {
  const g = new Game(ONE);
  const ev = g.input('ダ'); // カタカナも受ける
  assert.deepEqual(ev, [
    { type: 'input', x: 3, y: 2, kana: 'だ' },
    { type: 'wordSolved', id: 'a3' },
    { type: 'wordSolved', id: 'd4' },
    { type: 'crossSolved', ids: ['a3', 'd4'] },
    { type: 'complete', gaveUp: false },
  ]);
  assert.equal(g.isComplete(), true);
  assert.deepEqual(g.progress(), { solved: 2, total: 2, blanks: 1, left: 0 });
  assert.deepEqual([...g.solved], ['a3', 'd4']); // 空きの無い言葉は解けた扱いにしない（藍にしない）
  assert.deepEqual(types(g.input('か')), ['noop']);
});

test('違う字は wordWrong で complete しない。濁る字は input＋゛、ぱ行は input＋゜で complete', () => {
  const g = new Game(ONE);
  assert.deepEqual(types(g.input('た')), ['input', 'wordWrong', 'wordWrong']);
  assert.equal(g.isComplete(), false);
  assert.deepEqual(at(g), [3, 2, 'across']); // ほかに空きが無いので留まる
  assert.equal(g.progress().left, 0); // 間違った字でも、字が入れば left は減る
  assert.deepEqual(g.dakuten(), [
    { type: 'input', x: 3, y: 2, kana: 'だ', mark: 'dakuten' },
    { type: 'wordSolved', id: 'a3' },
    { type: 'wordSolved', id: 'd4' },
    { type: 'crossSolved', ids: ['a3', 'd4'] },
    { type: 'complete', gaveUp: false },
  ]);
  // 同じ間違いは2度知らせない。書き直して正しくなれば解ける
  const h = new Game(ONE);
  h.input('た');
  assert.deepEqual(types(h.input('た')), ['input']);
  assert.deepEqual(types(h.input('だ')).slice(-2), ['crossSolved', 'complete']);
  // ぱ（辻ではない空き。テストのためだけに空ける）
  const k = new Game(board([{ x: 1, y: 2 }]));
  assert.deepEqual(types(k.input('は')), ['input', 'wordWrong']);
  assert.deepEqual(types(k.handakuten()), ['input', 'wordSolved', 'complete']);
});

test('書いたら次の確定していない空きへ（行優先で後ろ、無ければ先頭から）。left は書くたびに減る', () => {
  const g = new Game(ALL);
  assert.deepEqual(g.input('み'), [
    { type: 'input', x: 2, y: 0, kana: 'み' },
    { type: 'wordSolved', id: 'a1' },
    { type: 'move', x: 2, y: 2, dir: 'across', wordId: 'a3' },
  ]);
  assert.equal(g.progress().left, 2);
  assert.deepEqual(types(g.input('ん')), ['input', 'wordSolved', 'move']);
  assert.deepEqual(at(g), [3, 2, 'across']);
  assert.equal(g.progress().left, 1);
  assert.deepEqual(types(g.input('だ')), ['input', 'wordSolved', 'wordSolved', 'crossSolved', 'complete']);
  assert.deepEqual(g.progress(), { solved: 4, total: 4, blanks: 3, left: 0 });
  // 後ろに空きが無ければ先頭へ回る
  const h = new Game(TWO);
  h.select(DA.x, DA.y);
  assert.deepEqual(types(h.input('だ')), ['input', 'wordSolved', 'wordSolved', 'crossSolved', 'move']);
  assert.deepEqual(at(h), [2, 0, 'across']);
  assert.equal(h.progress().left, 1);
  // 間違えた空きは確定しないので、一巡りしてまた止まる
  assert.deepEqual(types(h.input('む')), ['input', 'wordWrong', 'wordWrong']);
  assert.deepEqual(at(h), [2, 0, 'across']);
});

test('left は字の入っていない空きの数：言葉が解けなくても・間違った字でも書くたびに1減り、消すと1増える（autoCheck によらない）', () => {
  for (const autoCheck of [true, false]) {
    const g = new Game(ALL, { autoCheck });
    g.select(N.x, N.y);
    // 縦の二にも横の三にも、まだ空きがある辻：言葉は解けないが left は減る
    assert.deepEqual(types(g.input('ん')), ['input', 'move']);
    assert.equal(g.progress().left, 2, `autoCheck ${autoCheck}`);
    assert.equal(g.locked[2][2], false);
    assert.deepEqual(at(g), [3, 2, 'across']);
    g.input('た'); // 間違った字（だ が正しい）
    assert.equal(g.progress().left, 1, `autoCheck ${autoCheck}`);
    assert.deepEqual(g.erase(), [{ type: 'erase', x: 3, y: 2 }]);
    assert.equal(g.progress().left, 2, `autoCheck ${autoCheck}`);
    g.input('だ');
    assert.equal(g.progress().left, 1, `autoCheck ${autoCheck}`);
    // 字の入った空きを書き直しても left は変わらない
    g.select(DA.x, DA.y);
    if (!autoCheck) {
      g.input('ど');
      assert.equal(g.progress().left, 1);
    }
  }
});

test('1字で2語が同時に解けたときだけ crossSolved。濁点で解けても出る', () => {
  const g = new Game(TWO);
  assert.deepEqual(g.input('み').slice(0, 4), [
    { type: 'input', x: 2, y: 0, kana: 'み' },
    { type: 'wordSolved', id: 'a1' },
    { type: 'wordSolved', id: 'd2' },
    { type: 'crossSolved', ids: ['a1', 'd2'] },
  ]);
  // 次の空きへ移った後も、直前に書いた字に濁点を付けられる
  const h = new Game(TWO);
  h.select(DA.x, DA.y);
  h.input('た');
  assert.deepEqual(at(h), [2, 0, 'across']);
  assert.deepEqual(h.dakuten(), [
    { type: 'input', x: 3, y: 2, kana: 'だ', mark: 'dakuten' },
    { type: 'wordSolved', id: 'a3' },
    { type: 'wordSolved', id: 'd4' },
    { type: 'crossSolved', ids: ['a3', 'd4'] },
  ]);
  assert.deepEqual(at(h), [2, 0, 'across']); // いまの空きはまだ確定していないので留まる
  // 1語だけ解けたときは出ない
  const k = new Game(ALL);
  assert.equal(types(k.input('み')).includes('crossSolved'), false);
});

test('空きでないマスは erase・dakuten・handakuten・check・revealLetter でも変わらない', () => {
  // 空きでないマスに乗るのは、確定していない空きの無い言葉のマスを選んだとき（そのマスに留まる）
  const g = new Game(ALL);
  g.input('み'); // 横の一が解けて、次の空き（ん）へ
  g.select(1, 0); // が
  assert.deepEqual(at(g), [1, 0, 'across']);
  assert.equal(g.isGiven(1, 0), true);
  assert.deepEqual(types(g.erase()), ['noop']);
  assert.deepEqual(types(g.dakuten()), ['noop']);
  assert.deepEqual(types(g.handakuten()), ['noop']);
  g.select(0, 0); // か
  assert.deepEqual(at(g), [0, 0, 'across']);
  assert.deepEqual(types(g.dakuten()), ['noop']);
  assert.deepEqual(g.check(), [{ type: 'check', wrong: 0, empty: 2 }]);
  assert.ok(givensIntact(g, ALL));
  // 言葉に確定していない空きが無ければ、盤の次の空きを明かす
  assert.deepEqual(g.revealLetter().slice(0, 2), [{ type: 'reveal', cells: [N], hints: 1 }, { type: 'wordSolved', id: 'd2' }]);
  assert.equal(g.hintsLetters, 1);
  assert.ok(givensIntact(g, ALL));
  // 間違えた字を書いて吟味しても、印が付くのは空きだけ
  g.select(DA.x, DA.y);
  g.input('た');
  g.select(1, 2); // ぱ → 横の三の確定していない空き（だ）へ
  assert.deepEqual(at(g), [3, 2, 'across']);
  assert.deepEqual(g.check(), [{ type: 'check', wrong: 1, empty: 0 }]);
  assert.deepEqual([g.wrong[2][3], g.wrong[2][1]], [true, false]);
  assert.ok(givensIntact(g, ALL));
  g.giveUp();
  assert.ok(givensIntact(g, ALL));
  // 空きでないマスで助太刀を頼むと、いまの言葉の最初の確定していない空きを明かす
  // （辻の ん に縦の二＝空きの無い言葉で乗り、同じマスのまま向きを入れ替えて横の三へ）
  const h = new Game(ONE);
  h.select(2, 1);
  h.select(2, 2);
  h.toggleDir();
  assert.deepEqual(at(h), [2, 2, 'across']);
  assert.deepEqual(h.revealLetter()[0], { type: 'reveal', cells: [DA], hints: 1 });
  assert.ok(givensIntact(h, ONE));
});

test('空きでないマスを select すると、その言葉（いまの向きを優先）の最初の確定していない空きへ。無ければそのマスで問を読む', () => {
  const g = new Game(ALL);
  g.select(DA.x, DA.y);
  assert.deepEqual(g.select(0, 0), [{ type: 'move', x: 2, y: 0, dir: 'across', wordId: 'a1' }]);
  const h = new Game(ONE);
  // 横の三の ぱ → その言葉の空き だ へ
  h.select(0, 0);
  assert.deepEqual(at(h), [0, 0, 'across']); // 横の一は空きの無い言葉：そのマスで問を読む
  assert.equal(h.currentWord().id, 'a1');
  h.select(1, 2);
  assert.deepEqual(at(h), [3, 2, 'across']);
  // 縦の二（空きの無い言葉）の か → そのマスに置く。辻の ん はいまの向き（縦）を優先して縦の二
  h.select(2, 1);
  assert.deepEqual(at(h), [2, 1, 'down']);
  h.select(2, 2);
  assert.deepEqual(at(h), [2, 2, 'down']);
  assert.equal(h.currentWord().id, 'd2');
  // 同じマスをもう一度押すと向きを入れ替え、横の三の空きへ
  assert.deepEqual(h.select(2, 2), [{ type: 'move', x: 3, y: 2, dir: 'across', wordId: 'a3' }]);
  // 縦横の片方しか無い、空きの無い言葉のマスをもう一度押しても何も起きない
  h.select(0, 0);
  assert.deepEqual(types(h.select(0, 0)), ['noop']);
  // 空きのマスは従来どおり：同じマスで縦横を入れ替える
  h.select(DA.x, DA.y);
  assert.deepEqual(at(h), [3, 2, 'across']);
  h.select(DA.x, DA.y);
  assert.deepEqual(at(h), [3, 2, 'down']);
  assert.deepEqual(types(h.select(0, 1)), ['noop']); // 字の無いマス
});

test('nextWord・selectWord：空きの無い言葉は移動の行き先にならない（問を読むために選ぶことはできる）', () => {
  const g = new Game(ONE);
  assert.equal(g.currentWord().id, 'a3');
  const seen = [];
  for (let i = 0; i < 6; i++) {
    g.nextWord(1);
    seen.push(g.currentWord().id);
  }
  assert.deepEqual(seen, ['d4', 'a3', 'd4', 'a3', 'd4', 'a3']);
  g.nextWord(-1);
  assert.equal(g.currentWord().id, 'd4');
  // 空きの無い言葉を一覧から選ぶと頭のマスへ。そこからの nextWord は空きのある言葉へ
  g.selectWord('d2');
  assert.deepEqual(at(g), [2, 0, 'down']);
  g.nextWord(1);
  assert.deepEqual(at(g), [3, 2, 'across']);
  // 解けていない言葉を優先する
  const h = new Game(ALL);
  h.input('み'); // 横の一が解ける
  h.selectWord('d4');
  h.nextWord(1);
  assert.equal(h.currentWord().id, 'd2'); // a1 は解けているので飛ばす
  assert.deepEqual(at(h), [2, 2, 'down']); // 縦の二の最初の確定していない空き（み は確定済み）
});

test('input が空きでないマスで起きたとき：同じ字なら書かずに進み、違えば語の中の後ろの空き、無ければ盤の次の空きへ書く', () => {
  // 辻の ん に縦の二（空きの無い言葉）で乗り、向きを入れ替えて横の三を頭から打つ：ん は書かずに進み、だ は空きへ
  const onN = () => {
    const g = new Game(ONE);
    g.select(2, 1);
    g.select(2, 2);
    g.toggleDir();
    return g;
  };
  const g = onN();
  assert.deepEqual(at(g), [2, 2, 'across']);
  assert.deepEqual(g.input('ん'), [{ type: 'move', x: 3, y: 2, dir: 'across', wordId: 'a3', skip: true }]);
  assert.deepEqual(types(g.input('だ')), ['input', 'wordSolved', 'wordSolved', 'crossSolved', 'complete']);
  assert.ok(givensIntact(g, ONE));
  // 違う字は、語の中の後ろの書ける空きへ
  assert.deepEqual(onN().input('だ')[0], { type: 'input', x: 3, y: 2, kana: 'だ' });
  // 語の中に書ける空きが無ければ、盤の次の空きへ移って書く（向きは、移った先にいまの向きの言葉があれば保つ）
  const k = new Game(ONE);
  k.select(2, 1); // 縦の二（空きの無い言葉）の か
  assert.deepEqual(k.input('だ'), [
    { type: 'move', x: 3, y: 2, dir: 'down', wordId: 'd4' },
    { type: 'input', x: 3, y: 2, kana: 'だ' },
    { type: 'wordSolved', id: 'a3' },
    { type: 'wordSolved', id: 'd4' },
    { type: 'crossSolved', ids: ['a3', 'd4'] },
    { type: 'complete', gaveUp: false },
  ]);
  // 語の最後のマスで同じ字なら、盤の次の確定していない空きへ
  const m = new Game(ONE);
  m.select(2, 1);
  m.select(2, 2); // ん（縦の二の最後）
  assert.deepEqual(at(m), [2, 2, 'down']);
  assert.deepEqual(m.input('ん'), [{ type: 'move', x: 3, y: 2, dir: 'down', wordId: 'd4' }]);
});

test('erase：いまのマスの字、無ければ直前に書いた字を消す。語の中を遡っては消さない', () => {
  const g = new Game(ALL);
  assert.deepEqual(types(g.input('か')), ['input', 'wordWrong', 'move']); // 横の一が埋まって間違い
  assert.deepEqual(at(g), [2, 2, 'across']);
  assert.deepEqual(g.erase(), [{ type: 'erase', x: 2, y: 0 }]); // 直前に書いた字へ戻って消す
  assert.deepEqual(at(g), [2, 0, 'across']);
  assert.deepEqual(types(g.erase()), ['noop']);
  // いまのマスに字があれば、それを消す
  g.input('む');
  g.select(MI.x, MI.y);
  assert.deepEqual(g.erase(), [{ type: 'erase', x: 2, y: 0 }]);
  // 確定した字は消さない
  g.input('み'); // 横の一が解けて み が確定
  g.select(MI.x, MI.y);
  assert.deepEqual(types(g.erase()), ['noop']);
  // 選び直した後は、字の入っていない空きで「消す」を押しても、同じ言葉の前の空きにある自分の字は消えない
  g.select(N.x, N.y);
  g.input('ぬ'); // 縦の二にも横の三にもまだ空きがあるので確定しない
  g.select(DA.x, DA.y);
  g.toggleDir();
  g.select(DA.x, DA.y); // 横の三の だ（空き）に横向きで
  assert.deepEqual(types(g.erase()), ['noop']);
  assert.equal(g.entries[2][2], 'ぬ');
});

// ---- v2-r3：移動の行き先は「字の入っていない空き」を優先する（体験評価 v2-r2 ①-1） ----

// ①-1 上書きの盤：横の四「み□よ□か□」。□はすべて辻（縦の一・二・三と交わる）
//   ・ し ・ た ・ ぎ
//   ・ め ・ す ・ ゆ
//   み た よ け か う
const OVERWRITE = buildPuzzle({
  level: 3,
  seed: 'r3a',
  placements: [mk('down', 1, 0, 'しめた'), mk('down', 3, 0, 'たすけ'), mk('down', 5, 0, 'ぎゆう'), mk('across', 0, 2, 'みたよけかう')],
  blanks: [{ x: 1, y: 2 }, { x: 3, y: 2 }, { x: 5, y: 2 }],
});
// ①-1 消える盤：横の二「ち□□こぶ」。□は辻（縦の一 いるか・縦の三 らくだ と交わる）。い も辻の空き
//   ・ い ぬ ・ ・
//   ・ る ・ ・ ・
//   ち か ら こ ぶ
//   ・ ・ く ・ ・
//   ・ ・ だ ・ ・
const ERASE = buildPuzzle({
  level: 2,
  seed: 'r3b',
  placements: [mk('across', 1, 0, 'いぬ'), mk('down', 1, 0, 'いるか'), mk('across', 0, 2, 'ちからこぶ'), mk('down', 2, 2, 'らくだ')],
  blanks: [{ x: 1, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 2 }],
});

test('①-1 上書き：自分の字の入った辻があっても、書いてある字を押すと字の入っていない空きへ移り、次の字で上書きしない', () => {
  assert.equal(OVERWRITE.blanksAtCrossingsOnly, true);
  const g = new Game(OVERWRITE);
  assert.deepEqual(at(g), [1, 2, 'across']);
  g.input('あ'); // 最初の辻に（違う字を）入れる → 次の空き辻へ進む
  assert.deepEqual(at(g), [3, 2, 'across']);
  assert.deepEqual(g.select(2, 2), [{ type: 'move', x: 3, y: 2, dir: 'across', wordId: 'a4' }]); // 書いてある字「よ」を押す
  g.input('い');
  assert.equal(g.entries[2][1], 'あ'); // 上書きされない
  assert.equal(g.entries[2][3], 'い');
  assert.deepEqual(at(g), [5, 2, 'across']);
});

test('①-1 消える：書いてある字を押して「消す」を押しても、自分の字は消えない', () => {
  assert.equal(ERASE.blanksAtCrossingsOnly, true);
  const g = new Game(ERASE);
  g.select(1, 2);
  g.input('か'); // 縦の一にも横の二にも、まだ空きがある
  assert.deepEqual(at(g), [2, 2, 'across']);
  assert.equal(g.locked[2][1], false);
  g.select(3, 2); // 書いてある字「こ」を押す → 横の二の字の入っていない空き（ら）へ
  assert.deepEqual(at(g), [2, 2, 'across']);
  assert.deepEqual(g.erase(), [{ type: 'noop', reason: 'empty' }]);
  assert.equal(g.entries[2][1], 'か'); // 消えない
});

test('v2-r3：書いた後・nextWord・selectWord も字の入っていない空きへ。盤に1つも無いときだけ、自分の字の入った空きへ', () => {
  // 書いた後：違う字で埋めた空きは飛ばし、字の入っていない空きへ。全部埋まったら、確定していない空きを巡る
  const g = new Game(OVERWRITE);
  g.input('あ');
  assert.deepEqual(at(g), [3, 2, 'across']);
  g.input('い');
  assert.deepEqual(at(g), [5, 2, 'across']);
  g.input('え'); // 盤に字の入っていない空きが無くなる
  assert.deepEqual(at(g), [1, 2, 'across']);
  // 全部埋まったときは、書いてある字を押すとその言葉の確定していない空きへ（書き直すため）
  g.select(0, 2);
  assert.deepEqual(at(g), [1, 2, 'across']);
  g.select(2, 2);
  assert.deepEqual(at(g), [1, 2, 'across']);
  // nextWord：字の入っていない空きのある言葉へ（違う字で埋まった縦の一は飛ばす）
  const h = new Game(OVERWRITE);
  h.input('あ'); // 縦の一が違う字で埋まる
  assert.equal(h.currentWord().id, 'a4');
  h.nextWord(1);
  assert.deepEqual([h.currentWord().id, ...at(h)], ['d2', 3, 2, 'down']);
  h.nextWord(-1);
  assert.deepEqual([h.currentWord().id, ...at(h)], ['a4', 3, 2, 'across']);
  // selectWord：字の入っていない空きが無い言葉は、最初の書いてある字に置く。そこで打つと盤の次の字の入っていない空きへ
  h.selectWord('d1');
  assert.deepEqual(at(h), [1, 0, 'down']);
  assert.deepEqual(h.input('ね').slice(0, 2), [
    { type: 'move', x: 3, y: 2, dir: 'down', wordId: 'd2' },
    { type: 'input', x: 3, y: 2, kana: 'ね' },
  ]);
  assert.equal(h.entries[2][1], 'あ');
  // 空きでないマスの select で、その言葉に字の入っていない空きが無ければ、そのマスに留まり、打った字は盤の次の空きへ
  const k = new Game(OVERWRITE);
  k.input('あ');
  k.select(1, 1); // 縦の一の め（縦の一の空きは自分の字で埋まっている）
  assert.deepEqual(at(k), [1, 1, 'down']);
  assert.deepEqual(k.input('む').slice(0, 2), [
    { type: 'move', x: 3, y: 2, dir: 'down', wordId: 'd2' },
    { type: 'input', x: 3, y: 2, kana: 'む' },
  ]);
  assert.equal(k.entries[2][1], 'あ');
});

test('check（自動の吟味なし）：埋まっていて間違っている空きに印、字を変えたら消える', () => {
  const g = new Game(ALL, { autoCheck: false });
  assert.deepEqual(types(g.input('む')), ['input', 'move']);
  assert.deepEqual(g.check(), [{ type: 'check', wrong: 1, empty: 2 }]);
  assert.equal(g.checks, 1);
  assert.equal(g.wrong[0][2], true);
  g.select(MI.x, MI.y);
  g.input('み');
  assert.equal(g.wrong[0][2], false);
  assert.deepEqual(g.check(), [{ type: 'check', wrong: 0, empty: 2 }]);
});

test('revealLetter／revealWord：空きだけを明かし、もともと正しくなかった数だけ hintsLetters が増える', () => {
  const g = new Game(ALL);
  g.input('み');
  assert.deepEqual(at(g), [2, 2, 'across']);
  // いまのマスが書ける空きならそこを明かし、次の空きへ
  assert.deepEqual(g.revealLetter(), [
    { type: 'reveal', cells: [N], hints: 1 },
    { type: 'wordSolved', id: 'd2' },
    { type: 'move', x: 3, y: 2, dir: 'across', wordId: 'a3' },
  ]);
  assert.deepEqual([g.locked[2][2], g.revealed[2][2]], [true, true]);
  // もともと正しい字は数えない
  g.input('だ');
  assert.equal(g.isComplete(), true);
  assert.equal(g.hintsLetters, 1);
  // revealWord はいまの言葉の空きを全部。1字で2語が解けても crossSolved は出さない（自分で解いた字ではない）
  const h = new Game(ALL);
  h.select(N.x, N.y);
  assert.deepEqual(h.revealWord(), [
    { type: 'reveal', cells: [N, DA], hints: 2 },
    { type: 'wordSolved', id: 'a3' },
    { type: 'wordSolved', id: 'd4' },
    { type: 'move', x: 2, y: 0, dir: 'across', wordId: 'a1' },
  ]);
  assert.equal(h.hintsLetters, 2);
  assert.deepEqual(types(h.revealWord()), ['reveal', 'wordSolved', 'wordSolved', 'complete']);
  assert.equal(h.hintsLetters, 3);
  // 空きの無い言葉では何もしない
  const k = new Game(ONE);
  k.selectWord('a1');
  assert.deepEqual(k.revealWord(), [{ type: 'noop', reason: 'noBlank' }]);
  assert.equal(k.hintsLetters, 0);
});

test('giveUp：空きを全部明かして complete（gaveUp）。解けた扱いは空きのある言葉だけ', () => {
  const g = new Game(ALL);
  g.input('か'); // 間違い
  assert.deepEqual(g.giveUp(), [{ type: 'complete', gaveUp: true }]);
  assert.deepEqual([g.gaveUp, g.isComplete()], [true, true]);
  assert.deepEqual(g.entries[0], ['か', 'が', 'み', '']);
  assert.deepEqual([g.revealed[0][2], g.revealed[2][2], g.revealed[0][1]], [true, true, false]);
  assert.deepEqual(g.progress(), { solved: 4, total: 4, blanks: 3, left: 0 });
  assert.ok(givensIntact(g, ALL));
  assert.deepEqual(types(g.input('か')), ['noop']);
  const h = new Game(ONE);
  h.giveUp();
  assert.deepEqual([...h.solved].sort(), ['a3', 'd4']);
});

test('時間は tick で進み、終われば止まる', () => {
  const g = new Game(ONE);
  g.tick(1500);
  g.tick(-5);
  g.tick(Number.NaN);
  assert.equal(g.elapsedMs, 1500);
  g.input('だ');
  g.tick(1000);
  assert.equal(g.elapsedMs, 1500);
});

test('autoCheck 無し：途中は知らせず、全部そろえば complete。left は字の入っていない空きの数', () => {
  const g = new Game(ALL, { autoCheck: false });
  assert.deepEqual(types(g.input('み')), ['input', 'move']);
  assert.equal(g.solved.size, 0);
  assert.equal(g.progress().left, 2);
  assert.deepEqual(types(g.input('ん')), ['input', 'move']);
  assert.deepEqual(types(g.input('だ')), ['input', 'complete']);
  assert.deepEqual(g.progress(), { solved: 4, total: 4, blanks: 3, left: 0 });
});

test('move（矢印）：空きでないマスを飛ばし、その向きの同じ行（列）で次の空きへ。空きが無ければ noop', () => {
  const g = new Game(ALL);
  assert.deepEqual(at(g), [2, 0, 'across']);
  assert.deepEqual(g.move(1, 0), [{ type: 'noop', reason: 'edge' }]); // 右は字が無い
  assert.deepEqual(g.move(-1, 0), [{ type: 'noop', reason: 'edge' }]); // 左は が・か（空きでない）だけ
  assert.deepEqual(at(g), [2, 0, 'across']);
  assert.deepEqual(g.move(0, 1), [{ type: 'move', x: 2, y: 2, dir: 'down', wordId: 'd2' }]); // か を飛ばして ん へ
  assert.deepEqual(g.move(1, 0), [{ type: 'move', x: 3, y: 2, dir: 'across', wordId: 'a3' }]);
  assert.deepEqual(types(g.move(0, 1)), ['noop']); // 下は ん・ご（空きでない）だけ
  assert.deepEqual(types(g.move(0, -1)), ['noop']); // 上は字が無い
  g.move(-1, 0);
  assert.deepEqual(at(g), [2, 2, 'across']);
  // 確定した空きにも止まる（解いた言葉の問を読み返せる）
  g.select(MI.x, MI.y);
  g.input('み'); // 横の一が解けて み が確定し、次の空き（ん）へ
  assert.deepEqual(at(g), [2, 2, 'across']);
  g.move(0, -1);
  assert.deepEqual(at(g), [2, 0, 'down']);
  assert.equal(g.locked[0][2], true);
  // 矢印で移った先は必ず空きなので、打った字はそのマスに入る（離れた空きへ飛ばない）
  g.move(0, 1);
  assert.deepEqual(g.input('ん')[0], { type: 'input', x: 2, y: 2, kana: 'ん' });
  // 手習いの形：空きが1つだけなら、どの向きにも動かない
  const h = new Game(ONE);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.deepEqual(types(h.move(dx, dy)), ['noop']);
  assert.deepEqual(at(h), [3, 2, 'across']);
  // 空きでないマスにいるときも、その行（列）の次の空きへ
  h.select(2, 1);
  h.select(2, 2);
  assert.deepEqual(at(h), [2, 2, 'down']);
  assert.deepEqual(h.move(1, 0), [{ type: 'move', x: 3, y: 2, dir: 'across', wordId: 'a3' }]);
  // 斜め・動かない指定は noop
  assert.deepEqual(types(h.move(1, 1)), ['noop']);
  assert.deepEqual(types(h.move(0, 0)), ['noop']);
});

test('toggleDir：縦横の両方があるマスだけ向きを入れ替える', () => {
  const g = new Game(ALL);
  g.toggleDir();
  assert.deepEqual(at(g), [2, 0, 'down']);
  g.toggleDir();
  assert.deepEqual(at(g), [2, 0, 'across']);
  const h = new Game(ONE);
  h.select(0, 0); // か（横の一だけ）
  assert.deepEqual(types(h.toggleDir()), ['noop']);
});

test('serialize → restore で同じ状態。v1 の保存・盤や空きと食い違う保存は捨てて新しい対局', () => {
  const g = new Game(ALL);
  g.input('か'); // 横の一が間違いで埋まる
  g.check();
  g.revealLetter();
  g.tick(4200);
  g.select(DA.x, DA.y);
  g.input('た');
  const data = JSON.parse(JSON.stringify(g.serialize()));
  assert.equal(data.v, 2);
  assert.equal(data.entries.length, 3); // 空きの字だけ。空きでないマスの字は保存しない
  assert.equal(JSON.stringify(data).includes('ぱんだ'), false);
  const r = Game.restore(ALL, data);
  assert.deepEqual(r.serialize(), g.serialize());
  for (const key of ['entries', 'locked', 'revealed', 'wrong', 'cursor', 'dir', 'solved', 'hintsLetters', 'checks', 'gaveUp', 'elapsedMs']) {
    assert.deepEqual(r[key], g[key], key);
  }
  assert.deepEqual(r.progress(), g.progress());
  // 続きを同じに打てば同じイベントが出る（直前に書いた字への濁点も引き継ぐ）
  assert.deepEqual(r.dakuten(), g.dakuten());
  assert.deepEqual(r.input('み'), g.input('み'));

  const fresh = new Game(ALL).serialize();
  assert.deepEqual(Game.restore(ALL, null).serialize(), fresh);
  // v1 の形の保存（盤全体の字を行ごとに持つ）は捨てる
  const v1 = { v: 1, autoCheck: true, entries: ['かがみ.', '..か.', '.ぱんだ', '...ん', '...ご'], locked: ['1110', '0010', '0111', '0001', '0001'], revealed: ['0000', '0000', '0000', '0000', '0000'], wrong: ['0000', '0000', '0000', '0000', '0000'], cursor: { x: 0, y: 0 }, dir: 'across', solved: ['a1'] };
  assert.deepEqual(Game.restore(ALL, v1).serialize(), fresh);
  // 同じ盤でも空きが違う保存・別の盤の保存は捨てる
  assert.deepEqual(Game.restore(ONE, data).serialize(), new Game(ONE).serialize());
  const other = buildPuzzle({ level: 1, seed: 'test', placements: [...PLACEMENTS.slice(0, 3), mk('down', 3, 2, 'だんす')], blanks: [MI, N, DA] });
  assert.deepEqual(Game.restore(other, data).serialize(), new Game(other).serialize());
  // 形の崩れた保存・確定したと言い張る間違いの字は捨てる
  assert.deepEqual(Game.restore(ALL, { ...data, entries: data.entries.slice(1) }).serialize(), fresh);
  assert.deepEqual(Game.restore(ALL, { ...data, locked: '111' }).serialize(), fresh);
  assert.deepEqual(Game.restore(ALL, { ...data, entries: 'みんX' }).serialize(), fresh);
  // autoCheck の設定は保存に残り、restore の第3引数で上書きできる
  assert.equal(Game.restore(ALL, data, { autoCheck: false }).autoCheck, false);
});

// ---- 実際の単語帳で組んだ盤 ----

const SEEDS = Array.from({ length: 500 }, (_, i) => (i * 7919 + 104729).toString(36));

test('real：3つの腕前それぞれ500盤で、始めは空きでないマスに答えが入り isGiven が真、hintsLetters 0、カーソルは空き', () => {
  for (const lv of LEVELS) {
    for (const seed of SEEDS) {
      const p = generatePuzzle({ level: lv.id, seed, words: REAL });
      const g = new Game(p);
      assert.ok(givensIntact(g, p), `${lv.name} ${seed}`);
      for (const { x, y } of givens(p)) assert.equal(g.isGiven(x, y), true);
      for (const { x, y } of p.blanks) assert.deepEqual([g.isGiven(x, y), g.entries[y][x]], [false, '']);
      assert.equal(g.hintsLetters, 0);
      assert.deepEqual(g.cursor, p.blanks[0]);
      assert.deepEqual(g.progress().left, lv.blanks);
    }
  }
});

test('real：手習いは正しい字を input 1回（濁る字なら input＋゛、ぱ行は＋゜）で complete。違う字は wordWrong で complete しない', () => {
  let marked = 0;
  for (const seed of SEEDS) {
    const p = generatePuzzle({ level: 1, seed, words: REAL });
    const [{ x, y }] = p.blanks;
    const answer = p.grid[y][x];
    const g = new Game(p);
    const split = splitMark(answer);
    if (split) {
      marked++;
      const first = g.input(split.base);
      assert.equal(first.at(-1).type, 'wordWrong', `${seed}: ${answer}`);
      const ev = split.mark === 'dakuten' ? g.dakuten() : g.handakuten();
      assert.deepEqual(types(ev), ['input', 'wordSolved', 'wordSolved', 'crossSolved', 'complete'], `${seed}: ${answer}`);
    } else {
      assert.deepEqual(types(g.input(answer)), ['input', 'wordSolved', 'wordSolved', 'crossSolved', 'complete'], `${seed}: ${answer}`);
    }
    assert.equal(g.isComplete(), true);
    // 違う字
    const h = new Game(p);
    const wrongCh = answer === 'あ' ? 'い' : 'あ';
    const ev = h.input(wrongCh);
    assert.ok(ev.some((e) => e.type === 'wordWrong') && !ev.some((e) => e.type === 'complete'), seed);
    assert.equal(h.isComplete(), false);
  }
  assert.ok(marked > 0, '濁る字の空きが1つも無い（テストが効いていない）');
});

test('real：空きを順に埋めれば、どの腕前も解き切れる。left は書くたびに1減って 0 になる', () => {
  for (const lv of LEVELS) {
    for (const seed of SEEDS.slice(0, 100)) {
      const p = generatePuzzle({ level: lv.id, seed, words: REAL });
      const g = new Game(p);
      let events = [];
      let lastLeft = g.progress().left;
      for (let guard = 0; guard < 100 && !g.isComplete(); guard++) {
        const { x, y } = g.cursor;
        assert.equal(g.isBlank(x, y), true, `${lv.name} ${seed}: カーソルが空きにいない`);
        assert.equal(g.entries[y][x], '', `${lv.name} ${seed}: 字の入った空きへ移った`);
        events = g.input(p.grid[y][x]);
        const left = g.progress().left;
        assert.equal(left, lastLeft - 1, `${lv.name} ${seed}: 書いたのに left が1減らない`);
        lastLeft = left;
      }
      assert.equal(events.at(-1).type, 'complete');
      assert.deepEqual(g.progress(), { solved: g.progress().total, total: g.progress().total, blanks: lv.blanks, left: 0 });
      assert.equal(g.hintsLetters, 0);
      assert.ok(givensIntact(g, p));
    }
  }
});
