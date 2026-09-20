/* 画面。音の時計から拍を出し、拍から絵を作る。

   描画は requestAnimationFrame で回すが、位置の計算に performance.now() を使わない。
   フレームが落ちても、砲弾は音とずれない位置に描かれる。 */

import { CALIBRATION_LIMIT_MS, CALIBRATION_STEP_MS, beatToSeconds, readCalibration, secondsToBeat, writeCalibration } from './lib/beat.js';
import { CHARTS, FLIGHT_BEATS, expandChart } from './lib/chart.js';
import { labelOf, stageOf, toNextStage } from './lib/damage.js';
import { GameState } from './lib/game.js';
import { LABEL, WINDOW, RANK_LADDER, nextRank } from './lib/judge.js';
import { AudioEngine, Scheduler } from './lib/audio.js';
import { BEATS_PER_BAR, buildAccompaniment, chordAt, countInTicks, midiToFreq } from './lib/music.js';
import { createCamera, createViewport, faceDepth, faceLight, fogAmount, placeModel, project, toFill } from './lib/scene3d.js';
import { makeBow, makeEnemyShip, makeGull, makeOar, makeSphere } from './lib/models.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const canvas = $('scene');
const context = canvas.getContext('2d');

const HIT_Z = 4.6;       // 打つ位置（船首の先端のすぐ向こう）
const START_Z = 74;      // 発射位置（敵船のあたり）
const HIT_Y = 0.85;      // 打点の高さ。目線より下げないと、水平線と敵船に重なって読めない

const SKY_TOP = [26, 34, 62];
const SKY_LOW = [232, 146, 96];
const SEA_DEEP = [16, 30, 52];

const engine = new AudioEngine();
const camera = createCamera();
const sphere = makeSphere(0.24, 1);
const bow = makeBow();
const oar = makeOar();

// 段ごとの敵船は使い回す（毎フレーム組み立て直さない）
const shipCache = new Map();
const shipAtStage = (stage) => {
  if (!shipCache.has(stage)) shipCache.set(stage, makeEnemyShip(stage));
  return shipCache.get(stage);
};

const SHIP_Z = 82;

let viewport = createViewport(1, 1);
let chartName = 'main';
let game = null;
let accompaniment = [];
let scheduler = null;
let songStart = 0;          // 曲の頭（カウントインの開始）の、音の時計での時刻
let calibrationMs = 0;
let nextTone = 0;
let nextFire = 0;
let frame = null;
let lastSwing = -10;
let effects = [];
let loggedInvalid = false;
// 直前の結果の平均ズレ（ms）と、補正画面から戻る先
let lastDriftMs = null;
let calibrationCameFrom = 'empty';

/* 敵船に届いた回数と、その見た目。打った瞬間ではなく「弾が届いた瞬間」に増やす。
   打つ→飛ぶ→当たる→崩れる、の因果を目で追えるようにするため。 */
let shipHits = 0;
const impacted = new Set();
let debris = [];
let flashes = [];

// ---------------------------------------------------------------- 状態

function setState(next) {
  if (app.dataset.state === next) return;
  app.dataset.state = next;
  const log = app.dataset.stateLog ? app.dataset.stateLog.split(' ') : [];
  if (log[log.length - 1] !== next) app.dataset.stateLog = [...log, next].join(' ');
}

/** 不正入力（拍と関係ない入力・範囲外の補正値）が起きたことを1度だけ記録する。 */
function markInvalid() {
  app.dataset.invalid = '1';
  if (loggedInvalid) return;
  loggedInvalid = true;
  const log = app.dataset.stateLog ? app.dataset.stateLog.split(' ') : [];
  app.dataset.stateLog = [...log, 'invalid'].join(' ');
}

function fail(message) {
  $('error-message').textContent = message;
  stopLoop();
  if (scheduler) scheduler.stop();
  engine.suspend();
  setState('error');
}

// ---------------------------------------------------------------- 進行

function songSeconds() {
  return engine.now - songStart;
}

function currentBeat() {
  return secondsToBeat(songSeconds(), game.bpm);
}

