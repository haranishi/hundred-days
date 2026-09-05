import { directionLabel, formatDistance } from './geo.js';
import { chainMessage, chainStatus, mapsUrl, summarize } from './normalize.js';
import { shortPlaceName } from './nominatim.js';

const FEE_COPY = { free: '無料', customers: '来店客向け', paid: '有料', unknown: '不明' };
const make = (tag, className, content) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
};
const badge = (content, data = {}) => {
  const node = make('span', 'badge', content);
  for (const [name, value] of Object.entries(data)) node.dataset[name] = value;
  return node;
};

export function legendVisibility(spots) {
  const visibility = { municipal: false, free: false, customers: false, paid: false, unknown: false, chain: false };
  for (const spot of spots) {
    if (spot.layer === 'municipal' || spot.layer === 'chain') visibility[spot.layer] = true;
    if (spot.layer === 'osm' && Object.hasOwn(visibility, spot.fee)) visibility[spot.fee] = true;
  }
  return visibility;
}

function spotCopy(spot) {
  const directionDistance = `${directionLabel(spot.bearing)} ${formatDistance(spot.distance)}`;
  if (spot.layer === 'municipal') return {
    badges: [badge('自治体', { layer: 'municipal' }), badge('無料', { fee: 'free' })],
    meta: [spot.source?.org || '自治体', directionDistance, spot.ssid && `SSID: ${spot.ssid}`, spot.addr].filter(Boolean),
    note: spot.apCount > 1 ? `${spot.apCount}アクセスポイントを1地点にまとめて表示` : '',
  };
  if (spot.layer === 'chain') {
    const chainName = spot.chain?.label || spot.brand;
    const badges = [badge('推定', { layer: 'chain' })];
    if (chainName && spot.name !== chainName) badges.push(badge(chainName, { brand: spot.brand }));
    return {
      badges,
      meta: [chainStatus(spot.chain), spot.chain?.condition, directionDistance].filter(Boolean),
      note: chainMessage(spot.chain),
    };
  }
  return {
    badges: [badge(FEE_COPY[spot.fee], { fee: spot.fee }), badge('OSM登録', { layer: 'osm' })],
    meta: [spot.category, directionDistance, spot.ssid && `SSID: ${spot.ssid}`].filter(Boolean),
    note: 'OSM登録の内容どおり。利用条件は店で確認を',
  };
}

