import assert from 'node:assert/strict';
import test from 'node:test';
import { CASES, stageOf } from '../lib/cases.js';
import { castShadows } from '../lib/geometry.js';
import { solutionArrangement } from '../lib/score.js';
import { createTransform } from '../lib/transform.js';
import { createSideRenderer, createSketchRenderer, createWallRenderer, placeTag, RULER_FONT_PX } from '../lib/view.js';

// 呼び出しを記録するだけの2D context。プロパティの代入は無視して受け取る。
function fakeContext() {
  const calls = [];
  const state = {};
  const proxy = new Proxy(state, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      if (prop === 'measureText') return (text) => ({ width: String(text).length * 7 });
      if (prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      // 文字を描いた時点の字体と色も残す（呼び出しの5番目）。
      if (prop === 'fillText') return (...args) => { calls.push([prop, ...args.slice(0, 3), { font: target.font, fillStyle: target.fillStyle }]); };
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
// 札（角の丸い長方形。半径は高さの半分の11px）の矩形。選択の枠（半径8）とは半径で見分ける。
const tags = (context) => context.calls.filter(([call, , , , , radius]) => call === 'roundRect' && radius === 11)
  .map(([, left, top, width, height]) => ({ left, top, right: left + width, bottom: top + height }));
const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

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
      // 灯りの高さは壁の下の読み出しにある。壁の上には数値の札を出さず、身長計の左に文字の無い目印（三角）を描く。
      assert.equal(texts(canvas.context).some((text) => /\d+cm$/.test(String(text))), false, `${item.id}: 灯りの数値の札は描かない`);
      const t = createTransform(360, 249);
      const tip = { x: t.toScreen(0, 0).x - 1, y: t.toScreen(0, arrangement.ly).y };
      assert.ok(canvas.context.calls.some(([call, x, y]) => call === 'moveTo' && Math.abs(x - tip.x) < 1e-6 && Math.abs(y - tip.y) < 1e-6), `${item.id}: 灯りの高さの目印`);
      assert.deepEqual(['50', '100', '150'].filter((text) => texts(canvas.context).includes(text)), ['50', '100', '150'], '身長計の数字');
    }
  }
});

test('壁：身長計の数字は12px・太さ600で、紙に対して4.5:1以上の濃い色（既定は道具の縁と同じ #6b4f2a）', () => {
  const stage = stageOf(CASES[0]);
  const canvas = fakeCanvas();
  createWallRenderer(canvas).render({ stage, arrangement: startOf(stage), selected: 'lamp' });
  const numbers = canvas.context.calls.filter(([call, text]) => call === 'fillText' && ['50', '100', '150'].includes(text));
  assert.equal(numbers.length, 3);
  for (const [, text, , , drawn] of numbers) {
    assert.match(drawn.font, new RegExp(`^600 ${RULER_FONT_PX}px `), `${text}: 字の大きさと太さ`);
    assert.equal(drawn.fillStyle, '#6b4f2a', `${text}: 色`);
  }
  assert.ok(RULER_FONT_PX >= 12);
  // 紙（#efe6cf）に対するコントラスト比。
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (luminance('#efe6cf') + 0.05) / (luminance('#6b4f2a') + 0.05);
  assert.ok(ratio >= 4.5, `コントラスト比 ${ratio.toFixed(2)}`);
});

test('壁：選んだ道具の札は、身長計の数字・灯りの玉と重ならない（5夜・開始と途中と正解・3つの大きさ）', () => {
  for (const [width, height] of [[326, 225], [356, 246], [666, 461]]) {
    const t = createTransform(width, height);
    for (const item of CASES) {
      const stage = stageOf(item);
      const start = startOf(stage);
      const solution = solutionArrangement(stage);
      const midway = { ly: (start.ly + solution.ly) / 2, xs: Object.fromEntries(stage.props.map((prop) => [prop.id, (start.xs[prop.id] + solution.xs[prop.id]) / 2])) };
      for (const arrangement of [start, midway, solution]) {
        for (const prop of stage.props.filter((candidate) => candidate.x.min < candidate.x.max)) {
          const canvas = fakeCanvas({ width, height });
          createWallRenderer(canvas).render({ stage, arrangement, selected: prop.id });
          const drawn = tags(canvas.context);
          assert.equal(drawn.length, 1, `${item.id}.${prop.id}: 札は選んだ道具の1枚だけ`);
          const [tag] = drawn;
          const numbers = canvas.context.calls.filter(([call, text]) => call === 'fillText' && ['50', '100', '150'].includes(text))
            .map(([, text, x, y]) => ({ left: x - 2, right: x + 2 + String(text).length * 7, top: y - 7, bottom: y + 7 }));
          for (const number of numbers) assert.equal(overlap(tag, number), false, `${item.id}.${prop.id} @${width}: 札と身長計の数字`);
          const orb = t.toScreen(stage.lamp.x, arrangement.ly);
          assert.equal(overlap(tag, { left: orb.x - 17, right: orb.x + 17, top: orb.y - 17, bottom: orb.y + 17 }), false, `${item.id}.${prop.id} @${width}: 札と灯りの玉`);
          assert.ok(tag.left >= 0 && tag.right <= width && tag.top >= 0 && tag.bottom <= height, `${item.id}.${prop.id} @${width}: 札は壁の画面の中`);
        }
      }
    }
  }
});