function scheduleUpTo(untilContextTime) {
  const horizon = untilContextTime - songStart;

  while (nextTone < accompaniment.length) {
    const event = accompaniment[nextTone];
    const at = beatToSeconds(event.beat, game.bpm);
    if (at > horizon) break;
    engine.playTone(songStart + at, event);
    nextTone += 1;
  }

  while (nextFire < game.objects.length) {
    const object = game.objects[nextFire];
    const at = beatToSeconds(object.fireBeat, game.bpm);
    if (at > horizon) break;
    engine.playFire(songStart + at, object.kind);
    nextFire += 1;
  }
}

async function begin(name) {
  chartName = name;
  const expanded = expandChart(CHARTS[name]);
  game = new GameState(expanded);
  accompaniment = [...countInTicks(), ...buildAccompaniment(expanded.beats)].sort((a, b) => a.beat - b.beat);
  nextTone = 0;
  nextFire = 0;
  effects = [];
  debris = [];
  flashes = [];
  shipHits = 0;
  impacted.clear();
  lastSwing = -10;
  delete app.dataset.invalid;

  setState('loading');
  try {
    await engine.start();
  } catch (error) {
    fail(error.message || '音を出せませんでした');
    return;
  }

  songStart = engine.now + 0.25;
  scheduler = scheduler || new Scheduler(engine, scheduleUpTo);
  scheduler.start();
  startLoop();
}

function finish() {
  /* ⚠️ 曲が終わってもループは回り続けるので、番をしないと毎フレーム結果を作り直す。
     見た目には気づけないが、補正画面へ移ろうとしても次のフレームで結果へ戻されていた。 */
  if (app.dataset.state === 'result' || app.dataset.state === 'calibrating') return;
  game.expire(Infinity);
  scheduler.stop();
  /* ⚠️ ここでループを止めてはいけない。結果に移ると海の枠が縮み、
     ResizeObserver が canvas の大きさを入れ直す＝中身が消える。描き直す者がいないと
     真っ黒な箱だけが残り、50秒かけて沈めた敵船という一番の見せ場が消える（体験評価3周目）。
     二重に結果を作らない番は上の1行で足りる。 */
  const summary = game.summary();

  $('rank').textContent = summary.rank.label;
  $('rank-note').textContent = summary.rank.note;
  $('tally').innerHTML = [
    ['ドンピシャ', summary.perfect], ['おしい', summary.good],
    ['ミス', summary.miss], ['から振り', summary.whiff]
  ].map(([label, value]) => `<div class="tally__row"><dt>${label}</dt><dd>${value}</dd></div>`).join('');
  const step = nextRank(summary);
  $('ladder').textContent = step
    ? `${RANK_LADDER.join(' → ')}　／　あと ${step.needed} 発ドンピシャで「${step.label}」`
    : `${RANK_LADDER.join(' → ')}　／　いちばん上まで来た`;
  $('ship-state').textContent = shipHits > 0
    ? `敵船は「${labelOf(stageOf(shipHits))}」。ドンピシャで返した弾が ${shipHits} 発届いた`
    : '敵船には1発も届かなかった。届くのはドンピシャで返した弾だけ';
  const drift = summary.averageOffsetMs;
  lastDriftMs = drift;
  $('offset-note').textContent = drift === null
    ? ''
    : Math.abs(drift) <= 8
      ? '押すタイミングの平均のズレは、ほとんどありません'
      : `押すタイミングは平均 ${Math.abs(drift)}ms ${drift > 0 ? 'おそい' : 'はやい'}。`
        + `下の「音のズレを直す」を押すと、この値を入れた状態で開きます`;
  /* 一度も押していない回に「カモメを我慢できた 2/2」と満点が出るのはおかしい（体験評価3周目）。
     押した回だけ我慢の話をする。 */
  const played = summary.perfect + summary.good + summary.whiff > 0;
  $('extra').textContent = summary.gullsTotal > 0 && played
    ? `ドンピシャの連続 ${summary.bestCombo} ／ カモメを我慢できた回数 ${summary.gullsHeld} / ${summary.gullsTotal}`
    : `ドンピシャの連続 ${summary.bestCombo}`;

  setState('result');
  // 海を小さくしてもなお下に長い画面があるので、結果そのものを画面内へ運ぶ
  document.querySelector('.panel--result').scrollIntoView({ block: 'center', behavior: 'smooth' });
}

// ---------------------------------------------------------------- 入力

