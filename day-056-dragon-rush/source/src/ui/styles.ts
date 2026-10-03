// OWNER: ui
// HUD と重ねる画面の見た目（CSS）。半透明で細く、街と竜を隠さない。主役の色は炎なので、UI は白と炎の橙だけにする。

export const UI_CSS = /* css */ `
.dr-ui { position: fixed; inset: 0; pointer-events: none; color: rgba(255, 248, 238, 0.95);
  font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, sans-serif;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.65); letter-spacing: 0.02em; user-select: none; }
.dr-num { font-variant-numeric: tabular-nums; }
.dr-label { font-size: 11px; font-weight: 500; opacity: 0.72; letter-spacing: 0.08em; }
.dr-tl { position: absolute; left: 22px; top: 16px; }
.dr-time { font-size: 32px; font-weight: 600; line-height: 1.05; }
.dr-time.dr-low { color: #ffb38a; }
.dr-yen { font-size: 19px; font-weight: 600; margin-top: 6px; }
.dr-tr { position: absolute; right: 22px; top: 16px; text-align: right; }
.dr-rate { font-size: 28px; font-weight: 600; line-height: 1.05; }
.dr-bottom { position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%); width: min(380px, 70vw); text-align: center; }
/* r02-controls：連鎖の数字に縁取り（指摘「暗い路面で連鎖の文字が沈む」）。縁は文字の後ろに描く */
.dr-combo { font-size: 22px; font-weight: 700; height: 30px; opacity: 0; transition: opacity 0.25s;
  -webkit-text-stroke: 3px rgba(14, 9, 6, 0.82); paint-order: stroke fill;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9), 0 0 10px rgba(0, 0, 0, 0.5); }
.dr-combo.dr-on { opacity: 1; }
.dr-combo small { font-size: 13px; font-weight: 600; margin-left: 6px; opacity: 0.9; }
/* r02-controls：今やることを1行ずつ（下の中央、連鎖の上） */
.dr-coach { position: absolute; left: 50%; bottom: calc(100% + 6px); transform: translateX(-50%); white-space: nowrap;
  font-size: 15px; font-weight: 600; padding: 6px 14px; background: rgba(10, 8, 7, 0.46); border-radius: 6px;
  opacity: 0; transition: opacity 0.3s; }
.dr-coach.dr-on { opacity: 1; }
.dr-coach b { color: #ffd6a8; font-weight: 700; }
.dr-rage-row { display: flex; align-items: center; gap: 10px; }
.dr-rage { flex: 1; height: 5px; background: rgba(255, 255, 255, 0.16); border-radius: 3px; overflow: hidden; }
.dr-rage-fill { height: 100%; width: 0%; background: linear-gradient(90deg, #ff9a4a, #ff4a24); transition: width 0.15s; }
.dr-rage-row.dr-full .dr-rage-fill { animation: dr-pulse 0.8s ease-in-out infinite alternate; }
.dr-rage-hint { font-size: 12px; font-weight: 600; min-width: 64px; text-align: left; }
/* r02-controls：照準。炎が届く所では明るい白、届かない所では暗い灰。当たった瞬間に0.14秒光る */
.dr-reticle { position: absolute; left: 50%; top: 50%; width: 18px; height: 18px; margin: -11px 0 0 -11px;
  border: 2px solid rgba(175, 170, 164, 0.5); border-radius: 50%; opacity: 0.75;
  box-shadow: 0 0 3px rgba(0, 0, 0, 0.6), inset 0 0 2px rgba(0, 0, 0, 0.45); transition: border-color 0.12s, opacity 0.12s; }
.dr-reticle-dot { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; margin: -2px 0 0 -2px; border-radius: 50%;
  background: rgba(175, 170, 164, 0.6); box-shadow: 0 0 2px rgba(0, 0, 0, 0.7); }
.dr-reticle.dr-reach { border-color: rgba(255, 251, 243, 0.98); opacity: 1; }
.dr-reticle.dr-reach .dr-reticle-dot { background: rgba(255, 251, 243, 1); }
.dr-reticle.dr-hit { animation: dr-hit 0.14s ease-out; }
.dr-cue { position: absolute; left: calc(50% + 20px); top: calc(50% - 9px); font-size: 12px; font-weight: 600; white-space: nowrap;
  opacity: 0; transition: opacity 0.2s; }
.dr-cue.dr-on { opacity: 0.95; }
/* r02-controls：遊んでいる途中の R の長押しの進み */
.dr-hold { position: absolute; left: 50%; top: 18px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px;
  font-size: 12px; font-weight: 600; padding: 5px 12px; background: rgba(10, 8, 7, 0.5); border-radius: 6px; }
.dr-hold-bar { width: 90px; height: 4px; background: rgba(255, 255, 255, 0.2); border-radius: 2px; overflow: hidden; }
.dr-hold-fill { height: 100%; width: 0%; background: #ffb070; }
/* 操作の表：キーと説明の2列（r02-controls：バグ B3「Q尾」のように1語に見えた） */
.dr-keys { display: grid; grid-template-columns: max-content 1fr; column-gap: 14px; row-gap: 2px; text-align: left; align-items: baseline; }
.dr-key { font-weight: 700; color: #ffd6a8; white-space: nowrap; }
.dr-key-what { opacity: 0.92; }
.dr-hidden { opacity: 0 !important; }
.dr-gone { display: none !important; }
.dr-overlay { position: fixed; inset: 0; display: grid; place-items: center; pointer-events: auto; background: rgba(8, 6, 6, 0.3);
  color: rgba(255, 248, 238, 0.96); font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif; cursor: pointer; }
.dr-panel { background: rgba(18, 14, 12, 0.7); backdrop-filter: blur(6px); border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px; padding: 24px 30px; min-width: 300px; text-align: center; cursor: default;
  max-height: calc(100vh - 32px); overflow-y: auto; box-sizing: border-box; }
.dr-title { font-size: 28px; font-weight: 700; letter-spacing: 0.08em; }
.dr-sub { font-size: 13px; opacity: 0.8; margin-top: 8px; }
.dr-cta { margin-top: 18px; font-size: 17px; font-weight: 600; animation: dr-blink 1.4s ease-in-out infinite; }
.dr-row { display: flex; justify-content: center; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
.dr-btn { pointer-events: auto; font: inherit; font-size: 14px; font-weight: 600; color: inherit; background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.22); border-radius: 6px; padding: 7px 16px; cursor: pointer; }
.dr-btn:hover, .dr-btn:focus-visible { background: rgba(255, 150, 80, 0.3); outline: none; }
.dr-btn.dr-sel { background: rgba(255, 140, 60, 0.45); border-color: rgba(255, 180, 120, 0.7); }
.dr-result-big { font-size: 36px; font-weight: 700; margin: 12px 0 4px; }
.dr-stats { display: grid; grid-template-columns: auto auto; gap: 4px 18px; justify-content: center; margin-top: 10px; font-size: 15px; }
.dr-stats span:nth-child(odd) { opacity: 0.72; text-align: right; }
.dr-small { font-size: 12px; opacity: 0.75; margin-top: 12px; line-height: 1.7; }
.dr-slider { width: 160px; accent-color: #ff8a40; }
.dr-check { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
.dr-check input { accent-color: #ff8a40; width: 15px; height: 15px; }
/* r02-controls：結果の画面の自己ベストと前回との差 */
.dr-best { font-size: 12px; opacity: 0.8; margin-top: 2px; }
.dr-best .dr-up { color: #ffc58a; font-weight: 700; }
.dr-new { display: inline-block; margin-left: 6px; font-size: 11px; font-weight: 700; color: #1a0f08; background: #ffb070; border-radius: 3px; padding: 0 5px; }
/* r03-roster：怪獣の札（始まる前の重ねの下と結果の画面）。HUD と同じ半透明の細い作りで、選んでいる札だけ縁を明るくする */
.dr-start { max-width: min(640px, calc(100vw - 32px)); }
.dr-cards { display: flex; gap: 10px; justify-content: center; margin-top: 18px; flex-wrap: wrap; }
.dr-card { pointer-events: auto; font: inherit; color: inherit; cursor: pointer; width: 168px; padding: 8px 10px 9px; text-align: left;
  background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.16); border-radius: 8px;
  display: flex; flex-direction: column; gap: 4px; transition: border-color 0.12s, background 0.12s; }
.dr-card:hover, .dr-card:focus-visible { background: rgba(255, 150, 80, 0.14); outline: none; }
.dr-card.dr-sel { border-color: rgba(255, 206, 160, 0.95); background: rgba(255, 140, 60, 0.16);
  box-shadow: 0 0 0 1px rgba(255, 190, 130, 0.45), 0 0 14px rgba(255, 140, 60, 0.3); }
.dr-card-art { height: 56px; background: rgba(255, 244, 232, 0.5);
  -webkit-mask: var(--dr-art) center / contain no-repeat; mask: var(--dr-art) center / contain no-repeat; }
.dr-card.dr-sel .dr-card-art { background: rgba(255, 214, 168, 0.98); }
.dr-card-head { display: flex; align-items: baseline; gap: 6px; }
.dr-card-key { font-size: 11px; font-weight: 700; padding: 0 5px; border: 1px solid rgba(255, 255, 255, 0.4); border-radius: 3px; opacity: 0.85; }
.dr-card-name { font-size: 15px; font-weight: 700; letter-spacing: 0.06em; }
.dr-card-line { font-size: 11px; opacity: 0.82; line-height: 1.45; min-height: 32px; }
.dr-card-bars { display: grid; grid-template-columns: max-content 1fr; gap: 2px 6px; align-items: center; font-size: 10px; }
.dr-bar-label { opacity: 0.7; }
.dr-bar { height: 4px; background: rgba(255, 255, 255, 0.14); border-radius: 2px; overflow: hidden; }
.dr-bar i { display: block; height: 100%; background: linear-gradient(90deg, #ffb070, #ff7a3c); }
.dr-card-best { font-size: 10px; opacity: 0.72; min-height: 13px; }
.dr-cards-compact { margin-top: 8px; }
.dr-cards-compact .dr-card { width: 118px; padding: 6px 8px; }
.dr-cards-compact .dr-card-art { height: 36px; }
.dr-cards-hint { margin-top: 8px; }
/* r05-play：始まる前の札は画面の下（中央の題の板から外す。体験の採点 r04 の B4：中央を押すと雷翼で始まった） */
.dr-start-dock { position: absolute; left: 50%; bottom: max(14px, 2.5vh); transform: translateX(-50%); width: max-content;
  max-width: calc(100vw - 32px); box-sizing: border-box; text-align: center; padding: 10px 14px 8px; cursor: default;
  background: rgba(18, 14, 12, 0.55); backdrop-filter: blur(6px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; }
.dr-start-dock .dr-cards { margin-top: 0; }
.dr-start-dock .dr-cards-hint { margin-top: 6px; }
/* 背の低い画面では札の影絵と一行の遊び方を詰め、札が画面の中央の高さへ上がらないようにする */
@media (max-height: 780px) {
  .dr-start-dock .dr-card-art { height: 38px; }
  .dr-start-dock .dr-card-line { min-height: 0; }
}
.dr-change { margin-top: 14px; }
.dr-photo-hint { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); font-size: 13px; padding: 6px 12px;
  background: rgba(10, 8, 7, 0.45); border-radius: 6px; pointer-events: none; transition: opacity 1s; }
@keyframes dr-pulse { from { filter: brightness(1); } to { filter: brightness(1.8); } }
@keyframes dr-hit { 0% { transform: scale(1.5); border-color: #ffd29a; box-shadow: 0 0 12px rgba(255, 160, 70, 0.95); } 100% { transform: scale(1); } }
@keyframes dr-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
`;

let installed = false;

export function installUiCss(): void {
  if (installed) return;
  installed = true;
  const style = document.createElement('style');
  style.textContent = UI_CSS;
  document.head.appendChild(style);
}

/** 要素を作る小さな道具。 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}
