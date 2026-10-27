import {
  calculateRank,
  createGameState,
  getReviewItems,
  submitAction,
  tickTimer
} from './lib/engine.js';
import { CATEGORIES, filterItems, getItemById, getXrayTelemetry } from './lib/items.js';
import { createSoundController } from './lib/sound.js';
import { loadRecord, mergeSessionIntoRecord, saveRecord } from './lib/storage.js';

const CATEGORY_LABEL_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

const STAMP_META = {
  carry_on: { text: '← 機内持込 CARRY-ON', cls: 'stamp-carry' },
  checked: { text: '↑ 預け荷物 CHECKED', cls: 'stamp-checked' },
  prohibited: { text: '→ 持込不可 REJECT', cls: 'stamp-prohibited' }
};

const sound = createSoundController();
let record = loadRecord();
sound.setEnabled(record.soundEnabled);

let gameState = createGameState('rush');
let isStandby = true;
let isTutorial = false;
let xrayEnabled = false;
let timerId = null;
let timerRunning = false;
let itemPresentedAt = Date.now();
let selectedCategory = 'all';
let scene = null;
let cameraClose = false;
let actionPending = false;
let pendingActionTimer = null;
let pausedByOverlay = false;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');


// DOM参照
const elSoundToggle = document.getElementById('sound-toggle');
const elSoundIcon = document.getElementById('sound-icon');
const elSoundLabel = document.getElementById('sound-label');
const elGuideOpenBtn = document.getElementById('guide-open-btn');
const elGuideDialog = document.getElementById('guide-dialog');
const elGuideCloseBtn = document.getElementById('guide-close-btn');
const elGuideOkBtn = document.getElementById('guide-ok-btn');

const elTabGame = document.getElementById('tab-game');
const elTabCatalog = document.getElementById('tab-catalog');
const elPanelGame = document.getElementById('panel-game');
const elPanelCatalog = document.getElementById('panel-catalog');

const elModeRush = document.getElementById('mode-rush');
const elModeTraining = document.getElementById('mode-training');
const elBestRushScore = document.getElementById('best-rush-score');
const elBestTrainingScore = document.getElementById('best-training-score');

const elBoardShiftBadge = document.getElementById('board-shift-badge');
const elBtnBackStandby = document.getElementById('btn-back-standby');
const elHudProgressLabel = document.getElementById('hud-progress-label');
const elHudTimer = document.getElementById('hud-timer');
const elHudScore = document.getElementById('hud-score');
const elHudCombo = document.getElementById('hud-combo');

const elInspectionStage = document.getElementById('inspection-stage');
const elXrayArch = document.getElementById('xray-arch');
const elNextTrayName = document.getElementById('next-tray-name');

const elStartOverlay = document.getElementById('start-overlay');
const elStandbyConsole = document.getElementById('standby-console');
const elActiveConsole = document.getElementById('active-console');
const elCanvas = document.getElementById('inspection-canvas');
const elSceneLoading = document.getElementById('scene-loading');
const elSceneError = document.getElementById('scene-error');
const elCameraButton = document.getElementById('btn-camera');
const elSceneStatus = document.getElementById('scene-status');

const elStartPrimaryLabel = document.getElementById('start-primary-label');
const elBtnStartShift = document.getElementById('btn-start-shift');
const elBtnStartTutorial = document.getElementById('btn-start-tutorial');

const elCoachBanner = document.getElementById('coach-banner');
const elCoachStepBadge = document.getElementById('coach-step-badge');
const elCoachText = document.getElementById('coach-text');

const elSecurityTray = document.getElementById('security-tray');
const elTrayStamp = document.getElementById('tray-stamp');
const elItemCategoryBadge = document.getElementById('item-category-badge');
const elItemCounterBadge = document.getElementById('item-counter-badge');
const elBtnXrayToggle = document.getElementById('btn-xray-toggle');
const elXrayBtnLabel = document.getElementById('xray-btn-label');
const elItemSvgUse = document.getElementById('item-svg-use');
const elItemName = document.getElementById('item-name');
const elItemSpec = document.getElementById('item-spec');
const elXrayStandbyHint = document.getElementById('xray-standby-hint');
const elXrayTelemetry = document.getElementById('xray-telemetry');
const elXrayMaterialTag = document.getElementById('xray-material-tag');
const elXrayInspectPoint = document.getElementById('xray-inspect-point');

