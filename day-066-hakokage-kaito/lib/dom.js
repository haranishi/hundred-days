// 要素を組み立てる小さな補助。文字は textContent で入れる（HTML として解釈させない）。
// on〜 は属性でなくイベントとして付ける（on〜属性は書かない＝CSP の script-src 'self' のまま動く）。
// null・undefined・false の子は書き出さない（Element.append に null を渡すと「null」という文字が出る）。
import { wrapTokens } from './wrap.js';

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

export const h = (tag, attrs, ...children) => append(apply(document.createElement(tag), attrs), children);
export const s = (tag, attrs, ...children) => append(apply(document.createElementNS(SVG_NS, tag), attrs), children);

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

// 中身を入れ替える
export const fill = (el, ...children) => append(clear(el), children);

/* 折り返してよい所（<wbr>）を入れた子の並び。本文は word-break: keep-all で、語の途中では折れない。
   どこで折るか・どの語を割らないか（保護語は <span class="nb"> で包む）は、lib/wrap.js の1つの決まり。textContent は変わらない */
export function phrased(text) {
  return wrapTokens(text).map((tok) => {
    if (tok.type === 'wbr') return document.createElement('wbr');
    if (tok.type === 'nb') return h('span', { class: 'nb', text: tok.s });
    return document.createTextNode(tok.s);
  });
}

// 区切りの記号（既定は「・」）の後ろだけで折り返してよい文（キーの案内。index.html に手で書いた <wbr> と同じ位置）。textContent は変わらない
export function phrasedAt(text, mark = '・') {
  const out = [];
  const parts = String(text).split(mark);
  parts.forEach((part, i) => {
    const last = i === parts.length - 1;
    out.push(document.createTextNode(last ? part : part + mark));
    if (!last) out.push(document.createElement('wbr'));
  });
  return out;
}
