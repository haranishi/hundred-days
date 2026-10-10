import { STAGES, calculateRank } from "./lib/stages.js";
import {
  playSuccessSound,
  playTrapHitSound,
  playClickSound,
  playInspectSound,
  playHeartbeatSound,
  playFanfareSound,
  startBgm,
  stopBgm,
  setSoundEnabled,
  isSoundEnabled
} from "./lib/audio.js";

// ゲーム状態
const state = {
  currentStageIndex: 0,
  totalDamage: 0,
  stageResults: [], // { stageId, title, damage, patternName }
  startTime: 0,
  endTime: 0,
  timerInterval: null,
  remainingSeconds: 0
};

// DOM要素
const flashOverlay = document.getElementById("flash-overlay");
const screenStart = document.getElementById("screen-start");
const screenGame = document.getElementById("screen-game");
const screenResult = document.getElementById("screen-result");
const modalCleared = document.getElementById("modal-cleared");

const btnStart = document.getElementById("btn-start-game");
const btnSound = document.getElementById("btn-sound");
const soundIcon = document.getElementById("sound-icon");
const btnNextStage = document.getElementById("btn-next-stage");
const btnRetry = document.getElementById("btn-retry");
const btnShareX = document.getElementById("btn-share-x");

const hudStageText = document.getElementById("hud-stage-text");
const hudDamageText = document.getElementById("hud-damage-text");
const hudTimerText = document.getElementById("hud-timer-text");
const hudTimerBar = document.getElementById("hud-timer-bar");
const missionText = document.getElementById("mission-text");
const browserAddress = document.getElementById("browser-address");
const stageViewport = document.getElementById("stage-viewport");

// モーダル要素
const modalBadge = document.getElementById("modal-badge");
const modalTitle = document.getElementById("modal-title");
const modalStageDamage = document.getElementById("modal-stage-damage");
const modalPatternName = document.getElementById("modal-pattern-name");
const modalExplanation = document.getElementById("modal-explanation");
const modalLegalNote = document.getElementById("modal-legal-note");

// 初期化
function init() {
  btnStart.addEventListener("click", () => {
    playClickSound();
    startGame();
  });

  btnSound.addEventListener("click", () => {
    const next = !isSoundEnabled();
    setSoundEnabled(next);
    soundIcon.textContent = next ? "🔊" : "🔇";
    playClickSound();
  });

  btnNextStage.addEventListener("click", () => {
    playClickSound();
    modalCleared.classList.remove("active");
    modalCleared.setAttribute("aria-hidden", "true");
    nextStage();
  });

  btnRetry.addEventListener("click", () => {
    playClickSound();
    startGame();
  });

  btnShareX.addEventListener("click", () => {
    playClickSound();
    shareToX();
  });
}

function triggerFlash(type) {
  if (!flashOverlay) return;
  flashOverlay.className = `flash-overlay flash-${type}`;
  setTimeout(() => {
    flashOverlay.className = "flash-overlay";
  }, 450);
}

function showStageCutin(stage) {
  const cutin = document.createElement("div");
  cutin.className = "stage-cutin-banner";
  cutin.innerHTML = `
    <span class="stage-cutin-tag">CASE 0${stage.id}</span>
    <h3 class="stage-cutin-title">${stage.title}</h3>
  `;
  stageViewport.appendChild(cutin);
  setTimeout(() => {
    if (cutin.parentNode) cutin.remove();
  }, 1200);
}

function startGame() {
  state.currentStageIndex = 0;
  state.totalDamage = 0;
  state.stageResults = [];
  state.startTime = Date.now();

  screenStart.classList.remove("active");
  screenResult.classList.remove("active");
  modalCleared.classList.remove("active");
  screenGame.classList.add("active");

  startBgm();
  updateHUD();
  loadStage(state.currentStageIndex);
}

function updateHUD() {
  hudStageText.textContent = `${state.currentStageIndex + 1} / ${STAGES.length}`;
  hudDamageText.textContent = `¥${state.totalDamage.toLocaleString()}`;
}

