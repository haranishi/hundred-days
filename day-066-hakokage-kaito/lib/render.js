/* 盤の SVG（1マス＝100単位、viewBox は 0 0 (列×100) (行×100)）。
   drawBoard：scene() を1回呼び、作業記録の 02_ui.md の順（床→影→今の光→予告→巡回の道→壁と台→出口と宝→箱→警備員→怪盗→見つかった印）に
   重ねて作り直す。色は app.css のクラスで付け、ここは形と data 属性（02_ui_hooks.md）だけを持つ。光・影・予告は scene() の結果を描くだけ。
   movePieces：怪盗・箱・警備員を CSS の transform で動かし、finish() を持つ物を返す。光・影・予告は動かさない（動きの終わりに drawBoard で描き直す）。 */
import { scene, DIRS } from './sim.js';
import { guardNumbers } from './phrase.js';
import { s } from './dom.js';

const U = 100; // 1マスの単位
export const ANGLE = Object.freeze({ R: 0, D: 90, L: 180, U: 270 }); // 右向きを0として、時計回りの度
const CENTER = [50, 50];

const at = (p) => `translate(${p[0] * U}px, ${p[1] * U}px)`;
const rect = (x, y, w, h, cls, extra) => s('rect', { x, y, width: w, height: h, class: cls, ...extra });
const cellRect = (x, y, cls, inset = 0, extra) => rect(x * U + inset, y * U + inset, U - inset * 2, U - inset * 2, cls, extra);
const add = (p, d) => [p[0] + DIRS[d][0], p[1] + DIRS[d][1]];
const key = (p) => p.join();

// 出口が盤のどの端にあるか（開いた扉の矢印を外へ向ける）
function outward(level) {
  const [x, y] = level.exit;
  if (y === 0) return 'U';
  if (y === level.h - 1) return 'D';
  if (x === 0) return 'L';
  return 'R';
}

// ---------------------------------------------------------------- 部品の形（セルの左上を原点とする）

function boxShape() {
  return [
    rect(10, 10, 80, 80, 'box-face', { rx: 10, 'stroke-width': 5 }),
    rect(40, 12, 20, 76, 'box-tape'),
  ];
}

function treasureShape() {
  return [
    s('path', { class: 'gold-body', d: 'M26 70 L20 52 L34 34 L58 28 L80 40 L82 62 L66 76 Z', 'stroke-width': 4, 'stroke-linejoin': 'round' }),
    s('path', { class: 'gold-shine', d: 'M36 44 L56 38 L68 46 M34 60 L52 66', fill: 'none', 'stroke-width': 4, 'stroke-linecap': 'round' }),
  ];
}

function exitShape(level) {
  const d = outward(level);
  const turn = { U: 270, R: 0, D: 90, L: 180 }[d];
  return [
    s('g', { class: 'door-closed' },
      rect(8, 8, 84, 84, 'exit-door', { rx: 8, 'stroke-width': 4 }),
      rect(32, 48, 36, 28, 'exit-lock', { rx: 5 }),
      s('path', { class: 'exit-shackle', d: 'M39 48 V40 a11 11 0 0 1 22 0 V48', fill: 'none', 'stroke-width': 6, 'stroke-linecap': 'round' })),
    s('g', { class: 'door-open' },
      rect(8, 8, 84, 84, 'exit-void', { rx: 8, 'stroke-width': 4 }),
      s('path', { class: 'exit-arrow', d: 'M26 50 H70 M54 32 L72 50 L54 68', fill: 'none', 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: `rotate(${turn} 50 50)` })),
  ];
}

/* 自分の駒。白い縁の外に、細い淡い輪を付ける（盤でいちばん地味で、どれが自分か迷った）。見つかったときは、赤白の二重の輪が代わりに付くので出さない。
   宝を持っているときは、体に小さな金の印を付ける（状態の行の「宝 持っている」だけでは、盤を見ていて気づかない） */
