import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.js';
import { createFishScene } from '../../lib/scene-fish.js';
import { createCameraRig } from '../../lib/camera.js';
import { curveOwner } from '../../lib/contract.js';
import { createSession, addSample, finish } from '../../lib/practice.js';
import { measurePolyline, pointOnPath } from '../../lib/easing.js';
import { stateAt } from '../../lib/timeline.js';
import { getProcedure } from '../../lib/procedures/index.js';
import aji from '../../lib/procedures/aji.js';

// 描画先とDOMの札だけを置き換えます。魚・カメラ・レイキャスト・時間・ポインター処理は実物です。
function fixture({ raw, search = '?freeze=1&seed=3', speciesId = 'aji', canDraw = true,
  rect = { left: 30, top: 75, width: 570, height: 400 } } = {}) {
  const host = { location: { search } }, doc = { defaultView: host, body: { dataset: {} } };
  const canvas = new EventTarget(), captured = new Set();
  Object.assign(canvas, { classList: { add() {} }, getBoundingClientRect: () => rect,
    setPointerCapture: id => captured.add(id), releasePointerCapture: id => captured.delete(id),
    hasPointerCapture: id => captured.has(id) });
  const container = { ownerDocument: doc, clientWidth: rect.width, clientHeight: rect.height };
  const mirror = new THREE.Group(), scene = new THREE.Scene();
  mirror.add(scene);
  const rig = createCameraRig({ aspect: rect.width / rect.height });
  const status = { frames: 0, running: false, enabled: true, closed: 0, overlayClosed: 0, marks: [] };
  let callbacks;
  const viewer = {
    renderer: { domElement: canvas }, camera: rig.camera, rig, scene, quality: 'standard',
    stage: { boardTop: 0, update() {}, setContactBounds() {}, setBoardSize(w, d) { status.boardSize = [w, d]; } },
    controls: { setEnabled(b) { status.enabled = b; } },
    setMirror(b) { mirror.scale.x = b ? -1 : 1; mirror.updateMatrixWorld(true); rig.setMirror(b); },
    stats: () => ({ gl: 'webgl2', fps: 50, frames: status.frames }),
    render(dt) {
      if (!canDraw) return false;
      if (!status.frames) assert.notEqual(doc.body.dataset.ready, 'true');
      rig.update(dt);
      mirror.updateMatrixWorld(true);
      status.frames++;
      scene.onAfterRender();
      return true;
    },
    start() { status.running = true; }, dispose() { status.closed++; status.running = false; },
    snapshot: async () => new Blob(['魚'], { type: 'image/png' }),
  };
  const fish = createFishScene({ container, debug: true, speciesId }, {
    makeViewer(options) { callbacks = options; return viewer; },
    makeOverlay: () => ({ setMarks: (state, labels) => status.marks.push({ state, labels }), project() {},
      dispose() { status.overlayClosed++; } }),
    procedureFor: raw === undefined ? getProcedure : () => raw,
  });
  function tick() {
    assert.ok(status.running);
    callbacks.onFrame(0.02);
    viewer.render(0.02);
  }
  function project(p, owner) {
    const m = host.__sabaki.model;
    const v = new THREE.Vector3().fromArray(p).applyMatrix4((m.pieces[owner]?.object ?? m.group).matrixWorld).project(rig.camera);
    return [rect.left + (v.x + 1) * rect.width / 2, rect.top + (1 - v.y) * rect.height / 2];
  }
  function fire(type, xy, id, time) {
    const e = Object.assign(new Event(type), { button: 0, pointerType: 'touch', pointerId: id, clientX: xy[0], clientY: xy[1] });
    Object.defineProperty(e, 'timeStamp', { value: time });
    canvas.dispatchEvent(e);
  }
  return { fish, doc, host, status, viewer, tick, project, fire, captured,
    lower() { viewer.quality = 'light'; callbacks.onQualityChange('light'); },
    tap(x, y) { callbacks.onTap({ x, y }); }, touch() { rig.touch(); callbacks.onCameraUser(); } };
}

function countDisposals(root) {
  const counts = new Map();
  root.traverse(o => {
    if (o.isInstancedMesh) counts.set(o, 0);
    if (o.isMesh) for (const resource of [o.geometry, ...[o.material].flat()]) counts.set(resource, 0);
  });
  for (const r of counts.keys()) r.addEventListener('dispose', () => counts.set(r, counts.get(r) + 1));
  return () => {
    assert.ok(counts.size > 20);
    for (const [r, n] of counts) assert.equal(n, 1, r.name || r.type);
  };
}

