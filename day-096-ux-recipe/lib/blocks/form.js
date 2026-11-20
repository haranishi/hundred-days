// 申込フォーム（form）。v0=縦に並べる入力欄とボタン、v1=先頭1項目だけのひとことフォーム。
// 編集中（preview）はフォーカスを奪わない div の枠で描き、書き出し（export）だけ本物の form/label/input/button を出す。
import { each, esc, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-form:has(> .uxr-inner:empty){display:none}
.uxr-page .uxr-form .uxr-form-card{max-width:580px;margin-inline:auto}
.uxr-page .uxr-form .uxr-form-box{display:grid;gap:16px}
.uxr-page .uxr-form .uxr-field{display:grid;gap:6px;min-width:0}
.uxr-page .uxr-form .uxr-field-label{display:block;font-size:.9375rem;font-weight:700;line-height:1.45;color:var(--uxr-ink)}
.uxr-page .uxr-form :is(.uxr-input,.uxr-input-mock,textarea,select){display:block;width:100%;min-height:48px;padding:11px 14px;border:1.5px solid var(--uxr-field-line);border-radius:var(--uxr-radius-sm);background:var(--uxr-bg);color:var(--uxr-ink);font:inherit;font-size:1rem;line-height:1.5}
.uxr-page .uxr-form :is(.uxr-input,textarea,select):focus-visible{outline:3px solid var(--uxr-accent);outline-offset:1px;border-color:var(--uxr-accent)}
.uxr-page .uxr-form .uxr-form-submit{width:100%}
.uxr-page .uxr-form .uxr-form-note{margin-top:12px}

.uxr-page .uxr-form.uxr-v0 .uxr-form-actions{margin-top:6px}
.uxr-page .uxr-form.uxr-v1 .uxr-form-inline{display:grid;gap:12px}

.uxr-page[data-theme="lively"] .uxr-form :is(.uxr-input,.uxr-input-mock,textarea,select){border-width:2px;background:var(--uxr-surface)}

@container uxr (min-width:580px){
  .uxr-page .uxr-form .uxr-form-card{padding:32px}
  .uxr-page .uxr-form.uxr-v0 .uxr-form-submit{width:auto;min-width:220px}
  /* v1 は広い幅で入力欄とボタンを同じ底辺に揃え、1アクションの軽さを出す */
  .uxr-page .uxr-form.uxr-v1 .uxr-form-inline{grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:14px}
  .uxr-page .uxr-form.uxr-v1 .uxr-form-submit{width:auto;min-width:160px;min-height:48px}
}
`;

export function render(block, ctx) {
  const heading = txt(ctx, block, 'heading', { tag: 'h2', cls: 'uxr-h2' });
  const note = txt(ctx, block, 'note', { tag: 'p', cls: 'uxr-note uxr-form-note' });
  const isPreview = ctx.mode === 'preview';
  const v1 = block.variant === 1;

  // v1 は先頭の1項目だけを使う（契約 render-contract.test.mjs の NOT_SHOWN と一致）
  const rawItems = each(ctx, block, 'items');
  const fields = v1
    ? (isPreview ? rawItems.slice(0, 1) : (block.props.items?.[0]?.label ? [{ item: block.props.items[0], i: 0 }] : []))
    : rawItems;

  if (isPreview) {
    const fieldHtml = fields.map(({ i }) => {
      const label = txt(ctx, block, `items.${i}.label`, { tag: 'p', cls: 'uxr-field-label' });
      return `<div class="uxr-field">${label}<div class="uxr-input-mock" aria-hidden="true"></div></div>`;
    }).join('');
    const submit = txt(ctx, block, 'submit', { tag: 'div', cls: 'uxr-btn uxr-form-submit' });
    const inner = v1
      ? `<div class="uxr-form-box"><div class="uxr-form-inline">${fieldHtml}${submit}</div></div>`
      : `<div class="uxr-form-box">${fieldHtml}<div class="uxr-form-actions">${submit}</div></div>`;
    return sec(ctx, block, `<div class="uxr-card uxr-form-card">${heading}${inner}${note}</div>`);
  }

  const fieldHtml = fields.map(({ item, i }) => {
    const fid = `uxr-${esc(block.id)}-f${i}`;
    return `<div class="uxr-field"><label class="uxr-field-label" for="${fid}">${esc(item.label)}</label><input class="uxr-input" id="${fid}" name="field_${i}" type="text" /></div>`;
  }).join('');
  const submitLabel = typeof block.props.submit === 'string' ? block.props.submit : '';
  const submit = submitLabel ? `<button class="uxr-btn uxr-form-submit" type="submit">${esc(submitLabel)}</button>` : '';
  const formInner = v1
    ? (fieldHtml || submit ? `<div class="uxr-form-inline">${fieldHtml}${submit}</div>` : '')
    : `${fieldHtml}${submit ? `<div class="uxr-form-actions">${submit}</div>` : ''}`;
  const form = formInner ? `<form class="uxr-form-box" action="#">${formInner}</form>` : '';
  const body = heading || form || note ? `<div class="uxr-card uxr-form-card">${heading}${form}${note}</div>` : '';
  return sec(ctx, block, body);
}
