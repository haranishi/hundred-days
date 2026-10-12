/* 地図（SVG・盤は幅360×高さ240）。線路は2本の平行線＋枕木（枕木の数＝その線路を走る分）。
   2分以上かかる線路には、線路の横に分の札（「2」「3」…）を出す。
   viewBox の高さは面ごとに、駅・分岐・曲げ点の範囲に上下の余白を足した高さに縮める（幅360は変えない）。
   駅は角丸の建物＋絵文字＋「焼く 3分」、分岐は小さな円、車庫と配膳駅は建物。
   分岐の切替ボタンは SVG の上に重ねた HTML の button（Tab・Enter・Space で押せる）。位置だけは JS で入れる。
   再生は frame(t) に分（小数）を渡すと、その瞬間の列車の位置と駅の様子を描く（時刻だけから決まる）。
   列車の丸には出発の番号を付ける（同じ絵の列車を、色に頼らず見分ける）。 */
import { s, h, clear } from './dom.js';
import { KINDS } from './sim.js';
import { STEPS, ingredientIcon } from './recipes.js';
import { burnMinute } from './explain.js';
import { edgePoints, polyLength, pointAt, subPath, rectExit, offsetPolyline, pointsAttr, round } from './geometry.js';

export const VIEW = { w: 360, h: 240 };
const HALF = { station: [29, 21], yard: [18, 15], serve: [17, 20] };
const CHIP_R = 11;
const RAIL_GAP = 2.7;
const POP_MIN = 1.4; // 配膳の「はじける」演出の長さ（分）
const BURN_SHOW_MIN = 1; // 焦げた瞬間に駅を出ていても、「焦げた！」をその駅に出しておく分
// 出発の番号の丸（列車の丸の左の縁）。左上に置くと、駅の上の「ジリジリ」「焦げた！」の文字にかかった
const NO_AT = [-18, 0];
const NO_R = 9;
// 列車の丸どうしを離す距離（丸＝半径11＋縁、番号の丸＝半径9）。合流の手前で丸が重なって番号が読めなかった
const SEP_DISC = 26;
const SEP_DISC_BADGE = 22;
const SEP_BADGE = 18;
// 「遅れ」の文字の大きさ（13.5の2文字＋白い縁）と、列車の丸から見た置き場所の候補（中心）
const LATE_W = 34;
const LATE_H = 20;
const LATE_SPOTS = [
  [CHIP_R + 7 + LATE_W / 2, 0], [-(CHIP_R + 7 + LATE_W / 2), 0],
  [0, -(CHIP_R + 7 + LATE_H / 2)], [0, CHIP_R + 7 + LATE_H / 2],
  [CHIP_R + 4 + LATE_W / 2, CHIP_R + 4 + LATE_H / 2], [-(CHIP_R + 4 + LATE_W / 2), CHIP_R + 4 + LATE_H / 2],
  [CHIP_R + 4 + LATE_W / 2, -(CHIP_R + 4 + LATE_H / 2)], [-(CHIP_R + 4 + LATE_W / 2), -(CHIP_R + 4 + LATE_H / 2)],
];

function overlapArea(a, b) {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const hh = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  return w > 0 && hh > 0 ? w * hh : 0;
}

const halfOf = (kind) => (KINDS[kind] ? HALF.station : HALF[kind] ?? null);
const CLEAR_R = CHIP_R + 3; // 列車の円（濃い縁まで）が建物にかからない距離

// 点と長方形（中心 c・半分の幅と高さ half）のすき間
function rectGap(p, c, half) {
  return Math.hypot(Math.max(Math.abs(p.x - c[0]) - half[0], 0), Math.max(Math.abs(p.y - c[1]) - half[1], 0));
}

// 合流の手前で待つ列車どうしが重ならない距離（入ってくる線路どうしの角度が狭いほど手前で止める）
function junctionClearance(level, edge, visible) {
  const at = level.nodes[edge.to].pos;
  const backAngle = (e) => {
    const pts = edgePoints(level, e);
    const q = pts[pts.length - 2];
    return Math.atan2(q[1] - at[1], q[0] - at[0]);
  };
  const mine = backAngle(edge);
  let narrow = Math.PI;
  for (const other of level.edges) {
    if (other.to !== edge.to || other.id === edge.id) continue;
    let d = Math.abs(backAngle(other) - mine) % (2 * Math.PI);
    if (d > Math.PI) d = 2 * Math.PI - d;
    narrow = Math.min(narrow, d);
  }
  const ideal = narrow >= Math.PI ? 9 : CLEAR_R / Math.sin(narrow / 2);
  return Math.min(Math.max(9, ideal), Math.max(9, visible * 0.5));
}

/* 線路の形：中心どうしの折れ線と、列車が走る範囲 range=[a,b]（始点からの距離）。
   建物（駅・車庫・配膳駅）の側は、列車の円が建物の四角から離れるところまで。斜めに入る線路でも角にかからない */