const elFeedbackBanner = document.getElementById('feedback-banner');
const elFeedbackBadge = document.getElementById('feedback-badge');
const elFeedbackItemChip = document.getElementById('feedback-item-chip');
const elFeedbackText = document.getElementById('feedback-text');

const elResultPanel = document.getElementById('result-panel');
const elResultGrade = document.getElementById('result-grade');
const elResultHeading = document.getElementById('result-heading');
const elResultComment = document.getElementById('result-comment');
const elResultScore = document.getElementById('result-score');
const elResultAccuracy = document.getElementById('result-accuracy');
const elResultCombo = document.getElementById('result-combo');
const elBtnRetry = document.getElementById('btn-retry');
const elBtnSwitchMode = document.getElementById('btn-switch-mode');
const elBtnOpenCatalog = document.getElementById('btn-open-catalog');
const elReviewHeading = document.getElementById('review-heading');
const elReviewList = document.getElementById('review-list');

const elCatalogSearch = document.getElementById('catalog-search');
const elCatalogCategories = document.getElementById('catalog-categories');
const elCatalogCount = document.getElementById('catalog-count');
const elCatalogGrid = document.getElementById('catalog-grid');

const allActionButtons = Array.from(document.querySelectorAll('[data-action]'));

function formatSeconds(sec) {
  const safe = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateSoundButtonUI() {
  const on = sound.isEnabled();
  elSoundToggle.setAttribute('aria-pressed', String(on));
  elSoundIcon.textContent = on ? '♫' : '♪';
  elSoundLabel.textContent = on ? '音 ON' : '音 OFF';
}

function updateBestRecordUI() {
  elBestRushScore.textContent = record.bestRushScore.toLocaleString('ja-JP');
  elBestTrainingScore.textContent = String(record.bestTrainingCorrect);
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  timerRunning = false;
}

function ensureRushTimerStarted() {
  if (isTutorial || gameState.mode !== 'rush' || gameState.status !== 'playing' || timerRunning) {
    return;
  }
  timerRunning = true;
  timerId = setInterval(() => {
    gameState = tickTimer(gameState, 1);
    renderHud();
    if (gameState.status === 'finished') {
      stopTimer();
      onGameFinished();
    }
  }, 1000);
}

function setXrayMode(enabled, playSfx = false) {
  xrayEnabled = Boolean(enabled);
  elSecurityTray.classList.toggle('is-xray', xrayEnabled);
  callScene('setXray', xrayEnabled);
  elCanvas.dataset.xray = String(xrayEnabled);
  elBtnXrayToggle.setAttribute('aria-pressed', String(xrayEnabled));
  elXrayBtnLabel.textContent = xrayEnabled ? 'X線 ON' : 'X線透視';
  elXrayTelemetry.hidden = !xrayEnabled;
  if (elXrayStandbyHint) {
    elXrayStandbyHint.hidden = xrayEnabled;
  }
  if (playSfx && xrayEnabled) {
    sound.playScan();
  }
}

function showStampPreview(action) {
  elTrayStamp.className = 'tray-stamp';
  if (!action || !STAMP_META[action]) {
    elTrayStamp.textContent = '';
    return;
  }
  elTrayStamp.textContent = STAMP_META[action].text;
  elTrayStamp.classList.add('is-visible', STAMP_META[action].cls);
}

function clearCoachHighlights() {
  for (const btn of allActionButtons) {
    btn.classList.remove('is-coach-target');
  }
}

function renderCoachBanner() {
  clearCoachHighlights();
  if (isStandby || gameState.status !== 'playing') {
    elCoachBanner.hidden = true;
    return;
  }

  elCoachBanner.hidden = false;

  if (isTutorial) {
    elCoachStepBadge.textContent = '🖐️ おためし練習';
    elCoachText.textContent =
      'モバイルバッテリーは発火時に客室で対処するため預け入れNG！「🔍 X線透視」を見るか「← 機内持ち込み」へ仕分けましょう！';
    for (const btn of allActionButtons) {
      if (btn.dataset.action === 'carry_on') {
        btn.classList.add('is-coach-target');
      }
    }
    return;
  }

  if (gameState.totalAnswered === 0) {
    elCoachStepBadge.textContent = '💡 第1問ガイド';
    elCoachText.textContent =
      'トレイを「← 機内持ち込み」「↑ 預け荷物」「→ 持込不可」へドラッグ（またはボタン／矢印キー）で仕分けます。迷ったら「🔍 X線透視」！';
    return;
  }

  elCoachStepBadge.textContent = '🛂 検査シフト中';
  elCoachText.textContent =
    '左（青：機内）・上（黄：預け）・右（赤：不可）へ仕分け！Spaceキーまたは「🔍 X線透視」で内部構造をスキャンできます。';
}

function renderStartOverlay() {
  elStartOverlay.hidden = !isStandby;
  elStandbyConsole.hidden = !isStandby;
  document.getElementById('start-mode-note').textContent = gameState.mode === 'training' ? '10問の研修・時間制限なし' : 'スタートから60秒で、いくつ仕分けられる？';
  document.getElementById('sort-instruction-text').textContent = isStandby ? 'ゲームスタートを押して検査をはじめましょう' : '荷物をスワイプ、またはボタンで仕分け';
  elActiveConsole.hidden = isStandby;
  for (const button of allActionButtons) button.disabled = isStandby || actionPending;
  callScene('setActive', !isStandby && !elPanelGame.hidden && !elInspectionStage.hidden && !document.hidden);
  elSceneStatus.textContent = isStandby ? '検査待機中' : '荷物を仕分けてください';
  elInspectionStage.classList.toggle('is-standby', isStandby);
  document.body.classList.toggle('is-standby', isStandby);
  document.body.classList.toggle('is-playing', !isStandby && gameState.status === 'playing');
  elBtnBackStandby.hidden = isStandby || gameState.status !== 'playing';
  elStartPrimaryLabel.textContent = 'ゲームスタート';
}

function renderHud() {
  if (isStandby) {
    elBoardShiftBadge.textContent = '開始前 / STANDBY';
    elHudProgressLabel.textContent = 'READY';
    elHudTimer.textContent = '開始前';
    elHudScore.textContent = '—';
    elHudCombo.textContent = '—';
    return;
  } else if (isTutorial) {
    elBoardShiftBadge.textContent = 'LANE 077 / TUTORIAL';
  } else if (gameState.mode === 'training') {
    elBoardShiftBadge.textContent = 'LANE 077 / TRAINING 10';
  } else {
    elBoardShiftBadge.textContent = 'LANE 077 / 60s RUSH';
  }

  if (gameState.mode === 'rush') {
    elHudProgressLabel.textContent = 'TIMER';
    elHudTimer.textContent = formatSeconds(gameState.remainingSeconds);
  } else {
    elHudProgressLabel.textContent = 'PROGRESS';
    const currentNum = Math.min(gameState.totalAnswered + 1, gameState.targetCount || 10);
    const doneNum = gameState.status === 'finished' ? gameState.targetCount : currentNum;
    elHudTimer.textContent = `${doneNum} / ${gameState.targetCount}`;
  }
  elHudScore.textContent = gameState.score.toLocaleString('ja-JP');
  elHudCombo.textContent = `×${gameState.combo}`;
}

function renderCurrentTray() {
  const item = gameState.currentItem;
  if (!item) return;

  elItemCategoryBadge.textContent = CATEGORY_LABEL_MAP[item.category] || item.category;
  const num = String(gameState.totalAnswered + 1).padStart(2, '0');
  elItemCounterBadge.textContent = isTutorial ? 'PRACTICE #01' : `ITEM #${num}`;
  elItemSvgUse.setAttribute('href', `#item-${item.icon}`);
  elItemName.textContent = item.name;
  elItemSpec.textContent = item.spec;
  document.getElementById('scene-item-name').textContent = item.name;
  document.getElementById('scene-item-spec').textContent = item.spec;
  elCanvas.dataset.item = item.id;
  callScene('showItem', item);

  const xray = getXrayTelemetry(item);
  if (xray) {
    elXrayMaterialTag.textContent = xray.materialTag;
    elXrayInspectPoint.textContent = xray.inspectPoint;
  }

  if (isTutorial) {
    elNextTrayName.textContent = '本番シフトへ続く';
  } else if (gameState.nextItem) {
    elNextTrayName.textContent = gameState.nextItem.name;
  } else {
    elNextTrayName.textContent = 'シフト最終荷物';
  }

  setXrayMode(false, false);
  showStampPreview(null);
  itemPresentedAt = Date.now();
}

function renderFeedback() {
  const fb = gameState.lastFeedback;
  elFeedbackBanner.classList.remove('is-correct', 'is-wrong');

  if (!fb) {
    elFeedbackBadge.textContent = isTutorial ? '練習ナビ' : '検査スタンバイ';
    elFeedbackItemChip.textContent =
      gameState.mode === 'rush'
        ? '60秒タイムアタック（スタートでタイマー開始）'
        : '厳選10問・研修シフト（時間制限なし）';
    elFeedbackText.textContent =
      gameState.mode === 'rush'
        ? '流れてくる荷物を「← 機内持ち込み」「↑ 預け荷物」「→ 持込不可」の3方向へ仕分けてください。迷ったときは「🔍 X線透視」で内部構造を確認できます。'
        : '研修シフト（全10問）：時間制限はありません。1つずつ手荷物ルールとX線所見を確認しながら仕分けましょう！';
    return;
  }

  if (fb.isCorrect) {
    elFeedbackBanner.classList.add('is-correct');
    elFeedbackBadge.textContent = `⭕ 正解 +${fb.gainedPoints}pts`;
    elFeedbackItemChip.textContent = `${fb.item.name} → ${fb.chosenLabel}（${fb.ruleBadge}）`;
    elFeedbackText.textContent = `【${fb.item.name} → ${fb.chosenLabel}】${fb.shortReason}`;
  } else {
    elFeedbackBanner.classList.add('is-wrong');
    elFeedbackBadge.textContent = `❌ ミス（正解：${fb.allowedLabels}）`;
    elFeedbackItemChip.textContent = `${fb.item.name}（あなたの選択：${fb.chosenLabel}）`;
    elFeedbackText.textContent = `【${fb.item.name}】${fb.shortReason}`;
  }
}

function flashTrayAndArch(isCorrect, chosenAction) {
  elSecurityTray.classList.remove('tray-correct', 'tray-wrong');
  elXrayArch.classList.remove('arch-pass', 'arch-alert');
  void elSecurityTray.offsetWidth;
  elSecurityTray.classList.add(isCorrect ? 'tray-correct' : 'tray-wrong');
  elXrayArch.classList.add(isCorrect ? 'arch-pass' : 'arch-alert');
  showStampPreview(chosenAction);

  setTimeout(() => {
    elSecurityTray.classList.remove('tray-correct', 'tray-wrong');
    elXrayArch.classList.remove('arch-pass', 'arch-alert');
    showStampPreview(null);
  }, 360);
}

function renderReviewList(state) {
  const review = getReviewItems(state);
  elReviewHeading.textContent = review.heading;
  elReviewList.replaceChildren();

  for (const entry of review.items) {
    const card = document.createElement('article');
    card.className = `review-item-card${entry.isMistake ? ' is-mistake' : ''}`;

    const head = document.createElement('div');
    head.className = 'review-item-head';

    const title = document.createElement('strong');
    title.textContent = `${entry.item.name}（${entry.item.spec}）`;

    const tags = document.createElement('div');
    tags.className = 'review-tags';

    if (entry.isMistake && entry.chosenLabel) {
      const wrongTag = document.createElement('span');
      wrongTag.className = 'tag-wrong';
      wrongTag.textContent = `あなたの選択: ${entry.chosenLabel}`;
      tags.append(wrongTag);
    }

    const correctTag = document.createElement('span');
    correctTag.className = 'tag-correct';
    correctTag.textContent = `正しい仕分け: ${entry.allowedLabels}`;
    tags.append(correctTag);

    head.append(title, tags);

    const detail = document.createElement('p');
    detail.className = 'review-detail';
    detail.textContent = entry.item.detailRule;

    card.append(head, detail);
    elReviewList.append(card);
  }
}

function onGameFinished() {
  sound.playFinish();
  clearCoachHighlights();
  elCoachBanner.hidden = true;
  elBtnBackStandby.hidden = true;
  document.body.classList.remove('is-playing', 'is-standby');

  record = mergeSessionIntoRecord(record, gameState);
  saveRecord(record);
  updateBestRecordUI();

  const rank = calculateRank(gameState);
  elResultGrade.textContent = rank.grade;
  elResultHeading.textContent = rank.title;
  elResultComment.textContent = rank.comment;
  elResultScore.textContent = `${gameState.score.toLocaleString('ja-JP')} pts`;
  elResultAccuracy.textContent = `${gameState.correctCount} / ${gameState.totalAnswered} (${rank.accuracy}%)`;
  elResultCombo.textContent = `×${gameState.maxCombo}`;

  elBtnSwitchMode.textContent =
    gameState.mode === 'rush' ? '🎓 10問・研修シフトで復習する' : '⏱️ 60秒タイムアタックに挑戦する';

  renderReviewList(gameState);
  elInspectionStage.hidden = true;
  callScene('setActive', false);
  elResultPanel.hidden = false;
  elResultHeading.focus({ preventScroll: true });
  elResultPanel.scrollIntoView({ block: 'start', behavior: 'instant' });
}

function handleAction(action) {
  if (gameState.status !== 'playing' || actionPending || isStandby) return;

  // おためし練習モード時の処理
  if (isTutorial) {
    if (action !== 'carry_on') {
      sound.playWrong();
      callScene('setDrag', 0, 0);
      flashTrayAndArch(false, action);
      elFeedbackBanner.classList.remove('is-correct');
      elFeedbackBanner.classList.add('is-wrong');
      elFeedbackBadge.textContent = '💡 もういちど（正解：← 機内持ち込み）';
      elFeedbackItemChip.textContent = 'おためし練習：モバイルバッテリー';
      elFeedbackText.textContent =
        'モバイルバッテリーは貨物室で発火すると消火できないため預け入れNGです。左の「← 機内持ち込み」を選んでみましょう！';
      return;
    }

    sound.playCorrect(1);
    callScene('sort', action, true);
    flashTrayAndArch(true, action);
    holdActions();
    isTutorial = false;
    gameState = createGameState(gameState.mode);
    renderHud();
    renderCurrentTray();
    renderCoachBanner();
    elFeedbackBanner.classList.remove('is-wrong');
    elFeedbackBanner.classList.add('is-correct');
    elFeedbackBadge.textContent = '🎉 練習クリア！本番シフト開始';
    elFeedbackItemChip.textContent = 'モバイルバッテリー → 機内持ち込み（正解！）';
    elFeedbackText.textContent =
      'バッチリです！そのまま本番シフトがスタートしました。次々流れてくる荷物を3方向へ仕分けましょう！';
    ensureRushTimerStarted();
    return;
  }

  ensureRushTimerStarted();
  const elapsedMs = Math.max(100, Date.now() - itemPresentedAt);
  gameState = submitAction(gameState, action, { elapsedMs });

  const last = gameState.lastFeedback;
  if (last) {
    if (last.isCorrect) {
      sound.playCorrect(gameState.combo);
    } else {
      sound.playWrong();
    }
    callScene('sort', action, last.isCorrect);
    flashTrayAndArch(last.isCorrect, action);
    holdActions();
  }

  renderHud();
  renderFeedback();
  renderCoachBanner();

  if (gameState.status === 'finished') {
    stopTimer();
    onGameFinished();
  } else {
    renderCurrentTray();
  }
}

function prepareStandby(mode = gameState.mode) {
  releaseActions();
  stopTimer();
  isStandby = true;
  isTutorial = false;
  gameState = createGameState(mode);
  elModeRush.classList.toggle('is-selected', mode === 'rush');
  elModeTraining.classList.toggle('is-selected', mode === 'training');
  elModeTraining.setAttribute('aria-pressed', String(mode === 'training'));
  elModeRush.setAttribute('aria-pressed', String(mode === 'rush'));
  elInspectionStage.hidden = false;
  elResultPanel.hidden = true;
  renderStartOverlay();
  renderHud();
  renderCurrentTray();
  renderFeedback();
  renderCoachBanner();
}

function startActiveShift(mode = gameState.mode) {
  releaseActions();
  stopTimer();
  isStandby = false;
  isTutorial = false;
  gameState = createGameState(mode);
  elModeRush.classList.toggle('is-selected', mode === 'rush');
  elModeTraining.classList.toggle('is-selected', mode === 'training');
  elModeTraining.setAttribute('aria-pressed', String(mode === 'training'));
  elModeRush.setAttribute('aria-pressed', String(mode === 'rush'));
  elInspectionStage.hidden = false;
  elResultPanel.hidden = true;
  pausedByOverlay = false;
  setInspectionView();
  sound.playStart();
  elSecurityTray.focus({ preventScroll: true });
  renderStartOverlay();
  renderHud();
  renderCurrentTray();
  renderFeedback();
  renderCoachBanner();
  ensureRushTimerStarted();
}

function startTutorialPractice() {
  releaseActions();
  stopTimer();
  isStandby = false;
  isTutorial = true;
  gameState = createGameState(gameState.mode);
  const tutorialItem = getItemById('powerbank-10000') || gameState.currentItem;
  gameState = {
    ...gameState,
    currentItem: tutorialItem
  };
  elInspectionStage.hidden = false;
  elResultPanel.hidden = true;
  pausedByOverlay = false;
  setInspectionView();
  sound.playStart();
  elSecurityTray.focus({ preventScroll: true });
  renderStartOverlay();
  renderHud();
  renderCurrentTray();
  setXrayMode(true, false);
  renderFeedback();
  renderCoachBanner();
}

// ==================== 図鑑タブの描画 ====================
function badgeClassForAllowed(allowed) {
  if (allowed.includes('prohibited')) return 'badge-prohibited';
  if (allowed.includes('carry_on') && allowed.includes('checked')) return 'badge-both';
  if (allowed.includes('carry_on')) return 'badge-carry';
  return 'badge-checked';
}

function renderCatalogCategories() {
  elCatalogCategories.replaceChildren();
  for (const cat of CATEGORIES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `cat-chip${cat.id === selectedCategory ? ' is-active' : ''}`;
    btn.textContent = cat.label;
    btn.dataset.catId = cat.id;
    btn.addEventListener('click', () => {
      selectedCategory = cat.id;
      renderCatalogCategories();
      renderCatalogItems();
    });
    elCatalogCategories.append(btn);
  }
}

function renderCatalogItems() {
  const query = elCatalogSearch.value || '';
  const items = filterItems({ category: selectedCategory, query });
  elCatalogCount.textContent = `${items.length}件を表示中（全36品目）`;
  elCatalogGrid.replaceChildren();

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'catalog-card';

    const top = document.createElement('div');
    top.className = 'catalog-card-top';

    const iconBox = document.createElement('div');
    iconBox.className = 'catalog-icon-box';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 96 96');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#item-${item.icon}`);
    svg.append(use);
    iconBox.append(svg);

    const titles = document.createElement('div');
    titles.className = 'catalog-card-titles';
    const h3 = document.createElement('h3');
    h3.textContent = item.name;
    const spec = document.createElement('p');
    spec.textContent = item.spec;
    titles.append(h3, spec);

    top.append(iconBox, titles);

    const badge = document.createElement('span');
    badge.className = `catalog-badge ${badgeClassForAllowed(item.allowed)}`;
    badge.textContent = item.ruleBadge;

    const ruleText = document.createElement('p');
    ruleText.className = 'catalog-rule-text';
    ruleText.textContent = item.detailRule;

    card.append(top, badge, ruleText);
    elCatalogGrid.append(card);
  }
}

