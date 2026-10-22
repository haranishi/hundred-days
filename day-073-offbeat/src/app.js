import { DJAudio } from './audio.js';
import { TRACKS, clamp, wrap } from './synthesis.js';
import { GameSession, MISSIONS, judgeTiming, readBest, saveBest } from './game.js';

export const audio = new DJAudio();
export const game = new GameSession();
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const formatScore = score => Math.floor(score).toString().padStart(6, '0');
const safeStorage = { getItem: key => window.localStorage.getItem(key), setItem: (key, value) => window.localStorage.setItem(key, value) };
let mode = 'free', best = readBest(safeStorage), initPromise, startingSet, lastStage = -1, renderedAt = 0;
let toastTimer, judgementTimer, transitionOrigin = null, resultShown = false;
let reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pointers = new Map(), keyScratches = new Map();

function knob(id, band, label, value = 0, min = -18, max = 8) {
  return `<label class="knob-control" title="${id.toUpperCase()} ${label} — 左右ドラッグ / 矢印キー。ダブルクリックでリセット"><span class="knob-ring"><span class="knob-dial" style="--rotation:${(value - min) / (max - min) * 270 - 135}deg"></span></span><input type="range" data-knob="${band}" data-deck="${id}" aria-label="デッキ${id.toUpperCase()} ${label}" min="${min}" max="${max}" step="${band === 'filter' ? '.01' : '1'}" value="${value}"><span class="knob-label">${label}</span></label>`;
}
function deckMarkup(id, track) {
  return `<article class="deck deck-${id}" data-id="${id}" aria-label="デッキ${id.toUpperCase()}">
    <div class="deck-heading"><span class="deck-badge">${id.toUpperCase()}</span><div class="track-info"><strong class="track-name">${track.title}</strong><span class="track-meta">${track.genre} <span>·</span> ${track.key} <span>·</span> ORIGINAL</span></div><div class="tempo-display"><strong data-bpm="${id}">${track.bpm.toFixed(1)}</strong><span>BPM</span></div></div>
    <div class="wave-screen"><canvas data-wave="${id}" aria-label="デッキ${id.toUpperCase()}の音声波形"></canvas><i class="wave-playhead"></i><span class="wave-overlay" data-time="${id}">00:00 / 4 BARS</span></div>
    <div class="deck-body"><div class="turntable"><div class="platter-shell"></div><button class="vinyl" data-vinyl="${id}" aria-label="デッキ${id.toUpperCase()}をスクラッチ。前後にドラッグ、または${id === 'a' ? 'S' : 'K'}キー"><span class="record-marker"></span><span class="record-label"><span class="label-top">ORIGINAL PRESSING</span><span class="label-wordmark">offbeat.</span><span class="label-bottom">SIDE ${id.toUpperCase()}<br>33⅓ RPM</span><span class="label-star">✳</span></span><span class="record-spindle"></span></button></div>
    <div class="tonearm" aria-hidden="true"><svg viewBox="0 0 70 184"><defs><linearGradient id="arm-${id}" x1="0" x2="1"><stop offset="0" stop-color="#7f8676"/><stop offset=".25" stop-color="#c4caba"/><stop offset=".48" stop-color="#e0e2d2"/><stop offset=".72" stop-color="#848d75"/><stop offset="1" stop-color="#454f38"/></linearGradient></defs><circle cx="45" cy="20" r="16" fill="#141a0f" stroke="#5d694e"/><circle cx="45" cy="20" r="11" fill="#4a5640" stroke="#7b876a"/><circle cx="45" cy="20" r="4" fill="#1b2414"/><path d="M45 21v62q0 12-10 23l-22 31v23" fill="none" stroke="#10170b" stroke-width="9"/><path d="M45 21v62q0 12-10 23l-22 31v23" fill="none" stroke="url(#arm-${id})" stroke-width="5.5"/><path d="M5 150h17l-1 18H7Z" fill="#313d26" stroke="#778563"/><path d="M10 165h7v8h-7Z" fill="${id === 'a' ? '#ff805a' : '#a9dfcd'}"/><path d="M45 0v-9" stroke="#808b72" stroke-width="9"/></svg></div>
    <label class="pitch-control"><span>TEMPO</span><span>+</span><span class="pitch-rail"><input class="vertical-range" data-tempo="${id}" type="range" min="-40" max="40" value="0" step=".1" aria-label="デッキ${id.toUpperCase()} テンポ変更パーセント"></span><span>−</span><output data-pitch-output="${id}">+0.0%</output></label><span class="deck-bottom-meta"><i></i> VINYL MODE</span><span class="scratch-caption">DRAG TO SCRATCH <kbd>${id === 'a' ? 'S' : 'K'}</kbd></span></div>
    <div class="deck-transport"><button class="transport-play" data-play="${id}" aria-label="デッキ${id.toUpperCase()}を再生" aria-pressed="false">${icon('play')}<kbd>${id === 'a' ? 'Z' : 'M'}</kbd></button><button class="cue-button" data-cue="${id}" aria-label="デッキ${id.toUpperCase()}の先頭へ戻る">CUE</button><span class="transport-spacer"></span><button class="sync-button" data-sync="${id}" aria-pressed="false" aria-label="デッキ${id.toUpperCase()}を相手のビートに同期">${icon('sync')}SYNC</button><button class="loop-button" data-loop="${id}" aria-pressed="false" aria-label="デッキ${id.toUpperCase()}の4拍ループ">${icon('loop')}4 LOOP</button></div>
  </article>`;
}
function mixerMarkup() {
  return `<section class="mixer" aria-label="2チャンネルミキサー"><div class="mixer-top"><h2 class="mixer-heading">THE MIXER</h2><div class="beat-lights" role="img" aria-label="4拍のビートガイド"><i></i><i></i><i></i><i></i></div></div><div class="eq-section">${['a', 'b'].map(id => `<div class="eq-channel" data-channel="${id.toUpperCase()}">${knob(id, 2, 'HI')}${knob(id, 1, 'MID')}${knob(id, 0, 'LOW')}</div>`).join('')}</div><div class="eq-middle-labels" aria-hidden="true"><span>HI</span><span>MID</span><span>LOW</span></div><div class="filter-row">${knob('a', 'filter', 'FILTER A', 1, 0, 1)}<span>FILTER</span>${knob('b', 'filter', 'FILTER B', 1, 0, 1)}</div><div class="mixer-bottom"><label class="channel-slider"><input type="range" class="vertical-range" data-volume="a" min="0" max="100" value="85" aria-label="デッキAの音量"><span>A</span></label><div class="vu-meter" role="img" aria-label="音量レベルメーター"><i class="vu-bar"></i><i class="vu-bar"></i></div><label class="channel-slider b"><input type="range" class="vertical-range" data-volume="b" min="0" max="100" value="85" aria-label="デッキBの音量"><span>B</span></label></div><span class="mixer-signature">ANALOG FEEL. DIGITAL SOUL.</span></section>`;
}
$('#booth').innerHTML = deckMarkup('a', TRACKS[0]) + mixerMarkup() + deckMarkup('b', TRACKS[1]);
$('#track-list').innerHTML = TRACKS.map(track => `<article class="crate-track"><span class="track-art" style="--track-color:${track.color}" aria-hidden="true"></span><div class="crate-info"><strong>${track.title}</strong><span>${track.genre} · ${track.bpm} BPM · ${track.key}</span><p>${track.description}</p></div><div class="load-buttons"><button data-load="${track.id}" data-target="a" aria-label="${track.title}をデッキAへ読み込む">A ↗</button><button data-load="${track.id}" data-target="b" aria-label="${track.title}をデッキBへ読み込む">B ↗</button></div></article>`).join('');

