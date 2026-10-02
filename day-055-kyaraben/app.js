// キャラ弁設計図の画面。計算は lib/ の純粋な関数に任せ、ここは入力・再計算のまとめ・表示だけを受け持つ
import { analyze, DIFFICULTY } from './lib/segment.js';
import { buildPlan } from './lib/plan.js';
import { renderTemplates, printHtml, esc } from './lib/template.js';
import { FOODS, FAMILIES, foodOptions, allergenLabel } from './lib/foods.js';
import { drawPreview } from './lib/draw/preview.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const MAX_BYTES = 20 * 1024 * 1024;
// 元の画像はこの長辺まで縮めて持つ（スマホの大きな写真でメモリを食わないように）
const SOURCE_MAX = 1024;
const ERRORS = {
  type: '画像ファイル（PNG・JPEGなど）をえらんでください',
  decode: 'この画像は読み込めませんでした。別の画像で試してください',
  size: '20MBまでの画像にしてください',
  'no-foreground': '絵が見つかりませんでした。背景の消し具合を弱めるか、白い紙に描いた絵で試してください',
};

const state = {
  phase: 'empty',
  source: null,
  pixels: new Map(),
  img: null,
  box: 'school',
  difficulty: 'normal',
  tolerance: 14,
  seeds: [],
  overrides: {},
  analysis: null,
  plan: null,
  templates: [],
  busy: false,
  timer: 0,
  full: false,
  checked: new Set(),
  cursor: null,
};

const cm = (mm) => (Math.round(mm) / 10).toFixed(1);
const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

function setPhase(phase, error = '') {
  state.phase = phase;
  app.dataset.state = phase;
  if (error) app.dataset.error = error;
  else delete app.dataset.error;
  $('error').textContent = error ? ERRORS[error] : '';
  $('status').textContent = phase === 'processing' ? '絵を読み取っています…' : '';
}

// ---- 読み込み ----