export function createUI(handlers) {
  const refs = {
    app: document.querySelector('#app'), locate: document.querySelector('#locate'), form: document.querySelector('#place-form'),
    place: document.querySelector('#place'), search: document.querySelector('#search'), message: document.querySelector('#message'),
    placeResult: document.querySelector('#place-result'), placeResultLabel: document.querySelector('#place-result-label'),
    placeCandidates: document.querySelector('#place-candidates'), last: document.querySelector('#last'),
    lastLabel: document.querySelector('#last-label'), searchLast: document.querySelector('#search-last'),
    onlyFree: document.querySelector('#only-free'), layerMunicipal: document.querySelector('#layer-municipal'),
    onlyFreeLabel: document.querySelector('#only-free-label'),
    layerOsm: document.querySelector('#layer-osm'), layerChain: document.querySelector('#layer-chain'),
    empty: document.querySelector('#empty'), loading: document.querySelector('#loading'), summary: document.querySelector('#summary'),
    stateHint: document.querySelector('#state-hint'), legendItems: document.querySelectorAll('.map-legend span'),
    radiusToggle: document.querySelector('#radius-toggle'), none: document.querySelector('#none'),
    noneBody: document.querySelector('#none-body'), widen: document.querySelector('#widen'),
    layersOn: document.querySelector('#layers-on'), freeOff: document.querySelector('#free-off'), toPlace: document.querySelector('#to-place'),
    error: document.querySelector('#error'), errorBody: document.querySelector('#error-body'), retry: document.querySelector('#retry'),
    list: document.querySelector('#list'), chainList: document.querySelector('#chain-list'),
    chainCheckedAt: document.querySelector('#chain-checked-at'), credits: document.querySelector('#credits'),
  };
  let hasLast = false;

  refs.locate.addEventListener('click', handlers.locate);
  refs.form.addEventListener('submit', (event) => { event.preventDefault(); handlers.searchPlace(refs.place.value.trim()); });
  refs.onlyFree.addEventListener('change', () => handlers.filter(refs.onlyFree.checked));
  for (const [layer, control] of [['municipal', refs.layerMunicipal], ['osm', refs.layerOsm], ['chain', refs.layerChain]]) {
    control.addEventListener('change', () => handlers.layer(layer, control.checked));
  }
  refs.widen.addEventListener('click', handlers.widen); refs.retry.addEventListener('click', handlers.retry);
  refs.searchLast.addEventListener('click', handlers.searchLast);
  refs.radiusToggle.addEventListener('click', handlers.radius);
  refs.layersOn.addEventListener('click', handlers.layersOn);
  refs.freeOff.addEventListener('click', handlers.freeOff);
  refs.toPlace.addEventListener('click', handlers.toPlace);

  function setState(name) {
    refs.app.dataset.state = name;
    refs.empty.hidden = name !== 'empty'; refs.loading.hidden = name !== 'loading'; refs.summary.hidden = name !== 'results';
    refs.stateHint.hidden = name !== 'none' && name !== 'error';
    refs.stateHint.textContent = name === 'none'
      ? '候補はありません。上の案内から範囲や条件を変えられます'
      : name === 'error' ? '候補を表示できませんでした' : '';
    refs.radiusToggle.hidden = name !== 'results';
    refs.none.hidden = name !== 'none'; refs.error.hidden = name !== 'error';
    if (name === 'error') refs.last.hidden = true;
    else if (name === 'results' || name === 'none') refs.last.hidden = !hasLast;
  }
  function setBusy(active) {
    refs.locate.disabled = active; refs.search.disabled = active;
    if (active) { refs.message.textContent = '探しています…'; setState('loading'); }
  }
  function render(spots, allMatched, radius, selectedId, onSelect) {
    const counts = summarize(allMatched);
    const radiusText = radius === 3200 ? '3.2km' : '800m';
    let limits = '';
    if (allMatched.length > 100) limits += '。近い100か所までを表示';
    if (allMatched.length > 60) limits += '。地図のピンは近い60か所まで';
    const count = make('span', 'summary-count');
    count.append(
      `半径 ${radiusText} に ${counts.total} か所（`,
      make('span', 'nowrap', `自治体 ${counts.municipal}`),
      '・', make('span', 'nowrap', `OSM登録 ${counts.osm}`),
      '・', make('span', 'nowrap', `推定 ${counts.chain}`), '）。',
    );
    const note = make('span', 'summary-note', `OpenStreetMapと自治体の公開データに載っている場所だけです${limits}`);
    refs.summary.replaceChildren(count, note);
    refs.radiusToggle.textContent = radius === 3200 ? '800mに戻す' : '3.2kmに広げる';
    const rows = spots.map((spot) => {
      const item = make('li', 'spot'); item.dataset.id = spot.id; item.dataset.layer = spot.layer;
      if (spot.id === selectedId) item.setAttribute('aria-current', 'true');
      const main = make('div', 'spot-main'); main.tabIndex = 0; main.setAttribute('role', 'button');
      main.setAttribute('aria-label', `${spot.name}を地図で選択`);
      const title = make('div', 'spot-title'); title.append(make('h3', 'spot-name', spot.name));
      const copy = spotCopy(spot); const badges = make('span', 'badges'); badges.append(...copy.badges); title.append(badges);
      main.append(title, make('p', 'spot-meta', copy.meta.join('・')));
      if (copy.note && spot.id === selectedId) main.append(make('p', 'spot-note', copy.note));
      const select = () => onSelect(spot.id);
      main.addEventListener('click', select); main.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
      });
      const link = make('a', 'maps', 'Googleマップで開く'); link.href = mapsUrl(spot.lat, spot.lng);
      link.setAttribute('aria-label', `Googleマップで開く: ${spot.name}`);
      link.target = '_blank'; link.rel = 'noopener noreferrer'; item.append(main, link); return item;
    });
    if (allMatched.length > 100) rows.push(make('li', 'list-end', 'ここまで（近い100か所）'));
    refs.list.replaceChildren(...rows); refs.message.textContent = ''; setState('results');
  }
  function showNone(reason, radius) {
    const radiusText = radius === 3200 ? '3.2km' : '800m';
    const copy = {
      'layers-off': '表示する層のチェックが全部外れています',
      'free-filter': '無料と来店客向けだけの絞り込みで0件です',
      range: 'この範囲にはありません。地名で別の場所を探せます',
      radius: `半径 ${radiusText} に登録された場所がありません`,
    };
    refs.noneBody.textContent = copy[reason];
    refs.widen.hidden = reason !== 'radius'; refs.layersOn.hidden = reason !== 'layers-off';
    refs.freeOff.hidden = reason !== 'free-filter'; refs.toPlace.hidden = reason !== 'range';
    refs.message.textContent = ''; refs.list.replaceChildren(); setState('none');
  }
  function renderDataNotes(datasets) {
    const chains = datasets.chain.chains;
    refs.chainCheckedAt.textContent = chains[0]?.checkedAt || datasets.chain.generatedAt || '確認日不明';
    refs.chainList.replaceChildren(...chains.map((chain) => {
      const item = make('li', '', `${chain.label}：${chainStatus(chain)}。${chain.condition}。`);
      const link = make('a', '', '出典'); link.href = chain.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
      item.append(link); return item;
    }));
    refs.credits.append(...datasets.municipal.sources.map((source) => {
      const item = make('li'); const link = make('a', '', source.credit);
      link.href = source.pageUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; item.append(link); return item;
    }));
  }
  return {
    refs, setState, setBusy, render, showNone, renderDataNotes,
    setLegend(spots) {
      const visibility = legendVisibility(spots);
      for (const item of refs.legendItems) {
        const mark = item.querySelector('i');
        const key = mark?.dataset.layer || mark?.dataset.fee;
        item.hidden = !visibility[key];
      }
    },
    setFilters(onlyFree, layers) {
      refs.onlyFree.checked = onlyFree; refs.layerMunicipal.checked = layers.municipal;
      refs.layerOsm.checked = layers.osm; refs.layerChain.checked = layers.chain;
    },
    setFreeCount(count) {
      refs.onlyFreeLabel.textContent = `無料と来店客向けだけ${count === null ? '' : `（${count}）`}`;
    },
    showError(message) { refs.errorBody.textContent = message; refs.message.textContent = ''; setState('error'); },
    showMessage(message) { refs.message.textContent = message; },
    showPlaces(places, selectedIndex, onSelect) {
      refs.placeResult.hidden = places.length === 0;
      if (!places.length) { refs.placeCandidates.replaceChildren(); return; }
      refs.placeResultLabel.textContent = `この場所で探しています: ${shortPlaceName(places[selectedIndex].name)}`;
      const buttons = places.length > 1 ? places.slice(0, 5).map((place, index) => {
        const button = make('button', 'candidate', shortPlaceName(place.name));
        button.type = 'button'; button.setAttribute('aria-pressed', String(index === selectedIndex));
        button.addEventListener('click', () => onSelect(index)); return button;
      }) : [];
      refs.placeCandidates.replaceChildren(...buttons);
    },
    restoreState(name) { setState(name); },
    scrollToResults() {
      if (refs.summary.getBoundingClientRect().top <= globalThis.innerHeight * 0.8) return;
      const behavior = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      // 1列の画面では地図の上端に合わせる（地図のピンと件数の要約が同じ画面に入る）。2列なら結果カードへ
      const target = (globalThis.innerWidth < 900 && document.querySelector('.map-card')) || refs.summary.parentElement;
      target.scrollIntoView({ block: 'start', behavior });
    },
    showLast(last) {
      hasLast = Boolean(last);
      refs.last.hidden = !last || refs.app.dataset.state === 'error';
      if (last) refs.lastLabel.textContent = `前回: ${last.label}（${last.radius === 3200 ? '3.2km' : '800m'}）`;
    },
  };
}
