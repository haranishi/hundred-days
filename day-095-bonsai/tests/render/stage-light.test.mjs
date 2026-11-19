// 光の表と写真の帯は、画面なしで契約の数値に固定する。
import assert from 'node:assert/strict';
import test from 'node:test';
import { bandMetrics, photoFrame } from '../../lib/capture.js';
import { LIGHT_PRESETS } from '../../lib/stage.js';

test('光の表: 朝昼夕の方位と強さ、夜は月と提灯', () => {
  assert.equal(LIGHT_PRESETS.morning.az, -35);
  assert.equal(LIGHT_PRESETS.morning.alt, 28);
  assert.equal(LIGHT_PRESETS.morning.intensity, 2.6);
  assert.equal(LIGHT_PRESETS.morning.hemi, 0.9);
  assert.equal(LIGHT_PRESETS.noon.az, -20);
  assert.equal(LIGHT_PRESETS.noon.alt, 52);
  assert.equal(LIGHT_PRESETS.noon.intensity, 3.2);
  assert.equal(LIGHT_PRESETS.noon.exposure, 1);
  assert.equal(LIGHT_PRESETS.evening.az, 60);
  assert.equal(LIGHT_PRESETS.evening.alt, 14);
  assert.equal(LIGHT_PRESETS.evening.intensity, 2.4);
  assert.equal(LIGHT_PRESETS.morning.sky, LIGHT_PRESETS.noon.sky);
  assert.equal(LIGHT_PRESETS.morning.ground, LIGHT_PRESETS.noon.ground);
  assert.equal(LIGHT_PRESETS.night.color, '#8da4d6');
  assert.equal(LIGHT_PRESETS.night.intensity, 0.6);
  assert.equal(LIGHT_PRESETS.night.sky, '#2a3350');
  assert.ok(LIGHT_PRESETS.night.lantern > 0);
  assert.equal(LIGHT_PRESETS.noon.bgTop, '#f3eee3');
});

test('帯: 標準は高さの16%、極端に高い写真は220で頭打ち', () => {
  const photo = bandMetrics(1080, 1350);
  assert.equal(photo.h, Math.round(1350 * 0.16));
  assert.equal(photo.y, 1350 - photo.h);
  assert.equal(bandMetrics(1080, 4000).h, 220);
  // 上限を無視して 16% のまま返す実装は、高さ 4000 で 640 になりここで落ちる。
  assert.ok(bandMetrics(1080, 4000).h < 4000 * 0.16);
});

test('写真の構図: 高い木ほど離れ、注視点は中心より下。距離を固定する実装は落ちる', () => {
  const pose = { az: 20, pol: 72, dist: 8.5, target: [0, 1.5, 0] };
  const aspect = 1080 / 1350;
  const short = photoFrame({ min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] }, pose, 30, aspect);
  const tall = photoFrame({ min: [-0.5, 0, -0.5], max: [0.5, 4, 0.5] }, pose, 30, aspect);
  assert.ok(tall.dist > short.dist + 1);
  assert.ok(tall.target[1] < 2);
  assert.equal(tall.az, pose.az);
  assert.equal(tall.pol, pose.pol);
  assert.ok(short.dist > 0 && Number.isFinite(tall.dist));
});
