import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../vendor/three.js';
import { createSceneOverlay, placeMarkers, projectObstacles } from '../../lib/scene-overlay.js';
import { createFishDisplay } from '../../lib/scene-fish.js';
import { buildFishModel } from '../../lib/pieces.js';
import { getProcedure } from '../../lib/procedures/index.js';
import { stateAt } from '../../lib/timeline.js';
import { createCameraRig } from '../../lib/camera.js';
import { SPECIES_IDS } from '../../lib/contract.js';

const bounds = { left: 5, top: 25, right: 355, bottom: 235 };
const marker = (x, y, text, width = 95) => ({ x, y, text, width, height: 24, radius: 13 });
const separate = (a, b) => a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, a + ' と ' + b);

test('練習を始めると手の印と札が画面から消え、同じ手順のガイドに戻ると再表示します', t => {
  function element() {
    return { children: [], hidden: false, style: {}, offsetWidth: 25, offsetHeight: 18,
      setAttribute() {}, remove() {}, append(...nodes) { this.children.push(...nodes); },
      replaceChildren(...nodes) { this.children = nodes; } };
  }
  const doc = { createElement: element, createElementNS: element, createTextNode: text => ({ textContent: text }) };
  const previous = globalThis.document;
  globalThis.document = doc;
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  let root;
  const overlay = createSceneOverlay({ ownerDocument: doc, clientWidth: 390, clientHeight: 404,
    appendChild(el) { root = el; }, querySelector: () => null });
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 20);
  camera.position.z = 8; camera.updateMatrixWorld();
  const matrix = new THREE.Matrix4(), pose = { matrixFor: () => matrix, visible: () => true };
  const model = { group: new THREE.Group(), anatomy: { point: () => [0, 0, 0] } };
  const state = { hands: [{ owner: 'head', anchor: 'headCutTop', pos: [0, 0, 0], text: '左手で頭を支えます。' }], labels: [] };
  const hands = () => root.children.filter(el => el.className?.includes('--hand') && !root.hidden && !el.hidden);
  try {
    for (const cut of [null, { curve: 'headCut', side: 'L' }, null]) {
      overlay.setMarks(state, true, pose, model, null, cut); overlay.project(camera);
      assert.equal(hands().length, cut ? 0 : 2);
    }
  } finally { overlay.dispose(); }
});

test('同じ手の文は先頭の輪だけに付き、部位札は残り、同じ入力から同じ配置を返します', () => {
  const text = '左手で身を支えます。';
  const args = { bounds, avoid: [], markers: [marker(62, 90, text), marker(231, 128, text),
    { ...marker(177, 190, text), hand: false }] };
  const input = structuredClone(args), result = placeMarkers(args);
  assert.deepEqual(result.map(m => m.text), [text, '', text]);
  assert.deepEqual(result.map(m => Boolean(m.rect)), [true, false, true]);
  assert.deepEqual(result.map(m => [m.x, m.y]), args.markers.map(m => [m.x, m.y]));
  assert.deepEqual(placeMarkers(args), result);
  assert.deepEqual(args, input);
});

test('斜めの切り線に重なった輪は、刃がない側の法線に沿って半径＋4px離れます', () => {
  const m = marker(160, 120, '支えます。');
  // 刃は切り線の左下にあります。線は法線が渡されない点列でも評価します。
  const line = Array.from({ length: 41 }, (_, i) => ({ x: 100 + i * 3, y: 60 + i * 3 }));
  const blade = { left: 123, top: 123, right: 158, bottom: 155 };
  const [placed] = placeMarkers({ markers: [m], avoid: [...line, blade], bounds });
  const dx = placed.x - m.x, dy = placed.y - m.y;
  near(dx + dy, 0);
  assert.ok(dx > 0 && dy < 0 && Math.hypot(dx, dy) <= 40);
  assert.ok(line.every(p => Math.hypot(p.x - placed.x, p.y - placed.y) >= m.radius + 4));
  assert.ok(Math.hypot(placed.x - blade.right, blade.top - placed.y) >= m.radius + 4);
  assert.ok(separate(placed.rect, blade));
  assert.ok(line.every(p => p.x < placed.rect.left || p.x > placed.rect.right || p.y < placed.rect.top || p.y > placed.rect.bottom));
});