const refs = {};
for (const id of ['a', 'b']) refs[id] = { root: $(`.deck-${id}`), vinyl: $(`[data-vinyl=${id}]`), canvas: $(`[data-wave=${id}]`), bpm: $(`[data-bpm=${id}]`), time: $(`[data-time=${id}]`), play: $(`[data-play=${id}]`), loop: $(`[data-loop=${id}]`), sync: $(`[data-sync=${id}]`), tempo: $(`[data-tempo=${id}]`), pitch: $(`[data-pitch-output=${id}]`), angle: 0 };
const ui = { score: $('#score'), combo: $('#combo'), multiplier: $('#score-multiplier'), start: $('#session-start'), title: $('#mission-title'), hint: $('#mission-hint'), label: $('#session-label'), chip: $('#session-chip'), progress: $('#mission-progress'), energy: $('#energy-fill'), energyValue: $('#energy-value'), meter: $('.energy-meter'), clock: $('#time-left'), booth: $('#booth-state'), judgement: $('#judgement') };

function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('show'); toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2900); }
function announce(message) { $('#announcer').textContent = message; }
function fail(error) { toast(error instanceof Error ? error.message : '音の準備ができませんでした。もう一度、再生を押してください。'); console.error('offbeat audio:', error); }
async function ready() {
  if (!initPromise) initPromise = audio.init().catch(error => { initPromise = null; throw error; });
  await initPromise;
}
async function wakeAudio() {
  await ready();
  if (audio.paused) { await audio.resume(); game.resume(audio.now); }
}
async function wake() {
  if (startingSet) await startingSet;
  await wakeAudio();
}
const action = fn => event => Promise.resolve(fn(event)).catch(fail);

