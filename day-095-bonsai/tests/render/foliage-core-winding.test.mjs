import assert from 'node:assert/strict';
import { test } from 'node:test';
import { padCoreGeometry } from '../../lib/foliage.js';

// 独立レビューの指摘：樹冠の芯の三角形が、すべて内向き（頂点法線は外向きなのに、面の頂点順が逆）だった。
// 片面の材質では、カメラに近い側が裏面として除かれ、遠い側の内側だけが見える。
test('樹冠の芯: すべての三角形の表が、頂点法線と同じ外向き', () => {
  const { positions, normals, indices } = padCoreGeometry();
  assert.ok(indices.length >= 3 * 20);
  let outward = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]];
    const p = (i) => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]];
    const [pa, pb, pc] = [p(a), p(b), p(c)];
    const e1 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const e2 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const face = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const n = [0, 1, 2].map((k) => (normals[3 * a + k] + normals[3 * b + k] + normals[3 * c + k]) / 3);
    const dot = face[0] * n[0] + face[1] * n[1] + face[2] * n[2];
    if (dot > 0) outward += 1;
    else assert.fail(`三角形${t / 3} が内向き（面の法線と頂点法線の内積 ${dot.toFixed(5)}）`);
  }
  assert.equal(outward, indices.length / 3);
});
