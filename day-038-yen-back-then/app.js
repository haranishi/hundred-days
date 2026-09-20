/* 昔の1000円、いまいくら — 画面まわり。計算は lib/cpi.js にある。

   外へ出るのは世界銀行の1本だけ。起動時に日本と米国の消費者物価指数をまとめて取る。
   指数を同梱しないのは、毎年あとから追加・改定されるため（古い数字を焼き付けたくない）。 */
'use strict';

import {
  parseSeries, indexOf, firstYear, latestYear, convert, convertBack, ratio,
  flatYears, commonLatestYear, parseAmount, coinDiameter, formatYen,
  FLAT_THRESHOLD, AMOUNT_DEFAULT
} from './lib/cpi.js';

const API =
  'https://api.worldbank.org/v2/country/JPN;USA/indicator/FP.CPI.TOTL?format=json&per_page=400';

// 飛び石。スライダー1本だと1960年から2000年代まで親指で延々と動かすことになる
const JUMPS = [1960, 1970, 1980, 1990, 2000, 2010, 2020];
const PRESETS = [1000, 5000, 10000, 30000];

// 丸の最大の直径（px）。画面の狭いほうに合わせてあり、もう片方はここから面積比で縮む
const COIN_MAX = 128;
const COIN_MIN = 26;

const $ = (id) => document.getElementById(id);
const app = $('app');

const state = {
  jp: null,
  us: null,
  year: null,
  amount: AMOUNT_DEFAULT
};

// ---------------------------------------------------------------- 取得

async function load() {
  setState('loading', '物価の記録を読み込んでいます…');
  try {
    const res = await fetch(API, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const series = parseSeries(await res.json());
    if (!series.JPN?.length) throw new Error('日本の指数が入っていませんでした');
    state.jp = series.JPN;
    state.us = series.USA || null;
    setUpYears();
    setState('ready', '');
    render();
  } catch (err) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    setState('error', '');
    /* 読む人は開発者ではないので、状態コードは画面に出さない。
       原因を知りたい人のために、詳しい中身はコンソールへ回す */
    $('failure-text').textContent = offline
      ? '通信が切れているようです。つながってから、もう一度おためしください。'
      : '物価のデータを取りに行けませんでした。少し時間をおいて、もう一度おためしください。';
    console.info('[昔の1000円] 取得に失敗:', err.message);
  }
}

function setState(name, statusText) {
  app.dataset.state = name;
  const ready = name === 'ready';
  $('status').textContent = statusText;
  $('status').hidden = ready || name === 'error';
  $('answer').hidden = !ready;
  $('coins').hidden = !ready;
  $('chart-section').hidden = !ready;
  $('facts').hidden = !ready;
  /* 指数が無いと年も金額も計算できない。押しても何も起きない部品を残すと、
     「年のスライダーはあるのに金額の候補は無い」という食い違った画面になる */
  $('picker').hidden = !ready;
  $('amount').hidden = !ready;
  /* 数字が1つも出ていないのに「この数字が言っていないこと」だけ残るのは据わりが悪い */
  document.querySelector('.limits').hidden = !ready;
  $('failure').hidden = name !== 'error';
  /* 取得の前後で高さが飛ばないように、読み込み中は同じくらいの大きさの骨組みを置く */
  $('skeleton').hidden = name !== 'loading';
}

// ---------------------------------------------------------------- 初期化

function setUpYears() {
  const first = firstYear(state.jp);
  const last = latestYear(state.jp);
  const range = $('year');
  range.min = String(first);
  range.max = String(last);
  // 既定は「最新年の30年前」。年が増えても勝手に追従する
  state.year = Math.max(first, last - 30);
  range.value = String(state.year);
  $('limit-latest').textContent = `${last}年`;

  $('jumps').replaceChildren(...JUMPS.filter((y) => y >= first && y <= last).map((y) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'jump';
    b.dataset.year = String(y);
    b.textContent = `${y}年`;
    li.append(b);
    return li;
  }));

  $('presets').replaceChildren(...PRESETS.map((v) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset';
    b.dataset.amount = String(v);
    b.textContent = `${formatYen(v)}円`;
    li.append(b);
    return li;
  }));
}

// ---------------------------------------------------------------- 描画

/* トラックの「ここまで来た」を塗るために、現在位置を%でCSSへ渡す。
   range は既定だと選択済みの側を塗ってくれないので、背景のグラデーションを自分で動かす */
