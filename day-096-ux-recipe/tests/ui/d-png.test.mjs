import test from 'node:test';
import assert from 'node:assert/strict';
import { MINIMAL } from '../fixtures/states.js';
import { PAGE_CSS } from '../../lib/page-css.js';
import { pngDimensions } from '../../lib/png-export.js';
import { stripWrap } from '../render/f2e-wrap-helpers.mjs';

// Node には描画エンジンがないため、ここでは画素の照合・寸法の引き渡し・後始末を観測する。
function canvasEnvironment(t, { pixel = [255, 0, 0, 255], failAt, height = 980.5 } = {}) {
  const renders = [];
  const canvases = [];
  const parsed = [];
  const sources = [];
  const node = (tag, ns = 'http://www.w3.org/1999/xhtml') => ({
    tag, ns, attrs: {}, children: [], style: {}, scrollHeight: Math.floor(height),
    get firstElementChild() { return this.children[0]; },
    getBoundingClientRect() { return { height }; },
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
    createElementNS: (ns, tag) => node(tag, ns),
    importNode: (el) => el,
  };
  class ImageStub extends EventTarget {
    set src(value) {
      assert.match(value, /^data:image\/svg\+xml/);
      sources.push(decodeURIComponent(value.slice(value.indexOf(',') + 1)));
      queueMicrotask(() => this.dispatchEvent(new Event('load')));
    }
  }
  class SerializerStub {
    serializeToString(svg) {
      renders.push(svg);
      function xml(element, parentNs) {
        const xmlns = element.ns === parentNs ? '' : ' xmlns="' + element.ns + '"';
        const start = '<' + element.tag + xmlns;
        const children = element.children.map(child => xml(child, element.ns)).join('');
        return children ? start + '>' + children + '</' + element.tag + '>' : start + '/>';
      }
      return xml(svg);
    }
  }
  class ParserStub {
    parseFromString(html, type) {
      // Node で画像に渡る空要素を追えるよう、実際の本文からそのノードだけを取り出す。
      const page = node('div');
      for (const [, tag] of html.matchAll(/<(br|input|wbr)\b/gi)) page.append(node(tag));
      parsed.push({ html, type, page });
      return { body: { firstElementChild: page } };
    }
  }
  for (const [key, value] of Object.entries({ document: doc, Image: ImageStub, XMLSerializer: SerializerStub, DOMParser: ParserStub })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true });
    t.after(() => { if (old) Object.defineProperty(globalThis, key, old); else delete globalThis[key]; });
  }
  return { renders, canvases, parsed, doc, sources };
}

test('foreignObject の画素を描けるか同時に尋ねても1回だけ試す。空の画素なら非対応', async (t) => {
  const { canvases } = canvasEnvironment(t, { pixel: [0, 0, 0, 0] });
  const { canExportPng, exportPng } = await import('../../lib/png-export.js?test=transparent');
  assert.deepEqual(await Promise.all([canExportPng(), canExportPng()]), [false, false]);
  assert.equal(await exportPng(MINIMAL), null);
  assert.equal(canvases.length, 1);
});

test('PNGは各辺16000画素・合計1600万画素までで、等倍でも収まらない寸法を断る', () => {
  for (const [width, height] of [[100, 10_000], [10_000, 100], [1999, 3999], [1000, 16_000]]) {
    const size = pngDimensions(width, height, 2);
    assert.ok(size);
    assert.ok(size.pixelWidth >= width && size.pixelWidth <= 16_000);
    assert.ok(size.pixelHeight >= height && size.pixelHeight <= 16_000);
    assert.ok(size.pixelWidth * size.pixelHeight <= 16_000_000);
    assert.ok(Math.abs(size.pixelWidth - size.pixelHeight * width / height) <= Math.max(1, width / height));
  }
  assert.deepEqual(pngDimensions(2000, 2000, 2), { width: 2000, height: 2000, pixelWidth: 4000, pixelHeight: 4000 });
  assert.equal(pngDimensions(1, 16_000.1, 2), null);
  assert.equal(pngDimensions(16_000.1, 1, 2), null);
  assert.equal(pngDimensions(4000.1, 4000, 1), null);
});

test('長いページのPNGも全体をキャンバスに収めて書き出す', async (t) => {
  const { canvases } = canvasEnvironment(t, { height: 8000 });
  const { exportPng } = await import('../../lib/png-export.js?test=tall-page');
  assert.equal((await exportPng(MINIMAL, { width: 1000, scale: 2 }))?.type, 'image/png');
  const [width, height] = canvases[1].drawn;
  assert.ok(width >= 1000 && height >= 8000 && width * height <= 16_000_000);
  assert.deepEqual(canvases[1].scaled, [width / 1000, height / 8000]);
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
  assert.match(stripWrap(parsed[0].html), /ひだまり整体院/);
  assert.doesNotMatch(parsed[0].html, /data-path/);
  assert.equal(canvases[1].width, 0);
  assert.equal(doc.body.children.length, 0);
});

test('文節入りのHTMLをDOMとしてforeignObjectに入れ、自己閉じのwbrを含むXMLを画像に渡す', async t => {
  const { renders, parsed, sources } = canvasEnvironment(t);
  const { exportPng } = await import('../../lib/png-export.js?test=wrap');
  const blob = await exportPng({ ...MINIMAL, blocks: [], site: { name: '読みたい資料を棚から探します。' } });
  assert.equal(blob?.type, 'image/png');
  assert.equal(parsed[0].type, 'text/html');
  assert.ok(parsed[0].html.includes('読みたい<wbr>資料を<wbr>棚から<wbr>探します。'));
  const foreign = renders[1].firstElementChild;
  assert.equal(foreign.tag, 'foreignObject');
  assert.equal(foreign.firstElementChild.children[1], parsed[0].page);
  assert.match(sources[1], /<foreignObject><div xmlns="http:\/\/www\.w3\.org\/1999\/xhtml">/);
  assert.deepEqual(sources[1].match(/<wbr[^>]*>/g), ['<wbr/>', '<wbr/>', '<wbr/>']);
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
