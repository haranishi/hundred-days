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

/** 札の実寸を使い、枠・操作ボタン・先に置いた札の間で、アンカーに近い空きを探します。 */
export function placeCaption(x, y, w, h, area, occupied, out = {}) {
  if (w > area.right - area.left || h > area.bottom - area.top) return null;
  let left = THREE.MathUtils.clamp(x + 12, area.left, area.right - w);
  const ideal = THREE.MathUtils.clamp(y - h - 12, area.top, area.bottom - h);
  function fits(top) {
    return occupied.every(r => left + w + 3 <= r.left || r.right + 3 <= left
      || top + h + 3 <= r.top || r.bottom + 3 <= top);
  }
  let best, distance = Infinity;
  function tryTop(value) {
    const top = THREE.MathUtils.clamp(value, area.top, area.bottom - h);
    const d = Math.abs(top - ideal);
    if (d < distance && fits(top)) { best = top; distance = d; }
  }
  function tryColumn() {
    tryTop(ideal);
    for (const r of occupied) {
      tryTop(r.bottom + 3);
      tryTop(r.top - h - 3);
    }
  }
  tryColumn();
  if (best === undefined) {
    left = THREE.MathUtils.clamp(x - w - 12, area.left, area.right - w);
    tryColumn();
  }
  if (best === undefined) return null;
  out.left = left; out.top = best; out.right = left + w; out.bottom = best + h;
  return out;
}

const translate = (x, y) => 'translate(' + Math.round(x) + 'px, ' + Math.round(y) + 'px)';

export function createSceneOverlay(container) {
  const doc = container.ownerDocument;
  const root = doc.createElement('div');
  root.className = 'fish-overlay';
  root.setAttribute('aria-hidden', 'true');
  container.appendChild(root);
  const toolbar = container.querySelector('.stage-pills'), reset = container.querySelector('.stage-reset');
  const slots = [], occupied = [], area = {}, buttonBox = {};
  const projection = new THREE.Matrix4(), previous = new THREE.Matrix4();
  const screen = new THREE.Vector3(), point = new THREE.Vector3();
  let dirty = true, oldWidth = -1, oldHeight = -1, boardRoot, defaults;
  function slotAt(i, hand) {
    let slot = slots[i];
    if (!slot) {
      const pin = doc.createElement('span'), tag = doc.createElement('span');
      root.append(pin, tag);
      slot = slots[i] = { pin, tag, rect: {}, point: new THREE.Vector3(), hand: null };
    }
    if (slot.hand !== hand) {
      slot.hand = hand;
      dirty = true;
      slot.pin.className = hand ? 'fish-pin fish-pin--hand' : 'fish-pin';
      slot.tag.className = hand ? 'fish-tag fish-tag--hand' : 'fish-tag';
      slot.pin.replaceChildren();
      if (hand) slot.pin.append(icon('hand'));
    }
    return slot;
  }
  function setMarks(state, showLabels, pose, model) {
    if (boardRoot !== model.group.parent) {
      boardRoot = model.group.parent;
      defaults = basicLabels.map(label => ({ ...label, owner: ANCHOR_OWNER[label.anchor], pos: model.anatomy.point(label.anchor) }));
      dirty = true;
    }
    let i = 0;
    function add(mark, hand) {
      if (!pose.visible(mark.owner)) return;
      const slot = slotAt(i++, hand);
      const part = mark.anchor.startsWith('piece:') ? model.pieces[mark.anchor.slice(6)] : null;
      point.fromArray(part?.pivot ?? mark.pos).applyMatrix4(pose.matrixFor(mark.owner));
      if (!slot.point.equals(point)) { slot.point.copy(point); dirty = true; }
      if (slot.text !== mark.text) {
        dirty = true;
        slot.text = mark.text;
        captionText(slot.tag, mark.text);
      }
    }
    for (const hand of state.hands) add(hand, true);
    if (showLabels) {
      for (const label of state.labels.length ? state.labels : defaults) add(label, false);
    }
    while (slots.length > i) {
      const { pin, tag } = slots.pop();
      pin.remove(); tag.remove();
      dirty = true;
    }
  }
  function project(camera) {
    const w = container.clientWidth, h = container.clientHeight;
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    if (boardRoot) projection.multiply(boardRoot.matrixWorld);
    if (!dirty && w === oldWidth && h === oldHeight && previous.equals(projection)) return;
    dirty = false; oldWidth = w; oldHeight = h; previous.copy(projection);
    area.left = 5; area.right = w - 5; area.bottom = h - 5;
    area.top = toolbar ? toolbar.offsetTop + toolbar.offsetHeight + 4 : 5;
    occupied.length = 0;
    if (reset) {
      buttonBox.left = reset.offsetLeft; buttonBox.top = reset.offsetTop;
      buttonBox.right = buttonBox.left + reset.offsetWidth; buttonBox.bottom = buttonBox.top + reset.offsetHeight;
      occupied.push(buttonBox);
    }
    for (const slot of slots) {
      screen.copy(slot.point).applyMatrix4(projection);
      const outside = Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1 || Math.abs(screen.z) > 1;
      slot.pin.hidden = slot.tag.hidden = outside;
      if (outside) continue;
      const x = Math.round((screen.x + 1) * w / 2), y = Math.round((1 - screen.y) * h / 2);
      slot.pin.style.transform = translate(x, y);
      const rect = placeCaption(x, y, slot.tag.offsetWidth, slot.tag.offsetHeight, area, occupied, slot.rect);
      if (rect) {
        slot.tag.style.transform = translate(rect.left, rect.top);
        occupied.push(rect);
      } else slot.tag.hidden = true;
    }
  }
  return { setMarks, project, dispose() { root.remove(); slots.length = 0; boardRoot = defaults = null; } };
}
