/* 集中タイマー — Day 001
 * 外部通信なし / 外部ライブラリなし / 永続化なし。
 *
 * 設計メモ:
 *  - 残り時間は「終了時刻(endAt)との差」で毎回計算する。setIntervalの遅延や
 *    バックグラウンドタブでの間引きがあっても時間がずれない。
 *  - 状態は idle / running / paused / finished の4つだけ。遷移は下の関数のみが行う。
 */
'use strict';

(function () {
  // ---- 定数 ----
  var TICK_MS = 200;            // 表示更新の間隔
  var MAX_MINUTES = 600;        // 自由入力の上限（10時間）
  var DEFAULT_MINUTES = 25;

  var STATUS_TEXT = {
    idle: '準備OK。「開始」を押してください',
    running: '集中中…',
    paused: '一時停止中',
    finished: '終了！お疲れさまでした'
  };

  // ---- DOM ----
  var timeEl = document.getElementById('time');
  var statusEl = document.getElementById('status');
  var presetsEl = document.getElementById('presets');
  var presetButtons = Array.prototype.slice.call(
    presetsEl.querySelectorAll('.btn--preset')
  );
  var customInput = document.getElementById('custom-minutes');
  var customApplyBtn = document.getElementById('custom-apply');
  var customErrorEl = document.getElementById('custom-error');
  var startBtn = document.getElementById('start');
  var pauseBtn = document.getElementById('pause');
  var resetBtn = document.getElementById('reset');

  // ---- 状態 ----
  var state = 'idle';                            // idle | running | paused | finished
  var durationMs = DEFAULT_MINUTES * 60 * 1000;  // セットされた長さ
  var remainingMs = durationMs;                  // 停止中の残り時間
  var endAt = 0;                                 // running中の終了時刻(ms epoch)
  var tickId = null;                             // setIntervalのID（nullなら未起動）

  // ------------------------------------------------------------------
  // 表示
  // ------------------------------------------------------------------
  function formatTime(ms) {
    var totalSec = Math.ceil(Math.max(0, ms) / 1000);
    var m = Math.floor(totalSec / 60);
    var s = totalSec % 60;
    return (m < 10 ? '0' + m : String(m)) + ':' + (s < 10 ? '0' + s : String(s));
  }

  // 現在の残り時間。running中はendAtから逆算するのでズレない。
  function currentRemaining() {
    if (state === 'running') {
      return Math.max(0, endAt - Date.now());
    }
    return Math.max(0, remainingMs);
  }

  // 数字だけの更新。1秒に数回呼ばれるので、ここでは他のDOMを触らない
  // （aria-liveのステータス欄を毎回書き換えると読み上げが騒がしくなるため）。
  var lastTimeText = '';
  function renderTime() {
    var text = formatTime(currentRemaining());
    if (text === lastTimeText) return;   // 表示が変わらないときは書き換えない
    timeEl.textContent = text;
    lastTimeText = text;
  }

  // 状態が変わったときだけ呼ぶ。
  function render() {
    var running = (state === 'running');

    renderTime();
    statusEl.textContent = STATUS_TEXT[state];
    document.body.dataset.state = state;

    startBtn.textContent = (state === 'paused') ? '再開' : '開始';
    startBtn.disabled = running;
    pauseBtn.disabled = !running;
    // idle（＝残り時間がセットしたまま手つかず）のときだけリセットは無意味
    resetBtn.disabled = (state === 'idle');

    // 走っている最中に時間を変えて進行が消えるのを防ぐ
    presetButtons.forEach(function (btn) { btn.disabled = running; });
    customInput.disabled = running;
    customApplyBtn.disabled = running;
  }

  // minutes に一致するプリセットだけを選択表示にする。
  // どれにも一致しない値（自由入力の端数など）を渡すと全部の選択が外れる。
  function markSelectedPreset(minutes) {
    presetButtons.forEach(function (btn) {
      var hit = (Number(btn.dataset.minutes) === minutes);
      btn.classList.toggle('is-selected', hit);
      btn.setAttribute('aria-pressed', hit ? 'true' : 'false');
    });
  }

  function showError(message) {
    if (message) {
      customErrorEl.textContent = message;
      customErrorEl.hidden = false;
    } else {
      customErrorEl.textContent = '';
      customErrorEl.hidden = true;
    }
  }

  // ------------------------------------------------------------------
  // 音（Web Audio APIで生成。音源ファイルは使わない）
  // ------------------------------------------------------------------
  var audioCtx = null;
  var liveOscillators = [];

  // ブラウザの自動再生制限があるため、必ずユーザー操作の中から呼ぶ。
  function ensureAudio() {
    try {
      if (!audioCtx) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audioCtx = new Ctx();
      }
      if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
        audioCtx.resume();
      }
    } catch (e) {
      audioCtx = null; // 音が出せなくてもタイマー本体は動かす
    }
  }

  function stopBeep() {
    liveOscillators.forEach(function (osc) {
      try { osc.stop(); } catch (e) { /* 停止済みなら無視 */ }
    });
    liveOscillators = [];
  }

  function playBeep() {
    ensureAudio();
    if (!audioCtx) return;

    var now = audioCtx.currentTime;
    var offsets = [0, 0.35, 0.7]; // ピッ・ピッ・ピッ

    offsets.forEach(function (offset) {
      var t0 = now + offset;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t0);

      // 0からのexponentialRampは不可なので極小値から立ち上げる（プチッというノイズ防止）
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(t0);
      osc.stop(t0 + 0.28);

      liveOscillators.push(osc);
      osc.onended = function () {
        var i = liveOscillators.indexOf(osc);
        if (i !== -1) liveOscillators.splice(i, 1);
        try { osc.disconnect(); gain.disconnect(); } catch (e) { /* noop */ }
      };
    });
  }

  // ------------------------------------------------------------------
  // タイマー本体
  // ------------------------------------------------------------------
  function startTicking() {
    stopTicking();                       // 二重起動の防止（必ず先に止める）
    tickId = window.setInterval(tick, TICK_MS);
  }

  function stopTicking() {
    if (tickId !== null) {
      window.clearInterval(tickId);
      tickId = null;
    }
  }

  function tick() {
    if (state !== 'running') {           // 想定外の残存インターバルへの保険
      stopTicking();
      return;
    }
    if (endAt - Date.now() <= 0) {
      finish();
      return;
    }
    renderTime();
  }

  function setDuration(ms) {
    stopTicking();
    stopBeep();
    durationMs = ms;
    remainingMs = ms;
    endAt = 0;
    state = 'idle';
    showError('');
    render();
  }

  function start() {
    if (state === 'running') return;     // 二重スタートの防止
    stopBeep();

    // 終了後・0秒からの再スタートはセットした長さに戻してから始める
    if (state === 'finished' || remainingMs <= 0) {
      remainingMs = durationMs;
    }
    if (remainingMs <= 0) return;        // 念のため（0分はセットできない想定）

    ensureAudio();                       // クリック（ユーザー操作）の中で音を解禁しておく
    endAt = Date.now() + remainingMs;
    state = 'running';
    startTicking();
    render();
  }

  function pause() {
    if (state !== 'running') return;

    var rest = endAt - Date.now();
    if (rest <= 0) {   // 0になった直後に押された場合は「一時停止」ではなく終了扱い
      finish();
      return;
    }

    remainingMs = rest;
    endAt = 0;
    stopTicking();
    state = 'paused';
    render();
  }

  function reset() {
    stopTicking();
    stopBeep();
    remainingMs = durationMs;
    endAt = 0;
    state = 'idle';
    render();
  }

  function finish() {
    stopTicking();
    remainingMs = 0;
    endAt = 0;
    state = 'finished';
    render();
    playBeep();
  }

  // ------------------------------------------------------------------
  // 入力
  // ------------------------------------------------------------------
  function applyCustomMinutes() {
    var raw = customInput.value.trim();
    if (raw === '') {
      showError('分を入力してください');
      return;
    }

    var minutes = Number(raw);
    if (!isFinite(minutes) || minutes <= 0) {
      showError('1以上の数字を入力してください');
      return;
    }
    if (minutes > MAX_MINUTES) {
      showError(MAX_MINUTES + '分までにしてください');
      return;
    }

    var ms = Math.max(1000, Math.round(minutes * 60) * 1000); // 秒単位に丸める
    setDuration(ms);
    markSelectedPreset(minutes); // 同じ値のプリセットがあれば選択表示を合わせる
  }

  presetButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var minutes = Number(btn.dataset.minutes);
      if (!isFinite(minutes) || minutes <= 0) return;
      setDuration(minutes * 60 * 1000);
      markSelectedPreset(minutes);
    });
  });

  customApplyBtn.addEventListener('click', applyCustomMinutes);

  customInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      applyCustomMinutes();
    }
  });

  startBtn.addEventListener('click', start);
  pauseBtn.addEventListener('click', pause);
  resetBtn.addEventListener('click', reset);

  // キーボードショートカット。入力欄やボタンにフォーカスがあるときは
  // ブラウザ既定の動作（スペースでボタン押下など）と二重にならないよう無視する。
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'BUTTON' ||
              t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      return;
    }

    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (state === 'running') { pause(); } else { start(); }
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      reset();
    }
  });

  // タブに戻ってきたときは、次のtickを待たずに表示を最新化する
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') return;
    if (state === 'running' && endAt - Date.now() <= 0) {
      finish();
    } else {
      renderTime();
    }
  });

  // ---- 初期表示 ----
  markSelectedPreset(DEFAULT_MINUTES);
  render();
})();
