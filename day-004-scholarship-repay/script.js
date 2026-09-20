'use strict';

/* 奨学金の返還額を、日本学生支援機構（JASSO）の「奨学金返還年数算出表」どおりに計算する。
   検証：第一種は公式の返還例10件と完全一致。第二種は返還回数60件が一致し、
   毎月の返還額は公式より1〜11円高め（総額で+0.03%以内）に出る。詳細はREADME.md。 */

// ---------------------------------------------------------------- 算出表

/** [貸与総額の上限, 割賦金の基礎額]。これを超える額は「総額の20分の1」。 */
const BASE_TABLE = [
  [200000, 30000], [400000, 40000], [500000, 50000], [600000, 60000],
  [700000, 70000], [900000, 80000], [1100000, 90000], [1300000, 100000],
  [1500000, 110000], [1700000, 120000], [1900000, 130000], [2100000, 140000],
  [2300000, 150000], [2500000, 160000], [3400000, 170000]
];

/** 貸与総額に対応する割賦金の基礎額。 */
function baseAmount(total) {
  for (const [max, base] of BASE_TABLE) {
    if (total <= max) return base;
  }
  return total / 20;
}

/** 返還年数＝貸与総額÷基礎額の小数点以下切り捨て。表の作りから上限は20年になる。 */
function repayYears(total) {
  return Math.min(20, Math.floor(total / baseAmount(total)));
}

/**
 * 返還条件を計算する。
 * @param {number} monthly 毎月の貸与額
 * @param {number} months  貸与月数
 * @param {number} rate    年利（第一種は0）
 */
function calc(monthly, months, rate) {
  const principal = monthly * months;
  const years = repayYears(principal);
  const times = years * 12;

  if (rate === 0) {
    return { principal, years, times, pay: Math.floor(principal / times), total: principal, interest: 0 };
  }

  // 元利均等返還。返還開始は貸与終了の7か月後なので、据置6か月分の利息を別途上乗せする。
  const r = rate / 12;
  const annuity = principal * r / (1 - Math.pow(1 + r, -times));
  const total = annuity * times + principal * rate * 0.5;

  return {
    principal,
    years,
    times,
    pay: Math.floor(total / times),
    total: Math.round(total),
    interest: Math.round(total - principal)
  };
}

// ---------------------------------------------------------------- 入力の選択肢

/* 貸与月額の選択肢（大学・平成30年度以降の入学者）。
   第一種は国公立/私立・自宅/自宅外で選べる額が違うので、その全区分の和集合を並べている。
     国公立 自宅   20,000 / 30,000 / 45,000
     国公立 自宅外 20,000 / 30,000 / 40,000 / 51,000
     私立   自宅   20,000 / 30,000 / 40,000 / 54,000
     私立   自宅外 20,000 / 30,000 / 40,000 / 50,000 / 64,000
   第二種は20,000〜120,000円の1万円刻み。 */
const AMOUNTS = {
  1: [20000, 30000, 40000, 45000, 50000, 51000, 54000, 64000],
  2: [20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000, 100000, 110000, 120000]
};

/* 種類を切り替えても金額の感覚を保ちたいので、状態はインデックスではなく金額そのもので持つ。
   切り替え先に同じ額が無ければ、いちばん近い額に寄せる。 */
const state = { kind: 1, amount: 54000, months: 48, rate: 0.01, gradAge: 22, takeHome: 220000 };

/** list の中で value にいちばん近い要素のインデックス。 */
function nearestIndex(list, value) {
  let best = 0;
  for (let i = 1; i < list.length; i++) {
    if (Math.abs(list[i] - value) < Math.abs(list[best] - value)) best = i;
  }
  return best;
}

// ---------------------------------------------------------------- DOM

const $ = (id) => document.getElementById(id);
const yen = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');