test('初回描画の後に ready が解決し、同じ進度では状態を再計算せず、画質を下げても位置と設定が残ります', async () => {
  const f = fixture(), { fish, status, host } = f;
  fish.setStep(2); fish.setProgress(0.42); fish.setLeftHanded(true);
  const first = await fish.ready;
  try {
    assert.deepEqual(Object.keys(first).sort(), ['gl', 'quality', 'triangles']);
    assert.equal(first.gl, 'webgl2'); assert.equal(first.quality, 'standard');
    assert.equal(f.doc.body.dataset.ready, 'true');
    assert.equal(status.frames, 1);
    assert.deepEqual(status.boardSize, [42, 28]);
    assert.equal(fish.stats().stepCount, getProcedure('aji').steps.length);
    assert.equal(fish.stats().triangles, first.triangles);
    assert.equal(host.__sabaki.anatomy, host.__sabaki.model.anatomy);
    const calls = status.marks.length, original = status.marks.at(-1).state;
    assert.deepEqual(original, stateAt(host.__sabaki.proc, 2, 0.42, { leftHanded: true }));
    for (let i = 0; i < 8; i++) { fish.setProgress(0.42); f.tick(); }
    assert.equal(status.marks.length, calls);
    fish.setLabels(true); fish.setXray(true); f.tick();
    assert.equal(status.marks.at(-1).state, original);
    assert.ok(status.marks.at(-1).labels);
    const previous = host.__sabaki.model, disposed = countDisposals(f.viewer.scene);
    const place = previous.group.matrixWorld.toArray();
    f.lower(); f.tick();
    disposed();
    assert.notEqual(previous, host.__sabaki.model);
    assert.deepEqual(host.__sabaki.model.group.matrixWorld.toArray(), place);
    assert.deepEqual(status.marks.at(-1).state, stateAt(host.__sabaki.proc, 2, 0.42, { leftHanded: true }));
    assert.equal(fish.stats().quality, 'light');
    assert.ok(fish.stats().triangles < first.triangles);
    assert.equal((await fish.snapshot()).type, 'image/png');
    const final = countDisposals(f.viewer.scene);
    fish.dispose(); fish.dispose(); final();
    assert.equal(status.closed, 1); assert.equal(status.overlayClosed, 1);
    assert.equal(host.__sabaki.model, undefined); assert.equal(host.__sabaki.proc, undefined);
    await assert.rejects(fish.snapshot(), /終了後/);
  } finally { fish.dispose(); }
});

test('手で回した視点を保ち、明示した視点と固定撮影では即座に移動し、描画3回を待ちます', async () => {
  const f = fixture({ raw: aji }), { fish, viewer } = f;
  await fish.ready;
  try {
    let touches = 0;
    const off = fish.on('camera-user', () => touches++);
    f.touch(); off(); f.touch();
    assert.equal(touches, 1);
    viewer.rig.orbit(0.3, 0.1); viewer.rig.update(2);
    const manual = viewer.rig.serialize();
    fish.setStep(3); fish.setProgress(0.5); fish.setView('cook'); f.tick();
    assert.equal(viewer.rig.userTouched, true); assert.deepEqual(viewer.rig.serialize(), manual);
    fish.setView('top'); f.tick();
    assert.equal(viewer.rig.userTouched, false);
    assert.ok(viewer.rig.serialize().pitch > 1.5);
    fish.setView('side'); f.tick(); assert.ok(viewer.rig.serialize().pitch < 0.2);
    let settled = false;
    const shot = fish.resetCamera({ immediate: true, capture: true }).then(() => { settled = true; });
    const target = viewer.rig.serialize();
    f.tick(); f.tick(); await Promise.resolve(); assert.equal(settled, false);
    f.tick(); await shot; assert.deepEqual(viewer.rig.serialize(), target);
    const interrupted = assert.rejects(fish.resetCamera({ immediate: true, capture: true }), /中断/);
    fish.dispose(); await interrupted;
  } finally { fish.dispose(); }
});

