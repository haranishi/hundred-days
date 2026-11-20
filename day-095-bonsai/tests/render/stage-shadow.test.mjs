import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from '../../vendor/three.js';
import { SHADOW_TUNE, createStage } from '../../lib/stage.js';

test('影: 壁は 0.35〜0.5 でぼかし、足元は狭い範囲でくっきり', () => {
  assert.ok(SHADOW_TUNE.intensity >= 0.35 && SHADOW_TUNE.intensity <= 0.5);
  assert.ok(SHADOW_TUNE.radius >= 8, 'ぼかし半径が鋭い影のまま');
  assert.ok(SHADOW_TUNE.contactRadius <= 2.5);
  assert.ok(SHADOW_TUNE.contactExtent <= 2.2, '足元の影カメラが壁まで届く');
  const scene = new THREE.Scene();
  const renderer = { toneMappingExposure: 1, shadowMap: { enabled: true, type: THREE.PCFShadowMap } };
  const stage = createStage(THREE, scene, renderer, { gfx: 'high', createCanvas: () => null });
  const sun = scene.getObjectByName('sun');
  const contact = scene.getObjectByName('contact');
  assert.equal(sun.shadow.intensity, SHADOW_TUNE.intensity);
  assert.equal(sun.shadow.radius, SHADOW_TUNE.radius);
  assert.equal(contact.shadow.radius, SHADOW_TUNE.contactRadius);
  assert.ok(contact.shadow.camera.right <= 2.2);
  assert.ok(contact.shadow.camera.right < sun.shadow.camera.right);
  assert.equal(renderer.shadowMap.type, THREE.VSMShadowMap);
  // 濃さを 0.9 に戻す実装は、上の等価で落ちる。ぼかし 1 の実装も radius の下限で落ちる。
  assert.ok(sun.shadow.intensity < contact.shadow.intensity);
  stage.dispose();
  assert.equal(scene.getObjectByName('contact'), undefined);
  assert.equal(scene.getObjectByName('sun'), undefined);
});
