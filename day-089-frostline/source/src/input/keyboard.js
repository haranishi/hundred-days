import { smoothSteer } from './values.js';
// Space は、滑走中は「構え」（押している間）。題字の画面では、Enter と同じく「滑り出す」になる（confirm）
const actions = { Escape: 'pause', KeyP: 'pause', KeyC: 'camera', KeyR: 'drop', KeyE: 'safe', KeyM: 'map', Enter: 'finish', Space: 'confirm' };
const keysUsed = new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', ...Object.keys(actions)]);
export function createKeyboard({ target = globalThis.window, onAction = () => {}, onUse = () => {} } = {}) {
  const keys = new Set(); let steer = 0;
  const editable = e => ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName) || e.target?.isContentEditable;
  // ボタンに焦点があるとき：空白と Enter は、そのボタンを押すキー（ゲームへは渡さない）。ほかのキーは、ゲームへ渡す。
  // 以前は、ボタンに焦点があると Escape 以外をすべて捨てていた。地図や記録の画面を閉じると、焦点が画面の上のボタンへ戻るので、
  // そのあと、曲がるキーも、やり直し・復帰・視点・地図のキーも効かなくなった（体験の採点 1 周目）
  // リンク（共有の「X に投稿する」など）も同じ。Enter でリンクを開くとき、ゲームの「滑り出す」まで動かさない
  const pressesButton = e => (e.target?.tagName === 'BUTTON' || e.target?.tagName === 'A') && (e.code === 'Space' || e.code === 'Enter');
  function down(e) {
    // 共有の窓（dialog）の中のキーは、窓のもの。Escape で窓が閉じ、Enter でリンクが開く。ゲームの一時停止や滑り出しまで動かさない
    if (e.target?.closest?.('dialog')) return;
    if (editable(e) && e.code !== 'Escape') return;
    if (pressesButton(e)) return;
    if (!keysUsed.has(e.code)) return;
    e.preventDefault?.(); onUse();
    if (!keys.has(e.code) && !e.repeat && actions[e.code]) onAction(actions[e.code]);
    keys.add(e.code);
  }
  function up(e) { keys.delete(e.code); }
  function clear() { keys.clear(); steer = 0; }
  target?.addEventListener('keydown', down); target?.addEventListener('keyup', up); target?.addEventListener('blur', clear);
  return {
    sample(dt) {
      const any = (...codes) => codes.some(c => keys.has(c));
      const targetSteer = Number(any('KeyD', 'ArrowRight')) - Number(any('KeyA', 'ArrowLeft'));
      steer = smoothSteer(steer, targetSteer, dt);
      return { steer, tuck: Number(any('KeyW', 'ArrowUp')), brake: Number(any('KeyS', 'ArrowDown')), jump: keys.has('Space'), grab: 0 };
    },
    clear,
    dispose() { clear(); target?.removeEventListener('keydown', down); target?.removeEventListener('keyup', up); target?.removeEventListener('blur', clear); },
  };
}
