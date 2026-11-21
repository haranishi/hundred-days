// 「さばき場」アプリの入口。状態・経路・保存・3Dシーン（スタブ）・各画面・キーボード操作をつなぐ。
import { SPECIES_META } from './lib/species/meta.js';
import { getProcedure } from './lib/procedures/index.js';
import safetyContent from './lib/content/safety.js';
import partsContent from './lib/content/parts.js';
import { addSample, createSession, finish } from './lib/practice.js';
import {
  advancePlayback, cloneState, createInitialState, cycleView, enterPractice, exitPractice,
  nextStep, prevStep, recordBest, selectSpecies, setLabels, setLeftHanded, setPlaying,
  setProgressU, setQuality, setSpeech, setStep, setView, setWake, setXray,
  toggleLabels, toggleLeftHanded, toggleLoop, togglePlaying, toggleSpeed, toggleXray,
} from './lib/app-state.js';
import { loadPersisted, savePersisted } from './lib/persist.js';
import { formatRoute, parseRoute, resolveInitialLocation } from './lib/router.js';
import { createFishScene } from './lib/scene-stub.js';
import { buildStepSpeechText, formatStepView } from './lib/ui-format.js';
import { renderHome } from './lib/ui-home.js';
import { renderIntro } from './lib/ui-intro.js';
import { mountGuideView, renderStepsSheet } from './lib/ui-guide.js';
import { renderDone, renderParts, renderSafety, syncSettingsDialog } from './lib/ui-pages.js';
import { buildTextGuideData, renderTextGuide } from './lib/text-guide.js';
import { createWakeLockManager } from './lib/wake-lock.js';
import { createSpeechManager } from './lib/speech.js';
import { h, icon } from './lib/ui-icons.js';

const mainEl = document.getElementById('main');
const stepsDialog = document.getElementById('steps-dialog');
const stepsDialogBody = document.getElementById('steps-dialog-body');
const settingsDialog = document.getElementById('settings-dialog');
const shareDialog = document.getElementById('share-dialog');
const btnShare = document.getElementById('btn-share');
const btnSettings = document.getElementById('btn-settings');

const reducedMotionQuery = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;
const prefersReducedMotion = () => Boolean(reducedMotionQuery && reducedMotionQuery.matches);

const initialLoc = resolveInitialLocation(window.location.search, window.location.hash);
const params = initialLoc.params;
const persisted = loadPersisted();

let state = createInitialState({
  ...persisted,
  leftHanded: params.hand === 'L' ? true : params.hand === 'R' ? false : persisted.leftHanded,
  quality: params.gfx || persisted.quality,
});

let route = initialLoc.route;
let filter = { method: 'all', beginnerOnly: false };
let glDisabled = params.gl === 'off';
let glReason = glDisabled ? '3D表示オフ（gl=off）の指定により、文章のガイドを表示しています。' : '';
let clockFrozen = params.t !== null;
let pendingFixedU = params.t;
let lastNavHash = null;

let scene = null;
let sceneSpecies = null;
let sceneQuality = null;
let guideHandle = null;
let rafId = null;
let lastFrameMs = 0;

let practiceSession = null;
let practiceResult = null;
let practiceStatus = '';
let activePracticeConfig = null;
let readyResolve = null;
let readyPromise = new Promise((r) => { readyResolve = r; });

const speechMgr = createSpeechManager();
const wakeMgr = createWakeLockManager({
  onChange: () => syncSettingsUI(),
});

// ダイアログの開閉とフォーカス復帰を共通管理する
const dialogOpeners = new WeakMap();
function openDialog(dialog, opener) {
  if (!dialog || dialog.open) return;
  dialogOpeners.set(dialog, opener || document.activeElement);
  dialog.showModal();
}

function setupDialog(dialog) {
  if (!dialog) return;
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  for (const btn of dialog.querySelectorAll('[data-dialog-close]')) {
    btn.addEventListener('click', () => dialog.close());
  }
  dialog.addEventListener('close', () => {
    const opener = dialogOpeners.get(dialog);
    if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
      opener.focus({ preventScroll: true });
    }
  });
}

setupDialog(stepsDialog);
setupDialog(settingsDialog);
setupDialog(shareDialog);

function persistNow() {
  savePersisted(state);
}

