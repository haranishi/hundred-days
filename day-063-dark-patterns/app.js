import {
  STAGES,
  calculateRank,
  describeNextGoal,
  buildShareText,
  explanationFor,
  timeoutResult,
  breakdownTag,
  stageResultLabel,
  describeRetries
} from "./lib/stages.js";
import {
  REJECT_TEXTS,
  STAGE1_LAYOUTS,
  SAFE_PLAN_TEXTS,
  STAGE2_POSITIONS,
  nextStage1Variant,
  nextStage2Variant,
  dodgeOffset
} from "./lib/variants.js";
import { readBest, writeBest, mergeBest, betterBest, isBestEligible, describeBest } from "./lib/records.js";
import { phrasifyNode } from "./lib/phrase.js";
import {
  playSuccessSound,
  playDisarmSound,
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

/* 現場の開始カットインの長さ。この間は偽サイトを inert にして、タッチ・クリック・キーボードを受け付けない。
   制限時間もカットインが終わった瞬間から数える。前の画面のボタンを2回押したとき、2回目が次の現場の
   罠ボタンに当たって「見てもいない現場で被弾」するのを防ぐためでもある */
const CUTIN_MS = 1000;
// 結果画面を出した直後に入力を受け付けない時間。「捜査報告書を見る」の2回押しが「もう一度」や共有に当たらないように
const RESULT_GUARD_MS = 400;
/* 現場の中で新しく出した部品（解説モーダル・第5現場の最終確認・確認ダイアログを閉じた直後の偽サイト）が、
   出た直後に入力を受け付けない時間。確定ボタンを素早く2回押したとき、2回目が同じ場所に出た部品のボタン
   （「この現場をやり直す」「次の現場へ進む」など）に当たらないように。解説モーダルの間は計時が止まっている */
const INPUT_GUARD_MS = 450;
// 残り時間の表示を描き直す間隔。計時そのものは Date.now() の差で測るので、この回数には依存しない
const TICK_MS = 100;
const TOAST_MS = 1800;
// 第1現場で×を押したときの、偽サイト自身の引き留めの一言
const CLOSE_NAG_TEXT = "本当に見逃しますか？ 画面内のリンクから選んでください";
// 第5現場で、質問に答えずに進もうとしたときの警告
const SURVEY_WARNING_TEXT = "アンケートの質問に回答してください";

const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getRandomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const yen = (value) => `¥${value.toLocaleString("ja-JP")}`;
const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// #rrggbb の各成分に factor を掛けて暗くする
const shade = (hex, factor) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * factor).toString(16).padStart(2, "0")).join("")}`;

/* 文字を入れ替えたら、文節の切れ目（<wbr>）と糊付けを入れ直す（lib/phrase.js）。
   Safari でも語や数字の途中、助詞の前で折れないようにするため、画面に出す文字はすべてここを通す */
function setText(el, text) {
  el.textContent = text;
  phrasifyNode(el);
}

function setHTML(el, html) {
  el.innerHTML = html;
  phrasifyNode(el);
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ゲーム状態
const state = {
  currentStageIndex: 0,
  totalDamage: 0,
  stageResults: [], // { stageId, title, damage, breakdown, isTimeout }
  activePlayMs: 0, // 操作できるようになってから確定までの実時間（ミリ秒）の合計。解説を読む時間は入れない
  retryCount: 0, // この周で「この現場をやり直す」を押した回数（結果画面の「やり直し◯回／ノーミス」）
  stageStartedAt: null, // その現場の計時を始めた Date.now()。カットイン中は null
  stageLimitMs: 0,
  stageResolved: false, // 重複確定ガード
  cutinTimer: null,
  tickTimer: null,
  lastBeepSecond: null,
  stageContext: {}, // 解説に引く「この周に実際に出た文言」
  variants: { stage1: {}, stage2: {} }, // 直前に出した変種（同じものを続けて出さない）
  shareText: ""
};

// DOM要素
const $ = (id) => document.getElementById(id);
const appRoot = $("app");
const flashOverlay = $("flash-overlay");
const screenStart = $("screen-start");
const screenGame = $("screen-game");
const screenResult = $("screen-result");
const modalCleared = $("modal-cleared");

const btnStart = $("btn-start-game");
const btnShare = $("btn-share");
const shareDialog = $("app-share-dialog");
const btnShareClose = $("btn-share-close");
const btnNextStage = $("btn-next-stage");
const btnRetryStage = $("btn-retry-stage");
const btnRetry = $("btn-retry");
const btnShareX = $("btn-share-x");
const btnShareLine = $("btn-share-line");
const btnShareNative = $("btn-share-native");
const btnShareCopy = $("btn-share-copy");
const shareSaid = $("result-share-said");
const shareNote = $("result-share-note");
const soundButtons = [...document.querySelectorAll("[data-sound-toggle]")];

const hudStageText = $("hud-stage-text");
const hudDamage = $("hud-damage");
const hudDamageText = $("hud-damage-text");
const hudDamageNote = $("hud-damage-note");
const hudTime = $("hud-time");
const hudTimerText = $("hud-timer-text");
const hudTimerBar = $("hud-timer-bar");
const hudCase = $("hud-case");
const hudToast = $("hud-toast");
const hud = document.querySelector(".investigator-hud");
const missionText = $("mission-text");
const browserAddress = $("browser-address");
const stageViewport = $("stage-viewport");

const modalBadge = $("modal-badge");
const modalTitle = $("modal-title");
const modalStageDamageLabel = $("modal-stage-damage-label");
const modalStageDamage = $("modal-stage-damage");
const modalStageDetail = $("modal-stage-detail");
const modalPatternName = $("modal-pattern-name");
const modalExplanation = $("modal-explanation");
const modalLegalNote = $("modal-legal-note");
const modalCard = modalCleared.querySelector(".modal-card");

// ----------------------------------------------------------------- 初期化
function init() {
  // 開始画面・ルール・解説と結果の骨組みなど、HTMLに書いた文字に文節の切れ目を入れる
  phrasifyNode(appRoot);

  btnStart.addEventListener("click", () => {
    playClickSound();
    startGame();
  });

  soundButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setSoundEnabled(!isSoundEnabled());
      syncSoundButtons();
      playClickSound();
    });
  });
  syncSoundButtons();

  btnNextStage.addEventListener("click", () => {
    playClickSound();
    closeModal();
    nextStage();
  });

  btnRetryStage.addEventListener("click", () => {
    playClickSound();
    closeModal();
    retryCurrentStage();
  });

  /* 解説モーダルのボタンは、押しっぱなしのキーの繰り返し（自動リピート）では押させない。確定ボタンで押した Enter を
     押し続けると、入力の停止が明けて主ボタンにフォーカスが移ったあとの繰り返しで、解説を読まずに次の現場へ進んでしまうため */
  modalCleared.addEventListener("keydown", (e) => {
    if (e.repeat && (e.key === "Enter" || e.key === " ")) e.preventDefault();
  });

  btnRetry.addEventListener("click", () => {
    playClickSound();
    startGame();
  });

  // アプリの共有ダイアログ。開始画面と結果画面でだけ開ける（捜査中は制限時間が進むので出さない）
  btnShare.addEventListener("click", () => {
    if (appRoot.dataset.screen === "game" || shareDialog.open) return;
    playClickSound();
    // 共通のシェア欄（shared/share.js が据え付ける）の文字にも、開く前に文節の切れ目を入れる
    phrasifyNode(shareDialog);
    shareDialog.showModal();
  });
  btnShareClose.addEventListener("click", () => shareDialog.close());
  shareDialog.addEventListener("close", () => {
    if (!btnShare.hidden) btnShare.focus({ preventScroll: true });
  });

  btnShareNative.addEventListener("click", async () => {
    try {
      await navigator.share({ title: "解約ボタンは、どれ？", text: state.shareText, url: shareUrl() });
    } catch (error) {
      if (error && error.name !== "AbortError") setText(shareSaid, "共有できませんでした。リンクをコピーして送れます。");
    }
  });
  btnShareCopy.addEventListener("click", async () => {
    const ok = await copyText(`${state.shareText} ${shareUrl()}`);
    setText(shareSaid, ok ? "結果とリンクをコピーしました" : "コピーできませんでした。Xかブラウザの共有から送れます");
  });

  // 解説モーダルの本文がボタンの下に続いているあいだだけ、ボタンの上をぼかす
  modalCard.addEventListener("scroll", updateModalFade, { passive: true });
  window.addEventListener("resize", updateModalFade);

  setScreen("start");
}

function updateModalFade() {
  const more = modalCard.scrollHeight - modalCard.clientHeight - modalCard.scrollTop > 2;
  modalCard.classList.toggle("has-more", more);
}

function setScreen(name) {
  appRoot.dataset.screen = name;
  screenStart.classList.toggle("active", name === "start");
  screenGame.classList.toggle("active", name === "game");
  screenResult.classList.toggle("active", name === "result");
  btnShare.hidden = name === "game";
  if (name === "game" && shareDialog.open) shareDialog.close();
}

function syncSoundButtons() {
  const on = isSoundEnabled();
  soundButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(on));
    const glyph = button.querySelector("[data-sound-glyph]");
    const label = button.querySelector("[data-sound-state]");
    if (glyph) glyph.textContent = on ? "🔊" : "🔇";
    if (label) label.textContent = on ? "ON" : "OFF";
  });
}

function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

/* 後から現れた部品（最終確認・引き留めダイアログ）が、上に残るHUDの下から画面の下端までに全部入るようにスクロールする */
function bringIntoView(element, margin = 12) {
  if (!element || !element.isConnected) return;
  const rect = element.getBoundingClientRect();
  const topInset = (hud && appRoot.dataset.screen === "game" ? hud.getBoundingClientRect().height : 0) + margin;
  const bottomLimit = window.innerHeight - margin;
  let delta = 0;
  if (rect.bottom > bottomLimit) delta = rect.bottom - bottomLimit;
  if (rect.top - delta < topInset) delta = rect.top - topInset;
  if (Math.abs(delta) < 1) return;
  window.scrollBy({ top: delta, left: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/* 出したばかりの el を INPUT_GUARD_MS の間だけ inert にする（タッチ・クリック・キーボードを受け付けない）。
   明けたら then（フォーカスの移動など）を呼ぶ。inert の中へはフォーカスを移せないので、移すのは明けてから。
   同じ要素に掛け直すときは、前のタイマーを止めてから数え直す */
const guardTimers = new WeakMap();
function guardInput(el, then) {
  clearTimeout(guardTimers.get(el));
  el.inert = true;
  guardTimers.set(el, setTimeout(() => {
    guardTimers.delete(el);
    el.inert = false;
    if (then) then();
  }, INPUT_GUARD_MS));
}

// 掛けていた入力の停止をすぐに外す（タイマーも止め、then は呼ばない）
function releaseGuard(el) {
  clearTimeout(guardTimers.get(el));
  guardTimers.delete(el);
  el.inert = false;
}

function closeModal() {
  releaseGuard(modalCleared);
  modalCleared.classList.remove("active");
  modalCleared.setAttribute("aria-hidden", "true");
  screenGame.removeAttribute("inert");
}

function triggerFlash(type) {
  if (!flashOverlay || prefersReducedMotion()) return;
  flashOverlay.className = `flash-overlay flash-${type}`;
  setTimeout(() => {
    flashOverlay.className = "flash-overlay";
  }, 450);
}

/* 罠解除の合図（帯と音）を出す。確定済み・カットイン中・期限切れのときは出さない（出したら true）。
   期限を過ぎていたら、合図の代わりに stageAcceptsInput がその場で時間切れとして確定する */
function disarm(text) {
  if (!stageAcceptsInput()) return false;
  showDisarmedToast(text);
  return true;
}

// 罠解除の合図。HUDの下の帯に出す（偽サイトの文字に重ねない・2枚重ねない）
let toastTimer = null;
function showDisarmedToast(text) {
  playDisarmSound();
  setHTML(hudToast, `<span class="hud-toast__mark" aria-hidden="true">✓</span><span>罠解除：${escapeHtml(text)}</span>`);
  hudToast.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(clearToast, TOAST_MS);
}

function clearToast() {
  clearTimeout(toastTimer);
  toastTimer = null;
  hudToast.classList.remove("is-on");
  hudToast.textContent = "";
}

function showStageCutin(stage) {
  const cutin = document.createElement("div");
  cutin.className = "stage-cutin-banner";
  cutin.dataset.gameUi = "";
  cutin.setAttribute("aria-hidden", "true");
  cutin.innerHTML = `
    <span class="stage-cutin-tag">CASE 0${stage.id}</span>
    <h3 class="stage-cutin-title">${escapeHtml(stage.title)}</h3>
  `;
  stageViewport.appendChild(cutin);
  return cutin;
}

// ----------------------------------------------------------------- 進行
function startGame() {
  state.currentStageIndex = 0;
  state.totalDamage = 0;
  state.stageResults = [];
  state.activePlayMs = 0;
  state.stageStartedAt = null;
  state.retryCount = 0;
  clearTimeout(resultGuardTimer);
  screenResult.inert = false;

  closeModal();
  setScreen("game");
  startBgm();
  updateHUD();
  loadStage(state.currentStageIndex);
}

function updateHUD() {
  hudStageText.textContent = `${state.currentStageIndex + 1} / ${STAGES.length}`;
  hudDamageText.textContent = yen(state.totalDamage);
  const hit = state.totalDamage > 0;
  hudDamage.classList.toggle("is-hit", hit);
  hudDamageNote.textContent = hit ? "被害が出ています" : "";
}

function loadStage(index) {
  if (index >= STAGES.length) {
    finishGame();
    return;
  }

  state.stageResolved = false;
  state.stageContext = {};
  const stage = STAGES[index];
  setText(missionText, stage.scenario);
  browserAddress.textContent = `${stage.domain}${stage.path}`;
  setHTML(hudCase, `<span class="hud-case__tag">CASE 0${stage.id}</span><span>${escapeHtml(stage.title)}</span>`);
  clearToast();

  renderStageContent(stage);
  showStageCutin(stage);
  // 前の現場のスクロール位置を持ち越さない（ミッション文が隠れないように先頭へ戻す）
  scrollToTop();
  missionText.focus({ preventScroll: true });
  startStageClock(stage.timeLimit);
}

function retryCurrentStage() {
  // 直前の現場の結果を取り消す（失敗した試行の時間は合計に残す）
  state.retryCount += 1;
  const last = state.stageResults[state.stageResults.length - 1];
  if (last && last.stageId === STAGES[state.currentStageIndex].id) {
    state.stageResults.pop();
    state.totalDamage = Math.max(0, state.totalDamage - last.damage);
  }
  updateHUD();
  loadStage(state.currentStageIndex);
}

function nextStage() {
  state.currentStageIndex += 1;
  updateHUD();
  loadStage(state.currentStageIndex);
}

// ----------------------------------------------------------------- 計時（Date.now() の実時間を積算する）
function startStageClock(seconds) {
  stopStageClock();
  state.stageLimitMs = seconds * 1000;
  state.stageStartedAt = null;
  state.lastBeepSecond = null;
  renderTimer(state.stageLimitMs);

  // カットインの間は偽サイトを操作できない。消えた瞬間に操作を受け付け、同時に数え始める
  stageViewport.inert = true;
  state.cutinTimer = setTimeout(() => {
    state.cutinTimer = null;
    removeCutin();
    if (state.stageResolved) return;
    stageViewport.inert = false;
    state.stageStartedAt = Date.now();
    state.tickTimer = setInterval(onTick, TICK_MS);
  }, CUTIN_MS);
}

function removeCutin() {
  stageViewport.querySelector(".stage-cutin-banner")?.remove();
}

function stopStageClock() {
  clearTimeout(state.cutinTimer);
  state.cutinTimer = null;
  clearInterval(state.tickTimer);
  state.tickTimer = null;
}

// その現場で使った実時間。制限時間を超えた分は数えない
function stageElapsedMs(now = Date.now()) {
  if (state.stageStartedAt === null) return 0;
  return Math.min(Math.max(0, now - state.stageStartedAt), state.stageLimitMs);
}

function onTick() {
  const remaining = state.stageLimitMs - stageElapsedMs();
  renderTimer(remaining);
  if (remaining <= 0) handleTimeout();
}

function renderTimer(remainingMs) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  hudTimerText.textContent = String(seconds);
  const ratio = state.stageLimitMs > 0 ? Math.max(0, remainingMs / state.stageLimitMs) : 1;
  hudTimerBar.style.width = `${ratio * 100}%`;
  const critical = state.stageStartedAt !== null && seconds > 0 && seconds <= 5;
  hudTime.classList.toggle("is-critical", critical);
  hudTimerBar.classList.toggle("critical", critical);
  if (critical && state.lastBeepSecond !== seconds) {
    state.lastBeepSecond = seconds;
    playHeartbeatSound();
  }
}

function settleStageTime() {
  state.activePlayMs += stageElapsedMs();
  state.stageStartedAt = null;
  stopStageClock();
  // カットインを消すタイマーも止めるので、帯が解説の後ろに残らないようここでも消す
  removeCutin();
  hudTime.classList.remove("is-critical");
  hudTimerBar.classList.remove("critical");
}

// 時間切れ：被害0円でもミッション未達として扱う
function handleTimeout() {
  if (state.stageResolved) return;
  const stage = STAGES[state.currentStageIndex];
  const { damage, breakdown } = timeoutResult(stage);
  recordStageResult(damage, true, breakdown);
}

// 期限を過ぎているか。裏に回ったタブでは表示の更新が間引かれるので、確定の瞬間にも時刻で確かめる
function isOverdue() {
  return state.stageStartedAt !== null && Date.now() - state.stageStartedAt >= state.stageLimitMs;
}

/* 偽サイトの操作を、いま受け付けてよいか。確定済みとカットイン中（計時前）は受け付けない。
   期限を過ぎていたら、ここで時間切れとして確定する。裏に回ったタブでは表示の更新（onTick）が間引かれ、
   それより先に正しい選択肢を押されることがある。「罠解除」の合図のあとに「TIME UP!」が続く食い違いを防ぐ */
function stageAcceptsInput() {
  if (state.stageResolved || state.stageStartedAt === null) return false;
  if (isOverdue()) {
    handleTimeout();
    return false;
  }
  return true;
}

function recordStageResult(damage, isTimeout = false, breakdown = []) {
  if (state.stageResolved) return;
  /* 計時が始まる前（カットイン中）の確定は受け付けない。偽サイトは inert にしてあるが、inert に対応していない
     古いブラウザ（Safari 15.5 未満など）や合成のクリックでは押せてしまい、0ミリ秒の確定になるため */
  if (!isTimeout && state.stageStartedAt === null) return;
  const stage = STAGES[state.currentStageIndex];
  if (!isTimeout && isOverdue()) {
    // 期限を過ぎてから押した確定は、成功でも被弾でも時間切れとして扱う
    ({ damage, breakdown } = timeoutResult(stage));
    isTimeout = true;
  }
  state.stageResolved = true;
  settleStageTime();

  const isFailure = damage > 0 || isTimeout;

  state.totalDamage += damage;
  state.stageResults.push({ stageId: stage.id, title: stage.title, damage, breakdown, isTimeout });
  updateHUD();

  if (isFailure) {
    playTrapHitSound();
    triggerFlash("red");
    if (damage > 0) {
      hudDamage.classList.remove("just-hit");
      void hudDamage.offsetWidth;
      hudDamage.classList.add("just-hit");
    }
  } else {
    playSuccessSound();
    triggerFlash("green");
  }

  showClearedModal(stage, damage, isTimeout, breakdown);
}

function showClearedModal(stage, damage, isTimeout, breakdown) {
  /* 被害額の欄。お金の被害がない時間切れだけは「被害：未達」と読み違えないよう、見出しを「結果」にする
     （第5現場の時間切れは翌月の料金が出るので「被害：+¥1,980」のまま） */
  const timeoutWithoutDamage = isTimeout && damage === 0;
  setText(modalStageDamageLabel, timeoutWithoutDamage ? "この現場の結果：" : "この現場の被害：");
  if (isTimeout) {
    modalBadge.textContent = "TIME UP! 時間切れ";
    modalBadge.className = "busted-badge is-timeout";
    setText(modalTitle, "時間切れ！ミッション未達");
    modalStageDamage.textContent = timeoutWithoutDamage ? "時間切れ（未達）" : `+${yen(damage)}`;
    modalStageDamage.className = timeoutWithoutDamage ? "stage-damage-timeout" : "stage-damage-hit";
  } else if (damage === 0) {
    modalBadge.textContent = "BUSTED! 完全看破";
    modalBadge.className = "busted-badge";
    setText(modalTitle, stage.successTitle);
    modalStageDamage.textContent = "¥0（完全回避）";
    modalStageDamage.className = "stage-damage-zero";
  } else {
    modalBadge.textContent = "TRAPPED! 罠に被弾";
    modalBadge.className = "busted-badge is-trapped";
    setText(modalTitle, "ダークパターンに被弾！");
    modalStageDamage.textContent = `+${yen(damage)}`;
    modalStageDamage.className = "stage-damage-hit";
  }

  setText(modalPatternName, stage.darkPatternName);
  setText(modalExplanation, explanationFor(stage, state.stageContext));
  setText(modalLegalNote, stage.legalNote);

  if (breakdown.length > 0) {
    modalStageDetail.hidden = false;
    setHTML(modalStageDetail, breakdown.map((item) => {
      const tag = breakdownTag(item);
      const note = item.note ? `<p class="trap-detail-note">${escapeHtml(item.note)}</p>` : "";
      return `<div class="trap-detail-row"><span>${escapeHtml(item.name)}</span><span class="trap-detail-tag is-${tag.tone}">${escapeHtml(tag.text)}</span></div>${note}`;
    }).join(""));
  } else {
    modalStageDetail.hidden = true;
    modalStageDetail.innerHTML = "";
  }

  // 最後の現場のあとは結果画面へ進むので、ボタン名もそう書く
  const isLast = state.currentStageIndex >= STAGES.length - 1;
  setHTML(btnNextStage, isLast
    ? '捜査報告書を見る <span aria-hidden="true">➔</span>'
    : '次の現場へ進む <span aria-hidden="true">➔</span>');

  // 背後を操作不能にし、モーダルを表示
  screenGame.setAttribute("inert", "");
  modalCleared.classList.add("active");
  modalCleared.setAttribute("aria-hidden", "false");
  modalCard.scrollTop = 0;
  updateModalFade();
  /* 出た直後は押せない。確定ボタンの2回目（タップ・クリック）が、同じ場所に出たこのモーダルのボタンに当たらないように。
     主ボタンへのフォーカスも明けてから移す（先に移すと、確定で押した Enter の2回目で次の現場へ進んでしまう） */
  guardInput(modalCleared, () => btnNextStage.focus({ preventScroll: true }));
}

// ----------------------------------------------------------------- 結果画面
let resultGuardTimer = null;
function finishGame() {
  stopBgm();
  stopStageClock();
  clearToast();
  setScreen("result");
  playFanfareSound();
  // 出した直後は入力を受け付けない（解説の「捜査報告書を見る」の2回目が「もう一度」や共有に当たらないように）
  screenResult.inert = true;
  clearTimeout(resultGuardTimer);
  resultGuardTimer = setTimeout(() => {
    screenResult.inert = false;
    $("result-title").focus({ preventScroll: true });
  }, RESULT_GUARD_MS);

  const totalTimeSec = Math.max(1, Math.floor(state.activePlayMs / 1000));
  const hasTimeouts = state.stageResults.some((r) => r.isTimeout);
  const rankInfo = calculateRank(state.totalDamage, totalTimeSec, hasTimeouts);

  const rankCircle = $("result-rank-circle");
  $("result-rank-letter").textContent = rankInfo.rank;
  // 白い文字が読めるよう、ランクの色を暗くしてから地にする（明るい停止点でも3:1以上）
  rankCircle.style.background = `linear-gradient(135deg, ${shade(rankInfo.color, 0.62)}, #111827)`;
  rankCircle.style.boxShadow = `0 0 25px ${rankInfo.color}88`;
  setText($("result-rank-title"), rankInfo.title);
  setText($("result-rank-desc"), rankInfo.comment);

  // ¥は小さな単位、金額は等幅の大きな数字（総捜査時間の「5秒」と同じ規則）
  $("result-damage-num").textContent = state.totalDamage.toLocaleString("ja-JP");
  $("result-total-damage").className = `stat-value ${state.totalDamage === 0 ? "is-zero" : "is-hit"}`;
  $("result-time-num").textContent = String(totalTimeSec);
  // 端数込みの実測値（ミリ秒）。表示は秒の切り捨て
  $("result-total-time").dataset.activeMs = String(Math.round(state.activePlayMs));
  // やり直しの回数。やり直さずに全現場を被害0円・時間切れなしで通した周だけ「ノーミス」
  const retries = describeRetries({ retries: state.retryCount, totalDamage: state.totalDamage, hasTimeouts });
  const retriesNote = $("result-retries");
  retriesNote.textContent = retries.text;
  retriesNote.classList.toggle("is-perfect", retries.perfect);

  setText($("result-goal"), describeNextGoal({ totalDamage: state.totalDamage, totalTimeSec, hasTimeouts }).text);
  renderBest({ totalDamage: state.totalDamage, hasTimeouts, totalTimeSec, rank: rankInfo.rank });

  const stageList = $("result-stage-list");
  setHTML(stageList, state.stageResults.map((res) => {
    const label = stageResultLabel(res);
    return `<li class="stage-report-item">
      <span class="stage-report-name"><span class="stage-report-no">第${res.stageId}現場：</span>${escapeHtml(res.title)}</span>
      <strong class="stage-report-value is-${label.tone}">${escapeHtml(label.text)}</strong>
    </li>`;
  }).join(""));

  state.shareText = buildShareText({ rank: rankInfo.rank, title: rankInfo.title, totalDamage: state.totalDamage, totalTimeSec, hasTimeouts });
  renderResultShare();

  // 見出しへのフォーカスは、入力を受け付け始めるとき（RESULT_GUARD_MS 後）に移す
  scrollToTop();
}

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/* 自己ベスト。端末に保存できない環境（拒否・容量超過など）でも、このページを開いている間は
   メモリ上の記録と比べて表示する */
