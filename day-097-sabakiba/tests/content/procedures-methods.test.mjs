import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from '../../vendor/three.js';
import { getProcedure } from '../../lib/procedures/index.js';
import { SPECIES_META } from '../../lib/species/meta.js';
import { SPECIES_IDS } from '../../lib/contract.js';
import { createProcedure, stateAt } from '../../lib/timeline.js';
import { fakeAnatomy } from '../fixtures/fake-anatomy.js';

const sides = ['L', 'R'];
const firstMove = (steps, piece) => steps.findIndex(s => s.moves?.some(m => m.piece === piece && m.move));
const hasCut = (step, curve, side) => step.cuts?.some(c => c.curve === curve && (side === undefined || c.side === side));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, a + ' と ' + b);

// 魚の座標で表した向きを、動いた片身の上で盤の座標に写す。
function boardDirection(frame, side, direction) {
  const { rot } = frame.pieces[side + '.dorsal'];
  return new Vector3(...direction)
    .applyQuaternion(new Quaternion().fromArray(frame.pose.q))
    .applyAxisAngle(new Vector3(...rot.axis), rot.deg * Math.PI / 180);
}
const skinNormalY = (frame, side) => boardDirection(frame, side, [0, 0, side === 'L' ? 1 : -1]).y;

test('下処理は手元から見える面、腹骨と小骨は身の面、皮引きは用途に合う面で行います', () => {
  for (const id of SPECIES_IDS) {
    const raw = getProcedure(id), proc = createProcedure(raw, fakeAnatomy);
    raw.steps.forEach((s, i) => {
      for (const c of s.cuts ?? []) {
        let expected;
        if (['headCut', 'scaleSweep', 'scuteRow', 'ventralCut', 'dorsalCut'].includes(c.curve)) expected = 1;
        if (['pinBoneLine', 'ribStrip', 'chiaiTrim'].includes(c.curve)) expected = -1;
        if (c.curve === 'skinPeel') expected = c.tool === 'thumb' ? 1 : -1;
        if (expected === undefined) continue;
        const frame = stateAt(proc, i, (c.window[0] + c.window[1]) / 2);
        assert.ok(expected * skinNormalY(frame, c.side) > 0.99, id + '/' + s.id + '/' + c.id);
      }
    });
  }
});

test('アジの二枚の頭と腹は、それぞれに道具が触れる時点で手順の置き方と一致します', () => {
  const raw = getProcedure('aji'), proc = createProcedure(raw, fakeAnatomy);
  // 盤では頭が左なら x は負、腹が手前なら z は正。二枚の加工順で検査する。
  for (const [number, headX, bellyZ] of [[12, [-1, 1], [1, 1]], [13, [-1, 1], [1, 1]], [14, [-1, -1], [-1, 1]]]) {
    const { cuts } = raw.steps[number - 1];
    assert.equal(cuts.length, 2);
    cuts.forEach((cut, i) => {
      const frame = stateAt(proc, number - 1, (cut.window[0] + cut.window[1]) / 2);
      assert.ok(headX[i] * boardDirection(frame, cut.side, [-1, 0, 0]).x > 0.99, cut.id);
      assert.ok(bellyZ[i] * boardDirection(frame, cut.side, [0, -1, 0]).z > 0.99, cut.id);
    });
  }
});

test('三枚おろしと節取りは両縁を先に開き、尾から頭へ骨をたどってから魚体に比例した距離だけ片身を動かします', () => {
  const reference = getProcedure('aji').steps;
  for (const id of ['aji', 'saba', 'sanma', 'tai', 'katsuo']) {
    const { steps } = getProcedure(id);
    assert.ok(firstMove(steps, 'R.dorsal') < firstMove(steps, 'L.dorsal'));
    for (const side of sides) {
      const i = firstMove(steps, side + '.dorsal');
      const cuts = steps[i].cuts, separation = cuts.find(c => c.curve === 'boneCut' && c.side === side);
      assert.ok(separation?.through && separation.reverse);
      const earlier = [...steps.slice(0, i).flatMap(s => s.cuts ?? []), ...cuts.filter(c => c.window[1] <= separation.window[0])];
      for (const curve of ['ventralCut', 'dorsalCut']) assert.ok(earlier.some(c => c.curve === curve && c.side === side));
      const shift = steps[i].moves.find(m => m.piece === side + '.dorsal' && m.move);
      assert.ok(shift.window[0] >= Math.max(...cuts.map(c => c.window[1])));
      const original = reference[firstMove(reference, side + '.dorsal')].moves.find(m => m.piece === side + '.dorsal');
      const k = SPECIES_META[id].sizeCm.typical / SPECIES_META.aji.sizeCm.typical;
      shift.move.forEach((v, axis) => near(v, original.move[axis] * k));
    }
  }
});

