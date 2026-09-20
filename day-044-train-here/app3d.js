import { createCityScene } from './lib/scene.js';
import { RAILWAYS, RAILWAY_BY_ID, VIEWS } from './lib/railways.js';
import { sceneDemoTrains } from './lib/motion.js';

const $ = id => document.getElementById(id);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 680px)');
// 公開版は架空デモ専用。APIキーの有無にかかわらず実データを要求しない。
const state = { active: new Set(RAILWAYS.map(r => r.id)), trains: [], selected: null, camera: 'free', view: 'city', paused: reducedMotion.matches, speed: 1, time: 0, labels: true, failed: false };
let pickerKey = '', pickerSelection = null, previousFrame = 0, previousUI = 0;

function fail(message) { state.failed = true; $('loading-screen').hidden = true; $('fatal-screen').hidden = false; $('fatal-message').textContent = message; }
const world = createCityScene({ canvas: $('scene-canvas'), labels: $('city-labels'), onSelect: selectTrain, onCameraMode: mode => { state.camera = mode; if (mode !== 'free') state.view = null; cameraUI(); }, onFailure: fail });
$('loading-screen').hidden = true; $('mode-button').disabled = false;
$('routes-panel').open = !mobile.matches;
for (const railway of RAILWAYS) {
  const button = document.createElement('button'); button.className = 'route-toggle'; button.type = 'button'; button.dataset.route = railway.id; button.setAttribute('aria-pressed', 'true'); button.style.setProperty('--route-color', railway.color);
  const swatch = document.createElement('span'); swatch.className = 'route-swatch'; swatch.textContent = railway.code;
  const name = document.createElement('span'); name.className = 'route-name'; const strong = document.createElement('strong'); strong.textContent = railway.name; const small = document.createElement('small'); small.textContent = railway.span; name.append(strong, small);
  const check = document.createElement('span'); check.className = 'route-check'; check.textContent = '✓'; check.setAttribute('aria-hidden', 'true'); button.append(swatch, name, check);
  button.addEventListener('click', () => {
    state.active.has(railway.id) ? state.active.delete(railway.id) : state.active.add(railway.id);
    button.setAttribute('aria-pressed', String(state.active.has(railway.id))); world.routes(state.active);
    if (state.selected && !visibleTrains().some(t => t.id === state.selected)) clearSelection();
    refreshTrains(); renderUI();
  });
  $('route-toggles').append(button);
}
for (const preset of VIEWS) {
  const button = document.createElement('button'); button.type = 'button'; button.dataset.view = preset.id; button.textContent = preset.label;
  button.setAttribute('aria-pressed', String(preset.id === 'city'));
  button.addEventListener('click', () => { state.view = preset.id; world.view(preset.id, reducedMotion.matches); state.camera = 'free'; cameraUI(); });
  $('view-presets').append(button);
}
$('mode-button').addEventListener('click', () => { clearSelection(); state.time = 0; state.paused = reducedMotion.matches; refreshTrains(); renderUI(); });
$('play-pause').addEventListener('click', () => { state.paused = !state.paused; renderUI(); });
document.querySelectorAll('[data-speed]').forEach(button => button.addEventListener('click', () => { state.speed = Number(button.dataset.speed); renderUI(); }));
$('train-picker').addEventListener('change', event => event.target.value ? selectTrain(event.target.value) : clearSelection());
$('next-train').addEventListener('click', () => {
  const trains = visibleTrains();
  if (trains.length) selectTrain(trains[(trains.findIndex(t => t.id === state.selected) + 1) % trains.length].id);
});
$('follow-train').addEventListener('click', () => { state.camera === 'follow' ? world.stopFollowing() : world.follow('follow'); cameraUI(); });
$('ride-train').addEventListener('click', () => { state.camera === 'ride' ? world.stopFollowing() : world.follow('ride'); cameraUI(); });
$('clear-selection').addEventListener('click', clearSelection);
$('reset-camera').addEventListener('click', () => { state.view = 'city'; world.view('city', reducedMotion.matches); state.camera = 'free'; cameraUI(); });
$('zoom-in').addEventListener('click', () => { state.view = null; world.zoom(1); cameraUI(); });
$('zoom-out').addEventListener('click', () => { state.view = null; world.zoom(-1); cameraUI(); });
$('rotate-left').addEventListener('click', () => { state.view = null; world.rotate(.35); cameraUI(); });
$('toggle-labels').addEventListener('click', () => { state.labels = !state.labels; world.labels(state.labels); $('toggle-labels').setAttribute('aria-pressed', String(state.labels)); });
$('info-button').addEventListener('click', () => $('info-dialog').showModal());
$('share-button').addEventListener('click', () => { $('info-dialog').showModal(); $('share').scrollIntoView({ block: 'center' }); });
$('share-button').disabled = false;
$('close-info').addEventListener('click', () => $('info-dialog').close());
$('info-dialog').addEventListener('click', event => { if (event.target === $('info-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });
reducedMotion.addEventListener('change', event => { if (event.matches) { state.paused = true; renderUI(); } });

function visibleTrains() { return state.trains.filter(t => state.active.has(t.railway)); }
function refreshTrains() {
  state.trains = sceneDemoTrains(state.time);
  if (state.selected && !visibleTrains().some(t => t.id === state.selected)) clearSelection();
  world.drawTrains(state.trains);
}
function selectTrain(id) {
  if (!visibleTrains().some(t => t.id === id)) return;
  state.selected = id; state.view = null; world.select(id); world.follow('follow');
  if (mobile.matches) $('routes-panel').open = false;
  renderUI();
}
function clearSelection() { state.selected = null; world.select(null); world.stopFollowing(); renderUI(); }
function cameraUI() {
  $('follow-train').setAttribute('aria-pressed', String(state.camera === 'follow'));
  $('follow-train').textContent = state.camera === 'follow' ? '追跡をやめる' : '電車を追いかける ↗';
  $('ride-train').setAttribute('aria-pressed', String(state.camera === 'ride'));
  $('camera-caption').textContent = state.camera === 'follow' ? '電車にカメラが追従しています · ドラッグで解除' : state.camera === 'ride' ? '前方の風景 · ドラッグで解除' : 'ドラッグで回転 · スクロールで拡大';
  document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(state.view === b.dataset.view && state.camera === 'free')));
}
function renderUI() {
  const visible = visibleTrains();
  $('data-status').dataset.state = 'demo'; $('mode-label').textContent = '3Dデモ · 架空の運行';
  $('mode-button').textContent = 'デモを最初から ↗';
  $('scene-mode').textContent = 'DEMO · 架空の運行';
  $('scene-mode').classList.add('demo'); $('demo-disclaimer').hidden = false; $('playback').hidden = false;
  $('play-pause').setAttribute('aria-label', state.paused ? '架空デモを再生' : '架空デモを一時停止'); $('play-pause').setAttribute('aria-pressed', String(state.paused)); $('play-symbol').textContent = state.paused ? '▶' : 'Ⅱ';
  document.querySelectorAll('[data-speed]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === state.speed)));
  const seconds = Math.floor(state.time); $('demo-clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('visible-count').textContent = String(visible.length); $('route-total').textContent = `${state.active.size} ROUTES`; $('empty-routes').hidden = state.active.size > 0;
  const key = visible.map(t => t.id).join(',');
  if (pickerKey !== key) {
    const first = document.createElement('option'); first.value = ''; first.textContent = visible.length ? '電車を選択…' : '表示する路線を選んでください';
    $('train-picker').replaceChildren(first, ...visible.map(train => { const option = document.createElement('option'); option.value = train.id; option.textContent = `${RAILWAY_BY_ID.get(train.railway).name} · ${train.number}`; return option; }));
    pickerKey = key; pickerSelection = null;
  }
  $('train-picker').disabled = !visible.length;
  $('next-train').disabled = !visible.length;
  const selectedValue = state.selected || '';
  if (pickerSelection !== selectedValue) { $('train-picker').value = selectedValue; pickerSelection = selectedValue; }
  const selected = visible.find(t => t.id === state.selected);
  $('train-detail').hidden = !selected; $('viewer').classList.toggle('has-selection', !!selected);
  if (selected) {
    const route = RAILWAY_BY_ID.get(selected.railway); $('selected-color').style.background = route.color;
    $('detail-kind').textContent = 'DEMO TRAIN · 架空の列車';
    $('detail-title').textContent = `${route.name} · ${selected.number}`;
    $('detail-location').textContent = selected.to ? `${selected.from} → ${selected.to}` : `${selected.from}駅付近`;
    $('detail-note').textContent = '4両に簡略化したモデル · 実際の編成・ダイヤではありません';
  }
  cameraUI();
}
function animate(timestamp) {
  requestAnimationFrame(animate);
  if (document.hidden || state.failed) { previousFrame = timestamp; return; }
  if (timestamp - previousFrame < 30) return;
  const delta = Math.min(.1, Math.max(0, (timestamp - previousFrame) / 1000)); previousFrame = timestamp;
  if (!state.paused) state.time += delta * state.speed;
  refreshTrains(); world.render(delta, timestamp);
  if (timestamp - previousUI > 450) { renderUI(); previousUI = timestamp; }
}
document.addEventListener('visibilitychange', () => { previousFrame = performance.now(); if (!document.hidden) { refreshTrains(); renderUI(); } });
refreshTrains(); renderUI(); requestAnimationFrame(animate);
