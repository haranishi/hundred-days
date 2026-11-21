import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnatomy } from '../../lib/anatomy.js';
import { PIECE_IDS, PIECE_PARENT, SPECIES_IDS } from '../../lib/contract.js';
import { createProcedure, knifePose, stateAt } from '../../lib/timeline.js';
import { getProcedure } from '../../lib/procedures/index.js';
import { getSpecies } from '../../lib/species/index.js';
import { fakeAnatomy } from '../fixtures/fake-anatomy.js';

function finite(value, where) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value), where);
  else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) finite(item, where);
  }
}

// カメラ、文章、ラベルは手順ごとに切り替わる。魚の姿勢と形、切り込みは次の始点にも残る。
function persistent({ pieces, incisions, uniforms, pose: { q, p, head, dorsal } }) {
  return { pieces, incisions, uniforms, q, p, head, dorsal };
}

function checkPlayback(id, anatomy) {
  const raw = getProcedure(id), proc = createProcedure(raw, anatomy);
  const firstPass = raw.steps.map((s, i) => Array.from({ length: 11 }, (_, j) => {
    const where = id + '/' + s.id + ' @' + j;
    const state = stateAt(proc, i, j / 10);
    finite(state, where);
    assert.ok(Math.abs(Math.hypot(...state.pose.q) - 1) < 1e-8, where);
    for (const u of Object.values(state.uniforms)) assert.ok(u >= 0 && u <= 1, where);
    assert.deepEqual(stateAt(proc, i, j / 10), state, where);
    return state;
  }));
  const seeking = createProcedure(raw, anatomy);
  for (let i = 1; i < firstPass.length; i++) {
    assert.deepEqual(persistent(firstPass[i][0]), persistent(firstPass[i - 1][10]), raw.steps[i].id);
  }
  // 新しい再生器で先頭と末尾を交互に選び、窓の内部でも終点・始点の両方から飛ぶ。
  const fractions = [10, 0, 9, 1, 8, 2, 7, 3, 6, 4, 5];
  for (let n = 0; n < firstPass.length; n++) {
    const i = n % 2 === 0 ? firstPass.length - 1 - n / 2 : (n - 1) / 2;
    for (const j of fractions) assert.deepEqual(stateAt(seeking, i, j / 10), firstPass[i][j], raw.steps[i].id);
  }
  // 順序を既知のカーブ自体と突き合わせる。表面のうろこ・皮の線はもともと尾から始まる。
  raw.steps.forEach((s, i) => {
    for (const c of s.cuts ?? []) {
      const { points } = anatomy.curve(c.curve, c.side);
      for (const end of [0, 1]) {
        const blade = stateAt(proc, i, c.window[end]).knife;
        assert.deepEqual([blade.curve, blade.side, blade.tool], [c.curve, c.side, c.tool], s.id);
        const target = (end === 0) !== c.reverse ? points[0] : points.at(-1);
        assert.ok(Math.hypot(...blade.pos.map((v, j) => v - target[j])) < 1e-8, id + '/' + s.id + '/' + c.id);
      }
    }
  });
}

function checkPieces(id) {
  const raw = getProcedure(id), proc = createProcedure(raw, fakeAnatomy);
  const hidden = new Set();
  raw.steps.forEach((s, i) => {
    for (const m of s.moves ?? []) {
      const before = stateAt(proc, i, m.window[0]).pieces;
      for (let piece = m.piece; piece; piece = PIECE_PARENT[piece]) {
        assert.ok(!hidden.has(piece) && before[piece].visible && before[piece].opacity > 0, s.id + '/' + piece);
      }
    }
    const after = stateAt(proc, i, 1).pieces;
    for (const piece of PIECE_IDS) {
      if (hidden.has(piece)) assert.equal(after[piece].visible, false, s.id);
      if (!after[piece].visible) {
        assert.equal(after[piece].opacity, 0, s.id);
        hidden.add(piece);
      }
    }
  });
  assert.deepEqual([...hidden].sort(), ['kidney', 'pinbones.L', 'pinbones.R', 'viscera']);
  const { pieces, uniforms } = stateAt(proc, raw.steps.length - 1, 1);
  const moved = p => pieces[p].move.some(x => Math.abs(x) > 1e-8);
  const opened = id === 'iwashi' || id === 'kisu';
  const quartered = id === 'hirame' || id === 'katsuo';
  assert.ok(moved('head'));
  assert.equal(moved('bone'), opened);
  for (const side of ['L', 'R']) {
    assert.ok(moved(side + '.strip'));
    assert.equal(moved('skin.' + side), !opened);
    assert.equal(moved(side + '.dorsal'), !opened);
    assert.equal(moved(side + '.ventral'), quartered);
    if (opened) {
      const rotation = pieces[side + '.dorsal'].rot;
      assert.equal(rotation.pivot, id === 'iwashi' ? 'dorsalHinge' : 'ventralHinge');
      assert.ok(Math.abs(rotation.deg) >= 75 && Math.abs(rotation.deg) <= 100);
    }
  }
  if (opened) assert.equal(pieces['L.dorsal'].rot.deg, -pieces['R.dorsal'].rot.deg);
  assert.equal(uniforms.scale, 0);
  assert.equal(uniforms.xray, 0);
  assert.equal(uniforms.slitOpen, 0);
}

for (const id of SPECIES_IDS) {
  test(id + 'の全手順で11時点の往復・飛び越し・切りの両端が一致します', () => checkPlayback(id, fakeAnatomy));
  test(id + 'では表示中の部品を動かし、料理に応じた身・皮・骨が最後に残ります', () => checkPieces(id));
}
test('アジの実際の解剖でも全手順を往復し、刃の出入りを確認できます', () => {
  checkPlayback('aji', createAnatomy(getSpecies('aji')));
});

test('アジの刃は逆引きを含む全ての切りで、実際の線の弧長に沿って連続的に進みます', () => {
  const anatomy = createAnatomy(getSpecies('aji'));
  for (const c of getProcedure('aji').steps.flatMap(s => s.cuts ?? [])) {
    const { points } = anatomy.curve(c.curve, c.side);
    const lengths = points.slice(1).map((p, i) => Math.hypot(...p.map((v, j) => v - points[i][j])));
    const total = lengths.reduce((sum, len) => sum + len, 0);
    let previous;
    for (let n = 0; n <= 100; n++) {
      const t = n / 100, blade = knifePose(anatomy, c, t);
      let remaining = total * (c.reverse ? 1 - t : t), segment = 0;
      while (segment < lengths.length - 1 && remaining > lengths[segment]) remaining -= lengths[segment++];
      const a = points[segment], b = points[segment + 1], fraction = remaining / lengths[segment];
      const expected = a.map((v, j) => v + (b[j] - v) * fraction);
      assert.ok(Math.hypot(...blade.pos.map((v, j) => v - expected[j])) < 1e-8, c.curve);
      assert.ok(Math.abs(Math.hypot(...blade.quat) - 1) < 1e-8, c.curve);
      if (previous) {
        const cosine = blade.quat.reduce((dot, component, j) => dot + component * previous[j], 0);
        assert.ok(Math.abs(cosine) > 0.93, c.curve);
      }
      previous = blade.quat;
    }
  }
});
