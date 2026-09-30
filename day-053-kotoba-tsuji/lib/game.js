// 対局の状態。操作はイベントの配列を返し、UI は音と演出をイベントで決める。DOM は触らない。
// v2：盤は最初からほぼ埋まっていて、空き（puzzle.blanks）だけを埋める。
// 空きでないマス（given）は始めから答えが入って locked。どの操作でも字は変わらず、保存もしない（puzzle.blanks から毎回求める）。
import { ALLOWED, normalizeAnswer, toggleDakuten, toggleHandakuten } from './kana.js';
import { hashSeed } from './rng.js';

const noop = (reason) => ({ type: 'noop', reason });
const grid2 = (h, w, v) => Array.from({ length: h }, () => Array(w).fill(v));
const other = (dir) => (dir === 'across' ? 'down' : 'across');
const count = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
const rowMajor = (a, b) => a.y - b.y || a.x - b.x;

// 盤の指紋。保存が同じ盤のものかを確かめる（答えの字そのものは保存に書かない）
const boardKey = (puzzle) => hashSeed(`${puzzle.width}x${puzzle.height}|${puzzle.grid.map((row) => row.map((c) => c || '.').join('')).join('/')}`).toString(36);
const blanksKey = (list) => list.map(({ x, y }) => `${x},${y}`).join(';');

