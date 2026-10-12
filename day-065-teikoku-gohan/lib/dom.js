// 要素を組み立てる小さな補助。文字は textContent で入れる（HTML として解釈させない）。
// on〜 はイベントとして addEventListener で付ける（on〜属性は書かない＝CSP の script-src 'self' のまま動く）。
const SVG_NS = 'http://www.w3.org/2000/svg';

function apply(el, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') el.textContent = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function h(tag, attrs, ...children) {
  return append(apply(document.createElement(tag), attrs), children);
}

export function s(tag, attrs, ...children) {
  return append(apply(document.createElementNS(SVG_NS, tag), attrs), children);
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

// 中身を入れ替える（null・false は書き出さない。Element.append に null を渡すと「null」という文字が出る）
export function fill(el, ...children) {
  return append(clear(el), children);
}