function ensureSession() {
  if (!game.running && !game.finished && mode === 'free') { game.start('free', audio.now); lastStage = -1; resultShown = false; }
}
function beatTiming() {
  const d = audio.decks.find(d => d.playing) || audio.get('a');
  return judgeTiming(audio.position(d.id) / (d.bpm / d.track.bpm), d.bpm);
}
function showJudgement(result) {
  if (!result) return;
  const element = ui.judgement;
  clearTimeout(judgementTimer);
  element.className = 'judgement show' + (result.grade === 'GOOD' ? ' good' : result.grade === 'OFF BEAT' ? ' off' : '');
  element.querySelector('strong').textContent = result.missionComplete ? 'MISSION COMPLETE' : result.grade;
  element.querySelector('span').textContent = result.missionComplete ? '+700 BONUS / NICE WORK.' : result.grade === 'OFF BEAT' ? '拍のランプに合わせてみよう。' : `+${result.points} ${result.multiplier > 1 ? ` / ×${result.multiplier}` : ''}`;
  judgementTimer = setTimeout(() => element.classList.remove('show'), 650);
  if (result.missionComplete) announce('ミッション達成。700ポイントのボーナス。');
}
function reward(type, valid = true) { ensureSession(); showJudgement(game.act(type, audio.now, beatTiming(), { valid })); }

function startSet() {
  if (startingSet) return startingSet;
  startingSet = (async () => {
  await wakeAudio();
  audio.stopAll();
  for (const id of ['a', 'b']) {
    const d = audio.get(id); d.loop = false; audio.cue(id); refs[id].angle = 0;
    refs[id].loop.setAttribute('aria-pressed', 'false');
  }
  audio.setCrossfade(0); $('#crossfader').value = '0';
  game.start(mode, audio.now); lastStage = -1; resultShown = false; transitionOrigin = 'a';
  audio.playBoth(); updateTransport();
  if (matchMedia('(max-width:640px)').matches) $('#booth').scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'start' });
  announce(mode === 'challenge' ? '60秒のライブを開始。レコードを4回擦ろう。' : 'フリープレイを開始。');
  })().finally(() => { startingSet = null; });
  return startingSet;
}
async function pauseSet() {
  if (!audio.context) return;
  releaseAll(); game.pause(audio.now); await audio.suspend(); updateTransport();
}
async function toggleSet() {
  if (!game.running || game.finished) return startSet();
  if (audio.paused) { await wake(); if (!audio.decks.some(d => d.playing)) audio.playBoth(); updateTransport(); return; }
  if (!audio.decks.some(d => d.playing)) { audio.playBoth(); updateTransport(); return; }
  await pauseSet();
}
function selectMode(next) {
  if (next === mode) return;
  releaseAll(); audio.stopAll(); mode = next; game.reset(mode); lastStage = -1; resultShown = false;
  document.body.classList.toggle('challenge', mode === 'challenge');
  $('#mode-free').classList.toggle('selected', mode === 'free'); $('#mode-free').setAttribute('aria-pressed', String(mode === 'free'));
  $('#mode-challenge').classList.toggle('selected', mode === 'challenge'); $('#mode-challenge').setAttribute('aria-pressed', String(mode === 'challenge'));
  $('#time-block').hidden = mode !== 'challenge'; updateTransport(); renderUI();
}
$('#mode-free').addEventListener('click', () => selectMode('free'));
$('#mode-challenge').addEventListener('click', () => selectMode('challenge'));
ui.start.addEventListener('click', action(toggleSet));
$('#mobile-transport').addEventListener('click', action(toggleSet));
$('#mobile-goal').addEventListener('click', () => toast(mode === 'challenge' && game.running ? MISSIONS[game.stageIndex].hint : 'レコードを前後にドラッグ。下のパッドを叩いて、ビートに音を重ねよう。'));