export class Game {
  constructor(puzzle, { autoCheck = true } = {}) {
    this.puzzle = puzzle;
    this.autoCheck = autoCheck !== false;
    const { width: W, height: H, grid } = puzzle;
    this.entries = grid2(H, W, '');
    this.locked = grid2(H, W, false);
    this.revealed = grid2(H, W, false);
    this.wrong = grid2(H, W, false);
    this.solved = new Set();
    this.hintsLetters = 0;
    this.checks = 0;
    this.gaveUp = false;
    this.elapsedMs = 0;
    this._done = false;
    // 濁点を付ける先・「消す」で戻る先。入力のあと、選択・移動・消す・助太刀をするまで有効
    this._lastInput = null;
    // 言葉ごとに「間違いを知らせた埋め方」。同じ埋め方で wordWrong を2度出さない
    this._reported = new Map();
    this._byId = new Map();
    this._cells = new Map();
    this._at = grid2(H, W, null);
    for (const w of puzzle.words) {
      this._byId.set(w.id, w);
      const cells = [];
      for (let i = 0; i < w.length; i++) {
        const x = w.dir === 'across' ? w.x + i : w.x;
        const y = w.dir === 'across' ? w.y : w.y + i;
        cells.push({ x, y });
        if (!this._at[y][x]) this._at[y][x] = { across: null, down: null };
        this._at[y][x][w.dir] = w;
      }
      this._cells.set(w.id, cells);
    }

    // 空き。blanks を持たない盤（v1 の形）は、字のマスをすべて空きとして扱う
    this._blank = grid2(H, W, false);
    this._blanks = [];
    const source = Array.isArray(puzzle.blanks)
      ? puzzle.blanks
      : grid.flatMap((row, y) => row.map((ch, x) => (ch ? { x, y } : null)).filter(Boolean));
    for (const c of source) {
      if (!this.isLetter(c?.x, c?.y) || this._blank[c.y][c.x]) continue;
      this._blank[c.y][c.x] = true;
      this._blanks.push({ x: c.x, y: c.y });
    }
    this._blanks.sort(rowMajor);
    // 空きを含む言葉。空きの無い言葉は solved にも progress の total にも数えず、移動の行き先にしない
    this._blankWords = new Set(puzzle.words.filter((w) => this._cells.get(w.id).some(({ x, y }) => this._blank[y][x])).map((w) => w.id));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (grid[y][x] && !this._blank[y][x]) {
          this.entries[y][x] = grid[y][x];
          this.locked[y][x] = true;
        }
      }
    }

    // 始まりは最初の空き（行優先）。向きは横（その空きを通る横の言葉が無ければ縦）
    const start = this._blanks[0];
    const first = puzzle.words[0];
    if (start) {
      this.cursor = { x: start.x, y: start.y };
      this.dir = this._at[start.y][start.x].across ? 'across' : 'down';
    } else {
      this.cursor = first ? { x: first.x, y: first.y } : { x: 0, y: 0 };
      this.dir = first ? first.dir : 'across';
    }
  }

  // ---- 読み出し ----

  isLetter(x, y) {
    const { width, height, grid } = this.puzzle;
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height && grid[y][x] !== '';
  }

  // 最初から答えが書いてあるマス（書き換え不可）
  isGiven(x, y) {
    return this.isLetter(x, y) && !this._blank[y][x];
  }

  // 埋める空きのマス
  isBlank(x, y) {
    return this.isLetter(x, y) && this._blank[y][x];
  }

  // 言葉の中の空き（無ければ []）
  blanksOf(id) {
    const cells = this._cells.get(id);
    return cells ? cells.filter(({ x, y }) => this._blank[y][x]).map(({ x, y }) => ({ x, y })) : [];
  }

  wordsAt(x, y) {
    if (!this.isLetter(x, y)) return [];
    const slot = this._at[y][x];
    return [slot.across, slot.down].filter(Boolean);
  }

  currentWord() {
    const slot = this._at[this.cursor.y]?.[this.cursor.x];
    if (!slot) return null;
    return slot[this.dir] ?? slot.across ?? slot.down;
  }

  isComplete() {
    return this.gaveUp || this._done;
  }

  // solved/total は空きを含む言葉の数。blanks は空きの数。
  // left は字の入っていない空きの数（autoCheck によらない。書くたびに1減り、消すと1増える。正誤は藍と判定の台詞で伝える）
  progress() {
    let left = 0;
    for (const { x, y } of this._blanks) if (this.entries[y][x] === '') left++;
    return { solved: this.solved.size, total: this._blankWords.size, blanks: this._blanks.length, left };
  }

  tick(ms) {
    if (!this.isComplete() && Number.isFinite(ms) && ms > 0) this.elapsedMs += ms;
    return this.elapsedMs;
  }

  // ---- 移動 ----

  select(x, y) {
    if (!this.isLetter(x, y)) return [noop('blank')];
    this._lastInput = null;
    const slot = this._at[y][x];
    const same = x === this.cursor.x && y === this.cursor.y;
    if (this._blank[y][x]) {
      if (same) {
        if (!(slot.across && slot.down)) return [noop('same')];
        this.dir = other(this.dir);
        return [this.#moveEvent()];
      }
      this.cursor = { x, y };
      if (!slot[this.dir]) this.dir = slot.across ? 'across' : 'down';
      return [this.#moveEvent()];
    }
    // 空きでないマス：その言葉（いまの向きを優先。同じマスをもう一度押したら向きを入れ替える）を選び、
    // 字の入っていない空きがあれば最初のそれへ（v2-r3）。無ければそのマスに留まり、問を読めるようにする
    // （そこで打った字は盤の次の字の入っていない空きへ入る）。盤に字の入っていない空きが1つも無いときだけ locked でない空きへ
    let dir = slot[this.dir] ? this.dir : slot.across ? 'across' : 'down';
    if (same && slot.across && slot.down) dir = other(dir);
    const target = this.#firstTarget(this._cells.get(slot[dir].id));
    if (same && !target && dir === this.dir) return [noop('same')];
    this.cursor = target ? { x: target.x, y: target.y } : { x, y };
    this.dir = dir;
    return [this.#moveEvent()];
  }

  selectWord(id) {
    const w = this._byId.get(id);
    if (!w) return [noop('unknown')];
    this._lastInput = null;
    this.#jumpTo(w);
    return [this.#moveEvent()];
  }

  toggleDir() {
    const slot = this._at[this.cursor.y]?.[this.cursor.x];
    if (!slot || !(slot.across && slot.down)) return [noop('single')];
    this._lastInput = null;
    this.dir = other(this.dir);
    return [this.#moveEvent()];
  }

  // 矢印。空きでないマスと字の無いマスを飛ばし、その向きの同じ行（列）で次の空きへ（確定した空きにも止まる）。
  // その向きに空きが無ければ noop('edge')。書いてある字に乗って打つと、離れた空きに字が入って戸惑うため（体験評価 v2-r1）
  move(dx, dy) {
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    if ((sx === 0) === (sy === 0)) return [noop('invalid')];
    const { width, height } = this.puzzle;
    let x = this.cursor.x + sx;
    let y = this.cursor.y + sy;
    while (x >= 0 && y >= 0 && x < width && y < height && !this.isBlank(x, y)) {
      x += sx;
      y += sy;
    }
    if (!this.isBlank(x, y)) return [noop('edge')];
    this._lastInput = null;
    this.cursor = { x, y };
    const slot = this._at[y][x];
    const want = sx !== 0 ? 'across' : 'down';
    if (slot[want]) this.dir = want;
    else if (!slot[this.dir]) this.dir = slot.across ? 'across' : 'down';
    return [this.#moveEvent()];
  }

  // 次（delta<0 なら前）の、空きを含む言葉へ。字の入っていない空きのある言葉を優先し（v2-r3）、
  // 盤に字の入っていない空きが無ければ locked でない空きのある言葉へ。空きの無い言葉には行かない
  nextWord(delta = 1) {
    const ws = this.puzzle.words;
    const n = ws.length;
    if (this._blankWords.size === 0) return [noop('empty')];
    const step = delta < 0 ? -1 : 1;
    const i0 = Math.max(0, ws.indexOf(this.currentWord()));
    const at = (k) => ws[(((i0 + step * k) % n) + n) % n];
    const test = this.#hasEmpty() ? (x, y) => this.#isEmpty(x, y) : (x, y) => this.#isWritable(x, y);
    let target = null;
    for (let k = 1; k <= n && !target; k++) {
      const w = at(k);
      if (this._blankWords.has(w.id) && this._cells.get(w.id).some((c) => test(c.x, c.y))) target = w;
    }
    for (let k = 1; k <= n && !target; k++) {
      const w = at(k);
      if (this._blankWords.has(w.id)) target = w;
    }
    this._lastInput = null;
    this.#jumpTo(target);
    return [this.#moveEvent()];
  }

  // ---- 書く・消す ----

  // 空きに書き、言葉が埋まったら判定する。そのあと次の確定していない空き（行優先で後ろ、無ければ先頭から）へ移る
  input(kana) {
    if (this.isComplete()) return [noop('complete')];
    const ch = normalizeAnswer(kana);
    if (!ch || ch.length !== 1) return [noop('invalid')];
    const { x: cx, y: cy } = this.cursor;
    if (!this.isLetter(cx, cy)) return [noop('blank')];
    const events = [];
    let target = { x: cx, y: cy };
    if (this.locked[cy][cx]) {
      // 空きでないマス・確定した空き（打ち抜け）：同じ字なら書かずに進む。違えば語の中の後ろの字の入っていない空き、
      // 無ければ盤の次の字の入っていない空きへ移って書く。自分の字の入った空きは、盤に字の入っていない空きが無いときだけ書き直す
      const word = this.currentWord();
      const cells = this._cells.get(word.id);
      const pos = this.#indexIn(cells);
      this.dir = word.dir;
      if (this.entries[cy][cx] === ch) return this.#skip(cells, pos);
      const after = (test) => cells.find((c, i) => i > pos && test(c.x, c.y));
      const empty = (x, y) => this.#isEmpty(x, y);
      const writable = (x, y) => this.#isWritable(x, y);
      let inWord = after(empty);
      target = inWord ?? this.#nextBlank(this.cursor, empty);
      if (!target) {
        inWord = after(writable);
        target = inWord ?? this.#nextBlank(this.cursor, writable);
      }
      if (!target) return [noop('locked')];
      if (!inWord) this.#moveTo(target, events);
    }
    const { x, y } = target;
    this.entries[y][x] = ch;
    this.wrong[y][x] = false;
    this._lastInput = { x, y };
    this.cursor = { x, y };
    events.push({ type: 'input', x, y, kana: ch });
    this.#judge(x, y, events);
    if (this.#checkComplete(events)) return events;
    this.#advance({ x, y }, events);
    return events;
  }

  // いまのマスの字、無ければ直前に書いた字を消す（どちらも確定していない空きの字だけ）。
  // 語の中を遡っては消さない（v2-r3：選び直した後の「消す」で、前に書いた自分の字が消えたため）
  erase() {
    if (this.isComplete()) return [noop('complete')];
    const erasable = (c) => Boolean(c) && this.#isWritable(c.x, c.y) && this.entries[c.y][c.x] !== '';
    let target = null;
    if (erasable(this.cursor)) target = this.cursor;
    else if (erasable(this._lastInput)) target = this._lastInput;
    this._lastInput = null;
    if (!target) return [noop('empty')];
    const { x, y } = target;
    this.entries[y][x] = '';
    this.wrong[y][x] = false;
    this.#place({ x, y });
    return [{ type: 'erase', x, y }];
  }

  dakuten() {
    return this.#mark(toggleDakuten, 'dakuten');
  }

  handakuten() {
    return this.#mark(toggleHandakuten, 'handakuten');
  }

  // ---- 吟味・助太刀・降参 ----

  check() {
    if (this.isComplete()) return [noop('complete')];
    const { grid } = this.puzzle;
    let wrong = 0;
    let empty = 0;
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (!grid[y][x]) continue;
        const e = this.entries[y][x];
        if (e === '') empty++;
        else if (e !== grid[y][x]) {
          this.wrong[y][x] = true;
          wrong++;
        }
      }
    }
    this.checks++;
    return [{ type: 'check', wrong, empty }];
  }

  // いまのマスが書ける空きならそこを、そうでなければいまの言葉の空き（字の入っていない空き → locked でない空き）、
  // 無ければ盤の次の空き（同じ順）を明かす
  revealLetter() {
    if (this.isComplete()) return [noop('complete')];
    const { x: cx, y: cy } = this.cursor;
    let target = null;
    if (this.#isWritable(cx, cy)) target = { x: cx, y: cy };
    else {
      const word = this.currentWord();
      const cells = word ? this._cells.get(word.id) : [];
      const empty = (x, y) => this.#isEmpty(x, y);
      const writable = (x, y) => this.#isWritable(x, y);
      target = cells.find((c) => empty(c.x, c.y)) ?? cells.find((c) => writable(c.x, c.y))
        ?? this.#nextTarget(this.cursor);
    }
    if (!target) return [noop('locked')];
    const events = [];
    this.#reveal([target], events);
    this._lastInput = null;
    this.#place(target);
    if (this.#checkComplete(events)) return events;
    this.#advance(target, events);
    return events;
  }

  // いまの言葉の空きを全部明かす。空きの無い言葉なら noop('noBlank')
  revealWord() {
    if (this.isComplete()) return [noop('complete')];
    const word = this.currentWord();
    if (!word) return [noop('blank')];
    if (!this._blankWords.has(word.id)) return [noop('noBlank')];
    const cells = this._cells.get(word.id).filter(({ x, y }) => this.#isWritable(x, y));
    if (cells.length === 0) return [noop('locked')];
    const events = [];
    this.#reveal(cells, events);
    this._lastInput = null;
    if (this.#checkComplete(events)) return events;
    this.#advance(this.cursor, events);
    return events;
  }

  giveUp() {
    if (this.isComplete()) return [noop('complete')];
    const { grid } = this.puzzle;
    for (const { x, y } of this._blanks) {
      if (!this.locked[y][x]) {
        if (this.entries[y][x] !== grid[y][x]) this.revealed[y][x] = true;
        this.entries[y][x] = grid[y][x];
        this.locked[y][x] = true;
      }
      this.wrong[y][x] = false;
    }
    for (const id of this._blankWords) this.solved.add(id);
    this.gaveUp = true;
    this._lastInput = null;
    return [{ type: 'complete', gaveUp: true }];
  }

  // ---- 保存と復元 ----

  // v2：空きの状態だけを puzzle.blanks の順に持つ。board と blanks で、保存が同じ盤・同じ空きのものかを確かめる
  serialize() {
    const bits = (g) => this._blanks.map(({ x, y }) => (g[y][x] ? '1' : '0')).join('');
    return {
      v: 2,
      autoCheck: this.autoCheck,
      board: boardKey(this.puzzle),
      blanks: blanksKey(this._blanks),
      entries: this._blanks.map(({ x, y }) => this.entries[y][x] || '.').join(''),
      locked: bits(this.locked),
      revealed: bits(this.revealed),
      wrong: bits(this.wrong),
      cursor: { x: this.cursor.x, y: this.cursor.y },
      dir: this.dir,
      solved: [...this.solved],
      hintsLetters: this.hintsLetters,
      checks: this.checks,
      gaveUp: this.gaveUp,
      done: this._done,
      elapsedMs: this.elapsedMs,
      reported: Object.fromEntries([...this._reported].map(([id, set]) => [id, [...set]])),
      lastInput: this._lastInput ? { ...this._lastInput } : null,
    };
  }

  // v1 の保存・形が合わない保存・盤や空きと食い違う保存は捨てて、新しい対局を返す
  static restore(puzzle, data, options = {}) {
    const autoCheck = options.autoCheck ?? data?.autoCheck ?? true;
    const fresh = () => new Game(puzzle, { autoCheck });
    try {
      if (!data || data.v !== 2) return fresh();
      const g = fresh();
      if (data.board !== boardKey(puzzle) || data.blanks !== blanksKey(g._blanks)) return fresh();
      const n = g._blanks.length;
      const chars = typeof data.entries === 'string' ? [...data.entries] : null;
      const okBits = (s) => typeof s === 'string' && s.length === n && /^[01]*$/.test(s);
      if (!chars || chars.length !== n || ![data.locked, data.revealed, data.wrong].every(okBits)) return fresh();
      for (let i = 0; i < n; i++) {
        const { x, y } = g._blanks[i];
        const ch = chars[i] === '.' ? '' : chars[i];
        if (ch && !ALLOWED.has(ch)) return fresh();
        const locked = data.locked[i] === '1';
        const revealed = data.revealed[i] === '1';
        if ((locked && ch !== puzzle.grid[y][x]) || (revealed && !locked)) return fresh();
        g.entries[y][x] = ch;
        g.locked[y][x] = locked;
        g.revealed[y][x] = revealed;
        g.wrong[y][x] = data.wrong[i] === '1';
      }
      if (g.isLetter(data.cursor?.x, data.cursor?.y)) g.cursor = { x: data.cursor.x, y: data.cursor.y };
      const slot = g._at[g.cursor.y][g.cursor.x];
      g.dir = slot[data.dir] ? data.dir : slot.across ? 'across' : 'down';
      for (const id of Array.isArray(data.solved) ? data.solved : []) if (g._blankWords.has(id)) g.solved.add(id);
      g.hintsLetters = count(data.hintsLetters);
      g.checks = count(data.checks);
      g.gaveUp = data.gaveUp === true;
      g._done = data.done === true;
      g.elapsedMs = count(data.elapsedMs);
      for (const [id, list] of Object.entries(data.reported ?? {})) {
        if (g._byId.has(id) && Array.isArray(list)) g._reported.set(id, new Set(list.filter((s) => typeof s === 'string')));
      }
      if (data.lastInput && g.isBlank(data.lastInput.x, data.lastInput.y)) {
        g._lastInput = { x: data.lastInput.x, y: data.lastInput.y };
      }
      return g;
    } catch {
      return fresh();
    }
  }

  // ---- 内側 ----

  // 字の入っていない空き（locked の空きには必ず字が入っている）
  #isEmpty(x, y) {
    return Boolean(this._blank[y]?.[x]) && this.entries[y][x] === '';
  }

  #hasEmpty() {
    return this._blanks.some(({ x, y }) => this.entries[y][x] === '');
  }

  // 書ける空き（locked でない空き）
  #isWritable(x, y) {
    return Boolean(this._blank[y]?.[x]) && !this.locked[y][x];
  }

  #moveEvent() {
    const w = this.currentWord();
    return { type: 'move', x: this.cursor.x, y: this.cursor.y, dir: this.dir, wordId: w ? w.id : null };
  }

  #indexIn(cells) {
    const i = cells.findIndex((c) => c.x === this.cursor.x && c.y === this.cursor.y);
    return i < 0 ? 0 : i;
  }

  #isFilled(word) {
    return this._cells.get(word.id).every(({ x, y }) => this.entries[y][x] !== '');
  }

  // カーソルを置く（向きは、そのマスにいまの向きの言葉があれば保つ）
  #place(cell) {
    this.cursor = { x: cell.x, y: cell.y };
    const slot = this._at[cell.y][cell.x];
    if (!slot[this.dir]) this.dir = slot.across ? 'across' : 'down';
  }

  // 別のマスへ移ったら move を足す
  #moveTo(cell, events) {
    if (cell.x === this.cursor.x && cell.y === this.cursor.y) return false;
    this.#place(cell);
    events.push(this.#moveEvent());
    return true;
  }

  // from より後ろ（行優先）で test を満たす最初の空き。無ければ先頭から回り、from 自身は最後に見る
  #nextBlank(from, test) {
    const list = this._blanks;
    const n = list.length;
    if (n === 0) return null;
    let start = list.findIndex((c) => c.y > from.y || (c.y === from.y && c.x > from.x));
    if (start < 0) start = 0;
    for (let k = 0; k < n; k++) {
      const c = list[(start + k) % n];
      if (test(c.x, c.y)) return c;
    }
    return null;
  }

  // 移動の行き先（v2-r3）：from より後ろ（行優先・先頭へ回る）の字の入っていない空き。
  // 盤に1つも無いとき（全部埋まって違う字が残る）だけ、locked でない空き
  #nextTarget(from) {
    return this.#nextBlank(from, (x, y) => this.#isEmpty(x, y)) ?? this.#nextBlank(from, (x, y) => this.#isWritable(x, y));
  }

  // 言葉の中の行き先：最初の字の入っていない空き。盤に字の入っていない空きが無いときだけ、最初の locked でない空き。無ければ null
  #firstTarget(cells) {
    return cells.find(({ x, y }) => this.#isEmpty(x, y))
      ?? (this.#hasEmpty() ? null : cells.find(({ x, y }) => this.#isWritable(x, y)))
      ?? null;
  }

  // 書いた・明かした後：次の行き先へ。いまの空きしか残っていなければ留まる
  #advance(from, events) {
    const next = this.#nextTarget(from);
    if (next) this.#moveTo(next, events);
  }

  // 書かずに1マス進む（語の中の次のマスへ）。語の終わりを過ぎたら、盤の次の行き先へ
  #skip(cells, pos) {
    if (pos + 1 < cells.length) {
      this.cursor = { ...cells[pos + 1] };
      return [{ ...this.#moveEvent(), skip: true }];
    }
    const events = [];
    const next = this.#nextTarget(this.cursor);
    if (next) this.#moveTo(next, events);
    return events.length ? events : [noop('end')];
  }

  // 言葉の行き先へ（selectWord・nextWord）。行き先が無ければ、その言葉の最初の書いてある字（無ければ頭）に置いて問を読めるようにする。
  // 自分の字の入った空きには置かない：そこで打つと自分の字を書き換えてしまう（v2-r3）
  #jumpTo(word) {
    const cells = this._cells.get(word.id);
    const cell = this.#firstTarget(cells)
      ?? cells.find(({ x, y }) => this.locked[y][x])
      ?? cells[0];
    this.cursor = { x: cell.x, y: cell.y };
    this.dir = word.dir;
  }

  // 書いたマスを通る言葉を判定する。1字で縦横2語が同時に解けたら crossSolved を1つ足す
  #judge(x, y, events) {
    const ids = [];
    for (const w of this.wordsAt(x, y)) if (this.#evaluate(w, events)) ids.push(w.id);
    if (ids.length === 2) events.push({ type: 'crossSolved', ids });
  }

  // 埋まった言葉を判定する。解けたら true
  #evaluate(word, events) {
    if (this.solved.has(word.id) || !this._blankWords.has(word.id)) return false;
    const cells = this._cells.get(word.id);
    let filling = '';
    for (const { x, y } of cells) {
      const e = this.entries[y][x];
      if (!e) return false;
      filling += e;
    }
    if (filling === word.answer) {
      // 自動の吟味が無いときは、空きを全部明かした言葉だけ解けた扱いにする
      if (!this.autoCheck && !cells.every(({ x, y }) => this.locked[y][x])) return false;
      for (const { x, y } of cells) {
        this.locked[y][x] = true;
        this.wrong[y][x] = false;
      }
      this.solved.add(word.id);
      events.push({ type: 'wordSolved', id: word.id });
      return true;
    }
    if (this.autoCheck) {
      let seen = this._reported.get(word.id);
      if (!seen) this._reported.set(word.id, (seen = new Set()));
      if (!seen.has(filling)) {
        seen.add(filling);
        events.push({ type: 'wordWrong', id: word.id });
      }
    }
    return false;
  }

  #checkComplete(events) {
    if (this._done) return true;
    const { grid } = this.puzzle;
    for (const { x, y } of this._blanks) if (this.entries[y][x] !== grid[y][x]) return false;
    this._done = true;
    for (const id of this._blankWords) this.solved.add(id);
    for (const { x, y } of this._blanks) {
      this.locked[y][x] = true;
      this.wrong[y][x] = false;
    }
    events.push({ type: 'complete', gaveUp: false });
    return true;
  }

  // 答えを入れて locked＋revealed。もともと正しくなかったマスの数だけ hintsLetters を増やす
  #reveal(list, events) {
    const done = [];
    let hints = 0;
    for (const { x, y } of list) {
      if (!this.#isWritable(x, y)) continue;
      const answer = this.puzzle.grid[y][x];
      if (this.entries[y][x] !== answer) hints++;
      this.entries[y][x] = answer;
      this.locked[y][x] = true;
      this.revealed[y][x] = true;
      this.wrong[y][x] = false;
      done.push({ x, y });
    }
    this.hintsLetters += hints;
    events.push({ type: 'reveal', cells: done, hints });
    const seen = new Set();
    for (const { x, y } of done) {
      for (const w of this.wordsAt(x, y)) {
        if (seen.has(w.id)) continue;
        seen.add(w.id);
        this.#evaluate(w, events);
      }
    }
  }

  // 直前に書いた空き（確定していなければ）、無ければいまのマスの字に濁点・半濁点を付け外しする。空きでないマスには付けない
  #mark(fn, kind) {
    if (this.isComplete()) return [noop('complete')];
    const editable = (c) => Boolean(c) && this.#isWritable(c.x, c.y) && this.entries[c.y][c.x] !== '';
    const target = editable(this._lastInput) ? this._lastInput : editable(this.cursor) ? this.cursor : null;
    if (!target) return [noop('nothing')];
    const { x, y } = target;
    const next = fn(this.entries[y][x]);
    if (!next) return [noop('cannot')];
    this.entries[y][x] = next;
    this.wrong[y][x] = false;
    const events = [{ type: 'input', x, y, kana: next, mark: kind }];
    this.#judge(x, y, events);
    if (this.#checkComplete(events)) return events;
    // いまいる空きがこれで確定したら（locked）、次の行き先へ
    const { x: cx, y: cy } = this.cursor;
    if (this._blank[cy][cx] && this.locked[cy][cx]) this.#advance(this.cursor, events);
    return events;
  }
}
