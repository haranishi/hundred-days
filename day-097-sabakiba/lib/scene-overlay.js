import * as THREE from '../vendor/three.js';
import { ANCHOR_OWNER } from './contract.js';
import { appendRubyText, icon, makeRuby } from './ui-icons.js';

const basicLabels = [
  { anchor: 'eye', text: '目' }, { anchor: 'dorsalFinStart', text: '背ビレ' }, { anchor: 'peduncle', text: '尾柄' },
];

function captionText(node, text) {
  node.replaceChildren();
  // 手順には「骨(ほね)」と ruby 要素の表記があります。どちらもテキストから要素を作ります。
  let start = 0;
  for (const m of text.matchAll(/<ruby>([^<>]+)<rt>([^<>]+)<\/rt><\/ruby>/gu)) {
    appendRubyText(node, text.slice(start, m.index));
    node.append(makeRuby(m[1], m[2]));
    start = m.index + m[0].length;
  }
  appendRubyText(node, text.slice(start));
}

const GAP = 4, MAX_SHIFT = 40, SAMPLE_PX = 6;
const clamp = THREE.MathUtils.clamp;
const boxAt = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });

// 矩形の中では、最も近い縁までの距離を負にします。中にある輪も外へ向けて動かせます。
function distanceToRect(x, y, rect) {
  const dx = Math.max(rect.left - x, x - rect.right), dy = Math.max(rect.top - y, y - rect.bottom);
  return Math.hypot(Math.max(0, dx), Math.max(0, dy)) + Math.min(0, Math.max(dx, dy));
}

// 投影した刃の角を外周順につなぎます。斜めの刃では、箱の空いた角にある手まで押し出さずに済みます。
function bladeEdges(points) {
  const sorted = points.sort((a, b) => a.x - b.x || a.y - b.y);
  function chain(vertices) {
    const path = [];
    for (const c of vertices) {
      while (path.length >= 2) {
        const a = path.at(-2), b = path.at(-1);
        if ((b.x - a.x) * (c.y - a.y) > (b.y - a.y) * (c.x - a.x)) break;
        path.pop();
      }
      path.push(c);
    }
    return path.slice(0, -1);
  }
  const hull = [...chain(sorted), ...chain(sorted.reverse())];
  if (hull.length < 3) return null;
  return hull.map((a, i) => {
    const b = hull[(i + 1) % hull.length], dx = b.x - a.x, dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    return { x: a.x, y: a.y, dx, dy, nx: dy / length, ny: -dx / length, length };
  });
}

function distanceToObstacle(x, y, r) {
  if (!r.edges) return distanceToRect(x, y, r);
  let inside = true, distance = Infinity;
  for (const edge of r.edges) {
    const px = x - edge.x, py = y - edge.y;
    if (px * edge.nx + py * edge.ny > 0) inside = false;
    const t = clamp((px * edge.dx + py * edge.dy) / (edge.length * edge.length), 0, 1);
    distance = Math.min(distance, Math.hypot(px - t * edge.dx, py - t * edge.dy));
  }
  return inside ? -distance : distance;
}

function placeRing(marker, points, rects, bounds) {
  const { x, y, radius } = marker, clearance = radius + GAP;
  const near = points.filter(p => Math.hypot(p.x - x, p.y - y) <= MAX_SHIFT + clearance);
  const obstacles = rects.filter(r => distanceToObstacle(x, y, r) <= MAX_SHIFT + clearance);
  function penalty(cx, cy) {
    let depth = Math.max(0, bounds.left + radius - cx, cx + radius - bounds.right,
      bounds.top + radius - cy, cy + radius - bounds.bottom);
    for (const p of near) depth = Math.max(depth, clearance - Math.hypot(cx - p.x, cy - p.y));
    for (const r of obstacles) depth = Math.max(depth, clearance - distanceToObstacle(cx, cy, r));
    return depth;
  }
  let best = { x, y }, score = penalty(x, y);
  if (score === 0) return best;
  const directions = [];
  const closest = near.reduce((a, p) => !a || Math.hypot(p.x - x, p.y - y) < Math.hypot(a.x - x, a.y - y) ? p : a, null);
  if (closest) {
    let { nx, ny } = closest;
    if (nx === undefined) {
      // 法線のない点列では、最近傍の点とその隣の点で接線を復元します。
      const neighbor = near.reduce((a, p) => {
        const d = Math.hypot(p.x - closest.x, p.y - closest.y);
        return d > 0 && (!a || d < a.d) ? { p, d } : a;
      }, null);
      nx = neighbor ? closest.y - neighbor.p.y : x - closest.x;
      ny = neighbor ? neighbor.p.x - closest.x : y - closest.y;
    }
    const length = Math.hypot(nx, ny);
    if (length) directions.push([nx / length, ny / length], [-nx / length, -ny / length]);
  }
  if (obstacles.length || !directions.length) {
    for (const r of obstacles) for (const edge of r.edges ?? []) directions.push([edge.nx, edge.ny]);
    directions.push([0, -1], [0, 1], [1, 0], [-1, 0]);
  }
  for (let offset = 2; offset <= MAX_SHIFT; offset += 2) {
    for (const [dx, dy] of directions) {
      const cx = x + dx * offset, cy = y + dy * offset, next = penalty(cx, cy);
      if (next < score) { best = { x: cx, y: cy }; score = next; }
      if (score === 0) return best;
    }
  }
  return best;
}

