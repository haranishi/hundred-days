import {
  PRESET_STATIONS,
  QUICK_DESTINATIONS,
  DEFAULT_LOSS_ITEMS,
  STATUS_META,
  SURVIVAL_OPTIONS,
  parseTrainTime,
  calculateTotalLossMinutes,
  calculateDeadline,
  getStatusLevel,
  formatTimeDisplay,
  getFirstTrainRemainingMs,
  findNearestStations,
  searchStations,
  estimateRouteDetails
} from './lib/train-logic.js';
import { sound } from './lib/audio.js';

// アプリケーション状態
const state = {
  fromStation: '新宿駅',
  toStation: '吉祥寺駅',
  stationName: '新宿駅', // 互換用
  trainTimeStr: '23:55',
  walkMinutes: 7,
  lossItems: JSON.parse(JSON.stringify(DEFAULT_LOSS_ITEMS)),
  soundEnabled: true,
  currentLevel: 'safe',
  lastBeatTime: 0,
  escaped: false,
  coords: null,
  routeMeta: {
    distanceKm: 12.4,
    rideMinutes: 18,
    estimatedTrainTime: '23:55',
    summary: '新宿駅 ➔ 吉祥寺駅'
  }
};

// DOM要素
const el = {
  body: document.body,
  btnSound: document.getElementById('btn-sound'),
  soundIcon: document.getElementById('sound-icon'),
  soundText: document.getElementById('sound-text'),
  btnShareLink: document.getElementById('btn-share-link'),
  btnLocate: document.getElementById('btn-locate'),
  geoStatusNote: document.getElementById('geo-status-note'),
  geoCandidates: document.getElementById('geo-candidates'),
  geoCandidateList: document.getElementById('geo-candidate-list'),
  statusBadge: document.getElementById('status-badge'),
  statusName: document.getElementById('status-name'),
  statusMessage: document.getElementById('status-message'),
  displayFromStation: document.getElementById('display-from-station'),
  displayToStation: document.getElementById('display-to-station'),
  displayStationName: document.getElementById('display-station-name'),
  displayTrainTime: document.getElementById('display-train-time'),
  routeDistanceBadge: document.getElementById('route-distance-badge'),
  routeSummaryText: document.getElementById('route-summary-text'),
  inputFromStation: document.getElementById('input-from-station'),
  inputToStation: document.getElementById('input-to-station'),
  fromSearchResults: document.getElementById('from-search-results'),
  toSearchResults: document.getElementById('to-search-results'),
  btnSwapStations: document.getElementById('btn-swap-stations'),
  quickDestList: document.getElementById('quick-dest-list'),
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
  recalculateRoute(false);
  renderPresets();
  renderQuickDestinations();
  syncInputsWithState();
  bindEvents();
  startTimerLoop();
}

// 区間情報の再計算と反映
function recalculateRoute(updateTrainTime = true) {
  const route = estimateRouteDetails(state.fromStation, state.toStation);
  state.routeMeta = route;
  state.stationName = state.fromStation;

  if (updateTrainTime && route.estimatedTrainTime) {
    state.trainTimeStr = route.estimatedTrainTime;
  }

  // 表示更新
  if (el.displayFromStation) el.displayFromStation.textContent = state.fromStation;
  if (el.displayToStation) el.displayToStation.textContent = state.toStation;
  if (el.displayStationName) el.displayStationName.textContent = state.fromStation;
  if (el.displayTrainTime) el.displayTrainTime.textContent = state.trainTimeStr;
  if (el.inputTrainTime) el.inputTrainTime.value = state.trainTimeStr;

  const distText = route.distanceKm > 0 ? `乗車約${route.rideMinutes}分 / ${route.distanceKm}km` : '同一駅・徒歩圏内';
  if (el.routeDistanceBadge) el.routeDistanceBadge.textContent = distText;

  const summaryText = route.distanceKm > 0
    ? `推定所要: 約${route.rideMinutes}分（直線${route.distanceKm}km）`
    : '同一駅または近傍エリア';
  if (el.routeSummaryText) el.routeSummaryText.textContent = summaryText;
}