function press(performanceMs) {
  const state = app.dataset.state;
  if (state !== 'playing' && state !== 'loading') return;
  const at = engine.toContextTime(performanceMs) - songStart - calibrationMs / 1000;
  const hit = game.press(at);

  lastSwing = songSeconds();
  const bar = Math.floor(Math.max(0, currentBeat()) / BEATS_PER_BAR);

  if (hit.result === 'whiff') {
    engine.playWhiff();
    markInvalid();
  } else if (hit.result === 'miss') {
    // 振ってはいるので空を切る音を鳴らし、そのうえで船に当たった音を重ねる
    engine.playWhiff();
    engine.playMiss();
  } else {
    engine.playHit(hit.result, midiToFreq(chordAt(bar).pad[2]));
    effects.push({ at: songSeconds(), quality: hit.result });
  }
  showVerdict(hit.practice && hit.result !== 'whiff' ? `れんしゅう ${LABEL[hit.result]}` : LABEL[hit.result], hit.offset);
}

/* 判定と、ズレの向き。方向を出さないと「次にどう直せばいいか」が分からない
   （体験評価1周目：130ms遅らせ続けても『ミス』としか出なかった）。 */
function showVerdict(text, offsetSeconds = null) {
  const verdict = $('verdict');
  $('verdict-main').textContent = text;
  $('verdict-dir').textContent =
    offsetSeconds === null || Math.abs(offsetSeconds) <= WINDOW.perfect
      ? ''
      : offsetSeconds > 0 ? 'おそい' : 'はやい';
  verdict.dataset.shown = String(Date.now());
}

// ---------------------------------------------------------------- 描画

/* ⚠️ 画面が隠れている間（.stage が display:none）は大きさが 0 になる。
   最初の1回だけ測って終わりにすると、遊び始めても 1×1 のままの絵が引き伸ばされる。
   実際にそれを作り込んで、スクショが単色の四角になった。大きさは見張る。 */
function resize() {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  // 大きさを入れ直すと中身が消えるので、止まっている時は自分で描き直す
  const redraw = frame === null && game !== null;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  viewport = createViewport(canvas.width, canvas.height);
  if (redraw) draw();
}

function skyColorAt(y) {
  const t = Math.max(0, Math.min(1, y / viewport.horizon));
  return SKY_TOP.map((channel, index) => Math.round(channel + (SKY_LOW[index] - channel) * t));
}

function drawBackground() {
  const sky = context.createLinearGradient(0, 0, 0, viewport.horizon);
  sky.addColorStop(0, `rgb(${SKY_TOP.join(' ')})`);
  sky.addColorStop(1, `rgb(${SKY_LOW.join(' ')})`);
  context.fillStyle = sky;
  context.fillRect(0, 0, viewport.width, viewport.horizon + 1);

  // 水平線のすぐ上の光
  const glow = context.createRadialGradient(
    viewport.width * 0.5, viewport.horizon, 0,
    viewport.width * 0.5, viewport.horizon, viewport.width * 0.45
  );
  glow.addColorStop(0, 'rgba(255 226 178 / 0.55)');
  glow.addColorStop(1, 'rgba(255 226 178 / 0)');
  context.fillStyle = glow;
  context.fillRect(0, 0, viewport.width, viewport.horizon + 2);

  const sea = context.createLinearGradient(0, viewport.horizon, 0, viewport.height);
  sea.addColorStop(0, `rgb(${SEA_DEEP.map((c) => c + 40).join(' ')})`);
  sea.addColorStop(1, `rgb(${SEA_DEEP.join(' ')})`);
  context.fillStyle = sea;
  context.fillRect(0, viewport.horizon, viewport.width, viewport.height - viewport.horizon);
}

/** 波。奥から手前へ流れる横線だけで作る。面を張ると重く、見た目も良くならない。 */
function drawSea(time) {
  context.lineWidth = Math.max(1, viewport.height / 420);
  for (let index = 0; index < 26; index += 1) {
    const phase = (index + (time * 0.28) % 1) / 26;
    const depth = 3 + phase * phase * 120;
    const left = project({ x: -60, y: 0, z: depth }, camera, viewport);
    const right = project({ x: 60, y: 0, z: depth }, camera, viewport);
    if (!left.visible) continue;
    const fade = 0.16 * (1 - fogAmount(depth, 10, 120));
    context.strokeStyle = `rgba(196 224 255 / ${fade.toFixed(3)})`;
    context.beginPath();
    const wobble = Math.sin(time * 1.6 + index) * (viewport.height / 500);
    context.moveTo(left.x, left.y + wobble);
    context.lineTo(right.x, right.y - wobble);
    context.stroke();
  }
}

