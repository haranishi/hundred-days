import { createPlayDialog, textNode, actionButton } from './play-dialog.js';

const PIN = 44; // 出発地点の印の、押せる大きさ（px）
const GAP = 52; // 印どうしの中心の最小の間隔（px）。見える円は 40px
const KEEP = 30; // 駅の印から、出発地点の印の中心を離す距離（px）
const FEATURE_MARKS = { kicker: ['△', 'ジャンプ台'], cliff: ['▽', '崖'], lip: ['▽', '雪庇'], chute: ['∥', 'ルンゼ'], pipe: ['∪', '沢の壁'], spines: ['≋', '背と溝'], mounds: ['∴', '雪のこぶ'], rollers: ['≈', 'うねり'] };

/** 名前を、折ってよい所（の・を・へ の後ろ）で分ける。前後が 2 文字より短くなる所では分けない（「ジャンプ台の／列」を避ける） */
export function phrases(name) {
  const out = []; let start = 0;
  for (let i = 0; i < name.length - 1; i++) if ('のをへ'.includes(name[i]) && i + 1 - start >= 2 && name.length - (i + 1) >= 2) { out.push(name.slice(start, i + 1)); start = i + 1; }
  out.push(name.slice(start)); return out;
}
export function mapContent(data, selected) {
  const position = p => ({ left: Math.max(0, Math.min(100, (p.x / data.size + .5) * 100)), top: Math.max(0, Math.min(100, (p.z / data.size + .5) * 100)) });
  const drops = data.drops.map((d, i) => ({ ...d, ...position(d), number: i + 1, difficulty: '●'.repeat(d.level ?? 1),
    state: d.locked ? '鍵がかかっています' : d.goals.every(g => g.earned) ? '課題をすべて達成' : d.goals[0].earned ? '駅まで滑りきった' : 'まだ滑りきっていない',
    stars: d.goals.filter(g => g.earned).length }));
  return { ...data, drops, stations: data.stations.map(s => ({ ...s, ...position(s) })), features: data.features.map(f => ({ ...f, ...position(f) })),
    selected: drops.find(d => d.id === selected) ?? drops[0] ?? null };
}

/** 小さな印は本当の位置から最大12px。密集時も位置の意味を優先する。 */
export function smallMarkerLayout(items, side) {
  const placed = [];
  return items.map(item => {
    const ax = item.left / 100 * side, ay = item.top / 100 * side;
    let x = ax, y = ay, best = -Infinity;
    for (let r = 0; r <= 12; r += 2) {
      const count = r ? 24 : 1;
      for (let k = 0; k < count; k++) {
        const a = k / count * Math.PI * 2, tx = ax + Math.cos(a) * r, ty = ay + Math.sin(a) * r;
        if (tx < 0 || tx > side || ty < 0 || ty > side) continue;
        const clearance = Math.min(24, ...placed.map(p => Math.hypot(tx - p.x, ty - p.y)));
        const score = clearance - r * .01;
        if (score > best) { best = score; x = tx; y = ty; }
      }
      if (best >= 24 - r * .01) break;
    }
    placed.push({ x, y });
    return { ...item, anchorLeft: item.left, anchorTop: item.top, left: x / side * 100, top: y / side * 100 };
  });
}

/** 地図内のpx座標から、44px以内で最も近い印を選ぶ。同距離は表示順。 */
export function nearestDrop(items, side, x, y) {
  let nearest = null, distance = 44;
  for (const item of items) {
    const d = Math.hypot(item.left / 100 * side - x, item.top / 100 * side - y);
    if (d <= 44 && (!nearest || d < distance)) { nearest = item; distance = d; }
  }
  return nearest;
}
export function stepDrop(items, selected, direction) {
  if (!items.length) return null;
  const i = Math.max(0, items.findIndex(d => d.id === selected));
  return items[(i + direction + items.length) % items.length];
}
export function lockedText(drop) {
  const metres = v => Math.ceil(v).toLocaleString('ja-JP');
  return `滑った標高差の合計 ${metres(drop.threshold)} m で開きます（あと ${metres(drop.remaining)} m）`;
}

