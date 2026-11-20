import { BLOCK_SCHEMA, DEVICES, STAGE_LABEL } from './contract.js';
import { renderPage } from './render.js';
import { PAGE_CSS } from './page-css.js';
import { stageMark } from './ui-goal.js';

export function flowMeter(stages) {
  return stages.map(({ key, count }) => ({
    key, label: STAGE_LABEL[key], count, amount: count ? count + '個' : 'なし',
    description: STAGE_LABEL[key] + ' ' + count + '個',
  }));
}

export const previewScale = (available, width) => Math.min(1, available / width);

export function previewScrollDelta(view, block, part = block, tapOffset) {
  const height = view.bottom - view.top;
  if (height <= 0) return 0;
  const gap = Math.min(12, height / 4);
  const top = view.top + gap;
  const bottom = view.bottom - gap;
  const room = bottom - top;
  let target = block.bottom - block.top <= room ? block : part;
  // 長い文章や部品の余白を押したときは、先頭へ飛ぶと押した箇所を見失う。
  if (target.bottom - target.top > room && Number.isFinite(tapOffset)) {
    const y = Math.min(target.bottom, Math.max(target.top, target.top + tapOffset));
    const margin = Math.min(24, room / 2);
    target = { top: Math.max(target.top, y - margin), bottom: Math.min(target.bottom, y + margin) };
  }
  if (target.top < top) return target.top - top;
  return Math.max(0, Math.min(target.bottom, target.top + room) - bottom);
}

export function installPageStyle(doc) {
  if (doc.getElementById('ed-page-style')) return;
  const style = doc.createElement('style');
  style.id = 'ed-page-style';
  style.textContent = PAGE_CSS;
  doc.head.append(style);
}