test('イワシは首とわたを手で外し、背の皮を軸に開いてから中骨を持ち上げます', () => {
  const { steps } = getProcedure('iwashi');
  const neck = firstMove(steps, 'head'), finger = steps.findIndex(s => hasCut(s, 'handOpen'));
  const hinge = steps.findIndex(s => s.moves?.some(m => m.rot?.about === 'dorsalHinge'));
  const lift = steps.findIndex(s => hasCut(s, 'boneLift'));
  assert.ok(neck > 0 && neck < finger && finger < hinge && hinge < lift);
  assert.ok(steps[neck].moves.some(m => m.piece === 'viscera' && m.visible === false));
  assert.ok(steps[finger].cuts.some(c => c.curve === 'handOpen' && c.tool === 'thumb'));
  assert.ok(steps[lift].moves.some(m => m.piece === 'bone' && m.move[1] > 0));
  for (const side of sides) {
    assert.ok(steps[hinge].moves.some(m => m.piece === side + '.dorsal' && m.rot.axis === 'x' && m.rot.about === 'dorsalHinge'));
  }
  assert.ok(steps[lift + 1].moves.some(m => m.piece === 'bone' && m.move));
  assert.match(steps[lift + 1].done, /尾びれが残/u);
  assert.ok(steps.flatMap(s => s.cuts ?? []).every(c => ['thumb', 'shears', 'tweezers'].includes(c.tool)));
});

test('キスは首からわたを除き、水洗いのあと背から切り、腹の皮を残して尾の骨だけを断ちます', () => {
  const { steps } = getProcedure('kisu');
  const wash = steps.findIndex(s => s.effects?.some(e => e.kind === 'water'));
  const cut = steps.findIndex(s => hasCut(s, 'dorsalOpen'));
  const hinge = steps.findIndex(s => s.moves?.some(m => m.rot?.about === 'ventralHinge'));
  const tail = steps.findIndex(s => hasCut(s, 'tailCut'));
  assert.ok(firstMove(steps, 'viscera') < wash && wash < cut && cut < hinge && hinge < tail);
  assert.equal(firstMove(steps, 'bone'), tail);
  for (const side of sides) assert.ok(steps[hinge].moves.some(m => m.piece === side + '.dorsal' && m.rot.about === 'ventralHinge'));
  assert.ok(!steps.some(s => hasCut(s, 'bellySlit') || s.uniforms?.slitOpen?.to > 0));
  assert.match(steps[tail].done, /尾びれが付いたまま/u);
});

test('ヒラメは黒・白の順に中央から二枚ずつ外し、背身を動かす間は先に分けた腹身がその場に残ります', () => {
  const raw = getProcedure('hirame'), { steps } = raw, proc = createProcedure(raw, fakeAnatomy);
  const middle = side => steps.findIndex(s => hasCut(s, 'lateralSplit', side));
  const last = side => firstMove(steps, side + '.dorsal');
  assert.ok(middle('L') < firstMove(steps, 'L.ventral') && firstMove(steps, 'L.ventral') < last('L'));
  assert.ok(last('L') < middle('R') && middle('R') < firstMove(steps, 'R.ventral') && firstMove(steps, 'R.ventral') < last('R'));
  for (const side of sides) {
    near(skinNormalY(stateAt(proc, middle(side), 1), side), 1);
    assert.ok(steps.slice(last('R') + 1).some(s => hasCut(s, 'engawaCut', side)));
    const i = last(side), interval = steps[i].moves.find(m => m.piece === side + '.dorsal').window;
    const abdominalPosition = u => {
      const { pieces } = stateAt(proc, i, u);
      return pieces[side + '.ventral'].move.map((v, axis) => v + pieces[side + '.dorsal'].move[axis]);
    };
    const start = abdominalPosition(interval[0]);
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const pos = abdominalPosition(interval[0] + (interval[1] - interval[0]) * t);
      pos.forEach((v, j) => near(v, start[j]));
    }
  }
  assert.ok(!steps.flatMap(s => s.moves ?? []).some(m => m.piece.startsWith('engawa.')));
});

test('カツオは肩の硬いうろこを取り、両面を節に分け、血合いを整えた時点では両面に皮が残ります', () => {
  const raw = getProcedure('katsuo'), { steps } = raw, proc = createProcedure(raw, fakeAnatomy);
  assert.ok(!steps.some(s => hasCut(s, 'scaleSweep')));
  for (const side of sides) {
    const division = steps.findIndex(s => hasCut(s, 'lateralSplit', side));
    const trim = steps.findIndex(s => hasCut(s, 'chiaiTrim', side));
    const skin = firstMove(steps, 'skin.' + side);
    assert.ok(firstMove(steps, side + '.dorsal') < division && division < trim && trim < skin);
    assert.ok(steps[division].moves.some(m => m.piece === side + '.ventral' && m.move[2] > 0));
    const pieces = stateAt(proc, trim, 1).pieces;
    assert.ok(!pieces['pinbones.' + side].visible);
    assert.deepEqual(pieces['skin.' + side].move, [0, 0, 0]);
    assert.ok(pieces['skin.' + side].visible);
  }
});
