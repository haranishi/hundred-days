import { BLOCK_SCHEMA, DEVICES, STAGE_LABEL } from './contract.js';
import { renderPage } from './render.js';
import { PAGE_CSS } from './page-css.js';
import { stageMark } from './ui-goal.js';

export function flowMeter(stages) {
  return stages.map(({ key, count }) => ({
    key, label: STAGE_LABEL[key], count, amount: count ? count + '個' : 'なし',
  }));
}

export const previewScale = (available, width) => Math.min(1, available / width);

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
  const meter = root.querySelector('.ed-meter');
  const devices = [...root.querySelectorAll('[data-device]')];
  let width;
  let lastState;
  let lastCounts;
  let lastSelected;
  let paused = false;
  let pickingInPage = false;
  let blocks = new Map();
  const tag = document.createElement('span');
  tag.className = 'ed-block-tag';
  tag.setAttribute('aria-hidden', 'true');

  function fit() {
    if (paperSpace.clientWidth && width) {
      page.style.zoom = String(previewScale(paperSpace.clientWidth, width));
    }
  }
  const observer = new ResizeObserver(fit);
  observer.observe(paperSpace);

  function drawFlow(diagnosis) {
    score.textContent = '診断 ' + diagnosis.score + '点';
    const counts = diagnosis.stages.map(stage => stage.count).join(',');
    if (counts === lastCounts) return;
    lastCounts = counts;
    meter.replaceChildren(...flowMeter(diagnosis.stages).map(({ key, label, count, amount }) => {
      const item = document.createElement('li');
      item.className = 'ed-meter-step';
      item.classList.toggle('is-missing', count === 0);
      const mark = stageMark(key);
      mark.setAttribute('aria-hidden', 'true');
      const text = document.createElement('span');
      text.className = 'ed-meter-label';
      const number = document.createElement('small');
      number.textContent = amount;
      text.append(label, number);
      item.append(mark, text);
      return item;
    }));
  }

  function render({ state, selectedId, diagnosis, reason, action }) {
    if (paused) return;
    const device = DEVICES.find(item => item.key === ctx.getDevice());
    if (device.width !== width) {
      width = device.width;
      frame.dataset.device = device.key;
      frame.style.setProperty('--ed-paper-width', width + 'px');
      for (const button of devices) button.setAttribute('aria-pressed', String(button.dataset.device === device.key));
      fit();
    }
    if (state !== lastState) {
      const freshPage = reason === 'load' || action?.type === 'setGoal' || action?.type === 'replace';
      const y = freshPage ? 0 : scroll.scrollTop;
      const x = scroll.scrollLeft;
      const active = root.ownerDocument.activeElement;
      const focused = page.contains(active);
      const focusId = active?.closest('[data-block-id]')?.dataset.blockId;
      const focusPath = active?.closest('[data-path]')?.dataset.path;
      page.innerHTML = renderPage(state, { mode: 'preview' });
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
      if (focused) {
        const node = blocks.get(focusId) ?? page;
        const target = focusPath && [...node.querySelectorAll('[data-path]')].find(el => el.dataset.path === focusPath);
        const fallback = blocks.get(focusId) ?? scroll;
        (target?.matches('a,button,summary,[tabindex]') ? target : fallback).focus({ preventScroll: true });
      }
      drawFlow(diagnosis);
      fit();
      scroll.scrollTop = y;
      scroll.scrollLeft = x;
      lastState = state;
      lastSelected = null;
    }
    if (lastSelected !== selectedId) {
      blocks.get(lastSelected)?.classList.remove('is-selected');
      tag.remove();
      const selected = blocks.get(selectedId);
      if (selected) {
        selected.classList.add('is-selected');
        tag.textContent = selected.dataset.blockLabel;
        selected.append(tag);
      }
      lastSelected = selectedId;
    }
  }

  function scrollToBlock(id) {
    const block = blocks.get(id);
    if (!block || pickingInPage) return;
    const viewport = scroll.getBoundingClientRect();
    const rect = block.getBoundingClientRect();
    if (rect.top < viewport.top || rect.top + Math.min(rect.height, 64) > viewport.bottom) {
      scroll.scrollTop += rect.top - viewport.top - 12;
    }
  }
  function pick(id, options) {
    // 長い部品の途中にある文章を押したときも、その文章を目の前に残す。
    pickingInPage = true;
    try { ctx.select(id, options); }
    finally { pickingInPage = false; }
  }

  function click(event) {
    const target = event.target;
    if (page.contains(target)) {
      if (target.closest('a, summary')) event.preventDefault();
      const path = target.closest('[data-path]')?.dataset.path;
      if (path === 'site.name') pick(null, { path, tab: 'look' });
      else {
        const block = target.closest('[data-block-id]');
        if (block) pick(block.dataset.blockId, path ? { path } : undefined);
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
    if (node.dataset.path === 'site.name') pick(null, { path: 'site.name', tab: 'look' });
    else pick(node.dataset.blockId);
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