function captionAt(x, y, w, h, radius, area, points, rects, allowOverlap) {
  if (!(w > 0 && h > 0) || w > area.right - area.left || h > area.bottom - area.top) return null;
  const gap = radius + GAP + 1;
  const above = y - gap - h, below = y + gap, left = x - gap - w, right = x + gap;
  const midX = x - w / 2, midY = y - h / 2;
  let best = null, score = Infinity;
  function tryAt(cx, cy) {
    const box = boxAt(clamp(cx, area.left, area.right - w), clamp(cy, area.top, area.bottom - h), w, h);
    let overlap = 0;
    for (const r of rects) {
      const dx = Math.min(box.right, r.right + GAP) - Math.max(box.left, r.left - GAP);
      const dy = Math.min(box.bottom, r.bottom + GAP) - Math.max(box.top, r.top - GAP);
      if (dx > 0 && dy > 0) overlap += dx * dy;
    }
    for (const p of points) {
      const d = distanceToRect(p.x, p.y, box);
      if (d < GAP) overlap += SAMPLE_PX * (GAP - d);
    }
    if (overlap < score) { best = box; score = overlap; }
    return score === 0;
  }
  for (const [cx, cy] of [[midX, above], [midX, below], [right, midY], [left, midY],
    [right, above], [left, above], [right, below], [left, below]]) {
    if (tryAt(cx, cy)) return best;
  }
  // 端で札が重なる場合は、先に置いた札や道具の縁に沿う列も試します。
  for (const r of rects) {
    for (const cx of [midX, left, right, r.left]) {
      if (tryAt(cx, r.top - h - GAP) || tryAt(cx, r.bottom + GAP)) return best;
    }
    if (tryAt(r.left - w - GAP, midY) || tryAt(r.right + GAP, midY)) return best;
  }
  return allowOverlap ? best : null;
}

export function placeCaption(x, y, w, h, area, occupied, out = {}) {
  const rect = captionAt(x, y, w, h, 8, area, [], occupied, false);
  return rect && Object.assign(out, rect);
}

/** markers は輪の中心 x,y・半径 radius・札の実寸 width,height・text。hand:false は部位の印です。
 * avoid は切り線の点 {x,y,nx,ny} と刃・操作部の矩形 {left,top,right,bottom}。同じ単位の bounds 内に札 rect を置きます。 */
export function placeMarkers({ markers, avoid = [], bounds }) {
  const points = avoid.filter(item => item.x !== undefined), rects = avoid.filter(item => item.left !== undefined);
  const seen = new Set();
  const placed = markers.map(m => {
    const hand = m.hand !== false, radius = m.radius ?? (hand ? 14 : 4);
    const text = hand && seen.has(m.text) ? '' : m.text;
    if (hand) seen.add(m.text);
    const marker = { ...m, text, radius, rect: null };
    if (hand && m.visible !== false) Object.assign(marker, placeRing(marker, points, rects, bounds));
    return marker;
  });
  // すべての輪の位置が決まってから札を置くと、後の輪も札に隠れません。
  for (const { x, y, radius, visible } of placed) {
    if (visible !== false) rects.push(boxAt(x - radius, y - radius, 2 * radius, 2 * radius));
  }
  for (const m of placed) {
    if (!m.text || m.visible === false) continue;
    m.rect = captionAt(m.x, m.y, m.width, m.height, m.radius, bounds, points, rects, true);
    if (m.rect) rects.push(m.rect);
  }
  return placed;
}

