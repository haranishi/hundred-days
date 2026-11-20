import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGesture, LONG_PRESS_MS } from '../../lib/controls-gesture.js';
import { createToolMachine } from '../../lib/controls-tools.js';
import { orbitCamera, zoomCamera } from '../../lib/controls.js';
import { CAMERA_DEFAULT, CAMERA_LIMITS } from '../../lib/contract.js';

const point = (id, x, y, time, kind = 'touch') => ({ id, x, y, time, kind });

function gestureLog() {
  const log = [];
  const gesture = createGesture((action) => { log.push(action); });
  return { gesture, log, types: () => log.map(({ type }) => type) };
}

test('指とマウスの単発とダブルを区別し、ダブルの直後の入力は単発に戻る', () => {
  for (const kind of ['touch', 'mouse']) {
    const { gesture, types } = gestureLog();
    for (const time of [0, 120, 240]) {
      gesture.down(point(1, 18, 21, time, kind));
      gesture.end(point(1, 18, 21, time + 20, kind));
    }
    assert.deepEqual(types(), ['press', 'tap', 'release', 'press', 'double-tap', 'press', 'tap', 'release']);
  }
});

test('離れた位置・遅いタップ・異なる入力種別は視点リセットにならない', () => {
  const { gesture, types } = gestureLog();
  for (const [x, time, kind] of [[0, 0, 'touch'], [30, 80, 'touch'], [30, 160, 'mouse'], [31, 560, 'mouse']]) {
    const p = point(1, x, 0, time, kind);
    gesture.down(p);
    gesture.end({ ...p, time: time + 10 });
  }
  assert.equal(types().filter((type) => type === 'tap').length, 4);
  assert.ok(!types().includes('double-tap'));
});

test('回し始めは最初の座標の変位を使い、pointerupだけの移動も届く', () => {
  const { gesture, log, types } = gestureLog();
  gesture.down(point(1, 20, 10, 0));
  gesture.move(point(1, 23, 10, 10));
  gesture.move(point(1, 30, 10, 20));
  gesture.end(point(1, 36, 7, 30));
  assert.deepEqual(log.filter(({ type }) => type === 'move').map(({ dx, dy, dragged }) => [dx, dy, dragged]), [
    [3, 0, false], [10, 0, true], [6, -3, true],
  ]);
  assert.ok(!types().includes('tap'));
  assert.equal(log.at(-1).dragged, true);
});

test('動かさず待ったときだけ長押しが一度届き、直後のタップとも組にならない', () => {
  const { gesture, types } = gestureLog();
  gesture.down(point(1, 13, 11, 20));
  gesture.tick(20 + LONG_PRESS_MS - 1);
  assert.deepEqual(types(), ['press']);
  gesture.tick(20 + LONG_PRESS_MS);
  gesture.tick(20 + LONG_PRESS_MS + 20);
  gesture.end(point(1, 13, 11, 580));
  gesture.down(point(2, 13, 11, 630));
  gesture.end(point(2, 13, 11, 660));
  assert.deepEqual(types(), ['press', 'long-press', 'release', 'press', 'tap', 'release']);
});

test('2本目のpointerupで最後の拡大と移動を反映し、1本目はそのまま回せる', () => {
  const { gesture, log, types } = gestureLog();
  gesture.down(point(1, 10, 50, 0));
  gesture.down(point(2, 50, 50, 10));
  gesture.end(point(2, 70, 50, 20));
  assert.equal(gesture.size, 1);
  assert.deepEqual(log.find(({ type }) => type === 'pinch'), { type: 'pinch', dx: 10, dy: 0, scale: 1.5 });
  gesture.move(point(1, 19, 50, 35));
  gesture.end(point(1, 20, 50, 40));
  assert.deepEqual(types(), ['press', 'cancel-press', 'pinch', 'resume-orbit', 'move', 'move', 'release']);
  assert.equal(log[4].dx, 9);
});

test('2本の指を同じ向きへ動かすと移動分だけ残り、3本目は急な拡大を起こさない', () => {
  const { gesture, log } = gestureLog();
  gesture.down(point(1, 0, 10, 0));
  gesture.down(point(2, 40, 10, 10));
  gesture.down(point(3, 300, 1, 15));
  gesture.move(point(3, 200, 50, 18));
  gesture.move(point(1, 8, 10, 20));
  gesture.move(point(2, 48, 10, 30));
  gesture.end(point(3, 100, 1, 35));
  const frames = log.filter(({ type }) => type === 'pinch');
  assert.equal(frames.length, 2);
  assert.equal(frames.reduce((total, frame) => total + frame.dx, 0), 8);
  assert.equal(frames.reduce((total, frame) => total * frame.scale, 1), 1);
});

test('切る候補を押したまま2本目を置いても、どちらのpointerupでも切らない', () => {
  const cuts = [];
  const hit = { index: 1, id: 9 };
  const tools = createToolMachine({ pick: () => hit, highlight() {}, cut: (value) => cuts.push(value) });
  tools.setTool('cut');
  const gesture = createGesture(({ type, point: here }) => {
    if (type === 'press') return !tools.press(here);
    if (type === 'cancel-press') tools.cancel();
    if (type === 'release') tools.finish(here);
  });
  gesture.down(point(1, 28, 40, 0));
  gesture.down(point(2, 55, 42, 9));
  gesture.end(point(2, 65, 42, 30));
  gesture.end(point(1, 28, 40, 40));
  assert.deepEqual(cuts, []);
});

