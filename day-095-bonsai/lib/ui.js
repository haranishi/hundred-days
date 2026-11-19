import { LORE } from './lore.js';
import { connectPhoto } from './ui-photo.js';
import { SPECIES_NAMES } from './app-state.js';

const TOOL_NAMES = { look: '見る', cut: '切る', bend: '曲げる', pinch: '芽摘み', water: '水' };
const TOOL_GUIDES = {
  cut: '枝をおさえると切る範囲が色づき、離すと切ります。',
  bend: '枝をおさえたまま動かすと、先が曲がります。',
  pinch: '枝先をおさえて指を離すと、芽を摘みます。',
  water: '鉢や木をおさえると、水をやります。',
};
const nameTool = (id) => TOOL_NAMES[id];

function renderLore(host) {
  const paragraph = (text) => {
    const element = document.createElement('p');
    element.textContent = text;
    return element;
  };
  const list = document.createElement('ul');
  for (const text of [...Object.values(LORE.species), LORE.wire]) {
    const item = document.createElement('li');
    item.textContent = text;
    list.append(item);
  }
  host.append(paragraph(LORE.intro), list, paragraph(LORE.timing));
}

export function connectUI(handlers) {
  const byId = (id) => document.getElementById(id);
  const app = byId('app');
  const stage = byId('stage');
  let canvas = byId('view');
  const menu = byId('menu');
  const photo = byId('photo');
  const share = byId('share-dialog');
  const reset = byId('reset-dialog');
  const dialogs = [menu, photo, share, reset];
  const assist = byId('assist');
  const assistOpen = byId('assist-open');
  const fallback = byId('fallback');
  const loading = byId('loading');
  const live = byId('live');
  const date = byId('date-label');
  const undo = byId('undo');
  const redo = byId('redo');
  const cameraReset = byId('camera-reset');
  const tips = byId('tips');
  const notice = byId('notice');
  const noticeText = byId('notice-text');
  const noticeUndo = byId('notice-undo');
  const photoOpen = byId('photo-open');
  const fastStart = byId('fast-start');
  const fastStop = byId('fast-stop');
  const newTree = byId('new-tree');
  const newSpecies = byId('new-species');
  const newStyle = byId('new-style');
  const newPot = byId('new-pot');
  const light = byId('light');
  const sound = byId('sound');
  const tools = [...document.querySelectorAll('button[data-tool]')];
  const time = [...document.querySelectorAll('button[data-advance]')];
  const preparePhoto = connectPhoto(photo, byId);
  let noticeTimer = 0;
  let liveFrame = 0;
  let usable = false;

  renderLore(byId('fallback-lore'));
  renderLore(byId('about-lore'));

  function sync(state) {
    Object.assign(app.dataset, {
      species: state.species, tool: state.tool, season: state.season, day: String(state.day),
      branches: String(state.branches), gfx: state.gfx,
    });
    const speciesName = SPECIES_NAMES[state.species];
    date.textContent = `${speciesName}・${state.date}`;
    canvas.setAttribute('aria-label', `${speciesName}の盆栽。${state.seasonLabel}。枝は${state.branches}本`);
    for (const button of tools) {
      const id = button.dataset.tool;
      button.setAttribute('aria-pressed', String(id === state.tool));
      button.hidden = id === 'water' && !state.canWater;
      button.disabled = !usable;
    }
    undo.disabled = !usable || !state.canUndo;
    redo.disabled = !usable || !state.canRedo;
    for (const button of time) button.disabled = !usable;
  }

  function status(kind, reason = '') {
    usable = kind === 'ready';
    const failed = kind === 'failed';
    app.dataset.ready = document.body.dataset.ready = String(usable);
    loading.hidden = kind !== 'loading';
    fallback.hidden = !failed;
    canvas.hidden = failed;
    canvas.tabIndex = usable ? 0 : -1;
    photoOpen.disabled = fastStart.disabled = assistOpen.disabled = !usable;
    if (!usable) assist.hidden = true;
    syncCameraReset();
    if (failed) {
      byId('fallback-why').textContent = reason;
      announce(reason);
    }
  }

  function announce(message) {
    cancelAnimationFrame(liveFrame);
    live.textContent = '';
    liveFrame = requestAnimationFrame(() => { live.textContent = message; });
  }

  function hideNotice() {
    clearTimeout(noticeTimer);
    notice.hidden = true;
  }

  function expireNotice() {
    if (notice.matches(':hover, :focus-within')) noticeTimer = setTimeout(expireNotice, 1400);
    else hideNotice();
  }

  function showNotice(message, { undo: allowUndo = false, hint = false } = {}) {
    clearTimeout(noticeTimer);
    if (!allowUndo && document.activeElement === noticeUndo) canvas.focus({ preventScroll: true });
    noticeText.textContent = message;
    notice.dataset.guide = String(hint);
    noticeUndo.hidden = !allowUndo;
    notice.hidden = false;
    noticeTimer = setTimeout(expireNotice, 5300);
  }

  function notify(message, options) {
    if (!message) return;
    announce(message);
    showNotice(message, options);
  }

  function toolSelected(id, previous) {
    const guide = TOOL_GUIDES[id];
    if (id !== previous) {
      if (guide) showNotice(guide, { hint: true });
      else if (noticeText.textContent === TOOL_GUIDES[previous]) hideNotice();
    }
    announce(`道具「${nameTool(id)}」を選びました。${guide ?? ''}`);
  }

  function preferences(state) {
    newSpecies.value = state.species;
    newStyle.value = state.style;
    newPot.value = state.pot;
    light.value = state.light;
    sound.checked = !state.muted;
  }

  function click(id, fn) { byId(id).addEventListener('click', fn); }

  function modalOpen() { return dialogs.some((dialog) => dialog.open); }

  function syncCameraReset() {
    // メニューの上に確認が重なるため、開いている面をすべて確認する。
    cameraReset.hidden = !usable || modalOpen() || !tips.hidden || !assist.hidden;
  }

  function openDialog(dialog) {
    dialog.showModal();
    syncCameraReset();
  }

  function showPhoto(capture, details) {
    openDialog(photo);
    return preparePhoto(capture, details);
  }

  click('menu-open', () => {
    handlers.beforeDialog();
    preferences(handlers.state());
    openDialog(menu);
  });
  click('share-open', () => {
    handlers.beforeDialog();
    openDialog(share);
  });
  click('photo-open', handlers.photo);
  click('reset-open', () => openDialog(reset));
  click('reset-confirm', () => {
    if (!handlers.reset()) return;
    reset.close();
    menu.close();
  });

  for (const dialog of dialogs) {
    dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      syncCameraReset();
      handlers.afterDialog();
    });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const { top, right, bottom, left } = dialog.getBoundingClientRect();
      if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) dialog.close();
    });
  }

  // ボタンを押したあとフォーカスがボタンに残ると、数字・[ ]・Z・矢印のキー操作が効かなくなる。
  // マウス・指でのクリック（event.detail > 0）のときだけ、キャンバスへ戻す（キーボードで Enter を押した場合は動かさない）
  const refocus = (event) => { if (event.detail > 0 && !canvas.hidden) canvas.focus({ preventScroll: true }); };
  for (const button of tools) button.addEventListener('click', (event) => { handlers.tool(button.dataset.tool); refocus(event); });
  for (const button of time) button.addEventListener('click', (event) => { handlers.advance(button.dataset.advance); refocus(event); });
  byId('undo').addEventListener('click', (event) => { handlers.undo(); refocus(event); });
  byId('redo').addEventListener('click', (event) => { handlers.redo(); refocus(event); });
  click('notice-undo', handlers.undo);
  click('camera-reset', handlers.cameraReset);
  click('tips-close', handlers.dismissTips);
  click('retry-view', handlers.retry);
  click('fast-start', () => { menu.close(); handlers.fast(true); });
  click('fast-stop', () => handlers.fast(false));
  click('assist-open', () => {
    menu.close();
    assist.hidden = false;
    syncCameraReset();
    assist.querySelector('[data-assist-key]').focus({ preventScroll: true });
  });
  click('assist-close', () => {
    handlers.assist('Escape');
    assist.hidden = true;
    syncCameraReset();
    canvas.focus({ preventScroll: true });
    handlers.afterDialog();
  });
  for (const button of assist.querySelectorAll('[data-assist-key]')) {
    button.addEventListener('click', () => handlers.assist(button.dataset.assistKey));
  }

  newTree.addEventListener('submit', (event) => {
    event.preventDefault();
    if (handlers.newTree({ species: newSpecies.value, style: newStyle.value, pot: newPot.value })) menu.close();
  });
  light.addEventListener('change', () => handlers.light(light.value));
  sound.addEventListener('change', () => handlers.muted(!sound.checked));

  function resetCanvas() {
    const replacement = canvas.cloneNode(false);
    canvas.replaceWith(replacement);
    canvas = replacement;
  }

  function showTips(show) {
    if (!show && tips.contains(document.activeElement)) canvas.focus({ preventScroll: true });
    tips.hidden = !show;
    syncCameraReset();
  }

  function fastForward(active) {
    if (!active && document.activeElement === fastStop) canvas.focus({ preventScroll: true });
    for (const button of time) button.hidden = active;
    fastStop.hidden = !active;
    if (active) fastStop.focus({ preventScroll: true });
  }

  return {
    stage, get canvas() { return canvas; }, resetCanvas, status, sync, notify, announce, hideNotice, showPhoto, showTips, fastForward,
    get tipsVisible() { return !tips.hidden; },
    get modalOpen() { return modalOpen(); },
    get assistOpen() { return !assist.hidden; },
    nameTool, toolSelected,
  };
}
