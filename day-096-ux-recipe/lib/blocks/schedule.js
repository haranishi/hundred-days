// 日程・プログラム（schedule）。v0=左に時間・縦の線と点、v1=時間のチップつきカード。
import { each, ico, multi, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-schedule:has(> .uxr-inner:empty){display:none}
/* v0: 時系列がひと目で追える縦のタイムライン */
.uxr-page .uxr-schedule.uxr-v0 .uxr-sched-list{display:grid}
.uxr-page .uxr-schedule.uxr-v0 .uxr-sched-item{display:grid;grid-template-columns:minmax(4em,5.4em) 20px minmax(0,1fr);gap:0 12px;align-items:start}
.uxr-page .uxr-schedule.uxr-v0 .uxr-sched-tcol{padding:2px 0 22px;text-align:right}
.uxr-page .uxr-schedule.uxr-v0 .uxr-sched-time{display:block;font-variant-numeric:tabular-nums;font-weight:700;font-size:.9375rem;line-height:1.5;color:var(--uxr-accent-text)}
.uxr-page .uxr-schedule.uxr-v0 .uxr-sched-rail{position:relative;display:flex;justify-content:center;align-self:stretch}
.uxr-page .uxr-schedule.uxr-v0 .uxr-sched-rail::before{content:"";position:absolute;top:16px;bottom:-4px;width:2px;background:var(--uxr-accent-line)}
.uxr-page .uxr-schedule.uxr-v0 .uxr-sched-item:last-child .uxr-sched-rail::before{display:none}
.uxr-page .uxr-schedule.uxr-v0 .uxr-sched-dot{position:relative;z-index:1;margin-top:6px;width:12px;height:12px;border-radius:50%;background:var(--uxr-accent);box-shadow:0 0 0 4px var(--uxr-accent-soft)}
.uxr-page .uxr-schedule.uxr-v0 .uxr-sched-body{display:grid;gap:6px;padding:0 0 24px;min-width:0}
.uxr-page .uxr-schedule.uxr-v0 .uxr-sched-item:last-child .uxr-sched-tcol,
.uxr-page .uxr-schedule.uxr-v0 .uxr-sched-item:last-child .uxr-sched-body{padding-bottom:0}
.uxr-page .uxr-schedule.uxr-v0 .uxr-sched-text{font-size:.9375rem;line-height:1.7;color:var(--uxr-muted)}

/* v1: 時間のチップを先頭に置いたカードのグリッド */
.uxr-page .uxr-schedule.uxr-v1 .uxr-sched-cards{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr))}
.uxr-page .uxr-schedule.uxr-v1 .uxr-sched-card{display:flex;flex-direction:column;align-items:flex-start;gap:10px}
.uxr-page .uxr-schedule.uxr-v1 .uxr-sched-chip{font-variant-numeric:tabular-nums}
.uxr-page .uxr-schedule.uxr-v1 .uxr-sched-chip .uxr-ico{width:15px;height:15px}
.uxr-page .uxr-schedule.uxr-v1 .uxr-sched-text{font-size:.9375rem;line-height:1.7;color:var(--uxr-muted)}

.uxr-page[data-theme="lively"] .uxr-schedule.uxr-v0 .uxr-sched-dot{border:2px solid var(--uxr-ink);width:14px;height:14px}
.uxr-page[data-theme="lively"] .uxr-schedule.uxr-v0 .uxr-sched-rail::before{background:var(--uxr-ink)}
.uxr-page[data-theme="lively"] .uxr-schedule.uxr-v1 .uxr-sched-chip{border:1.5px solid var(--uxr-ink)}
.uxr-page[data-theme="calm"] .uxr-schedule.uxr-v0 .uxr-sched-dot{width:9px;height:9px;margin-top:8px;box-shadow:none}
.uxr-page[data-theme="calm"] .uxr-schedule.uxr-v0 .uxr-sched-rail::before{width:1px}

@container uxr (min-width:560px){
  /* 4件のとき3+1の端数にせず2×2で安定させる */
  .uxr-page .uxr-schedule.uxr-v1 .uxr-sched-cards:has(> :nth-child(4):last-child){grid-template-columns:repeat(2,minmax(0,1fr))}
}
@container uxr (min-width:720px){
  .uxr-page .uxr-schedule.uxr-v0 .uxr-sched-item{grid-template-columns:5.5em 24px minmax(0,1fr);gap:0 18px}
  .uxr-page .uxr-schedule.uxr-v0 .uxr-sched-tcol{text-align:start}
}
`;

export function render(block, ctx) {
  const heading = txt(ctx, block, 'heading', { tag: 'h2', cls: 'uxr-h2' });
  const items = each(ctx, block, 'items');

  if (block.variant === 1) {
    const cards = items.map(({ i }) => {
      const time = txt(ctx, block, `items.${i}.time`);
      const chip = time ? `<div class="uxr-chip uxr-sched-chip">${ico('clock')}${time}</div>` : '';
      const title = txt(ctx, block, `items.${i}.title`, { tag: 'h3', cls: 'uxr-h3' });
      const text = multi(ctx, block, `items.${i}.text`, { cls: 'uxr-sched-text' });
      return `<li class="uxr-card uxr-sched-card">${chip}${title}${text}</li>`;
    }).join('');
    const list = cards ? `<ol class="uxr-sched-cards">${cards}</ol>` : '';
    return sec(ctx, block, `${heading}${list}`);
  }

  const rows = items.map(({ i }) => {
    const time = txt(ctx, block, `items.${i}.time`, { cls: 'uxr-sched-time' });
    const title = txt(ctx, block, `items.${i}.title`, { tag: 'h3', cls: 'uxr-h3' });
    const text = multi(ctx, block, `items.${i}.text`, { cls: 'uxr-sched-text' });
    return `<li class="uxr-sched-item"><div class="uxr-sched-tcol">${time}</div><div class="uxr-sched-rail" aria-hidden="true"><i class="uxr-sched-dot"></i></div><div class="uxr-sched-body">${title}${text}</div></li>`;
  }).join('');
  const list = rows ? `<ol class="uxr-sched-list">${rows}</ol>` : '';
  return sec(ctx, block, `${heading}${list}`);
}