function updateTransport() {
  for (const d of audio.decks) {
    const r = refs[d.id], active = d.playing && !audio.paused;
    r.play.setAttribute('aria-pressed', String(active)); r.play.setAttribute('aria-label', `デッキ${d.id.toUpperCase()}を${active ? '停止' : '再生'}`);
    r.play.querySelector('use').setAttribute('href', active ? '#i-pause' : '#i-play');
    r.loop.setAttribute('aria-pressed', String(d.loop)); r.bpm.textContent = d.bpm.toFixed(1);
    const percent = (d.bpm / d.track.bpm - 1) * 100;
    r.tempo.value = String(percent); r.pitch.textContent = `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
    r.root.querySelector('.track-name').textContent = d.track.title;
    r.root.querySelector('.track-meta').textContent = `${d.track.genre} · ${d.track.key} · ORIGINAL`;
  }
  const playing = audio.decks.some(d => d.playing) && !audio.paused;
  document.body.classList.toggle('playing', playing);
  ui.start.classList.toggle('is-playing', playing);
  ui.start.querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
  ui.start.querySelector('span').textContent = playing ? '一時停止' : game.running ? 'プレイを再開' : mode === 'challenge' ? '60秒のライブを始める' : 'セットをはじめる';
  $('#mobile-transport use').setAttribute('href', playing ? '#i-pause' : '#i-play');
  $('#mobile-transport strong').textContent = playing ? 'PAUSE' : 'PLAY';
  $('#mobile-transport').setAttribute('aria-label', playing ? 'セットを一時停止' : game.running ? 'プレイを再開' : 'セットをはじめる');
  ui.booth.textContent = playing ? 'NEEDLE DOWN. VOLUME UP.' : game.paused ? 'TAKE A BREATHER. YOUR SET IS PAUSED.' : 'READY WHEN YOU ARE';
  const synced = Math.abs(audio.get('a').bpm - audio.get('b').bpm) < .05;
  for (const id of ['a', 'b']) refs[id].sync.setAttribute('aria-pressed', String(synced));
}
for (const id of ['a', 'b']) {
  $(`[data-play=${id}]`).addEventListener('click', action(async () => { await wake(); ensureSession(); audio.toggle(id); updateTransport(); }));
  $(`[data-cue=${id}]`).addEventListener('click', action(async () => { await wake(); audio.cue(id); refs[id].angle = 0; toast(`デッキ${id.toUpperCase()}：最初のビートへ。`); }));
  $(`[data-sync=${id}]`).addEventListener('click', action(async () => {
    await wake(); const valid = audio.decks.every(d => d.playing); audio.sync(id); updateTransport();
    if (valid) reward('sync');
    toast(valid ? `${audio.get(id).bpm.toFixed(1)} BPM — ビートがひとつに。` : 'テンポを合わせました。両方を再生すると、ミックスできます。');
  }));
  $(`[data-loop=${id}]`).addEventListener('click', action(async () => { await wake(); const on = audio.setLoop(id); updateTransport(); toast(on ? `デッキ${id.toUpperCase()}：この4拍をループ。` : `デッキ${id.toUpperCase()}：ループを解除。`); }));
  $(`[data-tempo=${id}]`).addEventListener('input', action(async event => { const value = Number(event.target.value); await ready(); audio.tempo(id, audio.get(id).track.bpm * (1 + value / 100)); updateTransport(); }));
  $(`[data-volume=${id}]`).addEventListener('input', action(async event => { const value = Number(event.target.value) / 100; await ready(); audio.setVolume(id, value); }));
}
$$('[data-knob]').forEach(input => {
  const apply = async () => {
    const value = Number(input.value), min = Number(input.min), max = Number(input.max);
    input.parentElement.querySelector('.knob-dial').style.setProperty('--rotation', `${(value - min) / (max - min) * 270 - 135}deg`);
    input.setAttribute('aria-valuetext', input.dataset.knob === 'filter' ? `${Math.round(value * 100)}パーセント` : `${value} dB`);
    await ready();
    input.dataset.knob === 'filter' ? audio.setFilter(input.dataset.deck, value) : audio.setEQ(input.dataset.deck, Number(input.dataset.knob), value);
  };
  input.addEventListener('input', action(apply));
  input.parentElement.addEventListener('dblclick', action(() => { input.value = input.dataset.knob === 'filter' ? '1' : '0'; return apply(); }));
});

function setFader(value) {
  const x = clamp(value, 0, 1); audio.setCrossfade(x); $('#crossfader').value = String(x * 100);
  $('#crossfader').setAttribute('aria-valuetext', x < .02 ? 'デッキAのみ' : x > .98 ? 'デッキBのみ' : `A ${Math.round((1 - x) * 100)}、B ${Math.round(x * 100)}`);
  const side = x < .12 ? 'a' : x > .88 ? 'b' : null;
  if (side && transitionOrigin && side !== transitionOrigin && audio.decks.every(d => d.playing) && !audio.paused) reward('transition');
  if (side) transitionOrigin = side;
}
$('#crossfader').addEventListener('input', event => setFader(Number(event.target.value) / 100));
$('#fader-center').addEventListener('click', () => setFader(.5));
$('#echo').addEventListener('click', action(async () => { await wake(); audio.setEcho(!audio.echo); $('#echo').setAttribute('aria-pressed', String(audio.echo)); toast(audio.echo ? 'ECHO ON — 音に、余韻を。' : 'ECHO OFF'); }));

async function hitPad(kind) {
  await wake(); ensureSession(); audio.sample(kind); reward('pad');
  const pad = $(`[data-sample=${kind}]`); pad.classList.remove('hit'); void pad.offsetWidth; pad.classList.add('hit');
  clearTimeout(pad.hitTimer); pad.hitTimer = setTimeout(() => pad.classList.remove('hit'), 150);
}
$$('[data-sample]').forEach(pad => {
  pad.addEventListener('pointerdown', action(event => { if (event.button !== 0) return; event.preventDefault(); pad.focus({ preventScroll: true }); return hitPad(pad.dataset.sample); }));
  pad.addEventListener('click', action(event => { if (event.detail === 0) return hitPad(pad.dataset.sample); }));
});

function releasePointer(id) {
  const state = pointers.get(id); if (!state) return;
  pointers.delete(id); if (audio.get(id).scratching) audio.endScratch(id);
  refs[id].vinyl.classList.remove('scratching');
  try { refs[id].vinyl.releasePointerCapture(state.pointerId); } catch { /* Already released by the browser. */ }
}
function releaseAll() {
  for (const id of ['a', 'b']) {
    releasePointer(id);
    const timers = keyScratches.get(id); if (timers) timers.forEach(clearTimeout);
    keyScratches.delete(id); audio.endScratch(id); refs[id].vinyl.classList.remove('scratching');
  }
}
for (const id of ['a', 'b']) {
  const vinyl = refs[id].vinyl;
  vinyl.addEventListener('pointerdown', action(async event => {
    if (event.button !== 0 || pointers.has(id) || keyScratches.has(id)) return;
    event.preventDefault(); vinyl.focus({ preventScroll: true }); vinyl.setPointerCapture(event.pointerId);
    const state = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), travel: 0, direction: 0, ready: false };
    pointers.set(id, state);
    await wake();
    if (pointers.get(id) !== state) return;
    ensureSession(); audio.beginScratch(id); state.ready = true; vinyl.classList.add('scratching');
  }));
  vinyl.addEventListener('pointermove', event => {
    const state = pointers.get(id); if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.x, dy = event.clientY - state.y, now = performance.now();
    const distance = dx - dy * .65, delta = distance * .0065;
    if (state.ready) {
      audio.moveScratch(id, delta, (now - state.time) / 1000); refs[id].angle += distance * .9;
      const direction = Math.sign(distance);
      if (direction && direction !== state.direction) { state.travel = 0; state.rewarded = false; }
      if (direction) state.direction = direction;
      state.travel += Math.abs(distance);
      if (state.travel > 13 && !state.rewarded) { reward('scratch'); state.rewarded = true; }
    }
    state.x = event.clientX; state.y = event.clientY; state.time = now;
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) vinyl.addEventListener(event, () => releasePointer(id));
  vinyl.addEventListener('click', action(event => { if (event.detail === 0 && !pointers.has(id)) return scratchBurst(id); }));
}
async function scratchBurst(id) {
  if (pointers.has(id) || keyScratches.has(id)) return;
  await wake(); if (pointers.has(id) || keyScratches.has(id)) return;
  ensureSession(); audio.beginScratch(id); refs[id].vinyl.classList.add('scratching'); reward('scratch');
  audio.moveScratch(id, .17, .1); refs[id].angle += 32;
  const reverse = setTimeout(() => { if (!audio.paused && audio.get(id).scratching) { audio.moveScratch(id, -.24, .12); refs[id].angle -= 47; } }, 100);
  const end = setTimeout(() => { audio.endScratch(id); refs[id].vinyl.classList.remove('scratching'); keyScratches.delete(id); }, 235);
  keyScratches.set(id, [reverse, end]);
}

document.addEventListener('keydown', action(async event => {
  if (event.metaKey || event.ctrlKey || event.altKey || $('dialog[open]')) return;
  const focused = document.activeElement;
  if (['TEXTAREA', 'SELECT'].includes(focused?.tagName) || focused?.tagName === 'INPUT' && focused.type !== 'range') return;
  if (focused?.type === 'range' && ['ArrowLeft', 'ArrowRight'].includes(event.code)) return;
  const keys = ['Space', 'KeyZ', 'KeyM', 'KeyS', 'KeyK', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'ArrowLeft', 'ArrowRight'];
  if (!keys.includes(event.code)) return; event.preventDefault();
  if (['ArrowLeft', 'ArrowRight'].includes(event.code)) { setFader(audio.crossfade + (event.code === 'ArrowLeft' ? -.06 : .06)); return; }
  if (event.repeat) return;
  if (event.code === 'Space') return toggleSet();
  if (event.code === 'KeyS' || event.code === 'KeyK') return scratchBurst(event.code === 'KeyS' ? 'a' : 'b');
  if (event.code === 'KeyZ' || event.code === 'KeyM') { await wake(); ensureSession(); audio.toggle(event.code === 'KeyZ' ? 'a' : 'b'); updateTransport(); return; }
  if (event.code.startsWith('Digit')) return hitPad(['kick', 'clap', 'hat', 'horn'][Number(event.code.slice(-1)) - 1]);
}));

function openDialog(id) {
  if (mode === 'challenge' && game.running && !game.paused) pauseSet().catch(fail);
  const dialog = $(`#${id}`); if (!dialog.open) dialog.showModal();
}
for (const [button, dialog] of [['help', 'help-dialog'], ['settings', 'settings-dialog'], ['library-open', 'library-dialog']]) $(`#${button}`).addEventListener('click', () => openDialog(dialog));
$$('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
}));
$$('[data-load]').forEach(button => button.addEventListener('click', action(async () => {
  if (mode === 'challenge' && game.running) { toast('ライブ中のレコード交換はお休み。セット後に選ぼう。'); return; }
  releaseAll(); audio.load(button.dataset.target, button.dataset.load); refs[button.dataset.target].angle = 0; updateTransport();
  $('#library-dialog').close(); toast(`${audio.get(button.dataset.target).track.title} → デッキ${button.dataset.target.toUpperCase()}`);
})));
$('#mute').addEventListener('click', () => {
  audio.setMuted(!audio.muted); $('#mute').setAttribute('aria-pressed', String(audio.muted));
  $('#mute').setAttribute('aria-label', audio.muted ? 'ミュートを解除' : '音をミュート'); $('#mute use').setAttribute('href', audio.muted ? '#i-mute' : '#i-volume');
  toast(audio.muted ? 'ミュート中。もう一度押すと音が戻ります。' : 'サウンドをオンにしました。');
});
$('#master-volume').addEventListener('input', event => { const value = Number(event.target.value); audio.setMaster(value / 100); $('#master-output').textContent = `${value}%`; });
$('#reduce-motion').checked = reduceMotion;
document.body.classList.toggle('reduced-motion', reduceMotion);
$('#reduce-motion').addEventListener('change', event => { reduceMotion = event.target.checked; document.body.classList.toggle('reduced-motion', reduceMotion); });
window.addEventListener('blur', () => { releaseAll(); if (game.running && !game.paused) pauseSet().catch(fail); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseAll(); if (game.running && !game.paused) pauseSet().catch(fail); } });

