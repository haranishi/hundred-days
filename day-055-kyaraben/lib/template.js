// 実寸の型紙。SVG の1単位を1mmにし、width/height を mm で書く。倍率100%で印刷すれば、そのままの大きさで出る
import { FOODS, allergenLabel } from './foods.js';
import { DIFFICULTY } from './segment.js';
import { toPathD } from './contour.js';
import { mixHex } from './color.js';

// 型紙の枠。上に名前、下に1cmの確認枠を置くための余白をとる（キャラの絵にかぶせない）
const PAD = { side: 5, top: 9, gap: 4, strip: 13 };
const r2 = (v) => Math.round(v * 100) / 100;
const cm = (mm) => (Math.round(mm) / 10).toFixed(1);
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function frame(charMm, title, body) {
  const W = r2(charMm.w + PAD.side * 2);
  const H = r2(PAD.top + charMm.h + PAD.gap + PAD.strip);
  const sy = r2(PAD.top + charMm.h + PAD.gap);
  const titleSize = r2(Math.min(3.4, (W - PAD.side * 2) / Math.max(1, [...title].length)));
  const hint = W >= 72 ? `<text x="${r2(W - PAD.side)}" y="${r2(sy + 6.4)}" font-size="2.6" fill="#555" text-anchor="end">この枠が1cmなら実寸です</text>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="'Hiragino Maru Gothic ProN','Hiragino Sans',sans-serif">` +
    `<rect x="0.2" y="0.2" width="${r2(W - 0.4)}" height="${r2(H - 0.4)}" fill="#fff" stroke="#9a9a9a" stroke-width="0.2" stroke-dasharray="2 1.2"/>` +
    `<text x="${PAD.side}" y="6" font-size="${titleSize}" fill="#222">${esc(title)}</text>` +
    `<g transform="translate(${PAD.side} ${PAD.top})">${body}</g>` +
    `<rect data-check="1cm" x="${PAD.side}" y="${sy}" width="10" height="10" fill="none" stroke="#222" stroke-width="0.3"/>` +
    `<text x="${PAD.side + 12}" y="${r2(sy + 6.4)}" font-size="3.2" fill="#222">1cm</text>` +
    hint +
    '</svg>'
  );
}

function partNumber(part, s) {
  const small = Math.max(part.wMm, part.hMm) < 4;
  // 小さいパーツは番号で絵が隠れるので、右上の外に出す
  const x = small ? part.bbox.x1 * s + 0.9 : part.labelPt[0] * s;
  const y = small ? part.bbox.y0 * s + 0.6 : part.labelPt[1] * s;
  return `<text x="${r2(x)}" y="${r2(y)}" font-size="2.2" text-anchor="middle" dominant-baseline="central" fill="#222" stroke="#fff" stroke-width="0.45" paint-order="stroke">${part.no}</text>`;
}

export function renderTemplates(plan) {
  const s = plan.scale.mmPerPx;
  const outline = toPathD(plan.base.polys, s, 0, 0);
  const size = { widthMm: plan.charMm.w, heightMm: plan.charMm.h };
  const list = [
    {
      key: 'base',
      title: `ご飯の形（${plan.base.name}）`,
      food: plan.base.food,
      parts: 1,
      ...size,
      svg: frame(plan.charMm, `ご飯の形（${plan.base.name}）`, `<path d="${outline}" fill="none" stroke="#222" stroke-width="0.4" fill-rule="evenodd" stroke-linejoin="round"/>`),
    },
  ];
  for (const g of plan.groups) {
    const food = FOODS[g.food];
    const fill = mixHex(food.color, '#FFFFFF', 0.62);
    const line = mixHex(food.color, '#000000', 0.5);
    let body = `<path d="${outline}" fill="none" stroke="#bdbdbd" stroke-width="0.25" stroke-dasharray="1.2 0.8" fill-rule="evenodd"/>`;
    for (const part of g.parts) body += `<path d="${toPathD(part.polys, s, 0, 0)}" fill="${fill}" stroke="${line}" stroke-width="0.35" fill-rule="evenodd" stroke-linejoin="round"/>`;
    for (const part of g.parts) body += partNumber(part, s);
    const title = `${food.name}（${g.parts.length}個）`;
    list.push({ key: g.food, title, food: g.food, parts: g.parts.length, ...size, svg: frame(plan.charMm, title, body) });
  }
  return list;
}

// 印刷用。1ページ目の上に題名・材料・手順を小さく載せ、続けて型紙の枠を並べる（枠の途中でページを割らない）
export function printHtml(plan, templates) {
  const li = (items) => items.map((t) => `<li>${esc(t)}</li>`).join('');
  const mats = plan.materials.map((m) => {
    const tags = m.allergens.length ? `（${m.allergens.map((a) => allergenLabel(a.name, a.level)).join('・')}）` : '';
    return `${m.name} ${m.amount}${tags}`;
  });
  const diff = DIFFICULTY[plan.difficulty]?.name ?? '';
  return (
    '<article class="print-sheet">' +
    '<header class="print-head"><h1>キャラ弁設計図</h1>' +
    `<p>弁当箱：${esc(plan.box.name)}（${cm(plan.box.w)}×${cm(plan.box.h)}cm）・${esc(diff)}・キャラの大きさ たて${cm(plan.charMm.h)}cm・よこ${cm(plan.charMm.w)}cm</p>` +
    '<p class="print-warn">「実際のサイズ（100%）」で印刷し、1cmの枠を定規で確かめてから切ってください。量はすべて目安です。</p></header>' +
    '<div class="print-cols">' +
    `<section><h2>材料</h2><ul>${li(mats)}</ul><p>ご飯の合計 ${plan.riceTotalG}g</p><h2>道具</h2><p>${esc(plan.tools.join('・'))}</p>` +
    `<h2>アレルギー</h2><ul>${li(plan.cautions.allergy)}</ul></section>` +
    `<section><h2>前の晩</h2><ol>${li(plan.steps.night.map((s) => s.text))}</ol><h2>当日の朝</h2><ol>${li(plan.steps.morning.map((s) => s.text))}</ol></section>` +
    '</div>' +
    `<div class="print-tpls">${templates.map((t) => `<figure class="print-tpl" aria-label="${esc(t.title)}">${t.svg}</figure>`).join('')}</div>` +
    '</article>'
  );
}
