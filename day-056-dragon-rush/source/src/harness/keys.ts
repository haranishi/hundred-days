// OWNER: harness
// window.__input と自動プレイの台本で使うキー名を、KeyboardEvent.code とマウスのボタン番号へ直す。
// 'w'・'KeyW'・'space'・'Shift'・'left'（左クリック）のどれで書いても同じ入力になる。

export type InputName = { kind: 'key'; code: string } | { kind: 'button'; button: number };

const ALIASES: Record<string, InputName> = {
  ' ': { kind: 'key', code: 'Space' },
  space: { kind: 'key', code: 'Space' },
  shift: { kind: 'key', code: 'ShiftLeft' },
  esc: { kind: 'key', code: 'Escape' },
  escape: { kind: 'key', code: 'Escape' },
  enter: { kind: 'key', code: 'Enter' },
  left: { kind: 'button', button: 0 },
  mouse0: { kind: 'button', button: 0 },
  right: { kind: 'button', button: 2 },
  mouse2: { kind: 'button', button: 2 },
  up: { kind: 'key', code: 'ArrowUp' },
  down: { kind: 'key', code: 'ArrowDown' },
};

export function parseInputName(name: string | number): InputName {
  if (typeof name === 'number') return { kind: 'button', button: name };
  const alias = ALIASES[name.toLowerCase()];
  if (alias) return alias;
  if (/^[a-z]$/i.test(name)) return { kind: 'key', code: `Key${name.toUpperCase()}` };
  if (/^[0-9]$/.test(name)) return { kind: 'key', code: `Digit${name}` };
  return { kind: 'key', code: name };
}

/** 入力を注入する口（core/input.ts の InputState が満たす）。 */
export interface InputSink {
  injectKeyDown(code: string): void;
  injectKeyUp(code: string): void;
  injectButtonDown(button: number): void;
  injectButtonUp(button: number): void;
  injectMotion(dx: number, dy: number): void;
}

export function pressInput(sink: InputSink, name: string | number): void {
  const n = parseInputName(name);
  if (n.kind === 'key') sink.injectKeyDown(n.code);
  else sink.injectButtonDown(n.button);
}

export function releaseInput(sink: InputSink, name: string | number): void {
  const n = parseInputName(name);
  if (n.kind === 'key') sink.injectKeyUp(n.code);
  else sink.injectButtonUp(n.button);
}