export function edgeGeom(level, edge) {
  const pts = edgePoints(level, edge);
  const total = polyLength(pts);
  const n = pts.length;
  const fromKind = level.nodes[edge.from].kind;
  const toKind = level.nodes[edge.to].kind;
  const trim = (kind, p, q) => {
    const half = halfOf(kind);
    return half ? rectExit(half[0], half[1], q[0] - p[0], q[1] - p[1]) : 0;
  };
  const startTrim = trim(fromKind, pts[0], pts[1]);
  const endTrim = trim(toKind, pts[n - 1], pts[n - 2]);
  let a = startTrim;
  const fromHalf = halfOf(fromKind);
  if (fromHalf) while (a < total && rectGap(pointAt(pts, a), pts[0], fromHalf) < CLEAR_R) a += 0.5;
  let b = total - endTrim;
  const toHalf = halfOf(toKind);
  if (toHalf) while (b > 0 && rectGap(pointAt(pts, b), pts[n - 1], toHalf) < CLEAR_R) b -= 0.5;
  else if (toKind === 'junction') b = total - junctionClearance(level, edge, total - a);
  if (b < a) a = b = (a + b) / 2;
  return { pts, total, startTrim, endTrim, fromKind, toKind, range: [a, b] };
}

/* 面ごとの viewBox（上端と高さ）。ノードと曲げ点の y の範囲に上下 26 の余白（盤の 0〜240 を超えない）。
   面1・2のように線路が上半分にしか無い面で、地図の下半分が空白にならないようにする */
const VIEW_PAD = 26;
const HOT_LABEL_ROOM = 42; // 火の駅の上に「ジリジリ」「焦げた！」を出す分（建物の上端21＋文字）
export function mapView(level) {
  const ys = [
    ...Object.values(level.nodes).map((n) => n.pos[1]),
    ...level.edges.flatMap((e) => (e.via ?? []).map((p) => p[1])),
  ];
  // 上端に近い火の駅があれば、その上に文字を出せるだけ上の余白を広げる（下に回すと、手前で待つ列車に重なる）
  const hotTops = Object.values(level.nodes).filter((n) => KINDS[n.kind]?.hot).map((n) => n.pos[1] - HOT_LABEL_ROOM);
  const top = Math.max(0, Math.min(Math.min(...ys) - VIEW_PAD, ...hotTops));
  const bottom = Math.min(VIEW.h, Math.max(...ys) + VIEW_PAD);
  return { top, h: bottom - top };
}

/* 2分以上かかる線路の、分の札の置き場所（盤の単位）。線路の中ほどから外へ順に候補を試し、
   分岐ボタン（320px幅で半径約27単位）・建物（駅の文字を含む）・ほかの札・盤の端にかからない最初の位置を使う */
const TAG_HALF = 8;
const BRANCH_CLEAR = 28;
const TAG_FRACTIONS = [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8, 0.15, 0.85, 0.1, 0.9];

function nodeBox(n) {
  const [x, y] = n.pos;
  if (KINDS[n.kind]) return [x - 29, y - 21, x + 29, y + 21];
  if (n.kind === 'yard') return [x - 20, y - 24, x + 20, y + 15];
  if (n.kind === 'serve') return [x - 17, y - 36, x + 24, y + 20];
  return [x - 6.5, y - 6.5, x + 6.5, y + 6.5];
}

/* 「遅れ」の文字が避ける四角と重み。建物の名前（「焼く 3分」「車庫」「配膳」）に重ねるのがいちばん困るので重くする。
   建物の色の部分にかかるのは、名前にかかるよりまし */
const NAME_W = 20;
function avoidBoxes(n) {
  const [x, y] = n.pos;
  const body = { b: nodeBox(n), w: n.kind === 'junction' ? 2 : 1 };
  if (KINDS[n.kind]) return [body, { b: [x - 27, y + 1, x + 27, y + 20], w: NAME_W }];
  if (n.kind === 'yard') return [body, { b: [x - 16, y - 8, x + 16, y + 10], w: NAME_W }];
  if (n.kind === 'serve') return [body, { b: [x - 16, y + 2, x + 16, y + 19], w: NAME_W }];
  return [body];
}

const boxesOverlap = (a, b, margin) => a[0] < b[2] + margin && b[0] < a[2] + margin && a[1] < b[3] + margin && b[1] < a[3] + margin;
const boxPointGap = (b, [x, y]) => Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - y, 0, y - b[3]));

