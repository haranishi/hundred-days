import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES, stageOf } from '../lib/cases.js';
import { castShadows } from '../lib/geometry.js';
import { solutionArrangement } from '../lib/score.js';
import { createSideRenderer, createSketchRenderer, createWallRenderer } from '../lib/view.js';

// 呼び出しを記録するだけの2D context。プロパティの代入は無視して受け取る。
function fakeContext() {
  const calls = [];
  const state = {};
  const proxy = new Proxy(state, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      if (prop === 'measureText') return (text) => ({ width: String(text).length * 7 });
      if (prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (prop in target) return target[prop];
      return (...args) => { calls.push([prop, ...args]); };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  return proxy;
}

function fakeCanvas({ width = 360, height = 249, context = fakeContext() } = {}) {
  return { width: 0, height: 0, context, getContext: () => context, getBoundingClientRect: () => ({ width, height }) };
}

const count = (context, name) => context.calls.filter(([call]) => call === name).length;
const texts = (context) => context.calls.filter(([call]) => call === 'fillText').map(([, text]) => text);

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const startOf = (stage) => ({ ly: stage.lamp.start, xs: Object.fromEntries(stage.props.map((prop) => [prop.id, prop.x.start])) });

test('2D contextを取れない・例外のときは null（描画不可を呼び出し側が案内できる）', () => {
  for (const make of [createWallRenderer, createSketchRenderer, createSideRenderer]) {
    assert.equal(make({ getContext: () => null, getBoundingClientRect: () => ({ width: 10, height: 10 }) }), null);
    assert.equal(make({ getContext: () => { throw new Error('blocked'); }, getBoundingClientRect: () => ({ width: 10, height: 10 }) }), null);
  }
});

test('resize は表示サイズ×devicePixelRatioを実解像度にする', () => {
  const before = globalThis.devicePixelRatio;
  globalThis.devicePixelRatio = 2;
  try {
    const canvas = fakeCanvas({ width: 360, height: 249 });
    const renderer = createWallRenderer(canvas);
    assert.equal(canvas.width, 720);
    assert.equal(canvas.height, 498);
    canvas.getBoundingClientRect = () => ({ width: 200, height: 140 });
    renderer.resize();
    assert.equal(canvas.width, 400);
    assert.equal(canvas.height, 280);
  } finally {
    globalThis.devicePixelRatio = before;
  }
});

test('壁：5夜の開始と正解を、入力を変えずに描き、影の数だけ塗る', () => {
  for (const item of CASES) {
    const stage = deepFreeze(stageOf(item));
    const start = deepFreeze(startOf(stage));
    const solution = deepFreeze(solutionArrangement(stage));
    for (const arrangement of [start, solution]) {
      const canvas = fakeCanvas();
      const renderer = createWallRenderer(canvas);
      renderer.render({ stage, arrangement, selected: 'lamp', guideOn: false });
      const placements = Object.fromEntries(stage.props.map((prop) => [prop.id, { x: arrangement.xs[prop.id], y: prop.y }]));
      const shadows = castShadows(stage.props, placements, { x: stage.lamp.x, y: arrangement.ly }, stage.distance).length;
      assert.ok(count(canvas.context, 'fill') >= shadows, `${item.id}: 影${shadows}枚`);
      assert.ok(count(canvas.context, 'clip') >= 1, '影は壁の中だけに塗る');
      assert.ok(texts(canvas.context).some((text) => text === `${Math.round(arrangement.ly)}cm`), '灯りの高さの数値');
    }
  }
});

test('壁：ガイドと flash のときだけ、ねらいの面と輪郭を足す', () => {
  const stage = stageOf(CASES[0]);
  const arrangement = startOf(stage);
  const plain = fakeCanvas();
  createWallRenderer(plain).render({ stage, arrangement, guideOn: false, flash: 0 });
  const guided = fakeCanvas();
  createWallRenderer(guided).render({ stage, arrangement, guideOn: true, flash: 0 });
  const flashed = fakeCanvas();
  createWallRenderer(flashed).render({ stage, arrangement, guideOn: false, flash: 1 });
  assert.ok(count(guided.context, 'rect') > count(plain.context, 'rect'), 'ガイドの面');
  assert.ok(count(guided.context, 'stroke') > count(plain.context, 'stroke'), 'ガイドの輪郭');
  assert.ok(count(flashed.context, 'stroke') > count(plain.context, 'stroke'), 'flashの輪郭');
  assert.equal(count(flashed.context, 'rect'), count(plain.context, 'rect'), 'flashは面を足さない');
});

test('壁：選択中のすべれる道具には名前の札、固定の道具には付けない', () => {
  const stage = stageOf(CASES.find((item) => item.id === 'bag'));
  const arrangement = startOf(stage);
  const selected = fakeCanvas();
  createWallRenderer(selected).render({ stage, arrangement, selected: 'hat' });
  assert.ok(texts(selected.context).includes('帽子'));
  const fixed = stageOf(CASES[0]);
  const fixedCanvas = fakeCanvas();
  createWallRenderer(fixedCanvas).render({ stage: fixed, arrangement: startOf(fixed), selected: 'rack' });
  assert.equal(texts(fixedCanvas.context).includes('外套掛け'), false);
});

test('スケッチ：5夜のねらいを塗る', () => {
  for (const item of CASES) {
    const stage = stageOf(item);
    const canvas = fakeCanvas({ width: 168, height: 126 });
    createSketchRenderer(canvas).render(stage);
    assert.ok(count(canvas.context, 'rect') > 20, `${item.id}: ねらいの面`);
    assert.ok(count(canvas.context, 'fill') >= 1);
  }
});

test('現場図：灯りの高さ・足跡・壁からの距離・道具の名前を出し、邪魔な道具は出さない', () => {
  for (const item of CASES) {
    const stage = stageOf(item);
    const solution = solutionArrangement(stage);
    const canvas = fakeCanvas({ width: 360, height: 223 });
    createSideRenderer(canvas).render({ stage, caseDef: item, arrangement: solution });
    const shown = texts(canvas.context);
    assert.ok(shown.includes(`灯り ${solution.ly}cm`), `${item.id}: 灯りの高さ`);
    assert.ok(shown.includes(`壁から ${stage.distance}cm`), `${item.id}: 距離`);
    assert.ok(shown.some((text) => text.startsWith('足跡')));
    for (const prop of stage.props) assert.equal(shown.includes(prop.label), !prop.decoy, `${item.id}.${prop.id}`);
    if (item.stool > 0) assert.ok(shown.some((text) => text.includes(`踏み台${item.stool}cm`)));
  }
});