$('#share-button').addEventListener('click', () => openDialog('share-dialog'));

function showResult() {
  if (resultShown) return;
  resultShown = true; releaseAll(); audio.stopAll(); audio.suspend().catch(fail); updateTransport();
  const oldBest = best; best = saveBest(safeStorage, game.score);
  $('#result-rank').textContent = game.rank; $('#result-score').textContent = formatScore(game.score);
  $('#result-combo').textContent = String(game.maxCombo); $('#result-missions').textContent = `${game.completed.filter(Boolean).length} / 5`;
  $('#result-best').textContent = best.toLocaleString(); $('#new-best').hidden = game.score <= oldBest;
  $('#result-title').textContent = game.rank === 'S' ? 'フロアは、あなたのもの。' : game.rank === 'A' ? 'そのグルーヴ、最高。' : game.score > 0 ? 'ナイスセット。' : '次は、最初の一音から。';
  $('#result-message').textContent = game.score > 0 ? 'この60秒は、あなただけの音楽。もう1セット、いこう。' : 'S / Kでスクラッチ。1〜4で音を重ねよう。';
  $('#result-dialog').showModal(); announce(`ライブ終了。${game.score}点、ランク${game.rank}。`);
}
$('#retry').addEventListener('click', action(async () => { $('#result-dialog').close(); await startSet(); }));
$('#back-free').addEventListener('click', action(async () => { $('#result-dialog').close(); selectMode('free'); await startSet(); }));

