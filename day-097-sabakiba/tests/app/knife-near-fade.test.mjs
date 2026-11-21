import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.js';
import { buildKnife, nearFadeAlpha, withKnifeCamera } from '../../lib/knife.js';
import { createCameraRig } from '../../lib/camera.js';
import { createFishDisplay } from '../../lib/scene-fish.js';
import { buildFishModel } from '../../lib/pieces.js';
import { getSpecies } from '../../lib/species/index.js';
import { getProcedure } from '../../lib/procedures/index.js';
import { stateAt } from '../../lib/timeline.js';

test('包丁の不透明度係数は9cmまで0、24cmから1で、その間を滑らかかつ単調に結ぶ', () => {
  for (const depth of [-Infinity, -1, 0, 9, NaN]) assert.equal(nearFadeAlpha(depth), 0);
  for (const depth of [24, 40, Infinity]) assert.equal(nearFadeAlpha(depth), 1);
  for (const [depth, alpha] of [[12.75, 0.15625], [16.5, 0.5], [20.25, 0.84375]]) {
    assert.equal(nearFadeAlpha(depth), alpha);
  }
  let previous = 0;
  for (let depth = 0; depth <= 35; depth += 0.125) {
    const alpha = nearFadeAlpha(depth);
    assert.ok(Number.isFinite(alpha) && previous <= alpha && alpha <= 1);
    previous = alpha;
  }
});

