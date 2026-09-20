import { formatDistance, walkText } from './geo.js';
import { HAZARDS, hazardName } from './tiles.js';
import { hazardsOf } from './rank.js';
import {
  answerParts, answerSubParts, noSitesParts, noSitesSubText, unusableMoreText,
  unusableNoneText, unusableTitleParts, usableTitleParts,
} from './ui.js';

const $ = (id) => document.getElementById(id);
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
};

// 節の切れ目にだけ折り返しの機会を置く。<wbr> は textContent に何も足さない
function writeParts(node, parts) {
  node.replaceChildren();
  parts.forEach((part, i) => {
    if (i) node.append(document.createElement('wbr'));
    node.append(document.createTextNode(part));
  });
}

export function renderHazardCounts(counts) {
  $('hazard-note').hidden = false;
  for (const hazard of HAZARDS) {
    const node = document.querySelector(`[data-hazard-count="${hazard.id}"]`);
    if (node) node.textContent = counts ? ` ${counts[hazard.id] ?? 0}` : '';
  }
}

const mapLink = (place) => {
  const link = el('a', '地図アプリで開く', 'map-link');
  link.href = `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`;
  link.target = '_blank';
  link.rel = 'noopener';
  return link;
};

export function renderAnswer(hazard, result) {
  const first = result.usable[0];
  writeParts($('answer-text'), answerParts(hazard, first));
  writeParts($('answer-sub'), answerSubParts(hazard, result.nearerUnusable));
  // 「それより近くに◯か所あるが使えない」は、このアプリがいちばん言いたいこと。安心の文と同じ見た目にしない
  $('answer').dataset.warning = result.nearerUnusable > 0 ? '1' : '0';
  // 答えを読んだ直後に一歩目へ進めるよう、1位の住所と地図のリンクを答えの下にも置く（一覧は画面の下のほうにある）
  const action = $('answer-action');
  action.replaceChildren();
  if (first.address) action.append(el('span', first.address, 'answer-address'));
  action.append(mapLink(first));
}

export function renderNoSites(hazard) {
  writeParts($('no-sites-text'), noSitesParts(hazard));
  $('no-sites-sub').textContent = noSitesSubText(hazard);
}

export function renderUsable(hazard, list) {
  writeParts($('usable-title'), usableTitleParts(hazard, list.length));
  const root = $('usable-list');
  root.replaceChildren();
  for (const place of list) {
    const item = el('li', '', 'site');
    item.append(el('strong', place.name || '名称のない場所', 'site-name'));
    item.append(el('p', `${formatDistance(place.distance)}・${walkText(place.distance)}`, 'measure'));
    if (place.address) item.append(el('p', place.address, 'address'));
    if (place.remarks) item.append(el('p', place.remarks, 'remarks'));
    const others = hazardsOf(place, hazard);
    if (others.length) item.append(el('p', `ほかに使える災害：${others.map(hazardName).join('、')}`, 'flags'));
    item.append(mapLink(place));
    root.append(item);
  }
}

export function renderUnusable(hazard, result) {
  writeParts($('unusable-title'), unusableTitleParts(hazard));
  const root = $('unusable-list');
  root.replaceChildren();
  for (const place of result.unusable) {
    const item = el('li', '', 'site');
    item.append(el('strong', place.name || '名称のない場所', 'site-name'));
    item.append(el('p', formatDistance(place.distance), 'measure'));
    item.append(el('p', `指定されている災害：${hazardsOf(place, hazard).map(hazardName).join('、')}`, 'flags'));
    root.append(item);
  }
  const none = $('unusable-none');
  none.hidden = result.unusable.length > 0;
  none.textContent = result.unusable.length ? '' : unusableNoneText(hazard, result.usable.length);
  const more = $('unusable-more');
  more.hidden = result.unusableMore < 1;
  more.textContent = result.unusableMore > 0 ? unusableMoreText(result.unusableMore) : '';
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