function loadStage(index) {
  if (index >= STAGES.length) {
    finishGame();
    return;
  }

  const stage = STAGES[index];
  missionText.textContent = stage.scenario;
  browserAddress.textContent = `🔒 https://${stage.siteName.toLowerCase().replace(/[^a-z0-9]/g, "")}.jp/`;

  renderStageContent(stage);
  showStageCutin(stage);
  startStageTimer(stage.timeLimit);
}

function startStageTimer(seconds) {
  clearInterval(state.timerInterval);
  state.remainingSeconds = seconds;
  const total = seconds;

  hudTimerText.textContent = `${state.remainingSeconds}s`;
  hudTimerBar.style.width = "100%";
  hudTimerBar.classList.remove("critical");

  state.timerInterval = setInterval(() => {
    state.remainingSeconds -= 1;
    hudTimerText.textContent = `${state.remainingSeconds}s`;
    const pct = Math.max(0, (state.remainingSeconds / total) * 100);
    hudTimerBar.style.width = `${pct}%`;

    if (state.remainingSeconds <= 5 && state.remainingSeconds > 0) {
      hudTimerBar.classList.add("critical");
      playHeartbeatSound();
    }

    if (state.remainingSeconds <= 0) {
      clearInterval(state.timerInterval);
      handleTimeout();
    }
  }, 1000);
}

function handleTimeout() {
  const stage = STAGES[state.currentStageIndex];
  const maxTrapCost = stage.traps.reduce((acc, t) => acc + (t.cost || 0), 0);
  recordStageResult(maxTrapCost, true);
}

function recordStageResult(damage, isTimeout = false) {
  clearInterval(state.timerInterval);
  const stage = STAGES[state.currentStageIndex];

  state.totalDamage += damage;
  state.stageResults.push({
    stageId: stage.id,
    title: stage.title,
    damage,
    patternName: stage.darkPatternName
  });

  updateHUD();

  if (damage > 0) {
    playTrapHitSound();
    triggerFlash("red");
    hudDamageText.classList.add("hit");
    setTimeout(() => hudDamageText.classList.remove("hit"), 600);
  } else {
    playSuccessSound();
    triggerFlash("green");
  }

  showClearedModal(stage, damage, isTimeout);
}

function showClearedModal(stage, damage, isTimeout) {
  if (damage === 0) {
    modalBadge.textContent = "BUSTED! 完全看破";
    modalBadge.className = "busted-badge";
    modalTitle.textContent = "罠を見抜き、完全回避！";
    modalStageDamage.textContent = "¥0（完全回避）";
    modalStageDamage.className = "stage-damage-zero";
  } else {
    modalBadge.textContent = isTimeout ? "TIME UP! タイムアウト" : "TRAPPED! 罠に被弾";
    modalBadge.className = "busted-badge stage-damage-hit";
    modalTitle.textContent = isTimeout ? "時間切れで意図しない請求が発生！" : "巧妙なダークパターンに被弾！";
    modalStageDamage.textContent = `+¥${damage.toLocaleString()} の被害`;
    modalStageDamage.className = "stage-damage-hit";
  }

  modalPatternName.textContent = stage.darkPatternName;
  modalExplanation.textContent = stage.explanation;
  modalLegalNote.textContent = stage.legalNote;

  modalCleared.classList.add("active");
  modalCleared.setAttribute("aria-hidden", "false");
}

function nextStage() {
  state.currentStageIndex += 1;
  updateHUD();
  loadStage(state.currentStageIndex);
}