function markReady() {
  document.body.dataset.ready = 'true';
  if (readyResolve) {
    readyResolve(true);
    readyResolve = null;
  }
}

function resetReady() {
  delete document.body.dataset.ready;
  readyPromise = new Promise((r) => { readyResolve = r; });
}

function stopLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  lastFrameMs = 0;
}

function startLoopIfNeeded() {
  stopLoop();
  if (route.name !== 'guide' || glDisabled || !scene) return;
  if (!state.playing || state.mode !== 'guide' || document.hidden || clockFrozen) return;

  const proc = getProcedure(state.species);
  if (!proc) return;

  const tick = (now) => {
    if (!state.playing || state.mode !== 'guide' || route.name !== 'guide' || !scene || document.hidden) {
      rafId = null;
      return;
    }
    if (lastFrameMs > 0) {
      const dt = Math.min(100, Math.max(0, now - lastFrameMs));
      const st = proc.steps[state.step];
      const durationMs = (st && st.durationMs) || 6000;
      const next = advancePlayback(state, dt, durationMs);
      const stopped = next.playing !== state.playing;
      state = next;
      scene.setProgress(state.u);
      if (guideHandle) {
        guideHandle.updateSlider(state.u);
        if (stopped) syncGuideUI();
      }
      if (!state.playing) {
        rafId = null;
        return;
      }
    }
    lastFrameMs = now;
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function disposeScene() {
  stopLoop();
  if (scene) {
    scene.dispose();
    scene = null;
  }
  sceneSpecies = null;
  sceneQuality = null;
  guideHandle = null;
}

function syncSceneAll() {
  if (!scene) return;
  scene.setStep(state.step);
  scene.setProgress(state.u);
  scene.setView(state.view);
  scene.setXray(state.xray);
  scene.setLabels(state.labels);
  scene.setLeftHanded(state.leftHanded);
  scene.setPractice(state.mode === 'practice' && activePracticeConfig ? { cutId: activePracticeConfig.cut } : null);
}

function syncGuideUI() {
  if (!guideHandle) return;
  guideHandle.update({
    state,
    practiceResult,
    practiceStatus,
    speechSupported: speechMgr.isSupported(),
    forcePracticeButton: Boolean(activePracticeConfig && state.mode === 'practice'),
  });
}

function syncSettingsUI() {
  syncSettingsDialog(settingsDialog, {
    state,
    speechSupported: speechMgr.isSupported(),
    wakeSupported: wakeMgr.isSupported(),
    wakeActive: wakeMgr.isActive(),
  });
}

function speakCurrentStep(force = false) {
  if (!force && !state.speech) return;
  const proc = getProcedure(state.species);
  if (!proc) return;
  const stepRaw = proc.steps[state.step];
  if (!stepRaw) return;
  const view = formatStepView(stepRaw, state.step, proc.steps.length, state.leftHanded);
  speechMgr.speak(buildStepSpeechText(view));
}

function updateWakeLockForRoute() {
  const shouldHold = route.name === 'guide' && state.wake && !glDisabled;
  wakeMgr.setEnabled(shouldHold);
}

function navigateTo(nextRoute, { replace = false } = {}) {
  const hash = formatRoute(nextRoute);
  route = nextRoute;
  lastNavHash = hash;
  if (window.location.hash !== hash) {
    if (replace && window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, '', hash);
    } else {
      window.location.hash = hash;
    }
  }
  renderCurrentRoute();
}

function handlePracticeSample(payload) {
  if (state.mode !== 'practice' || !activePracticeConfig) return;
  const point = payload && payload.point ? payload.point : [0, 0, 0];
  const tMs = Number.isFinite(payload && payload.tMs) ? payload.tMs : performance.now();
  const phase = payload && payload.phase ? payload.phase : 'move';
  const curvePoints = (payload && Array.isArray(payload.curvePoints) && payload.curvePoints.length >= 2)
    ? payload.curvePoints
    : [[-5, 0, 0], [0, 0, 0], [5, 0, 0]];

  if (phase === 'start' || !practiceSession) {
    practiceResult = null;
    practiceSession = createSession({ curvePoints, tolerance: activePracticeConfig.tolerance || 0.5 });
    practiceStatus = 'なぞっています… そのまま終点まで一筆で引きます。';
    addSample(practiceSession, point, tMs);
    syncGuideUI();
    return;
  }

  addSample(practiceSession, point, tMs);

  if (phase === 'end') {
    const scored = finish(practiceSession);
    practiceSession = null;
    const proc = getProcedure(state.species);
    const stepObj = proc && proc.steps[state.step];
    const stepId = (stepObj && stepObj.id) || 'step';
    const updated = recordBest(state, state.species, stepId, scored.score);
    state = updated.state;
    persistNow();
    practiceResult = {
      result: scored,
      previousBest: updated.previousBest,
    };
    practiceStatus = '';
    syncGuideUI();
  }
}

function startPracticeMode(overrideCfg = null) {
  const proc = getProcedure(state.species);
  const stepObj = proc && proc.steps[state.step];
  const cfg = overrideCfg || (stepObj && stepObj.practice) || null;
  if (!cfg) return false;
  activePracticeConfig = { cut: cfg.cut || 'cut', tolerance: cfg.tolerance || 0.5 };
  practiceSession = null;
  practiceResult = null;
  practiceStatus = '上の図の朱色の線に沿って、一筆でなぞってください。';
  state = enterPractice(state, true);
  stopLoop();
  if (scene) scene.setPractice({ cutId: activePracticeConfig.cut });
  syncGuideUI();
  return true;
}

function leavePracticeMode() {
  activePracticeConfig = null;
  practiceSession = null;
  practiceResult = null;
  practiceStatus = '';
  state = exitPractice(state);
  if (scene) scene.setPractice(null);
  syncGuideUI();
}

function renderFallbackTextGuide(speciesId) {
  disposeScene();
  document.body.dataset.gl = 'off';
  document.body.dataset.route = 'text-guide';
  const meta = SPECIES_META[speciesId] || SPECIES_META.aji;
  const proc = getProcedure(speciesId);
  const data = buildTextGuideData({
    speciesMeta: meta,
    procedure: proc,
    partsData: partsContent[speciesId] || null,
    safetyIntro: safetyContent.intro,
    leftHanded: state.leftHanded,
    reason: glReason || 'この端末では3D表示を使えないため、文章のガイドを表示しています。',
  });
  renderTextGuide(mainEl, data, {
    onToggleLeftHanded() {
      state = toggleLeftHanded(state);
      persistNow();
      syncSettingsUI();
      renderFallbackTextGuide(speciesId);
    },
  });
  markReady();
}

function renderGuideUnavailable(speciesId) {
  disposeScene();
  const meta = SPECIES_META[speciesId] || SPECIES_META.aji;
  mainEl.replaceChildren(h('div', { class: 'page page--narrow' }, [
    h('div', { class: 'page-head' }, [
      h('a', { class: 'button button--ghost', href: `#/fish/${meta.id}` }, [icon('back'), `${meta.name}の前置きへ`]),
    ]),
    h('div', { class: 'callout callout--info' }, [
      h('div', { class: 'callout-body' }, [
        h('h2', { class: 'callout-title' }, [`${meta.name}の手順は準備中です`]),
        h('p', {}, ['現在は「アジ」のガイドをご覧いただけます。準備ができしだい順次追加します。']),
        h('div', { class: 'page-actions' }, [
          h('a', { class: 'button button--primary', href: '#/fish/aji/1' }, ['アジのガイドを見る']),
          h('a', { class: 'button', href: '#/' }, ['魚一覧へ戻る']),
        ]),
      ]),
    ]),
  ]));
  markReady();
}

function renderGuideRoute(speciesId, stepIndex) {
  const proc = getProcedure(speciesId);
  if (!proc || !Array.isArray(proc.steps) || proc.steps.length === 0) {
    document.body.dataset.route = 'intro';
    renderGuideUnavailable(speciesId);
    return;
  }

  const clampedStep = Math.min(proc.steps.length - 1, Math.max(0, stepIndex));
  const speciesChanged = state.species !== speciesId;
  const stepChanged = state.step !== clampedStep;

  if (speciesChanged) {
    state = selectSpecies(state, speciesId, { step: clampedStep, stepCount: proc.steps.length });
  } else {
    state = setStep(state, clampedStep, proc.steps.length, {
      autoPlay: !clockFrozen,
      reducedMotion: prefersReducedMotion(),
    });
  }
  if (!clockFrozen && !prefersReducedMotion()) {
    state = setPlaying(state, true);
  }
  if (pendingFixedU !== null) {
    state = setProgressU(state, pendingFixedU);
    state = setPlaying(state, false);
    pendingFixedU = null;
  }
  activePracticeConfig = null;
  practiceSession = null;
  practiceResult = null;
  practiceStatus = '';
  persistNow();

  if (glDisabled) {
    renderFallbackTextGuide(speciesId);
    return;
  }

  delete document.body.dataset.gl;
  document.body.dataset.route = 'guide';

  const needNewScene = !scene || sceneSpecies !== speciesId || sceneQuality !== state.quality || !guideHandle;

  if (needNewScene) {
    disposeScene();
    resetReady();

    guideHandle = mountGuideView(mainEl, {
      speciesId,
      procedure: proc,
      actions: {
        onCycleView() {
          state = cycleView(state);
          persistNow();
          if (scene) scene.setView(state.view);
          syncGuideUI();
        },
        onToggleXray() {
          state = toggleXray(state);
          if (scene) scene.setXray(state.xray);
          syncGuideUI();
        },
        onToggleLabels() {
          state = toggleLabels(state);
          persistNow();
          if (scene) scene.setLabels(state.labels);
          syncGuideUI();
        },
        onToggleLeftHanded() {
          state = toggleLeftHanded(state);
          persistNow();
          if (scene) scene.setLeftHanded(state.leftHanded);
          syncGuideUI();
          syncSettingsUI();
        },
        onTogglePractice() {
          if (state.mode === 'practice') leavePracticeMode();
          else startPracticeMode();
        },
        onExitPractice() {
          leavePracticeMode();
        },
        onRetryPractice() {
          if (activePracticeConfig) startPracticeMode(activePracticeConfig);
        },
        onNextAfterPractice() {
          leavePracticeMode();
          goNextStep();
        },
        onResetCamera() {
          if (scene) scene.resetCamera();
        },
        onTogglePlay() {
          clockFrozen = false;
          state = togglePlaying(state);
          syncGuideUI();
          startLoopIfNeeded();
        },
        onToggleSpeed() {
          state = toggleSpeed(state);
          persistNow();
          syncGuideUI();
        },
        onScrubU(uVal) {
          clockFrozen = false;
          state = setProgressU(setPlaying(state, false), uVal);
          stopLoop();
          if (scene) scene.setProgress(state.u);
          syncGuideUI();
        },
        onToggleLoop() {
          state = toggleLoop(state);
          persistNow();
          syncGuideUI();
        },
        onPrevStep() {
          goPrevStep();
        },
        onNextStep() {
          goNextStep();
        },
        onSpeakStep() {
          speakCurrentStep(true);
        },
        onOpenStepsSheet(opener) {
          renderStepsSheet(stepsDialogBody, {
            speciesId,
            procedure: proc,
            currentStep: state.step,
            leftHanded: state.leftHanded,
            bestTable: state.best[speciesId] || {},
            onSelectStep(idx) {
              stepsDialog.close();
              navigateTo({ name: 'guide', species: speciesId, step: idx });
            },
          });
          openDialog(stepsDialog, opener);
        },
      },
    });

    syncGuideUI();

    const created = createFishScene({
      container: guideHandle.stageEl,
      speciesId,
      quality: state.quality,
      debug: params.debug,
    });
    scene = created;
    sceneSpecies = speciesId;
    sceneQuality = state.quality;

    created.on('practice-sample', handlePracticeSample);

    created.ready.then(() => {
      if (scene !== created) return;
      syncSceneAll();
      syncGuideUI();
      markReady();
      startLoopIfNeeded();
    }).catch((err) => {
      if (scene !== created) return;
      glDisabled = true;
      glReason = (err && err.message) ? err.message : '3D表示の初期化に失敗したため、文章のガイドに切り替えました。';
      renderFallbackTextGuide(speciesId);
    });
  } else {
    syncSceneAll();
    syncGuideUI();
    markReady();
    startLoopIfNeeded();
  }

  if ((speciesChanged || stepChanged) && state.speech) {
    speakCurrentStep(false);
  }
}

function goNextStep() {
  const proc = getProcedure(state.species);
  if (!proc) return;
  const res = nextStep(state, proc.steps.length, { autoPlay: !clockFrozen, reducedMotion: prefersReducedMotion() });
  if (res.finished) {
    state = res.state;
    persistNow();
    navigateTo({ name: 'done', species: state.species });
    return;
  }
  navigateTo({ name: 'guide', species: state.species, step: res.state.step });
}

function goPrevStep() {
  const proc = getProcedure(state.species);
  if (!proc) return;
  const res = prevStep(state, proc.steps.length, { autoPlay: !clockFrozen, reducedMotion: prefersReducedMotion() });
  if (res.atStart) return;
  navigateTo({ name: 'guide', species: state.species, step: res.state.step });
}

function renderCurrentRoute() {
  speechMgr.stop();
  document.body.dataset.route = route.name;
  updateWakeLockForRoute();

  if (route.name === 'guide') {
    renderGuideRoute(route.species, route.step);
    return;
  }

  // ガイド以外の画面に移ったら 3D シーンを解放する
  disposeScene();
  if (!glDisabled) delete document.body.dataset.gl;

  switch (route.name) {
    case 'home':
      renderHome(mainEl, {
        state,
        filter,
        onFilterChange(nextFilter) {
          filter = nextFilter;
          renderCurrentRoute();
        },
      });
      break;
    case 'intro':
      renderIntro(mainEl, { speciesId: route.species, state });
      break;
    case 'done':
      renderDone(mainEl, {
        speciesId: route.species,
        onOpenShare: (opener) => openDialog(shareDialog, opener),
      });
      break;
    case 'safety':
      renderSafety(mainEl);
      break;
    case 'parts':
      renderParts(mainEl, { speciesId: route.species });
      break;
    default:
      renderHome(mainEl, { state, filter, onFilterChange: (f) => { filter = f; renderCurrentRoute(); } });
  }
  window.scrollTo(0, 0);
  markReady();
}

// 共通ヘッダー・設定ダイアログのイベント
if (btnShare) {
  btnShare.addEventListener('click', () => openDialog(shareDialog, btnShare));
}
if (btnSettings) {
  btnSettings.addEventListener('click', () => {
    syncSettingsUI();
    openDialog(settingsDialog, btnSettings);
  });
}

const leftInput = document.getElementById('setting-left');
const speechInput = document.getElementById('setting-speech');
const wakeInput = document.getElementById('setting-wake');
const qualitySelect = document.getElementById('setting-quality');

if (leftInput) {
  leftInput.addEventListener('change', () => {
    state = setLeftHanded(state, leftInput.checked);
    persistNow();
    if (scene) scene.setLeftHanded(state.leftHanded);
    if (route.name === 'guide') {
      if (glDisabled) renderFallbackTextGuide(state.species);
      else syncGuideUI();
    }
    syncSettingsUI();
  });
}

if (speechInput) {
  speechInput.addEventListener('change', () => {
    state = setSpeech(state, speechInput.checked);
    persistNow();
    if (!state.speech) speechMgr.stop();
    else if (route.name === 'guide') speakCurrentStep(true);
    syncSettingsUI();
  });
}

if (wakeInput) {
  wakeInput.addEventListener('change', () => {
    state = setWake(state, wakeInput.checked);
    persistNow();
    updateWakeLockForRoute();
    syncSettingsUI();
  });
}

if (qualitySelect) {
  qualitySelect.addEventListener('change', () => {
    state = setQuality(state, qualitySelect.value);
    persistNow();
    if (route.name === 'guide' && !glDisabled) {
      renderGuideRoute(state.species, state.step);
    }
    syncSettingsUI();
  });
}

// ハッシュ遷移
window.addEventListener('hashchange', () => {
  if (lastNavHash !== null && window.location.hash === lastNavHash) {
    lastNavHash = null;
    return;
  }
  lastNavHash = null;
  const parsed = parseRoute(window.location.hash);
  route = parsed;
  if (!parsed.valid) {
    navigateTo({ name: 'home' }, { replace: true });
    return;
  }
  renderCurrentRoute();
});

// タブ非表示時はアニメーションループを止める
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopLoop();
  else startLoopIfNeeded();
});