function playerShape({ ring = true, loot = false } = {}) {
  return [
    ...(ring ? [
      s('circle', { class: 'player-ring-under', cx: 50, cy: 52, r: 44, 'stroke-width': 7 }),
      s('circle', { class: 'player-ring', cx: 50, cy: 52, r: 44, 'stroke-width': 3 }),
    ] : []),
    s('path', { class: 'player-cloak', d: 'M50 34 C32 38 26 62 22 82 L78 82 C74 62 68 38 50 34 Z', 'stroke-width': 5, 'stroke-linejoin': 'round' }),
    s('circle', { class: 'player-head', cx: 50, cy: 28, r: 16, 'stroke-width': 5 }),
    rect(38, 24, 24, 7, 'player-eyes', { rx: 3 }),
    ...(loot ? [
      s('circle', { class: 'player-loot', cx: 62, cy: 66, r: 10, 'stroke-width': 3 }),
      s('path', { class: 'player-loot-shine', d: 'M58 63 L62 61', fill: 'none', 'stroke-width': 2.5, 'stroke-linecap': 'round' }),
    ] : []),
  ];
}

function boltShape() {
  return s('path', { class: 'bolt', d: 'M56 22 L34 54 H49 L42 80 L68 42 H52 Z', 'stroke-width': 3, 'stroke-linejoin': 'round' });
}