function switchTab(tabName) {
  const isGame = tabName === 'game';
  elTabGame.classList.toggle('is-active', isGame);
  elTabGame.setAttribute('aria-pressed', String(isGame));
  elTabCatalog.classList.toggle('is-active', !isGame);
  elTabCatalog.setAttribute('aria-pressed', String(!isGame));
  elPanelGame.hidden = !isGame;
  elPanelCatalog.hidden = isGame;

  if (!isGame) {
    pauseShift();
  } else {
    resumeShift();
  }
  callScene('setActive', !isStandby && isGame && !elInspectionStage.hidden && !document.hidden);
}

// ==================== イベント結線 ====================
elSoundToggle.addEventListener('click', () => {
  const next = !sound.isEnabled();
  sound.setEnabled(next);
  record = { ...record, soundEnabled: next };
  saveRecord(record);
  updateSoundButtonUI();
  if (next) {
    sound.playStart();
  }
});

elGuideOpenBtn.addEventListener('click', () => {
  pauseShift();
  if (typeof elGuideDialog.showModal === 'function') {
    elGuideDialog.showModal();
  } else {
    elGuideDialog.setAttribute('open', '');
  }
});

function closeGuideDialog() {
  if (typeof elGuideDialog.close === 'function') {
    elGuideDialog.close();
  } else {
    elGuideDialog.removeAttribute('open');
  }
  resumeShift();
}

