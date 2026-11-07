'use strict';
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const fragment = new URLSearchParams(location.hash.slice(1));
const remoteRole = params.get('mode') === 'remote' && fragment.has('token');
const clientId = [...crypto.getRandomValues(new Uint8Array(12))].map(n => n.toString(16).padStart(2, '0')).join('');
const samples = [
  ['スマホが、発表のリモコンに。', 'PCで資料を開いて、QRを読み取る。', ['アプリのインストール不要', 'PCとスマホをインターネットに接続', '右タップで次へ、左タップで戻る']],
  ['PowerPointを、そのまま。', 'PPTX・PPT・PDFを選ぶだけ。', ['表示の準備はアプリが自動で', '全ページを確認してから採用', '資料はこのPC内で処理']],
  ['聴衆を見ながら、話す。', '大きな操作面でページを送る。', ['暗転して話に集中', 'ポインターは押している間だけ', '対応端末では操作成功時に短く振動']],
  ['手元には、原稿と時間。', '投影画面にはスライドだけ。', ['PCでページごとのカンペを保存', 'スマホに同じページの原稿を表示', '開始・停止・リセットできる共通タイマー']],
  ['準備ができたら、発表へ。', 'PCの「全画面プレゼン」を押して開始。', ['接続状態を確認', '資料の全ページを確認', '終了すると資料とカンペを消去']]
];
let session = null;
let browserApi = null;
let sessionEnded = false;
let snapshot = null;
let remoteUrl = '';
let connected = false;
let connectionEpoch = 0;
let commandQueue = Promise.resolve();
let currentMode = params.get('mode') || 'dual';
let receivedAt = 0;
let toastTimeout;
let imageVersion = 0;
let imagePath = null;
let imageBlob = '';
let imageLoad = Promise.resolve(true);
let notePage = -1;
let noteDirty = false;
const noteDrafts = new Map();
let laserRequestVersion = 0;
let loading = false;
let preview = null;
let previewBlobs = [];
let previewReady = false;
let previewBusy = false;
let importState = null;
let localProgress = null;
let activeUploadId = null;
let importDismissed = false;
let importDisplayed = false;
let recoveredImportId = null;
let recoveringPreview = false;
let finalizingImage = false;
let retryAction = 'file';
let activeImportController = null;
let localFontModule = null;
let localFontsEnabled = false;
let fontPermissionPending = false;
let laserHeld = false;
let laserInterval;
let pointerOrigin = null;
let pointerPosition = { x: 50, y: 50 };
let pointerSentAt = 0;
let gyroEnabled = false;
let gyroOrigin = null;