// 警備員の体。右向きを基準に描き、向きは guard-head の回転で表す。見張りは立ち姿にランプ、巡回は歩く足と道の破線で、形でも分ける
function guardHead(kind, facing) {
  const head = s('g', { class: 'guard-head' },
    rect(0, 0, U, U, 'guard-anchor', { fill: 'none', 'pointer-events': 'none' }), // 回転の基準（マス全体）
    s('polygon', { class: 'guard-beam', points: kind === 'watch' ? '72,42 98,24 98,76 72,58' : '70,42 98,26 98,74 70,58', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  if (kind === 'patrol') {
    head.append(
      s('ellipse', { class: 'guard-foot', cx: 30, cy: 34, rx: 8, ry: 5, 'stroke-width': 2 }),
      s('ellipse', { class: 'guard-foot', cx: 30, cy: 66, rx: 8, ry: 5, 'stroke-width': 2 }));
  }
  head.append(s('circle', { class: 'guard-body', cx: 46, cy: 50, r: 26, 'stroke-width': 5 }));
  if (kind === 'watch') {
    head.append(s('circle', { class: 'guard-lamp', cx: 68, cy: 50, r: 12, 'stroke-width': 3 }));
  } else {
    head.append(rect(56, 40, 10, 20, 'guard-visor', { rx: 4 }));
  }
  head.style.transform = `rotate(${ANGLE[facing]}deg)`;
  return head;
}

// ---------------------------------------------------------------- 予告の矢印（警備員のマスの上。回らない）

const arrowHead = (tip, dir, size = 12) => {
  const n = [-dir[1], dir[0]];
  const base = [tip[0] - dir[0] * size, tip[1] - dir[1] * size];
  return s('polygon', { class: 'next-head', points: [tip, [base[0] + n[0] * size * 0.8, base[1] + n[1] * size * 0.8], [base[0] - n[0] * size * 0.8, base[1] - n[1] * size * 0.8]].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '), 'stroke-width': 2, 'stroke-linejoin': 'round' });
};

const polar = (r, deg) => [CENTER[0] + r * Math.cos((deg * Math.PI) / 180), CENTER[1] + r * Math.sin((deg * Math.PI) / 180)];

// 中心まわりの円弧の矢印（a0 から a1 へ。a1 > a0 なら時計回り）。向きを変える予告に使う
function arcArrow(a0, a1) {
  const r = 40;
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, a1);
  const clockwise = a1 > a0;
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const t = clockwise ? a1 + 90 : a1 - 90; // 弧の終点での進行方向
  const dir = [Math.cos((t * Math.PI) / 180), Math.sin((t * Math.PI) / 180)];
  const d = `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${large} ${clockwise ? 1 : 0} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  return [
    s('path', { class: 'next-under', d, fill: 'none', 'stroke-width': 9, 'stroke-linecap': 'round' }),
    s('path', { class: 'next-line', d, fill: 'none', 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-dasharray': '5 7' }),
    arrowHead([x1 + dir[0] * 9, y1 + dir[1] * 9], dir, 11),
  ];
}

function previewArrow(move, facing) {
  if (!move || move.action === 'still') return null;
  if (move.action === 'move') {
    const d = [Math.sign(move.to[0] - move.from[0]), Math.sign(move.to[1] - move.from[1])];
    const a = [CENTER[0] + d[0] * 34, CENTER[1] + d[1] * 34];
    const b = [CENTER[0] + d[0] * 70, CENTER[1] + d[1] * 70];
    return [
      s('line', { class: 'next-under', x1: a[0], y1: a[1], x2: b[0], y2: b[1], 'stroke-width': 9, 'stroke-linecap': 'round' }),
      s('line', { class: 'next-line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-dasharray': '5 7' }),
      arrowHead([CENTER[0] + d[0] * 90, CENTER[1] + d[1] * 90], d, 13),
    ];
  }
  const from = ANGLE[facing];
  if (move.action === 'rotate') {
    const to = ANGLE[move.facing];
    const delta = ((to - from + 540) % 360) - 180; // 近い回り方（180度ちょうどは時計回り）
    return arcArrow(from, from + (delta === -180 ? 180 : delta));
  }
  // turn・turn-box：その場で反対を向く（Uの字）
  return arcArrow(from, from + 180);
}

// ---------------------------------------------------------------- 盤

/* status：play・caught・dead・escaped・demo。予告（点線・矢印）は play と demo だけ。
   markBox：詰みのとき、最後に押した箱の番号（二重の輪を付ける） */
export function drawBoard(svg, level, state, { cell = 56, status = 'play', markBox = null } = {}) {
  const sc = scene(level, state);
  const W = level.w * U;
  const H = level.h * U;
  const showNext = (status === 'play' || status === 'demo') && sc.preview;
  const nextBeams = showNext ? sc.preview.beams : [];
  const nextAll = new Set(nextBeams.flatMap((b) => b.cells.map(key)));
  const nextGuard = new Set(nextBeams.filter((b) => b.source.kind === 'guard').flatMap((b) => b.cells.map(key)));
  const guardLit = new Set(sc.beams.filter((b) => b.source.kind === 'guard').flatMap((b) => b.cells.map(key)));
  const shadowSet = new Set(sc.shadows.map((x) => key(x.cell)));
  const numbers = guardNumbers(level);

  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', String(level.w * cell));
  svg.setAttribute('height', String(level.h * cell));
  svg.dataset.cols = String(level.w);
  svg.dataset.rows = String(level.h);

  const layer = (cls) => {
    const g = s('g', { class: `layer ${cls}`, 'aria-hidden': 'true' });
    svg.append(g);
    return g;
  };

  svg.append(s('defs', {},
    s('pattern', { id: 'hk-hatch', width: 24, height: 24, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, rect(0, 0, 8, 24, 'hatch-line')),
    s('linearGradient', { id: 'hk-flare', x1: 0, y1: 0, x2: 1, y2: 0 }, s('stop', { offset: 0, class: 'flare-a' }), s('stop', { offset: 1, class: 'flare-b' }))));

  // ① 床（全マスに1つずつ。光・予告・影の印は、画面に見えているものと同じ集合）
  const floor = layer('layer-floor');
  for (let y = 0; y < level.h; y++) {
    for (let x = 0; x < level.w; x++) {
      const k = `${x},${y}`;
      floor.append(cellRect(x, y, 'cell', 0, {
        'data-x': x,
        'data-y': y,
        'data-wall': level.wall[y * level.w + x] === 1 ? '1' : null,
        'data-lit': sc.lit.has(k) ? '1' : null,
        'data-next': nextAll.has(k) ? '1' : null,
        'data-shadow': shadowSet.has(k) ? '1' : null,
        'stroke-width': 1,
      }));
    }
  }

  // ② 影：箱に止められた光の向こう側。箱に接する辺には、影の向きへ伸びる薄いくさび（箱が落とした影に見せる）
  const shadow = layer('layer-shadow');
  for (const b of sc.beams) {
    if (b.stop.kind !== 'box') continue;
    const first = add(b.stop.at, b.dir);
    if (!shadowSet.has(key(first))) continue;
    shadow.append(s('g', { class: 'flare', transform: `translate(${first[0] * U + 50} ${first[1] * U + 50}) rotate(${ANGLE[b.dir]})` },
      s('polygon', { points: '-50,-50 -50,-64 0,-50', fill: 'url(#hk-flare)' }),
      s('polygon', { points: '-50,50 -50,64 0,50', fill: 'url(#hk-flare)' })));
  }
  for (const k of shadowSet) {
    const [x, y] = k.split(',').map(Number);
    shadow.append(cellRect(x, y, 'shadow-cell'));
  }

  // ③ 今の光：警備員の光は塗りと斜線、レーザーはマスの中心を通る線（太い外側と赤い芯）
  const light = layer('layer-light');
  for (const k of guardLit) {
    const [x, y] = k.split(',').map(Number);
    light.append(cellRect(x, y, 'lit-cell'), cellRect(x, y, 'lit-hatch', 0, { fill: 'url(#hk-hatch)' }));
  }
  for (const b of sc.beams) {
    if (b.source.kind !== 'laser' || !b.cells.length) continue;
    const d = DIRS[b.dir];
    const last = b.cells[b.cells.length - 1];
    const a = [b.from[0] * U + 50 + d[0] * 50, b.from[1] * U + 50 + d[1] * 50];
    const z = [last[0] * U + 50 + d[0] * 50, last[1] * U + 50 + d[1] * 50];
    light.append(
      s('line', { class: 'laser-case', x1: a[0], y1: a[1], x2: z[0], y2: z[1], 'stroke-width': 18 }),
      s('line', { class: 'laser-core', x1: a[0], y1: a[1], x2: z[0], y2: z[1], 'stroke-width': 8 }));
  }

  // ④ 次の1歩の予告：次に光るマスの内側に点線の枠（レーザーは動かないので描かない）
  const next = layer('layer-next');
  for (const k of nextGuard) {
    const [x, y] = k.split(',').map(Number);
    next.append(cellRect(x, y, 'next-under', 10, { fill: 'none', 'stroke-width': 8 }), cellRect(x, y, 'next-frame', 10, { fill: 'none', 'stroke-width': 4, 'stroke-dasharray': '6 8' }));
  }

  // ⑤ 巡回の道：道のマスの中心を結ぶ破線。端に小さな丸
  const paths = layer('layer-path');
  level.guards.forEach((g, i) => {
    if (g.kind !== 'patrol') return;
    const pts = g.path.map((p) => `${p[0] * U + 50},${p[1] * U + 50}`).join(' ');
    paths.append(s('g', { class: 'patrol-path', 'data-i': i },
      s('polyline', { class: 'path-under', points: pts, fill: 'none', 'stroke-width': 10, 'stroke-linecap': 'round' }),
      s('polyline', { class: 'path-line', points: pts, fill: 'none', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-dasharray': '12 9' }),
      ...[g.path[0], g.path[g.path.length - 1]].map((p) => s('circle', { class: 'path-end', cx: p[0] * U + 50, cy: p[1] * U + 50, r: 8, 'stroke-width': 3 }))));
  });

  // ⑥ 壁とレーザーの台
  const walls = layer('layer-wall');
  for (let y = 0; y < level.h; y++) {
    for (let x = 0; x < level.w; x++) {
      if (level.wall[y * level.w + x] !== 1) continue;
      walls.append(cellRect(x, y, 'wall', 1.5, { 'stroke-width': 3 }), rect(x * U + 3, y * U + 3, U - 6, 12, 'wall-top'));
    }
  }
  level.lasers.forEach((l, i) => {
    const g = s('g', { class: 'laser-src', 'data-i': i, 'data-x': l.at[0], 'data-y': l.at[1], 'data-dir': l.dir }, boltShape());
    g.setAttribute('transform', `translate(${l.at[0] * U} ${l.at[1] * U})`);
    walls.append(g);
  });

  // ⑦ 出口と宝（出口は宝を取るまで閉じた扉。宝は取ると消える）
  const goal = layer('layer-goal');
  const exit = s('g', { class: 'exit', 'data-open': state.treasure ? '1' : '0', 'data-x': level.exit[0], 'data-y': level.exit[1], transform: `translate(${level.exit[0] * U} ${level.exit[1] * U})` }, ...exitShape(level));
  // きらめきの動きは内側の組に掛ける（位置を持つ外側に掛けると、位置がずれる）
  const treasure = s('g', { class: 'treasure', 'data-taken': state.treasure ? '1' : '0', 'data-x': level.treasure[0], 'data-y': level.treasure[1], transform: `translate(${level.treasure[0] * U} ${level.treasure[1] * U})` },
    s('g', { class: 'treasure-fx' }, ...treasureShape()));
  goal.append(exit, treasure);

  // ⑧ 箱
  const boxes = layer('layer-box');
  state.boxes.forEach((p, i) => {
    const g = s('g', { class: 'box', 'data-i': i, 'data-x': p[0], 'data-y': p[1] }, ...boxShape());
    g.style.transform = at(p);
    boxes.append(g);
  });

  // ⑨ 警備員（予告の矢印つき）
  const guards = layer('layer-guard');
  const cause = status === 'caught' && state.caught ? state.caught.source : null;
  level.guards.forEach((g, i) => {
    const pose = sc.guards[i];
    const mv = showNext ? sc.preview.moves[i] : null;
    const el = s('g', {
      class: `guard guard--${g.kind}${cause && cause.kind === 'guard' && cause.index === i ? ' is-cause' : ''}`,
      'data-i': i,
      'data-kind': g.kind,
      'data-x': pose.at[0],
      'data-y': pose.at[1],
      'data-facing': pose.facing,
      'data-next-action': mv ? mv.action : null,
    }, guardHead(g.kind, pose.facing));
    if (numbers[i] !== null) {
      el.append(s('g', { class: 'badge' }, s('circle', { class: 'badge-disc', cx: 27, cy: 27, r: 21, 'stroke-width': 3 }), s('text', { class: 'badge-text', x: 27, y: 27, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 34 }, String(numbers[i]))));
    }
    const arrow = mv ? previewArrow(mv, pose.facing) : null;
    if (arrow) el.append(s('g', { class: 'guard-next' }, ...arrow));
    el.style.transform = at(pose.at);
    guards.append(el);
  });
  if (cause && cause.kind === 'laser') walls.querySelector(`.laser-src[data-i="${cause.index}"]`)?.classList.add('is-cause');

  // ⑩ 怪盗
  const players = layer('layer-player');
  const player = s('g', { class: `player${status === 'escaped' ? ' is-gone' : ''}`, 'data-x': state.player[0], 'data-y': state.player[1] }, ...playerShape({ ring: status !== 'caught', loot: state.treasure }));
  player.style.transform = at(state.player);
  players.append(player);

  // ⑪ 見つかった印：原因の光の通り道を二重の枠で囲み、怪盗のマスに二重の輪と「！」の札を出す
  if (status === 'caught' && state.caught) {
    const marks = layer('layer-caught');
    for (const [x, y] of state.caught.beam) {
      marks.append(s('g', { class: 'caught-beam', 'data-x': x, 'data-y': y },
        cellRect(x, y, 'cb-outer', 4, { fill: 'none', 'stroke-width': 8 }),
        cellRect(x, y, 'cb-inner', 10, { fill: 'none', 'stroke-width': 3 })));
    }
    const [px, py] = state.player;
    marks.append(s('g', { class: 'caught-mark', transform: `translate(${px * U} ${py * U})` },
      s('circle', { class: 'cm-outer', cx: 50, cy: 50, r: 46, fill: 'none', 'stroke-width': 6 }),
      s('circle', { class: 'cm-inner', cx: 50, cy: 50, r: 39, fill: 'none', 'stroke-width': 3 }),
      s('circle', { class: 'cm-tag', cx: 80, cy: 20, r: 18, 'stroke-width': 3 }),
      rect(77, 9, 6, 15, 'cm-bang', { rx: 3 }),
      s('circle', { class: 'cm-bang', cx: 80, cy: 30, r: 3.4 })));
  }

  // 詰み：盤に暗い膜。最後に押した箱に二重の輪
  if (status === 'dead') {
    const veil = layer('layer-dead');
    veil.append(rect(0, 0, W, H, 'dead-veil'));
    const p = markBox !== null ? state.boxes[markBox] : null;
    if (p) {
      veil.append(
        cellRect(p[0], p[1], 'dead-ring', 3, { fill: 'none', 'stroke-width': 8, rx: 14 }),
        cellRect(p[0], p[1], 'dead-ring-inner', 10, { fill: 'none', 'stroke-width': 3, rx: 10 }));
    }
  }

  // 盤の外枠（3px・角丸12px）。画面の px を盤の単位に直して描く
  const k = U / cell;
  const frame = layer('layer-frame');
  frame.append(rect(1.5 * k, 1.5 * k, W - 3 * k, H - 3 * k, 'board-frame', { rx: 11 * k, 'stroke-width': 3 * k, fill: 'none' }));
  return sc;
}

// ---------------------------------------------------------------- 動き

/* events（act() が返す）に沿って、怪盗・箱・警備員を ms ミリ秒で動かす。ms が0なら終わりの位置へすぐ。
   光・影・予告・見つかった印は動かさない（呼ぶ側が、動きの終わりに drawBoard で描き直す）。
   戻り値の finish() は、動いている途中でも終わりの位置へ飛ばす（連打・画面の回転・裏のタブ）。何度呼んでもよい。 */
export function movePieces(svg, events, ms) {
  const jobs = [];
  const one = (sel) => svg.querySelector(sel);
  const job = (el, patch) => {
    if (!el) return;
    jobs.push({ el, ...patch });
  };
  let treasureEl = null;
  let exitEl = null;
  for (const e of events) {
    if (e.type === 'move') job(one('.player'), { transform: at(e.to), pos: e.to });
    else if (e.type === 'push') job(one(`.box[data-i="${e.box}"]`), { transform: at(e.to), pos: e.to });
    else if (e.type === 'guard') {
      const el = one(`.guard[data-i="${e.index}"]`);
      const head = el?.querySelector('.guard-head');
      let rotate = null;
      if (head && e.facing && el.dataset.facing !== e.facing) {
        const from = ANGLE[el.dataset.facing];
        const delta = ((ANGLE[e.facing] - from + 540) % 360) - 180;
        rotate = `rotate(${from + (delta === -180 ? 180 : delta)}deg)`;
      }
      job(el, { transform: at(e.to), pos: e.to, facing: e.facing, head, rotate });
    } else if (e.type === 'treasure') {
      treasureEl = one('.treasure');
      exitEl = one('.exit');
    } else if (e.type === 'escape') {
      const p = jobs.find((j) => j.el.classList.contains('player'));
      if (p) p.fade = true;
    }
  }

  svg.getBoundingClientRect(); // いまの見た目を確定させてから変える（確定前に変えると、動かずに飛ぶ）
  svg.classList.add('is-moving');
  for (const j of jobs) {
    j.el.style.transitionDuration = `${ms}ms`;
    j.el.style.transform = j.transform;
    if (j.fade) j.el.style.opacity = '0';
    if (j.head) {
      j.head.style.transitionDuration = `${ms}ms`;
      if (j.rotate) j.head.style.transform = j.rotate;
    }
  }
  if (treasureEl) {
    treasureEl.dataset.taken = '1';
    treasureEl.classList.add('is-taking');
  }
  if (exitEl) exitEl.dataset.open = '1';

  let done = false;
  return {
    count: jobs.length,
    finish() {
      if (done) return;
      done = true;
      svg.classList.remove('is-moving');
      for (const j of jobs) {
        j.el.style.transition = 'none'; // 動いている途中の動きを止めて、終わりの位置に置く
        j.el.style.transform = j.transform;
        j.el.dataset.x = String(j.pos[0]);
        j.el.dataset.y = String(j.pos[1]);
        if (j.facing) j.el.dataset.facing = j.facing;
        if (j.head && j.rotate) {
          j.head.style.transition = 'none';
          j.head.style.transform = j.rotate;
        }
      }
    },
  };
}

// 無効な手：怪盗がその方向へ6pxだけ揺れて戻る（120ms）。動きを減らす設定では呼ばない
export function bumpPlayer(svg, dir, ms, cell) {
  const el = svg.querySelector('.player');
  if (!el || !el.animate) return;
  const base = at([Number(el.dataset.x), Number(el.dataset.y)]);
  const k = (6 * U) / cell;
  const d = DIRS[dir];
  el.animate(
    [{ transform: base }, { transform: `${base} translate(${d[0] * k}px, ${d[1] * k}px)` }, { transform: base }],
    { duration: ms, easing: 'cubic-bezier(.2, .8, .2, 1)' },
  );
}
