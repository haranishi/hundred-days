import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockCtx } from './_mock-ctx.mjs';
import { drawCat, PATTERNS } from '../../lib/cat.js';
import { drawNumber, numberWidth } from '../../lib/digits.js';
import { drawScene, catPose } from '../../lib/render.js';
import { drawResultCard, drawOgImage, drawStamp } from '../../lib/card.js';
import { createGame, queueFlap, advanceTo } from '../../lib/game.js';
import { computeLayout } from '../../lib/layout.js';
import { CATS } from '../../lib/cats.js';

test('6柄すべてが定義され、猫えらびの一覧と一致する', () => {
  assert.deepEqual(Object.keys(PATTERNS).sort(), CATS.map((c) => c.id).sort());
});

test('猫の描画：全柄×全姿勢×全表情と影絵で例外もNaNも出ない', () => {
  for (const pattern of Object.keys(PATTERNS)) {
    for (const pose of ['fly', 'sit']) {
      for (const face of ['normal', 'blink', 'happy', 'surprised', 'dizzy', 'grumpy']) {
        for (const silhouette of [false, true]) {
          const ctx = mockCtx();
          drawCat(ctx, { x: 80, y: 200, pattern, pose, face, paw: 0.7, tail: 0.3, angle: 0.2, sx: 1.1, sy: 0.9, t: 1.3, stars: true, puff: true, silhouette });
          assert.equal(ctx.__calls.nonFinite, 0);
          assert.ok(ctx.__calls.fills >= 8, `塗りが少ない ${ctx.__calls.fills}`);
        }
      }
    }
  }
});

test('数字：0〜999まで描けて、桁が増えるほど幅が広い', () => {
  for (let n = 0; n < 1000; n += 37) {
    const ctx = mockCtx();
    drawNumber(ctx, n, 144, 20, 46);
    assert.equal(ctx.__calls.nonFinite, 0);
  }
  assert.ok(numberWidth(100, 46) > numberWidth(10, 46));
  assert.ok(numberWidth(10, 46) > numberWidth(8, 46));
});

test('場面の描画：待機・飛行・墜落・着地のどれでも描ける（画面の大きさ8通り）', () => {
  const sizes = [[360, 640], [390, 844], [430, 932], [540, 960], [768, 1024], [1024, 768], [1280, 720], [844, 390]];
  const g = createGame({ seed: 20260924, idleBob: 4 });
  const phases = [];
  queueFlap(g, 0.2);
  for (let t = 0; t <= 6; t += 0.05) {
    advanceTo(g, t);
    if (!phases.includes(g.phase)) phases.push(g.phase);
    for (const [w, h] of sizes) {
      const ctx = mockCtx();
      drawScene(ctx, computeLayout(w, h), g, { rt: t, a: 0.5, appTime: t, reduced: false, pattern: 'mike', hud: true });
      assert.equal(ctx.__calls.nonFinite, 0);
    }
    const pose = catPose(g, t, 1);
    assert.ok(Number.isFinite(pose.y));
  }
  assert.deepEqual(phases, ['ready', 'flying', 'crashing', 'landed']);
});

test('結果カードとOGP画像：点数・モード・日付・魚・ベストが文字として載る', () => {
  const ctx = mockCtx();
  drawResultCard(ctx, { score: 23, fish: 5, best: 30, isNewBest: true, label: 'きょうのコース 9/24', reached: [10], pattern: 'hachiware', url: 'hundred-days.pages.dev/day-049-patanyan' });
  const text = ctx.__calls.text.join('|');
  for (const want of ['ぱたにゃん', 'きょうのコース 9/24', '本くぐった', '×5', 'ベスト 30', 'NEW', '10本', '100本', 'hundred-days.pages.dev/day-049-patanyan']) {
    assert.ok(text.includes(want), `${want} が無い`);
  }
  assert.equal(ctx.__calls.nonFinite, 0);
  const og = mockCtx();
  drawOgImage(og);
  assert.ok(og.__calls.text.join('|').includes('ぱたにゃん'));
  const st = mockCtx();
  drawStamp(st, 10, 10, 40, false, '50本');
  assert.equal(st.__calls.nonFinite, 0);
});
