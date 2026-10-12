/* 定刻ごはん：画面の組み立てと操作。
   ルールは lib/sim.js（基準の写し）。発車で1回だけ走らせ、その timeline を時刻だけで再生する
   （1分＝0.5秒、2倍で0.25秒。「ジリジリ」の間だけ1分＝1.2秒。lib/playback.js）。
   プレイヤーが決めるのは出発順と分岐の向きだけ。結果の文は lib/explain.js、運行図は lib/chart.js。 */
import { LEVELS } from './lib/levels-data.js';
import { simulate, starsOf, KINDS } from './lib/sim.js';
import {
  initialPlan, samplePlan, cycleChoice, moveTrain, samePlan, pathOf, pathsOf, branchesOnPath,
  stepsOfPath, currentExit, simInput, branchNodes,
} from './lib/plan.js';
import { explainAll, headline, shareText, starsFor, starsWords, branchLabel, orderOfTrain, orderDish, trainDish, stationName, burnMinute, routeMinutes, timeLossLine } from './lib/explain.js';
import { ingredientIcon, stepIcons, stepWords } from './lib/recipes.js';
import { loadProgress, saveProgress, recordRun, withMuted, levelRecord, startIndex } from './lib/progress.js';
import { createMap, lengthTags } from './lib/render.js';
import { renderChart, chartText } from './lib/chart.js';
import { createAudio } from './lib/audio.js';
import { edgePoints } from './lib/geometry.js';
import { h, clear, fill } from './lib/dom.js';
import { chunkSegments } from './lib/phrase.js';
import { sizzleWindows, advance } from './lib/playback.js';

const TAIL_MIN = 1.2; // 最後の到着のあと、配膳の演出を見せる分
const TOAST_MS = 2800; // 一言が自然に消えるまで

const $ = (id) => document.getElementById(id);
const els = {
  app: $('app'), chips: $('level-chips'), stageTitle: $('stage-title'), stageGoal: $('stage-goal'), stageHint: $('stage-hint'),
  orders: $('orders'), mapSvg: $('map-svg'), mapLabel: $('map-label'), switches: $('map-switches'), clock: $('clock'), toast: $('toast'),
  live: $('live'), legendLen: $('legend-len'), cars: $('cars'), formation: $('formation'), sampleNote: $('sample-note'), sampleEdit: $('btn-sample-edit'),
  result: $('result'), actionbar: $('actionbar'), depart: $('btn-depart'), speed: $('btn-speed'), skip: $('btn-skip'),
  rebuild: $('btn-rebuild'), next: $('btn-next'),
  howto: $('btn-howto'), howtoDialog: $('howto-dialog'), howtoClose: $('btn-howto-close'),
  sound: $('btn-sound'), soundIcon: $('sound-icon'), share: $('btn-share'), shareDialog: $('share-dialog'), shareClose: $('btn-share-close'),
};

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
let progress = loadProgress(storage, LEVELS.map((L) => L.id));
const audio = createAudio();
audio.setMuted(progress.muted);

const media = (q) => window.matchMedia?.(q).matches ?? false;
const reduceMotion = () => media('(prefers-reduced-motion: reduce)');

const state = {
  index: startIndex(LEVELS, progress),
  plan: null,
  selected: null,
  phase: 'edit', // edit | play | result
  failCount: 0, // この面で失敗した回数（面を切り替えたら0に戻す）
  sampleSnapshot: null, // 見本を反映したときの中身。同じ中身のまま発車してクリアしたら★1
  undoBefore: null, // 見本を反映する前の組み方（「元に戻す」で戻す先）。組み方を変えた・発車した・面を替えた・戻したら消す
  prevRows: null, // 組み直した直後に、カードへ出す前回の結果。発車した・面を替えた・見本を出したら消す
  kbJump: null, // Enter/Space で選んだ直後の列車 id。次の Tab を分岐ボタンへ送ったら、ほかへフォーカスが動いたら消す
  sim: null,
  rows: [],
  stars: 0,
  usedSample: false,
  speed: 1,
  play: null,
};

const map = createMap({ svg: els.mapSvg, switchLayer: els.switches, onSwitch: handleSwitch, onHint: handleHint });

// 文節のかたまりを折れない span で包む。語の途中で折り返さない（lib/phrase.js）
function phrased(text) {
  return chunkSegments(text).map((seg) => (seg.keep ? h('span', { class: 'nw', text: seg.text }) : seg.text));
}

// 失敗の原因の文は、文末の「。」をそろえる（成功の行の「お刺身 9分（締切11分）」のような札は、そのまま）
const endSentence = (text) => (/[。！？）」』]$/u.test(text) ? text : `${text}。`);
const level = () => LEVELS[state.index];

// ---------------------------------------------------------------- 一言と読み上げ

let toastTimer = 0;
let toastSeq = 0;

