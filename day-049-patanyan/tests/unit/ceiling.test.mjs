import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout } from '../../lib/layout.js';
import { createGame, queueFlap, stepOnce, gameTime, CEIL_PAD } from '../../lib/game.js';
import { hitPole, clampCeiling } from '../../lib/collision.js';
import { PHYS, WORLD } from '../../lib/physics.js';

const R = PHYS.catR;
// 高さ512（PC 1280×720）と624（縦長スマホ 430×932）。この間の端末は天井の高さがこの2つの間に入る
const CASES = [
  [1280, 720, 512],
  [430, 932, 624],
];
const SIZES = [[360, 640], [390, 844], [430, 932], [540, 960], [768, 1024], [1024, 768], [1280, 720], [844, 390]];

// 上向きの勢いが弱まるたびに羽ばたいて、上へ上へと飛ぶ。untilX（世界の x）に着くか墜落したら止める
function climb(g, untilX) {
  let minY = Infinity;
  if (g.phase === 'ready') {
    queueFlap(g, gameTime(g));
    stepOnce(g);
  }
  while (g.phase === 'flying' && WORLD.catX + g.dist < untilX) {
    if (g.cat.vy >= -250) queueFlap(g, gameTime(g));
    stepOnce(g);
    minY = Math.min(minY, g.cat.y);
  }
  return minY;
}

test('天井は画面の上端から耳の先が残るぶん下（CEIL_PAD）。帯の中まで下りてこない（8つの画面幅）', () => {
  for (const [w, h] of SIZES) {
    const L = computeLayout(w, h);
    const g = createGame({ seed: 1, idleBob: 0, skyTop: L.skyTop });
    const minY = climb(g, g.course.poles[0].x - R - 1);
    // 画面の上端から猫の中心までの距離（CSS px）
    const fromTop = L.playY + (L.ceilingY + minY) * L.scale;
    assert.ok(Math.abs(fromTop - CEIL_PAD * L.scale) < 1e-6, `${w}x${h} 上端から ${fromTop}px`);
    assert.ok(L.skyTop <= -L.ceilingY + 1e-9 && L.skyTop < 0, `${w}x${h} 天井が画面の上端より下にある`);
    assert.equal(L.groundY - L.ceilingY, WORLD.bandH, '遊ぶ帯は420のまま');
  }
  const b = { y: -140, vy: -300 };
  assert.equal(clampCeiling(b, R, -131), true);
  assert.deepEqual(b, { y: -122, vy: 0 });
});

test('上に余った空を飛んでも、ポールは上へ続いていて越えられない（高さ512と624）', () => {
  for (const [w, h, H] of CASES) {
    const L = computeLayout(w, h);
    assert.equal(L.H, H);
    for (const seed of [3, 777, 20260924]) {
      const g = createGame({ seed, idleBob: 0, skyTop: L.skyTop });
      const first = g.course.poles[0];
      const minY = climb(g, first.x - R - 1);
      assert.equal(g.phase, 'flying', `H=${H} seed=${seed} 天井で終わらない`);
      assert.equal(minY, L.skyTop + CEIL_PAD, `H=${H} seed=${seed} 耳の先が画面の上端に届く所で止まる`);
      if (H > 560) assert.ok(minY < 0, `H=${H} seed=${seed} 縦長では帯より上の空まで上がれている`);
      // 天井に張り付いたまま進むと、最初のポールの上側に横から当たる
      climb(g, Infinity);
      assert.equal(g.phase, 'crashing');
      assert.equal(g.hit.kind, 'pole');
      assert.equal(g.hit.pole, first.n);
      assert.equal(g.score, 0, `H=${H} seed=${seed} 上を回り込んで点が入った`);
      assert.equal(g.hit.x, first.x, '当たったのはポールの前の縁');
      if (H > 560) assert.ok(g.hit.y < 0, '縦長では、当たったのは帯より上の空');
    }
    // どの高さでも、ポールの前の縁に触れた所とポールの中ほどで必ず当たる（すき間より上に抜け道がない）
    const g = createGame({ seed: 5, skyTop: L.skyTop });
    g.course.ensureUntil(4000);
    for (const p of g.course.poles.slice(0, 20)) {
      for (let y = L.skyTop + R; y <= p.top; y += 0.5) {
        assert.ok(hitPole(p.x - R + 0.01, y, R, p), `H=${H} pole=${p.n} y=${y} 前の縁`);
        assert.ok(hitPole(p.x + p.w / 2, y, R, p), `H=${H} pole=${p.n} y=${y} 中ほど`);
      }
    }
  }
});
