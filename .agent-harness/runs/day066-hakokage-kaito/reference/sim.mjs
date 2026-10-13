// 箱影の怪盗：ルールの正（参照実装）。
// 純粋な ES module。外部 import なし・DOM なし・乱数なし・時計なし。Node でもブラウザでもそのまま動く。
// day-066-hakokage-kaito/lib/sim.js へ、この内容をそのまま写す（変えたくなったら止めて報告する）。
// 座標は [x, y]（x＝列 0〜w-1、y＝行 0〜h-1、左上が [0, 0]）。向きは U（上）R（右）D（下）L（左）。

export const DIRS = Object.freeze({ U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] });
export const MOVES = Object.freeze(['U', 'R', 'D', 'L']);
export const WAIT = '.';
export const ACTIONS = Object.freeze([...MOVES, WAIT]); // 探索もこの順に試す（見本の解が一つに決まる）
export const MAX_W = 8;
export const MAX_H = 8;

// 世界の決まり。通常は NORMAL。検証器は「箱が○○しない世界」をこれで作る（配信物では NORMAL だけを使う）。
//   push:   false なら箱を押せない（V2）
//   noShade: 'all' か箱の番号の配列。その箱は光を止めない（V3）
//   noTurn:  'all' か箱の番号の配列。警備員はその箱を気にせず通り抜ける（V4）
export const NORMAL = Object.freeze({ push: true, noShade: null, noTurn: null });

const pick = (rule, i) => rule === 'all' || (Array.isArray(rule) && rule.includes(i));
const shades = (world, i) => !pick(world.noShade, i);
const turnsGuard = (world, i) => !pick(world.noTurn, i);
export const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const add = (p, dir) => [p[0] + DIRS[dir][0], p[1] + DIRS[dir][1]];
const dirFrom = (a, b) => (b[0] > a[0] ? 'R' : b[0] < a[0] ? 'L' : b[1] > a[1] ? 'D' : 'U');
const boxAt = (boxes, p) => boxes.findIndex((b) => same(b, p));

// ---------------------------------------------------------------- 面データを読む

