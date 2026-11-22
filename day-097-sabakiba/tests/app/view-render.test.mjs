import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewer, createFrameLoop } from '../../lib/view3d.js';
import { captureFrame } from '../../lib/capture.js';

test('描画は1系列で動き、非表示・コンテキスト喪失・明示停止を区別して復帰する', () => {
  const doc = new EventTarget(), pending = new Map(), deltas = [];
  let next = 0, pauses = 0;
  const host = {
    requestAnimationFrame(f) { pending.set(next, f); return next++; },
    cancelAnimationFrame(id) { pending.delete(id); },
  };
  const loop = createFrameLoop({ host, doc, frame: (dt, now, ms) => deltas.push([dt, ms]), onPause: () => pauses++ });
  function tick(now) {
    assert.equal(pending.size, 1);
    const [[id, frame]] = pending;
    pending.delete(id); frame(now);
  }
  const hidden = (value) => { doc.hidden = value; doc.dispatchEvent(new Event('visibilitychange')); };
  loop.start(); loop.start();
  tick(20); tick(36); tick(1036);
  assert.deepEqual(deltas, [[0, 0], [0.016, 16], [0.1, 1000]]);
  hidden(true); assert.equal(pending.size, 0);
  hidden(false); tick(20000); assert.deepEqual(deltas.at(-1), [0, 0]);
  loop.setAvailable(false); hidden(false); assert.equal(pending.size, 0);
  loop.setAvailable(true); tick(30000); assert.deepEqual(deltas.at(-1), [0, 0]);
  hidden(true); loop.stop(); hidden(false); assert.equal(pending.size, 0);
  loop.start(); tick(40000); loop.dispose(); hidden(false); loop.start();
  assert.equal(pending.size, 0); assert.ok(pauses >= 3);
});

test('WebGL2の取得が失敗したら日本語のErrorを返す。通常のバッファを保持しない', () => {
  for (const fail of [() => null, () => { throw new Error('初期化の失敗'); }]) {
    const requests = [];
    const canvas = { getContext(type, args) { requests.push([type, args]); return fail(); } };
    assert.throws(() => createViewer({ container: { ownerDocument: { createElement: () => canvas } } }), /3D表示を開始できません/);
    assert.equal(requests.length, 1); assert.equal(requests[0][0], 'webgl2');
    assert.equal(requests[0][1].preserveDrawingBuffer, false);
  }
});

test('撮影は描き直した同じタスクの画素をPNGに渡し、並行撮影でも描画先を復元する', async () => {
  const previous = {}, log = [];
  let target = previous, count = 0;
  const renderer = { getRenderTarget: () => target, getActiveCubeFace: () => 2, getActiveMipmapLevel: () => 1,
    setRenderTarget(value, face, level) { target = value; if (value) log.push([face, level]); },
    render() { assert.equal(target, null); count++; },
    domElement: { width: 390, height: 455, toBlob(callback, type) {
      assert.equal(target, null); assert.equal(type, 'image/png');
      const shot = new Blob([String(count)], { type });
      queueMicrotask(() => callback(shot));
    } } };
  const a = captureFrame({ renderer }), b = captureFrame({ renderer });
  assert.equal(target, previous);
  assert.deepEqual(log, [[2, 1], [2, 1]]);
  assert.equal(await (await a).text(), '1'); assert.equal(await (await b).text(), '2');
  renderer.domElement.toBlob = (cb) => cb(null);
  await assert.rejects(captureFrame({ renderer }), /画像を書き出せません/);
  renderer.render = () => { throw new Error('描画中断'); };
  await assert.rejects(captureFrame({ renderer }), /描画中断/);
  assert.equal(target, previous);
});