test('練習は切り始めに固定し、片手のドラッグを回転に渡さず、反転後も逆順の曲線と表面座標を通知します', async () => {
  const raw = structuredClone(aji);
  const step = raw.steps[1], cut = step.cuts[0];
  cut.reverse = true;
  const f = fixture({ raw }), { fish, status, host } = f;
  await fish.ready;
  try {
    const events = [], hits = [];
    const off = fish.on('practice-sample', sample => events.push(sample));
    fish.on('pick', hit => hits.push(hit));
    fish.setStep(1); fish.setProgress(0.86); fish.setLeftHanded(true);
    fish.setPractice({ cutId: cut.id }); f.tick();
    assert.equal(status.enabled, false);
    const locked = status.marks.at(-1).state;
    assert.deepEqual(locked, stateAt(host.__sabaki.proc, 1, cut.window[0], { leftHanded: true }));
    fish.setProgress(0.97); f.tick(); assert.equal(status.marks.at(-1).state, locked);
    const expected = host.__sabaki.anatomy.curve(cut.curve, cut.side).points.reverse();
    const owner = curveOwner(cut.curve, cut.side);
    const world = t => f.project(expected[Math.floor((expected.length - 1) * t)], owner);
    f.tap(...world(0.48)); assert.ok(hits.length === 1 && hits[0].point.every(Number.isFinite));
    f.fire('pointerdown', [-5, -3], 5, 10); assert.equal(events.length, 0);
    f.fire('pointerdown', world(0.05), 5, 100);
    f.fire('pointerdown', world(0.3), 6, 105);
    f.fire('pointermove', world(0.42), 6, 115);
    f.fire('pointermove', world(0.48), 5, 125);
    assert.ok(f.captured.has(5));
    f.lower(); f.tick();
    assert.equal(status.enabled, false);
    f.fire('pointerup', [-5, -5], 5, 150);
    assert.deepEqual(events.map(e => e.phase), ['start', 'move', 'end']);
    for (const e of events) {
      assert.equal(e.cutId, cut.id); assert.deepEqual(e.curvePoints, expected); assert.ok(e.point.every(Number.isFinite));
    }
    assert.deepEqual(events.map(e => e.tMs), [100, 125, 150]);
    assert.deepEqual(events[2].point, events[1].point);
    assert.ok(new THREE.Vector3().fromArray(events[0].point)
      .distanceTo(new THREE.Vector3().fromArray(expected[Math.floor((expected.length - 1) * 0.05)])) < 0.2);
    assert.equal(f.captured.size, 0);
    fish.setPractice(null); f.tick();
    assert.ok(status.enabled);
    assert.deepEqual(status.marks.at(-1).state, stateAt(host.__sabaki.proc, 1, 0.97, { leftHanded: true }));
    off(); f.fire('pointerdown', world(0.4), 7, 200); assert.equal(events.length, 3);
  } finally { fish.dispose(); }
});

test('内側の練習は骨の位置に投影して透視し、終了すると皮の濃さが戻ります', async () => {
  const f = fixture({ raw: aji }), { fish, host } = f;
  await fish.ready;
  try {
    fish.setStep(8); fish.setProgress(1); fish.setView('top'); fish.setPractice({ cutId: 'spine' }); f.tick();
    const { model, anatomy } = host.__sabaki, points = anatomy.curve('boneCut', 'R').points;
    const skin = model.pieces['skin.R'].object.children.find(o => o.isMesh).material;
    const xrayLevel = () => (model.materials.setXray ? model.materials.uniforms.uXray.value : skin.transparent ? 1 - skin.opacity : 0);
    assert.ok(xrayLevel() >= 0.8, '内側の練習中は透視が効く');
    const events = [];
    fish.on('practice-sample', e => events.push(e));
    const p = points[Math.floor(points.length / 2)], xy = f.project(p, 'R.dorsal');
    f.fire('pointerdown', f.project(points.at(-1), 'R.dorsal'), 1, 25);
    f.fire('pointermove', xy, 1, 50); f.fire('pointerup', xy, 1, 75);
    assert.deepEqual(events.map(e => e.phase), ['start', 'move', 'end']);
    assert.ok(new THREE.Vector3().fromArray(events[1].point).distanceTo(new THREE.Vector3().fromArray(p)) < 1e-5);
    fish.setPractice(null); fish.setStep(0); f.tick();
    assert.equal(xrayLevel(), 0, '練習を終えると皮の濃さが戻る');
  } finally { fish.dispose(); }
});

const phoneRect = { left: 0, top: 56, width: 390, height: 404 };

