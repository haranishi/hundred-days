/* 画面の配線。測定は lib/measure.js、判定は lib/diagnose.js、保存は lib/history.js が持つ。
   ここがやるのは状態の出し分けと描画だけ。 */

import { PLANS, runMeasurement } from './lib/measure.js';
import { buckets, diagnose, gradeFor } from './lib/diagnose.js';
import { SCALES, SOURCES, rate, scaleRows } from './lib/scales.js';
import * as store from './lib/history.js';

const $ = (id) => document.getElementById(id);
const el = {
  empty: $('state-empty'), running: $('state-running'), error: $('state-error'),
  start: $('start'), retry: $('retry'), cancel: $('cancel'), eco: $('eco'),
  offline: $('offline'), cost: $('cost-amount'), phase: $('phase'), fill: $('bar-fill'),
  elapsed: $('elapsed'), live: $('live'), result: $('result'), verdict: $('verdict'),
  grade: $('grade'), gradeWord: $('grade-word'), gradeNote: $('grade-note'),
  conn: $('conn'), ecoNote: $('eco-note'),
  history: $('history'), broken: $('history-broken'), reset: $('history-reset'),
  body: $('history-body'), count: $('history-count'),
  exportBtn: $('history-export'), clearBtn: $('history-clear'),
  errorReason: $('error-reason')
};

/* 進み具合の目安。実測ではなく段階の重みで、待っている間に何も動かない状態を作らないためのもの */
const PROGRESS = { warmup: 5, idle: 20, down: 65, up: 95 };

const GRADE_WORD = {
  'A+': 'まったく問題なし', A: '問題なし', B: 'わずかに影響',
  C: '通話やゲームに影響', D: '明確に体感が悪い', F: '重度'
};

let items = [];
let running = false;
let cancelled = false;
let wentBackground = false;
let timer = null;
let clearArmed = false;

const show = (node, on) => { node.hidden = !on; };
const say = (text) => { el.live.textContent = text; };
const fix = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

function setState(name) {
  show(el.empty, name === 'empty');
  show(el.running, name === 'running');
  show(el.error, name === 'error');
}

// ---------------------------------------------------------------- 履歴

