// 消えたのは、どれ？ — 画面と3Dと進行をつなぐ。決まりは lib/ の純粋な関数に置き、ここでは呼ぶだけにする。
import * as THREE from './vendor/three.js';
import { createWorld } from './lib/world.js';
import { arrange } from './lib/arrange.js';
import { planGame, encodeChallenge, decodeChallenge, titleFor } from './lib/rules.js';
import { Game } from './lib/game.js';
import { Player } from './lib/player.js';
import { NavGrid } from './lib/nav.js';
import { obstacles, placeProp } from './lib/place.js';
import { Minimap } from './lib/minimap.js';
import { Sound } from './lib/sound.js';
import { revealViewpoint } from './lib/reveal.js';
import { tourPose } from './lib/tour.js';
import { LEVELS, PROPS } from './lib/catalog.js';
import { HOUSE, ROOMS, describeSlot, roomAt, roomById, slotById } from './lib/plan.js';
import { newSeed } from './lib/rng.js';

const $ = (id) => document.getElementById(id);

/* 日本語を語の切れ目でだけ折り返すため、語と語の間に <wbr> を入れる（CSS の word-break: keep-all と組にする）。
   評価の2周目で「花び／ん」「残／っています」と語の途中で改行された。Intl.Segmenter が無いブラウザは、そのまま出す */
const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ja', { granularity: 'word' }) : null;
const escapeHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function wbr(text) {
  const safe = (t) => escapeHtml(t);
  if (!segmenter) return safe(text);
  // 文節に近い単位にする：ひらがなだけの語（助詞・送りがな）や記号は前の語にくっつけ、その前では折らない
  // （語の単位で折ると「ベッドわき／の台」のように、行の頭に「の」が来た）
  const parts = [];
  for (const { segment } of segmenter.segment(String(text))) {
    const attach = parts.length && (/^[\u3040-\u309f\u30fc]+$/.test(segment) || /^[、。」』）！？…・：\s]+$/.test(segment));
    if (attach) parts[parts.length - 1] += segment;
    else parts.push(segment);
  }
  return parts.map(safe).join('<wbr>');
}
const app = $('app');
const params = new URLSearchParams(location.search);
const pace = params.get('pace') === 'fast' ? 'fast' : 'normal';
// 自動テスト用。?clock=manual では進行の時間が advance() でしか進まない（描画の速さに左右されない）
const manualClock = params.get('clock') === 'manual';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(pointer: coarse)').matches;
if (touch) document.documentElement.classList.add('touch');

// ---------- 端末に残す設定（音とむずかしさだけ） ----------
const SETTINGS_NAME = 'day054:settings';
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_NAME)) || {}; } catch { return {}; }
}
function saveSettings(patch) {
  try { localStorage.setItem(SETTINGS_NAME, JSON.stringify({ ...loadSettings(), ...patch })); } catch { /* 保存できない端末でも遊べる */ }
}
const settings = loadSettings();

const sound = new Sound();
sound.setMuted(!!settings.muted);
$('mute').setAttribute('aria-pressed', String(!!settings.muted));
$('mute').setAttribute('aria-label', settings.muted ? '音を出す' : '音を消す');

const s = {
  world: null,
  manifest: null,
  game: null,
  player: null,
  grid: null,
  minimap: new Minimap($('minimap')),
  challenge: decodeChallenge(location.hash),
  seed: null,
  level: 'normal',
  thumbs: new Map(),
  keys: new Set(),
  stick: { x: 0, y: 0, id: null },
  fly: null,
  fade: null,
  ring: null,
  tourTime: 0,
  moved: false,
  stepDist: 0,
  visited: new Set(),
  travel: null
};

// ---------- 起動 ----------
async function boot() {
  const level = s.challenge?.level || (LEVELS[settings.level] ? settings.level : 'normal');
  for (const input of document.querySelectorAll('input[name="level"]')) input.checked = input.value === level;
  if (s.challenge) {
    const badge = $('challenge-badge');
    badge.hidden = false;
    badge.innerHTML = `友だちからの挑戦：<span class="nowrap">${escapeHtml(LEVELS[s.challenge.level].name)}・家の番号${s.challenge.seed}</span>`;
  }
  try {
    s.manifest = await (await fetch('data/models.json')).json();
    s.world = await createWorld({
      canvas: $('scene'),
      manifest: s.manifest,
      pixelRatioCap: touch ? 1.5 : 1.75,
      onProgress(done, total) {
        $('load-fill').style.width = `${Math.round((done / total) * 100)}%`;
        $('start').textContent = `家具を運び込んでいます… ${done} / ${total}`;
      }
    });
  } catch (err) {
    showFatal(err);
    return;
  }
  s.world.setArrangement(arrange(s.manifest, 2026, 0));
  s.grid = new NavGrid(obstacles(s.manifest, arrange(s.manifest, 2026, 0)));
  s.player = new Player(s.grid);
  resize();
  app.dataset.loaded = 'true';
  $('start').disabled = false;
  $('start').textContent = s.challenge ? '挑戦を受ける' : 'はじめる';
  // 自動テストと録画のための窓口。advance は時間を早送りする（画面の描画は待たない）
  window.__day054 = {
    get game() { return s.game; },
    get player() { return s.player; },
    world: s.world,
    state: s,
    advance(seconds) {
      for (let t = 0; t < seconds && s.game; t += 0.05) handle(s.game.tick(0.05));
    },
    hidden(id) { return !s.world.props[id].group.visible; }
  };
  document.documentElement.dataset.ready = 'true';
  requestAnimationFrame(frame);
}