test('3種類の包丁で刃・柄・口金・鋲と材質の複製が同じ視点奥行きで透ける', () => {
  const standard = THREE.ShaderLib.standard;
  assert.match(standard.vertexShader, /vViewPosition\s*=\s*-\s*mvPosition\.xyz/u);
  const plain = new THREE.MeshStandardMaterial();
  for (const tool of ['deba', 'yanagi', 'petty']) {
    const group = buildKnife(tool);
    for (const mesh of group.children) {
      for (const base of [mesh.material].flat()) {
        for (const material of [base, base.clone(), base.clone().clone()]) {
          assert.equal(material.isMeshStandardMaterial, true);
          assert.equal(material.transparent, true);
          assert.equal(material.depthWrite, false);
          assert.equal(material.opacity, mesh.name === 'blade' ? 0.74 : 1);
          assert.equal(material.customProgramCacheKey(), base.customProgramCacheKey());
          assert.notEqual(material.customProgramCacheKey(), plain.customProgramCacheKey());
          const shader = { fragmentShader: standard.fragmentShader, uniforms: {} };
          material.onBeforeCompile(shader);
          assert.equal(shader.uniforms.knifeFadeEnabled.value, true);
          assert.match(shader.fragmentShader, /uniform bool knifeFadeEnabled;/u);
          assert.match(shader.fragmentShader, /if \(knifeFadeEnabled\) diffuseColor\.a\s*\*=\s*smoothstep\(9\.0, 24\.0, vViewPosition\.z\);\s*#include <opaque_fragment>/u);
        }
      }
    }
  }
});

test('アジの手順4の接写では刃も柄も元の不透明度を保ち、手で寄ると手前の柄が透ける', t => {
  const model = buildFishModel(getSpecies('aji'), { quality: 'light' });
  const raw = getProcedure('aji');
  const display = createFishDisplay(model, raw);
  t.after(() => display.dispose());
  const index = raw.steps.findIndex(s => s.id === 'head-first');
  const step = raw.steps[index];
  display.apply(stateAt(display.proc, index, 0.45), step, false, null);
  display.group.updateMatrixWorld(true);
  const deba = display.knife.getObjectByName('deba');
  assert.ok(deba && display.knife.visible);
  const pos = new THREE.Vector3();
  for (const aspect of [360 / 207, 390 / 288, 1]) {
    const { rig } = withKnifeCamera({ rig: createCameraRig({ bounds: display.bounds, aspect }) });
    const framing = { focus: display.focus, headDirection: display.head, zoom: step.camera.zoom };
    rig.applyPreset('cook', framing, { immediate: true });
    for (const mesh of deba.children) {
      assert.ok(mesh.renderOrder > 4 && mesh.renderOrder < 8, mesh.name);
      const vertices = mesh.geometry.attributes.position;
      for (let i = 0; i < vertices.count; i++) {
        pos.fromBufferAttribute(vertices, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(rig.camera.matrixWorldInverse);
        assert.equal(nearFadeAlpha(-pos.z), 1, mesh.name + ' の奥行き ' + -pos.z);
      }
    }
    rig.applyPreset(step.camera.preset, framing, { immediate: true });
    const handle = deba.getObjectByName('handle');
    let nearest = Infinity;
    for (let i = 0; i < handle.geometry.attributes.position.count; i++) {
      pos.fromBufferAttribute(handle.geometry.attributes.position, i).applyMatrix4(handle.matrixWorld).applyMatrix4(rig.camera.matrixWorldInverse);
      nearest = Math.min(nearest, -pos.z);
    }
    // 接写でも魚全体を収める構図なので、柄は24cmより遠く、そのままでは透けない。手で近づけると手前の柄から透ける。
    assert.ok(nearest > 24, '接写の柄の最近点 ' + nearest);
    const blade = deba.getObjectByName('blade');
    const vertices = blade.geometry.attributes.position;
    let tip = 0;
    for (let i = 1; i < vertices.count; i++) if (vertices.getX(i) > vertices.getX(tip)) tip = i;
    pos.fromBufferAttribute(vertices, tip).applyMatrix4(blade.matrixWorld).applyMatrix4(rig.camera.matrixWorldInverse);
    assert.equal(nearFadeAlpha(-pos.z), 1);
    rig.zoomBy(6);
    for (let k = 0; k < 240; k++) rig.update(1 / 60);
    let near = Infinity;
    for (let i = 0; i < handle.geometry.attributes.position.count; i++) {
      pos.fromBufferAttribute(handle.geometry.attributes.position, i).applyMatrix4(handle.matrixWorld).applyMatrix4(rig.camera.matrixWorldInverse);
      near = Math.min(near, -pos.z);
    }
    assert.ok(near < nearest && nearFadeAlpha(near) < 1, '寄ると柄が透け始める ' + near);
  }
});

test('台所の全景は透けず、接写・手動ズーム・復帰は実際の視点に従う', t => {
  const raw = getProcedure('kisu');
  const display = createFishDisplay(buildFishModel(getSpecies('kisu'), { quality: 'light' }), raw);
  t.after(() => display.dispose());
  const index = raw.steps.findIndex(step => step.id === 'scales-right');
  const state = stateAt(display.proc, index, 0.2);
  display.apply(state, raw.steps[index], false, null);
  display.group.updateMatrixWorld(true);
  const source = createCameraRig({ bounds: display.bounds, aspect: 390 / 288, reducedMotion: true });
  const { rig } = withKnifeCamera({ rig: source });
  const framing = { focus: display.focus, headDirection: display.head, zoom: state.camera.zoom };
  rig.applyPreset('cook', framing, { immediate: true });
  const handle = display.knife.getObjectByName(state.knife.tool).getObjectByName('handle');
  const vertices = handle.geometry.attributes.position;
  const point = new THREE.Vector3();
  let nearest = Infinity;
  for (let i = 0; i < vertices.count; i++) {
    point.fromBufferAttribute(vertices, i).applyMatrix4(handle.matrixWorld).applyMatrix4(rig.camera.matrixWorldInverse);
    nearest = Math.min(nearest, -point.z);
  }
  assert.ok(nearFadeAlpha(nearest) > 0);
  const material = handle.material;
  const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader);
  function fades() {
    material.onBeforeRender(null, null, rig.camera);
    return shader.uniforms.knifeFadeEnabled.value;
  }
  assert.equal(fades(), false);
  rig.applyPreset('closeup', framing);
  assert.equal(fades(), true);
  rig.applyPreset('cook', framing);
  source.zoomBy(1.5);
  assert.equal(fades(), true);
  source.reset({ immediate: true });
  assert.equal(fades(), false);
});
