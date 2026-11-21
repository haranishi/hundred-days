// アプリ全体の状態と純粋な遷移関数。DOM・ブラウザAPIに依存せず Node で単体試験できる。
import { SPECIES_IDS } from './contract.js';

export const VALID_VIEWS = ['cook', 'side', 'top'];
export const VALID_SPEEDS = [0.5, 1];
export const VALID_QUALITIES = ['auto', 'high', 'standard', 'light'];
export const VALID_MODES = ['guide', 'practice'];

const clamp = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
const isPlainObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** 既定のアプリ状態を生成する。 */
export function createInitialState(overrides = {}) {
  const base = {
    species: SPECIES_IDS[0],
    step: 0,
    u: 0,
    playing: false,
    speed: 1,
    loop: true,
    mode: 'guide',
    view: 'cook',
    xray: false,
    labels: false,
    leftHanded: false,
    quality: 'auto',
    speech: false,
    wake: true,
    progress: {},
    best: {},
  };
  return sanitizeState({ ...base, ...overrides });
}

/** 外部入力や保存値を含む状態オブジェクトを安全な値に正規化する。 */
export function sanitizeState(raw) {
  const src = isPlainObj(raw) ? raw : {};
  const species = SPECIES_IDS.includes(src.species) ? src.species : SPECIES_IDS[0];
  const step = Number.isInteger(src.step) && src.step >= 0 ? src.step : 0;
  const u = clamp(Number(src.u), 0, 1);
  const playing = Boolean(src.playing);
  const speed = VALID_SPEEDS.includes(src.speed) ? src.speed : 1;
  const loop = typeof src.loop === 'boolean' ? src.loop : true;
  const mode = VALID_MODES.includes(src.mode) ? src.mode : 'guide';
  const view = VALID_VIEWS.includes(src.view) ? src.view : 'cook';
  const xray = Boolean(src.xray);
  const labels = Boolean(src.labels);
  const leftHanded = Boolean(src.leftHanded);
  const quality = VALID_QUALITIES.includes(src.quality) ? src.quality : 'auto';
  const speech = Boolean(src.speech);
  const wake = typeof src.wake === 'boolean' ? src.wake : true;

  const progress = {};
  if (isPlainObj(src.progress)) {
    for (const [sp, idx] of Object.entries(src.progress)) {
      if (SPECIES_IDS.includes(sp) && Number.isInteger(idx) && idx >= 0 && idx < 100) {
        progress[sp] = idx;
      }
    }
  }

  const best = {};
  if (isPlainObj(src.best)) {
    for (const [sp, table] of Object.entries(src.best)) {
      if (!SPECIES_IDS.includes(sp) || !isPlainObj(table)) continue;
      const clean = {};
      for (const [stepId, score] of Object.entries(table)) {
        if (/^[a-z0-9-]+$/.test(stepId) && Number.isFinite(score) && score >= 0 && score <= 100) {
          clean[stepId] = Math.round(score);
        }
      }
      if (Object.keys(clean).length > 0) best[sp] = clean;
    }
  }

  return {
    species, step, u, playing, speed, loop, mode, view, xray, labels, leftHanded, quality, speech, wake, progress, best,
  };
}

/** 状態の深いコピーを返す（デバッグ公開・不変性保持用）。 */
export function cloneState(state) {
  const best = {};
  for (const [sp, table] of Object.entries(state.best || {})) best[sp] = { ...table };
  return { ...state, progress: { ...(state.progress || {}) }, best };
}

/** 魚を切り替える。step 未指定なら保存済みの進捗または 0 を使う。 */
export function selectSpecies(state, speciesId, { step = null, stepCount = 1, recordProgress = true } = {}) {
  if (!SPECIES_IDS.includes(speciesId)) return state;
  const maxIdx = Math.max(0, stepCount - 1);
  const rawStep = step !== null && step !== undefined ? step : (state.progress[speciesId] ?? 0);
  const nextIdx = clamp(Math.trunc(Number(rawStep)), 0, maxIdx);
  const progress = recordProgress ? { ...state.progress, [speciesId]: nextIdx } : { ...state.progress };
  return {
    ...state,
    species: speciesId,
    step: nextIdx,
    u: 0,
    playing: false,
    mode: 'guide',
    progress,
  };
}

/** 手順番号を切り替える。動きを減らす設定では自動再生しない。 */
export function setStep(state, stepIndex, stepCount, { autoPlay = false, reducedMotion = false, recordProgress = true } = {}) {
  const maxIdx = Math.max(0, stepCount - 1);
  const nextIdx = clamp(Math.trunc(Number(stepIndex)), 0, maxIdx);
  const progress = recordProgress ? { ...state.progress, [state.species]: nextIdx } : { ...state.progress };
  return {
    ...state,
    step: nextIdx,
    u: 0,
    playing: Boolean(autoPlay && !reducedMotion),
    mode: 'guide',
    progress,
  };
}