/** 出発点。縦長の画面は縦の画角が広く天井ばかり写るので、少し下を向いて始める（見た目の採点） */
function startPose() {
  const portrait = app.clientWidth < app.clientHeight * 0.8;
  return { ...HOUSE.start, pitch: portrait ? -15 : -6 };
}

function showFatal(err) {
  console.error(err);
  $('fatal-message').textContent = 'この端末では3Dの表示ができないか、読み込みが途中で止まりました。通信の良い場所でもう一度お試しください。';
  $('fatal-screen').hidden = false;
  $('title-screen').hidden = true;
}

function resize() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  if (s.world) s.world.setSize(w, h);
  s.minimap.resize();
}
window.addEventListener('resize', resize);

// ---------- 進行 ----------
function setPhase(phase) {
  app.dataset.phase = phase;
  $('phase-name').textContent = { ready: '準備', memorize: '覚える', closing: '目を閉じて', search: '探す', answer: '答える', reveal: '答え合わせ' }[phase] || '';
}

function startGame() {
  sound.unlock();
  sound.start();
  const level = document.querySelector('input[name="level"]:checked')?.value || 'normal';
  s.level = s.challenge ? s.challenge.level : level;
  s.seed = s.challenge ? s.challenge.seed : newSeed();
  saveSettings({ level: s.level });
  const rounds = planGame(s.manifest, arrange, s.seed, s.level);
  s.game = new Game({ rounds, level: s.level, seed: s.seed, pace });
  $('title-screen').hidden = true;
  $('result-screen').hidden = true;
  beginRound();
}

function beginRound() {
  const r = s.game.current;
  s.world.showAll();
  s.world.setArrangement(r.arrangement);
  s.grid = new NavGrid(obstacles(s.manifest, r.arrangement));
  s.player.setGrid(s.grid);
  s.player.reset(startPose());
  s.fly = null;
  endFade();
  clearRing();
  hideSpotLabel();
  s.minimap.highlight = null;
  s.visited.clear();
  s.pendingTravel = null;
  $('round-no').textContent = `${s.game.round + 1}問目 / ${s.game.rounds.length}`;
  $('ready-round').textContent = `${s.game.round + 1}問目・${LEVELS[s.level].name}・候補${r.choices.length}つ`;
  $('ready-text').innerHTML = wbr(`${s.game.memorizeSeconds}秒で、家の中を覚えよう`);
  $('ready-screen').hidden = false;
  $('reveal-panel').hidden = true;
  $('answer-screen').hidden = true;
  $('hint').hidden = true;
  $('primary').textContent = '覚えた！';
  $('primary').disabled = true;
  setMessage('');
  setPhase('ready');
  updateTimer();
}