export function mountPreview(root, ctx) {
  installPageStyle(root.ownerDocument);
  const page = root.querySelector('[data-page]');
  const frame = root.querySelector('[data-frame]');
  const paperSpace = page.parentElement;
  const scroll = root.querySelector('.ed-preview-scroll');
  const score = root.querySelector('[data-score]');
  const scaleNote = root.querySelector('[data-scale-note]');
  const meter = root.querySelector('.ed-meter');
  const devices = [...root.querySelectorAll('button[data-device]')];
  const twoColumns = matchMedia('(min-width: 720px)');
  let width;
  let lastState;
  let lastCounts;
  let paused = false;
  let pickingInPage = false;
  let tap = null;
  let viewportHeight = scroll.clientHeight;
  let blocks = new Map();
  const tag = document.createElement('span');
  tag.className = 'ed-block-tag';
  tag.setAttribute('aria-hidden', 'true');

  function fit() {
    if (!paperSpace.clientWidth || !width) return;
    const scale = previewScale(paperSpace.clientWidth, width);
    page.style.setProperty('--ed-preview-scale', String(scale));
    // 数%の縮みでは案内を出さない（スマホ枠が少し縮むだけで毎回出ると、ただの雑音になる）。パソコン表示の縮小が対象。
    scaleNote.hidden = scale >= 0.9;
  }
  const observer = new ResizeObserver(() => {
    fit();
    const height = scroll.clientHeight;
    // パネルが伸びる間も、狭くなった分だけプレビューを送る。
    if (height > 0 && height < viewportHeight && !twoColumns.matches && ctx.isMobilePanelOpen()) {
      revealBlock(ctx.getSelectedId());
    }
    viewportHeight = height;
  });
  observer.observe(paperSpace);
  observer.observe(scroll);

  function drawFlow(diagnosis) {
    score.textContent = '診断 ' + diagnosis.score + '点';
    const counts = diagnosis.stages.map(stage => stage.count).join(',');
    if (counts === lastCounts) return;
    lastCounts = counts;
    meter.replaceChildren(...flowMeter(diagnosis.stages).map(({ key, label, count, amount, description }) => {
      const item = document.createElement('li');
      item.className = 'ed-meter-step';
      item.classList.toggle('is-missing', count === 0);
      item.title = description;
      item.setAttribute('aria-label', description);
      const mark = stageMark(key);
      mark.removeAttribute('title');
      mark.setAttribute('aria-hidden', 'true');
      const compactCount = document.createElement('span');
      compactCount.className = 'ed-meter-count';
      compactCount.textContent = count;
      mark.append(compactCount);
      const text = document.createElement('span');
      text.className = 'ed-meter-label';
      text.setAttribute('aria-hidden', 'true');
      const number = document.createElement('small');
      number.textContent = amount;
      text.append(label, number);
      item.append(mark, text);
      return item;
    }));
  }

  function applyDevice() {
    if (paused) return;
    const key = ctx.getDevice();
    const device = DEVICES.find(item => item.key === key);
    if (device.width === width) return;
    width = device.width;
    frame.dataset.device = key;
    frame.style.setProperty('--ed-paper-width', width + 'px');
    for (const button of devices) button.setAttribute('aria-pressed', String(button.dataset.device === key));
    fit();
  }

  function rememberFocus() {
    const active = root.ownerDocument.activeElement;
    if (!page.contains(active)) return null;
    const block = active.closest('[data-block-id]');
    const summary = active.closest('summary');
    return {
      id: block?.dataset.blockId, path: active.closest('[data-path]')?.dataset.path,
      // 質問の文章にだけ編集用の印があり、Tabが止まるsummary自体には付かない。
      question: summary && block ? [...block.querySelectorAll('summary')].indexOf(summary) : -1,
      range: typeof active.selectionStart === 'number'
        ? [active.selectionStart, active.selectionEnd, active.selectionDirection] : null,
    };
  }

  function restoreFocus(saved) {
    if (!saved) return;
    const block = blocks.get(saved.id);
    const scope = saved.id ? block : page;
    const field = saved.path && [...(scope?.querySelectorAll('[data-path]') ?? [])].find(el => el.dataset.path === saved.path);
    const control = field && field.closest('a, button, input, textarea, select, summary, [tabindex]');
    const summary = saved.question >= 0 ? block?.querySelectorAll('summary')[saved.question] : null;
    const target = control || summary || block || scroll;
    target.focus({ preventScroll: true });
    if (saved.range && typeof target.selectionStart === 'number') target.setSelectionRange(...saved.range);
  }

  function markSelected(id) {
    const next = blocks.get(id) ?? null;
    const previous = tag.parentElement;
    if (previous === next) return;
    previous?.classList.remove('is-selected');
    tag.remove();
    if (next) {
      next.classList.add('is-selected');
      tag.textContent = next.dataset.blockLabel;
      next.append(tag);
    }
  }

  function render({ state, selectedId, diagnosis, reason, action }) {
    if (paused) return;
    applyDevice();
    if (state === lastState) {
      markSelected(selectedId);
      return;
    }
    const freshPage = reason === 'load' || action?.type === 'setGoal' || action?.type === 'replace';
    const y = freshPage ? 0 : scroll.scrollTop;
    const x = scroll.scrollLeft;
    const focused = rememberFocus();
    page.innerHTML = renderPage(state, { mode: 'preview' });
    tap = null;
    blocks = new Map([...page.querySelectorAll('[data-block-id]')].map(node => [node.dataset.blockId, node]));
    for (const block of state.blocks) {
      const node = blocks.get(block.id);
      if (!node) continue;
      node.dataset.blockLabel = BLOCK_SCHEMA[block.type].label;
      node.tabIndex = 0;
      node.setAttribute('aria-label', BLOCK_SCHEMA[block.type].label);
    }
    const brand = page.querySelector('[data-path="site.name"]');
    if (brand) { brand.tabIndex = 0; brand.setAttribute('role', 'button'); }
    markSelected(selectedId);
    restoreFocus(focused);
    drawFlow(diagnosis);
    fit();
    scroll.scrollTop = y;
    scroll.scrollLeft = x;
    lastState = state;
  }

  function revealBlock(id) {
    const part = tap && tap.id === id ? tap.node : null;
    const block = blocks.get(id) ?? part;
    if (!block) return;
    const bounds = block.getBoundingClientRect();
    const taggedBounds = tag.parentElement === block ? { top: tag.getBoundingClientRect().top, bottom: bounds.bottom } : bounds;
    const delta = previewScrollDelta(scroll.getBoundingClientRect(), taggedBounds,
      part?.getBoundingClientRect(), part ? tap.offset : undefined);
    if (delta) scroll.scrollTop += delta;
  }
  function scrollToBlock(id) {
    if (pickingInPage) return;
    tap = null;
    revealBlock(id);
  }
  function pick(id, options, node, clientY) {
    tap = { id, node, offset: Number.isFinite(clientY) ? clientY - node.getBoundingClientRect().top : undefined };
    pickingInPage = true;
    try { ctx.select(id, options); }
    finally { pickingInPage = false; }
    if (!twoColumns.matches) revealBlock(id);
  }

  function click(event) {
    const target = event.target;
    if (page.contains(target)) {
      if (target.closest('a, summary')) event.preventDefault();
      const field = target.closest('[data-path]');
      const path = field?.dataset.path;
      const clientY = event.detail ? event.clientY : undefined;
      if (path === 'site.name') pick(null, { path, tab: 'look' }, field, clientY);
      else {
        const block = target.closest('[data-block-id]');
        if (block) pick(block.dataset.blockId, path ? { path } : undefined, field ?? block, clientY);
      }
    } else if (score.contains(target)) {
      ctx.setTab('diagnosis');
    } else {
      const device = target.closest('button[data-device]');
      if (device) ctx.setDevice(device.dataset.device);
    }
  }
  function keydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const node = event.target;
    if (!node.matches('[data-block-id], [data-path="site.name"]')) return;
    event.preventDefault();
    if (node.dataset.path === 'site.name') pick(null, { path: 'site.name', tab: 'look' }, node);
    else pick(node.dataset.blockId, undefined, node);
  }
  const stopSubmit = event => event.preventDefault();
  root.addEventListener('click', click);
  page.addEventListener('keydown', keydown);
  page.addEventListener('submit', stopSubmit);
  const unsubscribe = ctx.subscribe(render);
  return {
    scrollToBlock,
    pause() {
      // 見るだけ画面と編集画面に、同じページ内リンクの行き先を二つ作らない。
      paused = true;
      tap = null;
      markSelected(null);
      page.replaceChildren();
      blocks.clear();
      lastState = null;
    },
    resume() {
      if (!paused) return;
      paused = false;
      render({ state: ctx.getState(), selectedId: ctx.getSelectedId(), diagnosis: ctx.diagnose(), reason: 'load' });
    },
    destroy() {
      unsubscribe();
      observer.disconnect();
      root.removeEventListener('click', click);
      page.removeEventListener('keydown', keydown);
      page.removeEventListener('submit', stopSubmit);
    },
  };
}
