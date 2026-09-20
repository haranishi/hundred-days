/* 画面に出す文字列の組み立てと、DOMへの書き込み。計算は probability.js、時刻は time.js が持つ。
   文字列を作る関数はDOMに触らないので、テストから直に読める。

   気象業務法17条に触れないよう、ここで足してよいのは助詞と単位だけ。
   「危険」「大丈夫」のような判断も、発表されていない数字の言い換えも作らない。 */
import { clockText, dayLabel, dayParts, intervalShort, intervalText, issueText, jst, stampText } from './time.js';

const $ = (id) => document.getElementById(id);
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
};

/* 状態の切り替えはここ1か所。読み込みの経路が増えると必ず書き忘れる（Day 032・041の教訓）。
   「街を選んだかどうか」は state と別の軸なので、答え欄だけ別に出し入れする */
const SHOWN = {
  status: ['loading'],
  failure: ['error'],
  none: ['none'],
  typhoon: ['ready'],
  'map-area': ['ready'],
  'top-areas': ['ready'],
};
/* 街を選ぶまで出さないもの。答えは選んだ地域の値なので、選ぶ前に出しようがない */
const NEEDS_TOWN = ['answer', 'band-area', 'others-area'];

export function setState(name, message = '') {
  $('app').dataset.state = name;
  for (const [id, states] of Object.entries(SHOWN)) $(id).hidden = !states.includes(name);
  $('status').textContent = name === 'loading' ? message : '';
  $('failure-text').textContent = name === 'error' ? message : '';
  if (name !== 'ready') setTownShown(false);
}

/** 街を選んだときだけ出す欄の開け閉め。使い方の案内は、答えが出たら引っ込める */
export function setTownShown(shown) {
  for (const id of NEEDS_TOWN) $(id).hidden = !shown;
  $('app').dataset.town = shown ? '1' : '0';
  $('intro').hidden = shown;
}

/* ---------------------------------------------------------------- 文字列 */

/** 1行目。%だけ大きく出したいので、かたまりに分けて返す */
export const answerSegments = (townName, total) => [
  { text: `${townName}は、5日以内に暴風域に入る確率 ` },
  { text: `${total}%`, count: true },
  { text: '。' },
];
export const answerText = (townName, total) => answerSegments(townName, total).map((part) => part.text).join('');

/* 2行目。山と「5%以上になる」時刻。最大が0ならその1文だけ。
   判定は 5 以上（firstOver）なので、文も「5%以上になる」と書く（ちょうど5%の区間が該当する）。
   時間帯は「21日（月）9時〜12時」のひとまとまりで読ませたいので、
   途中で折り返らないかたまりに分けて返す（〜 は行末の折り返し位置になってしまう）。
   「5%以上になる」も同じ理由でひとまとまりにする（行末に「5%」だけ残さない） */
export function answerSubParts(read) {
  if (!read || read.peak.value === 0) return [{ text: '5日以内のどの時間帯も 0% です。' }];
  const parts = [
    { text: '山は ' },
    { text: intervalText(read.peak.validtime), nowrap: true },
    { text: ` の ${read.peak.value}%。` },
  ];
  if (!read.over) return [...parts, { text: '5%以上になる', nowrap: true }, { text: '時間帯はありません。' }];
  return [...parts,
    { text: '5%以上になるのは ', nowrap: true },
    { text: intervalText(read.over.validtime), nowrap: true },
    { text: ' から。' }];
}
export const answerSubText = (read) => answerSubParts(read).map((part) => part.text).join('');

/** 3行目。いつの発表か・どの地域の値かを必ず添える */
export const answerMetaText = (read, areaName, number) =>
  `気象庁 ${issueText(read.targetDatetime)}の発表（${areaName}の値）・台風第${number}号`;

export const noneSubText = (wall) => `気象庁が発表している台風は、${stampText(wall)}時点でありません。`;
export const NO_TYPHOON_NOTE = 'いま台風がないので、確率の発表はありません。';
export const LOAD_FAILED = '台風の情報を取得できませんでした。通信を確認して、もう一度おためしください。';
export const LOADING = '気象庁の発表を読み込んでいます…';

export const otherText = (number, total) => `台風第${number}号：5日以内 ${total}%`;
export const bandLabel = (validtime, value) => `${intervalShort(validtime)} ${value}%`;
export const topRowText = (area, value) => `${area.name}（${area.pref}） ${value}%`;

/** 現況の見出し。名前が無い（熱帯低気圧など）ときは番号だけ */
export const typhoonTitle = (spec) => (spec.name ? `台風第${spec.number}号（${spec.name}）` : `台風第${spec.number}号`);

/** 階級・大きさ・強さ。該当なしの "-" は出さない */
export const scaleText = (spec) =>
  [spec.category, spec.analysis.scale, spec.analysis.intensity].filter(Boolean).join('・');

/** 暴風域・強風域。全方向同じなら「全域 110km」、非対称なら「北東 750km・南西 390km」 */
export const rangeText = (ranges) =>
  ranges.map((entry) => `${entry.area} ${entry.km}km`).join('・');

