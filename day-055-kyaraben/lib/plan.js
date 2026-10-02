// 読み取った層から、材料・量・段取り・パーツの寸法を出す。数字は目安なので、買いやすく切りやすい単位に丸める
import { FOODS, fitScale, defaultBaseFood, defaultFood, sheetAmount, riceGrams, ceil10, RICE_THICKNESS, ALLERGENS, LEVEL_RANK, allergenLabel } from './foods.js';
import { components } from './segment.js';
import { traceMask, polyArea, polyPerimeter } from './contour.js';

const cm = (mm) => Math.max(0.1, Math.round(mm) / 10).toFixed(1);
const r2 = (v) => Math.round(v * 100) / 100;

// パーツ番号を置く点。外接矩形の中心は輪（のりの輪郭など）の穴に落ちるので、縁から最も遠い画素を使う
function innerPoint(mask, w, h) {
  const d = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? 1e9 : 0;
  const get = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      d[i] = Math.min(d[i], get(x - 1, y) + 1, get(x, y - 1) + 1, get(x - 1, y - 1) + 1.4, get(x + 1, y - 1) + 1.4);
    }
  }
  let best = 0;
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!mask[i]) continue;
      d[i] = Math.min(d[i], get(x + 1, y) + 1, get(x, y + 1) + 1, get(x + 1, y + 1) + 1.4, get(x - 1, y + 1) + 1.4);
    }
  }
  for (let i = 1; i < w * h; i++) if (d[i] > d[best]) best = i;
  return [(best % w) + 0.5, Math.floor(best / w) + 0.5];
}

function makePart(c, comp, w, mmPerPx) {
  const bw = c.x1 - c.x0 + 1;
  const bh = c.y1 - c.y0 + 1;
  const mask = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (comp[(c.y0 + y) * w + c.x0 + x] === c.id) mask[y * bw + x] = 1;
  const polys = traceMask(mask, bw, bh).map((poly) => poly.map(([x, y]) => [x + c.x0, y + c.y0]));
  const [lx, ly] = innerPoint(mask, bw, bh);
  const area = Math.abs(polys.reduce((s, p) => s + polyArea(p), 0));
  const perimeter = polys.reduce((s, p) => s + polyPerimeter(p), 0);
  const circularity = perimeter > 0 ? (4 * Math.PI * area) / perimeter ** 2 : 0;
  const wMm = bw * mmPerPx;
  const hMm = bh * mmPerPx;
  // 細さは 2×面積÷周の長さ（帯なら幅になる）。外接矩形の短辺だと、曲がった線や輪で太く見積もってしまう
  const thickMm = perimeter > 0 ? ((2 * area) / perimeter) * mmPerPx : 0;
  const kind = circularity >= 0.7 && Math.max(wMm, hMm) <= 12 ? 'circle' : thickMm <= 3 ? 'line' : 'shape';
  return {
    no: 0,
    kind,
    areaMm2: c.area * mmPerPx * mmPerPx,
    wMm,
    hMm,
    thickMm,
    circularity,
    polys,
    labelPt: [lx + c.x0, ly + c.y0],
    bbox: { x0: c.x0, y0: c.y0, x1: c.x1 + 1, y1: c.y1 + 1 },
  };
}

function cutText(group) {
  const kinds = new Set(group.parts.map((p) => p.kind));
  const ways = [];
  if (kinds.has('circle')) ways.push(['丸はストローで抜き', '丸はストローで抜く']);
  if (kinds.has('line')) ways.push(['線ははさみで細く切り', '線ははさみで細く切る']);
  if (kinds.has('shape')) ways.push(['形はつまようじでなぞって切り', '形はつまようじでなぞって切る']);
  const how = ways.map((w, i) => (i === ways.length - 1 ? w[1] : w[0])).join('、');
  const food = FOODS[group.food];
  const big = group.parts[0];
  const prep = food.prep ? `${food.prep}。` : '';
  return `${food.name}：${prep}型紙の「${food.name}」を乗せ、${how}。${group.parts.length}個（いちばん大きいもので たて${cm(big.hMm)}cm・よこ${cm(big.wMm)}cm）。ラップに並べて包み、冷蔵庫へ`;
}

const HYGIENE = [
  '手をよく洗い、ご飯とパーツはラップか清潔な手袋ごしに扱う',
  'ご飯は炊きたてかしっかり温め直したものを使い、冷ましてから詰めてふたをする',
  '卵は中までしっかり火を通す',
  '前の晩に切ったパーツは冷蔵庫へ',
  '暑い日は保冷剤を添えて涼しい所に置く',
];

