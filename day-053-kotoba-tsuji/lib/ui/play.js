// 対局の画面。状態は lib/game.js の Game が持ち、ここは返ってきたイベントで音・動き・台詞を出す
import { h, fuda, senko } from './dom.js';
import { TEXT, pick, fill } from './copy.js';
import { RomajiBuffer, normalizeAnswer, BOARD_COLUMNS, toggleDakuten, toggleHandakuten } from '../kana.js';
import { getLevel } from '../levels.js';
import { createBoard, wordCells } from './board.js';
import { createKeypad } from './keypad.js';
import { openDialog, isDialogOpen } from './dialog.js';
import { phrased } from './wrap.js';

export function fmtClock(ms) {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = String(total % 60).padStart(2, '0');
  return hh ? `${hh}:${String(mm).padStart(2, '0')}:${ss}` : `${mm}:${ss}`;
}

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

// 「゛」か「゜」をまだ付けられる字（か・さ・た・は行の清音と、゜を付けられる ば行）
const VOICED = new Set();
const HALF = new Set();
for (const col of BOARD_COLUMNS) {
  for (const base of col) {
    if (!base) continue;
    const d = toggleDakuten(base);
    if (d && d !== base) VOICED.add(d);
    const p = toggleHandakuten(base);
    if (p && p !== base) HALF.add(p);
  }
}
export function canTakeMark(ch) {
  if (!ch || HALF.has(ch)) return false;
  if (!VOICED.has(ch) && toggleDakuten(ch)) return true;
  return Boolean(toggleHandakuten(ch));
}
// 濁る字で終わる言葉の「惜しい」を待つ時間。この間に「゛」を押せば叱られない
const WRONG_DELAY = 1000;
// 問の帯を2段とも全文（各段2行まで）にしたとき、盤のマスがこれを下回る画面だけ、下の段を1行に詰める
// （v2-r3：390×660 の免許皆伝でもマス24pxを保つ。11段の盤は 375×667・390×660 で下の段が1行になる）
const MIN_ROOMY_CELL = 24;

