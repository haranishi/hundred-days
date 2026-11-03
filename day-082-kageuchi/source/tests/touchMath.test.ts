// OWNER: core
// タッチ操作の純粋な計算（スティック・小石ボタンの状態機械・視点ドラッグ）と、InputState の注入口（物理とタッチの和）。
// 2026-11-03 スマホ対応で新設（tasks 1.2・2.1）。
import { describe, expect, it } from 'vitest';
import { TOUCH } from '../src/config/touch';
import { InputState } from '../src/input/input';
import { AimButton, LookDrag, clampOrigin, stickFromDrag, stickRadius } from '../src/input/touchMath';

const R = 52;
const S = TOUCH.stick;

describe('スティック', () => {
  it('半径は 390 以上の高さで 52、低い画面では比例して縮み、下限で止まる', () => {
    expect(stickRadius(390)).toBe(52);
    expect(stickRadius(844)).toBe(52);
    expect(stickRadius(375)).toBeCloseTo(50, 5);
    expect(stickRadius(320)).toBeCloseTo((52 * 320) / 390, 5);
    expect(stickRadius(100)).toBe(S.minRadius);
  });

  it('不感帯（0.15R）の内側では 0', () => {
    for (const d of [0, 1, 0.15 * R - 0.01, 0.15 * R]) {
      const o = stickFromDrag(d, 0, R, false);
      expect(o.x).toBe(0);
      expect(o.y).toBe(0);
      expect(o.run).toBe(false);
    }
  });

  it('不感帯〜R は距離に比例（R で 1）、向きは指の向き。上へなぞると前', () => {
    const half = stickFromDrag(0, -(0.15 * R + 0.5 * 0.85 * R), R, false);
    expect(half.y).toBeCloseTo(0.5, 5);
    expect(half.x).toBeCloseTo(0, 5);
    const full = stickFromDrag(R, 0, R, false);
    expect(full.x).toBeCloseTo(1, 5);
    expect(full.run).toBe(false);
    const diag = stickFromDrag(R, R, R, false);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1, 5);
    expect(diag.y).toBeLessThan(0); // 下へなぞると後ろ
    // R の手前は 1 より小さい（全力で倒さなくても歩きの最高速は R で出る）
    expect(stickFromDrag(0.9 * R, 0, R, false).mag).toBeLessThan(1);
  });

  it('1.4R を越えると走り、1.25R 未満に戻るまで走りのまま（ヒステリシス）', () => {
    expect(stickFromDrag(1.39 * R, 0, R, false).run).toBe(false);
    expect(stickFromDrag(1.4 * R, 0, R, false).run).toBe(true);
    // 走っている間は 1.3R でも走り
    expect(stickFromDrag(1.3 * R, 0, R, true).run).toBe(true);
    expect(stickFromDrag(1.25 * R, 0, R, true).run).toBe(true);
    expect(stickFromDrag(1.24 * R, 0, R, true).run).toBe(false);
    // 歩いていたなら 1.3R は歩き
    expect(stickFromDrag(1.3 * R, 0, R, false).run).toBe(false);
  });

  it('つまみは 1.5R までしか動かない', () => {
    const o = stickFromDrag(0, -400, R, false);
    expect(Math.hypot(o.knobX, o.knobY)).toBeCloseTo(1.5 * R, 5);
    expect(o.y).toBeCloseTo(1, 5);
  });

  it('原点は縁から R＋8 以上離す', () => {
    const o = clampOrigin(3, 380, R, 844, 390);
    expect(o.x).toBe(R + S.edgeMargin);
    expect(o.y).toBe(390 - R - S.edgeMargin);
    const mid = clampOrigin(200, 200, R, 844, 390);
    expect(mid).toEqual({ x: 200, y: 200 });
  });
});

describe('小石ボタンの状態機械', () => {
  it('idle → 押す（hold・Q を押す）→ 250ms 以上で離す＝投げる', () => {
    const a = new AimButton();
    expect(a.press(0, 10, 10, 3)).toBe('down');
    expect(a.state).toBe('hold');
    expect(a.release(250)).toBe('up');
    expect(a.state).toBe('idle');
  });

  it('hold → 12px 以上動かして離す＝投げる（短くても）', () => {
    const a = new AimButton();
    a.press(0, 10, 10, 3);
    a.move(10, 22);
    expect(a.release(100)).toBe('up');
    expect(a.state).toBe('idle');
  });

  it('境の手前（249ms・11px）は、ちょん押し＝ねらいを保つ（latched）', () => {
    const a = new AimButton();
    a.press(0, 0, 0, 3);
    a.move(11, 0);
    expect(a.release(249)).toBe('none');
    expect(a.state).toBe('latched');
  });

  it('latched → もう一度押す＝投げる。その指を離しても何も起きない', () => {
    const a = new AimButton();
    a.press(0, 0, 0, 3);
    a.release(50);
    expect(a.press(1000, 0, 0, 3)).toBe('up');
    expect(a.state).toBe('idle');
    expect(a.release(1100)).toBe('none');
    expect(a.state).toBe('idle');
  });

  it('hold・latched → やめる＝投げない（cancel）。idle でのやめるは何もしない', () => {
    const a = new AimButton();
    a.press(0, 0, 0, 3);
    expect(a.cancel()).toBe('cancel');
    expect(a.state).toBe('idle');
    a.press(0, 0, 0, 3);
    a.release(10);
    expect(a.state).toBe('latched');
    expect(a.cancel()).toBe('cancel');
    expect(a.state).toBe('idle');
    expect(a.cancel()).toBe('none');
  });

  it('小石が 0 なら押しても始まらない', () => {
    const a = new AimButton();
    expect(a.press(0, 0, 0, 0)).toBe('none');
    expect(a.state).toBe('idle');
    expect(a.release(500)).toBe('none');
  });

  it('hold 中に別の指で押しても二重には始まらない', () => {
    const a = new AimButton();
    a.press(0, 0, 0, 3);
    expect(a.press(10, 0, 0, 3)).toBe('none');
    expect(a.state).toBe('hold');
  });
});