elGuideCloseBtn.addEventListener('click', closeGuideDialog);
elGuideOkBtn.addEventListener('click', closeGuideDialog);
elGuideDialog.addEventListener('close', resumeShift);

elTabGame.addEventListener('click', () => switchTab('game'));
elTabCatalog.addEventListener('click', () => switchTab('catalog'));

elModeRush.addEventListener('click', () => isStandby ? prepareStandby('rush') : startActiveShift('rush'));
elModeTraining.addEventListener('click', () => isStandby ? prepareStandby('training') : startActiveShift('training'));

elBtnStartShift.addEventListener('click', () => startActiveShift(gameState.mode));
elBtnStartTutorial.addEventListener('click', () => startTutorialPractice());
elBtnBackStandby.addEventListener('click', () => prepareStandby(gameState.mode));

elBtnXrayToggle.addEventListener('click', (event) => {
  event.stopPropagation();
  setXrayMode(!xrayEnabled, true);
});

elBtnRetry.addEventListener('click', () => startActiveShift(gameState.mode));
elBtnSwitchMode.addEventListener('click', () => {
  const nextMode = gameState.mode === 'rush' ? 'training' : 'rush';
  startActiveShift(nextMode);
});
elBtnOpenCatalog.addEventListener('click', () => switchTab('catalog'));