function finishGame() {
  stopBgm();
  state.endTime = Date.now();
  screenGame.classList.remove("active");
  screenResult.classList.add("active");

  playFanfareSound();

  const totalTimeSeconds = Math.round((state.endTime - state.startTime) / 1000);
  const rankInfo = calculateRank(state.totalDamage, totalTimeSeconds);

  // リザルトDOMの更新
  const rankCircle = document.getElementById("result-rank-circle");
  const rankLetter = document.getElementById("result-rank-letter");
  const rankTitle = document.getElementById("result-rank-title");
  const rankDesc = document.getElementById("result-rank-desc");
  const totalDamageText = document.getElementById("result-total-damage");
  const totalTimeText = document.getElementById("result-total-time");
  const stageList = document.getElementById("result-stage-list");

  rankLetter.textContent = rankInfo.rank;
  rankCircle.style.background = `linear-gradient(135deg, ${rankInfo.color}, #111827)`;
  rankCircle.style.boxShadow = `0 0 25px ${rankInfo.color}88`;
  rankTitle.textContent = rankInfo.title;
  rankDesc.textContent = rankInfo.comment;

  totalDamageText.textContent = `¥${state.totalDamage.toLocaleString()}`;
  totalDamageText.className = state.totalDamage === 0 ? "stat-value damage-highlight" : "stat-value damage-val hit";
  totalTimeText.textContent = `${totalTimeSeconds} 秒`;

  // リスト生成
  stageList.innerHTML = "";
  state.stageResults.forEach((res) => {
    const li = document.createElement("li");
    li.className = "stage-report-item";
    li.innerHTML = `
      <span><strong>第${res.stageId}現場:</strong> ${res.title}</span>
      <strong style="color: ${res.damage === 0 ? '#10b981' : '#f43f5e'}">
        ${res.damage === 0 ? '¥0 (回避)' : `+¥${res.damage.toLocaleString()}`}
      </strong>
    `;
    stageList.appendChild(li);
  });
}

function shareToX() {
  const totalTimeSeconds = Math.round((state.endTime - state.startTime) / 1000);
  const rankInfo = calculateRank(state.totalDamage, totalTimeSeconds);
  const url = window.location.href;

  const text = `【解約ボタンは、どれ？】悪質UI脱出ゲームをクリア！\n` +
    `被害総額: ¥${state.totalDamage.toLocaleString()} / 捜査時間: ${totalTimeSeconds}秒\n` +
    `称号: ${rankInfo.title}\n\n` +
    `巧妙な二重否定や事前チェックを見抜いて生還できるか？\n` +
    `#100日チャレンジ #Day063\n`;

  const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  window.open(shareUrl, "_blank", "noopener,noreferrer");
}

// ----------------------------------------------------
// 各ステージの動的レンダリング
// ----------------------------------------------------
function renderStageContent(stage) {
  stageViewport.innerHTML = "";

  switch (stage.id) {
    case 1:
      renderStage1(stage);
      break;
    case 2:
      renderStage2(stage);
      break;
    case 3:
      renderStage3(stage);
      break;
    case 4:
      renderStage4(stage);
      break;
    case 5:
      renderStage5(stage);
      break;
    default:
      stageViewport.innerHTML = "<p>ステージ準備中</p>";
  }
}

