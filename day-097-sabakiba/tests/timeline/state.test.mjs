import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_PIECE_IDS, ANCHOR_NAMES, ANCHOR_OWNER, CURVE_INFO, PIECE_IDS, PIECE_PARENT, validateProcedure,
} from '../../lib/contract.js';
import { clamp01, easeInOut, easeOut, lerp, slerpQuat, windowT } from '../../lib/easing.js';
import { createProcedure, endStateOf, poseTransform, resolveText, stateAt, stepCount, POSE_WINDOW_END } from '../../lib/timeline.js';
import aji from '../../lib/procedures/aji.js';
import { fakeAnatomy as anatomy } from '../fixtures/fake-anatomy.js';

const proc = createProcedure(aji, anatomy);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} と ${b}`);
const blank = () => ({
  steps: Array.from({ length: 6 }, (_, i) => ({ ...aji.steps[0], id: 'test-' + i })),
});
const stroke = (id, side, window, through = false) => ({
  id, curve: 'dorsalCut', side, window, through, tool: 'deba', motion: 'push', lead: 'tip', angleDeg: 12,
});
function checkFinite(value) {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  else if (value && typeof value === 'object') Object.values(value).forEach(checkFinite);
}
const persistent = ({ pieces, uniforms, incisions, pose: { q, p, head, dorsal } }) => ({
  pieces, uniforms, incisions, q, p, head, dorsal,
});

test('アジの15手順が契約を通り、片身を外すまで各面を調査どおりに置く', () => {
  assert.deepEqual(validateProcedure(aji), []);
  assert.equal(stepCount(proc), 15);
  assert.deepEqual(aji.steps.slice(0, 11).map(s => s.pose.head + s.pose.dorsal),
    ['LB', 'LB', 'LF', 'LB', 'LF', 'RB', 'RB', 'RB', 'LF', 'RF', 'LB']);
  for (const step of aji.steps) {
    if (step.id === 'prep') assert.deepEqual(step.hands, []);
    else assert.ok(step.hands.some(h => h.who === 'off'));
    assert.ok(step.camera.focus);
    if (step.cuts?.length) assert.ok(step.cuts.some(c => c.id === step.practice.cut));
    for (const c of step.cuts ?? []) {
      for (const name of ['curve', 'side', 'tool', 'motion', 'lead', 'angleDeg', 'window', 'through']) assert.ok(name in c);
    }
  }
  assert.deepEqual(aji.steps.flatMap(s => s.cuts ?? []).filter(c => c.curve === 'headCut').map(c => c.side), ['L', 'R']);
});

test('試験用の解剖は全アンカーと全カーブの両側を返し、正の弧長を持つ', () => {
  for (const name of ANCHOR_NAMES) assert.ok(anatomy.point(name).length === 3 && anatomy.point(name).every(Number.isFinite));
  for (const [name, { sides, inner }] of Object.entries(CURVE_INFO)) {
    for (const side of sides ? ['L', 'R'] : [null]) {
      const { points, onSurface } = anatomy.curve(name, side);
      assert.equal(onSurface, !inner);
      checkFinite(points);
      assert.ok(points.some(p => p.some((x, k) => x !== points[0][k])));
    }
  }
});

test('手順の誤りをまとめて報告し、番号を検査し、時間を両端に丸める', () => {
  const raw = blank();
  raw.steps[0].title = '';
  raw.steps[1].tools = ['spoon'];
  const errors = validateProcedure(raw);
  assert.ok(errors.length >= 2);
  assert.throws(() => createProcedure(raw, anatomy), e => e.message === errors.join('\n'));
  for (const i of [-1, stepCount(proc), 1.1, NaN]) assert.throws(() => stateAt(proc, i, 0), RangeError);
  assert.deepEqual(stateAt(proc, 3, -2), stateAt(proc, 3, 0));
  assert.deepEqual(stateAt(proc, 3, Infinity), endStateOf(proc, 3));
});

test('全手順の全11時点は有限で、飛ばす・順送り・逆送りで深く一致する', () => {
  const fresh = createProcedure(aji, anatomy);
  const seekFirst = stateAt(fresh, 7, 0.5);
  const states = aji.steps.map((_, i) => Array.from({ length: 11 }, (__, j) => {
    const first = stateAt(proc, i, j / 10);
    checkFinite(first);
    near(Math.hypot(...first.pose.q), 1);
    for (const value of Object.values(first.uniforms)) assert.ok(value >= 0 && value <= 1);
    assert.deepEqual(stateAt(proc, i, j / 10), first);
    return first;
  }));
  for (let i = states.length - 1; i >= 0; i--) {
    for (let j = 10; j >= 0; j--) assert.deepEqual(stateAt(fresh, i, j / 10), states[i][j]);
  }
  assert.deepEqual(seekFirst, states[7][5]);
});

test('手順の終点から次の始点へ全ての部品・切り込み・姿勢・材質をそのまま渡す', () => {
  aji.steps.forEach((_, i) => {
    const end = endStateOf(proc, i);
    assert.deepEqual(end, stateAt(proc, i, 1));
    if (i + 1 < stepCount(proc)) assert.deepEqual(persistent(stateAt(proc, i + 1, 0)), persistent(end));
  });
});

test('全ての左右の文章を置換し、左利きでも魚に付く位置と盤上の変位は一致する', () => {
  aji.steps.forEach((raw, i) => {
    const left = stateAt(proc, i, 0.5, { leftHanded: true });
    const right = stateAt(proc, i, 0.5);
    for (const [state, handed] of [[left, true], [right, false]]) {
      for (const key of ['title', 'summary', 'tip', 'mistake', 'done', 'place', 'safety']) {
        if (raw[key]) assert.equal(state[key], resolveText(raw[key], handed));
      }
      assert.deepEqual(state.how, raw.how.map(s => resolveText(s, handed)));
      // 手の印は、同じ手・同じ文なら1つ（身が2枚ある手順）。ラベルはそのまま。
      const uniqueHands = (raw.hands ?? []).filter((h, k, all) => all.findIndex(x => x.who === h.who && x.text === h.text) === k);
      assert.deepEqual(state.hands.map(m => m.text), uniqueHands.map(m => resolveText(m.text, handed)));
      assert.deepEqual(state.labels.map(m => m.text), (raw.labels ?? []).map(m => resolveText(m.text, handed)));
      assert.ok(!/[{}]/.test([state.place, ...state.hands.map(h => h.text), ...state.labels.map(l => l.text)].join('')));
    }
    assert.deepEqual(left.pieces, right.pieces);
    assert.deepEqual(left.knife, right.knife);
  });
  const left = stateAt(proc, 0, 0, { leftHanded: true });
  assert.match(left.place, /頭を右/);
  assert.deepEqual(left.hands, []);
  assert.match(stateAt(proc, 1, 0, { leftHanded: true }).hands[0].text, /右手/);
  assert.match(left.labels[0].text, /右手/);
});

test('アジでは表示中の部品だけを動かし、わた・血・小骨を片付けた後も身とあらが残る', () => {
  const hidden = new Set();
  for (let i = 0; i < stepCount(proc); i++) {
    const end = endStateOf(proc, i);
    for (const m of aji.steps[i].moves ?? []) {
      assert.ok(!hidden.has(m.piece), m.piece);
      if (m.move || m.rot) assert.ok(stateAt(proc, i, m.window[0]).pieces[m.piece].visible);
    }
    for (const id of PIECE_IDS) if (!end.pieces[id].visible) hidden.add(id);
  }
  const { pieces, uniforms } = endStateOf(proc, 14);
  assert.deepEqual(Object.keys(pieces).sort(), [...ALL_PIECE_IDS].sort());
  assert.deepEqual([...hidden].sort(), ['kidney', 'pinbones.L', 'pinbones.R', 'viscera']);
  for (const id of ['head', 'bone', 'L.dorsal', 'R.dorsal', 'L.strip', 'R.strip', 'skin.L', 'skin.R']) {
    assert.equal(pieces[id].visible, true);
    if (id !== 'bone') assert.ok(pieces[id].move.some(x => x !== 0));
  }
  assert.ok(pieces['R.dorsal'].move[0] > 0 && pieces['L.dorsal'].move[0] < 0);
  assert.deepEqual(uniforms, { scale: 0, scutes: 0, slitOpen: 0, xray: 0 });
});

test('各部品の値は親から独立し、出現した子を動かしてから窓の終わりで親を隠せる', () => {
  const raw = blank();
  const child = 'slices.L', parent = PIECE_PARENT[child];
  raw.steps[0].moves = [{ piece: parent, move: [2, 3, 4], window: [0.2, 0.5] },
    { piece: child, visible: true, move: [1, 0, 0], window: [0.5, 0.7] },
    { piece: parent, visible: false, window: [0.78, 0.88] }];
  const p = createProcedure(raw, anatomy);
  for (const u of [0, 0.25, 0.4999]) {
    const state = stateAt(p, 0, u).pieces;
    assert.equal(state[child].visible, false);
    assert.deepEqual(state[child].move, [0, 0, 0]);
  }
  const active = stateAt(p, 0, 0.5).pieces;
  assert.equal(active[child].visible, true);
  assert.deepEqual(active[parent].move, [2, 3, 4]);
  assert.deepEqual(endStateOf(p, 0).pieces[child].move, [1, 0, 0]);
  assert.equal(stateAt(p, 0, 0.8799).pieces[parent].visible, true);
  assert.equal(stateAt(p, 0, 0.88).pieces[parent].visible, false);
  assert.equal(stateAt(p, 0, 1).pieces[child].visible, true);
});

test('変位は絶対目標で、重なる窓は新しい窓の始点から補間し、指定のない属性を保つ', () => {
  const raw = blank();
  raw.steps[0].moves = [
    { piece: 'head', move: [4, 0, 0], opacity: 0.4, rot: { axis: 'y', deg: 30 }, window: [0, 1] },
    { piece: 'head', move: [8, 0, 0], window: [0.5, 1] },
  ];
  raw.steps[1].moves = [{ piece: 'head', move: [0, 0, 0], rot: { axis: 'z', deg: 55 }, window: [0.2, 0.8] }];
  raw.steps[0].uniforms = { xray: { to: 1 }, scale: { to: 0.25, window: [0.25, 0.75] } };
  const p = createProcedure(raw, anatomy);
  near(stateAt(p, 0, 0.75).pieces.head.move[0], 5);
  near(stateAt(p, 1, 0.5).pieces.head.move[0], 4);
  assert.equal(stateAt(p, 1, 0.5).pieces.head.opacity, 0.4);
  near(Math.hypot(...stateAt(p, 1, 0.5).pieces.head.rot.axis), 1);
  assert.deepEqual(endStateOf(p, 1).pieces.head.rot, { axis: [0, 0, 1], deg: 55, pivot: 'pivot' });
  assert.equal(stateAt(p, 0, 0.25).uniforms.scale, 1);
  near(stateAt(p, 0, 0.5).uniforms.scale, 0.625);
  near(stateAt(p, 0, 0.5).uniforms.xray, 0.5);
  near(stateAt(p, 2, 0).uniforms.xray, 1);
});

test('同じ側の切り込みは一本にまとまり、窓に入った深い切りだけが内側へ届く', () => {
  const raw = blank();
  raw.steps[0].cuts = [stroke('a', 'L', [0.2, 0.4])];
  raw.steps[1].cuts = [stroke('b', 'R', [0.1, 0.3]), stroke('deep', 'L', [0.5, 0.8], true)];
  raw.steps[2].cuts = [stroke('c', 'L', [0.2, 0.4])];
  const p = createProcedure(raw, anatomy);
  assert.deepEqual(stateAt(p, 0, 0.2).incisions, []);
  near(stateAt(p, 0, 0.3).incisions[0].progress, 0.5);
  assert.deepEqual(stateAt(p, 1, 0.5).incisions.map(c => c.through), [false, false]);
  assert.deepEqual(endStateOf(p, 5).incisions, [
    { curve: 'dorsalCut', side: 'L', through: true, progress: 1, reverse: false },
    { curve: 'dorsalCut', side: 'R', through: false, progress: 1, reverse: false },
  ]);
});

test('刃の接近と離脱はそれぞれの窓の前後10%に限り、演出・強調線は指定の時刻に出る', () => {
  const raw = blank();
  raw.steps[0].cuts = [stroke('a', 'L', [0.25, 0.35]), stroke('b', 'R', [0.70, 0.82])];
  raw.steps[0].effects = [{ kind: 'water', curve: 'dorsalCut', side: 'L', window: [0.25, 0.75] }];
  raw.steps[0].highlight = [{ curve: 'dorsalCut', side: 'L' }];
  const p = createProcedure(raw, anatomy), at = u => stateAt(p, 0, u);
  for (const u of [0, 0.149, 0.451, 0.59, 0.921, 1]) assert.equal(at(u).knife, null);
  assert.equal(at(0.15).knife.t, 0);
  assert.equal(at(0.45).knife.t, 1);
  assert.equal(at(0.60).knife.side, 'R');
  assert.equal(at(0.92).knife.t, 1);
  near(at(0.30).knife.t, 0.5);
  assert.notDeepEqual(at(0.20).knife.pos, at(0.25).knife.pos);
  assert.deepEqual(at(0.24).effects, []);
  assert.deepEqual(at(0.50).effects, [{ kind: 'water', curve: 'dorsalCut', side: 'L', t: 0.5 }]);
  assert.deepEqual(at(0.76).effects, []);
  assert.equal(at(0).highlights[0].opacity, 0);
  assert.ok(at(0.05).highlights[0].opacity > 0 && at(0.05).highlights[0].opacity < 1);
  assert.equal(at(0.1).highlights[0].opacity, 1);
  assert.equal(at(1).highlights[0].owner, 'L.dorsal');
});

test('姿勢は最初の12%で球面補間し、焦点と目印は移動前の点と持ち主を返す', () => {
  const raw = blank();
  raw.steps[1].pose = { head: 'R', dorsal: 'F', p: [4, 2, 0] };
  const focuses = ['eye', { curve: 'scaleSweep', side: 'R' }, 'piece:L.strip', [2, 3, 4], 'bodyCenter'];
  focuses.forEach((focus, i) => { raw.steps[i].camera = { preset: 'top', focus }; });
  raw.steps[1].hands = [{ anchor: 'peduncle', piece: 'R.dorsal', who: 'off', text: '{L}手です。' }];
  raw.steps[2].labels = [{ anchor: 'piece:L.strip', text: '腹の骨' }];
  const p = createProcedure(raw, anatomy);
  const middle = stateAt(p, 1, POSE_WINDOW_END / 2), start = poseTransform(raw.steps[0].pose), end = poseTransform(raw.steps[1].pose);
  assert.deepEqual(middle.pose.p, [2, 1, 0]);
  assert.deepEqual(middle.pose.q, slerpQuat(start.q, end.q, 0.5));
  assert.deepEqual(stateAt(p, 1, POSE_WINDOW_END).pose.q, end.q);
  assert.deepEqual(stateAt(p, 1, 0.25).pose.q, end.q);
  const cams = focuses.map((_, i) => stateAt(p, i, 0).camera);
  assert.deepEqual(cams[0], { preset: 'top', focusPoint: anatomy.point('eye'), focusOwner: ANCHOR_OWNER.eye, zoom: 1 });
  near(cams[1].focusPoint[0], (19.6 + 4.8) / 2);
  assert.equal(cams[1].focusOwner, 'R.dorsal');
  assert.deepEqual(cams[2].focusPoint, anatomy.point('bodyCenter'));
  assert.equal(cams[2].focusOwner, 'L.strip');
  assert.deepEqual(cams[3].focusPoint, [2, 3, 4]);
  assert.equal(cams[3].focusOwner, null);
  assert.equal(cams[4].focusOwner, null);
  assert.deepEqual(middle.hands[0].pos, anatomy.point('peduncle'));
  assert.equal(middle.hands[0].owner, 'R.dorsal');
  assert.equal(stateAt(p, 2, 0).labels[0].owner, 'L.strip');
  assert.equal(stateAt(proc, 11, 0.77).knife.owner, 'L.dorsal');
  assert.equal(stateAt(proc, 6, 0.25).knife.owner, 'bone');
});

test('返した配列を書き換えても、手順の再評価と別の手順の開始値に影響しない', () => {
  const u = 0.45, original = stateAt(proc, 8, u);
  const fresh = stateAt(proc, 8, u);
  fresh.pieces.head.move[0] = fresh.pieces.head.rot.axis[0] = 600;
  fresh.hands[0].pos[0] = fresh.camera.focusPoint[0] = fresh.pose.p[0] = fresh.knife.pos[0] = 600;
  fresh.incisions[0].progress = 0;
  assert.deepEqual(stateAt(proc, 8, u), original);
});

test('補間は端点を保ち、戻らず、四元数の短い弧を通る', () => {
  assert.equal(clamp01(NaN), 0);
  assert.equal(lerp(0.1, 0.3, 1), 0.3);
  near(windowT(0.3, [0.2, 0.4]), 0.5);
  for (const ease of [easeInOut, easeOut]) {
    let previous = 0;
    for (let n = 0; n <= 100; n++) {
      const value = ease(n / 100);
      assert.ok(value >= previous && value <= 1);
      previous = value;
    }
    assert.equal(ease(0), 0);
    assert.equal(ease(1), 1);
  }
  const start = [0, 0, 0, 1], negated = [0, 0, -0.5, -Math.sqrt(0.75)];
  const halfway = slerpQuat(start, negated, 0.5);
  near(halfway[2], Math.sin(Math.PI / 12));
  near(Math.hypot(...halfway), 1);
  assert.deepEqual(slerpQuat(start, [0, 0, 0, -1], 0.5), start);
});