function paintRange() {
  const range = $('year');
  const min = Number(range.min);
  const max = Number(range.max);
  const pos = max > min ? ((Number(range.value) - min) / (max - min)) * 100 : 0;
  range.style.setProperty('--pos', `${pos.toFixed(2)}%`);
}

function render() {
  const { jp, us, year, amount } = state;
  const last = latestYear(jp);
  const now = convert(amount, year, last, jp);
  const back = convertBack(amount, year, last, jp);
  const times = ratio(year, last, jp);
  const sameYear = year === last;

  $('year-output').textContent = String(year);
  $('answer-year').textContent = String(year);
  $('answer-then').textContent = formatYen(amount);
  $('answer-now').textContent = formatYen(now);
  $('answer-ratio').textContent = sameYear
    ? 'そのまま（いちばん新しい年です）'
    : `${times.toFixed(2)}倍（${times >= 1 ? '+' : ''}${((times - 1) * 100).toFixed(1)}%）`;

  $('limit-wage').innerHTML = sameYear
    ? '<b>給料は含みません。</b>物価が上がっても、収入が同じだけ増えたという話ではありません。'
    : `<b>給料は含みません。</b>物価が${times.toFixed(2)}倍でも、収入も${times.toFixed(2)}倍になったという話ではありません。`;

  $('back-amount').textContent = `${formatYen(amount)}円`;
  $('back-year').textContent = String(year);
  $('back-value').textContent = `${formatYen(back)}円`;

  paintRange();
  renderCoins(amount, now, year);
  renderChart(jp, year, last);
  renderFacts(jp, us, year, last);

  // 押した年・金額のボタンに印を付ける
  for (const b of document.querySelectorAll('.jump')) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.year) === year));
  }
  for (const b of document.querySelectorAll('.preset')) {
    b.setAttribute('aria-pressed', String(Number(b.dataset.amount) === amount));
  }
}

/* 丸の大きさ比べ。数字は丸の中ではなく必ず外（キャプション）に出す。
   中に入れると、小さいほうの丸で数字が消えて左右が非対称になる。 */
function renderCoins(amount, now, year) {
  const biggest = Math.max(amount, now);
  const face = `${formatYen(amount)}円`;
  $('coins-heading').textContent = `同じ「${face}」の中身`;
  setDisc($('coin-then'), coinDiameter(now, biggest, COIN_MAX, COIN_MIN), `${year}年の${face}は、いまの${formatYen(now)}円ぶん`);
  setDisc($('coin-now'), coinDiameter(amount, biggest, COIN_MAX, COIN_MIN), `いまの${face}は、${formatYen(amount)}円ぶん`);
  $('coin-then-year').textContent = String(year);
  $('coin-then-face').textContent = face;
  $('coin-now-face').textContent = face;
  $('coin-then-label').textContent = `${formatYen(now)}円ぶん`;
  $('coin-now-label').textContent = `${formatYen(amount)}円ぶん`;
}

function setDisc(el, diameter, label) {
  el.style.width = `${diameter}px`;
  el.style.height = `${diameter}px`;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', label);
}

/* 折れ線。1960年から最新年までの指数を1本引き、選んだ年から最新年までを塗る。
   SVGを直に組み立てているのは、依存を増やさないため（グラフの絵はこの1か所でしか使わない）。 */