export function lengthTags(level, view = mapView(level)) {
  const branches = Object.keys(level.nodes)
    .filter((id) => level.nodes[id].kind === 'junction' && level.edges.filter((e) => e.from === id).length > 1)
    .map((id) => level.nodes[id].pos);
  const boxes = Object.values(level.nodes).map(nodeBox);
  const placed = [];
  const out = [];
  for (const e of level.edges) {
    if (e.len < 2) continue;
    const g = edgeGeom(level, e);
    const a = g.startTrim;
    const b = g.total - g.endTrim;
    let found = null;
    for (const off of [12, 16]) {
      for (const f of TAG_FRACTIONS) {
        for (const side of [1, -1]) {
          const p = pointAt(g.pts, a + (b - a) * f);
          const x = p.x - Math.sin(p.angle) * off * side;
          const y = p.y + Math.cos(p.angle) * off * side;
          const box = [x - TAG_HALF, y - TAG_HALF, x + TAG_HALF, y + TAG_HALF];
          if (box[0] < 0 || box[2] > VIEW.w || box[1] < view.top || box[3] > view.top + view.h) continue;
          if (boxes.some((n) => boxesOverlap(box, n, 2))) continue;
          if (branches.some((c) => boxPointGap(box, c) < BRANCH_CLEAR)) continue;
          if (placed.some((q) => boxesOverlap(box, q, 2))) continue;
          found = { x, y, box };
          break;
        }
        if (found) break;
      }
      if (found) break;
    }
    if (!found) {
      // どこにも置けないときは中点の横（ここに来たら面の座標を見直す。tests/render.test.mjs が見張る）
      const p = pointAt(g.pts, (a + b) / 2);
      const x = p.x - Math.sin(p.angle) * 12;
      const y = p.y + Math.cos(p.angle) * 12;
      found = { x, y, box: [x - TAG_HALF, y - TAG_HALF, x + TAG_HALF, y + TAG_HALF], fallback: true };
    }
    placed.push(found.box);
    out.push({ edge: e.id, len: e.len, x: round(found.x), y: round(found.y), box: found.box, fallback: Boolean(found.fallback) });
  }
  return out;
}