// プリセット駅ボタンの生成（全国主要ターミナル）
function renderPresets() {
  if (!el.presetGrid) return;
  el.presetGrid.innerHTML = '';
  PRESET_STATIONS.forEach((st) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'station-pill';
    btn.textContent = st.name;
    if (st.name === state.fromStation) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      sound.unlock();
      state.fromStation = st.name;
      state.walkMinutes = st.walkMinutes;
      recalculateRoute(true);
      syncInputsWithState();
      saveState();
      updateDisplay();
    });
    el.presetGrid.appendChild(btn);
  });
}

// 帰着駅クイック候補の生成
function renderQuickDestinations() {
  if (!el.quickDestList) return;
  el.quickDestList.innerHTML = '';
  QUICK_DESTINATIONS.forEach((dest) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-dest-btn';
    btn.textContent = dest.name;
    btn.title = dest.desc;
    if (dest.name === state.toStation) {
      btn.style.borderColor = '#4ade80';
      btn.style.color = '#4ade80';
    }
    btn.addEventListener('click', () => {
      sound.unlock();
      state.toStation = dest.name;
      recalculateRoute(true);
      syncInputsWithState();
      saveState();
      updateDisplay();
    });
    el.quickDestList.appendChild(btn);
  });
}

// 画面入力値と状態の同期
function syncInputsWithState() {
  if (el.inputFromStation) el.inputFromStation.value = state.fromStation;
  if (el.inputToStation) el.inputToStation.value = state.toStation;
  if (el.inputStationName) el.inputStationName.value = state.fromStation;
  if (el.inputTrainTime) el.inputTrainTime.value = state.trainTimeStr;
  if (el.walkSlider) el.walkSlider.value = state.walkMinutes;
  if (el.walkValDisplay) el.walkValDisplay.textContent = state.walkMinutes;

  if (el.checkBill) el.checkBill.checked = !!state.lossItems.bill?.enabled;
  if (el.checkCoat) el.checkCoat.checked = !!state.lossItems.coat?.enabled;
  if (el.checkToilet) el.checkToilet.checked = !!state.lossItems.toilet?.enabled;
  if (el.checkWicket) el.checkWicket.checked = !!state.lossItems.wicket?.enabled;

  // プリセットのアクティブ表示更新
  const pills = el.presetGrid.querySelectorAll('.station-pill');
  pills.forEach((p, idx) => {
    const st = PRESET_STATIONS[idx];
    if (st && st.name === state.fromStation) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });

  // クイック候補のアクティブ表示更新
  const destBtns = el.quickDestList.querySelectorAll('.quick-dest-btn');
  destBtns.forEach((b, idx) => {
    const dest = QUICK_DESTINATIONS[idx];
    if (dest && dest.name === state.toStation) {
      b.style.borderColor = '#4ade80';
      b.style.color = '#4ade80';
    } else {
      b.style.borderColor = '';
      b.style.color = '';
    }
  });
}