// data = { id, name, hint, board: ['#..P', ...], guards: [...], lasers: [...] }
//   board の文字：# 壁 / . 床 / P 怪盗の出発点 / B 箱 / T 宝 / E 出口（盤の外周の床に置く）
//   guards：{ kind: 'patrol', path: [[x,y],...], start?: 0, dir?: 1 }（横か縦の一直線の道を往復する）
//           { kind: 'watch', at: [x,y], looks: ['R','D',...], start?: 0 }（その場で looks を順に向く。1つなら動かない）
//   lasers：{ at: [x,y], dir: 'R' }（at は壁のマス。そこから dir の向きへまっすぐ光る）
export function loadLevel(data) {
  const board = data.board;
  const h = board.length;
  const w = board[0].length;
  const fail = (msg) => { throw new Error(`面 ${data.id}: ${msg}`); };
  if (w > MAX_W || h > MAX_H) fail(`盤は ${MAX_W}×${MAX_H} まで（今 ${w}×${h}）`);
  const wall = new Uint8Array(w * h);
  let start = null, treasure = null, exit = null;
  const boxes = [];
  for (let y = 0; y < h; y++) {
    if (board[y].length !== w) fail(`${y} 行目の幅が違う`);
    for (let x = 0; x < w; x++) {
      const ch = board[y][x];
      if (ch === '#') wall[y * w + x] = 1;
      else if (ch === 'P') start = [x, y];
      else if (ch === 'B') boxes.push([x, y]);
      else if (ch === 'T') treasure = [x, y];
      else if (ch === 'E') exit = [x, y];
      else if (ch !== '.') fail(`知らない文字 ${ch}`);
    }
  }
  if (!start || !treasure || !exit) fail('P・T・E が1つずつ要る');
  if (!(exit[0] === 0 || exit[1] === 0 || exit[0] === w - 1 || exit[1] === h - 1)) fail('出口は盤の外周に置く');
  // 警備員の通るマスは床（壁・出口・宝・出発点でない）。道の途中に箱があってもよいが、警備員が今いるマスには置かない。
  const floor = (p) => p[0] >= 0 && p[1] >= 0 && p[0] < w && p[1] < h && !wall[p[1] * w + p[0]]
    && !same(p, exit) && !same(p, treasure) && !same(p, start);
  const taken = [];
  const guards = (data.guards || []).map((g, i) => {
    const cells = g.kind === 'patrol' ? g.path : [g.at];
    for (const c of cells) {
      if (!floor(c)) fail(`警備員${i + 1} の ${c} は床ではない`);
      if (taken.some((t) => same(t, c))) fail(`警備員${i + 1} の ${c} が他の警備員と重なる`);
      taken.push(c);
    }
    const here = g.kind === 'patrol' ? g.path[g.start ?? 0] : g.at;
    if (boxes.some((b) => same(b, here))) fail(`警備員${i + 1} の立つマスに箱がある`);
    if (g.kind === 'patrol') {
      if (g.path.length < 2) fail(`警備員${i + 1} の道は2マス以上`);
      const straight = g.path.every((p) => p[0] === g.path[0][0]) || g.path.every((p) => p[1] === g.path[0][1]);
      if (!straight) fail(`警備員${i + 1} の道は横か縦の一直線に限る`);
      for (let k = 1; k < g.path.length; k++) {
        const [a, b] = [g.path[k - 1], g.path[k]];
        if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) fail(`警備員${i + 1} の道がつながっていない`);
      }
      return Object.freeze({ kind: 'patrol', path: g.path, start: g.start ?? 0, dir: g.dir ?? 1 });
    }
    if (g.kind === 'watch') {
      if (!g.looks.length || g.looks.some((d) => !DIRS[d])) fail(`警備員${i + 1} の looks が不正`);
      return Object.freeze({ kind: 'watch', at: g.at, looks: g.looks, start: g.start ?? 0 });
    }
    return fail(`警備員${i + 1} の kind が不正`);
  });
  const lasers = (data.lasers || []).map((l, i) => {
    if (!wall[l.at[1] * w + l.at[0]]) fail(`レーザー${i + 1} は壁のマスに置く`);
    if (!DIRS[l.dir]) fail(`レーザー${i + 1} の向きが不正`);
    return Object.freeze({ at: l.at, dir: l.dir });
  });
  return Object.freeze({ id: data.id, w, h, wall, start, treasure, exit, boxes, guards, lasers, par: data.par ?? null });
}

export const inside = (level, p) => p[0] >= 0 && p[1] >= 0 && p[0] < level.w && p[1] < level.h;
export const isWall = (level, p) => level.wall[p[1] * level.w + p[0]] === 1;

// ---------------------------------------------------------------- 状態

// state = { player, boxes, guards, treasure, steps, status, caught }
//   guards[i] は巡回なら { i: 道の何番目, d: +1/-1 }、見張りなら { k: looks の何番目 }
//   status：'play'（遊んでいる）/ 'caught'（見つかった）/ 'escaped'（宝を持って出口に着いた）
export function initialState(level) {
  return {
    player: level.start,
    boxes: level.boxes,
    guards: level.guards.map((g) => (g.kind === 'patrol' ? { i: g.start, d: g.dir } : { k: g.start })),
    treasure: false,
    steps: 0,
    status: 'play',
    caught: null,
  };
}

// 警備員の今の位置と向き。巡回は進む向きを向く（道は一直線なので「次に進むマスの方」と同じ）。道の端では、来た向きのまま前を向く。
export function guardPose(level, index, gs) {
  const g = level.guards[index];
  if (g.kind === 'watch') return { at: g.at, facing: g.looks[gs.k] };
  const at = g.path[gs.i];
  const j = gs.i + gs.d;
  const facing = j >= 0 && j < g.path.length ? dirFrom(at, g.path[j]) : dirFrom(g.path[gs.i - gs.d], at);
  return { at, facing };
}

