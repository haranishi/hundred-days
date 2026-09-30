// 障子の盤。マスは一度だけ作り、render() で状態の印（class）だけを付け替える
// v2：空いた辻（is-aki）は朱の点線で内側を縁取る（確定したら外す）。最初から書いてある字（is-given）は墨のまま
import { h } from './dom.js';

export function wordCells(w) {
  const out = [];
  for (let i = 0; i < w.length; i++) out.push(w.dir === 'across' ? { x: w.x + i, y: w.y } : { x: w.x, y: w.y + i });
  return out;
}

const FRAME = 5; // 木の枠の太さ（app.css の --frame と同じ）
const MAX_CELL = 62;

export function createBoard(puzzle, { onCell } = {}) {
  const { width: W, height: H, grid, numbers } = puzzle;
  const el = h('div', { class: 'board', role: 'group', 'aria-label': `盤（${W}×${H}）` });
  el.style.setProperty('--cols', String(W));
  el.style.setProperty('--rows', String(H));
  const cells = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) {
      if (!grid[y][x]) {
        el.append(h('div', { class: 'cell is-blank', 'aria-hidden': 'true', style: { gridArea: `${y + 1} / ${x + 1}` } }));
        row.push(null);
        continue;
      }
      const ch = h('span', { class: 'ch' });
      const n = numbers[y][x];
      const c = h('div', { class: 'cell', 'data-x': x, 'data-y': y, style: { gridArea: `${y + 1} / ${x + 1}` } }, n ? h('span', { class: 'num' }, n) : null, ch);
      el.append(c);
      row.push({ el: c, ch });
    }
    cells.push(row);
  }

  // いまの問の外周を囲む藍の線（マスは位置を指定して置いてあるので、上に重ねても並びは崩れない）
  const frame = h('div', { class: 'word-frame', 'aria-hidden': 'true', hidden: true });
  el.append(frame);

  el.addEventListener('click', (e) => {
    const c = e.target.closest('.cell[data-x]');
    if (c) onCell?.(Number(c.dataset.x), Number(c.dataset.y));
  });
  // 盤を押しても焦点を奪わない（スペースや Enter を盤の操作に使うため）
  el.addEventListener('mousedown', (e) => e.preventDefault());

  function render(game, { cursor = true } = {}) {
    const cur = game.currentWord();
    frame.hidden = !cur;
    if (cur) {
      frame.style.gridColumn = cur.dir === 'across' ? `${cur.x + 1} / span ${cur.length}` : `${cur.x + 1}`;
      frame.style.gridRow = cur.dir === 'across' ? `${cur.y + 1}` : `${cur.y + 1} / span ${cur.length}`;
    }
    const inWord = new Set();
    if (cur) for (const { x, y } of wordCells(cur)) inWord.add(y * W + x);
    const solved = new Set();
    for (const w of puzzle.words) if (game.solved.has(w.id)) for (const { x, y } of wordCells(w)) solved.add(y * W + x);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = cells[y][x];
        if (!c) continue;
        const k = y * W + x;
        const v = game.entries[y][x];
        if (c.ch.textContent !== v) c.ch.textContent = v;
        const cl = c.el.classList;
        const aki = game.isBlank ? game.isBlank(x, y) : false;
        cl.toggle('is-aki', aki);
        cl.toggle('is-given', game.isGiven ? game.isGiven(x, y) : false);
        cl.toggle('is-locked', aki && Boolean(game.locked[y][x]));
        cl.toggle('is-word', inWord.has(k));
        cl.toggle('is-cur', cursor && game.cursor.x === x && game.cursor.y === y);
        cl.toggle('is-solved', solved.has(k));
        cl.toggle('is-revealed', Boolean(game.revealed[y][x]));
        cl.toggle('is-wrong', Boolean(game.wrong[y][x]));
      }
    }
  }

  // 幅に収まる大きさと、残りの高さに収まる大きさの小さいほう。戻り値は下限（16px）で切る前のマスの大きさ。
  // 木の枠の太さは CSS（--frame。背の低い画面は細い）から読み、マスが26px未満ならすき間を1pxにして計算する
  function fit(availW, availH) {
    if (!(availW > 0 && availH > 0)) return 0;
    const frame = parseFloat(getComputedStyle(el).borderTopWidth) || FRAME;
    const sizeAt = (g) => Math.floor(Math.min((availW - frame * 2 - g * (W - 1)) / W, (availH - frame * 2 - g * (H - 1)) / H));
    let gap = 2;
    let size = sizeAt(gap);
    if (size < 26) {
      gap = 1;
      size = sizeAt(gap);
    }
    const cell = Math.max(16, Math.min(MAX_CELL, size));
    el.style.setProperty('--cell', `${cell}px`);
    el.style.setProperty('--gap', `${gap}px`);
    return size;
  }

  function dye(list) {
    list.forEach(({ x, y }, i) => {
      const c = cells[y]?.[x];
      if (!c) return;
      c.el.style.setProperty('--d', `${i * 40}ms`);
      c.el.classList.remove('dye');
      void c.el.offsetWidth;
      c.el.classList.add('dye');
      setTimeout(() => c.el.classList.remove('dye'), i * 40 + 600);
    });
  }

  function shake(list) {
    for (const { x, y } of list) {
      const c = cells[y]?.[x];
      if (!c) continue;
      c.el.classList.remove('shake');
      void c.el.offsetWidth;
      c.el.classList.add('shake');
      setTimeout(() => c.el.classList.remove('shake'), 320);
    }
  }

  // 空き辻を朱で短く光らせる（書いてある字を押したときに、埋める所を知らせる）
  function flash(list) {
    for (const { x, y } of list) {
      const c = cells[y]?.[x];
      if (!c) continue;
      c.el.classList.remove('flash');
      void c.el.offsetWidth;
      c.el.classList.add('flash');
      setTimeout(() => c.el.classList.remove('flash'), 1300);
    }
  }

  return { el, render, fit, dye, shake, flash };
}