// ステージ1: お試し500円サプリ（引き留めダイアログ付き）
function renderStage1(stage) {
  const wrap = document.createElement("div");
  wrap.className = "ec-stage-box";
  wrap.innerHTML = `
    <div class="product-card">
      <div class="product-thumb">💊</div>
      <div class="product-info">
        <h4>超高濃度ブルーベリーEX (30日分)</h4>
        <p class="product-desc">初回限定お試し特別モニター価格！</p>
        <div>
          <span class="price-tag">¥500 (税込)</span>
          <span class="original-price">通常 ¥5,980</span>
        </div>
      </div>
    </div>

    <div class="options-group">
      <label class="option-row" id="lbl-sub">
        <input type="checkbox" id="chk-opt-sub" checked>
        <div class="option-text">
          <strong>【人気No.1】便利でお得な毎月自動お届け定期便に申し込む</strong>
          <span>※2回目以降は月額¥4,980(税込)で毎月自動更新となります</span>
        </div>
      </label>
      <label class="option-row" id="lbl-warranty">
        <input type="checkbox" id="chk-opt-warranty" checked>
        <div class="option-text">
          <strong>プレミアムあんしん配送補償プラン (+¥550)</strong>
          <span>※配送事故時の無料再送サービスです</span>
        </div>
      </label>
    </div>

    <button type="button" id="btn-stage1-loud" class="btn-ec-buy-loud">
      今すぐ注文を確定する（送料無料）
    </button>
    <button type="button" id="btn-stage1-subtle" class="btn-ec-subtle">
      定期・補償なしの単品購入（¥500）で確定
    </button>
  `;

  stageViewport.appendChild(wrap);

  const chkSub = wrap.querySelector("#chk-opt-sub");
  const chkWarranty = wrap.querySelector("#chk-opt-warranty");
  const btnLoud = wrap.querySelector("#btn-stage1-loud");
  const btnSubtle = wrap.querySelector("#btn-stage1-subtle");

  // チェックを外そうとした時の引き留めダイアログ
  chkSub.addEventListener("click", (e) => {
    if (!chkSub.checked) {
      e.preventDefault(); // 一旦チェックを戻す
      chkSub.checked = true;

      // リアルな引き留めミニダイアログ
      const dialog = document.createElement("div");
      dialog.className = "retention-mini-dialog";
      dialog.innerHTML = `
        <div class="mini-dialog-card">
          <h5>⚠️ 本当に定期便を解除しますか？</h5>
          <p>今解除すると、初回限定の特別割引（-90%）や送料無料特典が失効する可能性があります。</p>
          <div class="dialog-btn-row">
            <button type="button" class="btn-dialog-stay" id="btn-keep-sub">お得な定期便を続ける</button>
            <button type="button" class="btn-dialog-leave" id="btn-remove-sub">割引を捨てて解除する</button>
          </div>
        </div>
      `;
      wrap.appendChild(dialog);

      dialog.querySelector("#btn-keep-sub").addEventListener("click", () => {
        playClickSound();
        dialog.remove();
      });

      dialog.querySelector("#btn-remove-sub").addEventListener("click", () => {
        playInspectSound();
        chkSub.checked = false;
        dialog.remove();
      });
    }
  });

  chkWarranty.addEventListener("change", () => {
    playInspectSound();
  });

  btnLoud.addEventListener("click", () => {
    let damage = 0;
    if (chkSub.checked) damage += 4980;
    if (chkWarranty.checked) damage += 550;
    recordStageResult(damage);
  });

  btnSubtle.addEventListener("click", () => {
    recordStageResult(0);
  });
}

// ステージ2: コンファームシェイミング（逃げる×ボタン）
function renderStage2(stage) {
  const wrap = document.createElement("div");
  wrap.className = "ec-stage-box";
  wrap.innerHTML = `
    <div class="fake-page-bg">
      <div class="product-card">
        <div class="product-thumb">👗</div>
        <div class="product-info">
          <h4>秋の新作トレンチコート</h4>
          <span class="price-tag">¥12,800</span>
        </div>
      </div>
    </div>

    <div class="fake-modal-overlay">
      <div class="fake-modal-card">
        <button type="button" id="btn-modal-fake-close" class="btn-running-close" aria-label="閉じる">×</button>
        <div class="coupon-badge-loud">🎉 本日限定 30% OFF！</div>
        <p style="font-size: 0.9rem; font-weight: 700; color: #111827;">
          いま会員登録すると今すぐ使える¥3,840引きクーポンを進呈！
        </p>
        <button type="button" id="btn-accept-coupon" class="btn-coupon-accept">
          【推奨】クーポンを受け取って買い物する<br>
          <span style="font-size: 0.72rem; font-weight: normal; opacity: 0.9;">（※有料プレミアムメルマガ月額¥980に同意）</span>
        </button>
        <button type="button" id="btn-reject-confirmshame" class="link-confirmshame">
          いいえ、私は損をするのが大好きなので、定価のまま無駄なお金を払い続けます
        </button>
      </div>
    </div>
  `;

  stageViewport.appendChild(wrap);

  const btnAccept = wrap.querySelector("#btn-accept-coupon");
  const btnReject = wrap.querySelector("#btn-reject-confirmshame");
  const btnFakeClose = wrap.querySelector("#btn-modal-fake-close");

  // 逃げる×ボタン
  let escapeCount = 0;
  btnFakeClose.addEventListener("mouseenter", () => {
    if (escapeCount < 3) {
      escapeCount++;
      const randX = (Math.random() - 0.5) * 80;
      const randY = (Math.random() - 0.5) * 40;
      btnFakeClose.style.transform = `translate(${randX}px, ${randY}px)`;
      playClickSound();
    }
  });

  btnFakeClose.addEventListener("click", () => {
    playClickSound();
    alert("「このチャンスを本当に見逃しますか？画面内のリンクから選択してください。」");
  });

  btnAccept.addEventListener("click", () => {
    recordStageResult(980);
  });

  btnReject.addEventListener("click", () => {
    recordStageResult(0);
  });
}