/** 現況の項目。値が無いものは行ごと出さない */
export function typhoonFacts(spec) {
  const now = spec.analysis;
  /* 時刻は1回のパースから日付と時を作る。文字列を切って時だけ拾うと、
     validtime が空のときに「0時」と出てしまう（読めなければ行ごと落とす） */
  const at = jst(now.validtime);
  const rows = [
    ['実況', at ? `${dayLabel(at)}${at.hour}時` : ''],
    ['中心位置', [now.location, now.accuracy].filter(Boolean).join('・')],
    ['進行', now.course && now.speedKmh !== null ? `${now.course}へ ${now.speedKmh}km/h` : ''],
    ['中心気圧', now.pressure !== null ? `${now.pressure}hPa` : ''],
    ['最大風速', now.windMs !== null ? `${now.windMs}m/s（最大瞬間風速 ${now.gustMs ?? '-'}m/s）` : ''],
    ['暴風域', rangeText(now.stormWarning)],
    ['強風域', rangeText(now.galeWarning)],
  ];
  return rows.filter(([, value]) => value);
}

export const issueLine = (issue) => `気象庁 ${clockText(issue)} 発表`;

/* ---------------------------------------------------------------- DOM */

export function renderAnswer({ townName, read, areaName, number }) {
  const text = $('answer-text');
  text.replaceChildren();
  for (const part of answerSegments(townName, read.total)) {
    if (!part.count) { text.append(document.createTextNode(part.text)); continue; }
    /* 広い画面では%の手前で行を分け、数字だけを独立させる。
       この br は狭い画面では display:none にしてあるので、390pxでは1続きのまま */
    text.append(el('br', '', 'answer-break'), el('span', part.text, 'count'));
  }
  const sub = $('answer-sub');
  sub.replaceChildren();
  for (const part of answerSubParts(read)) {
    sub.append(part.nowrap ? el('span', part.text, 'nowrap') : document.createTextNode(part.text));
  }
  $('answer-meta').textContent = answerMetaText(read, areaName, number);
}

export function renderOthers(rows) {
  const root = $('others');
  root.replaceChildren();
  for (const row of rows) root.append(el('li', otherText(row.number, row.total)));
  $('others-area').hidden = rows.length === 0;
}

/**
 * 3時間ごとの帯。40本。高さは0〜100%の目盛で取るので、
 * 1%の街が22%の街と同じ高さに見えることはない（系列ごとに伸ばさない）。
 */
export function renderBand({ series, validtime, nowIndex, peakIndex, dayStarts }) {
  const root = $('band');
  root.replaceChildren();
  series.forEach((value, i) => {
    const cell = el('li', '', 'band-cell');
    cell.setAttribute('aria-label', bandLabel(validtime[i], value));
    if (!value) cell.dataset.zero = '1';
    if (i === peakIndex && value > 0) cell.dataset.peak = '1';
    if (dayStarts[i]) {
      cell.dataset.daystart = '1';
      const [day, week] = dayParts(validtime[i]);
      const label = el('span', '', 'band-day');
      /* 曜日は別のかたまりにしておく。棒1本が8px前後しかない狭い画面では曜日だけ隠す */
      label.append(document.createTextNode(day), el('span', week, 'band-week'));
      cell.append(label);
    }
    if (i === nowIndex) {
      cell.dataset.now = '1';
      cell.append(el('span', 'いま', 'band-now'));
    }
    const bar = el('span', '', 'bar');
    bar.style.height = `${Math.max(2, value)}%`;
    /* 数字は棒のすぐ上。棒の中に入れておかないと、帯の上端（日付のラベルの位置）に飛ぶ */
    if (value >= 5) bar.append(el('span', String(value), 'band-value'));
    cell.append(bar);
    root.append(cell);
  });
}

export function renderTyphoon(spec, issue) {
  $('typhoon-title').textContent = typhoonTitle(spec);
  $('typhoon-scale').textContent = scaleText(spec);
  const facts = $('typhoon-facts');
  facts.replaceChildren();
  for (const [label, value] of typhoonFacts(spec)) {
    facts.append(el('dt', label), el('dd', value));
  }
  $('typhoon-issue').textContent = issueLine(issue);
}

export function renderTop(rows) {
  const root = $('top-list');
  root.replaceChildren();
  for (const row of rows) {
    const item = document.createElement('li');
    item.append(el('span', `${row.area.name}（${row.area.pref}）`), el('span', `${row.value}%`, 'top-value'));
    root.append(item);
  }
}

export function renderCandidates(items, onPick) {
  const root = $('candidates');
  root.replaceChildren();
  if (!items.length) return;
  root.append(el('p', `候補が${items.length}件あります。押して選んでください`, 'candidates-head'));
  for (const item of items) {
    const button = el('button', `${item.name}（${item.pref}）`, 'candidate');
    button.type = 'button';
    button.addEventListener('click', () => onPick(item));
    root.append(button);
  }
}

export function showMessage(text) {
  const root = $('candidates');
  root.replaceChildren();
  if (text) root.append(el('p', text, 'candidates-message'));
}

export function renderPlace(name, note = '') {
  const label = $('place-name');
  label.textContent = name ? `選んだ場所：${name}` : '';
  label.hidden = !name;
  const hint = $('place-note');
  hint.textContent = note;
  hint.hidden = !note;
}

export function renderNone(wall) {
  $('none-sub').textContent = noneSubText(wall);
}

export const setMapStatus = (text) => { $('map-status').textContent = text; };
