// ページ全体の描画（親の担当）。部品ごとの描画は lib/blocks/*.js。
// 出力のHTMLの約束は .kiro/specs/day-096-ux-recipe/interfaces-render.md。
import { esc, makeCtx } from './render-kit.js';
import { BLOCK_RENDERERS } from './blocks/index.js';

export { esc };

export function renderBlock(block, ctx) {
  const m = BLOCK_RENDERERS[block.type];
  return m ? m.render(block, ctx) : '';
}

/**
 * state → ページのHTML文字列。
 * mode: 'preview'（編集画面の中。data-path など編集用の印つき）／ 'export'（書き出すファイル。印なし）。
 * どちらも、ルートは `.uxr-page`。CSSは lib/page-css.js の PAGE_CSS。
 */
export function renderPage(state, { mode = 'preview' } = {}) {
  const ctx = makeCtx(state, mode);
  const name = state.site.name;
  const brand = name || mode === 'preview'
    ? `<span class="uxr-brand${name ? '' : ' is-empty'}"${mode === 'preview' ? ` data-path="site.name"${name ? '' : ' data-ph="サイトの名前"'}` : ''}>${esc(name)}</span>`
    : '';
  const blocks = state.blocks.map((b) => renderBlock(b, ctx)).join('');
  return `<div class="uxr-page" data-theme="${esc(state.theme.preset)}" data-accent="${Number(state.theme.accent)}"><header class="uxr-head"><div class="uxr-head-in">${brand}</div></header><main class="uxr-main">${blocks}</main></div>`;
}
