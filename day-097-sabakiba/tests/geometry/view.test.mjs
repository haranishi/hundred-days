import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../../vendor/three.js';
import { buildFishModel, visitPieceMeshes } from '../../lib/pieces.js';
import { previewOptions, preparePreview } from '../../tools/geometry-view.mjs';

test('確認ページはローカルのモジュールから読み込み、画質と角度をURLから受け取ります', () => {
  const html = readFileSync(new URL('../../tools/geometry-view.html',import.meta.url),'utf8');
  assert.deepEqual([...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[0]),
    ['<script type="module" src="./geometry-view.mjs"></script>']);
  const options = previewOptions('?sp=aji&q=light&only=head,bone&explode=1.4&yaw=32&pitch=-10&wire=1&xray=1');
  assert.deepEqual(options, {species:'aji',quality:'light',only:new Set(['head','bone']),explode:1,yaw:32,pitch:-10,wire:true,xray:true});
  assert.equal(previewOptions('?yaw=x&pitch=99').yaw, -8);
  assert.equal(previewOptions('?yaw=x&pitch=99').pitch, 89);
});

test('子だけを表示でき、分解の変位は親子で二重に加算されません', () => {
  const fish = buildFishModel('aji'), a = fish.anatomy;
  const options = previewOptions('?only=L.strip,pinbones.R&explode=0.7&wire=1&xray=1');
  const bounds = preparePreview(fish, options), visible = [];
  fish.group.traverseVisible(m => { if (m.isMesh) visible.push(m); });
  assert.equal(visible.length, 3);
  assert.ok(visible.includes(fish.pieces['pinbones.R'].object));
  assert.ok(fish.materials.skin.transparent && fish.materials.skin.wireframe);
  assert.equal(fish.materials.bone.transparent, false);
  for (const p of Object.values(fish.pieces)) {
    const c = fish.group.userData.centroid;
    const expected = p.pivot.map((v,i) => (v-c[i]) / [0.48,0.13,0.06][i] * 0.7 * 0.29);
    const actual = p.object.getWorldPosition(new THREE.Vector3()).toArray();
    assert.ok(actual.every((v,i) => Math.abs(v-expected[i]) < 1e-8));
  }
  assert.ok(!bounds.isEmpty());
  preparePreview(fish, previewOptions('?explode=0'));
  for (const p of Object.values(fish.pieces)) {
    assert.ok(p.object.position.length() < 1e-10);
    visitPieceMeshes(p.object, m => assert.ok(m.visible));
  }
  const all = preparePreview(fish, previewOptions(''));
  assert.ok(Math.abs(all.max.x-a.TL) < 1e-5 && all.min.x === 0);
  assert.throws(() => preparePreview(fish,previewOptions('only=未登録')), /部品/);
  fish.dispose();
});