// 同次座標のまま視錐台で切ります。視点の直近を通る長い線でも、サンプル数は画面寸法で決まります。
function projectedSegment(a, b, w, h, sides = true) {
  let start = 0, end = 1;
  for (const axis of sides ? ['x', 'y', 'z'] : ['z']) {
    for (const sign of [-1, 1]) {
      const da = a.w + sign * a[axis], db = b.w + sign * b[axis];
      if (da < 0 && db < 0) return null;
      if (da < 0) start = Math.max(start, da / (da - db));
      if (db < 0) end = Math.min(end, da / (da - db));
    }
  }
  if (start > end) return null;
  const pixel = t => {
    const scale = THREE.MathUtils.lerp(a.w, b.w, t);
    return { x: (1 + THREE.MathUtils.lerp(a.x, b.x, t) / scale) * w / 2,
      y: (1 - THREE.MathUtils.lerp(a.y, b.y, t) / scale) * h / 2 };
  };
  return [pixel(start), pixel(end)];
}

function sampleLine(avoid, a, b, width, height) {
  const segment = projectedSegment(a, b, width, height);
  if (!segment) return;
  const [p, q] = segment, dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy);
  const count = Math.max(1, Math.ceil(len / SAMPLE_PX));
  for (let i = 0; i <= count; i++) avoid.push({ x: p.x + i / count * dx, y: p.y + i / count * dy,
    nx: len ? -dy / len : 0, ny: len ? dx / len : -1 });
}

/** 描画に使う刃の箱とリボンを同じカメラで投影します。練習・左右反転・部品の固定も反映されます。 */
export function projectObstacles(display, state, projection, width, height) {
  const avoid = [], clip = new THREE.Matrix4(), a = new THREE.Vector4(), b = new THREE.Vector4();
  const box = display.bladeBox;
  if (box) {
    clip.multiplyMatrices(projection, display.knife.matrix);
    const corners = Array.from({ length: 8 }, (_, i) => new THREE.Vector4(
      (i & 1 ? box.max : box.min).x, (i & 2 ? box.max : box.min).y, (i & 4 ? box.max : box.min).z, 1).applyMatrix4(clip));
    const pixels = [];
    for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) {
      if (i & bit) continue;
      const edge = projectedSegment(corners[i], corners[i | bit], width, height, false);
      if (edge) pixels.push(...edge);
    }
    const xs = pixels.map(p => p.x), ys = pixels.map(p => p.y);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
    if (right >= 0 && left <= width && bottom >= 0 && top <= height) {
      avoid.push({ left, right, top, bottom, edges: bladeEdges(pixels) });
    }
  }
  const knife = state.knife;
  const activeKey = knife && knife.curve + '/' + (knife.side ?? '');
  let activeShown = false;
  for (const mesh of display.guides.group.children) {
    const arc = mesh.geometry.attributes.aArc;
    if (!mesh.visible || !arc) continue;
    const { position } = mesh.geometry.attributes, start = mesh.material.uniforms.uStart.value;
    clip.multiplyMatrices(projection, mesh.matrix);
    if (knife && (mesh.name === activeKey || mesh.name === activeKey + '/r')) activeShown = true;
    // 各駅の2頂点は中心が同じです。描画済みの弧と、末尾の矢じりの重複頂点を除きます。
    for (let i = 2; i < arc.count && arc.getX(i) >= 0; i += 2) {
      const from = arc.getX(i - 2), to = arc.getX(i);
      if (to <= start) continue;
      a.set(position.getX(i - 2), position.getY(i - 2), position.getZ(i - 2), 1).applyMatrix4(clip);
      b.set(position.getX(i), position.getY(i), position.getZ(i), 1).applyMatrix4(clip);
      if (start > from) a.lerp(b, (start - from) / (to - from));
      sampleLine(avoid, a, b, width, height);
    }
  }
  // 以前と同じ線をもう一度切ると、点線は消えていても刃は動きます。
  if (display.knife.visible && knife && !activeShown) {
    clip.multiplyMatrices(projection, display.pose.matrixFor(knife.owner));
    const points = display.guides.curvePoints(knife);
    for (let i = 0; i < points.length; i++) {
      b.set(...points[i], 1).applyMatrix4(clip);
      if (i) sampleLine(avoid, a, b, width, height);
      a.copy(b);
    }
  }
  return avoid;
}

const translate = (x, y) => 'translate(' + x + 'px, ' + y + 'px)';