test('アジ手順4で指を始点から3・30・40px上に置くと始まり、50px上では一筆を記録しません', async () => {
  const raw = structuredClone(aji), step = raw.steps[3];
  step.hands[0].anchor = 'headCutTop';
  const f = fixture({ raw, rect: phoneRect }), { fish } = f;
  try {
    await fish.ready;
    fish.setStep(3); fish.setLabels(true); fish.setPractice({ cutId: step.practice.cut }); f.tick();
    const { start } = fish.practiceGuide(), at = dy => [start.x, start.y - dy];
    const misses = [], samples = [], hits = [];
    fish.on('practice-miss', e => misses.push(e));
    fish.on('practice-sample', e => samples.push(e));
    fish.on('pick', e => hits.push(e));
    const hand = f.status.marks.at(-1).state.hands[0], xy = f.project(hand.pos, hand.owner);
    assert.ok(Math.hypot(xy[0] - start.x, xy[1] - start.y) < 1e-6);
    f.fire('pointerdown', at(50), 1, 0);
    f.fire('pointermove', at(0), 1, 20); f.fire('pointerup', at(0), 1, 30);
    assert.deepEqual(misses, [{ reason: 'far-from-start', distancePx: 50 }]);
    assert.equal(f.captured.size, 0); assert.equal(samples.length, 0);
    for (const dy of [3, 30, 40]) {
      f.tap(...at(dy)); assert.equal(hits.length, 0, dy + 'px上は魚の輪郭の外');
      f.fire('pointerdown', at(dy), 2, 100);
      assert.ok(f.captured.has(2));
      assert.equal(samples.at(-1).phase, 'start');
      const first = samples.length;
      f.fire('pointermove', at(30), 2, 115); assert.equal(samples.length, first);
      f.fire('pointermove', at(14), 2, 125); assert.equal(samples.length, first + 1);
      f.fire('pointerup', at(0), 2, 150); assert.equal(samples.at(-1).phase, 'end');
    }
    assert.equal(misses.length, 1);
  } finally { fish.dispose(); }
});

test('幅390pxのアジ手順4で公開フックの点を一筆でなぞると、左右どちらでもSに届きます', async t => {
  const f = fixture({ rect: phoneRect }), { fish } = f, step = getProcedure('aji').steps[3];
  try {
    assert.equal(fish.practiceGuide(), null);
    await fish.ready;
    fish.setStep(3); fish.setProgress(0.5); f.tick();
    const normal = f.viewer.rig.serialize();
    let session;
    fish.on('practice-sample', e => {
      if (e.phase === 'start') session = createSession({ curvePoints: e.curvePoints, tolerance: step.practice.tolerance });
      addSample(session, e.point, e.tMs);
    });
    for (const left of [false, true]) {
      fish.setLeftHanded(left); fish.setPractice({ cutId: step.practice.cut }); f.tick();
      const { start, end, points } = fish.practiceGuide();
      assert.deepEqual(start, points[0]); assert.deepEqual(end, points.at(-1));
      const curve = f.host.__sabaki.anatomy.curve('headCut', 'L').points;
      const ribbon = f.viewer.scene.getObjectByName('headCut/L');
      let elapsed = 0;
      points.forEach(({ x, y }, i) => {
        const expected = f.project(curve[i], 'L.dorsal');
        assert.ok(Math.hypot(expected[0] - x, expected[1] - y) < 1e-7);
        const ink = new THREE.Vector3().fromBufferAttribute(ribbon.geometry.attributes.position, 2 * i)
          .applyMatrix4(ribbon.matrixWorld).project(f.viewer.camera);
        assert.ok(Math.abs(phoneRect.left + (1 + ink.x) * phoneRect.width / 2 - x) < 1e-5);
        assert.ok(Math.abs(phoneRect.top + (1 - ink.y) * phoneRect.height / 2 - y) < 1e-5);
        if (i) elapsed += 250 * new THREE.Vector3(...curve[i]).distanceTo(new THREE.Vector3(...curve[i - 1]));
        const type = i === 0 ? 'pointerdown' : i === points.length - 1 ? 'pointerup' : 'pointermove';
        f.fire(type, [x, y], 1, elapsed);
      });
      assert.equal(session.samples.length, points.length);
      const result = finish(session);
      t.diagnostic((left ? '左手' : '右手') + ' ' + result.score + '点・被覆' + Math.round(100 * result.coverage) + '%');
      assert.ok(result.score >= 95 && result.grade === 'S');
      fish.setPractice(null); f.tick();
      assert.equal(fish.practiceGuide(), null);
      assert.equal(f.viewer.rig.serialize().pitch, normal.pitch);
    }
  } finally { fish.dispose(); }
  assert.equal(fish.practiceGuide(), null);
});

