// ページ描画の契約の機械検査（親の担当。担当B1・B2は消さない・直さない。直したいときは親へ報告）。
// 全部品・全バリエーション・満杯/中/空・preview/export で、HTMLとCSSの形・禁止事項・無害化・編集用の印を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_SCHEMA, BLOCK_TYPES, ACCENTS, THEMES, SCHEMA_VERSION, sanitizeProps } from '../../lib/contract.js';
import { renderPage } from '../../lib/render.js';
import { BLOCK_RENDERERS } from '../../lib/blocks/index.js';
import { PAGE_CSS } from '../../lib/page-css.js';
import { emptyProps, maxProps, midProps, oneEach, RESERVE_SAMPLE, STRESS } from '../fixtures/states.js';

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);
const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^'">])*?)(\/?)>/g;

/** タグの対応と、属性の中の禁止事項を調べる。問題の説明（なければ null）。 */
function inspectHtml(html) {
  const stack = [];
  for (const m of html.matchAll(TAG)) {
    const [, close, raw, attrs, self] = m;
    const name = raw.toLowerCase();
    if (!close) {
      const bare = attrs.replace(/"[^"]*"|'[^']*'/g, '""');
      if (/(^|\s)style\s*=/i.test(bare)) return `style 属性: <${name}>`;
      if (/(^|\s)on[a-z]+\s*=/i.test(bare)) return `on* 属性: <${name}>`;
      if (/(^|\s)srcdoc\s*=/i.test(bare)) return `srcdoc: <${name}>`;
      if (['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base'].includes(name)) return `禁止の要素: <${name}>`;
    }
    if (close) {
      const top = stack.pop();
      if (top !== name) return `閉じタグが合いません: </${name}>（開いているのは <${top}>）`;
    } else if (!VOID.has(name) && !self) stack.push(name);
  }
  if (stack.length) return `閉じていないタグ: ${stack.join(',')}`;
  if (/javascript:/i.test(html)) return 'javascript: が含まれる';
  if (/https?:\/\//i.test(html)) return '外部URLが含まれる';
  return null;
}

const FILLS = { max: maxProps, mid: midProps, empty: emptyProps };
const dataPaths = (html) => new Set([...html.matchAll(/data-path="([^"]+)"/g)].map((m) => m[1]));

/** 文字の項目（text/long）のうち、値が入っているものの path を集める。 */
function textPaths(fields, value, prefix = [], out = [], includeEmpty = false) {
  fields.forEach((f) => {
    const v = value?.[f.key];
    const here = [...prefix, f.key];
    if (f.kind === 'text' || f.kind === 'long') { if (includeEmpty || v) out.push(here.join('.')); }
    else if (f.kind === 'list') (v ?? []).forEach((item, i) => textPaths(f.item, item, [...here, i], out, includeEmpty));
  });
  return out;
}
// 見た目によっては、一部の項目をそもそも出さない（理由つきで例外にする）
const NOT_SHOWN = { 'form/1': (path) => /^items\.[1-9]/.test(path) };
const shown = (type, variant, path) => !NOT_SHOWN[`${type}/${variant}`]?.(path);

test('全部品・全バリエーション・満杯/中/空・preview/export で、HTMLの形と禁止事項を満たす', () => {
  for (const type of BLOCK_TYPES) {
    BLOCK_SCHEMA[type].variants.forEach((_, variant) => {
      for (const [fillName, fill] of Object.entries(FILLS)) {
        const state = oneEach(type, variant, fill(type));
        for (const mode of ['preview', 'export']) {
          const html = renderPage(state, { mode });
          const where = `${type}/v${variant}/${fillName}/${mode}`;
          assert.equal(inspectHtml(html), null, `${where}: ${inspectHtml(html)}`);
          const sections = [...html.matchAll(new RegExp(`<section class="uxr-block uxr-${type} uxr-v${variant}[ "]`, 'g'))];
          assert.equal(sections.length, 1, `${where}: 部品の外枠が1つ（sec）`);
          assert.ok(html.includes('id="uxr-b1"'), `${where}: アンカーの id`);
          if (mode === 'export') {
            for (const mark of ['data-path', 'data-block-id', 'data-ph', 'data-type', 'data-variant', 'is-empty']) assert.ok(!html.includes(mark), `${where}: 書き出しに編集用の印 ${mark}`);
            assert.ok(!/<(p|h[1-6]|li|a|span|dt|dd|summary|label|button)[^>]*><\/\1>/.test(html), `${where}: 空の要素が残っている`);
          } else {
            assert.ok(html.includes('data-block-id="b1"') && html.includes(`data-type="${type}"`), `${where}: 編集用の印`);
          }
        }
      }
    });
  }
});

test('編集中（preview）は、値のある文字の項目がすべて data-path つきで描かれる（空でも「ここに書く」の目印がある）', () => {
  for (const type of BLOCK_TYPES) {
    BLOCK_SCHEMA[type].variants.forEach((_, variant) => {
      for (const fill of ['mid', 'empty']) {
        const props = FILLS[fill](type);
        const paths = dataPaths(renderPage(oneEach(type, variant, props), { mode: 'preview' }));
        const want = textPaths(BLOCK_SCHEMA[type].fields, sanitizeProps(type, props), [], [], fill === 'empty');
        for (const p of want) if (shown(type, variant, p)) assert.ok(paths.has(p), `${type}/v${variant}/${fill}: ${p} が描かれていない`);
      }
    });
  }
});

test('ユーザーの文字は無害化される（<img onerror>・属性の引用符・</script>）', () => {
  const payload = '<img src=x onerror=alert(1)>"\'&</script><svg/onload=alert(2)>';
  for (const type of BLOCK_TYPES) {
    BLOCK_SCHEMA[type].variants.forEach((_, variant) => {
      const fill = (fields) => Object.fromEntries(fields.map((f) => [f.key, f.kind === 'list' ? Array.from({ length: f.max }, () => fill(f.item)) : f.kind === 'check' ? true : payload]));
      const state = oneEach(type, variant, fill(BLOCK_SCHEMA[type].fields));
      state.site.name = payload.slice(0, 24);
      for (const mode of ['preview', 'export']) {
        const html = renderPage(state, { mode });
        const where = `${type}/v${variant}/${mode}`;
        assert.equal(inspectHtml(html), null, `${where}: ${inspectHtml(html)}`);
        assert.ok(!html.includes('<img src=x') && !html.includes('<svg/onload') && !/<\/script/i.test(html), `${where}: 危険な文字がそのまま出ている`);
      }
    });
  }
});

test('見本のページ（予約・満杯）が、そのまま描ける', () => {
  for (const state of [RESERVE_SAMPLE, STRESS]) for (const mode of ['preview', 'export']) assert.equal(inspectHtml(renderPage(state, { mode })), null);
});

/** 選択子の並びを、括弧の外のカンマだけで分ける（:where(h1,h2) の中では割らない）。 */
function splitSelectors(head) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of head) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** CSSの最小の解析: ルールの外側の { } の対応と、各ルールの選択子（@container・@media の中も）。 */
function checkCss(css, where) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let depth = 0;
  for (const ch of text) { if (ch === '{') depth += 1; if (ch === '}') depth -= 1; assert.ok(depth >= 0, `${where}: } が多い`); }
  assert.equal(depth, 0, `${where}: { } が対応していない`);
  const walk = (src, nested) => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf('{', i);
      if (open < 0) break;
      const head = src.slice(i, open).trim();
      let d = 1; let j = open + 1;
      while (d > 0 && j < src.length) { if (src[j] === '{') d += 1; if (src[j] === '}') d -= 1; j += 1; }
      const body = src.slice(open + 1, j - 1);
      if (head.startsWith('@')) {
        const name = head.split(/[\s(]/)[0];
        assert.ok(['@container', '@media', '@keyframes', '@supports'].includes(name), `${where}: 使えない @規則 ${name}`);
        if (name === '@media') assert.ok(/prefers-reduced-motion|forced-colors|print/.test(head) && !/(min|max)-width/.test(head), `${where}: @media は幅で使わない: ${head}`);
        if (name === '@container') assert.ok(/^@container uxr /.test(head), `${where}: @container は uxr を使う: ${head}`);
        if (name === '@keyframes') assert.ok(/^@keyframes uxr-/.test(head), `${where}: keyframes の名前は uxr- で始める`);
        else walk(body, true);
      } else {
        for (const sel of splitSelectors(head)) assert.ok(sel.trim().startsWith('.uxr-page'), `${where}: 選択子が .uxr-page で始まらない: ${sel.trim().slice(0, 60)}`);
      }
      i = j;
    }
  };
  walk(text, false);
  assert.ok(!/@import/.test(text), `${where}: @import`);
  assert.ok(!/url\((?!\s*["']?data:)/.test(text), `${where}: data: 以外の url()`);
  assert.ok(!/position\s*:\s*fixed/.test(text), `${where}: position:fixed`);
  assert.ok(!/-?\d*\.?\d+(vh|vw|svh|dvh|lvh|svw|dvw|lvw)\b/.test(text), `${where}: vh/vw の単位（container の cqw を使う）`);
}

test('CSS: 部品ごと・全体で、形の約束を満たす', () => {
  for (const type of BLOCK_TYPES) {
    const m = BLOCK_RENDERERS[type];
    assert.equal(typeof m.render, 'function', `${type}: render`);
    assert.equal(typeof m.css, 'string', `${type}: css`);
    checkCss(m.css, `blocks/${type}.js`);
  }
  checkCss(PAGE_CSS, 'PAGE_CSS');
  for (const theme of THEMES) assert.ok(PAGE_CSS.includes(`[data-theme="${theme}"]`), theme);
  ACCENTS.forEach((_, i) => assert.ok(PAGE_CSS.includes(`[data-accent="${i}"]`), `accent ${i}`));
});

test('ページの外枠: テーマ・強調色の属性と、サイト名の編集用の印', () => {
  const html = renderPage({ v: SCHEMA_VERSION, goal: 'buy', site: { name: '店' }, theme: { preset: 'calm', accent: 3 }, blocks: [] }, { mode: 'preview' });
  assert.ok(html.includes('data-theme="calm"') && html.includes('data-accent="3"') && html.includes('data-path="site.name"'));
  assert.ok(!renderPage({ v: SCHEMA_VERSION, goal: 'buy', site: { name: '' }, theme: { preset: 'soft', accent: 0 }, blocks: [] }, { mode: 'export' }).includes('uxr-brand'));
});