export function createMap({ svg, switchLayer, onSwitch, onHint }) {
  let level = null;
  let geoms = {};
  const L = {};
  let chips = {};
  let fx = {};
  let pops = {};
  let model = null;
  let view = { top: 0, h: VIEW.h };
  let fxLabelBox = {};
  let fxText = {}; // 「ジリジリ」「焦げた！」の文字。列車より上の層に置く（列車の丸に「！」が隠れた）
  let fixedBoxes = []; // 地図の上で動かない物の四角と重み（{ b, w }）。「遅れ」の文字の置き場所を探すときに避ける

  function layer(name) {
    const g = s('g', { class: `m-${name}` });
    svg.append(g);
    L[name] = g;
    return g;
  }

  function setLevel(next) {
    level = next;
    view = mapView(level);
    svg.setAttribute('viewBox', `0 ${view.top} ${VIEW.w} ${view.h}`);
    geoms = Object.fromEntries(level.edges.map((e) => [e.id, edgeGeom(level, e)]));
    for (const node of [...svg.childNodes]) if (node.nodeName !== 'title') node.remove();
    clear(switchLayer);
    fx = {};
    fxText = {};
    fxLabelBox = {};
    fixedBoxes = [...Object.values(level.nodes).flatMap(avoidBoxes), ...lengthTags(level, view).map((t) => ({ b: t.box, w: 5 }))];
    ['ground', 'rails', 'routes', 'tags', 'nodes', 'arrows', 'fx', 'trains', 'fxtext', 'pops', 'hits'].forEach(layer);
    drawRails();
    drawTags();
    drawNodes();
    drawHits();
    chips = {};
    pops = {};
    model = null;
  }

  function drawRails() {
    for (const e of level.edges) {
      const g = geoms[e.id];
      const group = s('g', { class: 'rail', 'data-edge': e.id });
      // 枕木：建物の縁から縁までに、len 本を等間隔で
      const a = g.startTrim + 3;
      const b = g.total - g.endTrim - 3;
      for (let i = 0; i < e.len; i++) {
        const d = a + ((i + 0.5) * (b - a)) / e.len;
        const p = pointAt(g.pts, d);
        const nx = -Math.sin(p.angle) * 6;
        const ny = Math.cos(p.angle) * 6;
        group.append(s('line', { class: 'rail__tie', x1: round(p.x - nx), y1: round(p.y - ny), x2: round(p.x + nx), y2: round(p.y + ny) }));
      }
      for (const side of [-RAIL_GAP, RAIL_GAP]) {
        group.append(s('polyline', { class: 'rail__line', points: pointsAttr(offsetPolyline(g.pts, side)) }));
      }
      L.rails.append(group);
    }
  }

  // 2分以上かかる線路の横に、分の札
  function drawTags() {
    for (const t of lengthTags(level, view)) {
      L.tags.append(s('g', { class: 'len-tag', transform: `translate(${t.x} ${t.y})`, 'data-edge': t.edge },
        s('rect', { class: 'len-tag__box', x: -TAG_HALF, y: -TAG_HALF, width: TAG_HALF * 2, height: TAG_HALF * 2, rx: 4 }),
        s('text', { class: 'map-text len-tag__text', x: 0, y: 0.5, text: String(t.len) })));
    }
  }

  function drawNodes() {
    const outs = (n) => level.edges.filter((e) => e.from === n).length;
    for (const [id, n] of Object.entries(level.nodes)) {
      const [x, y] = n.pos;
      const at = `translate(${x} ${y})`;
      if (n.kind === 'junction') {
        const branch = outs(id) > 1;
        L.nodes.append(s('circle', { class: `junction${branch ? ' junction--branch' : ''}`, cx: x, cy: y, r: branch ? 6.5 : 5, 'data-node': id }));
      } else if (n.kind === 'yard') {
        L.nodes.append(s('g', { class: 'yard', transform: at },
          s('rect', { class: 'yard__body', x: -18, y: -15, width: 36, height: 30, rx: 5 }),
          s('path', { class: 'yard__roof', d: 'M-20 -13 L0 -24 L20 -13 Z' }),
          s('text', { class: 'map-text yard__text', x: 0, y: 1, text: '車庫' })));
      } else if (n.kind === 'serve') {
        L.nodes.append(s('g', { class: 'serve', transform: at },
          s('line', { class: 'serve__pole', x1: 10, y1: -20, x2: 10, y2: -36 }),
          s('path', { class: 'serve__flag', d: 'M10 -36 L24 -31 L10 -26 Z' }),
          s('rect', { class: 'serve__body', x: -17, y: -20, width: 34, height: 40, rx: 6 }),
          s('text', { class: 'map-emoji', x: 0, y: -8, text: '🍽️' }),
          s('text', { class: 'map-text serve__text', x: 0, y: 10.5, text: '配膳' })));
      } else if (KINDS[n.kind]) {
        const time = n.time ?? KINDS[n.kind].time;
        L.nodes.append(s('g', { class: `station st-${n.kind}`, transform: at, 'data-node': id },
          s('rect', { class: 'station__body', x: -29, y: -21, width: 58, height: 42, rx: 8 }),
          s('text', { class: 'map-emoji', x: 0, y: -8, text: STEPS[n.kind].icon }),
          s('rect', { class: 'station__plate', x: -26, y: 2.5, width: 52, height: 16, rx: 4 }),
          s('text', { class: 'map-text station__text', x: 0, y: 10.5, text: `${STEPS[n.kind].label} ${time}分` })));
        // 再生中の様子（炎・泡・煙・「ジリジリ」「焦げた！」）。ふだんは見えない
        const top = y - 21 - 9 - 8 < view.top; // 地図の上端に近い駅は、文字を建物の下に出す
        const ly = top ? 21 + 15 : -21 - 9;
        fx[id] = s('g', { class: `station-fx fx-${n.kind}`, transform: at, 'data-node': id },
          s('text', { class: 'fx__flame', x: 20, y: -18, text: '🔥' }),
          s('g', { class: 'fx__bubbles' }, s('circle', { cx: -8, cy: -20, r: 2.6 }), s('circle', { cx: 0, cy: -22, r: 2 }), s('circle', { cx: 8, cy: -20, r: 2.4 })),
          // 煙は「焦げた！」の文字と列車に隠れないよう、建物の右の外に出す（地図の上端で切れない高さ）
          s('g', { class: 'fx__smoke' }, s('circle', { cx: 35, cy: 2, r: 4.5 }), s('circle', { cx: 40, cy: -8, r: 6 }), s('circle', { cx: 35, cy: -18, r: 5 })));
        L.fx.append(fx[id]);
        fxText[id] = s('g', { class: `station-fx-text fx-${n.kind}`, transform: at, 'data-node': id },
          s('text', { class: 'map-text fx__label fx__label--sizzle', x: 0, y: ly, text: 'ジリジリ' }),
          s('text', { class: 'map-text fx__label fx__label--burn', x: 0, y: ly, text: '焦げた！' }));
        L.fxtext.append(fxText[id]);
        // 「ジリジリ」「焦げた！」の文字の場所（「遅れ」の文字をここに重ねない）
        fxLabelBox[id] = [x - 31, y + ly - 11, x + 31, y + ly + 11];
      }
    }
  }

  // 分岐の当たり（列車を選ばずに押したときの一言用）。押せる大きさを確保するため半径27
  function drawHits() {
    for (const id of Object.keys(level.nodes)) {
      if (level.nodes[id].kind !== 'junction' || level.edges.filter((e) => e.from === id).length < 2) continue;
      const [x, y] = level.nodes[id].pos;
      const hit = s('circle', { class: 'hit', cx: x, cy: y, r: 27, 'data-node': id });
      hit.addEventListener('click', () => onHint(id));
      L.hits.append(hit);
    }
  }

  function routePoints(path) {
    const pts = [];
    for (let i = 0; i < path.length - 1; i++) {
      const e = level.edges.find((x) => x.from === path[i] && x.to === path[i + 1]);
      const ep = edgePoints(level, e);
      pts.push(...(i === 0 ? ep : ep.slice(1)));
    }
    return pts;
  }

  /* 進路の線：選んだ列車は列車の色の太線、ほかの列車は薄く。
     線の下に縁取り（route__case）を敷く。見せるのは黄色の列車だけ（クリーム色の地で薄くなる。app.css） */
  function drawRoutes(paths, selected) {
    clear(L.routes);
    const ids = Object.keys(paths).sort((a, b) => (a === selected) - (b === selected));
    for (const id of ids) {
      const cls = `tc-${id} ${id === selected ? 'route--on' : 'route--off'}`;
      const points = pointsAttr(routePoints(paths[id]));
      L.routes.append(s('polyline', { class: `route__case ${cls}`, points }));
      L.routes.append(s('polyline', { class: `route ${cls}`, points }));
    }
  }

  // 分岐から、選ばれた出口へ伸びる矢印
  function drawArrows(arrows) {
    clear(L.arrows);
    for (const { node, exitTo, trainId } of arrows) {
      const e = level.edges.find((x) => x.from === node && x.to === exitTo);
      const pts = edgePoints(level, e);
      const len = Math.min(36, polyLength(pts) * 0.72);
      const tip = pointAt(pts, len);
      const back = (dx, dy) => `${round(tip.x + dx)},${round(tip.y + dy)}`;
      const c = Math.cos(tip.angle);
      const si = Math.sin(tip.angle);
      const head = [back(0, 0), back(-9 * c - 5.5 * -si, -9 * si - 5.5 * c), back(-9 * c + 5.5 * -si, -9 * si + 5.5 * c)].join(' ');
      L.arrows.append(s('g', { class: `arrow tc-${trainId}` },
        s('polyline', { class: 'arrow__line', points: pointsAttr(subPath(pts, 4, len - 6)) }),
        s('polygon', { class: 'arrow__head', points: head })));
    }
  }

  // 分岐の切替ボタン（HTML）。押した後も同じ分岐のボタンにフォーカスを戻す
  function drawSwitches(items) {
    const focused = document.activeElement?.closest?.('.switch')?.dataset.node ?? null;
    clear(switchLayer);
    for (const { node, label, angle, trainId } of items) {
      const [x, y] = level.nodes[node].pos;
      const deg = round((angle * 180) / Math.PI);
      const btn = h('button', { type: 'button', class: `switch tc-${trainId}`, 'data-node': node, 'aria-label': label },
        s('svg', { class: 'switch__icon', viewBox: '-12 -12 24 24', 'aria-hidden': 'true', focusable: 'false' },
          s('path', { d: 'M-7 0 H5 M0 -5.5 L6 0 L0 5.5', transform: `rotate(${deg})` })));
      btn.style.left = `${round((x / VIEW.w) * 100)}%`;
      btn.style.top = `${round(((y - view.top) / view.h) * 100)}%`;
      btn.addEventListener('click', () => onSwitch(node));
      switchLayer.append(btn);
      if (node === focused) btn.focus({ preventScroll: true });
    }
  }

  // 再生中、車庫の上に出発を待つ列車を出発順に積む（いちばん下が次に出る列車）。最初の列車は0分に出るので、積むのは4両まで。
  // 地図の上端に収まるよう、両数が多い面では間隔を詰める
  const yardSlot = (j) => {
    const yard = Object.values(level.nodes).find((n) => n.kind === 'yard').pos;
    const waiting = Math.max(1, (model?.trains.length ?? 1) - 1);
    const room = yard[1] - 40 - (view.top + 14);
    const step = waiting > 1 ? Math.min(22, room / (waiting - 1)) : 22;
    return { x: yard[0], y: yard[1] - 40 - j * step };
  };

  /* 時計を置く隅。左上・右上・左下・右下のうち、車庫の上で待つ列車の列・建物と名前・分の札・線路に
     いちばん重ならない隅（同じなら左上から順）。左上に固定すると、待つ列車の一番上が時計に隠れた */
  function pickClockCorner(w, hgt) {
    const top = view.top;
    const bottom = view.top + view.h;
    const corners = [
      { key: 'tl', box: [0, top, w, top + hgt] },
      { key: 'tr', box: [VIEW.w - w, top, VIEW.w, top + hgt] },
      { key: 'bl', box: [0, bottom - hgt, w, bottom] },
      { key: 'br', box: [VIEW.w - w, bottom - hgt, VIEW.w, bottom] },
    ];
    const waiting = Math.min(4, model.trains.length - 1);
    const queue = [];
    for (let j = 0; j < waiting; j++) {
      const p = yardSlot(j);
      queue.push([p.x - 16, p.y - 16, p.x - NO_AT[0] + NO_R, p.y + 16]);
    }
    const trackPoints = [];
    for (const g of Object.values(geoms)) {
      const len = polyLength(g.pts);
      for (let d = 0; d <= len; d += 3) trackPoints.push(pointAt(g.pts, d));
    }
    const inside = (b, p) => p.x > b[0] && p.x < b[2] && p.y > b[1] && p.y < b[3];
    let best = null;
    for (const c of corners) {
      let cost = 0;
      for (const q of queue) cost += overlapArea(c.box, q) * 50;
      for (const f of fixedBoxes) cost += overlapArea(c.box, f.b) * f.w;
      cost += trackPoints.filter((p) => inside(c.box, p)).length * 30;
      if (!best || cost < best.cost) best = { ...c, cost };
    }
    return best;
  }

  function makeChip(trainId, ingredient, no) {
    const chip = s('g', { class: `chip tc-${trainId}`, 'data-train': trainId },
      s('g', { class: 'chip__body' },
        s('circle', { class: 'chip__ring', r: CHIP_R + 4.5 }),
        s('circle', { class: 'chip__edge', r: CHIP_R + 1.8 }),
        s('circle', { class: 'chip__disc', r: CHIP_R }),
        s('text', { class: 'map-emoji chip__emoji', y: 0.5, text: ingredientIcon(ingredient) }),
        s('circle', { class: 'chip__char', r: CHIP_R }),
        // 焦げた列車は、黒くなるだけでなく ✖ も付く（色以外の手がかり）
        s('text', { class: 'map-text chip__burn', y: 0.5, text: '✖' })),
      // 出発の番号（編成のカードの番号と同じ）。揺れの動きに巻き込まないよう、本体の外に置く
      s('g', { class: 'chip__no' },
        s('circle', { class: 'chip__no-disc', cx: NO_AT[0], cy: NO_AT[1], r: NO_R }),
        s('text', { class: 'map-text chip__no-text', x: NO_AT[0], y: NO_AT[1] + 0.5, text: String(no) })),
      // 締切を過ぎてまだ着いていないときの「遅れ」。置き場所は frame() が毎回、ほかの物に重ならない所を探す
      s('text', { class: 'map-text chip__late', x: LATE_SPOTS[0][0], y: LATE_SPOTS[0][1] + 0.5, text: '遅れ' }));
    L.trains.append(chip);
    return chip;
  }

  function placeChip(chip, x, y, classes) {
    chip.setAttribute('transform', `translate(${round(x)} ${round(y)})`);
    const want = `chip ${chip.dataset.trainClass} ${classes.join(' ')}`.trim();
    if (chip.getAttribute('class') !== want) chip.setAttribute('class', want);
  }

  // 編集中は地図に列車を置かない（出発順は編成の一覧で見る。5両を車庫に積むと盤の上端からはみ出す）
  function setEditView({ paths, selected, switches, arrows }) {
    svg.closest('.map')?.setAttribute('data-mode', 'edit');
    clear(L.pops);
    clear(L.trains);
    chips = {};
    for (const f of [...Object.values(fx), ...Object.values(fxText)]) f.setAttribute('class', f.getAttribute('class').replace(/ is-\S+/g, ''));
    drawRoutes(paths, selected);
    drawArrows(arrows);
    drawSwitches(switches);
  }

  /* 再生の準備。sim の timeline から、列車ごとに区間の形を引いておく */
  function startPlayback(sim, plan, trains, paths, clockPx = { w: 92, h: 32 }) {
    svg.closest('.map')?.setAttribute('data-mode', 'play');
    clear(switchLayer);
    clear(L.arrows);
    drawRoutes(paths, null);
    clear(L.trains);
    clear(L.pops);
    chips = {};
    pops = {};
    const grace = level.burnGrace ?? 1;
    const serve = Object.values(level.nodes).find((n) => n.kind === 'serve').pos;
    // 時計（地図の隅に重なる HTML）の大きさを、盤の単位で
    const unit = svg.getBoundingClientRect().width / VIEW.w || 1;
    model = {
      trains: plan.order.map((id, k) => {
        const def = trains.find((t) => t.id === id);
        const segs = sim.timeline[id].map((seg) => {
          if (seg.type === 'edge') return { ...seg, geom: geoms[seg.id] };
          const node = level.nodes[seg.id];
          return { ...seg, pos: node.pos, hot: KINDS[node.kind].hot };
        });
        // 焦げた瞬間は仕上がり＋猶予＋1分（lib/explain.js の burnMinute。運行図の✖・文・音と同じ分）
        const burnt = segs.find((x) => x.type === 'station' && x.hot && x.leave - x.ready > grace);
        const burnAt = burnt ? burnMinute(level, burnt) : null;
        const result = sim.results.find((r) => r.train === id);
        const due = level.orders.find((o) => o.id === def.order).due;
        return {
          id, k, ingredient: def.ingredient, segs, arrivedAt: result.arrivedAt, due,
          burnAt, burnStation: burnt?.id ?? null, burnUntil: burnt ? Math.max(burnt.leave, burnAt + BURN_SHOW_MIN) : null,
        };
      }),
      grace,
      serve,
      ok: Object.fromEntries(sim.results.map((r) => [r.train, !sim.problems.some((p) => p.train === r.train)])),
    };
    const corner = pickClockCorner((8 + clockPx.w + 6) / unit, (8 + clockPx.h + 4) / unit);
    model.clockCorner = corner.key;
    model.clockBox = corner.box;
    for (const tr of model.trains) {
      const chip = makeChip(tr.id, tr.ingredient, tr.k + 1);
      chip.dataset.trainClass = `tc-${tr.id}`;
      chips[tr.id] = chip;
      const pop = s('g', { class: `pop ${model.ok[tr.id] ? 'pop--ok' : 'pop--ng'}`, transform: 'translate(-99 -99)' },
        s('text', { class: 'map-emoji pop__emoji', text: ingredientIcon(tr.ingredient) }),
        s('text', { class: 'map-text pop__mark', x: 13, y: -12, text: model.ok[tr.id] ? '✔' : '✘' }));
      L.pops.append(pop);
      pops[tr.id] = pop;
    }
    frame(0);
  }

  function frame(t) {
    if (!model) return;
    const { grace } = model;
    const waitingInYard = model.trains.filter((tr) => t < tr.segs[0].enter);
    const stationState = {};
    const placed = [];
    for (const tr of model.trains) {
      const chip = chips[tr.id];
      if (t >= tr.arrivedAt) {
        placeChip(chip, model.serve[0], model.serve[1], ['is-gone']);
        continue;
      }
      const classes = [];
      if (tr.burnAt !== null && t >= tr.burnAt) classes.push('is-burnt');
      const late = t > tr.due;
      if (late) classes.push('is-late');
      let x;
      let y;
      if (t < tr.segs[0].enter) {
        const p = yardSlot(waitingInYard.indexOf(tr));
        if (t >= tr.k * (level.headway ?? 1)) classes.push('is-waiting');
        classes.push('is-queued');
        ({ x, y } = p);
      } else {
        const seg = tr.segs.find((q) => q.enter <= t && t < q.leave) ?? tr.segs[tr.segs.length - 1];
        if (seg.type === 'edge') {
          const [a, b] = seg.geom.range;
          const u = Math.min(1, (t - seg.enter) / (seg.ready - seg.enter));
          const p = pointAt(seg.geom.pts, a + (b - a) * u);
          if (t > seg.ready) classes.push('is-waiting');
          ({ x, y } = p);
        } else {
          // 火の駅：仕上がってから焦げた瞬間（仕上がり＋猶予＋1分）までが「ジリジリ」、そこから「焦げた！」
          let state = 'is-cooking';
          if (t >= seg.ready) state = seg.hot ? (t >= seg.ready + grace + 1 ? 'is-burning' : 'is-sizzle') : 'is-waiting';
          classes.push(state, `is-${seg.kind}`);
          stationState[seg.id] = state;
          x = seg.pos[0];
          y = seg.pos[1] - 11;
        }
      }
      placed.push({ tr, chip, x, y, classes, late, queued: classes.includes('is-queued') });
    }
    for (const p of placed) p.noX = badgeSide(p);
    spread(placed);
    for (const p of placed) {
      // 番号の丸は左の縁。地図の左端で切れるときや、建物の名前（車庫など）にかかるときは右の縁へ
      p.noX = badgeSide(p);
      if (p.noX !== NO_AT[0]) p.classes.push('is-no-right');
    }
    // 焦げた瞬間に駅を出た列車でも、「焦げた！」はしばらくその駅に出しておく
    for (const tr of model.trains) {
      if (tr.burnAt !== null && t >= tr.burnAt && t < tr.burnUntil) stationState[tr.burnStation] = 'is-burning';
    }
    placeLateLabels(placed, stationState);
    for (const p of placed) placeChip(p.chip, p.x, p.y, p.classes);
    for (const f of [...Object.entries(fx), ...Object.entries(fxText)]) {
      const [id, el] = f;
      const base = el.getAttribute('class').replace(/ is-\S+/g, '');
      const want = stationState[id] ? `${base} ${stationState[id]}` : base;
      if (el.getAttribute('class') !== want) el.setAttribute('class', want);
    }
    // 配膳で料理がはじける（時刻から大きさと濃さを決める）
    model.trains.forEach((tr, i) => {
      const pop = pops[tr.id];
      const since = t - tr.arrivedAt;
      if (since < 0 || since > POP_MIN) {
        pop.setAttribute('class', pop.getAttribute('class').replace(' is-on', ''));
        return;
      }
      const u = since / POP_MIN;
      const scale = round(0.7 + u * 0.9);
      const dx = (i % 2 ? 1 : -1) * 8;
      pop.setAttribute('transform', `translate(${round(model.serve[0] + dx)} ${round(model.serve[1] - 34 - u * 14)}) scale(${scale})`);
      pop.setAttribute('opacity', String(round(1 - u * u)));
      if (!pop.getAttribute('class').includes(' is-on')) pop.setAttribute('class', `${pop.getAttribute('class')} is-on`);
    });
  }

  function badgeSide(p) {
    const left = [p.x + NO_AT[0] - NO_R, p.y + NO_AT[1] - NO_R, p.x + NO_AT[0] + NO_R, p.y + NO_AT[1] + NO_R];
    return left[0] < 2 || fixedBoxes.some((f) => f.w === NAME_W && overlapArea(left, f.b) > 0) ? -NO_AT[0] : NO_AT[0];
  }

  /* 重なった列車の丸を、少しずらして並べる（合流の手前で2〜3両の丸が重なり、出発の番号が読めなかった）。
     丸（半径13）と番号の丸（半径9）を円として、重なる2両を互いに逆向きへ半分ずつ押し戻す。数回くり返す。
     車庫の上で待つ列どうしは、もともと詰めて積んでいる（番号は右の縁で重ならない）ので押さない。
     押す量は位置だけで決まるので、同じ時刻なら同じ絵になる（時計の分と見た目がずれない） */
  function spread(placed) {
    const circles = (p) => [[p.x, p.y, SEP_DISC / 2], [p.x + p.noX, p.y + NO_AT[1], SEP_BADGE / 2]];
    for (let round = 0; round < 6; round++) {
      let moved = false;
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i];
          const b = placed[j];
          if (a.queued && b.queued) continue;
          let push = null;
          for (const [ax, ay, ar] of circles(a)) {
            for (const [bx, by, br] of circles(b)) {
              const need = ar === br ? ar * 2 : SEP_DISC_BADGE;
              const d = Math.hypot(bx - ax, by - ay);
              if (d >= need) continue;
              // ちょうど同じ位置なら、後に出た列車を下へ
              const [dx, dy] = d < 0.01 ? [0, 1] : [(bx - ax) / d, (by - ay) / d];
              const depth = need - d;
              if (!push || depth > push.depth) push = { dx, dy, depth };
            }
          }
          if (!push) continue;
          const m = push.depth / 2;
          a.x -= push.dx * m;
          a.y -= push.dy * m;
          b.x += push.dx * m;
          b.y += push.dy * m;
          moved = true;
        }
      }
      if (!moved) break;
    }
    for (const p of placed) {
      p.x = Math.min(VIEW.w - 13, Math.max(13, p.x));
      p.y = Math.min(view.top + view.h - 13, Math.max(view.top + 13, p.y));
    }
  }

  /* 「遅れ」の文字の置き場所。列車の丸の右・左・上・下・斜めの順に試し、建物（駅の名前を含む）・分の札・時計・
     「ジリジリ」などの文字・ほかの列車の丸と番号・先に置いた「遅れ」・地図の外に重ならない最初の場所に置く。
     どこも重なるときは、重なりがいちばん小さい場所。前の瞬間と同じ場所が空いていれば、そこを使い続ける（ちらつかない） */
  function placeLateLabels(placed, stationState) {
    const busy = [...fixedBoxes, { b: model.clockBox, w: NAME_W }];
    for (const [id, st] of Object.entries(stationState)) {
      if ((st === 'is-sizzle' || st === 'is-burning') && fxLabelBox[id]) busy.push({ b: fxLabelBox[id], w: NAME_W });
    }
    const discOf = (p) => ({ b: [p.x - 14, p.y - 14, p.x + 14, p.y + 14], w: 10 });
    const badgeOf = (p) => ({ b: [p.x + p.noX - NO_R, p.y + NO_AT[1] - NO_R, p.x + p.noX + NO_R, p.y + NO_AT[1] + NO_R], w: 10 });
    const lo = [2, view.top + 2];
    const hi = [VIEW.w - 2, view.top + view.h - 2];
    for (const p of placed) {
      if (!p.late) continue;
      const near = [badgeOf(p), ...placed.filter((q) => q !== p).flatMap((q) => [discOf(q), badgeOf(q)])];
      const prev = Number(p.chip.dataset.lateSpot ?? 0);
      const order = [prev, ...LATE_SPOTS.keys()].filter((k, i, a) => a.indexOf(k) === i);
      let best = null;
      for (const k of order) {
        const [dx, dy] = LATE_SPOTS[k];
        const box = [p.x + dx - LATE_W / 2, p.y + dy - LATE_H / 2, p.x + dx + LATE_W / 2, p.y + dy + LATE_H / 2];
        let cost = box[0] < lo[0] || box[1] < lo[1] || box[2] > hi[0] || box[3] > hi[1] ? 1e6 : 0;
        for (const { b, w } of [...busy, ...near]) cost += overlapArea(box, b) * w;
        if (!best || cost < best.cost) best = { k, box, cost };
        if (cost === 0) break;
      }
      busy.push({ b: best.box, w: NAME_W });
      if (String(best.k) !== p.chip.dataset.lateSpot) {
        p.chip.dataset.lateSpot = String(best.k);
        const text = p.chip.querySelector('.chip__late');
        text.setAttribute('x', LATE_SPOTS[best.k][0]);
        text.setAttribute('y', LATE_SPOTS[best.k][1] + 0.5);
      }
    }
  }

  function stopPlayback() {
    model = null;
  }

  return { setLevel, setEditView, startPlayback, frame, stopPlayback, edgeGeom: (id) => geoms[id], view: () => ({ ...view }), clockCorner: () => model?.clockCorner ?? 'tl' };
}
