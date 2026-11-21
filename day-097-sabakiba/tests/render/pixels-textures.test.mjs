import test from 'node:test';
import assert from 'node:assert/strict';
import aji from '../../lib/species/aji.js';
import {
  hexToRgb, srgbToLinear, linearToSrgb, createBuffer, drawDisc, drawPolyline, hashPixels, toDataTexture,
} from '../../lib/pixels.js';
import { generateSkinPixels, createSkinTexture, lateralLineRatio } from '../../lib/textures-skin.js';
import { generateFleshPixels, createFleshTexture, generateProfileData, createProfileTexture } from '../../lib/textures-flesh.js';

test('pixels: 色変換の往復と描画プリミティブが決定的に動く', () => {
  assert.deepEqual(hexToRgb('#00ff80').map((v) => Math.round(v * 255)), [0, 255, 128]);
  assert.deepEqual(hexToRgb('#fff').map((v) => Math.round(v * 255)), [255, 255, 255]);
  for (const x of [0, 0.02, 0.25, 0.5, 0.85, 1]) {
    assert.ok(Math.abs(linearToSrgb(srgbToLinear(x)) - x) < 1e-6);
  }
  const a = createBuffer(32, 16, [20, 30, 40, 255]);
  const b = createBuffer(32, 16, [20, 30, 40, 255]);
  drawDisc(a, 0.5, 0.0, 0.15, 0.15, [1, 0.2, 0.1], 0.8, 0.4, { wrapV: true });
  drawDisc(b, 0.5, 0.0, 0.15, 0.15, [1, 0.2, 0.1], 0.8, 0.4, { wrapV: true });
  drawPolyline(a, [[0.1, 0.95], [0.9, 0.05]], 0.05, [0.9, 0.9, 0.9], 0.7, { wrapV: true });
  drawPolyline(b, [[0.1, 0.95], [0.9, 0.05]], 0.05, [0.9, 0.9, 0.9], 0.7, { wrapV: true });
  assert.equal(hashPixels(a.data), hashPixels(b.data));
  assert.ok(a.data instanceof Uint8ClampedArray);
  // wrapV=true により v=0 付近の描画が下端・上端の両方に反映される
  const topPx = a.data[(0 * 32 + 16) * 4];
  const botPx = a.data[(15 * 32 + 16) * 4];
  assert.ok(topPx > 80 && botPx > 80);
  const tex = toDataTexture(a);
  assert.equal(tex.isDataTexture, true);
  assert.equal(tex.image.width, 32);
  assert.equal(tex.image.height, 16);
  tex.dispose();
});

test('textures-skin: 同じ入力で画素ハッシュが完全一致し、カウンターシェードと模様が反映される', () => {
  const r1 = generateSkinPixels(aji, { width: 128, height: 64, quality: 'standard' });
  const r2 = generateSkinPixels(aji, { width: 128, height: 64, quality: 'standard' });
  assert.equal(r1.hash, r2.hash);
  assert.deepEqual(r1.data, r2.data);

  // 背(v=0.25)は暗く、腹(v=0.75)は明るく、体側(v=0)はその中間
  const lumAt = (res, u, v) => {
    const ix = Math.floor(u * res.width);
    const iy = Math.floor(v * res.height);
    const i = (iy * res.width + ix) * 4;
    return 0.2126 * res.data[i] + 0.7152 * res.data[i + 1] + 0.0722 * res.data[i + 2];
  };
  const backLum = lumAt(r1, 0.5, 0.25);
  const flankLum = lumAt(r1, 0.5, 0.02);
  const bellyLum = lumAt(r1, 0.5, 0.75);
  assert.ok(backLum < flankLum, `背(${backLum}) < 体側(${flankLum})`);
  assert.ok(flankLum < bellyLum, `体側(${flankLum}) < 腹(${bellyLum})`);

  // 平たい魚は有眼側(v=0)と無眼側(v=0.5)で明度差が出る
  const flatSp = {
    id: 'hirame', family: 'flat', sizeCm: { typical: 45 },
    look: {
      colors: { dorsal: '#5A4C3A', flank: '#75644E', belly: '#F2F0EC', fin: '#5E503E', iris: '#B89A58' },
      patterns: ['camoSpots'], flesh: 'white',
    },
  };
  const flatRes = generateSkinPixels(flatSp, { width: 128, height: 64, quality: 'standard' });
  assert.ok(lumAt(flatRes, 0.5, 0.0) < lumAt(flatRes, 0.5, 0.5));
  assert.notEqual(flatRes.hash, r1.hash);

  // 全種向け模様キーワードで落ちずにハッシュが変化する
  const patSp = {
    ...aji,
    look: { ...aji.look, patterns: ['opercleSpot', 'dots', 'wavyStripes', 'bellyStripes', 'blueSpots', 'yellowJaw'] },
  };
  const patRes = generateSkinPixels(patSp, { width: 128, height: 64, quality: 'light' });
  assert.notEqual(patRes.hash, r1.hash);

  const skinTex = createSkinTexture(aji, { width: 128, height: 64, quality: 'standard' });
  assert.equal(skinTex.hash, r1.hash);
  assert.equal(skinTex.texture.isDataTexture, true);
  skinTex.texture.dispose();
  assert.ok(Number.isFinite(lateralLineRatio(aji, 0.6)));
});

test('textures-flesh と断面LUT: 決定的で有限な値が生成される', () => {
  const f1 = generateFleshPixels({ size: 64, quality: 'standard' });
  const f2 = generateFleshPixels({ size: 64, quality: 'standard' });
  assert.equal(f1.hash, f2.hash);
  assert.deepEqual(f1.data, f2.data);

  const fTex = createFleshTexture({ size: 64, quality: 'light' });
  assert.equal(fTex.texture.isDataTexture, true);
  fTex.texture.dispose();

  const pAji = generateProfileData(aji);
  assert.equal(pAji.width, 64);
  assert.equal(pAji.height, 2);
  assert.equal(pAji.data.length, 64 * 2 * 4);
  assert.ok(pAji.data.every(Number.isFinite));
  assert.equal(pAji.meta.hasLateralScutes, true);
  // 後半(s≈0.75)のぜいごマスクは正
  const scuteAt75 = pAji.data[(64 + 48) * 4 + 2];
  assert.ok(scuteAt75 > 0.5);

  const pNoScute = generateProfileData({ id: 'saba', sizeCm: { typical: 34 }, scutes: { count: 0 } });
  assert.equal(pNoScute.meta.hasLateralScutes, false);
  assert.equal(pNoScute.data[(64 + 48) * 4 + 2], 0);

  const pTex = createProfileTexture(aji);
  assert.equal(pTex.texture.isDataTexture, true);
  pTex.texture.dispose();
});
