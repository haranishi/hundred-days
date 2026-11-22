// 状態遷移（lib/app-state.js）の単体試験。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advancePlayback, cloneState, createInitialState, cycleView, enterPractice, exitPractice,
  nextStep, prevStep, recordBest, sanitizeState, selectSpecies, setLabels, setLeftHanded,
  setPlaying, setProgressU, setQuality, setSpeed, setStep, setView, toggleLabels,
  toggleLeftHanded, toggleLoop, togglePlaying, toggleSpeed, toggleXray,
} from '../../lib/app-state.js';

test('app-state: 初期状態は契約の既定値を持つ', () => {
  const s = createInitialState();
  assert.equal(s.species, 'aji');
  assert.equal(s.step, 0);
  assert.equal(s.u, 0);
  assert.equal(s.playing, false);
  assert.equal(s.speed, 1);
  assert.equal(s.loop, true);
  assert.equal(s.mode, 'guide');
  assert.equal(s.view, 'cook');
  assert.equal(s.xray, false);
  assert.equal(s.labels, false);
  assert.equal(s.leftHanded, false);
  assert.equal(s.quality, 'auto');
  assert.deepEqual(s.progress, {});
  assert.deepEqual(s.best, {});
});

test('app-state: 手順の前後と端（先頭で止まり、末尾の次へは finished=true）', () => {
  let s = createInitialState();
  const prevAtZero = prevStep(s, 6);
  assert.equal(prevAtZero.atStart, true);
  assert.equal(prevAtZero.state.step, 0);

  let r = nextStep(s, 6, { autoPlay: true, reducedMotion: false });
  assert.equal(r.finished, false);
  assert.equal(r.state.step, 1);
  assert.equal(r.state.playing, true);
  assert.equal(r.state.progress.aji, 1);

  // 動きを減らす設定では自動再生しない
  r = nextStep(r.state, 6, { autoPlay: true, reducedMotion: true });
  assert.equal(r.state.step, 2);
  assert.equal(r.state.playing, false);

  // 末尾に到達してから次へ
  s = setStep(r.state, 5, 6);
  assert.equal(s.step, 5);
  const end = nextStep(s, 6);
  assert.equal(end.finished, true);
  assert.equal(end.state.step, 5);
  assert.equal(end.state.playing, false);

  // 範囲外は丸められる
  assert.equal(setStep(s, 99, 6).step, 5);
  assert.equal(setStep(s, -5, 6).step, 0);
});

test('app-state: 魚の変更で進捗が魚ごとに保持され、未知の魚は無視する', () => {
  let s = createInitialState();
  s = setStep(s, 3, 6);
  assert.equal(s.progress.aji, 3);

  s = selectSpecies(s, 'saba', { stepCount: 10 });
  assert.equal(s.species, 'saba');
  assert.equal(s.step, 0);
  assert.equal(s.progress.aji, 3);
  assert.equal(s.progress.saba, 0);

  // アジに戻すと保存済みの手順3に戻る
  s = selectSpecies(s, 'aji', { stepCount: 6 });
  assert.equal(s.species, 'aji');
  assert.equal(s.step, 3);

  // 未知の種IDは状態を変えない
  const same = selectSpecies(s, 'unicorn', { stepCount: 6 });
  assert.equal(same, s);
});