test('札の置き場：上の中央 → 下の中央 → 右横 → 左横 → 重なる物の横へずらす、の順に選び、画面の外へ出さない', () => {
  const frame = { left: 100, right: 140, top: 80, bottom: 140 };
  const bounds = { left: 0, right: 300, top: 0, bottom: 200 };
  assert.deepEqual(placeTag({ width: 40, frame, bounds, avoid: [] }), { left: 100, right: 140, top: 51, bottom: 73 });
  const above = { left: 90, right: 150, top: 50, bottom: 75 };
  assert.equal(placeTag({ width: 40, frame, bounds, avoid: [above] }).top, 147, '上がふさがっていれば下');
  const below = { left: 90, right: 150, top: 145, bottom: 170 };
  assert.deepEqual(placeTag({ width: 40, frame, bounds, avoid: [above, below] }), { left: 152, right: 192, top: 99, bottom: 121 }, '上下がふさがっていれば右横');
  const right = { left: 150, right: 200, top: 95, bottom: 125 };
  assert.equal(placeTag({ width: 40, frame, bounds, avoid: [above, below, right] }).right, 88, '右もふさがっていれば左横');
  const left = { left: 40, right: 90, top: 95, bottom: 125 };
  const shifted = placeTag({ width: 40, frame, bounds, avoid: [{ left: 90, right: 125, top: 50, bottom: 75 }, below, right, left] });
  assert.deepEqual([shifted.left, shifted.top], [129, 51], '横もふさがっていれば、重なる物の右へずらす');
  assert.deepEqual(placeTag({ width: 40, frame: { left: 0, right: 20, top: 2, bottom: 40 }, bounds, avoid: [] }), { left: 0, right: 40, top: 47, bottom: 69 }, '画面の外へ出さない');
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

test('スケッチ：狭くて低い画面の証言ストリップ（72×54）でも描き、非表示（大きさ0）のときは描かない', () => {
  for (const item of CASES) {
    const stage = stageOf(item);
    const small = fakeCanvas({ width: 72, height: 54 });
    createSketchRenderer(small).render(stage);
    assert.ok(count(small.context, 'rect') > 20, `${item.id}: 72×54でもねらいの面`);
    assert.equal(count(small.context, 'strokeRect'), 1, `${item.id}: 枠`);
    const hidden = fakeCanvas({ width: 0, height: 0 });
    createSketchRenderer(hidden).render(stage);
    assert.equal(hidden.context.calls.length, 0, `${item.id}: 非表示のときは何も描かない`);
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

test('現場図：札（灯りの高さと道具の名前）は横書きで、互いに重ならず、線より後に描く', () => {
  for (const [width, height] of [[326, 202], [640, 396]]) {
    for (const item of CASES) {
      const stage = stageOf(item);
      const canvas = fakeCanvas({ width, height });
      createSideRenderer(canvas).render({ stage, caseDef: item, arrangement: solutionArrangement(stage) });
      const drawn = tags(canvas.context);
      assert.equal(drawn.length, 1 + stage.props.filter((prop) => !prop.decoy).length, `${item.id}: 札の数`);
      for (let i = 0; i < drawn.length; i += 1) {
        for (let j = i + 1; j < drawn.length; j += 1) assert.equal(overlap(drawn[i], drawn[j]), false, `${item.id} @${width}: 札${i}と札${j}`);
      }
      assert.equal(count(canvas.context, 'rotate'), 0, `${item.id}: 縦書きにしない`);
      const lastStroke = canvas.context.calls.map(([call]) => call).lastIndexOf('stroke');
      const firstTag = canvas.context.calls.findIndex(([call, , , , , radius]) => call === 'roundRect' && radius === 11);
      assert.ok(firstTag > lastStroke, `${item.id}: 札は線を描き終えてから重ねる`);
    }
  }
});
