import * as THREE from './vendor/three.js';
import { createView3D } from './lib/view3d.js';
import { createTree, restoreTree } from './lib/tree.js';
import { createHistory } from './lib/history.js';
import { DEFAULTS, LIGHT_IDS, TOOL_IDS } from './lib/contract.js';
import { createRng } from './lib/rng.js';
import { createActions } from './lib/app-actions.js';
import { calendarState, daysToAdvance, DEFAULT_SEED, launchOptions, SPECIES_NAMES } from './lib/app-state.js';
import { connectControls, keyCommand, orbitCamera, zoomCamera } from './lib/controls.js';
import { createToolMachine } from './lib/controls-tools.js';
import { connectUI } from './lib/ui.js';
import { createAudio } from './lib/audio.js';
import { createStore } from './lib/store.js';

const options = launchOptions(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const animate = () => !reduced.matches && options.gfx !== 'test';
const store = createStore({ enabled: !options.fresh, restoreTree });
const { status: saveStatus, save: saved } = store.read();
const history = createHistory();
const initialTree = saved && !options.directsTree ? saved.tree : createTree(options.seedling);
if (options.day > 0) initialTree.advance(options.day);

let pot = options.pot ?? saved?.pot ?? DEFAULTS.pot;
let light = options.light ?? saved?.light ?? DEFAULTS.light;
let muted = saved?.muted ?? false;
let tipsSeen = saved?.tipsSeen ?? false;
let rememberOpeningTips = !options.directsTree && !options.pot && !options.light;
// 「保存を消して最初から」の直後は、結果の通知を読めるよう、初回の案内カードを出さない（同じ位置で重なって読めなかった）
let skipTipsOnce = false;
let tool = options.tool === 'water' && typeof initialTree.water !== 'function' ? 'look' : options.tool;
let view = null;
let controls = null;
let ready = false;
let fastTimer = 0;
let inputGeneration = 0;

const audio = createAudio(muted);
const ui = connectUI({
  state, tool: setTool, advance: advanceStep,
  undo: () => restore('undo'), redo: () => restore('redo'),
  photo, cameraReset, dismissTips, beforeDialog, afterDialog: scheduleOrbit,
  reset, newTree, light: setLight, muted: setMuted, fast: fastForward, assist,
  retry: () => restartView(options.camera),
});
const actions = createActions({
  initialTree, history, animate, getView: () => view,
  canvasRect: () => ui.canvas.getBoundingClientRect(),
  notify: ui.notify, announce: ui.announce, play: audio.play, changed: changedTree,
});
const tools = createToolMachine(actions);
tools.setTool(tool);

function state() {
  const { species, style, seed, day, moisture } = actions.tree;
  const { label, season, seasonLabel } = calendarState(day);
  return {
    species, style, seed, day, moisture, season, seasonLabel, date: label, tool, pot, light, muted,
    branches: actions.branches, gfx: options.gfx, ready, canWater: typeof actions.tree.water === 'function',
    canUndo: history.canUndo, canRedo: history.canRedo,
  };
}

function save(writeOptions) { store.schedule({ tree: actions.tree, pot, light, muted, tipsSeen }, writeOptions); }

function changedTree() {
  ui.sync(state());
  save();
}

function dismissTips() {
  if (!ui.tipsVisible) return;
  ui.showTips(false);
  if (tipsSeen) return;
  tipsSeen = true;
  save();
}

function input(source) {
  inputGeneration += 1;
  stopFast();
  if (source !== 'key') actions.cancelKeyboardBend();
  // 指やマウスで盆栽に触れたら、鍵盤（[ ]）や補助パネルで選んだ枝の白い光は消す。消さないと、幹が光ったまま戻らない。
  // ボタンや鍵盤での道具・時間の操作では消さない（枝を選んでから道具を選ぶ順でも、道具を選んでから枝を選ぶ順でも使えるように）
  if (source === 'pointer') actions.clearSelection();
  dismissTips();
  scheduleOrbit();
}

function interrupt() {
  controls?.cancel();
  input('action');
}

function beforeDialog() {
  interrupt();
  stopOrbit();
  ui.hideNotice();
}

function setTool(id) {
  if (!TOOL_IDS.includes(id) || (id === 'water' && typeof actions.tree.water !== 'function')) return false;
  const previous = tool;
  interrupt();
  tools.setTool(id);
  tool = id;
  ui.sync(state());
  ui.toolSelected(id, previous);
  scheduleOrbit();
  return true;
}

function advance(days) {
  if (!ready) return null;
  interrupt();
  return actions.advance(days);
}

function advanceStep(step) { return advance(daysToAdvance(step, actions.tree.day)); }

function restore(direction) {
  if (!ready) return;
  interrupt();
  actions.restore(direction);
}

function cameraReset() {
  if (!ready) return;
  interrupt();
  view.camera.reset({ animate: animate() });
  ui.announce('視点を戻しました。');
}

function command({ type, value }) {
  switch (type) {
    case 'tool': setTool(value); break;
    case 'advance': advanceStep(value); break;
    case 'branch': actions.selectBranch(value); break;
    case 'apply':
      if (!tools.pruningBlocked) actions.applySelected(tool);
      break;
    case 'cancel':
      if (actions.cancelKeyboardBend()) ui.announce('曲げを取り消しました。');
      break;
    case 'arrow':
      if (!actions.keyboardArrow(tool, ...value)) orbitCamera(view.camera, value[0] * 18, value[1] * 18);
      break;
    case 'zoom':
      actions.cancelKeyboardBend();
      zoomCamera(view.camera, value);
      break;
    case 'reset': cameraReset(); break;
    case 'undo': case 'redo': restore(type); break;
  }
}

function assist(key) {
  if (!ready) return;
  controls?.cancel();
  input('key');
  const mapped = keyCommand({ key });
  if (mapped) command(mapped);
}

function photo() {
  if (!ready) return;
  beforeDialog();
  const current = view;
  const generation = inputGeneration;
  const { species, date, day } = state();
  const name = SPECIES_NAMES[species];
  ui.showPhoto(async () => {
    current.setHighlight(null);
    try {
      return await current.capturePhoto({ width: 1080, height: 1350, caption: { title: '盆栽日和', subtitle: `${name}・${date}` } });
    } finally {
      // 撮影を待っている間に始まった枝の候補を、以前の選択で消さない。
      if (current === view && generation === inputGeneration) actions.showSelection();
    }
  }, { name, date, day });
}

function setLight(id) {
  if (!LIGHT_IDS.includes(id) || light === id) return;
  light = id;
  view?.setLight(id);
  save();
}

function setMuted(value) {
  muted = value;
  audio.setMuted(muted);
  if (!muted) audio.unlock();
  save();
}

function stopFast() {
  if (!fastTimer) return false;
  clearInterval(fastTimer);
  fastTimer = 0;
  ui.fastForward(false);
  return true;
}

function fastForward(active) {
  if (!active) {
    if (stopFast()) ui.announce(`早送りを止めました。${calendarState(actions.tree.day).label}。`);
    scheduleOrbit();
    return;
  }
  if (!ready || fastTimer) return;
  interrupt();
  stopOrbit();
  ui.fastForward(true);
  ui.announce('早送りを始めました。');
  fastTimer = setInterval(() => {
    if (!actions.advance(daysToAdvance('week', actions.tree.day), { quiet: true })) stopFast();
  }, 600);
}

function workOnNewTree(seedling, initial) {
  let next;
  try {
    const seed = initial ? DEFAULT_SEED : createRng(actions.tree.seed).int(0, 0xffffffff);
    next = createTree({ species: seedling.species, style: seedling.style, seed });
  } catch {
    ui.notify('新しい苗を用意できませんでした。');
    return false;
  }
  interrupt();
  actions.replace(next);
  pot = seedling.pot;
  tool = 'look';
  tools.setTool(tool);
  let notice = `${SPECIES_NAMES[next.species]}の苗を始めました。`;
  if (initial) {
    const removed = store.clear();
    notice = removed || options.fresh ? '初めの盆栽に戻しました。' : '画面は最初の盆栽に戻りましたが、この端末の保存は消せませんでした';
    rememberOpeningTips = false;
    light = DEFAULTS.light;
    muted = tipsSeen = false;
    skipTipsOnce = true;
    audio.setMuted(false);
  } else {
    save({ replace: true });
  }
  restartView(null);
  ui.notify(notice);
  return true;
}

function newTree(seedling) { return workOnNewTree(seedling, false); }
function reset() { return workOnNewTree(DEFAULTS, true); }

function resize() {
  if (!view) return;
  tools.cancelPruning();
  const { width, height } = ui.stage.getBoundingClientRect();
  if (width > 0 && height > 0) view.resize(width, height, devicePixelRatio || 1);
}

function detachView() {
  ready = false;
  stopFast();
  stopOrbit();
  const previous = view;
  view = null;
  controls?.dispose();
  controls = null;
  actions.cancelKeyboardBend();
  try {
    previous?.dispose();
  } catch {
    // WebGLを失った端末でも、代わりの説明と再試行を出せるようにする。
  }
}

function fallback(reason) {
  detachView();
  ui.showTips(false);
  ui.hideNotice();
  ui.status('failed', reason);
  ui.sync(state());
}

function mountView(camera) {
  ui.status('loading');
  ui.sync(state());
  const canvas = ui.canvas;
  try {
    const current = createView3D(THREE, canvas, { gfx: options.gfx, reducedMotion: reduced.matches, seed: actions.tree.seed });
    view = current;
    resize();
    current.setPot(pot);
    current.setLight(light);
    actions.repaint();
    if (camera) current.camera.set(camera, { animate: false });
    controls = connectControls(canvas, { camera: current.camera, tools, reducedMotion: () => reduced.matches,
      resting: () => options.gfx === 'test', onCommand: command, onInput: input });
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      if (current === view) fallback('3D表示が中断されました。「もう一度」で作りかけの盆栽を表示できます。');
    }, { once: true });
    current.requestRender();
    // 描画側が要求したフレームを経てから、操作を開始できることを知らせる。
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (view !== current) return;
      ready = true;
      ui.status('ready');
      ui.sync(state());
      const showTips = options.tips && !tipsSeen && !skipTipsOnce;
      skipTipsOnce = false;
      ui.showTips(showTips);
      if (showTips && rememberOpeningTips) {
        tipsSeen = true;
        save();
      }
      rememberOpeningTips = false;
      scheduleOrbit();
    }));
  } catch {
    fallback('この端末では3D表示（WebGL 2）を始められませんでした。手入れの目安を下で読めます。');
  }
}

