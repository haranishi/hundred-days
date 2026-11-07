// 再生の進み方だけを持つ。DOMも three.js も折りエンジンも知らない（Nodeで試験できる）。
//
// 1手順の中は「案内 → 動き → 余韻」の3つに分かれる。
//   guide : 折り線と矢印を見せて止まっている（t=0）
//   move  : 紙が動く（t が 0→1）
//   dwell : 折り終わった姿勢で少し止まる（t=1）。終わると次の手順の guide へ
// 「手順ごとに止める」（stepStop）では、dwell の終わりで次へ進まず、その手順の終点で止まる。
//   手元で一緒に折る人が、折り終えてから「再生」で次へ進めるようにするため。
// 動きを減らす設定（reduced）のときは動かさず、各手順の終点（t=1）を hold で見せて次へ進む。

export const GUIDE_MS = 600;
export const DWELL_MS = 350;
export const REDUCED_HOLD_MS = 1600;
export const SPEEDS = [0.5, 1, 2];

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createTimeline({
  durations,
  guideMs = GUIDE_MS,
  dwellMs = DWELL_MS,
  holdMs = REDUCED_HOLD_MS,
  reduced = false,
  stepStop = false,
} = {}) {
  if (!Array.isArray(durations) || durations.length === 0) throw new Error('timeline: durations が空です');
  const n = durations.length;
  const dur = durations.map((d) => (Number.isFinite(d) && d > 0 ? d : 1500));

  let step = 0;
  let t = reduced ? 1 : 0;
  let phase = 'idle';
  let elapsed = 0;
  let playing = false;
  let finished = false;
  let speed = 1;
  let isReduced = reduced;
  let stopEachStep = !!stepStop;
  let version = 0;

  const bump = () => { version += 1; };

  function startPhaseForPlay() {
    if (isReduced) { t = 1; phase = 'hold'; elapsed = 0; return; }
    if (t <= 0) { t = 0; phase = 'guide'; elapsed = 0; }
    else if (t < 1) { phase = 'move'; elapsed = 0; }
    else { phase = 'dwell'; elapsed = 0; }
  }

  function finish() {
    step = n - 1; t = 1; finished = true; playing = false; phase = 'idle'; elapsed = 0;
  }

  function goto(i) {
    step = clamp(Math.trunc(i), 0, n - 1);
    t = isReduced ? 1 : 0;
    finished = false;
    if (playing) startPhaseForPlay(); else { phase = 'idle'; elapsed = 0; }
    bump();
  }

  const api = {
    get length() { return n; },

    play() {
      if (finished) { step = 0; t = isReduced ? 1 : 0; finished = false; }
      // 手順の終点で止まっていたら、次の手順から始める（余韻をもう一度待たせない）
      else if (!isReduced && t >= 1 && step < n - 1) { step += 1; t = 0; }
      playing = true;
      startPhaseForPlay();
      bump();
    },

    pause() {
      if (!playing) return;
      playing = false; phase = 'idle'; elapsed = 0;
      bump();
    },

    toggle() { if (playing) api.pause(); else api.play(); },

    // 経過時間（ミリ秒）を進める。変化があれば true
    tick(dtMs) {
      if (!playing || !(dtMs > 0)) return false;
      let left = dtMs * speed;
      let guard = 0;
      while (left > 0 && playing && guard++ < 64) {
        if (phase === 'guide') {
          const need = guideMs - elapsed;
          if (left < need) { elapsed += left; left = 0; break; }
          left -= need; phase = 'move'; elapsed = 0;
        } else if (phase === 'move') {
          const need = (1 - t) * dur[step];
          if (left < need) { t += left / dur[step]; left = 0; break; }
          left -= need; t = 1; phase = 'dwell'; elapsed = 0;
        } else if (phase === 'dwell' || phase === 'hold') {
          const limit = phase === 'hold' ? holdMs : dwellMs;
          const need = limit - elapsed;
          if (left < need) { elapsed += left; left = 0; break; }
          left -= need;
          if (step >= n - 1) { finish(); break; }
          if (stopEachStep) {
            if (phase === 'hold') step += 1;
            t = 1; playing = false; phase = 'idle'; elapsed = 0;
            break;
          }
          step += 1; elapsed = 0;
          if (isReduced) { t = 1; phase = 'hold'; } else { t = 0; phase = 'guide'; }
        } else {
          break;
        }
      }
      bump();
      return true;
    },

    next() {
      if (step < n - 1) goto(step + 1);
      else { finish(); bump(); }
    },

    // 手順の途中なら、その手順の始まりへ。始まりにいるなら1つ前の手順の始まりへ
    prev() {
      if (finished) { goto(n - 1); return; }
      if (!isReduced && t > 0.001) { goto(step); return; }
      goto(step - 1);
    },

    goto,

    // つまみ: 0〜n の通し位置。整数が手順の境目。触ったら再生は止める
    seek(position) {
      const g = clamp(Number(position) || 0, 0, n);
      playing = false; phase = 'idle'; elapsed = 0;
      if (g >= n) { step = n - 1; t = 1; finished = true; }
      else { step = Math.floor(g); t = g - step; finished = false; }
      bump();
    },

    // 試験用: 手順 i（0始まり）の進み t をそのまま置く
    setProgress(i, progress) {
      playing = false; phase = 'idle'; elapsed = 0;
      step = clamp(Math.trunc(i), 0, n - 1);
      t = clamp(Number(progress) || 0, 0, 1);
      finished = step === n - 1 && t >= 1;
      bump();
    },

    setSpeed(s) {
      if (!SPEEDS.includes(s)) throw new Error(`timeline: 速度 ${s} は使えません`);
      speed = s; bump();
    },

    setStepStop(on) { stopEachStep = !!on; bump(); },

    setReduced(on) {
      isReduced = !!on;
      if (isReduced) { if (!finished) t = 1; if (playing) { phase = 'hold'; elapsed = 0; } }
      else if (playing && phase === 'hold') { phase = 'dwell'; elapsed = 0; }
      bump();
    },

    // 0〜n の通し位置（つまみの値）
    position() { return finished ? n : step + t; },

    state() {
      let guides = 'none';
      if (isReduced) guides = finished ? 'none' : 'line';
      else if (phase === 'guide' || (!playing && t === 0 && !finished)) guides = 'full';
      else if (phase === 'move') guides = 'faint'; // 動いている間も折り線だけ薄く残す
      return { step, t, phase, playing, finished, speed, reduced: isReduced, stepStop: stopEachStep, guides, version, length: n };
    },
  };
  return api;
}
