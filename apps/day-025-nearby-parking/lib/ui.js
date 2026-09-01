import { formatDistance, routeUrl } from './geo.js';

const feeCopy = {
  yes: ['有料', 'badge paid'],
  no: ['無料', 'badge free'],
  unknown: ['料金不明', 'badge unknown'],
};

const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function createUI(handlers) {
  const refs = {
    banner: document.querySelector('#banner'),
    list: document.querySelector('#results-list'),
    count: document.querySelector('#result-count'),
    note: document.querySelector('#result-note'),
    candidates: document.querySelector('#place-candidates'),
    input: document.querySelector('#place-input'),
    submit: document.querySelector('#place-submit'),
    locate: document.querySelector('#locate-button'),
    restricted: document.querySelector('#restricted-toggle'),
    research: document.querySelector('#research-button'),
    returnButton: document.querySelector('#return-button'),
  };

  document.querySelector('#place-form').addEventListener('submit', (event) => {
    event.preventDefault();
    handlers.searchPlace(refs.input.value.trim());
  });
  refs.locate.addEventListener('click', handlers.locate);
  refs.restricted.addEventListener('change', () => handlers.showRestricted(refs.restricted.checked));
  refs.research.addEventListener('click', handlers.research);
  refs.returnButton.addEventListener('click', handlers.returnToCenter);
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    handlers.filter(button.dataset.filter);
  }));

  // banner=注意が要るもの（エラー・半径拡大）だけ。進捗や並び順はリスト見出し横のnoteへ
  function banner(message = '', tone = 'info') {
    refs.banner.textContent = message;
    refs.banner.dataset.tone = tone;
    refs.banner.hidden = !message;
  }

  function note(message = '') {
    refs.note.textContent = message;
    refs.note.hidden = !message;
  }

  function busy(active) {
    refs.locate.disabled = active;
    refs.submit.disabled = active;
    if (!active) return;
    note('');
    const skeletons = Array.from({ length: 3 }, () => {
      const item = make('div', 'skeleton');
      item.append(make('i'), make('i'), make('i'));
      return item;
    });
    refs.list.replaceChildren(...skeletons);
    refs.count.textContent = '検索中';
  }

  function render(items, total, selectedId, onSelect, matched = items.length) {
    // 上限で切った時は「50件」とだけ書かない（何件中の50件かを言う）
    refs.count.textContent = matched > items.length ? `${matched}件中${items.length}件` : `${items.length}件`;
    if (!items.length) {
      const empty = make('div', 'empty-state');
      const icon = make('span', 'empty-icon', 'P');
      icon.setAttribute('aria-hidden', 'true'); // 装飾。読み上げると「ピー」とだけ言われる
      empty.append(icon, make('h3', '', total ? '条件に合う候補がありません' : '駐車場が見つかりませんでした'), make('p', '', total ? 'フィルターを変更してみてください。' : '別の場所で検索してみてください。'));
      refs.list.replaceChildren(empty);
      return;
    }
    const cards = items.map((item, index) => {
      const card = make('article', `parking-card${item.id === selectedId ? ' is-selected' : ''}${index === 0 ? ' is-nearest' : ''}`);
      card.dataset.id = item.id;
      const main = make('div', 'card-main');
      main.tabIndex = 0;
      main.setAttribute('role', 'button');
      main.setAttribute('aria-label', `${item.name || '名称不明の駐車場'}を地図で選択`);
      const titleRow = make('div', 'title-row');
      const title = make('h3', '', item.name || '名称不明の駐車場');
      const distance = make('strong', 'distance', formatDistance(item.distance));
      titleRow.append(title, distance);
      const meta = make('div', 'card-meta');
      const [feeText, feeClass] = feeCopy[item.fee];
      meta.append(make('span', feeClass, feeText));
      if (item.charge) meta.append(make('span', 'detail', `料金 ${item.charge}`));
      if (item.openingHours) meta.append(make('span', 'detail', item.openingHours));
      if (item.capacity) meta.append(make('span', 'detail', `収容 ${item.capacity}台`));
      if (item.restricted) meta.append(make('span', 'detail', '利用制限あり'));
      main.append(titleRow, meta);
      const route = make('a', 'route-button');
      route.append(make('span', 'route-chip', 'ルート'));
      route.href = routeUrl(item.lat, item.lng);
      route.target = '_blank';
      route.rel = 'noopener';
      route.setAttribute('aria-label', `${item.name || '名称不明の駐車場'}へのルートを開く`);
      const select = () => onSelect(item.id);
      main.addEventListener('click', select);
      main.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
      card.append(main, route);
      return card;
    });
    refs.list.replaceChildren(...cards);
  }

  function showCandidates(items, onSelect) {
    const buttons = items.map((item) => {
      const button = make('button', 'candidate', item.name);
      button.type = 'button';
      button.addEventListener('click', () => { refs.candidates.hidden = true; onSelect(item); });
      return button;
    });
    refs.candidates.replaceChildren(...buttons);
    refs.candidates.hidden = !buttons.length;
  }

  return {
    refs, banner, note, busy, render, showCandidates,
    setRestricted(value) { refs.restricted.checked = value; },
    showResearch(value) { refs.research.hidden = !value; },
    enableReturn(value) { refs.returnButton.disabled = !value; },
    // 検索後はヒーローを1行に畳んで、地図とリストを先に見せる
    setCompact(value) { document.body.classList.toggle('is-compact', value); },
  };
}
