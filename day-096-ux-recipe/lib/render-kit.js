// 部品の描画に使う小道具（親の担当）。lib/blocks/*.js は、ここの関数だけでHTMLを組み立てる。
// 守ること: 文字は必ず esc を通す／style 属性・on* 属性・外部URLを出さない／書き出し(export)では編集用の印（data-*）を出さない。
import { BLOCK_SCHEMA, getPath, resolveField } from './contract.js';

const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENT[c]);
export const escMultiline = (s) => esc(s).replace(/\n/g, '<br>');

const toPath = (p) => (Array.isArray(p) ? p : String(p).split('.').map((k) => (/^\d+$/.test(k) ? Number(k) : k)));
const joinPath = (p) => (Array.isArray(p) ? p.join('.') : String(p));
const valueAt = (block, path) => getPath(block.props, toPath(path));
const isPreview = (ctx) => ctx.mode === 'preview';

/** 描画の文脈。mode は 'preview'（編集画面の中）か 'export'（書き出すファイル）。 */
export function makeCtx(state, mode = 'preview') {
  const targets = state.blocks.filter((b) => b.type === 'form' || b.type === 'cta');
  return {
    state, mode,
    /** ボタンの飛び先。自分以外で最初の申込フォーム／行動ボタンの部品。無ければ '#'。 */
    hrefFor(blockId) { const hit = targets.find((b) => b.id !== blockId); return hit ? `#uxr-${hit.id}` : '#'; },
  };
}

function editAttrs(ctx, block, path, text, empty) {
  if (!isPreview(ctx)) return '';
  const ph = resolveField(block.type, toPath(path))?.label ?? '';
  return ` data-path="${esc(joinPath(path))}"${text ? '' : ` data-ph="${esc(ph)}"`}${empty ? '' : ''}`;
}

/** 1行の文字。path は 'title' や 'items.1.text'。空のとき: 編集中は目印つきで残し、書き出しでは何も出さない。 */
export function txt(ctx, block, path, { tag = 'span', cls = '', multi = false } = {}) {
  const v = valueAt(block, path);
  const text = typeof v === 'string' ? v : '';
  if (!text && !isPreview(ctx)) return '';
  const classes = [cls, text ? '' : 'is-empty'].filter(Boolean).join(' ');
  return `<${tag}${classes ? ` class="${esc(classes)}"` : ''}${editAttrs(ctx, block, path, text)}>${multi ? escMultiline(text) : esc(text)}</${tag}>`;
}
/** 複数行の文字（改行は <br>）。 */
export const multi = (ctx, block, path, opts = {}) => txt(ctx, block, path, { tag: 'p', ...opts, multi: true });

/** ボタン。飛び先は申込フォーム／行動ボタンの部品（ctx.hrefFor）。 */
export function btn(ctx, block, path, { cls = '', ghost = false, inverse = false } = {}) {
  const v = valueAt(block, path);
  const label = typeof v === 'string' ? v : '';
  if (!label && !isPreview(ctx)) return '';
  const classes = ['uxr-btn', ghost ? 'uxr-btn--ghost' : '', inverse ? 'uxr-btn--inverse' : '', cls, label ? '' : 'is-empty'].filter(Boolean).join(' ');
  return `<a class="${esc(classes)}" href="${esc(ctx.hrefFor(block.id))}"${editAttrs(ctx, block, path, label)}>${esc(label)}</a>`;
}

/** 部品の外枠。inner は部品ごとの中身（すでに安全なHTML）。 */
export function sec(ctx, block, inner, { cls = '' } = {}) {
  const data = isPreview(ctx) ? ` data-block-id="${esc(block.id)}" data-type="${esc(block.type)}" data-variant="${Number(block.variant)}"` : '';
  return `<section class="uxr-block uxr-${block.type} uxr-v${Number(block.variant)}${cls ? ` ${esc(cls)}` : ''}" id="uxr-${esc(block.id)}"${data}><div class="uxr-inner">${inner}</div></section>`;
}

/** 繰り返しの項目。空の項目（すべての文字が空）は書き出しでは飛ばす。 */
export function each(ctx, block, key = 'items') {
  const items = Array.isArray(block.props[key]) ? block.props[key] : [];
  return items.map((item, i) => ({ item, i })).filter(({ item }) => isPreview(ctx) || Object.values(item).some((v) => v === true || (typeof v === 'string' && v !== '')));
}

/** 名前の最初の1文字（丸いアイコンの中身）。 */
export const initial = (name) => Array.from(String(name ?? '').trim())[0] ?? '・';

const ICONS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  star: '<path d="M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  phone: '<path d="M7 3.5h3l1.5 4-2 1.3a11 11 0 0 0 5.7 5.7l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 5 5.7 2 2 0 0 1 7 3.5z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  yen: '<path d="M7 4l5 7 5-7M12 11v9M8 14h8M8 17h8"/>',
  user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.7 3.7-5.5 7-5.5s6.2 1.8 7 5.5"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z"/><path d="M5 19c3-4 6-6 9-8"/>',
  gift: '<rect x="4" y="9.5" width="16" height="10.5" rx="1.5"/><rect x="3" y="6.5" width="18" height="3.5" rx="1"/><path d="M12 6.5V20M12 6.5c-1-3-5-3.2-5-1 0 1.6 3 1 5 1zm0 0c1-3 5-3.2 5-1 0 1.6-3 1-5 1z"/>',
  cart: '<path d="M3.5 4.5h2.4l2 10h9.7l1.9-7.5H7"/><circle cx="10" cy="19" r="1.3"/><circle cx="17" cy="19" r="1.3"/>',
  chat: '<path d="M4 5.5h16v10H10l-4.5 4v-4H4z"/>',
  arrow: '<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  flag: '<path d="M6 21V4M6 5h11l-2.5 4L17 13H6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  cup: '<path d="M5 8h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M16 9.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2M11 3.5v2"/>',
};
export const ICON_NAMES = Object.keys(ICONS);
/** 線の絵（飾り用）。名前は ICON_NAMES。 */
export const ico = (name, cls = '') => (ICONS[name]
  ? `<svg class="uxr-ico${cls ? ` ${esc(cls)}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`
  : '');

/** 部品の種類から、段階を返す（描画側で色分けなどに使える）。 */
export const stageOfType = (type) => BLOCK_SCHEMA[type].stage;
