import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, queueFlap, stepOnce, gameTime } from '../../lib/game.js';
import { autopilotWants } from '../../lib/autopilot.js';
import { WORLD } from '../../lib/physics.js';
import { gapFor, pitchFor } from '../../lib/difficulty.js';
import { firstPoleX } from '../../lib/course.js';

// 単純な自動操縦で全部くぐれれば、そのコースは本物の物理で届く（構成的な証明）
function fly(g, poles, maxSeconds = 400) {
  const limit = maxSeconds * 120;
  for (let i = 0; i < limit && g.score < poles; i += 1) {
    if (autopilotWants(g)) queueFlap(g, gameTime(g));
    stepOnce(g);
    if (g.phase !== 'flying' && g.phase !== 'ready') break;
  }
  return g;
}

function syntheticCourse(centers) {
  const poles = [];
  let x = firstPoleX();
  centers.forEach((center, i) => {
    const n = 60 + i;
    const gap = gapFor(n);
    if (i > 0) x += pitchFor(n);
    poles.push({ n, x, w: WORLD.poleW, center, gap, top: center - gap / 2, bottom: center + gap / 2, fish: null, passed: false });
  });
  return { seed: 0, poles, ensureUntil() {}, ensureCount() {} };
}

test('生成したコースは、前後のすき間が物理的に届く（300シード×60本を自動操縦で完走）', () => {
  for (let seed = 1; seed <= 300; seed += 1) {
    const g = fly(createGame({ seed: seed * 104729, idleBob: 0 }), 60);
    assert.equal(g.score, 60, `seed=${seed * 104729} で ${g.score} 本目の次に当たった (${g.hit?.kind})`);
  }
});

test('きょうのコース（2026-09-24から100日分）もすべて完走できる', () => {
  let d = new Date(Date.UTC(2026, 8, 24));
  for (let i = 0; i < 100; i += 1) {
    const key = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    const g = fly(createGame({ seed: key, idleBob: 0 }), 80);
    assert.equal(g.score, 80, `${key} で ${g.score} 本`);
    d = new Date(d.getTime() + 86400000);
  }
});

test('最悪の並び（最も狭い106・最も詰めた150・毎回110の上下）でも届く', () => {
  const ladders = [
    [70, 180, 290, 350, 240, 130, 70, 180, 290, 350, 240, 130, 70],
    [350, 240, 130, 70, 180, 290, 350, 240, 130, 70],
    [70, 180, 70, 180, 70, 180, 70, 180, 70, 180],
    [350, 240, 350, 240, 350, 240, 350, 240, 350],
  ];
  for (const centers of ladders) {
    const g = createGame({ seed: 1, idleBob: 0 });
    g.course = syntheticCourse(centers);
    fly(g, centers.length);
    assert.equal(g.score, centers.length, `並び ${centers.join(',')} で ${g.score} 本`);
  }
});

test('届かない並び（差が300）なら同じ操縦は失敗する＝この証明は空振りしていない', () => {
  const g = createGame({ seed: 1, idleBob: 0 });
  g.course = syntheticCourse([350, 60, 350, 60]);
  fly(g, 4);
  assert.ok(g.score < 4);
});

test('60本以降も到達できる（100シード×80本）', () => {
  for (let seed = 1; seed <= 100; seed += 1) {
    const g = fly(createGame({ seed: seed * 104729, idleBob: 0 }), 80);
    assert.equal(g.score, 80, `seed=${seed * 104729} で ${g.score}本`);
  }
});