const buffer = [];

function pushModel(model, options) {
  const placed = placeModel(model, options);
  for (const face of placed.faces) {
    const points = face.v.map((index) => project(
      { x: placed.vertices[index][0], y: placed.vertices[index][1], z: placed.vertices[index][2] },
      camera, viewport
    ));
    if (points.some((point) => !point.visible)) continue;
    const depth = faceDepth(placed.vertices, face);
    buffer.push({
      depth,
      points,
      fill: toFill(face.color, faceLight(placed.vertices, face), fogAmount(depth), skyColorAt(viewport.horizon - 1))
    });
  }
}

function flushBuffer() {
  buffer.sort((a, b) => b.depth - a.depth);
  for (const item of buffer) {
    context.fillStyle = item.fill;
    context.beginPath();
    context.moveTo(item.points[0].x, item.points[0].y);
    for (let index = 1; index < item.points.length; index += 1) context.lineTo(item.points[index].x, item.points[index].y);
    context.closePath();
    context.fill();
  }
  buffer.length = 0;
}

/** 飛んでくる物の横位置。中央付近に散らす（狙う場所ではなく、拍で当てさせるため）。 */
const laneOf = (id) => ((id % 3) - 1) * 0.85;

/* 発射からの進み具合 → 奥行き。まっすぐ割ると、見かけの大きさが最後の数%で急に膨らみ、
   飛んでいる間ほとんど見えない。同じ割合ずつ近づく形にして、一定の速さで大きくなるようにする。 */
const depthAt = (progress) => START_Z * (HIT_Z / START_Z) ** progress;

/** 砲弾の山なり。空を背負わせて、水平線と敵船に重ならないようにする。 */
const arcAt = (p) => Math.sin(Math.min(1, Math.max(0, p)) * Math.PI) * 2.6;

/* 水面に落とす影。砲弾が海の上に来ると輪郭が沈むので（体験評価3周目）、
   高さと距離の手がかりを別に足す。面ではなく直接描くので、模型より先に塗られる＝下に入る。 */
function drawWaterShadow(x, y, z) {
  const at = project({ x, y: 0, z }, camera, viewport);
  if (!at.visible) return;
  const fade = Math.max(0.08, 0.34 - y * 0.05);
  context.fillStyle = `rgba(6 14 28 / ${fade.toFixed(3)})`;
  context.beginPath();
  context.ellipse(at.x, at.y, at.scale * 0.34, at.scale * 0.12, 0, 0, Math.PI * 2);
  context.fill();
}

function drawObjects(beat, time) {
  for (const object of game.objects) {
    const from = object.fireBeat;
    const to = object.arriveBeat;
    const gone = object.kind === 'gull' ? to + 3 : to + 2.4;
    if (beat < from - 0.2 || beat > gone) continue;

    if (object.kind === 'gull') {
      const p = (beat - from) / (to - from);
      const x = laneOf(object.id) * Math.min(1, Math.max(0.2, p));
      const height = HIT_Y + 1.5 + Math.sin(beat * 1.4) * 0.22;
      pushModel(makeGull(beat * 5.5), { position: [x, height, depthAt(p)], scale: 0.62, yaw: Math.PI });
      continue;
    }

    const noteIndexes = game.notesByObject.get(object.id) ?? [];
    noteIndexes.forEach((noteIndex, order) => {
      const hitBeat = object.hits[order];
      const p = (beat - from) / (hitBeat - from);
      if (p < -0.05) return;

      const lane = laneOf(object.id);
      const result = game.results.get(noteIndex);

      /* まだ打点に届いていない弾と、打ち返せなかった弾は、そのまま飛んでくる。 */
      if (p <= 1 || (result !== 'perfect' && result !== 'good')) {
        if (p > 1.3) return;
        const x = lane * Math.min(1, Math.max(0.2, p));
        const y = HIT_Y + arcAt(p);
        drawWaterShadow(x, y, depthAt(p));
        pushModel(sphere, { position: [x, y, depthAt(p)], scale: 1 + Math.min(1, p) * 0.3 });
        return;
      }

      const back = Math.max(0, 2 - p);

      /* おしいの弾は打ち返せてはいるが失速する。海へ落ちて、敵船には届かない。
         ここが「ドンピシャだけが船を崩す」という手応えの根っこ。 */
      if (result === 'good') {
        const fall = Math.min(1, (p - 1) / 0.55);
        if (fall >= 1) return;
        pushModel(sphere, {
          position: [lane * back, (HIT_Y + arcAt(back) * 0.5) * (1 - fall), depthAt(back)],
          scale: 1 + back * 0.3
        });
        return;
      }

      /* ドンピシャの弾は敵船まで戻っていく。着弾の処理は resolveImpacts 側。 */
      if (p > 2.05) return;
      pushModel(sphere, {
        position: [lane * back, HIT_Y + arcAt(back) + (p - 1) * 1.8, depthAt(back)],
        scale: 1 + back * 0.3
      });
    });
  }
}