function renderHistory(broken) {
  show(el.history, items.length > 0 || broken);
  show(el.broken, Boolean(broken));
  el.body.innerHTML = '';
  for (const row of buckets(items)) {
    if (!row.count) continue;
    const tr = document.createElement('tr');
    for (const value of [row.label, String(row.count), `${fix(row.dl)} Mbps`, `${fix(row.ul)} Mbps`]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    el.body.append(tr);
  }
  el.count.textContent = items.length ? `${items.length} 回ぶんを保存しています（この端末のブラウザの中だけ）。` : '';
}

function loadHistory() {
  const loaded = store.load(window.localStorage);
  items = loaded.items;
  renderHistory(loaded.broken);
}

// ---------------------------------------------------------------- 結果の描画

/* 採点まで済ませた1件を作る。保存も表示も診断もこれを使う。
   ⚠️ 表示のときだけ採点して保存側に渡し忘れると、履歴のグレードが空のまま残る（実測で気付いた） */
function gradeRecord(measurement) {
  return { ...measurement, ...gradeFor(measurement.li, measurement.ld, measurement.lu) };
}

function renderResult(record) {
  const grade = { grade: record.grade, increase: record.increase };
  const { items: verdicts } = diagnose(record, items);

  el.verdict.innerHTML = '';
  for (const v of verdicts) {
    const li = document.createElement('li');
    li.className = `verdict__item verdict__item--${v.level}`;
    li.dataset.id = v.id;
    const h = document.createElement('p');
    h.className = 'verdict__title';
    h.textContent = v.title;
    const p = document.createElement('p');
    p.className = 'verdict__body';
    p.textContent = v.body;
    li.append(h, p);
    if (v.evidence) {
      const e = document.createElement('p');
      e.className = 'verdict__evidence';
      e.textContent = `根拠：${v.evidence}`;
      li.append(e);
    }
    el.verdict.append(li);
  }

  el.grade.textContent = grade.grade;
  el.grade.dataset.grade = grade.grade;
  el.gradeWord.textContent = GRADE_WORD[grade.grade] || '';
  el.gradeNote.textContent = Number.isFinite(grade.increase)
    ? `待機中より ${grade.increase}ms 増えました。数字が小さいほど、通信しながらでも反応が変わらないという意味です。`
    : '';

  for (const key of ['dl', 'ul', 'li', 'jit']) {
    const graded = rate(key, record[key]);
    const badge = $(`${key}-grade`);
    badge.textContent = graded.grade;
    badge.dataset.grade = graded.grade;
    badge.hidden = graded.grade === '—';
    $(`${key}-means`).textContent = graded.means ?? '';
  }

  $('dl').textContent = fix(record.dl);
  $('ul').textContent = fix(record.ul);
  $('li').textContent = fix(record.li, 0);
  $('ld').textContent = fix(record.ld, 0);
  $('lu').textContent = fix(record.lu, 0);
  $('jit').textContent = fix(record.jit, 0);
  el.conn.textContent = record.v6 ? 'IPv6で接続しています。' : 'IPv4で接続しています。';
  show(el.ecoNote, Boolean(record.eco));
  show(el.result, true);
  say(`診断が出ました。${verdicts[0]?.title ?? ''}`);
}

// ---------------------------------------------------------------- 測定

function reasonText(reason) {
  if (reason === 'background') {
    return 'ほかのタブや別のアプリに切り替わったため中止しました。ブラウザは背面のタブの通信を絞るので、そのままでは正しく測れません。';
  }
  if (reason === 'user') return '中止しました。';
  if (!navigator.onLine) return 'インターネットに接続されていません。';
  return '通信に失敗しました。時間をおいてもう一度お試しください。';
}

async function measure() {
  if (running) return;
  running = true;
  cancelled = false;
  wentBackground = false;
  show(el.result, false);
  setState('running');
  el.fill.style.width = '0%';

  const startedAt = Date.now();
  el.elapsed.textContent = '0';
  timer = setInterval(() => {
    el.elapsed.textContent = String(Math.floor((Date.now() - startedAt) / 1000));
  }, 250);

  try {
    const measurement = await runMeasurement({
      plan: el.eco.checked ? PLANS.eco : PLANS.normal,
      onPhase: ({ phase, label }) => {
        el.phase.textContent = label;
        el.fill.style.width = `${PROGRESS[phase] ?? 0}%`;
        say(label);
      },
      // 背面に回ったら結果を捨てる。半端な数字を残すほうが害になる
      shouldAbort: () => (cancelled ? 'user' : wentBackground ? 'background' : null)
    });
    el.fill.style.width = '100%';
    const record = gradeRecord(measurement);
    items = store.append(window.localStorage, items, record);
    renderHistory(false);
    renderResult(record);
    setState('empty');
  } catch (err) {
    el.errorReason.textContent = reasonText(err?.reason);
    setState('error');
    say('測定できませんでした。');
  } finally {
    clearInterval(timer);
    running = false;
  }
}

// ---------------------------------------------------------------- 入口

function syncCost() {
  el.cost.textContent = el.eco.checked ? '最大6MB' : '最大50MB';
}

function syncOnline() {
  const off = !navigator.onLine;
  show(el.offline, off);
  el.start.disabled = off;
}

// 携帯回線でデータ節約が有効なら、こちらから勝手に大量に使わない
if (navigator.connection?.saveData) el.eco.checked = true;

el.eco.addEventListener('change', syncCost);
el.start.addEventListener('click', measure);
el.retry.addEventListener('click', () => { setState('empty'); measure(); });
el.cancel.addEventListener('click', () => { cancelled = true; });
document.addEventListener('visibilitychange', () => { if (document.hidden && running) wentBackground = true; });
window.addEventListener('online', syncOnline);
window.addEventListener('offline', syncOnline);

el.reset.addEventListener('click', () => {
  store.clear(window.localStorage);
  items = [];
  renderHistory(false);
});

el.exportBtn.addEventListener('click', () => {
  const blob = new Blob([store.toCsv(items)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'kaisen-history.csv';
  a.click();
  URL.revokeObjectURL(url);
});

/* 消すのは取り返しがつかないので2回押させる。ブラウザのダイアログは使わない
   （測定中に出ると通信が止まるうえ、自動テストからも扱いにくい） */
el.clearBtn.addEventListener('click', () => {
  if (!clearArmed) {
    clearArmed = true;
    el.clearBtn.textContent = 'もう一度押すと消えます';
    el.clearBtn.classList.add('btn-sub--danger');
    setTimeout(() => {
      clearArmed = false;
      el.clearBtn.textContent = '履歴を全部消す';
      el.clearBtn.classList.remove('btn-sub--danger');
    }, 5000);
    return;
  }
  clearArmed = false;
  el.clearBtn.textContent = '履歴を全部消す';
  el.clearBtn.classList.remove('btn-sub--danger');
  store.clear(window.localStorage);
  items = [];
  renderHistory(false);
});

/* 目安表。測る前から読めるようにしたいので、結果とは別に起動時から置いておく。
   画面と文書で数字がずれないよう、素材は lib/scales.js の1か所から取る。 */
function renderScales() {
  const box = $('scale-tables');
  for (const key of Object.keys(SCALES)) {
    const scale = SCALES[key];
    const wrap = document.createElement('div');
    wrap.className = 'scale';

    const heading = document.createElement('h3');
    heading.className = 'scale__title';
    heading.textContent = `${scale.label}（${scale.unit}）`;
    const about = document.createElement('p');
    about.className = 'sub';
    about.textContent = scale.about;

    const table = document.createElement('table');
    table.className = 'scale__table';
    const head = document.createElement('thead');
    head.innerHTML = '<tr><th scope="col">評価</th><th scope="col">目安</th><th scope="col">できること</th></tr>';
    const body = document.createElement('tbody');
    for (const row of scaleRows(key)) {
      const tr = document.createElement('tr');
      const g = document.createElement('th');
      g.scope = 'row';
      g.className = 'scale__grade';
      g.dataset.grade = row.grade;
      g.textContent = row.grade;
      const range = document.createElement('td');
      range.className = 'scale__range';
      range.textContent = `${row.range} ${row.unit}`;
      const means = document.createElement('td');
      means.textContent = row.means;
      tr.append(g, range, means);
      body.append(tr);
    }
    table.append(head, body);

    const scroller = document.createElement('div');
    scroller.className = 'table-wrap';
    scroller.append(table);
    wrap.append(heading, about, scroller);
    box.append(wrap);
  }

  const list = $('scale-sources');
  for (const source of SOURCES) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = source.url;
    a.textContent = source.name;
    a.rel = 'noopener noreferrer';
    a.target = '_blank';
    li.append(a, document.createTextNode(`　${source.note}`));
    list.append(li);
  }
}

syncCost();
syncOnline();
renderScales();
loadHistory();