// 一言。TOAST_MS で自然に消える。押せる部品は付けない（「元に戻す」は編成の下の注意書きにある）
function toast(message) {
  clearToast();
  const seq = ++toastSeq;
  // 同じ文が続いても読み上げられるよう、いったん空にしてから入れる（その間に消されたら出さない）
  requestAnimationFrame(() => {
    if (seq !== toastSeq) return;
    els.toast.textContent = message;
    els.toast.classList.add('is-on');
  });
  toastTimer = setTimeout(() => {
    if (seq === toastSeq) clearToast();
  }, TOAST_MS);
}

// 面の切替・発車・結果・組み直しのときに、前の一言を残さない
function clearToast() {
  toastSeq += 1;
  clearTimeout(toastTimer);
  els.toast.classList.remove('is-on');
  els.toast.textContent = '';
}

function announce(message) {
  els.live.textContent = '';
  requestAnimationFrame(() => {
    els.live.textContent = message;
  });
}

// ---------------------------------------------------------------- 面

function loadLevel(i) {
  stopPlay();
  clearToast();
  state.index = i;
  state.plan = initialPlan(level());
  // 面を開いた直後は、出発順の1番目の列車を選んだ状態にする（分岐の切替ボタンがすぐ地図に出る）
  state.selected = state.plan.order[0] ?? null;
  state.phase = 'edit';
  state.failCount = 0;
  state.sampleSnapshot = null;
  state.undoBefore = null;
  state.prevRows = null;
  state.sim = null;
  state.rows = [];
  map.setLevel(level());
  // 地図の縦横比（幅360÷面ごとの高さ）。地図の大きさと、固定した地図の下に隠れないためのスクロールの余白に使う
  document.documentElement.style.setProperty('--map-ratio', String(Math.round((360 / map.view().h) * 1000) / 1000));
  els.legendLen.hidden = lengthTags(level()).length === 0;
  els.mapLabel.textContent = mapSummary(level());
  renderAll();
  updateStickyTop();
}

/* 固定した帯と地図の高さ（px）を --sticky-top に。scroll-padding-top に使い、フォーカスや scrollIntoView で出すカードが
   固定した地図の下に隠れないようにする（凡例が1行か2行かで高さが変わるので、見積もりではなく測る） */
function updateStickyTop() {
  const band = document.querySelector('.band').getBoundingClientRect().height;
  const section = document.querySelector('.board__map').getBoundingClientRect().height;
  document.documentElement.style.setProperty('--sticky-top', `${Math.ceil(band + section)}px`);
}

// 選んでいる列車のカードを、固定した地図と下の帯のあいだに見せる（一瞬で）
function revealSelectedCard() {
  updateStickyTop();
  const car = els.cars.querySelector(`.car[data-train="${state.selected}"]`) ?? els.cars.querySelector('.car');
  car?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
}

function renderAll() {
  renderPhase();
  renderChips();
  renderStage();
  renderOrders();
  renderCars();
  renderMapEdit();
  renderResult();
}

function mapSummary(L) {
  const stations = Object.keys(L.nodes).filter((id) => KINDS[L.nodes[id].kind]);
  const names = stations.map((id) => `${stationName(L, id, { icon: false })}（${L.nodes[id].time ?? KINDS[L.nodes[id].kind].time}分）`);
  return `線路の地図。車庫から配膳駅まで。駅は${names.join('・')}。分岐は${branchNodes(L).length}か所。`;
}

function starNodes(count) {
  return [1, 2, 3].map((n) => h('span', { class: n <= count ? 'star is-on' : 'star', text: '★' }));
}

function renderChips() {
  clear(els.chips);
  LEVELS.forEach((L, i) => {
    const rec = levelRecord(progress, L.id);
    const btn = h('button', {
      type: 'button',
      class: 'chip',
      'aria-current': i === state.index ? 'true' : null,
      'aria-label': `面${L.no} ${L.title}、${rec.stars ? starsWords(rec.stars) : 'まだクリアしていない'}`,
      disabled: state.phase === 'play',
      onclick: () => {
        if (i === state.index || state.phase === 'play') return;
        loadLevel(i);
        // 新しい面の名前・目標・指示文が見える所（いちばん上）へ。動かすのは一瞬で
        // （なめらかに動かすと、動いている間に押した所がずれて、別のボタンに当たる）
        window.scrollTo({ top: 0, behavior: 'auto' });
      },
    },
    h('span', { class: 'chip__no', 'aria-hidden': 'true', text: L.no }),
    h('span', { class: 'chip__stars', 'aria-hidden': 'true' }, starNodes(rec.stars)));
    els.chips.append(h('li', null, btn));
  });
}

function renderStage() {
  const L = level();
  const rec = levelRecord(progress, L.id);
  fill(els.stageTitle, h('span', { class: 'stage__no', text: L.no }), L.title);
  fill(els.stageGoal,
    h('span', { class: 'stage__goal-item' }, h('span', { class: 'stage__goal-star', 'aria-hidden': 'true', text: '★★★' }), h('span', { class: 'sr-only', text: '星3つ' }), `は${L.par}分以内に完食`),
    rec.best ? h('span', { class: 'stage__goal-item', text: `自己ベスト ${rec.best}分` }) : null,
  );
  fill(els.stageHint, phrased(L.hint));
}

