// ご利用の流れ（steps）。順番が一目で追えるよう、番号の丸と接続線で流れを示す。
import { each, ico, multi, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-steps .uxr-h2{text-align:left}
.uxr-page .uxr-steps .uxr-steps-list{display:grid;gap:0}
.uxr-page .uxr-steps .uxr-step-item{position:relative;display:grid;grid-template-columns:38px minmax(0,1fr);gap:14px;align-items:start;padding-bottom:24px}
.uxr-page .uxr-steps .uxr-step-item:last-child{padding-bottom:0}

/* 縦の流れ: 番号の丸の下へ線を引き、最後の項目だけ線を止める */
.uxr-page .uxr-steps .uxr-step-item::before{content:"";position:absolute;left:18px;top:38px;bottom:0;width:2px;background:var(--uxr-accent-line)}
.uxr-page .uxr-steps .uxr-step-item:last-child::before{display:none}
.uxr-page .uxr-steps .uxr-step-head{display:flex;align-items:center}
.uxr-page .uxr-steps .uxr-step-num{position:relative;z-index:1;display:inline-grid;place-items:center;flex:none;width:38px;height:38px;border-radius:50%;background:var(--uxr-accent);color:var(--uxr-accent-ink);font-family:var(--uxr-font-head);font-size:1rem;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.uxr-page .uxr-steps .uxr-step-arrow{display:none}
.uxr-page .uxr-steps .uxr-step-body{display:grid;gap:6px;padding:14px 16px;background:var(--uxr-surface);border:var(--uxr-card-border);border-radius:var(--uxr-radius-sm);box-shadow:var(--uxr-shadow)}
.uxr-page .uxr-steps .uxr-step-title{margin:0}
.uxr-page .uxr-steps .uxr-step-text{color:var(--uxr-muted);font-size:.9375rem}

.uxr-page[data-theme="lively"] .uxr-steps .uxr-step-item::before{background:var(--uxr-ink)}
.uxr-page[data-theme="lively"] .uxr-steps .uxr-step-num{border:2px solid var(--uxr-ink);box-shadow:2px 2px 0 var(--uxr-ink)}
.uxr-page[data-theme="calm"] .uxr-steps .uxr-step-num{background:var(--uxr-surface);color:var(--uxr-accent-text);border:1px solid var(--uxr-accent-line);font-weight:600}
.uxr-page[data-theme="calm"] .uxr-steps .uxr-step-body{background:transparent;border:0;border-bottom:1px solid var(--uxr-line);border-radius:0;padding:4px 0 18px}
.uxr-page[data-theme="calm"] .uxr-steps .uxr-step-item:last-child .uxr-step-body{border-bottom:0;padding-bottom:0}

/* v1: 広い幅だけ横の流れへ切り替え、番号の横に矢印を出す。5件で幅が足りないときは3+2で折る */
@container uxr (min-width:640px){
  .uxr-page .uxr-steps.uxr-v1 .uxr-steps-list{grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr));gap:20px 14px;align-items:stretch}
  .uxr-page .uxr-steps.uxr-v1 .uxr-steps-list:has(>:nth-child(5)){grid-template-columns:repeat(3,minmax(0,1fr))}
  .uxr-page .uxr-steps.uxr-v1 .uxr-step-item{grid-template-columns:minmax(0,1fr);grid-template-rows:auto 1fr;gap:12px;padding-bottom:0}
  .uxr-page .uxr-steps.uxr-v1 .uxr-step-item::before{display:none}
  .uxr-page .uxr-steps.uxr-v1 .uxr-step-head{gap:0}
  .uxr-page .uxr-steps.uxr-v1 .uxr-step-num{order:1}
  .uxr-page .uxr-steps.uxr-v1 .uxr-step-head::after{content:"";order:2;flex:1;height:2px;margin-left:10px;margin-right:-5px;background:var(--uxr-accent-line)}
  .uxr-page .uxr-steps.uxr-v1 .uxr-step-item:last-child .uxr-step-head::after{display:none}
  .uxr-page .uxr-steps.uxr-v1 .uxr-step-arrow{display:inline-flex;order:3;flex:none;color:var(--uxr-accent-text)}
  .uxr-page .uxr-steps.uxr-v1 .uxr-step-arrow .uxr-ico{width:18px;height:18px}
  .uxr-page .uxr-steps.uxr-v1 .uxr-step-item:last-child .uxr-step-arrow{display:none}
  .uxr-page .uxr-steps.uxr-v1 .uxr-step-body{align-content:start;padding:16px}
  .uxr-page[data-theme="lively"] .uxr-steps.uxr-v1 .uxr-step-head::after{background:var(--uxr-ink)}
  .uxr-page[data-theme="lively"] .uxr-steps.uxr-v1 .uxr-step-arrow{color:var(--uxr-ink)}
  .uxr-page[data-theme="calm"] .uxr-steps.uxr-v1 .uxr-step-body{border-bottom:0;border-top:1px solid var(--uxr-line);padding:14px 4px 0}
}
@container uxr (min-width:640px) and (max-width:819px){
  /* 5件を3+2で折り返す幅では、1段目の末尾（3番目）から右の余白へ矢印を伸ばさない */
  .uxr-page .uxr-steps.uxr-v1 .uxr-steps-list:has(>:nth-child(5)) .uxr-step-item:nth-child(3) .uxr-step-head::after,
  .uxr-page .uxr-steps.uxr-v1 .uxr-steps-list:has(>:nth-child(5)) .uxr-step-item:nth-child(3) .uxr-step-arrow{display:none}
}
@container uxr (min-width:720px){
  .uxr-page .uxr-steps.uxr-v1 .uxr-steps-list{grid-auto-rows:1fr}
  .uxr-page .uxr-steps.uxr-v1 .uxr-step-body{align-self:stretch}
}
@container uxr (min-width:820px){
  .uxr-page .uxr-steps.uxr-v1 .uxr-steps-list:has(>:nth-child(5)){grid-template-columns:repeat(5,minmax(0,1fr))}
  .uxr-page .uxr-steps.uxr-v1 .uxr-steps-list:has(>:nth-child(5)) .uxr-step-body{padding:14px 12px}
  .uxr-page .uxr-steps.uxr-v1 .uxr-steps-list:has(>:nth-child(5)) .uxr-step-text{font-size:.875rem}
}
`;

export function render(block, ctx) {
  const heading = txt(ctx, block, 'heading', { tag: 'h2', cls: 'uxr-h2' });
  const rows = each(ctx, block, 'items').map(({ i }, idx) => {
    const title = txt(ctx, block, `items.${i}.title`, { tag: 'h3', cls: 'uxr-h3 uxr-step-title' });
    const text = multi(ctx, block, `items.${i}.text`, { cls: 'uxr-step-text' });
    if (!title && !text) return '';
    // 空の項目を飛ばしたあとも連番になるよう、表示する並びの添字で番号を振る
    const num = idx + 1;
    return `<li class="uxr-step-item"><div class="uxr-step-head" aria-hidden="true"><span class="uxr-step-num">${num}</span><span class="uxr-step-arrow">${ico('arrow')}</span></div><div class="uxr-step-body">${title}${text}</div></li>`;
  }).filter(Boolean).join('');
  const list = rows ? `<ol class="uxr-steps-list">${rows}</ol>` : '';
  return sec(ctx, block, `${heading}${list}`);
}