const guardAt = (level, guards, p) => guards.findIndex((gs, i) => same(guardPose(level, i, gs).at, p));

// ---------------------------------------------------------------- 光と影

// from の隣から dir の向きへまっすぐ進む光。壁・出口・盤の端と、光を止める箱で止まる。警備員・宝・怪盗は光を止めない。
function cast(level, boxes, from, dir, world) {
  const cells = [];
  let p = add(from, dir);
  while (inside(level, p)) {
    if (isWall(level, p)) return { cells, stop: { kind: 'wall', at: p } };
    if (same(p, level.exit)) return { cells, stop: { kind: 'exit', at: p } };
    const b = boxAt(boxes, p);
    if (b >= 0 && shades(world, b)) return { cells, stop: { kind: 'box', at: p, box: b } };
    cells.push(p);
    p = add(p, dir);
  }
  return { cells, stop: { kind: 'edge', at: p } };
}

// 今光っている線の一覧。並びは 警備員（番号順）→ レーザー（番号順）。見つかった原因もこの順で1つ選ぶ。
export function beams(level, state, world = NORMAL) {
  const out = [];
  state.guards.forEach((gs, index) => {
    const { at, facing } = guardPose(level, index, gs);
    out.push({ source: { kind: 'guard', index }, from: at, dir: facing, ...cast(level, state.boxes, at, facing, world) });
  });
  level.lasers.forEach((l, index) => {
    out.push({ source: { kind: 'laser', index }, from: l.at, dir: l.dir, ...cast(level, state.boxes, l.at, l.dir, world) });
  });
  return out;
}

const seenBy = (list, p) => list.find((b) => b.cells.some((c) => same(c, p))) || null;

// 影：箱に止められた光の、箱の向こう側のマス（壁・出口・盤の端まで）。どこかの光が当たっているマスは除く。
export function shadows(level, state, world = NORMAL) {
  const list = beams(level, state, world);
  const lit = new Set(list.flatMap((b) => b.cells.map((c) => c.join())));
  const out = [];
  for (const b of list) {
    if (b.stop.kind !== 'box') continue;
    const behind = cast(level, [], b.stop.at, b.dir, world).cells; // 箱を無視して、壁まで伸ばす
    for (const c of behind) if (!lit.has(c.join())) out.push({ cell: c, source: b.source, box: b.stop.box });
  }
  return out;
}

// ---------------------------------------------------------------- 警備員の1歩

// 巡回：次のマスが道の外（端）なら、その場で向きを変える（1歩使う）。次のマスに箱があっても、その場で引き返す。
// 見張り：looks の次の向きへ回る。looks が1つなら動かない。
function stepGuard(level, index, gs, boxes, world) {
  const g = level.guards[index];
  const from = guardPose(level, index, gs).at;
  if (g.kind === 'watch') {
    if (g.looks.length === 1) return { gs, move: { index, action: 'still', from, to: from } };
    const k = (gs.k + 1) % g.looks.length;
    return { gs: { k }, move: { index, action: 'rotate', from, to: from } };
  }
  const j = gs.i + gs.d;
  if (j < 0 || j >= g.path.length) return { gs: { i: gs.i, d: -gs.d }, move: { index, action: 'turn', from, to: from } };
  const b = boxAt(boxes, g.path[j]);
  if (b >= 0 && turnsGuard(world, b)) return { gs: { i: gs.i, d: -gs.d }, move: { index, action: 'turn-box', from, to: from, box: b } };
  return { gs: { i: j, d: gs.d }, move: { index, action: 'move', from, to: g.path[j] } };
}

export function stepGuards(level, state, world = NORMAL) {
  const moves = [];
  const guards = state.guards.map((gs, index) => {
    const r = stepGuard(level, index, gs, state.boxes, world);
    moves.push({ ...r.move, facing: guardPose(level, index, r.gs).facing });
    return r.gs;
  });
  return { guards, moves };
}