let sessionBest = null;
function renderBest(run) {
  const store = storage();
  const previous = betterBest(readBest(store), sessionBest);
  const { best, updated, first } = mergeBest(previous, run);
  sessionBest = best;
  if (updated && isBestEligible(run)) writeBest(store, best);
  const view = describeBest({ best, updated, first, run });
  setText($("result-best"), view.text);
  const badge = $("result-best-badge");
  badge.textContent = view.badge || "";
  badge.hidden = !view.badge;
}

function shareUrl() {
  // 公開URLは build が <link rel="canonical"> として埋める。手元で開いたときは今いるURL
  return document.querySelector('link[rel="canonical"]')?.href || location.href;
}

function renderResultShare() {
  const url = encodeURIComponent(shareUrl());
  const text = encodeURIComponent(state.shareText);
  btnShareX.href = `https://x.com/intent/post?text=${text}&url=${url}`;
  btnShareLine.href = `https://social-plugins.line.me/lineit/share?url=${url}&text=${text}`;
  const canShare = typeof navigator.share === "function";
  btnShareNative.hidden = !canShare;
  // 注記は共通のシェア欄（shared/share.js）と同じ文にする（開始画面のダイアログと見比べても食い違わないように）
  setText(shareNote, canShare
    ? "InstagramとYouTubeはWebから直接投稿できない仕組みなので、「共有…」かコピーしたリンクから貼ってください。"
    : "InstagramとYouTubeはWebから直接投稿できない仕組みなので、リンクをコピーして貼ってください。");
  shareSaid.textContent = "";
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // クリップボードAPIが使えない環境向けの逃げ道
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

// ----------------------------------------------------------------- 各現場の偽サイト
function renderStageContent(stage) {
  stageViewport.innerHTML = "";
  switch (stage.id) {
    case 1:
      renderStageConfirmshaming(stage);
      break;
    case 2:
      renderStageHiddenCosts(stage);
      break;
    case 3:
      renderStageFakeUrgency(stage);
      break;
    case 4:
      renderStageSneakIntoBasket(stage);
      break;
    case 5:
      renderStageRoachMotel(stage);
      break;
    default:
      stageViewport.innerHTML = "<p>現場を準備中</p>";
  }
  phrasifyNode(stageViewport);
}

// 第1現場：罪悪感の押し売りモーダル（逃げる×・拒否リンクの文言と位置が周ごとに変わる）
function renderStageConfirmshaming() {
  const trapCost = getRandomChoice([980, 1480, 1980]);
  const variant = nextStage1Variant(state.variants.stage1);
  state.variants.stage1 = variant;
  const rejectText = REJECT_TEXTS[variant.text];
  const layout = STAGE1_LAYOUTS[variant.layout];
  state.stageContext = { rejectText, layout };

  const parts = {
    badge: '<div class="coupon-badge-loud">🎉 本日限定 <span class="nowrap">30% OFF！</span></div>',
    lead: '<p class="fake-modal-lead">いま会員登録すると、すぐ使える¥3,840引きクーポンを進呈！</p>',
    accept: `<button type="button" id="btn-accept-coupon" class="btn-coupon-accept">【推奨】クーポンを受け取って買い物する<small>（※有料プレミアムメルマガ月額${yen(trapCost)}に同意）</small></button>`,
    reject: `<button type="button" id="btn-reject-confirmshame" class="link-confirmshame" data-trap="極小の拒否リンク">${escapeHtml(rejectText)}</button>`
  };
  const order = {
    bottom: ["badge", "lead", "accept", "reject"],
    top: ["reject", "badge", "lead", "accept"],
    middle: ["badge", "lead", "reject", "accept"]
  }[layout];

  const wrap = document.createElement("div");
  wrap.className = "ec-stage-box is-popup";
  wrap.dataset.layout = layout;
  /* ×を押したときの一言は、置き場所を最初から確保しておく（出たときにポップアップの高さが変わり、
     緑のボタンや拒否リンクが動かないように）。見えない写し（sizer）が同じ文で高さを決める */
  wrap.innerHTML = `
    <div class="fake-page-bg" aria-hidden="true">
      <div class="product-card">
        <div class="product-thumb">🧥</div>
        <div class="product-info">
          <h4>秋の新作トレンチコート</h4>
          <span class="price-tag">¥12,800</span>
        </div>
      </div>
    </div>
    <div class="fake-modal-overlay">
      <div class="fake-modal-card" data-layout="${layout}">
        <button type="button" id="btn-modal-fake-close" class="btn-running-close" aria-label="閉じる" data-trap="薄い×">×</button>
        ${order.map((key) => parts[key]).join("")}
        <div class="fake-modal-nag-slot">
          <span class="fake-modal-nag-sizer" aria-hidden="true">${escapeHtml(CLOSE_NAG_TEXT)}</span>
          <p class="fake-modal-nag" role="alert"></p>
        </div>
      </div>
    </div>
  `;
  stageViewport.appendChild(wrap);

  const card = wrap.querySelector(".fake-modal-card");
  const nag = wrap.querySelector(".fake-modal-nag");
  const btnAccept = wrap.querySelector("#btn-accept-coupon");
  const btnReject = wrap.querySelector("#btn-reject-confirmshame");
  const btnFakeClose = wrap.querySelector("#btn-modal-fake-close");

  // ×は数回だけ左へ滑って逃げる。行き先はポップアップの上端の余白の中だけ（lib/variants.js の dodgeOffset）
  let escapeCount = 0;
  let dodgeX = 0;
  const escapeLimit = getRandomInt(2, 4);
  const dodgeClose = (e) => {
    if (escapeCount >= escapeLimit) return;
    if (e.cancelable) e.preventDefault();
    escapeCount++;
    const offset = dodgeOffset(Math.random, dodgeX);
    dodgeX = offset.x;
    btnFakeClose.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
    playClickSound();
  };
  btnFakeClose.addEventListener("mouseenter", dodgeClose);
  btnFakeClose.addEventListener("pointerdown", dodgeClose);

  // ×はサイト側の引き留め。ブラウザの警告ダイアログは使わず、ポップアップを揺らして、確保した場所に一言出す
  btnFakeClose.addEventListener("click", () => {
    playClickSound();
    card.classList.remove("is-shaking");
    void card.offsetWidth;
    card.classList.add("is-shaking");
    nag.classList.add("is-on");
    if (nag.textContent) {
      // 2回目以降は、いったん空にしてから入れ直す（読み上げソフトが同じ警告をもう一度拾えるように）
      nag.textContent = "";
      requestAnimationFrame(() => setText(nag, CLOSE_NAG_TEXT));
    } else {
      setText(nag, CLOSE_NAG_TEXT);
    }
  });

  btnAccept.addEventListener("click", () => {
    recordStageResult(trapCost, false, [{ name: "有料メルマガの購読", status: "hit", cost: trapCost }]);
  });

  btnReject.addEventListener("click", () => {
    if (!disarm("罪悪感の誘導を見抜いた")) return;
    recordStageResult(0, false, [{ name: "有料メルマガの購読", status: "disarmed", cost: 0 }]);
  });
}

// 第2現場：隠された年額自動更新（危険な注記の置き場所・チェックの文言と左右が周ごとに変わる）
function renderStageHiddenCosts() {
  const annualCost = getRandomChoice([12800, 14800, 19800]);
  const monthlyCost = getRandomChoice([980, 1280, 1480]);
  const variant = nextStage2Variant(state.variants.stage2);
  state.variants.stage2 = variant;
  const position = STAGE2_POSITIONS[variant.position];
  const safeText = SAFE_PLAN_TEXTS[variant.text](yen(monthlyCost));
  state.stageContext = { notePlacement: position.note };

  const noteText = `※本無料トライアルは、期間終了の48時間前までに所定の電話サポート窓口（平日11:00〜14:00のみ受付）にお申し出がない場合、自動的に年額プレミアムプラン（${yen(annualCost)}/年）へと更新されます。`;
  const toggle = `
    <div class="toggle-switch-row" data-check="${position.check}">
      <label for="chk-safe-plan" class="switch-label">${escapeHtml(safeText)}</label>
      <input type="checkbox" id="chk-safe-plan" class="toggle-input">
    </div>`;

  const hero = `
    <div class="hero-free-box">
      <h3>初月¥0！30日間無料体験</h3>
      <p>1億曲が広告なしで聴き放題。いつでも解約OK！</p>
    </div>`;
  const startButton = '<button type="button" id="btn-sub-start" class="btn-start-trial">無料トライアルを開始する</button>';

  const wrap = document.createElement("div");
  wrap.className = "sub-stage-box";
  wrap.dataset.note = position.note;
  wrap.dataset.check = position.check;
  if (position.note === "accordion") {
    wrap.innerHTML = `
      ${hero}
      <details class="accordion-details">
        <summary class="accordion-summary"><span class="accordion-icon" aria-hidden="true">▶</span><span>契約形態および解約に関する重要事項<span class="accordion-hint">（タップで展開）</span></span></summary>
        <div class="accordion-content">
          <p>${escapeHtml(noteText)}</p>
          ${toggle}
        </div>
      </details>
      ${startButton}`;
  } else {
    wrap.innerHTML = `
      ${hero}
      ${startButton}
      <div class="fine-print-box">
        <p class="fine-print" data-trap="極小の注記">${escapeHtml(noteText)}</p>
        ${toggle}
      </div>`;
  }
  stageViewport.appendChild(wrap);

  const details = wrap.querySelector(".accordion-details");
  if (details) {
    // 開閉の記号は1つだけ。開いたら▼と「（タップで閉じる）」に替える
    details.addEventListener("toggle", () => {
      wrap.querySelector(".accordion-icon").textContent = details.open ? "▼" : "▶";
      setText(wrap.querySelector(".accordion-hint"), details.open ? "（タップで閉じる）" : "（タップで展開）");
    });
  }

  const chkSafe = wrap.querySelector("#chk-safe-plan");
  const btnStartSub = wrap.querySelector("#btn-sub-start");

  chkSafe.addEventListener("change", () => {
    if (chkSafe.checked) {
      disarm("Webで解約できる月額プランに変更");
    } else {
      playInspectSound();
    }
  });

  btnStartSub.addEventListener("click", () => {
    if (chkSafe.checked) {
      recordStageResult(0, false, [{ name: "電話でしか解約できない年額プラン", status: "disarmed", cost: 0 }]);
    } else {
      recordStageResult(annualCost, false, [{ name: "電話でしか解約できない年額プラン", status: "hit", cost: annualCost }]);
    }
  });
}

// 第3現場：偽の緊急性と閲覧者数（プラン順はランダム。危険な返金不可プランが必ず初期選択）
function renderStageFakeUrgency(stage) {
  const roomCost = getRandomChoice([18000, 22000, 28000]);
  const viewers = getRandomInt(20, 60);
  const isReversed = Math.random() > 0.5;
  state.stageContext = { viewers };

  const htmlNonref = `
    <label class="plan-radio-row selected" id="row-nonref">
      <input type="radio" name="hotel-plan" value="nonrefundable" checked>
      <span>
        <span class="plan-title">【本日特価】返金不可・即時全額決済プラン ${yen(roomCost)}</span>
        <span class="plan-sub">※いかなる理由でもキャンセル料100%が発生します</span>
      </span>
    </label>`;
  const htmlFreecancel = `
    <label class="plan-radio-row" id="row-freecancel">
      <input type="radio" name="hotel-plan" value="freecancel">
      <span>
        <span class="plan-title">【安心標準】前日までキャンセル無料プラン ${yen(roomCost)}</span>
        <span class="plan-sub">※前日23:59までキャンセル料0円</span>
      </span>
    </label>`;

  /* 偽サイトの最上段に「お知らせ帯」の定位置を最初から置く。初めは静かなセールの案内で、
     1.5秒後に同じ場所が偽の仮予約通知に入れ替わる。2つは同じマスに重ねてあり、高い方に合わせて
     場所を取るので、入れ替わってもレイアウトが動かず、何にも重ならず、どの画面の高さでも見える */
  const wrap = document.createElement("div");
  wrap.className = "hotel-stage-box";
  wrap.innerHTML = `
    <div class="notice-slot" data-state="calm">
      <div class="notice-calm">
        <span class="notice-icon" aria-hidden="true">🏷️</span>
        <span>会員限定セール開催中！ 対象プランはポイント5倍</span>
      </div>
      <div class="fake-toast">
        <span class="fake-toast-icon" aria-hidden="true">🛎️</span>
        <div>
          <strong>東京都のユーザーが同じ部屋を仮予約中！</strong>
          <p>あと1分で部屋が解放されます</p>
        </div>
      </div>
    </div>
    <div class="urgency-banner">
      <span>⚠️ 残りあと1室！ 現在${viewers}人が検討中です！</span>
    </div>
    <div class="hotel-plan-card">
      <h4>天然温泉 翠明館 — スタンダード和室</h4>
      <p class="hotel-meta">1泊2食付き / 2名1室利用</p>
      <div class="hotel-plans">
        ${isReversed ? htmlFreecancel + htmlNonref : htmlNonref + htmlFreecancel}
      </div>
    </div>
    <button type="button" id="btn-hotel-submit" class="btn-hotel-book">この条件で予約を確定する</button>
  `;
  stageViewport.appendChild(wrap);

  // 1.5秒後に、お知らせ帯がサイト自身の偽の通知に入れ替わる（罠の演出。タップは妨げない）
  const noticeSlot = wrap.querySelector(".notice-slot");
  setTimeout(() => {
    if (!wrap.isConnected || state.stageResolved) return;
    noticeSlot.dataset.state = "urgent";
    playHeartbeatSound();
  }, 1500);

  const radios = wrap.querySelectorAll('input[name="hotel-plan"]');
  const rowNonref = wrap.querySelector("#row-nonref");
  const rowFreecancel = wrap.querySelector("#row-freecancel");
  const btnSubmit = wrap.querySelector("#btn-hotel-submit");

  radios.forEach((r) => {
    r.addEventListener("change", () => {
      if (r.value === "nonrefundable") {
        rowNonref.classList.add("selected");
        rowFreecancel.classList.remove("selected");
        playInspectSound();
      } else {
        rowFreecancel.classList.add("selected");
        rowNonref.classList.remove("selected");
        disarm("キャンセル無料プランを選んだ");
      }
    });
  });

  btnSubmit.addEventListener("click", () => {
    const selected = wrap.querySelector('input[name="hotel-plan"]:checked').value;
    if (selected === "nonrefundable") {
      recordStageResult(roomCost, false, [{ name: "返金不可プラン（キャンセル料100%）", status: "hit", cost: roomCost, note: stage.trapNote }]);
    } else {
      recordStageResult(0, false, [{ name: "返金不可プラン（キャンセル料100%）", status: "disarmed", cost: 0 }]);
    }
  });
}

// 第4現場：お試し500円の罠（事前チェックと引き留めダイアログ。両方の確定ボタンがチェックの状態どおりに請求する）
function renderStageSneakIntoBasket(stage) {
  const subCost = getRandomChoice([4980, 5980, 6980]);
  const warrantyCost = getRandomChoice([550, 750, 950]);

  const optionsHTML = shuffleArray([
    `<label class="option-row" id="lbl-sub">
        <input type="checkbox" id="chk-opt-sub" checked>
        <span class="option-text">
          <strong>【人気No.1】便利でお得な毎月自動お届け定期便に申し込む</strong>
          <span>※2回目以降は月額${yen(subCost)}（税込）で毎月自動更新となります</span>
        </span>
      </label>`,
    `<label class="option-row" id="lbl-warranty">
        <input type="checkbox" id="chk-opt-warranty" checked>
        <span class="option-text">
          <strong>プレミアムあんしん配送補償プラン<span class="nowrap">（+${yen(warrantyCost)}）</span></strong>
          <span>※配送事故時の無料再送サービスです</span>
        </span>
      </label>`
  ]).join("");

  const wrap = document.createElement("div");
  wrap.className = "ec-stage-box";
  wrap.innerHTML = `
    <div class="ec-stage-content">
      <div class="product-card">
        <div class="product-thumb" aria-hidden="true">💊</div>
        <div class="product-info">
          <h4>超高濃度ブルーベリーEX（30日分）</h4>
          <p class="product-desc">初回限定お試し特別モニター価格！ ★★★★★ 4.9（3,842件）</p>
          <div>
            <span class="price-tag">¥500（税込）</span>
            <span class="original-price">通常 ¥5,980</span>
          </div>
        </div>
      </div>

      <div class="options-group">
        ${optionsHTML}
      </div>

      <button type="button" id="btn-stage1-loud" class="btn-ec-buy-loud">
        今すぐ注文を確定する（送料無料）
      </button>
      <button type="button" id="btn-stage1-subtle" class="btn-ec-subtle" data-trap="目立たない小ボタン">選択中の契約・オプションで注文を確定</button>
    </div>
  `;
  stageViewport.appendChild(wrap);

  const content = wrap.querySelector(".ec-stage-content");
  const chkSub = wrap.querySelector("#chk-opt-sub");
  const chkWarranty = wrap.querySelector("#chk-opt-warranty");
  const btnLoud = wrap.querySelector("#btn-stage1-loud");
  const btnSubtle = wrap.querySelector("#btn-stage1-subtle");

  // 引き留めダイアログをどう閉じたか（keep＝赤いボタン／escape／remove／manual＝自分で付け直した）。被弾の内訳に1行添える材料
  let retentionOutcome = null;

  // 定期便のチェックを外そうとすると、サイトの引き留めダイアログが出る
  chkSub.addEventListener("click", (e) => {
    if (chkSub.checked) {
      // 付け直す操作はそのまま通す
      retentionOutcome = "manual";
      return;
    }
    e.preventDefault();
    chkSub.checked = true;
    openRetentionDialog();
  });

  function openRetentionDialog() {
    if (wrap.querySelector(".retention-mini-dialog")) return;
    const dialog = document.createElement("div");
    dialog.className = "retention-mini-dialog";
    dialog.innerHTML = `
      <div class="mini-dialog-card" role="dialog" aria-modal="true" aria-labelledby="retention-title" aria-describedby="retention-desc">
        <h3 id="retention-title">⚠️ ${escapeHtml(stage.retentionQuestion)}</h3>
        <p id="retention-desc">今解除すると、初回限定の特別割引（-90%）や送料無料特典が失効する可能性があります。</p>
        <div class="dialog-btn-row">
          <button type="button" class="btn-dialog-stay" id="btn-keep-sub">お得な定期便を続ける</button>
          <button type="button" class="btn-dialog-leave" id="btn-remove-sub">割引を捨てて解除する</button>
        </div>
      </div>
    `;
    /* 背後の偽サイトは操作できなくする（キーボードで裏の注文ボタンを押せないように）。前に閉じたときの入力の停止が
       まだ残っていたら止める（そのタイマーが、開いているダイアログの背後を押せる状態に戻さないように） */
    releaseGuard(content);
    content.inert = true;
    wrap.appendChild(dialog);
    phrasifyNode(dialog);

    const buttons = [...dialog.querySelectorAll("button")];
    /* キーは開いている間だけ document で受ける。暗い背景を押してフォーカスが外に落ちても、
       Esc で閉じられ、Tab でダイアログの中へ戻れるように */
    const onKeydown = (e) => {
      if (!dialog.isConnected || state.stageResolved) {
        document.removeEventListener("keydown", onKeydown);
        return;
      }
      if (e.key === "Escape") {
        // Esc は「続ける」と同じ（定期便は付いたまま）
        e.preventDefault();
        close("escape");
      } else if (e.key === "Tab") {
        // Tab はダイアログの2つのボタンの間で循環させる
        const index = buttons.indexOf(document.activeElement);
        const next = e.shiftKey ? (index <= 0 ? buttons.length - 1 : index - 1) : (index + 1) % buttons.length;
        e.preventDefault();
        buttons[next].focus();
      }
    };
    const close = (outcome) => {
      document.removeEventListener("keydown", onKeydown);
      dialog.remove();
      retentionOutcome = outcome;
      if (outcome === "remove") chkSub.checked = false;
      /* 閉じた直後の偽サイトはまだ押せない（背後は開いたときから inert）。「割引を捨てて解除する」の2回目が、
         下にある選択肢の行に当たって定期便を付け直さないように。フォーカスも明けてから定期便のチェックへ戻す */
      guardInput(content, () => {
        if (!state.stageResolved && chkSub.isConnected) chkSub.focus({ preventScroll: true });
      });
      if (outcome === "remove") disarm("定期便の自動更新を外した");
    };

    dialog.querySelector("#btn-keep-sub").addEventListener("click", () => {
      playClickSound();
      close("keep");
    });
    dialog.querySelector("#btn-remove-sub").addEventListener("click", () => close("remove"));
    document.addEventListener("keydown", onKeydown);

    buttons[0].focus({ preventScroll: true });
    bringIntoView(dialog.querySelector(".mini-dialog-card"));
  }

  chkWarranty.addEventListener("change", () => {
    if (!chkWarranty.checked) {
      disarm("有料の配送補償を外した");
    } else {
      playInspectSound();
    }
  });

  const checkDamage = () => {
    let damage = 0;
    const breakdown = [];
    if (chkSub.checked) {
      damage += subCost;
      // 外そうとして引き留めダイアログに押し戻された人には、何に負けたのかを1行添える
      const note = stage.retentionNotes[retentionOutcome];
      breakdown.push({ name: "定期便の自動移行", status: "hit", cost: subCost, ...(note ? { note } : {}) });
    } else {
      breakdown.push({ name: "定期便の自動移行", status: "disarmed", cost: 0 });
    }
    if (chkWarranty.checked) {
      damage += warrantyCost;
      breakdown.push({ name: "有料の配送補償", status: "hit", cost: warrantyCost });
    } else {
      breakdown.push({ name: "有料の配送補償", status: "disarmed", cost: 0 });
    }
    recordStageResult(damage, false, breakdown);
  };

  btnLoud.addEventListener("click", checkDamage);
  btnSubtle.addEventListener("click", checkDamage);
}

// 第5現場：迷宮の退会アンケート（二重否定の質問と、目立つ色と左右が周ごとに変わる最終確認）
function renderStageRoachMotel(stage) {
  const isReversed = Math.random() > 0.5;

  const htmlStay = `
    <label class="survey-row">
      <input type="radio" name="double-neg" value="stay">
      <span>いいえ（解約の手続きを中止する）</span>
    </label>`;
  const htmlLeave = `
    <label class="survey-row">
      <input type="radio" name="double-neg" value="leave">
      <span>はい（解約の手続きをそのまま継続する）</span>
    </label>`;

  const wrap = document.createElement("div");
  wrap.className = "cancel-stage-box";
  wrap.innerHTML = `
    <div class="retention-box">
      <h4>本当に退会しますか？</h4>
      <p>今なら解約を思いとどまると限定ポイント500ptをプレゼント！</p>
      <button type="button" id="btn-cancel-stay" class="btn-stay-loud">契約を継続して500ptを受け取る</button>
    </div>

    <div class="survey-box">
      <p class="survey-title" id="survey-question">Q. ${escapeHtml(stage.question)}</p>
      <div class="survey-options" role="radiogroup" aria-labelledby="survey-question">
        ${isReversed ? htmlLeave + htmlStay : htmlStay + htmlLeave}
      </div>
      <!-- 未回答の警告の場所は最初から確保する（出入りで下のフッターのリンクが動かないように） -->
      <div class="survey-warning-slot">
        <span class="survey-warning-sizer" aria-hidden="true">${escapeHtml(SURVEY_WARNING_TEXT)}</span>
        <p class="survey-warning" id="survey-warning" role="alert"></p>
      </div>
    </div>

    <div class="footer-trick-area" data-trap="極小フッター">
      <p>© 2026 Movie Delivery Plus. All Rights Reserved.</p>
      <p class="footer-links">
        <a href="#terms">利用規約</a> |
        <a href="#privacy">プライバシーポリシー</a> |
        <button type="button" id="btn-real-cancel" class="link-real-cancel">退会手続きへ進む</button>
      </p>
    </div>

    <div id="final-confirm-area"></div>
  `;
  stageViewport.appendChild(wrap);

  // 偽サイトの規約リンクは飾り。押してもページ内を飛ばない
  wrap.querySelectorAll('.footer-trick-area a').forEach((a) => a.addEventListener("click", (e) => e.preventDefault()));

  const btnStay = wrap.querySelector("#btn-cancel-stay");
  const btnRealCancel = wrap.querySelector("#btn-real-cancel");
  const finalArea = wrap.querySelector("#final-confirm-area");
  const warning = wrap.querySelector("#survey-warning");

  wrap.querySelectorAll('input[name="double-neg"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      warning.classList.remove("is-on");
      warning.textContent = "";
      // 正しい選択肢を選んだ瞬間に合図を出す（第3現場のプラン選びと同じ）
      if (radio.value === "leave") disarm("二重否定の質問を見抜いた");
      else playInspectSound();
    });
  });

  btnStay.addEventListener("click", () => {
    recordStageResult(1980, false, [{ name: "引き留め特典の受け取り（契約継続）", status: "hit", cost: 1980 }]);
  });

  btnRealCancel.addEventListener("click", () => {
    const selected = wrap.querySelector('input[name="double-neg"]:checked');
    if (!selected) {
      // ブラウザの警告ダイアログは使わず、質問の下の確保した場所に出す
      warning.classList.add("is-on");
      if (warning.textContent) {
        // 2回目以降は、いったん空にしてから入れ直す（読み上げソフトが同じ警告をもう一度拾えるように）
        warning.textContent = "";
        requestAnimationFrame(() => setText(warning, SURVEY_WARNING_TEXT));
      } else {
        setText(warning, SURVEY_WARNING_TEXT);
      }
      bringIntoView(warning.closest(".survey-box"));
      return;
    }

    if (selected.value === "stay") {
      recordStageResult(1980, false, [{ name: "二重否定の質問で解約を中止", status: "hit", cost: 1980 }]);
      return;
    }

    if (finalArea.firstElementChild) {
      // もう出ている最終確認を、もう一度指の下へ動かすときも、出したときと同じく少しの間は押せなくする
      guardInput(finalArea.firstElementChild);
      bringIntoView(finalArea.firstElementChild);
      return;
    }

    // 最終確認。どちらが目立つ色か・左右（狭い画面では上下）も毎回変える
    const loudIsStay = Math.random() > 0.5;
    const finalStay = `<button type="button" id="btn-final-stay" class="${loudIsStay ? "btn-trick-loud" : "btn-trick-subtle"}">考え直す（契約を維持）</button>`;
    const finalLeave = `<button type="button" id="btn-final-leave" class="${loudIsStay ? "btn-trick-subtle" : "btn-trick-loud"}">退会する</button>`;
    const finalReversed = Math.random() > 0.5;

    setHTML(finalArea, `
      <div class="final-confirm-box" data-loud="${loudIsStay ? "stay" : "leave"}" data-order="${finalReversed ? "leave-first" : "stay-first"}">
        <p>最終確認：本当に会員特典を破棄しますか？</p>
        <div class="final-btn-group">
          ${finalReversed ? finalLeave + finalStay : finalStay + finalLeave}
        </div>
      </div>
    `);

    // 合図と内訳の文言は、色や左右に依存させない（4通りの配置のどれでも画面と食い違わない）
    finalArea.querySelector("#btn-final-stay").addEventListener("click", () => {
      recordStageResult(1980, false, [{ name: "最終確認で「考え直す」を選んで契約を継続", status: "hit", cost: 1980 }]);
    });

    finalArea.querySelector("#btn-final-leave").addEventListener("click", () => {
      if (!disarm("引き留めを振り切って退会を選んだ")) return;
      recordStageResult(0, false, [{ name: "翌月の自動更新", status: "disarmed", cost: 0 }]);
    });

    /* 出た直後（自動スクロールの間）は押せない。「退会手続きへ進む」の2回目が、スクロールで指の下へ来た
       最終確認のボタンに当たらないように（どちらが「考え直す」かは周ごとに変わるので、当たると半々で被弾する） */
    guardInput(finalArea.firstElementChild);
    // 最終確認の枠が画面内に入るまで自動でスクロールする（HUDの下から画面の下端まで）
    bringIntoView(finalArea.firstElementChild);
  });
}

init();