async function loadBlob(blob) {
  if (!blob) return;
  const looksImage = blob.type ? blob.type.startsWith('image/') : /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(blob.name || '');
  if (!looksImage) return setPhase('error', 'type');
  if (blob.size > MAX_BYTES) return setPhase('error', 'size');
  const url = URL.createObjectURL(blob);
  try {
    await useImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function useImage(url) {
  setPhase('processing');
  state.busy = true;
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty image');
    const scale = Math.min(1, SOURCE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const g = canvas.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    state.source = canvas;
  } catch {
    state.busy = false;
    setPhase('error', 'decode');
    return;
  }
  state.pixels.clear();
  state.seeds = [];
  state.overrides = {};
  state.checked.clear();
  state.analysis = null;
  // 「読み取っています…」を先に描かせてから、重い計算に入る
  await nextFrame();
  compute(true);
}

function pixelsAt(size) {
  if (state.pixels.has(size)) return state.pixels.get(size);
  const src = state.source;
  const scale = Math.min(1, size / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  state.pixels.set(size, img);
  return img;
}

// ---- 計算 ----

function compute(full) {
  state.timer = 0;
  if (!state.source) {
    state.busy = false;
    return;
  }
  if (full || !state.analysis) {
    const img = pixelsAt(DIFFICULTY[state.difficulty].size);
    state.img = img;
    const bgSeeds = state.seeds.map((p) => ({ x: p.u * img.width, y: p.v * img.height }));
    const a = analyze(img, { difficulty: state.difficulty, tolerance: state.tolerance, bgSeeds, box: state.box });
    if (a.error) {
      state.analysis = null;
      state.plan = null;
      state.templates = [];
      state.busy = false;
      setPhase('error', a.error);
      renderSource();
      renderUndo();
      return;
    }
    state.analysis = a;
  }
  // 層の番号は計算し直すたびに変わりうるので、選んだ食材は色の系統で覚えておき、ここで番号に直す
  const overrides = {};
  for (const layer of state.analysis.layers) if (state.overrides[layer.family]) overrides[layer.id] = state.overrides[layer.family];
  state.plan = buildPlan(state.analysis, { box: state.box, difficulty: state.difficulty, overrides });
  state.templates = renderTemplates(state.plan, state.analysis);
  const first = state.phase === 'processing';
  setPhase('ready');
  render();
  if (first) $('status').textContent = '設計図ができました。材料と手順は「3 作る」にあります';
  state.busy = false;
}

// 設定を続けて動かしたときに毎回計算しないよう、150ms まとめてから計算し直す
function schedule(full) {
  state.busy = true;
  state.full = state.full || full;
  clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    const f = state.full;
    state.full = false;
    compute(f);
  }, 150);
}

// ---- 表示 ----

function render() {
  const { plan } = state;
  renderSource();
  renderUndo();
  drawPreview($('preview'), plan);
  const parts = plan.groups.map((g) => g.name).join('・');
  $('preview').setAttribute('aria-label', `完成イメージ：${plan.box.name}の弁当箱に${plan.base.name}の土台${parts ? `、${parts}` : ''}`);
  $('char-size').textContent = `キャラの大きさ：たて${cm(plan.charMm.h)}cm・よこ${cm(plan.charMm.w)}cm`;
  renderLayers();
  renderMaterials();
  $('tools').innerHTML = plan.tools.map((t) => `<li>${esc(t)}</li>`).join('');
  renderSteps();
  $('templates').innerHTML = state.templates.map((t) => `<figure class="tpl"><div class="tpl__paper">${t.svg}</div><figcaption>${esc(t.title)}</figcaption></figure>`).join('');
  $('hygiene').innerHTML = plan.cautions.hygiene.map((t) => `<li>${esc(t)}</li>`).join('');
  $('allergy').innerHTML = plan.cautions.allergy.map((t) => `<li>${esc(t)}</li>`).join('');
  $('private-use').textContent = plan.cautions.privateUse;
  $('notices').innerHTML = plan.notices.map((t) => `<li>${esc(t)}</li>`).join('');
  $('print-root').innerHTML = printHtml(plan, state.templates);
}

function renderSource() {
  const canvas = $('source');
  const img = state.img;
  if (!img) return;
  canvas.width = img.width;
  canvas.height = img.height;
  const g = canvas.getContext('2d');
  const out = g.createImageData(img.width, img.height);
  const a = state.analysis;
  if (a) {
    const { x: bx, y: by, w, h } = a.bbox;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!a.labels[y * w + x]) continue;
        const si = ((by + y) * img.width + bx + x) * 4;
        out.data[si] = img.data[si];
        out.data[si + 1] = img.data[si + 1];
        out.data[si + 2] = img.data[si + 2];
        out.data[si + 3] = 255;
      }
    }
  }
  g.putImageData(out, 0, 0);
  if (state.cursor) {
    const x = state.cursor.u * img.width;
    const y = state.cursor.v * img.height;
    const r = Math.max(6, img.width / 24);
    g.lineWidth = Math.max(2, img.width / 128);
    for (const [color, width] of [['#FFFFFF', g.lineWidth * 2.2], ['#C8331F', g.lineWidth]]) {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.moveTo(x - r * 1.6, y);
      g.lineTo(x + r * 1.6, y);
      g.moveTo(x, y - r * 1.6);
      g.lineTo(x, y + r * 1.6);
      g.stroke();
    }
  }
}

function renderUndo() {
  $('undo').disabled = state.seeds.length === 0;
}

function renderLayers() {
  const focused = document.activeElement?.dataset?.family;
  $('layers').innerHTML = state.plan.layers
    .map((layer) => {
      const { same, other } = foodOptions(layer.family, layer.isBase);
      const opt = (id) => `<option value="${id}"${id === layer.food ? ' selected' : ''}>${esc(FOODS[id].name)}</option>`;
      const group = (label, ids) => (ids.length ? `<optgroup label="${label}">${ids.map(opt).join('')}</optgroup>` : '');
      const none = layer.isBase ? '' : `<option value="none"${layer.food === 'none' ? ' selected' : ''}>使わない（ご飯のまま）</option>`;
      const fam = FAMILIES[layer.family].name;
      const label = layer.isBase ? `土台（${fam}）` : fam;
      const detail = layer.isBase ? 'ご飯の形' : layer.dissolved ? 'ご飯のまま' : `${layer.parts.length}個`;
      return (
        `<li class="layer"><span class="swatch" style="background:${layer.colorHex}" aria-hidden="true"></span>` +
        `<label class="layer__name" for="food-${layer.family}">${esc(label)}<small>${esc(detail)}</small></label>` +
        `<select id="food-${layer.family}" data-family="${layer.family}">${group('同じ色の候補', same)}${group('ほかの食材', other)}${none}</select></li>`
      );
    })
    .join('');
  if (focused) $(`food-${focused}`)?.focus();
}