export function buildPlan(analysis, { box = 'school', difficulty = 'normal', overrides = {} } = {}) {
  const { width: w, height: h, labels, layers: rawLayers } = analysis;
  const { box: boxInfo, mmPerPx } = fitScale(w, h, box);
  const mm2 = mmPerPx * mmPerPx;

  const baseLayer = rawLayers.reduce((a, b) => (b.areaPx > a.areaPx ? b : a));
  const baseWish = overrides[baseLayer.id];
  const baseFood = baseWish && FOODS[baseWish]?.kind === 'rice' ? baseWish : defaultBaseFood(baseLayer.family);

  const { comp, list } = components(labels, w, h, { conn: 8, same: true });
  const islands = new Map();
  for (const c of list) {
    if (!islands.has(c.value)) islands.set(c.value, []);
    islands.get(c.value).push(c);
  }

  const layers = rawLayers.map((layer) => {
    const isBase = layer.id === baseLayer.id;
    let food = isBase ? baseFood : overrides[layer.id] ?? defaultFood(layer.family);
    if (food !== 'none' && !FOODS[food]) food = defaultFood(layer.family);
    // 「使わない」と、土台と同じ食材を選んだ層は、土台のご飯に溶かす（別のパーツにしない）
    const dissolved = isBase || food === 'none' || food === baseFood;
    const parts = dissolved ? [] : (islands.get(layer.id) ?? []).map((c) => makePart(c, comp, w, mmPerPx));
    return { id: layer.id, family: layer.family, colorHex: layer.colorHex, food, isBase, dissolved, areaMm2: layer.areaPx * mm2, parts };
  });

  const groupMap = new Map();
  for (const layer of layers) {
    if (layer.dissolved) continue;
    let g = groupMap.get(layer.food);
    if (!g) {
      const food = FOODS[layer.food];
      g = { food: food.id, name: food.name, kind: food.kind, layerIds: [], parts: [], areaMm2: 0 };
      groupMap.set(layer.food, g);
    }
    g.layerIds.push(layer.id);
    g.parts.push(...layer.parts);
    g.areaMm2 += layer.parts.reduce((s, p) => s + p.areaMm2, 0);
  }
  for (const g of groupMap.values()) {
    g.parts.sort((a, b) => b.areaMm2 - a.areaMm2);
    g.parts.forEach((p, i) => {
      p.no = i + 1;
    });
  }
  // 並べる順：ご飯のパーツ → シートを面積の大きい順 → のりは最後（湿気でよれないように）
  const all = [...groupMap.values()].filter((g) => g.parts.length);
  const riceGroups = all.filter((g) => g.kind === 'rice').sort((a, b) => b.areaMm2 - a.areaMm2);
  const sheetGroups = all.filter((g) => g.kind === 'sheet' && g.food !== 'nori').sort((a, b) => b.areaMm2 - a.areaMm2);
  const nori = all.find((g) => g.food === 'nori');
  const groups = [...riceGroups, ...sheetGroups, ...(nori ? [nori] : [])];

  const fgMask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) fgMask[i] = labels[i] ? 1 : 0;
  const baseArea = analysis.foregroundPx * mm2;
  const base = {
    food: baseFood,
    name: FOODS[baseFood].name,
    layerId: baseLayer.id,
    family: baseLayer.family,
    areaMm2: baseArea,
    wMm: w * mmPerPx,
    hMm: h * mmPerPx,
    polys: traceMask(fgMask, w, h),
    grams: ceil10(riceGrams(baseArea, RICE_THICKNESS.base)),
  };

  const materials = [];
  const riceMaterial = (id, grams) => {
    const food = FOODS[id];
    return { food: id, name: food.name, amount: `${grams}g`, grams, allergens: food.allergens, note: food.seasoning ? `ご飯に${food.seasoning}を混ぜる` : '' };
  };
  materials.push(riceMaterial(baseFood, base.grams));
  for (const g of riceGroups) {
    g.grams = ceil10(riceGrams(g.areaMm2, RICE_THICKNESS.part));
    materials.push(riceMaterial(g.food, g.grams));
  }
  for (const g of [...sheetGroups, ...(nori ? [nori] : [])]) {
    g.amount = sheetAmount(g.food, g.areaMm2);
    materials.push({ food: g.food, name: g.name, amount: g.amount.text, allergens: FOODS[g.food].allergens, note: '' });
  }
  const riceTotalG = base.grams + riceGroups.reduce((s, g) => s + g.grams, 0);

  const usedFoods = [...new Set([baseFood, ...groups.map((g) => g.food)])];
  const colored = usedFoods.filter((id) => FOODS[id].kind === 'rice' && id !== 'rice');
  const partCount = groups.reduce((s, g) => s + g.parts.length, 0);
  const hasCircle = groups.some((g) => g.parts.some((p) => p.kind === 'circle'));

  const night = [{ key: 'print', text: '型紙を「実際のサイズ（100%）」で印刷し、1cmの枠を定規で確かめる。食材ごとに切り分ける' }];
  if (groupMap.has('usuyaki')) night.push({ key: 'usuyaki', text: `薄焼き卵を焼く：${FOODS.usuyaki.howto}` });
  for (const g of sheetGroups) night.push({ key: `cut:${g.food}`, text: cutText(g) });
  if (nori) {
    const lines = nori.parts.filter((p) => p.kind === 'line');
    const thin = lines.length ? `（いちばん細い線は${(Math.round(Math.min(...lines.map((p) => p.thickMm)) * 10) / 10).toFixed(1)}mm）` : '';
    night.push({ key: 'nori', text: `焼きのり：型紙を当てて、はさみで${nori.parts.length}個切る${thin}。乾いた容器に入れておく` });
  }
  const seasonings = [...new Set(colored.map((id) => FOODS[id].seasoning))];
  if (seasonings.length) night.push({ key: 'seasoning', text: `${seasonings.join('・')}を出しておく` });

  const morning = [{ key: 'wash', text: '手を洗う。ご飯は炊きたてか、しっかり温め直す' }];
  for (const id of colored) morning.push({ key: `color:${id}`, text: `${FOODS[id].name}：${FOODS[id].howto}` });
  morning.push({ key: 'base', text: `土台：${base.name}${base.grams}gをラップで包み、型紙「ご飯の形」に合わせて たて${cm(base.hMm)}cm・よこ${cm(base.wMm)}cm・厚さ2cmほどに整え、弁当箱に詰める` });
  for (const g of riceGroups) morning.push({ key: `rice:${g.food}`, text: `${g.name}：${g.grams}gをラップで包み、型紙の形に整えて乗せる` });
  if (sheetGroups.length) morning.push({ key: 'sheets', text: `ご飯の粗熱が取れたら、シートを大きいものから乗せる：${sheetGroups.map((g) => g.name).join(' → ')}` });
  if (nori) morning.push({ key: 'nori', text: 'のりは最後に貼る。つきにくいときは、ご飯側をほんの少し湿らせる' });
  morning.push({ key: 'lid', text: '粗熱が取れてからふたをする。暑い日は保冷剤を添える' });

  const tools = ['ラップ', '印刷した型紙', 'キッチンばさみ', 'つまようじ'];
  if (hasCircle) tools.push('ストロー（丸を抜く）');
  if (nori?.parts.some((p) => p.kind === 'circle')) tools.push('海苔パンチ（あれば）');
  if (partCount >= 6) tools.push('ピンセット');
  if (groupMap.has('usuyaki')) tools.push('小さめのフライパン');

  const found = new Map();
  for (const id of usedFoods) {
    for (const a of FOODS[id].allergens) {
      let e = found.get(a.name);
      if (!e) {
        e = { name: a.name, level: a.level, foods: [] };
        found.set(a.name, e);
      }
      if (LEVEL_RANK[a.level] > LEVEL_RANK[e.level]) e.level = a.level;
      e.foods.push(FOODS[id].name);
    }
  }
  const allergens = ALLERGENS.filter((name) => found.has(name)).map((name) => found.get(name));
  const related = [...new Set(usedFoods.flatMap((id) => FOODS[id].related))];

  const cautions = {
    hygiene: HYGIENE,
    allergy: [
      `特定原材料（表示義務のある9品目）のうち、この設計図の食材に含まれることがあるもの：${allergens.length ? allergens.map((a) => allergenLabel(a.name, a.level)).join('・') : 'なし'}`,
      ...(related.length ? [`特定原材料に準ずるもの（表示がすすめられているもの）：${related.join('・')}`] : []),
      '商品によって原材料は違います。必ず包装の表示を確かめてください',
    ],
    privateUse: 'アニメなどのキャラクターは、家庭で作って楽しむ範囲で使ってください。型紙や完成イメージを配ったり売ったりしないでください',
    image: 'えらんだ画像は、この端末の中だけで処理します。どこにも送らず、保存もしません',
  };

  const notices = ['量はすべて目安です'];
  if (partCount > 15 && difficulty !== 'easy') notices.push('パーツが多めです。「かんたん」にすると減ります');
  if (usedFoods.includes('butterfly_rice')) notices.push('バタフライピーが手に入らなければ、色ごとの食材で別の食材に変えてください');

  return {
    box: { ...boxInfo },
    difficulty,
    scale: { mmPerPx },
    charMm: { w: r2(w * mmPerPx), h: r2(h * mmPerPx) },
    base,
    layers,
    groups,
    materials,
    riceTotalG,
    tools,
    steps: { night, morning },
    allergens,
    related,
    cautions,
    notices,
    partCount,
  };
}
