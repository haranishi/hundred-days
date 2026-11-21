// 部品ギャラリー（開発用）。全部品・全バリエーションを、テーマ・強調色・幅を変えて1画面で確かめる。
// 使い方: node day-096-ux-recipe/tools/serve.mjs → http://127.0.0.1:5196/tools/gallery.html?<パラメータ>
//   mode=sheet（既定: 部品ごと・バリエーションごとに縦に並べる）／ block（1部品1バリエーション）／ page（ページ全体）／ themes（同じ部品を4テーマ×並べる）／ recipe（goal=reserve など目的のレシピ）
//   type=hero  variant=0  types=hero,cta  theme=soft|crisp|lively|calm  accent=0〜5  width=390  fill=mid|max|empty
//   state=minimal|reserve|stress（mode=page のとき）  render=export|preview（既定 export）
import { ACCENTS, BLOCK_SCHEMA, BLOCK_TYPES, SCHEMA_VERSION, THEMES, sanitizeProps } from '../lib/contract.js';
import { renderPage } from '../lib/render.js';
import { buildFromRecipe } from '../lib/recipes.js';
import { PAGE_CSS } from '../lib/page-css.js';
import { MINIMAL, RESERVE_SAMPLE, STRESS, emptyProps, maxProps, midProps } from '../tests/fixtures/states.js';

const q = new URLSearchParams(location.search);
const theme = THEMES.includes(q.get('theme')) ? q.get('theme') : 'soft';
const accent = Math.min(ACCENTS.length - 1, Math.max(0, Number(q.get('accent') ?? 0) || 0));
const width = Math.max(280, Math.min(1400, Number(q.get('width') ?? 390) || 390));
const fill = ['mid', 'max', 'empty'].includes(q.get('fill')) ? q.get('fill') : 'mid';
const renderMode = q.get('render') === 'preview' ? 'preview' : 'export';
const mode = ['sheet', 'block', 'page', 'themes', 'recipe'].includes(q.get('mode')) ? q.get('mode') : 'sheet';

const propsFor = (type) => (fill === 'max' ? maxProps(type) : fill === 'empty' ? emptyProps(type) : midProps(type));

function oneBlockState(type, variant, th = theme) {
  return { v: SCHEMA_VERSION, goal: 'reserve', site: { name: 'サンプルのお店' }, theme: { preset: th, accent },
    blocks: [{ id: 'b1', type, variant, props: sanitizeProps(type, propsFor(type)) }, { id: 'b2', type: 'cta', variant: 0, props: sanitizeProps('cta', midProps('cta')) }].slice(0, type === 'cta' ? 1 : 2) };
}

const root = document.getElementById('root');
const style = document.createElement('style');
style.textContent = PAGE_CSS;
document.head.append(style);

function frame(state, label) {
  const wrap = document.createElement('div');
  wrap.className = 'col';
  const cap = document.createElement('div');
  cap.className = 'cap';
  cap.textContent = label;
  const f = document.createElement('div');
  f.className = 'frame';
  f.style.width = `${width}px`;
  f.innerHTML = renderPage(state, { mode: renderMode });
  wrap.append(cap, f);
  return wrap;
}

if (mode === 'recipe') {
  // 目的のレシピそのもの（goal=reserve など）。テーマ・強調色を指定しなければ、レシピ既定の見た目。
  const state = buildFromRecipe(q.get('goal') ?? 'reserve');
  if (q.get('theme')) state.theme = { preset: theme, accent };
  root.append(frame(state, `recipe ${state.goal} / ${state.theme.preset} / accent ${state.theme.accent} / ${width}px`));
} else if (mode === 'page') {
  const base = { minimal: MINIMAL, reserve: RESERVE_SAMPLE, stress: STRESS }[q.get('state')] ?? RESERVE_SAMPLE;
  const state = { ...structuredClone(base), theme: { preset: theme, accent } };
  root.append(frame(state, `page ${q.get('state') ?? 'reserve'} / ${theme} / accent ${accent} / ${width}px`));
} else if (mode === 'block') {
  const type = BLOCK_TYPES.includes(q.get('type')) ? q.get('type') : 'hero';
  const variant = Math.min(BLOCK_SCHEMA[type].variants.length - 1, Number(q.get('variant') ?? 0) || 0);
  root.append(frame(oneBlockState(type, variant), `${type} v${variant} / ${theme} / ${width}px / fill=${fill}`));
} else if (mode === 'themes') {
  const type = BLOCK_TYPES.includes(q.get('type')) ? q.get('type') : 'hero';
  const variant = Math.min(BLOCK_SCHEMA[type].variants.length - 1, Number(q.get('variant') ?? 0) || 0);
  const row = document.createElement('div');
  row.className = 'row';
  for (const th of THEMES) row.append(frame(oneBlockState(type, variant, th), `${type} v${variant} / ${th}`));
  root.append(row);
} else {
  const only = (q.get('types') ?? '').split(',').filter((t) => BLOCK_TYPES.includes(t));
  const row = document.createElement('div');
  row.className = 'row';
  for (const type of only.length ? only : BLOCK_TYPES) {
    BLOCK_SCHEMA[type].variants.forEach((_, variant) => row.append(frame(oneBlockState(type, variant), `${type} v${variant}（${BLOCK_SCHEMA[type].variants[variant]}）`)));
  }
  root.append(row);
}
document.body.dataset.ready = 'true';