// ---------------------------------------------------------------- 注文票

function renderOrders() {
  const L = level();
  clear(els.orders);
  for (const t of L.trains) {
    const o = orderOfTrain(L, t.id);
    els.orders.append(h('li', { class: `ticket tc-${t.id}${state.phase === 'edit' && state.selected === t.id ? ' is-selected' : ''}`, 'data-train': t.id },
      h('div', { class: 'ticket__head' },
        h('span', { class: 'ticket__emoji', 'aria-hidden': 'true', text: ingredientIcon(o.ingredient) }),
        h('p', { class: 'ticket__dish' }, h('span', { class: 'nw', text: orderDish(o) }))),
      h('div', { class: 'ticket__foot' },
        h('p', { class: 'ticket__steps' },
          h('span', { 'aria-hidden': 'true', text: stepIcons(o.steps) }),
          h('span', { class: 'sr-only', text: `工程は${stepWords(o.steps)}` })),
        h('span', { class: 'ticket__due' }, h('span', { class: 'sr-only', text: '締切' }), `〜${o.due}分`)),
      h('p', { class: 'ticket__mark', hidden: true })));
  }
}

function markOrder(row) {
  const li = els.orders.querySelector(`.ticket[data-train="${row.train}"]`);
  if (!li) return;
  const mark = li.querySelector('.ticket__mark');
  fill(mark,
    h('span', { class: 'ticket__icon', 'aria-hidden': 'true', text: row.ok ? '✔' : '✘' }),
    h('span', { class: 'sr-only', text: row.ok ? '成功' : '失敗' }),
    h('span', { class: 'ticket__why', text: row.short }),
  );
  mark.hidden = false;
  li.classList.toggle('is-ok', row.ok);
  li.classList.toggle('is-ng', !row.ok);
  li.classList.toggle('is-overdue', row.arrivedAt > row.due);
  els.cars.querySelector(`.car[data-train="${row.train}"]`)?.classList.toggle('is-overdue', row.arrivedAt > row.due);
}

// 再生中、締切を過ぎてまだ着いていない注文の締切バッジを赤くする（注文票と編成のカードの両方）
function markOverdue(row) {
  els.orders.querySelector(`.ticket[data-train="${row.train}"]`)?.classList.add('is-overdue');
  els.cars.querySelector(`.car[data-train="${row.train}"]`)?.classList.add('is-overdue');
}

function clearOrderMarks() {
  for (const li of els.orders.querySelectorAll('.ticket')) {
    li.classList.remove('is-ok', 'is-ng', 'is-overdue');
    const mark = li.querySelector('.ticket__mark');
    clear(mark);
    mark.hidden = true;
  }
  for (const car of els.cars.querySelectorAll('.car')) car.classList.remove('is-overdue');
}

// ---------------------------------------------------------------- 編成（出発順の列車カード）

