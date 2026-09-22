import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY, sealCount } from '../lib/store.js';
import { loadApp } from './helpers.mjs';

// 面の頭から自動操作で戸口まで進める。mode が変わったら止める。
function play(api, id, limit = 12000) {
  api.begin(id);
  api.setManual(true);
  api.autopilot(true);
  for (let i = 0; i < limit && api.mode() === 'playing'; i++) api.advance(1000 / 120);
  api.autopilot(false);
  return api.mode();
}

test('操作窓口は状態を観測し、全解放を保存して各面を開始できる', () => {
  const { api, stored } = loadApp();
  assert.equal(api.mode(), 'title');
  api.unlockAll();
  assert.equal(JSON.parse(stored.get(KEY)).unlockedWorld, 4);
  api.begin('4-5');
  assert.equal(api.mode(), 'playing');
  const snapshot = api.snapshot();
  assert.equal(snapshot.id, '4-5');
  assert.equal(snapshot.stage, 0);
  assert.equal(snapshot.lives, 3);
  assert.equal(snapshot.mochi, 0);
  assert.equal(snapshot.rice, 0);
  assert.equal(snapshot.status, 'playing');
  assert.equal(snapshot.seconds, 0);
  snapshot.x = -999;
  assert.notEqual(api.snapshot().x, -999);
});

test('観測窓口はv2の面内得点・米俵・能力・連続踏みも返す', () => {
  const { api } = loadApp();
  api.begin('1-1');
  const snapshot = api.snapshot();
  for (const key of ['attemptScore', 'collectedRice', 'secret', 'ability', 'abilityTicks', 'combo', 'seals'])
    assert.ok(key in snapshot, key);
  assert.equal(snapshot.collectedRice, 0);
  assert.equal(snapshot.ability, null);
  assert.equal(snapshot.combo, 0);
});

test('自動入力は実キーを上書きし、空入力で停止、nullで実キーに戻る', () => {
  const { api, handlers, frame } = loadApp();
  api.begin('1-1');
  handlers.get('keydown')({ code: 'ArrowLeft', preventDefault() {} });
  const next = { right: true };
  api.setInput(next);
  next.right = false;
  frame(1000);
  frame(1300);
  const moved = api.snapshot();
  assert.ok(moved.x > 16);
  assert.equal(moved.seconds, 0.3);
  api.setInput({});
  frame(1500);
  const stopped = api.snapshot().x;
  frame(1700);
  assert.equal(api.snapshot().x, stopped);
  api.setInput(null);
  frame(1900);
  assert.ok(api.snapshot().x < stopped);
});

test('戸口に着くとv2の記録が1面ぶん保存され、お札は0〜3枚に収まる', () => {
  const { api, stored } = loadApp();
  assert.equal(play(api, '1-1'), 'clear');
  const saved = JSON.parse(stored.get(KEY));
  assert.equal(saved.rulesVersion, 2);
  const record = saved.recordsV2['1-1'];
  assert.ok(record, '1-1 の記録がある');
  assert.ok(Number.isSafeInteger(record.bestTicks) && record.bestTicks > 0);
  assert.ok(Number.isSafeInteger(record.bestScore) && record.bestScore >= 0);
  assert.ok(sealCount(record.seals) >= 0 && sealCount(record.seals) <= 3);
  assert.deepEqual(Object.keys(saved.recordsV2), ['1-1']);
  assert.equal(saved.unlockedWorld, 1, '1面目のクリアでは次の土地を開けない');
});

test('5面目を終えると次の土地が開き、記録は積み上がる', () => {
  const { api, stored } = loadApp();
  api.unlockAll();
  assert.equal(play(api, '1-5'), 'clear');
  const saved = JSON.parse(stored.get(KEY));
  assert.equal(saved.unlockedWorld, 4);
  assert.ok(saved.recordsV2['1-5'].bestTicks > 0);
  // もう一度走らせても記録は1件のまま上書きされる。
  assert.equal(play(api, '1-5'), 'clear');
  assert.deepEqual(Object.keys(JSON.parse(stored.get(KEY)).recordsV2), ['1-5']);
});

test('最後の面を終えても結果画面で止まり、窓口は壊れない', () => {
  const { api, stored } = loadApp();
  api.unlockAll();
  assert.equal(play(api, '4-5'), 'clear');
  assert.ok(JSON.parse(stored.get(KEY)).recordsV2['4-5'].bestTicks > 0);
  assert.equal(api.snapshot().status, 'clear');
});

// 右を押し続けるだけで、丘を駆け下りて最初の雪うさぎを踏む（導入で「踏む」を必ず通る）。
test('1-1は右を押し続けるだけで雪うさぎを踏み、反動で上の棚へ上がれる', () => {
  const { api } = loadApp();
  api.begin('1-1');
  api.setManual(true);
  api.setInput({ right: true });
  let stomped = null;
  for (let i = 0; i < 241 && api.mode() === 'playing'; i++) {
    api.advance(1000 / 120);
    if (stomped === null && api.snapshot().combo >= 1) stomped = i;
  }
  assert.ok(stomped !== null && stomped < 300, `踏みが2.5秒以内に起きる（${stomped}）`);
  // 踏んだところで跳躍を保持すると、反動(-220)で上段（上面144px）へ届く。
  api.setInput({ right: true, jump: true });
  for (let i = 0; i < 150 && api.mode() === 'playing'; i++) api.advance(1000 / 120);
  api.setInput({ right: true });
  for (let i = 0; i < 400 && api.mode() === 'playing'; i++) api.advance(1000 / 120);
  const snapshot = api.snapshot();
  assert.equal(snapshot.collectedRice, 6, '上段の米俵3個も取れている');
  assert.equal(snapshot.secret, true, '任意餅も取れている');
});

test('面の頭の1行説明は、1-1では踏みの手段を最初のうさぎが見えるうちに出す', () => {
  const { api } = loadApp();
  api.begin('1-1');
  api.setManual(true);
  api.setInput({ right: true });
  assert.match(api.snapshot().lesson, /進む/);
  for (let i = 0; i < 200; i++) api.advance(1000 / 120);
  // 200tick＝1.67秒。踏みは240tick付近なので、その手前で手段が読める。
  assert.match(api.snapshot().lesson, /踏むとはずむ.*上の棚/);
});

test('戸口に着くと得点の浮き文字は消え、結果には面内得点だけが残る', () => {
  const { api } = loadApp();
  assert.equal(play(api, '1-1'), 'clear');
  const snapshot = api.snapshot();
  assert.equal(snapshot.pops, 0, 'clear の刻みで浮き文字を全部消す');
  assert.equal(snapshot.status, 'clear');
  assert.ok(snapshot.attemptScore > 0);
});
