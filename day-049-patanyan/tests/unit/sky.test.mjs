import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKY_PHASES, skyForScore } from '../../lib/sky.js';
import { blendSky, drawScene } from '../../lib/render.js';
import { drawResultCard } from '../../lib/card.js';
import { createGame } from '../../lib/game.js';
import { computeLayout } from '../../lib/layout.js';
import { mockCtx } from './_mock-ctx.mjs';

test('空は10本ごとに夕方・夜・星空・明け方を繰り返す', () => {
  assert.deepEqual(SKY_PHASES.map((s) => s.id), ['evening', 'night', 'starry', 'dawn']);
  for (let score = 0; score <= 121; score += 1) {
    const phase = skyForScore(score);
    assert.equal(phase, SKY_PHASES[Math.floor(score / 10) % 4]);
    assert.equal(phase.colors.length, 5);
    for (const color of [...phase.colors, phase.cloud, phase.window, phase.pole]) assert.match(color, /^#[0-9a-f]{6}$/);
  }
  assert.equal(skyForScore(-1), SKY_PHASES[0]);
});

test('空の補間は両端を保ち、中間では雲・窓・ポールも変わる', () => {
  for (let i = 0; i < 4; i += 1) {
    const from = SKY_PHASES[i], to = SKY_PHASES[(i + 1) % 4];
    const start = blendSky(from, to, 0), mid = blendSky(from, to, 0.5);
    for (const key of ['colors', 'cloud', 'window', 'pole', 'stars', 'night']) assert.deepEqual(start[key], from[key]);
    assert.deepEqual(blendSky(from, to, 1), to);
    assert.deepEqual(blendSky(from, to, 2), to);
    assert.notDeepEqual(mid.colors, from.colors);
    assert.notDeepEqual(mid.colors, to.colors);
  }
});

test('全時間帯と動きを減らす設定で描画でき、達成表示は0.8秒で消える', () => {
  const g = createGame({ seed: 1 });
  g.phase = 'flying';
  for (const score of [0, 10, 20, 30, 40]) for (const reduced of [false, true]) {
    g.score = score;
    for (const rt of [2, 2.4, 2.801]) {
      const ctx = mockCtx();
      drawScene(ctx, computeLayout(390, 844), g, { rt, appTime: rt, reduced, hud: true, pattern: 'kuro', goalAt: 2, skySince: 2, skyFrom: skyForScore(score - 1) });
      assert.equal(ctx.__calls.nonFinite, 0);
      assert.equal(ctx.__calls.text.includes('目標達成！'), rt < 2.8);
    }
  }
});

test('結果カードは墜落時の空の色を使い、失敗文を載せない', () => {
  for (const sky of SKY_PHASES) {
    const ctx = mockCtx();
    const stops = [];
    ctx.createLinearGradient = () => ({ addColorStop: (at, color) => stops.push(color) });
    drawResultCard(ctx, { sky, score: 0, fish: 0, best: 0, label: 'きょうのコース', reached: [], pattern: 'kuro', url: 'example.test', reason: '地面に落ちた' });
    assert.deepEqual(stops.slice(0, 5), sky.colors);
    assert.equal(ctx.__calls.text.includes('地面に落ちた'), false);
    assert.equal(ctx.__calls.nonFinite, 0);
  }
});

test('通常は1.5秒で補間し、動きを減らす設定では境目から新しい空になる', () => {
  const g = createGame({ seed: 1 });
  g.score = 10;
  for (const reduced of [false, true]) for (const elapsed of [0, 0.75, 1.5]) {
    const ctx = mockCtx();
    const stops = [];
    ctx.createLinearGradient = () => ({ addColorStop: (at, color) => stops.push(color) });
    drawScene(ctx, computeLayout(390, 844), g, {
      rt: 20 + elapsed, appTime: 20 + elapsed, reduced, pattern: 'kuro',
      skySince: 20, skyFrom: SKY_PHASES[0],
    });
    const expected = reduced ? SKY_PHASES[1] : blendSky(SKY_PHASES[0], SKY_PHASES[1], elapsed / 1.5);
    assert.deepEqual(stops.slice(0, 5), expected.colors);
  }
});