const el = {
  amount: $('amount'), amountOut: $('amount-out'), amountNote: $('amount-note'),
  fieldRate: $('field-rate'),
  age: $('r-age'), monthly: $('r-monthly'), span: $('r-span'),
  principal: $('r-principal'), total: $('r-total'), interest: $('r-interest'),
  ratio: $('r-ratio'), bar: $('r-bar'),
  pPrincipal: $('p-principal'), pBand: $('p-band'), pBase: $('p-base'),
  pFormula: $('p-formula'), pYears: $('p-years')
};

/** ラジオ風のセグメントコントロールを1つ組み立てる。 */
function bindSeg(id, onPick, parse = Number) {
  const root = $(id);
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-v]');
    if (!btn) return;
    for (const b of root.querySelectorAll('button[data-v]')) {
      b.setAttribute('aria-checked', String(b === btn));
    }
    onPick(parse(btn.dataset.v));
    render();
  });
}

// ---------------------------------------------------------------- 描画

/** いま該当している区分の説明文をつくる。 */
function bandLabel(principal) {
  if (principal > 3400000) return '3,400,001円以上なので、基礎額は総額の20分の1';

  for (let i = 0; i < BASE_TABLE.length; i++) {
    const [max] = BASE_TABLE[i];
    if (principal <= max) {
      const from = i === 0 ? 0 : BASE_TABLE[i - 1][0] + 1;
      const range = i === 0 ? `${max.toLocaleString('ja-JP')}円以下`
        : `${from.toLocaleString('ja-JP')}〜${max.toLocaleString('ja-JP')}円`;
      return `${range} の区分に対応する基礎額は`;
    }
  }
  return '';
}

/** 年数がどう決まったかの道筋を描く。 */
function renderPath(principal, years, times) {
  const base = baseAmount(principal);
  const raw = principal / base;

  el.pPrincipal.textContent = yen(principal);
  el.pBand.textContent = bandLabel(principal);
  el.pBase.textContent = yen(base);
  el.pFormula.textContent =
    `${principal.toLocaleString('ja-JP')} ÷ ${Math.round(base).toLocaleString('ja-JP')} = ${raw.toFixed(2)}`;
  el.pYears.textContent = `${years}年（${times}回）`;
}

function render() {
  const list = AMOUNTS[state.kind];

  // 種類を切り替えると選択肢が変わるので、いちばん近い額に寄せてスライダーを合わせ直す
  const index = nearestIndex(list, state.amount);
  const monthly = list[index];
  state.amount = monthly;
  el.amount.max = String(list.length - 1);
  el.amount.value = String(index);
  const rate = state.kind === 1 ? 0 : state.rate;
  const r = calc(monthly, state.months, rate);

  el.amountOut.textContent = monthly.toLocaleString('ja-JP') + '円';
  el.amountNote.textContent = state.kind === 1
    ? '大学の第一種は、国公立か私立か・自宅か自宅外かで上限が変わります（最大64,000円）。'
    : '大学の第二種は20,000円から120,000円まで、10,000円単位で選べます。';

  el.fieldRate.hidden = state.kind === 1;

  el.age.textContent = String(state.gradAge + r.years);
  el.monthly.textContent = yen(r.pay);
  el.span.textContent = `${r.years}年 · ${r.times}回`;
  el.principal.textContent = yen(r.principal);
  el.total.textContent = yen(r.total);
  el.interest.textContent = yen(r.interest);

  const ratio = r.pay / state.takeHome * 100;
  el.ratio.textContent = ratio.toFixed(1) + '%';
  el.bar.style.width = Math.min(100, ratio) + '%';

  renderPath(r.principal, r.years, r.times);
}

// ---------------------------------------------------------------- 起動

el.amount.addEventListener('input', () => {
  state.amount = AMOUNTS[state.kind][Number(el.amount.value)];
  render();
});

bindSeg('seg-kind', (v) => { state.kind = v; });
bindSeg('seg-years', (v) => { state.months = v; });
bindSeg('seg-rate', (v) => { state.rate = v; }, parseFloat);
bindSeg('seg-age', (v) => { state.gradAge = v; });
bindSeg('seg-take', (v) => { state.takeHome = v; });

render();