test('刃の内側にある輪は近い縁から外へ出て、40pxで届かない場合はその上限で止まります', () => {
  const m = marker(170, 110, '支えます。');
  for (const [blade, possible] of [
    [{ left: 95, right: 179, top: 55, bottom: 163 }, true],
    [{ left: 110, right: 239, top: 59, bottom: 185 }, false],
  ]) {
    const [placed] = placeMarkers({ markers: [m], avoid: [blade], bounds });
    const travel = Math.hypot(placed.x - m.x, placed.y - m.y);
    if (possible) {
      assert.ok(placed.x >= blade.right + m.radius + 4);
      assert.ok(travel <= 40);
    } else {
      near(travel, 40);
      assert.ok(placed.y < m.y);
    }
  }
});

test('四隅と近接した札は舞台内に収まり、ほかの札、輪、切り線、操作ボタンを避けます', () => {
  const button = { left: 300, right: 351, top: 177, bottom: 232 };
  const line = Array.from({ length: 31 }, (_, i) => ({ x: 40 + i * 6, y: 113, nx: 0, ny: -1 }));
  const pins = [marker(22, 42, '背びれ'), marker(336, 43, '尾の付け根'),
    marker(25, 215, '切り口'), marker(284, 211, '腹の縁'), marker(124, 115, '左手で支えます。'),
    marker(132, 142, '右の身')];
  const result = placeMarkers({ markers: pins, bounds, avoid: [...line, button] });
  for (const [i, m] of result.entries()) {
    const r = m.rect;
    assert.ok(r && bounds.left <= r.left && r.right <= bounds.right && bounds.top <= r.top && r.bottom <= bounds.bottom);
    assert.ok(separate(r, button));
    for (const other of result.slice(0, i)) assert.ok(separate(r, other.rect));
    for (const p of result) {
      assert.ok(Math.hypot(Math.max(r.left - p.x, 0, p.x - r.right), Math.max(r.top - p.y, 0, p.y - r.bottom)) >= p.radius);
    }
    for (const p of line) assert.ok(p.x < r.left || p.x > r.right || p.y < r.top || p.y > r.bottom);
  }
  const crowded = { left: 0, top: 0, right: 95, bottom: 24 };
  const [only] = placeMarkers({ markers: [marker(47, 12, '支えます。')], bounds: crowded, avoid: [crowded] });
  assert.deepEqual(only.rect, crowded);
});

test('刃の局所の8頂点と描画中の点線を同じカメラで投影し、左右反転・練習にも追従します', () => {
  const d = createFishDisplay(buildFishModel('aji', { quality: 'light' }), getProcedure('aji'));
  const mirror = new THREE.Group(); mirror.add(d.group);
  const i = 3, step = d.proc.steps[i], cut = step.cuts[0], state = stateAt(d.proc, i, 0.51);
  const w = 640, h = 420;
  try {
    for (const handed of [1, -1]) {
      mirror.scale.x = handed;
      d.apply(state, step, false, null); mirror.updateMatrixWorld(true);
      const rig = createCameraRig({ bounds: d.bounds, aspect: w / h, reducedMotion: true });
      rig.applyPreset('cook');
      const camera = rig.camera, projection = camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse).multiply(d.group.matrixWorld);
      const obstacles = projectObstacles(d, state, projection, w, h);
      const [blade] = obstacles.filter(o => o.left !== undefined);
      assert.ok(blade);
      const vx = [], vy = [];
      // 出刃包丁は長さ16、高さ5、厚み0.52cm。局所の箱の全頂点を直接カメラに写します。
      for (const x of [-8, 8]) for (const y of [0, 5]) for (const z of [-0.26, 0.26]) {
        const p = new THREE.Vector3(x, y, z).applyMatrix4(d.knife.matrixWorld).project(camera);
        vx.push((p.x + 1) * w / 2); vy.push((1 - p.y) * h / 2);
      }
      for (const [value, expected] of [[blade.left, Math.min(...vx)], [blade.right, Math.max(...vx)],
        [blade.top, Math.min(...vy)], [blade.bottom, Math.max(...vy)]]) assert.ok(Math.abs(value - expected) < 1e-5);
      const points = obstacles.filter(o => o.x !== undefined);
      assert.ok(points.length > 2);
      for (let n = 1; n < points.length; n++) {
        assert.ok(Math.hypot(points[n].x - points[n - 1].x, points[n].y - points[n - 1].y) <= 6 + 1e-7);
        near(Math.hypot(points[n].nx, points[n].ny), 1);
      }
      const ribbon = d.guides.group.getObjectByName('headCut/L'), attr = ribbon.geometry.attributes.position;
      const end = new THREE.Vector3().fromBufferAttribute(attr, attr.count - 4).applyMatrix4(ribbon.matrixWorld).project(camera);
      near(points.at(-1).x, (end.x + 1) * w / 2);
      near(points.at(-1).y, (1 - end.y) * h / 2);
      d.apply(state, step, false, cut);
      const practice = projectObstacles(d, state, projection, w, h);
      assert.ok(practice.every(o => o.left === undefined) && practice.length > points.length);
    }
  } finally { d.dispose(); }
});