// 次の1歩の予告：怪盗が「待つ」としたら、警備員がどう動き、どこが光るか。画面の点線はこれを描く。
// 怪盗が箱を押した手では、箱の位置が変わるので、光（遮光・巡回）が予告と違って見えることがある（箱をどかすと光が戻る。箱を警備員の道へ押すと、警備員はその箱の前で引き返す）。
export function preview(level, state, world = NORMAL) {
  const { guards, moves } = stepGuards(level, state, world);
  return { moves, beams: beams(level, { ...state, guards }, world) };
}

// ---------------------------------------------------------------- 1手

// action：'U' 'R' 'D' 'L'（動く・前の箱を押す）か WAIT（待つ）。
// 戻り値 { valid, reason?, state, events }。valid=false の手は、手数も時間も進めない（画面では「ぶつかる」だけ）。
// 1手の順序：①怪盗が動く（箱を押す）→ ②宝のマスなら宝を取る → ③宝を持って出口に入ったら成功（ここで終わり）
//   → ④その時点の光が怪盗のマスに当たれば見つかる → ⑤警備員が1歩 → ⑥その時点の光が当たれば見つかる。
export function act(level, state, action, world = NORMAL) {
  if (state.status !== 'play') return { valid: false, reason: 'over', state, events: [] };
  const no = (reason) => ({ valid: false, reason, state, events: [] });
  const events = [];
  let { player, boxes, treasure } = state;
  let pushed = false;
  if (action === WAIT) {
    events.push({ type: 'wait', at: player });
  } else {
    if (!DIRS[action]) return no('unknown');
    const to = add(player, action);
    if (!inside(level, to)) return no('edge');
    if (isWall(level, to)) return no('wall');
    if (same(to, level.exit) && !treasure) return no('locked');
    if (guardAt(level, state.guards, to) >= 0) return no('guard');
    const b = boxAt(boxes, to);
    if (b >= 0) {
      if (!world.push) return no('nopush');
      const beyond = add(to, action);
      if (!inside(level, beyond) || isWall(level, beyond) || same(beyond, level.exit)
        || (!treasure && same(beyond, level.treasure)) || boxAt(boxes, beyond) >= 0
        || guardAt(level, state.guards, beyond) >= 0) return no('stuck');
      boxes = boxes.map((p, i) => (i === b ? beyond : p));
      events.push({ type: 'push', box: b, from: to, to: beyond });
      pushed = true;
    }
    events.push({ type: 'move', from: player, to, dir: action });
    player = to;
    if (!treasure && same(player, level.treasure)) {
      treasure = true;
      events.push({ type: 'treasure', at: player });
    }
    if (same(player, level.exit)) {
      events.push({ type: 'escape', at: player });
      return { valid: true, state: { ...state, player, boxes, treasure, steps: state.steps + 1, status: 'escaped' }, events };
    }
  }
  let next = { ...state, player, boxes, treasure, steps: state.steps + 1 };
  if (action !== WAIT) {
    const hit = seenBy(beams(level, next, world), player);
    if (hit) return caughtBy(next, events, hit, 'move', pushed ? 'uncovered' : 'walked-in');
  }
  const { guards, moves } = stepGuards(level, next, world);
  for (const m of moves) events.push({ type: 'guard', ...m });
  next = { ...next, guards };
  const hit = seenBy(beams(level, next, world), player);
  if (hit) {
    // ここで当たる光は、この1歩で動いた（向きを変えた）警備員のものだけ（レーザーと動かない見張りは④で当たっている）
    const m = hit.source.kind === 'guard' ? moves[hit.source.index] : null;
    const reason = { move: 'guard-move', turn: 'guard-turn', 'turn-box': 'guard-turn-box', rotate: 'guard-rotate' }[m?.action] ?? 'walked-in';
    return caughtBy(next, events, hit, 'guard', reason);
  }
  return { valid: true, state: next, events };
}