function restartView(camera) {
  detachView();
  ui.resetCanvas();
  mountView(camera);
}

// 再現用の画面と、枝をねらっている間は自動回転を止める。
const autoOrbit = !location.search;
let orbitTimer = 0;
let orbitFrame = 0;

function stopOrbit() {
  clearTimeout(orbitTimer);
  cancelAnimationFrame(orbitFrame);
}

function mayOrbit() {
  return autoOrbit && animate() && ready && !tools.contactCount && !fastTimer && !document.hidden
    && !ui.modalOpen && !ui.assistOpen && !ui.canvas.matches(':focus-visible') && tool === 'look';
}

function scheduleOrbit() {
  stopOrbit();
  if (!mayOrbit()) return;
  orbitTimer = setTimeout(() => {
    let previous = performance.now();
    function tick(now) {
      if (!mayOrbit()) return;
      const { az } = view.camera.get();
      view.camera.set({ az: ((az + Math.min(now - previous, 32) * 0.003 + 180) % 360) - 180 }, { animate: false });
      previous = now;
      orbitFrame = requestAnimationFrame(tick);
    }
    orbitFrame = requestAnimationFrame(tick);
  }, 6000);
}

function unlockSound(event) { if (event.isTrusted) audio.unlock(); }

document.addEventListener('pointerdown', (event) => {
  tools.contactDown(event.pointerId);
  unlockSound(event);
  stopOrbit();
}, true);
for (const type of ['pointerup', 'pointercancel']) {
  document.addEventListener(type, (event) => {
    tools.contactEnd(event.pointerId);
    if (type === 'pointerup') unlockSound(event);
    scheduleOrbit();
  }, true);
}
document.addEventListener('keydown', (event) => { unlockSound(event); scheduleOrbit(); }, true);
document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.repeat || ui.modalOpen || !ready || event.target.closest?.('input, select, textarea, [contenteditable]')) return;
  const mapped = keyCommand(event);
  if (mapped?.type !== 'undo' && mapped?.type !== 'redo') return;
  event.preventDefault();
  command(mapped);
});
document.addEventListener('click', unlockSound, true);
window.addEventListener('blur', () => {
  tools.resetContacts();
  controls?.cancel();
  actions.cancelKeyboardBend();
  stopOrbit();
});
window.addEventListener('focus', scheduleOrbit);
window.addEventListener('pagehide', store.flush);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    tools.resetContacts();
    controls?.cancel();
    actions.cancelKeyboardBend();
    stopFast();
    store.flush();
  }
  scheduleOrbit();
});

if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(ui.stage);
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
window.screen?.orientation?.addEventListener('change', resize);
reduced.addEventListener?.('change', () => { if (view) restartView(view.camera.get()); });

if (options.debug) {
  window.__bonsai = {
    get tree() { return actions.tree; }, get view() { return view; }, state, setTool, advance,
  };
}

mountView(options.camera);
if (saveStatus === 'unreadable') ui.notify('保存を読み取れないため、上書きを保留しています。');
