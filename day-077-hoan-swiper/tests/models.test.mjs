import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Vector3 } from '../vendor/three.module.js';
import { ITEMS } from '../lib/items.js';
import { createItemModel } from '../lib/models.js';

test('全36品目は有限サイズの3Dモデルと切替可能なX線内部構造を持つ', () => {
  assert.equal(ITEMS.length, 36);
  for (const item of ITEMS) {
    const model = createItemModel(item);
    assert.equal(model.userData.icon, item.icon, item.id);
    const size = new Box3().setFromObject(model).getSize(new Vector3());
    assert.ok([size.x, size.y, size.z].every(v => Number.isFinite(v) && v > 0 && v < 3), item.id);
    const [shell, inside] = model.children;
    assert.ok(shell.children.length > 0, item.id);
    assert.ok(inside.children.length > 0, item.id);
    assert.equal(inside.visible, false);
    model.userData.setXray(true);
    assert.equal(inside.visible, true);
    model.userData.setXray(false);
    assert.equal(inside.visible, false);
    model.userData.dispose();
  }
});

test('品目の切替で生成した3Dリソースは解放できる', () => {
  const model = createItemModel(ITEMS[0]);
  const geometries = new Set();
  const materials = new Set();
  model.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) materials.add(node.material);
  });
  let releasedGeometry = 0;
  let releasedMaterial = 0;
  for (const geometry of geometries) geometry.addEventListener('dispose', () => releasedGeometry++);
  for (const material of materials) material.addEventListener('dispose', () => releasedMaterial++);
  model.userData.dispose();
  assert.equal(releasedGeometry, geometries.size);
  assert.equal(releasedMaterial, materials.size);
});