describe('視点ドラッグ', () => {
  it('4px 未満は無視し、越えたら前の位置からの差を出す', () => {
    const l = new LookDrag();
    l.start(100, 100);
    expect(l.move(103, 100)).toEqual({ dx: 0, dy: 0 });
    expect(l.move(106, 100)).toEqual({ dx: 6, dy: 0 });
    expect(l.move(110, 98)).toEqual({ dx: 4, dy: -2 });
  });
});

describe('InputState：物理キーとタッチ', () => {
  it('タッチで押すと held・押した瞬間が立ち、離すと離した瞬間が立つ', () => {
    const i = new InputState();
    i.touchKeyDown('KeyE');
    expect(i.held('interact')).toBe(true);
    expect(i.isDown('KeyE')).toBe(true);
    expect(i.consumeTickPress('interact')).toBe(true);
    expect(i.consumeFramePress('interact')).toBe(true);
    i.touchKeyUp('KeyE');
    expect(i.held('interact')).toBe(false);
    expect(i.consumeRelease('interact')).toBe(true);
  });

  it('物理が押したままのキーを、タッチが離しても押したまま（離した瞬間も立たない）', () => {
    const i = new InputState();
    i.injectKeyDown('KeyQ');
    // 物理の押した瞬間を先に取りきってから、タッチで押す（2026-11-03 独立レビュー：取る前だと、重ねて立つ不具合を見逃す）
    expect(i.consumeTickPress('aim')).toBe(true);
    expect(i.consumeFramePress('aim')).toBe(true);
    i.touchKeyDown('KeyQ');
    // 物理が先に押していたので、タッチの押下で二度目の押した瞬間は立たない
    expect(i.consumeTickPress('aim')).toBe(false);
    expect(i.consumeFramePress('aim')).toBe(false);
    i.touchKeyUp('KeyQ');
    expect(i.held('aim')).toBe(true);
    expect(i.isDown('KeyQ')).toBe(true);
    expect(i.consumeRelease('aim')).toBe(false);
    i.injectKeyUp('KeyQ');
    expect(i.held('aim')).toBe(false);
    expect(i.consumeRelease('aim')).toBe(true);
  });

  it('しゃがみ（C）を物理とタッチの両方で押しても、押した瞬間は1回だけ（2回切り替わらない）。順序が逆でも同じ', () => {
    const a = new InputState();
    a.injectKeyDown('KeyC');
    expect(a.consumeTickPress('crouch')).toBe(true);
    a.touchKeyDown('KeyC');
    expect(a.consumeTickPress('crouch')).toBe(false);
    const b = new InputState();
    b.touchKeyDown('KeyC');
    expect(b.consumeTickPress('crouch')).toBe(true);
    b.injectKeyDown('KeyC');
    expect(b.consumeTickPress('crouch')).toBe(false);
  });

  it('タッチが押したままのキーを、物理が離しても押したまま', () => {
    const i = new InputState();
    i.touchKeyDown('KeyQ');
    i.injectKeyDown('KeyQ');
    i.injectKeyUp('KeyQ');
    expect(i.held('aim')).toBe(true);
    expect(i.consumeRelease('aim')).toBe(false);
    i.touchKeyUp('KeyQ');
    expect(i.held('aim')).toBe(false);
    expect(i.consumeRelease('aim')).toBe(true);
  });

  it('スティックは -1〜1 に切られ、走りは held("run") に入る。releaseAll で 0', () => {
    const i = new InputState();
    i.injectStick(2, -3, false);
    expect(i.stick()).toEqual({ x: 1, y: -1, run: false });
    expect(i.held('run')).toBe(false);
    i.injectStick(0, 1, true);
    expect(i.held('run')).toBe(true);
    i.touchKeyDown('KeyC');
    i.releaseAll();
    expect(i.stick()).toEqual({ x: 0, y: 0, run: false });
    expect(i.held('run')).toBe(false);
    expect(i.held('crouch')).toBe(false);
  });

  it('スティックに NaN・無限大が入っても 0 に落とす（移動の入力へ NaN を流さない）', () => {
    const i = new InputState();
    i.injectStick(NaN, Infinity, false);
    expect(i.stick()).toEqual({ x: 0, y: 0, run: false });
    i.injectStick(-Infinity, NaN, true);
    expect(i.stick()).toEqual({ x: 0, y: 0, run: true });
  });

  it('releaseTouch はタッチ側だけを離し、物理キーは残す', () => {
    const i = new InputState();
    i.injectKeyDown('KeyW');
    i.touchKeyDown('KeyF');
    i.injectStick(0.5, 0.5, false);
    i.releaseTouch();
    expect(i.held('forward')).toBe(true);
    expect(i.held('attack')).toBe(false);
    expect(i.stick()).toEqual({ x: 0, y: 0, run: false });
  });
});