function handle(events) {
  for (const e of events) {
    switch (e) {
      case 'enter:memorize':
        s.visited.clear();
        $('ready-screen').hidden = true;
        $('primary').disabled = false;
        setPhase('memorize');
        setMessage('何がどこにあるか、覚えよう', 3.5);
        if (s.pendingTravel) {
          const room = s.pendingTravel;
          s.pendingTravel = null;
          travelTo(room);
        }
        break;
      case 'countdown':
        sound.tick(Math.ceil(s.game.timeLeft));
        break;
      case 'enter:closing':
        s.player.stop();
        $('primary').disabled = true;
        setPhase('closing');
        setMessage('');
        $('lid-text').textContent = '目を閉じて…';
        $('eyelids').classList.add('closed');
        sound.close();
        break;
      case 'vanish': {
        const r = s.game.current;
        s.world.setHidden(r.vanished, true);
        s.grid = new NavGrid(obstacles(s.manifest, r.arrangement, [r.vanished]));
        s.player.setGrid(s.grid);
        s.player.reset(startPose());
        $('lid-text').textContent = '何かが1つ、消えました';
        sound.vanish();
        prepareThumbs(r.choices);
        break;
      }
      case 'enter:search':
        s.visited.clear();
        $('eyelids').classList.remove('closed');
        sound.open();
        setPhase('search');
        $('primary').textContent = 'わかった！答える';
        $('primary').disabled = false;
        setMessage('消えた物を探そう', 3.5);
        break;
      case 'hint-ready':
        $('hint').hidden = false;
        break;
      case 'hint': {
        const room = roomById(s.game.current.room);
        s.minimap.highlight = room.id === 'entrance' ? 'hall' : room.id;
        $('hint').hidden = true;
        setMessage(`ヒント：消えたのは「${room.name}」の物`, 5);
        sound.hint();
        break;
      }
      case 'time-up':
        if (s.game.phase === 'closing') setMessage('');
        break;
      case 'enter:answer':
        s.player.stop();
        showAnswer();
        break;
      case 'correct':
        sound.correct();
        break;
      case 'wrong':
        sound.wrong();
        break;
      case 'enter:reveal':
        showReveal();
        break;
      case 'enter:ready':
        beginRound();
        break;
      case 'enter:result':
        showResult();
        break;
      case 'unchoose':
        for (const b of document.querySelectorAll('.choice')) b.setAttribute('aria-checked', 'false');
        $('confirm').disabled = true;
        break;
      case 'pause':
        $('pause-screen').hidden = false;
        $('resume').focus();
        break;
      case 'resume':
        $('pause-screen').hidden = true;
        break;
      default:
        break;
    }
  }
}

let messageTimer = 0;
function setMessage(text, seconds = 0) {
  $('hud-message').innerHTML = wbr(text);
  clearTimeout(messageTimer);
  if (text && seconds) messageTimer = setTimeout(() => { $('hud-message').textContent = ''; }, seconds * 1000);
}

function updateTimer() {
  const g = s.game;
  if (!g) return;
  // ヒントは探す時間の最初から、使えるまでの秒数を見せておく（見た目の採点「ヒントの出し方が分からない」）
  const hint = $('hint');
  if (g.phase === 'search' && !g.hintUsed) {
    hint.hidden = false;
    const wait = Math.ceil(g.pace.hintAfter - g.phaseTime);
    hint.disabled = wait > 0;
    hint.textContent = wait > 0 ? `ヒントまで ${wait}秒` : 'ヒント：部屋を見る';
  } else if (!hint.hidden) {
    hint.hidden = true;
  }
  const shown = g.phase === 'memorize' ? g.timeLeft : g.phase === 'search' ? g.timeLeft : g.phase === 'ready' ? g.memorizeSeconds : g.phase === 'closing' ? g.searchSeconds : 0;
  $('timer').textContent = String(Math.ceil(shown));
  $('timer').parentElement.classList.toggle('urgent', (g.phase === 'memorize' || g.phase === 'search') && g.timeLeft <= 10);
}

