import {
  calculateRank,
  createGameState,
  getReviewItems,
  submitAction,
  tickTimer
} from './lib/engine.js';
import { CATEGORIES, filterItems } from './lib/items.js';
import { createSoundController } from './lib/sound.js';
import { loadRecord, mergeSessionIntoRecord, saveRecord } from './lib/storage.js';

const CATEGORY_LABEL_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

const sound = createSoundController();
let record = loadRecord();
sound.setEnabled(record.soundEnabled);

let gameState = createGameState('rush');
let timerId = null;
let timerRunning = false;
let itemPresentedAt = Date.now();
let selectedCategory = 'all';

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

const elHudProgressLabel = document.getElementById('hud-progress-label');
const elHudTimer = document.getElementById('hud-timer');
const elHudScore = document.getElementById('hud-score');
const elHudCombo = document.getElementById('hud-combo');

const elInspectionStage = document.getElementById('inspection-stage');
const elSecurityTray = document.getElementById('security-tray');
const elItemCategoryBadge = document.getElementById('item-category-badge');
const elItemCounterBadge = document.getElementById('item-counter-badge');
const elItemSvgUse = document.getElementById('item-svg-use');
const elItemName = document.getElementById('item-name');
const elItemSpec = document.getElementById('item-spec');

const elFeedbackBanner = document.getElementById('feedback-banner');
const elFeedbackBadge = document.getElementById('feedback-badge');
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