function renderUI() {
  ui.score.textContent = formatScore(game.score); ui.combo.innerHTML = `${String(game.combo).padStart(2, '0')}<span>×</span>`;
  $('#mobile-score').textContent = formatScore(game.score);
  const mobileTitles = ['スクラッチ', 'ビートを重ねる', 'SYNCで同期', 'フェーダーでつなぐ', '自由にプレイ'];
  $('#mobile-goal').textContent = mode === 'challenge' && game.running ? `${game.stageIndex + 1}/5 ${mobileTitles[game.stageIndex]} ${game.completed[game.stageIndex] ? '✓' : `${game.counts[game.stageIndex]}/${MISSIONS[game.stageIndex].target}`} ⓘ` : '自由に、ミックス。 ⓘ';
  $('#mobile-time').textContent = game.paused ? 'PAUSED' : mode === 'challenge' ? `${Math.max(0, Math.ceil(60 - game.elapsed(audio.now)))}s` : '';
  ui.multiplier.textContent = `×${Math.min(4, 1 + Math.floor(game.combo / 8))}`;
  ui.energy.style.width = `${game.crowd}%`; ui.energyValue.innerHTML = `${Math.round(game.crowd)}<span>%</span>`; ui.meter.setAttribute('aria-valuenow', String(Math.round(game.crowd)));
  if (mode === 'challenge') {
    ui.clock.innerHTML = `${Math.max(0, Math.ceil(60 - game.elapsed(audio.now)))}<span>s</span>`;
    const index = game.stageIndex, mission = MISSIONS[index];
    if (lastStage !== index) {
      if (game.running && lastStage >= 0 && !game.completed[lastStage]) toast(`前のミッションは ${game.counts[lastStage]} / ${MISSIONS[lastStage].target} 回。次で取り戻そう。`);
      ui.label.textContent = game.running ? `LIVE ${String(index + 1).padStart(2, '0')} / 05` : '60 SECOND LIVE';
      ui.title.textContent = game.running ? mission.title : '60秒で、フロアを沸かせ。';
      ui.hint.textContent = game.running ? mission.hint : '5つのDJミッションに挑戦。初めてでも、ガイドに沿って遊べます。';
      ui.chip.textContent = mission.label;
      if (index === 3) transitionOrigin = audio.crossfade < .12 ? 'a' : audio.crossfade > .88 ? 'b' : null;
      if (game.running) announce(mission.title + mission.hint);
      lastStage = index;
    }
    ui.progress.textContent = game.running ? game.completed[index] ? '✓ CLEAR' : `${game.counts[index]} / ${mission.target}` : '';
  } else {
    if (lastStage !== -2) {
      ui.label.textContent = game.running ? 'YOUR OWN HEADLINER' : 'SOUND CHECK';
      ui.title.textContent = game.running ? 'いい感じ。そのまま、遊ぼう。' : 'まずは、一音鳴らしてみよう。';
      ui.hint.textContent = '再生したら、レコードを前後にドラッグ。S / K キーでも擦れます。';
      ui.chip.textContent = 'NO PRESSURE. JUST PLAY.'; ui.progress.textContent = ''; lastStage = -2;
    }
  }
}