function renderCars() {
  const L = level();
  const active = document.activeElement;
  const focusCar = active?.closest?.('.car')?.dataset.train ?? null;
  const focusRole = active?.classList?.contains('car__pick') ? 'pick' : active?.dataset?.move ?? null;
  const editing = state.phase === 'edit';
  const last = state.plan.order.length - 1;
  clear(els.cars);
  state.plan.order.forEach((id, j) => {
    const o = orderOfTrain(L, id);
    const dish = orderDish(o);
    const steps = stepsOfPath(L, pathOf(L, state.plan, id));
    // 通る駅が注文の工程と同じときだけ ✔。違うときは何も付けない（✘ は出さない。どこが違うかは自分で見比べる）
    const match = steps.join('>') === o.steps.join('>');
    // 道のり＝今の進路の区間（線路と駅）の所要の合計。待たずに走れば、出発の分＋道のりで着く
    const route = routeMinutes(L, pathOf(L, state.plan, id));
    const prev = state.prevRows?.find((r) => r.train === id) ?? null;
    const selected = state.selected === id;
    const pick = h('button', {
      type: 'button', class: 'car__pick', 'aria-pressed': selected ? 'true' : 'false', disabled: !editing,
      'aria-label': `${j + 1}番目に出る ${dish}の列車。締切${o.due}分。注文は${stepWords(o.steps)}。いまの進路で通る駅は${steps.length ? stepWords(steps) : 'なし'}${match ? '（注文どおり）' : ''}、道のり${route}分${prev ? `。前回は${prev.ok ? '成功' : '失敗'}（${prev.short}）` : ''}`,
      onclick: () => selectTrain(id),
      onkeydown: (event) => onCarKey(event, id),
    },
    h('span', { class: 'car__no', 'aria-hidden': 'true', text: j + 1 }),
    h('span', { class: 'car__face', 'aria-hidden': 'true', text: ingredientIcon(o.ingredient) }),
    /* 固定した地図の下で注文票が隠れても、カードだけで締切と工程を見比べられるようにする。
       2行目は「注文 🔪→🔥 〜13分」、3行目は「通る駅 🔪→🔥 ✔」（工程のアイコンを縦にそろえる） */
    h('span', { class: 'car__text', 'aria-hidden': 'true' },
      h('span', { class: 'car__dish' }, '→', h('span', { class: 'nw', text: dish })),
      h('span', { class: 'car__label', text: '注文' }),
      h('span', { class: 'car__row car__order' },
        h('span', { class: 'car__icons car__order-icons', text: stepIcons(o.steps) }),
        h('span', { class: 'car__due', text: `〜${o.due}分` })),
      h('span', { class: 'car__label', text: '通る駅' }),
      h('span', { class: 'car__row car__steps' },
        h('span', { class: 'car__icons car__steps-icons', text: steps.length ? stepIcons(steps) : 'なし' }),
        match ? h('span', { class: 'car__match', text: '✔' }) : null,
        h('span', { class: 'car__route', text: `道のり${route}分` }))));
    // 組み直した直後だけ、前回の結果の小さな札（カードの右上。カードの高さは変えない）
    const prevTag = prev
      ? h('span', { class: `car__prev ${prev.ok ? 'is-ok' : 'is-ng'}`, 'aria-hidden': 'true', text: `前回 ${prev.ok ? '✔' : '✘'} ${prev.short}` })
      : null;
    const up = h('button', { type: 'button', class: 'car__move', 'data-move': '-1', 'aria-label': `${dish}の列車を1つ前へ`, disabled: !editing || j === 0, onclick: () => move(id, -1) }, '▲');
    const down = h('button', { type: 'button', class: 'car__move', 'data-move': '1', 'aria-label': `${dish}の列車を1つ後ろへ`, disabled: !editing || j === last, onclick: () => move(id, 1) }, '▼');
    els.cars.append(h('li', { class: `car tc-${id}${selected ? ' is-selected' : ''}`, 'data-train': id }, pick, h('div', { class: 'car__moves' }, up, down), prevTag));
  });
  // 作り直したカードへフォーカスを戻す（▲を押し続けられるように。端で押せなくなったら反対の矢印へ）
  if (focusCar && focusRole) {
    const car = els.cars.querySelector(`.car[data-train="${focusCar}"]`);
    let target = focusRole === 'pick' ? car?.querySelector('.car__pick') : car?.querySelector(`.car__move[data-move="${focusRole}"]`);
    if (target?.disabled) target = car.querySelector(`.car__move:not([disabled])`) ?? car.querySelector('.car__pick');
    if (target && !target.disabled) target.focus({ preventScroll: true });
  }
  renderSampleControls();
}

function isSamplePlan() {
  return Boolean(state.sampleSnapshot) && samePlan(level(), state.plan, state.sampleSnapshot);
}

/* 見本の注意書き。見本を出した直後は「元に戻す」も置く（一言は10秒で消えるので、見逃しても戻せるように）。
   ボタンは、組み方を変えた・発車した・面を替えた・戻したときに消える（state.undoBefore） */
function renderSampleControls() {
  const sample = isSamplePlan();
  const editing = state.phase === 'edit';
  els.sampleNote.hidden = !(sample && editing);
  fill(els.sampleNote,
    h('span', { class: 'formation__sample-text', text: '見本のダイヤのまま発車すると、クリアしても★1。' }),
    state.undoBefore && editing
      ? h('button', { type: 'button', class: 'btn btn--ghost formation__undo', 'aria-label': '元に戻す（見本を出す前の組み方へ）', text: '元に戻す', onclick: undoSample })
      : null);
  els.sampleEdit.hidden = !(editing && state.failCount >= 2 && !sample);
}

// 組み方を変えたら、見本の「元に戻す」は消す（戻す先が、今の組み方の前ではなくなるため）
function dropUndo() {
  if (!state.undoBefore) return;
  state.undoBefore = null;
}

/* キーボード：カードの上で ↓/↑ は隣のカードへ。Enter/Space で列車を選んだ直後の1回だけ、Tab は地図の分岐ボタンへ
   （分岐ボタンはタブ順でカードより前にあり、Tab だけだとページを一周しないと届かなかった）。
   選んであるだけのカードでも Tab を奪うと、カード⇄分岐ボタンを往復して発車に届かない（キーボードトラップ）ので、直後の1回に限る */
function onCarKey(event, id) {
  if (event.key === 'Enter' || event.key === ' ') {
    state.kbJump = id;
    return;
  }
  const jump = state.kbJump === id && event.key === 'Tab' && !event.shiftKey && state.phase === 'edit' && state.selected === id;
  state.kbJump = null;
  if (jump) {
    const first = els.switches.querySelector('.switch');
    if (first) {
      event.preventDefault();
      first.focus();
    }
    return;
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const picks = [...els.cars.querySelectorAll('.car__pick')];
    const next = picks[picks.indexOf(event.currentTarget) + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next && !next.disabled) {
      event.preventDefault();
      next.focus();
    }
  }
}

