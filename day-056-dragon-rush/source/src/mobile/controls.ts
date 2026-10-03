import type { CreatureId } from '../config/creatures';
import type { InputApi } from '../harness/inputApi';
import { el } from '../ui/styles';
import { createTouchInput, isTouchDevice } from './input';
import { bindPointer } from './pointer';

export function installTouchControls(
  getInput: () => InputApi | undefined,
  getState: () => { phase: string; creature: CreatureId },
  getLookPrefs: () => { scale: number; invertY: boolean },
  pause: () => void,
): { reset(): void } | undefined {
  if (!isTouchDevice()) return;
  const input = createTouchInput(getInput);
  const resets: (() => void)[] = [];
  const root = el('div', 'dr-touch');
  root.setAttribute('data-testid', 'touch-controls');
  const stick = el('div', 'dr-stick');
  stick.dataset.touch = 'move';
  stick.setAttribute('aria-label', '移動スティック');
  const knob = el('div', 'dr-stick-knob');
  stick.append(knob);
  const move = (e: PointerEvent): void => {
    const rect = stick.getBoundingClientRect();
    const x = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const y = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    const length = Math.max(1, Math.hypot(x, y));
    input.move(e.pointerId, x / length, y / length);
    knob.style.transform = `translate(${x / length * 32}px, ${y / length * 32}px)`;
  };
  resets.push(bindPointer(stick, { single: true, start: move, move, end: e => {
    input.release(e.pointerId); knob.style.transform = '';
  } }));
  const look = el('div', 'dr-look', 'なぞって見回す');
  look.dataset.touch = 'look';
  let last = { x: 0, y: 0 };
  resets.push(bindPointer(look, { single: true, start: e => { last = { x: e.clientX, y: e.clientY }; }, move: e => {
    const prefs = getLookPrefs();
    input.look((e.clientX - last.x) * 1.8 * prefs.scale, (e.clientY - last.y) * 1.8 * prefs.scale * (prefs.invertY ? -1 : 1));
    last = { x: e.clientX, y: e.clientY };
  }, end: () => undefined }));
  const actions = el('div', 'dr-actions');
  const buttons: [string, string, string][] = [
    ['breath', '主砲', 'left'], ['special', '大技', 'KeyE'], ['claw', '近接', 'right'],
    ['tail', '尾', 'KeyQ'], ['ascend', '上昇／跳ぶ', 'Space'], ['descend', '下降', 'KeyC'],
    ['sprint', '急降下／突進', 'ShiftLeft'],
  ];
  for (const [id, label, key] of buttons) {
    const b = el('button', '', label);
    b.type = 'button'; b.dataset.touch = id;
    if (id === 'sprint') {
      b.setAttribute('aria-label', label);
      b.replaceChildren('急降下', el('br'), '突進');
    }
    const held = new Set<number>();
    resets.push(bindPointer(b, { start: e => {
      held.add(e.pointerId); b.classList.add('is-held'); input.hold(e.pointerId, key);
    }, end: e => {
      held.delete(e.pointerId); b.classList.toggle('is-held', held.size > 0); input.release(e.pointerId);
    } }));
    actions.append(b);
  }
  const reset = (): void => { for (const fn of resets) fn(); input.reset(); };
  const pauseButton = el('button', 'dr-touch-pause', '一時停止');
  pauseButton.type = 'button';
  pauseButton.addEventListener('click', () => { reset(); pause(); });
  root.append(stick, look, actions, pauseButton);
  const rotate = el('div', 'dr-rotate');
  rotate.setAttribute('role', 'status');
  const back = el('button', '', '入口へ戻る');
  back.type = 'button';
  back.addEventListener('click', () => document.querySelector<HTMLButtonElement>('#back')?.click());
  rotate.append(el('div', '', 'スマホを横向きにしてください。\n縦向きの間はゲームを一時停止します。'), back);
  document.body.append(root, rotate);
  const update = (): void => {
    const portrait = innerHeight > innerWidth;
    if (portrait && getState().phase === 'playing') pause();
    const state = getState();
    document.body.dataset.touchPhase = state.phase;
    rotate.hidden = !portrait;
    root.hidden = state.phase !== 'playing' || portrait;
    actions.querySelector<HTMLButtonElement>('[data-touch="descend"]')!.hidden = state.creature === 'homuratsuno';
    if (root.hidden) reset();
  };
  window.addEventListener('blur', () => { reset(); pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { reset(); pause(); } });
  window.addEventListener('resize', () => { reset(); update(); });
  window.setInterval(update, 80);
  update();
  return { reset };
}