export function mountPlay(app, { game, puzzle, levelId, seed, source = 'new', review = null, duel = null }) {
  const lv = getLevel(levelId);
  const reviewing = Boolean(review);
  const byId = new Map(puzzle.words.map((w) => [w.id, w]));
  // v2：埋める空き（行優先）と、空きを含む言葉。空きの無い言葉は一覧で薄く出し、藍にもしない
  const holes = [];
  for (let y = 0; y < puzzle.height; y++) for (let x = 0; x < puzzle.width; x++) if (game.isBlank(x, y)) holes.push({ x, y });
  const blankWords = new Set(puzzle.words.filter((w) => game.blanksOf(w.id).length > 0).map((w) => w.id));
  const romaji = new RomajiBuffer();
  let scoldTimer = 0;
  let shownLeft = game.progress().left;
  let finished = reviewing || game.isComplete();
  let coachOn = false;
  let listOpen = false;

  const el = h('section', { class: `screen screen-play${reviewing ? ' is-review' : ''}`, 'data-screen': 'play', tabindex: '-1', 'aria-label': '対局' });

  // ---- 見出し帯：退く ／ 一人前・埋める字5 ／ 残り 3字 ／ 線香の印＋3:12 ----
  const timeEl = h('span', { class: 'time-val' }, fmtClock(game.elapsedMs));
  const progEl = h('b', { class: 'prog-val' });
  const progBox = h('span', { class: 'play-prog' }, `${TEXT.play.left} `, progEl, TEXT.play.leftUnit);
  // 案内役の一言は、見出し帯の中央（退くと残りの間）の枠にだけ出す（v2-r3：退く・残り・盤を隠さない）
  const slot = h('div', { class: 'play-slot' }, h('div', { class: 'play-level' }, fill(TEXT.play.level, { level: lv.name, b: holes.length || lv.blanks })));
  const head = h('header', { class: 'play-head' },
    fuda(reviewing ? TEXT.play.backToResult : TEXT.play.leave, { size: 'xs', act: 'leave', onclick: leave }),
    slot,
    h('div', { class: 'play-meta' },
      progBox,
      h('span', { class: 'play-time', 'aria-label': '経過時間' }, senko(), timeEl)));

  // ---- 盤 ----
  const board = createBoard(puzzle, {
    onCell: (x, y) => {
      commitRomaji();
      const given = game.isGiven(x, y);
      act(game.select(x, y), { moved: true });
      if (given && !reviewing && !finished) pointToBlank(x, y);
    },
  });
  const boardWrap = h('div', { class: 'board-wrap' }, board.el);

  // ---- いまの問（短冊）。空いた辻にいるときは横と縦の2段（いまの向きを上に、太く）。
  // 2段目を押すと縦と横が入れ替わる。未確定のローマ字はマスに出さず、帯の右上に小さく出す ----
  const clueRow = (kind) => {
    const label = h('span', { class: 'clue-label' });
    const ans = h('span', { class: 'clue-ans' });
    const text = h('span', { class: 'clue-text' });
    const line = h('span', { class: 'clue-line' }, label, ans, text);
    const el = kind === 'main'
      ? h('div', { class: 'clue-row is-main' }, line)
      : h('button', { type: 'button', class: 'clue-row is-sub', hidden: true, onclick: () => toggleDir() }, line);
    return { el, line, label, ans, text, key: '' };
  };
  const rowMain = clueRow('main');
  const rowSub = clueRow('sub');
  const pendVal = h('b');
  const pendEl = h('span', { class: 'clue-pend', hidden: true, 'aria-live': 'polite' }, h('small', {}, 'ローマ字'), pendVal);
  const clue = h('div', { class: 'clue' },
    h('button', { class: 'clue-nav', type: 'button', 'data-nav': 'prev', 'aria-label': TEXT.play.prev, onclick: () => stepWord(-1) }, '‹'),
    h('div', { class: 'clue-body' }, rowMain.el, rowSub.el),
    h('button', { class: 'clue-nav', type: 'button', 'data-nav': 'next', 'aria-label': TEXT.play.next, onclick: () => stepWord(1) }, '›'),
    pendEl);
  clue.addEventListener('mousedown', (e) => e.preventDefault());

  // ---- 道具 ----
  const dirBtn = fuda([h('span', { class: 'dir-v' }, '縦'), h('span', { class: 'dir-arrow', 'aria-hidden': 'true' }, '⇄'), h('span', { class: 'dir-h' }, '横')],
    { size: 'sm', 'data-tool': 'dir', onclick: toggleDir });
  const listBtn = fuda(TEXT.play.tools.list, { size: 'sm', 'data-tool': 'list', cls: 'tool-list', onclick: openList });
  const tools = h('div', { class: 'tools' },
    reviewing ? null : fuda(TEXT.play.tools.hint, { size: 'sm', 'data-tool': 'hint', onclick: openHint }),
    reviewing ? null : fuda(TEXT.play.tools.check, { size: 'sm', 'data-tool': 'check', onclick: doCheck }),
    reviewing ? null : dirBtn,
    listBtn);
  tools.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) e.preventDefault();
  });

  const keypad = reviewing ? null : createKeypad({ onKey });

  // ---- 問の一覧（スマホは下から出る札、PCは右の列に常に出す） ----
  const items = new Map();
  const listEl = h('aside', { class: 'play-list', 'data-open': 'false', 'aria-label': TEXT.play.tools.list });
  const listBack = h('div', { class: 'list-back', 'data-open': 'false', onclick: closeList });
  listEl.append(h('div', { class: 'list-top' },
    h('h2', { class: 'list-title' }, TEXT.play.tools.list),
    fuda(TEXT.play.listClose, { size: 'xs', cls: 'list-close', onclick: closeList })));
  for (const [title, dir] of [[TEXT.play.listDown, 'down'], [TEXT.play.listAcross, 'across']]) {
    const ol = h('ol', { class: 'list-ol' });
    for (const w of puzzle.words.filter((x) => x.dir === dir)) {
      const ans = h('span', { class: 'li-ans' });
      const b = h('button', {
        type: 'button',
        class: 'list-item',
        'data-word': w.id,
        onclick: () => {
          commitRomaji();
          act(game.selectWord(w.id), { moved: true });
          closeList();
        },
      },
      h('span', { class: 'li-label' }, w.label, h('small', {}, `${w.length}文字`)),
      h('span', { class: 'li-text' }, phrased(w.clue), ans),
      h('span', { class: 'li-done', 'aria-label': '解けた' }, '済'));
      // 空きの無い問（最初から埋まっている）は「済」を付けず、薄く出す
      if (!blankWords.has(w.id)) b.classList.add('is-given');
      items.set(w.id, { b, ans });
      ol.append(h('li', {}, b));
    }
    listEl.append(h('h3', { class: 'list-h' }, title), ol);
  }
  if (!reviewing) listEl.append(h('div', { class: 'list-foot' }, fuda(TEXT.play.giveUp, { size: 'xs', act: 'giveup', onclick: askGiveUp })));

  const main = h('div', { class: 'play-main' }, boardWrap, clue, tools, keypad?.el);
  el.append(head, h('div', { class: 'play-body' }, main, listEl), listBack);

  // ---- 表示 ----
  let lastKey = '';
  // 空いた辻にいるときの、もう一方の向きの言葉（空きでないマスや、片方の言葉しか通らない空きでは null）
  function crossOther(w) {
    const { x, y } = game.cursor;
    if (!w || !game.isBlank(x, y)) return null;
    return game.wordsAt(x, y).find((o) => o.id !== w.id) ?? null;
  }
  function fillRow(row, w) {
    const solved = game.solved.has(w.id);
    const key = `${w.id}:${solved ? 1 : 0}`;
    if (row.key === key) return;
    row.key = key;
    row.el.dataset.word = w.id;
    row.el.dataset.dir = w.dir;
    row.label.textContent = `${w.label}・${w.length}文字`;
    row.ans.replaceChildren(...(solved ? [h('span', { class: 'zumi' }, '済'), writing(w)] : []));
    row.text.replaceChildren(phrased(w.clue));
    row.el.classList.toggle('is-solved', solved);
    if (row === rowSub) row.el.setAttribute('aria-label', `${w.label}の問に切り替える：${w.clue}`);
  }
  function render() {
    board.render(game);
    const w = game.currentWord();
    const other = crossOther(w);
    if (w) fillRow(rowMain, w);
    if (other) fillRow(rowSub, other);
    rowSub.el.hidden = !other;
    clue.classList.toggle('is-pair', Boolean(other));
    clue.classList.toggle('is-solved', w ? game.solved.has(w.id) : false);
    const key = `${rowMain.key}|${other ? rowSub.key : ''}`;
    if (key !== lastKey) {
      lastKey = key;
      fitClue();
    }
    pendEl.hidden = !romaji.pending;
    pendVal.textContent = romaji.pending;
    shownLeft = game.progress().left;
    progEl.textContent = String(shownLeft);
    progBox.dataset.left = String(shownLeft);
    dirBtn.dataset.dir = game.dir;
    dirBtn.setAttribute('aria-label', `縦と横を入れ替える（いまは${game.dir === 'down' ? '縦' : '横'}）`);
    for (const [id, it] of items) {
      const done = blankWords.has(id) && game.solved.has(id);
      it.b.classList.toggle('is-done', done);
      it.b.classList.toggle('is-current', w?.id === id);
      it.ans.textContent = done ? writing(byId.get(id)) : '';
    }
  }

  // 問の文が段に収まらなければ字を小さくし、それでも収まらなければ文節の途中でも折り返す。
  // 下の段は、帯を全文の高さにしたとき（is-roomy）だけ詰める。1行の帯では「…」で切る
  function fitRow(row) {
    const over = () => row.line.scrollHeight > row.line.clientHeight + 1;
    row.el.classList.remove('is-long', 'is-longer');
    if (!over()) return;
    row.el.classList.add('is-long');
    if (over()) row.el.classList.add('is-longer');
  }
  function fitClue() {
    fitRow(rowMain);
    if (el.classList.contains('is-roomy') && !rowSub.el.hidden) fitRow(rowSub);
    else rowSub.el.classList.remove('is-long', 'is-longer');
  }

  // ---- イベントから音・動き・台詞 ----
  // 台詞は1回の操作につき1つ。優先：すべて埋まったが違う → 違う言葉 → 残り1字 → 一字で二つ → 解けた
  function act(events, { moved = false } = {}) {
    if (!events || events.length === 0) return null;
    const solved = [];
    const wrong = [];
    let cross = null;
    let complete = null;
    let typed = false;
    let noop = null;
    let lastInput = null;
    for (const ev of events) {
      if (ev.type === 'input') {
        typed = true;
        lastInput = ev;
      } else if (ev.type === 'erase') typed = true;
      else if (ev.type === 'wordSolved') solved.push(ev.id);
      else if (ev.type === 'wordWrong') wrong.push(ev.id);
      else if (ev.type === 'crossSolved') cross = ev;
      else if (ev.type === 'complete') complete = ev;
      else if (ev.type === 'noop') noop = ev;
      else if (ev.type === 'move') moved = true;
    }
    const prevLeft = shownLeft;
    render();
    const left = shownLeft;
    if (typed || solved.length) cancelScold();
    for (const id of solved) if (byId.has(id)) board.dye(wordCells(byId.get(id)));
    if (typed) app.audio.key();
    if (coachOn && lastInput) {
      coachOn = false;
      app.annai.hide();
      app.saveSettings({ seenCoach: true });
    }
    if (complete) {
      cancelScold();
      if (!complete.gaveUp) celebrate({ solved, cross, lastInput });
      finish(Boolean(complete.gaveUp));
      return { solved, wrong, noop };
    }
    // 違う字の知らせ。最後に書いた字に「゛」「゜」を付けられるなら約1秒待つ（その間に直せば出さない）
    const allFilled = Boolean(lastInput) && left === 0;
    const late = Boolean(lastInput) && !lastInput.mark && canTakeMark(lastInput.kana);
    let scolded = false;
    if (wrong.length || allFilled) {
      if (late) deferScold(wrong);
      else if (allFilled || solved.length === 0) {
        scold(wrong);
        scolded = true;
      } else for (const id of wrong) board.shake(wordCells(byId.get(id)));
    }
    const lastOne = Boolean(lastInput) && left === 1 && prevLeft > 1;
    let said = scolded;
    if (!scolded) {
      if (solved.length) app.audio.shamisen();
      said = true;
      if (lastOne) app.annai.say(pick('lastOne'));
      else if (cross && byId.has(cross.ids[0]) && byId.has(cross.ids[1])) app.annai.say(pick('cross', { a: byId.get(cross.ids[0]).label, b: byId.get(cross.ids[1]).label }));
      else if (solved.length) app.annai.say(pick('solved', { label: byId.get(solved[solved.length - 1])?.label ?? '' }));
      else said = false;
    }
    // 新しい台詞の無い入力では、前の台詞を残さない（「゛」を待つ間に「残るは一字のみ」が並ばないように）
    if (typed && !said) app.annai.hide();
    if (typed || moved || solved.length) save();
    return { solved, wrong, noop };
  }

  // 最後の1字：前の台詞を消して、解けた言葉を言う（1字で縦横2語なら2語）。藍に染まった盤は app が約1.2秒見せてから結果へ
  function celebrate({ solved, cross, lastInput }) {
    let ids = [];
    if (cross) ids = cross.ids;
    else if (lastInput) ids = game.wordsAt(lastInput.x, lastInput.y).map((w) => w.id);
    else if (solved.length) ids = [solved[solved.length - 1]];
    ids = ids.filter((id) => byId.has(id) && game.solved.has(id));
    for (const id of ids) if (!solved.includes(id)) board.dye(wordCells(byId.get(id)));
    if (ids.length) app.audio.shamisen();
    if (ids.length >= 2) app.annai.say(pick('cross', { a: byId.get(ids[0]).label, b: byId.get(ids[1]).label }), { ms: 2400 });
    else if (ids.length === 1) app.annai.say(pick('solved', { label: byId.get(ids[0]).label }), { ms: 2400 });
    else app.annai.hide();
  }

  // 書いてある字を押したとき：その言葉に確定していない空き辻があれば（カーソルはそこへ移っている）朱で短く光らせる。
  // 無ければ、書いてある字だと台詞で言い、いちばん近い空き辻を光らせる
  function pointToBlank(x, y) {
    const open = (c) => !game.locked[c.y][c.x];
    const w = game.currentWord();
    if (w && game.isBlank(game.cursor.x, game.cursor.y)) {
      board.flash(game.blanksOf(w.id).filter(open));
      return;
    }
    app.annai.say(pick('given'));
    const d = (c) => (c.x - x) ** 2 + (c.y - y) ** 2;
    const near = holes.filter(open).sort((a, b) => d(a) - d(b))[0];
    if (near) board.flash([near]);
  }

  // 違う字を知らせる：言葉を揺らし、鼓を鳴らして台詞を1つ。空きがすべて埋まっていれば「吟味」へ誘う
  function scold(ids) {
    const open = ids.filter((id) => byId.has(id) && !game.solved.has(id));
    for (const id of open) board.shake(wordCells(byId.get(id)));
    app.audio.tsuzumi();
    if (!game.isComplete() && game.progress().left === 0) app.annai.say(pick('allFilled'));
    else if (open.length) app.annai.say(pick('wrong', { label: byId.get(open[0]).label }));
  }
  const filling = () => holes.map(({ x, y }) => game.entries[y][x] || '.').join('');
  function deferScold(ids) {
    cancelScold();
    const snap = filling();
    scoldTimer = setTimeout(() => {
      scoldTimer = 0;
      if (finished || game.isComplete() || filling() !== snap) return;
      scold(ids);
    }, WRONG_DELAY);
  }
  function cancelScold() {
    clearTimeout(scoldTimer);
    scoldTimer = 0;
  }

  // 未確定のローマ字（n）を確定する。確定で言葉が埋まって次の問へ移ったら true
  function commitRomaji() {
    if (!romaji.pending) return false;
    const before = game.currentWord()?.id ?? null;
    const out = romaji.flush();
    for (const ch of out) act(game.input(ch));
    if (out.length === 0) render();
    return (game.currentWord()?.id ?? null) !== before;
  }

  function stepWord(d) {
    if (commitRomaji()) return;
    act(game.nextWord(d), { moved: true });
  }

  function toggleDir() {
    if (commitRomaji()) return;
    act(game.toggleDir(), { moved: true });
  }

  function onKey(k) {
    if (finished) return null;
    app.audio.unlock();
    if (k.type === 'erase') {
      if (romaji.pending) {
        romaji.clear();
        render();
      } else doErase();
      return null;
    }
    commitRomaji();
    if (k.type === 'kana') {
      act(game.input(k.kana));
      return k.kana;
    }
    const evs = k.type === 'dakuten' ? game.dakuten() : game.handakuten();
    const r = act(evs);
    if (r?.noop && r.noop.reason !== 'complete') app.annai.say(pick('noDakuten'));
    return evs.find((e) => e.type === 'input')?.kana ?? null;
  }

  // 消す。最初から書いてある字の上で消せる字が無ければ、そう言う（その字はどの操作でも変わらない）
  function doErase() {
    const r = act(game.erase());
    if (r?.noop && game.isGiven(game.cursor.x, game.cursor.y)) app.annai.say(pick('given'));
  }

  async function openHint() {
    if (finished) return;
    app.audio.unlock();
    commitRomaji();
    const target = game.currentWord();
    const v = await openDialog({
      name: 'hint',
      text: TEXT.hint.text,
      sub: target ? `いまの問：${target.label}（${target.length}文字）` : '',
      buttons: [
        { label: TEXT.hint.letter, value: 'letter' },
        { label: TEXT.hint.word, value: 'word' },
      ],
      extras: [
        { label: TEXT.hint.cancel, value: 'cancel' },
        { label: TEXT.hint.giveUp, value: 'giveup' },
      ],
    });
    if (finished) return;
    if (v === 'giveup') return askGiveUp();
    if (v !== 'letter' && v !== 'word') return;
    const w = game.currentWord();
    const evs = v === 'letter' ? game.revealLetter() : game.revealWord();
    const rv = evs.find((e) => e.type === 'reveal');
    act(evs);
    if (finished) return;
    if (!rv || rv.cells.length === 0) app.annai.say(pick('alreadySolved'));
    else if (v === 'letter') app.annai.say(pick('hintLetter', { ch: puzzle.grid[rv.cells[0].y][rv.cells[0].x] }));
    else app.annai.say(pick('hintWord', { label: w.label, answer: w.answer }));
    save();
  }

  function doCheck() {
    if (finished) return;
    commitRomaji();
    // 最初から書いてある字は数えない。自分で書いた字（助太刀で明かした字を除く）が空きに1つでもあるか
    const anyWritten = holes.some(({ x, y }) => game.entries[y][x] !== '' && !game.revealed[y][x]);
    const ev = game.check().find((e) => e.type === 'check');
    render();
    if (!ev) return;
    if (!anyWritten) app.annai.say(pick('checkEmpty'));
    else if (ev.wrong > 0) {
      app.audio.tsuzumi();
      app.annai.say(pick('checkWrong', { n: ev.wrong }));
    } else app.annai.say(pick('checkOk'));
    save();
  }

  async function askGiveUp() {
    closeList();
    if (finished) return;
    const v = await openDialog({
      name: 'giveup',
      text: TEXT.giveUp.text,
      buttons: [
        { label: TEXT.giveUp.yes, value: 'yes' },
        { label: TEXT.giveUp.no, value: null, primary: true, focus: true },
      ],
    });
    if (v === 'yes' && !finished) act(game.giveUp());
  }

  function openList() {
    listOpen = true;
    listEl.dataset.open = 'true';
    listBack.dataset.open = 'true';
    const cur = items.get(game.currentWord()?.id);
    cur?.b.scrollIntoView({ block: 'nearest' });
    listEl.querySelector('.list-close')?.focus({ preventScroll: true });
  }

  function closeList() {
    if (!listOpen) return;
    listOpen = false;
    listEl.dataset.open = 'false';
    listBack.dataset.open = 'false';
  }

  function finish(gaveUp) {
    if (finished) return;
    finished = true;
    romaji.clear();
    closeList();
    const seconds = Math.max(1, Math.round(game.elapsedMs / 1000));
    app.finishGame({ game, puzzle, levelId, seed, seconds, gaveUp, duel });
  }

  function save() {
    if (reviewing || finished) return;
    app.store.saveCurrent({ level: levelId, seed, game: game.serialize(), duel });
  }

  function leave() {
    if (reviewing) {
      app.go('result', { ...review, again: true });
      return;
    }
    commitRomaji();
    save();
    app.go('title');
  }

  // ---- キーボード（ローマ字・矢印・スペース・Enter・Tab） ----
  function onKeydown(e) {
    if (isDialogOpen()) return;
    if (e.key === 'Escape' && listOpen) {
      closeList();
      return;
    }
    if (finished || e.isComposing || e.key === 'Process' || e.ctrlKey || e.metaKey || e.altKey) return;
    const onControl = e.target instanceof Element && e.target.closest('button, a, input, textarea, select');
    const k = e.key;
    if (ARROWS[k]) {
      e.preventDefault();
      if (commitRomaji()) return;
      act(game.move(...ARROWS[k]), { moved: true });
    } else if (k === ' ' || k === 'Spacebar') {
      if (onControl) return;
      e.preventDefault();
      if (commitRomaji()) return;
      act(game.toggleDir(), { moved: true });
    } else if (k === 'Enter') {
      if (onControl) return;
      e.preventDefault();
      if (commitRomaji()) return;
      act(game.nextWord(e.shiftKey ? -1 : 1), { moved: true });
    } else if (k === 'Tab') {
      commitRomaji(); // 焦点の移動はブラウザに任せる
    } else if (k === 'Backspace' || k === 'Delete') {
      e.preventDefault();
      if (romaji.pending) {
        romaji.clear();
        render();
      } else doErase();
    } else if (/^[a-zA-Z'-]$/.test(k)) {
      e.preventDefault();
      app.audio.unlock();
      const out = romaji.feed(k.toLowerCase());
      if (out.length) for (const ch of out) act(game.input(ch));
      else render();
    } else if (k.length === 1) {
      const ch = normalizeAnswer(k);
      if (ch && ch.length === 1) {
        e.preventDefault();
        commitRomaji();
        act(game.input(ch));
      }
    }
  }

  // ---- 経過時間：対局画面が見えている間だけ進める ----
  let last = performance.now();
  let shown = -1;
  let savedAt = 0;
  let iv = 0;
  function tick() {
    const now = performance.now();
    const dt = now - last;
    last = now;
    if (finished || document.visibilityState !== 'visible') return;
    game.tick(dt);
    const s = Math.floor(game.elapsedMs / 1000);
    if (s !== shown) {
      shown = s;
      timeEl.textContent = fmtClock(game.elapsedMs);
    }
    if (s - savedAt >= 5) {
      savedAt = s;
      save();
    }
  }
  function onVisibility() {
    last = performance.now();
    if (document.visibilityState === 'hidden') save();
  }

  // 問の帯は2段とも全文（各段2行まで）を基本にし、盤の上下に余る高さを帯に回す。
  // それでマスが MIN_ROOMY_CELL を下回る画面（390×660 の11段の盤など）だけ、下の段を1行に詰める。
  // 帯の高さは画面の大きさと盤で決まり、1段か2段かでは変わらない（マスを移るたびに盤が揺れないように）
  function fitBoard() {
    el.classList.add('is-roomy');
    if (!(board.fit(boardWrap.clientWidth, boardWrap.clientHeight) >= MIN_ROOMY_CELL)) {
      el.classList.remove('is-roomy');
      board.fit(boardWrap.clientWidth, boardWrap.clientHeight);
    }
    fitClue();
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fitBoard) : null;

  return {
    el,
    show() {
      fitBoard();
      ro?.observe(boardWrap, { box: 'border-box' });
      render();
      // 案内役の一言は見出し帯の中央の枠に出す（盤に重ねない。退く・残りも隠さない）
      app.annai.attach(slot);
      el.focus({ preventScroll: true });
      if (reviewing) return;
      document.addEventListener('keydown', onKeydown);
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('pagehide', save);
      last = performance.now();
      savedAt = Math.floor(game.elapsedMs / 1000);
      iv = setInterval(tick, 250);
      app.audio.hyoshigi();
      if (source === 'resume') app.annai.say(TEXT.title.welcomeBack);
      else if (!app.settings().seenCoach) {
        coachOn = true;
        app.annai.say(TEXT.play.coach, { ms: 4000 });
      } else app.annai.say(pick('start', { n: holes.length }));
    },
    destroy() {
      clearInterval(iv);
      cancelScold();
      ro?.disconnect();
      document.removeEventListener('keydown', onKeydown);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', save);
      app.annai.hide();
      app.annai.attach(null);
    },
  };
}

// 解けた問の書き方：ねこ（猫）
function writing(w) {
  if (!w) return '';
  return w.kanji && w.kanji !== w.reading ? `${w.reading}（${w.kanji}）` : w.reading;
}