function showToast(message) {
  $('toastText').textContent = message;
  $('toastMessage').classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $('toastMessage').classList.remove('show'), 5000);
}
async function api(resource, options = {}) {
  if (!browserApi || sessionEnded) throw new Error('接続を確認してください。');
  const response = await browserApi.request(resource, options);
  if (!response.ok) {
    let message = '操作を完了できませんでした。';
    try { message = (await response.json()).error || message; } catch {}
    throw new Error(message);
  }
  return response;
}
async function readData(resource, options = {}, type = 'json', timeout = 20000) {
  const controller = new AbortController(), external = options.signal;
  let timedOut = false;
  const abort = () => controller.abort();
  external?.addEventListener('abort',abort,{once:true});
  if (external?.aborted) abort();
  const timer = setTimeout(() => {timedOut=true;controller.abort();}, timeout);
  try {
    if (controller.signal.aborted) throw new DOMException('資料の読込を取り消しました。','AbortError');
    return await (await api(resource, { ...options, signal:controller.signal }))[type]();
  } catch (error) {
    if (external?.aborted) throw new DOMException('資料の読込を取り消しました。','AbortError');
    if (timedOut) throw new Error('処理に時間がかかっています。通信を確認し、資料を選び直してください。');
    if (error instanceof TypeError) throw new Error('通信できませんでした。接続を確認して再試行してください。');
    throw error;
  } finally {clearTimeout(timer);external?.removeEventListener('abort',abort);}
}
function canOperate() { return connected && snapshot && (!remoteRole || snapshot.peers.host > 0); }
function setConnected(value, message) {
  if (connected && !value) { connectionEpoch++; laserHeld = false; clearInterval(laserInterval); }
  connected = value;
  const operating = Boolean(canOperate());
  const label = message || (!operating ? 'PCとの接続待ち。PCを開いてください。' : remoteRole ? 'PCに接続済み' : snapshot.peers.remote > 0 ? 'スマホに接続済み' : 'PCの準備完了・スマホでQRを読み取り');
  $('connectionStatus').textContent = label;
  $('connectionStatus').dataset.connected = String(value);
  $('remoteStatusIndicator').textContent = label;
  for (const element of document.querySelectorAll('#btnPrev,#btnNext,.utility-bar button,[data-command],#timerToggle')) element.disabled = !operating;
  if (snapshot) { $('btnPrev').disabled = !operating || snapshot.current === 0; $('btnNext').disabled = !operating || snapshot.current === snapshot.total - 1; }
  for (const element of document.querySelectorAll('[data-host],#noteEditor')) element.disabled = !connected || remoteRole || loading;
  for (const element of document.querySelectorAll('[data-upload],#filePicker')) element.disabled = !connected || remoteRole || loading;
  $('localFontsButton').disabled = !connected || remoteRole || loading || fontPermissionPending;
  $('acceptPreview').disabled = !connected || !previewReady || previewBusy;
  $('discardPreview').disabled = !connected || previewBusy;
}
function disconnect(message = '接続が切れました。再接続しています…') { setConnected(false, message); }
function sendCommand(command, { haptic = false } = {}) {
  if (!canOperate()) return Promise.resolve();
  const epoch = connectionEpoch;
  const pointerVersion = command.type === 'LASER' ? ++laserRequestVersion : 0;
  const result = commandQueue.then(async () => {
    if (!canOperate() || epoch !== connectionEpoch) return;
    // Position updates are disposable: only the newest held-pointer command may leave the queue.
    if (command.type === 'LASER' && command.active && (!laserHeld || pointerVersion !== laserRequestVersion)) return;
    const before = snapshot.current;
    const payload = { ...command };
    if (payload.type === 'BLACKOUT' && typeof payload.active !== 'boolean') payload.active = !snapshot.isBlackout;
    if (payload.type === 'PRESENTATION' && typeof payload.active !== 'boolean') payload.active = !snapshot.presentation;
    const response = await api('/api/command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    applySnapshot(data.state);
    if (haptic && snapshot.current !== before && navigator.vibrate) navigator.vibrate(25);
  }).catch(error => {
    showToast(error.message);
    if (error instanceof TypeError) disconnect();
  });
  commandQueue = result;
  return result;
}
function applySnapshot(state) {
  if (!state || (snapshot && state.revision < snapshot.revision)) return;
  const changedDeck = snapshot && JSON.stringify(state.slides) !== JSON.stringify(snapshot.slides);
  snapshot = state;
  receivedAt = performance.now();
  if (changedDeck) { noteDrafts.clear(); noteDirty = false; notePage = -1; }
  render();
  setConnected(connected);
  syncImportProgress(state.import);
}
function loadCurrentImage(resource) {
  if (imagePath === resource) return imageLoad;
  imagePath = resource;
  const version = ++imageVersion;
  if (!resource) { $('slideImgView').hidden = true; $('remoteSlideThumb').hidden = true; return imageLoad = Promise.resolve(true); }
  imageLoad = (async () => {
    let blob;
    try {
      blob = URL.createObjectURL(await readData(resource, {}, 'blob'));
      const image = new Image(); image.src = blob;
      await image.decode();
      if (version !== imageVersion) { URL.revokeObjectURL(blob); return false; }
      const old = imageBlob; imageBlob = blob;
      $('slideImgView').src = blob; $('remoteSlideThumb').src = blob;
      $('slideImgView').hidden = false; $('remoteSlideThumb').hidden = false;
      if (old) URL.revokeObjectURL(old);
      return true;
    } catch {
      if (blob) URL.revokeObjectURL(blob);
      if (version === imageVersion) { imagePath = ''; showToast('スライド画像を取得できません。接続を確認して再度操作してください。'); }
      return false;
    }
  })();
  return imageLoad;
}
function render() {
  if (!snapshot) return;
  const { current, total, slides, notes, laser, isBlackout } = snapshot;
  const count = `${current + 1} / ${total}`;
  for (const id of ['footerCounter', 'remoteSlide', 'slideCounterBottom', 'hudSlideCounter']) $(id).textContent = count;
  const hasImages = slides.some(Boolean);
  const title = hasImages ? `スライド ${current + 1}` : samples[current][0];
  $('footerTitle').textContent = title;
  $('remoteCurrentTitle').textContent = title;
  $('remoteNextTitle').textContent = current === total - 1 ? '最終スライド' : `次: スライド ${current + 2}`;
  $('speakerNote').textContent = notes[current] || 'このページのカンペはまだありません。';
  $('slideCard').style.display = hasImages ? 'none' : 'flex';
  if (!hasImages) {
    $('slideHeading').textContent = samples[current][0];
    $('slideSubheading').textContent = samples[current][1];
    $('slideBullets').replaceChildren(...samples[current][2].map(text => {
      const li = document.createElement('li'); li.textContent = text; return li;
    }));
  }
  void loadCurrentImage(slides[current] || '');
  $('blackoutOverlay').classList.toggle('active', isBlackout);
  $('laserDot').classList.toggle('active', laser.active && !isBlackout);
  $('laserDot').style.left = `${laser.x}%`;
  $('laserDot').style.top = `${laser.y}%`;
  $('remotePresentation').setAttribute('aria-pressed', String(snapshot.presentation));
  document.querySelector('.utility-bar .btn-blackout').setAttribute('aria-pressed', String(isBlackout));
  const fullscreen = !remoteRole && (snapshot.presentation || Boolean(document.fullscreenElement));
  if (document.body.classList.contains('in-fullscreen') !== fullscreen) hideFullscreenHud();
  document.body.classList.toggle('in-fullscreen', fullscreen);
  if (notePage !== current || !noteDirty) {
    notePage = current; noteDirty = noteDrafts.has(current);
    $('noteEditor').value = noteDirty ? noteDrafts.get(current) : notes[current] || '';
    $('noteSaveStatus').textContent = noteDirty ? '未保存の変更があります。' : '終了すると資料・カンペは消去されます。';
    $('noteLabel').textContent = `ページ ${current + 1} のカンペ（スマホだけに表示）`;
  }
  updateClock();
}
function updateClock() {
  if (!snapshot) return;
  const { elapsedMs, startedAt } = snapshot.timer;
  const ms = elapsedMs + (startedAt === null ? 0 : Math.max(0, snapshot.serverNow - startedAt) + (performance.now() - receivedAt));
  const sec = Math.floor(ms / 1000);
  const time = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  for (const id of ['remoteTimer', 'footerTimer', 'hudTimer']) $(id).textContent = time;
  $('timerToggle').textContent = startedAt === null ? 'タイマー開始' : '一時停止';
}
setInterval(updateClock, 250);
function execNext() { return sendCommand({ type: 'NEXT' }, { haptic: true }); }
function execPrev() { return sendCommand({ type: 'PREV' }, { haptic: true }); }
function execToggleBlackout() { return sendCommand({ type: 'BLACKOUT' }); }
function onRemoteNext() { return execNext(); }
function onRemotePrev() { return execPrev(); }
function onRemoteBlackout() { return execToggleBlackout(); }
function onRemoteFullscreen() { return sendCommand({ type: 'PRESENTATION' }); }
function toggleTimer() { return sendCommand({ type: 'TIMER', action: snapshot?.timer.startedAt === null ? 'start' : 'pause' }); }
function resetTimer() { return sendCommand({ type: 'TIMER', action: 'reset' }); }
async function saveNote() {
  if (remoteRole || !snapshot) return;
  const text = $('noteEditor').value;
  const page = notePage;
  await sendCommand({ type: 'NOTE', page, text });
  if (snapshot.notes[page] === text && noteDrafts.get(page) === text) {
    noteDrafts.delete(page);
    if (notePage === page) { noteDirty = false; $('noteSaveStatus').textContent = '保存しました。スマホに同期済みです。'; }
  }
}
$('noteEditor').addEventListener('input', () => { noteDirty = true; noteDrafts.set(notePage, $('noteEditor').value); $('noteSaveStatus').textContent = '未保存の変更があります。'; });
function setMode(mode) {
  if (remoteRole && mode !== 'remote') return;
  currentMode = ['host', 'dual', 'remote'].includes(mode) ? mode : 'host';
  $('stageContainer').className = `stage-container mode-${currentMode}`;
  $('pcCol').style.display = currentMode === 'remote' ? 'none' : 'block';
  $('phoneCol').style.display = currentMode === 'host' ? 'none' : 'block';
  document.body.classList.toggle('standalone-remote', currentMode === 'remote' && innerWidth <= 780);
  for (const [name, id] of [['dual','tabDual'],['host','tabHost'],['remote','tabRemote']]) $(id).classList.toggle('active', currentMode === name);
  if (currentMode === 'remote') document.body.classList.remove('in-fullscreen');
}
window.addEventListener('resize', () => setMode(currentMode));
async function toggleFullscreen() {
  if (remoteRole || currentMode === 'remote') return;
  if (document.fullscreenElement) { await document.exitFullscreen(); return; }
  if (snapshot?.presentation) { await sendCommand({ type: 'PRESENTATION', active: false }); return; }
  try { await document.documentElement.requestFullscreen(); }
  catch { showToast('全画面にできませんでした。PCで全画面ボタンを押してください。'); }
}
document.addEventListener('fullscreenchange', () => { render(); hideFullscreenHud(); });
let hudTimeout;
function hideFullscreenHud() {
  clearTimeout(hudTimeout);
  if ($('fullscreenHud').contains(document.activeElement)) document.activeElement.blur();
  $('fullscreenHud').classList.remove('visible');
}
function hudHasKeyboardFocus() { return Boolean($('fullscreenHud').querySelector(':focus-visible')); }
function showFullscreenHud() {
  if (!document.body.classList.contains('in-fullscreen') || document.querySelector('dialog[open]') || !$('dropOverlay').hidden) return;
  $('fullscreenHud').classList.add('visible'); clearTimeout(hudTimeout);
  hudTimeout = setTimeout(() => {
    if (!hudHasKeyboardFocus()) $('fullscreenHud').classList.remove('visible');
  }, 2200);
}
window.addEventListener('mousemove', event => {
  if (event.clientY <= 64 || event.clientY >= innerHeight - 88) showFullscreenHud();
  else if (!$('fullscreenHud').contains(event.target) && !hudHasKeyboardFocus()) hideFullscreenHud();
});
$('slideStage').addEventListener('dblclick', () => { void toggleFullscreen(); });
$('fullscreenHud').addEventListener('focusin', showFullscreenHud);
$('fullscreenHud').addEventListener('focusout', () => { hudTimeout = setTimeout(hideFullscreenHud, 2200); });
window.addEventListener('keydown', event => {
  if (event.defaultPrevented) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable || document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape') {
    if (document.fullscreenElement) void document.exitFullscreen();
    if (snapshot?.presentation) void sendCommand({ type:'PRESENTATION', active:false });
    return;
  }
  if (event.target.closest('button, summary, a, [role=button]') && event.key === ' ') return;
  const action = { ' ':execNext, ArrowRight:execNext, PageDown:execNext, ArrowLeft:execPrev, PageUp:execPrev, b:execToggleBlackout, B:execToggleBlackout, f:toggleFullscreen, F:toggleFullscreen }[event.key];
  if (action) { event.preventDefault(); void action(); }
});
async function copyRemoteUrl() {
  if (!remoteUrl) return;
  try { await navigator.clipboard.writeText(remoteUrl); showToast('接続用リンクをコピーしました。接続する人だけに共有してください。'); }
  catch { showToast('この環境ではコピーできません。スマホでQRを読み取ってください。'); }
}
$('qrBadge').addEventListener('keydown', event => { if (['Enter',' '].includes(event.key)) { event.preventDefault(); void copyRemoteUrl(); } });
function showDropZone() {
  if (remoteRole || !connected) return;
  if (loading) { openImportStatus(); return; }
  hideFullscreenHud(); $('dropOverlay').hidden = false; $('dropOverlay').classList.add('show');
}
function hideDropZone() { $('dropOverlay').classList.remove('show'); $('dropOverlay').hidden = true; }
window.addEventListener('dragover', event => { event.preventDefault(); if (event.dataTransfer.types.includes('Files') && !document.querySelector('dialog[open]')) showDropZone(); });
window.addEventListener('drop', event => event.preventDefault());
$('dropOverlay').addEventListener('drop', event => { event.preventDefault(); hideDropZone(); if (event.dataTransfer.files[0]) void processFile(event.dataTransfer.files[0]); });
function onFilePicked(event) { const file = event.target.files[0]; event.target.value = ''; hideDropZone(); if (file) void processFile(file); }

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
  document.body.classList.toggle('has-dialog', Boolean(document.querySelector('dialog[open]')));
  hideFullscreenHud();
}
function showDialog(dialog) {
  const other = document.querySelector('dialog[open]');
  if (other && other !== dialog) closeDialog(other);
  hideDropZone(); hideFullscreenHud();
  if (!dialog.open) dialog.showModal();
  document.body.classList.add('has-dialog');
}
function openImportStatus() {
  importDismissed = false;
  showDialog(previewReady ? $('conversionPreview') : $('importProgress'));
}
function hideImportProgress() { importDismissed = true; closeDialog($('importProgress')); }
function chooseAnotherFile() { importDismissed = true; closeDialog($('conversionPreview')); $('filePicker').click(); }
$('importProgress').addEventListener('cancel', event => { event.preventDefault(); hideImportProgress(); });
function updateImportView() {
  if (!importState || remoteRole) return;
  const phase = localProgress || importState;
  const failed = Boolean(phase.error) || importState.status === 'failed';
  const ready = previewReady && importState.status === 'awaiting_confirmation';
  const completed = importDisplayed && importState.status === 'completed';
  const discarded = importState.status === 'discarded';
  const labels = { receiving:'資料を読み込んでいます', loading_engine:'表示エンジンを読み込んでいます', initializing_engine:'表示エンジンを準備しています', preparing:'資料を確認しています', converting:'スライドを変換しています', rendering:'スライド画像を作成しています', finalizing:'表示の準備をしています', preview:'プレビューを読み込んでいます', applying:'新しい資料に切り替えています', ready:'変換が完了しました' };
  const label = failed ? '資料の準備を完了できませんでした' : completed ? '新しい資料に切り替わりました' : discarded ? '取消しました。現在の資料を続けられます' : ready ? '準備完了・確認して切り替えてください' : labels[phase.stage] || '表示の準備をしています';
  const status = failed ? 'failed' : ready ? 'awaiting_confirmation' : completed ? 'completed' : discarded ? 'discarded' : 'processing';
  $('importStatus').hidden = false;
  $('importStatus').dataset.status = status;
  $('importStatusSummary').textContent = label;
  $('importStatusButton').hidden = completed || discarded;
  $('importStatusButton').textContent = ready ? '変換結果を確認する' : failed ? '詳しく見る・再試行' : '進行状況を見る';
  $('importProgress').dataset.status = status;
  $('importHeading').textContent = failed ? '資料の読み込みに失敗しました' : '新しい資料を読み込み中';
  $('importStage').textContent = label;
  const total = phase.total;
  const count = Number.isInteger(phase.completed) ? phase.completed : 0;
  if (total > 0) { $('importProgressBar').max = total; $('importProgressBar').value = count; }
  else $('importProgressBar').removeAttribute('value');
  $('importProgressBar').hidden = failed;
  $('importCount').textContent = total > 0 ? `${count} / ${total} ページ` : '資料のサイズや内容によって時間が変わります';
  updateImportElapsed();
  $('importHint').textContent = failed ? phase.error || importState.error : ['loading_engine','initializing_engine'].includes(phase.stage) ? '初回は表示エンジンの準備に時間がかかります。資料はこのPC内で処理します。「現在の資料に戻る」で閉じても処理は続きます。' : phase.stage === 'preview' ? '画像を準備しています。完了後、変換結果を確認してから資料を切り替えます。' : '準備中も現在の資料を使えます。「現在の資料に戻る」で閉じても、処理は続きます。';
  $('importCancel').hidden = !activeImportController || importState.status !== 'processing';
  $('importCancel').disabled = Boolean(activeImportController?.signal.aborted);
  $('importRetry').hidden = !failed;
  $('importRetry').textContent = retryAction === 'file' ? '別の資料を選ぶ' : retryAction === 'image' ? 'スライドを再表示' : 'プレビューを再読込';
  $('importHide').textContent = failed ? '閉じる' : '現在の資料に戻る';
}
function updateImportElapsed() {
  if (!importState || remoteRole) return;
  const end = importState.status === 'processing' || ['preview','applying'].includes(localProgress?.stage) ? Date.now() : importState.updatedAt || Date.now();
  const sec = Math.max(0, Math.floor((end - importState.startedAt) / 1000));
  $('importElapsed').textContent = `経過 ${String(Math.floor(sec / 60)).padStart(2,'0')}:${String(sec % 60).padStart(2,'0')}`;
}
setInterval(updateImportElapsed, 1000);
function syncImportProgress(progress) {
  if (remoteRole || !progress || (activeUploadId && progress.id !== activeUploadId)) return;
  const fresh = importState?.id !== progress.id;
  if (fresh) {
    closePreview(); localProgress = null; recoveredImportId = null;
    importDismissed = false; importDisplayed = false; retryAction = 'file';
  }
  importState = progress;
  if (localProgress?.error && retryAction === 'file' && progress.status !== 'failed') localProgress = null;
  if (progress.status === 'processing') {
    loading = true;
    if (!importDismissed && (fresh || !document.querySelector('dialog[open]'))) showDialog($('importProgress'));
  } else if (!activeUploadId && !previewBusy && !recoveringPreview && !finalizingImage) {
    if (progress.status === 'awaiting_confirmation' && !preview && recoveredImportId !== progress.id) {
      recoveredImportId = progress.id; void recoverPreview();
    } else if (progress.status === 'completed' && !importDisplayed && !localProgress?.error) {
      void finishImport();
    } else if (progress.status === 'failed' || progress.status === 'discarded') {
      loading = false;
      if (progress.status === 'discarded') { closePreview(); closeDialog($('importProgress')); }
      else { closePreview(); if (!importDismissed) showDialog($('importProgress')); }
    }
  }
  updateImportView(); setConnected(connected);
}
function failImport(message, action = 'file') {
  if (sessionEnded) return;
  localProgress = {stage:'failed', error:message}; retryAction = action;
  loading = false; previewBusy = false;
  if (!importDismissed) showDialog($('importProgress'));
  updateImportView(); setConnected(connected);
}
async function retryImport() {
  if (loading) return;
  localProgress = null; importDismissed = false;
  if (retryAction === 'image') { await finishImport(); return; }
  if (retryAction === 'preview') { if (preview) await openPreview(preview); else await recoverPreview(); return; }
  hideImportProgress(); $('filePicker').click();
}
async function recoverPreview() {
  if (recoveringPreview) return;
  recoveringPreview = true; loading = true; setConnected(connected);
  if (!importDismissed) showDialog($('importProgress'));
  try {
    const data = await readData('/api/info');
    if (data.state.import?.id !== importState.id) { applySnapshot(data.state); return; }
    if (data.preview) await openPreview(data.preview);
    else throw new Error('確認待ちの資料がありません。資料を選び直してください。');
  } catch (error) { failImport(error.message, 'preview'); }
  finally { recoveringPreview = false; if (!localProgress?.error) syncImportProgress(snapshot?.import); }
}
async function processFile(file) {
  if (remoteRole) return;
  if (loading) { openImportStatus(); return; }
  if (!connected) { showToast('接続が戻ってから資料を選んでください。'); return; }
  if (!/\.(pdf|pptx|ppt)$/i.test(file.name)) { showToast('PDF・PPTX・PPTの資料を選んでください。'); return; }
  if (file.size > 25 * 1024 * 1024) { showToast('25 MiB以下の資料を選んでください。'); return; }
  const controller = new AbortController();activeImportController = controller;
  closePreview(); hideDropZone(); hideFullscreenHud();
  activeUploadId = [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2,'0')).join('');
  importState = { id:activeUploadId, status:'processing', stage:'receiving', completed:0, total:null, startedAt:Date.now() };
  localProgress = null; importDismissed = false; importDisplayed = false; retryAction = 'file';
  loading = true; setConnected(connected); updateImportView(); showDialog($('importProgress'));
  try {
    const data = await readData(`/api/upload?filename=${encodeURIComponent(file.name)}`, { method:'POST', headers:{'X-AirPresenter-Import':activeUploadId}, body:file, signal:controller.signal }, 'json', /\.pdf$/i.test(file.name) ? 125000 : 450000);
    if (data.state) applySnapshot(data.state);
    if (data.preview) await openPreview(data.preview);
    else await finishImport();
  } catch (error) {
    if (sessionEnded) return;
    if (error.name === 'AbortError') {
      loading=false;localProgress=null;importDismissed=true;closePreview();closeDialog($('importProgress'));
      showToast('読み込みを取り消しました。現在の資料を続けられます。');return;
    }
    // The upload response may be lost after the server has already finished it.
    let data;
    try {
      data = await readData('/api/info');
      if (data.state.import?.id === activeUploadId) applySnapshot(data.state);
    } catch { /* The matching SSE snapshot can resolve a lost HTTP response too. */ }
    const progress = snapshot?.import;
    if (progress?.id !== activeUploadId) failImport(error.message);
    else if (progress.status === 'completed') await finishImport();
    else if (progress.status === 'awaiting_confirmation' && data?.state.import?.id === activeUploadId && data.preview) await openPreview(data.preview);
    else if (progress.status === 'processing' || progress.status === 'awaiting_confirmation') localProgress = null;
    else failImport(progress.error || error.message);
  }
  finally {
    if (activeImportController === controller) activeImportController = null;
    activeUploadId = null;
    if (!localProgress?.error && !finalizingImage) loading = false;
    if (!localProgress?.error) syncImportProgress(snapshot?.import);
    if(!sessionEnded){setConnected(connected);updateImportView();}
  }
}
async function openPreview(candidate) {
  closePreview(); preview = candidate; previewReady = false;
  loading = true; localProgress = {stage:'preview', completed:0, total:candidate.total};
  if (!importDismissed) showDialog($('importProgress'));
  setConnected(connected); updateImportView();
  const images = candidate.slides.map((resource, index) => {
    const figure = document.createElement('figure'); const img = document.createElement('img'); const caption = document.createElement('figcaption');
    caption.textContent = `ページ ${index + 1}`; img.alt = `資料プレビュー ${index + 1}`; img.loading = index < 2 ? 'eager' : 'lazy';
    img.addEventListener('error', () => {
      if (preview !== candidate) return;
      previewReady = false; $('previewStatus').textContent = '画像を表示できませんでした。取消して資料を選び直してください。'; setConnected(connected);
    });
    figure.append(img, caption); $('previewPages').append(figure);
    return {resource,img};
  });
  let next = 0;
  let failed = false;
  await Promise.all(Array.from({length:Math.min(4,images.length)}, async () => {
    while (next < images.length && preview === candidate) {
      const index = next++; const {resource,img} = images[index];
      try {
        const url = URL.createObjectURL(await readData(resource, {}, 'blob'));
        if (preview !== candidate) { URL.revokeObjectURL(url); return; }
        previewBlobs.push(url); img.src = url;
        if (index < 2) await img.decode();
        if (localProgress?.stage === 'preview') { localProgress.completed++; updateImportView(); }
      } catch { failed = true; }
    }
  }));
  if (preview !== candidate) return;
  loading = false;
  if (failed) { failImport('プレビュー画像を取得できませんでした。接続を確認して再読込してください。', 'preview'); return; }
  previewReady = true; localProgress = null;
  $('previewStatus').textContent = `全${candidate.total}ページの準備ができました。下の「この資料で発表する」で切り替わります。`;
  closeDialog($('importProgress'));
  if (!importDismissed) showDialog($('conversionPreview'));
  updateImportView(); setConnected(connected);
}
function closePreview() {
  preview = null; previewReady = false; closeDialog($('conversionPreview'));
  for (const blob of previewBlobs) URL.revokeObjectURL(blob);
  previewBlobs = []; $('previewPages').replaceChildren();
}
async function finishImport() {
  if (finalizingImage) return;
  finalizingImage = true; loading = true;
  localProgress = {stage:'applying', completed:0, total:null};
  updateImportView(); setConnected(connected);
  try {
    // Navigation can continue while importing; finish against the latest displayed page.
    let displayed;
    do { displayed = snapshot.slides[snapshot.current] || ''; }
    while (!await loadCurrentImage(displayed) && displayed !== (snapshot.slides[snapshot.current] || ''));
    if (imagePath !== (snapshot.slides[snapshot.current] || '') || !await imageLoad) throw new Error('資料は切り替わりましたが、画像を表示できません。接続を確認して「スライドを再表示」を押してください。');
    importDisplayed = true; localProgress = null;
    closePreview(); closeDialog($('importProgress')); hideDropZone(); hideFullscreenHud();
  } catch (error) { closePreview(); failImport(error.message, 'image'); }
  finally { finalizingImage = false; loading = false; previewBusy = false; updateImportView(); setConnected(connected); }
}
async function acceptPreview() {
  if (!preview || !previewReady || previewBusy) return;
  previewBusy = true; loading = true; setConnected(connected);
  $('previewStatus').textContent = '新しい資料に切り替えています…';
  try {
    const data = await readData('/api/accept', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:preview.id}) });
    applySnapshot(data.state); await finishImport();
  } catch (error) { await reconcilePreviewAction(error); }
}
async function reconcilePreviewAction(error) {
  let data;
  try {
    data = await readData('/api/info');
    applySnapshot(data.state);
  } catch { /* A delivered SSE snapshot can still resolve a lost command response. */ }
  previewBusy = false; loading = false;
  if (snapshot?.import?.status === 'completed') { await finishImport(); return; }
  if (snapshot?.import?.status === 'discarded') {
    closePreview(); closeDialog($('importProgress')); localProgress = null;
  } else if (data && data.preview?.id !== preview?.id) {
    closePreview(); recoveredImportId = null; syncImportProgress(snapshot?.import);
  } else {
    $('previewStatus').textContent = error.message;
    syncImportProgress(snapshot?.import);
  }
  updateImportView(); setConnected(connected);
}
async function discardPreview() {
  if (!preview || previewBusy) return;
  previewBusy = true; loading = true; setConnected(connected);
  try {
    const data = await readData('/api/discard', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:preview.id}) });
    closePreview(); closeDialog($('importProgress')); localProgress = null;
    if (data.state) applySnapshot(data.state);
  } catch (error) { await reconcilePreviewAction(error); }
  finally { previewBusy = false; if (!finalizingImage && snapshot?.import?.status !== 'processing') loading = false; updateImportView(); setConnected(connected); hideFullscreenHud(); }
}
$('conversionPreview').addEventListener('cancel', event => { event.preventDefault(); void discardPreview(); });
function sendPointer() {
  if (laserHeld) void sendCommand({ type:'LASER', active:true, ...pointerPosition });
}
$('laserBtn').addEventListener('pointerdown', event => {
  event.preventDefault(); if (!canOperate()) return;
  laserHeld = true; pointerOrigin = { x:event.clientX, y:event.clientY }; pointerPosition = { x:50, y:50 }; gyroOrigin = null;
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Synthetic or unsupported pointer capture. */ }
  sendPointer(); clearInterval(laserInterval); laserInterval = setInterval(sendPointer, 500);
});
$('laserBtn').addEventListener('pointermove', event => {
  if (!laserHeld || !pointerOrigin || gyroEnabled) return;
  pointerPosition = { x:Math.max(0,Math.min(100,50 + (event.clientX - pointerOrigin.x) / innerWidth * 160)), y:Math.max(0,Math.min(100,50 + (event.clientY - pointerOrigin.y) / innerHeight * 160)) };
  if (performance.now() - pointerSentAt > 60) { pointerSentAt = performance.now(); sendPointer(); }
});
function releasePointer() {
  if (!laserHeld) return;
  laserHeld = false; clearInterval(laserInterval); pointerOrigin = null;
  void sendCommand({ type:'LASER', active:false, x:pointerPosition.x, y:pointerPosition.y });
}
for (const event of ['pointerup','pointercancel','lostpointercapture']) $('laserBtn').addEventListener(event, releasePointer);
window.addEventListener('blur', releasePointer);
window.addEventListener('offline', () => { releasePointer(); disconnect('オフラインです。ネット接続を確認してください。'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) releasePointer(); });
async function enableGyro() {
  if (!isSecureContext || !window.DeviceOrientationEvent) { $('pointerHint').textContent = 'この環境では傾き操作は使えません。長押し＋指の移動で操作できます。'; return; }
  try {
    if (typeof DeviceOrientationEvent.requestPermission === 'function' && await DeviceOrientationEvent.requestPermission() !== 'granted') throw new Error('denied');
    gyroEnabled = !gyroEnabled; gyroOrigin = null;
    $('gyroEnable').textContent = gyroEnabled ? '指の移動に戻す' : '傾き操作を有効にする';
    $('pointerHint').textContent = gyroEnabled ? '長押ししてからスマホを傾けます。反応しない場合は「指の移動に戻す」。' : 'ポインターは長押ししたまま指を動かします。';
  } catch { gyroEnabled = false; $('pointerHint').textContent = '傾き操作は許可されませんでした。指の移動で操作できます。'; }
}
window.addEventListener('deviceorientation', event => {
  if (!gyroEnabled || !laserHeld || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
  if (!gyroOrigin) gyroOrigin = { beta:event.beta, gamma:event.gamma };
  pointerPosition = { x:Math.max(0,Math.min(100,50+(event.gamma-gyroOrigin.gamma)*2)), y:Math.max(0,Math.min(100,50+(event.beta-gyroOrigin.beta)*2)) };
  if (performance.now() - pointerSentAt > 60) { pointerSentAt = performance.now(); sendPointer(); }
});
function clearSessionView(message = '接続を終了しました。PCで新しく始めてください。') {
  sessionEnded = true;activeImportController?.abort();activeImportController=null;localFontModule?.resetLocalFonts();localFontsEnabled=false; connectionEpoch++; laserHeld = false; clearInterval(laserInterval);
  imageVersion++; imagePath = null;
  if (imageBlob) URL.revokeObjectURL(imageBlob);
  imageBlob = ''; noteDrafts.clear(); noteDirty = false; notePage = -1;
  loading = false; previewBusy = false; activeUploadId = null; localProgress = null; importState = null;
  remoteUrl = ''; session = null; delete $('qrBadge').dataset.remoteUrl; $('qrImg').removeAttribute('src');
  closePreview(); closeDialog($('importProgress')); hideDropZone(); hideFullscreenHud();
  snapshot = null;
  for (const id of ['slideImgView','remoteSlideThumb']) { $(id).hidden = true; $(id).removeAttribute('src'); }
  $('noteEditor').value = ''; $('speakerNote').textContent = message;
  $('slideHeading').textContent = '接続を終了しました'; $('slideSubheading').textContent = '新しい発表を始めるには、ページを開き直してください。';
  $('slideBullets').replaceChildren(); $('slideCard').style.display = 'flex';
  $('blackoutOverlay').classList.remove('active'); $('laserDot').classList.remove('active');
  for (const id of ['footerCounter','remoteSlide','slideCounterBottom','hudSlideCounter']) $(id).textContent = '—';
  for (const id of ['remoteTimer','footerTimer','hudTimer']) $(id).textContent = '00:00';
  document.body.classList.remove('in-fullscreen');
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  $('qrBadge').hidden = true; $('restartSession').hidden = remoteRole;
  setConnected(false, message);
}
async function endSession() {
  if (!browserApi || sessionEnded) return;
  clearSessionView();
  try { await browserApi.close(); } catch { showToast('この端末の接続を閉じました。'); }
}
function cancelImport() {activeImportController?.abort();}
async function toggleLocalFonts() {
  if (sessionEnded || remoteRole || loading || fontPermissionPending || !localFontModule) return;
  if (localFontsEnabled) {
    localFontModule.resetLocalFonts();localFontsEnabled=false;
    $('localFontStatus').textContent='次に選ぶ資料では標準の日本語フォントを使います。';
  } else {
    fontPermissionPending=true;setConnected(connected);
    try {
      const count=await localFontModule.enableLocalFonts();
      if(sessionEnded){localFontModule.resetLocalFonts();return;}
      localFontsEnabled=count>0;
      $('localFontStatus').textContent=count>0?'次に選ぶ資料から、このPCの書体も使います。':'対象の書体がありません。標準の日本語フォントを使います。';
    } catch {
      localFontModule.resetLocalFonts();localFontsEnabled=false;
      $('localFontStatus').textContent='標準の日本語フォントで続けられます。PCの書体を使う場合は、ブラウザーでアクセスを許可してください。';
    } finally {fontPermissionPending=false;if(!sessionEnded)setConnected(connected);}
  }
  $('localFontsButton').setAttribute('aria-pressed',String(localFontsEnabled));
  $('localFontsButton').textContent=localFontsEnabled?'標準フォントに戻す':'PCのフォントを使う';
}
function chooseFile() { $('filePicker').click(); }
function restartSession() { location.reload(); }
const uiActions = {cancelImport,toggleLocalFonts,setMode,toggleFullscreen,execPrev,execNext,execToggleBlackout,showDropZone,hideDropZone,copyRemoteUrl,chooseFile,openImportStatus,saveNote,onRemotePrev,onRemoteNext,onRemoteBlackout,onRemoteFullscreen,toggleTimer,resetTimer,enableGyro,retryImport,hideImportProgress,chooseAnotherFile,discardPreview,acceptPreview,endSession,restartSession};
document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target || !uiActions[target.dataset.action]) return;
  const value = target.dataset.value;
  void uiActions[target.dataset.action](value === 'event' ? event : value === 'true' ? true : value);
});
$('filePicker').addEventListener('change', onFilePicked);
window.addEventListener('beforeunload', event => {
  if (!sessionEnded && snapshot?.slides.some(Boolean)) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', () => { if (browserApi && !sessionEnded) void Promise.resolve(browserApi.close()).catch(() => {}); });
async function boot() {
  if (location.hostname === 'hundred-days.pages.dev') {
    const target = new URL('https://rairakku.com/100days/day-084-airpresenter/');
    target.search = location.search; target.hash = location.hash; location.replace(target.href); return;
  }
  setMode(currentMode); setConnected(false, '接続準備中…');
  $('hostTools').hidden = remoteRole; $('qrBadge').hidden = true;
  $('hostTools').prepend($('qrBadge'));
  try {
    const {createBrowserApi} = await import('./browser-api.js');
    localFontModule = await import('./local-fonts.js');
    $('localFontsButton').hidden = remoteRole || !localFontModule.supportsLocalFonts();
    browserApi = await createBrowserApi({
      onSnapshot(state) { if (!sessionEnded && state) applySnapshot(state); },
      onConnection(value, message) {
        if (sessionEnded) return;
        if (!value && /終了|期限|無効|別の端末/.test(message || '')) clearSessionView(message);
        else setConnected(value, message);
      },
      onError(message) { if (!sessionEnded) showToast(typeof message === 'string' ? message : '通信を確認してください。'); }
    });
    session = browserApi.session; remoteUrl = browserApi.remoteUrl || '';
    if (!remoteRole && !sessionEnded) {
      $('qrBadge').hidden = false; $('qrBadge').dataset.remoteUrl = remoteUrl;
      $('remoteUrlDisplay').textContent = 'スマホでQRを読み取る・クリックでリンクをコピー';
      $('qrImg').src = browserApi.qrUrl;
    }
    $('roomCodeText').textContent = session.room.slice(0,8).toUpperCase();
  } catch {
    if (sessionEnded) return;
    disconnect('接続を準備できませんでした。ネット接続を確認し、PCで新しく始めてください。');
    $('restartSession').hidden = remoteRole;
    $('restartSession').textContent = '接続をやり直す';
  }
}
void boot();
