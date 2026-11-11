import { it, expect } from 'vitest';
import { hudContent, createHudTracker, CRASH_REASONS, STEP_HINTS, LANDING_NOTES, BOUNDS_NOTE } from '../../src/ui/hud.js';
const state = { speed: 10, pos: { y: 1523.3 }, mode: 'carve' };
// 採点 1 周目：何か1つ操作すると案内が全部消え、制動とジャンプの説明が二度と出なかった。まだやっていない操作を順に出す
it('速度と標高を常時表示し、まだやっていない操作を1つずつ案内して、全部やったら消す', () => {
  const h = createHudTracker(); expect(h.update({ state }).message).toContain('左右キー');
  let m = h.update({ state, input: { steer: .3 } });
  expect(m.message).toContain('制動'); expect(m.message).not.toContain('左右キー'); expect(m.speed).toBe('36'); expect(m.altitude).toBe('1523');
  expect(h.update({ state }).message).toContain('制動'); // 入力を離しても、次の案内は残る
  m = h.update({ state, input: { brake: 1 } }); expect(m.message).toContain('ジャンプ');
  m = h.update({ state, input: { jump: true } }); expect(m.message).toContain('低い姿勢');
  m = h.update({ state, input: { tuck: 1 } }); expect(m.message).toBe('');
  expect(h.update({ state }).message).toBe('');
});
it('順番を飛ばして操作しても、残っている操作だけを案内する・案内OFFでは出さない・端末ごとの言葉を使う', () => {
  const h = createHudTracker();
  expect(h.update({ state, input: { jump: true } }).message).toContain('左右キー'); // 曲がるがまだ
  expect(h.update({ state, input: { steer: -.5 } }).message).toContain('制動'); // ジャンプは済んでいるので飛ばす先は制動
  expect(h.update({ state, input: { brake: .5 } }).message).toContain('低い姿勢');
  expect(h.update({ state, hints: false }).message).toBe('');
  const t = createHudTracker(); t.update({ state, input: { steer: 1 }, device: 'touch' });
  expect(t.update({ state, device: 'touch' }).message).toBe(STEP_HINTS.touch.brake);
});
it('はっきり飛んだ後の着地だけ、良し悪しを短く知らせる', () => {
  const h = createHudTracker(), air = { ...state, mode: 'air', air: { time: .6 } };
  h.update({ state: air, dt: .1 });
  // 物理は、着地の出来事に向きのずれ（yawDeg）を必ず付ける。ここは、向きが 40° ずれた着地
  expect(h.update({ state, dt: .1, events: [{ type: 'land', quality: 'sketchy', yawDeg: 40 }] }).message).toBe(LANDING_NOTES.sketchy);
  expect(h.update({ state, dt: 1 }).message).toBe(LANDING_NOTES.sketchy);
  expect(h.update({ state, dt: 1 }).message).not.toBe(LANDING_NOTES.sketchy); // 1.4 秒で消える
  // 小さな浮き（0.35 秒未満）では出さない
  h.update({ state: { ...air, air: { time: .2 } }, dt: .1 });
  expect(h.update({ state, dt: .1, events: [{ type: 'land', quality: 'clean' }] }).message).not.toBe(LANDING_NOTES.clean);
  // 転倒したら、転倒の理由を優先する
  h.update({ state: air, dt: .1 });
  const crash = { ...state, mode: 'crash' };
  expect(h.update({ state: crash, dt: .1, events: [{ type: 'land', quality: 'sketchy' }, { type: 'crash', reason: 'landing-sideways' }] }).message).toContain('横向き');
});
it('転倒4種は理由と復帰を色によらず示す・案内OFFでも表示', () => {
  for (const [reason, text] of Object.entries(CRASH_REASONS)) {
    const m = hudContent({ state: { ...state, mode: 'crash' }, reason, hints: false });
    expect(m.message).toContain(text); expect(m.message).toContain('戻れます'); expect(m.recover).toBe(true);
  }
});
it('数秒停止で動き出し方を出す・転倒理由を保持して復帰で消す', () => {
  const h = createHudTracker(), stopped = { ...state, speed: 0, mode: 'rest' };
  expect(h.update({ state: stopped, dt: 2 }).message).not.toContain('谷');
  expect(h.update({ state: stopped, dt: 1 }).message).toContain('谷');
  const crash = { ...stopped, mode: 'crash' };
  h.update({ state: crash, events: [{ type: 'crash', reason: 'tree' }] });
  expect(h.update({ state: crash }).message).toContain('木');
  expect(h.update({ state, hints: false }).message).toBe(''); h.reset(); expect(h.update({ state }).message).toContain('左右キー');
});
it('山の端に来たら、止まった理由と戻り方を 4 秒出す（案内OFFでも出す）', () => {
  const h = createHudTracker();
  const m = h.update({ state, dt: .1, events: [{ type: 'bounds' }], hints: false });
  expect(m.message).toContain(BOUNDS_NOTE); expect(m.message).toContain('戻れます');
  expect(h.update({ state, dt: 3, hints: false }).message).toContain(BOUNDS_NOTE);
  expect(h.update({ state, dt: 1.5, hints: false }).message).toBe('');
});
it('乱れた着地は、原因（向きのずれ／衝撃の大きさ）で文言を分ける', () => {
  // 採点 3 周目：まっすぐ無操作で浮いただけなのに「板の向きがずれた」と出た（実際の原因は衝撃の大きさ）
  const air = { ...state, mode: 'air', air: { time: .6 } };
  const h = createHudTracker(); h.update({ state: air, dt: .1 });
  expect(h.update({ state, dt: .1, events: [{ type: 'land', quality: 'sketchy', yawDeg: 1 }] }).message).toBe(LANDING_NOTES.rough);
  const g = createHudTracker(); g.update({ state: air, dt: .1 });
  expect(g.update({ state, dt: .1, events: [{ type: 'land', quality: 'sketchy', yawDeg: -40 }] }).message).toBe(LANDING_NOTES.sketchy);
  expect(LANDING_NOTES.rough).not.toContain('向き');
});
it('転んだときは、キーボードなら戻り方を 2 つ（直前へ・手前からやり直す）案内する。回しすぎでも意味の通る理由を出す', () => {
  const crashed = { mode: 'crash', speed: 0, pos: { y: 0 } };
  const keyboard = hudContent({ state: crashed, reason: 'landing-inverted', device: 'keyboard' }).message;
  expect(keyboard).toContain('E キー'); expect(keyboard).toContain('R キー'); expect(keyboard).toContain('回転が合わない'); expect(keyboard).not.toContain('回りきれず');
  const touch = hudContent({ state: crashed, reason: 'landing-hard', device: 'touch' }).message;
  expect(touch).toContain('直前の地点へ戻る'); expect(touch).not.toContain('R キー');
});
it('止まったときは、続け方（蹴って進む）と、終え方の両方を案内する。案内を消している人には、短い文だけ', () => {
  const stopped = { mode: 'carve', speed: 0, pos: { y: 0 } }, play = { canFinish: true };
  for (const [device, word] of [['keyboard', '上キー'], ['touch', '舵を上へ'], ['gamepad', 'スティックを上へ']]) {
    const message = hudContent({ state: stopped, play, device }).message;
    expect(message).toContain(word); expect(message).toContain('蹴って進みます'); expect(message).toContain('記録を見られます');
  }
  expect(hudContent({ state: stopped, play, hints: false }).message).not.toContain('蹴って');
  // 制動を押して止まっている間は、離すとどうなるかを案内する
  const held = hudContent({ state: stopped, play, braking: true }).message;
  expect(held).toContain('制動を離すと'); expect(held).toContain('記録を見られます');
});
it('スキーでは、平らな所の案内が「ストックで押して進む」になる（スノーボードは「蹴って進む」のまま）', () => {
  const stopped = { mode: 'carve', speed: 0, pos: { y: 0 } }, play = { canFinish: true };
  expect(hudContent({ state: stopped, play, gear: 'ski' }).message).toContain('ストックで押して進みます');
  expect(hudContent({ state: stopped, play, gear: 'board' }).message).toContain('蹴って進みます');
  expect(hudContent({ state: stopped, play }).message).not.toContain('ストック');
});
