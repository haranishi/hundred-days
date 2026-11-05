import { COMPANIONS, MOODS, completeAnswers, questionsFor, chooseAnswer } from './lib/choices.js';
import { point, categoryLabel, mapsUrl, mapsSearchUrl } from './lib/recommend.js';
import { searchPlaces } from './lib/openpoi.js';
import { selectedDish, selectedGroup } from './lib/food.js';
import { findRecommendations } from './lib/search.js';

const $ = (id) => document.getElementById(id);
const state = { phase: 'companion', step: 0, companion: '', answers: {}, location: null, results: [], index: 0, search: null, error: null };
const mainTask = { id: 0, controller: null };
const placeTask = { id: 0, controller: null };
let searchAfterLocation = false;

function cancel(task) { task.id += 1; task.controller?.abort(); task.controller = null; }
function begin(task) {
  cancel(task);
  task.controller = new AbortController();
  return { id: task.id, signal: task.controller.signal };
}
const current = (task, id) => task.id === id;
const announce = (text) => { $('announcement').textContent = text; };

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `./assets/icons.svg#${name}`);
  svg.append(use);
  return svg;
}

function choices(host, items, name, selected, onChange) {
  host.replaceChildren(...items.map((item) => {
    const label = document.createElement('label');
    label.className = 'choice';
    const input = document.createElement('input');
    input.type = 'radio'; input.name = name; input.value = item.id; input.checked = item.id === selected;
    const inner = document.createElement('span');
    inner.className = 'choice-inner';
    const copy = document.createElement('span'); copy.className = 'choice-copy';
    const strong = document.createElement('strong'); strong.textContent = item.label;
    const small = document.createElement('small'); small.textContent = item.detail;
    copy.append(strong, small);
    const mark = document.createElement('span'); mark.className = 'choice-mark'; mark.setAttribute('aria-hidden', 'true');
    inner.append(icon(item.icon), copy, mark); label.append(input, inner);
    input.addEventListener('change', () => { if (input.checked) onChange(item.id); });
    return label;
  }));
}

function renderProgress() {
  const flow = questionsFor(state.answers);
  $('stage-label').textContent = state.phase === 'companion' ? 'まずは、ここから'
    : state.phase === 'question' ? `STEP ${state.step + 1}${state.answers.mood ? ` / ${flow.length}` : ''}`
      : state.phase === 'loading' ? '探しています' : 'あなたの着地点';
  const labels = { mood: '気分', genre: 'ジャンル', dish: '食べたいもの', space: '空間', walk: '距離' };
  $('question-progress').replaceChildren(...flow.map((question, index) => {
    const li = document.createElement('li'); li.textContent = labels[question.id];
    li.classList.toggle('active', state.phase === 'question' && index === state.step);
    li.classList.toggle('done', state.phase !== 'companion' && (state.phase !== 'question' || index < state.step));
    if (state.phase === 'question' && index === state.step) li.setAttribute('aria-current', 'step');
    return li;
  }));
}

function renderSearchLinks() {
  const available = state.location && completeAnswers(state.answers) && !(state.phase === 'error' && state.error?.location);
  document.querySelectorAll('[data-maps-search]').forEach((link) => {
    link.hidden = !available;
    if (available) {
      const food = selectedDish(state.answers)?.label || '公園';
      link.textContent = `Google マップで「${food}」を探す ↗`;
      link.href = mapsSearchUrl(state.location, state.answers);
    }
  });
}

