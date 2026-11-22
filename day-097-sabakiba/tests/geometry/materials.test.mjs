import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.js';
import { makeBasicMaterials } from '../../lib/materials-basic.js';
import { buildFishModel, visitPieceMeshes } from '../../lib/pieces.js';

test('標準材質を単独で作れ、皮は表裏で色が変わります', () => {
  const m = makeBasicMaterials();
  for (const key of ['skin','flesh','bone','organ','cap']) assert.ok(m[key].isMeshStandardMaterial);
  assert.equal(m.skin.side, THREE.DoubleSide);
  assert.equal(m.skin.color.getHexString(), 'b8c7cc');
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  m.skin.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /gl_FrontFacing/);
  Object.values(m).forEach(mat => mat.dispose());
});

test('材質を一度で差し替え、共有材質と各形状を一度だけ解放します', () => {
  const species = { id: 'aji', sizeCm: {typical: 21} }, seen = [], released = new Map();
  function watch(resource) {
    if (released.has(resource)) return;
    released.set(resource, 0);
    resource.addEventListener('dispose', () => released.set(resource, released.get(resource) + 1));
  }
  const fish = buildFishModel(species, { quality: 'light', materialFactory(sp, options) {
    seen.push([sp,options]);
    const m = makeBasicMaterials(sp);
    Object.values(m).forEach(watch);
    return m;
  }});
  assert.equal(seen.length, 1);
  assert.equal(seen[0][0], species);
  assert.equal(seen[0][1].quality, 'light');
  for (const piece of Object.values(fish.pieces)) visitPieceMeshes(piece.object, mesh => watch(mesh.geometry));
  fish.dispose(); fish.dispose();
  assert.ok([...released.values()].every(n => n === 1));
});
