// 【見本の骨格】どの部品でも、とりあえず読める形で描く代用品（親の担当）。部品ごとの本物は lib/blocks/<type>.js が作り直す。
import { BLOCK_SCHEMA } from '../contract.js';
import { each, multi, sec, txt } from '../render-kit.js';

export function generic(type) {
  return {
    css: `.uxr-page .uxr-${type}{border-top:1px dashed var(--uxr-line)}.uxr-page .uxr-${type} .uxr-gen-type{font-size:.75rem;color:var(--uxr-muted)}`,
    render(block, ctx) {
      const rows = BLOCK_SCHEMA[type].fields.map((f) => {
        if (f.kind === 'text') return txt(ctx, block, f.key, { tag: 'p' });
        if (f.kind === 'long') return multi(ctx, block, f.key);
        if (f.kind === 'check') return '';
        const items = each(ctx, block, f.key).map(({ i }) => `<li>${f.item.map((g) => (g.kind === 'check' ? '' : txt(ctx, block, `${f.key}.${i}.${g.key}`))).filter(Boolean).join(' / ')}</li>`).join('');
        return `<ul>${items}</ul>`;
      }).join('');
      return sec(ctx, block, `<p class="uxr-gen-type">${BLOCK_SCHEMA[type].label}</p>${rows}`);
    },
  };
}