// キーボードショートカット（←→・Space・X・1/2/3・L・Esc）
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
  const isTextInput = tag === 'input' || tag === 'textarea' || tag === 'select';
  const hasOpenDialog = Boolean(
    (stepsDialog && stepsDialog.open) ||
    (settingsDialog && settingsDialog.open) ||
    (shareDialog && shareDialog.open)
  );

  if (e.key === 'Escape') {
    if (hasOpenDialog) return; // ネイティブ <dialog> が閉じて close イベントでフォーカスを戻す
    if (route.name === 'guide' && state.mode === 'practice') {
      e.preventDefault();
      leavePracticeMode();
    }
    return;
  }

  if (hasOpenDialog) return;

  if (e.key === 'l' || e.key === 'L') {
    if (isTextInput) return;
    e.preventDefault();
    state = toggleLeftHanded(state);
    persistNow();
    if (scene) scene.setLeftHanded(state.leftHanded);
    if (route.name === 'guide') {
      if (glDisabled) renderFallbackTextGuide(state.species);
      else syncGuideUI();
    }
    syncSettingsUI();
    return;
  }

  if (route.name !== 'guide' || glDisabled) return;

  if (e.key === 'ArrowLeft' && !isTextInput) {
    e.preventDefault();
    goPrevStep();
  } else if (e.key === 'ArrowRight' && !isTextInput) {
    e.preventDefault();
    goNextStep();
  } else if (e.key === ' ' && !isTextInput && tag !== 'button' && tag !== 'a' && tag !== 'summary') {
    e.preventDefault();
    clockFrozen = false;
    state = togglePlaying(state);
    syncGuideUI();
    startLoopIfNeeded();
  } else if ((e.key === 'x' || e.key === 'X') && !isTextInput) {
    e.preventDefault();
    state = toggleXray(state);
    if (scene) scene.setXray(state.xray);
    syncGuideUI();
  } else if ((e.key === '1' || e.key === '2' || e.key === '3') && !isTextInput) {
    e.preventDefault();
    const map = { '1': 'cook', '2': 'side', '3': 'top' };
    state = setView(state, map[e.key]);
    persistNow();
    if (scene) scene.setView(state.view);
    syncGuideUI();
  }
});

