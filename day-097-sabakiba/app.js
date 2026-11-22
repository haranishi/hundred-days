// 「さばき場」アプリの入口。状態・経路・保存・3Dシーン（スタブ）・各画面・キーボード操作をつなぐ。
import { SPECIES_META } from './lib/species/meta.js';
import { getProcedure } from './lib/procedures/index.js';
import partsContent from './lib/content/parts.js';
import { addSample, createSession, finish } from './lib/practice.js';
import {
  advancePlayback, cloneState, createInitialState, cycleView, enterPractice, exitPractice,
  nextStep, prevStep, recordBest, selectSpecies, setLabels, setLeftHanded, setPlaying,
  setProgressU, setQuality, setSpeech, setStep, setView, setWake, setXray,
  toggleLabels, toggleLeftHanded, toggleLoop, togglePlaying, toggleSpeed, toggleXray,
} from './lib/app-state.js';
import { loadPersisted, savePersisted } from './lib/persist.js';
import { formatRoute, normalizeRoute, parseRoute, resolveInitialLocation } from './lib/router.js';
import { createFishScene } from './lib/scene-fish.js';
import { createViewer } from './lib/view3d.js';
import { withKnifeCamera } from './lib/knife.js';
import { buildStepSpeechText, formatStepView } from './lib/ui-format.js';
import { renderHome } from './lib/ui-home.js';
import { renderIntro } from './lib/ui-intro.js';
import { mountGuideView, renderStepsSheet } from './lib/ui-guide.js';
import { renderDone, renderParts, renderSafety, syncSettingsDialog } from './lib/ui-pages.js';
import { buildTextGuideData, DEVICE_GL_REASON, renderTextGuide } from './lib/text-guide.js';
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
const glReason = glDisabled ? '3D表示を切っているため、文章で手順をご案内します。' : DEVICE_GL_REASON;
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

function navigateTo(nextRoute) {
  const hash = formatRoute(nextRoute);
  route = nextRoute;
  if (window.location.hash !== hash) {
    lastNavHash = hash;
    window.location.hash = hash;
  }
  renderCurrentRoute();
}

function renderLocation(parsed) {
  const total = parsed.name === 'guide' ? getProcedure(parsed.species)?.steps.length : 0;
  route = normalizeRoute(parsed, total);
  if (route !== parsed) {
    const hash = window.location.hash;
    const query = hash.indexOf('?');
    window.history.replaceState(window.history.state, '', formatRoute(route) + (query < 0 ? '' : hash.slice(query)));
  }
  renderCurrentRoute();
}

function handlePracticeSample(payload) {
  if (state.mode !== 'practice' || !activePracticeConfig) return;
  if (payload?.reason === 'far-from-start') {
    practiceResult = null;
    practiceStatus = '線の始まり（「ここから」の丸）に触れてから、そのまま引きます。';
    syncGuideUI();
    return;
  }
  const { point, phase = 'move', curvePoints } = payload ?? {};
  if (!point) return;
  if (phase === 'start') {
    if (!Array.isArray(curvePoints) || curvePoints.length < 2) return;
    practiceResult = null;
    practiceSession = createSession({ curvePoints, tolerance: activePracticeConfig.tolerance });
    practiceStatus = 'なぞっています… そのまま終点まで一筆で引きます。';
  }
  if (!practiceSession) return;
  addSample(practiceSession, point, Number.isFinite(payload.tMs) ? payload.tMs : performance.now());
  if (phase === 'end') {
    const scored = finish(practiceSession);
    practiceSession = null;
    const stepId = getProcedure(state.species)?.steps[state.step]?.id ?? 'step';
    const updated = recordBest(state, state.species, stepId, scored.score);
    state = updated.state;
    persistNow();
    practiceResult = { result: scored, previousBest: updated.previousBest };
    practiceStatus = '';
  }
  if (phase === 'start' || phase === 'end') syncGuideUI();
}

function startPracticeMode(overrideCfg = null) {
  const proc = getProcedure(state.species);
  const stepObj = proc && proc.steps[state.step];
  const cfg = overrideCfg || (stepObj && stepObj.practice) || null;
  if (!cfg) return false;
  activePracticeConfig = { cut: cfg.cut || 'cut', tolerance: cfg.tolerance || 0.5 };
  practiceSession = null;
  practiceResult = null;
  practiceStatus = '「ここから」の丸から、朱色の線に沿って、一筆でなぞります。';
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
    leftHanded: state.leftHanded,
    reason: glReason,
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

  const speciesChanged = state.species !== speciesId;
  const stepChanged = state.step !== stepIndex;

  if (speciesChanged) {
    state = selectSpecies(state, speciesId, { step: stepIndex, stepCount: proc.steps.length });
  } else {
    state = setStep(state, stepIndex, proc.steps.length, {
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
    }, { makeViewer: options => withKnifeCamera(createViewer(options)) });
    scene = created;
    sceneSpecies = speciesId;
    sceneQuality = state.quality;

    created.on('practice-sample', handlePracticeSample);
    created.on('practice-miss', handlePracticeSample);

    created.ready.then(() => {
      if (scene !== created) return;
      syncSceneAll();
      syncGuideUI();
      markReady();
      startLoopIfNeeded();
    }).catch(() => {
      if (scene !== created) return;
      glDisabled = true;
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
    default:
      renderHome(mainEl, {
        state,
        filter,
        onFilterChange(nextFilter) {
          filter = nextFilter;
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
  renderLocation(parseRoute(window.location.hash));
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
if (new URLSearchParams(window.location.search).get('freeze') === '1') clockFrozen = true;
if (params.debug) {
  window.__sabaki = {
    state: () => cloneState(state),
    async goto(sp, step = 0, u = 0) {
      const targetSp = Object.hasOwn(SPECIES_META, sp) ? sp : state.species;
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
      const target = scene;
      if (!target) throw new Error(glDisabled ? glReason : 'この魚の3Dはまだ準備中です');
      await target.ready;
      if (target !== scene) throw new Error('撮影する魚が切り替わりました。');
      await target.resetCamera({ immediate: true, capture: true });
      return cloneState(state);
    },
    ready: () => readyPromise,
    stats: () => scene?.stats() ?? { stepCount: getProcedure(state.species)?.steps.length ?? 0, gl: glDisabled ? 'off' : 'none' },
    setXray(value) {
      state = setXray(state, value);
      scene?.setXray(state.xray);
      syncGuideUI();
    },
    setView(value) {
      state = setView(state, value);
      scene?.setView(state.view);
      syncGuideUI();
    },
    setLeft(value) {
      state = setLeftHanded(state, value);
      scene?.setLeftHanded(state.leftHanded);
      syncGuideUI();
      syncSettingsUI();
    },
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
  if (new URLSearchParams(window.location.search).get('debug') === '1') {
    window.__sabaki.practiceGuide = () => scene?.practiceGuide() ?? null;
  }
}

// 初期表示も、履歴をたどったときと同じ手順番号にそろえます。
syncSettingsUI();
renderLocation(initialLoc.route);