function renderChart(series, year, last) {
  const W = 640;
  const H = 240;
  const pad = { top: 18, right: 16, bottom: 30, left: 16 };
  const first = firstYear(series);
  const max = Math.max(...series.map((r) => r.index));
  const x = (y) => pad.left + ((y - first) / (last - first)) * (W - pad.left - pad.right);
  const yPos = (v) => H - pad.bottom - (v / max) * (H - pad.top - pad.bottom);

  const points = series.map((r) => `${x(r.year).toFixed(1)},${yPos(r.index).toFixed(1)}`);
  const after = series.filter((r) => r.year >= year);
  const areaPoints = after.map((r) => `${x(r.year).toFixed(1)},${yPos(r.index).toFixed(1)}`);
  const base = H - pad.bottom;
  const area = areaPoints.length
    ? `M ${x(year).toFixed(1)},${base} L ${areaPoints.join(' L ')} L ${x(last).toFixed(1)},${base} Z`
    : '';

  const idx = indexOf(series, year);
  const dotX = x(year);
  const dotY = yPos(idx);
  // 年号の札が右端で切れないよう、右寄りでは左に寄せる
  const anchor = dotX > W - 90 ? 'end' : dotX < 90 ? 'start' : 'middle';

  const hundred = yPos(100);
  $('chart').innerHTML = [
    `<line class="chart__base" x1="${pad.left}" y1="${base}" x2="${W - pad.right}" y2="${base}" />`,
    `<line class="chart__guide" x1="${pad.left}" y1="${hundred.toFixed(1)}" x2="${W - pad.right}" y2="${hundred.toFixed(1)}" />`,
    `<text class="chart__tick" x="${pad.left + 2}" y="${(hundred - 6).toFixed(1)}" text-anchor="start">2010年＝100</text>`,
    area ? `<path class="chart__area" d="${area}" />` : '',
    `<polyline class="chart__line" points="${points.join(' ')}" />`,
    `<line class="chart__pin" x1="${dotX.toFixed(1)}" y1="${dotY.toFixed(1)}" x2="${dotX.toFixed(1)}" y2="${base}" />`,
    `<circle class="chart__dot" cx="${dotX.toFixed(1)}" cy="${dotY.toFixed(1)}" r="7" />`,
    `<text class="chart__label" x="${dotX.toFixed(1)}" y="${(dotY - 14).toFixed(1)}" text-anchor="${anchor}">${year}年</text>`,
    year > first + 3 ? `<text class="chart__tick" x="${pad.left}" y="${H - 8}" text-anchor="start">${first}年</text>` : '',
    year < last - 3 ? `<text class="chart__tick" x="${W - pad.right}" y="${H - 8}" text-anchor="end">${last}年</text>` : ''
  ].join('');

  $('chart-caption').textContent =
    `縦は消費者物価指数（2010年=100）。塗ってあるのが、${year}年からいままでの${last - year}年間です。`;
}

function renderFacts(jp, us, year, last) {
  const span = last - year;
  const flat = flatYears(jp, year, last);
  $('fact-flat').textContent = span === 0
    ? `${last}年は、いま確定している いちばん新しい年です。`
    : `${year}年からの${span}年のうち、物価がほとんど動かなかった年（前の年との差が±${FLAT_THRESHOLD}%未満）は${flat}年ありました。`;

  const world = $('fact-world');
  const common = us ? commonLatestYear(jp, us) : null;
  if (!common || year >= common) {
    world.hidden = true;
    world.textContent = '';
    return;
  }
  const jpTimes = ratio(year, common, jp);
  const usTimes = ratio(year, common, us);
  world.hidden = false;
  /* 上のカードは最新年まで、この行は2国そろう年まで。同じ「日本の倍率」でも数字が違うので、
     どの年までで比べたのかを毎回書く（書かないと、画面の中で数字が食い違って見える） */
  world.innerHTML =
    `<b>アメリカと比べる。</b>${year}年から${common}年までで、日本の物価は<b>${jpTimes.toFixed(2)}倍</b>、` +
    `アメリカは<b>${usTimes.toFixed(2)}倍</b>になりました。` +
    `<span class="fact__note">上のカードは${last}年までで計算しています。` +
    `アメリカの指数は${common}年までしか出ていないので、この行だけ${common}年でそろえました。</span>`;
}

// ---------------------------------------------------------------- 操作

$('year').addEventListener('input', (e) => {
  if (!state.jp) return;
  state.year = Number(e.target.value);
  render();
});

$('jumps').addEventListener('click', (e) => {
  const b = e.target.closest('.jump');
  if (!b || !state.jp) return;
  state.year = Number(b.dataset.year);
  $('year').value = String(state.year);
  render();
});

$('presets').addEventListener('click', (e) => {
  const b = e.target.closest('.preset');
  if (!b || !state.jp) return;
  state.amount = Number(b.dataset.amount);
  $('amount-input').value = formatYen(state.amount);
  render();
});

const amountInput = $('amount-input');
amountInput.addEventListener('input', () => {
  if (!state.jp) return;
  state.amount = parseAmount(amountInput.value);
  render();
});
// 打っている途中の数字を書き換えると邪魔なので、整形は入力を離れたときだけ
amountInput.addEventListener('blur', () => {
  amountInput.value = formatYen(state.amount);
});

$('retry').addEventListener('click', load);

load();
