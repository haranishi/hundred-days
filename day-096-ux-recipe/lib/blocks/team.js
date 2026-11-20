// スタッフ紹介（team）。顔写真を使わず名前の頭文字の丸で表し、1〜4人のどれでも均整が取れる配置にする。
import { each, esc, initial, multi, sec, txt } from '../render-kit.js';

export const css = `
.uxr-page .uxr-team .uxr-h2{text-align:center}
.uxr-page .uxr-team .uxr-team-avatar{display:inline-grid;place-items:center;flex:none;border-radius:50%;background:var(--uxr-accent-soft);border:1.5px solid var(--uxr-accent-line);color:var(--uxr-accent-text);font-family:var(--uxr-font-head);font-weight:var(--uxr-head-weight);line-height:1;user-select:none}
.uxr-page .uxr-team .uxr-team-role{font-size:.8125rem;font-weight:700;letter-spacing:.04em;color:var(--uxr-accent-text);text-wrap:balance}
.uxr-page .uxr-team .uxr-team-name{margin:0}
.uxr-page .uxr-team .uxr-team-text{font-size:.9375rem;color:var(--uxr-muted)}

.uxr-page[data-theme="crisp"] .uxr-team .uxr-team-avatar{border:2px solid var(--uxr-accent)}
.uxr-page[data-theme="lively"] .uxr-team .uxr-team-avatar{border:2px solid var(--uxr-ink);box-shadow:3px 3px 0 var(--uxr-ink)}
.uxr-page[data-theme="calm"] .uxr-team .uxr-team-avatar{background:var(--uxr-surface);border:1px solid var(--uxr-accent-line)}

/* v0: 丸。枠線で囲わず大きな頭文字の丸を主役に据え、親しみやすく開いた印象にする */
.uxr-page .uxr-team.uxr-v0 .uxr-team-list{display:grid;gap:28px}
.uxr-page .uxr-team.uxr-v0 .uxr-team-item{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px}
.uxr-page .uxr-team.uxr-v0 .uxr-team-avatar{width:76px;height:76px;font-size:1.75rem}
.uxr-page .uxr-team.uxr-v0 .uxr-team-meta{display:grid;gap:4px;justify-items:center}
.uxr-page .uxr-team.uxr-v0 .uxr-team-text{max-width:26em}

/* v1: カード。左に頭文字の丸・右に名前と役割をまとめ、ひとことを読みやすく下に置く */
.uxr-page .uxr-team.uxr-v1 .uxr-team-list{display:grid;gap:16px}
.uxr-page .uxr-team.uxr-v1 .uxr-team-item{display:grid;gap:14px;align-content:start;padding:22px 20px;background:var(--uxr-surface);border:var(--uxr-card-border);border-radius:var(--uxr-radius);box-shadow:var(--uxr-shadow)}
.uxr-page .uxr-team.uxr-v1 .uxr-team-head{display:flex;align-items:center;gap:14px}
.uxr-page .uxr-team.uxr-v1 .uxr-team-avatar{width:54px;height:54px;font-size:1.25rem}
.uxr-page .uxr-team.uxr-v1 .uxr-team-meta{display:grid;gap:3px;min-width:0}
.uxr-page .uxr-team.uxr-v1 .uxr-team-text{padding-top:12px;border-top:1px solid var(--uxr-line)}

@container uxr (min-width:560px){
  /* v0: 1人は中央に収め、2人は2列、3人は3列、4人は2×2（広い幅で4列）にする */
  .uxr-page .uxr-team.uxr-v0 .uxr-team-list{grid-template-columns:repeat(auto-fit,minmax(min(100%,210px),1fr));gap:28px 22px}
  .uxr-page .uxr-team.uxr-v0 .uxr-team-list:has(>:nth-child(4):last-child){grid-template-columns:repeat(2,minmax(0,1fr))}
  .uxr-page .uxr-team.uxr-v0 .uxr-team-item:only-child{max-width:420px;margin-inline:auto;width:100%}
  .uxr-page .uxr-team.uxr-v0 .uxr-team-avatar{width:84px;height:84px;font-size:1.9rem}
  /* v1: 名前と役割が窮屈にならない2列を基本にし、1人だけ中央寄せ、3人の最後を揃える */
  .uxr-page .uxr-team.uxr-v1 .uxr-team-list{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
  .uxr-page .uxr-team.uxr-v1 .uxr-team-item:only-child{grid-column:1/-1;max-width:540px;margin-inline:auto;width:100%}
  .uxr-page .uxr-team.uxr-v1 .uxr-team-item:last-child:nth-child(odd):not(:only-child){grid-column:1/-1}
}
@container uxr (min-width:720px){
  /* 3人のカードは十分な幅があれば均等3列にし、3人目だけ不自然に横長になるのを防ぐ */
  .uxr-page .uxr-team.uxr-v1 .uxr-team-list:has(>:nth-child(3):last-child){grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
  .uxr-page .uxr-team.uxr-v1 .uxr-team-list:has(>:nth-child(3):last-child) .uxr-team-item:last-child:nth-child(odd):not(:only-child){grid-column:auto}
  .uxr-page .uxr-team.uxr-v1 .uxr-team-list:has(>:nth-child(3):last-child) .uxr-team-avatar{width:46px;height:46px;font-size:1.125rem}
}
@container uxr (min-width:820px){
  .uxr-page .uxr-team.uxr-v0 .uxr-team-list:has(>:nth-child(4):last-child){grid-template-columns:repeat(4,minmax(0,1fr))}
}
`;

export function render(block, ctx) {
  const v = block.variant;
  const heading = txt(ctx, block, 'heading', { tag: 'h2', cls: 'uxr-h2' });
  const rows = each(ctx, block, 'items').map(({ item, i }) => {
    const name = txt(ctx, block, `items.${i}.name`, { tag: 'h3', cls: 'uxr-h3 uxr-team-name' });
    const role = txt(ctx, block, `items.${i}.role`, { tag: 'p', cls: 'uxr-team-role' });
    const text = multi(ctx, block, `items.${i}.text`, { cls: 'uxr-team-text' });
    if (!name && !role && !text) return '';
    const avatar = `<span class="uxr-team-avatar" aria-hidden="true">${esc(initial(item.name))}</span>`;
    const meta = role || name ? `<div class="uxr-team-meta">${role}${name}</div>` : '';
    if (v === 1) {
      return `<li class="uxr-team-item"><div class="uxr-team-head">${avatar}${meta}</div>${text}</li>`;
    }
    return `<li class="uxr-team-item">${avatar}${meta}${text}</li>`;
  }).filter(Boolean).join('');
  const list = rows ? `<ul class="uxr-team-list">${rows}</ul>` : '';
  return sec(ctx, block, `${heading}${list}`);
}
