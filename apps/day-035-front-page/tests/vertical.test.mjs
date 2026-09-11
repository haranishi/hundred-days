import test from 'node:test';
import assert from 'node:assert/strict';
import { toCells, totalAdvance, placeCell, flowColumns, layoutVertical } from '../lib/vertical.js';

const kinds = (text) => toCells(text).map((cell) => cell.kind);
const texts = (glyphs) => glyphs.map((g) => g.text).join('');
// 句読点はマスの中心から右上へずれるので、列は「近さ」で拾う
const inColumn = (glyphs, x) => glyphs.filter((g) => Math.abs(g.x - x) < 10);

test('toCells: 倒す文字・寄せる文字・小書きを見分ける', () => {
  assert.deepEqual(kinds('あー、っA'), ['normal', 'rotate', 'punct', 'small', 'rotate']);
});

test('toCells: 2桁の数字は1マスにまとめる（縦中横）', () => {
  const cells = toCells('16時57分');
  assert.deepEqual(cells.map((c) => c.text), ['16', '時', '57', '分']);
  assert.equal(cells[0].kind, 'tatechuyoko');
});

test('toCells: 1桁の数字は正立させる', () => {
  const [cell] = toCells('1');
  assert.equal(cell.kind, 'normal');
  assert.ok(cell.sizeScale > 0.8);
});

test('toCells: 3〜4桁は小さくして1マスに入れる', () => {
  const [cell] = toCells('201');
  assert.equal(cell.kind, 'tatechuyoko');
  assert.ok(cell.sizeScale < 0.5);
});

test('toCells: 5桁以上は1字ずつ倒す', () => {
  assert.deepEqual(toCells('123456').map((c) => c.text), ['1', '2', '3', '4', '5', '6']);
});

test('toCells: ラテン文字は全角より送りを詰める', () => {
  const [cell] = toCells('A');
  assert.ok(cell.advance < 1);
  assert.ok(cell.sizeScale < 1);
});

test('totalAdvance: マスの総量を合計する', () => {
  assert.equal(totalAdvance(toCells('あい')), 2);
  assert.ok(totalAdvance(toCells('AB')) < 2);
});

test('placeCell: 句点はマスの右上に寄る', () => {
  const glyph = placeCell({ text: '。', kind: 'punct' }, 100, 100, 20);
  assert.ok(glyph.x > 100);
  assert.ok(glyph.y < 100);
});

test('placeCell: 倒す文字は90度回る', () => {
  assert.equal(placeCell({ text: 'ー', kind: 'rotate' }, 0, 0, 20).rotate, 90);
  assert.equal(placeCell({ text: 'あ', kind: 'normal' }, 0, 0, 20).rotate, 0);
});

test('flowColumns: 列の高さぶんだけ流して、次の列へ送る', () => {
  const columns = [{ x: 100, top: 0, height: 60 }, { x: 60, top: 0, height: 200 }];
  const { glyphs, rest } = flowColumns(toCells('あいうえおかきくけこ'), columns, { size: 20 });
  assert.equal(texts(glyphs.filter((g) => g.x === 100)), 'あいう');
  assert.equal(texts(glyphs.filter((g) => g.x === 60)), 'えおかきくけこ');
  assert.equal(rest.length, 0);
});

test('flowColumns: 行頭に句点が来るときは前の行から追い出す', () => {
  const columns = [{ x: 100, top: 0, height: 60 }, { x: 60, top: 0, height: 200 }];
  const { glyphs } = flowColumns(toCells('あいう。えお'), columns, { size: 20 });
  assert.equal(texts(inColumn(glyphs, 100)), 'あい');
  assert.ok(texts(inColumn(glyphs, 60)).startsWith('う。'));
});

test('flowColumns: 行末に始め括弧を残さない', () => {
  const columns = [{ x: 100, top: 0, height: 60 }, { x: 60, top: 0, height: 200 }];
  const { glyphs } = flowColumns(toCells('あい「うえお'), columns, { size: 20 });
  assert.equal(texts(glyphs.filter((g) => g.x === 100)), 'あい');
});

test('flowColumns: 入り切らないぶんは rest で返し、末尾を…にする', () => {
  const columns = [{ x: 0, top: 0, height: 40 }];
  const { glyphs, rest } = flowColumns(toCells('あいうえお'), columns, { size: 20, ellipsis: true });
  assert.equal(rest.length, 3);
  assert.equal(glyphs.at(-1).text, '…');
});

test('flowColumns: 列の頭の空白は詰める', () => {
  const columns = [{ x: 0, top: 0, height: 40 }, { x: -40, top: 0, height: 100 }];
  const { glyphs } = flowColumns(toCells('あい うえ'), columns, { size: 20 });
  assert.equal(glyphs.filter((g) => g.x === -40)[0].text, 'う');
});

test('flowColumns: 文字は上から順に置かれる', () => {
  const { glyphs } = flowColumns(toCells('あいう'), [{ x: 0, top: 100, height: 200 }], { size: 20 });
  assert.ok(glyphs[0].y < glyphs[1].y);
  assert.ok(glyphs[1].y < glyphs[2].y);
});

test('layoutVertical: 行数ぶんの幅を返す', () => {
  const one = layoutVertical('短い', { right: 500, top: 0, height: 400, size: 40, maxLines: 2 });
  const two = layoutVertical('あ'.repeat(20), { right: 500, top: 0, height: 400, size: 40, maxLines: 2 });
  assert.ok(two.width > one.width);
});

test('layoutVertical: 2行目は1行目の左に来る', () => {
  const { glyphs } = layoutVertical('あ'.repeat(12), { right: 500, top: 0, height: 200, size: 40, maxLines: 2 });
  const xs = [...new Set(glyphs.map((g) => g.x))];
  assert.equal(xs.length, 2);
  assert.ok(xs[1] < xs[0]);
});
