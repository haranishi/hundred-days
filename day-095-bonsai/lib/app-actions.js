import { branchList, branchSegment, pickNode, subtreeIndices } from './pick.js';
import { seasonLook } from './look.js';
import { calendarState } from './app-state.js';

const at = (array, index) => Array.from(array.subarray(index * 3, index * 3 + 3));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const ROOT = [0, 0, 0];

function cameraFacing(camera) {
  const { az, pol } = camera.get();
  const angle = az * Math.PI / 180;
  const tilt = pol * Math.PI / 180;
  return [Math.sin(angle) * Math.sin(tilt), Math.cos(tilt), Math.cos(angle) * Math.sin(tilt)];
}

export function pointOnBendPlane(ray, grab, normal) {
  const direction = dot(ray.dir, normal);
  if (Math.abs(direction) < 1e-6) return null;
  const distance = dot(sub(grab, ray.origin), normal) / direction;
  return distance >= 0 ? ray.origin.map((v, i) => v + ray.dir[i] * distance) : null;
}

export function createActions({ initialTree, history, getView, canvasRect, notify, announce, changed, play, animate }) {
  let tree = initialTree;
  let selectedChain = null;
  let keyboardBend = null;
  let previousView = null;
  let previousLook = null;
  let lastSkeleton = null;

  function paintSkeleton(view, { growing = false, unchanged = false } = {}) {
    const snapshot = tree.snapshot();
    const sameView = lastSkeleton?.view === view;
    if (sameView && lastSkeleton.snapshot === snapshot) return;
    // 履歴と例外に備えて木を複製するため、枝が同じでも参照が変わることがある。
    if (!sameView || !unchanged) view.setSkeleton(snapshot, { animate: growing });
    lastSkeleton = { view, snapshot };
  }

  function repaint({ growing = false, unchanged = false } = {}) {
    const view = getView();
    if (!view) return;
    const first = previousView !== view;
    if (first || previousLook.species !== tree.species) view.setSpecies(tree.species);
    if (first || previousLook.moisture !== tree.moisture) view.setMoisture(tree.moisture);
    paintSkeleton(view, { growing, unchanged });
    let hasFoliage = previousLook?.hasFoliage;
    if (first || previousLook.species !== tree.species || previousLook.day !== tree.day || previousLook.moisture !== tree.moisture) {
      const { doy } = calendarState(tree.day);
      const look = seasonLook(tree.species, doy, { moisture: tree.moisture });
      view.setLook(look, { animate: growing });
      hasFoliage = Math.max(look.coverage, look.flower, look.bud) > 0.02;
    }
    previousView = view;
    previousLook = { species: tree.species, day: tree.day, moisture: tree.moisture, hasFoliage };
    showSelection();
  }

  function availableBranches() {
    return branchList(tree.snapshot());
  }

  let selectionShown = false;

  function showSelection() {
    const view = getView();
    if (!view) return;
    const branch = selectedChain === null ? null : availableBranches().find(({ chain }) => chain === selectedChain);
    if (!branch) {
      selectedChain = null;
      selectionShown = false;
      view.setHighlight(null);
      return;
    }
    selectionShown = true;
    view.setHighlight({ nodes: branchSegment(tree.snapshot(), branch.first), tone: 'select' });
  }

  /** 鍵盤（[ ]）や補助パネルで選んだ枝の白い光を消す。指やマウスの操作に移ったあとも光り続けていた（体験の採点の指摘）。
      指で押している間の候補表示（切る・曲げる）は、ここでは触らない。 */
  function clearSelection() {
    if (!selectionShown) return;
    selectedChain = null;
    selectionShown = false;
    getView()?.setHighlight(null);
  }

  function pick(point, tool) {
    const { left, top, right, bottom } = canvasRect();
    if (point.x < left || point.x > right || point.y < top || point.y > bottom) return null;
    const view = getView();
    const skel = tree.snapshot();
    return pickNode(skel, view.camera.pickRay(point.x, point.y), {
      pxToWorld: (distance) => view.camera.pxToWorld(distance),
      tolerancePx: point.kind === 'mouse' ? 8 : 14,
      // 葉のない冬にも、見えている枝へ候補が移るようにする。
      padHit: tool !== 'bend' && Boolean(previousLook?.hasFoliage),
    });
  }

  function highlight(hit, tone) {
    const view = getView();
    if (!view) return;
    if (!hit) {
      showSelection();
      return;
    }
    const skel = tree.snapshot();
    const nodes = tone === 'cut' ? subtreeIndices(skel, hit.index)
      : tone === 'bend' ? branchSegment(skel, hit.index) : Int32Array.of(hit.index);
    view.setHighlight({ nodes, tone });
  }

  function changeModel(operation, accepts = () => true) {
    try {
      const before = tree;
      const next = before.clone();
      const result = operation(next);
      if (result?.ok === false) {
        notify(result.message || 'この枝には道具を使えません。');
        return null;
      }
      if (!accepts(next, before)) return null;
      // モデルの例外で、現在の枝ややり直しの履歴まで失わないようにする。
      history.record(before);
      tree = next;
      return result;
    } catch {
      notify('手入れを続けられなかったため、操作を取り消しました。');
      return null;
    }
  }

  function cut(hit) {
    const oldSkel = tree.snapshot();
    const result = changeModel((next) => next.cut(hit.id));
    if (!result) return;
    const view = getView();
    if (view && animate()) {
      const removed = new Set(result.removedIds);
      const indices = [];
      for (let i = 0; i < oldSkel.count; i += 1) if (removed.has(oldSkel.ids[i])) indices.push(i);
      view.dropBranch(oldSkel, Int32Array.from(indices));
      view.burst('snip', hit.point);
    }
    repaint();
    changed();
    play('snip');
    notify('枝を切りました。', { undo: true });
  }

  function pinch(hit) {
    const result = changeModel((next) => next.pinch(hit.id));
    if (!result) return;
    if (animate()) getView()?.burst('pinch', hit.point);
    repaint();
    changed();
    play('pinch');
    notify(result.capped ? 'いまは枝がいっぱいです。先に剪定すると新芽が出ます' : '芽を摘みました。', { undo: true });
  }

  function beginBend(hit) {
    try {
      const before = tree.clone();
      const normal = cameraFacing(getView().camera);
      const session = tree.beginBend(hit.id);
      if (session?.ok === false) {
        notify(session.message);
        return null;
      }
      return { session, before, hit, normal, active: true, limitShown: false };
    } catch {
      notify('枝を曲げ始められませんでした。');
      return null;
    }
  }

  function moveBend(bend, point) {
    if (!bend.active) return;
    const view = getView();
    const target = pointOnBendPlane(view.camera.pickRay(point.x, point.y), bend.hit.point, bend.normal);
    if (!target) return;
    try {
      const result = bend.session.update(bend.hit.point, target);
      if (result.clamped && !bend.limitShown) {
        bend.limitShown = true;
        notify('この枝はここまで曲げられます。');
      }
      paintSkeleton(view);
      highlight(bend.hit, 'bend');
    } catch {
      finishBend(bend, false);
      notify('枝を曲げられなかったため、操作を取り消しました。');
    }
  }

  function finishBend(bend, commit) {
    if (!bend.active) return;
    bend.active = false;
    let fixed = false;
    try {
      if (commit) {
        const result = bend.session.commit();
        fixed = result.ok && result.changed;
        if (fixed) history.record(bend.before);
      } else {
        bend.session.cancel();
      }
    } catch {
      fixed = false;
      tree = bend.before;
      notify('枝を曲げられなかったため、操作を取り消しました。');
    }
    repaint();
    if (fixed) {
      changed();
      play('wire');
      notify('針金で枝を留めました。', { undo: true });
    }
  }

  function advance(days, { quiet = false } = {}) {
    if (!Number.isSafeInteger(days) || days <= 0) return null;
    const season = calendarState(tree.day).season;
    const result = changeModel((next) => next.advance(days), (next, before) => next.day !== before.day);
    if (!result) return null;
    const date = calendarState(tree.day);
    repaint({ growing: animate(), unchanged: result.changed === false });
    changed();
    if (!quiet) {
      if (season !== date.season) play('season');
      notify(`${date.label}になりました。`, { undo: true });
    }
    return result;
  }

  function splash() { if (animate()) getView()?.burst('water', ROOT); }

  function water(amount) {
    if (typeof tree.water !== 'function') return;
    const result = changeModel((next) => { next.water(amount); return true; }, (next, before) => next.moisture !== before.moisture);
    splash();
    if (!result) return;
    repaint({ unchanged: true });
    changed();
    notify('水をやりました。', { undo: true });
  }

  function restore(direction) {
    const next = history[direction](tree);
    if (!next) return;
    tree = next;
    lastSkeleton = null;
    repaint();
    changed();
    notify(direction === 'undo' ? '元に戻しました。' : 'やり直しました。');
  }

  function replace(next) {
    tree = next;
    lastSkeleton = null;
    selectedChain = null;
    history.clear();
  }

  function selectBranch(offset) {
    cancelKeyboardBend();
    const branches = availableBranches();
    if (!branches.length) return;
    const current = branches.findIndex(({ chain }) => chain === selectedChain);
    const from = current === -1 && offset < 0 ? 0 : current;
    const index = (from + offset + branches.length) % branches.length;
    const branch = branches[index];
    selectedChain = branch.chain;
    showSelection();
    const kind = ['幹', '主枝', '副枝'][branch.order] ?? '小枝';
    announce(`${branches.length}本のうち${index + 1}番目、${kind}を選びました。`);
  }

  function keyboardHit(tool) {
    const branch = availableBranches().find(({ chain }) => chain === selectedChain);
    if (!branch) return null;
    const skel = tree.snapshot();
    const index = tool === 'pinch' || branch.order === 0 ? branch.tip : branch.first;
    return { id: skel.ids[index], index, point: at(skel.end, branch.tip) };
  }

  function startKeyboardBend() {
    const hit = keyboardHit('bend');
    if (!hit) return false;
    const bend = beginBend(hit);
    if (bend) {
      const start = getView().camera.project(hit.point);
      keyboardBend = { ...bend, x: start.x, y: start.y };
      highlight(hit, 'bend');
      announce('矢印で枝を曲げ、Enterか「道具を使う」で形を確定します。');
    }
    return true;
  }

  function keyboardArrow(tool, dx, dy) {
    if (tool !== 'bend') return false;
    if (!keyboardBend && !startKeyboardBend()) return false;
    if (!keyboardBend) return true;
    keyboardBend.x += dx * 18;
    keyboardBend.y += dy * 18;
    moveBend(keyboardBend, keyboardBend);
    if (!keyboardBend.active) keyboardBend = null;
    return true;
  }

  function applySelected(tool) {
    if (tool === 'look') return;
    if (tool === 'water') { water(0.22); return; }
    if (keyboardBend) {
      const bend = keyboardBend;
      keyboardBend = null;
      finishBend(bend, true);
      return;
    }
    const hit = keyboardHit(tool);
    if (!hit) { announce('角括弧キーか「前の枝」「次の枝」で枝を選んでください。'); return; }
    if (tool === 'cut') cut(hit);
    if (tool === 'pinch') pinch(hit);
    if (tool === 'bend') startKeyboardBend();
  }

  function cancelKeyboardBend() {
    if (!keyboardBend) return false;
    const bend = keyboardBend;
    keyboardBend = null;
    finishBend(bend, false);
    return true;
  }

  return {
    get tree() { return tree; },
    get branches() { return availableBranches().filter(({ order }) => order === 1).length; },
    repaint, replace, advance, restore, selectBranch, showSelection, clearSelection, keyboardArrow, applySelected, cancelKeyboardBend,
    pick, highlight, cut, pinch, beginBend, moveBend, finishBend, splash, water,
  };
}