const wavePeaks = new Map();
function peaks(track) {
  const rendered = audio.rendered.get(track.id); if (!rendered) return null;
  if (!wavePeaks.has(track.id)) {
    const data = new Float32Array(1024), stride = rendered.pcm.length / data.length;
    for (let i = 0; i < data.length; i++) {
      let max = 0; for (let j = Math.floor(i * stride); j < (i + 1) * stride; j += 3) max = Math.max(max, Math.abs(rendered.pcm[j]));
      data[i] = max;
    }
    wavePeaks.set(track.id, data);
  }
  return wavePeaks.get(track.id);
}
const resizeObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    const canvas = entry.target, dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(entry.contentRect.width * dpr); canvas.height = Math.round(entry.contentRect.height * dpr);
    canvas.logicalWidth = entry.contentRect.width; canvas.logicalHeight = entry.contentRect.height; canvas.dpr = dpr;
  }
});
for (const r of Object.values(refs)) resizeObserver.observe(r.canvas);
function drawWave(d) {
  const r = refs[d.id], canvas = r.canvas, ctx = canvas.getContext('2d'), w = canvas.logicalWidth || 300, h = canvas.logicalHeight || 48;
  const pcm = peaks(d.track); if (!pcm) return;
  ctx.setTransform(canvas.dpr || 1, 0, 0, canvas.dpr || 1, 0, 0); ctx.clearRect(0, 0, w, h);
  const duration = audio.rendered.get(d.track.id).duration, pos = audio.position(d.id), normalized = pos / duration;
  const steps = Math.floor(w / 3), range = .52;
  ctx.strokeStyle = '#4b554340'; ctx.lineWidth = 1;
  for (let i = 0; i < 16; i++) {
    const x = wrap(i / 16 - normalized + .42 * range, range) / range * w;
    ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, h); ctx.stroke();
  }
  const accent = d.id === 'a' ? '#ff805a' : '#a9dfcd';
  for (let i = 0; i < steps; i++) {
    const p = wrap(normalized + (i / steps - .42) * range, 1), index = Math.floor(p * pcm.length);
    const height = Math.max(2, pcm[index] * h * .91), x = i * 3;
    ctx.globalAlpha = x < w * .42 ? .45 : .85; ctx.fillStyle = accent; ctx.fillRect(x, (h - height) / 2, 1.5, height);
  }
  ctx.globalAlpha = 1;
  const secs = Math.floor(pos); r.time.textContent = `00:${String(secs).padStart(2, '0')} / ${d.loop ? '4 BEAT LOOP' : '4 BARS'}`;
}
let frameTime = performance.now(), frames = 0;
function frame(time) {
  const dt = Math.min((time - frameTime) / 1000, .05); frameTime = time; frames++;
  game.update(audio.now);
  if (game.finished && !resultShown) showResult();
  for (const d of audio.decks) {
    const r = refs[d.id];
    if (d.playing && !audio.paused && !d.scratching && !reduceMotion) r.angle += dt * 200 * (d.bpm / d.track.bpm);
    r.vinyl.style.setProperty('--angle', `${r.angle % 360}deg`);
    if (frames % 2 === 0) drawWave(d);
  }
  const activeDeck = audio.decks.find(d => d.playing), beat = activeDeck ? Math.floor(audio.position(activeDeck.id) / (60 / activeDeck.track.bpm)) % 4 : -1;
  $$('.beat-lights i').forEach((light, index) => light.classList.toggle('on', index === beat && !audio.paused && (reduceMotion || audio.phase(activeDeck?.id) < .58)));
  if (time - renderedAt > 90) {
    renderUI(); renderedAt = time;
    const level = audio.level(); $$('.vu-bar').forEach((bar, i) => bar.style.setProperty('--vu-clip', `${100 - clamp(level * (i ? 490 : 560), 0, 95)}%`));
  }
  requestAnimationFrame(frame);
}
updateTransport(); renderUI(); requestAnimationFrame(frame);
setTimeout(() => audio.prepare(), 40);
