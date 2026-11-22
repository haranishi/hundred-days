import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../../vendor/three.js';
import aji from '../../lib/species/aji.js';
import { buildFishModel } from '../../lib/pieces.js';
import { createMaterials } from '../../lib/materials.js';
import { MAX_INCISIONS, MAX_INCISION_POINTS } from '../../lib/shader-chunks.js';
import { materialsViewOptions, parseCutsQuery, prepareMaterialsPreview } from '../../tools/materials-view.mjs';

const REQUIRED_KINDS = ['skin', 'flesh', 'cap', 'bone', 'organ', 'eye', 'fin', 'kidney'];
const PIECE_EXTRA_KINDS = ['ray', 'iris', 'glint', 'dark', 'stomach', 'liver', 'bladder'];
const REQUIRED_UNIFORMS = [
  'uSL', 'uMaxDepth', 'uHeadLen', 'uCavityEnd',
  'uProfileTex', 'uFleshTex', 'uIncisionTex', 'uIncisionMeta', 'uIncisionSphere', 'uIncisionCount',
  'uScale', 'uScutes', 'uHasScutes', 'uScaleCols', 'uScaleRows', 'uScaleGloss',
  'uXray', 'uSlitOpen', 'uTime', 'uSpeed',
  'uFleshBase', 'uFleshDeep', 'uChiaiColor', 'uChiaiStrength', 'uMyoPitch',
];

test('createMaterials: 全画質で作れ、kinds と uniform が揃い、生成が決定的', () => {
  for (const quality of ['high', 'standard', 'light']) {
    const a = createMaterials({ species: aji, quality, textureSize: 128 });
    const b = createMaterials({ species: aji, quality, textureSize: 128 });

    assert.equal(a.quality, quality);
    assert.equal(a.hashes.skin, b.hashes.skin);
    assert.equal(a.hashes.flesh, b.hashes.flesh);
    assert.deepEqual(a.textures.skin.image.data, b.textures.skin.image.data);

    for (const k of [...REQUIRED_KINDS, ...PIECE_EXTRA_KINDS]) {
      assert.ok(a.kinds[k]?.isMaterial, `${quality}: kinds.${k} が Material でない`);
      assert.equal(a[k], a.kinds[k]);
    }
    if (quality === 'light') {
      assert.equal(a.kinds.skin.isMeshPhysicalMaterial, undefined);
      assert.equal(a.kinds.skin.isMeshStandardMaterial, true);
    } else {
      assert.equal(a.kinds.skin.isMeshPhysicalMaterial, true);
      assert.ok(a.kinds.skin.clearcoat > 0.5);
    }
    for (const u of REQUIRED_UNIFORMS) {
      assert.ok(Object.hasOwn(a.uniforms, u), `${quality}: uniform ${u} が無い`);
    }

    // onBeforeCompile を ShaderLib に対して走らせ、壊れた置換や例外が出ないことを確認
    const baseShader = quality === 'light' ? THREE.ShaderLib.standard : THREE.ShaderLib.physical;
    for (const key of ['skin', 'flesh', 'cap', 'bone', 'organ', 'stomach', 'liver', 'bladder', 'kidney', 'iris', 'fin']) {
      const mat = a.kinds[key];
      const fakeShader = {
        uniforms: {},
        vertexShader: baseShader.vertexShader,
        fragmentShader: baseShader.fragmentShader,
      };
      mat.onBeforeCompile(fakeShader);
      assert.match(fakeShader.vertexShader, /vFlfPos/);
      assert.match(fakeShader.fragmentShader, /vFlfPos/);
      assert.equal(fakeShader.uniforms.uXray, a.uniforms.uXray);
      assert.equal(typeof mat.customProgramCacheKey(), 'string');
    }

    a.dispose();
    b.dispose();
  }
});

test('createMaterials: 既定のテクスチャ予算と不正画質・空データへの耐性', () => {
  const mHigh = createMaterials({ species: aji, quality: 'high' });
  const mStd = createMaterials({ species: aji, quality: 'standard' });
  const mLight = createMaterials({ species: aji, quality: 'light' });
  const mEmpty = createMaterials();
  const mBadQ = createMaterials({ species: {}, quality: 'ultra' });

  assert.equal(mHigh.textures.skin.image.width, 1024);
  assert.equal(mStd.textures.skin.image.width, 512);
  assert.equal(mLight.textures.skin.image.width, 512);
  assert.equal(mEmpty.quality, 'standard');
  assert.equal(mBadQ.quality, 'standard');

  for (const m of [mHigh, mStd, mLight, mEmpty, mBadQ]) m.dispose();
});

test('createMaterials: setScale / setScutes / setXray / setProgress / setSpeed / update が安全に値を収める', () => {
  const m = createMaterials({ species: aji, quality: 'standard', textureSize: 128 });

  m.setScale(0.35);
  assert.equal(m.uniforms.uScale.value, 0.35);
  m.setScale(-5);
  assert.equal(m.uniforms.uScale.value, 0);
  m.setScale(99);
  assert.equal(m.uniforms.uScale.value, 1);
  m.setScale(Number.NaN);
  assert.equal(m.uniforms.uScale.value, 1);

  m.setScutes(0.4);
  assert.equal(m.uniforms.uScutes.value, 0.4);
  m.setProgress('scutes', 0);
  assert.equal(m.uniforms.uScutes.value, 0);
  m.setProgress('slitOpen', 0.8);
  assert.equal(m.uniforms.uSlitOpen.value, 0.8);
  m.setProgress('unknownKey', 0.5);

  assert.equal(m.kinds.skin.transparent, false);
  assert.equal(m.kinds.skin.depthWrite, true);
  m.setXray(1);
  assert.equal(m.uniforms.uXray.value, 1);
  assert.equal(m.kinds.skin.transparent, true);
  assert.equal(m.kinds.skin.depthWrite, false);
  assert.equal(m.kinds.flesh.transparent, true);
  assert.equal(m.kinds.flesh.depthWrite, false);
  assert.equal(m.kinds.bone.transparent, false);
  assert.equal(m.kinds.bone.depthWrite, true);
  m.setXray(0);
  assert.equal(m.kinds.skin.transparent, false);
  assert.equal(m.kinds.skin.depthWrite, true);

  m.setSpeed(2);
  m.update(0.05);
  assert.ok(Math.abs(m.uniforms.uTime.value - 0.1) < 1e-6);
  m.update(5); // 0.1秒で上限クランプ
  assert.ok(Math.abs(m.uniforms.uTime.value - 0.3) < 1e-6);
  m.update(Number.NaN);
  assert.ok(Number.isFinite(m.uniforms.uTime.value));

  m.dispose();
});