/** 打ち返した瞬間の輪と、敵船側の閃光・破片。面ではなく線と塗りで描く。 */
function drawImpacts(time) {
  for (const effect of effects) {
    const age = time - effect.at;
    if (age > 0.45) continue;
    const spread = 0.4 + age * 5;
    context.strokeStyle = `rgba(255 236 200 / ${(1 - age / 0.45).toFixed(2)})`;
    context.lineWidth = Math.max(1.5, viewport.height / 260);
    const middle = project({ x: 0, y: HIT_Y, z: HIT_Z + 0.4 }, camera, viewport);
    context.beginPath();
    context.arc(middle.x, middle.y, middle.scale * spread * 0.25, 0, Math.PI * 2);
    context.stroke();
  }
  effects = effects.filter((effect) => time - effect.at <= 0.45);

  for (const flash of flashes) {
    const age = time - flash.at;
    if (age > 0.4) continue;
    const at = project({ x: 0, y: 2.4, z: SHIP_Z }, camera, viewport);
    if (!at.visible) continue;
    context.fillStyle = `rgba(255 238 202 / ${(0.6 * (1 - age / 0.4)).toFixed(3)})`;
    context.beginPath();
    context.arc(at.x, at.y, at.scale * (flash.big ? 3.4 : 1.7) * (0.3 + age * 2.4), 0, Math.PI * 2);
    context.fill();
  }
  flashes = flashes.filter((flash) => time - flash.at <= 0.4);

  for (const piece of debris) {
    const age = time - piece.at;
    if (age > 1.4) continue;
    const at = project(
      { x: piece.x + piece.vx * age, y: Math.max(0, piece.y + piece.vy * age - 4.9 * age * age), z: SHIP_Z },
      camera, viewport
    );
    if (!at.visible) continue;
    const size = Math.max(1.2, at.scale * 0.7);
    context.fillStyle = `rgba(52 36 24 / ${Math.max(0, 1 - age / 1.4).toFixed(2)})`;
    context.beginPath();
    context.moveTo(at.x, at.y - size);
    context.lineTo(at.x + size, at.y + size * 0.8);
    context.lineTo(at.x - size * 0.8, at.y + size * 0.6);
    context.closePath();
    context.fill();
  }
  debris = debris.filter((piece) => time - piece.at <= 1.4);
}

function drawOwnShip(time) {
  const since = time - lastSwing;
  const swing = since < 0.26 ? Math.sin((since / 0.26) * Math.PI) : 0;
  pushModel(bow, { position: [0, 0.02, 2.6], scale: 1 });
  pushModel(oar, {
    position: [0.62 - swing * 0.55, 0.42 + swing * 0.34, 3.15],
    scale: 0.8,
    yaw: -0.62 + swing * 1.45
  });
}

