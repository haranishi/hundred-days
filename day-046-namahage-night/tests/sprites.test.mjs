import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, HERO } from '../lib/sprites/hero.js';
import { PROPS } from '../lib/sprites/props.js';
import { drawSprite, render } from '../lib/render.js';
// 1×1の塗りだけを拾う。吹雪の空（sky 3）は星が無く、尾根は h>1、雪は w=2 なので
// 残る 1×1 はスプライトの画素だけになる。
function spy() {
  const pixels = [];
  return {
    pixels, font: '', textAlign: '', imageSmoothingEnabled: true, fillStyle: '',
    fillRect(x, y, w, h) { if (w === 1 && h === 1) pixels.push({ x, y, color: this.fillStyle }); },
    fillText() {}, clearRect() {},
  };
}
function stage(entity, extra = {}) {
  return {
    id: '1-1', tick: 0, stage: 0, status: 'playing', lives: 3, ability: null, abilityTicks: 0,
    level: { sky: 3, parTicks: 1440, rows: Array.from({ length: 12 }, () => '.'.repeat(20)) },
    entities: [entity],
    player: { x: 0, y: 178, w: 10, h: 14, vx: 0, vy: 0, grounded: true, invincible: 0, facing: 1 },
    ...extra,
  };
}
const near = (pixels, x0, x1) => pixels.filter(p => p.x >= x0 && p.x < x1);
test('スプライトは共通16色以内・宣言した寸法とフレーム', () => {
  assert.ok(PALETTE.length <= 16);
  assert.equal(PALETTE[0], 'transparent');
  for (const [name, s] of Object.entries({ ...HERO, ...PROPS })) {
    for (const rows of Object.values(s.frames)) {
      assert.equal(rows.length, s.h, name);
      for (const row of rows) {
        assert.equal(row.length, s.w, name);
        assert.ok([...row].every(c => parseInt(c, 36) < PALETTE.length));
      }
    }
  }
  for (const s of Object.values(HERO)) assert.deepEqual(Object.keys(s.frames), ['idle', 'walk1', 'walk2', 'jump', 'hurt']);
});
test('v2で足した原画は16×16の1コマで揃っている', () => {
  for (const name of ['rabbit', 'boar', 'owl', 'furoshiki', 'waraji', 'bell', 'snowpad', 'branch']) {
    const s = PROPS[name];
    assert.ok(s, name);
    assert.equal(s.w, 16, name);
    assert.equal(s.h, 16, name);
    assert.deepEqual(Object.keys(s.frames), ['idle'], name);
    assert.ok(s.frames.idle.some(row => [...row].some(c => c !== '0')), name);
  }
});
test('描画はパレットを1画素ずつ塗る', () => {
  let pixels = 0;
  drawSprite({ set fillStyle(v) { assert.ok(PALETTE.includes(v)); }, fillRect(x, y, w, h) { assert.equal(w, 1); assert.equal(h, 1); pixels++; } }, HERO.chibi, 0, 0);
  assert.ok(pixels > 0);
});
test('partsを渡すと指定した行だけずらして描ける', () => {
  const plain = spy(), shifted = spy();
  drawSprite(plain, PROPS.rabbit, 0, 0);
  drawSprite(shifted, PROPS.rabbit, 0, 0, 'idle', false, [{ from: 0, to: 6, dy: 2 }, { from: 7, to: 15, dy: 0 }]);
  assert.equal(plain.pixels.length, shifted.pixels.length);
  assert.equal(Math.min(...shifted.pixels.map(p => p.y)) - Math.min(...plain.pixels.map(p => p.y)), 2);
});
test('つららは drawY ではなく実座標で描く', () => {
  const ctx = spy();
  render(ctx, stage({ type: '^', x: 48, y: 112, w: 16, h: 16, alive: true, drawY: 0, phase: 'ready' }));
  const drawn = near(ctx.pixels, 48, 64);
  assert.ok(drawn.length > 0);
  assert.ok(drawn.every(p => p.y >= 112 && p.y < 128), '実座標の16px以内に描く');
});
test('倒れた敵は24tickで16px上へ退場し、枝は折れる間だけ左右に揺れる', () => {
  const alive = spy(), retiring = spy();
  const base = { type: 'R', x: 48, y: 160, w: 16, h: 16, direction: 1, phase: 'moving', retireTicks: 0 };
  render(alive, stage({ ...base, alive: true }));
  render(retiring, stage({ ...base, alive: false, retireTicks: 12 }));
  const top = ctx => Math.min(...near(ctx.pixels, 40, 70).map(p => p.y));
  assert.equal(top(alive) - top(retiring), 8);
  const a = spy(), b = spy();
  const branch = { type: '%', x: 48, y: 112, w: 16, h: 4, alive: true, phase: 'cracking', retireTicks: 0 };
  render(a, stage(branch, { tick: 0 }));
  render(b, stage(branch, { tick: 2 }));
  assert.equal(Math.min(...near(a.pixels, 40, 70).map(p => p.x)) - Math.min(...near(b.pixels, 40, 70).map(p => p.x)), 2);
});
test('予告中の敵には「!」を重ね、色だけに頼らない', () => {
  const marks = [];
  const ctx = { ...spy(), fillRect(x, y, w, h) { if (w === 2 && h === 5) marks.push({ x, y }); } };
  render(ctx, stage({ type: 'B', x: 48, y: 160, w: 16, h: 16, alive: true, direction: 1, phase: 'warning', retireTicks: 0 }));
  assert.equal(marks.length, 1);
  assert.ok(marks[0].y < 160, '敵の上に出す');
});
test('HUDの能力アイコンは同じ原画を使い、能力なしでは消える', () => {
  const icon = spy();
  let cleared = 0;
  icon.clearRect = () => cleared++;
  render(spy(), stage({ type: '*', x: 48, y: 160, w: 16, h: 16, alive: true, phase: 'ready' }, { ability: 'F', abilityTicks: 600 }), { iconCtx: icon });
  assert.equal(cleared, 1);
  assert.ok(icon.pixels.length > 0);
  const empty = spy();
  empty.clearRect = () => {};
  render(spy(), stage({ type: '*', x: 48, y: 160, w: 16, h: 16, alive: true, phase: 'ready' }), { iconCtx: empty });
  assert.equal(empty.pixels.length, 0);
});
test('得点の浮き文字は渡されたぶんだけ、対象の上に書く', () => {
  const texts = [];
  const ctx = { ...spy(), fillText(text, x, y) { texts.push({ text, x, y }); } };
  render(ctx, stage({ type: '*', x: 48, y: 160, w: 16, h: 16, alive: true, phase: 'ready' }), { pops: [{ x: 56, y: 140, text: '+100', ticks: 60 }, { x: 56, y: 126, text: '×2', ticks: 30 }] });
  assert.deepEqual(texts.map(t => t.text), ['+100', '+100', '×2', '×2']);
  assert.ok(texts[2].y < texts[0].y, '×2は上に出す');
});
