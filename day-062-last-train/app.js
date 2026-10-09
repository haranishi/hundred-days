import {
  PRESET_STATIONS,
  DEFAULT_LOSS_ITEMS,
  STATUS_META,
  SURVIVAL_OPTIONS,
  parseTrainTime,
  calculateTotalLossMinutes,
  calculateDeadline,
  getStatusLevel,
  formatTimeDisplay,
  getFirstTrainRemainingMs
} from './lib/train-logic.js';
import { sound } from './lib/audio.js';

// アプリケーション状態
const state = {
  stationName: '新宿駅',
  trainTimeStr: '23:55',
  walkMinutes: 7,
  lossItems: JSON.parse(JSON.stringify(DEFAULT_LOSS_ITEMS)),
  soundEnabled: true,
  currentLevel: 'safe',
  lastBeatTime: 0,
  escaped: false
};

// DOM要素
const el = {
  body: document.body,
  btnSound: document.getElementById('btn-sound'),
  soundIcon: document.getElementById('sound-icon'),
  soundText: document.getElementById('sound-text'),
  btnShareLink: document.getElementById('btn-share-link'),
  statusBadge: document.getElementById('status-badge'),
  statusName: document.getElementById('status-name'),
  statusMessage: document.getElementById('status-message'),
  displayStationName: document.getElementById('display-station-name'),
  displayTrainTime: document.getElementById('display-train-time'),
  digitHours: document.getElementById('digit-hours'),
  digitMinutes: document.getElementById('digit-minutes'),
  digitSeconds: document.getElementById('digit-seconds'),
  digitTenths: document.getElementById('digit-tenths'),
  valDeadline: document.getElementById('val-deadline'),
  valLossTotal: document.getElementById('val-loss-total'),
  valCurrentTime: document.getElementById('val-current-time'),
  btnEscaped: document.getElementById('btn-escaped'),
  gameoverPanel: document.getElementById('gameover-panel'),
  firstTrainDigits: document.getElementById('first-train-digits'),
  rouletteResult: document.getElementById('roulette-result'),
  rouletteCost: document.getElementById('roulette-cost'),
  btnSpinRoulette: document.getElementById('btn-spin-roulette'),
  presetGrid: document.getElementById('preset-grid'),
  inputTrainTime: document.getElementById('input-train-time'),
  inputStationName: document.getElementById('input-station-name'),
  checkBill: document.getElementById('check-bill'),
  checkCoat: document.getElementById('check-coat'),
  checkToilet: document.getElementById('check-toilet'),
  checkWicket: document.getElementById('check-wicket'),
  walkSlider: document.getElementById('walk-slider'),
  walkValDisplay: document.getElementById('walk-val-display'),
  successModal: document.getElementById('success-modal'),
  modalStats: document.getElementById('modal-stats'),
  btnModalShare: document.getElementById('btn-modal-share'),
  btnModalClose: document.getElementById('btn-modal-close')
};

// 初期化
function init() {
  loadFromUrlOrStorage();
  renderPresets();
  syncInputsWithState();
  bindEvents();
  startTimerLoop();
}

// プリセット駅ボタンの生成
function renderPresets() {
  el.presetGrid.innerHTML = '';
  PRESET_STATIONS.forEach((st) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'station-pill';
    btn.textContent = st.name;
    if (st.name === state.stationName && st.defaultTrain === state.trainTimeStr) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      sound.unlock();
      state.stationName = st.name;
      state.trainTimeStr = st.defaultTrain;
      state.walkMinutes = st.walkMinutes;
      syncInputsWithState();
      saveState();
      updateDisplay();
    });
    el.presetGrid.appendChild(btn);
  });
}

// 画面入力値と状態の同期
function syncInputsWithState() {
  el.inputTrainTime.value = state.trainTimeStr;
  el.inputStationName.value = state.stationName;
  el.walkSlider.value = state.walkMinutes;
  el.walkValDisplay.textContent = state.walkMinutes;

  el.checkBill.checked = !!state.lossItems.bill?.enabled;
  el.checkCoat.checked = !!state.lossItems.coat?.enabled;
  el.checkToilet.checked = !!state.lossItems.toilet?.enabled;
  el.checkWicket.checked = !!state.lossItems.wicket?.enabled;

  // プリセットのアクティブ表示更新
  const pills = el.presetGrid.querySelectorAll('.station-pill');
  pills.forEach((p, idx) => {
    const st = PRESET_STATIONS[idx];
    if (st && st.name === state.stationName && st.defaultTrain === state.trainTimeStr) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });
}