// 試験・撮影用フック（?debug=1 のときだけ公開）
if (params.debug) {
  window.__sabaki = {
    state: () => cloneState(state),
    goto(sp, step = 0, u = 0) {
      const targetSp = SPECIES_META[sp] ? sp : state.species;
      const proc = getProcedure(targetSp);
      const maxIdx = proc ? Math.max(0, proc.steps.length - 1) : 0;
      const idx = Math.min(maxIdx, Math.max(0, Math.trunc(Number(step) || 0)));
      clockFrozen = true;
      pendingFixedU = Math.min(1, Math.max(0, Number(u) || 0));
      route = { name: 'guide', species: targetSp, step: idx, valid: true };
      if (window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, '', formatRoute(route));
      }
      renderCurrentRoute();
      if (scene) {
        scene.setStep(idx);
        scene.setProgress(state.u);
      }
      return cloneState(state);
    },
    ready: () => readyPromise,
    stats: () => (scene ? scene.stats() : { stub: true, gl: glDisabled ? 'off' : 'none' }),
    demoPractice(autoFinish = false) {
      if (route.name !== 'guide') return false;
      const started = startPracticeMode({ cut: 'demo-cut', tolerance: 0.5 });
      if (!started) return false;
      if (autoFinish) {
        const pts = [[-4, 0, 0], [-2, 0.1, 0], [0, 0, 0], [2, -0.1, 0], [4, 0, 0]];
        handlePracticeSample({ phase: 'start', point: pts[0], tMs: 100, curvePoints: pts });
        handlePracticeSample({ phase: 'move', point: pts[1], tMs: 220, curvePoints: pts });
        handlePracticeSample({ phase: 'move', point: pts[2], tMs: 340, curvePoints: pts });
        handlePracticeSample({ phase: 'move', point: pts[3], tMs: 460, curvePoints: pts });
        handlePracticeSample({ phase: 'end', point: pts[4], tMs: 580, curvePoints: pts });
      }
      return true;
    },
  };
}

// 初期描画（壊れたハッシュは入口へ正規化）
syncSettingsUI();
if (!route.valid) {
  navigateTo({ name: 'home' }, { replace: true });
} else {
  renderCurrentRoute();
}