/** 次の手順へ進む。最後の手順にいるときは finished: true を返す。 */
export function nextStep(state, stepCount, opts = {}) {
  const maxIdx = Math.max(0, stepCount - 1);
  if (state.step >= maxIdx) {
    return { state: { ...state, playing: false, mode: 'guide' }, finished: true };
  }
  return { state: setStep(state, state.step + 1, stepCount, opts), finished: false };
}

/** 前の手順へ戻る。先頭では止まる。 */
export function prevStep(state, stepCount, opts = {}) {
  if (state.step <= 0) {
    return { state: { ...state, step: 0, u: 0, playing: false, mode: 'guide' }, atStart: true };
  }
  return { state: setStep(state, state.step - 1, stepCount, opts), atStart: false };
}

/** 動きの進み具合 u ∈ [0, 1] を設定する。 */
export function setProgressU(state, u) {
  return { ...state, u: clamp(Number(u), 0, 1) };
}

/** 再生フレーム1回分の進み具合を計算する純関数。 */
export function advancePlayback(state, dtMs, durationMs) {
  if (!state.playing || state.mode !== 'guide') return state;
  if (!Number.isFinite(dtMs) || dtMs <= 0 || !Number.isFinite(durationMs) || durationMs <= 0) return state;
  const delta = (dtMs * state.speed) / durationMs;
  const raw = state.u + delta;
  if (raw >= 1) {
    if (state.loop) {
      return { ...state, u: raw % 1 };
    }
    return { ...state, u: 1, playing: false };
  }
  return { ...state, u: raw };
}

/** 再生／一時停止を切り替える。末尾で再生を押したら先頭へ戻す。 */
export function togglePlaying(state) {
  if (state.mode !== 'guide') return state;
  if (state.playing) return { ...state, playing: false };
  const u = state.u >= 0.999 ? 0 : state.u;
  return { ...state, u, playing: true };
}

export function setPlaying(state, playing) {
  if (state.mode !== 'guide') return { ...state, playing: false };
  const next = Boolean(playing);
  const u = next && state.u >= 0.999 ? 0 : state.u;
  return { ...state, u, playing: next };
}

export function setSpeed(state, speed) {
  return VALID_SPEEDS.includes(speed) ? { ...state, speed } : state;
}

export function toggleSpeed(state) {
  return { ...state, speed: state.speed === 1 ? 0.5 : 1 };
}

export function toggleLoop(state) {
  return { ...state, loop: !state.loop };
}

export function setView(state, view) {
  return VALID_VIEWS.includes(view) ? { ...state, view } : state;
}

export function cycleView(state) {
  const idx = VALID_VIEWS.indexOf(state.view);
  return { ...state, view: VALID_VIEWS[(idx + 1) % VALID_VIEWS.length] };
}

export function setXray(state, xray) {
  return { ...state, xray: Boolean(xray) };
}

export function toggleXray(state) {
  return { ...state, xray: !state.xray };
}

export function setLabels(state, labels) {
  return { ...state, labels: Boolean(labels) };
}

export function toggleLabels(state) {
  return { ...state, labels: !state.labels };
}

export function setLeftHanded(state, leftHanded) {
  return { ...state, leftHanded: Boolean(leftHanded) };
}

export function toggleLeftHanded(state) {
  return { ...state, leftHanded: !state.leftHanded };
}

export function setQuality(state, quality) {
  return VALID_QUALITIES.includes(quality) ? { ...state, quality } : state;
}

export function setSpeech(state, speech) {
  return { ...state, speech: Boolean(speech) };
}

export function setWake(state, wake) {
  return { ...state, wake: Boolean(wake) };
}

/** なぞって練習モードに入る（手順に練習があるときのみ）。 */
export function enterPractice(state, hasPractice) {
  if (!hasPractice) return state;
  return { ...state, mode: 'practice', playing: false };
}

/** なぞって練習モードを終えてガイドに戻る。 */
export function exitPractice(state) {
  if (state.mode === 'guide') return state;
  return { ...state, mode: 'guide' };
}

/** 種×手順のベスト得点を更新する（上回ったときのみ）。 */
export function recordBest(state, speciesId, stepId, score) {
  if (!SPECIES_IDS.includes(speciesId) || !/^[a-z0-9-]+$/.test(stepId || '')) {
    return { state, improved: false, previousBest: null, bestScore: null };
  }
  const cleanScore = Math.round(clamp(Number(score), 0, 100));
  const prevTable = state.best[speciesId] || {};
  const previousBest = stepId in prevTable ? prevTable[stepId] : null;
  if (previousBest !== null && cleanScore <= previousBest) {
    return { state, improved: false, previousBest, bestScore: previousBest };
  }
  const nextBest = {
    ...state.best,
    [speciesId]: { ...prevTable, [stepId]: cleanScore },
  };
  return {
    state: { ...state, best: nextBest },
    improved: true,
    previousBest,
    bestScore: cleanScore,
  };
}