// イベントリスナーの登録
function bindEvents() {
  // オーディオアンロック
  document.addEventListener('click', () => sound.unlock(), { once: true });
  document.addEventListener('touchstart', () => sound.unlock(), { once: true });

  // サウンド切り替え
  el.btnSound.addEventListener('click', () => {
    sound.unlock();
    const enabled = sound.toggleSound();
    state.soundEnabled = enabled;
    el.soundIcon.textContent = enabled ? '🔊' : '🔇';
    el.soundText.textContent = enabled ? 'サウンド ON' : 'サウンド OFF';
  });

  // URL共有
  el.btnShareLink.addEventListener('click', () => {
    sound.unlock();
    const url = new URL(window.location.href);
    url.searchParams.set('train', state.trainTimeStr);
    url.searchParams.set('station', state.stationName);
    url.searchParams.set('walk', state.walkMinutes);
    navigator.clipboard.writeText(url.toString()).then(() => {
      const originalText = el.btnShareLink.textContent;
      el.btnShareLink.textContent = '✅ URLコピー完了!';
      setTimeout(() => {
        el.btnShareLink.textContent = originalText;
      }, 2000);
    });
  });

  // 駅名・時刻入力
  el.inputTrainTime.addEventListener('change', (e) => {
    sound.unlock();
    if (e.target.value) {
      state.trainTimeStr = e.target.value;
      saveState();
      updateDisplay();
    }
  });

  el.inputStationName.addEventListener('input', (e) => {
    state.stationName = e.target.value.trim() || '最寄り駅';
    saveState();
    updateDisplay();
  });

  // チェックボックス
  const handleCheck = (key, checkbox) => {
    sound.unlock();
    if (state.lossItems[key]) {
      state.lossItems[key].enabled = checkbox.checked;
      saveState();
      updateDisplay();
    }
  };

  el.checkBill.addEventListener('change', () => handleCheck('bill', el.checkBill));
  el.checkCoat.addEventListener('change', () => handleCheck('coat', el.checkCoat));
  el.checkToilet.addEventListener('change', () => handleCheck('toilet', el.checkToilet));
  el.checkWicket.addEventListener('change', () => handleCheck('wicket', el.checkWicket));

  // 徒歩スライダー
  el.walkSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    state.walkMinutes = val;
    el.walkValDisplay.textContent = val;
    saveState();
    updateDisplay();
  });

  // 脱出完了ボタン
  el.btnEscaped.addEventListener('click', () => {
    sound.unlock();
    sound.playSuccess();
    state.escaped = true;
    showSuccessModal();
  });

  el.btnModalClose.addEventListener('click', () => {
    el.successModal.classList.remove('active');
  });

  // ルーレットボタン
  el.btnSpinRoulette.addEventListener('click', () => {
    sound.unlock();
    spinRoulette();
  });
}

// メイン更新処理
function updateDisplay() {
  const now = new Date();
  const trainDate = parseTrainTime(state.trainTimeStr, now);
  const totalLoss = calculateTotalLossMinutes(state.lossItems, state.walkMinutes);
  const deadlineDate = calculateDeadline(trainDate, totalLoss);

  const remainingMs = deadlineDate.getTime() - now.getTime();
  const level = getStatusLevel(remainingMs);
  const meta = STATUS_META[level];

  // レベル変更検知
  if (level !== state.currentLevel) {
    state.currentLevel = level;
    if (level === 'suddendeath') {
      sound.playWarning(880);
    } else if (level === 'gameover') {
      sound.playGameOver();
    } else if (level === 'critical') {
      sound.playWarning(660);
    }
  }

  // 背景・アクセントカラーの更新
  el.body.setAttribute('data-level', level);
  document.documentElement.style.setProperty('--accent-color', meta.badgeColor);

  // ステータス表示
  el.statusBadge.textContent = meta.level;
  el.statusBadge.style.background = meta.badgeColor;
  el.statusName.textContent = meta.name;
  el.statusMessage.textContent = meta.message;

  // 終電情報
  el.displayStationName.textContent = state.stationName;
  el.displayTrainTime.textContent = state.trainTimeStr;

  // カウントダウン
  const timeInfo = formatTimeDisplay(remainingMs);
  el.digitHours.textContent = timeInfo.hours;
  el.digitMinutes.textContent = timeInfo.minutes;
  el.digitSeconds.textContent = timeInfo.seconds;
  el.digitTenths.textContent = timeInfo.tenths;

  // サブブレイクダウン
  const pad = (n) => String(n).padStart(2, '0');
  el.valDeadline.textContent = `${pad(deadlineDate.getHours())}:${pad(deadlineDate.getMinutes())}`;
  el.valLossTotal.textContent = `${totalLoss} 分`;
  el.valCurrentTime.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  // 音の再生（心拍音・秒針音）
  const currentTimeMs = now.getTime();
  if (level === 'suddendeath') {
    // 1秒ごとに心拍音と秒針
    if (currentTimeMs - state.lastBeatTime > 800) {
      sound.playHeartbeat(0.9);
      sound.playTick();
      state.lastBeatTime = currentTimeMs;
    }
  } else if (level === 'critical') {
    // 1.5秒ごとに心拍音
    if (currentTimeMs - state.lastBeatTime > 1500) {
      sound.playHeartbeat(0.6);
      state.lastBeatTime = currentTimeMs;
    }
  }

  // GameOver時の始発タイマー更新
  if (level === 'gameover') {
    el.gameoverPanel.classList.add('active');
    const firstTrainMs = getFirstTrainRemainingMs(now);
    const ftInfo = formatTimeDisplay(firstTrainMs);
    el.firstTrainDigits.textContent = `${ftInfo.hours}:${ftInfo.minutes}:${ftInfo.seconds}`;
  } else {
    el.gameoverPanel.classList.remove('active');
  }
}

