import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModel } from '../lib/model.js';
import { MODELS } from '../lib/models/index.js';

const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const distance = (a, b) => Math.hypot(...sub(a, b));
const along = (a, d, t) => a.map((x, i) => x + d[i] * t);

function triangleDistance(p, [a, b, c]) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const aa = dot(ab, ab), bb = dot(ac, ac), abac = dot(ab, ac);
  const det = aa * bb - abac * abac;
  // Project onto the face; outside it (or for a degenerate face), use the edges.
  if (det > 1e-20) {
    const u = (bb * dot(ap, ab) - abac * dot(ap, ac)) / det;
    const v = (aa * dot(ap, ac) - abac * dot(ap, ab)) / det;
    if (u >= 0 && v >= 0 && u + v <= 1) {
      return distance(p, along(along(a, ab, u), ac, v));
    }
  }
  return Math.min(...[[a, b], [b, c], [c, a]].map(([s, e]) => {
    const d = sub(e, s), length2 = dot(d, d);
    const t = length2 ? Math.max(0, Math.min(1, dot(sub(p, s), d) / length2)) : 0;
    return distance(p, along(s, d, t));
  }));
}

// Guide lines are drawn on the sheet's own plane. The viewer lifts stacked layers by paper.layerGap x rank for
// display only (explode 1), which the lines deliberately ignore, so the pose is measured without that lift
// (explode 0). What this guards is overshoot: a flip or fold line used to run out past a long, thin shape by
// its whole bounding radius (the paper plane's step 6 by 0.25, the crane's step 6 valley lines by 0.79).
test('every guide endpoint lies on the paper at the start of its step', () => {
  const failures = [];
  for (const def of MODELS) {
    const model = buildModel(def);
    for (let i = 0; i < model.steps.length; i++) {
      const frame = model.frame(i, 0, { explode: 0 });
      const positions = frame.positions.slice(0, frame.triCount * 9);
      const triangles = [];
      for (let k = 0; k < positions.length; k += 9) {
        triangles.push([0, 3, 6].map(j => Array.from(positions.slice(k + j, k + j + 3))));
      }
      for (const [j, g] of model.steps[i].guides.entries()) {
        const distances = g.line.map(p => {
          let nearest = Infinity;
          for (const tri of triangles) nearest = Math.min(nearest, triangleDistance(p, tri));
          return nearest;
        });
        if (!distances.every(d => d <= 1e-4)) {
          failures.push(`${model.name} (${model.id}) step ${i + 1} guide ${j + 1} (${g.kind}): endpoint distances ${distances.map(d => d.toFixed(8)).join(', ')}`);
        }
      }
    }
  }
  assert.deepEqual(failures, [], `Guide endpoints outside the paper:\n${failures.join('\n')}`);
});