// 駅オートコンプリート検索の設定
function setupAutocomplete(inputEl, dropdownEl, onSelect) {
  if (!inputEl || !dropdownEl) return;

  const closeDropdown = () => {
    dropdownEl.hidden = true;
    dropdownEl.innerHTML = '';
  };

  inputEl.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (!query) {
      closeDropdown();
      return;
    }

    const results = searchStations(query, 6);
    if (!results || results.length === 0) {
      dropdownEl.innerHTML = '<div style="padding: 10px; font-size: 0.8rem; color: var(--text-dim); text-align: center;">一致する駅が見つかりません</div>';
      dropdownEl.hidden = false;
      return;
    }

    dropdownEl.innerHTML = '';
    results.forEach((st) => {
      const item = document.createElement('div');
      item.className = 'search-result-item';
      item.innerHTML = `
        <div class="result-name-col">
          <span class="result-name">${st.name}</span>
          <span class="result-kana">${st.kana}</span>
        </div>
        <div class="result-meta-col">
          <span class="result-pref">${st.pref}</span>
          <span class="result-line">${st.line}</span>
        </div>
      `;
      item.addEventListener('click', () => {
        sound.unlock();
        inputEl.value = st.name;
        closeDropdown();
        onSelect(st);
      });
      dropdownEl.appendChild(item);
    });
    dropdownEl.hidden = false;
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
  });

  document.addEventListener('click', (e) => {
    if (!inputEl.contains(e.target) && !dropdownEl.contains(e.target)) {
      closeDropdown();
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

  // 出発駅オートコンプリート
  setupAutocomplete(el.inputFromStation, el.fromSearchResults, (station) => {
    state.fromStation = station.name;
    recalculateRoute(true);
    syncInputsWithState();
    saveState();
    updateDisplay();
  });

  // 帰着駅オートコンプリート
  setupAutocomplete(el.inputToStation, el.toSearchResults, (station) => {
    state.toStation = station.name;
    recalculateRoute(true);
    syncInputsWithState();
    saveState();
    updateDisplay();
  });

  // 出発駅と帰着駅の入れ替え
  if (el.btnSwapStations) {
    el.btnSwapStations.addEventListener('click', () => {
      sound.unlock();
      const temp = state.fromStation;
      state.fromStation = state.toStation;
      state.toStation = temp;
      recalculateRoute(true);
      syncInputsWithState();
      saveState();
      updateDisplay();
    });
  }

  // 出発駅・帰着駅の手動確定（Enterキーなど）
  if (el.inputFromStation) {
    el.inputFromStation.addEventListener('change', (e) => {
      const val = e.target.value.trim();
      if (val) {
        state.fromStation = val;
        recalculateRoute(false);
        saveState();
        updateDisplay();
      }
    });
  }

  if (el.inputToStation) {
    el.inputToStation.addEventListener('change', (e) => {
      const val = e.target.value.trim();
      if (val) {
        state.toStation = val;
        recalculateRoute(false);
        saveState();
        updateDisplay();
      }
    });
  }

  // 位置情報から最寄り駅を探す
  if (el.btnLocate) {
    el.btnLocate.addEventListener('click', handleLocate);
  }

  // URL共有
  el.btnShareLink.addEventListener('click', () => {
    sound.unlock();
    const url = new URL(window.location.href);
    url.searchParams.set('from', state.fromStation);
    url.searchParams.set('to', state.toStation);
    url.searchParams.set('train', state.trainTimeStr);
    url.searchParams.set('walk', state.walkMinutes);
    navigator.clipboard.writeText(url.toString()).then(() => {
      const originalText = el.btnShareLink.textContent;
      el.btnShareLink.textContent = '✅ URLコピー完了!';
      setTimeout(() => {
        el.btnShareLink.textContent = originalText;
      }, 2000);
    });
  });

  // 終電時刻の手動入力
  el.inputTrainTime.addEventListener('change', (e) => {
    sound.unlock();
    if (e.target.value) {
      state.trainTimeStr = e.target.value;
      saveState();
      updateDisplay();
    }
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

// 位置情報の取得と出発駅への反映
function handleLocate() {
  sound.unlock();
  if (!navigator.geolocation) {
    el.geoStatusNote.textContent = '❌ お使いのブラウザでは位置情報を利用できません。';
    return;
  }

  el.btnLocate.disabled = true;
  el.geoStatusNote.textContent = '📡 現在地を確認しています…';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      state.coords = { lat, lon };

      const candidates = findNearestStations(lat, lon, undefined, 4);
      if (!candidates || candidates.length === 0) {
        el.geoStatusNote.textContent = '⚠️ 周辺の駅情報が見つかりませんでした。';
        el.btnLocate.disabled = false;
        return;
      }

      // 最も近い駅を出発駅にセット
      const top = candidates[0];
      state.fromStation = top.name;
      state.walkMinutes = top.walkMinutes;

      recalculateRoute(true);
      syncInputsWithState();
      saveState();
      updateDisplay();

      const distText = top.distanceMeters < 1000 ? `${top.distanceMeters}m` : `${top.distanceKm}km`;
      el.geoStatusNote.textContent = `✅ 出発駅に最寄り駅【${top.name}】（約${distText} / 徒歩${top.walkMinutes}分）をセットしました！`;

      renderGeoCandidates(candidates);
      el.btnLocate.disabled = false;
    },
    (err) => {
      let msg = '❌ 位置情報を取得できませんでした。';
      if (err.code === 1) {
        msg = '⚠️ 位置情報の利用が許可されませんでした。検索欄から駅名をご入力ください。';
      } else if (err.code === 2) {
        msg = '⚠️ 現在地を特定できませんでした。電波状況をご確認ください。';
      } else if (err.code === 3) {
        msg = '⚠️ 位置情報の取得がタイムアウトしました。';
      }
      el.geoStatusNote.textContent = msg;
      el.btnLocate.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
  );
}

// 周辺駅の候補ボタン生成
function renderGeoCandidates(candidates) {
  el.geoCandidateList.innerHTML = '';
  candidates.forEach((st) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'geo-candidate-btn';
    const distText = st.distanceMeters < 1000 ? `${st.distanceMeters}m` : `${st.distanceKm}km`;
    btn.innerHTML = `<b>${st.name}</b> <span>約${distText}・徒歩${st.walkMinutes}分</span>`;

    btn.addEventListener('click', () => {
      sound.unlock();
      state.fromStation = st.name;
      state.walkMinutes = st.walkMinutes;
      recalculateRoute(true);
      syncInputsWithState();
      saveState();
      updateDisplay();
      el.geoStatusNote.textContent = `📍 出発駅を【${st.name}】（徒歩${st.walkMinutes}分）に切り替えました。`;
    });

    el.geoCandidateList.appendChild(btn);
  });
  el.geoCandidates.hidden = false;
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

  // 区間・終電情報
  if (el.displayFromStation) el.displayFromStation.textContent = state.fromStation;
  if (el.displayToStation) el.displayToStation.textContent = state.toStation;
  if (el.displayStationName) el.displayStationName.textContent = state.fromStation;
  if (el.displayTrainTime) el.displayTrainTime.textContent = state.trainTimeStr;

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
    if (currentTimeMs - state.lastBeatTime > 800) {
      sound.playHeartbeat(0.9);
      sound.playTick();
      state.lastBeatTime = currentTimeMs;
    }
  } else if (level === 'critical') {
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
    ? `デッドラインまで残り【${diffMinutes}分】の時点で店を脱出しました！\n区間（${state.fromStation} ➔ ${state.toStation}）の終電（${state.trainTimeStr}発）に十分間に合います。`
    : `デッドラインを【${Math.abs(diffMinutes)}分】超過して退店しました！駅までダッシュしてください！`;

  el.modalStats.textContent = statsText;

  // Xシェアリンク生成
  const shareText = `【終電サドンデス 脱出完了！】\n${state.fromStation} ➔ ${state.toStation}（${state.trainTimeStr}発）に対し、デッドライン残り${diffMinutes}分で店を出ました！今夜の帰宅権を防衛完了🏃‍♂️💨\n\n#終電サドンデス #100日チャレンジ`;
  const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(window.location.href)}`;
  el.btnModalShare.href = shareUrl;

  el.successModal.classList.add('active');
}

// LocalStorage & URLパラメータ処理
function saveState() {
  try {
    localStorage.setItem('day062_state', JSON.stringify({
      fromStation: state.fromStation,
      toStation: state.toStation,
      trainTimeStr: state.trainTimeStr,
      walkMinutes: state.walkMinutes,
      lossItems: state.lossItems
    }));
  } catch (_) {}
}

function loadFromUrlOrStorage() {
  const params = new URLSearchParams(window.location.search);
  const urlFrom = params.get('from') || params.get('station');
  const urlTo = params.get('to');
  const urlTrain = params.get('train');
  const urlWalk = params.get('walk');

  if (urlFrom) {
    state.fromStation = urlFrom;
    state.stationName = urlFrom;
  }
  if (urlTo) state.toStation = urlTo;
  if (urlTrain) state.trainTimeStr = urlTrain;
  if (urlWalk && !isNaN(parseInt(urlWalk, 10))) state.walkMinutes = parseInt(urlWalk, 10);

  if (!urlFrom && !urlTo && !urlTrain) {
    try {
      const saved = localStorage.getItem('day062_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.fromStation) state.fromStation = parsed.fromStation;
        if (parsed.toStation) state.toStation = parsed.toStation;
        if (parsed.stationName && !parsed.fromStation) state.fromStation = parsed.stationName;
        if (parsed.trainTimeStr) state.trainTimeStr = parsed.trainTimeStr;
        if (parsed.walkMinutes) state.walkMinutes = parsed.walkMinutes;
        if (parsed.lossItems) state.lossItems = parsed.lossItems;
      }
    } catch (_) {}
  }
}

// 起動
window.addEventListener('DOMContentLoaded', init);