function selectTrain(id) {
  if (state.phase !== 'edit') return;
  state.selected = id;
  renderCars();
  renderOrders();
  renderMapEdit();
  const L = level();
  const branches = branchesOnPath(L, pathOf(L, state.plan, id));
  announce(`${trainDish(L, id)}の列車を選んだ。${branches.length ? `地図の分岐ボタン${branches.length}つで進路を切り替えられる` : 'この進路に分岐は無い'}`);
}

function move(id, delta) {
  if (state.phase !== 'edit') return;
  const next = moveTrain(state.plan, id, delta);
  if (next === state.plan) return;
  state.plan = next;
  dropUndo();
  renderCars();
  renderMapEdit();
  announce(`${trainDish(level(), id)}の列車を${state.plan.order.indexOf(id) + 1}番目にした`);
}

// ---------------------------------------------------------------- 地図（編集中）

function renderMapEdit() {
  const L = level();
  const paths = pathsOf(L, state.plan);
  const switches = [];
  const arrows = [];
  if (state.selected && state.phase === 'edit') {
    for (const node of branchesOnPath(L, paths[state.selected])) {
      const exitTo = currentExit(L, state.plan, state.selected, node);
      const pts = edgePoints(L, L.edges.find((e) => e.from === node && e.to === exitTo));
      const angle = Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]);
      switches.push({ node, exitTo, label: switchLabel(L, state.selected, node), angle, trainId: state.selected });
      arrows.push({ node, exitTo, trainId: state.selected });
    }
  }
  map.setEditView({ paths, selected: state.phase === 'edit' ? state.selected : null, switches, arrows });
}

// 分岐ボタンの名前。進路に分岐が2つ以上あるときは「2つ目の分岐 焼く駅へ」と順番を付ける（同じ名前のボタンを作らない）
function switchLabel(L, trainId, node) {
  const branches = branchesOnPath(L, pathOf(L, state.plan, trainId));
  const label = branchLabel(L, state.plan.choices[trainId] || {}, node, currentExit(L, state.plan, trainId, node));
  return branches.length > 1 ? `${branches.indexOf(node) + 1}つ目の${label}` : label;
}

function handleSwitch(node) {
  if (state.phase !== 'edit' || !state.selected) return;
  const L = level();
  state.plan = cycleChoice(L, state.plan, state.selected, node);
  dropUndo();
  renderMapEdit();
  renderCars();
  const steps = stepsOfPath(L, pathOf(L, state.plan, state.selected));
  announce(`${switchLabel(L, state.selected, node)}。通る駅は${steps.length ? stepWords(steps) : 'なし'}`);
}

function handleHint() {
  if (state.phase !== 'edit') return;
  toast(state.selected ? 'この分岐は、いまの進路では通らない' : '先に列車を選んでね');
}

// ---------------------------------------------------------------- 発車と再生

function depart() {
  if (state.phase !== 'edit') return;
  audio.unlock();
  const L = level();
  const sim = simulate(L, simInput(L, state.plan)); // 発車ごとに1回だけ
  state.sim = sim;
  state.undoBefore = null;
  state.prevRows = null;
  state.rows = explainAll(L, sim);
  state.usedSample = isSamplePlan();
  state.stars = starsFor(L, sim, starsOf, { usedSample: state.usedSample });
  audio.play('depart');
  clearToast();
  clearOrderMarks();
  if (reduceMotion()) {
    finishPlay();
    return;
  }
  const hadFocus = document.activeElement === els.depart;
  state.phase = 'play';
  renderPhase();
  renderChips();
  renderCars();
  // 押したボタンが消えるので、キーボードで続けられるようフォーカスを「スキップ」へ移す
  if (hadFocus) els.skip.focus({ preventScroll: true });
  // 時計を先に出して大きさを測り、地図の隅のうち待つ列車や線路に重ならない所へ置く（2桁の分の分だけ広めに見積もる）
  els.clock.hidden = false;
  updateClock(0);
  const clockBox = els.clock.getBoundingClientRect();
  map.startPlayback(sim, state.plan, L.trains, pathsOf(L, state.plan), { w: clockBox.width + 12, h: clockBox.height });
  els.clock.dataset.corner = map.clockCorner();
  // 地図は帯の下に固定してある。固定しない画面（高さ450px未満）だけ、地図が見える所まで送る
  if (!media('(min-height: 450px)')) document.querySelector('.board__map').scrollIntoView({ block: 'start', behavior: 'smooth' });
  state.play = { t: 0, last: null, nextMinute: 1, marked: new Set(), windows: sizzleWindows(L, sim), raf: requestAnimationFrame(tick) };
  announce('発車！');
}

