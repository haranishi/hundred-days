// 画面を組み立てる小さな道具。フレームワークは使わず、要素を作る関数だけを持つ。

export type Child = Node | string | number | null | undefined | false

type Handlers = { [K in keyof HTMLElementEventMap]?: (ev: HTMLElementEventMap[K]) => void }

export interface Attrs {
  /** true は値なしの属性、false・null・undefined は付けない */
  [name: string]: unknown
  on?: Handlers
}

/** 要素を作る。h('button', { class: 'btn', type: 'button', on: { click } }, '押す') */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (attrs) setAttrs(el, attrs)
  append(el, ...children)
  return el
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/** SVG の要素を作る */
export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag)
  if (attrs) setAttrs(el, attrs)
  append(el, ...children)
  return el
}

function setAttrs(el: Element, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'on') {
      for (const [type, fn] of Object.entries((value ?? {}) as Record<string, EventListener>)) el.addEventListener(type, fn)
      continue
    }
    if (value === false || value === null || value === undefined) continue
    el.setAttribute(key, value === true ? '' : String(value))
  }
}

export function append(parent: Node, ...children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue
    parent.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c)
  }
}

/** 文字だけを変える（同じなら触らない。毎フレーム呼んでも DOM を書き換えない） */
export function setText(el: Element, text: string): void {
  if (el.textContent !== text) el.textContent = text
}

/** 属性を変える（同じなら触らない）。null で外す */
export function setAttr(el: Element, name: string, value: string | null): void {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name)
  } else if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value)
  }
}

export function setHidden(el: HTMLElement, hidden: boolean): void {
  if (el.hidden !== hidden) el.hidden = hidden
}

export function setDisabled(el: HTMLButtonElement, disabled: boolean): void {
  if (el.disabled !== disabled) el.disabled = disabled
}

/** 画面の見出しへ焦点を移す（画面が変わったことを読み上げに伝える） */
export function focusHeading(root: HTMLElement): void {
  const heading = root.querySelector<HTMLElement>('h1, h2')
  if (!heading) return
  if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
  try {
    heading.focus({ preventScroll: true })
  } catch {
    // 焦点を移せない環境では何もしない
  }
}

/** 数字を「1,234」の形にする。マイナスは「−」（全角のマイナス記号）で見やすくする */
export function formatPoints(n: number): string {
  const abs = Math.abs(Math.round(n)).toLocaleString('ja-JP')
  return n < 0 ? `−${abs}` : abs
}

/** 増減を「+720」「−200」の形にする */
export function formatDelta(n: number): string {
  return n < 0 ? `−${Math.abs(n).toLocaleString('ja-JP')}` : `+${n.toLocaleString('ja-JP')}`
}

/** 動きを減らす設定か */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