// 見つかった記録：どの光（source）が、何手目（step）に、どのマス（cell）で、なぜ（reason）当たったか。光の通り道（beam）も残す。
//   reason：walked-in（光の中へ入った）/ uncovered（押して箱をどかし、光が届いた）
//           guard-move（警備員が1歩進んだ）/ guard-turn（道の端で向きを変えた）/ guard-turn-box（箱の前で引き返した）/ guard-rotate（見張りが向きを変えた）
function caughtBy(state, events, hit, phase, reason) {
  const caught = { phase, reason, source: hit.source, cell: state.player, step: state.steps, beam: hit.cells, from: hit.from, dir: hit.dir };
  events.push({ type: 'caught', ...caught });
  return { valid: true, state: { ...state, status: 'caught', caught }, events };
}

// ---------------------------------------------------------------- 画面に要るものをまとめて

// 描画はこれ1つを見る：今の光（実線）・影・次の1歩の予告（点線）・警備員の位置と向き。
export function scene(level, state) {
  const now = beams(level, state);
  return {
    beams: now,
    lit: new Set(now.flatMap((b) => b.cells.map((c) => c.join()))),
    shadows: shadows(level, state),
    guards: state.guards.map((gs, i) => guardPose(level, i, gs)),
    preview: state.status === 'play' ? preview(level, state) : null,
  };
}

// ---------------------------------------------------------------- 星・詰み・再生

// 星：最少手数（par）以内で★3、par の1.5倍（端数切り上げ）以内で★2、それ以外のクリアは★1。
export function starsFor(par, steps) {
  if (steps <= par) return 3;
  if (steps <= Math.ceil(par * 1.5)) return 2;
  return 1;
}

export function stateKey(state) {
  const g = state.guards.map((s) => (s.k !== undefined ? s.k : `${s.i}${s.d > 0 ? '+' : '-'}`)).join(',');
  return `${state.player.join()}|${state.boxes.map((b) => b.join()).join(';')}|${g}|${state.treasure ? 1 : 0}`;
}

// 詰みの検出：ここから宝を持って出口に着けるか。幅優先で limit 個の状態まで調べる。
// 'alive'（まだ解ける）/ 'dead'（もう解けない。調べ尽くした）/ 'unknown'（limit を超えた）
// 詰んだ状態から行ける先はすべて詰んだ状態なので、limit が面の「詰み状態の総数」（levels.json の stats.dead）より大きければ、
// 'dead' は必ず見つかる（取りこぼさない）。'alive' の面で 'unknown' が返るのは害がない（何も出さないだけ）。
export const DEAD_CHECK_LIMIT = 10000;
export function canWin(level, state, limit = DEAD_CHECK_LIMIT, world = NORMAL) {
  if (state.status === 'escaped') return 'alive';
  if (state.status !== 'play') return 'dead';
  const seen = new Set([stateKey(state)]);
  let frontier = [state];
  while (frontier.length) {
    const next = [];
    for (const s of frontier) {
      for (const a of ACTIONS) {
        const r = act(level, s, a, world);
        if (!r.valid || r.state.status === 'caught') continue;
        if (r.state.status === 'escaped') return 'alive';
        const k = stateKey(r.state);
        if (seen.has(k)) continue;
        if (seen.size >= limit) return 'unknown';
        seen.add(k);
        next.push(r.state);
      }
    }
    frontier = next;
  }
  return 'dead';
}

// 手順の文字列（例 'RRU.L'）を最初から再生する。お手本の再生・罠の確認・テストに使う。
export function replay(level, moves, world = NORMAL) {
  let state = initialState(level);
  const history = [state];
  for (const a of moves) {
    const r = act(level, state, a, world);
    if (!r.valid) return { ok: false, at: history.length - 1, reason: r.reason, state, history };
    state = r.state;
    history.push(state);
    if (state.status !== 'play') break;
  }
  return { ok: true, state, history };
}