function updateClock(minute) {
  els.clock.textContent = `🕒 ${minute}分`;
}

function tick(now) {
  const p = state.play;
  if (!p) return;
  if (p.last === null) p.last = now;
  // 裏のタブから戻ったときに一気に進まないよう、1コマで進めるのは0.1秒まで
  const dt = Math.min(0.1, (now - p.last) / 1000);
  p.last = now;
  p.t = advance(p.t, dt, state.speed, p.windows);
  const { finish } = state.sim;
  while (p.nextMinute <= Math.min(p.t, finish)) fireMinute(p.nextMinute++);
  map.frame(Math.min(p.t, finish + TAIL_MIN));
  updateClock(Math.min(Math.floor(p.t), finish));
  for (const row of state.rows) {
    if (!p.marked.has(row.train) && row.arrivedAt <= p.t) {
      p.marked.add(row.train);
      markOrder(row);
    } else if (!p.marked.has(row.train) && p.t > row.due) {
      markOverdue(row);
    }
  }
  if (p.t >= finish + TAIL_MIN) {
    finishPlay();
    return;
  }
  p.raf = requestAnimationFrame(tick);
}

// その分に起きることの音（駅に入る・配膳に着く・焦げる）
function fireMinute(m) {
  const L = level();
  const sim = state.sim;
  const grace = L.burnGrace ?? 1;
  const kinds = new Set();
  let served = false;
  let burnt = false;
  for (const [, segs] of Object.entries(sim.timeline)) {
    for (const seg of segs) {
      if (seg.type === 'station' && seg.enter === m) kinds.add(seg.kind);
      // 焦げた瞬間（仕上がり＋猶予＋1分）。画面の「焦げた！」・運行図の✖と同じ分
      if (seg.type === 'station' && KINDS[seg.kind].hot && seg.leave - seg.ready > grace && burnMinute(L, seg) === m) burnt = true;
    }
  }
  for (const r of sim.results) if (r.arrivedAt === m) served = true;
  for (const k of kinds) audio.play(k);
  if (burnt) audio.play('burn');
  if (served) audio.play('serve');
}

function stopPlay() {
  if (state.play) cancelAnimationFrame(state.play.raf);
  state.play = null;
  map.stopPlayback();
  els.clock.hidden = true;
}

function finishPlay() {
  if (state.phase === 'result') return;
  stopPlay();
  const L = level();
  const sim = state.sim;
  // 記録は結果を出すときに（発車の時点で残すと、再生中に面の星が先に変わってしまう）
  progress = recordRun(progress, L.id, { cleared: sim.cleared, stars: state.stars, finish: sim.finish, usedSample: state.usedSample && sim.cleared });
  saveProgress(storage, progress);
  if (!sim.cleared) state.failCount += 1;
  for (const row of state.rows) markOrder(row);
  clearToast();
  state.phase = 'result';
  audio.play(sim.cleared ? 'clear' : 'fail');
  renderPhase();
  renderChips();
  renderStage();
  renderCars();
  renderMapEdit();
  renderResult();
  const title = $('result-title');
  if (title) {
    title.focus({ preventScroll: true });
    els.result.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
  }
}

function skip() {
  if (state.phase === 'play') finishPlay();
}

// ---------------------------------------------------------------- 結果シート

function xIntent(text, url) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = h('textarea', { class: 'offscreen', readonly: true });
    area.value = text;
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

