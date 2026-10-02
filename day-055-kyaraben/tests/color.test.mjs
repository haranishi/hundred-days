import test from 'node:test';
import assert from 'node:assert/strict';
import { rgbToLab, labToRgb, deltaE, hexToLab, mixHex } from '../lib/color.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} と ${b}`);

test('白は L=100、黒は L=0', () => {
  const white = rgbToLab(255, 255, 255);
  near(white[0], 100, 0.01, 'L');
  near(white[1], 0, 0.01, 'a');
  near(white[2], 0, 0.01, 'b');
  near(rgbToLab(0, 0, 0)[0], 0, 0.01, 'L');
});

test('赤は L53.2・a80.1・b67.2 くらい', () => {
  const [L, a, b] = hexToLab('#FF0000');
  near(L, 53.2, 0.1, 'L');
  near(a, 80.1, 0.1, 'a');
  near(b, 67.2, 0.1, 'b');
});

test('ΔE76 は Lab の中の距離', () => {
  assert.equal(deltaE([50, 0, 0], [53, 4, 0]), 5);
  assert.equal(deltaE([20, 5, 5], [20, 5, 5]), 0);
  assert.ok(deltaE(hexToLab('#FFFFFF'), hexToLab('#000000')) > 99);
});

test('Lab から RGB に戻すと元の色になる', () => {
  for (const rgb of [[255, 216, 61], [20, 20, 20], [244, 143, 177], [30, 136, 229]]) {
    const back = labToRgb(...rgbToLab(...rgb));
    rgb.forEach((v, i) => near(back[i], v, 1, 'RGB'));
  }
  assert.equal(mixHex('#000000', '#FFFFFF', 0.5), '#808080');
});