export function createSceneOverlay(container) {
  const doc = container.ownerDocument;
  const root = doc.createElement('div');
  root.className = 'fish-overlay';
  root.setAttribute('aria-hidden', 'true');
  container.appendChild(root);
  const toolbar = container.querySelector('.stage-pills'), reset = container.querySelector('.stage-reset');
  const slots = [];
  const projection = new THREE.Matrix4(), previous = new THREE.Matrix4();
  const screen = new THREE.Vector3();
  let dirty = true, oldWidth = -1, oldHeight = -1, boardRoot, defaults, display, currentState;
  function slotAt(i, hand) {
    let slot = slots[i];
    if (!slot) {
      const pin = doc.createElement('span'), tag = doc.createElement('span');
      root.append(pin, tag);
      slot = slots[i] = { pin, tag, point: new THREE.Vector3(), hand: null };
    }
    if (slot.hand !== hand) {
      slot.hand = hand;
      slot.pin.className = hand ? 'fish-pin fish-pin--hand' : 'fish-pin';
      slot.tag.className = hand ? 'fish-tag fish-tag--hand' : 'fish-tag';
      slot.pin.replaceChildren();
      if (hand) slot.pin.append(icon('hand'));
    }
    return slot;
  }
  function setMarks(state, showLabels, pose, model, fishDisplay) {
    display = fishDisplay;
    currentState = state;
    // 印が静止していても、その前を通る刃と切り線は毎回評価します。
    dirty = true;
    if (boardRoot !== model.group.parent) {
      boardRoot = model.group.parent;
      defaults = basicLabels.map(label => ({ ...label, owner: ANCHOR_OWNER[label.anchor], pos: model.anatomy.point(label.anchor) }));
    }
    let i = 0;
    function add(mark, hand) {
      const slot = slotAt(i++, hand);
      slot.visible = pose.visible(mark.owner);
      const part = mark.anchor.startsWith('piece:') ? model.pieces[mark.anchor.slice(6)] : null;
      slot.point.fromArray(part?.pivot ?? mark.pos).applyMatrix4(pose.matrixFor(mark.owner));
      if (slot.text !== mark.text) {
        slot.text = mark.text;
        captionText(slot.tag, mark.text);
      }
    }
    for (const hand of state.hands) add(hand, true);
    if (showLabels) {
      for (const label of state.labels.length ? state.labels : defaults) {
        if (!state.hands.length && /^[左右]手の位置$/u.test(label.text)) continue;
        add(label, false);
      }
    }
    while (slots.length > i) {
      const { pin, tag } = slots.pop();
      pin.remove(); tag.remove();
    }
  }
  function project(camera) {
    const w = container.clientWidth, h = container.clientHeight;
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (boardRoot) projection.multiply(boardRoot.matrixWorld);
    if (!dirty && w === oldWidth && h === oldHeight && previous.equals(projection)) return;
    dirty = false; oldWidth = w; oldHeight = h; previous.copy(projection);
    if (!slots.length) return;
    const bounds = { left: 5, right: w - 5, top: toolbar ? toolbar.offsetTop + toolbar.offsetHeight + GAP : 5, bottom: h - 5 };
    const avoid = display ? projectObstacles(display, currentState, projection, w, h) : [];
    if (reset) avoid.push(boxAt(reset.offsetLeft, reset.offsetTop, reset.offsetWidth, reset.offsetHeight));
    const markers = slots.map(slot => {
      screen.copy(slot.point).applyMatrix4(projection);
      const visible = slot.visible && Math.abs(screen.x) <= 1 && Math.abs(screen.y) <= 1 && Math.abs(screen.z) <= 1;
      slot.pin.hidden = slot.tag.hidden = !visible;
      return { x: (screen.x + 1) * w / 2, y: (1 - screen.y) * h / 2, text: slot.text, hand: slot.hand, visible };
    });
    markers.forEach((m, i) => {
      const { pin, tag } = slots[i];
      m.radius = pin.offsetWidth / 2 + (m.hand ? 2 : 0);
      m.width = tag.offsetWidth; m.height = tag.offsetHeight;
    });
    for (const [i, m] of placeMarkers({ markers, avoid, bounds }).entries()) {
      const { pin, tag } = slots[i];
      if (m.visible) pin.style.transform = translate(m.x, m.y);
      tag.hidden = !m.rect;
      if (m.rect) tag.style.transform = translate(m.rect.left, m.rect.top);
    }
  }
  return { setMarks, project, dispose() { root.remove(); slots.length = 0; boardRoot = defaults = display = currentState = null; } };
}