test('setIncisions: 上限（12本×32点）を超える入力や不正データで落ちずに再標本化する', () => {
  const m = createMaterials({ species: aji, quality: 'standard', textureSize: 128 });

  // 20本 × 80点（上限超過）＋ 不正エントリ混在
  const hugeList = [];
  for (let i = 0; i < 20; i++) {
    const pts = Array.from({ length: 80 }, (_, j) => [j * 0.25, Math.sin(j * 0.1) + i * 0.1, 0.5]);
    hugeList.push({ points: pts, progress: 0.75, through: i % 2 === 0 });
  }
  m.setIncisions(hugeList);
  assert.equal(m.uniforms.uIncisionCount.value, MAX_INCISIONS);
  assert.equal(m.uniforms.uIncisionMeta.value[0].x, MAX_INCISION_POINTS);
  assert.equal(m.uniforms.uIncisionMeta.value[0].y, 0.75);

  // 80点が32点へ弧長再標本化され、始点(0)から終点(79*0.25)まで u∈[0,1] で収まる
  const buf = m.textures.incisions.image.data;
  assert.ok(buf.every(Number.isFinite));
  assert.equal(buf[0], 0);
  assert.equal(buf[3], 0);
  const lastOff = (MAX_INCISION_POINTS - 1) * 4;
  assert.ok(Math.abs(buf[lastOff] - 79 * 0.25) < 1e-4);
  assert.ok(Math.abs(buf[lastOff + 3] - 1) < 1e-5);

  // 不正値・空・NaN混在でも落ちない
  m.setIncisions(null);
  assert.equal(m.uniforms.uIncisionCount.value, 0);
  m.setIncisions([
    null,
    { points: [[0, 0, 0]], progress: 1 },
    { points: [[Number.NaN, 0, 0], [1, 1, 1]], progress: 1 },
    { points: [[0, 0, 0], [1, 0, 0]], progress: 0 },
    { points: [[0, 0, 0], [2, 0, 0]], progress: 1.8 },
  ]);
  assert.equal(m.uniforms.uIncisionCount.value, 1);
  assert.equal(m.uniforms.uIncisionMeta.value[0].y, 1);

  m.dispose();
});

test('buildFishModel との結合と idempotent な dispose', () => {
  const fish = buildFishModel(aji, {
    quality: 'standard',
    materialFactory: (sp, opts) => createMaterials({ species: sp, ...opts, textureSize: 128 }),
  });
  const mats = fish.materials;
  const released = new Map();
  for (const res of [...new Set(Object.values(mats.kinds)), ...Object.values(mats.textures)]) {
    released.set(res, 0);
    res.addEventListener('dispose', () => released.set(res, released.get(res) + 1));
  }
  fish.dispose();
  fish.dispose();
  for (const [, count] of released) assert.equal(count, 1);
});

test('materials-view: CSP準拠のHTML・クエリ解釈・切り込みと透視の準備', () => {
  const html = readFileSync(new URL('../../tools/materials-view.html', import.meta.url), 'utf8');
  assert.deepEqual(
    [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[0]),
    ['<script type="module" src="./materials-view.mjs"></script>'],
  );

  const opts = materialsViewOptions('?sp=aji&q=high&yaw=20&pitch=-15&zoom=1.5&focus=head&explode=0.4&xray=0.7&scale=0.2&scutes=0.5&cuts=headCut:L:0.6,bellySlit::1');
  assert.equal(opts.species, 'aji');
  assert.equal(opts.quality, 'high');
  assert.equal(opts.yaw, 20);
  assert.equal(opts.pitch, -15);
  assert.equal(opts.zoom, 1.5);
  assert.equal(opts.focus, 'head');
  assert.equal(opts.explode, 0.4);
  assert.equal(opts.xray, 0.7);
  assert.equal(opts.scale, 0.2);
  assert.equal(opts.scutes, 0.5);
  assert.deepEqual(opts.cuts, [
    { name: 'headCut', side: 'L', progress: 0.6, through: false },
    { name: 'bellySlit', side: null, progress: 1, through: false },
  ]);
  assert.deepEqual(parseCutsQuery(''), []);

  const fish = buildFishModel(aji, {
    quality: 'light',
    materialFactory: (sp, o) => createMaterials({ species: sp, ...o, textureSize: 128 }),
  });
  const bounds = prepareMaterialsPreview(fish, opts);
  assert.ok(!bounds.isEmpty());
  assert.equal(fish.materials.uniforms.uIncisionCount.value, 2);
  assert.equal(fish.materials.uniforms.uScale.value, 0.2);
  assert.equal(fish.materials.uniforms.uXray.value, 0.7);
  fish.dispose();
});
