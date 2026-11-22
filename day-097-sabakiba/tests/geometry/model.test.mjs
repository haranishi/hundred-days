import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFishModel, visitPieceMeshes } from '../../lib/pieces.js';
import { PIECE_IDS, PIECE_PARENT } from '../../lib/contract.js';
import { measure, envelopeVolume } from '../../tools/geometry-report.mjs';

const model = quality => buildFishModel('aji', {quality});
const coords = (attr, j) => [attr.getX(j), attr.getY(j), attr.getZ(j)];
const key = p => p.map(x => Math.round(x * 1e6)).join(',');

for (const [quality, budget] of [['light',20000], ['standard',45000], ['high',90000]]) {
  test(`${quality}の部品・向き・体積・辺・頂点属性・三角形予算がそろいます`, () => {
    const fish = model(quality), stats = {};
    assert.deepEqual(Object.keys(fish.pieces), PIECE_IDS);
    for (const [id, piece] of Object.entries(fish.pieces)) {
      assert.equal(piece.object.userData.pieceId, id);
      assert.equal(piece.object.parent, fish.pieces[PIECE_PARENT[id]]?.object ?? fish.group);
      assert.ok(piece.pivot.every(Number.isFinite));
      const m = measure(piece.object);
      assert.equal(m.triangles, piece.triangles);
      assert.equal(m.badAttributes, 0);
      assert.ok(m.normalError < 1e-6, id);
      assert.equal(m.nonmanifold + m.twisted + m.degenerate, 0, id);
      if (id.startsWith('skin.')) assert.ok(m.boundary > 0);
      else {
        assert.ok(m.closed && m.volume > 0, id);
        visitPieceMeshes(piece.object, mesh => assert.ok(measure(mesh).volume > 0, mesh.name));
      }
      for (let j = 0; j < 3; j++) {
        assert.ok(m.min[j] >= fish.anatomy.bounds.min[j] - 1e-5, id);
        assert.ok(m.max[j] <= fish.anatomy.bounds.max[j] + 1e-5, id);
      }
      stats[id] = m;
    }
    const sum = Object.values(stats).reduce((n, s) => n + s.triangles, 0);
    assert.ok(sum <= budget, `${quality}: ${sum} > ${budget}`);
    const solids = Object.values(stats).filter(s => s.closed).reduce((v, s) => v + s.volume, 0);
    const error = solids / envelopeVolume(fish.anatomy) - 1;
    assert.ok(Math.abs(error) < 0.06, `${quality}: 体積差 ${error * 100}%`);
    for (const part of ['dorsal','ventral','strip']) {
      assert.ok(Math.abs(stats['L.' + part].volume / stats['R.' + part].volume - 1) < 0.01);
    }
    assert.equal(stats.head.min[0], 0);
    assert.equal(stats.bone.max[0], fish.anatomy.TL);
    fish.dispose();
  });
}

function faces(geometry, include) {
  const {position, aSeg} = geometry.attributes, index = geometry.index.array, result = new Set();
  for (let j = 0; j < index.length; j += 3) {
    const ids = index.slice(j, j + 3), pts = Array.from(ids, i => coords(position, i));
    if (pts.every((p, i) => include(p, aSeg.getX(ids[i])))) result.add(pts.map(key).sort().join('|'));
  }
  return result;
}

test('左右のH面と腹骨層の合わせ面では、対角線まで同じ三角形が接します', () => {
  const fish = model('standard'), a = fish.anatomy;
  for (const side of ['L','R']) {
    const geo = suffix => fish.pieces[side + suffix].object.children[0].geometry;
    const dorsal = faces(geo('.dorsal'), (_, seg) => seg === 2);
    assert.ok(dorsal.size > 40);
    assert.deepEqual(faces(geo('.ventral'), (_, seg) => seg === 2), dorsal);
    const onBoundary = (p, seg) => {
      if (seg !== 1 || p[0] / a.SL > a.cavityEnd + 1e-7) return false;
      const sec = a.filletSection(p[0] / a.SL, false), d = sec.axisY - p[1];
      return d > sec.roof - 1e-6 && d < sec.floor + 1e-6 && Math.abs(Math.abs(p[2]) - sec.wall(d).boundary) < 2e-6;
    };
    const layer = faces(geo('.strip'), onBoundary), ventral = faces(geo('.ventral'), onBoundary);
    assert.ok(ventral.size > 100);
    for (const face of ventral) assert.ok(layer.has(face), face);
  }
  fish.dispose();
});

test('頭・身・腹骨層の蓋が同じ斜面に乗り、尾柄の蓋も正しい向きを向きます', () => {
  const fish = model('standard'), a = fish.anatomy;
  for (const id of ['head','L.dorsal','R.dorsal','L.ventral','R.ventral','L.strip','R.strip']) {
    const g = fish.pieces[id].object.children[0].geometry, {position, normal, aSeg} = g.attributes;
    let front = 0, back = 0;
    for (let i = 0; i < aSeg.count; i++) if (aSeg.getX(i) === 3) {
      const p = coords(position, i), n = coords(normal, i), head = p[0] < a.SL / 2;
      const plane = a.cutPlane(head ? 'head' : 'tail');
      const dist = plane.normal.reduce((sum, v, k) => sum + v * (p[k] - plane.point[k]), 0);
      assert.ok(Math.abs(dist) < 2e-6, id);
      const agreement = n.reduce((sum, v, k) => sum + v * plane.normal[k], 0);
      assert.ok(agreement * (id === 'head' || !head ? 1 : -1) > 0.99999, id);
      if (head) front++; else back++;
    }
    assert.ok(front > 5);
    if (id.includes('dorsal') || id.includes('ventral')) assert.ok(back > 5);
  }
  fish.dispose();
});