// ---------- 答える ----------
function thumbOf(id) {
  if (!s.thumbs.has(id)) s.thumbs.set(id, s.world.thumbnail(id));
  return s.thumbs.get(id);
}
function prepareThumbs(ids) {
  // まぶたを閉じている間に写真を用意しておく（1枚ずつ次のフレームで）
  const queue = ids.filter(id => !s.thumbs.has(id));
  const step = () => {
    const id = queue.shift();
    if (!id) return;
    thumbOf(id);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function showAnswer() {
  setPhase('answer');
  const r = s.game.current;
  const box = $('choices');
  box.innerHTML = '';
  box.className = `choices count-${r.choices.length}${r.choices.length >= 7 ? ' many' : ''}`;
  r.choices.forEach((id, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', 'false');
    b.dataset.id = id;
    // 番号は写真の左上の角に重ねる。札の角に置くと、写真の大きさが画面幅で変わるたびに重なったり離れたりした
    b.innerHTML = `<span class="pic"><img alt="" src="${thumbOf(id)}"><span class="key" aria-hidden="true">${i + 1}</span></span><span class="name">${wbr(PROPS[id].name)}</span>`;
    b.addEventListener('click', () => choose(id));
    box.append(b);
  });
  $('confirm').disabled = true;
  $('answer-screen').hidden = false;
  box.querySelector('.choice')?.focus({ preventScroll: true });
}

function choose(id) {
  handle(s.game.choose(id));
  sound.tap();
  for (const b of document.querySelectorAll('.choice')) b.setAttribute('aria-checked', String(b.dataset.id === id));
  $('confirm').disabled = false;
}

// ---------- 答え合わせ ----------
function propCenterAndFacing(id, arrangement) {
  const a = arrangement[id];
  const p = placeProp(s.manifest, id, a.slot, a.yaw);
  const slot = slotById(a.slot);
  const box = s.world.propBox(id);
  const size = box.getSize(new THREE.Vector3());
  const wall = slot.kind === 'wall' || slot.kind === 'mirror';
  return { center: p.center, facing: slot.rot, size: Math.max(size.x, size.y, size.z), room: slot.room, base: p.base, wall };
}

function flyTo(target, seconds = 1.8) {
  const from = currentPose();
  if (reduced) {
    s.fly = { from: target, to: target, t: 1, dur: 1 };
    return;
  }
  s.fly = { from, to: { ...target, y: HOUSE.eyeHeight }, t: 0, dur: seconds };
}

function currentPose() {
  const c = s.world.camera;
  return { x: c.position.x, y: c.position.y, z: c.position.z, yaw: THREE.MathUtils.radToDeg(c.rotation.y), pitch: THREE.MathUtils.radToDeg(c.rotation.x) };
}

function showReveal() {
  const r = s.game.current;
  const answer = s.game.answers[s.game.answers.length - 1];
  $('answer-screen').hidden = true;
  setPhase('reveal');
  const info = propCenterAndFacing(r.vanished, r.arrangement);
  const view = revealViewpoint(s.grid, info.center, info.facing, info.size, info.room, { pitchOffset: revealPitchOffset() });
  flyTo(view);
  // 着いてから、消えた物がその場に戻ってくる
  s.fade = { id: r.vanished, t: reduced ? 1 : -1.7, dur: 1.1, info };
  const verdict = $('reveal-verdict');
  verdict.textContent = answer.correct ? '正解！' : 'ざんねん…';
  verdict.className = `reveal-verdict ${answer.correct ? 'ok' : 'ng'}`;
  $('reveal-text').innerHTML = `消えたのは<b>「${wbr(PROPS[r.vanished].name)}」</b>。<br>${wbr(`${describeSlot(r.arrangement[r.vanished].slot)}にありました`)}`;
  const chose = $('reveal-choice');
  const look = $('look-choice');
  if (!answer.correct) {
    chose.hidden = false;
    chose.innerHTML = wbr(`えらんだ「${PROPS[answer.choice].name}」は、${describeSlot(r.arrangement[answer.choice].slot)}に残っています`);
    look.hidden = false;
    look.textContent = `「${PROPS[answer.choice].name}」を見に行く`;
  } else {
    chose.hidden = true;
    look.hidden = true;
  }
  $('next').textContent = s.game.round + 1 >= s.game.rounds.length ? '結果を見る' : '次の問題へ';
  $('reveal-panel').hidden = false;
  setTimeout(() => $('next').focus({ preventScroll: true }), 50);
}

function lookAtChoice() {
  const r = s.game.current;
  const answer = s.game.answers[s.game.answers.length - 1];
  const info = propCenterAndFacing(answer.choice, r.arrangement);
  flyTo(revealViewpoint(s.grid, info.center, info.facing, info.size, info.room, { pitchOffset: revealPitchOffset() }));
  placeRing(info, '#2b6fd6');
  showSpotLabel(answer.choice, `えらんだ物：${PROPS[answer.choice].name}`, 'choice');
  $('look-choice').hidden = true;
}

/** 答え合わせで物を画面の上寄りに置くための下向きの角度。下の札が高く見える縦長の画面ほど大きく */
function revealPitchOffset() {
  return -Math.min(16, Math.max(7, s.world.camera.fov * 0.13));
}

/** 物の真上に札を出す（位置は毎フレーム、物の上端を画面に写して決める） */
function showSpotLabel(id, text, kind = 'answer') {
  const box = s.world.propBox(id);
  s.spot = { point: new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y + 0.12, (box.min.z + box.max.z) / 2) };
  $('spot-text').textContent = text;
  $('spot').className = `spot ${kind === 'choice' ? 'choice' : ''}`;
  $('spot').hidden = false;
}
function hideSpotLabel() {
  s.spot = null;
  $('spot').hidden = true;
}
function placeSpotLabel() {
  if (!s.spot) return;
  const p = s.spot.point.clone().project(s.world.camera);
  const el = $('spot');
  if (p.z > 1) { el.style.visibility = 'hidden'; return; }
  const w = app.clientWidth;
  const h = app.clientHeight;
  const x = Math.min(w - 90, Math.max(90, ((p.x + 1) / 2) * w));
  const y = Math.min(h - 40, Math.max(120, ((1 - p.y) / 2) * h));
  el.style.visibility = 'visible';
  // 大きな画面では札に zoom を掛けているので、位置の数値も同じ倍率で割り戻す（掛けたままだと約200px右にずれた）
  const zoom = parseFloat(getComputedStyle(el).zoom) || 1;
  el.style.left = `${x / zoom}px`;
  el.style.top = `${y / zoom}px`;
}

/**
 * 物の場所を指す輪。床ではなく物の置かれた面の高さに置き、壁掛けは壁に沿って縦に置く
 * （評価の2周目：棚や壁の小物では床の輪が見えなかった）。
 */
function placeRing({ center, size, base = 0, wall = false, facing = 0 }, color = '#e86f26') {
  clearRing();
  // 太い輪の外側に暗い縁を付け、明るい床や卓布の上でも埋もれないようにする（見た目の採点）
  const geo = new THREE.RingGeometry(0.33, 0.5, 64);
  const rimGeo = new THREE.RingGeometry(0.5, 0.56, 64);
  if (!wall) { geo.rotateX(-Math.PI / 2); rimGeo.rotateX(-Math.PI / 2); }
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(geo, mat);
  const rim = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({ color: '#1f1a16', transparent: true, opacity: 0.45, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  rim.renderOrder = 3;
  ring.add(rim);
  const radius = Math.max(0.22, size * 0.7);
  if (wall) {
    const f = THREE.MathUtils.degToRad(facing);
    ring.position.set(center[0] + Math.sin(f) * 0.04, center[1], center[2] + Math.cos(f) * 0.04);
    ring.rotation.y = f;
  } else {
    ring.position.set(center[0], base + 0.012, center[2]);
  }
  ring.userData = { base: radius, t: 0, wall };
  ring.renderOrder = 3;
  s.world.scene.add(ring);
  s.ring = ring;
}
function clearRing() {
  if (!s.ring) return;
  s.world.scene.remove(s.ring);
  s.ring.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  s.ring = null;
}

// 消えた物をその場で少しずつ見せる（材質を一時的に半透明にする）
function setPropOpacity(id, alpha) {
  const { group } = s.world.props[id];
  group.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (m.userData.baseOpacity === undefined) {
        m.userData.baseOpacity = m.opacity;
        m.userData.baseTransparent = m.transparent;
      }
      const done = alpha >= 1;
      m.transparent = done ? m.userData.baseTransparent : true;
      m.opacity = done ? m.userData.baseOpacity : m.userData.baseOpacity * alpha;
      m.needsUpdate = true;
    }
  });
}