function allergenTags(list) {
  return list.map((a) => `<span class="tag tag--${a.level}">${esc(allergenLabel(a.name, a.level))}</span>`).join('');
}

function renderMaterials() {
  const { plan } = state;
  $('materials').innerHTML = plan.materials
    .map((m) => `<li><span class="mat__name">${esc(m.name)}</span><span class="mat__amount">${esc(m.amount)}</span>${allergenTags(m.allergens)}${m.note ? `<small class="mat__note">${esc(m.note)}</small>` : ''}</li>`)
    .join('');
  $('rice-total').textContent = `ご飯の合計 ${plan.riceTotalG}g`;
}

function renderSteps() {
  const item = (part) => (s) => {
    const key = `${part}:${s.key}`;
    return `<li><label class="check"><input type="checkbox" data-key="${esc(key)}"${state.checked.has(key) ? ' checked' : ''}><span>${esc(s.text)}</span></label></li>`;
  };
  $('night').innerHTML = state.plan.steps.night.map(item('night')).join('');
  $('morning').innerHTML = state.plan.steps.morning.map(item('morning')).join('');
}

function shoppingText() {
  const { plan } = state;
  const lines = plan.materials.map((m) => {
    const tags = m.allergens.length ? `（${m.allergens.map((a) => allergenLabel(a.name, a.level)).join('・')}）` : '';
    return `・${m.name} ${m.amount}${tags}${m.note ? ` ※${m.note}` : ''}`;
  });
  return ['キャラ弁の買い物メモ（量は目安）', ...lines, `・ご飯の合計 ${plan.riceTotalG}g`, '', `道具：${plan.tools.join('・')}`].join('\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http で開いたときや古い Safari では clipboard API が使えないので、選択してコピーする
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

// ---- 読み取った絵をタップして消す ----

function say(text) {
  $('source-said').textContent = text;
}

function eraseAt(u, v) {
  const a = state.analysis;
  const img = state.img;
  if (!a || !img) return;
  const x = Math.floor(u * img.width) - a.bbox.x;
  const y = Math.floor(v * img.height) - a.bbox.y;
  if (x < 0 || y < 0 || x >= a.width || y >= a.height || !a.labels[y * a.width + x]) {
    say('そこは、もう背景になっています');
    return;
  }
  state.seeds.push({ u, v });
  renderUndo();
  say('タップした所を背景にしました');
  schedule(true);
}

// ---- つなぎこみ ----

function bind() {
  $('file').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) loadBlob(file);
  });
  $('sample-neko').addEventListener('click', () => useImage('assets/samples/neko.png'));
  $('sample-kodomo').addEventListener('click', () => useImage('assets/samples/kodomo.png'));

  const drop = $('drop');
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  for (const type of ['dragenter', 'dragover']) {
    document.addEventListener(type, (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      drop.classList.add('is-over');
    });
  }
  document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget) drop.classList.remove('is-over');
  });
  document.addEventListener('drop', (e) => {
    drop.classList.remove('is-over');
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    loadBlob(file);
  });
  document.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === 'file');
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    loadBlob(file);
  });

  const source = $('source');
  source.addEventListener('click', (e) => {
    const r = source.getBoundingClientRect();
    eraseAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  });
  source.addEventListener('focus', () => {
    if (!source.matches(':focus-visible')) return;
    state.cursor ??= { u: 0.5, v: 0.5 };
    renderSource();
  });
  source.addEventListener('blur', () => {
    state.cursor = null;
    renderSource();
  });
  source.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.03;
    const c = state.cursor ?? { u: 0.5, v: 0.5 };
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      eraseAt(c.u, c.v);
      return;
    }
    if (!moves[e.key]) return;
    e.preventDefault();
    c.u = Math.min(0.999, Math.max(0, c.u + moves[e.key][0]));
    c.v = Math.min(0.999, Math.max(0, c.v + moves[e.key][1]));
    state.cursor = c;
    renderSource();
  });
  $('undo').addEventListener('click', () => {
    state.seeds.pop();
    renderUndo();
    say('ひとつ前に戻しました');
    schedule(true);
  });

  $('tolerance').addEventListener('input', (e) => {
    state.tolerance = Number(e.target.value);
    $('tolerance-out').textContent = e.target.value;
    schedule(true);
  });
  for (const input of document.querySelectorAll('input[name="box"]')) {
    input.addEventListener('change', () => {
      state.box = input.value;
      schedule(true);
    });
  }
  for (const input of document.querySelectorAll('input[name="difficulty"]')) {
    input.addEventListener('change', () => {
      state.difficulty = input.value;
      schedule(true);
    });
  }
  $('layers').addEventListener('change', (e) => {
    const family = e.target.dataset.family;
    if (!family) return;
    state.overrides[family] = e.target.value;
    schedule(false);
  });
  for (const id of ['night', 'morning']) {
    $(id).addEventListener('change', (e) => {
      const key = e.target.dataset.key;
      if (!key) return;
      if (e.target.checked) state.checked.add(key);
      else state.checked.delete(key);
    });
  }
  $('copy-memo').addEventListener('click', async () => {
    if (!state.plan) return;
    const ok = await copyText(shoppingText());
    $('copy-said').textContent = ok ? 'コピーしました' : 'コピーできませんでした。材料の一覧を選んでコピーしてください';
  });
  $('print').addEventListener('click', () => window.print());

  // 画面の幅が変わったら、完成イメージを描き直す（にじまないように）
  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (state.plan && state.phase === 'ready') drawPreview($('preview'), state.plan);
    }, 100);
  }).observe($('adjust'));
}

