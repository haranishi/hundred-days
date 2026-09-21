import test from 'node:test';
import assert from 'node:assert/strict';
import { DURATION_SECONDS, CAPTIONS, STORYBOARD, sceneAt, captionAt, DEFAULT_FPS } from '../tools/promo/timeline.mjs';
import { parseArgs, detectSwitches, verifySwitches, LOUDNESS_FILTER } from '../tools/promo/render-promo.mjs';
import { synthesizeMusic } from '../tools/promo/promo-audio.mjs';
import { createGame, step, autoInput, snapshot } from '../lib/game.js';
import { mulberry32 } from '../lib/rng.js';
test('30秒の絵コンテと字幕境界が一致し、字幕は16字×2行以内', () => {
  assert.equal(DURATION_SECONDS, 30);
  for (const [i, scene] of STORYBOARD.entries()) {
    assert.equal(scene.start, i ? STORYBOARD[i - 1].end : 0);
    assert.equal(sceneAt(scene.start), scene);
    const c = CAPTIONS[i]; if (!c) continue;
    assert.equal(c.start, scene.start); assert.equal(c.end, scene.end);
    assert.ok(c.lines.length <= 2 && c.lines.every(line => [...line].length <= 16));
    assert.deepEqual(captionAt(c.start), c.lines);
  }
  assert.equal(STORYBOARD.at(-1).end, DURATION_SECONDS);
  assert.deepEqual(captionAt(28), []);
});
test('決定的なカットで1コマ目から発射、回避・2倍・結果が出る', () => {
  let s, rng, previous, fixed = false, fixedStartHeat = 0, fixedMaxHeat = 0;
  const observed = { flinch: false, bonus: false, heat: false, aim: false };
  const advance = ms => { for (let i = 0; i < Math.round(ms / 1000 * 60); i++) s = step(s, 1 / 60, fixed ? { fire: true } : autoInput(s), rng); };
  for (let frame = 0; frame < 30 * DEFAULT_FPS; frame++) {
    const scene = sceneAt(frame / DEFAULT_FPS);
    if (scene.id !== previous) {
      previous = scene.id;
      if (scene.gameFrom !== undefined) { fixed = false; s = createGame('playing'); rng = mulberry32(20260921); advance(scene.gameFrom * 1000); }
      if (scene.fixedFire) { fixed = true; fixedStartHeat = Math.max(...s.heat); }
      if (scene.focus === 'result') advance(180000);
    }
    advance(1000 / DEFAULT_FPS);
    if (!frame) { assert.equal(s.status, 'playing'); assert.ok(s.bullets.length); const { player } = snapshot(s); assert.ok(player.y - 18 >= 0 && player.y + 26 <= 640); assert.ok(137 + player.y + 26 < 793); }
    if (scene.focus === 'heat') { fixedMaxHeat = Math.max(fixedMaxHeat, ...s.heat); observed.heat ||= Math.max(...s.heat) >= .8; }
    if (scene.id === 'S2') observed.flinch ||= Boolean(s.fleet.offset);
    if (scene.focus === 'aim') observed.aim ||= Math.abs(s.predictedX - 264) > 10;
    if (scene.focus === 'bonus') observed.bonus ||= s.floats.some(f => f.text === '裏をかいた ×2');
    if (scene.focus === 'result') assert.equal(s.status, 'over');
  }
  assert.ok(fixedMaxHeat > fixedStartHeat);
  assert.ok(Object.values(observed).every(Boolean), JSON.stringify(observed));
});
test('字幕検査は余計な切替や欠落・時刻ずれを落とす', () => {
  verifySwitches([4, 9, 14, 19, 24, 28]);
  assert.throws(() => verifySwitches([4, 9, 14, 19, 24]));
  assert.throws(() => verifySwitches([4, 9, 14, 20, 24, 28]));
  assert.throws(() => verifySwitches([4, 9, 14, 19, 24, 27, 28]));
  assert.deepEqual(detectSwitches(Buffer.from([0, 0, 100, 100, 0, 0]), 1, 2), [1, 2]);
});
test('CLIはpreviewと相対出力を受け、曖昧な引数を拒否', () => {
  assert.equal(parseArgs(['--preview']).preview, true);
  assert.ok(parseArgs(['--out', 'example.mp4']).out.endsWith('example.mp4'));
  assert.throws(() => parseArgs(['--out'])); assert.throws(() => parseArgs(['--out', 'x.wav']));
});
test('BGMは同じPCM・有限値・無音でなくピーク-6dBFS以下', () => {
  const a = synthesizeMusic({ duration: 1, sampleRate: 8000 });
  assert.deepEqual(a, synthesizeMusic({ duration: 1, sampleRate: 8000 }));
  assert.ok(a.every(Number.isFinite)); assert.ok(a.some(v => v !== 0));
  assert.ok(Math.max(...a.map(Math.abs)) <= 10 ** (-6 / 20) + 1e-12);
});
test('合成時に音量を他のDayと同じ水準へ測り直す', () => {
  assert.equal(LOUDNESS_FILTER, 'loudnorm=I=-17:TP=-1.5:LRA=7');
  const [, target] = LOUDNESS_FILTER.match(/I=(-?[\d.]+)/);
  const [, peak] = LOUDNESS_FILTER.match(/TP=(-?[\d.]+)/);
  assert.ok(Number(target) >= -17.5 && Number(target) <= -16.5);
  assert.ok(Number(peak) <= -1 && Number(peak) >= -2);
});
