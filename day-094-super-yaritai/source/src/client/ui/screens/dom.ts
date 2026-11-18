// 画面を組み立てる小さな道具。フレームワークは使わず、要素を作る関数だけを持つ。
// 読み込んだだけでは DOM に触らない（単体試験が Node のまま読めるように）。

import { splitPhrases } from './phrase';

export type Child = Node | string | number | null | undefined | false;

type Handlers = { [K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void };

export interface Attrs {
  /** true は値なしの属性、false・null・undefined は付けない */
  [name: string]: unknown;
  on?: Handlers;
}

/** 要素を作る。h('button', { class: 'sy-btn', type: 'button', on: { click } }, '押す') */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) setAttrs(el, attrs);
  append(el, ...children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** SVG の要素を作る */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) setAttrs(el, attrs);
  append(el, ...children);
  return el;
}

function setAttrs(el: Element, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'on') {
      for (const [type, fn] of Object.entries((value ?? {}) as Record<string, EventListener>)) el.addEventListener(type, fn);
      continue;
    }
    if (value === false || value === null || value === undefined) continue;
    el.setAttribute(key, value === true ? '' : String(value));
  }
}

export function append(parent: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

/** 文字だけを変える（同じなら触らない）。日本語の文は文節で折れるようにする */
export function setText(el: Element, text: string): void {
  if (el.textContent === text) return;
  if (JAPANESE.test(text)) el.replaceChildren(...(phraseBreaks(text) as Node[]));
  else el.textContent = text;
}

/** 焦点を移す。移せない環境でも止まらない */
export function focusEl(el: HTMLElement | null | undefined): void {
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    // 何もしない
  }
}

/** 画面の見出しへ焦点を移す（画面が変わったことを読み上げに伝える） */
export function focusHeading(root: HTMLElement): void {
  const heading = root.querySelector<HTMLElement>('h1, h2');
  if (!heading) return;
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
  focusEl(heading);
}

/** これより長い文節は、折れない span に入れない（長い名前などで、はみ出さないように） */
const PHRASE_MAX = 12;

/**
 * 日本語の文を文節の切れ目でだけ折り返せるようにする（分け方は phrase.ts）。
 * 文節を1つずつ「中で折れない」span（white-space: nowrap）に入れ、間に <wbr> を置く。keep-all だけだと、
 * ブラウザはかっこの前後で勝手に折る（「「！」｜と、」「「｜乗る」」）ため。inline-block にしないのは、
 * ボタンの名前（読み上げ）に空白が入ってしまうため（「だれかと 対戦」）。
 * 文節の後ろの空白は span の外に出す。12字より長い文節は span に入れず、keep-all のまま（はみ出さない）。
 * 例：「近くの簡単な悪事だけ。ダッシュしない」→「近くの｜簡単な｜悪事だけ。｜ダッシュしない」
 */
export function phraseBreaks(text: string): Child[] {
  const parts = splitPhrases(text);
  const box = document.createElement('span');
  box.className = 'sy-ph';
  parts.forEach((part, i) => {
    if (i > 0) box.appendChild(document.createElement('wbr'));
    const m = /^(.*?)(\s*)$/su.exec(part);
    const body = m?.[1] ?? part;
    const tail = m?.[2] ?? '';
    if (body) box.appendChild(Array.from(body).length <= PHRASE_MAX ? h('span', { class: 'sy-phr' }, body) : document.createTextNode(body));
    if (tail) box.appendChild(document.createTextNode(tail));
  });
  return [box];
}

/** 文節の頭が、前の要素（<b> など）とつながっていなければならない字か（句読点・閉じかっこ・ひらがな） */
const GLUE_HEAD = /^[、。，．！？・：）」』\u3041-\u309F]/u;

const JAPANESE = /[\u3041-\u30FF\u3400-\u9FFF]/;

/**
 * 画面の中の日本語の文を、まとめて文節で折れるようにする（画面を出すときに1回呼ぶ）。
 * 読み上げ専用の字・キー・SVG の中・すでに分けた所は触らない。
 * 1か所でやるので、ひとりで・あそびかた・結果・待合室など、どの画面も同じ折れ方になる
 */
export function phraseify(root: Element): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    const parent = text.parentElement;
    if (!parent || !JAPANESE.test(text.data)) continue;
    if (parent.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue;
    if (parent.closest('.sy-ph, .sy-sr, kbd, textarea, svg')) continue;
    targets.push(text);
  }
  for (const text of targets) {
    const prev = text.previousSibling;
    const [box] = phraseBreaks(text.data) as HTMLElement[];
    if (!box) continue;
    text.replaceWith(box);
    // 「<b>別の種類</b>の悪事を」「<b>+300</b>。10個…」：前の要素と最初の文節を離さない（行の頭に「の」「。」を置かない）
    const first = box.querySelector(':scope > .sy-phr');
    if (prev instanceof HTMLElement && first && GLUE_HEAD.test(first.textContent ?? '') && !/\s$/.test(prev.textContent ?? '')) {
      const glue = h('span', { class: 'sy-phr' });
      prev.replaceWith(glue);
      glue.append(prev, first);
    }
  }
}

/**
 * 人の名前を、括弧の前でだけ折り返せるようにする。「ハカセ（CPU・本気）」→「ハカセ」｜「（CPU・本気）」。
 * 括弧の中はひとかたまり（.sy-keep）にして、途中で折らない。括弧が無ければそのまま
 */
export function nameBreaks(name: string): Child[] {
  const m = /^(.+?)([（(][^（）()]*[）)])$/u.exec(name);
  if (!m) return [name];
  return [m[1] ?? '', document.createElement('wbr'), h('span', { class: 'sy-keep' }, m[2] ?? '')];
}

/** 数字を「12,340」の形にする（Intl に頼らず、どの環境でも同じ形） */
export function formatPoints(n: number): string {
  const v = Math.round(Number.isFinite(n) ? n : 0);
  const abs = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return v < 0 ? `−${abs}` : abs;
}

/** 動きを減らす設定か */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** ボタン（type=button）。data-a は仮の画面と同じ名前にそろえる（ゲームの芯の E2E がこれで押す） */
export function button(
  label: Child | Child[],
  opts: { cls?: string; a?: string; onClick?: () => void; attrs?: Attrs } = {},
): HTMLButtonElement {
  const kids = Array.isArray(label) ? label : [label];
  return h(
    'button',
    {
      type: 'button',
      class: `sy-btn ${opts.cls ?? ''}`.trim(),
      'data-a': opts.a,
      ...opts.attrs,
      on: opts.onClick ? { click: () => opts.onClick?.() } : undefined,
    },
    ...kids,
  );
}