function formatSeconds(sec) {
  const safe = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateSoundButtonUI() {
  const on = sound.isEnabled();
  elSoundToggle.setAttribute('aria-pressed', String(on));
  elSoundIcon.textContent = on ? '🔊' : '🔇';
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
  if (gameState.mode !== 'rush' || gameState.status !== 'playing' || timerRunning) {
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

function renderHud() {
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
  elItemCounterBadge.textContent = `ITEM #${num}`;
  elItemSvgUse.setAttribute('href', `#item-${item.icon}`);
  elItemName.textContent = item.name;
  elItemSpec.textContent = item.spec;
  itemPresentedAt = Date.now();
}

function renderFeedback() {
  const fb = gameState.lastFeedback;
  elFeedbackBanner.classList.remove('is-correct', 'is-wrong');

  if (!fb) {
    elFeedbackBadge.textContent = '検査スタンバイ';
    elFeedbackText.textContent =
      gameState.mode === 'rush'
        ? '流れてくる荷物を「← 機内持ち込み」「↑ 預け荷物」「→ 持込不可」の3方向へ仕分けてください。最初の1個を仕分けると60秒タイマーが開始します！'
        : '研修シフト（全10問）：時間制限はありません。1つずつ手荷物ルールを確認しながら仕分けましょう！';
    return;
  }

  if (fb.isCorrect) {
    elFeedbackBanner.classList.add('is-correct');
    elFeedbackBadge.textContent = `⭕ 正解 +${fb.gainedPoints}pts`;
    elFeedbackText.textContent = `【${fb.item.name} → ${fb.chosenLabel}】${fb.shortReason}`;
  } else {
    elFeedbackBanner.classList.add('is-wrong');
    elFeedbackBadge.textContent = `❌ ミス（正解：${fb.allowedLabels}）`;
    elFeedbackText.textContent = `【${fb.item.name}】${fb.shortReason}`;
  }
}

function flashTrayState(isCorrect) {
  elSecurityTray.classList.remove('tray-correct', 'tray-wrong');
  void elSecurityTray.offsetWidth;
  elSecurityTray.classList.add(isCorrect ? 'tray-correct' : 'tray-wrong');
  setTimeout(() => {
    elSecurityTray.classList.remove('tray-correct', 'tray-wrong');
  }, 320);
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
  elResultPanel.hidden = false;
}

function handleAction(action) {
  if (gameState.status !== 'playing') return;

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
    flashTrayState(last.isCorrect);
  }

  renderHud();
  renderFeedback();

  if (gameState.status === 'finished') {
    stopTimer();
    onGameFinished();
  } else {
    renderCurrentTray();
  }
}

function startNewGame(mode = gameState.mode) {
  stopTimer();
  gameState = createGameState(mode);
  elModeRush.classList.toggle('is-selected', mode === 'rush');
  elModeTraining.classList.toggle('is-selected', mode === 'training');
  elInspectionStage.hidden = false;
  elResultPanel.hidden = true;
  sound.playStart();
  renderHud();
  renderCurrentTray();
  renderFeedback();
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
  const list = filterItems({ category: selectedCategory, query });
  elCatalogCount.textContent = `全36品目中 ${list.length}件を表示中`;
  elCatalogGrid.replaceChildren();

  for (const item of list) {
    const card = document.createElement('article');
    card.className = 'catalog-card';

    const top = document.createElement('div');
    top.className = 'catalog-card-top';

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'catalog-icon');
    svg.setAttribute('viewBox', '0 0 80 80');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(svgNS, 'use');
    use.setAttribute('href', `#item-${item.icon}`);
    svg.append(use);

    const titles = document.createElement('div');
    titles.className = 'catalog-card-titles';
    const h3 = document.createElement('h3');
    h3.textContent = item.name;
    const spec = document.createElement('p');
    spec.textContent = item.spec;
    titles.append(h3, spec);

    top.append(svg, titles);

    const badge = document.createElement('span');
    badge.className = `catalog-badge ${badgeClassForAllowed(item.allowed)}`;
    badge.textContent = item.ruleBadge;

    const desc = document.createElement('p');
    desc.className = 'catalog-rule-text';
    desc.textContent = item.detailRule;

    card.append(top, badge, desc);
    elCatalogGrid.append(card);
  }
}

function switchTab(tabName) {
  const isGame = tabName === 'game';
  elTabGame.classList.toggle('is-active', isGame);
  elTabGame.setAttribute('aria-selected', String(isGame));
  elTabCatalog.classList.toggle('is-active', !isGame);
  elTabCatalog.setAttribute('aria-selected', String(!isGame));
  elPanelGame.hidden = !isGame;
  elPanelCatalog.hidden = isGame;
}

// ==================== イベント結線 ====================
elTabGame.addEventListener('click', () => switchTab('game'));
elTabCatalog.addEventListener('click', () => switchTab('catalog'));

elModeRush.addEventListener('click', () => startNewGame('rush'));
elModeTraining.addEventListener('click', () => startNewGame('training'));

for (const btn of document.querySelectorAll('[data-action]')) {
  btn.addEventListener('click', () => {
    const act = btn.getAttribute('data-action');
    if (act) handleAction(act);
  });
}

elBtnRetry.addEventListener('click', () => startNewGame(gameState.mode));
elBtnSwitchMode.addEventListener('click', () => {
  const nextMode = gameState.mode === 'rush' ? 'training' : 'rush';
  startNewGame(nextMode);
});
elBtnOpenCatalog.addEventListener('click', () => switchTab('catalog'));

elCatalogSearch.addEventListener('input', () => renderCatalogItems());

elSoundToggle.addEventListener('click', () => {
  const next = !sound.isEnabled();
  sound.setEnabled(next);
  record = saveRecord({ ...record, soundEnabled: next });
  updateSoundButtonUI();
  if (next) sound.playStart();
});

elGuideOpenBtn.addEventListener('click', () => {
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
}

elGuideCloseBtn.addEventListener('click', closeGuideDialog);
elGuideOkBtn.addEventListener('click', closeGuideDialog);

// キーボードショートカット
window.addEventListener('keydown', (e) => {
  if (elPanelGame.hidden || gameState.status !== 'playing') return;
  if (elGuideDialog.open) return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  const key = e.key.toLowerCase();
  if (e.key === 'ArrowLeft' || key === 'a') {
    e.preventDefault();
    handleAction('carry_on');
  } else if (e.key === 'ArrowUp' || key === 'w') {
    e.preventDefault();
    handleAction('checked');
  } else if (e.key === 'ArrowRight' || key === 'd') {
    e.preventDefault();
    handleAction('prohibited');
  }
});

// トレイのドラッグ／スワイプ仕分け
let dragStart = null;

elSecurityTray.addEventListener('pointerdown', (e) => {
  if (gameState.status !== 'playing') return;
  dragStart = { x: e.clientX, y: e.clientY, id: e.pointerId };
  try {
    elSecurityTray.setPointerCapture(e.pointerId);
  } catch {
    // ignore
  }
});

elSecurityTray.addEventListener('pointermove', (e) => {
  if (!dragStart || e.pointerId !== dragStart.id) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  const clampX = Math.max(-65, Math.min(65, dx * 0.45));
  const clampY = Math.max(-55, Math.min(35, dy * 0.45));
  elSecurityTray.style.transform = `translate(${clampX}px, ${clampY}px) rotate(${clampX * 0.08}deg)`;
});

function finishDrag(e) {
  if (!dragStart || (e && e.pointerId !== undefined && e.pointerId !== dragStart.id)) return;
  const dx = e ? e.clientX - dragStart.x : 0;
  const dy = e ? e.clientY - dragStart.y : 0;
  dragStart = null;
  elSecurityTray.style.transform = '';

  const threshold = 38;
  if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

  if (dy < -threshold && Math.abs(dy) >= Math.abs(dx) * 0.85) {
    handleAction('checked');
  } else if (dx < -threshold) {
    handleAction('carry_on');
  } else if (dx > threshold) {
    handleAction('prohibited');
  }
}

elSecurityTray.addEventListener('pointerup', finishDrag);
elSecurityTray.addEventListener('pointercancel', () => {
  dragStart = null;
  elSecurityTray.style.transform = '';
});

// 初期描画
updateSoundButtonUI();
updateBestRecordUI();
renderCatalogCategories();
renderCatalogItems();
renderHud();
renderCurrentTray();
renderFeedback();