function render(focus = false) {
  document.documentElement.dataset.phase = state.phase;
  document.querySelectorAll('.screen').forEach((screen) => { screen.hidden = screen.id !== `${state.phase}-screen`; });
  $('restart').hidden = state.phase === 'companion';
  $('location-trigger').disabled = state.phase === 'loading';
  $('location-label').textContent = state.location?.label || '探す場所を選ぶ';
  renderProgress();
  if (state.phase === 'companion') {
    choices($('companion-options'), COMPANIONS, 'companion', state.companion, (id) => {
      state.companion = id; $('companion-next').disabled = false;
    });
    $('companion-next').disabled = !state.companion;
  }
  if (state.phase === 'question') {
    const flow = questionsFor(state.answers);
    const question = flow[state.step];
    const last = state.step === flow.length - 1;
    $('question-title').textContent = question.title;
    $('question-copy').textContent = last && selectedDish(state.answers)
      ? `${selectedDish(state.answers).label}で決まり。近くのお店を探そう。` : question.subtitle;
    const trail = flow.slice(0, state.step).filter((item) => ['mood', 'genre', 'dish'].includes(item.id))
      .map((item) => item.choices.find((choice) => choice.id === state.answers[item.id])?.label).filter(Boolean);
    $('question-trail').textContent = trail.join(' › ');
    $('question-trail').hidden = !trail.length;
    $('handoff').textContent = state.step === 0 && state.companion !== 'solo' ? '相手にスマホを渡して、答えてもらおう。' : '';
    choices($('question-options'), question.choices, question.id, state.answers[question.id], (id) => {
      state.answers = chooseAnswer(state.answers, question.id, id);
      $('question-next').disabled = false; renderProgress();
    });
    $('question-next').disabled = !state.answers[question.id];
    $('question-next').querySelector('span').textContent = last
      ? state.location ? 'この場所で着地点を探す' : '現在地で着地点を探す' : '次へ進む';
    $('search-consent').hidden = !last;
    $('search-consent').querySelector('.search-policy').textContent = `近くに候補がなければ半径5kmまで${selectedDish(state.answers) ? '、必要に応じて近いジャンルも' : ''}探します。`;
    $('search-consent').querySelector('.privacy-note').textContent = state.location
      ? '選んだ場所の座標をOpenPOI APIへ送って検索します。アプリには保存しません。'
      : '現在地の座標をOpenPOI APIへ送って検索します。アプリには保存しません。';
  }
  if (state.phase === 'result') renderResult();
  if (state.phase === 'empty') {
    const food = selectedDish(state.answers)?.label;
    $('empty-title').textContent = food ? `「${food}」で、もう少し探そう。` : 'もう少し、探し方を変えてみよう。';
    $('empty-copy').textContent = `${state.location.label}から半径5kmまで${food ? '、近いジャンルも含めて' : ''}探しましたが、候補が見つかりませんでした。${food ? '食べたいもの' : '気分'}や場所を変えるか、Google マップでも探せます。`;
  }
  if (state.phase === 'error') {
    $('error-title').textContent = state.error.title;
    $('error-copy').textContent = state.error.message;
    $('retry').textContent = state.error.location ? '位置情報をもう一度試す' : 'もう一度探す';
  }
  renderSearchLinks();
  if (focus) {
    const screen = $(`${state.phase}-screen`);
    screen.querySelector('h2, legend')?.focus({ preventScroll: true });
    if (matchMedia('(max-width: 800px)').matches) $('workspace').scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}

function renderResult() {
  const place = state.results[state.index];
  $('candidate-counter').textContent = `候補 ${state.index + 1} / ${state.results.length}`;
  const food = selectedDish(state.answers);
  const related = state.search.scope === 'genre';
  $('result-intro').textContent = food ? 'あなたにおすすめのお店' : '今日の着地点は、ここ。';
  $('result-reason').textContent = related ? `「${food.label}」は見つからず、近い「${selectedGroup(state.answers).label}」から。`
    : food ? `「${food.label}」で探した候補です。` : '気分に合う公園から、ひとつ。';
  const expanded = place.distance > state.search.preferredRadius;
  $('expanded-note').hidden = !expanded;
  $('expanded-note').textContent = expanded ? '希望の徒歩圏では見つからなかったため、範囲を広げた候補です。' : '';
  $('result-food-note').textContent = related
    ? `選んだジャンルの別案です。「${food.label}」を提供しているかはGoogle マップで確認してください。`
    : '料理名で検索した候補です。提供メニューはGoogle マップで確認してください。';
  $('result-food-note').hidden = !food;
  $('result-icon').setAttribute('href', `./assets/icons.svg#${food?.icon || MOODS[state.answers.mood].icon}`);
  $('result-category').textContent = categoryLabel(place, state.answers.mood);
  $('result-name').textContent = place.name;
  $('result-address').textContent = place.address || '住所の詳しい情報はGoogle マップで確認してください。';
  $('result-time').textContent = `徒歩 約${place.minutes}分`;
  $('result-distance').textContent = `（直線 ${Math.max(1, Math.round(place.distance))}m）`;
  $('maps-link').href = mapsUrl(place);
  $('maps-label').textContent = food ? 'Google マップでこの店へ' : 'Google マップでここへ';
  $('maps-link').setAttribute('aria-label', `${place.name}に向かう。Google マップで徒歩案内を開く`);
  $('answer-summary').replaceChildren(...questionsFor(state.answers).map((question) => {
    const span = document.createElement('span');
    span.textContent = question.choices.find((item) => item.id === state.answers[question.id]).label;
    return span;
  }));
  const atEnd = state.index + 1 === state.results.length;
  $('next-place').disabled = atEnd;
  $('last-candidate').hidden = !atEnd;
  const accuracy = state.location.accuracy;
  $('accuracy-note').hidden = !accuracy || accuracy <= 180;
  if (accuracy > 180) $('accuracy-note').textContent = `現在地の精度は約${Math.round(accuracy)}mです。場所がずれているときは、駅名・場所から指定してください。`;
  announce(`候補${state.index + 1}、${place.name}。徒歩約${place.minutes}分。`);
}

const connectionErrors = {
  timeout: ['少し時間がかかっています', '検索が時間内に終わりませんでした。通信環境を確認して、もう一度お試しください。'],
  busy: ['検索先が混み合っています', '少し待ってから、もう一度探してください。選んだ気分は残っています。'],
  invalid: ['施設情報を読み取れませんでした', '検索先の情報を受け取れませんでした。時間をおいて、もう一度お試しください。'],
};
function connectionMessage(error) {
  return connectionErrors[error?.code] || ['検索先につながりませんでした', '通信環境を確認して、もう一度探してください。回答はそのまま残っています。'];
}
function gpsError(error) {
  if (error.code === 1) return ['位置情報が許可されていません', '駅名・場所から探せます。現在地を使う場合は、ブラウザの位置情報を許可してから、もう一度お試しください。'];
  if (error.code === 3) return ['現在地の取得に時間がかかっています', '駅名・場所を指定するか、電波の届く場所でもう一度お試しください。'];
  return ['現在地を取得できませんでした', 'この端末で位置情報が使えないか、位置がわかりませんでした。駅名・場所から探すこともできます。'];
}

function getPosition(signal) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject({ code: 2 }); return; }
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener('abort', aborted); fn(value);
    };
    const aborted = () => finish(reject, { code: 'aborted' });
    const timer = setTimeout(() => finish(reject, { code: 3 }), 12000);
    signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) { aborted(); return; }
    navigator.geolocation.getCurrentPosition(
      (position) => finish(resolve, position), (error) => finish(reject, error),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  });
}

