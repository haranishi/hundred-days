import { AudioLoopPlayer } from './audio-loop.js';

export function initContinuousPlayback({ metronome, beforeStart }) {
  const $ = id => document.getElementById(id);
  const panel = $('continuous'), button = $('rhythm-toggle'), player = new AudioLoopPlayer();
  let state = 'idle', bpm = 110, generation = 0, frame = 0, beganAt = 0;
  let sentinel = null, wakeGeneration = 0, observedContext = null;
  const active = () => state === 'playing' || state === 'starting';
  const formatTime = seconds => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
  function setState(next, message) {
    state = next; panel.dataset.state = next;
    button.setAttribute('aria-pressed', String(next === 'playing'));
    button.textContent = next === 'playing' ? '■ アプリの音を止める' : next === 'starting' ? '準備を中止する' : next === 'interrupted' ? '▶ 音を再開する' : '▶ リズムを流す';
    $('rhythm-state').textContent = next === 'playing' ? '再生中' : next === 'starting' ? '準備中' : next === 'interrupted' ? '音声中断' : next === 'error' ? '再生できませんでした' : '停止中';
    $('rhythm-message').textContent = message;
  }
  async function releaseWake() {
    wakeGeneration++;
    const old = sentinel; sentinel = null;
    if (old) { try { await old.release(); } catch { /* OS may already have released it */ } }
  }
  async function requestWake() {
    if (state !== 'playing' || !$('keep-awake').checked || document.hidden) return;
    if (sentinel && !sentinel.released) return;
    if (!navigator.wakeLock?.request) { $('awake-status').textContent = '点灯維持は未対応です。画面を開いたままお使いください。'; return; }
    const token = ++wakeGeneration;
    $('awake-status').textContent = '画面の点灯維持を確認しています…';
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (token !== wakeGeneration || state !== 'playing' || document.hidden || !$('keep-awake').checked) { await lock.release(); return; }
      sentinel = lock; $('awake-status').textContent = '画面の点灯を維持しています。OSに解除される場合があります。';
      lock.addEventListener('release', () => {
        if (sentinel !== lock) return;
        sentinel = null;
        $('awake-status').textContent = '点灯維持が解除されました。画面を開いたままお使いください。';
      });
    } catch {
      if (token === wakeGeneration && state === 'playing') $('awake-status').textContent = '点灯維持を利用できません。端末の自動ロックに注意してください。';
    }
  }
  function draw() {
    if (state !== 'playing' || document.hidden) return;
    const elapsed = Math.max(0, Math.floor(metronome.context.currentTime - beganAt));
    $('rhythm-elapsed').textContent = formatTime(elapsed);
    $('sound-pulse').style.setProperty('--pulse', String(Math.max(0, 1 - player.beatPhase * 4)));
    frame = requestAnimationFrame(draw);
  }
  function onAudioState() {
    if (state === 'playing' && observedContext?.state !== 'running') {
      stop('通話や端末の状態によって音声が中断されました。音を再開するには、ボタンを押してください。', true);
    }
  }
  function stop(message = 'アプリの音を止めました。', interrupted = false) {
    generation++; player.stop(); cancelAnimationFrame(frame); releaseWake();
    observedContext?.removeEventListener('statechange', onAudioState); observedContext = null;
    $('sound-pulse').style.setProperty('--pulse', '0');
    $('awake-status').textContent = $('keep-awake').checked ? '再生中、対応端末では画面の点灯を維持します。' : '点灯維持はオフです。画面を開いたままお使いください。';
    setState(interrupted ? 'interrupted' : 'idle', message);
  }
  async function start() {
    const token = ++generation;
    beforeStart(); player.stop(); cancelAnimationFrame(frame);
    setState('starting', '音を準備しています。端末の音量も確認してください。');
    let ready;
    try { ready = await metronome.prepare(true); } catch { ready = false; }
    if (token !== generation) return;
    if (!ready || document.hidden) {
      setState('error', '音を開始できませんでした。画面を開き、端末の音量やブラウザの設定を確認して、もう一度お試しください。'); return;
    }
    try {
      player.play(metronome.context, { bpm, tone: $('rhythm-tone').value, volume: Number($('rhythm-volume').value) });
      beganAt = metronome.context.currentTime;
      observedContext = metronome.context;
      observedContext.addEventListener('statechange', onAudioState);
      $('rhythm-elapsed').textContent = '00:00';
      setState('playing', '止めるまでリズムが流れます。通報・AED・周囲の声が聞こえる音量で。');
      draw(); requestWake();
    } catch {
      stop(); setState('error', '音を準備できませんでした。もう一度お試しください。');
    }
  }
  function changeRhythm() {
    $('rhythm-bpm').textContent = String(bpm);
    $('sound-pulse').setAttribute('aria-label', `1分間に${bpm}回のリズム`);
    document.querySelectorAll('[data-rhythm-bpm]').forEach(node => node.setAttribute('aria-pressed', String(Number(node.dataset.rhythmBpm) === bpm)));
    if (state === 'playing') {
      try { player.play(metronome.context, { bpm, tone: $('rhythm-tone').value, volume: Number($('rhythm-volume').value) }); }
      catch { stop('音声を変更できませんでした。ボタンで再開してください。', true); }
    }
  }
  button.addEventListener('click', () => active() ? stop() : start());
  document.querySelectorAll('[data-rhythm-bpm]').forEach(node => node.addEventListener('click', () => { bpm = Number(node.dataset.rhythmBpm); changeRhythm(); }));
  $('rhythm-tone').addEventListener('change', changeRhythm);
  $('rhythm-volume').addEventListener('input', () => {
    $('rhythm-volume-value').textContent = `${$('rhythm-volume').value}%`;
    player.setVolume(Number($('rhythm-volume').value));
  });
  $('keep-awake').addEventListener('change', () => {
    if ($('keep-awake').checked) requestWake();
    else { releaseWake(); $('awake-status').textContent = '点灯維持はオフです。画面を開いたままお使いください。'; }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && active()) stop(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (state === 'starting') { stop('画面を離れたため、音声の準備を中止しました。'); return; }
      cancelAnimationFrame(frame); releaseWake();
      if (state === 'playing') $('awake-status').textContent = '別の画面やロック中の再生は保証されません。画面を戻して音を確認してください。';
      return;
    }
    if (state === 'playing') { onAudioState(); if (state === 'playing') { draw(); requestWake(); } }
  });
  window.addEventListener('pagehide', () => stop('ページを離れたため音を止めました。'));
  if (!navigator.wakeLock?.request) {
    $('keep-awake').checked = false; $('keep-awake').disabled = true;
    $('awake-status').textContent = '点灯維持は未対応です。画面を開いたままお使いください。';
  }
  return { stop, get isActive() { return active(); }, get state() { return state; } };
}