// タイマーループ（約100ms周期）
function startTimerLoop() {
  updateDisplay();
  setInterval(updateDisplay, 100);
}

// サバイバルルーレット
function spinRoulette() {
  const chosen = SURVIVAL_OPTIONS[Math.floor(Math.random() * SURVIVAL_OPTIONS.length)];
  el.rouletteResult.textContent = chosen.title;
  el.rouletteCost.textContent = `${chosen.desc} (${chosen.cost})`;
  sound.playWarning(520);
}

// 脱出成功モーダル表示
function showSuccessModal() {
  const now = new Date();
  const trainDate = parseTrainTime(state.trainTimeStr, now);
  const totalLoss = calculateTotalLossMinutes(state.lossItems, state.walkMinutes);
  const deadlineDate = calculateDeadline(trainDate, totalLoss);
  const diffMinutes = Math.round((deadlineDate.getTime() - now.getTime()) / (60 * 1000));

  const statsText = diffMinutes >= 0
    ? `デッドラインまで残り【${diffMinutes}分】の時点で店を脱出しました！\n終電（${state.stationName} ${state.trainTimeStr}発）に十分間に合います。`
    : `デッドラインを【${Math.abs(diffMinutes)}分】超過して退店しました！駅までダッシュしてください！`;

  el.modalStats.textContent = statsText;

  // Xシェアリンク生成
  const shareText = `【終電サドンデス 脱出完了！】\n${state.stationName}発 ${state.trainTimeStr}の終電に対し、デッドライン残り${diffMinutes}分で店を出ました！今夜の帰宅権を防衛完了🏃‍♂️💨\n\n#終電サドンデス #100日チャレンジ`;
  const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(window.location.href)}`;
  el.btnModalShare.href = shareUrl;

  el.successModal.classList.add('active');
}

// LocalStorage & URLパラメータ処理
function saveState() {
  try {
    localStorage.setItem('day062_state', JSON.stringify({
      stationName: state.stationName,
      trainTimeStr: state.trainTimeStr,
      walkMinutes: state.walkMinutes,
      lossItems: state.lossItems
    }));
  } catch (_) {}
}

function loadFromUrlOrStorage() {
  const params = new URLSearchParams(window.location.search);
  const urlTrain = params.get('train');
  const urlStation = params.get('station');
  const urlWalk = params.get('walk');

  if (urlTrain) state.trainTimeStr = urlTrain;
  if (urlStation) state.stationName = urlStation;
  if (urlWalk && !isNaN(parseInt(urlWalk, 10))) state.walkMinutes = parseInt(urlWalk, 10);

  if (!urlTrain && !urlStation) {
    try {
      const saved = localStorage.getItem('day062_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.stationName) state.stationName = parsed.stationName;
        if (parsed.trainTimeStr) state.trainTimeStr = parsed.trainTimeStr;
        if (parsed.walkMinutes) state.walkMinutes = parsed.walkMinutes;
        if (parsed.lossItems) state.lossItems = parsed.lossItems;
      }
    } catch (_) {}
  }
}

// 起動
window.addEventListener('DOMContentLoaded', init);
