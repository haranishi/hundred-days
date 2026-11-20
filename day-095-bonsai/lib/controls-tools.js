import { TOOL_IDS } from './contract.js';

const prunes = (tool) => tool === 'cut' || tool === 'pinch';

export function createToolMachine({ pick, highlight, cut, pinch, beginBend, moveBend, finishBend, splash, water }) {
  const contacts = new Set();
  let multiple = false;
  let tool = 'look';
  let active = null;

  function contactDown(id) {
    contacts.add(id);
    if (contacts.size < 2) return;
    // 道具帯に置いた指でも、先に押していた枝の確定を止める。
    multiple = true;
    cancelPruning();
  }

  function contactEnd(id) {
    contacts.delete(id);
    if (contacts.size === 0) multiple = false;
  }

  function resetContacts() {
    contacts.clear();
    multiple = false;
    cancelPruning();
  }

  function setTool(id) {
    if (!TOOL_IDS.includes(id)) return false;
    if (tool !== id) cancel();
    tool = id;
    return true;
  }

  function press(point) {
    cancel();
    if (tool === 'look' || (multiple && prunes(tool))) return false;
    if (tool === 'water') {
      active = { tool, start: point.time };
      return true;
    }
    const hit = pick(point, tool);
    if (!hit) return false;
    active = { tool, hit, startId: hit.id, bend: tool === 'bend' ? beginBend(hit) : null };
    highlight(hit, tool);
    return true;
  }

  function pressedHit(operation, point) {
    const hit = pick(point, operation.tool);
    return hit?.id === operation.startId ? hit : null;
  }

  function move(point, dragged = false) {
    if (!active) return false;
    if (active.tool === 'water') {
      if (dragged) cancel();
      return dragged;
    }
    if (active.tool === 'bend') {
      if (active.bend) moveBend(active.bend, point);
      return false;
    }
    const hit = pressedHit(active, point);
    if (hit?.index !== active.hit?.index) highlight(hit, active.tool);
    active.hit = hit;
    return false;
  }

  function hold() {
    if (active?.tool !== 'water') return false;
    splash();
    return true;
  }

  function finish(point) {
    const operation = active;
    active = null;
    if (!operation) return;
    highlight(null);
    if (prunes(operation.tool)) {
      // 座標が押下時と同じでも、指の下の節は投影の変化で移動し得る。
      const hit = pressedHit(operation, point);
      if (hit && !multiple) (operation.tool === 'cut' ? cut : pinch)(hit);
      return;
    }
    switch (operation.tool) {
      case 'bend': if (operation.bend) finishBend(operation.bend, true); break;
      case 'water': water(Math.min(0.65, 0.12 + Math.max(0, point.time - operation.start) / 2200)); break;
    }
  }

  function cancel() {
    const operation = active;
    active = null;
    if (!operation) return;
    highlight(null);
    if (operation.bend) finishBend(operation.bend, false);
  }

  function cancelPruning() {
    if (prunes(active?.tool)) cancel();
  }

  return {
    setTool, press, move, hold, finish, cancel, cancelPruning, contactDown, contactEnd, resetContacts,
    get contactCount() { return contacts.size; },
    get pruningBlocked() { return multiple && prunes(tool); },
  };
}
