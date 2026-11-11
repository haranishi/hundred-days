import { deadzone, emptyInput } from './values.js';
export function createGamepad({ getGamepads = () => globalThis.navigator?.getGamepads?.() ?? [], onAction = () => {}, onUse = () => {} } = {}) {
  let previous = new Set(), value = emptyInput(), look = { yaw: 0, pitch: 0 };
  return {
    poll() {
      const pad = Array.from(getGamepads() ?? []).find(p => p?.connected !== false && p);
      if (!pad) { previous.clear(); value = emptyInput(); look = { yaw: 0, pitch: 0 }; return; }
      const pressed = i => !!pad.buttons[i]?.pressed;
      const current = new Set();
      for (const [i, action] of [[9, 'pause'], [3, 'camera'], [12, 'drop'], [13, 'safe']]) {
        if (pressed(i)) { current.add(i); if (!previous.has(i)) onAction(action); }
      }
      previous = current;
      const vertical = deadzone(pad.axes[1]);
      value = { steer: deadzone(pad.axes[0]), tuck: Math.max(0, -vertical), brake: Math.max(0, vertical, Number(pressed(1))), jump: pressed(0), grab: 0 };
      look = { yaw: deadzone(pad.axes[2]), pitch: deadzone(pad.axes[3]) };
      if (current.size || Object.values(value).some(Boolean) || look.yaw || look.pitch) onUse();
    },
    sample: () => ({ ...value }),
    look: () => ({ ...look }),
    // 停止時にもボタンの縁は残す。押し続けた開始ボタンで停止と再開が往復するのを防ぐ。
    clear() { value = emptyInput(); look = { yaw: 0, pitch: 0 }; },
  };
}