function loading(title, copy) {
  state.phase = 'loading'; $('loading-title').textContent = title; $('loading-copy').textContent = copy;
  render(true); announce(title);
}
async function findNearby() {
  if (!state.location || !completeAnswers(state.answers)) return;
  const { id, signal } = begin(mainTask);
  const center = { ...state.location }; const answers = { ...state.answers }; const companion = state.companion;
  const food = selectedDish(answers);
  loading(food ? `${food.label}のお店を探しています` : '近くの着地点を探しています', '選んだ気分のまま、近くの候補を。');
  try {
    const result = await findRecommendations(center, answers, companion, { signal, onProgress: ({ radius, scope }) => {
      if (!current(mainTask, id)) return;
      $('loading-copy').textContent = scope === 'genre' ? '料理の候補がないため、近いジャンルのお店も探しています。'
        : radius > 600 ? `近くに候補がないため、半径${radius / 1000}kmまで広げて探しています。` : 'まずは、希望の徒歩圏から。';
    } });
    if (!current(mainTask, id)) return;
    state.search = result; state.results = result.places; state.index = 0;
    state.phase = state.results.length ? 'result' : 'empty';
    render(true);
    if (!state.results.length) announce('半径5kmまで探しましたが、候補が見つかりませんでした。');
  } catch (error) {
    if (!current(mainTask, id) || error.code === 'aborted') return;
    const [title, message] = connectionMessage(error);
    state.error = { title, message, location: false }; state.phase = 'error'; render(true); announce(title);
  }
}

function setPlaceBusy(busy) {
  $('gps-button').disabled = busy; $('place-submit').disabled = busy; $('place-query').disabled = busy;
  $('cancel-place-request').hidden = !busy;
  $('place-options').querySelectorAll('button').forEach((button) => { button.disabled = busy; });
}
function chooseLocation(location) {
  const shouldSearch = searchAfterLocation;
  state.location = location; state.results = []; state.index = 0;
  $('location-dialog').close();
  if (shouldSearch && completeAnswers(state.answers)) findNearby();
  else render();
  announce(`${location.label}を探す場所にしました。`);
}
async function useGps(inDialog = false) {
  const task = inDialog ? placeTask : mainTask;
  const { id, signal } = begin(task);
  if (inDialog) { setPlaceBusy(true); $('place-status').textContent = '現在地を確認しています…'; }
  else loading('いまいる場所を確認しています', '位置情報の利用を許可してください。');
  try {
    const position = await getPosition(signal);
    if (!current(task, id)) return;
    const coordinates = point({ lat: position.coords.latitude, lng: position.coords.longitude });
    if (!coordinates) throw { code: 2 };
    const location = { ...coordinates, label: '現在地周辺', accuracy: Number(position.coords.accuracy) || null };
    if (inDialog) chooseLocation(location);
    else { state.location = location; findNearby(); }
  } catch (error) {
    if (!current(task, id) || error.code === 'aborted') return;
    const [title, message] = gpsError(error);
    if (inDialog) $('place-status').textContent = `${title}。${message}`;
    else { state.error = { title, message, location: true }; state.phase = 'error'; render(true); announce(title); }
  } finally {
    if (inDialog && current(task, id)) setPlaceBusy(false);
  }
}

