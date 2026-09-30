// 画面づくりの小道具。h() で要素を作り、fuda() で木札のボタンを作る

const SVG_NS = 'http://www.w3.org/2000/svg';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// 木札のボタン。variant: 'primary'（朱塗り）/ size: 'sm' | 'lg' | 'xs'
export function fuda(label, { primary = false, size, act, href, cls = '', ...attrs } = {}) {
  const classes = ['fuda', primary && 'is-primary', size && `fuda-${size}`, cls].filter(Boolean).join(' ');
  if (href) {
    return h('a', { class: classes, href, 'data-act': act, target: '_blank', rel: 'noopener noreferrer', ...attrs }, label);
  }
  return h('button', { class: classes, type: 'button', 'data-act': act, ...attrs }, label);
}

// 屋号風の印「丸に辻」（オリジナル）。fill を指定すると塗りつぶしの丸に白抜きの字
export function mark({ size = 40, color = 'currentColor', solid = false, label } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', 'mark');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else svg.setAttribute('aria-hidden', 'true');
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', '50');
  circle.setAttribute('cy', '50');
  circle.setAttribute('r', solid ? '48' : '43');
  if (solid) circle.setAttribute('fill', color);
  else {
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', '9');
  }
  const text = document.createElementNS(SVG_NS, 'text');
  text.setAttribute('x', '50');
  text.setAttribute('y', '52');
  text.setAttribute('text-anchor', 'middle');
  text.setAttribute('dominant-baseline', 'central');
  text.setAttribute('font-size', '56');
  text.setAttribute('font-weight', '800');
  text.setAttribute('class', 'mark-ch');
  text.setAttribute('fill', solid ? 'var(--washi)' : color);
  text.textContent = '辻';
  svg.append(circle, text);
  return svg;
}

// 線香の印（経過時間の横に置く）
export function senko() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 24');
  svg.setAttribute('width', '11');
  svg.setAttribute('height', '17');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'senko');
  svg.innerHTML =
    '<path d="M8 1c-2 2 2 3 0 5.5" fill="none" stroke="var(--usuzumi)" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>' +
    '<rect x="7" y="7" width="2" height="15" rx="1" fill="var(--wood)"/>' +
    '<circle cx="8" cy="7.5" r="1.6" fill="var(--shu)"/>';
  return svg;
}

export const nextPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export function prefersReduced() {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
