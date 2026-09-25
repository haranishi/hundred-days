import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialUi, onTap, onButton, onCrash, onResult, onHide, onTick, isResultReady, TIMING } from '../../lib/state.js';

test('待機→飛行→墜落→結果→待機の順に進む', () => {
  let ui = initialUi();
  let r = onTap(ui, 0);
  assert.equal(r.action, 'start');
  ui = r.ui;
  assert.equal(ui.screen, 'flying');
  assert.equal(onTap(ui, 0.1).action, 'flap');
  ui = onCrash(ui, 2);
  assert.equal(ui.screen, 'crashing');
  assert.equal(onTap(ui, 2.1).action, 'none', '墜落中のタップは無視');
  ui = onResult(ui, 3);
  assert.equal(ui.screen, 'result');
  r = onTap(ui, 3 + TIMING.inputLock + 0.01);
  assert.equal(r.action, 'retry');
  assert.equal(r.ui.screen, 'title');
});

test('結果が出てから0.5秒は、タップももう一回ボタンも受けない', () => {
  const ui = onResult(onCrash(onTap(initialUi(), 0).ui, 1), 2);
  assert.equal(onTap(ui, 2.49).action, 'none');
  assert.equal(onButton(ui, 'retry', 2.49).action, 'none');
  assert.equal(isResultReady(ui, 2.49), false);
  assert.equal(isResultReady(ui, 2.5), true);
  assert.equal(onTap(ui, 2.5).action, 'retry');
});

test('シェアとねこのボタンは再挑戦にならず、開いている間のタップも無視', () => {
  const ui = onResult(onCrash(onTap(initialUi(), 0).ui, 1), 2);
  const s = onButton(ui, 'share', 3);
  assert.equal(s.action, 'open-share');
  assert.equal(s.ui.screen, 'result');
  assert.equal(onTap(s.ui, 3.2).action, 'none');
  const c = onButton(onButton(s.ui, 'close', 3.3).ui, 'cats', 3.4);
  assert.equal(c.action, 'open-cats');
  assert.equal(c.ui.screen, 'result');
  assert.equal(onButton(c.ui, 'close', 3.5).ui.panel, null);
});

test('タブが隠れたら飛行中だけ止まり、タップ後1秒の猶予で再開する', () => {
  let ui = onTap(initialUi(), 0).ui;
  ui = onHide(ui);
  assert.equal(ui.paused, true);
  assert.equal(onTick(ui, 50).action, 'none', 'タップするまで再開しない');
  const g = onTap(ui, 60);
  assert.equal(g.action, 'grace');
  ui = g.ui;
  assert.equal(onTap(ui, 60.5).action, 'none', '猶予中のタップは無視');
  assert.equal(onTick(ui, 60.99).action, 'none');
  const r = onTick(ui, 61);
  assert.equal(r.action, 'resume');
  assert.equal(r.ui.paused, false);
  assert.equal(onTap(r.ui, 61.1).action, 'flap');
});

test('待機中や結果でタブが隠れても止めるものはない', () => {
  assert.equal(onHide(initialUi()).paused, false);
});

test('このゲームの共有（100日チャレンジ共通の欄）はタイトルからだけ開き、開いている間のタップは無視', () => {
  const title = initialUi();
  const opened = onButton(title, 'app-share', 0);
  assert.equal(opened.action, 'open-app-share');
  assert.equal(opened.ui.panel, 'app-share');
  assert.equal(opened.ui.screen, 'title');
  assert.equal(onTap(opened.ui, 0.1).action, 'none', '開いている間に飛び始めない');
  assert.equal(onButton(opened.ui, 'close', 0.2).ui.panel, null);
  const flying = onTap(title, 0).ui;
  assert.equal(onButton(flying, 'app-share', 0.1).action, 'none', '飛行中は開かない');
  const result = onResult(onCrash(flying, 1), 2);
  assert.equal(onButton(result, 'app-share', 3).action, 'none', '結果画面は自分の記録のシェアを使う');
});