function renderResult() {
  const box = els.result;
  clear(box);
  if (state.phase !== 'result' || !state.sim) {
    box.hidden = true;
    return;
  }
  const L = level();
  const sim = state.sim;
  box.hidden = false;

  // fill は null を書き出さない（Element.append に null を渡すと「null」という文字が画面に出る）
  fill(box,
    h('h3', { id: 'result-title', class: 'result__title', tabindex: '-1' },
      h('span', { class: 'sr-only', text: `結果、${starsWords(state.stars)}。` }),
      state.stars > 0
        ? h('span', { class: 'result__stars', 'aria-hidden': 'true' }, starNodes(state.stars))
        : h('span', { class: 'result__fail', text: '失敗' })),
    h('p', { class: 'result__line' }, phrased(headline(L, sim, { stars: state.stars, usedSample: state.usedSample }))),
    // ★1・★2（最短ではないクリア）には、時間をどこで失ったかを1行
    sim.cleared && !state.usedSample && sim.finish > L.par ? h('p', { class: 'result__loss' }, phrased(timeLossLine(L, sim))) : null,
    // 2回失敗したら、一行の結果のすぐ下に見本の入口（結果シートの末尾だと、スマホでは見つからなかった）
    !sim.cleared && state.failCount >= 2
      ? h('div', { class: 'result__sample' },
        h('p', { class: 'result__sample-text' }, phrased('見本のダイヤを見られます（見本どおりのクリアは★1）。')),
        h('button', { type: 'button', id: 'btn-sample', class: 'btn btn--primary', onclick: applySample, text: '見本のダイヤを見る' }))
      : null,
    // 失敗の行を先に（原因を最初の画面で読めるように）。出発番号の丸はそのまま
    h('ul', { class: 'result__rows' }, [...state.rows].sort((a, b) => Number(a.ok) - Number(b.ok)).map((r) => h('li', { class: `result__row tc-${r.train} ${r.ok ? 'is-ok' : 'is-ng'}` },
      h('span', { class: 'result__mark', 'aria-hidden': 'true', text: r.ok ? '✔' : '✘' }),
      h('span', { class: 'result__body' },
        h('span', { class: 'result__dish' }, h('span', { class: 'sr-only', text: r.ok ? '成功。' : '失敗。' }), h('span', { class: 'result__no', 'aria-hidden': 'true', text: String(sim.results.findIndex((x) => x.train === r.train) + 1) }), h('span', { 'aria-hidden': 'true', text: `${r.icon} ` }), r.dish),
        h('span', { class: 'result__why' }, phrased(r.ok ? r.text : endSentence(r.text))))))),
  );

  const { items, traces } = chartText(L, sim);
  box.append(h('figure', { class: 'chart' },
    h('figcaption', { class: 'chart__cap', text: '運行図（横が分）' }),
    h('div', { id: 'chart-wrap', class: 'chart__wrap' }),
    h('p', { class: 'chart__legend' },
      h('span', { class: 'legend legend--solid' }, phrased('帯（列車の色・出発番号）＝その区間にいた時間')),
      h('span', { class: 'legend legend--run' }, phrased('細い線＝走っている時間')),
      h('span', { class: 'legend legend--wait' }, phrased('斜線＝その区間で、先が空くのを待った時間')),
      h('span', { class: 'legend legend--before' }, phrased('点線＝その手前で待った時間')),
      h('span', { class: 'legend legend--burn' }, phrased('✖＝焦げた'))),
    h('details', { class: 'chart__text' },
      h('summary', { text: '運行図を文で読む' }),
      h('p', { class: 'chart__text-head', text: '列車ごと（走っている時間を含む）' }),
      h('ul', null, traces.map((t) => h('li', null, h('b', { text: `${t.label}：` }), t.text))),
      h('p', { class: 'chart__text-head', text: '場所ごと' }),
      h('ul', null, items.map((it) => h('li', null, h('b', { text: `${it.label}：` }), it.text))))));

  // 「組み直す」「次の面へ」は、画面の下に固定した帯に出す（結果が長くても、スクロールせずに押せる）

  if (sim.cleared) {
    const text = shareText(L, state.stars, sim.finish);
    const url = `${location.origin}${location.pathname}`;
    const said = h('p', { class: 'result__said', role: 'status' });
    const copy = h('button', {
      type: 'button', class: 'btn btn--ghost', text: '結果とリンクをコピー',
      onclick: async () => {
        const ok = await copyText(`${text} ${url}`);
        said.textContent = ok ? 'コピーしました' : 'コピーできませんでした';
      },
    });
    box.append(h('div', { class: 'result__send', role: 'group', 'aria-labelledby': 'send-title' },
      h('p', { id: 'send-title', class: 'result__send-title', text: '結果を送る' }),
      h('div', { class: 'result__send-row' },
        h('a', { class: 'btn btn--ghost', href: xIntent(text, url), target: '_blank', rel: 'noopener noreferrer', text: 'Xで結果を送る' }),
        copy),
      said));
  }
  drawChart();
}

function drawChart() {
  const wrap = $('chart-wrap');
  if (!wrap || !state.sim) return;
  const width = wrap.clientWidth;
  if (!width) return;
  fill(wrap, renderChart(level(), state.sim, width));
}

function backToEdit() {
  clearToast();
  state.phase = 'edit';
  // 前回の結果をカードの札に残す（次に発車する・面を替える・見本を出すと消える）
  state.prevRows = state.rows.length ? state.rows : null;
  state.sim = null;
  state.rows = [];
  // 組み直しも面を開いた直後と同じく、出発順の1番目の列車を選んだ状態から
  state.selected = state.plan.order[0] ?? null;
  clearOrderMarks();
  renderAll();
  const pick = els.cars.querySelector(`.car[data-train="${state.selected}"] .car__pick`) ?? els.cars.querySelector('.car__pick');
  pick?.focus({ preventScroll: true });
  // 選んだカードを、固定した地図と下の帯のあいだへ一瞬で（なめらかに動かすと2〜3秒動き続け、押した所が隣のボタンに当たった。
  // 編成の欄ごとに合わせると、面6では選んだカードが固定した地図の下に隠れた）
  revealSelectedCard();
}

function nextLevel() {
  if (state.index >= LEVELS.length - 1) return;
  loadLevel(state.index + 1);
  els.stageTitle.scrollIntoView({ block: 'start', behavior: 'auto' });
  els.chips.querySelector('[aria-current="true"]')?.focus({ preventScroll: true });
}