// ステージ3: 偽の緊急性と閲覧者数（トースト通知割り込み）
function renderStage3(stage) {
  const wrap = document.createElement("div");
  wrap.className = "hotel-stage-box";
  wrap.innerHTML = `
    <div class="urgency-banner">
      <span>⚠️ 残りあと1室！ 現在38人がこの部屋を検討中です！</span>
    </div>

    <div class="hotel-plan-card">
      <h4 style="font-size: 1rem; color: #111827;">天然温泉 翠明館 — スタンダード和室</h4>
      <p style="font-size: 0.78rem; color: #6b7280;">1泊2食付き / 2名1室利用</p>

      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 6px;">
        <label class="plan-radio-row selected" id="row-nonref">
          <input type="radio" name="hotel-plan" value="nonrefundable" checked>
          <div>
            <span class="plan-title">【本日特価】返金不可・即時全額決済プラン ¥18,000</span>
            <span class="plan-sub">※いかなる理由でもキャンセル料100%が発生します</span>
          </div>
        </label>
        <label class="plan-radio-row" id="row-freecancel">
          <input type="radio" name="hotel-plan" value="freecancel">
          <div>
            <span class="plan-title">【安心標準】前日までキャンセル無料プラン ¥18,000</span>
            <span class="plan-sub">※前日23:59までキャンセル料0円</span>
          </div>
        </label>
      </div>
    </div>

    <button type="button" id="btn-hotel-submit" class="btn-hotel-book">
      この条件で予約を確定する
    </button>
  `;

  stageViewport.appendChild(wrap);

  // 2秒後に偽プッシュ通知トーストが出現
  setTimeout(() => {
    if (!wrap.isConnected) return;
    const toast = document.createElement("div");
    toast.className = "fake-toast";
    toast.innerHTML = `
      <span class="fake-toast-icon">🛎️</span>
      <div>
        <strong>東京都のユーザーが同じ部屋を仮予約中！</strong>
        <p>あと1分以内に確定しないと部屋が解放されます</p>
      </div>
    `;
    wrap.appendChild(toast);
    playHeartbeatSound();
  }, 2000);

  const radios = wrap.querySelectorAll('input[name="hotel-plan"]');
  const rowNonref = wrap.querySelector("#row-nonref");
  const rowFreecancel = wrap.querySelector("#row-freecancel");
  const btnSubmit = wrap.querySelector("#btn-hotel-submit");

  radios.forEach((r) => {
    r.addEventListener("change", () => {
      playInspectSound();
      if (r.value === "nonrefundable") {
        rowNonref.classList.add("selected");
        rowFreecancel.classList.remove("selected");
      } else {
        rowFreecancel.classList.add("selected");
        rowNonref.classList.remove("selected");
      }
    });
  });

  btnSubmit.addEventListener("click", () => {
    const selected = wrap.querySelector('input[name="hotel-plan"]:checked').value;
    if (selected === "nonrefundable") {
      recordStageResult(18000);
    } else {
      recordStageResult(0);
    }
  });
}