export function markerLayout(items, side, avoid = []) {
  const columns = Math.ceil(Math.sqrt(items.length || 1));
  // 一辺が分からないとき（試験）は、ゆとりのある広さで置く
  if (!Number.isFinite(side) || side <= 0) side = (columns + 3) * GAP + PIN;
  const roomy = side >= (columns + 3) * GAP + PIN;
  if (!roomy) return { side, roomy, items: smallMarkerLayout(items, side) };
  const lo = PIN / 2, hi = side - PIN / 2, placed = [];
  // avoid：印を重ねたくない点（駅の記号）。位置は ％
  const fixed = avoid.map(a => ({ x: a.left / 100 * side, y: a.top / 100 * side }));
  const clear = (x, y) => x >= lo - 1e-6 && x <= hi + 1e-6 && y >= lo - 1e-6 && y <= hi + 1e-6 && placed.every(p => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) >= GAP - 1e-6);
  const free = (x, y) => clear(x, y) && fixed.every(p => Math.hypot(p.x - x, p.y - y) >= KEEP);
  const anchor = item => [Math.min(hi, Math.max(lo, item.left / 100 * side)), Math.min(hi, Math.max(lo, item.top / 100 * side))];
  // 広い地図では、押せる丸を本当の位置の近くの空きへ置く。
  const slots = Math.max(1, Math.floor((hi - lo) / GAP) + 1), pitch = slots > 1 ? (hi - lo) / (slots - 1) : 0;
  const out = items.map(item => {
    const [ax, ay] = anchor(item);
    let x = ax, y = ay, found = roomy && free(x, y);
    for (let r = 6; roomy && !found && r <= side * 1.5; r += 6) {
      const steps = Math.max(8, Math.round(r * .9));
      for (let k = 0; k < steps && !found; k++) {
        const a = k / steps * Math.PI * 2, tx = Math.min(hi, Math.max(lo, ax + Math.cos(a) * r)), ty = Math.min(hi, Math.max(lo, ay + Math.sin(a) * r));
        if (free(tx, ty)) { x = tx; y = ty; found = true; }
      }
    }
    if (!found) {
      let best = Infinity;
      for (let j = 0; j < slots; j++) for (let i = 0; i < slots; i++) {
        const gx = lo + i * pitch, gy = lo + j * pitch, d = (gx - ax) ** 2 + (gy - ay) ** 2;
        if (d < best && free(gx, gy)) { best = d; x = gx; y = gy; }
      }
      // 駅を避けると置き場が無い狭さなら、駅との重なりは許す（印どうしの重なりよりよい）
      if (best === Infinity) for (let j = 0; j < slots; j++) for (let i = 0; i < slots; i++) {
        const gx = lo + i * pitch, gy = lo + j * pitch, d = (gx - ax) ** 2 + (gy - ay) ** 2;
        if (d < best && clear(gx, gy)) { best = d; x = gx; y = gy; }
      }
    }
    placed.push({ x, y });
    return { ...item, anchorLeft: item.left, anchorTop: item.top, left: x / side * 100, top: y / side * 100 };
  });
  return { side, roomy, items: out };
}