function draw() {
  const time = songSeconds();
  const beat = currentBeat();

  drawBackground();
  drawSea(time);

  pushModel(shipAtStage(stageOf(shipHits)), { position: [0, 0, SHIP_Z], scale: 1.5, yaw: 0.2 });
  drawObjects(beat, time);
  drawOwnShip(time);
  flushBuffer();
  drawImpacts(time);
  drawProgress(beat);
  if (beat < 0) drawCountIn(beat);

  const remaining = game.total - game.done;
  $('remaining').textContent = beat < 0 ? 'れんしゅう' : `砲弾 のこり ${remaining}発`;
  $('combo').textContent = game.combo >= 2 ? `ドンピシャ ${game.combo} 連続` : '';
  $('ship').textContent = shipHits > 0 ? `敵船 ${labelOf(stageOf(shipHits))}` : '';

  const verdict = $('verdict');
  if (verdict.dataset.shown && Date.now() - Number(verdict.dataset.shown) > 700) {
    $('verdict-main').textContent = '';
    $('verdict-dir').textContent = '';
  }
}

/* 曲のどこまで来たか。残り砲弾数だけだと、時間の進み具合が分からない
   （体験評価1周目：「のこり NN」を秒だと誤読された）。 */
function drawProgress(beat) {
  const height = Math.max(2, viewport.height / 220);
  context.fillStyle = 'rgba(255 255 255 / 0.14)';
  context.fillRect(0, 0, viewport.width, height);
  if (beat <= 0) return;
  context.fillStyle = 'rgba(255 214 160 / 0.85)';
  context.fillRect(0, 0, viewport.width * Math.min(1, beat / game.beats), height);
}

/** カウントインの見せ方。画面の外の小さな文字では気づかれないので、海の上に大きく出す。 */
function drawCountIn(beat) {
  const middle = viewport.width / 2;
  const base = viewport.horizon + viewport.height * 0.12;
  context.textAlign = 'center';
  context.fillStyle = '#fff';
  context.shadowColor = 'rgba(0 0 0 / 0.6)';
  context.shadowBlur = viewport.height / 60;

  if (beat < -4) {
    context.font = `700 ${Math.round(viewport.height * 0.075)}px system-ui, sans-serif`;
    context.fillText('れんしゅう', middle, base);
    context.font = `500 ${Math.round(viewport.height * 0.038)}px system-ui, sans-serif`;
    context.fillText('音が鳴ったら、2拍あとに1回押す', middle, base + viewport.height * 0.07);
  } else {
    context.font = `800 ${Math.round(viewport.height * 0.14)}px system-ui, sans-serif`;
    context.fillText(String(Math.max(1, Math.ceil(-beat))), middle, base + viewport.height * 0.02);
  }
  context.shadowBlur = 0;
  context.textAlign = 'start';
}

function tick() {
  frame = requestAnimationFrame(tick);
  if (!game) return;

  /* 読込中はカウントインの8拍ぶん。前半で練習の1発、後半で数える。
     音の時計が動いた瞬間に遊べる状態へ切り替えると、この状態が0.25秒で終わって意味を持たない。 */
  const beatNow = currentBeat();
  if (app.dataset.state === 'loading') {
    if (beatNow >= 0) setState('playing');
    else $('counting').textContent = beatNow < -4 ? 'れんしゅう' : `用意… ${Math.max(1, Math.ceil(-beatNow))}`;
  }

  resolveImpacts(beatNow);

  const time = songSeconds();
  if (game.expire(time).length > 0) {
    engine.playMiss();
    showVerdict(LABEL.miss);
  }

  draw();

  if (time > beatToSeconds(game.beats, game.bpm)) finish();
}

/* ドンピシャで打ち返した弾が敵船へ届いたかを見る。
   おしいの弾は失速して海に落ちるので、ここには入らない＝船は崩れない。 */
function resolveImpacts(beat) {
  for (const [noteIndex, result] of game.results) {
    if (result !== 'perfect' || impacted.has(noteIndex)) continue;
    const note = game.notes[noteIndex];
    if (beat < note.beat + FLIGHT_BEATS) continue;

    impacted.add(noteIndex);
    const before = stageOf(shipHits);
    shipHits += 1;
    const after = stageOf(shipHits);

    engine.playDistantHit(after > before);
    flashes.push({ at: songSeconds(), big: after > before });
    const pieces = after > before ? 9 : 4;
    for (let index = 0; index < pieces; index += 1) {
      debris.push({
        at: songSeconds(),
        x: (Math.random() - 0.5) * 5,
        y: 1.4 + Math.random() * 3.4,
        vx: (Math.random() - 0.5) * 5.5,
        vy: 2.2 + Math.random() * 4.5,
        spin: Math.random() * Math.PI
      });
    }
  }
}

