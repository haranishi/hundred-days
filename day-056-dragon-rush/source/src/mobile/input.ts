import type { InputApi } from '../harness/inputApi';

type TouchApi = Pick<InputApi, 'press' | 'release' | 'look'>;

/** 指ごとに押下を持ち、同じ技を押す最後の指が離れてから解除する。 */
export function createTouchInput(getInput: () => TouchApi | undefined) {
  const owners = new Map<number, Set<string>>();
  let sent = new Set<string>();
  let previousInput: TouchApi | undefined;
  function sync(): void {
    const input = getInput();
    if (input !== previousInput) {
      for (const key of sent) previousInput?.release(key);
      sent = new Set();
      previousInput = input;
    }
    const next = new Set(input ? [...owners.values()].flatMap(keys => [...keys]) : []);
    for (const key of sent) if (!next.has(key)) input?.release(key);
    for (const key of next) if (!sent.has(key)) input?.press(key);
    sent = next;
  }
  return {
    hold(owner: number, key: string): void {
      if (!getInput()) return;
      owners.set(owner, new Set([key]));
      sync();
    },
    move(owner: number, x: number, y: number): void {
      if (!getInput() || !Number.isFinite(x) || !Number.isFinite(y)) return;
      const keys = new Set<string>();
      if (x < -0.25) keys.add('KeyA');
      if (x > 0.25) keys.add('KeyD');
      if (y < -0.25) keys.add('KeyW');
      if (y > 0.25) keys.add('KeyS');
      owners.set(owner, keys);
      sync();
    },
    look(dx: number, dy: number): void {
      if (Number.isFinite(dx) && Number.isFinite(dy)) getInput()?.look(dx, dy);
    },
    release(owner: number): void { owners.delete(owner); sync(); },
    reset(): void { owners.clear(); sync(); },
  };
}

export function isTouchDevice(): boolean {
  // 入口で選んだ操作モードは固定する。マウス併用や向き変更でUIを途中から切り替えない。
  return document.body.classList.contains('dr-mobile') || window.matchMedia('(pointer: coarse)').matches ||
    (navigator.maxTouchPoints > 0 && window.matchMedia('(any-pointer: coarse)').matches);
}
