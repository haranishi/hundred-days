import test from 'node:test';
import assert from 'node:assert/strict';
import { MINIMAL } from '../fixtures/states.js';
import { PAGE_CSS } from '../../lib/page-css.js';

// Node には描画エンジンがないため、ここでは画素の照合・寸法の引き渡し・後始末を観測する。
function canvasEnvironment(t, { pixel = [255, 0, 0, 255], failAt } = {}) {
  const renders = [];
  const canvases = [];
  const parsed = [];
  const node = (tag) => ({
    tag, attrs: {}, children: [], style: {}, scrollHeight: 980,
    get firstElementChild() { return this.children[0]; },
    getBoundingClientRect() { return { height: 980.5 }; },
    setAttribute(key, value) { this.attrs[key] = String(value); },
    append(...nodes) { for (const child of nodes) { child.remove(); child.parent = this; this.children.push(child); } },
    remove() { if (this.parent) { this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; } },
    attachShadow() { return node('shadow'); },
  });
  const doc = {
    body: node('body'),
    createElement(tag) {
      if (tag !== 'canvas') return node(tag);
      const index = canvases.length;
      const canvas = node('canvas');
      canvas.getContext = () => ({
        scale: (x, y) => { canvas.scaled = [x, y]; },
        drawImage: () => { canvas.drawn = [canvas.width, canvas.height]; },
        getImageData: () => ({ data: pixel }),
      });
      canvas.toBlob = (callback, type) => {
        if (index === failAt) throw new Error('この画像の読み出しは禁止されています');
        callback(new Blob(['test'], { type }));
      };
      canvases.push(canvas);
      return canvas;
    },
    createElementNS: (_ns, tag) => node(tag),
    importNode: (el) => el,
  };
  class ImageStub extends EventTarget {
    set src(value) {
      assert.match(value, /^data:image\/svg\+xml/);
      queueMicrotask(() => this.dispatchEvent(new Event('load')));
    }
  }
  class SerializerStub {
    serializeToString(svg) { renders.push(svg); return '<svg/>'; }
  }
  class ParserStub {
    parseFromString(html, type) {
      parsed.push({ html, type });
      return { body: { firstElementChild: node('page') } };
    }
  }
  for (const [key, value] of Object.entries({ document: doc, Image: ImageStub, XMLSerializer: SerializerStub, DOMParser: ParserStub })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => { if (old) Object.defineProperty(globalThis, key, old); else delete globalThis[key]; });
  }
  return { renders, canvases, parsed, doc };
}

test('foreignObject の画素を描けるか同時に尋ねても1回だけ試す。空の画素なら非対応', async (t) => {
  const { canvases } = canvasEnvironment(t, { pixel: [0, 0, 0, 0] });
  const { canExportPng, exportPng } = await import('../../lib/png-export.js?test=transparent');
  assert.deepEqual(await Promise.all([canExportPng(), canExportPng()]), [false, false]);
  assert.equal(await exportPng(MINIMAL), null);
  assert.equal(canvases.length, 1);
});

test('画素が描けてもPNGを読み出せない環境は非対応として覚える', async (t) => {
  const { canvases } = canvasEnvironment(t, { failAt: 0 });
  const { canExportPng } = await import('../../lib/png-export.js?test=tainted');
  assert.equal(await canExportPng(), false);
  assert.equal(await canExportPng(), false);
  assert.equal(canvases.length, 1);
});

test('ページの実測高とCSSを書く。試した後はキャンバスと計測用の要素を片づける', async (t) => {
  const { renders, canvases, parsed, doc } = canvasEnvironment(t);
  const { canExportPng, exportPng } = await import('../../lib/png-export.js?test=export');
  assert.equal(await canExportPng(), true);
  const blob = await exportPng(MINIMAL, { width: 960, scale: 2 });
  assert.equal(blob.type, 'image/png');
  assert.deepEqual(canvases[1].drawn, [1920, 1962]);
  const svg = renders[1];
  // SVGは等倍で作り、キャンバス側で2倍に拡大する（viewBox で拡大すると WebKit は左上の4分の1にしか描かない）
  assert.deepEqual(svg.attrs, { width: '960', height: '981' });
  assert.deepEqual(canvases[1].scaled, [2, 2]);
  const foreign = svg.firstElementChild;
  assert.equal(foreign.tag, 'foreignObject');
  assert.deepEqual(foreign.attrs, { width: '960', height: '981' });
  assert.equal(foreign.firstElementChild.firstElementChild.textContent, PAGE_CSS);
  assert.equal(parsed[0].type, 'text/html');
  assert.match(parsed[0].html, /ひだまり整体院/);
  assert.doesNotMatch(parsed[0].html, /data-path/);
  assert.equal(canvases[1].width, 0);
  assert.equal(doc.body.children.length, 0);
});

test('判定が通った後でも個別の書き出しに失敗したらnullを返す', async (t) => {
  const { doc, canvases } = canvasEnvironment(t, { failAt: 1 });
  const { exportPng } = await import('../../lib/png-export.js?test=export-failure');
  assert.equal(await exportPng(MINIMAL, null), null);
  assert.equal(await exportPng(MINIMAL, { width: NaN }), null);
  assert.equal(canvases.length, 0);
  assert.equal(await exportPng(MINIMAL), null);
  assert.equal(canvases.length, 2);
  assert.equal(doc.body.children.length, 0);
});