// E2E 用の窓口。画面の状態を数字で読めるようにする
window.__kyaraben = {
  snapshot() {
    const p = state.plan;
    return {
      state: state.phase,
      busy: state.busy,
      box: state.box,
      difficulty: state.difficulty,
      tolerance: state.tolerance,
      seeds: state.seeds.length,
      layers: p ? p.layers.map((l) => ({ id: l.id, family: l.family, food: l.food, areaMm2: Math.round(l.areaMm2 * 10) / 10, parts: l.parts.length })) : [],
      parts: p ? p.partCount : 0,
      materials: p ? p.materials.map((m) => ({ food: m.food, amount: m.amount })) : [],
      riceG: p ? p.riceTotalG : 0,
      steps: { night: p ? p.steps.night.length : 0, morning: p ? p.steps.morning.length : 0 },
      allergens: p ? p.allergens.map((a) => a.name) : [],
      templates: state.templates.map((t) => ({ key: t.key, widthMm: t.widthMm, heightMm: t.heightMm })),
      charMm: p ? p.charMm : null,
    };
  },
  // 指定した色の層の、いちばん大きい島の内側の点（読み取った絵の上での割合）
  pointOf(family) {
    const p = state.plan;
    const a = state.analysis;
    const layer = p?.layers.find((l) => l.family === family);
    if (!layer) return null;
    let pt = layer.parts.reduce((best, part) => (!best || part.areaMm2 > best.areaMm2 ? part : best), null)?.labelPt;
    if (!pt) {
      const i = a.labels.indexOf(layer.id);
      pt = [(i % a.width) + 0.5, Math.floor(i / a.width) + 0.5];
    }
    return { x: (a.bbox.x + pt[0]) / a.source.width, y: (a.bbox.y + pt[1]) / a.source.height };
  },
};

bind();
document.documentElement.dataset.ready = 'true';