export function createMap({ document, onStart, onClose }) {
  const dialog = createPlayDialog({ document, screen: 'map', title: '山の地図', onClose });
  let data, selected, extra = {}, surface = null, pins = [], lines = null, model = null, namesRow = null, names = null, navigator = null, compact = false, placedDrops = [];
  const SVG = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs) => { const el = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v)); return el; };

  /** 印を、いまの地図の大きさに合わせて置き直す（画面の幅で、重なりを避ける動かし方が変わる） */
  function place() {
    if (!surface || !model) return;
    const hadFocus = dialog.element.contains(document.activeElement);
    const side = surface.clientWidth || 320;
    const layout = markerLayout(model.drops, side, model.stations);
    compact = !layout.roomy; placedDrops = layout.items;
    dialog.body.classList.toggle('is-compact', compact);
    names.hidden = compact; navigator?.querySelectorAll('button').forEach(b => {
      b.hidden = !compact;
      if (b.dataset.action !== 'map-prev') b.dataset.action = compact ? 'map-select' : 'map-next';
    });
    surface.setAttribute('aria-label', `山の地図。選択中：${model.selected?.name ?? 'なし'}。前後のボタンでも地点を選べます`);
    const rebuild = pins.length !== model.drops.length || pins.some(p => (p.tagName === 'BUTTON') === compact);
    if (rebuild) {
      pins.forEach(p => p.remove()); pins = [];
      for (const d of model.drops) {
        const pin = compact ? document.createElement('span') : actionButton(document, 'map-drop', '', () => choose(d.id));
        pin.className = 'map-pin'; pin.dataset.drop = d.id;
        const label = `${d.number}：${d.name}（難しさ ${d.level ?? 1}・${d.state}）`;
        pin.title = label;
        if (compact) { pin.setAttribute('aria-hidden', 'true'); pin.dataset.selected = String(d.id === selected); }
        else { pin.setAttribute('aria-label', label); pin.setAttribute('aria-pressed', String(d.id === selected)); }
        const badge = document.createElement('span'); badge.className = 'map-badge';
        badge.append(textNode(document, 'b', String(d.number)), textNode(document, 'i', d.locked ? '鍵' : d.difficulty));
        if (d.locked) pin.classList.add('is-locked');
        pin.append(badge); surface.append(pin); pins.push(pin);
      }
    }
    lines.replaceChildren();
    placedDrops.forEach((item, i) => {
      const pin = pins[i];
      pin.style.left = `${item.left}%`; pin.style.top = `${item.top}%`;
      if (Math.hypot(item.left - item.anchorLeft, item.top - item.anchorTop) > .5) {
        lines.append(svg('line', { x1: item.anchorLeft, y1: item.anchorTop, x2: item.left, y2: item.top, class: 'map-leader' }));
        lines.append(svg('circle', { cx: item.anchorLeft, cy: item.anchorTop, r: .9, class: 'map-anchor' }));
      }
    });
    // 選んだ地点から、着く駅までの線
    const d = model.selected, station = d && model.stations.find(s => s.id === d.finish);
    if (d && station) lines.append(svg('line', { x1: d.left, y1: d.top, x2: station.left, y2: station.top, class: 'map-route' }));
    if (hadFocus && (!dialog.element.contains(document.activeElement) || document.activeElement.closest('[hidden]'))) {
      (dialog.body.querySelector('button.primary') ?? (compact ? navigator?.querySelector('button') : pins[0]) ?? dialog.body.querySelector('[data-action="map-close"]'))?.focus();
    }
  }

  function choose(id, focusAction) {
    selected = id; render();
    const target = focusAction ? dialog.body.querySelector(`[data-action="${focusAction}"]`) : compact ? navigator.querySelector('[data-action="map-select"]') : [...namesRow.children].find(b => b.dataset.dropId === id);
    target?.focus();
  }

  function render() {
    const m = model = mapContent(data, selected); selected = m.selected?.id; dialog.body.replaceChildren(); pins = []; navigator = null;
    const visual = document.createElement('div'); visual.className = 'map-visual';
    surface = document.createElement('div'); surface.className = 'map-surface'; surface.setAttribute('role', 'group');
    if (m.image) {
      const img = document.createElement('img'); img.src = m.image; img.alt = '山の地形の絵（北が上）。出発地点は、下の名前からも選べます';
      img.addEventListener('error', () => { img.hidden = true; }); surface.append(img);
    } else surface.append(textNode(document, 'p', '名前から出発地点を選べます'));
    // 駅と仕掛けは、押せない小さな記号（本当の位置に置く）。形で種類を示す
    for (const s of m.stations) {
      const mark = textNode(document, 'span', '□', 'map-mark map-mark-station'); mark.style.left = `${s.left}%`; mark.style.top = `${s.top}%`; mark.title = s.name ?? '駅';
      if (s.id === m.selected?.finish) mark.classList.add('is-finish');
      mark.setAttribute('aria-hidden', 'true'); surface.append(mark);
    }
    for (const f of m.features) {
      const [glyph, label] = FEATURE_MARKS[f.kind] ?? ['·', '仕掛け'];
      const mark = textNode(document, 'span', glyph, `map-mark map-mark-feature map-mark-${f.kind}`); mark.style.left = `${f.left}%`; mark.style.top = `${f.top}%`; mark.title = f.name ?? label;
      mark.setAttribute('aria-hidden', 'true'); surface.append(mark);
    }
    lines = svg('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', class: 'map-lines', 'aria-hidden': 'true' }); surface.append(lines);
    if (extra.you && Number.isFinite(extra.you.x)) {
      const you = textNode(document, 'span', '', 'map-you'); you.title = 'いまいる所';
      you.style.left = `${Math.max(0, Math.min(100, (extra.you.x / m.size + .5) * 100))}%`; you.style.top = `${Math.max(0, Math.min(100, (extra.you.z / m.size + .5) * 100))}%`;
      you.setAttribute('aria-hidden', 'true'); surface.append(you);
    }
    surface.addEventListener('click', e => {
      if (!compact) return;
      const pin = e.target.closest('.map-pin');
      const rect = surface.getBoundingClientRect();
      const d = pin ? model.drops.find(d => d.id === pin.dataset.drop) : nearestDrop(placedDrops, rect.width, e.clientX - rect.left, e.clientY - rect.top);
      if (d) choose(d.id);
    });
    visual.append(surface);
    // 凡例：印の形ごとに 1 つずつ並べる（鍵の地点は、点線の四角の形そのものを見せる）
    const legend = document.createElement('p'); legend.className = 'map-legend';
    for (const [glyph, label, kind] of [['●', '出発地点（点の数＝難しさ）'], ['', '鍵のかかった地点', 'locked'], ['□', '駅'], ['△', 'ジャンプ台'], ['▽', '崖'], ['┄', '選んだ地点から着く駅へ']]) {
      const item = document.createElement('span'); item.className = 'map-legend-item';
      const mark = textNode(document, 'i', glyph, kind ? `map-legend-${kind}` : ''); mark.setAttribute('aria-hidden', 'true');
      item.append(mark, textNode(document, 'span', label)); legend.append(item);
    }
    // 名前の一覧は広い地図だけ。狭い地図は詳細見出しの送りを使う。
    names = document.createElement('div'); names.className = 'map-names-wrap';
    namesRow = document.createElement('div'); namesRow.className = 'map-names'; namesRow.setAttribute('role', 'group'); namesRow.setAttribute('aria-label', '出発地点の名前');
    for (const d of m.drops) {
      const b = actionButton(document, 'map-select', '', () => choose(d.id));
      const label = textNode(document, 'span', ''); phrases(d.name).forEach((part, i) => { if (i) label.append(document.createElement('wbr')); label.append(part); });
      b.append(textNode(document, 'b', `${d.id === selected ? '✓ ' : ''}${d.number}`), label);
      if (d.locked) { b.append(textNode(document, 'i', '鍵')); b.classList.add('is-locked'); }
      b.dataset.dropId = d.id; b.setAttribute('aria-pressed', String(d.id === selected)); b.title = d.state;
      b.setAttribute('aria-label', `${d.number}：${d.name}（難しさ ${d.level ?? 1}・${d.state}）`); namesRow.append(b);
    }
    names.append(namesRow);
    const details = document.createElement('div'); details.className = 'map-details';
    const d = m.selected;
    if (d) {
      const level = d.level ?? 1;
      navigator = document.createElement('div'); navigator.className = 'map-navigator';
      const prev = actionButton(document, 'map-prev', '‹', () => choose(stepDrop(m.drops, selected, -1).id, 'map-prev'));
      const next = actionButton(document, 'map-select', '›', () => choose(stepDrop(m.drops, selected, 1).id, 'map-select'));
      prev.setAttribute('aria-label', `前の地点：${stepDrop(m.drops, selected, -1).name}`);
      next.setAttribute('aria-label', `選択中：${d.number} ${d.name}。次の地点：${stepDrop(m.drops, selected, 1).name}`);
      const heading = textNode(document, 'h3', `${d.number}　${d.name}`); heading.setAttribute('aria-live', 'polite');
      navigator.append(prev, heading, next);
      details.append(navigator,
        // 状態（滑りきった・鍵）は、下の★の列とボタンが示すので、ここには書かない（同じ内容が二度になった：画面の採点 2 周目）
        textNode(document, 'p', `難しさ ${'●'.repeat(level)}${'○'.repeat(Math.max(0, 4 - level))}`, 'map-level'),
        textNode(document, 'p', d.about ?? '自由に滑れる出発地点です'),
        textNode(document, 'p', `着く駅：${d.station}`, 'map-facts'));
      // 鍵の地点では、まだ滑れないので、最高点と回数は出さない。2 つの数字は 1 行にまとめ、語の途中で折れないようにする
      if (!d.locked) { const facts = textNode(document, 'p', '', 'map-facts'); facts.append(textNode(document, 'span', `技の最高 ${d.best.toLocaleString('ja-JP')} 点`), textNode(document, 'span', `滑った回数 ${d.runs ?? 0} 回`)); details.append(facts); }
      const goals = document.createElement('ul'); goals.className = 'goal-list';
      for (const g of d.goals) { const li = textNode(document, 'li', `${g.earned ? '★' : '☆'} ${g.label}`, g.earned ? 'earned' : ''); li.append(textNode(document, 'small', g.earned ? '（達成済み）' : '（まだ）')); goals.append(li); }
      details.append(goals);
      // 括弧の中（あと ◯ m）は、途中で折らない
      if (d.locked) { const text = lockedText(d), cut = text.indexOf('（'), line = textNode(document, 'p', cut > 0 ? text.slice(0, cut) : text, 'map-locked'); if (cut > 0) { const tail = textNode(document, 'span', text.slice(cut)); tail.style.whiteSpace = 'nowrap'; line.append(tail); } details.append(line); }
      const start = actionButton(document, 'map-start', d.locked ? '鍵がかかっています' : 'ここから滑る', () => onStart(d.id));
      start.disabled = d.locked; start.className = d.locked ? 'locked' : 'primary'; details.append(start);
    }
    const close = actionButton(document, 'map-close', '戻る', onClose); close.className = 'map-close';
    // 絵と凡例は、左の欄にまとめる（右の欄が絵より長くなっても、凡例が絵から離れない）
    const left = document.createElement('div'); left.className = 'map-left'; left.append(visual, legend);
    dialog.body.append(left, details, names, close);
    place();
    if (!dialog.element.hidden) { observer?.disconnect(); observer?.observe(surface); }
  }
  // 画面の大きさが変わったら、印を置き直す
  const view = document.defaultView;
  const observer = view?.ResizeObserver ? new view.ResizeObserver(() => place()) : null;
  const show = dialog.show;
  return { ...dialog,
    show() { show(); if (surface) { observer?.disconnect(); observer?.observe(surface); } place(); },
    update(value, more = {}) { data = value; extra = more; render(); },
  };
}
