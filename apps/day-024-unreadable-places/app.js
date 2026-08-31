/* 画面。ゲームの中身は lib/ にあり、ここはDOMと入力だけを見る。

   読みを伏せているので、画面に出してよいものと出してはいけないものが分かれる。
   出してよい：漢字・開示ぶんの読み・自分が打ったローマ字。
   出してはいけない：まだ開いていない読み、次に押すべきキー。
   lib/game.js の press() が「押してほしかったキー」を返さないのはそのため。 */

import { createGame, LIVES } from './lib/game.js';
import { maskReading } from './lib/hint.js';
import { BLOCKS, MIN_STOCK } from './lib/blocks.js';

const el = (id) => document.getElementById(id);
const PANELS = ['loading', 'error', 'select', 'play', 'result'];

const ui = {
  progressBar: el('progress-bar'),
  progressText: el('progress-text'),
  errorDetail: el('error-detail'),
  retry: el('retry'),
  blocks: el('blocks'),
  stockNote: el('stock-note'),
  start: el('start'),
  score: el('score'),
  lives: el('lives'),
  where: el('where'),
  target: el('target'),
  kanji: el('kanji'),
  verdict: el('verdict'),
  reading: el('reading'),
  typed: el('typed'),
  keys: el('keys'),
  invalid: el('invalid'),
  giveup: el('giveup'),
  quit: el('quit'),
  resultScore: el('result-score'),
  resultLine: el('result-line'),
  resultDetail: el('result-detail'),
  again: el('again'),
  back: el('back'),
  sourceNote: el('source-note')
};

let data = null;
let chosenId = null;
let game = null;
let raf = 0;
let composing = false;
let invalidTimer = 0;

function show(name) {
  for (const p of PANELS) el(`state-${p}`).hidden = p !== name;
}

/* ---- データの読み込み（状態：読込中・エラー） ---- */

async function load() {
  show('loading');
  ui.progressBar.style.width = '0%';
  try {
    const res = await fetch('./assets/places.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`サーバーが ${res.status} を返しました`);

    const total = Number(res.headers.get('content-length')) || 0;
    let text;
    if (res.body && total > 0) {
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        ui.progressBar.style.width = `${Math.min(100, (got / total) * 100).toFixed(0)}%`;
      }
      text = new TextDecoder().decode(
        chunks.reduce((acc, c) => {
          const merged = new Uint8Array(acc.length + c.length);
          merged.set(acc); merged.set(c, acc.length);
          return merged;
        }, new Uint8Array(0))
      );
    } else {
      text = await res.text();
      ui.progressBar.style.width = '100%';
    }

    data = JSON.parse(text);
    if (!data.places || typeof data.places !== 'object') throw new Error('出題データの形式が違います');
    ui.sourceNote.textContent = `${data.source}（データ更新日 ${data.dataUpdatedAt}）。${data.note}`;
    renderBlocks();
    show('select');
  } catch (e) {
    ui.errorDetail.textContent = `原因：${e.message}`;
    show('error');
  }
}

/* ---- 地方を選ぶ（状態：空を含む） ---- */

function stockOf(id) {
  return (data?.places?.[id] ?? []).length;
}

function renderBlocks() {
  ui.blocks.replaceChildren();
  let usable = 0;

  for (const b of BLOCKS) {
    const count = b.id === 'all'
      ? BLOCKS.filter((x) => x.prefs).reduce((a, x) => a + stockOf(x.id), 0)
      : stockOf(b.id);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'blocks__item';
    btn.dataset.id = b.id;

    const name = document.createElement('span');
    name.className = 'blocks__name';
    name.textContent = b.label;

    const num = document.createElement('span');
    num.className = 'blocks__count';

    if (count < MIN_STOCK) {
      // 状態：空。この地方の在庫が足りない
      btn.disabled = true;
      num.textContent = count === 0 ? '準備中' : `${count}件（不足）`;
      btn.title = `出題に必要な${MIN_STOCK}件に足りません`;
    } else {
      usable += 1;
      num.textContent = `${count}件`;
      btn.addEventListener('click', () => choose(b.id));
    }

    btn.append(name, num);
    ui.blocks.append(btn);
  }

  if (usable === 0) {
    ui.stockNote.textContent = '出題できる地名がありません。データの作り直しが必要です。';
    ui.start.disabled = true;
  } else {
    ui.stockNote.textContent = '地方ごとに出題する地名が変わります。数字はその地方の在庫です。';
  }
}