/* 見本を反映する。確認なしで自分の組み方を上書きするので、編成の下の注意書きに「元に戻す」が出る（state.undoBefore）。
   元に戻すと、反映する前の出発順・進路・選んでいた列車に戻る */
function applySample() {
  const L = level();
  state.undoBefore = { order: [...state.plan.order], choices: structuredClone(state.plan.choices), selected: state.selected };
  state.prevRows = null;
  state.plan = samplePlan(L);
  state.sampleSnapshot = samplePlan(L);
  if (!state.selected) state.selected = state.plan.order[0] ?? null;
  state.phase = 'edit';
  state.sim = null;
  state.rows = [];
  clearOrderMarks();
  renderAll();
  toast('見本のダイヤを出した');
  announce('見本のダイヤを出した。このまま発車すると、クリアしても星1つ。編成の下の「元に戻す」で、前の組み方に戻せる');
  els.depart.focus({ preventScroll: true });
}

function undoSample() {
  const before = state.undoBefore;
  if (!before || state.phase !== 'edit') return;
  state.undoBefore = null;
  state.plan = { order: before.order, choices: before.choices };
  state.selected = before.selected ?? state.plan.order[0] ?? null;
  renderCars();
  renderOrders();
  renderMapEdit();
  toast('元の組み方に戻した');
  announce('元の組み方に戻した');
  els.depart.focus({ preventScroll: true });
}

// ---------------------------------------------------------------- 状態ごとの見た目

function renderPhase() {
  els.app.dataset.phase = state.phase;
  document.documentElement.dataset.phase = state.phase; // 結果のときだけ、スクロールの余白を変える（app.css の scroll-padding-top）
  const editing = state.phase === 'edit';
  const playing = state.phase === 'play';
  const result = state.phase === 'result';
  const cleared = result && Boolean(state.sim?.cleared);
  els.depart.hidden = !editing;
  els.speed.hidden = !playing;
  els.skip.hidden = !playing;
  els.speed.setAttribute('aria-pressed', state.speed === 2 ? 'true' : 'false');
  // 結果の間は、下の帯に「組み直す」と（クリアしたら）「次の面へ」。失敗したときは組み直すを濃い色にする
  // 最後の面をクリアしたときは「次の面へ」が無いので、組み直すを濃い色にする（主役のボタンを無くさない）
  const primaryRebuild = result && (!cleared || state.index >= LEVELS.length - 1);
  els.rebuild.hidden = !result;
  els.rebuild.classList.toggle('btn--depart', primaryRebuild);
  els.rebuild.classList.toggle('btn--play', !primaryRebuild);
  // 注文票の選択枠は編集中だけ（結果のとき、成功した注文に枠が残ると失敗の印に見える）
  for (const li of els.orders.querySelectorAll('.ticket')) li.classList.toggle('is-selected', editing && li.dataset.train === state.selected);
  els.next.hidden = !(cleared && state.index < LEVELS.length - 1);
  els.formation.hidden = result;
}

function renderSound() {
  els.soundIcon.textContent = progress.muted ? '🔇' : '🔊';
  els.sound.setAttribute('aria-label', progress.muted ? '音を出す' : '音を消す');
}

// ---------------------------------------------------------------- つなぐ

els.depart.addEventListener('click', depart);
els.skip.addEventListener('click', skip);
els.rebuild.addEventListener('click', backToEdit);
els.next.addEventListener('click', nextLevel);
// 選んだカード以外へフォーカスが動いたら「選んだ直後の Tab」は無かったことにする（マウスで別の所を触ったあと、Tab で戻ったカードで驚かせない）
document.addEventListener('focusin', (event) => {
  if (state.kbJump && !event.target.closest?.(`.car[data-train="${state.kbJump}"] .car__pick`)) state.kbJump = null;
});
els.speed.addEventListener('click', () => {
  state.speed = state.speed === 2 ? 1 : 2;
  els.speed.setAttribute('aria-pressed', state.speed === 2 ? 'true' : 'false');
});
els.sampleEdit.addEventListener('click', applySample);
els.sound.addEventListener('click', () => {
  progress = withMuted(progress, !progress.muted);
  audio.setMuted(progress.muted);
  saveProgress(storage, progress);
  renderSound();
});

function wireDialog(dialog, opener, closer) {
  opener.addEventListener('click', () => {
    if (!dialog.open) dialog.showModal();
  });
  closer.addEventListener('click', () => dialog.close());
  // 窓の外（背景）を押しても閉じる
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
wireDialog(els.howtoDialog, els.howto, els.howtoClose);
wireDialog(els.shareDialog, els.share, els.shareClose);

let resizeFrame = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    if (state.phase === 'result') drawChart();
    else updateStickyTop();
  });
});

renderSound();
loadLevel(state.index);
document.documentElement.dataset.ready = 'true';
