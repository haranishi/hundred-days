// よくある質問（faq）。v0=details/summary の開閉、v1=Qの丸い印つき一覧。
import { each, multi, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-faq:has(> .uxr-inner:empty){display:none}
/* v0: キーボードでも開閉でき、＋−の印で状態が分かるアコーディオン */
.uxr-page .uxr-faq.uxr-v0 .uxr-faq-list{display:grid;gap:12px}
.uxr-page .uxr-faq.uxr-v0 .uxr-faq-item{background:var(--uxr-surface);border:var(--uxr-card-border);border-radius:var(--uxr-radius);box-shadow:var(--uxr-shadow);overflow:hidden}
.uxr-page .uxr-faq.uxr-v0 .uxr-faq-q{display:flex;align-items:center;gap:12px;min-height:54px;padding:15px 18px;cursor:pointer;list-style:none;font-family:var(--uxr-font-head);font-weight:var(--uxr-head-weight);line-height:1.45}
.uxr-page .uxr-faq.uxr-v0 .uxr-faq-q::-webkit-details-marker{display:none}
.uxr-page .uxr-faq.uxr-v0 .uxr-faq-q:focus-visible{outline:3px solid var(--uxr-ink);outline-offset:-3px}
.uxr-page .uxr-faq.uxr-v0 .uxr-faq-qmark{flex:none;display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--uxr-accent-soft);color:var(--uxr-accent-text);font-style:normal;font-size:.875rem;font-weight:800}
.uxr-page .uxr-faq.uxr-v0 .uxr-faq-qt{flex:1;min-width:0}
.uxr-page .uxr-faq.uxr-v0 .uxr-faq-toggle{position:relative;flex:none;width:22px;height:22px}
.uxr-page .uxr-faq.uxr-v0 .uxr-faq-toggle::before,
.uxr-page .uxr-faq.uxr-v0 .uxr-faq-toggle::after{content:"";position:absolute;left:50%;top:50%;width:14px;height:2px;border-radius:2px;background:var(--uxr-accent-text);transform:translate(-50%,-50%);transition:transform .18s ease,opacity .18s ease}
.uxr-page .uxr-faq.uxr-v0 .uxr-faq-toggle::after{transform:translate(-50%,-50%) rotate(90deg)}
.uxr-page .uxr-faq.uxr-v0 .uxr-faq-item[open] .uxr-faq-toggle::after{transform:translate(-50%,-50%) rotate(0deg);opacity:0}
.uxr-page .uxr-faq.uxr-v0 .uxr-faq-a{padding:0 18px 18px 58px;color:var(--uxr-muted);font-size:.9375rem;line-height:1.75}
.uxr-page .uxr-faq.uxr-v0 .uxr-faq-a p{padding-top:12px;border-top:1px solid color-mix(in srgb,var(--uxr-line) 85%,transparent)}
@media (prefers-reduced-motion:reduce){
  .uxr-page .uxr-faq.uxr-v0 .uxr-faq-toggle::before,
  .uxr-page .uxr-faq.uxr-v0 .uxr-faq-toggle::after{transition:none}
}

/* v1: 答えが最初から見えて迷わない Q&A 一覧 */
.uxr-page .uxr-faq.uxr-v1 .uxr-faq-dl{display:grid;gap:14px}
.uxr-page .uxr-faq.uxr-v1 .uxr-faq-card{display:grid;gap:12px}
.uxr-page .uxr-faq.uxr-v1 .uxr-faq-dt{display:flex;align-items:flex-start;gap:12px;font-family:var(--uxr-font-head);font-weight:var(--uxr-head-weight);font-size:1.0625rem;line-height:1.45}
.uxr-page .uxr-faq.uxr-v1 .uxr-faq-qbadge{flex:none;display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--uxr-accent);color:var(--uxr-accent-ink);font-style:normal;font-size:.875rem;font-weight:800}
.uxr-page .uxr-faq.uxr-v1 .uxr-faq-dd{display:flex;align-items:flex-start;gap:12px;padding-top:12px;border-top:1px solid color-mix(in srgb,var(--uxr-line) 85%,transparent);color:var(--uxr-muted);font-size:.9375rem;line-height:1.75}
.uxr-page .uxr-faq.uxr-v1 .uxr-faq-amark{flex:none;display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;background:var(--uxr-surface2);color:var(--uxr-ink);font-style:normal;font-size:.875rem;font-weight:700}
.uxr-page .uxr-faq.uxr-v1 .uxr-faq-at{flex:1;min-width:0}

.uxr-page[data-theme="lively"] .uxr-faq.uxr-v0 .uxr-faq-qmark,
.uxr-page[data-theme="lively"] .uxr-faq.uxr-v1 .uxr-faq-qbadge,
.uxr-page[data-theme="lively"] .uxr-faq.uxr-v1 .uxr-faq-amark{border:1.5px solid var(--uxr-ink)}
.uxr-page[data-theme="calm"] .uxr-faq.uxr-v0 .uxr-faq-qmark,
.uxr-page[data-theme="calm"] .uxr-faq.uxr-v1 .uxr-faq-qbadge,
.uxr-page[data-theme="calm"] .uxr-faq.uxr-v1 .uxr-faq-amark{font-family:var(--uxr-font-head)}
`;

export function render(block, ctx) {
  const heading = txt(ctx, block, 'heading', { tag: 'h2', cls: 'uxr-h2' });
  const items = each(ctx, block, 'items');

  if (block.variant === 1) {
    const cards = items.map(({ i }) => {
      const q = txt(ctx, block, `items.${i}.q`, { cls: 'uxr-faq-qt' });
      const a = multi(ctx, block, `items.${i}.a`, { cls: 'uxr-faq-at' });
      const dt = q ? `<dt class="uxr-faq-dt"><i class="uxr-faq-qbadge" aria-hidden="true">Q</i>${q}</dt>` : '';
      const dd = a ? `<dd class="uxr-faq-dd"><i class="uxr-faq-amark" aria-hidden="true">A</i>${a}</dd>` : '';
      return `<div class="uxr-card uxr-faq-card">${dt}${dd}</div>`;
    }).join('');
    const list = cards ? `<dl class="uxr-faq-dl">${cards}</dl>` : '';
    return sec(ctx, block, `${heading}${list}`);
  }

  const list = items.map(({ i }, index) => {
    const q = txt(ctx, block, `items.${i}.q`, { cls: 'uxr-faq-qt' });
    const a = multi(ctx, block, `items.${i}.a`);
    // 編集中はすべての答えを直接押して編集できるよう開き、書き出しは1件目だけ開いて見本を示す
    const open = ctx.mode === 'preview' || index === 0 ? ' open=""' : '';
    const answer = a ? `<div class="uxr-faq-a">${a}</div>` : '';
    return `<details class="uxr-faq-item"${open}><summary class="uxr-faq-q"><i class="uxr-faq-qmark" aria-hidden="true">Q</i>${q}<i class="uxr-faq-toggle" aria-hidden="true"></i></summary>${answer}</details>`;
  }).join('');
  const wrap = list ? `<div class="uxr-faq-list">${list}</div>` : '';
  return sec(ctx, block, `${heading}${wrap}`);
}