function choose(id) {
  chosenId = id;
  for (const btn of ui.blocks.querySelectorAll('.blocks__item')) {
    btn.dataset.chosen = String(btn.dataset.id === id);
  }
  ui.start.disabled = false;
}

function placesFor(id) {
  const raw = id === 'all'
    ? BLOCKS.filter((b) => b.prefs).flatMap((b) => data.places[b.id] ?? [])
    : (data.places[id] ?? []);
  return raw
    .map((x) => ({ kanji: x.k, kana: x.r, pref: x.p, city: x.c, difficulty: x.d, why: x.w }))
    .sort((a, b) => a.difficulty - b.difficulty);
}

/* ---- ゲーム ---- */

function startGame() {
  const places = placesFor(chosenId);
  game = createGame({ places });
  game.start(performance.now());
  ui.where.textContent = BLOCKS.find((b) => b.id === chosenId)?.label ?? '';
  ui.verdict.hidden = true;
  hideInvalid();
  show('play');
  ui.keys.value = '';
  ui.keys.focus();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

function loop(now) {
  if (!game) return;
  game.tick(now);
  render();
  if (game.state === 'over') {
    finish();
    return;
  }
  raf = requestAnimationFrame(loop);
}

function render() {
  const t = game.active();
  ui.score.textContent = String(game.score);
  ui.lives.textContent = '●'.repeat(game.lives) + '○'.repeat(Math.max(0, LIVES - game.lives));
  if (!t) return;

  ui.kanji.textContent = t.place.kanji;
  ui.target.style.setProperty('--chars', String(t.place.kanji.length));
  ui.target.style.setProperty('--depth', t.depth.toFixed(3));
  ui.target.dataset.phase = t.phase;

  if (t.phase === 'incoming') {
    ui.reading.textContent = maskReading(t.place.kana, t.revealed);
    ui.reading.dataset.open = String(t.revealed > 0);
    ui.typed.textContent = t.typed;
    ui.verdict.hidden = true;
  } else {
    ui.reading.textContent = t.place.kana;
    ui.reading.dataset.open = 'true';
    ui.typed.textContent = '';
    showVerdict(t);
  }
}

function showVerdict(t) {
  ui.verdict.hidden = false;
  ui.verdict.replaceChildren();
  ui.verdict.dataset.kind = t.phase === 'burst' ? 'cleared' : 'failed';

  const head = document.createElement('p');
  head.className = 'verdict__head';
  head.textContent = t.phase === 'burst'
    ? `+${t.points}点`
    : `${t.place.kanji} は「${t.place.kana}」`;
  ui.verdict.append(head);

  const where = document.createElement('p');
  where.className = 'verdict__where';
  where.textContent = `${t.place.pref}${t.place.city}`;
  ui.verdict.append(where);

  if (t.phase !== 'burst' && Array.isArray(t.place.why)) {
    /* 珍しい当て方から順に2つだけ。ありふれた読み（山＝やま で4,977件など）を混ぜると、
       せっかくの説明が「知っている話」で薄まる */
    const parts = t.place.why
      .filter(([, , count]) => count <= 300)
      .sort((a, b) => a[2] - b[2])
      .slice(0, 2);
    if (parts.length) {
      const why = document.createElement('p');
      why.className = 'verdict__why';
      why.textContent = parts
        .map(([ch, reading, count]) => `「${ch}」を「${reading}」と読む地名は全国で${count}件`)
        .join('。');
      ui.verdict.append(why);
    }
  }
}

function finish() {
  cancelAnimationFrame(raf);
  const t = game.totals;
  ui.resultScore.textContent = String(game.score);
  ui.resultLine.textContent =
    `打ち切った ${t.cleared}件／降参 ${t.surrendered}件／手前まで来られた ${t.hit}件`;

  ui.resultDetail.replaceChildren();

  const missed = game.log.filter((x) => x.reason !== 'cleared').slice(-5);
  if (missed.length) {
    const h = document.createElement('h3');
    h.className = 'result__sub';
    h.textContent = '読めなかった地名';
    const ul = document.createElement('ul');
    ul.className = 'result__list';
    for (const m of missed) {
      const li = document.createElement('li');
      li.textContent = `${m.place.kanji}（${m.place.kana}）${m.place.pref}${m.place.city}`;
      ul.append(li);
    }
    ui.resultDetail.append(h, ul);
  }

  const stumbles = game.stumbles(3);
  if (stumbles.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = `つまずいた打鍵：${stumbles.map((s) => `${s.key}（${s.count}回）`).join('、')}`;
    ui.resultDetail.append(p);
  }

  show('result');
}

/* ---- 入力 ---- */

function showInvalid(message) {
  ui.invalid.hidden = false;
  ui.invalid.textContent = message;
  ui.target.dataset.shake = 'true';
  clearTimeout(invalidTimer);
  invalidTimer = setTimeout(hideInvalid, 900);
}

function hideInvalid() {
  ui.invalid.hidden = true;
  ui.invalid.textContent = '';
  delete ui.target.dataset.shake;
}

function handleKey(raw) {
  if (!game || game.state !== 'running') return;
  const key = raw.toLowerCase();
  if (!/^[a-z-]$/.test(key)) {
    // 状態：不正入力。読みに使わない文字
    showInvalid('ローマ字（英字）で打ってください');
    return;
  }
  const r = game.press(key, performance.now());
  if (r.ignored) return;
  if (!r.ok) {
    // 状態：不正入力。押してほしかったキーはここでは出さない（読みが漏れる）
    showInvalid('その打鍵はこの読みに入っていません');
    return;
  }
  hideInvalid();
}

ui.keys.addEventListener('compositionstart', () => { composing = true; });
ui.keys.addEventListener('compositionend', () => {
  composing = false;
  ui.keys.value = '';
  showInvalid('日本語入力がオンになっています。英数に切り替えてください');
});

ui.keys.addEventListener('keydown', (e) => {
  if (composing || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Tab' || e.key === 'Enter') return;
  if (e.key.length !== 1) return;
  e.preventDefault();
  handleKey(e.key);
});

/* Androidのソフトキーボードは keydown を返さないことがある。
   物理キーは上で preventDefault しているので、ここで二重に数えることはない（Day018と同じ作り） */
ui.keys.addEventListener('beforeinput', (e) => {
  if (composing || e.isComposing) return;
  if (e.inputType !== 'insertText' || !e.data) return;
  e.preventDefault();
  for (const ch of e.data) handleKey(ch);
});

ui.keys.addEventListener('input', () => { ui.keys.value = ''; });

/* 画面のどこを触っても打てる状態に戻す。
   preventDefault が要るのは、押した既定の動作でフォーカスが盤面へ移り、
   直後に入力欄から外れてしまうため（実機で打鍵が1つも入らなかった） */
el('state-play').addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  e.preventDefault();
  ui.keys.focus();
});

/* それでも外れたときの受け皿。打ち始めた時点で入力欄へ戻す */
document.addEventListener('keydown', (e) => {
  if (el('state-play').hidden) return;
  if (document.activeElement === ui.keys) return;
  if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
  ui.keys.focus();
  e.preventDefault();
  handleKey(e.key);
});

/* ---- ボタン ---- */

ui.start.addEventListener('click', startGame);
ui.retry.addEventListener('click', load);
ui.again.addEventListener('click', startGame);
ui.back.addEventListener('click', () => { show('select'); });
ui.giveup.addEventListener('click', () => {
  if (game?.giveUp(performance.now())) ui.keys.focus();
});
ui.quit.addEventListener('click', () => {
  cancelAnimationFrame(raf);
  show('select');
});

load();