// 刃の箱の6面を画面へ写します。配置側で作った凸包から独立して、輪との距離を測ります。
function projectedBladeFaces(display, projection, w, h) {
  const box = display.bladeBox;
  if (!box) return [];
  const corners = Array.from({ length: 8 }, (_, i) => {
    const p = new THREE.Vector3((i & 1 ? box.max : box.min).x, (i & 2 ? box.max : box.min).y, (i & 4 ? box.max : box.min).z);
    p.applyMatrix4(display.knife.matrix).applyMatrix4(projection);
    return p.set((1 + p.x) * w / 2, (1 - p.y) * h / 2, 0);
  });
  return [[0, 1, 3, 2], [4, 5, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6]]
    .flatMap(([a, b, c, d]) => [new THREE.Triangle(corners[a], corners[b], corners[c]), new THREE.Triangle(corners[a], corners[c], corners[d])]);
}

test('幅390pxの8種116手順で、切りの中点・進度55%・終端の手の輪が刃と点線から4px以上離れます', () => {
  const w = 390, h = 350, area = { left: 5, right: w - 5, top: 54, bottom: h - 5 };
  let count = 0;
  for (const id of SPECIES_IDS) {
    const d = createFishDisplay(buildFishModel(id, { quality: 'light' }), getProcedure(id));
    const rig = createCameraRig({ aspect: w / h, reducedMotion: true });
    try {
      for (const [i, step] of d.proc.steps.entries()) {
        const times = new Set([0.55, 1, ...(step.cuts ?? []).map(c => (c.window[0] + c.window[1]) / 2)]);
        for (const u of times) {
          const s = stateAt(d.proc, i, u);
          d.apply(s, step, false, null);
          rig.setBounds(d.bounds); rig.applyPreset(s.camera.preset, { focus: d.focus, zoom: s.camera.zoom, headDirection: d.head });
          const projection = rig.camera.projectionMatrix.clone().multiply(rig.camera.matrixWorldInverse);
          const avoid = projectObstacles(d, s, projection, w, h);
          const markers = s.hands.map(hand => {
            const part = hand.anchor.startsWith('piece:') && d.model.pieces[hand.anchor.slice(6)];
            const p = new THREE.Vector3(...(part?.pivot ?? hand.pos)).applyMatrix4(d.pose.matrixFor(hand.owner)).applyMatrix4(projection);
            return { ...marker((p.x + 1) * w / 2, (1 - p.y) * h / 2, hand.text), radius: 13.5,
              visible: d.pose.visible(hand.owner) && Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) <= 1 };
          });
          const faces = projectedBladeFaces(d, projection, w, h), points = avoid.filter(o => o.x !== undefined);
          for (const [j, pin] of placeMarkers({ markers, avoid, bounds: area }).entries()) {
            if (!pin.visible) continue;
            const where = [id, step.id, u].join('/'), p = new THREE.Vector3(pin.x, pin.y, 0);
            assert.ok(Math.hypot(pin.x - markers[j].x, pin.y - markers[j].y) <= 40 + 1e-8, where);
            for (const face of faces) assert.ok(face.closestPointToPoint(p, new THREE.Vector3()).distanceTo(p) >= pin.radius + 4 - 1e-8, where);
            for (const q of points) assert.ok(Math.hypot(pin.x - q.x, pin.y - q.y) >= pin.radius + 4 - 1e-8, where);
            count++;
          }
        }
      }
    } finally { d.dispose(); }
  }
  assert.equal(count, 447);
});

test('準備中は部位名を表示しても、魚の胴に手の位置の札を出しません', () => {
  const d = createFishDisplay(buildFishModel('aji', { quality: 'light' }), getProcedure('aji'));
  const root = { setAttribute() {}, remove() {}, append() { assert.fail('準備の手の印が残っています'); } };
  const overlay = createSceneOverlay({ ownerDocument: { createElement: () => root }, appendChild() {}, querySelector: () => null });
  try {
    for (const leftHanded of [false, true]) {
      const s = stateAt(d.proc, 0, 0, { leftHanded });
      d.apply(s, d.proc.steps[0], false, null);
      overlay.setMarks(s, true, d.pose, d.model, d);
    }
  } finally { overlay.dispose(); d.dispose(); }
});