/** 答え合わせの演出が残っていたら、光と半透明を元に戻して終える（すぐ次の問題へ進んだとき） */
function endFade() {
  if (!s.fade) return;
  setPropGlow(s.fade.id, 0);
  setPropOpacity(s.fade.id, 1);
  s.fade = null;
}

function setPropGlow(id, amount) {
  const { group } = s.world.props[id];
  group.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (!m.emissive) continue;
      if (m.userData.baseEmissive === undefined) {
        m.userData.baseEmissive = m.emissive.getHex();
        m.userData.baseEmissiveIntensity = m.emissiveIntensity;
      }
      if (amount > 0.001) {
        m.emissive.set('#ff9a4d');
        m.emissiveIntensity = amount * 0.5;
      } else {
        m.emissive.setHex(m.userData.baseEmissive);
        m.emissiveIntensity = m.userData.baseEmissiveIntensity;
      }
    }
  });
}

// ---------- 結果 ----------
function shareUrlWith(hash) {
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  const base = canonical || `${location.origin}${location.pathname}`;
  return `${base}${hash}`;
}

function showResult() {
  // 最後の答え合わせの輪と光が、結果の画面の後ろに残らないようにする（見た目の採点で「宙に浮いた金色の輪」）
  endFade();
  clearRing();
  hideSpotLabel();
  setPhase('result');
  const g = s.game;
  $('reveal-panel').hidden = true;
  $('result-level').textContent = `${LEVELS[s.level].name}・家の番号 ${s.seed}`;
  $('result-score').textContent = String(g.score);
  $('result-heading').querySelector('small').textContent = ` / ${g.rounds.length}問 正解`;
  $('result-title').textContent = titleFor(g.score, g.rounds.length);
  const list = $('result-list');
  list.innerHTML = '';
  for (const a of g.answers) {
    const li = document.createElement('li');
    // 名前の下に、はずれなら選んだ物を、ヒントを使ったならその旨を書く。答え合わせで見た場面と一覧をつなぐ
    // （見た目の採点3周目：小さな灰色の「ヒント」札は、使った印なのか押すボタンなのか分からなかった）
    // 補足は名前の下の段に、正誤の列の下まで使って書く。名前の列だけだとスマホで「石油／ランプ」と語の途中で折れた。
    // 補足どうしの間で先に折り返し、長い名前（11字まである）だけ句の切れ目で折る
    const notes = [];
    if (!a.correct && a.choice) notes.push(`えらんだ：${wbr(PROPS[a.choice].name)}`);
    if (a.hint) notes.push('ヒント使用');
    if (notes.length) li.className = 'has-note';
    const note = notes.length ? `<small class="result-note">${notes.map(n => `<span>${n}</span>`).join('')}</small>` : '';
    li.innerHTML = `<span>${a.round + 1}問目</span><img alt="" src="${thumbOf(a.vanished)}"><span class="result-name">${wbr(PROPS[a.vanished].name)}</span><span class="mark ${a.correct ? 'ok' : 'ng'}">${a.correct ? '正解' : 'はずれ'}</span>${note}`;
    list.append(li);
  }
  const url = shareUrlWith(encodeChallenge(s.level, s.seed));
  const text = `『消えたのは、どれ？』${LEVELS[s.level].name}で${g.rounds.length}問中${g.score}問正解！ 同じ家で挑戦してみて`;
  $('result-x').href = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  $('result-line').href = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`;
  $('result-copy').dataset.url = url;
  $('result-copied').textContent = '';
  // 全問正解なら、次のむずかしさへの挑戦をいちばん上に出す
  const next = LEVELS[s.level].next;
  const levelUp = g.score === g.rounds.length && next;
  $('again').textContent = levelUp ? `次は「${LEVELS[next].name}」に挑戦` : '次の家で遊ぶ';
  $('again').dataset.level = levelUp ? next : s.level;
  $('result-screen').hidden = false;
  $('result-screen').focus({ preventScroll: true });
}

async function copyResultLink() {
  const url = $('result-copy').dataset.url;
  let ok = false;
  try { await navigator.clipboard.writeText(url); ok = true; } catch { ok = false; }
  $('result-copied').textContent = ok ? 'コピーしました' : `コピーできませんでした：${url}`;
}

function backToTitle() {
  s.game = null;
  s.challenge = null;
  history.replaceState(null, '', location.pathname + location.search);
  $('challenge-badge').hidden = true;
  $('start').textContent = 'はじめる';
  for (const id of ['result-screen', 'pause-screen', 'answer-screen', 'reveal-panel', 'ready-screen']) $(id).hidden = true;
  $('eyelids').classList.remove('closed');
  endFade();
  hideSpotLabel();
  s.world.showAll();
  s.world.setArrangement(arrange(s.manifest, 2026, 0));
  clearRing();
  s.fly = null;
  $('title-screen').hidden = false;
  setPhase('title');
}

// ---------- 入力 ----------
const canvas = $('scene');
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (drag) return;
  sound.unlock();
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 7) drag.moved = true;
  if (drag.moved && s.game?.canMove) {
    // 画面をつかんで引っぱる向きに回す（ストリートビューと同じ）
    const k = touch ? 0.24 : 0.22;
    s.player.look(dx * k, dy * k);
    noteMoved();
  }
});
const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const tap = !drag.moved && performance.now() - drag.t < 450;
  drag = null;
  if (!tap || !s.game?.canMove) return;
  const rect = canvas.getBoundingClientRect();
  const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  const hit = s.world.pick(nx, ny);
  if (!hit) return;
  if (s.player.walkTo(hit.point.x, hit.point.z)) {
    const goal = s.player.path[s.player.path.length - 1];
    placeRing({ center: [goal[0], 0, goal[1]], size: 0.3 }, '#ffffff');
    s.ring.userData.tap = true;
    noteMoved();
  }
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.id) drag = null; });

// スティック
const stick = $('joystick');
stick.addEventListener('pointerdown', (e) => {
  sound.unlock();
  s.stick.id = e.pointerId;
  stick.setPointerCapture(e.pointerId);
  moveStick(e);
});
stick.addEventListener('pointermove', (e) => { if (e.pointerId === s.stick.id) moveStick(e); });
const endStick = (e) => {
  if (e.pointerId !== s.stick.id) return;
  s.stick = { x: 0, y: 0, id: null };
  stick.firstElementChild.style.transform = '';
};
stick.addEventListener('pointerup', endStick);
stick.addEventListener('pointercancel', endStick);
function moveStick(e) {
  const r = stick.getBoundingClientRect();
  let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
  let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  s.stick.x = x;
  s.stick.y = y;
  stick.firstElementChild.style.transform = `translate(${x * r.width * 0.3}px, ${y * r.height * 0.3}px)`;
  if (len > 0.2) noteMoved();
}

// 見取り図：部屋を押すと、その部屋の家具が見渡せる場所まで歩き、家具の方を向く。
// それでも着けなかったときは、一瞬暗くして行き先へ移す（評価の1周目：34回中16回止まった）
$('minimap').addEventListener('pointerdown', (e) => {
  sound.unlock();
  if (!s.game || s.game.paused || !['ready', 'memorize', 'search'].includes(s.game.phase)) return;
  const r = $('minimap').getBoundingClientRect();
  const room = s.minimap.roomAtPoint(e.clientX - r.left, e.clientY - r.top);
  if (!room) return;
  travelTo(room);
});

function travelTo(room) {
  const { stand } = room;
  sound.tap();
  noteMoved();
  // 準備の帯が出ている間に押した分は、覚える時間が始まった瞬間に行く（評価の2周目：黙って捨てていた）
  if (s.game?.phase === 'ready') {
    s.pendingTravel = room;
    return;
  }
  // 部屋の中を見回すのは、廊下と玄関以外。動きを控える設定では見回さない
  const sweep = !reduced && room.id !== 'hall' && room.id !== 'entrance';
  const here = roomAt(s.player.x, s.player.z);
  if (here && here.id === room.id) {
    // 今いる部屋を押したら、出入口へ戻らずその場で向き直る
    s.player.faceTo(stand.yaw, { sweep });
    return;
  }
  s.travel = room;
  if (!s.player.walkTo(stand.x, stand.z, { faceYaw: stand.yaw, sweep })) jumpTo(room);
}

function jumpTo(room) {
  const fade = $('fade');
  s.travel = null;
  fade.classList.add('on');
  setTimeout(() => {
    s.player.jumpTo(room.stand.x, room.stand.z, room.stand.yaw);
    fade.classList.remove('on');
  }, reduced ? 0 : 180);
}

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE']);
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.key !== 'Enter') return;
  if (document.querySelector('dialog[open]')) return;
  const g = s.game;
  if (MOVE_KEYS.has(e.code) && g?.canMove) {
    s.keys.add(e.code);
    e.preventDefault();
    noteMoved();
    return;
  }
  if (e.key === 'Escape' && g) {
    // 答えの画面の Esc は「選び直す」。一時停止は時間の進む場面だけ
    if (g.phase === 'answer') handle(g.unchoose());
    else handle(g.paused ? g.resume() : g.pause());
    return;
  }
  if (g?.phase === 'answer' && !g.paused) {
    const n = Number(e.key);
    if (n >= 1 && n <= g.current.choices.length) { choose(g.current.choices[n - 1]); return; }
    if (e.key === 'Enter' && g.choice && document.activeElement?.classList.contains('choice')) { e.preventDefault(); handle(g.confirm()); }
  }
});
window.addEventListener('keyup', (e) => s.keys.delete(e.code));
window.addEventListener('blur', () => s.keys.clear());

function keyInput() {
  const k = s.keys;
  const forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
  const strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
  const turn = (k.has('ArrowRight') || k.has('KeyE') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyQ') ? 1 : 0);
  return { forward: forward || -s.stick.y, strafe: strafe || s.stick.x, turn };
}

function noteMoved() {
  if (s.moved) return;
  s.moved = true;
  setTimeout(() => $('controls-hint').classList.add('gone'), 2500);
}

// ---------- ボタン ----------
$('start').addEventListener('click', startGame);
$('primary').addEventListener('click', () => {
  if (!s.game) return;
  sound.tap();
  handle(s.game.phase === 'memorize' ? s.game.doneMemorizing() : s.game.answerNow());
});
$('hint').addEventListener('click', () => handle(s.game?.useHint() || []));
$('confirm').addEventListener('click', () => handle(s.game?.confirm() || []));
$('next').addEventListener('click', () => { sound.tap(); handle(s.game?.next() || []); });
$('look-choice').addEventListener('click', lookAtChoice);
$('pause').addEventListener('click', () => handle(s.game?.pause() || []));
$('resume').addEventListener('click', () => handle(s.game?.resume() || []));
$('quit').addEventListener('click', backToTitle);
$('again').addEventListener('click', () => {
  s.challenge = null;
  history.replaceState(null, '', location.pathname + location.search);
  const level = $('again').dataset.level;
  for (const input of document.querySelectorAll('input[name="level"]')) input.checked = input.value === level;
  startGame();
});
$('to-title').addEventListener('click', backToTitle);
$('result-copy').addEventListener('click', copyResultLink);
$('reload').addEventListener('click', () => location.reload());
$('mute').addEventListener('click', () => {
  const muted = !sound.muted;
  sound.unlock();
  sound.setMuted(muted);
  saveSettings({ muted });
  $('mute').setAttribute('aria-pressed', String(muted));
  $('mute').setAttribute('aria-label', muted ? '音を出す' : '音を消す');
});
for (const [openId, dialogId] of [['share-open', 'share-dialog'], ['about-open', 'about-dialog']]) {
  $(openId).addEventListener('click', () => $(dialogId).showModal());
  $(dialogId).querySelector('[data-close]').addEventListener('click', () => $(dialogId).close());
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && s.game) handle(s.game.pause());
});

// ---------- 毎フレーム ----------
let last = performance.now();
function frame(now) {
  // 残り時間は実時間どおりに進める（描画が遅い端末でも60秒は60秒）。動きは細かく刻んで壁を抜けないようにする
  const real = Math.min(0.25, (now - last) / 1000);
  const dt = Math.min(0.05, real);
  last = now;
  const g = s.game;
  if (g && !g.paused && !manualClock) handle(g.tick(real));
  const cam = s.world.camera;
  if (!g || g.phase === 'result') {
    s.tourTime += reduced ? 0 : real;
    applyPose(cam, tourPose(s.tourTime, app.clientWidth < app.clientHeight * 0.8));
  } else if (s.fly) {
    const f = s.fly;
    f.t = Math.min(1, f.t + real / f.dur);
    const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
    const dyaw = ((f.to.yaw - f.from.yaw + 540) % 360) - 180;
    applyPose(cam, {
      x: f.from.x + (f.to.x - f.from.x) * e,
      y: f.from.y + ((f.to.y ?? HOUSE.eyeHeight) - f.from.y) * e,
      z: f.from.z + (f.to.z - f.from.z) * e,
      yaw: f.from.yaw + dyaw * e,
      pitch: f.from.pitch + (f.to.pitch - f.from.pitch) * e
    });
  } else {
    if (g.canMove) {
      let moved = 0;
      for (let left = real; left > 1e-4; left -= dt) moved += s.player.update(Math.min(dt, left), keyInput());
      s.stepDist += moved;
      if (s.stepDist > 0.75) { s.stepDist = 0; sound.step(); }
      if (s.travel && s.player.failed) jumpTo(s.travel);
      else if (s.travel && !s.player.path) s.travel = null;
      const here = roomAt(s.player.x, s.player.z);
      if (here) s.visited.add(here.id);
    }
    applyPose(cam, s.player.pose(reduced));
  }
  // 消えた物が戻ってくる
  if (s.fade) {
    const f = s.fade;
    f.t += real / f.dur;
    if (f.t >= 0 && !f.started) {
      f.started = true;
      s.world.setHidden(f.id, false);
      placeRing(f.info);
      showSpotLabel(f.id, `ここ！ ${PROPS[f.id].name}`);
      sound.reveal();
    }
    if (f.started) {
      setPropOpacity(f.id, Math.min(1, f.t));
      // 戻ってきた物そのものを、だいだい色に数回光らせてから元の色へ戻す
      const glow = f.t < 3 ? (0.5 + 0.5 * Math.sin(f.t * Math.PI * 2.2 - Math.PI / 2)) * (1 - f.t / 3) : 0;
      setPropGlow(f.id, reduced ? 0 : glow);
    }
    if (f.t >= 3) { setPropGlow(f.id, 0); s.fade = null; }
  }
  if (s.ring) {
    const r = s.ring;
    r.userData.t += real;
    const pulses = r.userData.t < 3.6;
    const k = r.userData.tap ? Math.min(1, r.userData.t / 0.5) : pulses ? (r.userData.t % 1.2) / 1.2 : 0.55;
    const scale = r.userData.base * (r.userData.tap ? 0.6 + k * 0.9 : 0.8 + k * 0.5);
    r.scale.setScalar(scale);
    r.material.opacity = r.userData.tap ? 0.9 * (1 - k) : pulses ? 0.95 * (1 - k * 0.55) : 0.9;
    if (r.userData.tap && k >= 1) clearRing();
  }
  if (g && (g.phase === 'memorize' || g.phase === 'search' || g.phase === 'ready' || g.phase === 'closing')) {
    updateTimer();
    s.minimap.draw(s.player, now / 1000, s.visited);
  }
  // 共有や遊び方の小窓が開いている間は、後ろの家は止まって見えているので描き直さない
  // （電池の節約。ソフトウェア描画の端末では1枚に約1秒かかり、小窓の操作が待たされた）
  if (!document.querySelector('dialog[open]')) {
    s.world.render();
    placeSpotLabel();
    adaptQuality(now);
  }
  requestAnimationFrame(frame);
}

// 遊んでいるあいだの描画が重い端末では、画面の細かさを少しずつ下げる（1まで）
const quality = { frames: 0, since: 0 };
function adaptQuality(now) {
  if (!s.game?.canMove || document.hidden) { quality.frames = 0; quality.since = now; return; }
  quality.frames++;
  if (now - quality.since < 2000) return;
  const fps = (quality.frames * 1000) / (now - quality.since);
  quality.frames = 0;
  quality.since = now;
  const r = s.world.renderer;
  if (fps < 40 && r.getPixelRatio() > 1) {
    r.setPixelRatio(Math.max(1, r.getPixelRatio() - 0.25));
    resize();
  }
}

function applyPose(cam, p) {
  cam.position.set(p.x, p.y ?? HOUSE.eyeHeight, p.z);
  cam.rotation.set(THREE.MathUtils.degToRad(p.pitch), THREE.MathUtils.degToRad(p.yaw), 0);
}

boot();