function startLoop() {
  if (frame === null) frame = requestAnimationFrame(tick);
}

function stopLoop() {
  if (frame !== null) cancelAnimationFrame(frame);
  frame = null;
}

// ---------------------------------------------------------------- 組み立て

/* URLのハッシュのうち、補正値ではない部分（dev=short など）。
   補正を書き戻すときに消してしまわないよう、最初に取っておく。 */
let hashExtras = '';

function applyCalibration(ms) {
  calibrationMs = ms;
  $('cal-value').textContent = `${ms > 0 ? '+' : ''}${ms} ms`;
  $('cal-range').value = String(ms);

  const cal = writeCalibration(ms).replace(/^#/, '');
  const parts = [hashExtras, cal].filter(Boolean).join('&');
  history.replaceState(null, '', parts ? `#${parts}` : window.location.pathname + window.location.search);
}

function boot() {
  const rawHash = window.location.hash.replace(/^#/, '');
  hashExtras = rawHash.split('&').filter((part) => part && !part.startsWith('cal=')).join('&');
  const devChart = /(^|&)dev=(short|demo)(&|$)/.exec(rawHash);
  if (devChart) chartName = devChart[2];

  const read = readCalibration(rawHash);
  if (read.invalid) {
    markInvalid();
    $('cal-warning').hidden = false;
  }
  applyCalibration(read.ms);

  resize();
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);

  $('start').addEventListener('click', () => begin(chartName));
  $('again').addEventListener('click', () => begin(chartName));
  $('retry').addEventListener('click', () => begin(chartName));
  $('open-cal').addEventListener('click', () => {
    calibrationCameFrom = 'empty';
    setState('calibrating');
  });
  $('close-cal').addEventListener('click', () => setState(calibrationCameFrom));

  /* 結果から直接ここへ来られるようにする。助言に数値を出しておきながら、
     その画面へ行く手段が無かった（体験評価2周目）。ズレは補正後の残りなので足し込む。 */
  $('fix-from-result').addEventListener('click', () => {
    if (lastDriftMs !== null && Math.abs(lastDriftMs) > 8) {
      const next = Math.max(-CALIBRATION_LIMIT_MS, Math.min(CALIBRATION_LIMIT_MS, calibrationMs + lastDriftMs));
      applyCalibration(Math.round(next / CALIBRATION_STEP_MS) * CALIBRATION_STEP_MS);
    }
    calibrationCameFrom = 'result';
    setState('calibrating');
  });
  $('cal-range').addEventListener('input', (event) => applyCalibration(Number(event.target.value)));

  const hit = (event) => {
    const state = app.dataset.state;
    if (state !== 'playing' && state !== 'loading') return;
    event.preventDefault();
    press(event.timeStamp);
  };
  $('stage').addEventListener('pointerdown', hit);
  $('tap').addEventListener('pointerdown', hit);
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' && event.code !== 'Enter') return;
    if (event.repeat) return;
    if (app.dataset.state === 'empty' && document.activeElement === document.body) {
      event.preventDefault();
      begin(chartName);
      return;
    }
    hit(event);
  });

  // タブを離れると音の時計と画面がずれる。黙って続けず、中断したことを伝える
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (app.dataset.state === 'playing' || app.dataset.state === 'loading')) {
      fail('タブを離れたので中断しました。音と拍がずれるため、そのまま続けません。');
    }
  });

  $('cal-limit').textContent = `±${CALIBRATION_LIMIT_MS}ms・${CALIBRATION_STEP_MS}ms刻み`;

  /* 開発用の口。URLに dev= が入っているときだけ開く。
     打点ちょうどで押したときに本当にドンピシャになるかは、
     人の手では確かめられない（±35ms）。デモ録画と自動テストはここから叩く。 */
  if (/(^|&)dev=/.test(rawHash)) {
    window.__day012 = {
      press,
      songSeconds: () => (game ? songSeconds() : 0),
      noteTimes: () => (game ? game.notes.map((note) => note.time) : []),
      state: () => app.dataset.state
    };
  }
}

boot();
