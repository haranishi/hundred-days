// レイアウトは模擬しない。DOM構造・イベント・焦点の検証に必要な窓口だけを持つ。
export function documentFixture(side = 225) {
  const document = { activeElement: null, side };
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.style = {}; this.attrs = {};
      this.listeners = {}; this.className = ''; this.hidden = false; this.text = '';
      this.classList = {
        contains: c => this.className.split(' ').includes(c),
        add: c => { if (!this.classList.contains(c)) this.className += ` ${c}`; },
        toggle: (c, on) => { this.className = this.className.split(' ').filter(v => v !== c).join(' '); if (on) this.classList.add(c); },
      };
    }
    set textContent(v) { this.text = String(v); this.children = []; }
    get textContent() { return this.text + this.children.map(c => c.textContent ?? c).join(''); }
    append(...nodes) { for (const node of nodes) { if (typeof node === 'object') node.parentElement = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children.forEach(c => { if (typeof c === 'object') c.parentElement = null; }); this.children = []; this.text = ''; this.append(...nodes); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this); this.parentElement = null; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    matches(selector) {
      if (selector === '[hidden]') return this.hidden;
      const attr = selector.match(/^\[([^=]+)="([^"]*)"\]$/);
      if (attr) {
        const key = attr[1].replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        return (attr[1].startsWith('data-') ? this.dataset[key] : this.attrs[attr[1]]) === attr[2];
      }
      const [tag, cls] = selector.split('.');
      return (!tag || this.tagName === tag.toUpperCase()) && (!cls || this.classList.contains(cls));
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) ?? null; }
    querySelectorAll(selector) { return this.children.filter(c => typeof c === 'object').flatMap(c => [...(c.matches(selector) ? [c] : []), ...c.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    contains(el) { return this === el || this.children.some(c => typeof c === 'object' && c.contains(el)); }
    addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
    dispatch(type, props = {}) {
      const event = { target: this, preventDefault() {}, stopPropagation() { this.stopped = true; }, ...props };
      for (let el = this; el; el = event.stopped ? null : el.parentElement) for (const fn of el.listeners[type] ?? []) fn(event);
    }
    focus() { document.activeElement = this; }
    get clientWidth() { return document.side; }
    getBoundingClientRect() { return { left: 0, top: 0, width: document.side, height: document.side }; }
  }
  const observers = [];
  document.defaultView = { ResizeObserver: class {
    constructor(fn) { observers.push(this); this.fn = fn; }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  } };
  document.resize = () => observers.filter(o => o.active).forEach(o => o.fn());
  document.createElement = tag => new Element(tag);
  document.createElementNS = (_, tag) => new Element(tag);
  return document;
}