elCatalogSearch.addEventListener('input', () => renderCatalogItems());

// 3方向ボタン（PC・モバイル共通）
for (const btn of allActionButtons) {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (action) {
      handleAction(action);
    }
  });
}

// キーボードショートカット（矢印キー & WASD & SpaceでX線透視）
window.addEventListener('keydown', (event) => {
  if (isStandby || event.repeat || elPanelGame.hidden || elGuideDialog.open || gameState.status !== 'playing') {
    return;
  }
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return;
  }

  if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
    event.preventDefault();
    handleAction('carry_on');
  } else if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
    event.preventDefault();
    handleAction('checked');
  } else if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
    event.preventDefault();
    handleAction('prohibited');
  } else if (event.key === ' ' && document.activeElement?.tagName !== 'BUTTON') {
    event.preventDefault();
    setXrayMode(!xrayEnabled, true);
  }
});

// 検査トレイのポインタードラッグ／スワイプ操作
let dragStart = null;

function clearDragHighlights() {
  for (const z of document.querySelectorAll('.action-zone')) {
    z.classList.remove('is-drag-target');
  }
}

elSecurityTray.addEventListener('pointerdown', (event) => {
  if (event.target.closest('button, a, input, select, textarea')) return;
  if (event.button !== 0 || isStandby || actionPending || gameState.status !== 'playing') return;
  dragStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
  if (elSecurityTray.setPointerCapture) {
    try {
      elSecurityTray.setPointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }
});

elSecurityTray.addEventListener('pointermove', (event) => {
  if (!dragStart || event.pointerId !== dragStart.pointerId) return;
  const dx = event.clientX - dragStart.x;
  const dy = event.clientY - dragStart.y;
  const clampX = Math.max(-95, Math.min(95, dx));
  const clampY = Math.max(-95, Math.min(40, dy));
  callScene('setDrag', clampX, clampY);

  clearDragHighlights();
  if (dy < -42 && Math.abs(dy) > Math.abs(dx)) {
    document.getElementById('btn-checked')?.classList.add('is-drag-target');
    showStampPreview('checked');
  } else if (dx < -45) {
    document.getElementById('btn-carry-on')?.classList.add('is-drag-target');
    showStampPreview('carry_on');
  } else if (dx > 45) {
    document.getElementById('btn-prohibited')?.classList.add('is-drag-target');
    showStampPreview('prohibited');
  } else {
    showStampPreview(null);
  }
});

function finishDrag(event) {
  if (!dragStart || (event && event.pointerId !== dragStart.pointerId)) return;
  const dx = event ? event.clientX - dragStart.x : 0;
  const dy = event ? event.clientY - dragStart.y : 0;
  dragStart = null;
  callScene('setDrag', 0, 0);
  clearDragHighlights();

  if (dy < -50 && Math.abs(dy) > Math.abs(dx)) {
    handleAction('checked');
  } else if (dx < -55) {
    handleAction('carry_on');
  } else if (dx > 55) {
    handleAction('prohibited');
  } else {
    showStampPreview(null);
  }
}

elSecurityTray.addEventListener('pointerup', finishDrag);
elSecurityTray.addEventListener('pointercancel', () => {
  dragStart = null;
  callScene('setDrag', 0, 0);
  clearDragHighlights();
  showStampPreview(null);
});
elSecurityTray.addEventListener('lostpointercapture', () => {
  dragStart = null;
  callScene('setDrag', 0, 0);
  clearDragHighlights();
});

function holdActions() {
  actionPending = true;
  for (const button of allActionButtons) button.disabled = true;
  pendingActionTimer = setTimeout(releaseActions, reducedMotion.matches ? 60 : 430);
}

function releaseActions() {
  clearTimeout(pendingActionTimer);
  pendingActionTimer = null;
  actionPending = false;
  for (const button of allActionButtons) button.disabled = isStandby || gameState.status !== 'playing';
}

function pauseShift() {
  if (timerRunning) {
    pausedByOverlay = true;
    stopTimer();
    elSceneStatus.textContent = '一時停止中';
  }
}

function resumeShift() {
  if (pausedByOverlay && !document.hidden && !elPanelGame.hidden && !elGuideDialog.open && !isStandby) {
    pausedByOverlay = false;
    ensureRushTimerStarted();
    elSceneStatus.textContent = '荷物を仕分けてください';
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseShift();
  else resumeShift();
});

function setInspectionView() {
  cameraClose = true;
  callScene('setView', 'close');
  elCameraButton.setAttribute('aria-pressed', 'true');
  elCameraButton.setAttribute('aria-label', '検査レーン全体を見る');
}

elCameraButton.addEventListener('click', () => {
  cameraClose = !cameraClose;
  callScene('setView', cameraClose ? 'close' : 'overview');
  elCameraButton.setAttribute('aria-pressed', String(cameraClose));
  elCameraButton.setAttribute('aria-label', cameraClose ? '検査レーン全体を見る' : '荷物を近くから見る');
  elCanvas.dataset.view = cameraClose ? 'close' : 'overview';
});
document.getElementById('btn-scene-retry').addEventListener('click', () => window.location.reload());

function callScene(method, ...args) {
  if (!scene) return;
  try { return scene[method](...args); }
  catch { showSceneError(); }
}

function showSceneError() {
  const failed = scene;
  scene = null;
  try { failed?.dispose(); } catch { /* Keep the text game available after a renderer failure. */ }

  elSceneLoading.hidden = true;
  elSceneError.hidden = false;
  elCanvas.dataset.ready = 'false';
  elCameraButton.disabled = true;
  elSceneStatus.textContent = '3D表示を利用できません';
}

async function initializeScene() {
  try {
    const { createInspectionScene } = await import('./lib/scene.js');
    scene = createInspectionScene(elCanvas, {
      reducedMotion: reducedMotion.matches,
      onReady() { elSceneLoading.hidden = true; elSceneError.hidden = true; },
      onError: showSceneError
    });
    callScene('showItem', gameState.currentItem);
    callScene('setXray', xrayEnabled);
    callScene('setView', cameraClose ? 'close' : 'overview');
    callScene('setActive', !isStandby && !elPanelGame.hidden && !elInspectionStage.hidden && !document.hidden);
  } catch {
    showSceneError();
  }
}
window.addEventListener('pagehide', (event) => {
  if (event.persisted) callScene('setActive', false);
  else callScene('dispose');
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) callScene('setActive', !isStandby && !elPanelGame.hidden && !elInspectionStage.hidden && !document.hidden);
});

// 初期化
updateSoundButtonUI();
updateBestRecordUI();
renderCatalogCategories();
renderCatalogItems();
prepareStandby('training');
initializeScene();
