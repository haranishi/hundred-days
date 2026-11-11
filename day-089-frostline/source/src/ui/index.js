import { createSummary } from './summary.js';
import { createMap } from './map.js';
import { createTitle } from './title.js';
import { createHud, createHudTracker } from './hud.js';
import { createPanels } from './panels.js';
import { createVista } from './vista.js';
/** DOM反映だけを担い、ゲームの動作はハンドラーへ渡す。 */
export function createUI({ root, settings, touch = false }) {
  const document = root.ownerDocument; let handlers = {}, stage = 'title', settingsFrom = 'title';
  const call = (action, ...args) => handlers[action]?.(...args);
  const layer = document.createElement('div'); layer.className = 'ui-layer'; layer.classList.toggle('touch-mode', touch);
  // 共有：ページにある共有の窓（index.html の dialog。中身は 100 日チャレンジの共通部品 shared/share.js が入れる）を開く
  const openShare = () => { const dialog = document.querySelector?.('[data-share-dialog]'); if (dialog && !dialog.open) dialog.showModal?.(); };
  const title = createTitle({ document, onStart: () => call('start'), onSettings: () => showSettings(), onShare: openShare, onMap: () => call('map'), onGear: gear => settings.set({ gear }) });
  const hud = createHud({ document, onRecover: () => call('safe'), onFinish: () => call('finish') }); const tracker = createHudTracker();
  const controls = document.createElement('section'); controls.className = 'controls'; controls.dataset.controls = '';
  controls.setAttribute('aria-label', '滑走の操作');
  controls.innerHTML = `<button class="camera panel" data-control="camera" aria-label="視点を切り替える（後ろから・自分の目）">視点を変える</button>
    <button class="map-toggle panel" data-action="map">山の地図</button>
    <button class="pause panel" data-control="pause" aria-label="一時停止する">一時停止</button>
    <div class="touch-only stick panel" data-control="steer" aria-label="左右の舵・上で低い姿勢・下で制動"><span>舵</span></div>
    <button class="touch-only brake panel" data-control="brake" aria-label="制動する">制動</button>
    <button class="touch-only jump panel" data-control="jump" aria-label="ジャンプする">ジャンプ</button>`;
  controls.querySelector('[data-action="map"]').addEventListener('click', () => call('map'));
  controls.classList.toggle('has-touch', touch);
  const panels = createPanels({ document, settings,
    onAction: action => (action === 'share' ? openShare() : call(action)),
    // 戻る：一時停止から開いたなら一時停止へ。題字の画面から開いたなら、開いたボタンへ焦点を戻す
    onBack() { if (settingsFrom === 'pause') panels.show('pause'); else { panels.hide(); title.element.inert = false; title.element.querySelector('[data-title-settings]')?.focus(); } },
  });
  function showSettings() { settingsFrom = stage; title.element.inert = true; panels.show('settings'); }
  const summary = createSummary({ document, onNext: id => call('next', id), onAgain: id => call('again', id), onMap: () => call('map'), onClose: () => call('closeSummary') });
  const map = createMap({ document, onStart: id => call('next', id), onClose: () => call('closeMap') });
  const vista = createVista({ document, onPrev: () => call('vistaStep', -1), onNext: () => call('vistaStep', 1), onClose: () => call('closeVista') });
  layer.append(title.element, hud.element, controls, panels.element, summary.element, map.element, vista.element); root.append(layer);
  // 滑っている間のボタンは、マウスや指で押した後に、焦点を残さない。残ると、空白キー（ジャンプ）が、そのボタンを押すキーになる
  // （キーボードで焦点を移して押したとき＝detail が 0 のときは、残す：次も同じボタンをキーで押せる）
  layer.addEventListener('click', e => { if (e.detail > 0) e.target?.closest?.('.controls button, .hud button')?.blur?.(); }, true);
  let loading = { progress: 0, ready: false }, device = touch ? 'touch' : 'keyboard';
  // 設定（道具など）が変わったら、題字の画面の選択の表示も合わせる
  const unsubscribeTitle = settings.subscribe(() => title.update({ ...loading, device, gear: settings.get().gear }));
  function show(next) {
    stage = next;
    title.element.hidden = next !== 'title'; hud.element.hidden = next !== 'ride'; controls.hidden = next !== 'ride';
    title.element.inert = false;
    if (next !== 'summary') summary.hide();
    if (next !== 'map') map.hide();
    if (next === 'pause') { settingsFrom = 'pause'; panels.show('pause'); } else panels.hide();
    if (next !== 'vista') vista.hide();
    if (next === 'summary') summary.show();
    if (next === 'map') map.show();
    if (next === 'vista') vista.show();
  }
  show('title'); title.update({ ...loading, device, gear: settings.get().gear });
  return {
    controls,
    setHandlers(value) { handlers = value; },
    show,
    setPlay(value, data) { summary.update(value.summary); map.update(data, { you: value.run?.previous }); panels.setCanFinish(value.canFinish); },
    showSettings,
    setVista(model) { vista.update(model); },
    setDevice(value) { device = value; title.update({ ...loading, device, gear: settings.get().gear }); },
    loading(value) { loading = { ...loading, ...value }; title.update({ ...loading, device, gear: settings.get().gear }); },
    update({ state, events, frameDt, input, device: nextDevice, play }) {
      if (play) panels.setCanFinish(play.canFinish);
      device = nextDevice ?? device; title.update({ ...loading, device, gear: settings.get().gear });
      hud.update(tracker.update({ state, events, dt: frameDt, input, hints: settings.get().hints, device, play, gear: state?.gear ?? settings.get().gear }));
    },
    reset() { tracker.reset(); },
    dispose() { unsubscribeTitle?.(); panels.dispose(); layer.remove(); },
  };
}