test('スマホ幅の朱色の線を画面上で等速になぞり、指の座標を整数pxに丸めてもSに届きます', async t => {
  const f = fixture({ rect: phoneRect }), { fish } = f;
  try {
    await fish.ready;
    const step = getProcedure('aji').steps[3];
    fish.setStep(3); fish.setPractice({ cutId: step.practice.cut }); f.tick();
    const screen = measurePolyline(fish.practiceGuide().points.map(({ x, y }) => [x, y, 0]));
    let session;
    fish.on('practice-sample', e => {
      if (e.phase === 'start') session = createSession({ curvePoints: e.curvePoints, tolerance: step.practice.tolerance });
      addSample(session, e.point, e.tMs);
    });
    for (let i = 0; i <= 45; i++) {
      const [x, y] = pointOnPath(screen, i / 45);
      const type = i === 0 ? 'pointerdown' : i === 45 ? 'pointerup' : 'pointermove';
      f.fire(type, [Math.floor(x), Math.floor(y)], 1, i * 1500 / 45);
    }
    const result = finish(session);
    t.diagnostic('画面上の等速入力 ' + result.score + '点');
    assert.ok(result.score >= 92 && result.grade === 'S');
  } finally { fish.dispose(); }
});

test('切り線の持ち主が隠れていれば、同じ位置に別の部品が見えても練習は始まりません', async () => {
  const raw = structuredClone(aji);
  raw.steps[2].moves = [{ piece: 'L.dorsal', window: [0.3, 0.8], visible: false }];
  const f = fixture({ raw, rect: phoneRect });
  try {
    await f.fish.ready;
    f.fish.setStep(3); f.fish.setPractice({ cutId: raw.steps[3].practice.cut }); f.tick();
    const point = f.host.__sabaki.anatomy.curve('headCut', 'L').points[0];
    const events = [];
    f.fish.on('practice-sample', e => events.push(e));
    f.fire('pointerdown', f.project(point, 'L.dorsal'), 1, 0);
    assert.equal(f.fish.practiceGuide(), null);
    assert.equal(events.length, 0); assert.equal(f.captured.size, 0);
  } finally { f.fish.dispose(); }
});

test('WebGL2なし・魚や手順の欠落・初回描画の失敗・初期化前の解放を日本語で通知します', async () => {
  const fish = createFishScene({ container: { ownerDocument: { createElement: () => ({ getContext: () => null }) } } });
  await assert.rejects(fish.ready, /3D表示を開始できません/); fish.dispose(); fish.dispose();
  for (const [opts, reason] of [[{ speciesId: 'missing-fish' }, /この魚の3Dはまだ準備中です/],
    [{ raw: null }, /この魚の手順はまだ準備中です/], [{ canDraw: false }, /最初の画面/]]) {
    const f = fixture(opts);
    await assert.rejects(f.fish.ready, reason);
    f.fish.dispose(); f.fish.dispose();
    assert.equal(f.status.closed, 1); assert.equal(f.doc.body.dataset.ready, undefined);
  }
  const f = fixture();
  f.fish.dispose(); f.fish.dispose();
  await assert.rejects(f.fish.ready, /終了/); assert.equal(f.status.frames, 0);
});

test('透視を入れ切りすると、皮の変種の材質が作り直しに回り、変わらない間は作り直さない', async () => {
  const f = fixture({ raw: aji }), { fish, host } = f;
  await fish.ready;
  try {
    fish.setStep(0); fish.setProgress(0.5); f.tick();
    const skins = [];
    for (const id of ['skin.L', 'skin.R']) {
      host.__sabaki.model.pieces[id].object.traverse(o => { if (o.isMesh) skins.push(...[o.material].flat()); });
    }
    assert.ok(skins.length >= 2);
    assert.ok(skins.every(m => m.transparent === false), '透視の前は不透明');
    const before = skins.map(m => m.version);
    fish.setXray(true); f.tick();
    assert.ok(skins.every(m => m.transparent === true), '透視中は透明扱い');
    assert.ok(skins.every((m, i) => m.version > before[i]), '不透明で作った材質は、作り直しに回る');
    const during = skins.map(m => m.version);
    f.tick(); f.tick();
    assert.deepEqual(skins.map(m => m.version), during, '状態が変わらない間は作り直さない');
    fish.setXray(false); f.tick();
    assert.ok(skins.every(m => m.transparent === false), '透視を切ると不透明に戻る');
    assert.ok(skins.every((m, i) => m.version > during[i]));
  } finally { fish.dispose(); }
});