// ステージ4: ゴキブリホイホイと二重否定（配色逆転の最終関門）
function renderStage4(stage) {
  const wrap = document.createElement("div");
  wrap.className = "cancel-stage-box";
  wrap.innerHTML = `
    <div class="retention-box">
      <h4 style="color: #15803d; font-size: 0.95rem;">本当に退会しますか？</h4>
      <p style="font-size: 0.8rem; color: #166534;">今なら解約を思いとどまると限定ポイント500ptをプレゼント！</p>
      <button type="button" id="btn-cancel-stay" class="btn-stay-loud">
        契約を継続して500ptを受け取る
      </button>
    </div>

    <div class="survey-box">
      <p class="survey-title">
        Q. 今後のプレミアム会員資格の停止を取り消さないことを希望しますか？
      </p>
      <div class="survey-options">
        <label class="survey-row">
          <input type="radio" name="double-neg" value="stay">
          <span>いいえ（解約の手続きを中止する）</span>
        </label>
        <label class="survey-row">
          <input type="radio" name="double-neg" value="leave">
          <span>はい（解約の手続きをそのまま継続する）</span>
        </label>
      </div>
    </div>

    <div class="footer-trick-area">
      <p>© 2026 Movie Delivery Plus. All Rights Reserved.</p>
      <p style="margin-top: 4px;">
        <a href="#terms" style="color: #9ca3af; text-decoration: none;">利用規約</a> | 
        <a href="#privacy" style="color: #9ca3af; text-decoration: none;">プライバシーポリシー</a> | 
        <button type="button" id="btn-real-cancel" class="link-real-cancel">退会手続きへ進む</button>
      </p>
    </div>

    <div id="final-confirm-area"></div>
  `;

  stageViewport.appendChild(wrap);

  const btnStay = wrap.querySelector("#btn-cancel-stay");
  const btnRealCancel = wrap.querySelector("#btn-real-cancel");
  const finalArea = wrap.querySelector("#final-confirm-area");

  btnStay.addEventListener("click", () => {
    recordStageResult(1980);
  });

  btnRealCancel.addEventListener("click", () => {
    const selected = wrap.querySelector('input[name="double-neg"]:checked');
    if (!selected) {
      alert("アンケートの質問にご回答ください。");
      return;
    }

    if (selected.value === "stay") {
      recordStageResult(1980);
      return;
    }

    playInspectSound();
    // 配色逆転の最終確認ボックスを表示
    finalArea.innerHTML = `
      <div class="final-confirm-box">
        <p>最終確認：本当に会員特典を破棄しますか？</p>
        <div class="final-btn-group">
          <button type="button" id="btn-final-stay" class="btn-trick-loud">考え直す（契約を維持）</button>
          <button type="button" id="btn-final-leave" class="btn-trick-subtle">退会する</button>
        </div>
      </div>
    `;

    finalArea.querySelector("#btn-final-stay").addEventListener("click", () => {
      recordStageResult(1980);
    });

    finalArea.querySelector("#btn-final-leave").addEventListener("click", () => {
      recordStageResult(0);
    });
  });
}

// ステージ5: 隠された年額自動更新
function renderStage5(stage) {
  const wrap = document.createElement("div");
  wrap.className = "sub-stage-box";
  wrap.innerHTML = `
    <div class="hero-free-box">
      <h3>初月¥0！30日間無料体験</h3>
      <p style="font-size: 0.85rem; opacity: 0.9;">1億曲が広告なしで聴き放題。いつでも解約OK！</p>
    </div>

    <details class="accordion-details">
      <summary class="accordion-summary">▶ 契約形態および解約に関する重要事項（タップで展開）</summary>
      <div class="accordion-content">
        <p>※本無料トライアルは、期間終了の48時間前までに所定の電話サポート窓口（平日11:00〜14:00のみ受付）にお申し出がない場合、自動的に年額プレミアムプラン（¥14,800/年）へと更新されます。</p>
        <div class="toggle-switch-row">
          <span class="switch-label">解約方法を「Webから1クリック解約（月額¥980）」に変更する</span>
          <input type="checkbox" id="chk-safe-plan" class="toggle-input">
        </div>
      </div>
    </details>

    <button type="button" id="btn-sub-start" class="btn-start-trial">
      無料トライアルを開始する
    </button>
  `;

  stageViewport.appendChild(wrap);

  const chkSafe = wrap.querySelector("#chk-safe-plan");
  const btnStartSub = wrap.querySelector("#btn-sub-start");

  chkSafe.addEventListener("change", () => {
    playInspectSound();
  });

  btnStartSub.addEventListener("click", () => {
    if (chkSafe && chkSafe.checked) {
      recordStageResult(0);
    } else {
      recordStageResult(14800);
    }
  });
}

// 初期実行
init();