function toolGesture(id) {
  const log = [];
  const hit = { index: 1, id: 9 };
  const tools = createToolMachine({
    pick: () => hit, highlight: (value) => log.push(value ? 'candidate' : 'no-candidate'),
    cut: () => log.push('cut'), pinch: () => log.push('pinch'),
  });
  tools.setTool(id);
  const gesture = createGesture(({ type, point: here }) => {
    if (type === 'press') return !tools.press(here);
    if (type === 'cancel-press') tools.cancel();
    if (type === 'release') tools.finish(here);
    if (type === 'pinch') log.push('zoom');
  });
  function send(type, here, canvas = true) {
    if (type === 'down') tools.contactDown(here.id);
    if (type === 'end') tools.contactEnd(here.id);
    if (canvas) gesture[type](here);
  }
  return { send, log, resize: () => tools.cancelPruning(), blocked: () => tools.pruningBlocked };
}

test('道具帯から始まる複数接触では、1本が残っている間の切る・芽摘みを抑える', () => {
  for (const id of ['cut', 'pinch']) {
    const { send, log, blocked } = toolGesture(id);
    send('down', point(1, 0, 0, 0), false);
    send('down', point(2, 30, 40, 5));
    send('end', point(1, 0, 0, 10), false);
    assert.equal(blocked(), true);
    send('end', point(2, 30, 40, 15));
    assert.deepEqual(log, []);
    assert.equal(blocked(), false);
    send('down', point(3, 30, 40, 50));
    send('end', point(3, 30, 40, 55));
    assert.deepEqual(log, ['candidate', 'no-candidate', id]);
  }
});

test('枝を押した後に画面の外側へ置いた指でも候補を取り消し、キャンバス内のつまみは使える', () => {
  for (const id of ['cut', 'pinch']) {
    const { send, log } = toolGesture(id);
    send('down', point(1, 30, 40, 0));
    send('down', point(2, 0, 0, 5), false);
    assert.deepEqual(log, ['candidate', 'no-candidate']);
    send('end', point(2, 0, 0, 10), false);
    send('down', point(3, 60, 40, 15));
    send('move', point(3, 70, 40, 20));
    send('end', point(3, 70, 40, 25));
    send('end', point(1, 30, 40, 30));
    assert.deepEqual(log, ['candidate', 'no-candidate', 'zoom']);
  }
});

test('リサイズ後も同じ座標に同じ枝がある場合に、押し直すまでは切る・芽摘みを確定しない', () => {
  for (const id of ['cut', 'pinch']) {
    const { send, log, resize } = toolGesture(id);
    send('down', point(1, 30, 40, 0));
    resize();
    send('end', point(1, 30, 40, 10));
    assert.deepEqual(log, ['candidate', 'no-candidate']);
    send('down', point(2, 30, 40, 50));
    send('end', point(2, 30, 40, 60));
    assert.deepEqual(log, ['candidate', 'no-candidate', 'candidate', 'no-candidate', id]);
  }
});

test('pointercancelは長押しや離して実行に転ばず、次の指を受け入れる', () => {
  const { gesture, types } = gestureLog();
  gesture.down(point(1, 1, 10, 0));
  gesture.end(point(1, 2, 10, 600), true);
  gesture.tick(800);
  assert.deepEqual(types(), ['press', 'cancel-press']);
  assert.equal(gesture.size, 0);
  gesture.down(point(2, 1, 10, 900));
  gesture.end(point(2, 1, 10, 950));
  assert.deepEqual(types().slice(-3), ['press', 'tap', 'release']);
});

test('視点を卓の下へ回さず、寄り引きと平行移動も契約の範囲で止める', () => {
  let state = { ...CAMERA_DEFAULT };
  const camera = { get: () => state, set: (partial) => { state = { ...state, ...partial }; }, pxToWorld: () => 0.01 };
  orbitCamera(camera, 20, 800);
  assert.ok(state.az < CAMERA_DEFAULT.az);
  assert.equal(state.pol, CAMERA_LIMITS.polMin);
  orbitCamera(camera, 0, -2000);
  assert.equal(state.pol, CAMERA_LIMITS.polMax);
  zoomCamera(camera, 100, { dx: 1000, dy: 0 });
  assert.equal(state.dist, CAMERA_LIMITS.distMin);
  assert.ok(state.target[0] < CAMERA_DEFAULT.target[0]);
  const displacement = state.target.map((coordinate, i) => coordinate - CAMERA_DEFAULT.target[i]);
  assert.ok(Math.abs(Math.hypot(...displacement) - CAMERA_LIMITS.panMax) < 1e-9);
  zoomCamera(camera, 0.001);
  assert.equal(state.dist, CAMERA_LIMITS.distMax);
});
