/* DOMに書くのはこのファイルだけ。文言は lib/ui.js、計算は lib/query.js が持つ */
import {
  answerSegments, answerSubParts, hourCellLabel, hoursTitle, peakText,
  spotText, spotsTitle, unknownHourText, zeroParts, zeroSubText,
} from './ui.js';

const $ = (id) => document.getElementById(id);
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
};

/* 状態の切り替えはここ1か所。読み込みの成功経路が増えると必ず書き忘れる（Day 032の教訓） */
const SHOWN = {
  intro: ['empty'],
  answer: ['ready'],
  status: ['loading'],
  failure: ['error'],
  none: ['none'],
  skeleton: ['loading'],
  spots: ['ready'],
  hours: ['ready'],
};

export function setState(name, message = '') {
  $('app').dataset.state = name;
  for (const [id, states] of Object.entries(SHOWN)) $(id).hidden = !states.includes(name);
  $('status').textContent = name === 'loading' ? message : '';
  $('failure-text').textContent = name === 'error' ? message : '';
}

// 節の切れ目にだけ折り返しの機会を置く。<wbr> は textContent に何も足さない
function writeParts(node, parts) {
  node.replaceChildren();
  parts.forEach((part, i) => {
    if (i) node.append(document.createElement('wbr'));
    node.append(document.createTextNode(part));
  });
}

export function renderAnswer(radius, years, who, summary) {
  const text = $('answer-text');
  text.replaceChildren();
  answerSegments(radius, years, who, summary.total).forEach((part, i) => {
    if (i) text.append(document.createElement('wbr'));
    text.append(part.strong ? el('strong', part.text, 'count') : document.createTextNode(part.text));
  });
  writeParts($('answer-sub'), answerSubParts(who, summary));
}

export function renderZero(who) {
  writeParts($('none-text'), zeroParts(who));
  $('none-sub').textContent = zeroSubText();
}

export function renderSpots(spots) {
  writeParts($('spots-title'), [spotsTitle(spots.length)]);
  const root = $('spots-list');
  root.replaceChildren();
  for (const spot of spots) {
    const item = el('li', '', 'spot');
    item.append(el('span', spotText(spot), 'spot-text'));
    root.append(item);
  }
}

export function renderHours(band) {
  $('hours-title').textContent = hoursTitle(band.known);
  const root = $('hour-band');
  root.replaceChildren();
  band.hours.forEach((count, hour) => {
    const item = el('li', '', 'band-cell');
    item.setAttribute('aria-label', hourCellLabel(hour, count));
    if (hour === band.peak) item.dataset.peak = '1';
    const bar = el('span', '', 'bar');
    // 帯の高さはいちばん多い時間を100%にした割合。0件のときは細い線を残して「無い」と分かるようにする
    bar.style.height = band.max > 0 ? `${Math.max(2, Math.round((count / band.max) * 100))}%` : '2%';
    item.append(bar);
    root.append(item);
  });
  $('hours-peak').textContent = peakText(band);
  const unknown = $('hours-unknown');
  unknown.textContent = unknownHourText(band);
  unknown.hidden = band.unknown === 0;
}

export function renderCandidates(items, onPick, stem = '') {
  const root = $('candidates');
  root.replaceChildren();
  if (!items.length) return;
  root.append(el('p', `候補が${items.length}件あります。押して選んでください`, 'candidates-head'));
  for (const item of items) {
    const button = el('button', '', 'candidate');
    button.type = 'button';
    // 目印の語を太字にして、10件並んでも目的の候補を拾いやすくする（名前そのものは変えない）
    const at = stem ? item.title.indexOf(stem) : -1;
    if (at >= 0) {
      const mark = document.createElement('strong');
      mark.textContent = stem;
      button.append(item.title.slice(0, at), mark, item.title.slice(at + stem.length));
    } else {
      button.textContent = item.title;
    }
    button.addEventListener('click', () => onPick(item));
    root.append(button);
  }
}

export function showMessage(text) {
  const root = $('candidates');
  root.replaceChildren();
  if (text) root.append(el('p', text, 'candidates-message'));
}

export function renderPlaceName(text) {
  const node = $('place-name');
  node.textContent = text;
  node.hidden = !text;
}