function openLocation(thenSearch = ['result', 'empty', 'error'].includes(state.phase)) {
  searchAfterLocation = thenSearch;
  $('place-status').textContent = '';
  $('place-options').replaceChildren();
  setPlaceBusy(false);
  $('location-dialog').showModal();
}
function editAnswers(step = 0) {
  cancel(mainTask); state.phase = 'question'; state.step = step; render(true);
}

$('companion-form').addEventListener('submit', (event) => {
  event.preventDefault(); if (!state.companion) return;
  state.phase = 'question'; state.step = 0; render(true);
});
$('question-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const flow = questionsFor(state.answers);
  if (!state.answers[flow[state.step].id]) return;
  if (state.step < flow.length - 1) { state.step += 1; render(true); }
  else if (state.location) findNearby(); else useGps();
});
$('question-back').addEventListener('click', () => {
  if (state.step > 0) state.step -= 1; else state.phase = 'companion'; render(true);
});
$('restart').addEventListener('click', () => {
  cancel(mainTask); cancel(placeTask);
  Object.assign(state, { phase: 'companion', step: 0, companion: '', answers: {}, results: [], index: 0, search: null, error: null });
  render(true);
});
$('cancel-search').addEventListener('click', () => editAnswers(questionsFor(state.answers).length - 1));
$('location-trigger').addEventListener('click', () => openLocation());
$('question-manual').addEventListener('click', () => openLocation(true));
$('gps-button').addEventListener('click', () => useGps(true));
$('close-location').addEventListener('click', () => $('location-dialog').close());
$('location-dialog').addEventListener('close', () => {
  cancel(placeTask); setPlaceBusy(false); searchAfterLocation = false;
});
$('cancel-place-request').addEventListener('click', () => {
  cancel(placeTask); setPlaceBusy(false); $('place-status').textContent = '取得を取り消しました。場所を入力するか、現在地をもう一度お試しください。';
});
$('place-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = $('place-query').value.trim();
  if (query.length < 2) { $('place-status').textContent = '駅名や場所を2文字以上で入力してください。'; return; }
  const { id, signal } = begin(placeTask);
  setPlaceBusy(true); $('place-options').replaceChildren(); $('place-status').textContent = '場所を探しています…';
  try {
    const places = await searchPlaces(query, { signal });
    if (!current(placeTask, id)) return;
    $('place-status').textContent = places.length ? '探す中心にする場所を選んでください。' : '場所が見つかりませんでした。都道府県や駅名を加えてお試しください。';
    $('place-options').replaceChildren(...places.map((place) => {
      const li = document.createElement('li'); const button = document.createElement('button');
      button.type = 'button'; button.className = 'place-option';
      const name = document.createElement('strong'); name.textContent = place.name.slice(0, 180);
      const address = document.createElement('small'); address.textContent = typeof place.address === 'string' ? place.address.slice(0, 360) : '住所情報なし';
      button.append(name, address); button.addEventListener('click', () => chooseLocation({ ...point(place), label: place.name.slice(0, 180) }));
      li.append(button); return li;
    }));
  } catch (error) {
    if (!current(placeTask, id) || error.code === 'aborted') return;
    const [title, message] = connectionMessage(error); $('place-status').textContent = `${title}。${message}`;
  } finally { if (current(placeTask, id)) setPlaceBusy(false); }
});
$('next-place').addEventListener('click', () => {
  if (state.index + 1 >= state.results.length) return;
  state.index += 1; render(true);
});
$('review-answers').addEventListener('click', () => editAnswers());
$('result-change-place').addEventListener('click', () => openLocation(true));
$('empty-edit').addEventListener('click', () => editAnswers());
$('empty-place').addEventListener('click', () => openLocation(true));
$('error-manual').addEventListener('click', () => openLocation(true));
$('error-edit').addEventListener('click', () => editAnswers());
$('retry').addEventListener('click', () => { if (state.error.location) useGps(); else findNearby(); });
window.addEventListener('pagehide', () => { cancel(mainTask); cancel(placeTask); });
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  // BFCache keeps the DOM after pagehide canceled its in-flight operations.
  if (state.phase === 'loading') {
    editAnswers(questionsFor(state.answers).length - 1);
    announce('取得を取り消しました。回答は残っています。もう一度探せます。');
  }
  if ($('location-dialog').open) {
    setPlaceBusy(false);
    $('place-status').textContent = '取得を取り消しました。現在地や場所をもう一度指定できます。';
  }
});
render();
document.documentElement.dataset.ready = 'true';