test('app-state: 再生の進行・ループ・一時停止・進み具合の範囲制限', () => {
  let s = setPlaying(createInitialState({ loop: true, speed: 1 }), true);
  s = advancePlayback(s, 3000, 6000);
  assert.ok(Math.abs(s.u - 0.5) < 1e-9);
  assert.equal(s.playing, true);

  // 0.5倍速
  s = toggleSpeed(s);
  assert.equal(s.speed, 0.5);
  s = advancePlayback(s, 3000, 6000);
  assert.ok(Math.abs(s.u - 0.75) < 1e-9);

  // ループONで1.0を超えると折り返す
  s = advancePlayback(s, 6000, 6000);
  assert.ok(s.u >= 0 && s.u < 1);
  assert.equal(s.playing, true);

  // ループOFFで1.0に達すると停止する
  s = toggleLoop(setSpeed(setProgressU(s, 0.9), 1));
  assert.equal(s.loop, false);
  s = advancePlayback(s, 2000, 6000);
  assert.equal(s.u, 1);
  assert.equal(s.playing, false);

  // 末尾で再生トグルを押すと 0 に戻って再生開始
  s = togglePlaying(s);
  assert.equal(s.u, 0);
  assert.equal(s.playing, true);

  // NaN や範囲外の u は安全に丸める
  assert.equal(setProgressU(s, Number.NaN).u, 0);
  assert.equal(setProgressU(s, 5).u, 1);
  assert.equal(setProgressU(s, -2).u, 0);
});

test('app-state: 左利き・透視・ラベル・視点・画質の切替', () => {
  let s = createInitialState();
  s = toggleLeftHanded(s);
  assert.equal(s.leftHanded, true);
  s = setLeftHanded(s, false);
  assert.equal(s.leftHanded, false);

  s = toggleXray(s);
  assert.equal(s.xray, true);
  s = toggleLabels(s);
  assert.equal(s.labels, true);
  s = setLabels(s, false);
  assert.equal(s.labels, false);

  assert.equal(s.view, 'cook');
  s = cycleView(s);
  assert.equal(s.view, 'side');
  s = cycleView(s);
  assert.equal(s.view, 'top');
  s = cycleView(s);
  assert.equal(s.view, 'cook');
  assert.equal(setView(s, 'invalid').view, 'cook');

  s = setQuality(s, 'high');
  assert.equal(s.quality, 'high');
  assert.equal(setQuality(s, 'ultra').quality, 'high');
});

test('app-state: 練習の開始と終了、ベスト得点の更新（上回ったときだけ）', () => {
  let s = setPlaying(createInitialState(), true);
  // 練習が無い手順では入らない
  assert.equal(enterPractice(s, false).mode, 'guide');

  // 練習に入ると再生は止まる
  s = enterPractice(s, true);
  assert.equal(s.mode, 'practice');
  assert.equal(s.playing, false);

  // 初回記録
  let r = recordBest(s, 'aji', 'head', 78);
  assert.equal(r.improved, true);
  assert.equal(r.previousBest, null);
  assert.equal(r.bestScore, 78);
  s = r.state;
  assert.equal(s.best.aji.head, 78);

  // 低い点では上書きされない
  r = recordBest(s, 'aji', 'head', 65);
  assert.equal(r.improved, false);
  assert.equal(r.previousBest, 78);
  assert.equal(r.bestScore, 78);
  assert.equal(r.state.best.aji.head, 78);

  // 高い点で更新される
  r = recordBest(s, 'aji', 'head', 92);
  assert.equal(r.improved, true);
  assert.equal(r.previousBest, 78);
  assert.equal(r.bestScore, 92);
  s = r.state;
  assert.equal(s.best.aji.head, 92);

  // 練習終了
  s = exitPractice(s);
  assert.equal(s.mode, 'guide');

  // cloneState は独立したコピーを返す
  const cp = cloneState(s);
  cp.best.aji.head = 0;
  assert.equal(s.best.aji.head, 92);

  // sanitizeState は壊れた値を安全に戻す
  const clean = sanitizeState({ species: 'bad', step: -3, speed: 99, view: 'fly', progress: { aji: 2, nope: 1 }, best: { aji: { head: 150, gut: 84 } } });
  assert.equal(clean.species, 'aji');
  assert.equal(clean.step, 0);
  assert.equal(clean.speed, 1);
  assert.equal(clean.view, 'cook');
  assert.deepEqual(clean.progress, { aji: 2 });
  assert.deepEqual(clean.best, { aji: { gut: 84 } });
});
