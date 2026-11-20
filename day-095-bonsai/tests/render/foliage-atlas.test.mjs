import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paintLeafAtlas, pineNeedles } from '../../lib/leaf-atlas.js';

function mockCtx() {
  const calls = [];
  let verts = 0;
  const ctx = {
    calls,
    lineWidth: 1,
    fillStyle: '',
    strokeStyle: '',
    lineCap: '',
    lineJoin: '',
    clearRect() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    beginPath() { calls.push(['begin']); },
    moveTo() { verts = 1; },
    lineTo() { verts += 1; },
    quadraticCurveTo() {},
    closePath() {},
    ellipse(x, y, rx, ry) { calls.push(['ellipse', rx, ry]); },
    arc() {},
    fill() { calls.push(['fill', verts]); verts = 0; },
    stroke() { calls.push(['stroke', ctx.lineWidth]); },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { calls.push(['radial']); return { addColorStop() {} }; },
  };
  return ctx;
}

test('黒松の針: 20〜40本、太さ1〜1.5、長さ幅比12以上、扇ではない', () => {
  for (const size of [64, 160, 256]) {
    const needles = pineNeedles(size);
    assert.ok(needles.length >= 20 && needles.length <= 40, `本数 ${needles.length}`);
    const angs = needles.map((n) => n.ang).sort((a, b) => a - b);
    assert.ok(angs[angs.length - 1] - angs[0] > 5, '扇の開きのまま');
    for (const n of needles) {
      assert.ok(n.width >= 1 && n.width <= 1.5, `太さ ${n.width}`);
      assert.ok(n.len / n.width >= 12, `比 ${n.len / n.width}`);
    }
  }
});

test('黒松の絵: 平たい地を塗らず、針の線は1.5px以下。紅葉は掌状のまま', () => {
  const pine = mockCtx();
  paintLeafAtlas(pine, 256, 256, 'pine', 'leaf');
  const strokes = pine.calls.filter((c) => c[0] === 'stroke');
  assert.ok(strokes.length >= 20 && strokes.length <= 40, `線 ${strokes.length}`);
  for (const stroke of strokes) assert.ok(stroke[1] <= 1.5, `線が太い ${stroke[1]}`);
  const wide = pine.calls.filter((c) => c[0] === 'ellipse' && c[1] > 256 * 0.05);
  assert.equal(wide.length, 0, '平たい房の地が残っている');
  // 針の帯は 12 頂点。星の芯を外すと、遠景で針が消えて点だけになる。
  const hub = pine.calls.filter((c) => c[0] === 'fill' && c[1] >= 18);
  assert.equal(hub.length, 1, '針の束の芯が無い');
  assert.ok(pine.calls.some((c) => c[0] === 'radial'), '芯が平坦な塗りになっている');
  const maple = mockCtx();
  paintLeafAtlas(maple, 256, 256, 'maple', 'leaf');
  const lobes = maple.calls.filter((c) => c[0] === 'ellipse' && c[1] > 20);
  assert.ok(lobes.length > 0, '紅葉の葉が針に置き換わっている');
});
